import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Opciones por petición para el interceptor de errores (errorInterceptor).
 *
 * Uso:
 *   this.http.get(url, { context: sinAvisoGlobal() })
 *   this.http.get(url, { context: peticionSilenciosa() })            // sondeos, contadores
 *   this.http.post(url, body, { context: conTiempoLimite(180_000) })  // emisión lenta
 *   this.http.get(url, { ...opcionesHttp(), context: sinAvisoGlobal(conReintentos(0)) })
 *
 * Todas aceptan un HttpContext previo para encadenarlas.
 */

/**
 * true (por defecto): el interceptor avisa él mismo de los fallos que afectan
 * a toda la pantalla (sin conexión, servidor caído, tiempo agotado, 429) con un
 * único aviso deduplicado y marca el error como `notificado`, y a los 4 s de
 * espera en una lectura muestra "Conectando con el servidor…".
 * false: no hay aviso global ni aviso de lentitud; la pantalla decide (estado
 * inline, su propio toast…). La sesión vencida se gestiona igual.
 */
export const AVISO_GLOBAL = new HttpContextToken<boolean>(() => true);

/**
 * Petición de segundo plano (sondeos, contadores del menú, precargas): sin
 * aviso global, sin aviso de lentitud, sin reintentos automáticos y, si nadie
 * maneja el error, el ErrorHandler global tampoco lo muestra.
 */
export const SILENCIOSA = new HttpContextToken<boolean>(() => false);

/**
 * Tiempo máximo de espera en ms. undefined (por defecto): 45 s en lecturas,
 * 90 s en escrituras y 120 s en descargas (blob). null: sin límite.
 */
export const TIEMPO_LIMITE_MS = new HttpContextToken<number | null | undefined>(() => undefined);

/**
 * Reintentos ante fallos de red o servidor no disponible (0/502/503/504).
 * undefined (por defecto): 2 en GET/HEAD y 0 en escrituras. En escrituras solo
 * se reintenta si se pide explícitamente (p. ej. con clave de idempotencia).
 */
export const REINTENTOS = new HttpContextToken<number | undefined>(() => undefined);

export function sinAvisoGlobal(contexto: HttpContext = new HttpContext()): HttpContext {
  return contexto.set(AVISO_GLOBAL, false);
}

export function peticionSilenciosa(contexto: HttpContext = new HttpContext()): HttpContext {
  return contexto.set(SILENCIOSA, true).set(AVISO_GLOBAL, false).set(REINTENTOS, 0);
}

export function conTiempoLimite(ms: number | null, contexto: HttpContext = new HttpContext()): HttpContext {
  return contexto.set(TIEMPO_LIMITE_MS, ms);
}

export function conReintentos(veces: number, contexto: HttpContext = new HttpContext()): HttpContext {
  return contexto.set(REINTENTOS, Math.max(0, Math.floor(veces)));
}
