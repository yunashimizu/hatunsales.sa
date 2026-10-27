import { Injectable, signal } from '@angular/core';

const CLAVE_ACTIVO = 'sonido_caja_activo';

/** Un tono del patrón: frecuencia (Hz), inicio relativo (s) y duración (s). */
interface Tono {
  frecuencia: number;
  inicio: number;
  duracion: number;
}

/**
 * Retroalimentación sonora de la caja: el cajero mira el producto, no la pantalla.
 * Sin archivos de audio: `AudioContext` con osciladores.
 * - `ok()`: un pitido corto y agudo (producto agregado).
 * - `error()`: dos tonos graves (no existe, conflicto, sin red).
 * - `aviso()`: un tono medio y largo (p. ej. excede el stock).
 *
 * Nunca lanza: sin `AudioContext` (Vitest/jsdom, navegador viejo) o con el audio bloqueado simplemente calla.
 * El navegador exige un gesto del usuario: se reanuda en el primer `pointerdown`/`keydown`.
 */
@Injectable({ providedIn: 'root' })
export class SonidoCajaService {
  private readonly _activo = signal(this.leerPreferencia());
  /** Preferencia del cajero (activo por defecto); persiste en `localStorage`. */
  readonly activo = this._activo.asReadonly();

  private contexto: AudioContext | null = null;
  private gestoEscuchado = false;

  constructor() {
    this.esperarPrimerGesto();
  }

  ok(): void {
    this.reproducir([{ frecuencia: 1568, inicio: 0, duracion: 0.07 }]);
  }

  error(): void {
    this.reproducir([
      { frecuencia: 220, inicio: 0, duracion: 0.16 },
      { frecuencia: 165, inicio: 0.22, duracion: 0.22 },
    ]);
  }

  aviso(): void {
    this.reproducir([{ frecuencia: 698, inicio: 0, duracion: 0.2 }]);
  }

  alternar(): void {
    this.establecerActivo(!this._activo());
  }

  establecerActivo(valor: boolean): void {
    this._activo.set(valor);
    try {
      localStorage.setItem(CLAVE_ACTIVO, valor ? '1' : '0');
    } catch {
      /* almacenamiento bloqueado: la preferencia vale solo para esta sesión */
    }
  }

  private leerPreferencia(): boolean {
    try {
      return localStorage.getItem(CLAVE_ACTIVO) !== '0';
    } catch {
      return true;
    }
  }

  private obtenerContexto(): AudioContext | null {
    if (this.contexto) return this.contexto;
    try {
      if (typeof AudioContext === 'undefined') return null;
      this.contexto = new AudioContext();
    } catch {
      this.contexto = null;
    }
    return this.contexto;
  }

  private reanudar(): void {
    try {
      const contexto = this.obtenerContexto();
      if (contexto && contexto.state === 'suspended') void Promise.resolve(contexto.resume()).catch(() => undefined);
    } catch {
      /* sin audio */
    }
  }

  /** Una sola vez: el primer gesto del usuario habilita el audio del navegador. */
  private esperarPrimerGesto(): void {
    if (this.gestoEscuchado || typeof document === 'undefined') return;
    this.gestoEscuchado = true;
    const alGesto = () => {
      document.removeEventListener('pointerdown', alGesto, true);
      document.removeEventListener('keydown', alGesto, true);
      this.reanudar();
    };
    try {
      document.addEventListener('pointerdown', alGesto, true);
      document.addEventListener('keydown', alGesto, true);
    } catch {
      /* sin DOM */
    }
  }

  private reproducir(tonos: Tono[]): void {
    if (!this._activo()) return;
    try {
      const contexto = this.obtenerContexto();
      if (!contexto) return;
      this.reanudar();
      const base = contexto.currentTime;
      for (const tono of tonos) {
        const oscilador = contexto.createOscillator();
        const volumen = contexto.createGain();
        oscilador.type = 'sine';
        oscilador.frequency.value = tono.frecuencia;
        volumen.gain.value = 0.15;
        oscilador.connect(volumen);
        volumen.connect(contexto.destination);
        oscilador.start(base + tono.inicio);
        oscilador.stop(base + tono.inicio + tono.duracion);
      }
    } catch {
      /* el sonido nunca debe romper una venta */
    }
  }
}
