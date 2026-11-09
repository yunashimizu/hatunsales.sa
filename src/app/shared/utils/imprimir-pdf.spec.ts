import { imprimirPdf } from './imprimir-pdf';

describe('imprimirPdf', () => {
  const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
  let crear: ReturnType<typeof vi.spyOn>;
  let revocar: ReturnType<typeof vi.spyOn>;

  const marcos = () => doc.querySelectorAll('iframe[data-hs-imprimir]');
  /** Sustituye contentWindow del marco por uno simulado y dispara su `load`. */
  const cargar = (marco: HTMLIFrameElement, ventana: unknown) => {
    Object.defineProperty(marco, 'contentWindow', { configurable: true, get: () => ventana });
    marco.dispatchEvent(new Event('load'));
  };

  /** Documento sin ventana propia: sus marcos no cargan nada solos; el `load` lo disparan las pruebas. */
  let doc: Document;

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('ticket');
    vi.useFakeTimers();
    crear = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ticket');
    revocar = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    marcos().forEach((m) => m.remove());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('crea un marco fuera de la vista con la URL del blob', () => {
    void imprimirPdf(pdf, doc);
    const marco = marcos()[0] as HTMLIFrameElement;
    expect(crear).toHaveBeenCalledWith(pdf);
    expect(marco.getAttribute('src')).toBe('blob:ticket');
    expect(marco.getAttribute('aria-hidden')).toBe('true');
    expect(marco.getAttribute('tabindex')).toBe('-1');
    expect(marco.style.display).not.toBe('none');
    expect(marco.style.position).toBe('fixed');
  });

  it('al cargar espera, llama a print() y resuelve true; limpia a los 60 s', async () => {
    const ventana = { focus: vi.fn(), print: vi.fn() };
    const resultado = imprimirPdf(pdf, doc);
    cargar(marcos()[0] as HTMLIFrameElement, ventana);
    expect(ventana.print).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(ventana.focus).toHaveBeenCalled();
    expect(ventana.print).toHaveBeenCalledTimes(1);
    await expect(resultado).resolves.toBe(true);
    expect(marcos().length).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(marcos().length).toBe(0);
    expect(revocar).toHaveBeenCalledWith('blob:ticket');
  });

  it('si print() lanza resuelve false y limpia enseguida', async () => {
    const ventana = { focus: vi.fn(), print: vi.fn(() => { throw new Error('no'); }) };
    const resultado = imprimirPdf(pdf, doc);
    cargar(marcos()[0] as HTMLIFrameElement, ventana);
    await vi.advanceTimersByTimeAsync(300);
    await expect(resultado).resolves.toBe(false);
    expect(marcos().length).toBe(0);
    expect(revocar).toHaveBeenCalledWith('blob:ticket');
  });

  it('si no hay contentWindow resuelve false', async () => {
    const resultado = imprimirPdf(pdf, doc);
    cargar(marcos()[0] as HTMLIFrameElement, null);
    await vi.advanceTimersByTimeAsync(300);
    await expect(resultado).resolves.toBe(false);
    expect(marcos().length).toBe(0);
  });

  it('sin load en 8 s resuelve false y limpia', async () => {
    const resultado = imprimirPdf(pdf, doc);
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(resultado).resolves.toBe(false);
    expect(marcos().length).toBe(0);
    expect(revocar).toHaveBeenCalledWith('blob:ticket');
  });

  it('no deja dos marcos', () => {
    void imprimirPdf(pdf, doc);
    void imprimirPdf(pdf, doc);
    expect(marcos().length).toBe(1);
  });
});
