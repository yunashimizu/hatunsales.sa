import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlConstants } from '../../constants/urlConstants';
import { Ubigeo, UbigeoService } from './ubigeo.service';

const LURIN: Ubigeo = { codigo: '150119', departamento: 'LIMA', provincia: 'LIMA', distrito: 'LURIN', texto: 'LURIN - LIMA - LIMA' };

describe('UbigeoService', () => {
  let servicio: UbigeoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(UbigeoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('no consulta con menos de 3 caracteres (el backend respondería 400)', () => {
    let resultado: Ubigeo[] | undefined;
    servicio.buscar(' lu ').subscribe((r) => (resultado = r));
    http.expectNone(() => true);
    expect(resultado).toEqual([]);
  });

  it('busca con q y reutiliza la misma búsqueda sin tildes ni mayúsculas', () => {
    const vistos: Ubigeo[][] = [];
    servicio.buscar('Lurín').subscribe((r) => vistos.push(r));
    const peticion = http.expectOne((r) => r.url === urlConstants.ubigeo.buscar);
    expect(peticion.request.params.get('q')).toBe('Lurín');
    peticion.flush([LURIN]);
    servicio.buscar('lurin ').subscribe((r) => vistos.push(r));
    http.expectNone(() => true);
    expect(vistos).toEqual([[LURIN], [LURIN]]);
  });

  it('un error no queda guardado: la siguiente búsqueda vuelve a pedir', () => {
    let error: unknown;
    servicio.buscar('miraflores').subscribe({ error: (e) => (error = e) });
    http.expectOne((r) => r.url === urlConstants.ubigeo.buscar).flush({ message: 'caído' }, { status: 500, statusText: 'Error' });
    expect(error).toBeTruthy();
    servicio.buscar('miraflores').subscribe();
    http.expectOne((r) => r.url === urlConstants.ubigeo.buscar).flush([]);
  });

  it('obtiene por código y rechaza un código mal formado sin consultar', () => {
    let ubigeo: Ubigeo | undefined;
    servicio.obtener('150119').subscribe((u) => (ubigeo = u));
    http.expectOne(urlConstants.ubigeo.byCodigo('150119')).flush(LURIN);
    expect(ubigeo?.distrito).toBe('LURIN');

    let mensaje = '';
    servicio.obtener('15011').subscribe({ error: (e: Error) => (mensaje = e.message) });
    http.expectNone(() => true);
    expect(mensaje).toContain('6 dígitos');
  });
});
