import { TestBed } from '@angular/core/testing';
import { EventoPanel, EventosPanelService } from './eventos-panel.service';

describe('EventosPanelService', () => {
  let servicio: EventosPanelService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(EventosPanelService);
  });

  it('entrega a quien escucha lo que se emite, con sus datos', () => {
    const recibidos: EventoPanel[] = [];
    servicio.de('venta-registrada').subscribe((e) => recibidos.push(e));

    servicio.emitir({ tipo: 'venta-registrada', datos: { id_venta: 7 } });

    expect(recibidos).toEqual([{ tipo: 'venta-registrada', datos: { id_venta: 7 } }]);
  });

  it('filtra por tipo: solo llegan los pedidos', () => {
    const recibidos: string[] = [];
    servicio.de('pedido-cambio', 'caja-cambio').subscribe((e) => recibidos.push(e.tipo));

    servicio.emitir({ tipo: 'venta-registrada' });
    servicio.emitir({ tipo: 'pedido-cambio' });
    servicio.emitir({ tipo: 'stock-cambio' });
    servicio.emitir({ tipo: 'caja-cambio' });

    expect(recibidos).toEqual(['pedido-cambio', 'caja-cambio']);
  });

  it('sin tipos escucha todos', () => {
    const recibidos: string[] = [];
    servicio.de().subscribe((e) => recibidos.push(e.tipo));

    servicio.emitir({ tipo: 'venta-registrada' });
    servicio.emitir({ tipo: 'comprobante-actualizado' });

    expect(recibidos).toEqual(['venta-registrada', 'comprobante-actualizado']);
  });

  it('no repite lo emitido antes de suscribirse', () => {
    servicio.emitir({ tipo: 'venta-registrada' });
    const recibidos: string[] = [];
    servicio.de().subscribe((e) => recibidos.push(e.tipo));
    expect(recibidos).toEqual([]);
  });

  it('los eventos provisionales solo llegan a quien los pide', () => {
    const normales: EventoPanel[] = [];
    const todos: EventoPanel[] = [];
    servicio.de('comprobante-actualizado').subscribe((e) => normales.push(e));
    servicio.deConProvisionales('comprobante-actualizado').subscribe((e) => todos.push(e));

    servicio.emitir({ tipo: 'comprobante-actualizado', provisional: true, datos: { id_comprobante: 1 } });
    servicio.emitir({ tipo: 'comprobante-actualizado', datos: { id_comprobante: 1 } });

    expect(normales.length).toBe(1);
    expect(todos.length).toBe(2);
  });

  it('varios oyentes reciben el mismo evento', () => {
    const a = vi.fn();
    const b = vi.fn();
    servicio.de('stock-cambio').subscribe(a);
    servicio.de('stock-cambio').subscribe(b);

    servicio.emitir({ tipo: 'stock-cambio' });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
