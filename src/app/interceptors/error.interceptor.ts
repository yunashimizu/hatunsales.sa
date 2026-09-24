import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/service/auth.service';
import { NotificationService } from '../shared/services/notification.service';
import { StorageUtil } from '../utils/storage.util';

/** En estos endpoints un 401 significa "credenciales inválidas", no "sesión vencida". */
const RUTAS_DE_ACCESO = ['/auth/login', '/auth/register', '/auth/google'];

export const MENSAJE_SESION_EXPIRADA = 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.';

/**
 * Sesión vencida: un 401 con token guardado.
 *
 * Limpia la sesión y, si el usuario estaba en el panel, lo lleva al login
 * (que muestra el motivo). En la tienda solo avisa: se puede seguir navegando
 * como invitado. El error se propaga con un mensaje claro para que los
 * `alert.error(errorOperativo(...))` de cada pantalla no digan "Unauthorized".
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const avisos = inject(NotificationService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !esSesionVencida(req.url)) {
        return throwError(() => error);
      }

      const urlActual = router.url;
      const enPanel = urlActual.startsWith('/dashboard');

      // Borra el token: los 401 concurrentes de la misma pantalla ya no entran aquí.
      auth.logout();

      if (enPanel) {
        StorageUtil.set('avisoLogin', 'sesion_expirada');
        StorageUtil.set('redirectUrl', urlActual);
        void router.navigate(['/auth']);
      } else {
        avisos.warn(MENSAJE_SESION_EXPIRADA, 7000);
      }

      return throwError(() => conMensajeClaro(error));
    }),
  );
};

function esSesionVencida(url: string): boolean {
  if (!StorageUtil.get('token')) return false;
  return !RUTAS_DE_ACCESO.some((ruta) => url.includes(ruta));
}

function conMensajeClaro(original: HttpErrorResponse): HttpErrorResponse {
  return new HttpErrorResponse({
    error: { codigo: 'SESION_EXPIRADA', message: MENSAJE_SESION_EXPIRADA },
    headers: original.headers,
    status: original.status,
    statusText: original.statusText,
    url: original.url ?? undefined,
  });
}
