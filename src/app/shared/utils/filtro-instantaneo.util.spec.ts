import { BusquedaPendiente, filtrarInstantaneo } from './filtro-instantaneo.util';

describe('filtrarInstantaneo', () => {
  const filas = [
    { producto: 'Martillo de acero', sku: 'MAR-01', barras: '7750001' },
    { producto: 'Taladro percutor', sku: 'TAL-22', barras: null },
    { producto: 'Cinta métrica', sku: 'CIN-05', barras: '7750005' },
  ];
  const campos = (f: (typeof filas)[number]) => [f.producto, f.sku, f.barras];

  it('sin texto devuelve la misma lista (sin copiarla)', () => {
    expect(filtrarInstantaneo(filas, '', campos)).toBe(filas);
    expect(filtrarInstantaneo(filas, '   ', campos)).toBe(filas);
    expect(filtrarInstantaneo(filas, null, campos)).toBe(filas);
  });

  it('busca por subcadena sin distinguir mayúsculas en cualquiera de los campos', () => {
    expect(filtrarInstantaneo(filas, 'MARTI', campos).map((f) => f.sku)).toEqual(['MAR-01']);
    expect(filtrarInstantaneo(filas, 'tal-', campos).map((f) => f.sku)).toEqual(['TAL-22']);
    expect(filtrarInstantaneo(filas, '775000', campos).map((f) => f.sku)).toEqual(['MAR-01', 'CIN-05']);
  });

  it('ignora espacios en los extremos y campos nulos', () => {
    expect(filtrarInstantaneo(filas, '  percutor ', campos)).toHaveLength(1);
    expect(filtrarInstantaneo(filas, 'null', campos)).toHaveLength(0);
  });

  it('no quita tildes: coincide con el criterio del servidor', () => {
    expect(filtrarInstantaneo(filas, 'metrica', campos)).toHaveLength(0);
    expect(filtrarInstantaneo(filas, 'métrica', campos)).toHaveLength(1);
  });

  it('sin coincidencias devuelve una lista vacía', () => {
    expect(filtrarInstantaneo(filas, 'zzz', campos)).toEqual([]);
  });
});

describe('BusquedaPendiente', () => {
  it('se activa al teclear y se apaga cuando termina la consulta lanzada después', () => {
    const b = new BusquedaPendiente();
    expect(b.activa).toBe(false);
    b.iniciar();
    expect(b.activa).toBe(true);
    const terminar = b.alLanzar();
    terminar();
    expect(b.activa).toBe(false);
  });

  it('una consulta anterior que termina tras teclear de nuevo no la apaga', () => {
    const b = new BusquedaPendiente();
    b.iniciar();
    const vieja = b.alLanzar();
    b.iniciar(); // el usuario siguió escribiendo
    vieja();
    expect(b.activa).toBe(true);
    const nueva = b.alLanzar();
    nueva();
    expect(b.activa).toBe(false);
  });

  it('una consulta lanzada sin teclear (paginar, refrescar) no enciende nada', () => {
    const b = new BusquedaPendiente();
    const terminar = b.alLanzar();
    terminar();
    expect(b.activa).toBe(false);
  });
});
