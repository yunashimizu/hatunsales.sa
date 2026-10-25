import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlConstants } from '../../constants/urlConstants';
import { TIEMPO_LIMITE_MS } from '../../interceptors/contexto-http';
import { GuardarGuiaRemision, GuiaRemisionService, LIMITE_SUNAT_MS } from './guia-remision.service';

const cuerpo: GuardarGuiaRemision = {
  id_venta: 7,
  motivo_traslado: '01',
  modalidad_traslado: '02',
  items: [{ id_producto: 3, cantidad: 2 }],
  clave_idempotencia: 'gre-abc',
};

describe('GuiaRemisionService', () => {
  let servicio: GuiaRemisionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(GuiaRemisionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista con los filtros indicados, sin mandar los vacíos', () => {
    servicio.listar({ texto: ' T001 ', estado: '', desde: '2026-10-01', hasta: undefined, pagina: 2, por_pagina: 20 }).subscribe();
    const peticion = http.expectOne((r) => r.url === urlConstants.guiaRemision.base);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.get('texto')).toBe('T001');
    expect(peticion.request.params.get('desde')).toBe('2026-10-01');
    expect(peticion.request.params.get('pagina')).toBe('2');
    expect(peticion.request.params.has('estado')).toBe(false);
    expect(peticion.request.params.has('hasta')).toBe(false);
    peticion.flush({ datos: [], total: 0, pagina: 2, por_pagina: 20 });
  });

  it('usa el método y la ruta de cada operación con su cuerpo', () => {
    servicio.obtener(5).subscribe();
    servicio.contextoVenta(7).subscribe();
    servicio.crear(cuerpo).subscribe();
    servicio.crearYEmitir(cuerpo).subscribe();
    servicio.actualizar(5, cuerpo).subscribe();
    servicio.validar(5).subscribe();
    servicio.emitir(5).subscribe();
    servicio.consultar(5).subscribe();
    servicio.anular(5, '  cliente recogió  ').subscribe();

    const esperado: Array<[string, string, unknown]> = [
      ['GET', urlConstants.guiaRemision.byId(5), null],
      ['GET', urlConstants.guiaRemision.contextoVenta(7), null],
      ['POST', urlConstants.guiaRemision.base, cuerpo],
      ['POST', urlConstants.guiaRemision.crearYEmitir, cuerpo],
      ['PUT', urlConstants.guiaRemision.byId(5), cuerpo],
      ['POST', urlConstants.guiaRemision.validar(5), {}],
      ['POST', urlConstants.guiaRemision.emitir(5), {}],
      ['POST', urlConstants.guiaRemision.consultar(5), {}],
      ['POST', urlConstants.guiaRemision.anular(5), { motivo: 'cliente recogió' }],
    ];
    // Solo lo que habla con SUNAT dentro de la petición espera más que el límite general.
    const conSunat = new Set([urlConstants.guiaRemision.crearYEmitir, urlConstants.guiaRemision.emitir(5), urlConstants.guiaRemision.consultar(5)]);
    for (const [metodo, url, body] of esperado) {
      const peticion = http.expectOne((r) => r.method === metodo && r.url === url);
      expect(peticion.request.body).toEqual(body);
      expect(peticion.request.context.get(TIEMPO_LIMITE_MS)).toBe(conSunat.has(url) ? LIMITE_SUNAT_MS : undefined);
      peticion.flush({});
    }
  });

  it('pide el PDF y los archivos como blob', () => {
    servicio.pdf(5).subscribe();
    servicio.archivo(5, 'cdr_xml').subscribe();
    const pdf = http.expectOne(urlConstants.guiaRemision.pdf(5));
    const cdr = http.expectOne(urlConstants.guiaRemision.archivo(5, 'cdr_xml'));
    expect(pdf.request.responseType).toBe('blob');
    expect(cdr.request.responseType).toBe('blob');
    pdf.flush(new Blob(['%PDF']));
    cdr.flush(new Blob(['<cdr/>']));
  });

  it('comparte el modo y los catálogos entre lecturas seguidas; forzar vuelve a pedir el modo', () => {
    const modos: boolean[] = [];
    servicio.modo().subscribe((m) => modos.push(m.activo));
    servicio.modo().subscribe((m) => modos.push(m.activo));
    http.expectOne(urlConstants.guiaRemision.modo).flush({ activo: false, codigo: 'GRE_SIN_BETA', motivo: 'Solo producción' });
    expect(modos).toEqual([false, false]);

    servicio.modo(true).subscribe((m) => modos.push(m.activo));
    http.expectOne(urlConstants.guiaRemision.modo).flush({ activo: true });
    expect(modos).toEqual([false, false, true]);

    servicio.catalogos().subscribe();
    servicio.catalogos().subscribe();
    http.expectOne(urlConstants.guiaRemision.catalogos).flush({ motivos: [] });
  });
});
