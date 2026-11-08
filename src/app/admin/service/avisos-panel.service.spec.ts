import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../auth/service/auth.service';
import { urlConstants } from '../../constants/urlConstants';
import { EstadoFiscalGlobal } from '../models/fiscal.models';
import { AvisosPanelService, CLAVE_AVISOS_VISTOS } from './avisos-panel.service';
import { FiscalEstadoService } from './fiscal-estado.service';
import { PedidoAdminService } from './pedido-admin.service';

function estadoFiscal(cambios: Partial<EstadoFiscalGlobal> = {}): EstadoFiscalGlobal {
  return {
    ambiente: 'produccion',
    emision_activa: true,
    codigo: null,
    motivo: null,
    bloqueo: null,
    cola: { pendientes: 0, inciertos: 0 },
    plazos: { vencen_hoy: 0, vencidos: 0 },
    certificado: { cargado: true, dias_para_vencer: 200, vencido: false, autofirmado: false },
    tareas: null,
    semaforo: 'verde',
    evaluado_en: '',
    ...cambios,
  };
}

describe('AvisosPanelService', () => {
  let rolesPermitidos: string[] = [];
  const estado = signal<EstadoFiscalGlobal | null>(null);
  const resumenPedidos = new BehaviorSubject<{ pendientes: number; pagados: number; total: number } | null>(null);
  const fiscalIniciar = vi.fn();
  let http: HttpTestingController;
  let servicio: AvisosPanelService;

  function montar(roles: string[]): void {
    rolesPermitidos = roles;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { puedeVer: (r: string[]) => r.some((x) => rolesPermitidos.includes(x)) } },
        { provide: FiscalEstadoService, useValue: { estado, iniciar: fiscalIniciar } },
        { provide: PedidoAdminService, useValue: { resumen: resumenPedidos.asObservable() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    servicio = TestBed.inject(AvisosPanelService);
  }

  /** Responde las cuatro lecturas del servidor. */
  function responder(datos: { cpe?: object; inv?: object; cxc?: object; caja?: object } = {}): void {
    http.expectOne(urlConstants.comprobante.monitorAtencion).flush(datos.cpe ?? { pendientes: 0, errores: 0, total: 0 });
    http.expectOne(urlConstants.inventario.resumen).flush(datos.inv ?? { sin_stock: 0, bajo_stock: 0 });
    http.expectOne((r) => r.url === urlConstants.credito.cuentas).flush(datos.cxc ?? { data: [], total: 0 });
    http.expectOne(urlConstants.caja.sesion).flush(datos.caja ?? { abierta: true });
  }

  beforeEach(() => {
    localStorage.clear();
    estado.set(null);
    resumenPedidos.next(null);
    fiscalIniciar.mockClear();
  });

  afterEach(() => {
    servicio.detener();
    http.verify();
    localStorage.clear();
  });

  it('compone los avisos según el rol: el administrador ve todo, graves primero', () => {
    montar(['admin']);
    estado.set(estadoFiscal({ certificado: { cargado: true, dias_para_vencer: 12, vencido: false, autofirmado: false } }));
    resumenPedidos.next({ pendientes: 1, pagados: 2, total: 3 });
    servicio.iniciar();
    vi.spyOn(servicio as unknown as { ahora(): Date }, 'ahora').mockReturnValue(new Date('2026-11-08T17:00:00Z')); // 12:00 en Lima
    responder({
      cpe: { pendientes: 2, errores: 1, total: 3 },
      inv: { sin_stock: 4, bajo_stock: 7 },
      cxc: { data: [{ saldo: 100, estado: 'vencido' }, { saldo: 50.5, estado: 'vencido' }], total: 2 },
      caja: { abierta: false },
    });

    const claves = servicio.items().map((a) => a.clave);
    expect(claves).toEqual(
      expect.arrayContaining(['cpe-error', 'cpe-pendiente', 'stock-cero', 'stock-bajo', 'cxc-vencidas', 'pedidos-web', 'fiscal-cert', 'caja-cerrada']),
    );
    // Los graves (rojo) van antes que los de aviso y estos antes que los informativos.
    const tonos = servicio.items().map((a) => a.tono);
    expect(tonos.indexOf('aviso')).toBeGreaterThan(tonos.lastIndexOf('peligro'));
    expect(tonos.indexOf('info')).toBeGreaterThan(tonos.lastIndexOf('aviso'));
    expect(servicio.hayPeligro()).toBe(true);
    expect(servicio.items().find((a) => a.clave === 'cxc-vencidas')?.detalle).toContain('150.50');
    expect(servicio.items().find((a) => a.clave === 'pedidos-web')?.detalle).toBe('2 pagados, a preparar · 1 por cobrar');
    expect(servicio.items().find((a) => a.clave === 'fiscal-cert')?.ruta).toBe('/dashboard/facturacion-sunat');
    expect(fiscalIniciar).toHaveBeenCalled();
    expect(servicio.actualizadoEn()).not.toBeNull();
  });

  it('un rol de solo consulta pide únicamente el stock y no ve lo demás', () => {
    montar(['consulta']);
    estado.set(estadoFiscal({ bloqueo: { codigo: '0102', motivo: 'Clave SOL incorrecta', fecha: '2026-11-08' } }));
    resumenPedidos.next({ pendientes: 0, pagados: 1, total: 1 });
    servicio.iniciar();
    http.expectNone(urlConstants.comprobante.monitorAtencion);
    http.expectNone((r) => r.url === urlConstants.credito.cuentas);
    http.expectNone(urlConstants.caja.sesion);
    http.expectOne(urlConstants.inventario.resumen).flush({ sin_stock: 0, bajo_stock: 3 });

    expect(servicio.items().map((a) => a.clave)).toEqual(['stock-bajo']);
    expect(servicio.items()[0].ruta).toBe('/dashboard/mantenimiento/stock');
  });

  it('no vistos cambia cuando varía la cifra de un aviso y marcarVistos lo deja en 0', () => {
    montar(['admin']);
    servicio.iniciar();
    responder({ inv: { sin_stock: 2, bajo_stock: 0 }, cpe: { errores: 1, pendientes: 0 } });
    expect(servicio.noVistos()).toBe(2);

    servicio.marcarVistos();
    expect(servicio.noVistos()).toBe(0);
    expect(JSON.parse(localStorage.getItem(CLAVE_AVISOS_VISTOS) ?? '{}')).toEqual({ 'stock-cero': 2, 'cpe-error': 1 });

    // Otra lectura con la misma cifra no vuelve a llamar la atención; con una distinta, sí.
    servicio.refrescar();
    responder({ inv: { sin_stock: 2, bajo_stock: 0 }, cpe: { errores: 3, pendientes: 0 } });
    expect(servicio.noVistos()).toBe(1);
    servicio.marcarVistos();
    expect(servicio.noVistos()).toBe(0);
  });

  it('sin rol no pide nada ni muestra avisos, y si todas las lecturas fallan lo dice', () => {
    montar([]);
    estado.set(estadoFiscal({ bloqueo: { codigo: '0102', motivo: 'x', fecha: 'x' } }));
    resumenPedidos.next({ pendientes: 1, pagados: 0, total: 1 });
    servicio.iniciar();
    http.expectNone(() => true);
    expect(servicio.items()).toEqual([]);
    expect(servicio.noVistos()).toBe(0);
    expect(fiscalIniciar).not.toHaveBeenCalled();

    servicio.detener();
    TestBed.resetTestingModule();
    estado.set(null);
    resumenPedidos.next(null);
    montar(['admin']);
    servicio.iniciar();
    http.expectOne(urlConstants.comprobante.monitorAtencion).flush('x', { status: 500, statusText: 'Error' });
    http.expectOne(urlConstants.inventario.resumen).flush('x', { status: 500, statusText: 'Error' });
    http.expectOne((r) => r.url === urlConstants.credito.cuentas).flush('x', { status: 500, statusText: 'Error' });
    http.expectOne(urlConstants.caja.sesion).flush('x', { status: 500, statusText: 'Error' });
    expect(servicio.sinLectura()).toBe(true);
    expect(servicio.items()).toEqual([]);
  });
});
