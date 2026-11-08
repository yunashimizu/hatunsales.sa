import { Injectable, computed, signal } from '@angular/core';

/** Una petición más corta que esto no cuenta: así la barra no parpadea con respuestas instantáneas. */
export const ESPERA_ANTES_DE_CONTAR_MS = 400;

/**
 * Cuenta las peticiones HTTP de primer plano (no silenciosas) que tardan más de
 * 400 ms. Solo informa: la barra de progreso del panel decide cómo mostrarlo.
 */
@Injectable({ providedIn: 'root' })
export class CargaGlobalService {
  private readonly _pendientes = signal(0);
  /** Peticiones lentas en curso. */
  readonly pendientes = this._pendientes.asReadonly();
  readonly hayCarga = computed(() => this._pendientes() > 0);

  private siguiente = 0;
  private readonly lentas = new Set<number>();
  private readonly temporizadores = new Map<number, ReturnType<typeof setTimeout>>();

  /** Una petición empieza; devuelve la clave para avisar de su final. */
  iniciar(): number {
    const clave = ++this.siguiente;
    this.temporizadores.set(
      clave,
      setTimeout(() => {
        this.temporizadores.delete(clave);
        this.lentas.add(clave);
        this._pendientes.set(this.lentas.size);
      }, ESPERA_ANTES_DE_CONTAR_MS),
    );
    return clave;
  }

  /** La petición terminó (bien, mal o cancelada). */
  terminar(clave: number): void {
    const temporizador = this.temporizadores.get(clave);
    if (temporizador !== undefined) {
      clearTimeout(temporizador);
      this.temporizadores.delete(clave);
    }
    if (this.lentas.delete(clave)) this._pendientes.set(this.lentas.size);
  }
}
