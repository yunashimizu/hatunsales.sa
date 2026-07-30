import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ProductoCardComponent } from '../../components/producto-card/producto-card.component';
import { CuentaTiendaService } from '../../service/cuenta.service';
import { AccionesTiendaService } from '../../service/acciones.service';
import { AlertService } from '../../../shared/services/alert.service';
import { ProductoTienda } from '../../models/tienda.models';

@Component({
  selector: 'app-favoritos',
  standalone: true,
  imports: [CommonModule, RouterLink, ProductoCardComponent],
  templateUrl: './favoritos.component.html',
  styleUrl: './favoritos.component.css',
})
export class FavoritosComponent implements OnInit, OnDestroy {

  private readonly cuenta = inject(CuentaTiendaService);
  private readonly acciones = inject(AccionesTiendaService);
  private readonly alerta = inject(AlertService);
  private readonly router = inject(Router);
  private readonly destruir$ = new Subject<void>();

  productos: ProductoTienda[] = [];
  cargando = true;

  ngOnInit(): void {
    if (!this.acciones.autenticado) {
      void this.pedirLogin();
      return;
    }
    this.cargar();
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  get disponibles(): number {
    return this.productos.filter((p) => p.stock > 0).length;
  }

  agregar(producto: ProductoTienda): void {
    void this.acciones.agregarAlCarrito(producto);
  }

  quitar(producto: ProductoTienda): void {
    this.cuenta.alternarFavorito(producto.id_producto).subscribe({
      next: () => {
        this.productos = this.productos.filter((p) => p.id_producto !== producto.id_producto);
        this.alerta.toast({ type: 'success', title: 'Quitado de favoritos', timer: 1800 });
      },
      error: () => this.alerta.toast({ type: 'error', title: 'No pudimos actualizar tus favoritos' }),
    });
  }

  agregarTodos(): void {
    const enStock = this.productos.filter((p) => p.stock > 0);
    if (enStock.length === 0) return;

    this.alerta.loading('Agregando productos…');
    let pendientes = enStock.length;

    enStock.forEach((producto) => {
      void this.acciones.agregarAlCarrito(producto, 1, false).then(() => {
        if (--pendientes === 0) this.alerta.close();
      });
    });
  }

  private cargar(): void {
    this.cuenta
      .listarFavoritos()
      .pipe(takeUntil(this.destruir$))
      .subscribe((productos) => {
        this.productos = productos;
        this.cargando = false;
      });

    this.cuenta.sincronizarFavoritos().pipe(takeUntil(this.destruir$)).subscribe();
  }

  private async pedirLogin(): Promise<void> {
    const resultado = await this.alerta.confirm({
      title: 'Inicia sesión para ver tus favoritos',
      message: 'Guarda los productos que te interesan y encuéntralos en cualquier dispositivo.',
      confirmText: 'Iniciar sesión',
      cancelText: 'Seguir viendo',
    });

    this.router.navigate([resultado.isConfirmed ? '/auth' : '/store/catalogo']);
  }
}
