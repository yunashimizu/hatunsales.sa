import { Injectable, signal } from '@angular/core';

/** Estado de apertura de la ayuda de atajos de teclado («?»). */
@Injectable({ providedIn: 'root' })
export class AyudaAtajosService {
  readonly abierta = signal(false);

  abrir(): void {
    this.abierta.set(true);
  }

  cerrar(): void {
    this.abierta.set(false);
  }
}

/**
 * ¿El foco (o el destino de la tecla) está donde se escribe? Ahí «?» es un carácter más
 * y no debe abrir la ayuda: campos, áreas de texto, listas desplegables y texto editable.
 */
export function esCampoDeEscritura(destino: EventTarget | null): boolean {
  if (!(destino instanceof Element)) return false;
  return destino.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}
