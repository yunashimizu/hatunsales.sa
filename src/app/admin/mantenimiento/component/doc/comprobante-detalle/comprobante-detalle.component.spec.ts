import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { AuthService } from '../../../../../auth/service/auth.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { ComprobanteDetalle } from '../../../../models/documentos.models';
import { EstadoFiscalGlobal } from '../../../../models/fiscal.models';
import { ComprobanteService } from '../../../../service/comprobante.service';
import { FiscalEstadoService } from '../../../../service/fiscal-estado.service';
import { ComprobanteDetalleComponent } from './comprobante-detalle.component';

function detalle(cambios: Partial<ComprobanteDetalle> = {}): ComprobanteDetalle {
  return {
    emisor: {
      ruc: '20614736420', razon_social: 'EMPRESA DE PRUEBAS BETA', direccion: 'Av. Siempre Viva 123',
      ubicacion: 'LIMA - LIMA - LIMA', logo_url: '',
    },
    id_comprobante: 10,
    id_tipo: 1,
    tipo_nombre: 'FACTURA ELECTRONICA',
    serie: 'FB01',
    numero: 12,
    numero_formateado: 'FB01-00000012',
    fecha_de_emision: '20-10-2026',
    fecha_de_vencimiento: '20-10-2026',
    hora_emision: '10:15:00',
    moneda: { id_moneda: 1, nombre: 'Soles', simbolo: 'S/' },
    receptor: { tipo_documento: 6, numero_documento: '20100000001', denominacion: 'ACME SAC', direccion: 'Jr. Lima 1', email: '' },
    items: [{
      codigo: 'P5', unidad_de_medida: 'NIU', descripcion: 'Martillo', cantidad: 2, valor_unitario: 42.37,
      precio_unitario: 50, descuento: 0, subtotal: 84.75, igv: 15.25, total: 100, tipo_de_igv: 1,
    }],
    porcentaje_igv: 18,
    totales: { gravada: 84.75, exonerada: 0, inafecta: 0, descuento: 0, igv: 15.25, total: 100 },
    importe_en_letras: 'CIEN CON 00/100 SOLES',
    observaciones: '',
    estado: 'aceptado',
    anulado: false,
    motivo_anulacion: '',
    enlace: '',
    enlace_pdf: '',
    cadena_qr: '20614736420|01|FB01|12|15.25|100.00|2026-10-20|6|20100000001|',
    codigo_hash: 'qnVeDFwT6o4bZ3hBOK1bJ2Zl0QY=',
    sunat_description: 'La Factura numero FB01-12, ha sido aceptada',
    sunat_responsecode: '0',
    sunat_observaciones: [],
    error_mensaje: '',
    proveedor_fiscal: 'sunat_directo',
    ambiente_fiscal: 'beta',
    estado_sunat: 'ACEPTADO',
    aceptada_sunat: true,
    id_envio_ultimo: 4,
    id_venta: 33,
    forma_pago: 'Contado',
    cuotas: [],
    fecha_limite_envio: '2026-10-23',
    vencido: false,
    envio: { id_envio: 4, estado: 'ACEPTADO', codigo: '0', mensaje: 'Aceptada', accion: 'NINGUNA', intento: 1 },
    referencia: null,
    notas: [{
      id_comprobante: 20, id_tipo: 7, serie: 'FBC1', numero: 1, numero_formateado: 'FBC1-00000001', motivo: '07',
      total: 50, estado: 'aceptado', estado_sunat: 'ACEPTADO', anulado: false,
    }],
    guias: [{ id_guia: 4, serie: 'T001', numero: 3, numero_formateado: 'T001-00000003', estado: 'aceptado', fecha_emision: '2026-10-21' }],
    archivos: ['xml_firmado', 'zip', 'cdr_xml'],
    aviso: 'Prueba SUNAT BETA: sin validez tributaria.',
    puede_reintentar: false,
    puede_recuperar_cdr: false,
    puede_confirmar_manual: false,
    puede_nota_credito: true,
    puede_anular: true,
    ...cambios,
  };
}

describe('ComprobanteDetalleComponent', () => {
  let fixture: ComponentFixture<ComprobanteDetalleComponent>;
  let component: ComprobanteDetalleComponent;
  let roles: string[];
  const api = {
    detalle: vi.fn((): Observable<ComprobanteDetalle> => of(detalle())),
    reintentar: vi.fn(),
    recuperarCdr: vi.fn(),
    confirmarAceptado: vi.fn(),
    anular: vi.fn(),
    descargarPdf: vi.fn(() => of(new Blob(['%PDF']))),
    descargarArchivo: vi.fn(() => of(new Blob(['<xml/>']))),
  };
  const alerta = {
    pedirTexto: vi.fn(async (): Promise<string | null> => null),
    confirm: vi.fn(),
    error: vi.fn(),
    toast: vi.fn(),
  };

  function crear(accion: ComprobanteDetalleComponent['accionInicial'] = null): void {
    fixture = TestBed.createComponent(ComprobanteDetalleComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('accionInicial', accion);
    fixture.componentRef.setInput('idComprobante', 10);
    fixture.detectChanges();
  }

  function texto(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function botonesPie(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.adm-panel__pie button') as NodeListOf<HTMLButtonElement>).map(
      (b) => b.textContent?.trim() ?? '',
    );
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    api.detalle.mockImplementation(() => of(detalle()));
    roles = ['admin'];
    await TestBed.configureTestingModule({
      imports: [ComprobanteDetalleComponent],
      providers: [
        provideRouter([]),
        { provide: ComprobanteService, useValue: api },
        { provide: AlertService, useValue: alerta },
        { provide: AuthService, useValue: { puedeVer: (permitidos: string[]) => permitidos.some((r) => roles.includes(r)) } },
        {
          provide: FiscalEstadoService,
          useValue: { estado: signal<EstadoFiscalGlobal | null>({ ambiente: 'beta', emision_activa: true } as EstadoFiscalGlobal) },
        },
      ],
    }).compileComponents();
  });

  it('muestra el emisor real, el estado SUNAT en palabras, la marca BETA y lo enlazado', () => {
    crear();
    expect(api.detalle).toHaveBeenCalledWith(10);
    expect(texto()).toContain('EMPRESA DE PRUEBAS BETA');
    expect(texto()).toContain('Aceptado por SUNAT');
    expect(texto()).toContain('Prueba BETA - sin validez');
    expect(texto()).toContain('Prueba SUNAT BETA: sin validez tributaria.');
    expect(texto()).toContain('qnVeDFwT6o4bZ3hBOK1bJ2Zl0QY=');
    expect(texto()).toContain('FBC1-00000001');
    const enlaces = Array.from(fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>).map((a) => a.getAttribute('href'));
    expect(enlaces).toContain('/dashboard/mantenimiento/guias-remision?guia=4');
    expect(enlaces).toContain('/dashboard/mantenimiento/ventas-historial?venta=33');
  });

  it('ofrece solo las acciones que permiten los flags del backend y el rol', () => {
    crear();
    expect(botonesPie()).toEqual(['Nota de crédito', 'Anular', 'Cerrar']);

    api.detalle.mockReturnValue(
      of(detalle({ puede_reintentar: true, puede_recuperar_cdr: true, puede_confirmar_manual: true, puede_nota_credito: false })),
    );
    component.cargar();
    fixture.detectChanges();
    expect(botonesPie()).toEqual(['Reintentar envío', 'Recuperar CDR', 'Confirmar aceptado', 'Anular', 'Cerrar']);

    // Caja: puede reintentar y recuperar, pero confirmar, anular y emitir notas no.
    roles = ['caja'];
    crear();
    api.detalle.mockReturnValue(of(detalle({ puede_reintentar: true, puede_confirmar_manual: true })));
    component.cargar();
    fixture.detectChanges();
    expect(botonesPie()).toEqual(['Reintentar envío', 'Cerrar']);
  });

  it('reintentar (pedido desde la lista) muestra en el acto la respuesta de SUNAT y vuelve a leer el comprobante', () => {
    api.detalle.mockReturnValue(of(detalle({ puede_reintentar: true, estado_sunat: 'PENDIENTE_REENVIO', aceptada_sunat: false })));
    api.reintentar.mockReturnValue(
      of({
        numero_formateado: 'FB01-00000012',
        estado: 'error',
        estado_sunat: 'RECHAZADO',
        aceptada_sunat: false,
        error: '2800 - El dato ingresado en el tipo de documento de identidad del receptor no es válido',
        ambiente_fiscal: 'beta',
      }),
    );
    crear('reintentar');
    fixture.detectChanges();

    expect(api.reintentar).toHaveBeenCalledWith(10);
    expect(api.detalle).toHaveBeenCalledTimes(2);
    expect(texto()).toContain('Rechazado por SUNAT');
    expect(texto()).toContain('2800 - El dato ingresado');
    expect(texto()).toContain('emita un documento nuevo');
  });

  it('confirmar aceptado exige la nota de lo verificado en SUNAT', async () => {
    api.detalle.mockReturnValue(of(detalle({ puede_confirmar_manual: true, aceptada_sunat: false, estado_sunat: 'PENDIENTE_REENVIO' })));
    api.confirmarAceptado.mockReturnValue(of({ estado: 'emitido', estado_sunat: 'ACEPTADO', aceptada_sunat: true }));
    crear();

    await component.confirmarAceptado();
    expect(alerta.pedirTexto).toHaveBeenCalledWith(expect.objectContaining({ minimo: 5, maximo: 300 }));
    expect(api.confirmarAceptado).not.toHaveBeenCalled();

    alerta.pedirTexto.mockResolvedValueOnce('Lo vi aceptado en SOL el 25/10');
    await component.confirmarAceptado();
    fixture.detectChanges();
    expect(api.confirmarAceptado).toHaveBeenCalledWith(10, 'Lo vi aceptado en SOL el 25/10');
    expect(texto()).toContain('Aceptado por SUNAT');
  });

  it('anular explica la nota de crédito y muestra la anulación en curso con los avisos del backend', async () => {
    alerta.pedirTexto.mockResolvedValueOnce('El cliente desistió');
    api.anular.mockReturnValue(
      of({
        estado: 'anulacion_en_curso',
        id_comprobante: 10,
        numero_formateado: 'FB01-00000012',
        id_venta: 33,
        venta_estado: 'activa',
        nota: {
          id_comprobante: 21, serie: 'FBC1', numero: 2, numero_formateado: 'FBC1-00000002', motivo: '01', total: 50,
          estado: 'pendiente', estado_sunat: 'ENVIANDO', aceptada_sunat: false,
        },
        avisos: ['Se emitió la nota FBC1-00000002: la venta 33 se anulará cuando SUNAT la acepte.'],
      }),
    );
    crear();
    await component.anular();
    fixture.detectChanges();

    expect(alerta.pedirTexto).toHaveBeenCalledWith(
      expect.objectContaining({ danger: true, message: expect.stringContaining('nota de crédito') }),
    );
    expect(api.anular).toHaveBeenCalledWith({ id_comprobante: 10, motivo: 'El cliente desistió' });
    expect(texto()).toContain('Anulación en curso');
    expect(texto()).toContain('la venta 33 se anulará cuando SUNAT la acepte');
    expect(texto()).toContain('FBC1-00000002');
  });

  it('si el envío quedó sin confirmar, pide verificarlo en SUNAT y reenvía con lo verificado', async () => {
    alerta.pedirTexto.mockResolvedValueOnce('Error en los datos').mockResolvedValueOnce('No figura en SOL el 25/10');
    alerta.confirm.mockResolvedValue({ isConfirmed: false, isDenied: true, isDismissed: false });
    api.anular
      .mockReturnValueOnce(
        throwError(() => ({
          status: 409,
          error: { message: 'El envío de FB01-00000012 a SUNAT quedó sin confirmar.', codigo: 'ANULACION_REQUIERE_VERIFICACION_SOL' },
        })),
      )
      .mockReturnValueOnce(
        of({ estado: 'anulada', id_comprobante: 10, numero_formateado: 'FB01-00000012', id_venta: 33, venta_estado: 'anulada', avisos: [] }),
      );
    crear();
    await component.anular();
    await vi.waitFor(() => expect(api.anular).toHaveBeenCalledTimes(2));

    expect(alerta.confirm).toHaveBeenCalledWith(expect.objectContaining({ denyText: 'No existe en SUNAT' }));
    expect(api.anular).toHaveBeenLastCalledWith({
      id_comprobante: 10,
      motivo: 'Error en los datos',
      confirmar_verificado_sol: true,
      existe_en_sunat: false,
      nota: 'No figura en SOL el 25/10',
    });
    expect(alerta.error).not.toHaveBeenCalled();
  });

  it('descarga el PDF y la constancia con nombres claros', () => {
    const nombres: string[] = [];
    // jsdom no trae createObjectURL: se simula solo aquí y luego se devuelve lo que había (los specs
    // comparten globales con isolate:false).
    const originales = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:prueba'), revokeObjectURL: vi.fn() });
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      nombres.push(this.download);
    });
    try {
      crear();
      component.descargarPdf('ticket');
      component.descargarArchivoEnvio('cdr_xml');
      expect(api.descargarPdf).toHaveBeenCalledWith(10, 'ticket');
      expect(api.descargarArchivo).toHaveBeenCalledWith(10, 'cdr_xml');
      expect(nombres).toEqual(['FB01-00000012-ticket.pdf', 'R-FB01-00000012.xml']);
    } finally {
      clic.mockRestore();
      Object.assign(URL, originales);
    }
  });
});
