import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { urlConstants } from '../../constants/urlConstants';
import { Pedido } from '../../store/models/tienda.models';
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

  it('porPreparar suma pendientes y pagados (dos lecturas silenciosas) y publica el resumen', () => {
    const vistos: unknown[] = [];
    servicio.resumen.subscribe((r) => vistos.push(r));
    let recibido: unknown;
    servicio.porPreparar().subscribe((r) => (recibido = r));

    const pendientes = http.expectOne((r) => r.url === base && r.params.get('estado') === 'pendiente');
    const pagados = http.expectOne((r) => r.url === base && r.params.get('estado') === 'pagado');
    pendientes.flush([p('pendiente'), p('pendiente')]);
    pagados.flush([p('pagado')]);

    expect(recibido).toEqual({ pendientes: 2, pagados: 1, total: 3 });
    expect(vistos[vistos.length - 1]).toEqual({ pendientes: 2, pagados: 1, total: 3 });
  });

  it('publicarDesde cuenta sobre la lista que ya tiene la pantalla', () => {
    let ultimo: unknown;
    servicio.resumen.subscribe((r) => (ultimo = r));
    servicio.publicarDesde([p('pendiente'), p('pagado'), p('pagado'), p('entregado'), p('cancelado')]);
    expect(ultimo).toEqual({ pendientes: 1, pagados: 2, total: 3 });
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
