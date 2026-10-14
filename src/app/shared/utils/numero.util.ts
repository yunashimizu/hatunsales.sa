/**
 * Lectura y formato de los números que se escriben a mano (panel y tienda).
 *
 * Por qué existe: <input type="number"> depende del idioma del navegador.
 * Con «10.000» guardaba 10 y con «10,000» el valor llegaba vacío (0). Estas
 * funciones entienden cómo se escriben los números en Perú y devuelven un
 * número limpio para el modelo. Son puras (sin Angular) y las usa la
 * directiva appNumero (shared/directives/numero.directive.ts).
 *
 * Reglas de lectura (es-PE), en este orden:
 *  1. Se ignoran los espacios de los extremos, el prefijo «S/» o «S/.», un
 *     signo «+», «-» o «−» (en cualquier orden: «-S/ 10», «S/ -10») y un «%»
 *     final («18,5 %»).
 *  2. Solo se aceptan cifras y los separadores «.», «,», espacio (también el
 *     duro, U+00A0) y apóstrofo «'» o «’». Dos separadores seguidos son un
 *     error. Un «.» o «,» final mientras se escribe («10,») se ignora; uno al
 *     inicio («,5») es «0,5».
 *  3. El espacio y el apóstrofo SOLO separan miles: «1 000 000», «1'000,000».
 *  4. El separador decimal es siempre el último «.» o «,», y solo puede
 *     aparecer una vez:
 *     - si están los dos: «1,200.50» = 1200.5 y «1.200,50» = 1200.5;
 *     - si hay uno solo, una vez, seguido de 1-2 cifras (o de 4 o más):
 *       «12,5» = 12.5, «3.1416» = 3.1416;
 *     - si está repetido, es de miles: «1,000,000» = 1000000;
 *     - seguido de EXACTAMENTE 3 cifras es de miles: «10.000» = 10000 y
 *       «10,000» = 10000. Excepciones: con parte entera 0 es decimal
 *       («0,500» = 0.5) y en campos de 3 decimales (peso) el punto es decimal
 *       («1.500» = 1.5) y solo la coma agrupa miles («1,500» = 1500).
 *  5. Los grupos de miles son válidos si el primero tiene 1-3 cifras sin cero
 *     inicial y los demás exactamente 3, con un solo tipo de separador de
 *     miles (más el apóstrofo): «1 5», «12 34», «1'5», «1.234.56» no valen.
 *  6. Los ceros finales de la parte decimal no cuentan («10.00» en un campo
 *     de enteros es 10). Más decimales de los permitidos → motivo 'decimales'.
 *  7. Enteros hasta Number.MAX_SAFE_INTEGER (9,007,199,254,740,991) sin
 *     perder precisión; más grandes → inválido. «-0» se lee como 0.
 *
 * Formato (formatearNumero): miles con coma y decimales con punto
 * («10,000», «1,200.50»), igual que formatearMoneda del POS y que el pipe
 * `number` de Angular sin LOCALE_ID.
 */

/* ===========================================================================
 * Tipos y límites
 * ======================================================================== */

export type MotivoNumero = 'formato' | 'decimales';

export interface LecturaNumero {
  /** null = campo vacío (o texto inválido). */
  valor: number | null;
  /** false = el texto no se puede leer como número para este campo. */
  valido: boolean;
  /** Por qué no es válido. */
  motivo?: MotivoNumero;
}

/** Espejo de CANTIDAD_MAXIMA_OPERACION del backend (stock por operación). */
export const CANTIDAD_MAXIMA = 100_000_000;
/** NUMERIC(10,2): precios, montos y pagos. */
export const MONTO_MAXIMO = 99_999_999.99;
/** NUMERIC(5,2): descuento por unidad. */
export const DESCUENTO_MAXIMO = 999.99;
/** NUMERIC(12,3): peso bruto de las guías (kg). */
export const PESO_MAXIMO = 999_999_999.999;
export const PORCENTAJE_MAXIMO = 100;
/** Más decimales no tienen sentido en un campo escrito a mano. */
const DECIMALES_TOPE = 6;

/** Clases de campo numérico (la directiva las usa como presets). */
export type TipoNumero = 'cantidad' | 'entero' | 'decimal' | 'moneda' | 'porcentaje' | 'peso';

export interface PresetNumero {
  /** Decimales permitidos. */
  decimales: number;
  /** Decimales que se muestran siempre al formatear (moneda: 2 → «10.00»). */
  minDecimales: number;
  min: number;
  max: number;
  /** Incremento con ↑/↓ (0 = sin flechas). */
  paso: number;
}

export const PRESETS_NUMERO: Readonly<Record<TipoNumero, Readonly<PresetNumero>>> = {
  cantidad: { decimales: 0, minDecimales: 0, min: 0, max: CANTIDAD_MAXIMA, paso: 1 },
  entero: { decimales: 0, minDecimales: 0, min: 0, max: Number.MAX_SAFE_INTEGER, paso: 1 },
  decimal: { decimales: 2, minDecimales: 0, min: 0, max: MONTO_MAXIMO, paso: 0 },
  moneda: { decimales: 2, minDecimales: 2, min: 0, max: MONTO_MAXIMO, paso: 0 },
  porcentaje: { decimales: 2, minDecimales: 0, min: 0, max: PORCENTAJE_MAXIMO, paso: 1 },
  peso: { decimales: 3, minDecimales: 0, min: 0, max: PESO_MAXIMO, paso: 0 },
};

export function esTipoNumero(valor: unknown): valor is TipoNumero {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(PRESETS_NUMERO, valor);
}

/* ===========================================================================
 * Lectura
 * ======================================================================== */

const vacio = (): LecturaNumero => ({ valor: null, valido: true });
const malFormato = (): LecturaNumero => ({ valor: null, valido: false, motivo: 'formato' });
const muchosDecimales = (): LecturaNumero => ({ valor: null, valido: false, motivo: 'decimales' });

/** Espacios que se usan como separador de miles (normal, duro, fino, de cifra). */
const ESPACIOS = /[    ]/g;
const SIGNOS_MENOS = /[−‒–]/g;
const PREFIJO_MONEDA = /^S\/\.?\s*/i;
const SOLO_CUERPO = /^[\d., '’]+$/;

function decimalesValidos(decimales: number): number {
  return Number.isFinite(decimales) ? Math.min(DECIMALES_TOPE, Math.max(0, Math.trunc(decimales))) : 0;
}

/** Quita «S/», «%» y el signo (en cualquier orden). null si hay dos signos. */
function separarSigno(texto: string): { negativo: boolean; cuerpo: string } | null {
  let t = texto.trim();
  if (t.endsWith('%')) t = t.slice(0, -1).trimEnd();
  let negativo = false;
  let signos = 0;
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const conMoneda = t.replace(PREFIJO_MONEDA, '');
    if (conMoneda !== t) {
      t = conMoneda.trimStart();
      continue;
    }
    const c = t.charAt(0);
    if (c === '-' || c === '+') {
      if (++signos > 1) return null;
      negativo = c === '-';
      t = t.slice(1).trimStart();
      continue;
    }
    break;
  }
  return { negativo, cuerpo: t };
}

/**
 * Lee lo que el usuario escribió (o un número) según las reglas de arriba.
 * `decimales` = cuántos admite el campo (0 = unidades).
 */
export function leerNumero(texto: string | number | null | undefined, decimales = 0): LecturaNumero {
  const d = decimalesValidos(decimales);

  if (typeof texto === 'number') return leerValorNumerico(texto, d);
  if (texto === null || texto === undefined) return vacio();

  const normal = String(texto).replace(ESPACIOS, ' ').replace(SIGNOS_MENOS, '-');
  if (!normal.trim()) return vacio();

  const partes = separarSigno(normal);
  if (!partes) return malFormato();
  let cuerpo = partes.cuerpo;
  // Solo el signo o la moneda, mientras se escribe.
  if (!cuerpo) return vacio();
  if (!SOLO_CUERPO.test(cuerpo)) return malFormato();

  // Separador final mientras se escribe ("10," o "12." o "1'") → aún no cuenta.
  cuerpo = cuerpo.replace(/[.,'’]$/, '');
  if (!cuerpo || /[^\d]$/.test(cuerpo)) return malFormato();
  // ",5" / ".5" → "0,5" / "0.5"
  if (/^[.,]\d/.test(cuerpo)) cuerpo = `0${cuerpo}`;
  if (!/^\d/.test(cuerpo)) return malFormato();

  // Cifras y separadores alternados: "1'234,567.89" → [1, 234, 567, 89] y [', ",", "."]
  const grupos = cuerpo.split(/[., '’]/);
  const separadores = cuerpo.match(/[., '’]/g) ?? [];
  if (grupos.some((g) => g === '')) return malFormato(); // dos separadores seguidos

  const indiceDecimal = buscarSeparadorDecimal(grupos, separadores, d);
  if (indiceDecimal === -2) return malFormato();

  const gruposEnteros = indiceDecimal >= 0 ? grupos.slice(0, indiceDecimal + 1) : grupos;
  const separadoresMiles = indiceDecimal >= 0 ? separadores.slice(0, indiceDecimal) : separadores;
  const fraccion = indiceDecimal >= 0 ? (grupos[indiceDecimal + 1] ?? '') : '';

  if (!sonMilesValidos(gruposEnteros, separadoresMiles)) return malFormato();

  const entero = gruposEnteros.join('').replace(/^0+(?=\d)/, '');
  const fraccionUtil = fraccion.replace(/0+$/, '');
  if (fraccionUtil.length > d) return muchosDecimales();

  const parteEntera = Number(entero);
  if (!Number.isSafeInteger(parteEntera)) return malFormato();

  const valor = fraccionUtil ? Number(`${entero}.${fraccionUtil}`) : parteEntera;
  if (!Number.isFinite(valor)) return malFormato();
  return { valor: partes.negativo && valor !== 0 ? -valor : valor, valido: true };
}

/**
 * Índice del separador decimal dentro de `separadores`:
 * -1 si no hay parte decimal, -2 si el texto es ambiguo/incorrecto.
 */
function buscarSeparadorDecimal(grupos: readonly string[], separadores: readonly string[], d: number): number {
  const puntos = separadores.filter((s) => s === '.').length;
  const comas = separadores.filter((s) => s === ',').length;
  const ultimo = separadores.length - 1;
  if (ultimo < 0) return -1;

  if (puntos && comas) {
    // El último de los dos es el decimal; debe ser único y el último separador.
    const sep = separadores[ultimo];
    if (sep !== '.' && sep !== ',') return -2;
    const veces = sep === '.' ? puntos : comas;
    return veces === 1 ? ultimo : -2;
  }

  if (!puntos && !comas) return -1; // solo espacios / apóstrofos: miles

  const sep: '.' | ',' = puntos ? '.' : ',';
  const veces = puntos || comas;
  if (veces > 1) return -1; // repetido → miles (los grupos se validan aparte)
  if (separadores[ultimo] !== sep) return -1; // no es el último → solo puede ser de miles

  const cifrasDespues = (grupos[ultimo + 1] ?? '').length;
  if (cifrasDespues !== 3) return ultimo;

  // Exactamente 3 cifras: de miles, salvo parte entera 0 o el punto de un campo de 3 decimales.
  const parteEntera = grupos.slice(0, ultimo + 1).join('');
  if (/^0+$/.test(parteEntera)) return ultimo;
  if (d >= 3 && sep === '.') return ultimo;
  return -1;
}

/** «1,234,567»: primer grupo de 1-3 cifras sin cero inicial y el resto de 3; un solo separador (más el apóstrofo). */
function sonMilesValidos(grupos: readonly string[], separadores: readonly string[]): boolean {
  if (!separadores.length) return grupos.length === 1;
  const tipos = new Set(separadores.filter((s) => s !== "'" && s !== '’'));
  if (tipos.size > 1) return false;
  const [primero, ...resto] = grupos;
  if (!primero || primero.length > 3 || (primero.length > 1 && primero.startsWith('0')) || primero === '0') return false;
  return resto.every((g) => g.length === 3);
}

/** Un número que ya viene como number (p. ej. del modelo): se comprueba y se limpia (0.1 + 0.2 → 0.3). */
function leerValorNumerico(valor: number, d: number): LecturaNumero {
  if (!Number.isFinite(valor)) return malFormato();
  if (Math.abs(valor) > Number.MAX_SAFE_INTEGER) return malFormato();
  const redondeado = redondear(valor, d);
  const tolerancia = Math.max(1e-9, Math.abs(valor) * Number.EPSILON * 4);
  if (Math.abs(redondeado - valor) > tolerancia) return muchosDecimales();
  return { valor: redondeado === 0 ? 0 : redondeado, valido: true };
}

/* ===========================================================================
 * Formato
 * ======================================================================== */

/**
 * Redondeo "de caja" a `decimales` (1.005 → 1.01), el mismo de redondear2 del
 * POS: Math.round((|v| + EPSILON) · 10^d) / 10^d, conservando el signo.
 */
export function redondear(valor: number, decimales = 2): number {
  if (!Number.isFinite(valor)) return valor;
  const d = decimalesValidos(decimales);
  const factor = 10 ** d;
  const r = Math.round((Math.abs(valor) + Number.EPSILON) * factor) / factor;
  return valor < 0 && r !== 0 ? -r : r;
}

/**
 * Formato del panel: miles con coma y decimales con punto ("10,000",
 * "1,200.50"). Sin miles (`conMiles = false`) sirve para editar dentro del
 * input. `minDecimales` < `decimales` recorta los ceros finales (peso:
 * 1.5 → "1.5", 1500 → "1,500"). Vacío si no es un número.
 */
export function formatearNumero(
  valor: number | null | undefined,
  decimales = 0,
  conMiles = true,
  minDecimales = decimales,
): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '';
  if (Math.abs(valor) >= 1e21) return String(valor);
  const d = decimalesValidos(decimales);
  const minimo = Math.min(d, decimalesValidos(minDecimales));
  const r = redondear(valor, d);
  const [entero = '0', fraccionCompleta = ''] = Math.abs(r).toFixed(d).split('.');
  let fraccion = fraccionCompleta.replace(/0+$/, '');
  if (fraccion.length < minimo) fraccion = fraccion.padEnd(minimo, '0');
  const enteroConMiles = conMiles ? entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : entero;
  const signo = r < 0 ? '-' : '';
  return `${signo}${enteroConMiles}${fraccion ? `.${fraccion}` : ''}`;
}

/* ===========================================================================
 * Validación con reglas de campo (la usa appNumero; sirve también en
 * formularios reactivos o para validar datos importados)
 * ======================================================================== */

export type ErrorNumero = MotivoNumero | 'minimo' | 'maximo';

export interface ReglasNumero {
  tipo?: TipoNumero;
  decimales?: number | null;
  min?: number | null;
  max?: number | null;
}

/** Reglas completas: las del tipo (preset) con lo que se haya indicado encima. */
export interface ReglasResueltas extends PresetNumero {
  tipo: TipoNumero;
}

export interface ResultadoNumero {
  /** Número limpio (null si está vacío o es inválido). */
  valor: number | null;
  /** El texto está vacío (o solo tiene el signo / "S/"). */
  vacio: boolean;
  valido: boolean;
  error: ErrorNumero | null;
  /** Mensaje en español para mostrar junto al campo ('' si es válido). */
  mensaje: string;
}

export function resolverReglas(reglas: ReglasNumero = {}): ReglasResueltas {
  const tipo: TipoNumero = esTipoNumero(reglas.tipo) ? reglas.tipo : 'cantidad';
  const base = PRESETS_NUMERO[tipo];
  const decimales =
    typeof reglas.decimales === 'number' && Number.isFinite(reglas.decimales)
      ? decimalesValidos(reglas.decimales)
      : base.decimales;
  const min = typeof reglas.min === 'number' && Number.isFinite(reglas.min) ? reglas.min : base.min;
  const max = typeof reglas.max === 'number' && Number.isFinite(reglas.max) ? reglas.max : base.max;
  return {
    tipo,
    decimales,
    minDecimales: tipo === 'moneda' ? decimales : Math.min(base.minDecimales, decimales),
    min,
    max,
    paso: base.paso,
  };
}

/** Número formateado para un mensaje: «S/ 1,250.50», «100%», «10,000». */
export function textoDeLimite(valor: number, reglas: ReglasResueltas): string {
  const texto = formatearNumero(valor, reglas.decimales, true, reglas.minDecimales);
  if (reglas.tipo === 'moneda') return `S/ ${texto}`;
  if (reglas.tipo === 'porcentaje') return `${texto}%`;
  return texto;
}

const EJEMPLOS: Readonly<Record<TipoNumero, string>> = {
  cantidad: '10,000',
  entero: '10,000',
  decimal: '1,250.5',
  moneda: '1,250.50',
  porcentaje: '18.5',
  peso: '1,250.5',
};

export function mensajeDeErrorNumero(error: ErrorNumero, reglas: ReglasResueltas): string {
  switch (error) {
    case 'decimales':
      return reglas.decimales === 0
        ? 'Solo números enteros (sin decimales)'
        : `Máximo ${reglas.decimales} ${reglas.decimales === 1 ? 'decimal' : 'decimales'}`;
    case 'minimo':
      return reglas.min === 0 ? 'No puede ser negativo' : `Mínimo ${textoDeLimite(reglas.min, reglas)}`;
    case 'maximo':
      return `Máximo ${textoDeLimite(reglas.max, reglas)}`;
    default:
      return `Escribe solo números. Ej.: ${reglas.decimales === 0 ? '10,000' : EJEMPLOS[reglas.tipo]}`;
  }
}

/**
 * Lee y valida contra las reglas del campo (decimales, mínimo y máximo).
 * El vacío se considera válido: qué hacer con él lo decide el campo.
 */
export function validarNumero(entrada: string | number | null | undefined, reglas: ReglasNumero = {}): ResultadoNumero {
  const r = resolverReglas(reglas);
  const lectura = leerNumero(entrada, r.decimales);
  if (!lectura.valido) {
    const error: ErrorNumero = lectura.motivo ?? 'formato';
    return { valor: null, vacio: false, valido: false, error, mensaje: mensajeDeErrorNumero(error, r) };
  }
  if (lectura.valor === null) return { valor: null, vacio: true, valido: true, error: null, mensaje: '' };
  const v = lectura.valor;
  if (v < r.min) return { valor: v, vacio: false, valido: false, error: 'minimo', mensaje: mensajeDeErrorNumero('minimo', r) };
  if (v > r.max) return { valor: v, vacio: false, valido: false, error: 'maximo', mensaje: mensajeDeErrorNumero('maximo', r) };
  return { valor: v, vacio: false, valido: true, error: null, mensaje: '' };
}
