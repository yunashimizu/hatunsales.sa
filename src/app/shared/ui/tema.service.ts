import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { movimientoPermitido } from './movimiento.util';

export type Tema = 'claro' | 'oscuro';
/** Lo que elige el usuario: un tema fijo o «según el sistema». */
export type ModoTema = Tema | 'sistema';

/** Color de la barra del navegador (Android) cuando ninguna zona pide uno propio: el de la tienda. */
const COLOR_BARRA_PREDETERMINADO = '#0d1220';

/** Misma clave que el script de index.html (que aplica el tema antes del primer pintado). */
const CLAVE_TEMA = 'hs.tema';

/**
 * Tema claro/oscuro de toda la aplicación (tienda, login y panel).
 *
 * - Parte de la elección guardada en localStorage o, si no hay, del sistema
 *   (prefers-color-scheme) y sigue al sistema mientras el usuario no elija.
 * - Aplica <html data-tema="…">; todo el oscuro sale de redefinir tokens
 *   (shared/styles/tema-oscuro.css), no hay lógica de negocio implicada.
 * - `modo()` dice si hay una elección guardada (claro/oscuro) o se sigue al sistema;
 *   `elegir('sistema')` borra lo guardado y vuelve a seguirlo.
 * - `fijarColorBarra()` deja que una zona (el panel) pinte la barra del navegador con su fondo.
 * - Al cambiar con el botón, el nuevo tema se «revela» como un círculo que crece
 *   desde el botón (View Transitions); sin soporte o con movimiento reducido, cambia al instante.
 */
@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly doc = inject(DOCUMENT);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));

  readonly tema = signal<Tema>(this.leerInicial());
  readonly esOscuro = computed(() => this.tema() === 'oscuro');

  /** Elección guardada; null = sigue al sistema. */
  private readonly guardado = signal<Tema | null>(this.leerGuardado());
  readonly modo = computed<ModoTema>(() => this.guardado() ?? 'sistema');

  private coloresBarra: { claro: string; oscuro: string } | null = null;

  constructor() {
    if (!this.navegador) return;
    this.aplicar(this.tema());
    const sistema = window.matchMedia?.('(prefers-color-scheme: dark)');
    sistema?.addEventListener?.('change', (e) => {
      if (this.guardado() === null) this.fijar(e.matches ? 'oscuro' : 'claro', false);
    });
  }

  /** Elige claro, oscuro o «sistema» (borra la elección guardada y aplica el tema del sistema). */
  elegir(modo: ModoTema): void {
    if (modo !== 'sistema') {
      this.fijar(modo);
      return;
    }
    this.guardado.set(null);
    if (this.navegador) {
      try {
        localStorage.removeItem(CLAVE_TEMA);
      } catch {
        /* almacenamiento bloqueado: el modo vale para esta visita */
      }
    }
    this.fijar(this.temaDelSistema(), false);
  }

  /**
   * Imprimir siempre es en papel blanco: mientras dura el diálogo de impresión el documento va en
   * claro. No toca la señal ni lo guardado; al terminar vuelve al tema de la persona.
   */
  paraImpresion(activo: boolean): void {
    if (!this.navegador) return;
    this.doc.documentElement.setAttribute('data-tema', activo ? 'claro' : this.tema());
  }

  /**
   * Color de la barra del navegador en móvil (`<meta name="theme-color">`).
   * Con colores, sigue al tema; con null vuelve al de la tienda.
   */
  fijarColorBarra(colores: { claro: string; oscuro: string } | null): void {
    this.coloresBarra = colores;
    this.aplicarColorBarra();
  }

  /** Cambia entre claro y oscuro; `origen` (el botón pulsado) marca de dónde nace el círculo. */
  alternar(origen?: Element | null): void {
    const siguiente: Tema = this.tema() === 'oscuro' ? 'claro' : 'oscuro';
    const raiz = this.doc.documentElement;
    const conTransicion = this.navegador && movimientoPermitido() && typeof this.doc.startViewTransition === 'function';
    if (!conTransicion) {
      this.fijar(siguiente);
      return;
    }
    const caja = origen?.getBoundingClientRect();
    raiz.style.setProperty('--vt-x', `${caja ? caja.left + caja.width / 2 : window.innerWidth - 40}px`);
    raiz.style.setProperty('--vt-y', `${caja ? caja.top + caja.height / 2 : 40}px`);
    raiz.setAttribute('data-vt', 'tema');
    const transicion = this.doc.startViewTransition(() => this.fijar(siguiente));
    const limpiar = (): void => {
      raiz.removeAttribute('data-vt');
    };
    transicion.finished.then(limpiar, limpiar);
  }

  /** Fija el tema; `persistir` falso lo usa solo el seguimiento automático del sistema. */
  fijar(tema: Tema, persistir = true): void {
    this.tema.set(tema);
    this.aplicar(tema);
    if (!persistir || !this.navegador) return;
    this.guardado.set(tema);
    try {
      localStorage.setItem(CLAVE_TEMA, tema);
    } catch {
      /* almacenamiento bloqueado: el tema vale para esta visita */
    }
  }

  private aplicar(tema: Tema): void {
    if (!this.navegador) return;
    this.doc.documentElement.setAttribute('data-tema', tema);
    this.aplicarColorBarra();
  }

  private aplicarColorBarra(): void {
    if (!this.navegador) return;
    const color = this.coloresBarra ? this.coloresBarra[this.tema()] : COLOR_BARRA_PREDETERMINADO;
    let meta = this.doc.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = this.doc.createElement('meta');
      meta.name = 'theme-color';
      this.doc.head.appendChild(meta);
    }
    if (meta.content !== color) meta.content = color;
  }

  private temaDelSistema(): Tema {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  }

  private leerGuardado(): Tema | null {
    if (!this.navegador) return null;
    try {
      const v = localStorage.getItem(CLAVE_TEMA);
      return v === 'oscuro' || v === 'claro' ? v : null;
    } catch {
      return null;
    }
  }

  private leerInicial(): Tema {
    if (!this.navegador) return 'claro';
    // El script de index.html ya resolvió guardado/sistema: se respeta su resultado.
    const aplicado = this.doc.documentElement.getAttribute('data-tema');
    if (aplicado === 'oscuro' || aplicado === 'claro') return aplicado;
    return this.leerGuardado() ?? this.temaDelSistema();
  }
}
