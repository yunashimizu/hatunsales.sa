import { HttpHeaders } from '@angular/common/http';
import { Observable, catchError, shareReplay, throwError } from 'rxjs';

/**
 * Comparte una misma respuesta entre llamadas simultáneas o muy seguidas.
 * El sidebar y varias pantallas piden los mismos contadores al cargar
 * (monitor de CPE, resumen de inventario) y se duplicaban 2–3 veces por carga.
 * Pasado `ttlMs` la siguiente llamada vuelve a consultar; un error no se cachea.
 */
export function cacheCorto<T>(ttlMs = 5000): (fuente: () => Observable<T>) => Observable<T> {
  let compartido: Observable<T> | null = null;
  let expira = 0;

  return (fuente) => {
    const ahora = Date.now();
    if (!compartido || ahora >= expira) {
      expira = ahora + ttlMs;
      compartido = fuente().pipe(
        catchError((error) => {
          compartido = null;
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return compartido;
  };
}

function leerToken(): string {
  try {
    return typeof sessionStorage === 'undefined' ? '' : (sessionStorage.getItem('token') ?? '');
  } catch {
    return '';
  }
}

/**
 * Cabeceras con el token de sesión. Estaba repetido en cada servicio del panel.
 */
export function cabecerasAutenticadas(): HttpHeaders {
  const token = leerToken();
  return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
}

export const opcionesHttp = () => ({
  headers: cabecerasAutenticadas(),
  withCredentials: true,
});

/*
 * Las utilidades de error viven ahora en shared/utils/errores-http.util.ts
 * (las usan también la tienda, el login, el interceptor y el ErrorHandler).
 * Se re-exportan aquí para que las importaciones existentes sigan compilando.
 */
export {
  mensajeDeError,
  normalizarErrorBlob,
  codigoDeError,
  errorOperativo,
  escapeHtmlAlerta,
  yaNotificado,
  esErrorDeRed,
  describirError,
  idPeticionDeError,
  MENSAJE_SESION_EXPIRADA,
  TITULOS_ERROR,
} from '../../shared/utils/errores-http.util';
