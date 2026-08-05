import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';

/**
 * Visor de imagen con galería opcional (prev/next).
 * Cerrar: X, clic fuera o Escape. Navegar: flechas o botones.
 */
@Component({
  selector: 'app-visor-imagen',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div
      class="adm-visor"
      *ngIf="urlActiva"
      role="dialog"
      aria-modal="true"
      aria-label="Vista de imagen"
      (click)="cerrar.emit()"
    >
      <div class="adm-visor__marco" (click)="$event.stopPropagation()">
        <button
          type="button"
          class="adm-visor__cerrar"
          (click)="cerrar.emit()"
          aria-label="Cerrar"
        >
          <i class="bi bi-x-lg"></i>
        </button>

        <button
          type="button"
          class="adm-visor__nav adm-visor__nav--prev"
          *ngIf="tieneVarias"
          (click)="anterior()"
          aria-label="Imagen anterior"
        >
          <i class="bi bi-chevron-left"></i>
        </button>

        <img class="adm-visor__img" [src]="urlActiva" [alt]="alt || 'Imagen'" />

        <button
          type="button"
          class="adm-visor__nav adm-visor__nav--next"
          *ngIf="tieneVarias"
          (click)="siguiente()"
          aria-label="Imagen siguiente"
        >
          <i class="bi bi-chevron-right"></i>
        </button>

        <div class="adm-visor__contador" *ngIf="tieneVarias">
          {{ indiceActual + 1 }} / {{ lista.length }}
        </div>
      </div>
    </div>
  `,
})
export class VisorImagenComponent implements OnChanges {
  /** Una sola URL (compatibilidad). */
  @Input() url: string | null = null;
  /** Galería completa; si hay más de una, muestra prev/next. */
  @Input() urls: string[] = [];
  @Input() indice = 0;
  @Input() alt = '';
  @Output() readonly cerrar = new EventEmitter<void>();
  @Output() readonly indiceChange = new EventEmitter<number>();

  indiceActual = 0;
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['indice'] || changes['urls'] || changes['url']) {
      this.indiceActual = Math.max(0, Number(this.indice) || 0);
      if (this.lista.length && this.indiceActual >= this.lista.length) {
        this.indiceActual = 0;
      }
      this.cdr.markForCheck();
    }
  }

  get lista(): string[] {
    if (this.urls?.length) return this.urls.filter(Boolean);
    return this.url ? [this.url] : [];
  }

  get urlActiva(): string | null {
    return this.lista[this.indiceActual] || this.url || null;
  }

  get tieneVarias(): boolean {
    return this.lista.length > 1;
  }

  anterior(): void {
    if (!this.tieneVarias) return;
    this.indiceActual = (this.indiceActual - 1 + this.lista.length) % this.lista.length;
    this.indiceChange.emit(this.indiceActual);
    this.cdr.markForCheck();
  }

  siguiente(): void {
    if (!this.tieneVarias) return;
    this.indiceActual = (this.indiceActual + 1) % this.lista.length;
    this.indiceChange.emit(this.indiceActual);
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.urlActiva) this.cerrar.emit();
  }

  @HostListener('document:keydown.arrowleft')
  onIzquierda(): void {
    if (this.urlActiva && this.tieneVarias) this.anterior();
  }

  @HostListener('document:keydown.arrowright')
  onDerecha(): void {
    if (this.urlActiva && this.tieneVarias) this.siguiente();
  }
}
