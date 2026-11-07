/**
 * Ayuda de cálculo para contar el efectivo por billetes y monedas del sol peruano.
 * La lista es la misma que valida el servidor (hatunsales/src/caja/dominio/denominaciones.ts):
 * si allí cambia, cambia aquí. Todo se calcula en céntimos enteros para no arrastrar coma flotante.
 */
export type TipoDenominacionSol = 'billete' | 'moneda';

export interface DenominacionSol {
  tipo: TipoDenominacionSol;
  centimos: number;
  /** 'S/ 200' / 'S/ 0.50' */
  etiqueta: string;
}

/** Tope por denominación que acepta el servidor al registrar un arqueo. */
export const MAX_CANTIDAD_DENOMINACION = 100_000;

function den(tipo: TipoDenominacionSol, centimos: number): DenominacionSol {
  const etiqueta = centimos % 100 === 0 ? `S/ ${centimos / 100}` : `S/ ${(centimos / 100).toFixed(2)}`;
  return { tipo, centimos, etiqueta };
}

/** De mayor a menor, como se cuenta la gaveta. */
export const DENOMINACIONES_SOL: readonly DenominacionSol[] = Object.freeze([
  den('billete', 20_000),
  den('billete', 10_000),
  den('billete', 5_000),
  den('billete', 2_000),
  den('billete', 1_000),
  den('moneda', 500),
  den('moneda', 200),
  den('moneda', 100),
  den('moneda', 50),
  den('moneda', 20),
  den('moneda', 10),
]);

/** Una fila editable del conteo: `cantidad` null es «aún sin escribir» y cuenta como 0. */
export interface LineaConteo extends DenominacionSol {
  cantidad: number | null;
}

export function lineasConteoVacias(): LineaConteo[] {
  return DENOMINACIONES_SOL.map((d) => ({ ...d, cantidad: null }));
}

/** Vacío (null, undefined, '') se acepta como 0; lo escrito debe ser un entero de 0 al tope. */
export function cantidadValida(cantidad: unknown): boolean {
  if (cantidad === null || cantidad === undefined || cantidad === '') return true;
  return (
    typeof cantidad === 'number' &&
    Number.isInteger(cantidad) &&
    cantidad >= 0 &&
    cantidad <= MAX_CANTIDAD_DENOMINACION
  );
}

/** Piezas que se suman: lo inválido o vacío vale 0. */
export function cantidadEfectiva(cantidad: unknown): number {
  return cantidad !== null && cantidad !== undefined && cantidad !== '' && cantidadValida(cantidad)
    ? (cantidad as number)
    : 0;
}

export function subtotalCentimos(linea: Pick<LineaConteo, 'centimos' | 'cantidad'>): number {
  return linea.centimos * cantidadEfectiva(linea.cantidad);
}

/** Total en soles del conteo, exacto al céntimo. */
export function totalConteoSoles(lineas: readonly Pick<LineaConteo, 'centimos' | 'cantidad'>[]): number {
  return lineas.reduce((suma, l) => suma + subtotalCentimos(l), 0) / 100;
}

/** ¿Hay al menos una pieza contada? */
export function hayConteo(lineas: readonly Pick<LineaConteo, 'cantidad'>[]): boolean {
  return lineas.some((l) => cantidadEfectiva(l.cantidad) > 0);
}
