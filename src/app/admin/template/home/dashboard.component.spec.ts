import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { AuthService } from '../../../auth/service/auth.service';
import { urlConstants } from '../../../constants/urlConstants';
import { CajaSesionService } from '../../service/caja-sesion.service';
import { ComprobanteService } from '../../service/comprobante.service';
import { CreditoAdminService } from '../../service/credito-admin.service';
import { FiscalEstadoService } from '../../service/fiscal-estado.service';
import { InventarioAdminService } from '../../service/inventario-admin.service';
import { PedidoAdminService } from '../../service/pedido-admin.service';
import { ReportesService } from '../../service/reportes.service';
import { DashboardComponent } from './dashboard.component';

/** Solo la lógica del gráfico «Ventas por hora» (no se monta la pantalla). */
describe('DashboardComponent · ventas por hora', () => {
  function crear(): any {
    return Object.create(DashboardComponent.prototype);
  }
  const hora = (h: number, total: number, ventas = 1) => ({ hora: h, total, ventas });

  it('arma el eje de 7 a 21 h, marca la hora pico y guarda la semana pasada aparte', () => {
    const c = crear();
    c.aplicarHoras({
      fecha: '2026-11-07',
      horas: [hora(9, 100), hora(17, 400, 3), hora(18, 250)],
      comparacion: { fecha: '2026-10-31', horas: [hora(17, 300), hora(11, 50)] },
    });

    expect(c.horaConDatos).toBe(true);
    expect(c.barrasHora.length).toBe(15);
    expect(c.barrasHora[0].hora).toBe(7);
    expect(c.barrasHora[14].hora).toBe(21);
    const pico = c.barrasHora.filter((b: any) => b.esPico);
    expect(pico.length).toBe(1);
    expect(pico[0].hora).toBe(17);
    expect(pico[0].totalPrev).toBe(300);
    expect(c.hallazgoHora).toContain('17:00');
  });

  it('amplía el eje si hay ventas fuera de 7-21 h', () => {
    const c = crear();
    c.aplicarHoras({ fecha: 'x', horas: [hora(5, 20), hora(23, 10)], comparacion: { fecha: 'y', horas: [] } });

    expect(c.barrasHora[0].hora).toBe(5);
    expect(c.barrasHora[c.barrasHora.length - 1].hora).toBe(23);
  });

  it('sin respuesta (404/500/timeout) o sin ventas no hay gráfico por hora: queda el semanal', () => {
    const c = crear();
    c.aplicarHoras(null);
    expect(c.horaConDatos).toBe(false);

    c.aplicarHoras({ fecha: 'x', horas: [], comparacion: { fecha: 'y', horas: [] } });
    expect(c.horaConDatos).toBe(false);
    expect(c.barrasHora).toEqual([]);

    c.aplicarHoras({ horas: 'raro' });
    expect(c.horaConDatos).toBe(false);
  });
});

/** Fila «Necesita tu atención» y acceso rápido de los pedidos web (lógica pura, sin montar la pantalla). */
describe('DashboardComponent · pedidos web', () => {
  function crear(): any {
    const c = Object.create(DashboardComponent.prototype);
    c.fiscal = { estado: () => null };
    return c;
  }

  it('suma pendientes y pagados en una fila que lleva a Pedidos', () => {
    const c = crear();
    c.vePedidos = true;
    c.pedidosWeb = { pendientes: 1, pagados: 2, total: 3 };
    const fila = c.filasAtencion.find((f: any) => f.id === 'pedidos-web');

    expect(fila.texto).toBe('3 pedidos web por preparar');
    expect(fila.detalle).toBe('2 pagados, a preparar · 1 por cobrar');
    expect(fila.ruta).toBe('/dashboard/mantenimiento/pedidos');
    expect(fila.tono).toBe('aviso');
  });

  it('sin pedidos por atender, o sin permiso, no hay fila', () => {
    const c = crear();
    c.vePedidos = true;
    c.pedidosWeb = { pendientes: 0, pagados: 0, total: 0 };
    expect(c.filasAtencion.some((f: any) => f.id === 'pedidos-web')).toBe(false);

    c.vePedidos = false;
    c.pedidosWeb = { pendientes: 1, pagados: 0, total: 1 };
    expect(c.filasAtencion.some((f: any) => f.id === 'pedidos-web')).toBe(false);
  });

  it('cuenta como lectura hecha para no decir «todo en orden» a ciegas', () => {
    const c = crear();
    c.pedidosWeb = { pendientes: 0, pagados: 0, total: 0 };
    expect(c.atencionRevisada).toBe(true);
  });
});

/** Pantalla montada con los servicios simulados: periodo, comparaciones, meta, tarjetas y actualización sola. */
describe('DashboardComponent · centro de mando', () => {
  const hora = (h: number, total: number, ventas = 1) => ({ hora: h, total, ventas });
  const unDia = (total: number, fecha = '2026-11-08') => ({ fecha, total_vendido: total, tipo_documento: 'venta' });
  const reporte = (total: number) => ({
    total_vendido: total,
    detalle: [unDia(total / 2), unDia(total / 2)],
    top_productos_vendidos: [{ producto: 'Cemento Sol 42.5 kg', cantidad: 12, total: 480 }],
  });

  let rol = 'admin';
  let sucursalesDevueltas = 2;
  let fixture: ComponentFixture<DashboardComponent>;
  let componente: DashboardComponent;
  let http: HttpTestingController;
  const dataAuth$ = new Subject<void>();

  const reportes = { ventas: vi.fn(), ventasPorHora: vi.fn() };
  const inventario = { resumen: vi.fn() };
  const comprobantes = { monitorAtencion: vi.fn() };
  const pedidos = { porPreparar: vi.fn(), resumen: of(null) };
  const caja = { sesion: vi.fn(), resumenSucursales: vi.fn() };
  const credito = { vencidasResumen: vi.fn() };

  const filaApi = (id: number) => ({
    id_comprobante: id,
    tipo_nombre: 'Boleta',
    serie: 'B001',
    numero: id,
    numero_formateado: `B001-${String(id).padStart(8, '0')}`,
    creado_en: new Date().toISOString(),
    cliente_denominacion: 'Ferretería Los Andes',
    total: 118,
    estado: 'emitido',
    aceptada_sunat: true,
    anulado: false,
    estado_sunat: 'ACEPTADO',
  });

  /** Responde la única lectura que pasa por HTTP directo: la actividad reciente (la deuda vencida va por CreditoAdminService). */
  function responderHttp(): void {
    http
      .match((r) => r.url === urlConstants.comprobante.base)
      .forEach((r) => r.flush({ datos: [filaApi(7), filaApi(6)], total: 2, pagina: 1, por_pagina: 6 }));
  }

  async function montar(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            data$: dataAuth$.asObservable(),
            getSesion: () => ({ idUsuario: 1, nombre: 'Moisés Quispe', email: '', rolId: 1, rolNombre: rol, permisos: [], iniciales: 'MQ' }),
            puedeVer: (roles: string[]) => roles.includes(rol),
            etiquetaRol: () => 'Administrador',
          },
        },
        { provide: FiscalEstadoService, useValue: { estado: () => null } },
        { provide: ReportesService, useValue: reportes },
        { provide: InventarioAdminService, useValue: inventario },
        { provide: ComprobanteService, useValue: comprobantes },
        { provide: PedidoAdminService, useValue: pedidos },
        { provide: CajaSesionService, useValue: caja },
        { provide: CreditoAdminService, useValue: credito },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DashboardComponent);
    componente = fixture.componentInstance;
    fixture.detectChanges();
    responderHttp();
    fixture.detectChanges();
  }

  const texto = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    rol = 'admin';
    sucursalesDevueltas = 2;
    localStorage.clear();
    sessionStorage.clear();
    reportes.ventas.mockReset().mockImplementation(() => of(reporte(5751.3)));
    reportes.ventasPorHora.mockReset().mockImplementation(() =>
      of({ fecha: '2026-11-08', horas: [hora(9, 100), hora(17, 400, 3)], comparacion: { fecha: '2026-11-01', horas: [hora(17, 300)] } }),
    );
    inventario.resumen.mockReset().mockImplementation(() => of({ productos: 10, sin_stock: 1, bajo_stock: 2, valorizado: 0, unidades: 0 }));
    comprobantes.monitorAtencion.mockReset().mockImplementation(() => of({ pendientes: 0, errores: 0, total: 0 }));
    pedidos.porPreparar.mockReset().mockImplementation(() => of({ pendientes: 0, pagados: 0, total: 0 }));
    credito.vencidasResumen.mockReset().mockImplementation(() => of({ cuentas: 0, total: 0 }));
    caja.sesion.mockReset().mockImplementation(() =>
      of({
        abierta: true,
        modo: 'blando',
        apertura: { id_apertura: 1, caja_nombre: 'Caja 1', id_usuario: 1, fecha: '2026-11-08T13:00:00Z' },
        resumen: { ventas: 3, total: 3000, por_metodo: [{ metodo: 'Efectivo', total: 1860.4, cantidad: 14 }, { metodo: 'Yape', total: 912, cantidad: 6 }] },
      }),
    );
    caja.resumenSucursales.mockReset().mockImplementation(() =>
      of({
        desde: 'x',
        hasta: 'x',
        total: {},
        sucursales: [
          { id_sucursal: 1, nombre: 'Principal', turnos: 2, ventas_total: 3412 },
          { id_sucursal: 2, nombre: 'Norte', turnos: 1, ventas_total: 1500 },
        ].slice(0, sucursalesDevueltas),
      }),
    );
  });

  afterEach(() => {
    http?.verify();
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('al cambiar de periodo solo vuelve a pedir el reporte y las horas, no caja, stock, SUNAT ni pedidos', async () => {
    await montar();
    expect(reportes.ventas).toHaveBeenCalledTimes(2); // diario y semana (respaldo del gráfico)
    expect(reportes.ventasPorHora).toHaveBeenCalledTimes(1);
    [reportes.ventas, reportes.ventasPorHora, inventario.resumen, comprobantes.monitorAtencion, pedidos.porPreparar, caja.sesion, caja.resumenSucursales, credito.vencidasResumen].forEach((f) => f.mockClear());

    componente.cambiarPeriodo('ayer');
    fixture.detectChanges();
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const clave = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`;
    expect(reportes.ventas).toHaveBeenCalledTimes(1);
    expect(reportes.ventas.mock.calls[0].slice(0, 2)).toEqual(['diario', { fecha_inicio: clave, fecha_fin: clave }]);
    expect(reportes.ventasPorHora).toHaveBeenCalledWith(clave);

    reportes.ventas.mockClear();
    reportes.ventasPorHora.mockClear();
    componente.cambiarPeriodo('mes');
    expect(reportes.ventas.mock.calls[0][0]).toBe('mensual');
    expect(reportes.ventasPorHora).not.toHaveBeenCalled();

    expect(inventario.resumen).not.toHaveBeenCalled();
    expect(comprobantes.monitorAtencion).not.toHaveBeenCalled();
    expect(pedidos.porPreparar).not.toHaveBeenCalled();
    expect(caja.sesion).not.toHaveBeenCalled();
    expect(caja.resumenSucursales).not.toHaveBeenCalled();
    expect(credito.vencidasResumen).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('hs.inicio.periodo')).toBe('"mes"');
    fixture.detectChanges();
    expect(texto()).toContain('Ventas del mes');
  });

  it('compara con la semana pasada: sube, baja y sin referencia', async () => {
    await montar();
    const c = componente as unknown as { periodo: string; aplicarComparacion(d: unknown): void };
    c.periodo = 'ayer'; // el día completo
    const datos = (hoy: number, ventasHoy: number, antes: number, ventasAntes: number) => ({
      fecha: 'x',
      horas: [hora(10, hoy, ventasHoy)],
      comparacion: { fecha: 'y', horas: [hora(10, antes, ventasAntes)] },
    });

    c.aplicarComparacion(datos(560, 4, 500, 4));
    expect(componente.deltaVentas).toMatchObject({ tipo: 'sube', signo: '▲', texto: '12 %' });
    expect(componente.deltaTicket).toMatchObject({ tipo: 'sube' });

    c.aplicarComparacion(datos(400, 4, 500, 4));
    expect(componente.deltaVentas).toMatchObject({ tipo: 'baja', signo: '▼', texto: '20 %' });

    c.aplicarComparacion(datos(400, 4, 0, 0));
    expect(componente.deltaVentas).toMatchObject({ tipo: 'sin-referencia', texto: 'sin datos de la semana pasada' });

    componente.cambiarPeriodo('semana');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.adm-delta')).toBeNull(); // en semana y mes no hay comparación
  });

  it('la meta del día se guarda en el navegador y se muestra el porcentaje; al superarla dice «Meta cumplida»', async () => {
    await montar();
    expect(fixture.nativeElement.querySelector('.ini-meta__definir')).not.toBeNull();

    componente.editarMeta();
    componente.metaBorrador = 8500;
    componente.guardarMeta();
    fixture.detectChanges();
    expect(localStorage.getItem('hs.panel.meta-diaria')).toBe('8500');
    expect(componente.porcentajeMeta).toBe(68);
    expect(texto()).toContain('68 % de la meta S/ 8,500.00');
    expect(fixture.nativeElement.querySelector('.ini-meta__barra')?.getAttribute('aria-valuenow')).toBe('68');

    componente.metaBorrador = 5000;
    componente.guardarMeta();
    fixture.detectChanges();
    expect(componente.metaCumplida).toBe(true);
    expect(texto()).toContain('Meta cumplida');

    // Un cajero no ve la meta
    TestBed.resetTestingModule();
    rol = 'caja';
    await montar();
    expect(fixture.nativeElement.querySelector('.ini-meta')).toBeNull();
  });

  it('ocultar una tarjeta la quita, la fila reparte el ancho y la preferencia se recuerda', async () => {
    await montar();
    expect(fixture.nativeElement.querySelector('#ini-actividad-titulo')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#ini-cobros-titulo')).not.toBeNull();

    componente.alternarTarjeta('actividad');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#ini-actividad-titulo')).toBeNull();
    const fila = fixture.nativeElement.querySelector('#ini-cobros-titulo').closest('.ini-fila') as HTMLElement;
    expect(fila.classList).toContain('ini-fila--sola');
    expect(JSON.parse(localStorage.getItem('hs.inicio.ocultas') ?? '[]')).toEqual(['actividad']);

    TestBed.resetTestingModule();
    await montar();
    expect(fixture.nativeElement.querySelector('#ini-actividad-titulo')).toBeNull();

    componente.alternarTarjeta('actividad'); // volver a mostrarla
    responderHttp();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#ini-actividad-titulo')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('hs.inicio.ocultas') ?? '[]')).toEqual([]);
  });

  it('la actividad reciente abre el comprobante en Documentos y «Por sucursal» solo sale con más de una', async () => {
    await montar();
    const enlaces = Array.from(fixture.nativeElement.querySelectorAll('a.ini-act')) as HTMLAnchorElement[];
    expect(enlaces.length).toBe(2);
    expect(enlaces[0].getAttribute('href')).toBe('/dashboard/mantenimiento/doc?comprobante=7');
    expect(enlaces[0].textContent).toContain('B001-00000007');
    expect(enlaces[0].textContent).toContain('Aceptado por SUNAT');
    expect(fixture.nativeElement.querySelector('#ini-sucursales-titulo')).not.toBeNull();
    expect(texto()).toContain('Principal');

    TestBed.resetTestingModule();
    sucursalesDevueltas = 1;
    await montar();
    expect(fixture.nativeElement.querySelector('#ini-sucursales-titulo')).toBeNull();
  });

  it('se actualiza solo cada minuto con la pestaña visible y se pausa cuando está oculta', async () => {
    vi.useFakeTimers();
    const estado = (valor: DocumentVisibilityState) =>
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => valor });
    try {
      await montar();
      expect(inventario.resumen).toHaveBeenCalledTimes(1);

      estado('hidden');
      vi.advanceTimersByTime(180_000);
      expect(inventario.resumen).toHaveBeenCalledTimes(1);

      estado('visible');
      document.dispatchEvent(new Event('visibilitychange')); // volvió tras más de un minuto: lee al instante
      expect(inventario.resumen).toHaveBeenCalledTimes(2);
      responderHttp();

      vi.advanceTimersByTime(60_000);
      expect(inventario.resumen).toHaveBeenCalledTimes(3);
      responderHttp();
    } finally {
      estado('visible');
      delete (document as unknown as Record<string, unknown>)['visibilityState'];
    }
  });
});
