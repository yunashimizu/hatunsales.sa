/**
 * Filtrado instantáneo de listas paginadas.
 *
 * Las pantallas con búsqueda en el servidor esperan unos 200–300 ms (debounce) más
 * el viaje de red antes de cambiar. Para que se sienta inmediato, al teclear se
 * filtran en pantalla las filas que ya están cargadas y la consulta al servidor
 * sigue en segundo plano para traer las que faltan (otras páginas).
 *
 * Misma regla que el servidor (subcadena sin distinguir mayúsculas) para que lo que se
 * ve al instante no cambie cuando llega la respuesta. Cada pantalla pasa solo los
 * campos que el servidor también busca.
 */

function aMinusculas(valor: unknown): string {
  return valor === null || valor === undefined ? '' : String(valor).toLowerCase();
}

/** Devuelve las filas cuyo alguno de los `campos` contiene `texto`. Sin texto, devuelve la misma lista. */
export function filtrarInstantaneo<T>(
  filas: readonly T[],
  texto: string | null | undefined,
  campos: (fila: T) => readonly unknown[],
): readonly T[] {
  const buscado = aMinusculas(texto).trim();
  if (!buscado) return filas;
  return filas.filter((fila) => campos(fila).some((campo) => aMinusculas(campo).includes(buscado)));
}

/**
 * Estado de «búsqueda en el servidor pendiente» de una pantalla con filtrado instantáneo.
 *
 * Mientras está pendiente no se debe mostrar «sin resultados»: las filas que faltan
 * pueden estar en otra página y llegar con la respuesta. Una petición anterior que
 * termina cuando el usuario ya tecleó otra cosa no lo apaga (cada `iniciar()` invalida
 * las consultas lanzadas antes).
 */
export class BusquedaPendiente {
  private serie = 0;
  activa = false;

  /** Al teclear: hay una consulta por venir. */
  iniciar(): void {
    this.serie++;
    this.activa = true;
  }

  /** Al lanzar la consulta: devuelve lo que hay que llamar cuando esa consulta termine (éxito o error). */
  alLanzar(): () => void {
    const mia = this.serie;
    return () => {
      if (mia === this.serie) this.activa = false;
    };
  }
}
