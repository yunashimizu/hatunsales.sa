import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { NgZone, PLATFORM_ID, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  TimeoutError,
  catchError,
  defer,
  finalize,
  from,
  retry,
  switchMap,
  throwError,
  timeout,
  timer,
} from 'rxjs';
import { AuthService } from '../auth/service/auth.service';
import { ConectividadService } from '../shared/services/conectividad.service';
import { NotificationService } from '../shared/services/notification.service';
import { guardarAvisoLogin, guardarRedireccion } from '../shared/utils/aviso-login.util';
import {
  CODIGOS_ERROR,
  CuerpoErrorApi,
  MENSAJE_SESION_EXPIRADA,
  esCodigoDeDominio,
  esErrorDeRed,
  normalizarCuerpoError,
  segundosDeEspera,
} from '../shared/utils/errores-http.util';
import { StorageUtil } from '../utils/storage.util';
import { AVISO_GLOBAL, REINTENTOS, SILENCIOSA, TIEMPO_LIMITE_MS } from './contexto-http';

/** Se mantiene aquí por compatibilidad (login.component.ts lo importa de este archivo). */
export { MENSAJE_SESION_EXPIRADA } from '../shared/utils/errores-http.util';

/* ===========================================================================
 * Política
 * ======================================================================== */

const LIMITE_LECTURA_MS = 45_000;
const LIMITE_ESCRITURA_MS = 90_000;
const LIMITE_DESCARGA_MS = 120_000;
/** Espera antes de cada reintento de una lectura (servidor despertando, red que parpadea). */
const ESPERAS_REINTENTO_MS: readonly number[] = [1_500, 4_000];
/** Si una lectura tarda más, se avisa "Conectando con el servidor…". */
const AVISO_LENTITUD_MS = 4_000;
/** Tras una sesión vencida, los 401 que siguen llegando de la misma pantalla también lo son. */
const GRACIA_SESION_MS = 10_000;

const CLAVE_CONEXION = 'conexion';
const CLAVE_SIN_RED = 'offline';
const CLAVE_SESION = 'sesion';
const CLAVE_LIMITE = '429';
const CLAVE_LENTITUD = 'servidor-lento';

/** En estos endpoints un 401 significa "credenciales inválidas", no "sesión vencida". */
const RUTA_DE_ACCESO = /\/auth\/(login|register|google)(\/|\?|$)/;
const RUTA_PERFIL = /\/auth\/perfil(\/|\?|$)/;
/** Textos con que el backend (JwtStrategy / AuthGuard) rechaza un token vencido o inválido. */
const MENSAJE_DE_TOKEN = /^(unauthorized|no autenticado|token inv[aá]lido|sesi[oó]n inv[aá]lida|tu sesi[oó]n|jwt )/i;
const PALABRA_CONTRASENA = /contrase[ñn]a|password/i;

const METODOS_LECTURA: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/* ---------------------------------------------------------------------------
 * Estado compartido entre peticiones (una sola app por pestaña)
 * ------------------------------------------------------------------------ */

let ultimaExpiracion = 0;
let lecturasLentas = 0;

/** @internal Solo para pruebas: deja el interceptor como recién cargado. */
export function reiniciarEstadoInterceptorErrores(): void {
  ultimaExpiracion = 0;
  lecturasLentas = 0;
}

interface Contexto {
  readonly req: HttpRequest<unknown>;
  readonly router: Router;
  readonly auth: AuthService;
  readonly avisos: NotificationService;
  readonly conectividad: ConectividadService;
  readonly navegador: boolean;
  readonly esLectura: boolean;
  readonly silenciosa: boolean;
  /** Avisos globales activos para esta petición. */
  readonly avisoGlobal: boolean;
}

/* ===========================================================================
 * Interceptor
 * ======================================================================== */

/**
 * Política global de errores HTTP (panel, tienda y login):
 *
 * - Tiempo límite por petición (45 s lecturas, 90 s escrituras, 120 s blobs;
 *   ajustable con TIEMPO_LIMITE_MS) y reintentos solo en lecturas ante
 *   0/502/503/504 (servidor despertando), nunca tras agotar el tiempo.
 * - Cuerpo de error normalizado (`CuerpoErrorApi`): `message` siempre en
 *   español (validaciones de Nest unidas, textos en inglés traducidos), los
 *   errores Blob/JSON de descargas ya leídos y el resto de campos del backend
 *   intactos (`codigo`, `idPeticion`, `producto`…). Los códigos de negocio
 *   (FISCAL_*, CAJA_*…) conservan el mensaje del servidor.
 * - Avisos globales deduplicados: sin conexión, servidor no disponible,
 *   tiempo agotado y 429. El error sale con `notificado: true` para que las
 *   pantallas no repitan el aviso (alerta.errorHttp / avisos.errorHttp).
 * - 401 con sesión → sesión vencida: cierra la sesión; en el panel vuelve al
 *   login con el motivo y la página de retorno; en la tienda, aviso con
 *   "Iniciar sesión". No aplica a login/registro/Google ni al 401 de
 *   "contraseña actual incorrecta" de PUT /auth/perfil.
 *
 * No inyecta AlertService (metería sweetalert2 en el bundle inicial).
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const navegador = isPlatformBrowser(inject(PLATFORM_ID));
  const silenciosa = req.context.get(SILENCIOSA);
  const esLectura = METODOS_LECTURA.has(req.method.toUpperCase());
  const ctx: Contexto = {
    req,
    router: inject(Router),
    auth: inject(AuthService),
    avisos: inject(NotificationService),
    conectividad: inject(ConectividadService),
    navegador,
    esLectura,
    silenciosa,
    avisoGlobal: navegador && !silenciosa && req.context.get(AVISO_GLOBAL),
  };
  const zona = inject(NgZone);

  let flujo: Observable<HttpEvent<unknown>> = next(req);

  const limite = tiempoLimite(req, esLectura);
  if (limite !== null) flujo = flujo.pipe(timeout({ each: limite }));

  const reintentos = cantidadDeReintentos(req, esLectura, silenciosa);
  if (reintentos > 0) {
    flujo = flujo.pipe(
      retry({
        count: reintentos,
        delay: (error: unknown, intento: number) =>
          debeReintentar(error) && !sinRed() ? timer(esperaDeReintento(intento)) : throwError(() => error),
      }),
    );
  }

  flujo = flujo.pipe(
    catchError((error: unknown) =>
      from(normalizar(error, req)).pipe(switchMap((normalizado) => throwError(() => aplicarPolitica(normalizado, ctx)))),
    ),
  );

  const conAvisoLento =
    ctx.avisoGlobal && esLectura && req.responseType !== 'blob' && req.responseType !== 'arraybuffer';
  if (!conAvisoLento) return flujo;

  return defer(() => {
    const detener = vigilarLentitud(ctx.avisos, zona);
    return flujo.pipe(finalize(detener));
  });
};

/* ===========================================================================
 * Política por estado
 * ======================================================================== */

function aplicarPolitica(error: unknown, ctx: Contexto): unknown {
  if (!(error instanceof HttpErrorResponse)) return error;
  const cuerpo = error.error as CuerpoErrorApi;
  if (ctx.silenciosa) cuerpo.silenciosa = true;

  if (error.status === 401 && esSesionVencida(ctx.req, cuerpo)) return sesionVencida(error, ctx);

  // En login/registro el formulario muestra el error junto a los campos.
  if (!ctx.avisoGlobal || RUTA_DE_ACCESO.test(ctx.req.url)) return error;

  if (esErrorDeRed(error)) {
    if (sinRed()) {
      ctx.conectividad.avisarSinConexion();
      marcarNotificado(cuerpo, CLAVE_SIN_RED);
      return error;
    }
    ctx.avisos.mostrar({
      clave: CLAVE_CONEXION,
      tipo: 'error',
      icono: error.status === 0 && cuerpo.codigo !== CODIGOS_ERROR.TIEMPO_AGOTADO ? 'bi-wifi-off' : 'bi-cloud-slash',
      titulo: tituloDeTransporte(ctx.esLectura, cuerpo.codigo),
      mensaje: cuerpo.message,
      contar: false,
    });
    marcarNotificado(cuerpo, CLAVE_CONEXION);
    return error;
  }

  if (error.status === 429 && !esCodigoDeDominio(cuerpo.codigo)) {
    const espera = cuerpo.reintentarEnSeg;
    ctx.avisos.mostrar({
      clave: CLAVE_LIMITE,
      tipo: 'advertencia',
      icono: 'bi-hourglass-split',
      titulo: 'Demasiados intentos seguidos',
      mensaje: espera
        ? `Espera ${espera} ${espera === 1 ? 'segundo' : 'segundos'} y vuelve a intentarlo.`
        : 'Espera unos segundos y vuelve a intentarlo.',
      contar: false,
    });
    marcarNotificado(cuerpo, CLAVE_LIMITE);
  }
  return error;
}

/**
 * 401 = sesión vencida si había token (o acaba de vencer otra petición),
 * salvo en login/registro/Google y en el "contraseña actual incorrecta" del
 * perfil, que el formulario muestra junto al campo.
 */
function esSesionVencida(req: HttpRequest<unknown>, cuerpo: CuerpoErrorApi): boolean {
  if (RUTA_DE_ACCESO.test(req.url)) return false;
  if (req.method.toUpperCase() === 'PUT' && RUTA_PERFIL.test(req.url)) {
    const original = String(cuerpo['mensajeOriginal'] ?? '').trim();
    // Solo el mensaje propio de la contraseña ("La contraseña actual no es correcta") es del
    // formulario. El resto de 401 es de la sesión: el backend nuevo traduce el "Unauthorized"
    // del token a "Tu sesión no es válida o expiró…", que no debe confundirse con un error del campo.
    if (original && PALABRA_CONTRASENA.test(original) && !MENSAJE_DE_TOKEN.test(original)) return false;
  }
  return !!StorageUtil.get('token') || Date.now() - ultimaExpiracion < GRACIA_SESION_MS;
}

function sesionVencida(error: HttpErrorResponse, ctx: Contexto): HttpErrorResponse {
  if (StorageUtil.get('token')) {
    ultimaExpiracion = Date.now();
    const urlActual = ctx.router.url || '/';
    // Borra el token: los 401 que lleguen después entran por la ventana de gracia.
    ctx.auth.logout();
    ctx.avisos.registrarAvisoGlobal(CLAVE_SESION);

    if (urlActual.startsWith('/dashboard')) {
      // El login explica el motivo y, al entrar, vuelve a esta página.
      guardarAvisoLogin('sesion_expirada');
      guardarRedireccion(urlActual);
      void ctx.router.navigateByUrl('/auth');
    } else if (ctx.navegador && !urlActual.startsWith('/auth')) {
      // En la tienda se puede seguir como invitado.
      ctx.avisos.mostrar({
        clave: CLAVE_SESION,
        tipo: 'advertencia',
        icono: 'bi-person-lock',
        titulo: 'Tu sesión expiró',
        mensaje: 'Vuelve a iniciar sesión para continuar.',
        duracion: 9_000,
        contar: false,
        accion: {
          etiqueta: 'Iniciar sesión',
          icono: 'bi-box-arrow-in-right',
          alHacer: () => {
            guardarAvisoLogin('sesion_expirada');
            guardarRedireccion(ctx.router.url);
            return ctx.router.navigateByUrl('/auth');
          },
        },
      });
    }
  }

  const cuerpo: CuerpoErrorApi = {
    ...(error.error as CuerpoErrorApi),
    codigo: CODIGOS_ERROR.SESION_EXPIRADA,
    message: MENSAJE_SESION_EXPIRADA,
    mensajes: [MENSAJE_SESION_EXPIRADA],
  };
  marcarNotificado(cuerpo, CLAVE_SESION);
  return new HttpErrorResponse({
    error: cuerpo,
    headers: error.headers,
    status: error.status,
    statusText: error.statusText,
    url: error.url ?? undefined,
  });
}

/* ===========================================================================
 * Ayudas
 * ======================================================================== */

function tiempoLimite(req: HttpRequest<unknown>, esLectura: boolean): number | null {
  const pedido = req.context.get(TIEMPO_LIMITE_MS);
  if (pedido === null) return null;
  if (typeof pedido === 'number' && Number.isFinite(pedido) && pedido > 0) return pedido;
  if (req.responseType === 'blob' || req.responseType === 'arraybuffer') return LIMITE_DESCARGA_MS;
  return esLectura ? LIMITE_LECTURA_MS : LIMITE_ESCRITURA_MS;
}

function cantidadDeReintentos(req: HttpRequest<unknown>, esLectura: boolean, silenciosa: boolean): number {
  const pedido = req.context.get(REINTENTOS);
  if (typeof pedido === 'number' && Number.isFinite(pedido)) return Math.max(0, Math.floor(pedido));
  if (silenciosa || !esLectura) return 0;
  return ESPERAS_REINTENTO_MS.length;
}

function esperaDeReintento(intento: number): number {
  return ESPERAS_REINTENTO_MS[Math.min(intento, ESPERAS_REINTENTO_MS.length) - 1] ?? 4_000;
}

function sinRed(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Solo fallos de transporte transitorios; nunca tras agotar el tiempo ni ante reglas de negocio. */
function debeReintentar(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) return false;
  const s = error.status;
  if (!(s === 0 || s === 502 || s === 503 || s === 504)) return false;
  return !esCodigoDeDominio((error.error as { codigo?: unknown } | null)?.codigo);
}

function tituloDeTransporte(esLectura: boolean, codigo: string | undefined): string {
  if (esLectura) return 'No se pudo cargar la información';
  if (codigo === CODIGOS_ERROR.TIEMPO_AGOTADO) return 'El servidor no confirmó la operación';
  return 'No se guardaron los cambios';
}

function marcarNotificado(cuerpo: CuerpoErrorApi, clave: string): void {
  cuerpo.notificado = true;
  cuerpo.claveAviso = clave;
}

/** "Conectando con el servidor…" mientras alguna lectura tarde más de 4 s (un solo aviso). */
function vigilarLentitud(avisos: NotificationService, zona: NgZone): () => void {
  let contada = false;
  const manejador = zona.runOutsideAngular(() =>
    setTimeout(() => {
      zona.run(() => {
        contada = true;
        lecturasLentas++;
        if (lecturasLentas !== 1) return;
        avisos.mostrar({
          clave: CLAVE_LENTITUD,
          tipo: 'cargando',
          titulo: 'Conectando con el servidor…',
          mensaje: 'Puede tardar unos segundos si estuvo inactivo.',
          duracion: 0,
          cerrable: false,
          contar: false,
        });
      });
    }, AVISO_LENTITUD_MS),
  );
  return () => {
    clearTimeout(manejador);
    if (!contada) return;
    contada = false;
    lecturasLentas = Math.max(0, lecturasLentas - 1);
    if (lecturasLentas === 0) avisos.cerrarPorClave(CLAVE_LENTITUD);
  };
}

/* ---------------------------------------------------------------------------
 * Normalización del error
 * ------------------------------------------------------------------------ */

async function normalizar(error: unknown, req: HttpRequest<unknown>): Promise<unknown> {
  let http: HttpErrorResponse;
  if (error instanceof TimeoutError) {
    http = new HttpErrorResponse({
      error: { codigo: CODIGOS_ERROR.TIEMPO_AGOTADO },
      status: 0,
      statusText: 'Tiempo agotado',
      url: req.urlWithParams,
    });
  } else if (error instanceof HttpErrorResponse) {
    http = error;
  } else {
    return error;
  }

  const crudo = await leerCuerpo(http.error);
  const cuerpo = normalizarCuerpoError(http.status, crudo, req.method);
  const original = mensajeOriginal(crudo);
  if (original) cuerpo['mensajeOriginal'] = original;
  if (http.status === 429) {
    const espera = segundosDeEspera(http.headers?.get('Retry-After')) ?? numeroPositivo(cuerpo['retryAfter']);
    if (espera) cuerpo.reintentarEnSeg = espera;
  }

  return new HttpErrorResponse({
    error: cuerpo,
    headers: http.headers,
    status: http.status,
    statusText: http.statusText,
    url: http.url ?? req.urlWithParams,
  });
}

/** Cuerpo legible: Blob/ArrayBuffer (descargas de PDF/XML/Excel) → JSON o texto. */
async function leerCuerpo(cuerpo: unknown): Promise<unknown> {
  try {
    if (typeof Blob !== 'undefined' && cuerpo instanceof Blob) {
      return interpretarTexto(await cuerpo.text());
    }
    if (typeof ArrayBuffer !== 'undefined' && cuerpo instanceof ArrayBuffer && typeof TextDecoder !== 'undefined') {
      return interpretarTexto(new TextDecoder().decode(cuerpo));
    }
  } catch {
    return null;
  }
  return cuerpo;
}

function interpretarTexto(texto: string): unknown {
  const t = texto.trim();
  if (!t) return null;
  if (t.startsWith('{')) {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      /* no era JSON */
    }
  }
  return t;
}

/** Primer mensaje tal como llegó del servidor (antes de traducirlo). */
function mensajeOriginal(crudo: unknown): string {
  if (typeof crudo === 'string') return crudo.slice(0, 200);
  if (!crudo || typeof crudo !== 'object') return '';
  const m = (crudo as { message?: unknown }).message;
  const primero = Array.isArray(m) ? m[0] : m;
  return typeof primero === 'string' ? primero.slice(0, 200) : '';
}

function numeroPositivo(valor: unknown): number | undefined {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.min(600, Math.ceil(n)) : undefined;
}
