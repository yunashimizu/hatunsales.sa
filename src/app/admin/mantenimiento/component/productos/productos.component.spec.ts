import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

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

/**
 * Fotos al crear: quedan en cola local y se suben (en trozos de 10) recién cuando el producto
 * existe. Si la subida falla el producto NO se vuelve a crear: el panel pasa a edición con la cola.
 */
describe('ProductosComponent · fotos al crear', () => {
  let component: ProductosComponent;
  let puntoVenta: PuntoVentaService;
  const nuevo: any = {
    id_producto: 2, nombre: 'Cinta', sku: 'CIN', codigo_barras: '', categoria: 'Otros',
    marca: '', id_categoria: 7, estado: true, stock_total: 0, total_imagenes: 0,
  };
  const productos = {
    listar: vi.fn(() => of([])),
    categorias: vi.fn(() => of([])),
    marcas: vi.fn(() => of([])),
    crear: vi.fn(() => of(nuevo)),
    actualizar: vi.fn(() => of(nuevo)),
  };
  const imagenes = {
    listar: vi.fn(() => of([])),
    subir: vi.fn((_id: number, archivos: File[]) =>
      of(archivos.map((a, i) => ({ id_imagen: i + 1, url: a.name, thumb_url: a.name, is_primary: i === 0 })))),
  };
  const alerta = { toast: vi.fn(), error: vi.fn(), confirm: vi.fn() };
  let revocadas: string[];
  let contador: number;

  const foto = (nombre: string, tipo = 'image/jpeg') => new File(['x'], nombre, { type: tipo });
  const fotos = (n: number) => Array.from({ length: n }, (_, i) => foto(`f${i + 1}.jpg`));
  const nombresSubidos = (llamada: number) => (imagenes.subir.mock.calls[llamada][1] as File[]).map((a) => a.name);

  beforeEach(async () => {
    vi.clearAllMocks();
    revocadas = [];
    contador = 0;
    (URL as any).createObjectURL = vi.fn(() => `blob:foto-${++contador}`);
    (URL as any).revokeObjectURL = vi.fn((url: string) => revocadas.push(url));
    await TestBed.configureTestingModule({
      imports: [ProductosComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProductoAdminService, useValue: productos },
        { provide: ProductoImagenService, useValue: imagenes },
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
    component.abrirNuevo();
    component.formulario.nombre = 'Cinta';
    component.formulario.precio_venta = 3;
    component.formulario.stock = 4;
  });

  it('las fotos válidas entran a la cola (la primera es la principal) y las inválidas se avisan por nombre', async () => {
    await component.agregarFotosPendientes([foto('a.jpg'), foto('b.heic', 'image/heic'), foto('c.png', 'image/png')]);

    expect(component.fotosPendientes.map((f) => f.archivo.name)).toEqual(['a.jpg', 'c.png']);
    expect(component.fotosPendientes.every((f) => f.vista.startsWith('blob:'))).toBe(true);
    expect(alerta.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning', title: 'b.heic: formato HEIC no admitido, use JPG o PNG' }),
    );
    expect(imagenes.subir).not.toHaveBeenCalled();
  });

  it('quitar y marcar principal reordenan la cola y quitar libera la miniatura', async () => {
    await component.agregarFotosPendientes(fotos(3));
    const vistas = component.fotosPendientes.map((f) => f.vista);

    component.hacerPrincipalPendiente(2);
    expect(component.fotosPendientes.map((f) => f.archivo.name)).toEqual(['f3.jpg', 'f1.jpg', 'f2.jpg']);

    component.alIniciarArrastreFoto(0);
    component.alSoltarFotoEn(2);
    expect(component.fotosPendientes.map((f) => f.archivo.name)).toEqual(['f1.jpg', 'f2.jpg', 'f3.jpg']);

    component.quitarFotoPendiente(1);
    expect(component.fotosPendientes.map((f) => f.archivo.name)).toEqual(['f1.jpg', 'f3.jpg']);
    expect(revocadas).toEqual([vistas[1]]);
  });

  it('crea el producto y luego sube las fotos en orden (principal primero); cierra con «Producto creado con N fotos»', async () => {
    await component.agregarFotosPendientes(fotos(3));
    component.hacerPrincipalPendiente(2);

    component.guardar();

    expect(productos.crear).toHaveBeenCalledTimes(1);
    expect(imagenes.subir).toHaveBeenCalledTimes(1);
    expect(productos.crear.mock.invocationCallOrder[0]).toBeLessThan(imagenes.subir.mock.invocationCallOrder[0]);
    expect(imagenes.subir.mock.calls[0][0]).toBe(2);
    expect(nombresSubidos(0)).toEqual(['f3.jpg', 'f1.jpg', 'f2.jpg']);
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Producto creado con 3 fotos' }));
    expect(alerta.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Producto creado' }));
    expect(component.panelAbierto).toBe(false);
    expect(component.guardando).toBe(false);
    expect(component.fotosPendientes).toEqual([]);
    expect(revocadas.length).toBe(3);
    expect(puntoVenta.invalidarCatalogo).toHaveBeenCalled();
    expect(component.productos[0]).toEqual(expect.objectContaining({ id_producto: 2, total_imagenes: 3, imagen_url: 'f3.jpg' }));
  });

  it('sin fotos mantiene el flujo de antes (queda en edición, toast «Producto creado»)', () => {
    component.guardar();

    expect(imagenes.subir).not.toHaveBeenCalled();
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Producto creado' }));
    expect(component.editando).toBe(nuevo);
    expect(component.panelAbierto).toBe(true);
  });

  it('respeta el límite del backend: 23 fotos se suben en lotes de 10, 10 y 3', async () => {
    await component.agregarFotosPendientes(fotos(23));

    component.guardar();

    expect(imagenes.subir).toHaveBeenCalledTimes(3);
    expect([0, 1, 2].map((i) => nombresSubidos(i).length)).toEqual([10, 10, 3]);
    expect(nombresSubidos(1)[0]).toBe('f11.jpg');
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Producto creado con 23 fotos' }));
  });

  it('creación OK y subida fallida: no duplica el producto, pasa a edición con la cola y se puede reintentar', async () => {
    await component.agregarFotosPendientes(fotos(2));
    imagenes.subir.mockReturnValueOnce(throwError(() => new Error('red caída')));

    component.guardar();

    expect(productos.crear).toHaveBeenCalledTimes(1);
    expect(component.panelAbierto).toBe(true);
    expect(component.editando).toBe(nuevo);
    expect(component.guardando).toBe(false);
    expect(component.subiendo).toBe(false);
    expect(component.fotosPendientes.map((f) => f.archivo.name)).toEqual(['f1.jpg', 'f2.jpg']);
    expect(component.fotosPendientes.every((f) => !!f.error)).toBe(true);
    expect(alerta.error).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Producto creado; 2 fotos no se subieron' }),
    );
    expect(revocadas).toEqual([]);

    component.reintentarFotosPendientes();

    expect(productos.crear).toHaveBeenCalledTimes(1);
    expect(imagenes.subir).toHaveBeenCalledTimes(2);
    expect(imagenes.subir.mock.calls[1][0]).toBe(2);
    expect(nombresSubidos(1)).toEqual(['f1.jpg', 'f2.jpg']);
    expect(component.fotosPendientes).toEqual([]);
    expect(component.imagenes.length).toBe(2);
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: '2 fotos subidas' }));
  });

  it('si falla el segundo lote, el primero ya no está en la cola y solo se reintenta el resto', async () => {
    await component.agregarFotosPendientes(fotos(12));
    imagenes.subir
      .mockReturnValueOnce(of(fotos(10).map((a, i) => ({ id_imagen: i + 1, url: a.name, is_primary: i === 0 })) as any))
      .mockReturnValueOnce(throwError(() => new Error('timeout')));

    component.guardar();

    expect(component.fotosPendientes.map((f) => f.archivo.name)).toEqual(['f11.jpg', 'f12.jpg']);
    expect(alerta.error).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Producto creado; 2 fotos no se subieron' }),
    );

    component.reintentarFotosPendientes();

    expect(nombresSubidos(2)).toEqual(['f11.jpg', 'f12.jpg']);
    expect(productos.crear).toHaveBeenCalledTimes(1);
    expect(component.fotosPendientes).toEqual([]);
  });

  it('no deja crear mientras se preparan las fotos', async () => {
    const preparando = component.agregarFotosPendientes(fotos(1));
    expect(component.preparandoFotos).toBe(true);

    component.guardar();
    expect(productos.crear).not.toHaveBeenCalled();
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));

    await preparando;
    expect(component.preparandoFotos).toBe(false);
  });

  it('cancelar el panel y destruir el componente liberan las miniaturas', async () => {
    await component.agregarFotosPendientes(fotos(2));
    component.cerrarPanel();
    expect(component.fotosPendientes).toEqual([]);
    expect(revocadas.sort()).toEqual(['blob:foto-1', 'blob:foto-2']);

    component.abrirNuevo();
    await component.agregarFotosPendientes(fotos(1));
    component.ngOnDestroy();
    expect(revocadas).toContain('blob:foto-3');
  });
});

describe('ProductosComponent · corregir y subir varias fotos (producto existente)', () => {
  let component: ProductosComponent;
  let puntoVenta: PuntoVentaService;
  const existente: any = {
    id_producto: 8, nombre: 'Cemento', sku: 'CEM', codigo_barras: '', categoria: 'Obra', marca: '',
    id_categoria: 7, estado: true, stock_total: 5, total_imagenes: 3, imagen_url: 'a.jpg', thumb_url: 'a.jpg',
  };
  const galeria = (...nombres: string[]) =>
    nombres.map((n, i) => ({ id_imagen: i + 1, url: n, thumb_url: n, is_primary: i === 0 }));
  const productos = {
    listar: vi.fn(() => of([existente])),
    categorias: vi.fn(() => of([])),
    marcas: vi.fn(() => of([])),
    actualizar: vi.fn(() => of(existente)),
  };
  const imagenes = {
    listar: vi.fn((_id: number) => of(galeria('a.jpg', 'b.jpg', 'c.jpg'))),
    subir: vi.fn((_id: number, archivos: File[]) => of(galeria(...archivos.map((a) => a.name)))),
    reemplazar: vi.fn((_id: number, _img: number, archivo: File) => of(galeria('a.jpg', archivo.name, 'c.jpg'))),
  };
  const alerta = { toast: vi.fn(), error: vi.fn(), confirm: vi.fn() };

  const foto = (nombre: string, tipo = 'image/jpeg') => new File(['x'], nombre, { type: tipo });
  const fotos = (n: number) => Array.from({ length: n }, (_, i) => foto(`f${i + 1}.jpg`));
  const nombresSubidos = (llamada: number) => (imagenes.subir.mock.calls[llamada][1] as File[]).map((a) => a.name);

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ProductosComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProductoAdminService, useValue: productos },
        { provide: ProductoImagenService, useValue: imagenes },
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
    component.abrirEdicion(existente);
    vi.clearAllMocks();
  });

  it('reemplazar llama al servicio con la foto preparada, refresca la galería y la lista, e invalida el POS', async () => {
    await component.reemplazarImagen(component.imagenes[1], foto('nueva.jpg'));

    expect(imagenes.reemplazar).toHaveBeenCalledTimes(1);
    expect(imagenes.reemplazar.mock.calls[0].slice(0, 2)).toEqual([8, 2]);
    expect((imagenes.reemplazar.mock.calls[0][2] as File).name).toBe('nueva.jpg');
    expect(component.imagenes.map((i) => i.url)).toEqual(['a.jpg', 'nueva.jpg', 'c.jpg']);
    expect(component.imagenes[0].is_primary).toBe(true);
    expect(puntoVenta.invalidarCatalogo).toHaveBeenCalled();
    expect(component.productos.find((p) => p.id_producto === 8)).toEqual(
      expect.objectContaining({ imagen_url: 'a.jpg', total_imagenes: 3 }),
    );
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Foto reemplazada' }));
    expect(component.reemplazandoId).toBeNull();
  });

  it('reemplazar con un formato no admitido avisa por nombre y no llama al servicio', async () => {
    await component.reemplazarImagen(component.imagenes[0], foto('iphone.heic', 'image/heic'));

    expect(imagenes.reemplazar).not.toHaveBeenCalled();
    expect(alerta.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning', title: 'iphone.heic: formato HEIC no admitido, use JPG o PNG' }),
    );
    expect(component.reemplazandoId).toBeNull();
  });

  it('si el reemplazo falla avisa, recarga la galería y deja libre el botón', async () => {
    imagenes.reemplazar.mockReturnValueOnce(throwError(() => new Error('red caída')));

    await component.reemplazarImagen(component.imagenes[1], foto('nueva.jpg'));

    expect(alerta.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'No se pudo reemplazar la foto' }));
    expect(imagenes.listar).toHaveBeenCalledWith(8);
    expect(component.reemplazandoId).toBeNull();
  });

  it('subir varias valida cada foto, las parte en lotes de 10 y muestra «Subiendo 1–10 de 23…»', async () => {
    const textos: string[] = [];
    imagenes.subir.mockImplementation((_id: number, archivos: File[]) => {
      textos.push(component.textoSubida);
      return of(galeria(...archivos.map((a) => a.name)));
    });

    await component.subirArchivos([...fotos(23), foto('raro.bmp', 'image/bmp')]);

    expect(imagenes.subir).toHaveBeenCalledTimes(3);
    expect([0, 1, 2].map((i) => nombresSubidos(i).length)).toEqual([10, 10, 3]);
    expect(textos).toEqual(['Subiendo 1–10 de 23…', 'Subiendo 11–20 de 23…', 'Subiendo 21–23 de 23…']);
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: '23 imágenes subidas' }));
    expect(component.subiendo).toBe(false);
    expect(component.progresoSubida).toBeNull();
    expect(puntoVenta.invalidarCatalogo).toHaveBeenCalled();
  });

  it('con una foto el avance dice «Subiendo 1 de 1…»', async () => {
    let texto = '';
    imagenes.subir.mockImplementation((_id: number, archivos: File[]) => {
      texto = component.textoSubida;
      return of(galeria(...archivos.map((a) => a.name)));
    });

    await component.subirArchivos([foto('sola.jpg')]);

    expect(texto).toBe('Subiendo 1 de 1…');
  });

  it('si un lote falla, recarga la galería para mostrar lo que sí quedó guardado y no sigue con los demás', async () => {
    imagenes.subir
      .mockImplementationOnce((_id: number, archivos: File[]) => of(galeria(...archivos.map((a) => a.name))))
      .mockImplementationOnce(() => throwError(() => new Error('Cloudinary caído')));

    await component.subirArchivos(fotos(25));

    expect(imagenes.subir).toHaveBeenCalledTimes(2);
    expect(alerta.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'Se subieron 10 de 25; el resto no' }));
    expect(imagenes.listar).toHaveBeenCalledWith(8);
    expect(component.imagenes.map((i) => i.url)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(component.subiendo).toBe(false);
    expect(component.progresoSubida).toBeNull();
  });

  it('si todas las fotos elegidas son inválidas no sube nada', async () => {
    await component.subirArchivos([foto('a.heic', 'image/heic')]);

    expect(imagenes.subir).not.toHaveBeenCalled();
    expect(component.subiendo).toBe(false);
    expect(component.preparandoFotos).toBe(false);
  });
});

describe('ProductosComponent · código interno y etiquetas', () => {
  let component: ProductosComponent;
  const productos = {
    listar: vi.fn(() => of([])),
    categorias: vi.fn(() => of([])),
    marcas: vi.fn(() => of([])),
    generarCodigoInterno: vi.fn(),
  };
  const alerta = { toast: vi.fn(), error: vi.fn(), confirm: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    productos.generarCodigoInterno.mockReturnValue(of({ codigo: '2000000000015' }));
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
    const fixture = TestBed.createComponent(ProductosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('generar código escribe el código del servidor en el campo de barras', () => {
    component.abrirNuevo();
    component.generarCodigoInterno();

    expect(productos.generarCodigoInterno).toHaveBeenCalledTimes(1);
    expect(component.formulario.codigo_barras).toBe('2000000000015');
    expect(component.generandoCodigo).toBe(false);
  });

  it('si el campo ya tiene valor no pide nada ni lo pisa', () => {
    component.abrirNuevo();
    component.formulario.codigo_barras = '7501234567893';
    component.generarCodigoInterno();

    expect(productos.generarCodigoInterno).not.toHaveBeenCalled();
    expect(component.formulario.codigo_barras).toBe('7501234567893');
  });

  it('mientras pide no lanza una segunda petición; si el usuario escribió, no lo pisa', () => {
    const respuesta = new Subject<{ codigo: string }>();
    productos.generarCodigoInterno.mockReturnValue(respuesta);
    component.abrirNuevo();

    component.generarCodigoInterno();
    component.generarCodigoInterno();
    expect(productos.generarCodigoInterno).toHaveBeenCalledTimes(1);
    expect(component.generandoCodigo).toBe(true);

    component.formulario.codigo_barras = 'ESCANEADO-1';
    respuesta.next({ codigo: '2000000000015' });
    respuesta.complete();

    expect(component.formulario.codigo_barras).toBe('ESCANEADO-1');
    expect(component.generandoCodigo).toBe(false);
  });

  it('si el servidor falla avisa con el mensaje y deja el campo vacío', () => {
    productos.generarCodigoInterno.mockReturnValue(
      throwError(() => ({ status: 500, error: { message: 'Falta correr sql/codigo_interno_secuencia.sql' } })),
    );
    component.abrirNuevo();
    component.generarCodigoInterno();

    expect(alerta.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'No se pudo generar el código' }));
    expect(component.formulario.codigo_barras).toBe('');
    expect(component.generandoCodigo).toBe(false);
  });

  it('abrir y cerrar etiquetas guarda y limpia el producto', () => {
    const producto: any = { id_producto: 1, nombre: 'Martillo', precio_venta: 10, codigo_barras: '2000000000015' };
    component.abrirEtiquetas(producto);
    expect(component.etiquetasProducto).toBe(producto);
    component.cerrarEtiquetas();
    expect(component.etiquetasProducto).toBeNull();
  });
});
