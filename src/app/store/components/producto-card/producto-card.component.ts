import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EstrellasComponent } from '../estrellas/estrellas.component';
import { CatalogoService } from '../../service/catalogo.service';
import { ProductoTienda } from '../../models/tienda.models';
import { SpotlightDirective } from '../../../shared/ui/spotlight.directive';

@Component({
  selector: 'app-producto-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, EstrellasComponent, SpotlightDirective],
  templateUrl: './producto-card.component.html',
  styleUrl: './producto-card.component.css',
})
export class ProductoCardComponent implements OnChanges {

  private readonly catalogo = inject(CatalogoService);

  @Input({ required: true }) producto!: ProductoTienda;
  @Input() esFavorito = false;
  @Input() cargando = false;

  @Output() agregar = new EventEmitter<ProductoTienda>();
  @Output() alternarFavorito = new EventEmitter<ProductoTienda>();

  /** La imagen no cargó: se muestra el recuadro «sin imagen» en su lugar. */
  imagenRota = false;

  ngOnChanges(cambios: SimpleChanges): void {
    if (cambios['producto']) this.imagenRota = false;
  }

  get sinImagen(): boolean {
    return !this.producto.imagen || this.imagenRota;
  }

  /** Porcentaje de rebaja calculado con los mismos precios que se muestran. */
  get porcentaje(): number {
    const { precio, precio_final } = this.producto;
    if (!(precio > 0) || precio_final >= precio) return 0;
    return Math.round((1 - precio_final / precio) * 100);
  }

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

  /** Guarda preview para que el detalle abra sin esperar el API. */
  alIrADetalle(): void {
    this.catalogo.guardarPreview(this.producto);
  }

  imagenAlternativa(_evento: Event): void {
    this.imagenRota = true;
  }
}
