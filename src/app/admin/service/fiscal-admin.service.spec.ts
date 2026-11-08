import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlConstants } from '../../constants/urlConstants';
import { TIEMPO_LIMITE_MS } from '../../interceptors/contexto-http';
import { FiscalAdminService } from './fiscal-admin.service';

describe('FiscalAdminService: salidas de los envíos y lotes sin respuesta (SUNAT-1)', () => {
  let servicio: FiscalAdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(FiscalAdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('el reintento común va con cuerpo vacío y «Reintentar ahora» manda forzar', () => {
    servicio.reintentarEnvio(8).subscribe();
    const comun = http.expectOne(urlConstants.fiscal.reintentarEnvio(8));
    expect(comun.request.method).toBe('POST');
    expect(comun.request.body).toEqual({});
    comun.flush({ estado: 'ACEPTADO' });

    servicio.reintentarEnvio(8, true).subscribe();
    const forzado = http.expectOne(urlConstants.fiscal.reintentarEnvio(8));
    expect(forzado.request.body).toEqual({ forzar: true });
    forzado.flush({ estado: 'ACEPTADO' });
  });

  it('«Liberar» un lote es un POST sin cuerpo a su ruta; consultar sigue siendo el reintento del lote', () => {
    servicio.liberarLote(12).subscribe();
    const liberar = http.expectOne(`${urlConstants.fiscal.lotes}/12/liberar`);
    expect(liberar.request.method).toBe('POST');
    expect(liberar.request.body).toEqual({});
    liberar.flush({ id_envio: 12, estado: 'EXCEPCION' });

    servicio.reintentarLote(12).subscribe();
    const consultar = http.expectOne(urlConstants.fiscal.reintentarLote(12));
    expect(consultar.request.method).toBe('POST');
    consultar.flush({ id_envio: 12, estado: 'TICKET_PENDIENTE' });
  });

  it('recuperar la constancia y confirmar el aceptado no cambian: POST a su ruta, la nota solo al confirmar', () => {
    servicio.recuperarCdr(8).subscribe();
    const cdr = http.expectOne(urlConstants.fiscal.recuperarCdr(8));
    expect(cdr.request.body).toEqual({});
    cdr.flush({ estado: 'PENDIENTE_REENVIO' });

    servicio.confirmarAceptado(8, 'Lo vi aceptado en SOL').subscribe();
    const confirmacion = http.expectOne(urlConstants.fiscal.confirmarAceptado(8));
    expect(confirmacion.request.body).toEqual({ nota: 'Lo vi aceptado en SOL' });
    confirmacion.flush({ estado: 'ACEPTADO' });
  });

  it('«Enviar resumen del día» es un POST a /fiscal/lotes/resumen con la fecha; sin fecha, cuerpo vacío (el servidor usa hoy)', () => {
    servicio.enviarResumenDiario('2026-11-03').subscribe();
    const conFecha = http.expectOne(`${urlConstants.fiscal.lotes}/resumen`);
    expect(conFecha.request.method).toBe('POST');
    expect(conFecha.request.body).toEqual({ fecha: '2026-11-03' });
    conFecha.flush({ id_envio: 55, comprobantes: 3 });

    servicio.enviarResumenDiario().subscribe();
    const sinFecha = http.expectOne(`${urlConstants.fiscal.lotes}/resumen`);
    expect(sinFecha.request.body).toEqual({});
    sinFecha.flush({ id_envio: 56, comprobantes: 1 });
  });

  it('el correo de avisos va a /fiscal/alertas (GET y PUT con el correo) y «Re-cifrar» es un POST a /fiscal/secretos/recifrar', () => {
    const base = urlConstants.fiscal.estado.replace(/estado$/, '');

    servicio.alertas().subscribe();
    const lectura = http.expectOne(`${base}alertas`);
    expect(lectura.request.method).toBe('GET');
    lectura.flush({ correo: null, correo_efectivo: null, origen: 'ninguno' });

    servicio.guardarAlertas('contador@empresa.pe').subscribe();
    const guardado = http.expectOne(`${base}alertas`);
    expect(guardado.request.method).toBe('PUT');
    expect(guardado.request.body).toEqual({ correo: 'contador@empresa.pe' });
    guardado.flush({ correo: 'contador@empresa.pe', correo_efectivo: 'contador@empresa.pe', origen: 'configurado' });

    servicio.recifrarSecretos().subscribe();
    const recifrado = http.expectOne(`${base}secretos/recifrar`);
    expect(recifrado.request.method).toBe('POST');
    expect(recifrado.request.body).toEqual({});
    recifrado.flush({ revisados: 0, recifrados: 0, ya_vigentes: 0, ilegibles: 0, puede_quitar_llave_anterior: true, detalle: [] });
  });

  it('estadoCompleto lee /fiscal/estado, que ahora trae la llave', () => {
    servicio.estadoCompleto().subscribe((e) => expect(e.llave).toEqual({ anterior_definida: true, secretos_con_llave_anterior: 1 }));
    http.expectOne(urlConstants.fiscal.estado).flush({ llave: { anterior_definida: true, secretos_con_llave_anterior: 1 } });
  });
  it('la bitácora pide 20 registros y, para seguir, los anteriores a un id (SUNAT-4: tiene las acciones nuevas)', () => {
    servicio.auditoria().subscribe();
    const primera = http.expectOne((r) => r.url === urlConstants.fiscal.auditoria);
    expect(primera.request.method).toBe('GET');
    expect(primera.request.params.get('limite')).toBe('20');
    expect(primera.request.params.has('antes_de')).toBe(false);
    primera.flush({ registros: [{ id_auditoria: 90, accion: 'FISCAL_NC_EMITIDA' }], siguiente: 90 });

    servicio.auditoria(90).subscribe();
    const siguiente = http.expectOne((r) => r.url === urlConstants.fiscal.auditoria);
    expect(siguiente.request.params.get('antes_de')).toBe('90');
    siguiente.flush({ registros: [], siguiente: null });
  });

  it('los envíos y los lotes no mandan filtros vacíos, indefinidos ni nulos', () => {
    servicio.envios({ ambiente: 'produccion', estado: '', tipo: undefined, pagina: 2, por_pagina: 20 } as never).subscribe();
    const envios = http.expectOne((r) => r.url === urlConstants.fiscal.envios);
    expect(envios.request.params.keys().sort()).toEqual(['ambiente', 'pagina', 'por_pagina']);
    expect(envios.request.params.get('pagina')).toBe('2');
    envios.flush({ datos: [], total: 0, pagina: 2, por_pagina: 20 });

    servicio.lotes({ ambiente: '', pagina: 1, por_pagina: 20 } as never).subscribe();
    const lotes = http.expectOne((r) => r.url === urlConstants.fiscal.lotes);
    expect(lotes.request.params.keys().sort()).toEqual(['pagina', 'por_pagina']);
    lotes.flush({ datos: [], total: 0, pagina: 1, por_pagina: 20 });
  });

  it('los archivos de un envío y de un lote se piden como blob a su ruta', () => {
    servicio.archivoEnvio(8, 'cdr_zip').subscribe();
    const envio = http.expectOne(urlConstants.fiscal.archivoEnvio(8, 'cdr_zip'));
    expect(envio.request.responseType).toBe('blob');
    envio.flush(new Blob(['zip']));

    servicio.archivoLote(12, 'xml_firmado').subscribe();
    const lote = http.expectOne(urlConstants.fiscal.archivoLote(12, 'xml_firmado'));
    expect(lote.request.responseType).toBe('blob');
    lote.flush(new Blob(['xml']));
  });

  it('la prueba de conexión manda el tipo de comprobante solo en BETA con comprobantes; las guías y producción, no', () => {
    servicio.probar('beta', 'cpe', '03').subscribe();
    expect(http.expectOne(urlConstants.fiscal.probarConexion).request.body).toEqual({ ambiente: 'beta', documento: 'cpe', tipo_cpe: '03' });

    servicio.probar('produccion', 'cpe', '03').subscribe();
    expect(http.expectOne(urlConstants.fiscal.probarConexion).request.body).toEqual({ ambiente: 'produccion', documento: 'cpe' });

    servicio.probar('beta', 'gre', '01').subscribe();
    expect(http.expectOne(urlConstants.fiscal.probarConexion).request.body).toEqual({ ambiente: 'beta', documento: 'gre' });
  });

  it('reanudar la emisión y probar las credenciales de producción son POST sin cuerpo', () => {
    servicio.reanudarEmision().subscribe();
    const reanudar = http.expectOne(urlConstants.fiscal.reanudarEmision);
    expect(reanudar.request.method).toBe('POST');
    expect(reanudar.request.body).toEqual({});
    reanudar.flush({ reanudada: true });

    servicio.probarCredencialesProduccion().subscribe();
    const probar = http.expectOne(urlConstants.fiscal.probarCredencialesProduccion);
    expect(probar.request.method).toBe('POST');
    expect(probar.request.body).toEqual({});
    probar.flush({ ok: true });
  });

  it('«Los 4 documentos» manda tipo_cpe todos con 150 s de espera; un documento suelto usa el límite normal', () => {
    servicio.probar('beta', 'cpe', 'todos').subscribe();
    const todos = http.expectOne(urlConstants.fiscal.probarConexion);
    expect(todos.request.body).toEqual({ ambiente: 'beta', documento: 'cpe', tipo_cpe: 'todos' });
    expect(todos.request.context.get(TIEMPO_LIMITE_MS)).toBe(150_000);

    servicio.probar('beta', 'cpe', '07').subscribe();
    const nota = http.expectOne(urlConstants.fiscal.probarConexion);
    expect(nota.request.body).toEqual({ ambiente: 'beta', documento: 'cpe', tipo_cpe: '07' });
    expect(nota.request.context.get(TIEMPO_LIMITE_MS)).toBeUndefined();

    // En producción 'todos' no se manda (solo se comprueba, no se emite).
    servicio.probar('produccion', 'cpe', 'todos').subscribe();
    const produccion = http.expectOne(urlConstants.fiscal.probarConexion);
    expect(produccion.request.body).toEqual({ ambiente: 'produccion', documento: 'cpe' });
    expect(produccion.request.context.get(TIEMPO_LIMITE_MS)).toBeUndefined();
  });
});
