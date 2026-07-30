import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { CartService } from '../../service/cart.service';
import { CatalogoService } from '../../service/catalogo.service';
import { AlertService } from '../../../shared/services/alert.service';
import { Carrito, CarritoItem } from '../../models/tienda.models';

@Component({
  selector: 'app-carrito-panel',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './carrito-panel.component.html',
  styleUrl: './carrito-panel.component.css',
})
export class CarritoPanelComponent implements OnInit, OnDestroy {

  private readonly cart = inject(CartService);
  private readonly catalogo = inject(CatalogoService);
  private readonly alerta = inject(AlertService);
  private readonly router = inject(Router);
  private readonly destruir$ = new Subject<void>();

  abierto = false;
  carrito: Carrito = { id_carrito: 0, items: [], cantidad_items: 0, subtotal: 0, igv: 0, total: 0 };
  itemOcupado: number | null = null;

  ngOnInit(): void {
    this.cart.panelAbierto$.pipe(takeUntil(this.destruir$)).subscribe((abierto) => {
      this.abierto = abierto;
      document.body.style.overflow = abierto ? 'hidden' : '';
    });

    this.cart.carrito$.pipe(takeUntil(this.destruir$)).subscribe((carrito) => (this.carrito = carrito));
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    this.destruir$.next();
    this.destruir$.complete();
  }

  @HostListener('document:keydown.escape')
  cerrarConEscape(): void {
    if (this.abierto) this.cerrar();
  }

  cerrar(): void {
    this.cart.cerrarPanel();
  }

  imagen(item: CarritoItem): string {
    return this.catalogo.urlImagen(item.imagen);
  }

  cambiar(item: CarritoItem, delta: number): void {
    const nueva = item.cantidad + delta;
    if (nueva < 1) return;

    if (item.stock_disponible > 0 && nueva > item.stock_disponible) {
      this.alerta.toast({ type: 'warning', title: `Solo quedan ${item.stock_disponible} unidades` });
      return;
    }

    this.itemOcupado = item.id_item;
    this.cart.cambiarCantidad(item.id_item, nueva).subscribe({
      next: () => (this.itemOcupado = null),
      error: (err) => {
        this.itemOcupado = null;
        this.alerta.toast({ type: 'error', title: this.mensajeError(err) });
      },
    });
  }

  quitar(item: CarritoItem): void {
    this.itemOcupado = item.id_item;
    this.cart.quitar(item.id_item).subscribe({
      next: () => {
        this.itemOcupado = null;
        this.alerta.toast({ type: 'success', title: 'Producto eliminado' });
      },
      error: (err) => {
        this.itemOcupado = null;
        this.alerta.toast({ type: 'error', title: this.mensajeError(err) });
      },
    });
  }

  async vaciar(): Promise<void> {
    const resultado = await this.alerta.confirm({
      title: '¿Vaciar el carrito?',
      message: 'Se quitarán todos los productos que agregaste.',
      confirmText: 'Sí, vaciar',
    });
    if (!resultado.isConfirmed) return;

    this.cart.vaciar().subscribe({
      next: () => this.alerta.toast({ type: 'success', title: 'Carrito vacío' }),
      error: (err) => this.alerta.toast({ type: 'error', title: this.mensajeError(err) }),
    });
  }

  irAlCheckout(): void {
    this.cerrar();
    this.router.navigate(['/store/checkout']);
  }

  irAlCatalogo(): void {
    this.cerrar();
    this.router.navigate(['/store/catalogo']);
  }

  private mensajeError(err: any): string {
    return err?.error?.message ?? 'No pudimos actualizar tu carrito';
  }
}
