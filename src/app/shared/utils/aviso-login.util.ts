import { MENSAJE_SESION_EXPIRADA } from './errores-http.util';

/**
 * Mensajes que se muestran en el login explicando por qué se llegó ahí
 * (sesión vencida, cierre de sesión, cuenta creada, ruta protegida) y la
 * página a la que volver después de entrar.
 *
 * Se guardan en sessionStorage (claves 'avisoLogin' y 'redirectUrl', las
 * mismas que ya usaban el interceptor y los guards) para sobrevivir a la
 * navegación. Todo acceso está protegido: en SSR o con el almacenamiento
 * bloqueado (modo privado estricto) simplemente no hay aviso.
 */

export type MotivoAvisoLogin = 'sesion_expirada' | 'sesion_cerrada' | 'cuenta_creada' | 'requiere_sesion';
export type TipoAvisoLogin = 'aviso' | 'exito' | 'info';

export interface AvisoLogin {
  motivo: MotivoAvisoLogin;
  tipo: TipoAvisoLogin;
  texto: string;
}

export const MENSAJES_AVISO_LOGIN: Readonly<Record<MotivoAvisoLogin, { tipo: TipoAvisoLogin; texto: string }>> = {
  sesion_expirada: { tipo: 'aviso', texto: MENSAJE_SESION_EXPIRADA },
  sesion_cerrada: { tipo: 'info', texto: 'Cerraste sesión correctamente.' },
  cuenta_creada: { tipo: 'exito', texto: 'Tu cuenta se creó. Inicia sesión para continuar.' },
  requiere_sesion: { tipo: 'info', texto: 'Inicia sesión para continuar.' },
};

const CLAVE_AVISO = 'avisoLogin';
const CLAVE_REDIRECCION = 'redirectUrl';

function almacen(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function leer(clave: string): string | null {
  try {
    return almacen()?.getItem(clave) ?? null;
  } catch {
    return null;
  }
}

function escribir(clave: string, valor: string): void {
  try {
    almacen()?.setItem(clave, valor);
  } catch {
    /* almacenamiento lleno o bloqueado: el aviso es opcional */
  }
}

function borrar(clave: string): void {
  try {
    almacen()?.removeItem(clave);
  } catch {
    /* sin almacenamiento */
  }
}

function esMotivo(valor: string): valor is MotivoAvisoLogin {
  return Object.prototype.hasOwnProperty.call(MENSAJES_AVISO_LOGIN, valor);
}

/**
 * Deja el motivo para que el login lo muestre una vez.
 * Llamar DESPUÉS de `auth.logout()`, que limpia sessionStorage.
 */
export function guardarAvisoLogin(motivo: MotivoAvisoLogin): void {
  escribir(CLAVE_AVISO, motivo);
}

/** Lee y borra el aviso pendiente del login (se muestra una sola vez). */
export function tomarAvisoLogin(): AvisoLogin | null {
  const motivo = leer(CLAVE_AVISO);
  if (!motivo) return null;
  borrar(CLAVE_AVISO);
  if (!esMotivo(motivo)) return null;
  return { motivo, ...MENSAJES_AVISO_LOGIN[motivo] };
}

/**
 * Solo rutas internas: empiezan por '/', no por '//' (otro dominio) ni
 * contienen esquemas; tampoco el propio login (evita bucles).
 */
export function esRedireccionSegura(url: string | null | undefined): url is string {
  if (!url) return false;
  const u = url.trim();
  return u.startsWith('/') && !u.startsWith('//') && !u.startsWith('/\\') && !/^\/auth(\/|\?|#|$)/.test(u);
}

/** Guarda la página a la que volver tras iniciar sesión (ignora destinos inseguros). */
export function guardarRedireccion(url: string | null | undefined): void {
  if (esRedireccionSegura(url)) escribir(CLAVE_REDIRECCION, url.trim());
}

/** Lee y borra la página a la que volver tras iniciar sesión, o null si no hay una válida. */
export function tomarRedireccion(): string | null {
  const url = leer(CLAVE_REDIRECCION);
  borrar(CLAVE_REDIRECCION);
  return esRedireccionSegura(url) ? url.trim() : null;
}
