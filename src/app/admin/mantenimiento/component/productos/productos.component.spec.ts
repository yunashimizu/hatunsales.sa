import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ProductosComponent } from './productos.component';
import { urlConstants } from '../../../../constants/urlConstants';
import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { ProductoAdminService } from '../../../service/producto-admin.service';
import { ProductoImagenService } from '../../../service/producto-imagen.service';

/**
 * Ficha de producto: el stock que se edita es el de ESE producto en ESE almacén. Antes se
 * buscaba entre las 200 primeras filas del almacén y, si no estaba, se asumía 0: el ajuste
 * al guardar quedaba calculado contra 0.
 */
describe('ProductosComponent · stock de la ficha', () => {
  let http: HttpTestingController;
  let component: ProductosComponent;
  const producto: any = {
    id_producto: 9,
    nombre: 'Clavo 2"',
    descripcion: '',
    descripcion_corta: '',
    codigo_barras: '',
    sku: 'CLA-2',
    precio_compra: 0.1,
    precio_venta: 0.2,
    descuento: 0,
    unidad_medida: 'NIU',
    estado: true,
    destacado: false,
    stock_total: 999,
    total_imagenes: 0,
  };
  const productos = {
    listar: vi.fn(() => of([producto])),
    categorias: vi.fn(() => of([])),
    marcas: vi.fn(() => of([])),
    actualizar: vi.fn(() => of(producto)),
  };
  const alerta = { toast: vi.fn(), error: vi.fn(), confirm: vi.fn() };
  const filaInventario = (idProducto: number, stock: number) => ({ id_inventario: 1, id_producto: idProducto, id_almacen: 1, stock });
  const esDetallado = (r: { url: string }) => r.url === urlConstants.inventario.detallado;

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ProductosComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProductoAdminService, useValue: productos },
        { provide: ProductoImagenService, useValue: { listar: vi.fn(() => of([])) } },
        { provide: AlertService, useValue: alerta },
        { provide: AuthService, useValue: { puedeEditarCatalogo: () => true } },
      ],
    })
      .overrideComponent(ProductosComponent, { set: { template: '' } })
      .compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProductosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const conAlmacenes = () =>
    http.expectOne(urlConstants.inventario.almacenes).flush([{ id_almacen: 1, nombre: 'Principal', sucursal: 'Lurín' }]);

  it('pide el stock exacto (id_producto, una fila) y ajusta contra el stock real', () => {
    conAlmacenes();
    component.abrirEdicion(producto);

    const consulta = http.expectOne(esDetallado);
    expect(consulta.request.params.get('id_producto')).toBe('9');
    expect(consulta.request.params.get('id_almacen')).toBe('1');
    expect(consulta.request.params.get('por_pagina')).toBe('1');
    consulta.flush({ datos: [filaInventario(9, 230)], total: 1, pagina: 1, por_pagina: 1 });
    expect(component.stockActualEdicion).toBe(230);
    expect(component.stockVerificado).toBe(true);

    component.formulario.stock = 250;
    component.guardar();

    const ajuste = http.expectOne(urlConstants.inventario.ajuste);
    expect(ajuste.request.body).toEqual(expect.objectContaining({ id_producto: 9, id_almacen: 1, cantidad: 20 }));
    ajuste.flush({ stock: 250 });
  });

  it('sin fila en el almacén muestra 0 como dato real ("sin stock registrado")', () => {
    conAlmacenes();
    component.abrirEdicion(producto);
    http.expectOne(esDetallado).flush({ datos: [], total: 0, pagina: 1, por_pagina: 1 });

    expect(component.sinStockRegistrado).toBe(true);
    expect(component.stockVerificado).toBe(true);
    expect(component.stockActualEdicion).toBe(0);

    component.formulario.stock = 5;
    component.guardar();
    const ajuste = http.expectOne(urlConstants.inventario.ajuste);
    expect(ajuste.request.body.cantidad).toBe(5);
    ajuste.flush({ stock: 5 });
  });

  it('si la respuesta no trae este producto no asume 0 y no deja guardar', () => {
    conAlmacenes();
    component.abrirEdicion(producto);
    http.expectOne(esDetallado).flush({
      datos: [filaInventario(1, 50), filaInventario(2, 70)],
      total: 300,
      pagina: 1,
      por_pagina: 200,
    });

    expect(component.stockVerificado).toBe(false);
    expect(component.errorStock).toContain('No se pudo leer el stock');

    component.formulario.stock = 250;
    component.guardar();
    expect(productos.actualizar).not.toHaveBeenCalled();
    http.expectNone(urlConstants.inventario.ajuste);
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
  });

  it('si la ficha se abrió antes de llegar los almacenes, lee el stock en cuanto llegan', () => {
    component.abrirEdicion(producto);
    http.expectNone(esDetallado);

    conAlmacenes();
    const consulta = http.expectOne(esDetallado);
    expect(consulta.request.params.get('id_producto')).toBe('9');
    consulta.flush({ datos: [filaInventario(9, 12)], total: 1, pagina: 1, por_pagina: 1 });
    expect(component.stockActualEdicion).toBe(12);
  });
});
