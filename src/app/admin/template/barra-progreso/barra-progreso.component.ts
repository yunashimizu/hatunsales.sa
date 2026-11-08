import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { CargaGlobalService } from '../../../shared/services/carga-global.service';

/** Tiempo que la barra se queda llena y se desvanece antes de volver a reposo. */
const CIERRE_MS = 420;

type Fase = 'reposo' | 'avance' | 'cierre';

/** Ruta sin consulta ni fragmento: cambiar solo los filtros no es «navegar». */
function rutaSinConsulta(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? url;
}

/**
 * Barra fina de 3 px en el borde superior del panel. Avanza mientras se cambia de
 * pantalla (se descarga su código) o hay una petición de primer plano lenta, se
 * completa al terminar y se desvanece. Es solo decorativa: el aviso de «cargando»
 * de cada pantalla (aria-busy) sigue siendo el que leen los lectores de pantalla.
 */
@Component({
  selector: 'app-barra-progreso',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    class="bp"
    role="progressbar"
    aria-hidden="true"
    [class.bp--avance]="fase() === 'avance'"
    [class.bp--cierre]="fase() === 'cierre'">
    <div class="bp__relleno"></div>
  </div>`,
  styles: `
    :host {
      display: contents;
    }

    .bp {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      z-index: 1300;
      pointer-events: none;
      opacity: 0;
    }

    .bp__relleno {
      width: 0;
      height: 100%;
      background: var(--adm-marca);
      border-radius: 0 3px 3px 0;
    }

    .bp--avance {
      opacity: 1;
    }

    .bp--avance .bp__relleno {
      width: 80%;
      transition: width 1.2s cubic-bezier(0.1, 0.7, 0.2, 1);
    }

    .bp--cierre {
      opacity: 0;
      transition: opacity 200ms ease 120ms;
    }

    .bp--cierre .bp__relleno {
      width: 100%;
      transition: width 120ms ease-out;
    }

    @media (prefers-reduced-motion: reduce) {
      .bp--avance .bp__relleno,
      .bp--cierre .bp__relleno {
        width: 100%;
        transition: none;
      }

      .bp--cierre {
        transition: none;
      }
    }
  `,
})
export class BarraProgresoComponent {
  private readonly router = inject(Router);
  private readonly carga = inject(CargaGlobalService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly navegando = signal(false);
  private readonly activa = computed(() => this.navegando() || this.carga.pendientes() > 0);
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  protected readonly fase = signal<Fase>('reposo');

  constructor() {
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((evento) => {
      if (evento instanceof NavigationStart) {
        // Cambiar solo los filtros de la misma pantalla no es un cambio de pantalla.
        if (rutaSinConsulta(evento.url) !== rutaSinConsulta(this.router.url)) this.navegando.set(true);
      } else if (evento instanceof NavigationEnd || evento instanceof NavigationCancel || evento instanceof NavigationError) {
        this.navegando.set(false);
      }
    });

    effect(() => {
      const activa = this.activa();
      untracked(() => (activa ? this.avanzar() : this.cerrar()));
    });

    this.destroyRef.onDestroy(() => this.limpiarTemporizador());
  }

  private avanzar(): void {
    this.limpiarTemporizador();
    const fase = this.fase();
    if (fase === 'avance') return;
    if (fase === 'reposo') {
      this.fase.set('avance');
      return;
    }
    // Venía de un cierre (barra llena): vuelve a 0 un instante para que el ancho arranque de cero.
    this.fase.set('reposo');
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      if (this.activa()) this.fase.set('avance');
    }, 30);
  }

  private cerrar(): void {
    if (this.fase() !== 'avance') return;
    this.fase.set('cierre');
    this.limpiarTemporizador();
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      this.fase.set('reposo');
    }, CIERRE_MS);
  }

  private limpiarTemporizador(): void {
    if (this.temporizador !== null) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
  }
}
