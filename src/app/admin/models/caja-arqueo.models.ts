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
