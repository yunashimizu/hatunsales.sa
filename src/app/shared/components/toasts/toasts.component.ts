import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Aviso, NotificationService, TipoAviso } from '../../services/notification.service';

export type TemaAvisos = 'panel' | 'tienda' | 'auth';

const ICONOS: Readonly<Record<TipoAviso, string>> = {
  exito: 'bi-check-circle-fill',
  error: 'bi-x-octagon-fill',
  advertencia: 'bi-exclamation-triangle-fill',
  info: 'bi-info-circle-fill',
  cargando: 'bi-arrow-repeat',
};

function temaDeUrl(url: string): TemaAvisos {
  if (url.startsWith('/store')) return 'tienda';
  if (url.startsWith('/auth')) return 'auth';
  return 'panel';
}

function rutaSinConsulta(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? url;
}

/**
 * Pila de avisos `nt-*` de toda la app (montada una sola vez en app.html).
 *
 * - Posición y aspecto según la zona: panel (arriba a la derecha, bajo la
 *   cabecera), tienda (bajo su cabecera sticky) y login; en móvil, abajo al
 *   centro respetando el área segura. Las páginas pueden mover la pila con
 *   variables CSS (--hs-avisos-*) o con los marcadores .hs-reserva-inferior y
 *   .hs-cajon-abierto (ver toasts.component.css).
 * - Entrada y salida con la API nativa animate.enter / animate.leave.
 * - Pausa al pasar el ratón o con el foco dentro; Escape cierra el aviso
 *   enfocado y el foco vuelve a donde estaba.
 * - Los lectores de pantalla leen las dos regiones vivas (no cada aviso).
 *
 * Las clases llevan prefijo `nt-` (Bootstrap ya define `.toast`) y la
 * encapsulación está desactivada para poder usar `body:has(...)`.
 */
@Component({
  selector: 'app-toasts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './toasts.component.html',
  styleUrl: './toasts.component.css',
})
export class ToastsComponent {
  protected readonly avisos = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly documento = inject(DOCUMENT);
  private readonly pila = viewChild.required<ElementRef<HTMLElement>>('pila');

  protected readonly tema = signal<TemaAvisos>(temaDeUrl(this.router.url));
  protected readonly vacia = computed(() => this.avisos.avisos().length === 0);

  /** Elemento enfocado antes de entrar a los avisos con el teclado. */
  private focoPrevio: HTMLElement | null = null;

  constructor() {
    let rutaActual = rutaSinConsulta(this.router.url);
    this.router.events.pipe(takeUntilDestroyed()).subscribe((evento) => {
      if (evento instanceof NavigationStart) {
        // Otra pantalla: los "Reintentar" de la anterior ya no aplican.
        if (rutaSinConsulta(evento.url) !== rutaActual) this.avisos.descartarReintentos();
      } else if (evento instanceof NavigationEnd) {
        rutaActual = rutaSinConsulta(evento.urlAfterRedirects);
        this.tema.set(temaDeUrl(evento.urlAfterRedirects));
      }
    });
  }

  protected icono(aviso: Aviso): string {
    return aviso.icono || ICONOS[aviso.tipo];
  }

  protected progresoInicial(aviso: Aviso): number {
    return aviso.duracion > 0 ? Math.min(1, aviso.restante / aviso.duracion) : 1;
  }

  protected alEntrarPuntero(evento: PointerEvent): void {
    if (evento.pointerType !== 'touch') this.avisos.pausar('hover');
  }

  protected alSalirPuntero(evento: PointerEvent): void {
    if (evento.pointerType !== 'touch') this.avisos.reanudar('hover');
  }

  protected alEntrarFoco(evento: FocusEvent): void {
    const desde = evento.relatedTarget;
    if (!(desde instanceof Node) || !this.pila().nativeElement.contains(desde)) {
      this.focoPrevio = desde instanceof HTMLElement ? desde : null;
    }
    this.avisos.pausar('foco');
  }

  protected alSalirFoco(evento: FocusEvent): void {
    const hacia = evento.relatedTarget;
    if (hacia instanceof Node && this.pila().nativeElement.contains(hacia)) return;
    this.avisos.reanudar('foco');
  }

  protected alPulsarEscape(aviso: Aviso, evento: Event): void {
    if (!aviso.cerrable) return;
    // Que el Escape no cierre además un panel lateral o un modal de la página.
    evento.stopPropagation();
    this.cerrar(aviso);
  }

  protected cerrar(aviso: Aviso): void {
    this.conFocoGestionado(aviso, () => this.avisos.cerrar(aviso.id));
  }

  protected ejecutar(aviso: Aviso): void {
    this.conFocoGestionado(aviso, () => this.avisos.ejecutarAccion(aviso.id));
  }

  /** Si el aviso que se va tenía el foco, lo pasa al siguiente aviso o lo devuelve a la página. */
  private conFocoGestionado(aviso: Aviso, accion: () => void): void {
    const raiz = this.pila().nativeElement;
    const elemento = raiz.querySelector<HTMLElement>(`[data-aviso-id="${aviso.id}"]`);
    const activo = this.documento.activeElement;
    const teniaFoco = !!elemento && !!activo && elemento.contains(activo);
    accion();
    if (!teniaFoco) return;
    const siguiente = Array.from(raiz.querySelectorAll<HTMLElement>('[data-aviso-id]'))
      .find((el) => el !== elemento && !el.classList.contains('nt-salir'))
      ?.querySelector<HTMLElement>('button');
    const destino = siguiente ?? (this.focoPrevio?.isConnected ? this.focoPrevio : null);
    destino?.focus({ preventScroll: true });
  }
}
