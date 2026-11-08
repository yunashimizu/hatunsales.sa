import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, NgZone, PLATFORM_ID, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { NotificationService } from '../services/notification.service';

/** Cada cuánto se pregunta si hay una versión nueva (solo con la pestaña a la vista). */
export const REVISION_VERSION_MS = 30 * 60 * 1000;
/** Misma clave que el aviso de «versión nueva» del manejador de errores: así nunca salen dos. */
const CLAVE_NUEVA_VERSION = 'nueva-version';

/** Evento no estándar que Chrome y Edge lanzan cuando la app se puede instalar. */
interface EventoInstalacion extends Event {
  prompt(): Promise<unknown>;
}

/**
 * App instalable y siempre al día (PWA sin ventas sin conexión).
 *
 * - Aviso de versión nueva: el service worker baja la versión en segundo plano y aquí se avisa con un
 *   mensaje que no se cierra solo y un botón «Actualizar» (activa la versión y recarga).
 * - Instalar: se guarda el evento `beforeinstallprompt` (llega una sola vez por carga) para ofrecer
 *   «Instalar HatunSales» en el menú de usuario. Nunca se muestra un cartel solo.
 *
 * Se arranca al iniciar la app (`iniciar()`), antes de que haya sesión, para no perder el evento.
 */
@Injectable({ providedIn: 'root' })
export class ActualizacionAppService {
  private readonly aviso = inject(NotificationService);
  private readonly zona = inject(NgZone);
  private readonly doc = inject(DOCUMENT);
  private readonly destruir = inject(DestroyRef);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));
  /** null si el service worker no está disponible (desarrollo, servidor, pruebas sin él). */
  private readonly sw = inyectarSwUpdate();
  private eventoInstalacion: EventoInstalacion | null = null;
  private arrancado = false;

  /** true solo mientras el navegador ofrece instalar la app. */
  readonly instalable = signal(false);

  iniciar(): void {
    if (!this.navegador || this.arrancado) return;
    this.arrancado = true;
    const ventana = this.doc.defaultView;
    const alOfrecer = (e: Event) => this.guardarEventoInstalacion(e);
    const alInstalar = () => this.olvidarEventoInstalacion();
    ventana?.addEventListener('beforeinstallprompt', alOfrecer);
    ventana?.addEventListener('appinstalled', alInstalar);
    this.destruir.onDestroy(() => {
      ventana?.removeEventListener('beforeinstallprompt', alOfrecer);
      ventana?.removeEventListener('appinstalled', alInstalar);
    });

    const sw = this.sw;
    if (!sw?.isEnabled) return;
    const suscripcion = sw.versionUpdates.subscribe((e) => {
      if (e.type === 'VERSION_READY') this.avisarVersionNueva(e);
    });
    this.destruir.onDestroy(() => suscripcion.unsubscribe());
    // El temporizador va fuera de la zona: uno periódico dentro impediría que la app se dé por «estable».
    this.zona.runOutsideAngular(() => {
      const temporizador = setInterval(() => {
        if (this.doc.visibilityState === 'visible') this.zona.run(() => void this.buscarVersionNueva());
      }, REVISION_VERSION_MS);
      this.destruir.onDestroy(() => clearInterval(temporizador));
    });
  }

  /** Pregunta al servidor si hay versión nueva; el resultado llega por `versionUpdates`. */
  async buscarVersionNueva(): Promise<boolean> {
    try {
      return (await this.sw?.checkForUpdate()) ?? false;
    } catch {
      return false;
    }
  }

  /** Abre el cuadro de instalación del navegador (solo si hay evento guardado). */
  async instalar(): Promise<void> {
    const evento = this.eventoInstalacion;
    if (!evento) return;
    // El evento sirve una sola vez, se acepte o no.
    this.olvidarEventoInstalacion();
    try {
      await evento.prompt();
    } catch {
      /* el navegador no dejó mostrar el cuadro: no hay nada más que hacer */
    }
  }

  private guardarEventoInstalacion(e: Event): void {
    e.preventDefault(); // sin esto Chrome mostraría su propio cartel
    this.eventoInstalacion = e as EventoInstalacion;
    this.zona.run(() => this.instalable.set(true));
  }

  private olvidarEventoInstalacion(): void {
    this.eventoInstalacion = null;
    this.zona.run(() => this.instalable.set(false));
  }

  private avisarVersionNueva(_evento: VersionReadyEvent): void {
    this.aviso.info('Hay una versión nueva de HatunSales', {
      clave: CLAVE_NUEVA_VERSION,
      icono: 'bi-arrow-repeat',
      mensaje: 'Pulse «Actualizar» para usarla. Si está llenando un formulario, guarde primero lo que pueda.',
      duracion: 0,
      contar: false,
      accion: { etiqueta: 'Actualizar', icono: 'bi-arrow-clockwise', alHacer: () => this.actualizar() },
    });
  }

  /** Activa la versión descargada y recarga; si no se puede activar, recarga igual. */
  async actualizar(): Promise<void> {
    try {
      await this.sw?.activateUpdate();
    } catch {
      /* se recarga de todos modos */
    }
    this.recargar();
  }

  /** Aparte para poder probar `actualizar()` sin recargar de verdad la página de pruebas. */
  protected recargar(): void {
    this.doc.defaultView?.location.reload();
  }
}

/** `SwUpdate` solo existe donde se registró el service worker; en pruebas y en el servidor no hay proveedor. */
function inyectarSwUpdate(): SwUpdate | null {
  try {
    return inject(SwUpdate);
  } catch {
    return null;
  }
}
