import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';

/**
 * Visor moderado de imagen (no pantalla completa).
 * Cerrar: botón X, clic fuera o Escape.
 */
@Component({
  selector: 'app-visor-imagen',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div
      class="adm-visor"
      *ngIf="url"
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
        <img class="adm-visor__img" [src]="url" [alt]="alt || 'Imagen'" />
      </div>
    </div>
  `,
})
export class VisorImagenComponent {
  @Input() url: string | null = null;
  @Input() alt = '';
  @Output() readonly cerrar = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.url) this.cerrar.emit();
  }
}
