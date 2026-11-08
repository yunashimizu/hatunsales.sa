import { DOCUMENT } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import {
  NavigationError,
  Router,
  ViewTransitionInfo,
  provideRouter,
  withInMemoryScrolling,
  withNavigationErrorHandler,
  withPreloading,
  withViewTransitions,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { cargaGlobalInterceptor } from './interceptors/carga-global.interceptor';
import { errorInterceptor } from './interceptors/error.interceptor';
import { PrecargaPanelStrategy } from './shared/routing/precarga-panel.strategy';
import { ConectividadService } from './shared/services/conectividad.service';
import { ManejadorErroresGlobal, esErrorDeCargaDeModulo } from './shared/services/manejador-errores';
import { ActualizacionAppService } from './shared/ui/actualizacion-app.service';

/** Ruta sin consulta ni fragmento ("/store/catalogo?cat=3" → "/store/catalogo"). */
function rutaSinConsulta(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? url;
}

/**
 * Transición de vista entre pantallas (el CSS vive en shared/styles/movimiento.css).
 * Se omite con movimiento reducido y cuando solo cambian los filtros de la
 * misma pantalla (query params), para que filtrar no "parpadee".
 */
function alCrearTransicion({ transition }: ViewTransitionInfo): void {
  const ventana = inject(DOCUMENT).defaultView;
  if (ventana?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    omitirTransicion(transition);
    return;
  }
  const router = inject(Router);
  const destino = router.currentNavigation()?.finalUrl;
  if (destino && rutaSinConsulta(router.serializeUrl(destino)) === rutaSinConsulta(router.url)) {
    omitirTransicion(transition);
  }
}

/**
 * Omite la transición y absorbe el rechazo de `ready`: al saltarla, Chromium rechaza esa promesa con
 * `AbortError: Transition was skipped`, que sin un `catch` sale como error de consola (inocuo).
 */
function omitirTransicion(transition: ViewTransitionInfo['transition']): void {
  transition.skipTransition();
  transition.ready?.catch?.(() => undefined);
}

/**
 * Navegación que falla al descargar el código de una pantalla (deploy nuevo en
 * Vercel con la pestaña abierta): se ofrece recargar yendo a esa pantalla.
 * El resto de errores de navegación siguen su curso normal (ErrorHandler).
 */
function alFallarNavegacion(evento: NavigationError): void {
  if (!esErrorDeCargaDeModulo(evento.error)) return;
  const manejador = inject(ErrorHandler);
  if (manejador instanceof ManejadorErroresGlobal) manejador.avisarNuevaVersion(evento.url);
}

/**
 * Angular 21 es zoneless por defecto: sin Zone.js, los HTTP subscribe
 * actualizan datos pero la UI no se repinta hasta un click.
 * Volvemos a Zone con eventCoalescing para fluidez sin reescribir todo a signals.
 *
 * Sin provideAnimations (nada usa @angular/animations: las animaciones son CSS
 * con animate.enter/animate.leave) ni hidratación (todas las rutas se
 * renderizan en el cliente, ver app.routes.server.ts; si algún día hay SSR
 * real, reponer provideClientHydration(withEventReplay())).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: ManejadorErroresGlobal },
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
      withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated: alCrearTransicion }),
      withNavigationErrorHandler(alFallarNavegacion),
      // Pantallas del panel marcadas con data.precargar, solo con sesión de personal.
      withPreloading(PrecargaPanelStrategy),
    ),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor, cargaGlobalInterceptor])),
    // Avisos "Sin conexión" / "Conexión restablecida" (no hace nada en el servidor).
    provideAppInitializer(() => inject(ConectividadService).iniciar()),
    // PWA: solo en producción (`ng build` con ngsw-config.json); en desarrollo no se registra nada.
    // Registra al estar estable o a los 30 s, lo que ocurra antes (la app siempre tiene algo pendiente).
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    // Escucha desde el arranque «instalar» y «versión nueva» (el evento de instalación llega una sola vez).
    provideAppInitializer(() => inject(ActualizacionAppService).iniciar()),
  ],
};
