import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlConstants } from '../../constants/urlConstants';
import { AlertService } from '../../shared/services/alert.service';
import { Carrito } from '../models/tienda.models';
import { CartService } from './cart.service';

const CLAVE_TOKEN = 'tienda_token_invitado';

function carrito(parcial: Partial<Carrito> = {}): Carrito {
  return { id_carrito: 9, items: [], cantidad_items: 0, subtotal: 0, igv: 0, total: 0, ...parcial };
}

const LINEA = {
  id_item: 1,
  id_producto: 5,
  nombre: 'Taladro percutor',
  imagen: null,
  cantidad: 2,
  precio_unitario: 10,
  subtotal: 20,
  stock_disponible: 9,
  excede_stock: false,
};

describe('CartService', () => {
  let servicio: CartService;
  let backend: HttpTestingController;
  let toast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    toast = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AlertService, useValue: { toast } }],
    });
    servicio = TestBed.inject(CartService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('sin sesión ni carrito de invitado no consulta al servidor: el carrito está vacío (R05)', () => {
    let recibido: Carrito | undefined;
    servicio.cargar().subscribe((c) => (recibido = c));

    backend.expectNone(() => true);
    expect(recibido?.items).toEqual([]);
    expect(servicio.actual.id_carrito).toBe(0);
  });

  it('con un carrito de invitado lo pide al servidor con su token', () => {
    localStorage.setItem(CLAVE_TOKEN, 't-1');
    servicio.cargar().subscribe();

    const peticion = backend.expectOne((r) => r.url === urlConstants.tienda.carrito);
    expect(peticion.request.params.get('token_invitado')).toBe('t-1');
    peticion.flush(carrito({ token_invitado: 't-1', items: [LINEA], cantidad_items: 2, total: 20 }));

    expect(servicio.cantidad).toBe(2);
  });

  it('olvida un token de invitado que ya no corresponde a ningún carrito', () => {
    localStorage.setItem(CLAVE_TOKEN, 'viejo');
    servicio.cargar().subscribe();
    backend.expectOne((r) => r.url === urlConstants.tienda.carrito).flush(carrito({ id_carrito: 0 }));

    expect(localStorage.getItem(CLAVE_TOKEN)).toBeNull();
  });

  it('al iniciar sesión con un carrito de invitado lo fusiona y recién entonces borra el token (E17)', () => {
    localStorage.setItem(CLAVE_TOKEN, 't-1');
    sessionStorage.setItem('token', 'jwt-cliente');

    servicio.cargar().subscribe();

    const fusion = backend.expectOne(urlConstants.tienda.carritoFusionar);
    expect(fusion.request.body).toEqual({ token_invitado: 't-1' });
    fusion.flush(carrito({ id_carrito: 20, items: [LINEA], cantidad_items: 2 }));

    expect(localStorage.getItem(CLAVE_TOKEN)).toBeNull();
    expect(servicio.actual.id_carrito).toBe(20);
  });

  it('si la fusión falla conserva el token, avisa y muestra el carrito del cliente (E17)', () => {
    localStorage.setItem(CLAVE_TOKEN, 't-1');
    sessionStorage.setItem('token', 'jwt-cliente');

    servicio.fusionarTrasLogin().subscribe();
    backend
      .expectOne(urlConstants.tienda.carritoFusionar)
      .flush({ message: 'Servidor no disponible' }, { status: 503, statusText: 'Service Unavailable' });

    expect(localStorage.getItem(CLAVE_TOKEN)).toBe('t-1');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/carrito anterior/) }));

    backend.expectOne((r) => r.url === urlConstants.tienda.carrito).flush(carrito({ id_carrito: 20 }));
    expect(servicio.actual.id_carrito).toBe(20);
  });

  it('si no puede cargar el carrito avisa en vez de mostrarlo vacío en silencio', () => {
    localStorage.setItem(CLAVE_TOKEN, 't-1');
    servicio.cargar().subscribe();

    backend
      .expectOne((r) => r.url === urlConstants.tienda.carrito)
      .flush({ message: 'Error inesperado' }, { status: 500, statusText: 'Server Error' });

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(localStorage.getItem(CLAVE_TOKEN)).toBe('t-1');
  });

  it('cargar(true) vuelve a pedir el carrito aunque ya estuviera cargado (después de comprar)', () => {
    sessionStorage.setItem('token', 'jwt-cliente');
    servicio.cargar().subscribe();
    backend.expectOne((r) => r.url === urlConstants.tienda.carrito).flush(carrito({ items: [LINEA], cantidad_items: 2 }));

    servicio.cargar().subscribe();
    backend.expectNone((r) => r.url === urlConstants.tienda.carrito);

    servicio.cargar(true).subscribe();
    backend.expectOne((r) => r.url === urlConstants.tienda.carrito).flush(carrito());
    expect(servicio.cantidad).toBe(0);
  });
});
