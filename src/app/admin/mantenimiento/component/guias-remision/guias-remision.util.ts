import { TonoEstado } from '../../../models/documentos.models';
import {
  EstadoGuia,
  GuiaRemision,
  GuiaRemisionResumen,
  ObservacionGuia,
  ResultadoOperacionGuia,
  TipoArchivoGuia,
} from '../../../service/guia-remision.service';
import {
  codigoDeError,
  estadoDeError,
  mensajeDeError,
  mensajesDeValidacion,
} from '../../../../shared/utils/errores-http.util';

/** Funciones puras de la pantalla de guías: estado en palabras, resultado de SUNAT y errores del backend. */

/** Operación en curso sobre una guía (bloquea sus botones mientras dura). */
export type AccionGuia = 'emitir' | 'consultar' | 'validar' | 'anular' | 'descargar';

export const NOMBRE_ARCHIVO_GUIA: Readonly<Record<TipoArchivoGuia, string>> = {
  xml_firmado: 'XML firmado',
  zip: 'ZIP enviado',
  cdr_xml: 'Constancia CDR (XML)',
  cdr_zip: 'Constancia CDR (ZIP)',
};

export const TONO_ESTADO_GUIA: Readonly<Record<EstadoGuia, TonoEstado>> = {
  legacy: 'neutro',
  borrador: 'neutro',
  pendiente: 'aviso',
  enviado: 'info',
  aceptado: 'exito',
  rechazado: 'peligro',
  anulado: 'neutro',
};

/** Respaldo por si una fila llega sin `estado_texto` (los textos son los del backend). */
const TEXTO_ESTADO_GUIA: Readonly<Record<EstadoGuia, string>> = {
  legacy: 'Histórica (solo lectura)',
  borrador: 'Borrador',
  pendiente: 'Pendiente de envío',
  enviado: 'Enviada a SUNAT',
  aceptado: 'Aceptada',
  rechazado: 'Rechazada',
  anulado: 'Anulada',
};

const CLASE_TONO: Readonly<Record<TonoEstado, string>> = {
  exito: 'adm-insignia--exito',
  aviso: 'adm-insignia--aviso',
  peligro: 'adm-insignia--peligro',
  info: 'adm-insignia--info',
  neutro: 'adm-insignia--neutra',
};

export function claseInsigniaGuia(estado: EstadoGuia): string {
  return CLASE_TONO[TONO_ESTADO_GUIA[estado] ?? 'neutro'];
}

export function textoEstadoGuia(guia: Pick<GuiaRemisionResumen, 'estado' | 'estado_texto'>): string {
  return guia.estado_texto?.trim() || TEXTO_ESTADO_GUIA[guia.estado] || 'Estado desconocido';
}

/** «T001-00000005», o «Borrador #12» mientras no tiene número (se asigna al emitir). */
export function numeroGuia(guia: Pick<GuiaRemisionResumen, 'id_guia' | 'numero_formateado'>): string {
  return guia.numero_formateado || `Borrador #${guia.id_guia}`;
}

/**
 * «25/10/2026». Las fechas de la guía son días de Lima (aaaa-mm-dd): se leen tal cual, porque
 * `new Date('2026-10-25')` es medianoche UTC y en Lima mostraría el día anterior.
 */
export function fechaGuia(valor: string | null | undefined): string {
  const texto = String(valor ?? '').trim();
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (dia) return `${dia[3]}/${dia[2]}/${dia[1]}`;
  const fecha = texto ? new Date(texto) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' }).format(fecha);
}

const EXTENSION: Readonly<Record<TipoArchivoGuia, string>> = {
  xml_firmado: 'xml',
  zip: 'zip',
  cdr_xml: 'xml',
  cdr_zip: 'zip',
};

/** Nombre de la descarga: el número de la guía (o el borrador) y R- para la constancia, como en SUNAT. */
export function nombreArchivoGuia(guia: Pick<GuiaRemisionResumen, 'id_guia' | 'numero_formateado'>, tipo: TipoArchivoGuia | 'pdf'): string {
  const base = guia.numero_formateado ? `GRE-${guia.numero_formateado}` : `guia-borrador-${guia.id_guia}`;
  if (tipo === 'pdf') return `${base}.pdf`;
  return `${tipo.startsWith('cdr') ? 'R-' : ''}${base}.${EXTENSION[tipo]}`;
}

/** Lo que la pantalla dice del envío a SUNAT, en palabras y con lo que hay que hacer después. */
export interface ResumenSunatGuia {
  tono: TonoEstado;
  icono: string;
  titulo: string;
  mensaje: string | null;
  /** Errores de SUNAT («código: descripción»). */
  errores: string[];
  siguiente: string | null;
}

/** null mientras la guía no se envió (borrador, anulada o histórica). */
export function resumenSunatGuia(guia: GuiaRemision, resultado: ResultadoOperacionGuia | null = null): ResumenSunatGuia | null {
  const envio = guia.envio;
  const errores = (resultado?.errores ?? [])
    .map((e) => [e.codigo, e.descripcion].filter((p) => String(p ?? '').trim()).join(': '))
    .filter(Boolean);
  const mensaje = resultado?.mensaje || envio?.mensaje || null;
  switch (guia.estado) {
    case 'aceptado':
      return {
        tono: 'exito',
        icono: 'bi-patch-check',
        titulo: envio?.estado === 'ACEPTADO_OBS' ? 'Aceptada por SUNAT con observaciones' : 'Aceptada por SUNAT',
        mensaje: guia.sunat.descripcion || mensaje,
        errores,
        siguiente: 'Descargue el PDF con el código QR: acompaña a los bienes durante el traslado.',
      };
    case 'rechazado':
      return {
        tono: 'peligro',
        icono: 'bi-x-octagon',
        titulo: 'Rechazada por SUNAT',
        mensaje: guia.error_mensaje || mensaje,
        errores,
        siguiente: guia.numero_formateado
          ? `Corrija los datos y vuelva a emitir: se reenviará con el mismo número ${guia.numero_formateado}.`
          : 'Corrija los datos y vuelva a emitir la guía.',
      };
    case 'enviado':
      return {
        tono: envio?.revision_manual ? 'aviso' : 'info',
        icono: 'bi-hourglass-split',
        titulo: 'En proceso en SUNAT',
        // El backend explica si se consultará solo o hay que revisar (credenciales, constancia ajena).
        mensaje:
          (envio?.revision_manual ? guia.error_mensaje : null) ||
          resultado?.mensaje ||
          (guia.sunat_ticket
            ? `SUNAT recibió la guía (ticket ${guia.sunat_ticket}) y la está procesando.`
            : 'SUNAT recibió la guía y la está procesando.'),
        errores: [],
        siguiente: envio?.revision_manual
          ? 'La consulta automática se detuvo: use «Consultar» o revise la guía en SUNAT Operaciones en Línea.'
          : 'Use «Consultar en SUNAT» para pedir el resultado si aún no aparece.',
      };
    case 'pendiente':
      if (envio?.en_curso) {
        return {
          tono: 'info',
          icono: 'bi-send',
          titulo: 'Enviando a SUNAT',
          mensaje: 'La guía se está enviando en este momento.',
          errores: [],
          siguiente: 'Actualice en unos segundos para ver el resultado.',
        };
      }
      if (envio?.estado === 'ERROR_CONFIG') {
        return {
          tono: 'peligro',
          icono: 'bi-gear',
          titulo: 'No se pudo enviar por la configuración',
          mensaje: guia.error_mensaje || mensaje,
          errores,
          siguiente: 'Corrija la configuración en Facturación SUNAT y use «Reintentar envío»: se conserva el número.',
        };
      }
      return {
        tono: 'aviso',
        icono: 'bi-exclamation-triangle',
        titulo: 'Sin respuesta segura de SUNAT',
        mensaje: guia.error_mensaje || mensaje,
        errores,
        siguiente: 'Use «Reintentar envío»: se reenvía el mismo archivo, sin duplicar la guía.',
      };
    default:
      return null;
  }
}

/** Una línea que supera lo pendiente de la venta (409 GRE_CANTIDAD_EXCEDE_VENTA). */
export interface ExcesoCantidadGuia {
  id_producto: number;
  descripcion: string;
  cantidad_pendiente: number;
}

/** El cuerpo de error de la GRE ya leído: mensaje en español y los campos que agrega el backend. */
export interface ErrorGuia {
  estado: number | null;
  codigo: string;
  mensaje: string;
  /** Validaciones del DTO, cada una por separado (vacío si hay una sola). */
  mensajes: string[];
  errores: string[];
  advertencias: string[];
  por_campo: ObservacionGuia[];
  detalle: ExcesoCantidadGuia[];
  /** POST /guia-remision/emitir que falló: la guía quedó guardada como borrador con este id. */
  id_guia: number | null;
}

function textos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((m): m is string => typeof m === 'string' && m.trim() !== '') : [];
}

function esObservacion(valor: unknown): valor is ObservacionGuia {
  const o = valor as Partial<ObservacionGuia> | null;
  return !!o && typeof o.mensaje === 'string' && (o.nivel === 'error' || o.nivel === 'advertencia');
}

export function errorDeGuia(error: unknown, porDefecto: string): ErrorGuia {
  const crudo = (error as { error?: unknown } | null)?.error;
  const cuerpo: Record<string, unknown> = crudo && typeof crudo === 'object' ? (crudo as Record<string, unknown>) : {};
  const detalle = Array.isArray(cuerpo['detalle'])
    ? (cuerpo['detalle'] as Array<Record<string, unknown>>)
        .filter((d) => d && Number.isFinite(Number(d['id_producto'])))
        .map((d) => ({
          id_producto: Number(d['id_producto']),
          descripcion: String(d['descripcion'] ?? ''),
          cantidad_pendiente: Number(d['cantidad_pendiente']) || 0,
        }))
    : [];
  const idGuia = Number(cuerpo['id_guia']);
  return {
    estado: estadoDeError(error),
    codigo: codigoDeError(error),
    mensaje: mensajeDeError(error, porDefecto),
    mensajes: mensajesDeValidacion(error),
    errores: textos(cuerpo['errores']),
    advertencias: textos(cuerpo['advertencias']),
    por_campo: Array.isArray(cuerpo['por_campo']) ? (cuerpo['por_campo'] as unknown[]).filter(esObservacion) : [],
    detalle,
    id_guia: Number.isSafeInteger(idGuia) && idGuia > 0 ? idGuia : null,
  };
}
