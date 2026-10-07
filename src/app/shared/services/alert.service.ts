import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Observable, firstValueFrom, isObservable } from 'rxjs';
import Swal, { SweetAlertCustomClass, SweetAlertIcon, SweetAlertOptions, SweetAlertResult } from 'sweetalert2';
import {
  CODIGOS_GLOBALES,
  MENSAJES_GLOBALES,
  MENSAJE_SESION_EXPIRADA,
  decodificarEntidadesHtml,
  describirError,
  escapeHtmlAlerta,
  htmlATextoPlano,
  htmlDeDescripcion,
  idPeticionDeError,
  yaNotificado,
} from '../utils/errores-http.util';
import { NotificationService, TipoAviso } from './notification.service';

export interface AlertConfig {
  title?: string;
  message?: string;
  type?: 'success' | 'error' | 'warning' | 'info' | 'question';
  confirmText?: string;
  cancelText?: string;
  /** Tercer botón (p. ej. "No guardar"); el resultado llega como `isDenied`. */
  denyText?: string;
  allowOutsideClick?: boolean;
  allowEscapeKey?: boolean;
  timer?: number;
  /**
   * Si true, `message` es HTML propio (se sanea con una lista blanca antes de
   * mostrarlo). Por defecto se muestra como texto: nunca interpolar datos de
   * usuario sin escapeHtml.
   */
  allowHtml?: boolean;
  /**
   * Confirmación destructiva (eliminar, anular, vaciar…): botón rojo y foco en
   * Cancelar. Si no se indica, se deduce del texto del botón o del título.
   */
  danger?: boolean;
  /** El título es HTML propio (también se sanea). Por defecto el título es texto plano. */
  tituloHtml?: boolean;
  /** Código del backend; lo rellena errorOperativo(). */
  codigo?: string;
  /** true si la capa global ya avisó del error (lo rellena errorOperativo()); no se abre el modal. */
  notificado?: boolean;
  /** Solo toast(): avisos con la misma clave se agrupan (×N). */
  clave?: string;
  /** Botón enfocado al abrir una confirmación. */
  foco?: 'confirmar' | 'cancelar';
}

export interface OpcionesPedirTexto extends AlertConfig {
  /** Etiqueta visible del campo. */
  etiqueta?: string;
  placeholder?: string;
  /** Caracteres mínimos (1 por defecto). */
  minimo?: number;
  /** Caracteres máximos (250 por defecto). */
  maximo?: number;
  mensajeMinimo?: string;
  valorInicial?: string;
  /** Área de texto de varias líneas. */
  multilinea?: boolean;
}

/** Forma de `prompt()` (compatibilidad con el contrato CMP-10). */
export type OpcionesPrompt = AlertConfig & { inputLabel?: string; inputPlaceholder?: string; minLength?: number };

type PosicionToastLegada = 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end';

interface OpcionesBase {
  heightAuto: boolean;
  returnFocus: boolean;
  customClass: SweetAlertCustomClass;
}

/** Escapa texto para uso seguro en HTML (SweetAlert). */
export function escapeHtml(texto: string): string {
  return escapeHtmlAlerta(texto);
}

/** Verbos que identifican una acción irreversible en el botón o el título. */
const VERBOS_DESTRUCTIVOS =
  /\b(eliminar|borrar|anular|vaciar|quitar|desactivar|descartar|rechazar|revocar|bloquear|dar de baja|cerrar sesi[oó]n|cancelar)\b/i;
const TITULO_DESTRUCTIVO = /^¿?\s*(eliminar|borrar|anular|vaciar|quitar|desactivar|descartar|rechazar|cancelar)\b/i;

function esAccionDestructiva(textoBoton: string, titulo?: string): boolean {
  return VERBOS_DESTRUCTIVOS.test(textoBoton) || (!!titulo && TITULO_DESTRUCTIVO.test(titulo.trim()));
}

const TIPO_TOAST: Readonly<Record<NonNullable<AlertConfig['type']>, TipoAviso>> = {
  success: 'exito',
  error: 'error',
  warning: 'advertencia',
  info: 'info',
  question: 'info',
};

const RESULTADO_DESCARTADO: SweetAlertResult = { isConfirmed: false, isDenied: false, isDismissed: true };

/* ===========================================================================
 * Saneado de HTML (defensa en profundidad)
 * ======================================================================== */

const ETIQUETAS_PERMITIDAS = new Set([
  'a', 'b', 'br', 'code', 'details', 'div', 'em', 'h3', 'h4', 'hr', 'i', 'kbd', 'li', 'mark', 'ol', 'p',
  'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
]);
/** Se descartan con todo su contenido. */
const ETIQUETAS_PELIGROSAS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'template', 'noscript', 'svg',
  'math', 'textarea', 'select', 'option', 'title', 'xmp', 'noembed', 'noframes', 'plaintext', 'link', 'meta',
  'base', 'form', 'input', 'button', 'img', 'video', 'audio', 'source', 'picture', 'canvas',
]);
const ATRIBUTOS_PERMITIDOS = new Set(['class', 'style', 'title', 'href', 'target', 'rel', 'colspan', 'rowspan', 'role', 'open']);
const ESTILO_PELIGROSO = /url\s*\(|expression\s*\(|@import|javascript:|behavior\s*:|-moz-binding/i;
const ENLACE_SEGURO = /^(https?:|mailto:|tel:|#|\/(?!\/))/i;

/**
 * Deja solo etiquetas y atributos inocuos del HTML que las pantallas marcan
 * como propio (`allowHtml`). Así, aunque alguien olvide escapar un dato de
 * usuario, no puede ejecutar código (`<img onerror>`, `javascript:`…).
 */
function sanearHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return escapeHtmlAlerta(htmlATextoPlano(html));
  // Documento inerte: no ejecuta scripts ni carga imágenes mientras se analiza.
  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  const limpio = doc.createElement('div');
  copiarNodosSeguros(doc.body, limpio, doc);
  return limpio.innerHTML;
}

function copiarNodosSeguros(origen: Node, destino: Node, doc: Document): void {
  origen.childNodes.forEach((nodo) => {
    if (nodo.nodeType === Node.TEXT_NODE) {
      destino.appendChild(doc.createTextNode(nodo.textContent ?? ''));
      return;
    }
    if (nodo.nodeType !== Node.ELEMENT_NODE) return;
    const elemento = nodo as Element;
    const etiqueta = elemento.tagName.toLowerCase();
    if (ETIQUETAS_PELIGROSAS.has(etiqueta)) return;
    if (!ETIQUETAS_PERMITIDAS.has(etiqueta)) {
      copiarNodosSeguros(elemento, destino, doc); // etiqueta desconocida: se conserva solo su texto
      return;
    }
    const copia = doc.createElement(etiqueta);
    for (const atributo of Array.from(elemento.attributes)) {
      const nombre = atributo.name.toLowerCase();
      const valor = atributo.value.trim();
      if (!ATRIBUTOS_PERMITIDOS.has(nombre) && !nombre.startsWith('aria-')) continue;
      if (nombre === 'href' && !ENLACE_SEGURO.test(valor)) continue;
      if (nombre === 'target' && valor !== '_blank') continue;
      if (nombre === 'style' && ESTILO_PELIGROSO.test(valor)) continue;
      copia.setAttribute(nombre, valor);
    }
    if (etiqueta === 'a' && copia.getAttribute('target') === '_blank') copia.setAttribute('rel', 'noopener noreferrer');
    copiarNodosSeguros(elemento, copia, doc);
    destino.appendChild(copia);
  });
}

/** Texto de botones y validaciones: Swal los inserta como HTML, así que se escapan. */
function textoBoton(texto: string | undefined, porDefecto: string): string {
  return escapeHtmlAlerta(decodificarEntidadesHtml(texto || porDefecto));
}

/**
 * Tema mínimo por si `shared/styles/alertas.css` (tema completo, global) aún
 * no se importó en styles.css: mantiene los modales por encima de paneles y
 * cajones y el botón de peligro en rojo.
 */
const TEMA_RESPALDO = `
.swal2-container{z-index:2000}
.swal2-container{--swal2-confirm-button-background-color:#4f46e5;--swal2-border-radius:16px;--swal2-width:min(30em,calc(100vw - 32px))}
.swal2-popup{font-family:'Inter','Segoe UI',Roboto,sans-serif}
.swal2-confirm.hs-swal-peligro{--swal2-confirm-button-background-color:#dc2626}
.swal2-html-container small{display:block;margin-top:.6rem;color:#64748b;font-size:.85em}
.swal2-html-container .hs-swal-lista{margin:.4rem 0 0;padding-left:1.2em;text-align:left}
`;

/**
 * Modales de toda la app (SweetAlert2 con el tema de la casa).
 *
 * - Solo modales: `toast()` delega en NotificationService, así un aviso nunca
 *   cierra un modal o una confirmación abiertos.
 * - Títulos siempre como texto (`titleText`); el HTML del mensaje solo con
 *   `allowHtml` y pasa por un saneador de lista blanca.
 * - Se cierra solo al cambiar de pantalla.
 * - No inyectar en el interceptor ni en el ErrorHandler: metería sweetalert2
 *   en el bundle inicial.
 */
@Injectable({ providedIn: 'root' })
export class AlertService {
  private readonly avisos = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    if (!this.navegador) return;
    this.asegurarTema();
    this.cerrarAlCambiarDePantalla();
  }

  /* ------------------------------------------------------------------------
   * Modales informativos (compatibles con la v1: devuelven el resultado de Swal)
   * --------------------------------------------------------------------- */

  success(config: AlertConfig = {}): Promise<SweetAlertResult> {
    return this.informativo('success', config, 'Listo');
  }

  error(config: AlertConfig = {}): Promise<SweetAlertResult> {
    if (this.yaAvisadoGlobalmente(config)) return Promise.resolve(RESULTADO_DESCARTADO);
    return this.informativo('error', config, 'No se pudo completar');
  }

  warning(config: AlertConfig = {}): Promise<SweetAlertResult> {
    return this.informativo('warning', config, 'Atención');
  }

  info(config: AlertConfig = {}): Promise<SweetAlertResult> {
    return this.informativo('info', config, 'Información');
  }

  /** Modal de éxito (sin temporizador salvo `timer`). */
  async exito(config: AlertConfig | string, mensaje?: string): Promise<void> {
    await this.success(this.normalizar(config, mensaje));
  }

  async advertencia(config: AlertConfig | string, mensaje?: string): Promise<void> {
    await this.warning(this.normalizar(config, mensaje));
  }

  async informacion(config: AlertConfig | string, mensaje?: string): Promise<void> {
    await this.info(this.normalizar(config, mensaje));
  }

  /**
   * Error de una petición en un modal: título = qué falló, mensaje del servidor
   * en español, pista y código de soporte. No abre nada si la capa global ya
   * avisó (sin conexión, sesión vencida, demasiadas solicitudes…).
   * `extra.title` y `extra.message` sustituyen a los calculados.
   */
  async errorHttp(
    error: unknown,
    porDefecto = 'No se pudo completar la operación',
    extra: Partial<AlertConfig> = {},
  ): Promise<void> {
    if (yaNotificado(error)) return;
    const d = describirError(error, porDefecto, extra.title);
    if (d.codigo === 'SESION_EXPIRADA') return;
    let message: string;
    if (extra.message !== undefined) {
      const propio = extra.allowHtml ? extra.message : escapeHtmlAlerta(extra.message);
      const soporte = idPeticionDeError(error);
      message = soporte
        ? `${propio}<small class="hs-swal-soporte">Código de soporte: <code>${escapeHtmlAlerta(soporte)}</code></small>`
        : propio;
    } else {
      message = htmlDeDescripcion(d);
    }
    await this.error({ ...extra, title: d.titulo, message, allowHtml: true, codigo: d.codigo, notificado: false });
  }

  /* ------------------------------------------------------------------------
   * Confirmaciones
   * --------------------------------------------------------------------- */

  /**
   * Confirmación (v1): devuelve el resultado de Swal. Si es destructiva, botón
   * rojo, icono de advertencia y foco en Cancelar.
   */
  confirm(config: AlertConfig = {}): Promise<SweetAlertResult> {
    const confirmText = config.confirmText || 'Sí, confirmar';
    const peligro = config.danger ?? esAccionDestructiva(confirmText, config.title);
    const foco = config.foco ?? (peligro ? 'cancelar' : 'confirmar');
    return Swal.fire({
      ...this.base(peligro ? 'hs-swal-peligro' : undefined),
      icon: config.type && config.type !== 'success' ? config.type : peligro ? 'warning' : 'question',
      ...this.titulo(config, '¿Confirmar?'),
      ...this.cuerpo(config),
      showCancelButton: true,
      confirmButtonText: textoBoton(confirmText, 'Sí, confirmar'),
      cancelButtonText: textoBoton(config.cancelText, 'Cancelar'),
      showDenyButton: !!config.denyText,
      denyButtonText: textoBoton(config.denyText, 'No'),
      focusCancel: foco === 'cancelar',
      focusConfirm: foco === 'confirmar',
      reverseButtons: true,
      allowOutsideClick: config.allowOutsideClick ?? false,
      allowEscapeKey: config.allowEscapeKey ?? true,
    });
  }

  /** Confirmación que devuelve true/false. El foco empieza en Cancelar. */
  async confirmar(config: AlertConfig): Promise<boolean> {
    const r = await this.confirm({ foco: 'cancelar', ...config });
    return !!r.isConfirmed;
  }

  /** Confirmación destructiva: botón rojo ("Sí, eliminar" por defecto) y foco en Cancelar. */
  async confirmarPeligro(config: AlertConfig): Promise<boolean> {
    const r = await this.confirm({ confirmText: 'Sí, eliminar', ...config, danger: true, foco: 'cancelar' });
    return !!r.isConfirmed;
  }

  /** Pide un texto (motivo de anulación…). Devuelve el texto sin espacios extremos o null si se cancela. */
  async pedirTexto(config: OpcionesPedirTexto): Promise<string | null> {
    const r = await this.dialogoTexto(config);
    return r.isConfirmed ? String(r.value ?? '').trim() : null;
  }

  /** Igual que pedirTexto pero con la forma de opciones de Swal y su resultado (CMP-10). */
  prompt(config: OpcionesPrompt): Promise<SweetAlertResult<string>> {
    return this.dialogoTexto({
      ...config,
      etiqueta: config.inputLabel,
      placeholder: config.inputPlaceholder,
      minimo: config.minLength,
      mensajeMinimo: config.minLength ? `Escriba al menos ${config.minLength} caracteres` : undefined,
    });
  }

  /* ------------------------------------------------------------------------
   * Carga
   * --------------------------------------------------------------------- */

  /** Modal bloqueante con spinner (v1). Ciérralo con close()/cerrar(). */
  loading(title: string = 'Cargando...'): Promise<SweetAlertResult> {
    return Swal.fire({
      ...this.base(),
      titleText: decodificarEntidadesHtml(title),
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading(),
    });
  }

  cargando(titulo = 'Procesando…'): void {
    void this.loading(titulo);
  }

  /**
   * Muestra el modal de carga mientras dura el trabajo y lo cierra al terminar
   * (bien o mal). Devuelve el resultado o relanza el error.
   */
  async conCarga<T>(trabajo: Promise<T> | Observable<T>, titulo = 'Procesando…'): Promise<T> {
    this.cargando(titulo);
    try {
      return await (isObservable(trabajo) ? firstValueFrom(trabajo) : trabajo);
    } finally {
      this.cerrar();
    }
  }

  close(): void {
    Swal.close();
  }

  cerrar(): void {
    this.close();
  }

  /** true si hay un modal de SweetAlert abierto. */
  hayModalAbierto(): boolean {
    return this.navegador && Swal.isVisible();
  }

  /* ------------------------------------------------------------------------
   * Toast (compatibilidad): ahora es un aviso nt-*, no un Swal
   * --------------------------------------------------------------------- */

  /**
   * @deprecated Usar NotificationService (exito, error, advertencia, info).
   * Se mantiene la firma; la posición se ignora (la decide la pila de avisos).
   */
  toast(config: AlertConfig = {}, _posicion?: PosicionToastLegada): Promise<void> {
    const titulo = decodificarEntidadesHtml(String(config.title ?? ''));
    const mensaje = config.allowHtml ? htmlATextoPlano(String(config.message ?? '')) : String(config.message ?? '');
    this.avisos.mostrar({
      tipo: TIPO_TOAST[config.type ?? 'info'] ?? 'info',
      titulo,
      mensaje,
      duracion: config.timer || undefined,
      clave: config.clave,
    });
    return Promise.resolve();
  }

  /* ------------------------------------------------------------------------
   * Internos
   * --------------------------------------------------------------------- */

  private informativo(icon: SweetAlertIcon, config: AlertConfig, tituloPorDefecto: string): Promise<SweetAlertResult> {
    return Swal.fire({
      ...this.base(),
      icon,
      ...this.titulo(config, tituloPorDefecto),
      ...this.cuerpo(config),
      confirmButtonText: textoBoton(config.confirmText, 'Aceptar'),
      allowOutsideClick: config.allowOutsideClick ?? false,
      allowEscapeKey: config.allowEscapeKey ?? true,
      timer: config.timer || undefined,
      timerProgressBar: !!config.timer,
    });
  }

  private dialogoTexto(config: OpcionesPedirTexto): Promise<SweetAlertResult<string>> {
    const minimo = Math.max(0, config.minimo ?? 1);
    const maximo = Math.max(minimo || 1, config.maximo ?? 250);
    const peligro = !!config.danger;
    const aviso = config.mensajeMinimo ?? `Escribe al menos ${minimo} ${minimo === 1 ? 'carácter' : 'caracteres'}`;
    return Swal.fire<string>({
      ...this.base(peligro ? 'hs-swal-peligro' : undefined),
      icon: config.type ?? (peligro ? 'warning' : 'question'),
      ...this.titulo(config, 'Escribe un dato'),
      ...this.cuerpo(config),
      input: config.multilinea ? 'textarea' : 'text',
      inputLabel: config.etiqueta,
      inputPlaceholder: config.placeholder,
      inputValue: config.valorInicial ?? '',
      inputAttributes: { maxlength: String(maximo), autocomplete: 'off', autocapitalize: 'sentences' },
      inputValidator: (valor: string) =>
        String(valor ?? '').trim().length < minimo ? escapeHtmlAlerta(aviso) : null,
      showCancelButton: true,
      confirmButtonText: textoBoton(config.confirmText, 'Aceptar'),
      cancelButtonText: textoBoton(config.cancelText, 'Cancelar'),
      reverseButtons: true,
      allowOutsideClick: config.allowOutsideClick ?? false,
      allowEscapeKey: config.allowEscapeKey ?? true,
    });
  }

  private normalizar(config: AlertConfig | string, mensaje?: string): AlertConfig {
    return typeof config === 'string' ? { title: config, message: mensaje } : config;
  }

  private tema(): 'panel' | 'tienda' {
    return this.router.url.startsWith('/store') ? 'tienda' : 'panel';
  }

  /** Opciones comunes: tema por zona, sin `height: auto` en body y foco devuelto al cerrar. */
  private base(claseConfirmar?: string): OpcionesBase {
    const tema = this.tema();
    const customClass: SweetAlertCustomClass = {
      container: `hs-swal-contenedor hs-swal-contenedor--${tema}`,
      popup: `hs-swal hs-swal--${tema}`,
    };
    if (claseConfirmar) customClass.confirmButton = claseConfirmar;
    return { heightAuto: false, returnFocus: true, customClass };
  }

  /** Título como texto (seguro) salvo `tituloHtml`; deshace escapes manuales antiguos. */
  private titulo(config: AlertConfig, porDefecto: string): Pick<SweetAlertOptions, 'title' | 'titleText'> {
    const t = config.title || porDefecto;
    return config.tituloHtml ? { title: sanearHtml(t) } : { titleText: decodificarEntidadesHtml(t) };
  }

  /** Cuerpo: texto (seguro) o HTML propio saneado. */
  private cuerpo(config: AlertConfig): Pick<SweetAlertOptions, 'html' | 'text'> {
    const mensaje = config.message ?? '';
    if (!mensaje) return {};
    return config.allowHtml ? { html: sanearHtml(mensaje) } : { text: mensaje };
  }

  /**
   * No repetir en un modal lo que ya avisó la capa global: sesión vencida
   * siempre; fallos de red o 429 si su aviso sigue visible.
   */
  private yaAvisadoGlobalmente(config: AlertConfig): boolean {
    const codigo = config.codigo ?? '';
    const texto = htmlATextoPlano(String(config.message ?? ''));
    if (codigo === 'SESION_EXPIRADA' || texto.includes(MENSAJE_SESION_EXPIRADA)) return true;
    if (config.notificado === true) return true;
    if (config.notificado === false) return false;
    const transporte = CODIGOS_GLOBALES.has(codigo) || MENSAJES_GLOBALES.some((m) => texto.includes(m));
    return transporte && ['conexion', 'offline', '429'].some((k) => this.avisos.hayActivo(k));
  }

  /** Cierra el modal abierto cuando cambia la ruta (no solo los parámetros). */
  private cerrarAlCambiarDePantalla(): void {
    const ruta = (url: string) => url.split(/[?#]/, 1)[0] ?? url;
    let rutaActual = ruta(this.router.url);
    const sub = this.router.events.subscribe((evento) => {
      if (evento instanceof NavigationStart) {
        if (ruta(evento.url) !== rutaActual && Swal.isVisible()) Swal.close();
      } else if (evento instanceof NavigationEnd) {
        rutaActual = ruta(evento.urlAfterRedirects);
      }
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  /** El tema completo vive en shared/styles/alertas.css; si no está cargado se usa uno mínimo. */
  private asegurarTema(): void {
    if (typeof document === 'undefined' || document.getElementById('hs-alert-theme')) return;
    const cargado = getComputedStyle(document.documentElement).getPropertyValue('--hs-alertas-tema').trim();
    if (cargado) return;
    const estilo = document.createElement('style');
    estilo.id = 'hs-alert-theme';
    estilo.textContent = TEMA_RESPALDO;
    document.head.appendChild(estilo);
  }
}
