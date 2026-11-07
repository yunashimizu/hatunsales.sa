import {
  DENOMINACIONES_SOL,
  MAX_CANTIDAD_DENOMINACION,
  cantidadEfectiva,
  cantidadValida,
  hayConteo,
  lineasConteoVacias,
  subtotalCentimos,
  totalConteoSoles,
} from './conteo-denominaciones';

describe('conteo-denominaciones', () => {
  it('ofrece exactamente las denominaciones del sol, de mayor a menor', () => {
    expect(DENOMINACIONES_SOL.filter((d) => d.tipo === 'billete').map((d) => d.centimos / 100)).toEqual([
      200, 100, 50, 20, 10,
    ]);
    expect(DENOMINACIONES_SOL.filter((d) => d.tipo === 'moneda').map((d) => d.centimos / 100)).toEqual([
      5, 2, 1, 0.5, 0.2, 0.1,
    ]);
    expect(DENOMINACIONES_SOL.map((d) => d.etiqueta)).toEqual([
      'S/ 200', 'S/ 100', 'S/ 50', 'S/ 20', 'S/ 10', 'S/ 5', 'S/ 2', 'S/ 1', 'S/ 0.50', 'S/ 0.20', 'S/ 0.10',
    ]);
  });

  it('empieza vacío y el total es 0', () => {
    const lineas = lineasConteoVacias();
    expect(lineas).toHaveLength(11);
    expect(totalConteoSoles(lineas)).toBe(0);
    expect(hayConteo(lineas)).toBe(false);
  });

  it('suma en céntimos sin errores de coma flotante', () => {
    const lineas = lineasConteoVacias();
    const poEtiqueta = (e: string) => lineas.find((l) => l.etiqueta === e)!;
    poEtiqueta('S/ 0.10').cantidad = 3;
    poEtiqueta('S/ 0.20').cantidad = 1;
    expect(totalConteoSoles(lineas)).toBe(0.5);
    poEtiqueta('S/ 200').cantidad = 2;
    poEtiqueta('S/ 5').cantidad = 7;
    poEtiqueta('S/ 0.50').cantidad = 1;
    expect(subtotalCentimos(poEtiqueta('S/ 200'))).toBe(40_000);
    expect(totalConteoSoles(lineas)).toBe(436);
    expect(hayConteo(lineas)).toBe(true);
  });

  it('acepta vacío y enteros de 0 al tope; rechaza decimales, negativos y excesos', () => {
    for (const ok of [null, undefined, '', 0, 1, MAX_CANTIDAD_DENOMINACION]) expect(cantidadValida(ok)).toBe(true);
    for (const mal of [1.5, -1, MAX_CANTIDAD_DENOMINACION + 1, NaN, Infinity, '7']) {
      expect(cantidadValida(mal)).toBe(false);
    }
  });

  it('una cantidad inválida o vacía no suma nada', () => {
    expect(cantidadEfectiva(null)).toBe(0);
    expect(cantidadEfectiva(2.5)).toBe(0);
    expect(cantidadEfectiva(-3)).toBe(0);
    expect(cantidadEfectiva(4)).toBe(4);
    expect(totalConteoSoles([{ centimos: 10_000, cantidad: 1.5 }, { centimos: 500, cantidad: 2 }])).toBe(10);
  });
});
