import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, NgZone, PLATFORM_ID, Signal, inject, signal } from '@angular/core';
import { Observable, Subject, firstValueFrom, isObservable } from 'rxjs';
import { MENSAJES_GLOBALES, describirError, yaNotificado } from '../utils/errores-http.util';

/* ===========================================================================
 * Tipos públicos
 * ======================================================================== */

export type TipoAviso = 'exito' | 'error' | 'advertencia' | 'info' | 'cargando';

export interface AccionAviso {
  etiqueta: string;
  /** Clase de Bootstrap Icons, p. ej. 'bi-arrow-clockwise'. */
  icono?: string;
  /** Si devuelve un Observable se suscribe; si devuelve una promesa, sus errores se avisan. */
  alHacer: () => unknown;
  /** Por defecto el aviso se cierra al pulsar la acción. */
  cerrarAlHacer?: boolean;
}

export interface OpcionesAviso {
  tipo?: TipoAviso;
  titulo?: string;
  mensaje?: string;
  /** ms; 0 = no se cierra solo. Sin indicar: según severidad y largo del texto. */
  duracion?: number;
  accion?: AccionAviso;
  /** Avisos con la misma clave se agrupan (contador ×N) en vez de apilarse. */
  clave?: string;
  cerrable?: boolean;
  /** Clase de Bootstrap Icons que sustituye al icono de la severidad. */
  icono?: string;
}

export type OpcionesSinTipo = Omit<OpcionesAviso, 'tipo' | 'titulo'>;

export interface OpcionesErrorHttp extends Omit<OpcionesAviso, 'tipo'> {
  /** Añade la acción "Reintentar". Si el error ya lo avisó la capa global, se suma a ese aviso. */
  reintentar?: () => unknown;
}

export interface TextosPromesa<T> {
  cargando: string;
  exito: string | ((resultado: T) => string);
  /** Título si falla (por defecto 'No se pudo completar la operación'). */
  error?: string;
}

export interface Aviso {
  readonly id: number;
  readonly tipo: TipoAviso;
  readonly titulo: string;
  readonly mensaje: string;
  /** ms totales; 0 = persistente. */
  readonly duracion: number;
  readonly accion?: AccionAviso;
  readonly clave: string;
  readonly cerrable: boolean;
  readonly icono?: string;
  /** Veces que llegó el mismo aviso (se muestra ×N). */
  readonly repeticiones: number;
  /** Sube con cada cambio de contenido. */
  readonly version: number;
  /** ms que faltaban al (re)arrancar el temporizador: la barra de progreso parte de ahí. */
  readonly restante: number;
  /** Cambia cada vez que el temporizador se (re)arranca; reinicia la barra en sincronía. */
  readonly tramo: number;
}

/** @deprecated Formato de la v1. Usar la signal `avisos` y la interfaz `Aviso`. */
export interface Toast {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timeout?: number;
}

export type MotivoPausa = 'hover' | 'foco' | 'oculto';

/* ===========================================================================
 * Reglas
 * ======================================================================== */

const DURACION_BASE: Readonly<Record<TipoAviso, number>> = {
  exito: 3500,
  info: 4500,
  advertencia: 6000,
  error: 8000,
  cargando: 0,
};
const ETIQUETA_LECTOR: Readonly<Record<TipoAviso, string>> = {
  exito: 'Listo',
  info: 'Aviso',
  advertencia: 'Atención',
  error: 'Error',
  cargando: 'Procesando',
};
const TIPO_LEGADO: Readonly<Record<Toast['type'], TipoAviso>> = {
  success: 'exito',
  error: 'error',
  warning: 'advertencia',
  info: 'info',
};
const TIPO_A_LEGADO: Readonly<Record<TipoAviso, Toast['type']>> = {
  exito: 'success',
  error: 'error',
  advertencia: 'warning',
  info: 'info',
  cargando: 'info',
};

const DURACION_MAXIMA = 15_000;
const DURACION_CON_ACCION = 8_000;
const LECTURA_BASE_MS = 1_500;
const LECTURA_MS_POR_CARACTER = 45;
/** Al soltar el ratón, al menos este margen antes de cerrar (evita cierres "en la cara"). */
const MINIMO_TRAS_REANUDAR = 1_200;
const MAXIMO_ESCRITORIO = 4;
const MAXIMO_MOVIL = 2;
const CONSULTA_MOVIL = '(max-width: 640px)';
const LARGO_TITULO = 140;
const LARGO_MENSAJE = 320;
const RETARDO_ANUNCIO_MS = 80;
/** Avisos globales que cubren los errores de transporte de toda la pantalla. */
const CLAVES_GLOBALES: readonly string[] = ['conexion', 'offline'];

interface Temporizador {
  manejador: ReturnType<typeof setTimeout> | null;
  inicio: number;
  restante: number;
}

function recortarTexto(valor: unknown, maximo: number): string {
  const t = String(valor ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > maximo ? `${t.slice(0, maximo - 1)}…` : t;
}

function esPromesa(valor: unknown): valor is PromiseLike<unknown> {
  return !!valor && typeof (valor as PromiseLike<unknown>).then === 'function';
}

function claveAvisoDe(error: unknown): string {
  const clave = (error as { error?: { claveAviso?: unknown } } | null)?.error?.claveAviso;
  return typeof clave === 'string' ? clave : '';
}

/**
 * Avisos (toasts `nt-*`) de toda la app: panel, tienda y login.
 *
 * - Estado en signals; lo pinta `<app-toasts>` (montado una vez en app.html).
 * - Agrupa por `clave` (contador ×N), dura según severidad y largo del texto,
 *   pausa de verdad el temporizador con ratón, foco o pestaña oculta, y limita
 *   la pila (4 en escritorio, 2 en móvil).
 * - Anuncia en regiones aria-live separadas (errores con prioridad).
 * - Independiente de SweetAlert: un aviso nunca cierra un modal abierto.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly zona = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  private readonly lista = signal<readonly Aviso[]>([]);
  /** Avisos visibles, del más antiguo al más reciente. */
  readonly avisos: Signal<readonly Aviso[]> = this.lista.asReadonly();

  private readonly motivosPausa = new Set<MotivoPausa>();
  private readonly _pausado = signal(false);
  readonly pausado: Signal<boolean> = this._pausado.asReadonly();

  private readonly _anuncio = signal('');
  private readonly _anuncioUrgente = signal('');
  /** Texto para la región aria-live "polite". */
  readonly anuncio: Signal<string> = this._anuncio.asReadonly();
  /** Texto para la región aria-live "assertive" (errores). */
  readonly anuncioUrgente: Signal<string> = this._anuncioUrgente.asReadonly();

  private readonly legado = new Subject<Toast>();
  /** @deprecated Flujo de la v1; los avisos ya se leen de la signal `avisos`. */
  readonly toasts$: Observable<Toast> = this.legado.asObservable();

  private siguienteId = 1;
  private readonly temporizadores = new Map<number, Temporizador>();
  /** Reintentos que las pantallas sumaron a un aviso global, por clave del aviso. */
  private readonly reintentos = new Map<string, Set<() => unknown>>();
  private colaAnuncio: string[] = [];
  private colaAnuncioUrgente: string[] = [];
  private anuncioPendiente = false;
  private consultaMovil: MediaQueryList | null = null;

  constructor() {
    if (this.navegador) this.escucharEntorno();
  }

  /* ------------------------------------------------------------------------
   * API principal
   * --------------------------------------------------------------------- */

  /** Muestra (o agrupa) un aviso. Devuelve su id; 0 si no se mostró. */
  mostrar(opciones: OpcionesAviso): number {
    const tipo: TipoAviso = opciones.tipo ?? 'info';
    const titulo = recortarTexto(opciones.titulo, LARGO_TITULO);
    const mensaje = recortarTexto(opciones.mensaje, LARGO_MENSAJE);
    if (!titulo && !mensaje) return 0;

    // Un error suelto que solo repite el aviso global de conexión no se apila encima.
    if (tipo === 'error' && !opciones.clave && !mensaje && this.repiteAvisoGlobal(titulo)) return 0;

    const clave = opciones.clave ?? `${tipo}|${titulo}|${mensaje}`;
    const previo = this.lista().find((a) => a.clave === clave);
    const accion = opciones.accion ?? previo?.accion;
    const duracion = this.calcularDuracion(tipo, titulo, mensaje, opciones.duracion, accion);

    if (previo) {
      const igual = previo.tipo === tipo && previo.titulo === titulo && previo.mensaje === mensaje;
      this.reemplazar({
        ...previo,
        tipo,
        titulo,
        mensaje,
        duracion,
        accion,
        icono: opciones.icono ?? previo.icono,
        cerrable: opciones.cerrable ?? previo.cerrable,
        repeticiones: igual ? previo.repeticiones + 1 : 1,
        version: previo.version + 1,
        restante: duracion,
        tramo: previo.tramo + 1,
      });
      this.programar(previo.id, duracion);
      if (!igual) this.anunciar(tipo, titulo, mensaje);
      return previo.id;
    }

    const aviso: Aviso = {
      id: this.siguienteId++,
      tipo,
      titulo,
      mensaje,
      duracion,
      accion,
      clave,
      cerrable: opciones.cerrable ?? tipo !== 'cargando',
      icono: opciones.icono,
      repeticiones: 1,
      version: 1,
      restante: duracion,
      tramo: 1,
    };
    this.lista.update((l) => [...l, aviso]);
    this.programar(aviso.id, duracion);
    this.recortar(aviso.id);
    this.anunciar(tipo, titulo, mensaje);
    this.legado.next({ id: aviso.id, type: TIPO_A_LEGADO[tipo], message: titulo || mensaje, timeout: duracion });
    return aviso.id;
  }

  exito(titulo: string, opciones?: number | OpcionesSinTipo): number {
    return this.conTipo('exito', titulo, opciones);
  }

  /** Alias de `exito`. */
  ok(titulo: string, opciones?: number | OpcionesSinTipo): number {
    return this.exito(titulo, opciones);
  }

  error(titulo: string, opciones?: number | OpcionesSinTipo): number {
    return this.conTipo('error', titulo, opciones);
  }

  advertencia(titulo: string, opciones?: number | OpcionesSinTipo): number {
    return this.conTipo('advertencia', titulo, opciones);
  }

  /** Alias de `advertencia`. */
  aviso(titulo: string, opciones?: number | OpcionesSinTipo): number {
    return this.advertencia(titulo, opciones);
  }

  info(titulo: string, opciones?: number | OpcionesSinTipo): number {
    return this.conTipo('info', titulo, opciones);
  }

  /** Aviso persistente con spinner. Ciérralo o actualízalo con su id (o usa `promesa`). */
  cargando(titulo: string, opciones: OpcionesSinTipo = {}): number {
    return this.mostrar({
      clave: `cargando-${this.siguienteId}`,
      cerrable: false,
      ...opciones,
      tipo: 'cargando',
      titulo,
      duracion: opciones.duracion ?? 0,
    });
  }

  /**
   * Error de una petición como aviso: título = qué falló (`porDefecto` o el del
   * código del backend), mensaje = motivo en español. Devuelve null si la capa
   * global ya avisó (sin conexión, sesión vencida, 429…); en ese caso, si se
   * pasa `reintentar`, se suma al botón "Reintentar" del aviso global.
   */
  errorHttp(
    error: unknown,
    porDefecto = 'No se pudo completar la operación',
    opciones: OpcionesErrorHttp = {},
  ): number | null {
    const { reintentar, titulo: tituloExplicito, mensaje: mensajeExplicito, ...resto } = opciones;
    if (yaNotificado(error)) {
      if (reintentar) this.adjuntarReintento(claveAvisoDe(error), reintentar);
      return null;
    }
    const d = describirError(error, porDefecto, tituloExplicito);
    const accion =
      resto.accion ?? (reintentar ? { etiqueta: 'Reintentar', icono: 'bi-arrow-clockwise', alHacer: reintentar } : undefined);
    return this.mostrar({
      ...resto,
      tipo: 'error',
      titulo: d.titulo,
      mensaje: mensajeExplicito ?? (d.mensaje || d.pista),
      accion,
    });
  }

  /**
   * Muestra "cargando" mientras dura el trabajo y lo convierte en éxito o error.
   * Devuelve el resultado; si falla, relanza el error (para que la pantalla
   * restaure su estado) sin volver a avisarlo.
   */
  async promesa<T>(trabajo: Promise<T> | Observable<T>, textos: TextosPromesa<T>): Promise<T> {
    const id = this.cargando(textos.cargando);
    try {
      const resultado = await (isObservable(trabajo) ? firstValueFrom(trabajo) : trabajo);
      const titulo = typeof textos.exito === 'function' ? textos.exito(resultado) : textos.exito;
      if (!this.actualizar(id, { tipo: 'exito', titulo, mensaje: '', cerrable: true })) this.exito(titulo);
      return resultado;
    } catch (error) {
      if (yaNotificado(error)) {
        this.cerrar(id);
      } else {
        const d = describirError(error, textos.error ?? 'No se pudo completar la operación');
        const cambios: OpcionesAviso = { tipo: 'error', titulo: d.titulo, mensaje: d.mensaje || d.pista, cerrable: true };
        if (!this.actualizar(id, cambios)) this.mostrar(cambios);
      }
      throw error;
    }
  }

  /** Cambia un aviso visible (texto, tipo, acción…). Devuelve false si ya no existe. */
  actualizar(id: number, cambios: OpcionesAviso): boolean {
    return this.modificar(id, cambios, true);
  }

  cerrar(id: number): void {
    this.cancelarTemporizador(id);
    const aviso = this.lista().find((a) => a.id === id);
    if (!aviso) return;
    this.reintentos.delete(aviso.clave);
    this.lista.update((l) => l.filter((a) => a.id !== id));
  }

  cerrarPorClave(clave: string): void {
    for (const a of this.lista()) if (a.clave === clave) this.cerrar(a.id);
  }

  cerrarTodos(): void {
    for (const a of this.lista()) this.cerrar(a.id);
  }

  hayActivo(clave: string): boolean {
    return this.lista().some((a) => a.clave === clave);
  }

  /** Detiene los temporizadores (ratón encima, foco dentro o pestaña oculta). */
  pausar(motivo: MotivoPausa = 'hover'): void {
    const yaPausado = this.motivosPausa.size > 0;
    this.motivosPausa.add(motivo);
    if (yaPausado) return;
    this._pausado.set(true);
    const ahora = Date.now();
    for (const t of this.temporizadores.values()) {
      if (t.manejador === null) continue;
      clearTimeout(t.manejador);
      t.manejador = null;
      t.restante = Math.max(0, t.restante - (ahora - t.inicio));
    }
  }

  reanudar(motivo: MotivoPausa = 'hover'): void {
    if (!this.motivosPausa.delete(motivo) || this.motivosPausa.size > 0) return;
    this._pausado.set(false);
    for (const [id, t] of this.temporizadores) {
      if (t.manejador !== null) continue;
      t.restante = Math.max(MINIMO_TRAS_REANUDAR, t.restante);
      this.arrancar(id, t);
    }
    // La barra vuelve a partir del tiempo que queda (también al volver a la pestaña).
    this.lista.update((l) =>
      l.map((a) => {
        const t = this.temporizadores.get(a.id);
        return t ? { ...a, restante: t.restante, tramo: a.tramo + 1 } : a;
      }),
    );
  }

  /** Ejecuta la acción del aviso (Deshacer, Reintentar, Ver…). */
  ejecutarAccion(id: number): void {
    const aviso = this.lista().find((a) => a.id === id);
    const accion = aviso?.accion;
    if (!aviso || !accion) return;
    if (accion.cerrarAlHacer !== false) this.cerrar(id);
    this.ejecutarSeguro(accion.alHacer);
  }

  /**
   * Ejecuta los reintentos que las pantallas sumaron a un aviso global
   * (todos si no se indica clave). Lo usa la conectividad al volver la red.
   */
  reintentarPendientes(clave?: string): number {
    const claves = clave ? [clave] : Array.from(this.reintentos.keys());
    let total = 0;
    for (const k of claves) {
      const pendientes = this.reintentos.get(k);
      if (!pendientes) continue;
      this.reintentos.delete(k);
      for (const fn of pendientes) {
        total++;
        this.ejecutarSeguro(fn);
      }
    }
    return total;
  }

  /**
   * Al cambiar de pantalla los reintentos pendientes ya no aplican: se
   * descartan y el aviso de conexión de la pantalla anterior se cierra.
   */
  descartarReintentos(): void {
    for (const clave of Array.from(this.reintentos.keys())) {
      this.reintentos.delete(clave);
      const aviso = this.lista().find((a) => a.clave === clave);
      if (!aviso) continue;
      if (clave === 'conexion') this.cerrar(aviso.id);
      else this.modificar(aviso.id, { accion: undefined }, false);
    }
  }

  /* ------------------------------------------------------------------------
   * Compatibilidad con la v1 (mismas firmas; el timeout pasa a ser opcional)
   * --------------------------------------------------------------------- */

  /** @deprecated Usar mostrar(), exito(), error(), advertencia() o info(). */
  toast(message: string, type: Toast['type'] = 'info', timeout?: number): number {
    return this.mostrar({ tipo: TIPO_LEGADO[type] ?? 'info', titulo: message, duracion: timeout });
  }

  /** @deprecated Usar exito(). */
  success(message: string, opciones?: number | OpcionesSinTipo): number {
    return this.exito(message, opciones);
  }

  /** @deprecated Usar advertencia(). */
  warn(message: string, opciones?: number | OpcionesSinTipo): number {
    return this.advertencia(message, opciones);
  }

  /* ------------------------------------------------------------------------
   * Internos
   * --------------------------------------------------------------------- */

  private conTipo(tipo: TipoAviso, titulo: string, opciones?: number | OpcionesSinTipo): number {
    const extra: OpcionesSinTipo = typeof opciones === 'number' ? { duracion: opciones } : (opciones ?? {});
    return this.mostrar({ ...extra, tipo, titulo });
  }

  private modificar(id: number, cambios: OpcionesAviso, anunciar: boolean): boolean {
    const previo = this.lista().find((a) => a.id === id);
    if (!previo) return false;
    const tipo = cambios.tipo ?? previo.tipo;
    const titulo = cambios.titulo !== undefined ? recortarTexto(cambios.titulo, LARGO_TITULO) : previo.titulo;
    const mensaje = cambios.mensaje !== undefined ? recortarTexto(cambios.mensaje, LARGO_MENSAJE) : previo.mensaje;
    const accion = 'accion' in cambios ? cambios.accion : previo.accion;
    const cambioRelevante =
      tipo !== previo.tipo || titulo !== previo.titulo || mensaje !== previo.mensaje || accion !== previo.accion;
    const duracion =
      cambios.duracion !== undefined || cambioRelevante
        ? this.calcularDuracion(tipo, titulo, mensaje, cambios.duracion, accion)
        : previo.duracion;
    this.reemplazar({
      ...previo,
      tipo,
      titulo,
      mensaje,
      accion,
      duracion,
      icono: 'icono' in cambios ? cambios.icono : previo.icono,
      cerrable: cambios.cerrable ?? previo.cerrable,
      version: previo.version + 1,
      restante: duracion,
      tramo: previo.tramo + 1,
    });
    this.programar(id, duracion);
    if (anunciar) this.anunciar(tipo, titulo, mensaje);
    return true;
  }

  private reemplazar(aviso: Aviso): void {
    this.lista.update((l) => l.map((a) => (a.id === aviso.id ? aviso : a)));
  }

  private calcularDuracion(
    tipo: TipoAviso,
    titulo: string,
    mensaje: string,
    pedida: number | undefined,
    accion: AccionAviso | undefined,
  ): number {
    if (typeof pedida === 'number' && Number.isFinite(pedida)) return Math.max(0, pedida);
    if (tipo === 'cargando') return 0;
    // Un error que ofrece una salida (Reintentar…) espera a que la persona decida.
    if (tipo === 'error' && accion) return 0;
    const lectura = LECTURA_BASE_MS + (titulo.length + mensaje.length) * LECTURA_MS_POR_CARACTER;
    return Math.min(DURACION_MAXIMA, Math.max(DURACION_BASE[tipo], lectura, accion ? DURACION_CON_ACCION : 0));
  }

  /** Deja como máximo 4 (2 en móvil): salen primero los más antiguos sin acción ni carga. */
  private recortar(protegido?: number): void {
    const vivos = this.lista();
    let sobran = vivos.length - (this.esMovil() ? MAXIMO_MOVIL : MAXIMO_ESCRITORIO);
    if (sobran <= 0) return;
    const candidatos = vivos.filter((a) => a.id !== protegido);
    const ordenados = [
      ...candidatos.filter((a) => a.tipo !== 'cargando' && !a.accion),
      ...candidatos.filter((a) => a.tipo === 'cargando' || !!a.accion),
    ];
    for (const a of ordenados) {
      if (sobran-- <= 0) break;
      this.cerrar(a.id);
    }
  }

  private programar(id: number, ms: number): void {
    this.cancelarTemporizador(id);
    if (!this.navegador || ms <= 0) return;
    const t: Temporizador = { manejador: null, inicio: Date.now(), restante: ms };
    this.temporizadores.set(id, t);
    if (this.motivosPausa.size === 0) this.arrancar(id, t);
  }

  /** El temporizador corre fuera de la zona (no dispara detección de cambios mientras espera). */
  private arrancar(id: number, t: Temporizador): void {
    t.inicio = Date.now();
    t.manejador = this.zona.runOutsideAngular(() =>
      setTimeout(() => this.zona.run(() => this.cerrar(id)), t.restante),
    );
  }

  private cancelarTemporizador(id: number): void {
    const t = this.temporizadores.get(id);
    if (t?.manejador != null) clearTimeout(t.manejador);
    this.temporizadores.delete(id);
  }

  private adjuntarReintento(clave: string, reintentar: () => unknown): void {
    const aviso = clave ? this.lista().find((a) => a.clave === clave) : undefined;
    if (!aviso) return;
    let pendientes = this.reintentos.get(clave);
    if (!pendientes) {
      pendientes = new Set();
      this.reintentos.set(clave, pendientes);
    }
    pendientes.add(reintentar);
    if (aviso.accion) return;
    this.modificar(
      aviso.id,
      { accion: { etiqueta: 'Reintentar', icono: 'bi-arrow-clockwise', alHacer: () => this.reintentarPendientes(clave) } },
      false,
    );
  }

  private ejecutarSeguro(fn: () => unknown): void {
    const alFallar = (e: unknown) => {
      this.errorHttp(e, 'No se pudo completar la acción');
    };
    try {
      const resultado = fn();
      if (isObservable(resultado)) resultado.subscribe({ error: alFallar });
      else if (esPromesa(resultado)) resultado.then(undefined, alFallar);
    } catch (e) {
      alFallar(e);
    }
  }

  private repiteAvisoGlobal(texto: string): boolean {
    return MENSAJES_GLOBALES.some((m) => texto.includes(m)) && CLAVES_GLOBALES.some((k) => this.hayActivo(k));
  }

  private esMovil(): boolean {
    return this.consultaMovil?.matches ?? false;
  }

  /**
   * Lectores de pantalla: se vacía la región y se escribe el texto un instante
   * después, para que un mismo mensaje repetido vuelva a anunciarse. Los
   * avisos que llegan juntos se leen en una sola frase.
   */
  private anunciar(tipo: TipoAviso, titulo: string, mensaje: string): void {
    if (!this.navegador) return;
    const texto = `${ETIQUETA_LECTOR[tipo]}: ${[titulo, mensaje].filter(Boolean).join('. ')}`;
    if (tipo === 'error') {
      this.colaAnuncioUrgente.push(texto);
      this._anuncioUrgente.set('');
    } else {
      this.colaAnuncio.push(texto);
      this._anuncio.set('');
    }
    if (this.anuncioPendiente) return;
    this.anuncioPendiente = true;
    this.zona.runOutsideAngular(() =>
      setTimeout(() => this.zona.run(() => this.vaciarAnuncios()), RETARDO_ANUNCIO_MS),
    );
  }

  private vaciarAnuncios(): void {
    this.anuncioPendiente = false;
    if (this.colaAnuncio.length) {
      this._anuncio.set(this.colaAnuncio.join(' '));
      this.colaAnuncio = [];
    }
    if (this.colaAnuncioUrgente.length) {
      this._anuncioUrgente.set(this.colaAnuncioUrgente.join(' '));
      this.colaAnuncioUrgente = [];
    }
  }

  /** Pestaña oculta → pausa; cambio a móvil → recorta la pila. Solo en navegador. */
  private escucharEntorno(): void {
    this.zona.runOutsideAngular(() => {
      const alCambiarVisibilidad = () =>
        this.zona.run(() => (document.hidden ? this.pausar('oculto') : this.reanudar('oculto')));
      document.addEventListener('visibilitychange', alCambiarVisibilidad);

      const alCambiarAncho = () => this.zona.run(() => this.recortar());
      if (typeof matchMedia === 'function') {
        this.consultaMovil = matchMedia(CONSULTA_MOVIL);
        this.consultaMovil.addEventListener?.('change', alCambiarAncho);
      }

      this.destroyRef.onDestroy(() => {
        document.removeEventListener('visibilitychange', alCambiarVisibilidad);
        this.consultaMovil?.removeEventListener?.('change', alCambiarAncho);
        for (const id of Array.from(this.temporizadores.keys())) this.cancelarTemporizador(id);
      });
    });
    if (document.hidden) this.pausar('oculto');
  }
}
