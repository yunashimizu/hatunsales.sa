import {
  claveDia,
  construirBarrasDias,
  construirBarrasHora,
  delta,
  diasEntre,
  formatoCorto,
  formatoSoles,
  marcasEje,
  pasoRedondo,
  totalesHasta,
  totalesPorDia,
} from './inicio-graficos.util';

const hora = (h: number, total: number, ventas = 1) => ({ hora: h, total, ventas });

describe('inicio-graficos.util · delta', () => {
  it('sube, baja e igual (menos de 1 %)', () => {
    expect(delta(112, 100)).toEqual({ tipo: 'sube', porcentaje: 12 });
    expect(delta(80, 100)).toEqual({ tipo: 'baja', porcentaje: 20 });
    expect(delta(100.5, 100)).toEqual({ tipo: 'igual', porcentaje: 0 });
    expect(delta(0, 100)).toEqual({ tipo: 'baja', porcentaje: 100 });
  });

  it('sin referencia cuando la base es 0, negativa o no es número', () => {
    expect(delta(50, 0).tipo).toBe('sin-referencia');
    expect(delta(0, 0).tipo).toBe('sin-referencia');
    expect(delta(50, -3).tipo).toBe('sin-referencia');
    expect(delta(50, NaN).tipo).toBe('sin-referencia');
  });
});

describe('inicio-graficos.util · formatos y eje', () => {
  it('formatoCorto redondea y separa miles; formatoSoles lleva dos decimales', () => {
    expect(formatoCorto(1249.6)).toBe('1,250');
    expect(formatoSoles(5751.3)).toBe('S/ 5,751.30');
  });

  it('pasoRedondo y marcasEje dan cuatro marcas y un tope múltiplo del paso', () => {
    expect(pasoRedondo(0)).toBe(1);
    expect(pasoRedondo(130)).toBe(200);
    const { marcas, tope } = marcasEje(600);
    expect(marcas.length).toBe(4);
    expect(marcas[3].texto).toBe('0');
    expect(tope).toBeGreaterThanOrEqual(600);
    expect(marcas[0].y).toBeLessThan(marcas[3].y);
  });
});

describe('inicio-graficos.util · barras por hora', () => {
  it('eje de 7 a 21 h, hora pico y comparación; los textos dicen «hoy» o «ayer»', () => {
    const datos = {
      fecha: '2026-11-07',
      horas: [hora(9, 100), hora(17, 400, 3), hora(18, 250)],
      comparacion: { fecha: '2026-10-31', horas: [hora(17, 300), hora(11, 50)] },
    };
    const g = construirBarrasHora(datos, 'ayer')!;
    expect(g.barras.length).toBe(15);
    expect(g.pico).toBe(17);
    expect(g.totalPico).toBe(400);
    expect(g.totalActual).toBe(750);
    expect(g.totalPrevio).toBe(350);
    const b17 = g.barras.find((b) => b.hora === 17)!;
    expect(b17.esPico).toBe(true);
    expect(b17.titulo).toContain('ayer');
    expect(b17.tip.lineas[0].rotulo).toBe('Ayer');
    expect(b17.tip.lineas[0].valor).toContain('3 ventas');
    expect(b17.tip.lineas[1].valor).toBe('S/ 300.00');
    expect(construirBarrasHora(datos, 'hoy')!.barras[0].tip.lineas[0].rotulo).toBe('Hoy');
  });

  it('amplía el eje si hay ventas fuera de 7-21 h y devuelve null sin datos', () => {
    const g = construirBarrasHora({ fecha: 'x', horas: [hora(5, 20), hora(23, 10)], comparacion: { fecha: 'y', horas: [] } })!;
    expect(g.barras[0].hora).toBe(5);
    expect(g.barras[g.barras.length - 1].hora).toBe(23);
    expect(g.barras.filter((b) => b.mostrarEtiqueta).length).toBeLessThan(g.barras.length);

    expect(construirBarrasHora(null)).toBeNull();
    expect(construirBarrasHora({ fecha: 'x', horas: [], comparacion: { fecha: 'y', horas: [] } })).toBeNull();
    expect(construirBarrasHora({ horas: 'raro' } as never)).toBeNull();
  });

  it('totalesHasta suma solo hasta la hora indicada, en el día y en su comparación', () => {
    const datos = {
      fecha: 'x',
      horas: [hora(9, 100, 2), hora(15, 200, 1), hora(18, 500, 4)],
      comparacion: { fecha: 'y', horas: [hora(10, 80, 1), hora(14, 120, 2), hora(19, 900, 9)] },
    };
    expect(totalesHasta(datos, 16)).toEqual({ total: 300, ventas: 3, totalPrevio: 200, ventasPrevio: 3 });
    expect(totalesHasta(datos, 23)!.total).toBe(800);
    expect(totalesHasta(null, 23)).toBeNull();
  });
});

describe('inicio-graficos.util · barras por día', () => {
  it('una semana: etiquetas con nombre del día, valores en todas y hoy en la última', () => {
    const lunes = new Date(2026, 10, 2);
    const dias = totalesPorDia(diasEntre(lunes, new Date(2026, 10, 4)), [
      { fecha: '2026-11-02', total_vendido: '100' },
      { fecha: '2026-11-02T10:00:00', total_vendido: 50 },
      { fecha: '2026-11-04', total_vendido: 300 },
      { fecha: '2026-10-30', total_vendido: 999 },
    ]);
    expect(dias.map((d) => d.total)).toEqual([150, 0, 300]);

    const g = construirBarrasDias(dias)!;
    expect(g.barras.length).toBe(3);
    expect(g.barras[0].etiqueta).toBe('Lun 2');
    expect(g.barras[2].esHoy).toBe(true);
    expect(g.barras.every((b) => b.mostrarValor)).toBe(true);
    expect(g.mejor).toBe(2);
    expect(g.total).toBe(450);
    expect(g.barras[2].titulo).toBe('miércoles 4: S/ 300.00');
  });

  it('un mes: etiqueta solo el número, una de cada 5, y el valor solo en el mejor día', () => {
    const dias = diasEntre(new Date(2026, 10, 1), new Date(2026, 10, 24)).map((fecha, i) => ({ fecha, total: i === 9 ? 900 : 100 + i }));
    const g = construirBarrasDias(dias)!;
    expect(g.barras.length).toBe(24);
    expect(g.barras[0].etiqueta).toBe('1');
    const conEtiqueta = g.barras.filter((b) => b.mostrarEtiqueta).map((b) => b.etiqueta);
    expect(conEtiqueta).toEqual(['1', '6', '11', '16', '21', '24']);
    expect(g.barras.filter((b) => b.mostrarValor).length).toBe(1);
    expect(g.barras[9].mostrarValor).toBe(true);
  });

  it('sin ventas en ningún día no hay gráfico; diasEntre y claveDia respetan el calendario', () => {
    expect(construirBarrasDias(diasEntre(new Date(2026, 10, 1), new Date(2026, 10, 3)).map((fecha) => ({ fecha, total: 0 })))).toBeNull();
    expect(construirBarrasDias([])).toBeNull();
    const cruce = diasEntre(new Date(2026, 9, 30), new Date(2026, 10, 2)).map(claveDia);
    expect(cruce).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });
});
