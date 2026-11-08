import {
  EstadoSunat,
  GLOSARIO_SUNAT,
  ObservacionSunat,
  ResultadoComprobante,
  TipoArchivoComprobante,
  TEXTO_ESTADO_SUNAT,
  TonoEstado,
  textoEstadoSunat,
  tonoEstadoSunat,
} from '../../../models/documentos.models';

/**
 * Presentación de los comprobantes y de las respuestas de SUNAT, compartida por Documentos, su
 * detalle, el asistente de nota de crédito y la emisión de ventas sin comprobante. Funciones puras:
 * la misma respuesta se cuenta igual en todas las pantallas.
 */

/** Enlaces profundos entre pantallas (contrato fijo del frontend). */
export const RUTA_DOCUMENTOS = '/dashboard/mantenimiento/doc';
export const RUTA_DOCUMENTOS_VENTA = '/dashboard/mantenimiento/ventas-historial';
export const RUTA_GUIAS = '/dashboard/mantenimiento/guias-remision';

/** Catálogo 06 de SUNAT: tipo de documento del cliente. */
export const TIPO_DOCUMENTO_SUNAT: Readonly<Record<number, string>> = {
  0: 'Sin documento',
  1: 'DNI',
  4: 'Carné de extranjería',
  6: 'RUC',
  7: 'Pasaporte',
};

const SUFIJO_INSIGNIA: Readonly<Record<TonoEstado, string>> = {
  exito: 'exito',
  aviso: 'aviso',
  peligro: 'peligro',
  info: 'info',
  neutro: 'neutra',
};

export function claseInsignia(tono: TonoEstado): string {
  return `adm-insignia--${SUFIJO_INSIGNIA[tono]}`;
}

export function claseAviso(tono: TonoEstado): string {
  return `adm-aviso--${tono}`;
}

/** 'yyyy-mm-dd' → 'dd/mm/aaaa' sin pasar por Date: un día de Lima no debe correrse por la zona horaria. */
export function fechaYmdLegible(fecha: string | null | undefined): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha ?? ''));
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : String(fecha ?? '');
}

/** 'yyyy-mm-dd' → 'dd/mm' (el día límite que se le dice al usuario). */
export function fechaYmdCorta(fecha: string | null | undefined): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha ?? ''));
  return partes ? `${partes[3]}/${partes[2]}` : String(fecha ?? '');
}

/** Hoy en Lima como 'yyyy-mm-dd' (el plazo de SUNAT se cuenta con el calendario de Lima). */
export function hoyLimaYmd(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

/** ¿Ya pasó el último día de envío? (sin fecha límite conocida, no.) */
export function plazoVencido(fechaLimite: string | null | undefined, ahora: Date = new Date()): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(String(fechaLimite ?? '')) && String(fechaLimite).slice(0, 10) < hoyLimaYmd(ahora);
}

/** yyyy-mm-dd más N días (calendario, sin zonas horarias). */
export function sumarDiasYmd(ymd: string, dias: number): string {
  const [anio, mes, dia] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/**
 * ¿Una boleta con esta fecha límite de envío individual (emisión + 5 días) todavía puede informarse en un resumen
 * diario? Sí hasta el 7.º día desde la emisión, es decir, 2 días después de esa fecha límite.
 */
export function aunPuedeResumirse(fechaLimiteIndividual: string | null | undefined, ahora: Date = new Date()): boolean {
  const limite = String(fechaLimiteIndividual ?? '');
  return /^\d{4}-\d{2}-\d{2}/.test(limite) && hoyLimaYmd(ahora) <= sumarDiasYmd(limite, 2);
}

/**
 * Qué se puede hacer de verdad con un comprobante que pasó su plazo de envío: la factura y sus notas (series F) ya no
 * se reenvían (si SUNAT quizá lo recibió, se recupera su constancia); la boleta y sus notas (series B) se informan en
 * un resumen diario mientras no pasen 7 días desde la emisión (solas, o con «Informar por resumen»), y pasado ese
 * plazo solo queda anularlas con nota de crédito y emitir otra. `puedeResumir` lo dice el servidor cuando se conoce;
 * si no, se deduce de la acción del envío y de la fecha.
 */
export function textoPlazoVencido(
  serie: string | null | undefined,
  fechaLimite: string | null | undefined,
  accion?: string | null,
  puedeResumir?: boolean,
): string {
  const limite = fechaYmdLegible(fechaLimite);
  if (String(serie ?? '').toUpperCase().startsWith('F')) {
    return accion === 'RECUPERAR_CDR'
      ? `El plazo de envío venció el ${limite} sin respuesta de SUNAT. Use «Recuperar constancia» para saber si SUNAT lo recibió; si no lo tiene, emita un comprobante nuevo.`
      : `El plazo de envío venció el ${limite}: SUNAT ya no lo recibe. Emita un comprobante nuevo.`;
  }
  const resumible = puedeResumir ?? (accion === 'RESUMIR' || aunPuedeResumirse(fechaLimite));
  if (resumible) {
    return `El plazo de envío individual venció el ${limite}. Se informará a SUNAT en el próximo resumen diario (hasta 7 días después de la emisión); también puede pedirlo con «Informar por resumen».`;
  }
  return `El plazo de envío individual venció el ${limite} y ya pasaron los 7 días del resumen diario: si el cliente reclama el comprobante, anúlelo con nota de crédito y emita uno nuevo.`;
}

/** Estado de un envío o de un lote en palabras (el mismo glosario que Documentos); un estado desconocido se muestra tal cual. */
export function nombreEstadoEnvio(estado: string | null | undefined): string {
  return TEXTO_ESTADO_SUNAT[estado as EstadoSunat] ?? String(estado ?? '');
}

/**
 * Nombre de una baja (RA) o de un resumen diario (RC) en palabras: «Baja del 05/11 (n.º 1)» o «Resumen del 05/11 (n.º 2)»
 * (día en que se generó y número de ese día). El identificador técnico va aparte, para el `title`. Un identificador que
 * no tiene ese formato se devuelve tal cual.
 */
export function nombreLote(identificador: string | null | undefined): { texto: string; tecnico: string } {
  const tecnico = String(identificador ?? '');
  const partes = /^(RA|RC)-(\d{4})(\d{2})(\d{2})-(\d+)$/.exec(tecnico);
  if (!partes) return { texto: tecnico, tecnico };
  const clase = partes[1] === 'RA' ? 'Baja' : 'Resumen';
  return { texto: `${clase} del ${partes[4]}/${partes[3]} (n.º ${Number(partes[5])})`, tecnico };
}

/** Estado en palabras de un comprobante de la lista o del detalle. */
export function estadoDeComprobante(c: {
  estado: string;
  anulado: boolean;
  estado_sunat?: string | null;
}): { texto: string; tono: TonoEstado } {
  if (c.anulado) return { texto: 'Anulado', tono: 'neutro' };
  if (c.estado_sunat) return { texto: textoEstadoSunat(c.estado_sunat), tono: tonoEstadoSunat(c.estado_sunat) };
  // Comprobantes del sistema anterior: no tienen estado SUNAT propio, solo el de la fila.
  const historico: Record<string, { texto: string; tono: TonoEstado }> = {
    aceptado: { texto: 'Aceptado por SUNAT', tono: 'exito' },
    emitido: { texto: 'Emitido', tono: 'info' },
    pendiente: { texto: 'Pendiente de envío', tono: 'aviso' },
    error: { texto: 'Con error', tono: 'peligro' },
  };
  return historico[c.estado] ?? { texto: 'Sin estado SUNAT', tono: 'neutro' };
}

export interface ChipAmbiente {
  texto: string;
  clase: string;
  titulo: string;
}

/** BETA siempre se marca: lo emitido allí no tiene validez tributaria. */
export function chipAmbiente(proveedor: string | null | undefined, ambiente: string | null | undefined): ChipAmbiente {
  if (proveedor !== 'sunat_directo') {
    return {
      texto: 'Sistema anterior',
      clase: 'adm-insignia--neutra',
      titulo: 'Emitido antes de la emisión directa a SUNAT: se consulta y anula solo en el sistema.',
    };
  }
  if (ambiente === 'beta') {
    return {
      texto: 'Prueba BETA - sin validez',
      clase: 'adm-insignia--aviso',
      titulo: 'Emitido en SUNAT BETA (pruebas): no tiene validez tributaria.',
    };
  }
  return { texto: 'Producción', clase: 'adm-insignia--exito', titulo: 'Emitido en SUNAT producción.' };
}

export const NOMBRE_ARCHIVO: Readonly<Record<TipoArchivoComprobante, string>> = {
  xml_original: 'XML sin firmar',
  xml_firmado: 'XML firmado',
  zip: 'ZIP enviado',
  cdr_xml: 'Constancia de SUNAT (XML)',
  cdr_zip: 'Constancia de SUNAT (ZIP)',
};

const ORDEN_ARCHIVOS: readonly TipoArchivoComprobante[] = ['xml_firmado', 'zip', 'cdr_xml', 'cdr_zip', 'xml_original'];

/** Archivos del envío que se pueden descargar, en un orden fijo (lo firmado primero); ignora tipos desconocidos. */
export function archivosDescargables(archivos: readonly string[] | null | undefined): TipoArchivoComprobante[] {
  const presentes = new Set(archivos ?? []);
  return ORDEN_ARCHIVOS.filter((tipo) => presentes.has(tipo));
}

/** Nombre del archivo descargado: solo [A-Za-z0-9._-], como lo sanea el backend. */
export function nombreDescarga(numero: string, tipo: TipoArchivoComprobante | 'pdf_a4' | 'pdf_ticket'): string {
  const base = String(numero ?? '').replace(/[^A-Za-z0-9._-]/g, '_') || 'comprobante';
  switch (tipo) {
    case 'pdf_a4':
      return `${base}.pdf`;
    case 'pdf_ticket':
      return `${base}-ticket.pdf`;
    case 'xml_firmado':
      return `${base}.xml`;
    case 'xml_original':
      return `${base}-sin-firmar.xml`;
    case 'zip':
      return `${base}.zip`;
    case 'cdr_xml':
      return `R-${base}.xml`;
    case 'cdr_zip':
      return `R-${base}.zip`;
  }
}

const TEXTO_ACCION: Readonly<Record<string, string>> = {
  REINTENTAR: 'Reintentar el envío',
  CORREGIR_Y_REENVIAR: 'Corregir y volver a enviar',
  EMITIR_NUEVO: 'Emitir un comprobante nuevo',
  RECUPERAR_CDR: `Recuperar la ${GLOSARIO_SUNAT.constancia} o confirmar tras verificar en SUNAT`,
  REVISAR_CONFIG: 'Revisar la configuración de facturación',
  CONSULTAR_TICKET: `Consultar a SUNAT con el ${GLOSARIO_SUNAT.seguimiento}`,
  LIBERAR: 'Consultar de nuevo o liberar (SUNAT no respondió en 7 días)',
  LIBERADO: 'Liberado: pida la baja de nuevo o anule con nota de crédito',
  RESUMIR: 'Informarla en el resumen diario (hasta 7 días después de la emisión)',
};

/** Acción siguiente que sugiere SUNAT, en palabras (null si no hay ninguna). */
export function textoAccionSunat(accion: string | null | undefined): string | null {
  return accion ? (TEXTO_ACCION[accion] ?? null) : null;
}

/** Cómo se muestra la respuesta de SUNAT a una emisión o a una acción sobre su envío. */
export interface VistaResultadoSunat {
  tono: TonoEstado;
  icono: string;
  titulo: string;
  /** Mensaje de SUNAT o del sistema. */
  detalle: string | null;
  /** Qué hacer ahora. */
  siguiente: string | null;
  observaciones: ObservacionSunat[];
  /** Emitido en SUNAT BETA: sin validez tributaria. */
  beta: boolean;
  /** Código de respuesta de SUNAT de lo no aceptado (soporte lo pide), si el mensaje no lo trae ya. */
  codigo: string | null;
}

const ESTADOS_EN_PROCESO = new Set(['NO_ENVIADO', 'ENVIANDO', 'PENDIENTE_REENVIO', 'TICKET_PENDIENTE']);

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

/** Qué pasará con un envío que SUNAT todavía no confirma, según la acción que indicó. */
function siguienteEnProceso(accion: string | null | undefined): string {
  if (accion === 'RECUPERAR_CDR') {
    return 'SUNAT indicó que ya lo había recibido: no lo reenvíe. Recupere la constancia de SUNAT o, después de verlo en SUNAT Operaciones en Línea, confírmelo desde Documentos.';
  }
  if (accion === 'REINTENTAR') {
    return 'El sistema lo reintentará solo en unos minutos; también puede usar «Reintentar» en Documentos.';
  }
  return 'SUNAT no respondió a tiempo. Reintentarlo es seguro (se envía el mismo XML): use «Reintentar» en Documentos en unos minutos.';
}

/**
 * Traduce la respuesta de SUNAT (estado_sunat manda; `estado` es el respaldo de las respuestas
 * sin estado SUNAT) a título, mensaje y siguiente paso en palabras.
 */
export function describirResultadoSunat(r: ResultadoComprobante): VistaResultadoSunat {
  const estadoSunat = r.estado_sunat ?? '';
  const observaciones = Array.isArray(r.sunat_observaciones) ? r.sunat_observaciones : [];
  const beta = r.ambiente_fiscal === 'beta';
  const mensaje = texto(r.error) ?? texto(r.sunat_description);
  const respuesta = texto(r.sunat_responsecode);
  const codigo = respuesta && respuesta !== '0' && !mensaje?.includes(respuesta) ? respuesta : null;
  const base = { observaciones, beta, codigo };

  if (r.aceptada_sunat === true || estadoSunat === 'ACEPTADO' || estadoSunat === 'ACEPTADO_OBS') {
    const conObservaciones = estadoSunat === 'ACEPTADO_OBS' || observaciones.length > 0;
    return {
      ...base,
      // Aceptado: un código >= 4000 es una observación (ya listada), no un motivo de rechazo.
      codigo: null,
      tono: 'exito',
      icono: 'bi-patch-check',
      titulo: conObservaciones ? 'Aceptado por SUNAT con observaciones' : 'Aceptado por SUNAT',
      detalle: texto(r.sunat_description),
      siguiente: conObservaciones
        ? 'Las observaciones no invalidan el comprobante: corríjalas en los próximos que emita.'
        : null,
    };
  }
  if (estadoSunat === 'RECHAZADO') {
    return {
      ...base,
      tono: 'peligro',
      icono: 'bi-x-octagon',
      titulo: 'Rechazado por SUNAT',
      detalle: mensaje,
      siguiente:
        'SUNAT registró el rechazo y ese número ya no se reutiliza: corrija lo que indica el mensaje y emita un documento nuevo.',
    };
  }
  if (estadoSunat === 'ERROR_CONFIG') {
    return {
      ...base,
      tono: 'peligro',
      icono: 'bi-gear',
      titulo: 'No se envió: error de configuración',
      detalle: mensaje,
      siguiente:
        'Un administrador debe revisar Facturación SUNAT (certificado digital y usuario SOL) y luego reintentar el envío.',
    };
  }
  if (estadoSunat === 'EXCEPCION') {
    return {
      ...base,
      tono: 'peligro',
      icono: 'bi-exclamation-octagon',
      titulo: 'Requiere revisión',
      detalle: mensaje,
      siguiente:
        'Revise el mensaje: si quedó fuera de plazo o con un error de formato, emita un documento nuevo; si no está seguro, verifíquelo en SUNAT Operaciones en Línea.',
    };
  }
  if (estadoSunat === 'POR_RESUMIR') {
    return {
      ...base,
      tono: 'info',
      icono: 'bi-calendar-check',
      titulo: 'Va en el resumen diario',
      detalle: mensaje,
      siguiente:
        'La boleta ya es válida y el cliente puede recibirla: SUNAT la recibe en el resumen diario. Un administrador también puede usar «Informar por resumen» en su detalle.',
    };
  }
  if (estadoSunat === 'TICKET_PENDIENTE') {
    return {
      ...base,
      tono: 'aviso',
      icono: 'bi-hourglass-split',
      titulo: 'SUNAT lo está procesando',
      detalle: mensaje,
      siguiente: 'La boleta va en un resumen diario que SUNAT todavía está procesando: el sistema consulta el resultado solo (se ve en Lotes).',
    };
  }
  if (ESTADOS_EN_PROCESO.has(estadoSunat) || r.estado === 'pendiente') {
    return {
      ...base,
      tono: 'aviso',
      icono: 'bi-hourglass-split',
      titulo: 'En proceso: SUNAT todavía no lo confirma',
      detalle: mensaje,
      siguiente: siguienteEnProceso(r.accion_sunat),
    };
  }
  if (r.estado === 'error') {
    return {
      ...base,
      tono: 'peligro',
      icono: 'bi-x-octagon',
      titulo: 'No se emitió',
      detalle: mensaje,
      siguiente: textoAccionSunat(r.accion_sunat),
    };
  }
  return {
    ...base,
    tono: 'info',
    icono: 'bi-info-circle',
    titulo: textoEstadoSunat(estadoSunat || null, r.anulado === true),
    detalle: mensaje,
    siguiente: textoAccionSunat(r.accion_sunat),
  };
}
