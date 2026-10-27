/**
 * Contratos compartidos de los documentos electrónicos de una venta (PLAN V3, D10): los usan
 * Documentos, Guías de remisión y Ventas. El backend responde exactamente con estas formas
 * (GET /venta/:id/documentos, GET /venta/sin-comprobante y GET /venta).
 */

/** Estado del comprobante en SUNAT, igual que `comprobantes.estado_sunat` del backend. */
export type EstadoSunat =
  | 'NO_ENVIADO'
  | 'POR_RESUMIR'
  | 'ENVIANDO'
  | 'PENDIENTE_REENVIO'
  | 'TICKET_PENDIENTE'
  | 'ACEPTADO'
  | 'ACEPTADO_OBS'
  | 'RECHAZADO'
  | 'EXCEPCION'
  | 'ERROR_CONFIG'
  | 'BAJA_PENDIENTE'
  | 'ANULADO';

/** Acción siguiente que sugiere la respuesta de SUNAT. */
export type AccionSunat =
  | 'NINGUNA'
  | 'REINTENTAR'
  | 'CORREGIR_Y_REENVIAR'
  | 'EMITIR_NUEVO'
  | 'RECUPERAR_CDR'
  | 'REVISAR_CONFIG'
  | 'CONSULTAR_TICKET';

export type AmbienteFiscal = 'beta' | 'produccion';

/** Tono visual de un estado (se traduce a las variantes exito/aviso/peligro/info/neutro de adm-*). */
export type TonoEstado = 'exito' | 'aviso' | 'peligro' | 'info' | 'neutro';

/** El estado SUNAT siempre se muestra en palabras, nunca el código crudo. */
export const TEXTO_ESTADO_SUNAT: Readonly<Record<EstadoSunat, string>> = {
  NO_ENVIADO: 'Sin enviar a SUNAT',
  POR_RESUMIR: 'Por informar en resumen diario',
  ENVIANDO: 'Enviando a SUNAT',
  PENDIENTE_REENVIO: 'Pendiente de reenvío',
  TICKET_PENDIENTE: 'En proceso en SUNAT',
  ACEPTADO: 'Aceptado por SUNAT',
  ACEPTADO_OBS: 'Aceptado con observaciones',
  RECHAZADO: 'Rechazado por SUNAT',
  EXCEPCION: 'Requiere revisión',
  ERROR_CONFIG: 'Error de configuración',
  BAJA_PENDIENTE: 'Baja en proceso',
  ANULADO: 'Anulado',
};

export const TONO_ESTADO_SUNAT: Readonly<Record<EstadoSunat, TonoEstado>> = {
  NO_ENVIADO: 'neutro',
  POR_RESUMIR: 'info',
  ENVIANDO: 'info',
  PENDIENTE_REENVIO: 'aviso',
  TICKET_PENDIENTE: 'info',
  ACEPTADO: 'exito',
  ACEPTADO_OBS: 'exito',
  RECHAZADO: 'peligro',
  EXCEPCION: 'peligro',
  ERROR_CONFIG: 'peligro',
  BAJA_PENDIENTE: 'aviso',
  ANULADO: 'neutro',
};

/** Texto del estado SUNAT; los comprobantes históricos (sin estado) y los anulados tienen el suyo. */
export function textoEstadoSunat(estado: string | null | undefined, anulado = false): string {
  if (anulado) return 'Anulado';
  if (!estado) return 'Sin estado SUNAT';
  return TEXTO_ESTADO_SUNAT[estado as EstadoSunat] ?? 'Estado desconocido';
}

export function tonoEstadoSunat(estado: string | null | undefined, anulado = false): TonoEstado {
  if (anulado || !estado) return 'neutro';
  return TONO_ESTADO_SUNAT[estado as EstadoSunat] ?? 'neutro';
}

/** Una acción posible sobre la venta: si no se puede, `motivo` explica por qué en palabras. */
export interface AccionDocumento {
  permitido: boolean;
  motivo?: string;
}

/** Comprobante (factura, boleta o nota) tal como aparece en los documentos de una venta. */
export interface ComprobanteDeVenta {
  id_comprobante: number;
  /** 1 factura, 2 boleta, 7 nota de crédito (ids de `tipo_comprobante`). */
  id_tipo: number;
  tipo_nombre: string;
  serie: string;
  numero: number;
  /** 'F001-00000012'. */
  numero_formateado: string;
  fecha_de_emision: string;
  total: number;
  /** 'emitido' | 'pendiente' | 'error'. */
  estado: string;
  anulado: boolean;
  estado_sunat: EstadoSunat | null;
  ambiente_fiscal: AmbienteFiscal | null;
  accion_sunat: AccionSunat | null;
  /** Mensaje de SUNAT o del sistema (último error o descripción del CDR). */
  mensaje: string | null;
  puede_reintentar: boolean;
  puede_recuperar_cdr: boolean;
  puede_confirmar_manual: boolean;
  puede_nota_credito: boolean;
  puede_anular: boolean;
}

/** Nota de crédito enlazada a la venta. */
export interface NotaDeVenta {
  id_comprobante: number;
  serie: string;
  numero: number;
  numero_formateado: string;
  /** Código del catálogo 09 ('01', '07'…) y su nombre. */
  motivo: string | null;
  motivo_nombre: string | null;
  total: number;
  estado: string;
  anulado: boolean;
  estado_sunat: EstadoSunat | null;
  /** 'ninguno' | 'devolucion' | 'anular_venta'; null si la BD aún no tiene la fase14. */
  efecto: string | null;
  /** true cuando SUNAT la aceptó y el stock / la cuenta por cobrar ya se ajustaron. */
  efectos_aplicados: boolean | null;
  /** Comprobante que modifica ('F001-00000012'). */
  doc_modificado: string | null;
}

/** Guía de remisión enlazada a la venta. */
export interface GuiaDeVenta {
  id_guia: number;
  serie: string | null;
  numero: number | null;
  numero_formateado: string | null;
  /** 'legacy' | 'borrador' | 'pendiente' | 'enviado' | 'aceptado' | 'rechazado' | 'anulado'. */
  estado: string;
  estado_texto: string;
  fecha_emision: string | null;
  /** Código del catálogo 20 ('01' venta…) y su nombre. */
  motivo: string | null;
  motivo_nombre: string | null;
}

/** GET /venta/:id/documentos */
export interface VentaDocumentosResponse {
  venta: {
    id: number;
    /** Fecha y hora en Lima (ISO 8601 con -05:00). */
    fecha: string;
    total: number;
    /** 'activa' | 'anulada'. */
    estado: string;
    cliente: { nombre: string; documento: string | null };
    pagos: { metodo: string; monto: number }[];
    a_credito: boolean;
    /** Saldo pendiente de la cuenta por cobrar (0 si se pagó al contado). */
    saldo_cxc: number;
  };
  /** Comprobante principal vigente (factura o boleta), o null si la venta no tiene. */
  comprobante: ComprobanteDeVenta | null;
  /** Comprobantes principales anulados o con error de la misma venta (historial). */
  comprobantes_anteriores: ComprobanteDeVenta[];
  notas: NotaDeVenta[];
  guias: GuiaDeVenta[];
  acciones: {
    emitir_comprobante: AccionDocumento;
    nota_credito: AccionDocumento;
    guia: AccionDocumento;
    anular: AccionDocumento;
  };
  /** Avisos en palabras: anulación en curso, nota en curso, comprobante incierto o fuera de plazo… */
  avisos: string[];
}

/** Fila de GET /venta/sin-comprobante */
export interface VentaSinComprobante {
  id_venta: number;
  fecha: string;
  total: number;
  cliente: string;
  documento_cliente: string | null;
  /** Último motivo por el que no se emitió (error del comprobante o de la emisión). */
  ultimo_error: string | null;
}

export interface Paginado<T> {
  datos: T[];
  total: number;
  pagina: number;
  por_pagina: number;
}

/** Filtros de GET /venta (historial). Las fechas son días de Lima (yyyy-mm-dd). */
export interface FiltroHistorialVentas {
  desde?: string;
  hasta?: string;
  /** Cliente, documento del cliente o serie-número del comprobante. */
  texto?: string;
  /** 'activa' | 'anulada'. */
  estado?: string;
  tiene_comprobante?: 'si' | 'no';
  /** 'mostrador' | 'tienda'. */
  origen?: string;
  pagina?: number;
  por_pagina?: number;
}

/**
 * Fila de GET /venta con filtros. Conserva los campos que el listado ya devolvía
 * (comprobante, comprobante_estado, id_comprobante) y agrega el estado documental.
 */
export interface VentaHistorialFila {
  id_venta: number;
  fecha: string;
  origen: string;
  id_cliente?: number;
  id_empresa?: number;
  cliente_denominacion: string;
  total: number;
  cantidad_items: number;
  /** 'activa' | 'anulada'. */
  estado: string;
  /** Medios de pago usados, separados por coma ('Efectivo, Tarjeta'). */
  metodos_pago: string;
  /** Serie-número del comprobante principal vigente. */
  comprobante?: string;
  comprobante_estado?: string;
  id_comprobante?: number;
  comprobante_tipo?: number | null;
  comprobante_estado_sunat?: EstadoSunat | null;
  cantidad_notas: number;
  cantidad_guias: number;
}

/* ===========================================================================
 * Comprobantes: resultado de SUNAT, detalle, nota de crédito y emisión de una venta
 * (Documentos). Gemelos de src/models/model/c-electronico/comprobante.response.ts y
 * nota-credito.response.ts del backend.
 * ======================================================================== */

/** Observación que SUNAT dejó en la constancia (CDR) de un comprobante aceptado con observaciones. */
export interface ObservacionSunat {
  codigo: string;
  descripcion: string;
}

/** Archivos guardados del último envío a SUNAT (GET /comprobante/:id/archivos/:tipo). */
export type TipoArchivoComprobante = 'xml_original' | 'xml_firmado' | 'zip' | 'cdr_xml' | 'cdr_zip';

/** Representación impresa: hoja A4 o ticket de 80 mm. */
export type FormatoPdfComprobante = 'a4' | 'ticket';

/**
 * Respuesta de una emisión o de una acción sobre su envío (reintentar, recuperar CDR, confirmar):
 * trae ya el resultado de SUNAT. `estado`: 'emitido' (aceptado), 'pendiente' (envío en curso) o 'error'.
 * Todos los campos son opcionales para que también sirva el comprobante de una venta del POS.
 */
export interface ResultadoComprobante {
  id_comprobante?: number;
  /** 1 factura, 2 boleta, 7 nota de crédito. */
  tipo_de_comprobante?: number;
  serie?: string;
  numero?: number;
  numero_formateado?: string;
  aceptada_sunat?: boolean;
  sunat_description?: string;
  sunat_responsecode?: string;
  sunat_observaciones?: ObservacionSunat[];
  cadena_qr?: string;
  codigo_hash?: string;
  anulado?: boolean;
  estado?: string;
  /** Motivo en palabras cuando SUNAT no lo aceptó (o el envío no terminó). */
  error?: string;
  proveedor_fiscal?: string;
  ambiente_fiscal?: string | null;
  estado_sunat?: string | null;
  id_envio_ultimo?: number;
  accion_sunat?: string | null;
  archivos?: string[];
  /** Aviso del ambiente («Prueba SUNAT BETA: sin validez tributaria.»). */
  aviso?: string | null;
  fecha_limite_envio?: string | null;
  id_venta?: number | null;
  id_comprobante_modificado?: number | null;
  doc_modificado?: string | null;
}

/** Último envío a SUNAT tal como lo muestra el detalle. */
export interface EnvioComprobante {
  id_envio: number;
  estado: string;
  codigo: string | null;
  mensaje: string | null;
  accion: string | null;
  intento: number | null;
}

/** Nota de crédito (o débito) emitida sobre el comprobante. */
export interface NotaEnlazada {
  id_comprobante: number;
  id_tipo: number;
  serie: string;
  numero: number;
  numero_formateado: string;
  motivo: string | null;
  total: number;
  /** 'aceptado' | 'emitido' | 'pendiente' | 'error' | 'anulado'. */
  estado: string;
  estado_sunat: string | null;
  anulado: boolean;
}

/** Guía de remisión enlazada al comprobante (va como documento relacionado). */
export interface GuiaEnlazada {
  id_guia: number;
  serie: string | null;
  numero: number | null;
  numero_formateado: string | null;
  estado: string | null;
  fecha_emision: string | null;
}

/** GET /comprobante/:id/detalle */
export interface ComprobanteDetalle {
  /** Emisor con el que se firmó el documento (en BETA, el de pruebas). */
  emisor: {
    ruc: string;
    razon_social: string;
    nombre_comercial?: string | null;
    direccion: string;
    ubicacion: string;
    logo_url: string;
    telefono?: string | null;
    email?: string | null;
  };
  id_comprobante: number;
  id_tipo?: number;
  tipo_nombre: string;
  serie: string;
  numero: number;
  numero_formateado: string;
  fecha_de_emision: string;
  fecha_de_vencimiento: string;
  hora_emision: string | null;
  moneda: { id_moneda: number; nombre: string; simbolo: string };
  receptor: {
    tipo_documento: number;
    numero_documento: string;
    denominacion: string;
    direccion: string;
    email: string;
  };
  items: {
    codigo: string;
    codigo_producto_sunat?: string | null;
    unidad_de_medida: string;
    descripcion: string;
    cantidad: number;
    valor_unitario: number;
    precio_unitario: number;
    descuento: number;
    subtotal: number;
    igv: number;
    total: number;
    tipo_de_igv?: number;
  }[];
  porcentaje_igv: number;
  totales: { gravada: number; exonerada: number; inafecta: number; descuento: number; igv: number; total: number };
  importe_en_letras: string;
  observaciones: string;
  /** 'aceptado' | 'emitido' | 'pendiente' | 'error' | 'anulado'. */
  estado: string;
  anulado: boolean;
  motivo_anulacion: string;
  enlace: string;
  enlace_pdf: string;
  cadena_qr: string | null;
  codigo_hash: string | null;
  sunat_description: string;
  sunat_responsecode?: string | null;
  sunat_observaciones: ObservacionSunat[];
  error_mensaje: string;
  proveedor_fiscal: string | null;
  ambiente_fiscal: string | null;
  estado_sunat: string | null;
  aceptada_sunat: boolean;
  id_envio_ultimo: number | null;
  id_venta: number | null;
  forma_pago: 'Contado' | 'Credito' | null;
  cuotas: { numero: number; monto: number; fecha_pago: string }[];
  fecha_limite_envio: string | null;
  vencido: boolean;
  envio: EnvioComprobante | null;
  /** Solo notas: comprobante que modifican. */
  referencia: {
    id_comprobante: number | null;
    /** Catálogo 01 del documento modificado ('01' factura, '03' boleta). */
    tipo: string;
    serie: string;
    numero: number;
    numero_formateado: string;
    motivo: string | null;
    motivo_descripcion: string | null;
    sustento: string | null;
  } | null;
  notas: NotaEnlazada[];
  guias: GuiaEnlazada[];
  archivos: string[];
  aviso: string | null;
  puede_reintentar: boolean;
  puede_recuperar_cdr: boolean;
  puede_confirmar_manual: boolean;
  puede_nota_credito: boolean;
  puede_anular: boolean;
}

/** Cómo arma el asistente cada motivo: todo el comprobante, unidades, descuento por línea o un importe. */
export type FormaNotaCredito = 'total' | 'items' | 'descuento_items' | 'monto';

/** Qué hace el sistema cuando SUNAT acepta la nota. */
export type EfectoNotaCredito = 'ninguno' | 'devolucion' | 'anular_venta';

/** Motivo del catálogo SUNAT (GET /comprobante/catalogos/motivos). */
export interface MotivoNotaCatalogo {
  codigo: string;
  nombre: string;
  forma: FormaNotaCredito;
  /** Catálogo 01 de los comprobantes que puede modificar ('01' factura, '03' boleta). */
  tipos: string[];
}

export interface CatalogoMotivosNota {
  nota_credito: MotivoNotaCatalogo[];
  nota_debito: MotivoNotaCatalogo[];
}

/** Motivo que el comprobante admite hoy (ya filtrado por el backend). */
export interface MotivoNotaCredito {
  codigo: string;
  nombre: string;
  forma: FormaNotaCredito;
  efecto: EfectoNotaCredito;
  /** Valor por defecto de reingresar_stock; null si el motivo no devuelve mercadería. */
  reingresar_stock: boolean | null;
  /** Advertencia propia del motivo (02: emita aparte el comprobante correcto). */
  aviso: string | null;
}

/** Línea del comprobante origen con lo que ya acreditaron sus notas vigentes. */
export interface ItemNotaCredito {
  id_item: number;
  id_producto: number | null;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  /** 1 gravado, 8 exonerado, 9 inafecto. */
  tipo_de_igv: number;
  cantidad_origen: number;
  cantidad_acreditada: number;
  cantidad_disponible: number;
  /** Precio unitario con IGV del origen. */
  precio_unitario: number;
  descuento_unitario: number;
  total_origen: number;
  /** Lo que todavía se puede acreditar de la línea, con IGV. */
  importe_disponible: number;
  /** Recargo por pago con tarjeta: no se elige, se acredita solo en proporción a lo devuelto. */
  es_recargo: boolean;
}

export interface NotaPrevia {
  id: number;
  serie: string;
  numero: number;
  numero_formateado: string;
  motivo: string | null;
  total: number;
  estado_sunat: string | null;
  /** Cuenta para el saldo: no anulada, sin error y no rechazada por SUNAT. */
  vigente: boolean;
  /** Su envío a SUNAT todavía no termina (otra nota no se puede emitir mientras tanto). */
  en_curso: boolean;
}

/** GET /comprobante/:id/nota-credito/contexto */
export interface ContextoNotaCredito {
  permitido: boolean;
  motivo_no_permitido?: string;
  origen: {
    id: number;
    tipo: string;
    serie: string;
    numero: number;
    numero_formateado: string;
    /** Fecha de emisión tal como se guardó (dd-mm-aaaa). */
    fecha: string;
    cliente: { tipo_documento: number; numero_documento: string; denominacion: string };
    moneda: 'PEN' | 'USD';
    total: number;
    ambiente_fiscal: string | null;
    estado_sunat: string | null;
  };
  /** Total del origen menos las notas de crédito vigentes. */
  saldo: number;
  items: ItemNotaCredito[];
  motivos: MotivoNotaCredito[];
  notas_previas: NotaPrevia[];
  venta?: {
    id: number;
    estado: string;
    a_credito: boolean;
    /** Lo que todavía se debe; una nota aceptada lo baja (hasta su total). */
    saldo_cxc: number;
    pagada_al_contado: boolean;
  };
  avisos: string[];
}

/** POST /comprobante/:id/nota-credito */
export interface SolicitudNotaCredito {
  /** Catálogo 09 de SUNAT. */
  motivo: string;
  /** Sustento que viaja en el XML (3 a 250 caracteres). */
  sustento: string;
  /** Motivo 07: unidades por ítem; motivo 05: descuento por ítem (con IGV). */
  items?: { id_item: number; cantidad?: number; descuento?: number }[];
  /** Motivos 09 y 10: importe con IGV. */
  monto?: number;
  /** Motivos con devolución: si al aceptarse la nota lo devuelto vuelve al almacén. */
  reingresar_stock?: boolean;
}

/** Respuesta de POST /comprobante/:id/nota-credito: la nota con el resultado de SUNAT. */
export interface NotaCreditoEmitida extends ResultadoComprobante {
  efecto: EfectoNotaCredito;
  /** true si SUNAT ya la aceptó y sus efectos (stock, cuenta por cobrar) quedaron aplicados. */
  efectos_aplicados: boolean;
  avisos: string[];
}

/**
 * anulada: quedó anulado (con la venta si la tenía). anulacion_en_curso: se emitió la nota de crédito
 * y se anula cuando SUNAT la acepte. anulacion_rechazada: SUNAT rechazó la nota; nada cambió.
 */
export type EstadoAnulacion = 'anulada' | 'anulacion_en_curso' | 'anulacion_rechazada';

/** Nota de crédito con la que se anula un comprobante aceptado. */
export interface NotaAnulacion {
  id_comprobante: number;
  serie: string;
  numero: number;
  numero_formateado: string;
  motivo: string;
  total: number;
  estado: string;
  estado_sunat: string | null;
  aceptada_sunat: boolean;
  error?: string;
}

/** POST /comprobante/anular */
export interface SolicitudAnularComprobante {
  id_comprobante: number;
  motivo: string;
  /** true = el administrador verificó el comprobante en SUNAT Operaciones en Línea (queda auditado). */
  confirmar_verificado_sol?: boolean;
  /** Con confirmar_verificado_sol: true si SUNAT lo tiene, false si no existe allí. */
  existe_en_sunat?: boolean;
  /** Qué verificó y dónde (obligatoria con confirmar_verificado_sol). */
  nota?: string;
}

export interface AnulacionComprobante {
  estado: EstadoAnulacion;
  id_comprobante: number;
  numero_formateado: string;
  id_venta: number | null;
  /** Estado de la venta después de la petición ('activa' | 'anulada'); null si no tiene venta. */
  venta_estado: string | null;
  nota?: NotaAnulacion;
  avisos: string[];
}

/** GET /venta/sin-comprobante (las fechas son días de Lima, yyyy-mm-dd). */
export interface FiltroVentasSinComprobante {
  desde?: string;
  hasta?: string;
  pagina?: number;
  por_pagina?: number;
}

/** POST /venta/:id/emitir-comprobante: sin documento se usa el cliente o la empresa de la venta. */
export interface SolicitudEmitirComprobanteVenta {
  /** 1 factura, 2 boleta. */
  id_tipo: number;
  documento?: string;
  /** Nombre a mano cuando la consulta del documento no está disponible. */
  cliente_denominacion?: string;
  cliente_direccion?: string;
  observaciones?: string;
}

/** Respuesta de POST /venta/:id/emitir-comprobante: la venta con su comprobante o el motivo por el que no salió. */
export interface ResultadoEmisionVenta {
  id_venta: number;
  total: number;
  cliente_denominacion: string;
  comprobante?: ResultadoComprobante;
  comprobante_error?: string;
  comprobante_pendiente?: boolean;
}
