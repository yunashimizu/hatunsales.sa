import { codificarEan13, esEan13Valido, svgEan13 } from './ean13.util';

const VALIDOS = ['4006381333931', '7501234567893', '5901234123457', '2000000000015'];

describe('esEan13Valido', () => {
  it.each(VALIDOS)('%s es válido', (codigo) => {
    expect(esEan13Valido(codigo)).toBe(true);
  });

  it('con el verificador cambiado, otro largo o no numérico es inválido', () => {
    expect(esEan13Valido('4006381333932')).toBe(false);
    expect(esEan13Valido('7501234567890')).toBe(false);
    expect(esEan13Valido('400638133393')).toBe(false);
    expect(esEan13Valido('40063813339a1')).toBe(false);
    expect(esEan13Valido('')).toBe(false);
    expect(esEan13Valido(null)).toBe(false);
  });
});

describe('codificarEan13', () => {
  it.each(VALIDOS)('%s: 95 módulos, empieza y termina en 101 y el centro es 01010', (codigo) => {
    const m = codificarEan13(codigo)!;
    expect(m).toHaveLength(95);
    expect(m).toMatch(/^[01]+$/);
    expect(m.startsWith('101')).toBe(true);
    expect(m.endsWith('101')).toBe(true);
    expect(m.slice(45, 50)).toBe('01010');
  });

  it('4006381333931: el primer dígito pide LGLLGG y el 0 va en tabla L (0001101)', () => {
    const m = codificarEan13('4006381333931')!;
    // Tras la guarda: 0 (L) 0001101, 0 (G) 0100111, 6 (L) 0101111, 3 (L) 0111101, 8 (G) 0001001, 1 (G) 0110011.
    expect(m.slice(3, 45)).toBe(['0001101', '0100111', '0101111', '0111101', '0001001', '0110011'].join(''));
    // Lado derecho (R): 3 3 3 9 3 1
    expect(m.slice(50, 92)).toBe(['1000010', '1000010', '1000010', '1110100', '1000010', '1100110'].join(''));
  });

  it('con primer dígito 0 todo el lado izquierdo usa tabla L', () => {
    const m = codificarEan13('0012345678905')!;
    expect(esEan13Valido('0012345678905')).toBe(true);
    expect(m.slice(3, 10)).toBe('0001101'); // 0 en L
    expect(m.slice(10, 17)).toBe('0011001'); // 1 en L
  });

  it('un código inválido devuelve null', () => {
    expect(codificarEan13('4006381333930')).toBeNull();
    expect(codificarEan13('ABC')).toBeNull();
    expect(codificarEan13(undefined)).toBeNull();
  });
});

describe('svgEan13', () => {
  it('devuelve un <svg> con rects y el código escrito abajo', () => {
    const svg = svgEan13('4006381333931')!;
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('<rect');
    expect(svg).toContain('>4<');
    expect(svg).toContain('>006381<');
    expect(svg).toContain('>333931<');
    expect(svg).toContain('4006381333931');
  });

  it('las barras cubren exactamente los módulos en 1 (suma de anchos)', () => {
    const codigo = '4006381333931';
    const svg = svgEan13(codigo, { anchoModulo: 1, mostrarTexto: false })!;
    const anchos = [...svg.matchAll(/<rect x="(\d+)" y="0" width="(\d+)" height="\d+"\/>/g)];
    const unos = [...codificarEan13(codigo)!].filter((c) => c === '1').length;
    expect(anchos.reduce((suma, r) => suma + Number(r[2]), 0)).toBe(unos);
    expect(svg).not.toContain('<text');
  });

  it('un código inválido devuelve null', () => {
    expect(svgEan13('4006381333930')).toBeNull();
    expect(svgEan13('')).toBeNull();
  });
});
