import { TestBed } from '@angular/core/testing';
import { TemaService } from './tema.service';

describe('TemaService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-tema');
    document.documentElement.removeAttribute('data-vt');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('arranca en claro cuando no hay preferencia ni elección guardada', () => {
    const tema = TestBed.inject(TemaService);
    expect(tema.tema()).toBe('claro');
    expect(tema.esOscuro()).toBe(false);
    expect(document.documentElement.getAttribute('data-tema')).toBe('claro');
  });

  it('respeta el tema que ya dejó el script de index.html', () => {
    document.documentElement.setAttribute('data-tema', 'oscuro');
    const tema = TestBed.inject(TemaService);
    expect(tema.tema()).toBe('oscuro');
    expect(tema.esOscuro()).toBe(true);
  });

  it('sin elección guardada sigue la preferencia del sistema', () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({
      matches: consulta.includes('prefers-color-scheme: dark'),
      media: consulta,
      addEventListener: () => undefined,
    }));
    const tema = TestBed.inject(TemaService);
    expect(tema.tema()).toBe('oscuro');
  });

  it('alternar cambia el atributo, la señal y recuerda la elección', () => {
    const tema = TestBed.inject(TemaService);
    tema.alternar();
    expect(tema.tema()).toBe('oscuro');
    expect(document.documentElement.getAttribute('data-tema')).toBe('oscuro');
    expect(localStorage.getItem('hs.tema')).toBe('oscuro');

    tema.alternar();
    expect(tema.tema()).toBe('claro');
    expect(localStorage.getItem('hs.tema')).toBe('claro');
  });

  it('fijar sin persistir (seguimiento del sistema) no guarda nada', () => {
    const tema = TestBed.inject(TemaService);
    tema.fijar('oscuro', false);
    expect(document.documentElement.getAttribute('data-tema')).toBe('oscuro');
    expect(localStorage.getItem('hs.tema')).toBeNull();
  });

  describe('modo «Sistema»', () => {
    function simularSistema(oscuro: boolean): void {
      vi.stubGlobal('matchMedia', (consulta: string) => ({
        matches: oscuro && consulta.includes('prefers-color-scheme: dark'),
        media: consulta,
        addEventListener: () => undefined,
      }));
    }

    it('modo() distingue lo guardado de «sistema» y elegir() lo guarda', () => {
      const tema = TestBed.inject(TemaService);
      expect(tema.modo()).toBe('sistema');
      tema.elegir('oscuro');
      expect(tema.modo()).toBe('oscuro');
      expect(localStorage.getItem('hs.tema')).toBe('oscuro');
      tema.elegir('claro');
      expect(tema.modo()).toBe('claro');
      expect(document.documentElement.getAttribute('data-tema')).toBe('claro');
    });

    it('elegir(«sistema») borra lo guardado y aplica el tema del sistema', () => {
      simularSistema(true);
      localStorage.setItem('hs.tema', 'claro');
      const tema = TestBed.inject(TemaService);
      expect(tema.modo()).toBe('claro');
      tema.elegir('sistema');
      expect(tema.modo()).toBe('sistema');
      expect(localStorage.getItem('hs.tema')).toBeNull();
      expect(tema.tema()).toBe('oscuro');
      expect(document.documentElement.getAttribute('data-tema')).toBe('oscuro');
    });

    it('sigue al sistema cuando cambia mientras el modo es «sistema»', () => {
      let alCambiar: ((e: { matches: boolean }) => void) | undefined;
      vi.stubGlobal('matchMedia', (consulta: string) => ({
        matches: false,
        media: consulta,
        addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => (alCambiar = fn),
      }));
      const tema = TestBed.inject(TemaService);
      alCambiar?.({ matches: true });
      expect(tema.tema()).toBe('oscuro');
      tema.elegir('claro');
      alCambiar?.({ matches: true });
      expect(tema.tema()).toBe('claro');
    });
  });

  it('para imprimir pasa a claro sin cambiar el tema elegido y luego lo restituye', () => {
    const tema = TestBed.inject(TemaService);
    tema.fijar('oscuro');
    tema.paraImpresion(true);
    expect(document.documentElement.getAttribute('data-tema')).toBe('claro');
    expect(tema.tema()).toBe('oscuro');
    expect(localStorage.getItem('hs.tema')).toBe('oscuro');
    tema.paraImpresion(false);
    expect(document.documentElement.getAttribute('data-tema')).toBe('oscuro');
  });

  describe('color de la barra del navegador', () => {
    const meta = (): string | null =>
      document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.getAttribute('content') ?? null;

    it('sigue al tema mientras el panel lo pide y vuelve al de la tienda al soltarlo', () => {
      const tema = TestBed.inject(TemaService);
      tema.fijarColorBarra({ claro: '#f4f3ef', oscuro: '#161716' });
      expect(meta()).toBe('#f4f3ef');
      tema.fijar('oscuro');
      expect(meta()).toBe('#161716');
      tema.fijarColorBarra(null);
      expect(meta()).toBe('#0d1220');
    });

    it('crea la etiqueta si el documento no la tiene', () => {
      document.head.querySelector('meta[name="theme-color"]')?.remove();
      const tema = TestBed.inject(TemaService);
      tema.fijarColorBarra({ claro: '#f4f3ef', oscuro: '#161716' });
      expect(document.head.querySelectorAll('meta[name="theme-color"]').length).toBe(1);
      expect(meta()).toBe('#f4f3ef');
    });
  });
});
