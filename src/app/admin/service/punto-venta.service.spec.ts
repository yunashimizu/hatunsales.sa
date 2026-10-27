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

  describe('porCodigoBarras: el código viaja como parámetro HTTP', () => {
    it('un código con / ? y % llega íntegro y codificado en la query', () => {
      const codigo = 'AB/12?%3#+';

      service.porCodigoBarras(codigo, 4).subscribe();

      const peticion = http.expectOne((r) => r.url === urlConstants.puntoVenta.porCodigoBarras);
      expect(peticion.request.method).toBe('GET');
      expect(peticion.request.params.get('codigo')).toBe(codigo);
      expect(peticion.request.params.get('id_almacen')).toBe('4');
      // Lo que ve el servidor tras decodificar la query es el código original (`%`, `#` y `+` van codificados).
      const consulta = new URLSearchParams(peticion.request.urlWithParams.split('?').slice(1).join('?'));
      expect(consulta.get('codigo')).toBe(codigo);
      expect(peticion.request.urlWithParams).toContain('%253%23%2B');
      expect(peticion.request.urlWithParams).not.toContain('barcode/AB');
      expect(peticion.request.withCredentials).toBe(true);
      peticion.flush({});
    });

    it('limpia saltos de línea del lector y no manda id_almacen si no hay', () => {
      service.porCodigoBarras('7501234567890\r\n').subscribe();

      const peticion = http.expectOne((r) => r.url === urlConstants.puntoVenta.porCodigoBarras);
      expect(peticion.request.params.get('codigo')).toBe('7501234567890');
      expect(peticion.request.params.has('id_almacen')).toBe(false);
      peticion.flush({});
    });
  });

  describe('porCodigoLocal', () => {
    it('ignora saltos de línea y espacios del lector al comparar con el catálogo', () => {
      (service as any).catalogo = [{ id_producto: 1, nombre: 'CEMENTO', codigo_barras: '7501234567890', sku: 'CEM-01' }];

      expect(service.porCodigoLocal('7501234567890\r\n')?.id_producto).toBe(1);
      expect(service.porCodigoLocal(' cem-01 ')?.id_producto).toBe(1);
      expect(service.porCodigoLocal('000')).toBeNull();
    });

    it('el código de barras exacto gana al SKU de otro producto', () => {
      (service as any).catalogo = [
        { id_producto: 1, nombre: 'POR SKU', codigo_barras: '111', sku: '7501234567890' },
        { id_producto: 2, nombre: 'POR BARRAS', codigo_barras: '7501234567890', sku: 'X-2' },
      ];

      expect(service.porCodigoLocal('7501234567890')?.id_producto).toBe(2);
    });

    it('el vacío o solo espacios devuelve null', () => {
      (service as any).catalogo = [{ id_producto: 1, nombre: 'CEMENTO', codigo_barras: '1', sku: 'A' }];

      expect(service.porCodigoLocal('')).toBeNull();
      expect(service.porCodigoLocal('  \r\n')).toBeNull();
    });
  });

  describe('resolverCodigo: local, luego servidor, y nunca emite error', () => {
    const resolver = (codigo: string, idAlmacen?: number) => {
      const resultados: unknown[] = [];
      let fallo: unknown = null;
      service.resolverCodigo(codigo, idAlmacen).subscribe({
        next: (r) => resultados.push(r),
        error: (e) => (fallo = e),
      });
      return { resultados, fallo: () => fallo };
    };
    const peticion = () => http.expectOne((r) => r.url === urlConstants.puntoVenta.porCodigoBarras);

    it('si está en el catálogo en memoria responde sin tocar la red', () => {
      const cemento = { id_producto: 1, nombre: 'CEMENTO', codigo_barras: '7501234567890', sku: 'CEM-01' };
      (service as any).catalogo = [cemento];

      const { resultados } = resolver('7501234567890\r\n', 3);

      expect(resultados).toEqual([{ estado: 'ok', producto: cemento }]);
      http.expectNone((r) => r.url === urlConstants.puntoVenta.porCodigoBarras);
    });

    it('si no está en memoria pregunta al servidor con el almacén y devuelve el producto', () => {
      const { resultados } = resolver('999888777', 3);

      const p = peticion();
      expect(p.request.params.get('codigo')).toBe('999888777');
      expect(p.request.params.get('id_almacen')).toBe('3');
      p.flush({ id_producto: 8, nombre: 'CLAVO' });

      expect(resultados).toEqual([{ estado: 'ok', producto: { id_producto: 8, nombre: 'CLAVO' } }]);
    });

    it('un 404 es «no_existe», no un error', () => {
      const { resultados, fallo } = resolver('000111222');

      peticion().flush({ message: 'No existe' }, { status: 404, statusText: 'Not Found' });

      expect(resultados).toEqual([{ estado: 'no_existe' }]);
      expect(fallo()).toBeNull();
    });

    it('un 409 PRODUCTO_INACTIVO es «inactivo» con el mensaje del servidor', () => {
      const { resultados } = resolver('555666777');

      peticion().flush(
        { codigo: 'PRODUCTO_INACTIVO', id_producto: 4, message: 'El producto "TUBO" existe pero está inactivo' },
        { status: 409, statusText: 'Conflict' },
      );

      expect(resultados).toEqual([{ estado: 'inactivo', mensaje: 'El producto "TUBO" existe pero está inactivo' }]);
    });

    it('un corte de red u otro fallo es «error» con mensaje, distinto de «no_existe»', () => {
      const { resultados, fallo } = resolver('123456789');

      peticion().error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

      expect(resultados).toHaveLength(1);
      expect(resultados[0]).toMatchObject({ estado: 'error', mensaje: expect.any(String) });
      expect((resultados[0] as { mensaje: string }).mensaje.length).toBeGreaterThan(0);
      expect(fallo()).toBeNull();
    });

    it('un 409 que no es de producto inactivo también es «error», no «inactivo»', () => {
      const { resultados } = resolver('123456789');

      peticion().flush({ message: 'Conflicto' }, { status: 409, statusText: 'Conflict' });

      expect(resultados[0]).toMatchObject({ estado: 'error' });
    });
  });
});
