import { isPlatformBrowser } from '@angular/common';
import { Directive, ElementRef, NgZone, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { punteroFino } from './movimiento.util';

/**
 * Foco de luz que sigue al cursor sobre una tarjeta: escribe --mx / --my (px
 * relativos al elemento). El resplandor lo dibuja la clase `.x-brillo`
 * (shared/styles/expresivo.css) o el CSS del componente con esas variables.
 * Solo con ratón o trackpad; las escrituras van agrupadas en un frame.
 */
@Directive({
  selector: '[hsSpotlight]',
  standalone: true,
})
export class SpotlightDirective implements OnInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly plataforma = inject(PLATFORM_ID);
  private readonly zona = inject(NgZone);
  private frame = 0;
  private x = 0;
  private y = 0;
  private activo = false;

  private readonly alMover = (evento: PointerEvent): void => {
    const caja = this.el.getBoundingClientRect();
    this.x = evento.clientX - caja.left;
    this.y = evento.clientY - caja.top;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.el.style.setProperty('--mx', `${this.x}px`);
      this.el.style.setProperty('--my', `${this.y}px`);
    });
  };

  ngOnInit(): void {
    if (!isPlatformBrowser(this.plataforma) || !punteroFino()) return;
    this.activo = true;
    this.zona.runOutsideAngular(() => this.el.addEventListener('pointermove', this.alMover, { passive: true }));
  }

  ngOnDestroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    if (this.activo) this.el.removeEventListener('pointermove', this.alMover);
  }
}
