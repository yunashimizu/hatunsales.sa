import { ChangeDetectionStrategy, Component } from '@angular/core';
import { urlWhatsapp } from '../../config/empresa-tienda.config';

/**
 * Botón flotante de WhatsApp con el número de la empresa (config/empresa-tienda.config.ts).
 * Abre wa.me con un mensaje inicial; no hay lógica propia.
 */
@Component({
  selector: 'app-whatsapp-flotante',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="wa" [href]="href" target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp">
      <span class="wa__onda" aria-hidden="true"></span>
      <i class="bi bi-whatsapp" aria-hidden="true"></i>
      <span class="wa__texto">¿Te ayudamos?<small>Escríbenos por WhatsApp</small></span>
    </a>
  `,
  styles: `
    :host {
      position: fixed;
      right: max(16px, env(safe-area-inset-right));
      bottom: max(16px, env(safe-area-inset-bottom));
      z-index: calc(var(--z-capa, 1040) - 1);
    }

    .wa {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 0;
      height: 52px;
      min-width: 52px;
      padding: 0 15px;
      border-radius: 999px;
      background: #1faa59;
      color: #fff;
      font-size: 1.5rem;
      text-decoration: none;
      box-shadow: 0 12px 28px -8px rgba(31, 170, 89, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.25);
      transition: gap 360ms var(--x-ease, ease), padding 360ms var(--x-ease, ease), scale 300ms var(--x-resorte-suave, ease),
        background-color 200ms ease;
    }

    .wa:hover {
      gap: 10px;
      padding: 0 20px 0 15px;
      background: #17984d;
      color: #fff;
      text-decoration: none;
    }

    .wa:active {
      scale: 0.95;
      transition-duration: 90ms;
    }

    .wa i {
      position: relative;
      line-height: 1;
    }

    .wa__onda {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: #1faa59;
      opacity: 0;
      pointer-events: none;
      animation: wa-onda 3.2s var(--x-ease-in-out, ease-in-out) 2s infinite;
    }

    @keyframes wa-onda {
      0% { opacity: 0.5; scale: 1; }
      60%, 100% { opacity: 0; scale: 1.5 1.9; }
    }

    .wa__texto {
      display: grid;
      max-width: 0;
      overflow: hidden;
      font-size: 0.875rem;
      font-weight: 700;
      line-height: 1.15;
      white-space: nowrap;
      opacity: 0;
      transition: max-width 400ms var(--x-ease, ease), opacity 240ms ease;
    }

    .wa__texto small {
      font-size: 0.6875rem;
      font-weight: 500;
      opacity: 0.85;
    }

    @media (hover: hover) {
      .wa:hover .wa__texto {
        max-width: 190px;
        opacity: 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .wa__onda { animation: none; }
    }
  `,
})
export class WhatsappFlotanteComponent {
  readonly href = urlWhatsapp('Hola, necesito ayuda con un producto de la tienda.');
}
