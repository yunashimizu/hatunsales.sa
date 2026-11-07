import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { PedidosComponent } from './pedidos.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { PedidoAdminService } from '../../../service/pedido-admin.service';
import { EstadoPedido, Pedido } from '../../../../store/models/tienda.models';

function pedido(id: number, estado: EstadoPedido, extra: Partial<Pedido> = {}): Pedido {
  return {
    id_pedido: id,
    codigo: `PW-00${id}`,
    estado,
    subtotal: 84.75,
    igv: 15.25,
    descuento: 0,
    costo_envio: 0,
    total: 100,
    nombre_receptor: `Cliente ${id}`,
    documento_receptor: '4587123' + id,
    metodo_pago: 'Yape',
    cantidad_items: 2,
    items: [{ id_pedido_item: id, nombre: 'Cemento', cantidad: 2, precio_unitario: 50, subtotal: 84.75, igv: 15.25, total: 100 }],
    historial: [{ estado: 'pendiente', fecha: '2026-11-07T10:00:00Z' }],
    creado_en: `2026-11-0${id}T10:00:00Z`,
    ...extra,
  };
}

describe('PedidosComponent', () => {
  let fixture: ComponentFixture<PedidosComponent>;
  let componente: PedidosComponent;
  let lista: Pedido[];

  const api = {
    listar: vi.fn(),
    detalle: vi.fn(),
    cambiarEstado: vi.fn(),
    confirmarPago: vi.fn(),
    publicarDesde: vi.fn(),
  };
  const alerta = { confirmarPeligro: vi.fn(), error: vi.fn() };
  const ns = { exito: vi.fn(), error: vi.fn() };

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const filas = () => Array.from(el().querySelectorAll('tbody tr'));

  /** Escribe en el buscador como lo haría la persona (así el componente OnPush se entera). */
  async function buscar(texto: string): Promise<void> {
    const campo = el().querySelector('#ped-buscar') as HTMLInputElement;
    campo.value = texto;
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    lista = [
      pedido(1, 'pendiente'),
      pedido(2, 'pagado'),
      pedido(3, 'preparando'),
      pedido(4, 'enviado'),
      pedido(5, 'entregado'),
      pedido(6, 'cancelado'),
    ];
    api.listar.mockImplementation(() => of(lista));
    api.detalle.mockImplementation((id: number) => of(lista.find((p) => p.id_pedido === id)!));

    await TestBed.configureTestingModule({
      imports: [PedidosComponent],
      providers: [
        provideRouter([]),
        { provide: PedidoAdminService, useValue: api },
        { provide: AlertService, useValue: alerta },
        { provide: NotificationService, useValue: ns },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PedidosComponent);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('lista los pedidos (el más reciente primero) y publica el resumen para el menú', () => {
    expect(api.listar).toHaveBeenCalled();
    expect(filas().length).toBe(6);
    expect(filas()[0].textContent).toContain('PW-006');
    expect(api.publicarDesde).toHaveBeenCalledWith(lista);
  });

  it('los chips traen su contador y filtran por estado', () => {
    const chips = Array.from(el().querySelectorAll('.ped-chips .adm-chip'));
    expect(chips.length).toBe(7);
    expect(chips[0].textContent).toContain('Todos');
    expect(chips[0].textContent).toContain('6');
    expect(chips[1].textContent).toContain('Pendientes');

    (chips[2] as HTMLButtonElement).click(); // Pagados
    fixture.detectChanges();
    expect(componente.filtroEstado).toBe('pagado');
    expect(filas().length).toBe(1);
    expect(filas()[0].textContent).toContain('PW-002');
    expect(el().querySelector('.ped-chips .adm-chip--activo')?.textContent).toContain('Pagados');
  });

  it('busca por código y por cliente; sin coincidencias muestra el estado vacío con salida', async () => {
    await buscar('cliente 3');
    expect(filas().length).toBe(1);

    await buscar('zzz');
    expect(filas().length).toBe(0);
    expect(el().querySelector('.adm-vacio')?.textContent).toContain('Ningún pedido coincide');

    (el().querySelector('.adm-vacio button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(filas().length).toBe(6);
  });

  it('sin pedidos explica qué pasará y lleva a la tienda', async () => {
    lista = [];
    componente.cargar();
    fixture.detectChanges();
    expect(el().querySelector('.adm-vacio')?.textContent).toContain('Todavía no hay pedidos web');
    expect(el().querySelector('.adm-vacio a')?.getAttribute('href')).toBe('/store');
  });

  it('si la carga falla avisa y deja reintentar', () => {
    api.listar.mockImplementationOnce(() => throwError(() => ({ status: 500 })));
    componente.pedidos = [];
    componente.cargar();
    fixture.detectChanges();
    expect(ns.error).toHaveBeenCalled();
    expect(el().querySelector('.adm-vacio--error')).not.toBeNull();
  });

  it('abrir un pedido muestra la ficha con productos, totales e historial', () => {
    componente.abrir(lista[1]);
    fixture.detectChanges();
    const ficha = el().querySelector('.ped-ficha') as HTMLElement;
    expect(ficha).not.toBeNull();
    expect(ficha.textContent).toContain('PW-002');
    expect(ficha.textContent).toContain('Cemento');
    expect(ficha.textContent).toContain('Historial');
    expect(el().querySelector('.adm-pagina--con-ficha')).not.toBeNull();
    expect(api.detalle).toHaveBeenCalledWith(2);
  });

  it('un pedido pendiente ofrece «Confirmar pago» con referencia y lo pasa a pagado', () => {
    const pagado = pedido(1, 'pagado', { historial: [{ estado: 'pagado', fecha: '2026-11-07T11:00:00Z' }] });
    api.confirmarPago.mockReturnValue(of(pagado));

    componente.abrir(lista[0]);
    fixture.detectChanges();
    expect(el().querySelector('#ped-referencia')).not.toBeNull();
    expect(componente.siguiente).toBeNull(); // pendiente → pagado va solo por «Confirmar pago»

    componente.referencia = 'OP-123';
    componente.confirmarPago();
    fixture.detectChanges();

    expect(api.confirmarPago).toHaveBeenCalledWith(1, 'OP-123');
    expect(ns.exito).toHaveBeenCalled();
    expect(componente.seleccionado?.estado).toBe('pagado');
    expect(componente.conteo('pagado')).toBe(2);
    expect(componente.conteo('pendiente')).toBe(0);
    expect(componente.referencia).toBe('');
  });

  it('avanza al siguiente estado del flujo con el comentario', () => {
    const preparando = pedido(2, 'preparando');
    api.cambiarEstado.mockReturnValue(of(preparando));

    componente.abrir(lista[1]); // pagado
    expect(componente.siguiente).toBe('preparando');
    expect(componente.textoAvanzar).toBe('Avanzar a preparando');

    componente.comentario = 'Listo en almacén';
    componente.avanzar();

    expect(api.cambiarEstado).toHaveBeenCalledWith(2, 'preparando', 'Listo en almacén');
    expect(componente.seleccionado?.estado).toBe('preparando');
    expect(ns.exito).toHaveBeenCalled();
  });

  it('sigue la cadena preparando → enviado → entregado y en el final ya no ofrece acciones', () => {
    componente.abrir(lista[2]);
    expect(componente.siguiente).toBe('enviado');
    componente.abrir(lista[3]);
    expect(componente.siguiente).toBe('entregado');
    componente.abrir(lista[4]); // entregado
    fixture.detectChanges();
    expect(componente.siguiente).toBeNull();
    expect(componente.cancelable).toBe(false);
    expect(componente.esFinal).toBe(true);
    expect(el().querySelector('.ped-principal')).toBeNull();
    componente.abrir(lista[5]); // cancelado
    expect(componente.cancelable).toBe(false);
  });

  it('cancelar pide confirmación de peligro y solo entonces llama al servidor', async () => {
    const cancelado = pedido(2, 'cancelado');
    api.cambiarEstado.mockReturnValue(of(cancelado));
    componente.abrir(lista[1]);

    alerta.confirmarPeligro.mockResolvedValueOnce(false);
    await componente.cancelar();
    expect(api.cambiarEstado).not.toHaveBeenCalled();

    alerta.confirmarPeligro.mockResolvedValueOnce(true);
    await componente.cancelar();
    expect(alerta.confirmarPeligro).toHaveBeenCalledTimes(2);
    expect(api.cambiarEstado).toHaveBeenCalledWith(2, 'cancelado', '');
    expect(componente.seleccionado?.estado).toBe('cancelado');
    expect(ns.exito).toHaveBeenCalled();
  });

  it('si el servidor rechaza la acción muestra el motivo y no cambia el estado', () => {
    api.cambiarEstado.mockReturnValue(throwError(() => ({ status: 400, error: { message: 'No puede volver' } })));
    componente.abrir(lista[1]);
    componente.avanzar();
    expect(alerta.error).toHaveBeenCalled();
    expect(componente.seleccionado?.estado).toBe('pagado');
    expect(componente.procesando).toBe(false);
    expect(ns.exito).not.toHaveBeenCalled();
  });

  it('cerrar la ficha limpia la selección', () => {
    componente.abrir(lista[0]);
    componente.cerrarPanel();
    fixture.detectChanges();
    expect(el().querySelector('.ped-ficha')).toBeNull();
    expect(componente.seleccionado).toBeNull();
  });
});
