import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { Carrito, MetodoPago, Pedido } from '../../models/tienda.models';
import { CartService } from '../../service/cart.service';
import { CatalogoService } from '../../service/catalogo.service';
import { CheckoutService } from '../../service/checkout.service';
import { CuentaTiendaService } from '../../service/cuenta.service';
import { PasarelaService } from '../../service/pasarela.service';
import { AlertService } from '../../../shared/services/alert.service';
import { CheckoutComponent } from './checkout.component';

const CARRITO: Carrito = {
  id_carrito: 9,
  items: [
    { id_item: 1, id_producto: 5, nombre: 'Taladro', imagen: null, cantidad: 1, precio_unitario: 50, subtotal: 50, stock_disponible: 3, excede_stock: false },
  ],
  cantidad_items: 1,
  subtotal: 42.37,
  igv: 7.63,
  total: 50,
};

const TARJETA: MetodoPago = { id_metodo: 4, nombre: 'Tarjeta de crédito o débito', tipo: 'tarjeta', descripcion: '', logo_url: null };
const TRANSFERENCIA: MetodoPago = { id_metodo: 7, nombre: 'Transferencia bancaria', tipo: 'transferencia', descripcion: '', logo_url: null };

function pedido(estado: Pedido['estado']): Pedido {
  return {
    id_pedido: 57, codigo: 'PED-20261021-0057', estado, subtotal: 42.37, igv: 7.63, descuento: 0, costo_envio: 0, total: 50,
    cantidad_items: 1, items: [], historial: [], creado_en: '2026-10-21T20:00:00Z',
  };
}

describe('CheckoutComponent · confirmar pedido', () => {
  let alerta: Record<string, ReturnType<typeof vi.fn>>;
  let checkout: Record<string, ReturnType<typeof vi.fn>>;
  let cart: { carrito$: BehaviorSubject<Carrito>; cargar: ReturnType<typeof vi.fn> };

  async function montar(metodos: MetodoPago[]): Promise<CheckoutComponent> {
    sessionStorage.setItem('token', 'jwt-cliente');
    alerta = {
      loading: vi.fn(),
      close: vi.fn(),
      error: vi.fn(() => Promise.resolve({})),
      warning: vi.fn(() => Promise.resolve({})),
      success: vi.fn(() => Promise.resolve({})),
      toast: vi.fn(() => Promise.resolve()),
      confirm: vi.fn(() => Promise.resolve({ isConfirmed: false })),
    };
    checkout = {
      metodosEnvio: vi.fn(() => of([])),
      metodosPago: vi.fn(() => of(metodos)),
      pasarela: vi.fn(() => of({ proveedor: 'simulada', llave_publica: '', moneda: 'PEN', requiere_token: false })),
      crearPedido: vi.fn(() => of(pedido('pendiente'))),
      pagar: vi.fn(() => of(pedido('pendiente'))),
      validarCupon: vi.fn(),
    };
    cart = { carrito$: new BehaviorSubject(CARRITO), cargar: vi.fn(() => of(CARRITO)) };

    await TestBed.configureTestingModule({
      imports: [CheckoutComponent],
      providers: [
        { provide: AlertService, useValue: alerta },
        { provide: CheckoutService, useValue: checkout },
        { provide: CartService, useValue: cart },
        { provide: CatalogoService, useValue: { urlImagen: () => '' } },
        { provide: CuentaTiendaService, useValue: { listarDirecciones: () => of([]) } },
        { provide: PasarelaService, useValue: { preparar: () => Promise.resolve(false), pedirToken: () => Promise.resolve(null) } },
        { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const componente = fixture.componentInstance;
    componente.datos.nombre = 'Cliente';
    return componente;
  }

  afterEach(() => sessionStorage.clear());

  it('con "Tarjeta" y sin pasarela configurada no crea el pedido: pide otro método (E01)', async () => {
    const componente = await montar([TARJETA, TRANSFERENCIA]);
    componente.idMetodoPago = TARJETA.id_metodo;

    await componente.confirmarPedido();

    expect(checkout['crearPedido']).not.toHaveBeenCalled();
    expect(alerta['warning']).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pago con tarjeta no disponible' }));
  });

  it('un pago por transferencia queda "registrado", no "confirmado" (E01)', async () => {
    const componente = await montar([TRANSFERENCIA]);

    await componente.confirmarPedido();

    expect(checkout['pagar']).toHaveBeenCalled();
    expect(alerta['success']).toHaveBeenCalledWith(expect.objectContaining({ title: '¡Pedido registrado!' }));
    // El carrito ya se convirtió en pedido: se vuelve a pedir aunque estuviera cargado.
    expect(cart.cargar).toHaveBeenLastCalledWith(true);
  });

  it('si cambió un precio, recarga el carrito y pide revisar el total en vez de mostrar un error (E03)', async () => {
    const componente = await montar([TRANSFERENCIA]);
    checkout['crearPedido'].mockReturnValueOnce(
      throwError(() => ({ status: 409, error: { codigo: 'PRECIOS_ACTUALIZADOS', message: 'Cambió el precio de: Taladro.' } })),
    );

    await componente.confirmarPedido();

    expect(cart.cargar).toHaveBeenLastCalledWith(true);
    expect(alerta['warning']).toHaveBeenCalledWith(expect.objectContaining({ title: 'Actualizamos los precios de tu carrito' }));
    expect(alerta['error']).not.toHaveBeenCalled();
    expect(componente.procesando).toBe(false);
  });
});
