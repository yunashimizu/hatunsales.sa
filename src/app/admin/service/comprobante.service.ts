import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { ComprobanteFila, Paginado } from '../models/admin.models';
import {
  AmbienteFiscal,
  AnulacionComprobante,
  CatalogoMotivosNota,
  ComprobanteDetalle,
  ContextoNotaCredito,
  FiltroVentasSinComprobante,
  FormatoPdfComprobante,
  NotaCreditoEmitida,
  ResultadoComprobante,
  ResultadoEmisionVenta,
  SolicitudAnularComprobante,
  SolicitudEmitirComprobanteVenta,
  SolicitudNotaCredito,
  TipoArchivoComprobante,
  VentaSinComprobante,
} from '../models/documentos.models';
import { cabecerasAutenticadas, cacheCorto, opcionesHttp } from './api-base.service';

type MonitorAtencion = { pendientes: number; errores: number; total: number };

/** Filtros de GET /comprobante. Las fechas son días de Lima (yyyy-mm-dd). */
export interface FiltroComprobantes {
  /** Serie-número, cliente o DNI/RUC. */
  texto?: string;
  id_tipo?: number | '';
  /** 'emitido' | 'pendiente' | 'error' | 'anulado'. */
  estado?: string;
  estado_sunat?: string;
  ambiente?: AmbienteFiscal | '';
  desde?: string;
  hasta?: string;
  pagina?: number;
  por_pagina?: number;
}

/** Solo los filtros con valor: el backend trata un parámetro vacío como un filtro distinto. */
function parametros(filtro: object): HttpParams {
  let params = new HttpParams();
  for (const [clave, valor] of Object.entries(filtro)) {
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
      params = params.set(clave, String(valor).trim());
    }
  }
  return params;
}

/**
 * Comprobantes electrónicos (factura, boleta y nota de crédito) y sus envíos directos a SUNAT.
 * Toda acción que emite o reenvía responde ya con el resultado de SUNAT (ResultadoComprobante).
 */
@Injectable({ providedIn: 'root' })
export class ComprobanteService {

  /** Sidebar, dashboard y Documentos lo piden a la vez al cargar: una sola petición. */
  private readonly monitorCompartido = cacheCorto<MonitorAtencion>(5000);

  constructor(private http: HttpClient) {}

  listar(filtro: FiltroComprobantes = {}): Observable<Paginado<ComprobanteFila>> {
    return this.http.get<Paginado<ComprobanteFila>>(urlConstants.comprobante.base, {
      ...opcionesHttp(),
      params: parametros(filtro),
    });
  }

  /** Contador de CPE pendiente/error para el badge del menú Documentos. */
  monitorAtencion(): Observable<MonitorAtencion> {
    return this.monitorCompartido(() =>
      this.http.get<MonitorAtencion>(urlConstants.comprobante.monitorAtencion, opcionesHttp()),
    );
  }

  detalle(id: number): Observable<ComprobanteDetalle> {
    return this.http.get<ComprobanteDetalle>(urlConstants.comprobante.detalle(id), opcionesHttp());
  }

  /** Representación impresa con QR y hash (A4 o ticket de 80 mm). */
  descargarPdf(id: number, formato: FormatoPdfComprobante = 'a4'): Observable<Blob> {
    return this.http.get(urlConstants.comprobante.pdf(id), {
      headers: cabecerasAutenticadas(),
      withCredentials: true,
      params: new HttpParams().set('formato', formato),
      responseType: 'blob',
    });
  }

  /** XML, ZIP o constancia (CDR) del último envío a SUNAT. */
  descargarArchivo(id: number, tipo: TipoArchivoComprobante): Observable<Blob> {
    return this.http.get(urlConstants.comprobante.archivo(id, tipo), {
      headers: cabecerasAutenticadas(),
      withCredentials: true,
      responseType: 'blob',
    });
  }

  /** Reenvío seguro del MISMO XML (o, si SUNAT lo permite, primero la consulta de su constancia). */
  reintentar(id: number): Observable<ResultadoComprobante> {
    return this.http.post<ResultadoComprobante>(urlConstants.comprobante.reintentar(id), {}, opcionesHttp());
  }

  /** Pide a SUNAT la constancia (CDR) sin reenviar nada. */
  recuperarCdr(id: number): Observable<ResultadoComprobante> {
    return this.http.post<ResultadoComprobante>(urlConstants.comprobante.recuperarCdr(id), {}, opcionesHttp());
  }

  /** Solo admin: verificó en SUNAT Operaciones en Línea que el comprobante fue aceptado (queda auditado). */
  confirmarAceptado(id: number, nota: string): Observable<ResultadoComprobante> {
    return this.http.post<ResultadoComprobante>(
      urlConstants.comprobante.confirmarAceptado(id),
      { nota },
      opcionesHttp(),
    );
  }

  /** Catálogo SUNAT de motivos de nota con la forma en que se arma cada una. */
  motivos(): Observable<CatalogoMotivosNota> {
    return this.http.get<CatalogoMotivosNota>(urlConstants.comprobante.motivos, opcionesHttp());
  }

  /** Lo que el asistente necesita: si se permite, motivos admitidos, saldo, ítems disponibles y avisos. */
  contextoNotaCredito(id: number): Observable<ContextoNotaCredito> {
    return this.http.get<ContextoNotaCredito>(urlConstants.comprobante.contextoNotaCredito(id), opcionesHttp());
  }

  /** Emite la nota y la envía a SUNAT en el acto (409 si otra nota del comprobante sigue en curso). */
  emitirNotaCredito(id: number, solicitud: SolicitudNotaCredito): Observable<NotaCreditoEmitida> {
    return this.http.post<NotaCreditoEmitida>(urlConstants.comprobante.notaCredito(id), solicitud, opcionesHttp());
  }

  /**
   * Solo admin. Aceptado por SUNAT: se anula emitiendo una nota de crédito (la venta se anula cuando
   * SUNAT la acepta); nunca aceptado: se anula en el sistema.
   */
  anular(solicitud: SolicitudAnularComprobante): Observable<AnulacionComprobante> {
    return this.http.post<AnulacionComprobante>(urlConstants.comprobante.anular, solicitud, opcionesHttp());
  }

  ventasSinComprobante(filtro: FiltroVentasSinComprobante = {}): Observable<Paginado<VentaSinComprobante>> {
    return this.http.get<Paginado<VentaSinComprobante>>(urlConstants.puntoVenta.sinComprobante, {
      ...opcionesHttp(),
      params: parametros(filtro),
    });
  }

  /** Emite la factura o boleta de una venta que quedó sin comprobante, con los montos ya cobrados. */
  emitirComprobanteDeVenta(
    idVenta: number,
    solicitud: SolicitudEmitirComprobanteVenta,
  ): Observable<ResultadoEmisionVenta> {
    return this.http.post<ResultadoEmisionVenta>(
      urlConstants.puntoVenta.emitirComprobante(idVenta),
      solicitud,
      opcionesHttp(),
    );
  }
}
