import {
  CANTIDAD_MAXIMA,
  DESCUENTO_MAXIMO,
  MONTO_MAXIMO,
  PESO_MAXIMO,
  formatearNumero,
  leerNumero,
  mensajeDeErrorNumero,
  redondear,
  resolverReglas,
  validarNumero,
} from './numero.util';

type Esperado = number | null | 'formato' | 'decimales';

function lee(texto: string | number | null | undefined, decimales = 0): Esperado {
  const r = leerNumero(texto, decimales);
  return r.valido ? r.valor : (r.motivo ?? 'formato');
}

describe('numero.util · leerNumero', () => {
  describe('enteros con separadores de miles (unidades)', () => {
    it.each<[string, number]>([
      ['10000', 10000],
      ['10.000', 10000],
      ['10,000', 10000],
      ["1'000,000", 1000000],
      ['1’000,000', 1000000],
      ['1 000 000', 1000000],
      ['1 234', 1234],
      ['1 234 567', 1234567],
      ['1.234.567', 1234567],
      ['1,234,567', 1234567],
      ['100,000,000', 100000000],
      ['00012', 12],
      ['0', 0],
      ['  42  ', 42],
    ])('«%s» → %d', (texto, valor) => {
      expect(lee(texto)).toBe(valor);
    });
  });

  describe('decimales con coma o punto', () => {
    it.each<[string, number, number]>([
      ['1,200.50', 2, 1200.5],
      ['1.200,50', 2, 1200.5],
      ["1'234,567.89", 2, 1234567.89],
      ["1'000.000,50", 2, 1000000.5],
      ['12,5', 2, 12.5],
      ['12.5', 2, 12.5],
      ['12.345.678,9', 2, 12345678.9],
      ['1 234,56', 2, 1234.56],
      ['.5', 2, 0.5],
      [',5', 2, 0.5],
      ['0,500', 2, 0.5],
      ['0.500', 2, 0.5],
      ['3.1416', 4, 3.1416],
      ['1,0000', 2, 1],
    ])('«%s» con %d decimales → %d', (texto, decimales, valor) => {
      expect(lee(texto, decimales)).toBe(valor);
    });

    it('tres cifras tras un único separador son miles en montos («1,005» no es 1.005)', () => {
      expect(lee('1,005', 2)).toBe(1005);
      expect(lee('1.005', 2)).toBe(1005);
    });

    it('en campos de 3 decimales (peso) el punto es decimal y la coma, de miles', () => {
      expect(lee('1.500', 3)).toBe(1.5);
      expect(lee('1,500', 3)).toBe(1500);
      expect(lee('1.000.000', 3)).toBe(1000000);
      expect(lee('1,234.567', 3)).toBe(1234.567);
    });

    it('los ceros finales de la parte decimal no cuentan', () => {
      expect(lee('10.00', 0)).toBe(10);
      expect(lee('10,000.000', 0)).toBe(10000);
      expect(lee('7.50', 1)).toBe(7.5);
    });
  });

  describe('mientras se escribe', () => {
    it.each<[string, number, Esperado]>([
      ['10,', 0, 10],
      ['12.', 2, 12],
      ["1'", 0, 1],
      ['-', 0, null],
      ['S/', 2, null],
      ['S/ ', 2, null],
      ['', 0, null],
      ['   ', 0, null],
    ])('«%s» → %s', (texto, decimales, esperado) => {
      expect(lee(texto, decimales)).toBe(esperado);
    });
  });

  describe('signo, moneda y porcentaje', () => {
    it.each<[string, number, number]>([
      ['-S/ 10', 0, -10],
      ['S/ -10', 0, -10],
      ['−5', 0, -5],
      ['+5', 0, 5],
      ['S/ 1,200.50', 2, 1200.5],
      ['S/.1,200.50', 2, 1200.5],
      ['s/10', 2, 10],
      ['10%', 2, 10],
      ['18,5 %', 2, 18.5],
    ])('«%s» → %d', (texto, decimales, valor) => {
      expect(lee(texto, decimales)).toBe(valor);
    });

    it('«-0» se lee como 0 (sin cero negativo)', () => {
      const r = leerNumero('-0');
      expect(r.valido).toBe(true);
      expect(Object.is(r.valor, -0)).toBe(false);
      expect(r.valor).toBe(0);
    });
  });

  describe('inválidos', () => {
    it.each<[string, number, Esperado]>([
      ['1 5', 0, 'formato'],
      ['12 34', 0, 'formato'],
      ["1'5", 0, 'formato'],
      ['1.234.56', 0, 'formato'],
      ['1..5', 2, 'formato'],
      ['10,,', 0, 'formato'],
      ['abc', 0, 'formato'],
      ['1e5', 0, 'formato'],
      ['12a', 0, 'formato'],
      ['1,234 567', 0, 'formato'],
      ['01,000', 0, 'formato'],
      ['0 000', 0, 'formato'],
      ['--5', 0, 'formato'],
      ['-S/ -5', 0, 'formato'],
      ['1,2.5', 2, 'formato'],
      ['%10', 0, 'formato'],
      ['1,5', 0, 'decimales'],
      ['1.5', 0, 'decimales'],
      ['1,000.5', 0, 'decimales'],
      ['1.000,5', 0, 'decimales'],
      ['1,2345', 2, 'decimales'],
      ['1.2345', 3, 'decimales'],
    ])('«%s» (%d dec.) → %s', (texto, decimales, motivo) => {
      expect(lee(texto, decimales)).toBe(motivo);
    });
  });

  describe('enteros grandes sin perder precisión', () => {
    it('acepta hasta Number.MAX_SAFE_INTEGER', () => {
      expect(lee('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
      expect(lee('9,007,199,254,740,991')).toBe(Number.MAX_SAFE_INTEGER);
      expect(lee('9.007.199.254.740.991')).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('rechaza lo que ya no se puede representar exacto', () => {
      expect(lee('9007199254740992')).toBe('formato');
      expect(lee('99999999999999999999')).toBe('formato');
    });
  });

  describe('valores que ya son número', () => {
    it('se aceptan si respetan los decimales del campo y se limpian', () => {
      expect(lee(10000)).toBe(10000);
      expect(lee(0.1 + 0.2, 2)).toBe(0.3);
      expect(lee(1.5, 0)).toBe('decimales');
      expect(lee(Number.NaN)).toBe('formato');
      expect(lee(Number.POSITIVE_INFINITY)).toBe('formato');
      expect(lee(null)).toBeNull();
      expect(lee(undefined)).toBeNull();
    });
  });
});

describe('numero.util · formatearNumero', () => {
  it.each<[number, number, boolean, number | undefined, string]>([
    [10000, 0, true, undefined, '10,000'],
    [1200.5, 2, true, undefined, '1,200.50'],
    [1.005, 2, true, undefined, '1.01'],
    [1.5, 3, true, 0, '1.5'],
    [1500, 3, true, 0, '1,500'],
    [1500, 3, true, undefined, '1,500.000'],
    [-1234.5, 2, true, undefined, '-1,234.50'],
    [-0.001, 2, true, undefined, '0.00'],
    [Number.MAX_SAFE_INTEGER, 0, true, undefined, '9,007,199,254,740,991'],
    [1234567.891, 2, false, undefined, '1234567.89'],
    [0, 2, true, undefined, '0.00'],
    [99999999.99, 2, true, undefined, '99,999,999.99'],
    [18.5, 2, true, 0, '18.5'],
    [999, 0, true, undefined, '999'],
    [1000, 0, true, undefined, '1,000'],
  ])('%d (%d dec., miles=%s, mín=%s) → «%s»', (valor, decimales, miles, minimo, esperado) => {
    expect(formatearNumero(valor, decimales, miles, minimo)).toBe(esperado);
  });

  it('vacío para null, undefined y NaN; notación de JS para ≥ 1e21', () => {
    expect(formatearNumero(null)).toBe('');
    expect(formatearNumero(undefined)).toBe('');
    expect(formatearNumero(Number.NaN)).toBe('');
    expect(formatearNumero(1e21)).toBe('1e+21');
  });

  it('ida y vuelta: lo que se formatea se vuelve a leer igual', () => {
    for (const decimales of [0, 2, 3]) {
      for (const base of [0, 1, 12, 999, 1000, 10000, 123456.78, 1500.5, 99999999.99, 0.5, 0.25, 7.125]) {
        const valor = Number(base.toFixed(decimales));
        expect(leerNumero(formatearNumero(valor, decimales, true, 0), decimales).valor).toBe(valor);
        expect(leerNumero(formatearNumero(valor, decimales, false, 0), decimales).valor).toBe(valor);
        expect(leerNumero(formatearNumero(valor, decimales), decimales).valor).toBe(valor);
      }
    }
  });

  it('redondear() usa el mismo redondeo de caja que el POS', () => {
    expect(redondear(1.005, 2)).toBe(1.01);
    expect(redondear(-1.005, 2)).toBe(-1.01);
    expect(redondear(2.675, 2)).toBe(2.68);
    expect(redondear(10, 0)).toBe(10);
  });
});

describe('numero.util · validarNumero y mensajes', () => {
  it('límites por defecto de cada tipo', () => {
    expect(resolverReglas({ tipo: 'cantidad' }).max).toBe(CANTIDAD_MAXIMA);
    expect(resolverReglas({ tipo: 'entero' }).max).toBe(Number.MAX_SAFE_INTEGER);
    expect(resolverReglas({ tipo: 'moneda' }).max).toBe(MONTO_MAXIMO);
    expect(resolverReglas({ tipo: 'peso' }).max).toBe(PESO_MAXIMO);
    expect(resolverReglas({ tipo: 'porcentaje' }).max).toBe(100);
    expect(resolverReglas({ tipo: 'moneda', max: DESCUENTO_MAXIMO }).max).toBe(DESCUENTO_MAXIMO);
    expect(resolverReglas({}).tipo).toBe('cantidad');
  });

  it('acepta un valor en rango y lo devuelve limpio', () => {
    expect(validarNumero('10.000', { tipo: 'cantidad' })).toEqual({
      valor: 10000,
      vacio: false,
      valido: true,
      error: null,
      mensaje: '',
    });
  });

  it('el vacío es válido (lo resuelve el campo)', () => {
    const r = validarNumero('  ', { tipo: 'moneda' });
    expect(r.vacio).toBe(true);
    expect(r.valido).toBe(true);
    expect(r.valor).toBeNull();
  });

  it.each<[string, Parameters<typeof validarNumero>[1], string]>([
    ['1,5', { tipo: 'cantidad' }, 'Solo números enteros (sin decimales)'],
    ['1.2345', { tipo: 'moneda' }, 'Máximo 2 decimales'],
    ['1.25', { tipo: 'decimal', decimales: 1 }, 'Máximo 1 decimal'],
    ['abc', { tipo: 'cantidad' }, 'Escribe solo números. Ej.: 10,000'],
    ['x', { tipo: 'moneda' }, 'Escribe solo números. Ej.: 1,250.50'],
    ['0', { tipo: 'cantidad', min: 1 }, 'Mínimo 1'],
    ['-1', { tipo: 'cantidad' }, 'No puede ser negativo'],
    ['100,000,001', { tipo: 'cantidad' }, 'Máximo 100,000,000'],
    ['200', { tipo: 'porcentaje' }, 'Máximo 100%'],
    ['0', { tipo: 'moneda', min: 0.01 }, 'Mínimo S/ 0.01'],
    ['1,000', { tipo: 'moneda', max: DESCUENTO_MAXIMO }, 'Máximo S/ 999.99'],
  ])('«%s» %o → «%s»', (texto, reglas, mensaje) => {
    const r = validarNumero(texto, reglas);
    expect(r.valido).toBe(false);
    expect(r.mensaje).toBe(mensaje);
  });

  it('mensajeDeErrorNumero formatea el límite según el tipo', () => {
    expect(mensajeDeErrorNumero('maximo', resolverReglas({ tipo: 'peso' }))).toBe('Máximo 999,999,999.999');
    expect(mensajeDeErrorNumero('minimo', resolverReglas({ tipo: 'cantidad', min: 10 }))).toBe('Mínimo 10');
  });
});
