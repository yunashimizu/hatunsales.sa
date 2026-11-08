import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { urlConstants } from '../../constants/urlConstants';
import { ProductoAdminService } from './producto-admin.service';

describe('ProductoAdminService · código interno', () => {
  let servicio: ProductoAdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(ProductoAdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('generarCodigoInterno hace POST a producto/codigo-interno y entrega { codigo }', () => {
    let recibido: { codigo: string } | undefined;
    servicio.generarCodigoInterno().subscribe((r) => (recibido = r));

    const peticion = http.expectOne(urlConstants.producto.codigoInterno);
    expect(peticion.request.method).toBe('POST');
    expect(urlConstants.producto.codigoInterno.endsWith('producto/codigo-interno')).toBe(true);
    peticion.flush({ codigo: '2000000000015' });

    expect(recibido).toEqual({ codigo: '2000000000015' });
  });

  it('propaga el error del servidor (p. ej. secuencia sin crear)', () => {
    let error: any;
    servicio.generarCodigoInterno().subscribe({ error: (e) => (error = e) });

    http.expectOne(urlConstants.producto.codigoInterno)
      .flush({ message: 'Falta correr sql/codigo_interno_secuencia.sql' }, { status: 500, statusText: 'Server Error' });

    expect(error.status).toBe(500);
    expect(error.error.message).toContain('codigo_interno_secuencia.sql');
  });
});

/**
 * Categorías y marcas se comparten 60 s (abrir «Nuevo» o «Editar» no debe pedirlas otra vez);
 * Marcas y Categorías llaman a `invalidarCatalogos()` tras guardar o borrar.
 */
describe('ProductoAdminService · caché de categorías y marcas', () => {
  let servicio: ProductoAdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(ProductoAdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  it('dos marcas() seguidas hacen una sola petición y filtran las inactivas', () => {
    const recibidas: any[] = [];
    servicio.marcas().subscribe((m) => recibidas.push(m));
    http.expectOne(urlConstants.marca).flush([
      { id_marca: 1, nombre: 'Bosch' },
      { id_marca: 2, nombre: 'Vieja', activo: false },
    ]);

    servicio.marcas().subscribe((m) => recibidas.push(m));
    http.expectNone(urlConstants.marca);

    expect(recibidas).toEqual([[{ id_marca: 1, nombre: 'Bosch' }], [{ id_marca: 1, nombre: 'Bosch' }]]);
  });

  it('tras invalidarCatalogos() marcas() vuelve a pedir', () => {
    servicio.marcas().subscribe();
    http.expectOne(urlConstants.marca).flush([]);

    servicio.invalidarCatalogos();
    servicio.marcas().subscribe();
    http.expectOne(urlConstants.marca).flush([{ id_marca: 3, nombre: 'Stanley' }]);
  });

  it('dos categorias() seguidas hacen una sola petición; tras invalidarCatalogos() vuelve a pedir', () => {
    const recibidas: any[] = [];
    servicio.categorias().subscribe((c) => recibidas.push(c));
    http.expectOne(urlConstants.categoria).flush({ data: [{ id_categoria: 1, nombre: 'Obra' }] });

    servicio.categorias().subscribe((c) => recibidas.push(c));
    http.expectNone(urlConstants.categoria);
    expect(recibidas[1]).toEqual([{ id_categoria: 1, nombre: 'Obra' }]);

    servicio.invalidarCatalogos();
    servicio.categorias().subscribe();
    http.expectOne(urlConstants.categoria).flush([]);
  });

  it('pasados 60 s la caché vence y vuelve a pedir', () => {
    vi.useFakeTimers();
    servicio.categorias().subscribe();
    http.expectOne(urlConstants.categoria).flush([]);

    vi.setSystemTime(Date.now() + 59_000);
    servicio.categorias().subscribe();
    http.expectNone(urlConstants.categoria);

    vi.setSystemTime(Date.now() + 2_000);
    servicio.categorias().subscribe();
    http.expectOne(urlConstants.categoria).flush([]);
  });

  it('si /marca falla cae a /tienda/marcas y comparte ese resultado', () => {
    const recibidas: any[] = [];
    servicio.marcas().subscribe((m) => recibidas.push(m));
    http.expectOne(urlConstants.marca).flush('x', { status: 404, statusText: 'No' });
    http.expectOne(urlConstants.tienda.marcas).flush([{ id_marca: 5, nombre: 'Truper' }]);

    servicio.marcas().subscribe((m) => recibidas.push(m));
    http.expectNone(urlConstants.marca);
    expect(recibidas[1]).toEqual([{ id_marca: 5, nombre: 'Truper' }]);
  });

  it('si fallan ambas entrega [] y NO lo guarda: la siguiente llamada vuelve a pedir', () => {
    let primera: any;
    servicio.marcas().subscribe((m) => (primera = m));
    http.expectOne(urlConstants.marca).flush('x', { status: 500, statusText: 'Error' });
    http.expectOne(urlConstants.tienda.marcas).flush('x', { status: 500, statusText: 'Error' });
    expect(primera).toEqual([]);

    servicio.marcas().subscribe();
    http.expectOne(urlConstants.marca).flush([{ id_marca: 1, nombre: 'Bosch' }]);
  });
});
