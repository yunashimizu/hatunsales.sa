import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import {
  ComprobanteEmitido, ComprobanteFila, MotivoCatalogo, Paginado, PreviewComprobante,
} from '../models/admin.models';
import { cabecerasAutenticadas, opcionesHttp } from './api-base.service';

export interface FiltroComprobantes {
  texto?: string;
  id_tipo?: number | '';
  estado?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
  por_pagina?: number;
}

@Injectable({ providedIn: 'root' })
export class ComprobanteService {

  constructor(private http: HttpClient) {}

  listar(filtro: FiltroComprobantes = {}): Observable<Paginado<ComprobanteFila>> {
    let params = new HttpParams();
    Object.entries(filtro).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') params = params.set(clave, String(valor));
    });

    return this.http.get<Paginado<ComprobanteFila>>(urlConstants.comprobante.base, {
      headers: cabecerasAutenticadas(),
      withCredentials: true,
      params,
    });
  }

  preview(solicitud: Record<string, any>): Observable<PreviewComprobante> {
    return this.http.post<PreviewComprobante>(urlConstants.comprobante.preview, solicitud, opcionesHttp());
  }

  generar(solicitud: Record<string, any>): Observable<ComprobanteEmitido> {
    return this.http.post<ComprobanteEmitido>(urlConstants.comprobante.generar, solicitud, opcionesHttp());
  }

  detalle(id: number): Observable<any> {
    return this.http.get(urlConstants.comprobante.detalle(id), opcionesHttp());
  }

  /** Anula en SUNAT, o descarta localmente si nunca llegó a emitirse. */
  anular(idComprobante: number, motivo: string): Observable<any> {
    return this.http.post(
      urlConstants.comprobante.anular,
      { id_comprobante: idComprobante, motivo },
      opcionesHttp(),
    );
  }

  /** Reconsulta en NUBEFACT un comprobante que quedó en error o pendiente. */
  reintentar(idComprobante: number): Observable<ComprobanteEmitido> {
    return this.http.post<ComprobanteEmitido>(
      urlConstants.comprobante.reintentar(idComprobante),
      {},
      opcionesHttp(),
    );
  }

  motivos(): Observable<{ nota_credito: MotivoCatalogo[]; nota_debito: MotivoCatalogo[] }> {
    return this.http.get<{ nota_credito: MotivoCatalogo[]; nota_debito: MotivoCatalogo[] }>(
      urlConstants.comprobante.motivos,
      opcionesHttp(),
    );
  }

  descargarPdf(id: number): Observable<Blob> {
    return this.http.get(urlConstants.comprobante.pdf(id), {
      headers: cabecerasAutenticadas(),
      withCredentials: true,
      responseType: 'blob',
    });
  }
}
