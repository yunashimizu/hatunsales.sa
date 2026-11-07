export interface MetodoEsperado {
  clave: string;
  id_metodo: number | null;
  nombre: string;
  categoria: string;
  esperado: number;
}

export interface ArqueoResumen {
  id_arqueo: number;
  codigo: string;
  tipo: 'parcial' | 'cierre';
  fecha: string;
  efectivo_esperado: number;
  efectivo_contado: number;
  diferencia: number;
  mensaje: string;
  hay_diferencia: boolean;
  id_cierre: number | null;
}

export interface ArqueoEsperado {
  apertura: { id_apertura: number; abierta: boolean; caja_nombre: string };
  efectivo: {
    monto_inicial: number;
    ventas: number;
    abonos: number;
    ingresos: number;
    egresos: number;
    esperado: number;
  };
  otros_medios: MetodoEsperado[];
  credito: { ventas: number; operaciones: number };
  total_cobrado: number;
  denominaciones: { tipo: 'billete' | 'moneda'; denominacion: number; etiqueta: string }[];
  medios_declarables: { id_metodo: number; nombre: string; categoria: string }[];
  tolerancia: number;
  ultimo_arqueo: ArqueoResumen | null;
  generado_en: string;
}

export interface RegistrarArqueo {
  id_apertura: number;
  tipo: 'parcial' | 'cierre';
  denominaciones?: { tipo: 'billete' | 'moneda'; denominacion: number; cantidad: number }[];
  efectivo_contado?: number;
  medios: { id_metodo: number; declarado: number }[];
  observacion?: string;
  clave_idempotencia?: string;
}

export interface MovimientoCaja {
  id_movimiento: number;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  descripcion: string;
  fecha: string;
  usuario_nombre: string | null;
}

/* ── Arqueo por sucursal (T3): contrato de GET /caja/aperturas y /caja/resumen-sucursales ── */

/** Un turno del listado paginado. `monto_inicial` es null en los turnos antiguos («sin dato»). */
export interface TurnoCajaListado {
  id_apertura: number;
  id_caja: number;
  caja_nombre: string;
  id_sucursal: number | null;
  sucursal_nombre: string | null;
  id_usuario: number | null;
  usuario_nombre: string | null;
  abierta_en: string;
  cerrada_en: string | null;
  monto_inicial: number | null;
  efectivo_esperado: number | null;
  efectivo_contado: number | null;
  diferencia: number | null;
  estado: 'abierto' | 'cerrado';
}

export interface ListadoTurnosCaja {
  items: TurnoCajaListado[];
  total: number;
  pagina: number;
  por_pagina: number;
}

/** Filtros de GET /caja/aperturas. Las fechas son `AAAA-MM-DD` (días de Lima). */
export interface FiltroTurnosCaja {
  id_sucursal?: number | null;
  id_caja?: number | null;
  id_usuario?: number | null;
  desde?: string | null;
  hasta?: string | null;
  pagina?: number;
  por_pagina?: number;
}

export interface MontoPorMetodo {
  metodo: string;
  monto: number;
}

/** Totales de una sucursal (o del conjunto). Los importes pueden ser null si el servidor no los puede calcular. */
export interface TotalesCaja {
  turnos: number;
  turnos_abiertos: number;
  efectivo_inicial: number | null;
  ventas_total: number | null;
  por_metodo: MontoPorMetodo[];
  efectivo_esperado: number | null;
  efectivo_contado: number | null;
  diferencia: number | null;
}

export interface ResumenSucursalCaja extends TotalesCaja {
  /** null = «Sin sucursal». */
  id_sucursal: number | null;
  nombre: string;
}

export interface ResumenSucursalesCaja {
  desde: string;
  hasta: string;
  sucursales: ResumenSucursalCaja[];
  total: TotalesCaja;
}
