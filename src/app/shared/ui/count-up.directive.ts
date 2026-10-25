import { isPlatformBrowser } from '@angular/common';
import { Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy, PLATFORM_ID, SimpleChanges, inject } from '@angular/core';
import { alEntrarEnPantalla, dejarDeObservar, easeOutExpo, movimientoPermitido } from './movimiento.util';

/**
 * Cuenta animada para cifras: <span [hsCountUp]="total" [hsDecimales]="2" hsPrefijo="S/ "></span>
 *
 * Escribe el texto del propio elemento (que debe estar vacío en la plantilla) con
 * el mismo formato que el pipe `number` de Angular (en-US: 1,234.50). Arranca al
 * entrar en pantalla y, si el valor cambia después, cuenta desde la cifra mostrada.
 * Con valor nulo no toca el elemento (así sigue mandando el «—» de la plantilla),
 * y con movimiento reducido o en servidor escribe la cifra final sin animar.
 */
@Directive({
  selector: '[hsCountUp]',
  standalone: true,
})
export class CountUpDirective implements OnChanges, OnDestroy {
  @Input('hsCountUp') valor: number | null | undefined;
  @Input() hsDecimales = 0;
  @Input() hsPrefijo = '';
  @Input() hsSufijo = '';
  /** Duración en ms de la primera cuenta (los cambios posteriores duran la mitad). */
  @Input() hsDuracion = 1200;

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly plataforma = inject(PLATFORM_ID);
  private readonly zona = inject(NgZone);
  private mostrado = 0;
  private frame = 0;
  private visible = false;
  private esperando = false;
  private formato?: Intl.NumberFormat;

  ngOnChanges(cambios: SimpleChanges): void {
    if (cambios['hsDecimales']) this.formato = undefined;
    const destino = this.valor;
    if (destino == null || Number.isNaN(Number(destino))) return;
    const meta = Number(destino);

    if (!isPlatformBrowser(this.plataforma) || !movimientoPermitido()) {
      this.escribir(meta);
      this.mostrado = meta;
      return;
    }
    if (this.visible) {
      this.animar(meta, this.hsDuracion / 2);
      return;
    }
    if (this.esperando) return; // al aparecer leerá el valor más reciente
    this.esperando = true;
    this.escribir(0);
    this.zona.runOutsideAngular(() => {
      const ok = alEntrarEnPantalla(this.el, () => {
        this.esperando = false;
        this.visible = true;
        this.animar(Number(this.valor ?? 0), this.hsDuracion);
      });
      if (!ok) {
        this.esperando = false;
        this.visible = true;
        this.escribir(meta);
        this.mostrado = meta;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    if (this.esperando) dejarDeObservar(this.el);
  }

  private animar(meta: number, duracion: number): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    const desde = this.mostrado;
    if (desde === meta) {
      this.escribir(meta);
      return;
    }
    const t0 = performance.now();
    this.zona.runOutsideAngular(() => {
      const paso = (ahora: number): void => {
        const t = Math.min(1, (ahora - t0) / Math.max(1, duracion));
        this.mostrado = desde + (meta - desde) * easeOutExpo(t);
        this.escribir(this.mostrado);
        if (t < 1) this.frame = requestAnimationFrame(paso);
        else {
          this.frame = 0;
          this.mostrado = meta;
          this.escribir(meta);
        }
      };
      this.frame = requestAnimationFrame(paso);
    });
  }

  private escribir(n: number): void {
    this.formato ??= new Intl.NumberFormat('en-US', {
      minimumFractionDigits: this.hsDecimales,
      maximumFractionDigits: this.hsDecimales,
    });
    this.el.textContent = `${this.hsPrefijo}${this.formato.format(n)}${this.hsSufijo}`;
  }
}
