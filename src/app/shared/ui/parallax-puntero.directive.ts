import { isPlatformBrowser } from '@angular/common';
import { Directive, ElementRef, NgZone, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { acotar, movimientoPermitido, punteroFino } from './movimiento.util';

/**
 * Paralaje con el cursor: escribe --px y --py (de -1 a 1, con suavizado) en el
 * elemento. Las capas hijas se mueven con `translate: calc(var(--px) * 14px) …`.
 * Solo con ratón; el bucle de animación se detiene al asentarse.
 */
@Directive({
  selector: '[hsParallaxPuntero]',
  standalone: true,
})
export class ParallaxPunteroDirective implements OnInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly plataforma = inject(PLATFORM_ID);
  private readonly zona = inject(NgZone);
  private frame = 0;
  private objetivoX = 0;
  private objetivoY = 0;
  private x = 0;
  private y = 0;
  private activo = false;

  private readonly alMover = (evento: PointerEvent): void => {
    const caja = this.el.getBoundingClientRect();
    this.objetivoX = acotar(((evento.clientX - caja.left) / caja.width) * 2 - 1, -1, 1);
    this.objetivoY = acotar(((evento.clientY - caja.top) / caja.height) * 2 - 1, -1, 1);
    this.arrancar();
  };

  private readonly alSalir = (): void => {
    this.objetivoX = 0;
    this.objetivoY = 0;
    this.arrancar();
  };

  private readonly paso = (): void => {
    this.x += (this.objetivoX - this.x) * 0.09;
    this.y += (this.objetivoY - this.y) * 0.09;
    this.el.style.setProperty('--px', this.x.toFixed(3));
    this.el.style.setProperty('--py', this.y.toFixed(3));
    const quieto = Math.abs(this.objetivoX - this.x) < 0.002 && Math.abs(this.objetivoY - this.y) < 0.002;
    this.frame = quieto ? 0 : requestAnimationFrame(this.paso);
  };

  ngOnInit(): void {
    if (!isPlatformBrowser(this.plataforma) || !punteroFino() || !movimientoPermitido()) return;
    this.activo = true;
    this.zona.runOutsideAngular(() => {
      this.el.addEventListener('pointermove', this.alMover, { passive: true });
      this.el.addEventListener('pointerleave', this.alSalir, { passive: true });
    });
  }

  ngOnDestroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    if (!this.activo) return;
    this.el.removeEventListener('pointermove', this.alMover);
    this.el.removeEventListener('pointerleave', this.alSalir);
  }

  private arrancar(): void {
    if (!this.frame) this.frame = requestAnimationFrame(this.paso);
  }
}
