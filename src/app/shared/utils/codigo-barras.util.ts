/**
 * Reglas puras del lector de código de barras (USB tipo teclado). Las comparten el POS y las
 * cotizaciones; el backend aplica la misma limpieza en `VentaBussnies.buscarPorCodigoBarras`.
 */

/** Largo máximo del código que acepta el servidor. */
export const LARGO_MAXIMO_CODIGO = 100;

// eslint-disable-next-line no-control-regex
const CARACTERES_DE_CONTROL = /[\u0000-\u001f\u007f]/g;

/** Símbolos que Code 39 / Code 128 permiten además de letras y dígitos. */
const FORMATO_CODIGO = /^[A-Za-z0-9\-_./+%$:]+$/;

/** Medidas de madera / planchas («2x4», «4X8X3»): se escriben a mano, no son códigos. */
const FORMATO_MEDIDA = /^\d+x\d+(x\d+)?$/i;

/**
 * Quita caracteres de control (\r \n \t...), recorta espacios, quita el par `*...*` de inicio/fin
 * (start/stop de Code 39, solo si están ambos) y limita a 100 caracteres.
 */
export function normalizarCodigo(texto: string | null | undefined): string {
  let t = String(texto ?? '')
    .replace(CARACTERES_DE_CONTROL, '')
    .trim();
  if (t.length > 2 && t.startsWith('*') && t.endsWith('*')) t = t.slice(1, -1).trim();
  return t.slice(0, LARGO_MAXIMO_CODIGO);
}

/**
 * ¿El texto parece un código de barras / SKU (búsqueda exacta) y no un nombre?
 * Sin espacios; solo `A-Z a-z 0-9 - _ . / + % $ :`; si es solo dígitos, mínimo 3; si mezcla letras
 * o símbolos, debe traer al menos un dígito (así «acero» o «-/» no cuentan como código).
 */
export function pareceCodigoExacto(texto: string | null | undefined): boolean {
  const t = normalizarCodigo(texto);
  if (!t || /\s/.test(t)) return false;
  if (!FORMATO_CODIGO.test(t)) return false;
  if (FORMATO_MEDIDA.test(t)) return false;
  if (/^\d+$/.test(t)) return t.length >= 3;
  return /\d/.test(t);
}

/**
 * Multiplicador del cajero: `5*7501234567890` agrega 5 unidades de ese código. Solo con `*`
 * (nunca `x`: «2x4» es una medida), cantidad entera 1..999 y el resto debe parecer un código.
 * En cualquier otro caso devuelve cantidad 1 y el texto tal cual.
 */
export function extraerMultiplicador(texto: string | null | undefined): { cantidad: number; codigo: string } {
  const original = String(texto ?? '');
  const m = /^(\d{1,3})\*(.+)$/.exec(original);
  if (m) {
    const cantidad = Number(m[1]);
    const resto = m[2];
    if (cantidad >= 1 && cantidad <= 999 && pareceCodigoExacto(resto)) {
      return { cantidad, codigo: normalizarCodigo(resto) };
    }
  }
  return { cantidad: 1, codigo: original };
}
