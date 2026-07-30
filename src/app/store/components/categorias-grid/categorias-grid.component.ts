import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CategoriaTienda } from '../../models/tienda.models';

/** Iconos de respaldo cuando la categoría no tiene uno configurado en la base. */
const ICONOS: string[] = [
  'bi-tools', 'bi-lightning-charge', 'bi-wrench-adjustable', 'bi-hammer',
  'bi-nut', 'bi-plug', 'bi-brush', 'bi-shield-check', 'bi-bucket', 'bi-rulers',
];

@Component({
  selector: 'app-categorias-grid',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './categorias-grid.component.html',
  styleUrl: './categorias-grid.component.css',
})
export class CategoriasGridComponent {

  @Input() categorias: CategoriaTienda[] = [];
  @Input() limite = 8;

  get visibles(): CategoriaTienda[] {
    return this.categorias.slice(0, this.limite);
  }

  icono(categoria: CategoriaTienda, indice: number): string {
    return categoria.icono || ICONOS[indice % ICONOS.length];
  }
}
