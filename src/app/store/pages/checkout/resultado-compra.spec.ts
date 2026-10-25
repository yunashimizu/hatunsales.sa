import { Pedido } from '../../models/tienda.models';
import { avisoFinalCompra, esPreciosActualizados } from './resultado-compra';

function pedido(parcial: Partial<Pedido> = {}): Pedido {
  return {
    id_pedido: 57,
    codigo: 'PED-20261021-0057',
    estado: 'pendiente',
    subtotal: 42.37,
    igv: 7.63,
    descuento: 0,
    costo_envio: 0,
    total: 50,
    cantidad_items: 5,
    items: [],
    historial: [],
    creado_en: '2026-10-21T20:00:00Z',
    ...parcial,
  };
}

describe('avisoFinalCompra (E01)', () => {
  it('un pedido sin cobro en línea queda registrado, no "confirmado": se valida el pago', () => {
    const aviso = avisoFinalCompra(pedido({ estado: 'pendiente' }), 'Transferencia bancaria');

    expect(aviso.titulo).toBe('¡Pedido registrado!');
    expect(aviso.mensaje).toContain('<strong>PED-20261021-0057</strong>');
    expect(aviso.mensaje).toContain('validaremos tu pago con Transferencia bancaria');
  });

  it('un pedido pagado con tarjeta queda confirmado', () => {
    const aviso = avisoFinalCompra(pedido({ estado: 'pagado' }), 'Tarjeta');

    expect(aviso.titulo).toBe('¡Pedido confirmado!');
    expect(aviso.mensaje).not.toContain('validaremos');
  });

  it('escapa el código y el método antes de mostrarlos como HTML', () => {
    const aviso = avisoFinalCompra(pedido({ codigo: '<b>X</b>' }), '<img src=x>');

    expect(aviso.mensaje).not.toContain('<b>');
    expect(aviso.mensaje).not.toContain('<img');
  });
});

describe('esPreciosActualizados (E03)', () => {
  it('reconoce el aviso del backend cuando cambió un precio del carrito', () => {
    expect(esPreciosActualizados({ status: 409, error: { codigo: 'PRECIOS_ACTUALIZADOS' } })).toBe(true);
    expect(esPreciosActualizados({ status: 409, error: { codigo: 'OTRO' } })).toBe(false);
    expect(esPreciosActualizados({ status: 400, error: { codigo: 'PRECIOS_ACTUALIZADOS' } })).toBe(false);
    expect(esPreciosActualizados(null)).toBe(false);
  });
});
