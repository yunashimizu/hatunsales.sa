import { LARGO_MAXIMO_CODIGO, extraerMultiplicador, normalizarCodigo, pareceCodigoExacto } from './codigo-barras.util';

describe('codigo-barras.util', () => {
  describe('normalizarCodigo', () => {
    it('quita \\r \\n \\t y recorta los bordes', () => {
      expect(normalizarCodigo('  7501234567890\r\n')).toBe('7501234567890');
      expect(normalizarCodigo('\tAB-12\t')).toBe('AB-12');
    });

    it('quita los caracteres de control también dentro del texto', () => {
      expect(normalizarCodigo('75012\r34567890')).toBe('7501234567890');
    });

    it('conserva los espacios internos y los símbolos', () => {
      expect(normalizarCodigo(' cemento sol ')).toBe('cemento sol');
      expect(normalizarCodigo('AB/12?%3#+')).toBe('AB/12?%3#+');
    });

    it('quita el par *...* de Code 39 solo si están ambos', () => {
      expect(normalizarCodigo('*ABC-123*')).toBe('ABC-123');
      expect(normalizarCodigo('*ABC-123')).toBe('*ABC-123');
      expect(normalizarCodigo('ABC-123*')).toBe('ABC-123*');
      expect(normalizarCodigo('**')).toBe('**');
    });

    it('limita a 100 caracteres', () => {
      expect(normalizarCodigo('9'.repeat(150))).toHaveLength(LARGO_MAXIMO_CODIGO);
    });

    it('tolera null, undefined y vacío', () => {
      expect(normalizarCodigo(null)).toBe('');
      expect(normalizarCodigo(undefined)).toBe('');
      expect(normalizarCodigo('   ')).toBe('');
    });
  });

  describe('pareceCodigoExacto', () => {
    const casos: [string, string, boolean][] = [
      ['EAN-13', '7501234567890', true],
      ['EAN-8', '12345670', true],
      ['UPC-A', '036000291452', true],
      ['solo dígitos, mínimo 3', '123', true],
      ['solo dígitos, menos de 3', '12', false],
      ['Code 39 con guion', 'ABC-123', true],
      ['Code 39 con punto y dos puntos', 'A.1:B', true],
      ['Code 128 con barra', 'AB/12', true],
      ['Code 128 con + % $', 'A+1%2$3', true],
      ['SKU CEM-01', 'CEM-01', true],
      ['SKU con guion bajo', 'tubo_pvc_2', true],
      ['con salto de línea del lector', '7501234567890\r\n', true],
      ['nombre «acero»', 'acero', false],
      ['nombre con espacio «cemento sol»', 'cemento sol', false],
      ['código con espacio interno', 'AB 12', false],
      ['solo letras', 'ABC', false],
      ['solo símbolos', '-/', false],
      ['vacío', '', false],
      ['solo espacios', '   ', false],
      ['medida de madera «2x4»', '2x4', false],
      ['medida «4X8X3»', '4X8X3', false],
      ['Code 39 con start/stop', '*ABC-123*', true],
      ['asterisco (reservado al multiplicador)', '5*123456', false],
      ['carácter fuera del conjunto', 'AB#12', false],
      ['acentos', 'cañería1', false],
    ];

    it.each(casos)('%s: «%s» → %s', (_nombre, texto, esperado) => {
      expect(pareceCodigoExacto(texto)).toBe(esperado);
    });

    it('tolera null y undefined', () => {
      expect(pareceCodigoExacto(null)).toBe(false);
      expect(pareceCodigoExacto(undefined)).toBe(false);
    });
  });

  describe('extraerMultiplicador', () => {
    const casos: [string, string, number, string][] = [
      ['cantidad y EAN-13', '5*7501234567890', 5, '7501234567890'],
      ['cantidad mínima 1', '1*123', 1, '123'],
      ['cantidad máxima 999', '999*CEM-01', 999, 'CEM-01'],
      ['medida con x no multiplica', '2x4', 1, '2x4'],
      ['cantidad 0 no multiplica', '0*123', 1, '0*123'],
      ['cantidad 1000 no multiplica', '1000*123', 1, '1000*123'],
      ['sin cantidad', '*123', 1, '*123'],
      ['sin código', '5*', 1, '5*'],
      ['resto que es un nombre', '5*acero', 1, '5*acero'],
      ['sin asterisco', '7501234567890', 1, '7501234567890'],
      ['vacío', '', 1, ''],
    ];

    it.each(casos)('%s: «%s» → %i × «%s»', (_nombre, texto, cantidad, codigo) => {
      expect(extraerMultiplicador(texto)).toEqual({ cantidad, codigo });
    });

    it('tolera null y undefined', () => {
      expect(extraerMultiplicador(null)).toEqual({ cantidad: 1, codigo: '' });
      expect(extraerMultiplicador(undefined)).toEqual({ cantidad: 1, codigo: '' });
    });
  });
});
