import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, catchError, of, switchMap } from 'rxjs';
import { esRolCliente, esRolStaff, rolPermitido } from '../../auth/roles.constants';
import { StorageUtil } from '../../utils/storage.util';

/** Margen para que la pantalla recién abierta haga primero sus propias peticiones. */
export const RETRASO_PRECARGA_MS = 2000;

/** Tope de requestIdleCallback: con la CPU siempre ocupada, la tarea igual corre. */
const ESPERA_MAXIMA_REPOSO_MS = 3000;

/**
 * Ejecuta `tarea` pasados `retrasoMs` y cuando el navegador queda libre
 * (requestIdleCallback; Safari no lo tiene y ahí basta el setTimeout). El
 * setTimeout previo también deja pasar el primer pintado de la pantalla.
 * Devuelve la función que cancela lo pendiente (ngOnDestroy, unsubscribe).
 * La usan esta estrategia y el login (ilustración y precarga del panel).
 */
export function programarEnReposo(ventana: Window, tarea: () => void, retrasoMs = 0): () => void {
  let idReposo: number | undefined;
  const idTemporizador = ventana.setTimeout(() => {
    if (typeof ventana.requestIdleCallback === 'function') {
      idReposo = ventana.requestIdleCallback(() => tarea(), { timeout: ESPERA_MAXIMA_REPOSO_MS });
    } else {
      tarea();
    }
  }, retrasoMs);
  return () => {
    ventana.clearTimeout(idTemporizador);
    if (idReposo !== undefined) ventana.cancelIdleCallback(idReposo);
  };
}

/** Rol de la sesión leído igual que auth.guard y role.guard; null si no es personal. */
function sesionDePersonal(): { rolNombre: string; rolId: number } | null {
  if (!StorageUtil.get('token')) return null;
  const rolNombre = StorageUtil.get('rolNombre') ?? StorageUtil.get('rol') ?? '';
  const rolId = Number(StorageUtil.get('rolId') ?? 0);
  if (esRolCliente(rolId, rolNombre) || !esRolStaff(rolId, rolNombre)) return null;
  return { rolNombre, rolId };
}

/** Ruta marcada con `data.precargar` que el rol de la sesión puede abrir (data.roles). */
function debePrecargar(route: Route): boolean {
  if (route.data?.['precargar'] !== true) return false;
  const sesion = sesionDePersonal();
  if (!sesion) return false;
  const roles: string[] = route.data?.['roles'] ?? [];
  return rolPermitido(sesion.rolNombre, roles, sesion.rolId);
}

/**
 * Baja en segundo plano el código de las pantallas más usadas del panel (rutas
 * con `data: { precargar: true }`), así al abrirlas no se espera su bloque.
 *
 * - Solo con sesión de personal: a los visitantes y clientes de la tienda no se
 *   les descarga código del panel, ni pantallas que su rol no puede abrir.
 * - Espera 2 s y a que el navegador quede libre, para no competir con las
 *   peticiones de la pantalla recién abierta.
 * - El router la consulta tras cada navegación por las rutas aún no cargadas;
 *   las hijas de un módulo diferido entran cuando ese módulo ya se cargó.
 */
@Injectable({ providedIn: 'root' })
export class PrecargaPanelStrategy implements PreloadingStrategy {
  private readonly ventana = inject(DOCUMENT).defaultView;
  private readonly enNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  preload(route: Route, cargar: () => Observable<unknown>): Observable<unknown> {
    const ventana = this.ventana;
    if (!this.enNavegador || !ventana || !debePrecargar(route)) return of(null);

    return new Observable<void>((suscriptor) =>
      programarEnReposo(
        ventana,
        () => {
          suscriptor.next();
          suscriptor.complete();
        },
        RETRASO_PRECARGA_MS,
      ),
    ).pipe(
      // La sesión pudo cerrarse durante la espera.
      switchMap(() => (debePrecargar(route) ? cargar() : of(null))),
      // Es una descarga de cortesía (como PreloadAllModules de Angular): si falla
      // por red o por un deploy nuevo no se avisa; al abrir la pantalla el router
      // vuelve a pedir el bloque y, si tampoco puede, ofrece recargar
      // (withNavigationErrorHandler en app.config).
      catchError(() => of(null)),
    );
  }
}
