import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

export type Densidad = 'comoda' | 'compacta';

const CLAVE_DENSIDAD = 'hs.panel.densidad';

/**
 * Densidad del panel: «Cómoda» (la de siempre) o «Compacta» (filas, campos y
 * botones más bajos, para ver más en pantallas grandes con ratón).
 *
 * Solo escribe `<html data-densidad="…">`; el CSS (admin-ui.css) lo aplica
 * únicamente con puntero fino, así que en pantallas táctiles los 44 px se quedan.
 */
@Injectable({ providedIn: 'root' })
export class DensidadService {
  private readonly doc = inject(DOCUMENT);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));

  readonly densidad = signal<Densidad>(this.leerGuardada());
  readonly esCompacta = computed(() => this.densidad() === 'compacta');

  constructor() {
    this.aplicar(this.densidad());
  }

  fijar(densidad: Densidad): void {
    this.densidad.set(densidad);
    this.aplicar(densidad);
    if (!this.navegador) return;
    try {
      if (densidad === 'comoda') localStorage.removeItem(CLAVE_DENSIDAD);
      else localStorage.setItem(CLAVE_DENSIDAD, densidad);
    } catch {
      /* almacenamiento bloqueado: la densidad vale para esta visita */
    }
  }

  private aplicar(densidad: Densidad): void {
    if (!this.navegador) return;
    const raiz = this.doc.documentElement;
    if (densidad === 'compacta') raiz.setAttribute('data-densidad', 'compacta');
    else raiz.removeAttribute('data-densidad');
  }

  private leerGuardada(): Densidad {
    if (!this.navegador) return 'comoda';
    try {
      return localStorage.getItem(CLAVE_DENSIDAD) === 'compacta' ? 'compacta' : 'comoda';
    } catch {
      return 'comoda';
    }
  }
}
