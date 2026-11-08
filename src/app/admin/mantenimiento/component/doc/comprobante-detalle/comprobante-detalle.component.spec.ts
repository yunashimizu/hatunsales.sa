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
    informarPorResumen: vi.fn(),
    recuperarCdr: vi.fn(),
    confirmarAceptado: vi.fn(),
    anular: vi.fn(),
    descargarPdf: vi.fn(() => of(new Blob(['%PDF']))),
    descargarArchivo: vi.fn(() => of(new Blob(['<xml/>']))),
    reenviarCorreo: vi.fn(),
    historialCorreos: vi.fn(),
  };
  const alerta = {
    pedirTexto: vi.fn(async (): Promise<string | null> => null),
    confirm: vi.fn(),
    error: vi.fn(),
    toast: vi.fn(),
    confirmar: vi.fn(async (): Promise<boolean> => true),
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

  it('pinta la hoja compartida del comprobante y deja cuotas, hash y QR en sus secciones', () => {
    api.detalle.mockReturnValue(
      of(detalle({ forma_pago: 'Credito', cuotas: [{ numero: 1, monto: 100, fecha_pago: '2026-11-20' }] })),
    );
    crear();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.adm-ticket')).toBeNull();
    expect(el.querySelectorAll('app-hoja-comprobante').length).toBe(1);
    const hoja = el.querySelector('app-hoja-comprobante') as HTMLElement;
    expect(hoja.textContent).toContain('FACTURA ELECTRÓNICA');
    expect(hoja.textContent).toContain('FB01-00000012');
    expect(hoja.textContent).toContain('Op. exonerada');
    // Cuotas y hash/QR no se repiten dentro de la hoja: viven en sus secciones del detalle.
    expect(hoja.textContent).not.toContain('Resumen (hash)');
    expect(hoja.textContent).not.toContain('Cuota 001');
    expect(el.textContent).toContain('Forma de pago');
    expect(el.textContent).toContain('Código hash y QR');
  });

  it('arma la hoja una sola vez por detalle leído (misma referencia mientras no cambie)', () => {
    crear();
    const primera = component.hoja;
    expect(primera).not.toBeNull();
    expect(component.hoja).toBe(primera);

    api.detalle.mockReturnValue(of(detalle({ numero: 13, numero_formateado: 'FB01-00000013' })));
    component.cargar();
    fixture.detectChanges();
    expect(component.hoja).not.toBe(primera);
    expect(component.hoja?.serieNumero).toBe('FB01-00000013');
  });

  it('ofrece solo las acciones que permiten los flags del backend y el rol', () => {
    crear();
    expect(botonesPie()).toEqual(['Nota de crédito', 'Anular', 'Cerrar']);

    api.detalle.mockReturnValue(
      of(detalle({ puede_reintentar: true, puede_recuperar_cdr: true, puede_confirmar_manual: true, puede_nota_credito: false })),
    );
    component.cargar();
    fixture.detectChanges();
    expect(botonesPie()).toEqual(['Reintentar envío', 'Recuperar constancia', 'Confirmar aceptado', 'Anular', 'Cerrar']);

    // Caja: puede reintentar y recuperar, pero confirmar, anular y emitir notas no.
    roles = ['caja'];
    crear();
    api.detalle.mockReturnValue(of(detalle({ puede_reintentar: true, puede_confirmar_manual: true })));
    component.cargar();
    fixture.detectChanges();
    expect(botonesPie()).toEqual(['Reintentar envío', 'Cerrar']);
  });

  it('reintentar (pedido desde la lista) muestra en el acto la respuesta de SUNAT y vuelve a leer el comprobante', async () => {
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

    await vi.waitFor(() => expect(api.reintentar).toHaveBeenCalledWith(10));
    expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Reintentar el envío de FB01-00000012?' }));
    fixture.detectChanges();
    expect(api.detalle).toHaveBeenCalledTimes(2);
    expect(texto()).toContain('Rechazado por SUNAT');
    expect(texto()).toContain('2800 - El dato ingresado');
    expect(texto()).toContain('emita un documento nuevo');
  });

  describe('envío que requiere revisión (EXCEPCION) y plazo vencido', () => {
    const excepcion = (cambios: Partial<ComprobanteDetalle> = {}) =>
      detalle({
        estado: 'error',
        estado_sunat: 'EXCEPCION',
        aceptada_sunat: false,
        error_mensaje: 'Se intentó 6 veces sin una respuesta válida de SUNAT.',
        envio: { id_envio: 4, estado: 'EXCEPCION', codigo: null, mensaje: null, accion: 'NINGUNA', intento: 6 },
        puede_reintentar_ahora: true,
        puede_confirmar_manual: true,
        puede_recuperar_cdr: true,
        puede_nota_credito: false,
        puede_anular: false,
        ...cambios,
      });

    it('«Reintentar ahora» aparece solo para el administrador, con el estado y la explicación en palabras', () => {
      api.detalle.mockReturnValue(of(excepcion()));
      crear();
      expect(botonesPie()).toEqual(['Reintentar ahora', 'Recuperar constancia', 'Confirmar aceptado', 'Cerrar']);
      expect(texto()).toContain('Requiere revisión');
      expect(texto()).toContain('Se intentó 6 veces sin una respuesta válida de SUNAT.');

      // Caja: no fuerza ni confirma; solo puede recuperar la constancia.
      roles = ['caja'];
      crear();
      expect(botonesPie()).toEqual(['Recuperar constancia', 'Cerrar']);
    });

    it('«Reintentar ahora» pide confirmación con las veces intentadas, manda forzar y muestra la respuesta de SUNAT', async () => {
      api.detalle.mockReturnValue(of(excepcion()));
      api.reintentar.mockReturnValue(of({ numero_formateado: 'FB01-00000012', estado: 'emitido', estado_sunat: 'ACEPTADO', aceptada_sunat: true, ambiente_fiscal: 'beta' }));
      crear();

      alerta.confirmar.mockResolvedValueOnce(false);
      await component.reintentarAhora();
      expect(api.reintentar).not.toHaveBeenCalled();

      await component.reintentarAhora();
      expect(alerta.confirmar).toHaveBeenLastCalledWith(
        expect.objectContaining({ title: '¿Reintentar ahora FB01-00000012?', message: expect.stringContaining('Se intentó 6 veces') }),
      );
      expect(api.reintentar).toHaveBeenCalledWith(10, true);
      expect(api.detalle).toHaveBeenCalledTimes(2);
    });

    it('un no administrador no puede forzar el reintento aunque llame al método', async () => {
      roles = ['vendedor'];
      api.detalle.mockReturnValue(of(excepcion()));
      crear();
      await component.reintentarAhora();
      expect(alerta.confirmar).not.toHaveBeenCalled();
      expect(api.reintentar).not.toHaveBeenCalled();
    });

    it('Reintentar y Recuperar constancia piden confirmación antes de hablar con SUNAT', async () => {
      api.detalle.mockReturnValue(of(detalle({ puede_reintentar: true, puede_recuperar_cdr: true, estado_sunat: 'PENDIENTE_REENVIO', aceptada_sunat: false })));
      crear();
      alerta.confirmar.mockResolvedValue(false);
      await component.reintentar();
      await component.recuperarCdr();
      expect(api.reintentar).not.toHaveBeenCalled();
      expect(api.recuperarCdr).not.toHaveBeenCalled();
      expect(alerta.confirmar).toHaveBeenLastCalledWith(expect.objectContaining({ title: '¿Pedir a SUNAT la constancia de FB01-00000012?' }));

      alerta.confirmar.mockResolvedValue(true);
      api.recuperarCdr.mockReturnValue(of({ numero_formateado: 'FB01-00000012', estado: 'emitido', estado_sunat: 'ACEPTADO', aceptada_sunat: true, ambiente_fiscal: 'beta' }));
      await component.recuperarCdr();
      expect(api.recuperarCdr).toHaveBeenCalledWith(10);
    });

    it('una boleta fuera de plazo y de los 7 días del resumen: dice que se anule con nota de crédito y se emita otra', () => {
      api.detalle.mockReturnValue(
        of(excepcion({ id_tipo: 2, serie: 'BB01', numero_formateado: 'BB01-00000012', vencido: true, fecha_limite_envio: '2026-10-20', puede_reintentar_ahora: false, puede_recuperar_cdr: false })),
      );
      crear();
      expect(texto()).toContain('Fuera de plazo');
      expect(texto()).toContain('El plazo de envío individual venció el 20/10/2026 y ya pasaron los 7 días del resumen diario: si el cliente reclama el comprobante, anúlelo con nota de crédito y emita uno nuevo.');
      expect(texto()).not.toContain('Informar por resumen');
      expect(botonesPie()).toEqual(['Confirmar aceptado', 'Cerrar']);
    });

    it('una boleta vencida pero dentro de los 7 días se informará en el resumen diario y ofrece «Informar por resumen»', () => {
      api.detalle.mockReturnValue(
        of(excepcion({
          id_tipo: 2, serie: 'BB01', numero_formateado: 'BB01-00000012', vencido: true, fecha_limite_envio: '2026-10-20',
          puede_reintentar_ahora: false, puede_recuperar_cdr: false, puede_informar_por_resumen: true,
          envio: { id_envio: 4, estado: 'EXCEPCION', codigo: null, mensaje: null, accion: 'RESUMIR', intento: 6 },
        })),
      );
      crear();
      expect(texto()).toContain('Fuera de plazo');
      expect(texto()).toContain('Se informará a SUNAT en el próximo resumen diario (hasta 7 días después de la emisión)');
      expect(texto()).not.toMatch(/anúlelo con nota de crédito/);
      expect(botonesPie()).toEqual(['Informar por resumen', 'Confirmar aceptado', 'Cerrar']);
    });

    it('una factura fuera de plazo pide un comprobante nuevo, o recuperar la constancia si SUNAT quizá la recibió', () => {
      api.detalle.mockReturnValue(of(excepcion({ vencido: true, fecha_limite_envio: '2026-10-20', puede_reintentar_ahora: false })));
      crear();
      expect(component.textoVencido(excepcion({ fecha_limite_envio: '2026-10-20' }))).toBe('El plazo de envío venció el 20/10/2026: SUNAT ya no lo recibe. Emita un comprobante nuevo.');
      const recuperar = excepcion({ fecha_limite_envio: '2026-10-20', envio: { id_envio: 4, estado: 'EXCEPCION', codigo: null, mensaje: null, accion: 'RECUPERAR_CDR', intento: 6 } });
      expect(component.textoVencido(recuperar)).toContain('Use «Recuperar constancia» para saber si SUNAT lo recibió');
    });

    it('un envío pendiente que SUNAT no contesta muestra el motivo guardado (seguirá cada hora hasta el último día)', () => {
      api.detalle.mockReturnValue(
        of(detalle({
          estado: 'pendiente',
          estado_sunat: 'PENDIENTE_REENVIO',
          aceptada_sunat: false,
          puede_reintentar: true,
          error_mensaje: 'SUNAT no respondió en 6 intentos; se seguirá intentando cada hora hasta el 23/10 (plazo de envío).',
        })),
      );
      crear();
      expect(texto()).toContain('se seguirá intentando cada hora hasta el 23/10 (plazo de envío)');
    });
  });

  describe('boleta en modo «resumen diario» (S2)', () => {
    const porResumir = (cambios: Partial<ComprobanteDetalle> = {}) =>
      detalle({
        id_tipo: 2, serie: 'BB01', numero_formateado: 'BB01-00000012', estado: 'pendiente', estado_sunat: 'POR_RESUMIR', aceptada_sunat: false,
        sunat_description: 'Boleta registrada; se informa a SUNAT en el resumen diario.',
        envio: { id_envio: 4, estado: 'POR_RESUMIR', codigo: null, mensaje: null, accion: 'RESUMIR', intento: 0 },
        puede_nota_credito: false, puede_anular: true, puede_informar_por_resumen: true,
        ...cambios,
      });

    it('muestra «Va en el resumen diario» (sin alarma de plazo) y ofrece «Informar por resumen» al administrador y al vendedor, no al cajero', () => {
      api.detalle.mockReturnValue(of(porResumir()));
      crear();
      expect(texto()).toContain('Va en el resumen diario');
      expect(texto()).not.toContain('Fuera de plazo');
      expect(botonesPie()).toEqual(['Informar por resumen', 'Anular', 'Cerrar']);

      roles = ['vendedor'];
      crear();
      expect(botonesPie()).toEqual(['Informar por resumen', 'Cerrar']);

      roles = ['caja'];
      crear();
      expect(botonesPie()).toEqual(['Cerrar']);
    });

    it('«Informar por resumen» pide confirmación, llama al servidor, avisa y vuelve a leer el comprobante', async () => {
      api.detalle.mockReturnValue(of(porResumir()));
      api.informarPorResumen = vi.fn(() => of({ id_envio: 70, operacion: 'resumen', identificador: 'RC-20261105-00001', estado: 'TICKET_PENDIENTE', aceptado: false, ticket: 't', mensaje: 'SUNAT recibió el lote', codigo: null, fecha_emision: '2026-11-03', comprobantes: 1, pendientes: 0, omitidos: 0 }));
      crear();

      alerta.confirmar.mockResolvedValueOnce(false);
      await component.informarPorResumen();
      expect(api.informarPorResumen).not.toHaveBeenCalled();

      await component.informarPorResumen();
      expect(alerta.confirmar).toHaveBeenLastCalledWith(expect.objectContaining({ title: '¿Informar BB01-00000012 en un resumen diario?', confirmText: 'Sí, informar por resumen' }));
      expect(api.informarPorResumen).toHaveBeenCalledWith(10);
      expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'BB01-00000012 va en el resumen RC-20261105-00001' }));
      expect(api.detalle).toHaveBeenCalledTimes(2);
    });

    it('si el servidor lo rechaza muestra el motivo y no deja el panel a medias; sin permiso no hace nada', async () => {
      api.detalle.mockReturnValue(of(porResumir()));
      api.informarPorResumen = vi.fn(() => throwError(() => ({ status: 409, error: { message: 'BB01-12 ya lo aceptó SUNAT.', codigo: 'FISCAL_RESUMEN_NO_PERMITIDO' } })));
      crear();
      await component.informarPorResumen();
      expect(alerta.error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('ya lo aceptó SUNAT') }));
      expect(component.enProceso).toBeNull();

      alerta.confirmar.mockClear();
      roles = ['caja'];
      crear();
      await component.informarPorResumen();
      expect(alerta.confirmar).not.toHaveBeenCalled();
    });

    it('la acción pedida desde la lista («resumir») se ejecuta al abrir el detalle', async () => {
      api.detalle.mockReturnValue(of(porResumir()));
      api.informarPorResumen = vi.fn(() => of({ id_envio: 70, operacion: 'resumen', identificador: 'RC-20261105-00001', estado: 'TICKET_PENDIENTE', aceptado: false, ticket: null, mensaje: null, codigo: null, fecha_emision: '2026-11-03', comprobantes: 1, pendientes: 0, omitidos: 0 }));
      crear('resumir');
      await Promise.resolve();
      await Promise.resolve();
      expect(alerta.confirmar).toHaveBeenCalled();
    });
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

  describe('anular sin nota (baja en SUNAT)', () => {
    it('el botón aparece solo con puede_anular_sin_nota y rol admin, antes de Anular', () => {
      crear();
      expect(botonesPie()).not.toContain('Dar de baja en SUNAT');

      api.detalle.mockReturnValue(of(detalle({ puede_anular_sin_nota: true })));
      component.cargar();
      fixture.detectChanges();
      expect(botonesPie()).toEqual(['Nota de crédito', 'Dar de baja en SUNAT', 'Anular', 'Cerrar']);

      // Un vendedor puede emitir notas, pero no anular ni dar de baja.
      roles = ['vendedor'];
      crear();
      api.detalle.mockReturnValue(of(detalle({ puede_anular_sin_nota: true })));
      component.cargar();
      fixture.detectChanges();
      expect(botonesPie()).toEqual(['Nota de crédito', 'Cerrar']);
    });

    it('la factura explica la comunicación de baja y envía sin_nota: true con el motivo', async () => {
      api.detalle.mockReturnValue(of(detalle({ puede_anular_sin_nota: true })));
      alerta.pedirTexto.mockResolvedValueOnce('Error en el importe');
      api.anular.mockReturnValue(
        of({
          estado: 'anulacion_en_curso',
          id_comprobante: 10,
          numero_formateado: 'FB01-00000012',
          id_venta: 33,
          venta_estado: 'activa',
          baja: { id_envio: 7, operacion: 'baja', identificador: 'RA-20261105-1', estado: 'TICKET_PENDIENTE', ticket: '2026123' },
          avisos: ['SUNAT recibió el pedido de baja de FB01-12 (RA-20261105-1).'],
        }),
      );
      crear();
      await component.darDeBaja();
      fixture.detectChanges();

      expect(alerta.pedirTexto).toHaveBeenCalledWith(
        expect.objectContaining({
          minimo: 5,
          maximo: 100,
          danger: true,
          message: expect.stringContaining('comunicación de baja'),
        }),
      );
      expect(api.anular).toHaveBeenCalledWith({ id_comprobante: 10, motivo: 'Error en el importe', sin_nota: true });
      expect(texto()).toContain('Anulación en curso: falta la confirmación de SUNAT');
      expect(texto()).toContain('SUNAT recibió el pedido de baja');
    });

    it('la boleta explica el resumen diario y cancelar el diálogo no envía nada', async () => {
      api.detalle.mockReturnValue(of(detalle({ puede_anular_sin_nota: true, id_tipo: 2, serie: 'BB01' })));
      crear();
      await component.darDeBaja();
      expect(alerta.pedirTexto).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('resumen diario') }),
      );
      expect(api.anular).not.toHaveBeenCalled();
    });

    it('no hace nada si el comprobante no admite la baja o el usuario no es admin', async () => {
      crear();
      await component.darDeBaja();
      expect(alerta.pedirTexto).not.toHaveBeenCalled();
      expect(api.anular).not.toHaveBeenCalled();
    });

    it('el nombre de la baja es legible y el identificador RA-/RC- queda solo en el title', () => {
      api.detalle.mockReturnValue(
        of(detalle({ baja: { id_envio: 7, operacion: 'baja', identificador: 'RA-20261105-00001', estado: 'EXCEPCION', sunat_ticket: null, mensaje: null } })),
      );
      crear();
      const nombre = fixture.nativeElement.querySelector('[title="RA-20261105-00001"]') as HTMLElement;
      expect(nombre.textContent?.trim()).toBe('Baja del 05/11 (n.º 1)');
      expect(texto()).toContain('La baja necesita revisión');
      expect(fixture.nativeElement.querySelector('.adm-mono')?.textContent ?? '').not.toContain('RA-');
    });

    it('cuenta el estado del lote de baja con su nombre, número de seguimiento y tono', () => {
      api.detalle.mockReturnValue(
        of(detalle({ baja: { id_envio: 7, operacion: 'baja', identificador: 'RA-20261105-1', estado: 'TICKET_PENDIENTE', sunat_ticket: '2026123', mensaje: null } })),
      );
      crear();
      expect(texto()).toContain('SUNAT está procesando la baja');
      expect(texto()).toContain('Baja del 05/11 (n.º 1)');
      expect(texto()).not.toContain('RA-20261105-1');
      expect(texto()).toContain('N.º de seguimiento 2026123');
      expect(texto()).not.toContain('Ticket 2026123');

      api.detalle.mockReturnValue(
        of(detalle({ baja: { id_envio: 8, operacion: 'resumen', identificador: 'RC-20261105-2', estado: 'RECHAZADO', sunat_ticket: null, mensaje: '2223 - ya informado' } })),
      );
      component.cargar();
      fixture.detectChanges();
      expect(texto()).toContain('SUNAT rechazó la baja: el comprobante sigue vigente');
      expect(texto()).toContain('2223 - ya informado');
      expect(texto()).toContain('Resumen del 05/11 (n.º 2)');

      api.detalle.mockReturnValue(
        of(detalle({ anulado: true, baja: { id_envio: 7, operacion: 'baja', identificador: 'RA-20261105-1', estado: 'ACEPTADO', sunat_ticket: '2026123', mensaje: null } })),
      );
      component.cargar();
      fixture.detectChanges();
      expect(texto()).toContain('Dado de baja en SUNAT');
    });
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

  describe('correo al cliente', () => {
    const correo = (cambios: Partial<NonNullable<ComprobanteDetalle['correo']>> = {}) => ({
      estado: 'PENDIENTE' as const, destino: 'ana@ejemplo.pe', enviado_en: null, ultimo_error: null, motivo_omision: null,
      puede_reenviar: true, ...cambios,
    });

    it('muestra el estado del correo, precarga el destino y no ofrece nada sin el bloque del backend', () => {
      crear();
      expect(texto()).not.toContain('Correo al cliente');

      api.detalle.mockImplementation(() => of(detalle({ correo: correo({ estado: 'ENVIADO', enviado_en: '2026-10-27T15:30:00Z' }) })));
      crear();
      expect(texto()).toContain('Correo al cliente');
      expect(texto()).toContain('Enviado');
      expect(texto()).toContain('ana@ejemplo.pe');
      expect((fixture.nativeElement.querySelector('#det-correo-destino') as HTMLInputElement).value).toBe('ana@ejemplo.pe');
    });

    it('muestra el motivo cuando el correo falló o se omitió, y oculta el reenvío si no corresponde', () => {
      api.detalle.mockImplementation(() => of(detalle({ correo: correo({ estado: 'ERROR', ultimo_error: 'Brevo respondió 400', puede_reenviar: false }) })));
      crear();
      expect(texto()).toContain('No se pudo enviar');
      expect(texto()).toContain('Brevo respondió 400');
      expect(fixture.nativeElement.querySelector('#det-correo-destino')).toBeNull();

      api.detalle.mockImplementation(() => of(detalle({ correo: correo({ estado: 'OMITIDO', motivo_omision: 'ambiente beta sin correo de pruebas', puede_reenviar: false }) })));
      crear();
      expect(texto()).toContain('ambiente beta sin correo de pruebas');
    });

    it('reenviar confirma el destino, llama al backend, avisa y vuelve a leer el comprobante', async () => {
      api.detalle.mockImplementation(() => of(detalle({ correo: correo() })));
      api.reenviarCorreo.mockReturnValue(of({ id_correo: 31, id_comprobante: 10, destino: 'otro@ejemplo.pe', estado: 'ENVIADO' }));
      crear();
      component.cambiarDestinoCorreo(' otro@ejemplo.pe ');
      await component.reenviarCorreo();

      expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('otro@ejemplo.pe') }));
      expect(api.reenviarCorreo).toHaveBeenCalledWith(10, 'otro@ejemplo.pe');
      expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Correo enviado' }));
      expect(api.detalle).toHaveBeenCalledTimes(2);
    });

    it('no envía con un correo inválido ni si el usuario cancela la confirmación', async () => {
      api.detalle.mockImplementation(() => of(detalle({ correo: correo() })));
      crear();
      component.cambiarDestinoCorreo('sin-arroba');
      await component.reenviarCorreo();
      expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
      expect(api.reenviarCorreo).not.toHaveBeenCalled();

      component.cambiarDestinoCorreo('ok@ejemplo.pe');
      alerta.confirmar.mockResolvedValueOnce(false);
      await component.reenviarCorreo();
      expect(api.reenviarCorreo).not.toHaveBeenCalled();
    });

    it('un error del backend (por ejemplo el límite por hora) se muestra y no rompe el panel', async () => {
      api.detalle.mockImplementation(() => of(detalle({ correo: correo() })));
      api.reenviarCorreo.mockReturnValue(throwError(() => ({ status: 429, error: { message: 'máximo 3 por hora' } })));
      crear();
      await component.reenviarCorreo();
      expect(alerta.error).toHaveBeenCalled();
      expect(component.enProceso).toBeNull();
    });

    it('el historial se pide solo la primera vez que se abre', () => {
      api.detalle.mockImplementation(() => of(detalle({ correo: correo() })));
      api.historialCorreos.mockReturnValue(of([
        { id_correo: 31, id_comprobante: 10, destino: 'ana@ejemplo.pe', estado: 'ENVIADO', origen: 'manual', intentos: 1,
          ultimo_error: null, motivo_omision: null, creado_en: '2026-10-27T15:30:00Z', enviado_en: '2026-10-27T15:30:05Z' },
      ]));
      crear();
      expect(api.historialCorreos).not.toHaveBeenCalled();
      component.alternarHistorialCorreo(true);
      component.alternarHistorialCorreo(false);
      component.alternarHistorialCorreo(true);
      expect(api.historialCorreos).toHaveBeenCalledTimes(1);
      expect(api.historialCorreos).toHaveBeenCalledWith(10);
      expect(component.historialCorreo).toHaveLength(1);
    });
  });
});
