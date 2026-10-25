import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { Carrito, CarritoItem } from '../../models/tienda.models';
import { AccionesTiendaService } from '../../service/acciones.service';
import { CartService } from '../../service/cart.service';
import { CatalogoService } from '../../service/catalogo.service';
import { CheckoutService } from '../../service/checkout.service';
import { AlertService } from '../../../shared/services/alert.service';
import { CarritoComponent } from './carrito.component';

function linea(parcial: Partial<CarritoItem> = {}): CarritoItem {
  return {
    id_item: 1, id_producto: 5, nombre: 'Taladro', imagen: null, cantidad: 1, precio_unitario: 12.5, subtotal: 12.5,
    stock_disponible: 3, excede_stock: false, ...parcial,
  };
}

function carrito(items: CarritoItem[]): Carrito {
  return { id_carrito: 9, items, cantidad_items: items.length, subtotal: 0, igv: 0, total: 0 };
}

describe('CarritoComponent · avisos del carrito (E03)', () => {
  let alerta: Record<string, ReturnType<typeof vi.fn>>;
  let cart: { carrito$: BehaviorSubject<Carrito>; cargar: ReturnType<typeof vi.fn>; cambiarCantidad: ReturnType<typeof vi.fn> };

  async function montar(items: CarritoItem[]) {
    alerta = { toast: vi.fn(() => Promise.resolve()), warning: vi.fn(() => Promise.resolve({})), confirm: vi.fn() };
    const contenido = carrito(items);
    cart = { carrito$: new BehaviorSubject(contenido), cargar: vi.fn(() => of(contenido)), cambiarCantidad: vi.fn(() => of(contenido)) };

    await TestBed.configureTestingModule({
      imports: [CarritoComponent],
      providers: [
        provideRouter([]),
        { provide: AlertService, useValue: alerta },
        { provide: CartService, useValue: cart },
        { provide: CatalogoService, useValue: { urlImagen: () => '', destacados: () => of([]) } },
        { provide: CheckoutService, useValue: { validarCupon: vi.fn() } },
        { provide: AccionesTiendaService, useValue: { agregarAlCarrito: vi.fn(), esFavorito: () => false, alternarFavorito: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CarritoComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, componente: fixture.componentInstance, texto: () => (fixture.nativeElement as HTMLElement).textContent ?? '' };
  }

  it('avisa que se actualizó el precio y muestra el anterior', async () => {
    const { texto } = await montar([linea({ precio_cambio: true, precio_anterior: 10 })]);

    expect(texto()).toContain('Actualizamos el precio de algunos productos');
    expect(texto()).toContain('S/ 10.00');
  });

  it('un producto retirado del catálogo se marca y bloquea el paso al checkout', async () => {
    const { texto, componente } = await montar([linea({ no_disponible: true })]);
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate');

    expect(texto()).toContain('Ya no está a la venta');
    componente.continuar();

    expect(alerta['warning']).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hay productos que ya no vendemos' }));
    expect(navegar).not.toHaveBeenCalled();
  });

  it('un producto agotado no admite más unidades', async () => {
    const item = linea({ stock_disponible: 0, excede_stock: true });
    const { texto, componente } = await montar([item]);

    expect(texto()).toContain('Agotado');
    componente.cambiar(item, 1);

    expect(cart.cambiarCantidad).not.toHaveBeenCalled();
    expect(alerta['toast']).toHaveBeenCalledWith(expect.objectContaining({ title: 'Este producto está agotado' }));
  });
});
