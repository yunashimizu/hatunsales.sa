import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CartService } from './cart.service';
import { CuentaTiendaService } from './cuenta.service';
import { AlertService } from '../../shared/services/alert.service';
import { ProductoTienda } from '../models/tienda.models';

/**
 * Agrupa las acciones que se repiten en portada, catálogo, detalle y favoritos,
 * junto con su retroalimentación visual, para que todas se comporten igual.
 */
@Injectable({ providedIn: 'root' })
export class AccionesTiendaService {

  private readonly cart = inject(CartService);
  private readonly cuenta = inject(CuentaTiendaService);
  private readonly alerta = inject(AlertService);
  private readonly router = inject(Router);

  get autenticado(): boolean {
    return typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('token');
  }

  /**
   * Feedback al instante (toast + panel + badge); el API confirma detrás.
   * Si falla, se recarga el carrito real y se avisa.
   */
  agregarAlCarrito(producto: ProductoTienda, cantidad = 1, abrirPanel = true): Promise<boolean> {
    this.cart.aplicarAgregarOptimistico(producto, cantidad);
    this.alerta.toast({
      type: 'success',
      title: 'Agregado al carrito',
      message: producto.nombre,
      timer: 1800,
    });
    if (abrirPanel) this.cart.abrirPanel();

    return new Promise((resolver) => {
      this.cart.agregar(producto.id_producto, cantidad).subscribe({
        next: () => resolver(true),
        error: (err) => {
          this.cart.cargar(true).subscribe();
          this.alerta.toast({
            type: 'error',
            title: 'No se pudo agregar',
            message: err?.error?.message ?? 'Inténtalo de nuevo en unos segundos',
            timer: 3200,
          });
          resolver(false);
        },
      });
    });
  }

  async alternarFavorito(producto: ProductoTienda): Promise<void> {
    if (!this.autenticado) {
      const resultado = await this.alerta.confirm({
        title: 'Inicia sesión para guardar favoritos',
        message: 'Así tu lista de deseos te sigue en cualquier dispositivo.',
        confirmText: 'Iniciar sesión',
      });
      if (resultado.isConfirmed) this.router.navigate(['/auth']);
      return;
    }

    this.cuenta.alternarFavorito(producto.id_producto).subscribe({
      next: ({ favorito }) =>
        this.alerta.toast({
          type: 'success',
          title: favorito ? 'Guardado en favoritos' : 'Quitado de favoritos',
          timer: 1800,
        }),
      error: () => this.alerta.toast({ type: 'error', title: 'No pudimos actualizar tus favoritos' }),
    });
  }

  esFavorito(idProducto: number): boolean {
    return this.cuenta.esFavorito(idProducto);
  }
}
