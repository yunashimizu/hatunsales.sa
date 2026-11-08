import { guardarFilasPorPagina, leerFilasPorPagina, paginar } from './paginacion-local';

describe('paginar', () => {
  const lista = Array.from({ length: 60 }, (_, i) => i + 1);

  it('corta la página pedida y calcula «desde–hasta de total»', () => {
    const p = paginar(lista, 2, 25);
    expect(p.filas[0]).toBe(26);
    expect(p.filas.length).toBe(25);
    expect(p).toMatchObject({ total: 60, totalPaginas: 3, pagina: 2, desde: 26, hasta: 50 });
  });

  it('la última página trae solo lo que queda', () => {
    const p = paginar(lista, 3, 25);
    expect(p.filas.length).toBe(10);
    expect(p).toMatchObject({ desde: 51, hasta: 60 });
  });

  it('corrige una página que ya no existe (borraron filas o la URL trae un número exagerado)', () => {
    expect(paginar(lista, 99, 25).pagina).toBe(3);
    expect(paginar(lista, 0, 25).pagina).toBe(1);
    expect(paginar(lista, Number.NaN, 25).pagina).toBe(1);
  });

  it('una lista vacía tiene una página y «0 de 0»', () => {
    expect(paginar([], 1, 25)).toMatchObject({ filas: [], total: 0, totalPaginas: 1, pagina: 1, desde: 0, hasta: 0 });
  });

  it('con 100 por página caben las 60 filas en una sola', () => {
    expect(paginar(lista, 1, 100)).toMatchObject({ totalPaginas: 1, desde: 1, hasta: 60 });
  });
});

describe('filas por página guardadas', () => {
  beforeEach(() => localStorage.clear());

  it('arranca en 25, recuerda 50 o 100 y descarta valores raros', () => {
    expect(leerFilasPorPagina()).toBe(25);
    guardarFilasPorPagina(50);
    expect(leerFilasPorPagina()).toBe(50);
    expect(localStorage.getItem('hs.panel.filas-por-pagina')).toBe('50');
    localStorage.setItem('hs.panel.filas-por-pagina', '7');
    expect(leerFilasPorPagina()).toBe(25);
  });
});
