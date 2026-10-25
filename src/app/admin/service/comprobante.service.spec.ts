import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlConstants } from '../../constants/urlConstants';
import { ComprobanteService } from './comprobante.service';

describe('ComprobanteService: comprobantes, envíos a SUNAT y notas de crédito', () => {
  let service: ComprobanteService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ComprobanteService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista con los filtros de estado SUNAT y ambiente sin mandar los vacíos', () => {
    service
      .listar({
        texto: ' F001 ',
        id_tipo: '',
        estado: '',
        estado_sunat: 'RECHAZADO',
        ambiente: 'beta',
        desde: '2026-10-01',
        hasta: '',
        pagina: 2,
        por_pagina: 20,
      })
      .subscribe();

    const peticion = http.expectOne((r) => r.url === urlConstants.comprobante.base);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.withCredentials).toBe(true);
    const params = peticion.request.params;
    expect(params.get('texto')).toBe('F001');
    expect(params.get('estado_sunat')).toBe('RECHAZADO');
    expect(params.get('ambiente')).toBe('beta');
    expect(params.get('desde')).toBe('2026-10-01');
    expect(params.get('pagina')).toBe('2');
    expect(params.has('id_tipo')).toBe(false);
    expect(params.has('estado')).toBe(false);
    expect(params.has('hasta')).toBe(false);
    peticion.flush({ datos: [], total: 0, pagina: 2, por_pagina: 20 });
  });

  it('descarga el PDF en el formato pedido y los archivos del envío como blob', () => {
    service.descargarPdf(7, 'ticket').subscribe();
    const pdf = http.expectOne((r) => r.url === urlConstants.comprobante.pdf(7));
    expect(pdf.request.method).toBe('GET');
    expect(pdf.request.params.get('formato')).toBe('ticket');
    expect(pdf.request.responseType).toBe('blob');
    pdf.flush(new Blob(['%PDF']));

    service.descargarArchivo(7, 'cdr_xml').subscribe();
    const cdr = http.expectOne(urlConstants.comprobante.archivo(7, 'cdr_xml'));
    expect(cdr.request.responseType).toBe('blob');
    cdr.flush(new Blob(['<ApplicationResponse/>']));
  });

  it('reintenta, recupera el CDR y confirma el aceptado con la nota de lo verificado', () => {
    service.reintentar(7).subscribe();
    const reintento = http.expectOne(urlConstants.comprobante.reintentar(7));
    expect(reintento.request.method).toBe('POST');
    expect(reintento.request.body).toEqual({});
    reintento.flush({ estado: 'emitido', aceptada_sunat: true });

    service.recuperarCdr(7).subscribe();
    const cdr = http.expectOne(urlConstants.comprobante.recuperarCdr(7));
    expect(cdr.request.method).toBe('POST');
    cdr.flush({ estado: 'pendiente' });

    service.confirmarAceptado(7, 'Lo vi aceptado en SOL').subscribe();
    const confirmacion = http.expectOne(urlConstants.comprobante.confirmarAceptado(7));
    expect(confirmacion.request.method).toBe('POST');
    expect(confirmacion.request.body).toEqual({ nota: 'Lo vi aceptado en SOL' });
    confirmacion.flush({ estado: 'emitido', aceptada_sunat: true });
  });

  it('pide el contexto y emite la nota de crédito con el cuerpo del asistente', () => {
    service.contextoNotaCredito(10).subscribe();
    const contexto = http.expectOne(urlConstants.comprobante.contextoNotaCredito(10));
    expect(contexto.request.method).toBe('GET');
    contexto.flush({ permitido: true });

    const solicitud = {
      motivo: '07',
      sustento: 'Devolución de 1 martillo',
      items: [{ id_item: 3, cantidad: 1 }],
      reingresar_stock: true,
    };
    service.emitirNotaCredito(10, solicitud).subscribe();
    const nota = http.expectOne(urlConstants.comprobante.notaCredito(10));
    expect(nota.request.method).toBe('POST');
    expect(nota.request.body).toEqual(solicitud);
    nota.flush({ estado: 'emitido', efecto: 'devolucion', efectos_aplicados: true, avisos: [] });
  });

  it('anula con la verificación en SUNAT cuando el administrador la indica', () => {
    const solicitud = {
      id_comprobante: 10,
      motivo: 'El cliente desistió',
      confirmar_verificado_sol: true,
      existe_en_sunat: false,
      nota: 'No figura en SOL',
    };
    service.anular(solicitud).subscribe();
    const peticion = http.expectOne(urlConstants.comprobante.anular);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(solicitud);
    peticion.flush({ estado: 'anulada', avisos: [] });
  });

  it('lista las ventas sin comprobante por fechas y emite el comprobante de una venta', () => {
    service.ventasSinComprobante({ desde: '2026-10-20', hasta: '', pagina: 1, por_pagina: 20 }).subscribe();
    const lista = http.expectOne((r) => r.url === urlConstants.puntoVenta.sinComprobante);
    expect(lista.request.params.get('desde')).toBe('2026-10-20');
    expect(lista.request.params.has('hasta')).toBe(false);
    expect(lista.request.params.get('por_pagina')).toBe('20');
    lista.flush({ datos: [], total: 0, pagina: 1, por_pagina: 20 });

    service.emitirComprobanteDeVenta(33, { id_tipo: 1, documento: '20100000001' }).subscribe();
    const emision = http.expectOne(urlConstants.puntoVenta.emitirComprobante(33));
    expect(emision.request.method).toBe('POST');
    expect(emision.request.body).toEqual({ id_tipo: 1, documento: '20100000001' });
    emision.flush({ id_venta: 33, total: 59, cliente_denominacion: 'ACME' });
  });

  it('propaga el 409 de una nota en curso con el id de esa nota', () => {
    let recibido: { status?: number; error?: { id_comprobante?: number } } | undefined;
    service.emitirNotaCredito(10, { motivo: '09', sustento: 'Ajuste', monto: 5 }).subscribe({
      error: (e) => (recibido = e),
    });
    http.expectOne(urlConstants.comprobante.notaCredito(10)).flush(
      { message: 'La nota FC01-00000003 todavía se está enviando a SUNAT', codigo: 'NOTA_CREDITO_EN_CURSO', id_comprobante: 55 },
      { status: 409, statusText: 'Conflict' },
    );
    expect(recibido?.status).toBe(409);
    expect(recibido?.error?.id_comprobante).toBe(55);
  });
});
