import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { urlConstants } from '../../constants/urlConstants';
import { ProductoImagenService } from './producto-imagen.service';

describe('ProductoImagenService.reemplazar', () => {
  let http: HttpTestingController;
  let servicio: ProductoImagenService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    servicio = TestBed.inject(ProductoImagenService);
  });

  afterEach(() => http.verify());

  it('hace PUT multipart (campo «file») a /producto/:id/images/:imgId/archivo y devuelve la galería', () => {
    const archivo = new File(['x'], 'nueva.jpg', { type: 'image/jpeg' });
    let galeria: unknown;
    servicio.reemplazar(8, 3, archivo).subscribe((g) => (galeria = g));

    const peticion = http.expectOne(urlConstants.producto.imageArchivo(8, 3));
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.url).toMatch(/producto\/8\/images\/3\/archivo$/);
    const cuerpo = peticion.request.body as FormData;
    expect(cuerpo).toBeInstanceOf(FormData);
    expect((cuerpo.get('file') as File).name).toBe('nueva.jpg');
    // Sin Content-Type a mano: el navegador agrega el boundary del multipart.
    expect(peticion.request.headers.has('Content-Type')).toBe(false);
    peticion.flush([{ id_imagen: 3, url: '/archivos/9' }]);
    expect(galeria).toEqual([{ id_imagen: 3, url: '/archivos/9' }]);
  });
});
