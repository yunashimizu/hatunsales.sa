import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlConstants } from '../../constants/urlConstants';
import { EventoPanel, EventosPanelService } from './eventos-panel.service';
import { InventarioAdminService } from './inventario-admin.service';

describe('InventarioAdminService: resumen compartido y avisos al panel', () => {
  let servicio: InventarioAdminService;
  let http: HttpTestingController;
  const resumen = { productos: 10, sin_stock: 1, bajo_stock: 2, valorizado: 100, unidades: 50 };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(InventarioAdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('invalidarResumen hace que la siguiente lectura consulte de nuevo en vez de usar la guardada', () => {
    servicio.resumen().subscribe();
    http.expectOne(urlConstants.inventario.resumen).flush(resumen);
    servicio.resumen().subscribe(); // dentro de los 5 s: sin petición nueva
    http.expectNone(urlConstants.inventario.resumen);

    servicio.invalidarResumen();
    servicio.resumen().subscribe();
    http.expectOne(urlConstants.inventario.resumen).flush({ ...resumen, sin_stock: 0 });
  });

  it('ajustar y transferir publican «stock-cambio»; un fallo no publica nada', () => {
    const eventos: EventoPanel[] = [];
    TestBed.inject(EventosPanelService).de('stock-cambio').subscribe((e) => eventos.push(e));

    servicio.ajustar({ id_producto: 5, id_almacen: 1, cantidad: 3, motivo: 'conteo' }).subscribe();
    http.expectOne(urlConstants.inventario.ajuste).flush({ stock: 9 });
    servicio.transferir({ id_producto: 6, id_almacen_origen: 1, id_almacen_destino: 2, cantidad: 1 }).subscribe();
    http.expectOne(urlConstants.inventario.transferencia).flush({});
    expect(eventos.map((e) => e.datos?.['id_producto'])).toEqual([5, 6]);

    servicio.ajustar({ id_producto: 5, id_almacen: 1, cantidad: 3, motivo: 'conteo' }).subscribe({ error: () => undefined });
    http.expectOne(urlConstants.inventario.ajuste).flush({ message: 'x' }, { status: 400, statusText: 'Bad Request' });
    expect(eventos.length).toBe(2);
  });
});
