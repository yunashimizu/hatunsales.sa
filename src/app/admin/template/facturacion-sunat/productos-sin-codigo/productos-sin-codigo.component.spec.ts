import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { urlConstants } from '../../../../constants/urlConstants';
import { AlertService } from '../../../../shared/services/alert.service';
import { ProductoSinCodigoSunat } from '../../../service/producto-admin.service';
import { ProductosSinCodigoComponent } from './productos-sin-codigo.component';

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
});
