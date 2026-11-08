import { tiempoRelativo } from './tiempo-relativo';

describe('tiempoRelativo', () => {
  const ahora = new Date(2026, 10, 8, 15, 0, 0);
  const hace = (ms: number) => new Date(ahora.getTime() - ms);

  it('segundos, minutos y horas', () => {
    expect(tiempoRelativo(hace(10_000), ahora)).toBe('hace unos segundos');
    expect(tiempoRelativo(hace(60_000), ahora)).toBe('hace 1 min');
    expect(tiempoRelativo(hace(5 * 60_000), ahora)).toBe('hace 5 min');
    expect(tiempoRelativo(hace(3 * 3_600_000), ahora)).toBe('hace 3 h');
  });

  it('ayer, días y fecha corta cuando pasó más de una semana', () => {
    expect(tiempoRelativo(new Date(2026, 10, 7, 9, 0), new Date(2026, 10, 8, 10, 0))).toBe('ayer');
    expect(tiempoRelativo(new Date(2026, 10, 5, 12, 0), ahora)).toBe('hace 3 días');
    expect(tiempoRelativo(new Date(2026, 9, 20, 12, 0), ahora)).toMatch(/20/);
  });

  it('acepta texto ISO y números', () => {
    expect(tiempoRelativo(hace(2 * 60_000).toISOString(), ahora)).toBe('hace 2 min');
    expect(tiempoRelativo(hace(2 * 60_000).getTime(), ahora)).toBe('hace 2 min');
  });

  it('una fecha vacía o inválida da texto vacío y una fecha futura cercana no rompe', () => {
    expect(tiempoRelativo(null, ahora)).toBe('');
    expect(tiempoRelativo('no es fecha', ahora)).toBe('');
    expect(tiempoRelativo(new Date(ahora.getTime() + 5000), ahora)).toBe('hace unos segundos');
  });
});
