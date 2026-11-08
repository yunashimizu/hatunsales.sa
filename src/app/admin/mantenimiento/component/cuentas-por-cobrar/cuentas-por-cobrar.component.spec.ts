import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { CuentasPorCobrarComponent } from './cuentas-por-cobrar.component';
import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { PuntoVentaService } from '../../../service/punto-venta.service';
import { ReceptorService } from '../../../service/receptor.service';
import { GestionService } from '../../service/gestion.service';

/**
 * El servidor entrega las cuentas de a 50. Solo cuando la lista llega completa se puede ordenar
 * por columna sin engañar; si hay más, las cabeceras quedan fijas y el CSV lo avisa.
 */
describe('CuentasPorCobrarComponent · orden y CSV', () => {
  const cuenta = (i: number) => ({
    id_cxc: i, id_venta: 100 + i, deudor: `Deudor ${String(10 - i).padStart(2, '0')}`, documento: `4000000${i}`,
    monto_total: 100 * i, saldo: 50 * i, estado: i % 2 ? 'pendiente' : 'vencido', fecha_vencimiento: `2026-11-${String(10 + i).padStart(2, '0')}`,
  });
  const cuentas = [1, 2, 3, 4].map(cuenta);
  const pv = {
    listarCxc: vi.fn(),
    metodosPago: vi.fn(() => of([])),
    cuentasBancarias: vi.fn(() => of([])),
  };
  const alerta = { toast: vi.fn(), error: vi.fn(), confirm: vi.fn() };

  async function montar(total: number) {
    vi.clearAllMocks();
    sessionStorage.clear();
    pv.listarCxc.mockReturnValue(of({ data: cuentas, total }));
    await TestBed.configureTestingModule({
      imports: [CuentasPorCobrarComponent],
      providers: [
        provideRouter([]),
        { provide: PuntoVentaService, useValue: pv },
        { provide: ReceptorService, useValue: { empresas: () => of([]) } },
        { provide: GestionService, useValue: { getClientes: () => of([]), getAntiguedadCxc: () => of(null) } },
        { provide: AlertService, useValue: alerta },
        { provide: AuthService, useValue: { getSesion: () => ({ rolNombre: 'admin', rolId: 1 }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CuentasPorCobrarComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const deudores = (raiz: HTMLElement) =>
    Array.from(raiz.querySelectorAll('tbody tr .adm-tabla__principal')).map((n) => n.textContent!.trim());

  it('con la lista completa ordena por columna y marca aria-sort', async () => {
    const fixture = await montar(4);
    const raiz: HTMLElement = fixture.nativeElement;
    expect(deudores(raiz)[0]).toBe('Deudor 09');

    raiz.querySelector<HTMLButtonElement>('thead th:first-child button')!.click();
    fixture.detectChanges();

    expect(raiz.querySelector('thead th:first-child')!.getAttribute('aria-sort')).toBe('ascending');
    expect(deudores(raiz)[0]).toBe('Deudor 06');
    const c = fixture.componentInstance;
    c.ordenar('saldo');
    c.ordenar('saldo');
    expect(c.cuentasMostradas[0].saldo).toBe(200);
  });

  it('si el servidor tiene más cuentas que las 50 cargadas no ordena ni ofrece el selector', async () => {
    const fixture = await montar(120);
    const raiz: HTMLElement = fixture.nativeElement;
    expect(fixture.componentInstance.listaCompleta).toBe(false);
    expect(raiz.querySelectorAll('thead .adm-tabla__orden')).toHaveLength(0);
    expect(raiz.querySelector('thead th:first-child')!.hasAttribute('aria-sort')).toBe(false);
    expect(raiz.querySelector('app-orden-movil')).toBeNull();
    fixture.componentInstance.ordenar('deudor');
    expect(deudores(raiz)[0]).toBe('Deudor 09');
  });

  it('exporta las cuentas y, si faltan, avisa cuántas hay en total', async () => {
    const fixture = await montar(120);
    let blob: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b as Blob; return 'blob:x'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    fixture.componentInstance.exportarCsv();

    expect((await blob!.text()).split('\r\n').filter(Boolean)).toHaveLength(5);
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'CSV descargado: 4 filas',
      message: expect.stringContaining('Hay 120 cuentas'),
    }));
    vi.restoreAllMocks();
  });
});

/** Cobranza: la deuda por antigüedad, el filtro por tramo y el recordatorio por WhatsApp. */
describe('CuentasPorCobrarComponent · cobranza', () => {
  /** AAAA-MM-DD de hoy más `dias` días (negativo = ya venció). */
  const fecha = (dias: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const cuenta = (id: number, dias: number, saldo: number, extra: Record<string, unknown> = {}) => ({
    id_cxc: id, id_venta: 500 + id, id_cliente: id, id_empresa: null, deudor: `JUAN PEREZ ${id}`, documento: `4000000${id}`,
    monto_total: saldo + 100, saldo, estado: dias < 0 ? 'vencido' : 'pendiente', fecha_emision: fecha(-60), fecha_vencimiento: fecha(dias), ...extra,
  });
  const lista = [
    cuenta(1, 10, 100),                       // al día
    cuenta(2, 0, 50),                         // vence hoy: al día
    cuenta(3, -5, 200),                       // 1–30
    cuenta(4, -40, 300),                      // 31–60
    cuenta(5, -90, 400),                      // más de 60
    cuenta(6, -100, 0, { estado: 'pagado' }), // pagada: no cuenta
  ];
  const pv = { listarCxc: vi.fn(), metodosPago: vi.fn(() => of([])), cuentasBancarias: vi.fn(() => of([])) };
  const alerta = { toast: vi.fn(), error: vi.fn(), confirm: vi.fn() };

  async function montar(antiguedad: unknown = null, datos: any[] = lista) {
    vi.clearAllMocks();
    sessionStorage.clear();
    pv.listarCxc.mockReturnValue(of({ data: datos, total: datos.length }));
    await TestBed.configureTestingModule({
      imports: [CuentasPorCobrarComponent],
      providers: [
        provideRouter([]),
        { provide: PuntoVentaService, useValue: pv },
        // Solo Juan 3 y 4 tienen teléfono en el padrón (el 3 con celular; el 4 con un fijo sin código de país, que WhatsApp no acepta).
        { provide: ReceptorService, useValue: { empresas: () => of([]) } },
        { provide: GestionService, useValue: { getAntiguedadCxc: () => of(antiguedad), getClientes: () => of([
          { id_cliente: 3, telefono: '987 654 321' },
          { id_cliente: 4, telefono: '084-123456' },
          { id_cliente: 5, telefono: '' },
        ]) } },
        { provide: AlertService, useValue: alerta },
        { provide: AuthService, useValue: { getSesion: () => ({ rolNombre: 'admin', rolId: 1 }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CuentasPorCobrarComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('reparte el saldo por tramos de antigüedad e ignora lo pagado', async () => {
    const c = (await montar()).componentInstance;
    expect(c.tramos.map((t) => [t.clave, t.importe, t.cuentas])).toEqual([
      ['aldia', 150, 2],
      ['d1_30', 200, 1],
      ['d31_60', 300, 1],
      ['d60', 400, 1],
    ]);
  });

  it('el chip de un tramo deja solo sus cuentas y volver a pulsarlo las devuelve todas', async () => {
    const fixture = await montar();
    const raiz: HTMLElement = fixture.nativeElement;
    const filas = () => raiz.querySelectorAll('tbody tr').length;
    const chips = Array.from(raiz.querySelectorAll<HTMLButtonElement>('.cxc-tramos .adm-chip'));
    expect(chips.map((x) => x.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false']);

    chips.find((x) => x.textContent!.includes('31–60'))!.click();
    fixture.detectChanges();
    expect(filas()).toBe(1);
    expect(raiz.querySelector('tbody .adm-tabla__principal')!.textContent).toContain('JUAN PEREZ 4');
    expect(raiz.querySelector('.cxc-vence__atraso')!.textContent).toContain('Vencida hace 40 días');

    chips[0].click();
    fixture.detectChanges();
    expect(filas()).toBe(lista.length);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('arma el enlace de WhatsApp con el texto editado y lo abre sin salir del panel', async () => {
    const fixture = await montar();
    const c = fixture.componentInstance;
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);

    c.abrirRecordatorio(c.cuentas[2]);
    fixture.detectChanges();
    expect(c.recordatorio!.texto).toContain('Hola JUAN PEREZ 3');
    expect(c.recordatorio!.texto).toContain('S/ 200.00');
    expect(c.recordatorio!.texto).toContain('venció el');
    expect(c.enlaceRecordatorio!.startsWith('https://wa.me/51987654321?text=')).toBe(true);

    c.recordatorio!.texto = 'Buenas tardes, ¿cuándo pasa a pagar?';
    expect(c.enlaceRecordatorio).toBe(`https://wa.me/51987654321?text=${encodeURIComponent('Buenas tardes, ¿cuándo pasa a pagar?')}`);
    c.enviarRecordatorio();
    expect(abrir).toHaveBeenCalledWith(expect.stringContaining('wa.me/51987654321'), '_blank', 'noopener,noreferrer');
    expect(c.recordatorio).toBeNull();
    abrir.mockRestore();
  });

  it('sin teléfono válido el botón de WhatsApp queda deshabilitado y explica por qué', async () => {
    const fixture = await montar();
    const raiz: HTMLElement = fixture.nativeElement;
    const botones = Array.from(raiz.querySelectorAll<HTMLButtonElement>('tbody .cxc-wa'));
    // En el orden del servidor: Juan 1 y 2 (sin padrón), 3 (celular), 4 (fijo inválido), 5 (vacío); la pagada no lleva botón.
    expect(botones).toHaveLength(5);
    const habilitados = botones.map((b) => !b.disabled);
    expect(habilitados).toEqual([false, false, true, false, false]);
    expect(botones[0].title).toContain('no tiene un teléfono válido');

    fixture.componentInstance.abrirRecordatorio(fixture.componentInstance.cuentas[0]);
    expect(fixture.componentInstance.recordatorio).toBeNull();
  });

  it('ordena por vencimiento, exporta los días de atraso y arma el enlace al estado de cuenta', async () => {
    const fixture = await montar();
    const c = fixture.componentInstance;
    c.ordenar('vence');
    expect(c.cuentasMostradas.map((x) => x.id_cxc)).toEqual([6, 5, 4, 3, 2, 1]);
    c.ordenar('vence');
    expect(c.cuentasMostradas[0].id_cxc).toBe(1);

    let blob: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b as Blob; return 'blob:x'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    c.exportarCsv();
    const csv = (await blob!.text()).split('\r\n');
    expect(csv[0]).toContain('Días de atraso');
    expect(csv.find((l) => l.includes('JUAN PEREZ 5'))).toContain(',90,');
    vi.restoreAllMocks();

    expect(c.rutaEstadoCuenta(c.cuentas[2])).toEqual(['/dashboard/mantenimiento/cuentas-por-cobrar/estado-cuenta', 'cliente', '3']);
    expect(c.rutaEstadoCuenta({ id_empresa: 7 })![1]).toBe('empresa');
  });
  it('usa la antigüedad que calcula el servidor (todas las cuentas) y deja los chips con lo que hay en la tabla', async () => {
    const fixture = await montar({
      al_dia: { cuentas: 40, saldo: 8000.5 },
      de_1_a_30: { cuentas: 12, saldo: 2500 },
      de_31_a_60: { cuentas: 3, saldo: 900 },
      mas_de_60: { cuentas: 2, saldo: 1200.25 },
    });
    const c = fixture.componentInstance;

    expect(c.tarjetasTramos.map((t) => [t.clave, t.importe, t.cuentas])).toEqual([
      ['aldia', 8000.5, 40],
      ['d1_30', 2500, 12],
      ['d31_60', 900, 3],
      ['d60', 1200.25, 2],
    ]);
    expect(fixture.nativeElement.querySelectorAll('.cxc-metricas .cxc-tramo__cifra').length).toBe(4);
    // Los chips filtran la tabla: cuentan las cargadas.
    expect(c.tramos.map((t) => t.cuentas)).toEqual([2, 1, 1, 1]);
  });

  it('si el servidor no responde la antigüedad, las tarjetas se calculan con las cuentas cargadas', async () => {
    const c = (await montar(null)).componentInstance;
    expect(c.antiguedadServidor).toBeNull();
    expect(c.tarjetasTramos.map((t) => t.importe)).toEqual([150, 200, 300, 400]);
  });

  it('una respuesta incompleta de antigüedad se ignora', async () => {
    const c = (await montar({ al_dia: { cuentas: 1 } })).componentInstance;
    expect(c.antiguedadServidor).toBeNull();
    expect(c.tarjetasTramos.map((t) => t.importe)).toEqual([150, 200, 300, 400]);
  });

  it('muestra el serie-número del comprobante y usa el teléfono que ya trae la cuenta', async () => {
    const conDatos = [
      cuenta(1, -5, 200, { comprobante: 'F001-00000012', telefono: '984 111 222' }),
      cuenta(2, 3, 80, { comprobante: null, telefono: null }),
    ];
    const fixture = await montar(null, conDatos);
    const raiz: HTMLElement = fixture.nativeElement;
    const c = fixture.componentInstance;

    const celdas = Array.from(raiz.querySelectorAll('tbody td[data-etiqueta="Venta"]')).map((n) => n.textContent!.trim());
    expect(celdas).toEqual(['F001-00000012', '#502']);
    const botones = Array.from(raiz.querySelectorAll<HTMLButtonElement>('tbody .cxc-wa'));
    expect(botones.map((b) => !b.disabled)).toEqual([true, false]);

    c.abrirRecordatorio(conDatos[0]);
    expect(c.recordatorio!.telefono).toBe('51984111222');
    expect(c.recordatorio!.texto).toContain('por el comprobante F001-00000012');
    expect(c.recordatorio!.texto).not.toContain('venta N.°');
  });
});
