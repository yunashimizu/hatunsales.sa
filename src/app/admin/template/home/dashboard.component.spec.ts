import { DashboardComponent } from './dashboard.component';

/** Solo la lógica del gráfico «Ventas por hora» (no se monta la pantalla). */
describe('DashboardComponent · ventas por hora', () => {
  function crear(): any {
    return Object.create(DashboardComponent.prototype);
  }
  const hora = (h: number, total: number, ventas = 1) => ({ hora: h, total, ventas });

  it('arma el eje de 7 a 21 h, marca la hora pico y guarda la semana pasada aparte', () => {
    const c = crear();
    c.aplicarHoras({
      fecha: '2026-11-07',
      horas: [hora(9, 100), hora(17, 400, 3), hora(18, 250)],
      comparacion: { fecha: '2026-10-31', horas: [hora(17, 300), hora(11, 50)] },
    });

    expect(c.horaConDatos).toBe(true);
    expect(c.barrasHora.length).toBe(15);
    expect(c.barrasHora[0].hora).toBe(7);
    expect(c.barrasHora[14].hora).toBe(21);
    const pico = c.barrasHora.filter((b: any) => b.esPico);
    expect(pico.length).toBe(1);
    expect(pico[0].hora).toBe(17);
    expect(pico[0].totalPrev).toBe(300);
    expect(c.hallazgoHora).toContain('17:00');
  });

  it('amplía el eje si hay ventas fuera de 7-21 h', () => {
    const c = crear();
    c.aplicarHoras({ fecha: 'x', horas: [hora(5, 20), hora(23, 10)], comparacion: { fecha: 'y', horas: [] } });

    expect(c.barrasHora[0].hora).toBe(5);
    expect(c.barrasHora[c.barrasHora.length - 1].hora).toBe(23);
  });

  it('sin respuesta (404/500/timeout) o sin ventas no hay gráfico por hora: queda el semanal', () => {
    const c = crear();
    c.aplicarHoras(null);
    expect(c.horaConDatos).toBe(false);

    c.aplicarHoras({ fecha: 'x', horas: [], comparacion: { fecha: 'y', horas: [] } });
    expect(c.horaConDatos).toBe(false);
    expect(c.barrasHora).toEqual([]);

    c.aplicarHoras({ horas: 'raro' });
    expect(c.horaConDatos).toBe(false);
  });
});

/** Fila «Necesita tu atención» y acceso rápido de los pedidos web (lógica pura, sin montar la pantalla). */
describe('DashboardComponent · pedidos web', () => {
  function crear(): any {
    const c = Object.create(DashboardComponent.prototype);
    c.fiscal = { estado: () => null };
    return c;
  }

  it('suma pendientes y pagados en una fila que lleva a Pedidos', () => {
    const c = crear();
    c.vePedidos = true;
    c.pedidosWeb = { pendientes: 1, pagados: 2, total: 3 };
    const fila = c.filasAtencion.find((f: any) => f.id === 'pedidos-web');

    expect(fila.texto).toBe('3 pedidos web por preparar');
    expect(fila.detalle).toBe('2 pagados, a preparar · 1 por cobrar');
    expect(fila.ruta).toBe('/dashboard/mantenimiento/pedidos');
    expect(fila.tono).toBe('aviso');
  });

  it('sin pedidos por atender, o sin permiso, no hay fila', () => {
    const c = crear();
    c.vePedidos = true;
    c.pedidosWeb = { pendientes: 0, pagados: 0, total: 0 };
    expect(c.filasAtencion.some((f: any) => f.id === 'pedidos-web')).toBe(false);

    c.vePedidos = false;
    c.pedidosWeb = { pendientes: 1, pagados: 0, total: 1 };
    expect(c.filasAtencion.some((f: any) => f.id === 'pedidos-web')).toBe(false);
  });

  it('cuenta como lectura hecha para no decir «todo en orden» a ciegas', () => {
    const c = crear();
    c.pedidosWeb = { pendientes: 0, pagados: 0, total: 0 };
    expect(c.atencionRevisada).toBe(true);
  });
});
