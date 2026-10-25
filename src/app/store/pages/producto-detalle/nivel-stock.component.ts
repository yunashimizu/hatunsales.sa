import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Medidor de stock tipo cinta de medir: solo presentación. Con 20 unidades o más se ve
 * lleno; los colores siguen los mismos umbrales del resto de la ficha (más de 5 = bien,
 * de 1 a 5 = bajo, 0 = agotado). El texto que acompaña al medidor lo pone quien lo usa.
 */
@Component({
  selector: 'app-nivel-stock',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="nivel"
      [class.bajo]="unidades > 0 && unidades <= 5"
      [class.agotado]="!(unidades > 0)"
      [style.--nivel]="nivel"
      aria-hidden="true"></span>
  `,
  styles: [`
    :host { display: block; }

    .nivel {
      --nv: var(--t-exito);
      position: relative;
      display: block;
      height: 8px;
      overflow: hidden;
      background: repeating-linear-gradient(90deg, var(--t-borde-fuerte) 0 2px, transparent 2px 6px);
    }

    .nivel.bajo { --nv: var(--t-aviso); }
    .nivel.agotado { --nv: var(--t-texto-tenue); }

    /* El relleno es la misma cinta desplazada: la marca avanza sin tocar el ancho */
    .nivel::after {
      content: '';
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(90deg, var(--nv) 0 2px, transparent 2px 6px);
      translate: calc((var(--nivel, 0) - 1) * 100%) 0;
      animation: nivel-llena 1000ms var(--x-ease) 250ms backwards;
    }

    @keyframes nivel-llena {
      from { translate: -100% 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      .nivel::after { animation: none; }
    }
  `],
})
export class NivelStockComponent {
  @Input() unidades = 0;

  get nivel(): number {
    if (!(this.unidades > 0)) return 0;
    return Math.max(0.08, Math.min(1, this.unidades / 20));
  }
}
