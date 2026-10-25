/**
 * Tipos del API /fiscal/* (backend: src/sunat/admin, src/sunat/emision y src/sunat/config).
 * Los nombres de los campos son los del servidor (snake_case).
 */

export type AmbienteFiscal = 'beta' | 'produccion';
/** 'sunat_directo' = emisión de producción activa; 'nubefact' = valor histórico que hoy significa «sin emisión electrónica». */
export type ProveedorFiscal = 'nubefact' | 'sunat_directo';
export type ModoBoletas = 'individual' | 'resumen';
export type ModoReglas2027 = 'auto' | 'true' | 'false';
export type TipoArchivoEnvio = 'xml_original' | 'xml_firmado' | 'zip' | 'cdr_xml' | 'cdr_zip';
export type EmisorBeta = EmisorSunat & { ruc: string };

/** Estados de un envío de factura, boleta o nota (fiscal_envios.estado). */
export const ESTADOS_SUNAT = [
  'NO_ENVIADO',
  'POR_RESUMIR',
  'ENVIANDO',
  'PENDIENTE_REENVIO',
  'TICKET_PENDIENTE',
  'ACEPTADO',
  'ACEPTADO_OBS',
  'RECHAZADO',
  'EXCEPCION',
  'ERROR_CONFIG',
  'BAJA_PENDIENTE',
  'ANULADO',
] as const;
export type EstadoSunat = (typeof ESTADOS_SUNAT)[number];

export interface EstadoPosBetaFiscal {
  habilitado: boolean;
  activo: boolean;
  ambiente: AmbienteFiscal;
  listo: boolean;
  ruc_emisor_beta: string;
  ruc_certificado_beta: string | null;
  advertencia: string;
}

export interface SeriesSunat {
  factura: string;
  boleta: string;
  nc_factura: string;
  nc_boleta: string;
  nd_factura: string;
  nd_boleta: string;
  gre_remitente: string;
}

export interface EmisorSunat {
  razon_social: string;
  nombre_comercial: string;
  direccion: string;
  ubigeo: string;
  distrito: string;
  provincia: string;
  departamento: string;
  codigo_establecimiento: string;
}

/** Lo que guarda el formulario «Operación y series» (el ambiente y el proveedor se cambian desde la activación). */
export interface OperacionFiscal {
  boletas_modo: ModoBoletas;
  envio_en_linea: boolean;
  aplicar_reglas_2027: ModoReglas2027;
  codigo_producto_defecto: string;
  series: SeriesSunat;
}

export interface ConfigGre {
  activa: boolean;
  correlativo_inicial: number;
  partida: { ubigeo: string; direccion: string; codigo_establecimiento: string };
}

export interface CertificadoFiscal {
  id: number;
  ambiente: AmbienteFiscal;
  titular: string | null;
  ruc: string | null;
  nombre_archivo: string | null;
  vigente_hasta: string;
  dias_para_vencer: number;
  vencido: boolean;
  autofirmado: boolean;
  advertencias: string[];
}

export interface ItemChecklistFiscal {
  /** Código estable del requisito (certificado_produccion, usuario_sol, confirmacion.ruc_habido…). */
  codigo: string;
  titulo: string;
  ok: boolean;
  /** Qué está mal (null si ok). */
  detalle: string | null;
  /** Qué hacer para resolverlo (null si ok). */
  accion: string | null;
}

export interface ChecklistFiscal {
  titulo: string;
  listo: boolean;
  faltantes?: string[];
  items: ItemChecklistFiscal[];
}

/** Declaraciones sobre lo que solo se ve en SOL (checklist de activación, D1.4). */
export interface ConfirmacionesActivacion {
  emisor_electronico_sol: boolean;
  certificado_en_sol: boolean;
  usuario_sol_secundario: boolean;
  ruc_habido: boolean;
}

/** Interruptor de emisión abierto: SUNAT rechazó la credencial SOL o el certificado de ese ambiente. */
export interface BloqueoEmision {
  codigo: string;
  motivo: string;
  /** ISO 8601. */
  fecha: string;
}

/** GET /fiscal/configuracion (el PUT devuelve lo mismo más `advertencias`). */
export interface ConfiguracionSunat {
  proveedor: ProveedorFiscal;
  proveedor_efectivo: ProveedorFiscal;
  ambiente: AmbienteFiscal;
  boletas_modo: ModoBoletas;
  envio_en_linea: boolean;
  tareas_activas: boolean;
  aplicar_reglas_2027: ModoReglas2027;
  codigo_producto_defecto: string | null;
  series: SeriesSunat;
  emisor: EmisorSunat & { ruc: string };
  sol: { usuario: string | null; tiene_clave: boolean };
  gre: ConfigGre & {
    partida: ConfigGre['partida'] & {
      heredada_del_emisor: Record<keyof ConfigGre['partida'], boolean>;
    };
    credenciales: { tiene_credenciales: boolean; client_id_mascara: string | null };
  };
  certificado: Record<AmbienteFiscal, CertificadoFiscal | null>;
  confirmacion_no_ose: { nombre: string | null; fecha: string } | null;
  aviso_legal_ose: { titulo: string; texto: string; confirmacion: string; normas: string[] };
  /** Primer número libre de cada serie de comprobante configurada (1 = desde el principio). */
  correlativo_inicial: Record<string, number>;
  /** false hasta que el administrador guarde el correlativo inicial (aunque sea con 1 en todas). */
  correlativo_inicial_revisado: boolean;
  /** El administrador confirmó que el certificado de producción (sin RUC legible) es del emisor. */
  cert_ruc_confirmado: boolean;
  confirmaciones: ConfirmacionesActivacion;
  emision_bloqueada: Record<AmbienteFiscal, BloqueoEmision | null>;
  estado: {
    esquema: { listo: boolean; mensaje: string | null; faltantes: string[] };
    cifrado_disponible: boolean;
    cifrado_problema: string | null;
    listo_para_produccion: boolean;
    gre_lista_para_produccion: boolean;
    advertencias: string[];
    checklist: { cpe: ChecklistFiscal; gre: ChecklistFiscal };
    pruebas_beta: { listo: boolean; faltantes: string[] };
  };
  /** Solo en la respuesta del PUT: avisos no bloqueantes del cambio. */
  advertencias?: string[];
}

/** Cuerpo del PUT /fiscal/configuracion: solo cambia lo que se envía. */
export interface CambiosConfiguracionFiscal {
  proveedor?: ProveedorFiscal;
  ambiente?: AmbienteFiscal;
  boletas_modo?: ModoBoletas;
  envio_en_linea?: boolean;
  tareas_activas?: boolean;
  aplicar_reglas_2027?: ModoReglas2027;
  codigo_producto_defecto?: string;
  series?: Partial<SeriesSunat>;
  emisor?: EmisorSunat;
  gre?: ConfigGre;
  confirmo_no_ose?: boolean;
  /** Solo series configuradas: { "F001": 120 } (entero ≥ 1 = primer número libre). */
  correlativo_inicial?: Record<string, number>;
  cert_ruc_confirmado?: boolean;
  confirmaciones?: Partial<ConfirmacionesActivacion>;
}

export interface ResultadoPruebaFiscal {
  ok: boolean;
  ambiente: AmbienteFiscal;
  documento: 'cpe' | 'gre';
  tiempo_ms: number;
  envio_disponible: boolean;
  pasos: {
    paso: string;
    ok: boolean | null;
    detalle: string;
    codigo?: string;
    envio_id?: number;
    archivos?: TipoArchivoEnvio[];
  }[];
}

/** POST /fiscal/probar-credenciales-produccion: getStatusCdr de un comprobante inexistente (no emite ni numera). */
export interface ResultadoPruebaCredenciales {
  ok: boolean;
  /** Código de SUNAT (statusCode o Fault) o el código local si no se llegó a consultar. */
  codigo: string | null;
  mensaje: string;
  /** Texto de SUNAT, si respondió. */
  detalle: string | null;
  consulta: { tipo: '01'; serie: string; numero: number };
  tiempo_ms: number;
}

/** POST /fiscal/emision/reanudar. */
export interface ResultadoReanudacion {
  ambiente: AmbienteFiscal;
  /** false si la emisión no estaba detenida (no se cambió nada). */
  reanudada: boolean;
  bloqueo_anterior: BloqueoEmision | null;
}

export interface AuditoriaFiscal {
  id_auditoria: number;
  creado_en: string;
  id_usuario: number | null;
  accion: string;
  entidad: string | null;
  detalle: Record<string, unknown> | null;
}

/** Fila de GET /fiscal/envios y GET /fiscal/envios/:id. */
export interface EnvioSunat {
  id_envio: number;
  ambiente: AmbienteFiscal;
  /** Catálogo 01: 01 factura, 03 boleta, 07 nota de crédito, 08 nota de débito. */
  tipo_documento: string;
  nombre_archivo: string;
  estado: string;
  codigo_sunat: string | null;
  mensaje_sunat: string | null;
  /** Qué hacer a continuación según la respuesta de SUNAT (REINTENTAR, RECUPERAR_CDR…). */
  accion_sunat: string | null;
  id_comprobante: number | null;
  creado_en: string;
  archivos: TipoArchivoEnvio[];
  serie?: string | null;
  numero?: number | null;
  intento?: number;
  proximo_intento_en?: string | null;
  /** Mientras no venza, otro proceso está hablando con SUNAT por este envío. */
  bloqueado_hasta?: string | null;
  actualizado_en?: string | null;
}

export interface FiltroEnvios {
  ambiente?: AmbienteFiscal | '';
  estado?: string;
  tipo?: string;
  id_comprobante?: number;
  pagina?: number;
  por_pagina?: number;
}

export interface PaginaEnvios {
  datos: EnvioSunat[];
  total: number;
  pagina: number;
  por_pagina: number;
}

/** Respuesta de reintentar, recuperar CDR y confirmar aceptado. */
export interface ResultadoEnvio {
  ambiente: AmbienteFiscal;
  id_envio: number;
  estado: string;
  aceptado: boolean;
  codigo: string | null;
  mensaje: string | null;
  observaciones?: { codigo: string; descripcion: string }[];
  accion?: string | null;
  archivos?: TipoArchivoEnvio[];
  id_comprobante?: number | null;
  serie?: string;
  numero?: number;
}

/** GET /fiscal/estado tal como lo devuelve el servidor (lo ven admin, vendedor, caja y consulta). */
export interface EstadoFiscalApi {
  proveedor: ProveedorFiscal;
  proveedor_efectivo: ProveedorFiscal;
  ambiente: AmbienteFiscal;
  semaforo: 'verde' | 'amarillo' | 'rojo';
  listo: boolean;
  faltantes: string[];
  advertencias: string[];
  certificado: {
    cargado: boolean;
    ambiente: AmbienteFiscal | null;
    dias_para_vencer: number | null;
    vencido: boolean;
    autofirmado: boolean | null;
    alerta: string | null;
  };
  /** null si el servidor no pudo determinarlo (p. ej. falló la lectura de la cola). */
  emision: { activa: boolean; ambiente: AmbienteFiscal; codigo?: string; motivo?: string } | null;
  bloqueo: BloqueoEmision | null;
  cola: { pendientes?: number; inciertos?: number } | null;
  plazos: { vencen_hoy?: number; vencidos?: number } | null;
  tareas: { activas: boolean; ultima_ejecucion: string | null } | null;
  evaluado_en: string;
}

/**
 * Estado fiscal resumido que expone FiscalEstadoService (chip de la cabecera, panel fiscal y POS).
 * `emision_activa` es null cuando el servidor no pudo confirmarlo: trátelo como «sin confirmar» y no
 * prometa comprobante.
 */
export interface EstadoFiscalGlobal {
  ambiente: AmbienteFiscal;
  emision_activa: boolean | null;
  /** Código del motivo cuando la emisión no está activa (FISCAL_BETA_POS_APAGADO, FISCAL_EMISION_INACTIVA, FISCAL_EMISION_BLOQUEADA, FISCAL_MIGRACION_PENDIENTE, FISCAL_LECTURA_ERROR). */
  codigo: string | null;
  /** Texto para el usuario cuando la emisión no está activa (las ventas se registran sin comprobante). */
  motivo: string | null;
  bloqueo: BloqueoEmision | null;
  /** Envíos del ambiente vigente por reintentar y sin respuesta de SUNAT; null si no se pudo contar. */
  cola: { pendientes: number; inciertos: number } | null;
  /** Comprobantes no aceptados cuyo plazo de envío vence hoy o ya venció; null si no se pudo contar. */
  plazos: { vencen_hoy: number; vencidos: number } | null;
  /** Certificado del ambiente vigente (en BETA, el de pruebas o, si no hay, el de producción). */
  certificado: {
    cargado: boolean;
    dias_para_vencer: number | null;
    vencido: boolean;
    autofirmado: boolean | null;
  };
  tareas: { activas: boolean; ultima_ejecucion: string | null } | null;
  semaforo: 'verde' | 'amarillo' | 'rojo';
  evaluado_en: string;
}
