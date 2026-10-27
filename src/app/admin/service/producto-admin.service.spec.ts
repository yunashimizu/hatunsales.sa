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
