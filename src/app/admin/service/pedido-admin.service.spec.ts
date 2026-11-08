import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { urlConstants } from '../../constants/urlConstants';
import { SILENCIOSA } from '../../interceptors/contexto-http';
import { Pedido } from '../../store/models/tienda.models';
import { EventoPanel, EventosPanelService } from './eventos-panel.service';
import { PedidoAdminService, pedidoCancelable, siguienteEstadoPedido } from './pedido-admin.service';

describe('PedidoAdminService', () => {
  let servicio: PedidoAdminService;
  let http: HttpTestingController;
  const base = urlConstants.admin.pedidos;
  const p = (estado: string) => ({ estado }) as Pedido;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(PedidoAdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('apunta a admin/pedidos', () => {
    expect(base.endsWith('admin/pedidos')).toBe(true);
  });

  it('listar sin estado pide todos; con estado lo manda como parámetro', () => {
    servicio.listar().subscribe();
    const todos = http.expectOne((r) => r.url === base);
    expect(todos.request.method).toBe('GET');
    expect(todos.request.params.has('estado')).toBe(false);
    todos.flush([]);

    servicio.listar('pagado').subscribe();
    const filtrado = http.expectOne((r) => r.url === base);
    expect(filtrado.request.params.get('estado')).toBe('pagado');
    filtrado.flush([]);
  });

  it('detalle pide admin/pedidos/:id', () => {
    servicio.detalle(7).subscribe();
    const r = http.expectOne(`${base}/7`);
    expect(r.request.method).toBe('GET');
    r.flush(p('pagado'));
  });

  it('cambiarEstado hace PUT :id/estado con el estado y el comentario recortado', () => {
    servicio.cambiarEstado(7, 'preparando', '  en almacén ').subscribe();
    const r = http.expectOne(`${base}/7/estado`);
    expect(r.request.method).toBe('PUT');
    expect(r.request.body).toEqual({ estado: 'preparando', comentario: 'en almacén' });
    r.flush(p('preparando'));
  });

  it('cambiarEstado sin comentario no lo manda', () => {
    servicio.cambiarEstado(7, 'enviado', '   ').subscribe();
    const r = http.expectOne(`${base}/7/estado`);
    expect(r.request.body).toEqual({ estado: 'enviado' });
    r.flush(p('enviado'));
  });

  it('confirmarPago hace PUT :id/confirmar-pago con la referencia (si hay)', () => {
    servicio.confirmarPago(3, ' OP-55 ').subscribe();
    const r = http.expectOne(`${base}/3/confirmar-pago`);
    expect(r.request.method).toBe('PUT');
    expect(r.request.body).toEqual({ referencia: 'OP-55' });
    r.flush(p('pagado'));

    servicio.confirmarPago(3).subscribe();
    const sin = http.expectOne(`${base}/3/confirmar-pago`);
    expect(sin.request.body).toEqual({});
    sin.flush(p('pagado'));
  });

  it('porPreparar pide una sola lectura silenciosa del resumen y la publica', () => {
    const vistos: unknown[] = [];
    servicio.resumen.subscribe((r) => vistos.push(r));
    let recibido: unknown;
    servicio.porPreparar().subscribe((r) => (recibido = r));

    http.expectNone((r) => r.url === base);
    const resumen = http.expectOne(urlConstants.admin.pedidosResumen);
    expect(resumen.request.method).toBe('GET');
    expect(resumen.request.context.get(SILENCIOSA)).toBe(true);
    resumen.flush({ pendientes: 2, pagados: 1, total: 3 });

    expect(recibido).toEqual({ pendientes: 2, pagados: 1, total: 3 });
    expect(vistos[vistos.length - 1]).toEqual({ pendientes: 2, pagados: 1, total: 3 });
  });

  it('porPreparar: dos llamadas dentro de 5 s comparten una sola petición', () => {
    const recibidos: unknown[] = [];
    servicio.porPreparar().subscribe((r) => recibidos.push(r));
    servicio.porPreparar().subscribe((r) => recibidos.push(r));
    http.expectOne(urlConstants.admin.pedidosResumen).flush({ pendientes: 1, pagados: 0, total: 1 });
    expect(recibidos).toEqual([
      { pendientes: 1, pagados: 0, total: 1 },
      { pendientes: 1, pagados: 0, total: 1 },
    ]);
  });

  it('porPreparar sin números válidos publica ceros', () => {
    let recibido: unknown;
    servicio.porPreparar().subscribe((r) => (recibido = r));
    http.expectOne(urlConstants.admin.pedidosResumen).flush({ pendientes: 'x' });
    expect(recibido).toEqual({ pendientes: 0, pagados: 0, total: 0 });
  });

  it('publicarDesde cuenta sobre la lista que ya tiene la pantalla', () => {
    let ultimo: unknown;
    servicio.resumen.subscribe((r) => (ultimo = r));
    servicio.publicarDesde([p('pendiente'), p('pagado'), p('pagado'), p('entregado'), p('cancelado')]);
    expect(ultimo).toEqual({ pendientes: 1, pagados: 2, total: 3 });
  });

  describe('avisos al panel', () => {
    it('cambiarEstado publica «pedido-cambio» y olvida el conteo guardado', () => {
      const eventos: EventoPanel[] = [];
      TestBed.inject(EventosPanelService).de('pedido-cambio').subscribe((e) => eventos.push(e));

      servicio.porPreparar().subscribe();
      http.expectOne(urlConstants.admin.pedidosResumen).flush({ pendientes: 1, pagados: 0 });

      servicio.cambiarEstado(7, 'preparando').subscribe();
      http.expectOne(`${base}/7/estado`).flush(p('preparando'));
      expect(eventos.length).toBe(1);
      expect(eventos[0].datos).toMatchObject({ id_pedido: 7, estado: 'preparando' });

      // Dentro de los 5 s, pero con el conteo invalidado: vuelve a consultar.
      servicio.porPreparar().subscribe();
      http.expectOne(urlConstants.admin.pedidosResumen).flush({ pendientes: 0, pagados: 0 });
    });

    it('confirmarPago también publica «pedido-cambio»; un fallo no publica nada', () => {
      const eventos: EventoPanel[] = [];
      TestBed.inject(EventosPanelService).de('pedido-cambio').subscribe((e) => eventos.push(e));

      servicio.confirmarPago(8, 'Yape 123').subscribe();
      http.expectOne(`${base}/8/confirmar-pago`).flush(p('pagado'));
      expect(eventos.length).toBe(1);

      servicio.cambiarEstado(8, 'enviado').subscribe({ error: () => undefined });
      http.expectOne(`${base}/8/estado`).flush({ message: 'x' }, { status: 400, statusText: 'Bad Request' });
      expect(eventos.length).toBe(1);
    });
  });
});

describe('flujo de estados del pedido', () => {
  it('avanza solo hacia adelante y «pagado» no se alcanza con Avanzar', () => {
    expect(siguienteEstadoPedido('pendiente')).toBeNull();
    expect(siguienteEstadoPedido('pagado')).toBe('preparando');
    expect(siguienteEstadoPedido('preparando')).toBe('enviado');
    expect(siguienteEstadoPedido('enviado')).toBe('entregado');
    expect(siguienteEstadoPedido('entregado')).toBeNull();
    expect(siguienteEstadoPedido('cancelado')).toBeNull();
  });

  it('se puede cancelar desde cualquier estado no final', () => {
    for (const e of ['pendiente', 'pagado', 'preparando', 'enviado'] as const) expect(pedidoCancelable(e)).toBe(true);
    expect(pedidoCancelable('entregado')).toBe(false);
    expect(pedidoCancelable('cancelado')).toBe(false);
  });
});
