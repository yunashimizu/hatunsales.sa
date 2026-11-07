import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { urlConstants } from '../../../../constants/urlConstants';
import { AlertService } from '../../../../shared/services/alert.service';
import { CajaSesionComponent } from './caja-sesion.component';

describe('CajaSesionComponent: compatibilidad y estado verificado', () => {
  let component: CajaSesionComponent;
  let http: HttpTestingController;
  const alerta = {
    toast: vi.fn(),
    error: vi.fn(),
    confirm: vi.fn(async () => ({ isConfirmed: true })),
  };
  const apertura = {
    id_apertura: 12,
    id_caja: 1,
    caja_nombre: 'Caja 1',
    id_sucursal: 1,
    sucursal_nombre: 'Principal',
    id_usuario: 1,
    fecha: null,
    monto_inicial: 50,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [CajaSesionComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AlertService, useValue: alerta },
      ],
    })
      .overrideComponent(CajaSesionComponent, { set: { template: '' } })
      .compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CajaSesionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('conserva el cierre anterior si el servidor aún no ofrece arqueos', async () => {
    http.expectOne(urlConstants.caja.sesion).flush({ abierta: true, modo: 'blando', apertura });
    http.expectOne(urlConstants.caja.disponibles).flush({ items: [] });
    component.arqueoDisponible = false;
    component.montoConteo = 100;
    component.observacion = 'Cierre de prueba';
    await component.cerrarSinArqueo();
    const cierre = http.expectOne(urlConstants.caja.cerrar);
    expect(cierre.request.body).toEqual({
      id_apertura: 12,
      monto_conteo: 100,
      observacion: 'Cierre de prueba',
    });
    cierre.flush({ cerrada: true });
    http
      .expectOne(urlConstants.caja.sesion)
      .flush({ abierta: false, modo: 'blando', apertura: null });
    http.expectOne(urlConstants.caja.disponibles).flush({ items: [] });
    expect(component.idTurnoArqueo).toBe(12);
  });

  it('usa el flujo de arqueo cuando el nuevo módulo está disponible', async () => {
    http.expectOne(urlConstants.caja.sesion).flush({ abierta: true, modo: 'blando', apertura });
    http.expectOne(urlConstants.caja.disponibles).flush({ items: [] });
    component.arqueoDisponible = true;
    await component.cerrarSinArqueo();
    http.expectNone((r) => r.method === 'POST');
    expect(alerta.confirm).not.toHaveBeenCalled();
  });

  it('bloquea la apertura cuando no se pudo comprobar la sesión actual', () => {
    http
      .expectOne(urlConstants.caja.sesion)
      .flush({ message: 'Servidor ocupado' }, { status: 503, statusText: 'Service Unavailable' });
    http
      .expectOne(urlConstants.caja.disponibles)
      .flush({ items: [{ id_caja: 1, nombre: 'Caja libre', ocupada: false }] });
    component.abrir();
    expect(component.errorSesion).toBeTruthy();
    http.expectNone((r) => r.method === 'POST');
  });
});

describe('CajaSesionComponent: apertura con o sin efectivo', () => {
  let fixture: ComponentFixture<CajaSesionComponent>;
  let http: HttpTestingController;
  const alerta = {
    toast: vi.fn(),
    error: vi.fn(),
    confirm: vi.fn(async () => ({ isConfirmed: true })),
  };
  const caja = (sugerido: number | null | undefined) => ({
    id_caja: 7,
    nombre: 'Caja 2',
    id_sucursal: 1,
    sucursal_nombre: 'Principal',
    ocupada: false,
    sugerido_inicial: sugerido,
  });

  const el = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  const texto = (nodo: HTMLElement | null = fixture.nativeElement) => nodo?.textContent?.replace(/\s+/g, ' ') ?? '';

  async function montar(sugerido: number | null | undefined = 80, apertura: unknown = null): Promise<void> {
    fixture = TestBed.createComponent(CajaSesionComponent);
    fixture.detectChanges();
    http.expectOne(urlConstants.caja.sesion).flush({ abierta: !!apertura, modo: 'blando', apertura });
    http.expectOne(urlConstants.caja.disponibles).flush({ items: [caja(sugerido)] });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function escribirMonto(valor: string): Promise<void> {
    const campo = el('#monto-ini') as HTMLInputElement;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function abrirYResponder(): Promise<{ body: unknown }> {
    (el('button.adm-btn--primario') as HTMLButtonElement).click();
    const peticion = http.expectOne(urlConstants.caja.abrir);
    const body = peticion.request.body;
    peticion.flush({ id_apertura: 99 });
    http.expectOne(urlConstants.caja.sesion).flush({ abierta: false, modo: 'blando', apertura: null });
    http.expectOne(urlConstants.caja.disponibles).flush({ items: [caja(80)] });
    return { body };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [CajaSesionComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AlertService, useValue: alerta },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('ofrece «Con efectivo» por defecto, con campo decimal y el sugerido a la vista', async () => {
    await montar(80);
    expect(el('#modo-con-efectivo')?.getAttribute('aria-checked')).toBe('true');
    expect(el('#modo-sin-efectivo')?.getAttribute('aria-checked')).toBe('false');
    const campo = el('#monto-ini') as HTMLInputElement;
    expect(campo.getAttribute('inputmode')).toBe('decimal');
    expect(texto()).toContain('Dejó S/ 80.00 el último turno');
    expect(el('#aviso-diferencia')).toBeNull();
  });

  it('«Usar sugerido» rellena el monto y no muestra aviso', async () => {
    await montar(80);
    (el('#usar-sugerido') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect((el('#monto-ini') as HTMLInputElement).value).toBe('80');
    expect(el('#aviso-diferencia')).toBeNull();
    expect(fixture.componentInstance.montoInicial).toBe(80);
  });

  it('avisa en ámbar cuánto difiere del sugerido, sin bloquear', async () => {
    await montar(80);
    await escribirMonto('100.5');
    expect(el('#aviso-diferencia')?.textContent).toContain('Difiere S/ 20.50 del sugerido');
    expect(el('#aviso-diferencia')?.classList.contains('adm-aviso--aviso')).toBe(true);
    expect(el('#aviso-diferencia')?.parentElement?.getAttribute('aria-live')).toBe('polite');
    const { body } = await abrirYResponder();
    expect(body).toEqual({ id_caja: 7, monto_inicial: 100.5 });
  });

  it('con efectivo envía monto_inicial redondeado a céntimos y sin sin_efectivo', async () => {
    await montar(null);
    await escribirMonto('50.456');
    const { body } = await abrirYResponder();
    expect(body).toEqual({ id_caja: 7, monto_inicial: 50.46 });
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('«Sin efectivo» oculta el monto y envía sin_efectivo: true (sin monto_inicial)', async () => {
    await montar(null);
    await escribirMonto('30');
    (el('#modo-sin-efectivo') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el('#monto-ini')).toBeNull();
    expect(texto()).toContain('S/ 0.00');
    const { body } = await abrirYResponder();
    expect(body).toEqual({ id_caja: 7, sin_efectivo: true });
    expect(body).not.toHaveProperty('monto_inicial');
  });

  it('sin efectivo con un sugerido distinto de cero también avisa de la diferencia', async () => {
    await montar(80);
    (el('#modo-sin-efectivo') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el('#aviso-diferencia')?.textContent).toContain('Difiere S/ 80.00 del sugerido');
  });

  it('no inventa un sugerido cuando la caja no tiene cierre previo', async () => {
    await montar(null);
    expect(el('#usar-sugerido')).toBeNull();
    expect(texto()).not.toContain('Dejó');
    await escribirMonto('10');
    expect(el('#aviso-diferencia')).toBeNull();
  });

  it('con efectivo y sin monto no abre y explica por qué', async () => {
    await montar(80);
    (el('button.adm-btn--primario') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectNone((r) => r.method === 'POST');
    expect(el('#monto-ini-error')?.textContent).toContain('Sin efectivo');
    expect(el('#monto-ini')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('rechaza montos negativos o por encima del tope del servidor', async () => {
    await montar(null);
    await escribirMonto('-5');
    (el('button.adm-btn--primario') as HTMLButtonElement).click();
    http.expectNone((r) => r.method === 'POST');
    await escribirMonto('10000000');
    (el('button.adm-btn--primario') as HTMLButtonElement).click();
    http.expectNone((r) => r.method === 'POST');
    expect(el('#monto-ini-error')?.textContent).toContain('9 999 999.99');
  });

  it('un turno antiguo con monto_inicial NULL se muestra «sin dato», no 0', async () => {
    await montar(null, {
      id_apertura: 5,
      id_caja: 7,
      caja_nombre: 'Caja 2',
      id_sucursal: 1,
      sucursal_nombre: 'Principal',
      id_usuario: 1,
      fecha: null,
      monto_inicial: null,
    });
    expect(texto()).toContain('sin dato');
    // El arqueo hijo pide sus datos al montarse; no es objeto de esta prueba.
    http.match((r) => r.url.includes('/caja/arqueo') || r.url.includes('/caja/movimientos'));
  });
  describe('contar billetes y monedas al abrir', () => {
    async function abrirPanel(): Promise<void> {
      (el('#desglose-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    async function contar(centimos: number, cantidad: string): Promise<void> {
      const campo = el(`#den-${centimos}`) as HTMLInputElement;
      campo.value = cantidad;
      campo.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('el desglose está plegado por defecto y se despliega con aria-expanded', async () => {
      await montar(null);
      const boton = el('#desglose-toggle') as HTMLButtonElement;
      expect(texto()).toContain('Contar billetes y monedas');
      expect(boton.getAttribute('aria-expanded')).toBe('false');
      expect(el('#desglose-panel')).toBeNull();
      await abrirPanel();
      expect(boton.getAttribute('aria-expanded')).toBe('true');
      expect(el('#desglose-panel')).not.toBeNull();
    });

    it('lista las 11 denominaciones del sol con etiqueta, entero numérico y subtotal', async () => {
      await montar(null);
      await abrirPanel();
      const etiquetas = Array.from(fixture.nativeElement.querySelectorAll('.caja-den__etiqueta')).map((n) =>
        (n as HTMLElement).textContent?.trim(),
      );
      expect(etiquetas).toEqual([
        'S/ 200', 'S/ 100', 'S/ 50', 'S/ 20', 'S/ 10', 'S/ 5', 'S/ 2', 'S/ 1', 'S/ 0.50', 'S/ 0.20', 'S/ 0.10',
      ]);
      const campos = Array.from(fixture.nativeElement.querySelectorAll('.caja-den__input')) as HTMLInputElement[];
      expect(campos).toHaveLength(11);
      for (const c of campos) {
        expect(c.getAttribute('inputmode')).toBe('numeric');
        expect(c.getAttribute('min')).toBe('0');
        expect(c.getAttribute('step')).toBe('1');
        expect(fixture.nativeElement.querySelector(`label[for="${c.id}"]`)).not.toBeNull();
      }
      expect(Array.from(fixture.nativeElement.querySelectorAll('legend')).map((n) => (n as HTMLElement).textContent?.trim())).toEqual(['Billetes', 'Monedas']);
      expect(el('#desglose-total')?.getAttribute('aria-live')).toBe('polite');
    });

    it('el total contado rellena «Monto inicial» y se abre enviando solo id_caja y monto_inicial', async () => {
      await montar(null);
      await abrirPanel();
      await contar(10_000, '2'); // S/ 200
      await contar(500, '3'); // S/ 15
      await contar(50, '1'); // S/ 0.50
      expect(texto(el('#desglose-total'))).toContain('Total contado: S/ 215.50');
      expect((el('#monto-ini') as HTMLInputElement).value).toBe('215.5');
      expect(fixture.componentInstance.montoInicial).toBe(215.5);
      const { body } = await abrirYResponder();
      expect(body).toEqual({ id_caja: 7, monto_inicial: 215.5 });
    });

    it('editar el monto a mano descarta el conteo y lo avisa con discreción', async () => {
      await montar(null);
      await abrirPanel();
      await contar(2_000, '4'); // S/ 80
      expect(fixture.componentInstance.conteoConDatos).toBe(true);
      await escribirMonto('95');
      expect(fixture.componentInstance.conteoConDatos).toBe(false);
      expect((el('#den-2000') as HTMLInputElement).value).toBe('');
      expect(texto(el('#desglose-aviso'))).toContain('se descartó el conteo');
      expect(el('#desglose-aviso')?.parentElement?.getAttribute('aria-live')).toBe('polite');
      expect(fixture.componentInstance.montoInicial).toBe(95);
      const { body } = await abrirYResponder();
      expect(body).toEqual({ id_caja: 7, monto_inicial: 95 });
    });

    it('escribir en el monto un valor igual al conteo no lo descarta', async () => {
      await montar(null);
      await abrirPanel();
      await contar(1_000, '5'); // S/ 50
      await escribirMonto('50');
      expect(fixture.componentInstance.conteoConDatos).toBe(true);
      expect(el('#desglose-aviso')).toBeNull();
    });

    it('una cantidad con decimales se marca y no se suma', async () => {
      await montar(null);
      await abrirPanel();
      await contar(500, '2');
      await contar(100, '1.5');
      expect(el('#den-100')?.getAttribute('aria-invalid')).toBe('true');
      expect(el('#den-error')?.textContent).toContain('números enteros');
      expect(texto(el('#desglose-total'))).toContain('Total contado: S/ 10.00');
    });

    it('«Borrar conteo» vacía las cantidades y el monto', async () => {
      await montar(null);
      await abrirPanel();
      await contar(500, '2');
      expect((el('#monto-ini') as HTMLInputElement).value).toBe('10');
      (el('#desglose-limpiar') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect((el('#den-500') as HTMLInputElement).value).toBe('');
      expect(fixture.componentInstance.montoInicial).toBeNull();
      expect(texto(el('#desglose-total'))).toContain('Total contado: S/ 0.00');
    });

    it('con «Sin efectivo» no se ofrece el desglose', async () => {
      await montar(null);
      (el('#modo-sin-efectivo') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el('#desglose-toggle')).toBeNull();
    });

    it('«Usar sugerido» con un conteo distinto lo descarta con aviso', async () => {
      await montar(80);
      await abrirPanel();
      await contar(1_000, '1'); // S/ 10
      (el('#usar-sugerido') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.componentInstance.montoInicial).toBe(80);
      expect(fixture.componentInstance.conteoConDatos).toBe(false);
      expect(texto(el('#desglose-aviso'))).toContain('monto sugerido');
    });
  });
});
