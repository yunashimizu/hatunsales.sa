import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { urlConstants } from '../../../../constants/urlConstants';
import { AlertService } from '../../../../shared/services/alert.service';
import { ProductoSinCodigoSunat } from '../../../service/producto-admin.service';
import { RUTA_CATALOGO_25 } from './catalogo-sunat-25';
import { BUSQUEDA_LOTE, ProductosSinCodigoComponent } from './productos-sin-codigo.component';

function producto(id: number, cambios: Partial<ProductoSinCodigoSunat> = {}): ProductoSinCodigoSunat {
  return {
    id_producto: id,
    nombre: `PRODUCTO ${id}`,
    sku: `SKU-${id}`,
    codigo_barras: '',
    categoria: 'Cementos',
    unidad_medida: 'NIU',
    ...cambios,
  };
}

describe('ProductosSinCodigoComponent', () => {
  let fixture: ComponentFixture<ProductosSinCodigoComponent>;
  let component: ProductosSinCodigoComponent;
  let http: HttpTestingController;
  const alerta = {
    toast: vi.fn(),
    error: vi.fn(async () => ({}) as unknown),
  };

  const lectura = () => http.expectOne((r) => r.method === 'GET' && r.url === urlConstants.producto.sinCodigoSunat);
  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ProductosSinCodigoComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AlertService, useValue: alerta }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProductosSinCodigoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('pide hasta 500 productos y pinta el total y las filas', () => {
    const peticion = lectura();
    expect(peticion.request.params.get('limite')).toBe('500');
    peticion.flush({ total: 2, datos: [producto(1), producto(2, { categoria: null })] });
    fixture.detectChanges();

    expect(texto()).toContain('Productos sin código SUNAT');
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
    expect(texto()).toContain('PRODUCTO 1');
    expect(texto()).toContain('No hay código por defecto');
  });

  it('con código por defecto lo dice y con lista vacía muestra que todos tienen código', () => {
    fixture.componentRef.setInput('codigoDefecto', '30100000');
    lectura().flush({ total: 0, datos: [] });
    fixture.detectChanges();
    expect(texto()).toContain('Todos los productos tienen código');
    expect(texto()).toContain('30100000');
    expect(fixture.nativeElement.querySelector('tbody')).toBeNull();
  });

  it('asigna el código de una fila con la forma correcta, recarga y avisa al padre', () => {
    lectura().flush({ total: 2, datos: [producto(1), producto(2)] });
    const cambios: void[] = [];
    component.cambio.subscribe(() => cambios.push(undefined));

    component.codigos[2] = ' 30111500 ';
    component.guardarFila(producto(2));

    const put = http.expectOne((r) => r.method === 'PUT' && r.url === urlConstants.producto.codigoSunat);
    expect(put.request.body).toEqual({ asignaciones: [{ id_producto: 2, codigo_sunat: '30111500' }] });
    put.flush({ actualizados: 1, rechazados: [] });

    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(cambios.length).toBe(1);
    lectura().flush({ total: 1, datos: [producto(1)] });
    expect(component.productos.length).toBe(1);
    expect(component.codigos[2]).toBeUndefined();
  });

  it('rechaza un código de 7 dígitos o vacío sin llamar al servidor', () => {
    lectura().flush({ total: 1, datos: [producto(1)] });

    component.codigos[1] = '3011150';
    component.guardarFila(producto(1));
    component.codigos[1] = '';
    component.guardarFila(producto(1));
    component.seleccionados.add(1);
    component.codigoLote = '1234567';
    component.asignarSeleccionados();

    expect(alerta.toast).toHaveBeenCalledTimes(3);
    expect(alerta.toast).toHaveBeenCalledWith({ type: 'warning', title: 'El código SUNAT debe tener 8 dígitos' });
    http.expectNone((r) => r.method === 'PUT');
  });

  it('asigna un mismo código a los marcados y muestra los rechazados por nombre', () => {
    lectura().flush({ total: 3, datos: [producto(1), producto(2), producto(3)] });
    const cambios: void[] = [];
    component.cambio.subscribe(() => cambios.push(undefined));

    component.alternar(1, true);
    component.alternar(3, true);
    component.codigoLote = '30111500';
    component.asignarSeleccionados();

    const put = http.expectOne((r) => r.method === 'PUT' && r.url === urlConstants.producto.codigoSunat);
    expect(put.request.body).toEqual({
      asignaciones: [
        { id_producto: 1, codigo_sunat: '30111500' },
        { id_producto: 3, codigo_sunat: '30111500' },
      ],
    });
    put.flush({ actualizados: 1, rechazados: [{ id_producto: 3, motivo: 'Producto no encontrado' }] });

    expect(alerta.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'PRODUCTO 3: Producto no encontrado' }),
    );
    expect(cambios.length).toBe(1);
    expect(component.codigoLote).toBe('');
    lectura().flush({ total: 2, datos: [producto(2), producto(3)] });
    expect(component.seleccionados.has(1)).toBe(false);
    expect(component.seleccionados.has(3)).toBe(true);
  });

  it('muestra el error de la lectura con la opción de reintentar', () => {
    lectura().flush({ message: 'Internal server error' }, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();
    const aviso = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(aviso.textContent).toContain('No se pudo consultar los productos sin código SUNAT');
    (aviso.querySelector('button') as HTMLButtonElement).click();
    lectura().flush({ total: 0, datos: [] });
  });

  describe('buscador del catálogo 25 (S6)', () => {
    const CATALOGO = {
      fuente: 'Lista de apoyo (NO es el anexo oficial)',
      fecha: '2026-11-08',
      oficial: false,
      clases: [
        ['27111800', 'Martillos y mazos'],
        ['31211500', 'Pinturas'],
        ['31211900', 'Brochas, rodillos y accesorios de pintura'],
      ],
    };
    const buscadores = () => fixture.nativeElement.querySelectorAll('.sin-codigo-buscador');

    function abrirFila(id = 1): void {
      lectura().flush({ total: 2, datos: [producto(1), producto(2)] });
      fixture.detectChanges();
      (fixture.nativeElement.querySelectorAll('[data-prueba="buscar-fila"]')[id - 1] as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    function escribir(valor: string): void {
      const campo = fixture.nativeElement.querySelector('[data-prueba="texto-busqueda"]') as HTMLInputElement;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    it('abre el buscador de la fila, baja la lista una sola vez y filtra al escribir', async () => {
      abrirFila(1);
      http.expectOne(RUTA_CATALOGO_25).flush(CATALOGO);
      fixture.detectChanges();
      expect(buscadores().length).toBe(1);

      escribir('martillo');
      const opciones = Array.from(fixture.nativeElement.querySelectorAll('[data-prueba="resultado-busqueda"]')) as HTMLElement[];
      expect(opciones.length).toBe(1);
      expect(opciones[0].querySelector('.sin-codigo-buscador__codigo')?.textContent).toBe('27111800');
      expect(opciones[0].textContent).toContain('Martillos y mazos');
      expect(texto()).toContain('no es la oficial');

      // Cerrar y volver a abrir no vuelve a pedir el archivo.
      component.cerrarBusqueda();
      fixture.detectChanges();
      expect(buscadores().length).toBe(0);
      component.alternarBusqueda(2);
      http.expectNone(RUTA_CATALOGO_25);
    });

    it('elegir un resultado rellena el código de ESA fila y cierra el buscador', () => {
      abrirFila(2);
      http.expectOne(RUTA_CATALOGO_25).flush(CATALOGO);
      fixture.detectChanges();
      escribir('pintura');
      (fixture.nativeElement.querySelector('[data-prueba="resultado-busqueda"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(component.codigos[2]).toBe('31211500');
      expect(component.codigos[1]).toBeUndefined();
      expect(buscadores().length).toBe(0);
      const campo = fixture.nativeElement.querySelectorAll('.sin-codigo-input')[1] as HTMLInputElement;
      expect(component.esValido(component.codigos[2])).toBe(true);
      expect(campo).toBeTruthy();
    });

    it('el buscador del lote rellena «Código para los seleccionados»', () => {
      lectura().flush({ total: 1, datos: [producto(1)] });
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('[data-prueba="buscar-lote"]') as HTMLButtonElement).click();
      http.expectOne(RUTA_CATALOGO_25).flush(CATALOGO);
      fixture.detectChanges();
      expect(component.busquedaAbierta).toBe(BUSQUEDA_LOTE);

      escribir('2711');
      (fixture.nativeElement.querySelector('[data-prueba="resultado-busqueda"]') as HTMLButtonElement).click();
      expect(component.codigoLote).toBe('27111800');
    });

    it('sin resultados lo dice con una sugerencia y si la lista no carga permite reintentar', () => {
      abrirFila(1);
      http.expectOne(RUTA_CATALOGO_25).flush('boom', { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();
      expect(texto()).toContain('No se pudo cargar la lista de códigos');

      (fixture.nativeElement.querySelector('.sin-codigo-buscador__error button') as HTMLButtonElement).click();
      http.expectOne(RUTA_CATALOGO_25).flush(CATALOGO);
      fixture.detectChanges();
      escribir('zzzz');
      expect(texto()).toContain('No hay códigos con ese nombre');
    });

    it('Escape cierra el buscador', () => {
      abrirFila(1);
      http.expectOne(RUTA_CATALOGO_25).flush(CATALOGO);
      fixture.detectChanges();
      (buscadores()[0] as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(buscadores().length).toBe(0);
    });
  });
});
