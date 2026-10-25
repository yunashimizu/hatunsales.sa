import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TemaService } from './tema.service';

/**
 * Botón de tema claro/oscuro (sol ↔ luna). Hereda el color del contenedor y se
 * ajusta con variables: --tb-size, --tb-color, --tb-borde, --tb-fondo.
 */
@Component({
  selector: 'app-boton-tema',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="tb"
      [class.es-oscuro]="tema.esOscuro()"
      [attr.aria-pressed]="tema.esOscuro()"
      [attr.aria-label]="tema.esOscuro() ? 'Activar tema claro' : 'Activar tema oscuro'"
      [attr.title]="tema.esOscuro() ? 'Tema claro' : 'Tema oscuro'"
      (click)="alternar($event)">
      <i class="bi bi-sun-fill tb__sol" aria-hidden="true"></i>
      <i class="bi bi-moon-stars-fill tb__luna" aria-hidden="true"></i>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .tb {
      position: relative;
      display: grid;
      place-items: center;
      flex: none;
      width: var(--tb-size, 40px);
      height: var(--tb-size, 40px);
      padding: 0;
      border: 1px solid var(--tb-borde, var(--t-borde-fuerte, #d3d8e8));
      border-radius: 50%;
      background: var(--tb-fondo, transparent);
      color: var(--tb-color, var(--t-texto, #0f172a));
      cursor: pointer;
      overflow: hidden;
      transition: border-color 200ms var(--x-ease, ease), background-color 200ms var(--x-ease, ease),
        scale 260ms var(--x-resorte-suave, ease);
    }

    .tb:hover {
      border-color: var(--tb-borde-hover, currentColor);
    }

    .tb:active {
      scale: 0.9;
      transition-duration: 90ms;
    }

    .tb i {
      position: absolute;
      font-size: 1.05rem;
      line-height: 1;
      transition: rotate 640ms var(--x-ease, ease), scale 520ms var(--x-resorte-suave, ease), opacity 260ms ease;
    }

    .tb__luna {
      rotate: -90deg;
      scale: 0.2;
      opacity: 0;
    }

    .tb.es-oscuro .tb__sol {
      rotate: 90deg;
      scale: 0.2;
      opacity: 0;
    }

    .tb.es-oscuro .tb__luna {
      rotate: 0deg;
      scale: 1;
      opacity: 1;
    }

    @media (pointer: coarse) {
      .tb {
        width: max(var(--tb-size, 40px), 44px);
        height: max(var(--tb-size, 40px), 44px);
      }
    }
  `,
})
export class BotonTemaComponent {
  protected readonly tema = inject(TemaService);

  protected alternar(evento: Event): void {
    this.tema.alternar(evento.currentTarget as Element | null);
  }
}
