import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlConstants } from '../../constants/urlConstants';
import { PuntoVentaService, SolicitudVenta } from './punto-venta.service';

describe('PuntoVentaService: API del POS', () => {
  let service: PuntoVentaService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PuntoVentaService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('manda el preview al endpoint backend sin registrar una venta', () => {
    const solicitud: SolicitudVenta = {
      id_tipo: 2,
      emitir_comprobante: true,
      items: [{ id_producto: 5, cantidad: 2, precio_unitario: 10, descuento: 0.2 }],
    };

    service.preview(solicitud).subscribe();

    const peticion = http.expectOne(urlConstants.puntoVenta.preview);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(solicitud);
    expect(peticion.request.body.items[0]).toMatchObject({
      cantidad: 2,
      descuento: 0.2,
    });
    expect(peticion.request.withCredentials).toBe(true);
    peticion.flush({});
  });

  it('registra el cobro en el endpoint POS con la misma clave idempotente y descuento unitario', () => {
    const solicitud: SolicitudVenta = {
      id_tipo: 2,
      emitir_comprobante: true,
      clave_idempotencia: 'pos-test-123',
      items: [{ id_producto: 5, cantidad: 2, precio_unitario: 10, descuento: 0.2 }],
      pagos: [{ id_metodo: 1, monto: 19.6 }],
    };

    service.registrar(solicitud).subscribe();

    const peticion = http.expectOne(urlConstants.puntoVenta.base);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(solicitud);
    expect(peticion.request.body.clave_idempotencia).toBe('pos-test-123');
    expect(peticion.request.body.items[0].descuento).toBe(0.2);
    expect(peticion.request.withCredentials).toBe(true);
    peticion.flush({ id_venta: 7 });
  });

  it('propaga errores al cargar el contexto en vez de presentarlos como si no hubiera almacenes', () => {
    let errorRecibido: unknown;
    service.contextoPos().subscribe({ error: (error) => (errorRecibido = error) });

    const peticion = http.expectOne(urlConstants.puntoVenta.contextoPos);
    peticion.flush(
      { message: 'Servicio no disponible' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(errorRecibido).toMatchObject({ status: 503 });
  });
});
