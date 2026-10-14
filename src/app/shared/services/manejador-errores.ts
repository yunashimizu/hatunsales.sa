import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler, Injectable, Injector, NgZone, PLATFORM_ID, inject } from '@angular/core';
import { yaNotificado } from '../utils/errores-http.util';
import { NotificationService } from './notification.service';

/** Como mucho un aviso genérico cada 30 s (errores en cadena de un mismo fallo). */
const PAUSA_AVISO_GENERICO_MS = 30_000;

const CLAVE_NUEVA_VERSION = 'nueva-version';
const CLAVE_ERROR_PANTALLA = 'error-pantalla';
const CLAVE_HTTP_NO_MANEJADO = 'http-no-manejado';

/**
 * Fallo al cargar un chunk lazy: casi siempre, una pestaña abierta antes de un
 * deploy en Vercel pide `chunk-VIEJO.js` y recibe el index.html (error de MIME).
 */
const PATRON_CHUNK =
  /(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\w-]+ failed|Expected a JavaScript(-or-Wasm)? module script|Unable to preload CSS)/i;

/** Ruido conocido que no afecta al usuario (navegador, extensiones, scripts de terceros). */
const PATRON_IGNORADO =
  /(ResizeObserver loop|^Script error\.?$|The play\(\) request was interrupted|play\(\) failed because the user didn't interact|Non-Error promise rejection captured)/i;
const NOMBRES_IGNORADOS: ReadonlySet<string> = new Set(['AbortError', 'NotAllowedError']);

/** Errores que Angular/Zone envuelven: { rejection }, { originalError }, { ngOriginalError }, { cause }. */
function desenvolver(error: unknown): unknown {
  let actual: unknown = error;
  for (let i = 0; i < 5 && actual && typeof actual === 'object'; i++) {
    const e = actual as { rejection?: unknown; originalError?: unknown; ngOriginalError?: unknown };
    const siguiente = e.rejection ?? e.ngOriginalError ?? e.originalError;
    if (!siguiente || siguiente === actual) break;
    actual = siguiente;
  }
  return actual;
}

function textoDe(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const { message, name } = error as { message?: unknown; name?: unknown };
    return `${typeof name === 'string' ? name : ''}: ${typeof message === 'string' ? message : ''}`;
  }
  return String(error ?? '');
}

/** true si el error es un fallo al descargar código nuevo (deploy reciente). */
export function esErrorDeCargaDeModulo(error: unknown): boolean {
  const real = desenvolver(error);
  const nombre = (real as { name?: unknown } | null)?.name;
  return nombre === 'ChunkLoadError' || PATRON_CHUNK.test(textoDe(real));
}

/**
 * Red de seguridad global (`{ provide: ErrorHandler, useClass: ManejadorErroresGlobal }`):
 *
 * - Siempre deja el error en consola (como el ErrorHandler por defecto).
 * - Fallo al cargar un módulo tras un deploy → aviso persistente "Hay una
 *   versión nueva de HatunSales" con "Recargar".
 * - HttpErrorResponse que ninguna pantalla manejó → aviso de error (salvo que
 *   el interceptor ya avisara o la petición fuera silenciosa).
 * - Cualquier otro error → como mucho un aviso cada 30 s.
 * - Ignora el ruido del navegador (AbortError, ResizeObserver, "Script error.").
 *
 * No inyecta AlertService (metería sweetalert2 en el bundle inicial) y en el
 * servidor solo registra en consola.
 */
@Injectable()
export class ManejadorErroresGlobal implements ErrorHandler {
  private readonly injector = inject(Injector);
  private readonly zona = inject(NgZone);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));
  private ultimoAvisoGenerico = 0;

  handleError(error: unknown): void {
    const real = desenvolver(error);
    if (this.esRuido(real)) return;

    console.error('ERROR', error);
    if (!this.navegador) return;

    try {
      this.zona.run(() => this.avisar(real));
    } catch (fallo) {
      // Si avisar falla, no hay nada más que hacer; que no se pierda el original.
      console.error('No se pudo mostrar el aviso del error', fallo);
    }
  }

  /**
   * Aviso persistente para recargar tras un deploy. Si se conoce la URL a la
   * que se intentaba ir, "Recargar" abre esa (la navegación falló a medias).
   */
  avisarNuevaVersion(urlDestino?: string): void {
    if (!this.navegador) return;
    const avisos = this.avisos();
    const destino = typeof urlDestino === 'string' && urlDestino.startsWith('/') ? urlDestino : null;
    if (avisos.hayActivo(CLAVE_NUEVA_VERSION) && !destino) return;
    avisos.mostrar({
      clave: CLAVE_NUEVA_VERSION,
      tipo: 'info',
      icono: 'bi-arrow-repeat',
      titulo: 'Hay una versión nueva de HatunSales',
      mensaje: 'Recarga la página para seguir trabajando. Si estabas llenando un formulario, guarda primero lo que puedas.',
      duracion: 0,
      contar: false,
      accion: {
        etiqueta: 'Recargar',
        icono: 'bi-arrow-clockwise',
        alHacer: () => {
          if (destino) window.location.assign(destino);
          else window.location.reload();
        },
      },
    });
  }

  private avisar(error: unknown): void {
    if (esErrorDeCargaDeModulo(error)) {
      this.avisarNuevaVersion();
      return;
    }

    if (error instanceof HttpErrorResponse) {
      const cuerpo = error.error as { silenciosa?: unknown } | null;
      if (yaNotificado(error) || cuerpo?.silenciosa === true) return;
      this.avisos().errorHttp(error, 'No se pudo completar la operación', { clave: CLAVE_HTTP_NO_MANEJADO, contar: false });
      return;
    }

    const ahora = Date.now();
    if (ahora - this.ultimoAvisoGenerico < PAUSA_AVISO_GENERICO_MS) return;
    this.ultimoAvisoGenerico = ahora;
    this.avisos().mostrar({
      clave: CLAVE_ERROR_PANTALLA,
      tipo: 'error',
      titulo: 'Algo no salió bien en esta pantalla',
      mensaje: 'Si algo no responde, recarga la página. Lo que ya guardaste no se pierde.',
      contar: false,
      accion: { etiqueta: 'Recargar', icono: 'bi-arrow-clockwise', alHacer: () => window.location.reload() },
    });
  }

  private esRuido(error: unknown): boolean {
    const nombre = (error as { name?: unknown } | null)?.name;
    if (typeof nombre === 'string' && NOMBRES_IGNORADOS.has(nombre)) return true;
    return PATRON_IGNORADO.test(textoDe(error).replace(/^\w*: /, ''));
  }

  /** Perezoso: el ErrorHandler se crea muy pronto y no debe arrastrar dependencias al arrancar. */
  private avisos(): NotificationService {
    return this.injector.get(NotificationService);
  }
}
