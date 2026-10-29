import { DOCUMENT, NgClass, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  InjectionToken,
  Input,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AnimationItem, LottiePlayer } from 'lottie-web';
import { programarEnReposo } from '../../shared/routing/precarga-panel.strategy';

/** Mismo corte que `lg:` de Tailwind: la ilustración solo existe en escritorio. */
const CONSULTA_ESCRITORIO = '(min-width: 1024px)';

const URL_ANIMACION = 'https://assets2.lottiefiles.com/packages/lf20_jbrw3hcz.json';

/**
 * Descarga de lottie-web (308 kB) bajo demanda. Va en un token para que las
 * pruebas comprueben cuándo se pide sin bajar la librería.
 */
export const CARGAR_LOTTIE = new InjectionToken<() => Promise<LottiePlayer>>('CARGAR_LOTTIE', {
  providedIn: 'root',
  factory: () => () => import('lottie-web').then((m) => m.default),
});

/**
 * Descarga del módulo del panel (template.module: marco, menú e inicio). Si ya
 * bajó mientras el personal escribía, /dashboard abre sin esperar su bloque.
 */
export const PRECARGAR_PANEL = new InjectionToken<() => Promise<unknown>>('PRECARGAR_PANEL', {
  providedIn: 'root',
  factory: () => () => import('../../admin/template/template.module'),
});

/**
 * Marco común de login y registro. El formulario (contenido proyectado) se ve y
 * acepta clics desde el primer cuadro: nada de lo decorativo lo retrasa.
 * - La entrada del lado de marca usa las clases de movimiento de la app
 *   (mov-item, respetan prefers-reduced-motion); el formulario no se anima.
 * - En móvil el formulario va primero y la ilustración ni se muestra ni se
 *   descarga; en escritorio lottie se carga cuando el navegador queda libre.
 */
@Component({
  selector: 'app-auth-shell',
  standalone: true,
  imports: [NgClass, RouterLink],
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthShellComponent implements AfterViewInit, OnDestroy {
  @Input() modo: 'login' | 'registro' = 'login';

  @ViewChild('lottieHost') lottieHost?: ElementRef<HTMLDivElement>;

  private readonly ventana = inject(DOCUMENT).defaultView;
  private readonly enBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cargarLottie = inject(CARGAR_LOTTIE);
  private readonly precargarPanel = inject(PRECARGAR_PANEL);
  /** Tareas en espera de reposo; se cancelan si se sale antes de la pantalla. */
  private readonly cancelaciones: Array<() => void> = [];
  private animacion?: AnimationItem;
  private panelSolicitado = false;
  private destruido = false;

  readonly beneficios = [
    { icono: 'bi-truck', titulo: 'Envíos rápidos', texto: 'A todo el Perú' },
    { icono: 'bi-shield-check', titulo: 'Compra segura', texto: 'Datos cifrados' },
    { icono: 'bi-star', titulo: 'Calidad', texto: 'Marcas top' },
    { icono: 'bi-headset', titulo: 'Soporte', texto: 'Te ayudamos' },
  ];

  ngAfterViewInit(): void {
    const ventana = this.ventana;
    if (!this.enBrowser || !ventana || !this.coincide(CONSULTA_ESCRITORIO)) return;
    this.cancelaciones.push(programarEnReposo(ventana, () => void this.montarLottie()));
  }

  /**
   * Primer foco en el formulario de acceso: el panel se descarga mientras se
   * escriben las credenciales. Solo en escritorio, donde trabaja el personal:
   * en móvil entran sobre todo clientes de la tienda y no se gastan sus datos.
   */
  precargarPanelAlEscribir(): void {
    const ventana = this.ventana;
    if (this.panelSolicitado || this.modo !== 'login' || !this.enBrowser || !ventana) return;
    if (!this.coincide(CONSULTA_ESCRITORIO)) return;
    this.panelSolicitado = true;
    this.cancelaciones.push(
      programarEnReposo(ventana, () => {
        // Descarga de cortesía: si falla, la navegación tras el login vuelve a
        // pedir el bloque y, si tampoco puede, ofrece recargar.
        this.precargarPanel().catch(() => undefined);
      }),
    );
  }

  ngOnDestroy(): void {
    this.destruido = true;
    for (const cancelar of this.cancelaciones) cancelar();
    this.animacion?.destroy();
  }

  private coincide(consulta: string): boolean {
    return this.ventana?.matchMedia?.(consulta).matches ?? false;
  }

  private async montarLottie(): Promise<void> {
    const host = this.lottieHost?.nativeElement;
    if (!host || this.destruido) return;

    // Lottie inspecciona canvas al importar: se carga solo en el navegador y
    // con la vista ya pintada (así el login también se puede renderizar en SSR).
    let lottie: LottiePlayer;
    try {
      lottie = await this.cargarLottie();
    } catch {
      return; // La animación es decorativa; el formulario sigue disponible.
    }
    if (this.destruido) return;
    // Con movimiento reducido la ilustración queda quieta en su primer cuadro.
    const animar = !this.coincide('(prefers-reduced-motion: reduce)');
    this.animacion = lottie.loadAnimation({
      container: host,
      renderer: 'svg',
      loop: animar,
      autoplay: animar,
      path: URL_ANIMACION,
    });
  }
}
