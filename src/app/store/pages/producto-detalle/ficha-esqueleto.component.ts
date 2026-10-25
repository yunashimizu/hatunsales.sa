import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Esqueleto de la ficha mientras carga el producto (galería a la izquierda, datos a la derecha). */
@Component({
  selector: 'app-ficha-esqueleto',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="galeria esq"></div>
    <div class="datos">
      <span class="esq linea corta"></span>
      <span class="esq linea alta"></span>
      <span class="esq linea"></span>
      <span class="esq linea media"></span>
      <span class="esq bloque"></span>
    </div>
  `,
  styles: [`
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
      gap: clamp(28px, 4vw, 64px);
    }

    .datos { display: flex; flex-direction: column; gap: 16px; }

    .esq {
      position: relative;
      display: block;
      overflow: hidden;
      border-radius: var(--t-r-md);
      background: var(--t-superficie-2);
    }

    .esq::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, var(--mov-esqueleto-brillo, rgba(255, 255, 255, 0.7)), transparent);
      translate: -100% 0;
      animation: esq-brillo 1.5s var(--ease-estandar, ease) infinite;
    }

    @keyframes esq-brillo { to { translate: 100% 0; } }

    .galeria { aspect-ratio: 1; border-radius: var(--t-r-lg); }
    .linea { height: 20px; }
    .alta { height: 52px; }
    .corta { width: 30%; }
    .media { width: 60%; }
    .bloque { height: 240px; border-radius: var(--t-r-lg); }

    @media (max-width: 900px) {
      :host { grid-template-columns: minmax(0, 1fr); }
    }

    @media (prefers-reduced-motion: reduce) {
      .esq::after { animation: none; }
    }
  `],
})
export class FichaEsqueletoComponent {}
