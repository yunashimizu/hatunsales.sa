import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../auth/service/auth.service';
import { EstadoFiscalGlobal } from '../models/fiscal.models';
import { AvisosPanelService, CLAVE_AVISOS_VISTOS } from './avisos-panel.service';
import { CajaSesionService } from './caja-sesion.service';
import { ComprobanteService } from './comprobante.service';
import { CreditoAdminService } from './credito-admin.service';
import { FiscalEstadoService } from './fiscal-estado.service';
import { InventarioAdminService } from './inventario-admin.service';
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
  const monitorAtencion = vi.fn();
  const resumenInventario = vi.fn();
  const vencidasResumen = vi.fn();
  const sesionCaja = vi.fn();
  let servicio: AvisosPanelService;

  function montar(roles: string[]): void {
    rolesPermitidos = roles;
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { puedeVer: (r: string[]) => r.some((x) => rolesPermitidos.includes(x)) } },
        { provide: FiscalEstadoService, useValue: { estado, iniciar: fiscalIniciar } },
        { provide: PedidoAdminService, useValue: { resumen: resumenPedidos.asObservable() } },
        { provide: ComprobanteService, useValue: { monitorAtencion } },
        { provide: InventarioAdminService, useValue: { resumen: resumenInventario } },
        { provide: CreditoAdminService, useValue: { vencidasResumen } },
        { provide: CajaSesionService, useValue: { sesion: sesionCaja } },
      ],
    });
    servicio = TestBed.inject(AvisosPanelService);
  }

  type Datos = { cpe?: object; inv?: object; cxc?: object; caja?: object };

  /** Fija lo que devolverán los cuatro servicios (por defecto, todo en orden). */
  function fijar(datos: Datos = {}): void {
    monitorAtencion.mockImplementation(() => of(datos.cpe ?? { pendientes: 0, errores: 0, total: 0 }));
    resumenInventario.mockImplementation(() => of(datos.inv ?? { sin_stock: 0, bajo_stock: 0 }));
    vencidasResumen.mockImplementation(() => of(datos.cxc ?? { cuentas: 0, total: 0 }));
    sesionCaja.mockImplementation(() => of(datos.caja ?? { abierta: true }));
  }

  /** Hace fallar los cuatro servicios. */
  function fijarFallo(): void {
    const falla = (): Observable<never> => throwError(() => new Error('x'));
    for (const doble of [monitorAtencion, resumenInventario, vencidasResumen, sesionCaja]) doble.mockImplementation(falla);
  }

  beforeEach(() => {
    localStorage.clear();
    estado.set(null);
    resumenPedidos.next(null);
    fiscalIniciar.mockClear();
    for (const doble of [monitorAtencion, resumenInventario, vencidasResumen, sesionCaja]) doble.mockReset();
    fijar();
  });

  afterEach(() => {
    servicio.detener();
    localStorage.clear();
  });

  it('compone los avisos según el rol: el administrador ve todo, graves primero', () => {
    montar(['admin']);
    estado.set(estadoFiscal({ certificado: { cargado: true, dias_para_vencer: 12, vencido: false, autofirmado: false } }));
    resumenPedidos.next({ pendientes: 1, pagados: 2, total: 3 });
    const hora = vi
      .spyOn(AvisosPanelService.prototype as unknown as { ahora(): Date }, 'ahora')
      .mockReturnValue(new Date('2026-11-08T17:00:00Z')); // 12:00 en Lima
    fijar({
      cpe: { pendientes: 2, errores: 1, total: 3 },
      inv: { sin_stock: 4, bajo_stock: 7 },
      cxc: { cuentas: 2, total: 150.5 },
      caja: { abierta: false },
    });
    servicio.iniciar();
    hora.mockRestore();
    // Las lecturas de la campana salen como silenciosas.
    expect(monitorAtencion).toHaveBeenCalledWith({ silenciosa: true });
    expect(resumenInventario).toHaveBeenCalledWith({ silenciosa: true });
    expect(vencidasResumen).toHaveBeenCalledWith({ silenciosa: true });
    expect(sesionCaja).toHaveBeenCalledWith({ silenciosa: true });

    const claves = servicio.items().map((a) => a.clave);
    expect(claves).toEqual(
      expect.arrayContaining(['cpe-error', 'cpe-pendiente', 'stock-cero', 'stock-bajo', 'cxc-vencidas', 'pedidos-web', 'fiscal-cert', 'caja-cerrada']),
    );
    // Los graves (rojo) van antes que los de aviso y estos antes que los informativos.
    const tonos = servicio.items().map((a) => a.tono);
    expect(tonos.indexOf('aviso')).toBeGreaterThan(tonos.lastIndexOf('peligro'));
    expect(tonos.indexOf('info')).toBeGreaterThan(tonos.lastIndexOf('aviso'));
    expect(servicio.hayPeligro()).toBe(true);
    expect(servicio.items().find((a) => a.clave === 'cxc-vencidas')?.detalle).toBe('S/ 150.50 por cobrar');
    expect(servicio.items().find((a) => a.clave === 'pedidos-web')?.detalle).toBe('2 pagados, a preparar · 1 por cobrar');
    expect(servicio.items().find((a) => a.clave === 'fiscal-cert')?.ruta).toBe('/dashboard/facturacion-sunat');
    expect(fiscalIniciar).toHaveBeenCalled();
    expect(servicio.actualizadoEn()).not.toBeNull();
  });

  it('un rol de solo consulta pide únicamente el stock y no ve lo demás', () => {
    montar(['consulta']);
    estado.set(estadoFiscal({ bloqueo: { codigo: '0102', motivo: 'Clave SOL incorrecta', fecha: '2026-11-08' } }));
    resumenPedidos.next({ pendientes: 0, pagados: 1, total: 1 });
    fijar({ inv: { sin_stock: 0, bajo_stock: 3 } });
    servicio.iniciar();
    expect(monitorAtencion).not.toHaveBeenCalled();
    expect(vencidasResumen).not.toHaveBeenCalled();
    expect(sesionCaja).not.toHaveBeenCalled();
    expect(resumenInventario).toHaveBeenCalledTimes(1);

    expect(servicio.items().map((a) => a.clave)).toEqual(['stock-bajo']);
    expect(servicio.items()[0].ruta).toBe('/dashboard/mantenimiento/stock');
  });

  it('no vistos cambia cuando varía la cifra de un aviso y marcarVistos lo deja en 0', () => {
    montar(['admin']);
    fijar({ inv: { sin_stock: 2, bajo_stock: 0 }, cpe: { errores: 1, pendientes: 0 } });
    servicio.iniciar();
    expect(servicio.noVistos()).toBe(2);

    servicio.marcarVistos();
    expect(servicio.noVistos()).toBe(0);
    expect(JSON.parse(localStorage.getItem(CLAVE_AVISOS_VISTOS) ?? '{}')).toEqual({ 'stock-cero': 2, 'cpe-error': 1 });

    // Otra lectura con la misma cifra no vuelve a llamar la atención; con una distinta, sí.
    fijar({ inv: { sin_stock: 2, bajo_stock: 0 }, cpe: { errores: 3, pendientes: 0 } });
    servicio.refrescar();
    expect(servicio.noVistos()).toBe(1);
    servicio.marcarVistos();
    expect(servicio.noVistos()).toBe(0);
  });

  it('sin rol no pide nada ni muestra avisos, y si todas las lecturas fallan lo dice', () => {
    montar([]);
    estado.set(estadoFiscal({ bloqueo: { codigo: '0102', motivo: 'x', fecha: 'x' } }));
    resumenPedidos.next({ pendientes: 1, pagados: 0, total: 1 });
    servicio.iniciar();
    expect(monitorAtencion).not.toHaveBeenCalled();
    expect(resumenInventario).not.toHaveBeenCalled();
    expect(vencidasResumen).not.toHaveBeenCalled();
    expect(sesionCaja).not.toHaveBeenCalled();
    expect(servicio.items()).toEqual([]);
    expect(servicio.noVistos()).toBe(0);
    expect(fiscalIniciar).not.toHaveBeenCalled();

    servicio.detener();
    TestBed.resetTestingModule();
    estado.set(null);
    resumenPedidos.next(null);
    montar(['admin']);
    fijarFallo();
    servicio.iniciar();
    expect(servicio.sinLectura()).toBe(true);
    expect(servicio.items()).toEqual([]);
  });
});
