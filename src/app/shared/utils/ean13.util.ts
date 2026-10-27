/**
 * Codificador EAN-13 propio (sin librerías): 95 módulos, guardas y SVG. Solo para códigos EAN-13
 * válidos (13 dígitos con verificador correcto). Pensado para las etiquetas de los códigos internos.
 */

/** Tabla L (paridad impar) de los dígitos 0..9: 7 módulos cada uno, 1 = barra. */
const TABLA_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
/** Tabla R (lado derecho): el complemento de L. */
const TABLA_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
/** Tabla G (paridad par): la tabla R leída al revés. */
const TABLA_G = TABLA_R.map((r) => [...r].reverse().join(''));

/** Paridad de los 6 dígitos de la izquierda según el primer dígito del código (L o G). */
const PARIDAD_PRIMER_DIGITO = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

const GUARDA = '101';
const CENTRO = '01010';

/** Espacio en blanco obligatorio a los lados (en módulos): 11 a la izquierda, 7 a la derecha. */
const MARGEN_IZQUIERDO = 11;
const MARGEN_DERECHO = 7;

export interface OpcionesSvgEan13 {
  /** Ancho de un módulo en píxeles del SVG (defecto 2). */
  anchoModulo?: number;
  /** Alto de las barras en píxeles (defecto 60). */
  altoBarras?: number;
  /** Dibujar los 13 dígitos debajo de las barras (defecto true). */
  mostrarTexto?: boolean;
}

/** Dígito verificador EAN-13 de los 12 primeros dígitos. */
function verificador(doce: string): number {
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (suma % 10)) % 10;
}

/** `true` si son 13 dígitos y el último es el verificador correcto. */
export function esEan13Valido(codigo: string | null | undefined): boolean {
  const valor = String(codigo ?? '');
  return /^\d{13}$/.test(valor) && verificador(valor.slice(0, 12)) === Number(valor[12]);
}

/**
 * Cadena de 95 módulos «0»/«1» (1 = barra): guarda `101`, 6 dígitos (L/G según el primer dígito),
 * centro `01010`, 6 dígitos (R) y guarda `101`. Devuelve `null` si el código no es un EAN-13 válido.
 */
export function codificarEan13(codigo: string | null | undefined): string | null {
  if (!esEan13Valido(codigo)) return null;
  const digitos = String(codigo);
  const paridad = PARIDAD_PRIMER_DIGITO[Number(digitos[0])];
  let modulos = GUARDA;
  for (let i = 0; i < 6; i++) {
    const digito = Number(digitos[i + 1]);
    modulos += paridad[i] === 'L' ? TABLA_L[digito] : TABLA_G[digito];
  }
  modulos += CENTRO;
  for (let i = 7; i < 13; i++) modulos += TABLA_R[Number(digitos[i])];
  return modulos + GUARDA;
}

/**
 * El EAN-13 como `<svg>` (cadena): barras como `<rect>` (las seguidas se unen), guardas más largas y
 * los dígitos debajo. Devuelve `null` si el código no es válido. El contenido son solo números y
 * atributos numéricos, nunca texto del usuario, así que es seguro inyectarlo como HTML.
 * Las medidas del `viewBox` están en píxeles (módulo = `anchoModulo`); con CSS el SVG se escala.
 */
export function svgEan13(codigo: string | null | undefined, opciones: OpcionesSvgEan13 = {}): string | null {
  const modulos = codificarEan13(codigo);
  if (!modulos) return null;
  const digitos = String(codigo);
  const m = opciones.anchoModulo && opciones.anchoModulo > 0 ? opciones.anchoModulo : 2;
  const altoBarras = opciones.altoBarras && opciones.altoBarras > 0 ? opciones.altoBarras : 60;
  const mostrarTexto = opciones.mostrarTexto !== false;

  const ancho = (MARGEN_IZQUIERDO + 95 + MARGEN_DERECHO) * m;
  const altoTexto = mostrarTexto ? 14 : 0;
  const alto = altoBarras + altoTexto;
  // Las guardas (laterales y central) bajan un poco más que las barras de datos.
  const extraGuarda = mostrarTexto ? 6 : 0;
  const esGuarda = (modulo: number) => modulo < 3 || (modulo >= 45 && modulo < 50) || modulo >= 92;

  const rects: string[] = [];
  let i = 0;
  while (i < 95) {
    if (modulos[i] !== '1') { i++; continue; }
    const inicio = i;
    const guarda = esGuarda(i);
    while (i < 95 && modulos[i] === '1' && esGuarda(i) === guarda) i++;
    const x = (MARGEN_IZQUIERDO + inicio) * m;
    const altura = guarda ? altoBarras + extraGuarda : altoBarras;
    rects.push(`<rect x="${x}" y="0" width="${(i - inicio) * m}" height="${altura}"/>`);
  }

  let texto = '';
  if (mostrarTexto) {
    const y = altoBarras + 11;
    const estilo = `font-family="monospace" font-size="${5.5 * m}" fill="#000" text-anchor="middle"`;
    // Primer dígito en el margen izquierdo; los 6 de cada mitad centrados bajo sus 42 módulos.
    texto += `<text x="${(MARGEN_IZQUIERDO / 2) * m}" y="${y}" ${estilo}>${digitos[0]}</text>`;
    texto += `<text x="${(MARGEN_IZQUIERDO + 3 + 21) * m}" y="${y}" ${estilo} textLength="${36 * m}" lengthAdjust="spacing">${digitos.slice(1, 7)}</text>`;
    texto += `<text x="${(MARGEN_IZQUIERDO + 50 + 21) * m}" y="${y}" ${estilo} textLength="${36 * m}" lengthAdjust="spacing">${digitos.slice(7, 13)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" `
    + `role="img" aria-label="Código de barras EAN-13 ${digitos}" shape-rendering="crispEdges">`
    + `<rect x="0" y="0" width="${ancho}" height="${alto}" fill="#fff"/>`
    + `<g fill="#000">${rects.join('')}</g>${texto}</svg>`;
}
