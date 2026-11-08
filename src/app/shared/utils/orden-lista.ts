/**
 * Orden de listas en pantalla: ordenar por columna sin volver a pedir los datos al servidor.
 * Solo sirve para listas que llegan completas; una lista paginada en el servidor ordenaría
 * únicamente la página visible, y eso engaña.
 */

export type DireccionOrden = 'asc' | 'desc';

/** `clave: null` = sin orden (se ve la lista tal como llegó). */
export interface EstadoOrden {
  clave: string | null;
  dir: DireccionOrden;
}

export const SIN_ORDEN: EstadoOrden = { clave: null, dir: 'asc' };

type Extractor<T> = (fila: T) => unknown;

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

function esVacio(valor: unknown): boolean {
  return valor === null || valor === undefined || valor === '' || (typeof valor === 'number' && Number.isNaN(valor));
}

/** Compara dos valores no vacíos: números y fechas por valor, el resto como texto con números naturales. */
function compararValores(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

/**
 * Devuelve una copia ordenada. Los vacíos (null, undefined, '') quedan siempre al final,
 * en ascendente y en descendente. El orden es estable: lo que empata conserva su sitio.
 */
export function ordenarLista<T>(
  lista: readonly T[],
  clave: keyof T | Extractor<T>,
  dir: DireccionOrden,
): T[] {
  const leer: Extractor<T> = typeof clave === 'function' ? clave : (fila) => fila[clave];
  const signo = dir === 'desc' ? -1 : 1;
  return lista
    .map((fila) => ({ fila, valor: leer(fila) }))
    .sort((x, y) => {
      const xv = esVacio(x.valor);
      const yv = esVacio(y.valor);
      if (xv || yv) return xv === yv ? 0 : xv ? 1 : -1;
      return signo * compararValores(x.valor, y.valor);
    })
    .map((par) => par.fila);
}

/** Clic en una cabecera: otra columna → ascendente; la misma → descendente → sin orden. */
export function alternarOrden(estado: EstadoOrden, clave: string): EstadoOrden {
  if (estado.clave !== clave) return { clave, dir: 'asc' };
  if (estado.dir === 'asc') return { clave, dir: 'desc' };
  return { ...SIN_ORDEN };
}

/** Valor del atributo `aria-sort` de una cabecera. */
export function ariaSort(estado: EstadoOrden, clave: string): 'ascending' | 'descending' | 'none' {
  if (estado.clave !== clave) return 'none';
  return estado.dir === 'asc' ? 'ascending' : 'descending';
}

/** Clase del icono de la cabecera (Bootstrap Icons). */
export function iconoOrden(estado: EstadoOrden, clave: string): string {
  if (estado.clave !== clave) return 'bi-arrow-down-up';
  return estado.dir === 'asc' ? 'bi-sort-up' : 'bi-sort-down';
}

const prefijo = 'hs.orden.';

/** Lee el orden guardado de una pantalla en esta pestaña; ignora lo que no sea válido. */
export function leerOrdenGuardado(pantalla: string, clavesValidas?: readonly string[]): EstadoOrden {
  try {
    const crudo = sessionStorage.getItem(prefijo + pantalla);
    if (!crudo) return { ...SIN_ORDEN };
    const dato = JSON.parse(crudo) as Partial<EstadoOrden> | null;
    const clave = typeof dato?.clave === 'string' ? dato.clave : null;
    if (!clave || (clavesValidas && !clavesValidas.includes(clave))) return { ...SIN_ORDEN };
    return { clave, dir: dato?.dir === 'desc' ? 'desc' : 'asc' };
  } catch {
    return { ...SIN_ORDEN };
  }
}

export function guardarOrden(pantalla: string, estado: EstadoOrden): void {
  try {
    if (estado.clave) sessionStorage.setItem(prefijo + pantalla, JSON.stringify(estado));
    else sessionStorage.removeItem(prefijo + pantalla);
  } catch {
    // Sin almacenamiento (ventana privada o bloqueado): el orden vale mientras la pantalla esté abierta.
  }
}
