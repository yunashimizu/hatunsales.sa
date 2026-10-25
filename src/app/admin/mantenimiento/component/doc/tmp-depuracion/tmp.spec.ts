import * as modulo from '../documentos-sunat';

describe('tmp1', () => {
  it('guarda', () => {
    (globalThis as any).__f1Modulo = modulo;
    console.log('DEPURACION-1', String(modulo.NOMBRE_ARCHIVO?.zip));
    expect(true).toBe(true);
  });
});
