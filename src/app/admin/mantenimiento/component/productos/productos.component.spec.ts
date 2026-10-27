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
import { PuntoVentaService } from '../../../service/punto-venta.service';
import { UnidadMedidaService } from '../../../service/unidad-medida.service';

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

/**
 * Un producto nuevo debe verse siempre: el POS no puede quedarse con su caché de 3 min
 * y la lista no debe esconderlo por filtros que había activos.
 */
describe('ProductosComponent · visibilidad del producto nuevo', () => {
  let component: ProductosComponent;
  let puntoVenta: PuntoVentaService;
  const existente: any = {
    id_producto: 1, nombre: 'Martillo', sku: 'MAR', codigo_barras: '', categoria: 'Herramientas',
    marca: '', id_categoria: 5, estado: true, stock_total: 10, total_imagenes: 1,
  };
  const nuevo: any = {
    id_producto: 2, nombre: 'Cinta', sku: 'CIN', codigo_barras: '', categoria: 'Otros',
    marca: '', id_categoria: 7, estado: true, stock_total: 0, total_imagenes: 0,
  };
  const productos = {
    listar: vi.fn(() => of([existente])),
    categorias: vi.fn(() => of([])),
    marcas: vi.fn(() => of([])),
    crear: vi.fn(() => of(nuevo)),
    actualizar: vi.fn(() => of(existente)),
    eliminar: vi.fn(() => of(undefined)),
  };
  const alerta = { toast: vi.fn(), error: vi.fn(), confirm: vi.fn() };

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
    puntoVenta = TestBed.inject(PuntoVentaService);
    vi.spyOn(puntoVenta, 'invalidarCatalogo');
    const fixture = TestBed.createComponent(ProductosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const llenarNuevo = (stock: number) => {
    component.abrirNuevo();
    component.formulario.nombre = 'Cinta';
    component.formulario.precio_venta = 3;
    component.formulario.stock = stock;
  };

  it('crear con filtros activos que lo esconden: limpia los filtros e invalida el catálogo del POS', () => {
    component.filtroCategoria = 5;
    component.filtroEstado = 'activos';
    component.filtro = 'martillo';
    llenarNuevo(4);

    component.guardar();

    expect(component.productosFiltrados.map((p) => p.id_producto)).toContain(2);
    expect(component.filtro).toBe('');
    expect(component.filtroCategoria).toBe('');
    expect(component.filtroEstado).toBe('');
    expect(puntoVenta.invalidarCatalogo).toHaveBeenCalled();
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Producto creado' }));
  });

  it('crear con filtros que sí lo muestran: no toca los filtros', () => {
    component.filtroEstado = 'activos';
    llenarNuevo(4);

    component.guardar();

    expect(component.filtroEstado).toBe('activos');
  });

  it('crear con stock 0 avisa que no se podrá vender hasta ingresar stock', () => {
    llenarNuevo(0);

    component.guardar();

    expect(alerta.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Creado sin stock: no se podrá vender hasta ingresar stock' }),
    );
  });

  it('eliminar y alternar estado invalidan el catálogo del POS', async () => {
    alerta.confirm.mockResolvedValue({ isConfirmed: true });
    (puntoVenta.invalidarCatalogo as any).mockClear();

    component.alternarEstado(existente);
    expect(puntoVenta.invalidarCatalogo).toHaveBeenCalledTimes(1);

    await component.eliminar(existente);
    expect(puntoVenta.invalidarCatalogo).toHaveBeenCalledTimes(2);
  });
});

/**
 * Unidad de medida: un producto cargado con un valor antiguo (UND, kg) se guarda con su código
 * y uno que no es ninguna unidad conocida no se envía (el selector lo marca inválido).
 */
describe('ProductosComponent · unidad de medida', () => {
  let http: HttpTestingController;
  let component: ProductosComponent;
  const base: any = {
    id_producto: 9, nombre: 'Plancha', descripcion: '', descripcion_corta: '', codigo_barras: '', sku: 'PL',
    precio_compra: 1, precio_venta: 2, descuento: 0, unidad_medida: 'UND', estado: true, destacado: false,
    stock_total: 3, total_imagenes: 0,
  };
  const productos = {
    listar: vi.fn(() => of([base])),
    categorias: vi.fn(() => of([])),
    marcas: vi.fn(() => of([])),
    actualizar: vi.fn(() => of(base)),
  };
  const alerta = { toast: vi.fn(), error: vi.fn(), confirm: vi.fn() };

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
    http.expectOne(urlConstants.inventario.almacenes).flush([{ id_almacen: 1, nombre: 'Principal', sucursal: 'Lurín' }]);
  });

  afterEach(() => http.verify());

  /** Carga el catálogo del servidor para que una unidad desconocida cuente como inválida. */
  const conCatalogoDelServidor = () => {
    TestBed.inject(UnidadMedidaService).cargar().subscribe();
    http.expectOne(urlConstants.producto.unidades).flush({
      grupos: ['Conteo'],
      unidades: [{ codigo: 'NIU', nombre: 'Unidad', abreviatura: 'und', grupo: 'Conteo', frecuente: true, visible: true }],
      alias: { UND: 'NIU' },
    });
  };

  const abrirYVerificarStock = (producto: any) => {
    component.abrirEdicion(producto);
    http.expectOne((r) => r.url === urlConstants.inventario.detallado)
      .flush({ datos: [{ id_inventario: 1, id_producto: 9, id_almacen: 1, stock: 3 }], total: 1, pagina: 1, por_pagina: 1 });
  };

  it('editar un producto con UND se puede guardar y envía NIU', () => {
    conCatalogoDelServidor();
    abrirYVerificarStock(base);
    expect(component.formulario.unidad_medida).toBe('UND');

    component.guardar();

    expect(productos.actualizar).toHaveBeenCalledWith(9, expect.objectContaining({ unidad_medida: 'NIU' }));
  });

  it('una unidad que no es ninguna conocida corta el guardado con un aviso', () => {
    conCatalogoDelServidor();
    abrirYVerificarStock({ ...base, unidad_medida: 'Plancha X' });

    component.guardar();

    expect(productos.actualizar).not.toHaveBeenCalled();
    expect(alerta.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning', title: expect.stringContaining('Plancha X') }),
    );
  });

  it('un producto sin unidad se guarda como NIU', () => {
    conCatalogoDelServidor();
    abrirYVerificarStock({ ...base, unidad_medida: '' });

    component.guardar();

    expect(productos.actualizar).toHaveBeenCalledWith(9, expect.objectContaining({ unidad_medida: 'NIU' }));
  });
});
