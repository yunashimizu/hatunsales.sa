import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AlertService } from '../../../../../shared/services/alert.service';
import { TIPO_BOLETA, TIPO_FACTURA } from '../../../../models/admin.models';
import { ResultadoEmisionVenta, VentaSinComprobante } from '../../../../models/documentos.models';
import { EstadoFiscalGlobal } from '../../../../models/fiscal.models';
import { ComprobanteService } from '../../../../service/comprobante.service';
import { FiscalEstadoService } from '../../../../service/fiscal-estado.service';
import { ReceptorService } from '../../../../service/receptor.service';
import { SeguimientoComprobanteService } from '../../../../service/seguimiento-comprobante.service';
import { VentasSinComprobanteComponent } from './ventas-sin-comprobante.component';

const VENTA_EMPRESA: VentaSinComprobante = {
  id_venta: 33,
  fecha: '2026-10-24T18:30:00-05:00',
  total: 59,
  cliente: 'ACME SAC',
  documento_cliente: '20100000001',
  ultimo_error: 'No se emitió el comprobante: la emisión electrónica no está activa (POS BETA apagado).',
};

const VENTA_PERSONA: VentaSinComprobante = {
  id_venta: 34,
  fecha: '2026-10-24T19:00:00-05:00',
  total: 25,
  cliente: 'JUAN PEREZ',
  documento_cliente: '45678912',
  ultimo_error: null,
};

describe('VentasSinComprobanteComponent', () => {
  let fixture: ComponentFixture<VentasSinComprobanteComponent>;
  let component: VentasSinComprobanteComponent;
  let estadoFiscal: ReturnType<typeof signal<EstadoFiscalGlobal | null>>;
  const pagina = (datos: VentaSinComprobante[]) => of({ datos, total: datos.length, pagina: 1, por_pagina: 20 });
  const alerta = { error: vi.fn(), toast: vi.fn(), confirmar: vi.fn(async (_config: { title?: string; message?: string }): Promise<boolean> => true) };
  const api = {
    ventasSinComprobante: vi.fn(() => pagina([VENTA_EMPRESA, VENTA_PERSONA])),
    emitirComprobanteDeVenta: vi.fn(),
    descargarPdf: vi.fn(),
  };

  const seguimiento = { seguir: vi.fn() };

  function texto(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    alerta.confirmar.mockResolvedValue(true);
    api.ventasSinComprobante.mockImplementation(() => pagina([VENTA_EMPRESA, VENTA_PERSONA]));
    estadoFiscal = signal<EstadoFiscalGlobal | null>({ ambiente: 'beta', emision_activa: true } as EstadoFiscalGlobal);
    await TestBed.configureTestingModule({
      imports: [VentasSinComprobanteComponent],
      providers: [
        provideRouter([]),
        { provide: ComprobanteService, useValue: api },
        { provide: ReceptorService, useValue: { buscar: vi.fn() } },
        { provide: SeguimientoComprobanteService, useValue: seguimiento },
        { provide: AlertService, useValue: alerta },
        { provide: FiscalEstadoService, useValue: { estado: estadoFiscal, iniciar: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(VentasSinComprobanteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('lista las ventas sin comprobante con su motivo y el acceso a sus documentos', () => {
    expect(api.ventasSinComprobante).toHaveBeenCalledWith(expect.objectContaining({ pagina: 1, por_pagina: 20 }));
    const filas = fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>;
    expect(filas.length).toBe(2);
    expect(filas[0].textContent).toContain('#33');
    expect(filas[0].textContent).toContain('24/10/2026 18:30');
    expect(filas[0].textContent).toContain('POS BETA apagado');
    expect(filas[1].textContent).toContain('Sin detalle registrado');
    expect(filas[0].querySelector('a')?.getAttribute('href')).toBe('/dashboard/mantenimiento/ventas-historial?venta=33');
  });

  it('un rango de fechas imposible se avisa sin consultar al servidor', () => {
    component.filtro = { desde: '2026-10-25', hasta: '2026-10-20' };
    component.cargar(1);
    fixture.detectChanges();
    expect(api.ventasSinComprobante).toHaveBeenCalledTimes(1);
    const aviso = fixture.nativeElement.querySelector('#vsc-error-fechas') as HTMLElement;
    expect(aviso.getAttribute('role')).toBe('alert');
    expect(aviso.textContent).toContain('La fecha «desde» no puede ser posterior a «hasta».');
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(0);

    component.filtro = { desde: '2026-10-20', hasta: '2026-10-25' };
    component.cargar(1);
    expect(api.ventasSinComprobante).toHaveBeenLastCalledWith(
      expect.objectContaining({ desde: '2026-10-20', hasta: '2026-10-25', pagina: 1 }),
    );
  });

  it('si el servidor publicado todavía no tiene la consulta lo explica en palabras, sin el texto técnico', () => {
    // Un backend sin esta ruta la toma por GET /venta/:id con id «sin-comprobante».
    api.ventasSinComprobante.mockReturnValueOnce(
      throwError(() => ({
        status: 400,
        error: { message: 'Un dato no tiene el formato esperado (por ejemplo, un número…).', codigo: 'DATO_INVALIDO' },
      })),
    );
    component.cargar(1);
    fixture.detectChanges();
    const aviso = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(aviso.textContent).toContain('El servidor todavía no tiene esta consulta');
    expect(aviso.textContent).not.toContain('formato esperado');

    api.ventasSinComprobante.mockReturnValueOnce(
      throwError(() => ({ status: 500, error: { message: 'Ocurrió un error interno.', codigo: 'ERROR_SERVIDOR' } })),
    );
    component.cargar(1);
    fixture.detectChanges();
    expect(texto()).not.toContain('El servidor todavía no tiene esta consulta');
    expect(texto()).toContain('No se pudieron cargar las ventas sin comprobante');
  });

  it('emite el comprobante a SUNAT y muestra en el acto su resultado con los PDF', async () => {
    const respuesta: ResultadoEmisionVenta = {
      id_venta: 33,
      total: 59,
      cliente_denominacion: 'ACME SAC',
      comprobante: {
        id_comprobante: 90,
        numero_formateado: 'FB01-00000013',
        estado: 'emitido',
        estado_sunat: 'ACEPTADO',
        aceptada_sunat: true,
        ambiente_fiscal: 'beta',
        aviso: 'Prueba SUNAT BETA: sin validez tributaria.',
      },
    };
    api.emitirComprobanteDeVenta.mockReturnValue(of(respuesta));
    const emitidos: ResultadoEmisionVenta[] = [];
    component.emitido.subscribe((r) => emitidos.push(r));

    component.abrirEmision(VENTA_EMPRESA);
    fixture.detectChanges();
    // Con RUC, la factura viene elegida.
    expect(component.formulario.id_tipo).toBe(TIPO_FACTURA);
    expect(texto()).toContain('Se emitirá en SUNAT BETA');
    await component.emitir();
    fixture.detectChanges();

    expect(api.emitirComprobanteDeVenta).toHaveBeenCalledWith(33, { id_tipo: TIPO_FACTURA, documento: '20100000001' });
    expect(emitidos).toEqual([respuesta]);
    expect(texto()).toContain('Aceptado por SUNAT');
    expect(texto()).toContain('FB01-00000013');
    expect(texto()).toContain('Prueba SUNAT BETA - sin validez tributaria');
    expect(texto()).toContain('Ticket 80 mm');
    expect(api.ventasSinComprobante).toHaveBeenCalledTimes(2);
  });

  it('con el envío en segundo plano sigue el comprobante hasta que SUNAT conteste; por resumen o ya aceptado, no', async () => {
    const emitirCon = async (comprobante: ResultadoEmisionVenta['comprobante']) => {
      api.emitirComprobanteDeVenta.mockReturnValue(of({ id_venta: 33, total: 59, cliente_denominacion: 'ACME SAC', comprobante }));
      component.abrirEmision(VENTA_EMPRESA);
      fixture.detectChanges();
      await component.emitir();
    };

    await emitirCon({ id_comprobante: 91, numero_formateado: 'FB01-00000014', estado: 'pendiente', estado_sunat: 'ENVIANDO', aceptada_sunat: false, envio_diferido: true });
    expect(seguimiento.seguir).toHaveBeenCalledTimes(1);
    expect(seguimiento.seguir).toHaveBeenCalledWith(91, 'FB01-00000014');

    await emitirCon({ id_comprobante: 92, numero_formateado: 'B001-00000015', estado: 'pendiente', estado_sunat: 'POR_RESUMIR', aceptada_sunat: false, envio_diferido: true, por_resumen: true });
    await emitirCon({ id_comprobante: 93, numero_formateado: 'FB01-00000016', estado: 'emitido', estado_sunat: 'ACEPTADO', aceptada_sunat: true });
    expect(seguimiento.seguir).toHaveBeenCalledTimes(1);
  });

  it('si SUNAT todavía no confirma, el resultado habla con el glosario («SUNAT lo está procesando»), sin ticket ni CDR', async () => {
    api.emitirComprobanteDeVenta.mockReturnValue(
      of({
        id_venta: 33,
        total: 59,
        cliente_denominacion: 'ACME SAC',
        comprobante: { id_comprobante: 91, numero_formateado: 'B001-00000020', estado: 'pendiente', estado_sunat: 'TICKET_PENDIENTE', aceptada_sunat: false, ambiente_fiscal: 'produccion' },
      } as ResultadoEmisionVenta),
    );
    component.abrirEmision(VENTA_PERSONA);
    fixture.detectChanges();
    await component.emitir();
    fixture.detectChanges();

    expect(texto()).toContain('SUNAT lo está procesando');
    expect(texto()).toContain('B001-00000020');
    expect(texto()).not.toMatch(/\bCDR\b/);
    expect(texto()).not.toMatch(/Ticket pendiente/);
  });

  it('una emisión que queda «Por reenviar» (SUNAT ya la tenía) dice que no se reenvíe y habla de la «constancia de SUNAT»', async () => {
    api.emitirComprobanteDeVenta.mockReturnValue(
      of({
        id_venta: 33,
        total: 59,
        cliente_denominacion: 'ACME SAC',
        comprobante: { id_comprobante: 92, numero_formateado: 'F001-00000021', estado: 'pendiente', estado_sunat: 'PENDIENTE_REENVIO', accion_sunat: 'RECUPERAR_CDR', aceptada_sunat: false, ambiente_fiscal: 'produccion' },
      } as ResultadoEmisionVenta),
    );
    component.abrirEmision(VENTA_EMPRESA);
    fixture.detectChanges();
    await component.emitir();
    fixture.detectChanges();

    expect(texto()).toContain('no lo reenvíe');
    expect(texto()).toContain('constancia de SUNAT');
    expect(texto()).not.toMatch(/\bCDR\b/);
  });

  it('avisa antes de emitir que la emisión está detenida y no deja enviar; una factura exige RUC', async () => {
    estadoFiscal.set({ ambiente: 'beta', emision_activa: false, motivo: 'El POS BETA está apagado.' } as EstadoFiscalGlobal);
    component.abrirEmision(VENTA_EMPRESA);
    fixture.detectChanges();
    expect(texto()).toContain('El POS BETA está apagado.');
    const emitir = Array.from(fixture.nativeElement.querySelectorAll('.adm-modal__pie button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('a SUNAT'))!;
    expect(emitir.disabled).toBe(true);
    await component.emitir();
    expect(api.emitirComprobanteDeVenta).not.toHaveBeenCalled();
    expect(alerta.confirmar).not.toHaveBeenCalled();

    estadoFiscal.set({ ambiente: 'beta', emision_activa: true } as EstadoFiscalGlobal);
    component.abrirEmision(VENTA_PERSONA);
    expect(component.formulario.id_tipo).toBe(TIPO_BOLETA);
    component.elegirTipo(TIPO_FACTURA);
    expect(component.errorFormulario).toContain('solo se emite a un RUC');
    await component.emitir();
    expect(api.emitirComprobanteDeVenta).not.toHaveBeenCalled();
    expect(alerta.confirmar).not.toHaveBeenCalled();
  });

  it('antes de gastar un número real pide confirmación (con el tipo, el total y el ambiente) y, si se cancela, no envía nada', async () => {
    api.emitirComprobanteDeVenta.mockReturnValue(of({ id_venta: 34, total: 25, cliente_denominacion: 'JUAN PEREZ' }));
    component.abrirEmision(VENTA_PERSONA);
    alerta.confirmar.mockResolvedValueOnce(false);

    await component.emitir();

    expect(alerta.confirmar).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '¿Emitir la boleta de la venta #34?',
        message: expect.stringContaining('por S/ 25.00 y se enviará a SUNAT BETA (pruebas, sin validez tributaria)'),
        confirmText: 'Sí, emitir boleta',
      }),
    );
    expect(alerta.confirmar.mock.calls[0][0]?.message).toContain('no se puede deshacer');
    expect(api.emitirComprobanteDeVenta).not.toHaveBeenCalled();
    expect(component.emitiendo).toBe(false);

    await component.emitir();
    expect(api.emitirComprobanteDeVenta).toHaveBeenCalledWith(34, { id_tipo: TIPO_BOLETA, documento: '45678912' });
  });

  it('en producción la confirmación no habla de pruebas', async () => {
    estadoFiscal.set({ ambiente: 'produccion', emision_activa: true } as EstadoFiscalGlobal);
    api.emitirComprobanteDeVenta.mockReturnValue(of({ id_venta: 33, total: 59, cliente_denominacion: 'ACME SAC' }));
    component.abrirEmision(VENTA_EMPRESA);

    await component.emitir();

    const mensaje = alerta.confirmar.mock.calls[0][0]?.message ?? '';
    expect(mensaje).toContain('se enviará a SUNAT. Consume el siguiente número');
    expect(mensaje).not.toContain('BETA');
  });

  it('si la venta sigue sin comprobante muestra el motivo, y ante un 409 ofrece abrir el que ya tiene', async () => {
    api.emitirComprobanteDeVenta.mockReturnValueOnce(
      of({ id_venta: 34, total: 25, cliente_denominacion: 'JUAN PEREZ', comprobante_error: 'SUNAT no responde en este momento.' }),
    );
    component.abrirEmision(VENTA_PERSONA);
    await component.emitir();
    fixture.detectChanges();
    expect(texto()).toContain('La venta sigue sin comprobante');
    expect(texto()).toContain('SUNAT no responde en este momento.');

    api.emitirComprobanteDeVenta.mockReturnValueOnce(
      throwError(() => ({
        status: 409,
        error: { message: 'La venta 34 ya tiene el comprobante BB01-00000007.', codigo: 'VENTA_CON_COMPROBANTE', id_comprobante: 91 },
      })),
    );
    const abiertos: number[] = [];
    component.verComprobante.subscribe((id) => abiertos.push(id));
    await component.emitir();
    fixture.detectChanges();
    expect(texto()).toContain('La venta 34 ya tiene el comprobante BB01-00000007.');
    const ver = Array.from(fixture.nativeElement.querySelectorAll('.adm-modal button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Ver el comprobante de la venta'))!;
    ver.click();
    expect(abiertos).toEqual([91]);
    expect(component.venta).toBeNull();
  });
});
