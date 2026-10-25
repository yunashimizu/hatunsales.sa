import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NEVER, of, throwError } from 'rxjs';

import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { ComprobanteFila } from '../../../models/admin.models';
import { ComprobanteService } from '../../../service/comprobante.service';
import { FiscalEstadoService } from '../../../service/fiscal-estado.service';
import { ReceptorService } from '../../../service/receptor.service';
import { DocComponent } from './doc.component';

function fila(cambios: Partial<ComprobanteFila> = {}): ComprobanteFila {
  return {
    id_comprobante: 10,
    id_tipo: 1,
    tipo_nombre: 'FACTURA ELECTRONICA',
    serie: 'FB01',
    numero: 12,
    numero_formateado: 'FB01-00000012',
    fecha_de_emision: '20-10-2026',
    creado_en: '2026-10-20T15:00:00.000Z',
    cliente_numero_doc: '20100000001',
    cliente_denominacion: 'ACME SAC',
    moneda_simbolo: 'S/',
    total: 100,
    estado: 'aceptado',
    aceptada_sunat: true,
    anulado: false,
    proveedor_fiscal: 'sunat_directo',
    ambiente_fiscal: 'beta',
    estado_sunat: 'ACEPTADO',
    id_venta: 33,
    puede_reintentar: false,
    puede_recuperar_cdr: false,
    puede_confirmar_manual: false,
    puede_nota_credito: true,
    puede_anular: true,
    ...cambios,
  };
}

const HISTORICA = fila({
  id_comprobante: 11,
  numero_formateado: 'FFF1-00000003',
  proveedor_fiscal: null,
  ambiente_fiscal: null,
  estado_sunat: null,
  estado: 'error',
  aceptada_sunat: false,
  error_mensaje: 'El comprobante no llegó a SUNAT',
  id_venta: null,
  puede_nota_credito: false,
});

describe('DocComponent', () => {
  let roles: string[];
  const api = {
    listar: vi.fn(() => of({ datos: [fila(), HISTORICA], total: 2, pagina: 1, por_pagina: 20 })),
    monitorAtencion: vi.fn(() => of({ pendientes: 0, errores: 0, total: 0 })),
    detalle: vi.fn(() => NEVER),
    contextoNotaCredito: vi.fn(() => NEVER),
    ventasSinComprobante: vi.fn(() => of({ datos: [], total: 0, pagina: 1, por_pagina: 20 })),
    descargarPdf: vi.fn(),
  };
  const alerta = { toast: vi.fn(), error: vi.fn() };

  async function abrir(url = '/doc'): Promise<{ harness: RouterTestingHarness; component: DocComponent }> {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(url, DocComponent);
    harness.detectChanges();
    return { harness, component };
  }

  function etiquetas(harness: RouterTestingHarness): string[] {
    return Array.from(harness.routeNativeElement!.querySelectorAll('tbody button[aria-label]')).map(
      (b) => b.getAttribute('aria-label') ?? '',
    );
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    roles = ['admin'];
    api.listar.mockImplementation(() => of({ datos: [fila(), HISTORICA], total: 2, pagina: 1, por_pagina: 20 }));
    api.monitorAtencion.mockImplementation(() => of({ pendientes: 0, errores: 0, total: 0 }));
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'doc', component: DocComponent }]),
        { provide: ComprobanteService, useValue: api },
        { provide: AlertService, useValue: alerta },
        { provide: AuthService, useValue: { puedeVer: (permitidos: string[]) => permitidos.some((r) => roles.includes(r)) } },
        { provide: FiscalEstadoService, useValue: { estado: signal(null), iniciar: vi.fn() } },
        { provide: ReceptorService, useValue: { buscar: vi.fn() } },
      ],
    }).compileComponents();
  });

  it('lista con el estado SUNAT y el ambiente en palabras y el enlace a los documentos de la venta', async () => {
    const { harness } = await abrir();
    const filas = harness.routeNativeElement!.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>;
    expect(filas.length).toBe(2);
    const estado = filas[0].querySelector('[data-etiqueta="Estado en SUNAT"]')!.textContent ?? '';
    expect(estado).toContain('Aceptado por SUNAT');
    expect(estado).toContain('Prueba BETA - sin validez');
    expect(filas[0].querySelector('[data-etiqueta="Venta"] a')?.getAttribute('href')).toBe(
      '/dashboard/mantenimiento/ventas-historial?venta=33',
    );
    const historica = filas[1].querySelector('[data-etiqueta="Estado en SUNAT"]')!.textContent ?? '';
    expect(historica).toContain('Sistema anterior');
    expect(historica).toContain('El comprobante no llegó a SUNAT');
    expect(filas[1].querySelector('[data-etiqueta="Venta"]')?.textContent).toContain('Sin venta');
  });

  it('manda al backend los filtros de estado SUNAT, ambiente y situación', async () => {
    const { harness, component } = await abrir();
    component.filtro.estado_sunat = 'RECHAZADO';
    component.filtro.ambiente = 'beta';
    component.cargar(1);
    expect(api.listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado_sunat: 'RECHAZADO', ambiente: 'beta', pagina: 1, por_pagina: 20 }),
    );

    const chip = Array.from(harness.routeNativeElement!.querySelectorAll('.adm-chip') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Con error'))!;
    chip.click();
    expect(api.listar).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'error', estado_sunat: 'RECHAZADO' }));
  });

  it('ofrece en cada fila solo las acciones de sus flags y del rol', async () => {
    roles = ['vendedor'];
    api.listar.mockReturnValue(of({ datos: [fila({ puede_reintentar: true })], total: 1, pagina: 1, por_pagina: 20 }));
    const { harness, component } = await abrir();
    const acciones = etiquetas(harness);
    expect(acciones).toContain('Reintentar el envío de FB01-00000012 a SUNAT');
    expect(acciones).toContain('Emitir una nota de crédito sobre FB01-00000012');
    // Anular y confirmar aceptado son solo de admin.
    expect(acciones.some((a) => a.startsWith('Anular'))).toBe(false);

    const reintentar = harness.routeNativeElement!.querySelector(
      'button[aria-label="Reintentar el envío de FB01-00000012 a SUNAT"]',
    ) as HTMLButtonElement;
    reintentar.click();
    harness.detectChanges();
    expect(component.idDetalle).toBe(10);
    expect(component.accionDetalle).toBe('reintentar');
    expect(api.detalle).toHaveBeenCalledWith(10);
  });

  it('enlaces profundos: abre el detalle, el asistente o la pestaña, y al cerrar limpia la URL', async () => {
    const { harness, component } = await abrir('/doc?comprobante=5');
    expect(component.idDetalle).toBe(5);
    expect(api.detalle).toHaveBeenCalledWith(5);
    component.cerrarDetalle();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/doc');
    expect(component.idDetalle).toBeNull();

    await harness.navigateByUrl('/doc?nota_credito=7');
    expect(component.idAsistente).toBe(7);
    expect(api.contextoNotaCredito).toHaveBeenCalledWith(7);
    component.cerrarAsistente();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/doc');

    await harness.navigateByUrl('/doc?pestana=sin-comprobante');
    expect(component.pestana).toBe('sin-comprobante');
    expect(api.ventasSinComprobante).toHaveBeenCalled();

    await harness.navigateByUrl('/doc?comprobante=abc');
    await harness.fixture.whenStable();
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Enlace no válido' }));
    expect(TestBed.inject(Router).url).toBe('/doc');
  });

  it('conserva los contadores y muestra el error si falla el monitor, y se recupera al reintentar', async () => {
    const { component } = await abrir();
    component.atencion = { pendientes: 2, errores: 1, total: 3 };
    api.monitorAtencion
      .mockReturnValueOnce(throwError(() => ({ error: { message: 'Servicio no disponible' }, status: 503 })))
      .mockReturnValueOnce(of({ pendientes: 4, errores: 2, total: 6 }));

    component.cargarMonitor();
    expect(component.atencion).toEqual({ pendientes: 2, errores: 1, total: 3 });
    expect(component.errorMonitor).toBe('Servicio no disponible');

    component.cargarMonitor();
    expect(component.atencion).toEqual({ pendientes: 4, errores: 2, total: 6 });
    expect(component.errorMonitor).toBe('');
  });

  it('si falla la lista lo dice con la opción de reintentar', async () => {
    api.listar.mockReturnValueOnce(throwError(() => ({ status: 500, error: { message: 'Internal server error' } })));
    const { harness } = await abrir();
    const aviso = harness.routeNativeElement!.querySelector('[role="alert"]') as HTMLElement;
    expect(aviso.textContent).toContain('No se pudieron cargar los documentos');
    (aviso.querySelector('button') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelectorAll('tbody tr').length).toBe(2);
  });
});
