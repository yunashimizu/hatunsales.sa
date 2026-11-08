import { ComprobanteFila } from '../../models/admin.models';
import { ResumenSucursalesCaja } from '../../models/caja-arqueo.models';
import { EstadoFiscalGlobal } from '../../models/fiscal.models';
import { textoEstadoSunat, tonoEstadoSunat } from '../../models/documentos.models';
import { ResumenPedidosWeb } from '../../service/pedido-admin.service';
import { ReporteVentasResumen } from '../../service/reportes.service';
import { delta, formatoSoles, numero } from './inicio-graficos.util';

/**
 * Armado de los datos del Inicio (sin Angular): filas de «Necesita tu atención», comparaciones,
 * cobros por medio de pago, actividad reciente, sucursales y lo más vendido.
 */

export const RUTA = '/dashboard/mantenimiento';

/** Roles que ve cada bloque: los mismos que el menú lateral (sidebar.component.ts). */
export const ROLES_VENTAS = ['admin', 'superadmin', 'vendedor', 'caja'];
export const ROLES_REPORTES = ['admin', 'superadmin', 'vendedor', 'caja'];
export const ROLES_CXC = ['admin', 'superadmin', 'caja', 'vendedor'];
export const ROLES_DOCUMENTOS = ['admin', 'superadmin', 'vendedor', 'caja'];
export const ROLES_INVENTARIO = ['admin', 'superadmin', 'vendedor'];
export const ROLES_STOCK = ['admin', 'superadmin', 'vendedor', 'consulta'];
export const ROLES_RECEPCION = ['admin', 'superadmin', 'vendedor'];
export const ROLES_FISCAL_PANEL = ['admin', 'superadmin'];
export const ROLES_PEDIDOS = ['admin', 'superadmin', 'vendedor', 'caja'];
export const ROLES_ADMIN = ['admin'];

export type PeriodoInicio = 'hoy' | 'ayer' | 'semana' | 'mes';

export const PERIODOS_INICIO: ReadonlyArray<{ id: PeriodoInicio; etiqueta: string }> = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'ayer', etiqueta: 'Ayer' },
  { id: 'semana', etiqueta: 'Esta semana' },
  { id: 'mes', etiqueta: 'Este mes' },
];

/** Los textos de las tarjetas que cambian con el periodo. */
export const ROTULOS_PERIODO: Record<
  PeriodoInicio,
  { ventas: string; neto: string; top: string; vacioTop: string; tituloDias: string; vacioGrafico: string }
> = {
  hoy: {
    ventas: 'Ventas de hoy',
    neto: 'Neto del día',
    top: 'Lo más vendido hoy',
    vacioTop: 'Aún no hay ventas hoy',
    tituloDias: 'Ventas de la semana',
    vacioGrafico: 'Sin ventas esta semana todavía',
  },
  ayer: {
    ventas: 'Ventas de ayer',
    neto: 'Neto del día',
    top: 'Lo más vendido ayer',
    vacioTop: 'No hubo ventas ayer',
    tituloDias: 'Ventas de ayer',
    vacioGrafico: 'No hubo ventas ayer',
  },
  semana: {
    ventas: 'Ventas de la semana',
    neto: 'Neto de lunes a hoy',
    top: 'Lo más vendido esta semana',
    vacioTop: 'Aún no hay ventas esta semana',
    tituloDias: 'Ventas de la semana',
    vacioGrafico: 'Sin ventas esta semana todavía',
  },
  mes: {
    ventas: 'Ventas del mes',
    neto: 'Neto del mes',
    top: 'Lo más vendido este mes',
    vacioTop: 'Aún no hay ventas este mes',
    tituloDias: 'Ventas del mes',
    vacioGrafico: 'Sin ventas este mes todavía',
  },
};

export type IdTarjeta = 'grafico' | 'atencion' | 'actividad' | 'cobros' | 'sucursales' | 'top' | 'accesos';

export const NOMBRES_TARJETA: Record<IdTarjeta, string> = {
  grafico: 'Gráfico de ventas',
  atencion: 'Necesita tu atención',
  actividad: 'Actividad reciente',
  cobros: 'Cobros por medio de pago',
  sucursales: 'Por sucursal',
  top: 'Lo más vendido',
  accesos: 'Accesos',
};

export const ORDEN_TARJETAS: IdTarjeta[] = ['grafico', 'atencion', 'actividad', 'cobros', 'top', 'accesos', 'sucursales'];

/** Lectura guardada en el navegador sin romper si el almacenamiento falla o trae basura. */
export function leerGuardado<T>(almacen: 'local' | 'sesion', clave: string): T | null {
  try {
    const bruto = (almacen === 'local' ? localStorage : sessionStorage).getItem(clave);
    return bruto === null ? null : (JSON.parse(bruto) as T);
  } catch {
    return null;
  }
}

export function guardar(almacen: 'local' | 'sesion', clave: string, valor: unknown): void {
  try {
    (almacen === 'local' ? localStorage : sessionStorage).setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: la preferencia solo vale mientras la pantalla está abierta */
  }
}

export interface Acceso {
  titulo: string;
  desc: string;
  ruta: string;
  icono: string;
  tono: 'grafito' | 'marca' | 'exito' | 'neutro';
}

/** Accesos de todos los días que el rol puede usar; «Pedidos web» solo aparece si hay alguno por atender. */
export function construirAccesos(puede: (roles: string[]) => boolean, pedidosWeb: ResumenPedidosWeb | null): Acceso[] {
  const todos: { acceso: Acceso; roles: string[] }[] = [
    {
      acceso: { titulo: 'Vender', desc: 'Boleta o factura', ruta: `${RUTA}/ventas`, icono: 'bi-receipt', tono: 'grafito' },
      roles: ROLES_VENTAS,
    },
    {
      acceso: { titulo: 'Cotizar', desc: 'PDF y WhatsApp', ruta: `${RUTA}/cotizaciones`, icono: 'bi-file-earmark-ruled', tono: 'marca' },
      roles: ROLES_VENTAS,
    },
    {
      acceso: { titulo: 'Recibir mercadería', desc: 'Entrada a almacén', ruta: `${RUTA}/recepcion`, icono: 'bi-box-arrow-in-down', tono: 'exito' },
      roles: ROLES_RECEPCION,
    },
    {
      acceso: { titulo: 'Cerrar caja', desc: 'Arqueo del turno', ruta: `${RUTA}/caja-sesion`, icono: 'bi-cash-stack', tono: 'neutro' },
      roles: ROLES_VENTAS,
    },
  ];
  if (pedidosWeb?.total) {
    const n = pedidosWeb.total;
    todos.unshift({
      acceso: {
        titulo: 'Pedidos web',
        desc: n === 1 ? '1 por atender' : `${n} por atender`,
        ruta: `${RUTA}/pedidos`,
        icono: 'bi-bag-check',
        tono: 'marca',
      },
      roles: ROLES_PEDIDOS,
    });
  }
  return todos.filter((a) => puede(a.roles)).map((a) => a.acceso);
}

export interface FilaAtencion {
  id: string;
  tono: 'peligro' | 'aviso';
  etiqueta: string;
  texto: string;
  /** `texto` partido para pintar la cantidad inicial en negrita (R18); `cantidad` es null si no empieza con número. */
  cantidad: string | null;
  resto: string;
  detalle?: string;
  accion?: string;
  ruta?: string;
}

/**
 * Separa la cantidad con la que empieza un texto («3 comprobantes…» → «3» + «comprobantes…»).
 * Si no empieza con un número («Certificado…», «S/ 2,140.00…») no parte nada.
 */
export function partirCantidad(texto: string): { cantidad: string | null; resto: string } {
  const m = /^(\d[\d.,]*)\s+/.exec(texto);
  return m ? { cantidad: m[1], resto: texto.slice(m[0].length) } : { cantidad: null, resto: texto };
}

export interface ProductoTop {
  nombre: string;
  unidades: string;
  ancho: number;
  monto: number;
}

/** Comparación de un indicador con la semana anterior, lista para pintar. */
export interface DeltaVista {
  tipo: 'sube' | 'baja' | 'igual' | 'sin-referencia';
  /** ▲, ▼ o = (vacío si no hay referencia). */
  signo: string;
  texto: string;
  /** Palabra para lectores de pantalla («Sube»). */
  lector: string;
  /** Con qué se compara («vs. la semana pasada a esta hora»); vacío si no hay referencia. */
  referencia: string;
}

/** Un medio de pago del turno en la barra apilada. */
export interface CobroMedio {
  nombre: string;
  total: number;
  cobros: number;
  porcentaje: number;
  tono: 'efectivo' | 'billetera' | 'tarjeta' | 'transferencia' | 'otro';
}

export interface FilaActividad {
  id: number;
  numero: string;
  tipo: string;
  cliente: string;
  creadoEn: string;
  total: number;
  estado: string;
  tono: 'exito' | 'aviso' | 'peligro' | 'info' | 'neutro';
}

export interface FilaSucursal {
  nombre: string;
  total: number | null;
  turnos: number;
  ancho: number;
}

/** Lo que alimenta «Necesita tu atención» (null = no se leyó o el rol no lo ve). */
export interface EntradaAtencion {
  estadoFiscal: EstadoFiscalGlobal | null;
  veDocumentos: boolean;
  vePedidos: boolean;
  veFiscalPanel: boolean;
  veInventario: boolean;
  veStock: boolean;
  veCxc: boolean;
  cpeAtencion: number | null;
  pedidosWeb: ResumenPedidosWeb | null;
  sinStock: number | null;
  bajoStock: number | null;
  cxcVencidoCuentas: number | null;
  cxcVencidoMonto: number | null;
  cxcParcial: boolean;
}

/** Convierte la comparación en lo que se pinta (signo, texto y lo que leen los lectores de pantalla). */
export function vistaDelta(d: ReturnType<typeof delta>, referencia: string): DeltaVista {
  switch (d.tipo) {
    case 'sube':
      return { tipo: 'sube', signo: '▲', texto: `${d.porcentaje} %`, lector: 'Sube', referencia };
    case 'baja':
      return { tipo: 'baja', signo: '▼', texto: `${d.porcentaje} %`, lector: 'Baja', referencia };
    case 'igual':
      return { tipo: 'igual', signo: '=', texto: 'sin cambio', lector: '', referencia };
    default:
      return { tipo: 'sin-referencia', signo: '', texto: 'sin datos de la semana pasada', lector: '', referencia: '' };
  }
}

/** Color de un medio de pago según su nombre. */
export function tonoDeMedio(metodo: string): CobroMedio['tono'] {
  if (/efectivo/i.test(metodo)) return 'efectivo';
  if (/yape|plin/i.test(metodo)) return 'billetera';
  if (/tarjeta|visa|master|d[eé]bito|cr[eé]dito/i.test(metodo)) return 'tarjeta';
  if (/transfer|dep[oó]sito|banco/i.test(metodo)) return 'transferencia';
  return 'otro';
}

/** Cobros del turno por medio de pago, de mayor a menor, con su parte del total en %. */
export function construirCobros(metodos: { metodo?: string; total?: number | string; cantidad?: number | string }[]): { cobros: CobroMedio[]; total: number } {
  const total = metodos.reduce((s, m) => s + Math.max(0, numero(m.total)), 0);
  const cobros = metodos
    .filter((m) => numero(m.total) > 0)
    .map((m) => ({
      nombre: (m.metodo || '').trim() || 'Otro medio',
      total: numero(m.total),
      cobros: numero(m.cantidad),
      porcentaje: total > 0 ? Math.round((numero(m.total) / total) * 100) : 0,
      tono: tonoDeMedio(m.metodo || ''),
    }))
    .sort((a, b) => b.total - a.total);
  return { cobros, total };
}

/** Últimos comprobantes con su estado SUNAT en palabras. */
export function construirActividad(filas: ComprobanteFila[]): FilaActividad[] {
  return filas.map((c) => ({
    id: c.id_comprobante,
    numero: c.numero_formateado || `${c.serie}-${c.numero}`,
    tipo: c.tipo_nombre,
    cliente: (c.cliente_denominacion || '').trim() || 'Cliente varios',
    creadoEn: c.creado_en,
    total: numero(c.total),
    estado: textoEstadoSunat(c.estado_sunat, c.anulado),
    tono: tonoEstadoSunat(c.estado_sunat, c.anulado),
  }));
}

/** Nombre, total y barra proporcional de cada sucursal. */
export function construirSucursales(r: ResumenSucursalesCaja | null): FilaSucursal[] {
  const lista = r?.sucursales ?? [];
  const maximo = Math.max(0, ...lista.map((s) => numero(s.ventas_total)));
  return lista.map((s) => ({
    nombre: s.nombre || 'Sin sucursal',
    total: s.ventas_total == null ? null : numero(s.ventas_total),
    turnos: numero(s.turnos),
    ancho: maximo > 0 ? Math.max(3, Math.round((numero(s.ventas_total) / maximo) * 100)) : 0,
  }));
}

/** Los cuatro productos más vendidos con el largo de su barra. */
export function construirTopProductos(rep: ReporteVentasResumen): ProductoTop[] {
  const lista = rep.top_productos_vendidos ?? [];
  const maximo = Math.max(0, ...lista.map((p) => numero(p.cantidad)));
  return lista.slice(0, 4).map((p) => {
    const cantidad = numero(p.cantidad);
    return {
      nombre: (p.producto || '').trim() || 'Producto sin descripción',
      unidades: `${cantidad.toLocaleString('es-PE', { maximumFractionDigits: 2 })} ${cantidad === 1 ? 'unidad' : 'unidades'}`,
      ancho: maximo > 0 ? Math.max(4, Math.round((cantidad / maximo) * 100)) : 0,
      monto: numero(p.total),
    };
  });
}

/**
 * Cosas que conviene resolver, armadas con lo que ya se lee. El estado fiscal sale del mismo
 * servicio que usa la barra superior (se renueva solo; aquí solo se lee).
 */
export function construirFilasAtencion(e: EntradaAtencion): FilaAtencion[] {
  const filas: Omit<FilaAtencion, 'cantidad' | 'resto'>[] = [];
  const estadoFiscal = e.estadoFiscal;

  if (e.veDocumentos && e.cpeAtencion) {
    filas.push({
      id: 'cpe',
      tono: 'peligro',
      etiqueta: 'SUNAT',
      texto:
        e.cpeAtencion === 1
          ? '1 comprobante necesita atención'
          : `${e.cpeAtencion} comprobantes necesitan atención`,
      detalle: 'Pendientes de envío o con error',
      accion: 'Revisar',
      ruta: `${RUTA}/doc`,
    });
  }

  if (e.vePedidos && e.pedidosWeb?.total) {
    const { pendientes, pagados, total } = e.pedidosWeb;
    const partes: string[] = [];
    if (pagados) partes.push(pagados === 1 ? '1 pagado, a preparar' : `${pagados} pagados, a preparar`);
    if (pendientes) partes.push(pendientes === 1 ? '1 por cobrar' : `${pendientes} por cobrar`);
    filas.push({
      id: 'pedidos-web',
      tono: 'aviso',
      etiqueta: 'Pedidos',
      texto: total === 1 ? '1 pedido web por preparar' : `${total} pedidos web por preparar`,
      detalle: partes.join(' · '),
      accion: 'Ver',
      ruta: `${RUTA}/pedidos`,
    });
  }

  if (estadoFiscal) {
    if (estadoFiscal.bloqueo) {
      filas.push({
        id: 'fiscal-bloqueo',
        tono: 'peligro',
        etiqueta: 'Fiscal',
        texto: 'SUNAT detuvo la emisión',
        detalle: estadoFiscal.bloqueo.motivo,
        accion: e.veFiscalPanel ? 'Ver' : undefined,
        ruta: e.veFiscalPanel ? '/dashboard/facturacion-sunat' : undefined,
      });
    } else if (estadoFiscal.emision_activa === false) {
      filas.push({
        id: 'fiscal-inactiva',
        tono: 'aviso',
        etiqueta: 'Fiscal',
        texto: 'La emisión electrónica está detenida',
        detalle: estadoFiscal.motivo || 'Las ventas se registran sin comprobante.',
        accion: e.veFiscalPanel ? 'Ver' : undefined,
        ruta: e.veFiscalPanel ? '/dashboard/facturacion-sunat' : undefined,
      });
    }
    const vencidos = estadoFiscal.plazos?.vencidos ?? 0;
    if (vencidos > 0) {
      filas.push({
        id: 'fiscal-plazos',
        tono: 'peligro',
        etiqueta: 'Fiscal',
        texto:
          vencidos === 1
            ? '1 comprobante fuera del plazo de envío'
            : `${vencidos} comprobantes fuera del plazo de envío`,
        detalle: 'Revísalos en Facturación SUNAT',
        accion: e.veFiscalPanel ? 'Ver' : undefined,
        ruta: e.veFiscalPanel ? '/dashboard/facturacion-sunat' : undefined,
      });
    }
    const cert = estadoFiscal.certificado;
    if (cert?.vencido) {
      filas.push({
        id: 'fiscal-cert',
        tono: 'peligro',
        etiqueta: 'Fiscal',
        texto: 'El certificado digital está vencido',
        detalle: 'Sin certificado vigente no se pueden emitir comprobantes',
        accion: e.veFiscalPanel ? 'Ver' : undefined,
        ruta: e.veFiscalPanel ? '/dashboard/facturacion-sunat' : undefined,
      });
    } else if (cert?.cargado && cert.dias_para_vencer != null && cert.dias_para_vencer <= 30) {
      filas.push({
        id: 'fiscal-cert',
        tono: 'aviso',
        etiqueta: 'Fiscal',
        texto:
          cert.dias_para_vencer <= 0
            ? 'El certificado digital vence hoy'
            : `El certificado digital vence en ${cert.dias_para_vencer} ${cert.dias_para_vencer === 1 ? 'día' : 'días'}`,
        detalle: 'Renuévalo antes para no detener la emisión',
        accion: e.veFiscalPanel ? 'Ver' : undefined,
        ruta: e.veFiscalPanel ? '/dashboard/facturacion-sunat' : undefined,
      });
    }
  }

  const rutaStock = e.veInventario ? `${RUTA}/inventario` : `${RUTA}/stock`;
  if (e.veStock && e.sinStock) {
    filas.push({
      id: 'sin-stock',
      tono: 'peligro',
      etiqueta: 'Stock',
      texto:
        e.sinStock === 1 ? '1 producto sin stock' : `${e.sinStock} productos sin stock`,
      accion: 'Reponer',
      ruta: rutaStock,
    });
  }
  if (e.veStock && e.bajoStock) {
    filas.push({
      id: 'bajo-stock',
      tono: 'aviso',
      etiqueta: 'Stock',
      texto:
        e.bajoStock === 1
          ? '1 producto con stock bajo'
          : `${e.bajoStock} productos con stock bajo`,
      detalle: 'Por debajo del mínimo',
      accion: 'Reponer',
      ruta: rutaStock,
    });
  }

  if (e.veCxc && e.cxcVencidoCuentas) {
    filas.push({
      id: 'cxc',
      tono: 'peligro',
      etiqueta: 'Cobranza',
      texto:
        e.cxcVencidoCuentas === 1
          ? '1 cuenta por cobrar vencida'
          : `${e.cxcVencidoCuentas} cuentas por cobrar vencidas`,
      detalle: e.cxcVencidoMonto != null ? `${e.cxcParcial ? 'Al menos ' : ''}${formatoSoles(e.cxcVencidoMonto)} por cobrar` : undefined,
      accion: 'Cobrar',
      ruta: `${RUTA}/cuentas-por-cobrar`,
    });
  }

  return filas.map((f) => ({ ...f, ...partirCantidad(f.texto) }));
}
