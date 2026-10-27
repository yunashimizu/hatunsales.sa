import { CommonModule, DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { svgEan13 } from '../../../../../shared/utils/ean13.util';

/** Lo mínimo que la etiqueta necesita del producto. */
export interface ProductoEtiqueta {
  nombre: string;
  precio_venta: number | string;
  codigo_barras: string | null | undefined;
}

export const COPIAS_MINIMAS = 1;
export const COPIAS_MAXIMAS = 100;

/**
 * Etiquetas imprimibles de un producto: nombre, precio y código EAN-13 dibujado como SVG, repetidas N
 * veces. Si el código no es un EAN-13 válido no se dibuja nada (se muestra el texto y «formato no
 * imprimible»). Al imprimir, `@media print` deja visible solo la hoja de etiquetas.
 */
@Component({
  selector: 'app-etiquetas-producto',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // None: las reglas de impresión tienen que alcanzar al panel y a la página que rodean la hoja.
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule],
  templateUrl: './etiquetas-producto.component.html',
  styleUrl: './etiquetas-producto.component.css',
})
export class EtiquetasProductoComponent implements OnChanges {

  @Input({ required: true }) producto!: ProductoEtiqueta;
  /** Copias iniciales (1..100); el usuario puede cambiarlas en el campo de la vista. */
  @Input() copias = 1;

  readonly minimo = COPIAS_MINIMAS;
  readonly maximo = COPIAS_MAXIMAS;

  copiasActuales = 1;
  /** SVG generado por `svgEan13` (solo dígitos y atributos numéricos); null si no es EAN-13 válido. */
  codigoSvg: SafeHtml | null = null;
  indices: number[] = [1];

  private readonly sanitizador = inject(DomSanitizer);
  private readonly documento = inject(DOCUMENT);

  get codigo(): string {
    return String(this.producto?.codigo_barras ?? '').trim();
  }

  get imprimible(): boolean {
    return this.codigoSvg !== null;
  }

  get precio(): number {
    const valor = Number(this.producto?.precio_venta);
    return Number.isFinite(valor) ? valor : 0;
  }

  ngOnChanges(): void {
    this.copiasActuales = this.acotar(this.copias);
    this.actualizarIndices();
    // Solo el SVG que sale de la util se marca como seguro; el nombre y el precio van interpolados.
    const svg = svgEan13(this.codigo);
    this.codigoSvg = svg ? this.sanitizador.bypassSecurityTrustHtml(svg) : null;
  }

  cambiarCopias(valor: unknown): void {
    this.copiasActuales = this.acotar(valor);
    this.actualizarIndices();
  }

  imprimir(): void {
    if (!this.imprimible) return;
    const raiz = this.documento.documentElement;
    raiz.classList.add('eti-imprimiendo');
    try {
      this.documento.defaultView?.print();
    } finally {
      raiz.classList.remove('eti-imprimiendo');
    }
  }

  private acotar(valor: unknown): number {
    const n = Math.trunc(Number(valor));
    if (!Number.isFinite(n)) return COPIAS_MINIMAS;
    return Math.min(COPIAS_MAXIMAS, Math.max(COPIAS_MINIMAS, n));
  }

  private actualizarIndices(): void {
    this.indices = Array.from({ length: this.copiasActuales }, (_, i) => i + 1);
  }
}
