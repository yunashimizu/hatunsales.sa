import {
  diasEnRango, etiquetaRango, periodoParaRango, presetDeRango, rangoAnterior, rangoDePreset, rangoValido, ymdDeInstante,
} from './rango-fechas.util';

describe('rango-fechas.util', () => {
  // Domingo 8 de noviembre de 2026
  const hoy = '2026-11-08';

  it('calcula cada atajo en días de Lima (la semana empieza el lunes)', () => {
    expect(rangoDePreset('hoy', hoy)).toEqual({ desde: '2026-11-08', hasta: '2026-11-08' });
    expect(rangoDePreset('ayer', hoy)).toEqual({ desde: '2026-11-07', hasta: '2026-11-07' });
    expect(rangoDePreset('semana', hoy)).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' });
    expect(rangoDePreset('semana-pasada', hoy)).toEqual({ desde: '2026-10-26', hasta: '2026-11-01' });
    expect(rangoDePreset('mes', hoy)).toEqual({ desde: '2026-11-01', hasta: '2026-11-08' });
    expect(rangoDePreset('mes-pasado', hoy)).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(rangoDePreset('30-dias', hoy)).toEqual({ desde: '2026-10-10', hasta: '2026-11-08' });
    expect(rangoDePreset('personalizado', hoy)).toBeNull();
  });

  it('el mes pasado de enero es diciembre del año anterior y febrero respeta su último día', () => {
    expect(rangoDePreset('mes-pasado', '2026-01-15')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
    expect(rangoDePreset('mes-pasado', '2026-03-10')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
  });

  it('reconoce el atajo de un rango y, si no coincide ninguno, es personalizado', () => {
    expect(presetDeRango({ desde: '2026-10-01', hasta: '2026-10-31' }, hoy)).toBe('mes-pasado');
    expect(presetDeRango({ desde: '2026-10-03', hasta: '2026-10-09' }, hoy)).toBe('personalizado');
  });

  it('compara con lo mismo del periodo anterior: mes contra mes, o los mismos días justo antes', () => {
    // mes completo → mes anterior completo
    expect(rangoAnterior({ desde: '2026-10-01', hasta: '2026-10-31' })).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    // lo que va del mes → los mismos días del mes anterior
    expect(rangoAnterior({ desde: '2026-11-01', hasta: '2026-11-08' })).toEqual({ desde: '2026-10-01', hasta: '2026-10-08' });
    // lo que va del año → lo mismo del año anterior
    expect(rangoAnterior({ desde: '2026-01-01', hasta: '2026-11-08' })).toEqual({ desde: '2025-01-01', hasta: '2025-11-08' });
    // un día → el día anterior; una semana → la semana anterior
    expect(rangoAnterior({ desde: '2026-11-08', hasta: '2026-11-08' })).toEqual({ desde: '2026-11-07', hasta: '2026-11-07' });
    expect(rangoAnterior({ desde: '2026-11-02', hasta: '2026-11-08' })).toEqual({ desde: '2026-10-26', hasta: '2026-11-01' });
    // quincena en curso → los días anteriores (cruza de mes sin problema)
    expect(rangoAnterior({ desde: '2026-11-16', hasta: '2026-11-20' })).toEqual({ desde: '2026-11-11', hasta: '2026-11-15' });
    // enero → diciembre; 31 de marzo no existe en febrero
    expect(rangoAnterior({ desde: '2026-01-01', hasta: '2026-01-31' })).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
    expect(rangoAnterior({ desde: '2026-03-01', hasta: '2026-03-31' })).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
  });

  it('elige el periodo que agrupa la tendencia según los días del rango', () => {
    expect(periodoParaRango({ desde: hoy, hasta: hoy })).toBe('diario');
    expect(periodoParaRango({ desde: '2026-10-01', hasta: '2026-10-31' })).toBe('mensual');
    expect(periodoParaRango({ desde: '2026-01-01', hasta: '2026-11-08' })).toBe('anual');
    expect(diasEnRango({ desde: '2026-10-01', hasta: '2026-10-31' })).toBe(31);
  });

  it('pasa instantes del servidor a día de Lima y valida los rangos', () => {
    expect(ymdDeInstante('2026-10-21T05:00:00.000Z')).toBe('2026-10-21');
    expect(ymdDeInstante('2026-10-22T04:59:59.999Z')).toBe('2026-10-21');
    expect(ymdDeInstante('nada')).toBeNull();
    expect(rangoValido('2026-10-01', '2026-10-31')).toBe(true);
    expect(rangoValido('2026-10-31', '2026-10-01')).toBe(false);
    expect(rangoValido('2026-02-30', '2026-03-01')).toBe(false);
  });

  it('rotula el rango, con año cuando no es el año en curso', () => {
    expect(etiquetaRango({ desde: '2026-10-01', hasta: '2026-10-31' }, hoy)).toBe('01/10 – 31/10');
    expect(etiquetaRango({ desde: '2026-11-07', hasta: '2026-11-07' }, hoy)).toBe('07/11');
    expect(etiquetaRango({ desde: '2025-12-01', hasta: '2025-12-31' }, hoy)).toBe('01/12/2025 – 31/12/2025');
  });
});
