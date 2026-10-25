import { isPlatformBrowser } from '@angular/common';
import { Directive, ElementRef, Input, NgZone, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { alEntrarEnPantalla, dejarDeObservar, movimientoPermitido } from './movimiento.util';

export type TipoRevelado = '' | 'arriba' | 'abajo' | 'izq' | 'der' | 'escala' | 'fundido' | 'lista' | 'palabras';

/**
 * Revela el elemento al entrar en pantalla (fundido + desplazamiento corto).
 *
 *   <section hsReveal>…</section>                 sube y aparece
 *   <ul hsReveal="lista">…</ul>                   los hijos entran escalonados
 *   <h1 hsReveal="palabras">…<span class="x-palabra"><span>…</span></span></h1>
 *   <div hsReveal="izq" [hsRevealRetraso]="150">
 *
 * Solo marca atributos (data-rev, data-rev-tipo, --rev-retraso): el movimiento es
 * CSS (shared/styles/expresivo.css). Sin JS, con movimiento reducido o en el
 * servidor no se marca nada y el contenido se ve desde el primer momento.
 */
@Directive({
  selector: '[hsReveal]',
  standalone: true,
})
export class RevealDirective implements OnInit, OnDestroy {
  @Input('hsReveal') tipo: TipoRevelado = '';
  /** Retraso extra en milisegundos. */
  @Input() hsRevealRetraso = 0;

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly plataforma = inject(PLATFORM_ID);
  private readonly zona = inject(NgZone);
  private observando = false;

  ngOnInit(): void {
    if (!isPlatformBrowser(this.plataforma) || !movimientoPermitido()) return;
    const el = this.el;
    this.zona.runOutsideAngular(() => {
      el.setAttribute('data-rev', '');
      if (this.tipo) el.setAttribute('data-rev-tipo', this.tipo);
      if (this.hsRevealRetraso) el.style.setProperty('--rev-retraso', `${this.hsRevealRetraso}ms`);
      this.observando = alEntrarEnPantalla(el, () => el.setAttribute('data-rev', 'visto'));
      // Sin IntersectionObserver no se puede esperar al scroll: se muestra ya.
      if (!this.observando) el.setAttribute('data-rev', 'visto');
    });
  }

  ngOnDestroy(): void {
    if (this.observando) dejarDeObservar(this.el);
  }
}
