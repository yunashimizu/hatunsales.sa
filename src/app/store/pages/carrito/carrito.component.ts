import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { CartService } from '../../service/cart.service';
import { CatalogoService } from '../../service/catalogo.service';
import { CheckoutService } from '../../service/checkout.service';
import { AccionesTiendaService } from '../../service/acciones.service';
import { AlertService } from '../../../shared/services/alert.service';
import { Carrito, CarritoItem, CuponValidado, ProductoTienda } from '../../models/tienda.models';
import { ProductoCardComponent } from '../../components/producto-card/producto-card.component';
import { CountUpDirective } from '../../../shared/ui/count-up.directive';
import { MagneticDirective } from '../../../shared/ui/magnetic.directive';
import { RevealDirective } from '../../../shared/ui/reveal.directive';
import { SpotlightDirective } from '../../../shared/ui/spotlight.directive';

@Component({
  selector: 'app-carrito',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ProductoCardComponent,
    CountUpDirective,
    MagneticDirective,
    RevealDirective,
    SpotlightDirective,
  ],
  templateUrl: './carrito.component.html',
  styleUrl: './carrito.component.css',
})
export class CarritoComponent implements OnInit, OnDestroy {

  private readonly cart = inject(CartService);
  private readonly catalogo = inject(CatalogoService);
  private readonly checkout = inject(CheckoutService);
  private readonly acciones = inject(AccionesTiendaService);
  private readonly alerta = inject(AlertService);
  private readonly router = inject(Router);
  private readonly destruir$ = new Subject<void>();

  carrito: Carrito = { id_carrito: 0, items: [], cantidad_items: 0, subtotal: 0, igv: 0, total: 0 };
  sugeridos: ProductoTienda[] = [];

  codigoCupon = '';
  cupon?: CuponValidado;
  validandoCupon = false;
  itemOcupado: number | null = null;
  cargando = true;

  /** Solo vista: compra (con IGV) desde la que la tienda anuncia el envío gratis (promesa del encabezado). */
  readonly umbralEnvioGratis = 250;

  /** Solo vista: avance de 0 a 100 hacia el envío gratis, con el total que ya expone el carrito. */
  get progresoEnvio(): number {
    const total = Number(this.carrito.total) || 0;
    return Math.min(100, Math.max(0, (total / this.umbralEnvioGratis) * 100));
  }

  /** Solo vista: la promesa dice «mayores a», por eso es estricto. */
  get envioGratis(): boolean {
    return (Number(this.carrito.total) || 0) > this.umbralEnvioGratis;
  }

  /** Solo vista: lo que falta para llegar al envío gratis (nunca menos de un céntimo mientras no se alcance). */
  get faltaEnvioGratis(): number {
    return Math.max(0.01, this.umbralEnvioGratis - (Number(this.carrito.total) || 0));
  }

  ngOnInit(): void {
    this.cart.carrito$.pipe(takeUntil(this.destruir$)).subscribe((carrito) => (this.carrito = carrito));

    this.cart.cargar().pipe(takeUntil(this.destruir$)).subscribe(() => (this.cargando = false));

    this.catalogo
      .destacados(4)
      .pipe(takeUntil(this.destruir$))
      .subscribe((productos) => (this.sugeridos = productos));
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  get descuento(): number {
    return this.cupon?.descuento ?? 0;
  }

  get totalFinal(): number {
    return Math.max(0, this.carrito.total - this.descuento);
  }

  get hayProblemasDeStock(): boolean {
    return this.carrito.items.some((item) => item.excede_stock);
  }

  /** El backend ya aplicó el precio vigente del catálogo; se avisa para que no sorprenda el total. */
  get hayCambiosDePrecio(): boolean {
    return this.carrito.items.some((item) => item.precio_cambio);
  }

  get hayNoDisponibles(): boolean {
    return this.carrito.items.some((item) => item.no_disponible);
  }

  imagen(item: CarritoItem): string {
    return this.catalogo.urlImagen(item.imagen);
  }

  cambiar(item: CarritoItem, delta: number): void {
    const nueva = item.cantidad + delta;
    if (nueva < 1) return;

    // Igual que el backend: un producto sin stock tampoco admite más unidades.
    if (delta > 0 && nueva > item.stock_disponible) {
      this.alerta.toast({
        type: 'warning',
        title: item.stock_disponible > 0 ? `Solo quedan ${item.stock_disponible} unidades` : 'Este producto está agotado',
      });
      return;
    }

    this.itemOcupado = item.id_item;
    this.cart.cambiarCantidad(item.id_item, nueva).subscribe({
      next: () => (this.itemOcupado = null),
      error: (err) => {
        this.itemOcupado = null;
        this.alerta.toast({ type: 'error', title: err?.error?.message ?? 'No pudimos actualizar el carrito' });
      },
    });
  }

  async quitar(item: CarritoItem): Promise<void> {
    const resultado = await this.alerta.confirm({
      title: '¿Quitar producto?',
      message: item.nombre,
      confirmText: 'Sí, quitar',
    });
    if (!resultado.isConfirmed) return;

    this.itemOcupado = item.id_item;
    this.cart.quitar(item.id_item).subscribe({
      next: () => {
        this.itemOcupado = null;
        this.alerta.toast({ type: 'success', title: 'Producto eliminado' });
      },
      error: () => {
        this.itemOcupado = null;
        this.alerta.toast({ type: 'error', title: 'No pudimos quitar el producto' });
      },
    });
  }

  async vaciar(): Promise<void> {
    const resultado = await this.alerta.confirm({
      title: '¿Vaciar el carrito?',
      message: 'Se quitarán todos los productos.',
      confirmText: 'Sí, vaciar',
    });
    if (!resultado.isConfirmed) return;

    this.cart.vaciar().subscribe(() => {
      this.cupon = undefined;
      this.codigoCupon = '';
      this.alerta.toast({ type: 'success', title: 'Carrito vacío' });
    });
  }

  aplicarCupon(): void {
    const codigo = this.codigoCupon.trim();
    if (!codigo) return;

    this.validandoCupon = true;
    this.checkout.validarCupon(codigo, this.carrito.total).subscribe({
      next: (cupon) => {
        this.validandoCupon = false;
        this.cupon = cupon;
        this.alerta.toast({
          type: 'success',
          title: 'Cupón aplicado',
          message: `Descuento de S/ ${cupon.descuento.toFixed(2)}`,
        });
      },
      error: (err) => {
        this.validandoCupon = false;
        this.cupon = undefined;
        this.alerta.toast({ type: 'error', title: err?.error?.message ?? 'El cupón no es válido' });
      },
    });
  }

  quitarCupon(): void {
    this.cupon = undefined;
    this.codigoCupon = '';
  }

  continuar(): void {
    if (this.hayNoDisponibles) {
      this.alerta.warning({
        title: 'Hay productos que ya no vendemos',
        message: 'Quítalos de tu carrito para continuar con la compra.',
      });
      return;
    }

    if (this.hayProblemasDeStock) {
      this.alerta.warning({
        title: 'Revisa el stock',
        message: 'Algunos productos superan las unidades disponibles. Ajusta las cantidades para continuar.',
      });
      return;
    }

    this.router.navigate(['/store/checkout'], {
      queryParams: this.cupon ? { cupon: this.cupon.codigo } : {},
    });
  }

  agregarSugerido(producto: ProductoTienda): void {
    void this.acciones.agregarAlCarrito(producto, 1, false);
  }

  esFavorito(producto: ProductoTienda): boolean {
    return this.acciones.esFavorito(producto.id_producto);
  }

  alternarFavorito(producto: ProductoTienda): void {
    void this.acciones.alternarFavorito(producto);
  }
}
