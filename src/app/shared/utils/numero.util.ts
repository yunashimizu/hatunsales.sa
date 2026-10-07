/**
 * Lectura y formato de los números que se escriben a mano en el panel.
 *
 * <input type="number"> toma la coma o el punto de "10,000" / "10.000" como
 * separador DECIMAL: se escribía diez mil y se guardaba 10. Estas funciones
 * entienden los separadores de miles que se usan en Perú ("10,000", "10.000",
 * "10 000", "1'000,000") y solo aceptan decimales donde el campo los admite.
 *
 * Reglas:
 *  - Campos de unidades (decimales = 0): punto y coma son SIEMPRE miles y
 *    deben formar grupos de 3 cifras ("1,5" no es válido).
 *  - Montos (decimales = 1 o 2): si aparecen punto y coma, el último es el
 *    decimal ("1,200.50" o "1.200,50"). Con uno solo: seguido de 3 cifras
 *    es de miles ("1,200" = 1200); de 1 o 2 cifras, decimal ("12,5" = 12.5).
 *
 * Funciones puras (sin Angular) para poder probarlas con node.
 */

export interface LecturaNumero {
  /** null = campo vacío. */
  valor: number | null;
  /** false = el texto no se puede leer como número para este campo. */
  valido: boolean;
}

const INVALIDO: LecturaNumero = { valor: null, valido: false };

/** Espacios (también los finos y duros) usados como separador de miles. */
const ESPACIOS = /[\s  ]/g;
const APOSTROFOS = /['’]/g;

/**
 * El apóstrofo de millones ("1'000,000") pasa a ser el mismo separador de
 * miles que usa el resto del número, para que los grupos se validen igual.
 */
function normalizarApostrofos(texto: string): string {
  if (!/['’]/.test(texto)) return texto;
  const ultimoPunto = texto.lastIndexOf('.');
  const ultimaComa = texto.lastIndexOf(',');
  let separadorMiles = ',';
  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    separadorMiles = ultimoPunto > ultimaComa ? ',' : '.';
  } else if (ultimoPunto >= 0 && /\.\d{3}$/.test(texto)) {
    separadorMiles = '.';
  }
  return texto.replace(APOSTROFOS, separadorMiles);
}

/** "1,000,000" / "1.000.000": primer grupo de 1 a 3 cifras (sin cero inicial) y el resto de 3. */
function sonGruposDeMiles(texto: string, separador: '.' | ','): boolean {
  const patron = separador === '.' ? /^[1-9]\d{0,2}(\.\d{3})+$/ : /^[1-9]\d{0,2}(,\d{3})+$/;
  return patron.test(texto);
}

export function leerNumero(texto: string | null | undefined, decimales = 0): LecturaNumero {
  let limpio = normalizarApostrofos(
    String(texto ?? '')
      .replace(ESPACIOS, '')
      .replace(/^S\/\.?/i, ''),
  );
  if (!limpio) return { valor: null, valido: true };

  let signo = 1;
  if (limpio.startsWith('-')) {
    signo = -1;
    limpio = limpio.slice(1);
  } else if (limpio.startsWith('+')) {
    limpio = limpio.slice(1);
  }
  // Solo el signo, mientras se escribe.
  if (!limpio) return { valor: null, valido: true };

  if (!/^[\d.,]+$/.test(limpio)) return INVALIDO;

  // Separador al final mientras se escribe ("10," o "12.") → aún no cuenta.
  limpio = limpio.replace(/[.,]$/, '');
  if (!limpio || /[.,]{2}/.test(limpio)) return INVALIDO;

  const puntos = (limpio.match(/\./g) ?? []).length;
  const comas = (limpio.match(/,/g) ?? []).length;

  let entero = limpio;
  let fraccion = '';

  if (puntos && comas) {
    // Con ambos, el último es el decimal y el otro agrupa miles.
    const ultimo = Math.max(limpio.lastIndexOf('.'), limpio.lastIndexOf(','));
    const separadorDecimal = limpio[ultimo] as '.' | ',';
    const separadorMiles = separadorDecimal === '.' ? ',' : '.';
    entero = limpio.slice(0, ultimo);
    fraccion = limpio.slice(ultimo + 1);
    if (entero.includes(separadorDecimal) || !sonGruposDeMiles(entero, separadorMiles)) return INVALIDO;
    entero = entero.split(separadorMiles).join('');
  } else if (puntos || comas) {
    const separador: '.' | ',' = puntos ? '.' : ',';
    const partes = limpio.split(separador);

    if (partes.length > 2) {
      // El mismo separador varias veces solo puede ser de miles.
      if (!sonGruposDeMiles(limpio, separador)) return INVALIDO;
      entero = partes.join('');
    } else {
      const [izquierda, derecha] = partes;
      if (derecha.length === 3 && decimales < 3) {
        // "10,000" / "1.500": tres cifras tras un único separador = miles.
        if (!sonGruposDeMiles(limpio, separador)) return INVALIDO;
        entero = izquierda + derecha;
      } else {
        entero = izquierda;
        fraccion = derecha;
      }
    }
  }

  if (fraccion.length > decimales) return INVALIDO;

  const valor = Number(`${entero || '0'}${fraccion ? `.${fraccion}` : ''}`);
  if (!Number.isFinite(valor) || valor > Number.MAX_SAFE_INTEGER) return INVALIDO;

  return { valor: valor === 0 ? 0 : signo * valor, valido: true };
}

/**
 * Formato del panel: miles con coma y decimales con punto ("10,000",
 * "1,200.50"), igual que `formatearMoneda` del punto de venta.
 * Sin miles (`conMiles = false`) sirve para editar el número dentro del input.
 */
export function formatearNumero(
  valor: number | null | undefined,
  decimales = 0,
  conMiles = true,
): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '';
  const fijo = Math.abs(valor).toFixed(decimales);
  const [entero, fraccion] = fijo.split('.');
  const enteroConMiles = conMiles ? entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : entero;
  const signo = valor < 0 && Number(fijo) !== 0 ? '-' : '';
  return `${signo}${enteroConMiles}${fraccion ? `.${fraccion}` : ''}`;
}
