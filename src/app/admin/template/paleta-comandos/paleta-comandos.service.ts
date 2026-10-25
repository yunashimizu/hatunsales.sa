import { Injectable, signal } from '@angular/core';

/** Estado de apertura de la paleta de comandos (Ctrl/⌘ + K) del panel. */
@Injectable({ providedIn: 'root' })
export class PaletaComandosService {
  readonly abierta = signal(false);

  abrir(): void {
    this.abierta.set(true);
  }

  cerrar(): void {
    this.abierta.set(false);
  }

  alternar(): void {
    this.abierta.update((v) => !v);
  }
}
