import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EstrellasComponent } from '../estrellas/estrellas.component';
import { CatalogoService } from '../../service/catalogo.service';
import { ProductoTienda } from '../../models/tienda.models';

@Component({
  selector: 'app-producto-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, EstrellasComponent],
  templateUrl: './producto-card.component.html',
  styleUrl: './producto-card.component.css',
})
export class ProductoCardComponent {

  private readonly catalogo = inject(CatalogoService);

  @Input({ required: true }) producto!: ProductoTienda;
  @Input() esFavorito = false;
  @Input() cargando = false;

  @Output() agregar = new EventEmitter<ProductoTienda>();
  @Output() alternarFavorito = new EventEmitter<ProductoTienda>();

  get imagen(): string {
    return this.catalogo.urlImagen(this.producto.imagen);
  }

  get ahorro(): number {
    return Math.max(0, this.producto.precio - this.producto.precio_final);
  }

  get etiquetaStock(): { texto: string; clase: string } {
    if (this.producto.stock <= 0) return { texto: 'Sin stock', clase: 'agotado' };
    if (this.producto.stock <= 5) return { texto: `Últimas ${this.producto.stock}`, clase: 'bajo' };
    return { texto: 'Disponible', clase: 'ok' };
  }

  onAgregar(evento: Event): void {
    evento.preventDefault();
    evento.stopPropagation();
    if (this.producto.stock > 0) this.agregar.emit(this.producto);
  }

  onFavorito(evento: Event): void {
    evento.preventDefault();
    evento.stopPropagation();
    this.alternarFavorito.emit(this.producto);
  }

  imagenAlternativa(evento: Event): void {
    (evento.target as HTMLImageElement).src = 'assets/img/producto-sin-imagen.svg';
  }
}
