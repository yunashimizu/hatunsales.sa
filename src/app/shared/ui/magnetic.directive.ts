import { isPlatformBrowser } from '@angular/common';
import { Directive, ElementRef, Input, NgZone, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { acotar, movimientoPermitido, punteroFino } from './movimiento.util';

/**
 * Efecto imán: el envoltorio se acerca un poco al cursor y vuelve con un resorte.
 * Úsalo en un <span class="x-iman" hsMagnetic> alrededor del botón (el CSS aplica
 * `translate` con --mag-x / --mag-y y su propia transición). `hsMagnetic` admite
 * la fuerza (0–1, por defecto 0,32).
 */
@Directive({
  selector: '[hsMagnetic]',
  standalone: true,
})
export class MagneticDirective implements OnInit, OnDestroy {
  @Input('hsMagnetic') fuerza: number | '' = '';
  /** Desplazamiento máximo en px. */
  @Input() hsMagneticMax = 12;

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly plataforma = inject(PLATFORM_ID);
  private readonly zona = inject(NgZone);
  private activo = false;

  private readonly alMover = (evento: PointerEvent): void => {
    const f = this.fuerza === '' ? 0.32 : Number(this.fuerza) || 0.32;
    const caja = this.el.getBoundingClientRect();
    const dx = evento.clientX - (caja.left + caja.width / 2);
    const dy = evento.clientY - (caja.top + caja.height / 2);
    const max = this.hsMagneticMax;
    this.el.style.setProperty('--mag-x', String(acotar(dx * f, -max, max)));
    this.el.style.setProperty('--mag-y', String(acotar(dy * f, -max, max)));
  };

  private readonly alSalir = (): void => {
    this.el.style.setProperty('--mag-x', '0');
    this.el.style.setProperty('--mag-y', '0');
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
    if (!this.activo) return;
    this.el.removeEventListener('pointermove', this.alMover);
    this.el.removeEventListener('pointerleave', this.alSalir);
  }
}
