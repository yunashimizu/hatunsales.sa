import { descargarArchivo } from './descargar-archivo';

export interface ColumnaCsv<T> {
  titulo: string;
  valor: (fila: T) => string | number | null | undefined;
}

const SALTO = '\r\n';
const NUMERO = /^[+-]?\d+(\.\d+)?$/;

/** Una celda: texto siempre entre comillas, números tal cual (con punto) y vacío cuando no hay dato. */
function celda(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : '';
  let texto = valor;
  // Excel ejecuta como fórmula lo que empieza con = + - @; se antepone un apóstrofo (salvo números).
  if (/^[=+\-@\t\r]/.test(texto) && !NUMERO.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}

/** Arma el contenido del CSV (sin BOM). Exportado para poder probarlo sin descargar nada. */
export function construirCsv<T>(columnas: readonly ColumnaCsv<T>[], filas: readonly T[]): string {
  const cabecera = columnas.map((c) => celda(c.titulo)).join(',');
  const cuerpo = filas.map((fila) => columnas.map((c) => celda(c.valor(fila))).join(','));
  return [cabecera, ...cuerpo].join(SALTO) + SALTO;
}

/** «2026-11-08T14:05:00-05:00» o Date → «2026-11-08 14:05» en la hora local; vacío si no es una fecha. */
export function fechaCsv(valor: string | Date | null | undefined): string {
  if (!valor) return '';
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())} ${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`;
}

/** Nombre del archivo: «productos-2026-11-08.csv». */
export function nombreArchivoCsv(base: string, ahora = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  const dia = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
  return `${base.replace(/\.csv$/i, '')}-${dia}.csv`;
}

/**
 * Descarga las filas como CSV (UTF-8 con BOM para que Excel respete las tildes).
 * Devuelve cuántas filas se exportaron.
 */
export function exportarCsv<T>(base: string, columnas: readonly ColumnaCsv<T>[], filas: readonly T[]): number {
  const contenido = '﻿' + construirCsv(columnas, filas);
  descargarArchivo(new Blob([contenido], { type: 'text/csv;charset=utf-8' }), nombreArchivoCsv(base));
  return filas.length;
}
