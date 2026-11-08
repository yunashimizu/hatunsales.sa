import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { urlConstants } from '../../../../constants/urlConstants';
import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { LoteSunat } from '../../../models/fiscal.models';
import { LotesSunatComponent } from './lotes-sunat.component';

function lote(cambios: Partial<LoteSunat>): LoteSunat {
  return {
    id_envio: 7,
    ambiente: 'produccion',
    operacion: 'baja',
    identificador: 'RA-20261105-1',
    estado: 'ACEPTADO',
    sunat_ticket: '202612345678',
    codigo_sunat: '0',
    mensaje_sunat: 'La Comunicacion de baja RA-20261105-1 ha sido aceptada',
    fecha_referencia: '2026-11-03',
    intento: 1,
    proximo_intento_en: null,
    creado_en: '2026-11-05T15:00:00.000Z',
    actualizado_en: '2026-11-05T15:02:00.000Z',
    archivos: ['xml_firmado', 'zip', 'cdr_xml'],
    lineas: [{ id_comprobante: 10, serie: 'F001', numero: 12, tipo_documento: '01', condicion: null, estado: 'ACEPTADO' }],
    ...cambios,
  };
}

const pagina = (datos: LoteSunat[]) => ({ datos, total: datos.length, pagina: 1, por_pagina: 20 });

describe('LotesSunatComponent', () => {
  let fixture: ComponentFixture<LotesSunatComponent>;
  let component: LotesSunatComponent;
  let http: HttpTestingController;
  const alerta = {
    toast: vi.fn(),
    error: vi.fn(),
    confirmar: vi.fn(async (): Promise<boolean> => true),
    confirmarPeligro: vi.fn(async (): Promise<boolean> => true),
  };
  let esAdmin = true;
  const auth = { puedeVer: vi.fn((roles: string[]) => esAdmin && roles.includes('admin')) };

  const consultaLotes = () => http.expectOne((r) => r.url === urlConstants.fiscal.lotes);

  beforeEach(async () => {
    vi.clearAllMocks();
    esAdmin = true;
    alerta.confirmar.mockResolvedValue(true);
    alerta.confirmarPeligro.mockResolvedValue(true);
    await TestBed.configureTestingModule({
      imports: [LotesSunatComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AlertService, useValue: alerta },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LotesSunatComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('ambienteVigente', 'produccion');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('consulta los lotes del ambiente vigente y pinta la lista', () => {
    const peticion = consultaLotes();
    expect(peticion.request.params.get('ambiente')).toBe('produccion');
    expect(peticion.request.params.get('pagina')).toBe('1');
    expect(peticion.request.params.get('por_pagina')).toBe('20');
    peticion.flush(pagina([lote({}), lote({ id_envio: 8, operacion: 'resumen', identificador: 'RC-20261105-1', estado: 'TICKET_PENDIENTE', codigo_sunat: null, mensaje_sunat: null })]));
    fixture.detectChanges();
    const filas = fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>;
    expect(filas.length).toBe(2);
    expect(filas[0].textContent).toContain('Baja del 05/11 (n.º 1)');
    expect(filas[0].querySelector('[data-etiqueta="Lote"]')?.textContent).not.toContain('RA-20261105-1');
    expect(filas[0].querySelector('.adm-tabla__principal')?.getAttribute('title')).toBe('RA-20261105-1');
    expect(filas[0].textContent).toContain('Baja');
    expect(filas[0].textContent).toContain('F001-12');
    expect(filas[0].textContent).toContain('202612345678');
    expect(filas[0].querySelector('[data-etiqueta="Estado SUNAT"]')?.textContent).toContain('Aceptado');
    expect(filas[0].textContent).toContain('Sin acciones');
    expect(filas[1].textContent).toContain('Resumen');
    expect(filas[1].querySelector('[data-etiqueta="Estado SUNAT"]')?.textContent).toContain('SUNAT lo está procesando');
    expect(filas[1].querySelector('[data-etiqueta="Acciones"]')?.textContent).toContain('Consultar');
  });

  it('muestra el mensaje de vacío cuando no hay bajas ni resúmenes', () => {
    consultaLotes().flush(pagina([]));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin bajas ni resúmenes en este ambiente');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
  });

  it('ofrece reintentar o consultar solo donde el servidor lo admite', () => {
    const pendiente = lote({ estado: 'PENDIENTE_REENVIO', sunat_ticket: null });
    const conTicket = lote({ estado: 'TICKET_PENDIENTE' });
    const excepcionConTicket = lote({ estado: 'EXCEPCION', accion_sunat: 'CONSULTAR_TICKET' });
    const excepcionSinTicket = lote({ estado: 'EXCEPCION', sunat_ticket: null, accion_sunat: 'CONSULTAR_TICKET' });
    const excepcionDescartada = lote({ estado: 'EXCEPCION', accion_sunat: 'CORREGIR_Y_REENVIAR' });
    const rechazado = lote({ estado: 'RECHAZADO' });
    const enviando = lote({ estado: 'ENVIANDO', sunat_ticket: null });
    consultaLotes().flush(pagina([pendiente]));
    expect(component.puedeReintentar(pendiente)).toBe(true);
    expect(component.textoReintentar(pendiente)).toBe('Reintentar');
    expect(component.puedeReintentar(conTicket)).toBe(true);
    expect(component.textoReintentar(conTicket)).toBe('Consultar ahora');
    expect(component.puedeReintentar(excepcionConTicket)).toBe(true);
    expect(component.puedeReintentar(excepcionSinTicket)).toBe(false);
    expect(component.puedeReintentar(excepcionDescartada)).toBe(false);
    // Cumplidos los 7 días el servidor marca LIBERAR: sigue pudiéndose consultar.
    expect(component.puedeReintentar(lote({ estado: 'EXCEPCION', accion_sunat: 'LIBERAR' }))).toBe(true);
    expect(component.puedeReintentar(lote({ estado: 'EXCEPCION', accion_sunat: 'LIBERADO' }))).toBe(false);
    expect(component.puedeReintentar(rechazado)).toBe(false);
    expect(component.puedeReintentar(enviando)).toBe(false);
  });

  it('reintentar llama al POST del lote, avisa, emite el cambio y vuelve a consultar la lista', async () => {
    const pendiente = lote({ estado: 'TICKET_PENDIENTE' });
    consultaLotes().flush(pagina([pendiente]));
    fixture.detectChanges();
    const cambios: void[] = [];
    component.cambio.subscribe(() => cambios.push(undefined));

    await component.reintentar(pendiente);
    expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Consultar ahora «Baja del 05/11 (n.º 1)»?', confirmText: 'Sí, consultar' }));
    const peticion = http.expectOne(urlConstants.fiscal.reintentarLote(7));
    expect(peticion.request.method).toBe('POST');
    peticion.flush({
      id_envio: 7, operacion: 'baja', identificador: 'RA-20261105-1', estado: 'ACEPTADO', aceptado: true,
      ticket: '202612345678', mensaje: 'Aceptada', codigo: '0',
    });
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(cambios.length).toBe(1);
    expect(component.idEnProceso).toBeNull();
    consultaLotes().flush(pagina([lote({})]));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-etiqueta="Estado SUNAT"]')?.textContent).toContain('Aceptado');
  });

  it('si el reintento falla muestra el error y recarga la lista', async () => {
    const pendiente = lote({ estado: 'PENDIENTE_REENVIO', sunat_ticket: null });
    consultaLotes().flush(pagina([pendiente]));
    await component.reintentar(pendiente);
    http
      .expectOne(urlConstants.fiscal.reintentarLote(7))
      .flush({ message: 'No se puede reenviar' }, { status: 409, statusText: 'Conflict' });
    expect(alerta.error).toHaveBeenCalled();
    consultaLotes().flush(pagina([pendiente]));
  });

  it('la descarga pide el archivo del lote con un nombre claro', () => {
    const entregado = lote({});
    consultaLotes().flush(pagina([entregado]));
    const nombres: string[] = [];
    // jsdom no trae createObjectURL: se simula solo aquí y luego se devuelve lo que había (los specs
    // comparten globales con isolate:false).
    const originales = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:prueba'), revokeObjectURL: vi.fn() });
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      nombres.push(this.download);
    });
    try {
      component.descargar(entregado, 'cdr_xml');
      const peticion = http.expectOne(urlConstants.fiscal.archivoLote(7, 'cdr_xml'));
      expect(peticion.request.responseType).toBe('blob');
      peticion.flush(new Blob(['<xml/>']));
      expect(nombres).toEqual(['R-RA-20261105-1.xml']);
      expect(component.idEnProceso).toBeNull();
    } finally {
      clic.mockRestore();
      Object.assign(URL, originales);
    }
  });

  it('muestra el error de la consulta con la opción de reintentar', () => {
    consultaLotes().flush({ message: 'Internal server error' }, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();
    const aviso = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(aviso.textContent).toContain('No se pudieron consultar las bajas y resúmenes');
    (aviso.querySelector('button') as HTMLButtonElement).click();
    consultaLotes().flush(pagina([]));
  });

  describe('lotes sin respuesta de SUNAT (consulta lenta y «Liberar»)', () => {
    const vencido = (cambios: Partial<LoteSunat> = {}) =>
      lote({ estado: 'EXCEPCION', accion_sunat: 'LIBERAR', intento: 40, mensaje_sunat: 'SUNAT no resolvió el ticket 202612345678 en 7 días.', codigo_sunat: null, ...cambios });

    function mostrar(lotes: LoteSunat[]): HTMLElement[] {
      consultaLotes().flush(pagina(lotes));
      fixture.detectChanges();
      return Array.from(fixture.nativeElement.querySelectorAll('tbody tr')) as HTMLElement[];
    }
    const botonDe = (fila: HTMLElement, texto: string) =>
      (Array.from(fila.querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent?.includes(texto));

    it('el reintento pide confirmación y, si se cancela, no habla con SUNAT', async () => {
      const pendiente = lote({ estado: 'PENDIENTE_REENVIO', sunat_ticket: null });
      mostrar([pendiente]);
      alerta.confirmar.mockResolvedValueOnce(false);

      await component.reintentar(pendiente);

      expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Reintentar el envío de «Baja del 05/11 (n.º 1)»?' }));
      http.expectNone((r) => r.method === 'POST');
    });

    it('tras las consultas rápidas explica que se consulta cada 2 horas hasta el día 7 y deja «Consultar ahora»', () => {
      const lento = lote({ estado: 'TICKET_PENDIENTE', intento: 15, codigo_sunat: null, mensaje_sunat: null, creado_en: '2026-11-05T15:00:00.000Z' });
      const [fila] = mostrar([lento]);
      expect(fila.textContent).toContain('SUNAT todavía no responde este número de seguimiento');
      expect(fila.textContent).toContain('cada 2 horas hasta el 12/11');
      expect(fila.textContent).toContain('la baja en proceso');
      expect(botonDe(fila, 'Consultar ahora')).toBeTruthy();
      expect(botonDe(fila, 'Liberar')).toBeUndefined();
    });

    it('con los 7 días cumplidos el administrador ve la tarjeta de qué hacer, «Consultar ahora» y «Liberar»', () => {
      const e = vencido();
      const [fila] = mostrar([e]);
      expect(fila.textContent).toContain('Requiere revisión');
      expect(fila.textContent).toContain('SUNAT no resolvió el número de seguimiento en 7 días. Consúltelo de nuevo');
      expect(fila.textContent).toContain('libere el lote: el comprobante vuelve a su estado anterior');
      expect(botonDe(fila, 'Consultar ahora')).toBeTruthy();
      expect(botonDe(fila, 'Liberar')).toBeTruthy();
      expect(component.puedeLiberar(e)).toBe(true);
    });

    it('«Liberar» es solo del administrador y solo con el ticket sin resolver', () => {
      mostrar([vencido()]);
      expect(component.puedeLiberar(vencido({ sunat_ticket: null }))).toBe(false);
      expect(component.puedeLiberar(vencido({ accion_sunat: 'LIBERADO' }))).toBe(false);
      expect(component.puedeLiberar(vencido({ estado: 'TICKET_PENDIENTE', accion_sunat: 'CONSULTAR_TICKET' }))).toBe(false);
      expect(component.puedeLiberar(vencido({ accion_sunat: 'CONSULTAR_TICKET' }))).toBe(true);
      esAdmin = false;
      expect(component.puedeLiberar(vencido())).toBe(false);
    });

    it('liberar pide confirmación de peligro con lo que pasa con los comprobantes, llama al POST, avisa y recarga', async () => {
      const e = vencido();
      mostrar([e]);
      const cambios: void[] = [];
      component.cambio.subscribe(() => cambios.push(undefined));

      alerta.confirmarPeligro.mockResolvedValueOnce(false);
      await component.liberar(e);
      http.expectNone((r) => r.method === 'POST');

      await component.liberar(e);
      expect(alerta.confirmarPeligro).toHaveBeenLastCalledWith(
        expect.objectContaining({
          title: '¿Liberar «Baja del 05/11 (n.º 1)»?',
          message: expect.stringContaining('F001-12 vuelve(n) a su estado anterior'),
          confirmText: 'Sí, liberar',
        }),
      );
      const peticion = http.expectOne(`${urlConstants.fiscal.lotes}/7/liberar`);
      expect(peticion.request.method).toBe('POST');
      peticion.flush({ id_envio: 7, operacion: 'baja', identificador: 'RA-20261105-1', estado: 'EXCEPCION', aceptado: false, ticket: '202612345678', mensaje: 'Lote liberado', codigo: null });
      expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning', message: 'Lote liberado' }));
      expect(cambios.length).toBe(1);
      consultaLotes().flush(pagina([vencido({ accion_sunat: 'LIBERADO' })]));
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Lote liberado: los comprobantes volvieron a su estado anterior');
    });

    it('si liberar falla (409) muestra el error y vuelve a leer el lote', async () => {
      const e = vencido();
      mostrar([e]);
      await component.liberar(e);
      http.expectOne(`${urlConstants.fiscal.lotes}/7/liberar`).flush({ message: 'No se puede liberar' }, { status: 409, statusText: 'Conflict' });
      expect(alerta.error).toHaveBeenCalled();
      consultaLotes().flush(pagina([e]));
    });

    it('un no administrador no libera aunque llame al método', async () => {
      const e = vencido();
      mostrar([e]);
      esAdmin = false;
      await component.liberar(e);
      expect(alerta.confirmarPeligro).not.toHaveBeenCalled();
      http.expectNone((r) => r.method === 'POST');
    });
  });

  describe('resumen diario de boletas (S2)', () => {
    const adicion = (cambios: Partial<LoteSunat> = {}) =>
      lote({
        id_envio: 21,
        operacion: 'resumen',
        identificador: 'RC-20261105-00001',
        estado: 'TICKET_PENDIENTE',
        fecha_referencia: '2026-11-03',
        codigo_sunat: null,
        mensaje_sunat: null,
        lineas: [
          { id_comprobante: 61, serie: 'B001', numero: 10, tipo_documento: '03', condicion: 1, estado: 'POR_RESUMIR' },
          { id_comprobante: 62, serie: 'B001', numero: 11, tipo_documento: '03', condicion: 1, estado: 'POR_RESUMIR' },
          { id_comprobante: 63, serie: 'B001', numero: 12, tipo_documento: '03', condicion: 1, estado: 'PENDIENTE_REENVIO' },
        ],
        ...cambios,
      });

    it('un resumen que informa boletas se llama «Resumen de boletas del dd/mm · N boletas» y deja el identificador aparte', () => {
      consultaLotes().flush(pagina([adicion(), lote({ id_envio: 22, operacion: 'resumen', identificador: 'RC-20261105-00002' })]));
      fixture.detectChanges();
      const filas = fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>;
      expect(filas[0].querySelector('.adm-tabla__principal')?.textContent).toContain('Resumen de boletas del 03/11 · 3 boletas');
      expect(filas[0].textContent).toContain('Resumen del 05/11 (n.º 1)');
      expect(filas[0].textContent).not.toContain('RC-20261105-00001');
      expect(filas[0].textContent).toContain('Resumen diario');
      // El resumen que anula una boleta (condición 3 / sin dato) se nombra por su fecha y su número; el técnico va en el title.
      expect(filas[1].querySelector('.adm-tabla__principal')?.textContent).toContain('Resumen del 05/11 (n.º 2)');
      expect(filas[1].querySelector('.adm-tabla__principal')?.getAttribute('title')).toBe('RC-20261105-00002');
      expect(component.tituloLote(adicion({ lineas: adicion().lineas.slice(0, 1) }))).toBe('Resumen de boletas del 03/11 · 1 boleta');
    });

    it('«Enviar resumen del día»: solo el administrador, pide confirmación con la fecha y llama a POST /fiscal/lotes/resumen', async () => {
      consultaLotes().flush(pagina([]));
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Enviar resumen del día');
      component.fechaResumen = component.fechaMaximaResumen;
      alerta.confirmar.mockResolvedValueOnce(false);

      await component.enviarResumenDelDia();

      expect(alerta.confirmar).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('¿Enviar el resumen de boletas del '), confirmText: 'Sí, enviar resumen' }),
      );
      http.expectNone((r) => r.url === `${urlConstants.fiscal.lotes}/resumen`);

      const enviado = component.enviarResumenDelDia();
      await Promise.resolve();
      await Promise.resolve();
      const peticion = http.expectOne(`${urlConstants.fiscal.lotes}/resumen`);
      expect(peticion.request.method).toBe('POST');
      expect(peticion.request.body).toEqual({ fecha: component.fechaMaximaResumen });
      peticion.flush({ ...adicion(), aceptado: false, ticket: '2026120001', mensaje: 'SUNAT recibió el lote', codigo: null, fecha_emision: '2026-11-03', comprobantes: 3, pendientes: 0, omitidos: 0 });
      await enviado;
      expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Resumen de boletas del 03/11: 3 boletas' }));
      consultaLotes().flush(pagina([adicion()]));
    });

    it('un cajero o vendedor no ve el botón ni puede enviarlo; una fecha fuera de los 7 días no se envía', async () => {
      esAdmin = false;
      consultaLotes().flush(pagina([]));
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Enviar resumen del día');
      await component.enviarResumenDelDia();
      expect(alerta.confirmar).not.toHaveBeenCalled();

      esAdmin = true;
      component.fechaResumen = '2020-01-01';
      await component.enviarResumenDelDia();
      expect(alerta.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'Fecha no válida' }));
      expect(alerta.confirmar).not.toHaveBeenCalled();
      http.expectNone((r) => r.url === `${urlConstants.fiscal.lotes}/resumen`);
    });

    it('si el servidor dice que no hay nada por informar, lo muestra en palabras y vuelve a leer la lista', async () => {
      consultaLotes().flush(pagina([]));
      fixture.detectChanges();
      const enviado = component.enviarResumenDelDia();
      await Promise.resolve();
      await Promise.resolve();
      http
        .expectOne(`${urlConstants.fiscal.lotes}/resumen`)
        .flush({ statusCode: 409, codigo: 'FISCAL_RESUMEN_NO_PERMITIDO', message: 'No hay boletas por informar del 05/11: todas ya fueron aceptadas o están en un resumen en proceso.' }, { status: 409, statusText: 'Conflict' });
      await enviado;
      expect(alerta.error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('No hay boletas por informar del 05/11') }));
      consultaLotes().flush(pagina([]));
    });

    it('los textos de consulta, rechazo y liberación hablan de boletas, no de comprobantes anulados', async () => {
      consultaLotes().flush(pagina([]));
      const larga = adicion({ intento: 14 });
      expect(component.indicacion(larga)).toContain('las boletas quedan en este resumen');
      expect(component.indicacion(adicion({ estado: 'RECHAZADO', sunat_ticket: null }))).toContain('volvieron a quedar por informar');
      expect(component.indicacion(adicion({ estado: 'EXCEPCION', accion_sunat: 'LIBERAR' }))).toContain('vuelven a quedar por informar');

      await component.reintentar(adicion());
      expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('las boletas quedan aceptadas') }));
      http.expectOne(urlConstants.fiscal.reintentarLote(21)).flush({ ...adicion(), aceptado: false, ticket: 't', mensaje: null, codigo: null });
      consultaLotes().flush(pagina([]));
    });
  });
  describe('glosario y tarjeta «¿Qué hacer?» (SUNAT-4)', () => {
    const excepcion = (cambios: Partial<LoteSunat> = {}) =>
      lote({ estado: 'EXCEPCION', accion_sunat: 'LIBERAR', intento: 40, mensaje_sunat: null, codigo_sunat: null, ...cambios });
    const filasDe = () => fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>;

    it('habla de «número de seguimiento», no de ticket, y nombra los estados con el glosario', () => {
      consultaLotes().flush(pagina([
        lote({ estado: 'PENDIENTE_REENVIO', sunat_ticket: null }),
        lote({ id_envio: 8, estado: 'TICKET_PENDIENTE' }),
        lote({ id_envio: 9, estado: 'EXCEPCION', accion_sunat: 'CORREGIR_Y_REENVIAR' }),
      ]));
      fixture.detectChanges();
      const texto = fixture.nativeElement.textContent as string;
      expect(texto).toContain('N.º de seguimiento');
      expect(texto).toContain('Sin número');
      expect(texto).not.toMatch(/ticket/i);
      expect(texto).not.toMatch(/\bCDR\b/);
      const estados = Array.from(filasDe()).map((f) => f.querySelector('[data-etiqueta="Estado SUNAT"]')?.textContent?.trim() ?? '');
      expect(estados[0]).toContain('Por reenviar');
      expect(estados[1]).toContain('SUNAT lo está procesando');
      expect(estados[2]).toContain('Requiere revisión');
      expect(component.nombreEstado('POR_RESUMIR')).toBe('Va en el resumen diario');
      expect(component.nombreEstado('BAJA_PENDIENTE')).toBe('Baja en proceso');
    });

    it('«Requiere revisión» con «liberar» se muestra en la tarjeta con «Consultar ahora» y «Liberar» DENTRO de ella', () => {
      consultaLotes().flush(pagina([excepcion()]));
      fixture.detectChanges();
      const fila = filasDe()[0];
      const tarjeta = fila.querySelector('app-que-hacer-sunat') as HTMLElement;
      expect(tarjeta).toBeTruthy();
      expect(tarjeta.textContent).toContain('¿Qué hacer?');
      expect(tarjeta.textContent).toContain('SUNAT no resolvió el número de seguimiento en 7 días');
      const botones = Array.from(tarjeta.querySelectorAll('button')).map((b) => b.textContent?.trim());
      expect(botones).toEqual(['Consultar ahora', 'Liberar']);
      // La columna de acciones no repite los botones.
      const acciones = fila.querySelector('[data-etiqueta="Acciones"]') as HTMLElement;
      expect(acciones.querySelectorAll('button').length).toBe(0);
      expect(component.conTarjeta(excepcion())).toBe(true);
    });

    it('el botón de la tarjeta hace lo mismo que antes: «Liberar» pide confirmación de peligro con el nombre del lote', async () => {
      consultaLotes().flush(pagina([excepcion()]));
      fixture.detectChanges();
      const liberar = Array.from(filasDe()[0].querySelectorAll('app-que-hacer-sunat button')).find((b) => b.textContent?.includes('Liberar')) as HTMLButtonElement;
      liberar.click();
      await Promise.resolve();
      expect(alerta.confirmarPeligro).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Liberar «Baja del 05/11 (n.º 1)»?' }));
      http.expectOne(`${urlConstants.fiscal.lotes}/7/liberar`).flush({ id_envio: 7, operacion: 'baja', identificador: 'RA-20261105-1', estado: 'EXCEPCION', aceptado: false, ticket: null, mensaje: 'Liberado', codigo: null });
      consultaLotes().flush(pagina([]));
    });

    it('un número de seguimiento que lleva más de 12 consultas también va en la tarjeta (tono de aviso); uno reciente, no', () => {
      consultaLotes().flush(pagina([lote({ estado: 'TICKET_PENDIENTE', intento: 20 }), lote({ id_envio: 8, estado: 'TICKET_PENDIENTE', intento: 3 })]));
      fixture.detectChanges();
      const [largo, reciente] = Array.from(filasDe());
      expect(largo.querySelector('app-que-hacer-sunat .que-hacer--aviso')).toBeTruthy();
      expect(largo.querySelector('app-que-hacer-sunat')?.textContent).toContain('SUNAT todavía no responde este número de seguimiento');
      expect(reciente.querySelector('app-que-hacer-sunat')).toBeNull();
      expect(reciente.querySelector('[data-etiqueta="Acciones"]')?.textContent).toContain('Consultar ahora');
    });

    it('un lote aceptado o rechazado sin nada que hacer no lleva tarjeta', () => {
      consultaLotes().flush(pagina([lote({}), lote({ id_envio: 8, estado: 'RECHAZADO' })]));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-que-hacer-sunat')).toBeNull();
    });
  });
});
