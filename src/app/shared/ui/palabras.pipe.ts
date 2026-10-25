import { Pipe, PipeTransform } from '@angular/core';

/**
 * Parte un titular en palabras para el efecto de revelado por palabras
 * (hsReveal="palabras"): {{ titulo | hsPalabras }} → ['Todo', 'lo', 'que', …].
 * La plantilla pinta cada una dentro de <span class="x-palabra"><span>…</span></span>.
 */
@Pipe({ name: 'hsPalabras', standalone: true })
export class PalabrasPipe implements PipeTransform {
  transform(texto: string | null | undefined): string[] {
    return (texto ?? '').split(/\s+/).filter(Boolean);
  }
}
