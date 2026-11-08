import {
  construirAccesos,
  construirCobros,
  construirFilasAtencion,
  construirSucursales,
  tonoDeMedio,
  vistaDelta,
} from './inicio-datos.util';
import { delta } from './inicio-graficos.util';

describe('inicio-datos.util', () => {
  it('cobros por medio de pago: orden, porcentaje y color según el nombre', () => {
    const { cobros, total } = construirCobros([
      { metodo: 'Yape', total: 912, cantidad: 6 },
      { metodo: 'Efectivo', total: 1860.4, cantidad: 14 },
      { metodo: 'Tarjeta Visa', total: 0, cantidad: 0 },
    ]);
    expect(total).toBeCloseTo(2772.4);
    expect(cobros.map((c) => c.nombre)).toEqual(['Efectivo', 'Yape']);
    expect(cobros[0]).toMatchObject({ porcentaje: 67, tono: 'efectivo', cobros: 14 });
    expect(tonoDeMedio('Plin')).toBe('billetera');
    expect(tonoDeMedio('Transferencia BCP')).toBe('transferencia');
    expect(tonoDeMedio('Vale')).toBe('otro');
  });

  it('sucursales: la mayor ocupa todo el ancho y las demás son proporcionales', () => {
    const filas = construirSucursales({
      desde: 'x',
      hasta: 'x',
      total: {} as never,
      sucursales: [
        { id_sucursal: 1, nombre: 'Principal', turnos: 2, ventas_total: 3000 } as never,
        { id_sucursal: null, nombre: '', turnos: 1, ventas_total: 1500 } as never,
      ],
    });
    expect(filas.map((f) => f.ancho)).toEqual([100, 50]);
    expect(filas[1].nombre).toBe('Sin sucursal');
    expect(construirSucursales(null)).toEqual([]);
  });

  it('comparación en palabras y accesos según el rol', () => {
    expect(vistaDelta(delta(112, 100), 'vs. antes')).toMatchObject({ signo: '▲', texto: '12 %', lector: 'Sube', referencia: 'vs. antes' });
    expect(vistaDelta(delta(5, 0), 'vs. antes').referencia).toBe('');

    const consulta = construirAccesos((roles) => roles.includes('consulta'), null);
    expect(consulta).toEqual([]);
    const caja = construirAccesos((roles) => roles.includes('caja'), { pendientes: 1, pagados: 0, total: 1 });
    expect(caja.map((a) => a.titulo)).toEqual(['Pedidos web', 'Vender', 'Cotizar', 'Cerrar caja']);
  });

  it('«Necesita tu atención»: cuenta vencida con monto parcial y nada si no se leyó', () => {
    const base = {
      estadoFiscal: null, veDocumentos: true, vePedidos: true, veFiscalPanel: false, veInventario: true, veStock: true, veCxc: true,
      cpeAtencion: null, pedidosWeb: null, sinStock: null, bajoStock: null, cxcVencidoCuentas: null, cxcVencidoMonto: null, cxcParcial: false,
    };
    expect(construirFilasAtencion(base)).toEqual([]);
    const filas = construirFilasAtencion({ ...base, cxcVencidoCuentas: 3, cxcVencidoMonto: 250, cxcParcial: true, sinStock: 1 });
    expect(filas.map((f) => f.id)).toEqual(['sin-stock', 'cxc']);
    expect(filas[1].detalle).toBe('Al menos S/ 250.00 por cobrar');
    expect(filas[0].ruta).toBe('/dashboard/mantenimiento/inventario');
  });
});
