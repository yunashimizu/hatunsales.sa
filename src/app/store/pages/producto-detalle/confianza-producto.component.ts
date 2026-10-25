import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RevealDirective } from '../../../shared/ui/reveal.directive';

/**
 * Insignias de confianza de la ficha: las mismas promesas que ya muestran el encabezado y el pie
 * (envío a todo el Perú, garantía oficial, cambios, pago seguro). Contenido fijo, sin lógica.
 */
@Component({
  selector: 'app-confianza-producto',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective],
  template: `
    <ul hsReveal="lista">
      <li>
        <span class="ico" aria-hidden="true"><i class="bi bi-truck"></i></span>
        <span><strong>Envío a todo el Perú</strong><small>En 24 a 72 horas</small></span>
      </li>
      <li>
        <span class="ico" aria-hidden="true"><i class="bi bi-shield-check"></i></span>
        <span><strong>Garantía oficial</strong><small>Del fabricante</small></span>
      </li>
      <li>
        <span class="ico" aria-hidden="true"><i class="bi bi-arrow-repeat"></i></span>
        <span><strong>Cambios</strong><small>Dentro de los 7 días</small></span>
      </li>
      <li>
        <span class="ico" aria-hidden="true"><i class="bi bi-credit-card-2-back"></i></span>
        <span><strong>Pago seguro</strong><small>Tarjeta, Yape, Plin o transferencia</small></span>
      </li>
    </ul>
  `,
  styles: [`
    :host { display: block; }

    ul {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 16px;
      border: 1px solid var(--t-borde);
      border-radius: var(--t-r-md);
      background: var(--t-superficie);
      transition: translate 420ms var(--x-resorte-suave), border-color 240ms ease, box-shadow 320ms ease;
    }

    li:hover {
      translate: 0 -4px;
      border-color: var(--t-borde-fuerte);
      box-shadow: var(--t-sombra-md);
    }

    .ico {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 14px;
      background: var(--t-primario-claro);
      color: var(--t-primario-texto);
      font-size: 1.2rem;
      transition: rotate 460ms var(--x-resorte), background-color 240ms ease, color 240ms ease;
    }

    li:hover .ico {
      rotate: -8deg;
      background: var(--t-primario);
      color: var(--t-cta-texto);
    }

    strong {
      display: block;
      font-family: var(--hs-fuente-titulos);
      font-size: 0.9rem;
      font-weight: 750;
      line-height: 1.2;
      letter-spacing: -0.015em;
      color: var(--t-texto);
    }

    small {
      display: block;
      margin-top: 4px;
      font-size: 0.75rem;
      line-height: 1.45;
      color: var(--t-texto-suave);
    }

    @media (max-width: 1100px) {
      ul { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (hover: none) {
      li:hover { translate: none; }
    }
  `],
})
export class ConfianzaProductoComponent {}
