import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CategoriaTienda } from '../../models/tienda.models';
import { RevealDirective } from '../../../shared/ui/reveal.directive';
import { SpotlightDirective } from '../../../shared/ui/spotlight.directive';

/** Iconos de respaldo cuando la categoría no tiene uno configurado en la base. */
const ICONOS: string[] = [
  'bi-tools', 'bi-lightning-charge', 'bi-wrench-adjustable', 'bi-hammer',
  'bi-nut', 'bi-plug', 'bi-brush', 'bi-shield-check', 'bi-bucket', 'bi-rulers',
];

/** Colores de la rampa para el icono de cada categoría (rota por posición). */
const TONOS: string[] = ['coral', 'amarillo', 'menta', 'cian', 'azul', 'violeta', 'rosa', 'ambar'];

@Component({
  selector: 'app-categorias-grid',
  standalone: true,
  imports: [CommonModule, RouterLink, RevealDirective, SpotlightDirective],
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

  tono(indice: number): string {
    return TONOS[indice % TONOS.length];
  }

  /** Dos dígitos para el índice mono de cada tarjeta. */
  numero(indice: number): string {
    return String(indice + 1).padStart(2, '0');
  }

  /**
   * Mosaico: con 5 o más categorías la primera ocupa 2×2 y la última fila se
   * reparte para no dejar huecos (1 sola → ancho completo, 2 → mitad y mitad,
   * 3 → la primera doble).
   */
  clases(indice: number): string {
    const n = this.visibles.length;
    if (n < 5) return '';
    if (indice === 0) return 'es-grande';
    const pequenas = n - 1;
    const enUltimaFila = pequenas > 4 ? (pequenas - 4) % 4 || 4 : 0;
    const primeraDeUltima = n - enUltimaFila;
    if (enUltimaFila === 0 || indice < primeraDeUltima) return '';
    const posicion = indice - primeraDeUltima;
    if (enUltimaFila === 1) return 'ancho-4';
    if (enUltimaFila === 2) return 'ancho-2';
    if (enUltimaFila === 3 && posicion === 0) return 'ancho-2';
    return '';
  }
}
