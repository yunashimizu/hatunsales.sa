/** Paginación de listas que ya están completas en el navegador. */

export const TAMANOS_PAGINA = [25, 50, 100] as const;
export const TAMANO_PAGINA_INICIAL = 25;
const CLAVE_FILAS = 'hs.panel.filas-por-pagina';

export interface PaginaLocal<T> {
  filas: T[];
  /** Total de filas de la lista completa. */
  total: number;
  totalPaginas: number;
  /** Página realmente mostrada (se corrige si se pidió una que ya no existe). */
  pagina: number;
  porPagina: number;
  /** Posición, desde 1, de la primera y la última fila mostradas; 0 y 0 si no hay filas. */
  desde: number;
  hasta: number;
}

export function paginar<T>(lista: readonly T[], pagina: number, porPagina: number): PaginaLocal<T> {
  const tamano = Math.max(1, Math.floor(porPagina) || TAMANO_PAGINA_INICIAL);
  const total = lista.length;
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  const actual = Math.min(Math.max(1, Math.floor(pagina) || 1), totalPaginas);
  const inicio = (actual - 1) * tamano;
  const filas = lista.slice(inicio, inicio + tamano);
  return {
    filas,
    total,
    totalPaginas,
    pagina: actual,
    porPagina: tamano,
    desde: filas.length ? inicio + 1 : 0,
    hasta: filas.length ? inicio + filas.length : 0,
  };
}

/** Filas por página que eligió la persona (una sola preferencia para todo el panel). */
export function leerFilasPorPagina(): number {
  try {
    const valor = Number(localStorage.getItem(CLAVE_FILAS));
    return (TAMANOS_PAGINA as readonly number[]).includes(valor) ? valor : TAMANO_PAGINA_INICIAL;
  } catch {
    return TAMANO_PAGINA_INICIAL;
  }
}

export function guardarFilasPorPagina(valor: number): void {
  try {
    localStorage.setItem(CLAVE_FILAS, String(valor));
  } catch {
    // Sin almacenamiento: vale hasta cerrar la pantalla.
  }
}
