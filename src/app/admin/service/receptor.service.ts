import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { Receptor, SugerenciaReceptor } from '../models/admin.models';
import { cabecerasAutenticadas, opcionesHttp } from './api-base.service';

/**
 * Búsqueda del cliente o la empresa que recibe el comprobante.
 *
 * El backend decide si el documento es DNI o RUC por su longitud, consulta la
 * base local primero y solo sale a SUNAT si no lo encuentra.
 */
@Injectable({ providedIn: 'root' })
export class ReceptorService {

  constructor(private http: HttpClient) {}

  /** Sugerencias mientras se escribe, solo contra lo ya registrado. */
  sugerencias(termino: string, limite = 8): Observable<SugerenciaReceptor[]> {
    const params = new HttpParams().set('q', termino).set('limite', String(limite));
    return this.http.get<SugerenciaReceptor[]>(urlConstants.receptor.sugerencias, {
      headers: cabecerasAutenticadas(),
      withCredentials: true,
      params,
    });
  }

  /** Busca el documento y lo registra si venía de SUNAT. */
  buscar(documento: string): Observable<Receptor> {
    return this.http.get<Receptor>(urlConstants.receptor.buscar(documento), opcionesHttp());
  }

  porCliente(idCliente: number): Observable<Receptor> {
    return this.http.get<Receptor>(urlConstants.receptor.cliente(idCliente), opcionesHttp());
  }

  porEmpresa(idEmpresa: number): Observable<Receptor> {
    return this.http.get<Receptor>(urlConstants.receptor.empresa(idEmpresa), opcionesHttp());
  }

  consumidorFinal(): Observable<Receptor> {
    return this.http.get<Receptor>(urlConstants.receptor.consumidorFinal, opcionesHttp());
  }

  empresas(limite = 200): Observable<any[]> {
    const params = new HttpParams().set('limite', String(limite));
    return this.http.get<any[]>(urlConstants.receptor.empresas, {
      headers: cabecerasAutenticadas(),
      withCredentials: true,
      params,
    });
  }

  actualizarCliente(id: number, datos: Record<string, any>): Observable<any> {
    return this.http.put(urlConstants.receptor.actualizarCliente(id), datos, opcionesHttp());
  }

  actualizarEmpresa(id: number, datos: Record<string, any>): Observable<any> {
    return this.http.put(urlConstants.receptor.actualizarEmpresa(id), datos, opcionesHttp());
  }
}
