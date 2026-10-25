import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { conTiempoLimite } from '../../interceptors/contexto-http';
import { Paginado } from '../models/documentos.models';
import { cacheCorto, opcionesHttp } from './api-base.service';

/*
 * Guía de Remisión Electrónica remitente (PLAN V3, D10 y D11). Las formas son las del backend
 * (hatunsales/src/models/model/guia-remision.request.ts y .response.ts): el detalle trae los mismos
 * bloques que el cuerpo de POST/PUT, así el formulario carga una guía y la vuelve a enviar tal cual.
 */

export type EstadoGuia = 'legacy' | 'borrador' | 'pendiente' | 'enviado' | 'aceptado' | 'rechazado' | 'anulado';

/** Archivos del último envío a SUNAT (GET /guia-remision/:id/archivos/:tipo). */
export type TipoArchivoGuia = 'xml_firmado' | 'zip' | 'cdr_xml' | 'cdr_zip';

/** Resultado del envío o de la consulta del ticket, tal como lo clasifica el motor GRE. */
export type EstadoEnvioGre = 'TICKET_PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | 'ERROR_CONFIG' | 'PENDIENTE_REENVIO';

/** GET /guia-remision/modo: si no está activo, `motivo` explica qué falta (p. ej. producción y credenciales API). */
export interface ModoGre {
  activo: boolean;
  codigo?: string;
  motivo?: string;
}

/** Qué admite la guía en su estado (emitir además exige el modo activo). */
export interface AccionesGuia {
  puede_editar: boolean;
  puede_validar: boolean;
  /** Emitir, reenviar con el mismo número (rechazada) o reintentar el mismo archivo (envío incierto). */
  puede_emitir: boolean;
  puede_consultar: boolean;
  puede_anular: boolean;
}

export interface DocumentoRelacionadoGuia {
  id_comprobante: number;
  /** Catálogo 61: '01' factura, '03' boleta. */
  tipo: string;
  tipo_texto: string;
  serie: string;
  numero: number;
  /** «F001-00000123». */
  numero_formateado: string;
}

export interface PuntoGuia {
  ubigeo: string | null;
  /** «150119 - LURIN - LIMA - LIMA». */
  ubigeo_texto: string | null;
  direccion: string | null;
  codigo_establecimiento: string | null;
}

export interface DestinatarioGuia {
  tipo_documento: string | null;
  numero_documento: string | null;
  denominacion: string | null;
  direccion: string | null;
}

export interface TransportistaGuia {
  ruc: string | null;
  razon_social: string | null;
  registro_mtc: string | null;
}

export interface VehiculoGuia {
  placa: string | null;
  tarjeta_circulacion: string | null;
  marca: string | null;
}

export interface ConductorGuia {
  tipo_documento: string | null;
  numero_documento: string | null;
  nombres: string | null;
  apellidos: string | null;
  licencia: string | null;
}

export interface ItemGuia {
  id_item: number;
  id_producto: number;
  id_venta_detalle: number | null;
  codigo: string | null;
  descripcion: string;
  /** Catálogo 03 (NIU, KGM…). */
  unidad: string;
  cantidad: number;
  orden: number;
}

/** Último envío a SUNAT de la guía. */
export interface EnvioGuia {
  id_envio: number;
  /** ENVIANDO, TICKET_PENDIENTE, PENDIENTE_REENVIO, ACEPTADO, ACEPTADO_OBS, RECHAZADO o ERROR_CONFIG. */
  estado: string;
  codigo: string | null;
  mensaje: string | null;
  intento: number;
  consultas: number;
  /** Otro proceso lo está enviando o consultando ahora mismo. */
  en_curso: boolean;
  /** La consulta automática se detuvo: hay que consultar a mano o revisar en SUNAT. */
  revision_manual: boolean;
  proximo_intento_en: string | null;
  actualizado_en: string | null;
}

export interface SunatGuia {
  ticket: string | null;
  codigo: string | null;
  descripcion: string | null;
  /** Enlace del QR de la constancia (solo aceptada). */
  cadena_qr: string | null;
  codigo_hash: string | null;
}

/** Fila del listado. */
export interface GuiaRemisionResumen {
  id_guia: number;
  id_venta: number | null;
  id_comprobante: number | null;
  serie: string | null;
  numero: number | null;
  /** «T001-00000001»; null mientras es borrador (el número se asigna al emitir). */
  numero_formateado: string | null;
  estado: EstadoGuia;
  estado_texto: string;
  solo_lectura: boolean;
  fecha_emision: string | null;
  fecha_inicio_traslado: string | null;
  motivo_traslado: string | null;
  motivo_traslado_texto: string | null;
  modalidad_traslado: string | null;
  modalidad_traslado_texto: string | null;
  destinatario: DestinatarioGuia;
  llegada: PuntoGuia;
  documento_relacionado: DocumentoRelacionadoGuia | null;
  sunat_ticket: string | null;
  error_mensaje: string | null;
  creado_en: string | null;
  acciones: AccionesGuia;
}

/** GET /guia-remision/:id */
export interface GuiaRemision extends GuiaRemisionResumen {
  /** HH:mm:ss de Lima con la que se firmó (null en borrador). */
  hora_emision: string | null;
  descripcion_motivo: string | null;
  fecha_entrega_transportista: string | null;
  peso_bruto_total: number | null;
  unidad_peso: string | null;
  numero_bultos: number | null;
  partida: PuntoGuia;
  transportista: TransportistaGuia | null;
  vehiculo: VehiculoGuia | null;
  conductor: ConductorGuia | null;
  items: ItemGuia[];
  observaciones: string | null;
  sunat: SunatGuia;
  envio: EnvioGuia | null;
  archivos: TipoArchivoGuia[];
  anulacion: { motivo: string | null; fecha: string } | null;
  avisos: string[];
}

export type ListadoGuias = Paginado<GuiaRemisionResumen>;

/** Un mensaje de validación con el campo del formulario al que se refiere (`campo_formulario`). */
export interface ObservacionGuia {
  campo: string;
  campo_formulario: string;
  nivel: 'error' | 'advertencia';
  mensaje: string;
}

/** POST /guia-remision/:id/validar */
export interface ValidacionGuia {
  valido: boolean;
  errores: string[];
  advertencias: string[];
  por_campo: ObservacionGuia[];
}

export interface ResultadoOperacionGuia {
  estado: EstadoEnvioGre;
  codigo: string | null;
  mensaje: string;
  ticket: string | null;
  errores: Array<{ codigo: string; descripcion: string }>;
}

/** Respuesta de emitir y de consultar el ticket: la guía ya actualizada y lo que dijo SUNAT. */
export interface OperacionGuia {
  guia: GuiaRemision;
  resultado: ResultadoOperacionGuia;
}

export interface ItemContextoVentaGuia {
  id_producto: number;
  id_venta_detalle: number;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad_vendida: number;
  /** Lo que ya llevan las guías vigentes de la venta (borradores y emitidas, no anuladas ni rechazadas). */
  cantidad_en_guias: number;
  cantidad_pendiente: number;
}

/** GET /guia-remision/ventas/:id/contexto: lo que precarga una guía de venta. */
export interface ContextoVentaGuia {
  venta: {
    id_venta: number;
    fecha: string | null;
    total: number;
    estado: string;
    id_cliente: number | null;
    id_empresa: number | null;
  };
  /** false si la venta está anulada o ya no tiene cantidades pendientes de guía. */
  permitido: boolean;
  motivo_no_permitido: string | null;
  destinatario: DestinatarioGuia;
  documento_relacionado: DocumentoRelacionadoGuia | null;
  partida: PuntoGuia;
  llegada: PuntoGuia;
  almacen: { id_almacen: number; nombre: string | null; direccion: string | null } | null;
  items: ItemContextoVentaGuia[];
  guias: Array<{ id_guia: number; numero_formateado: string | null; estado: EstadoGuia; estado_texto: string }>;
  avisos: string[];
}

export interface OpcionCatalogoGuia {
  codigo: string;
  nombre: string;
}

export interface MotivoTrasladoGuia extends OpcionCatalogoGuia {
  descripcion: string;
  requiere_venta: boolean;
  requiere_descripcion: boolean;
  requiere_establecimiento: boolean;
}

/** GET /guia-remision/catalogos */
export interface CatalogosGuia {
  motivos: MotivoTrasladoGuia[];
  modalidades: Array<OpcionCatalogoGuia & { descripcion: string }>;
  unidades_peso: OpcionCatalogoGuia[];
  tipos_documento_destinatario: OpcionCatalogoGuia[];
  tipos_documento_conductor: OpcionCatalogoGuia[];
  unidades_medida: OpcionCatalogoGuia[];
  documentos_relacionados: OpcionCatalogoGuia[];
  estados: OpcionCatalogoGuia[];
  ubigeo: { minimo_caracteres: number; maximo_resultados: number };
  /** Hoy en Lima (aaaa-mm-dd): fecha de emisión y mínimo del inicio del traslado. */
  hoy: string;
}

/* Cuerpo de POST /guia-remision, POST /guia-remision/emitir y PUT /guia-remision/:id. */

export interface PuntoGuiaCuerpo {
  ubigeo?: string;
  direccion?: string;
  /** Solo con el motivo 04: establecimiento anexo registrado en SUNAT (0000 = domicilio fiscal). */
  codigo_establecimiento?: string;
}

export interface DestinatarioGuiaCuerpo {
  tipo_documento?: string;
  numero_documento?: string;
  denominacion?: string;
  direccion?: string;
}

export interface TransportistaGuiaCuerpo {
  ruc?: string;
  razon_social?: string;
  registro_mtc?: string;
}

export interface VehiculoGuiaCuerpo {
  placa?: string;
  tarjeta_circulacion?: string;
  marca?: string;
}

export interface ConductorGuiaCuerpo {
  tipo_documento?: string;
  numero_documento?: string;
  nombres?: string;
  apellidos?: string;
  licencia?: string;
}

export interface ItemGuiaCuerpo {
  id_producto: number;
  cantidad: number;
  descripcion?: string;
  /** Catálogo 03; sin indicar, la unidad del producto. */
  unidad?: string;
}

export interface GuardarGuiaRemision {
  /** Obligatoria con el motivo 01; sin venta solo se admiten 04 y 13. */
  id_venta?: number;
  motivo_traslado: string;
  descripcion_motivo?: string;
  modalidad_traslado: string;
  fecha_inicio_traslado?: string;
  fecha_entrega_transportista?: string;
  peso_bruto_total?: number;
  unidad_peso?: string;
  numero_bultos?: number;
  destinatario?: DestinatarioGuiaCuerpo;
  partida?: PuntoGuiaCuerpo;
  llegada?: PuntoGuiaCuerpo;
  transportista?: TransportistaGuiaCuerpo;
  vehiculo?: VehiculoGuiaCuerpo;
  conductor?: ConductorGuiaCuerpo;
  items: ItemGuiaCuerpo[];
  observaciones?: string;
  /** Repetir el POST con la misma clave devuelve la guía ya creada (doble clic, reintento de red). */
  clave_idempotencia?: string;
}

export interface FiltroGuias {
  texto?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  id_venta?: number;
  pagina?: number;
  por_pagina?: number;
}

/**
 * Emitir y consultar hablan con SUNAT dentro de la petición: en el peor caso del cliente GRE (reintentos
 * y timeouts) el envío tarda unos 2,5 min y la consulta unos 3. El límite general de 90 s cortaría la
 * respuesta mientras el backend sigue trabajando.
 */
export const LIMITE_SUNAT_MS = 200_000;

function opcionesSunat() {
  return { ...opcionesHttp(), context: conTiempoLimite(LIMITE_SUNAT_MS) };
}

function parametros(filtro: FiltroGuias): HttpParams {
  let params = new HttpParams();
  for (const [clave, valor] of Object.entries(filtro)) {
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') params = params.set(clave, String(valor).trim());
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class GuiaRemisionService {
  private readonly http = inject(HttpClient);
  /** Casi estáticos (salvo `hoy`): la página y el formulario comparten una lectura por minuto. */
  private readonly catalogosCompartidos = cacheCorto<CatalogosGuia>(60_000);
  /** La página y el formulario lo piden al abrirse: una sola lectura cada pocos segundos. */
  private modoCompartido = cacheCorto<ModoGre>(5_000);

  listar(filtro: FiltroGuias = {}): Observable<ListadoGuias> {
    return this.http.get<ListadoGuias>(urlConstants.guiaRemision.base, { ...opcionesHttp(), params: parametros(filtro) });
  }

  obtener(id: number): Observable<GuiaRemision> {
    return this.http.get<GuiaRemision>(urlConstants.guiaRemision.byId(id), opcionesHttp());
  }

  contextoVenta(idVenta: number): Observable<ContextoVentaGuia> {
    return this.http.get<ContextoVentaGuia>(urlConstants.guiaRemision.contextoVenta(idVenta), opcionesHttp());
  }

  /** Borrador (no consume número ni va a SUNAT). */
  crear(datos: GuardarGuiaRemision): Observable<GuiaRemision> {
    return this.http.post<GuiaRemision>(urlConstants.guiaRemision.base, datos, opcionesHttp());
  }

  /**
   * Crea la guía y la envía a SUNAT en una sola llamada. Si la emisión falla por validación (400) o porque
   * la GRE no está activa (503), la guía queda guardada como borrador y el cuerpo del error trae su `id_guia`.
   */
  crearYEmitir(datos: GuardarGuiaRemision): Observable<OperacionGuia> {
    return this.http.post<OperacionGuia>(urlConstants.guiaRemision.crearYEmitir, datos, opcionesSunat());
  }

  /** Borrador o rechazada (la rechazada conserva su número para reenviarla). */
  actualizar(id: number, datos: GuardarGuiaRemision): Observable<GuiaRemision> {
    return this.http.put<GuiaRemision>(urlConstants.guiaRemision.byId(id), datos, opcionesHttp());
  }

  /** «Validar sin enviar»: reglas de SUNAT, ubigeos y topes de la venta; no cambia nada. */
  validar(id: number): Observable<ValidacionGuia> {
    return this.http.post<ValidacionGuia>(urlConstants.guiaRemision.validar(id), {}, opcionesHttp());
  }

  /** Emite, reenvía con el mismo número o reintenta el mismo archivo (503 si la GRE no está activa). */
  emitir(id: number): Observable<OperacionGuia> {
    return this.http.post<OperacionGuia>(urlConstants.guiaRemision.emitir(id), {}, opcionesSunat());
  }

  /** Consulta del ticket en SUNAT. */
  consultar(id: number): Observable<OperacionGuia> {
    return this.http.post<OperacionGuia>(urlConstants.guiaRemision.consultar(id), {}, opcionesSunat());
  }

  /** Solo borrador o rechazada; una aceptada se da de baja en SUNAT Operaciones en Línea. */
  anular(id: number, motivo?: string): Observable<GuiaRemision> {
    const cuerpo = motivo?.trim() ? { motivo: motivo.trim() } : {};
    return this.http.post<GuiaRemision>(urlConstants.guiaRemision.anular(id), cuerpo, opcionesHttp());
  }

  pdf(id: number): Observable<Blob> {
    return this.http.get(urlConstants.guiaRemision.pdf(id), { ...opcionesHttp(), responseType: 'blob' });
  }

  archivo(id: number, tipo: TipoArchivoGuia): Observable<Blob> {
    return this.http.get(urlConstants.guiaRemision.archivo(id, tipo), { ...opcionesHttp(), responseType: 'blob' });
  }

  catalogos(): Observable<CatalogosGuia> {
    return this.catalogosCompartidos(() => this.http.get<CatalogosGuia>(urlConstants.guiaRemision.catalogos, opcionesHttp()));
  }

  /** `forzar` ignora la lectura compartida (p. ej. tras un 503 que dice que el modo cambió). */
  modo(forzar = false): Observable<ModoGre> {
    if (forzar) this.modoCompartido = cacheCorto<ModoGre>(5_000);
    return this.modoCompartido(() => this.http.get<ModoGre>(urlConstants.guiaRemision.modo, opcionesHttp()));
  }
}
