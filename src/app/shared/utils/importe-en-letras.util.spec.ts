import { enteroALetras, montoEnLetras } from './importe-en-letras.util';

describe('importe en letras (proformas)', () => {
  it.each([
    [50, 'CINCUENTA Y 00/100 SOLES'],
    [144, 'CIENTO CUARENTA Y CUATRO Y 00/100 SOLES'],
    [118.5, 'CIENTO DIECIOCHO Y 50/100 SOLES'],
    [0, 'CERO Y 00/100 SOLES'],
    [1000, 'MIL Y 00/100 SOLES'],
    [21000, 'VEINTIUN MIL Y 00/100 SOLES'],
    [100, 'CIEN Y 00/100 SOLES'],
    [1000000, 'UN MILLON Y 00/100 SOLES'],
  ])('%s → %s', (monto, esperado) => {
    expect(montoEnLetras(monto)).toBe(esperado);
  });

  it('redondea los céntimos sin errores de coma flotante', () => {
    expect(montoEnLetras(0.1 + 0.2)).toBe('CERO Y 30/100 SOLES');
  });

  it('enteroALetras usa apócope delante de MIL y MILLONES', () => {
    expect(enteroALetras(31000000)).toBe('TREINTA Y UN MILLONES');
    expect(enteroALetras(201000)).toBe('DOSCIENTOS UN MIL');
  });
});
