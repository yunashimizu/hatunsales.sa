import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { movimientoPermitido } from './movimiento.util';

export type Tema = 'claro' | 'oscuro';

/** Misma clave que el script de index.html (que aplica el tema antes del primer pintado). */
const CLAVE_TEMA = 'hs.tema';

/**
 * Tema claro/oscuro de toda la aplicación (tienda, login y panel).
 *
 * - Parte de la elección guardada en localStorage o, si no hay, del sistema
 *   (prefers-color-scheme) y sigue al sistema mientras el usuario no elija.
 * - Aplica <html data-tema="…">; todo el oscuro sale de redefinir tokens
 *   (shared/styles/tema-oscuro.css), no hay lógica de negocio implicada.
 * - Al cambiar con el botón, el nuevo tema se «revela» como un círculo que crece
 *   desde el botón (View Transitions); sin soporte o con movimiento reducido, cambia al instante.
 */
@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly doc = inject(DOCUMENT);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));

  readonly tema = signal<Tema>(this.leerInicial());
  readonly esOscuro = computed(() => this.tema() === 'oscuro');

  constructor() {
    if (!this.navegador) return;
    this.aplicar(this.tema());
    const sistema = window.matchMedia?.('(prefers-color-scheme: dark)');
    sistema?.addEventListener?.('change', (e) => {
      if (this.leerGuardado() === null) this.fijar(e.matches ? 'oscuro' : 'claro', false);
    });
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
    try {
      localStorage.setItem(CLAVE_TEMA, tema);
    } catch {
      /* almacenamiento bloqueado: el tema vale para esta visita */
    }
  }

  private aplicar(tema: Tema): void {
    if (!this.navegador) return;
    this.doc.documentElement.setAttribute('data-tema', tema);
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
    return this.leerGuardado() ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro');
  }
}
