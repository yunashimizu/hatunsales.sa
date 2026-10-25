import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { movimientoPermitido } from './movimiento.util';

/**
 * Botón «volver arriba» con anillo de progreso de lectura. Aparece pasados
 * ~600 px de scroll. Todo se hace con clases y variables CSS escritas fuera de
 * la zona de Angular: no dispara detección de cambios al desplazarse.
 */
@Component({
  selector: 'app-volver-arriba',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="va" aria-label="Volver arriba" title="Volver arriba" (click)="subir()">
      <i class="bi bi-arrow-up" aria-hidden="true"></i>
    </button>
  `,
  styles: `
    :host {
      position: fixed;
      right: max(16px, env(safe-area-inset-right));
      bottom: calc(max(16px, env(safe-area-inset-bottom)) + 70px);
      z-index: calc(var(--z-capa, 1040) - 1);
      pointer-events: none;
    }

    .va {
      --p: 0;
      position: relative;
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: var(--t-superficie, #fff);
      color: var(--t-texto, #0f172a);
      box-shadow: var(--t-sombra-md, 0 6px 16px rgba(0, 0, 0, 0.14));
      cursor: pointer;
      opacity: 0;
      translate: 0 14px;
      scale: 0.85;
      pointer-events: none;
      transition: opacity 260ms var(--x-ease, ease), translate 380ms var(--x-ease, ease), scale 380ms var(--x-resorte-suave, ease),
        background-color 200ms ease, color 200ms ease;
    }

    :host(.visible) .va {
      opacity: 1;
      translate: 0 0;
      scale: 1;
      pointer-events: auto;
    }

    /* Anillo: arco de color que crece con el scroll */
    .va::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: conic-gradient(var(--x-coral, #ff7d36) calc(var(--p) * 1turn), var(--t-borde, #e6e9f2) 0);
      -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px));
      mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px));
    }

    .va:hover {
      background: var(--t-texto, #0f172a);
      color: var(--t-fondo, #fff);
    }

    .va:active {
      scale: 0.92;
      transition-duration: 90ms;
    }

    .va i {
      font-size: 1.1rem;
      transition: translate 300ms var(--x-resorte-suave, ease);
    }

    .va:hover i {
      translate: 0 -2px;
    }
  `,
})
export class VolverArribaComponent implements OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly plataforma = inject(PLATFORM_ID);
  private readonly zona = inject(NgZone);
  private frame = 0;

  private readonly alDesplazar = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const y = window.scrollY;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      this.host.classList.toggle('visible', y > 600);
      const boton = this.host.firstElementChild as HTMLElement | null;
      boton?.style.setProperty('--p', total > 0 ? Math.min(1, y / total).toFixed(3) : '0');
    });
  };

  ngOnInit(): void {
    if (!isPlatformBrowser(this.plataforma)) return;
    this.zona.runOutsideAngular(() => window.addEventListener('scroll', this.alDesplazar, { passive: true }));
    this.alDesplazar();
  }

  ngOnDestroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    if (isPlatformBrowser(this.plataforma)) window.removeEventListener('scroll', this.alDesplazar);
  }

  subir(): void {
    window.scrollTo({ top: 0, behavior: movimientoPermitido() ? 'smooth' : 'auto' });
  }
}
