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
  const api = {
    ventasSinComprobante: vi.fn(() => pagina([VENTA_EMPRESA, VENTA_PERSONA])),
    emitirComprobanteDeVenta: vi.fn(),
    descargarPdf: vi.fn(),
  };

  function texto(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    api.ventasSinComprobante.mockImplementation(() => pagina([VENTA_EMPRESA, VENTA_PERSONA]));
    estadoFiscal = signal<EstadoFiscalGlobal | null>({ ambiente: 'beta', emision_activa: true } as EstadoFiscalGlobal);
    await TestBed.configureTestingModule({
      imports: [VentasSinComprobanteComponent],
      providers: [
        provideRouter([]),
        { provide: ComprobanteService, useValue: api },
        { provide: ReceptorService, useValue: { buscar: vi.fn() } },
        { provide: AlertService, useValue: { error: vi.fn(), toast: vi.fn() } },
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

  it('emite el comprobante a SUNAT y muestra en el acto su resultado con los PDF', () => {
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
    component.emitir();
    fixture.detectChanges();

    expect(api.emitirComprobanteDeVenta).toHaveBeenCalledWith(33, { id_tipo: TIPO_FACTURA, documento: '20100000001' });
    expect(emitidos).toEqual([respuesta]);
    expect(texto()).toContain('Aceptado por SUNAT');
    expect(texto()).toContain('FB01-00000013');
    expect(texto()).toContain('Prueba SUNAT BETA - sin validez tributaria');
    expect(texto()).toContain('Ticket 80 mm');
    expect(api.ventasSinComprobante).toHaveBeenCalledTimes(2);
  });

  it('avisa antes de emitir que la emisión está detenida y no deja enviar; una factura exige RUC', () => {
    estadoFiscal.set({ ambiente: 'beta', emision_activa: false, motivo: 'El POS BETA está apagado.' } as EstadoFiscalGlobal);
    component.abrirEmision(VENTA_EMPRESA);
    fixture.detectChanges();
    expect(texto()).toContain('El POS BETA está apagado.');
    const emitir = Array.from(fixture.nativeElement.querySelectorAll('.adm-modal__pie button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('a SUNAT'))!;
    expect(emitir.disabled).toBe(true);
    component.emitir();
    expect(api.emitirComprobanteDeVenta).not.toHaveBeenCalled();

    estadoFiscal.set({ ambiente: 'beta', emision_activa: true } as EstadoFiscalGlobal);
    component.abrirEmision(VENTA_PERSONA);
    expect(component.formulario.id_tipo).toBe(TIPO_BOLETA);
    component.elegirTipo(TIPO_FACTURA);
    expect(component.errorFormulario).toContain('solo se emite a un RUC');
    component.emitir();
    expect(api.emitirComprobanteDeVenta).not.toHaveBeenCalled();
  });

  it('si la venta sigue sin comprobante muestra el motivo, y ante un 409 ofrece abrir el que ya tiene', () => {
    api.emitirComprobanteDeVenta.mockReturnValueOnce(
      of({ id_venta: 34, total: 25, cliente_denominacion: 'JUAN PEREZ', comprobante_error: 'SUNAT no responde en este momento.' }),
    );
    component.abrirEmision(VENTA_PERSONA);
    component.emitir();
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
    component.emitir();
    fixture.detectChanges();
    expect(texto()).toContain('La venta 34 ya tiene el comprobante BB01-00000007.');
    const ver = Array.from(fixture.nativeElement.querySelectorAll('.adm-modal button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Ver el comprobante de la venta'))!;
    ver.click();
    expect(abiertos).toEqual([91]);
    expect(component.venta).toBeNull();
  });
});
