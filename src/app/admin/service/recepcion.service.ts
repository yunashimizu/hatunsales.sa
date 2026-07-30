import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { cabecerasAutenticadas, opcionesHttp } from './api-base.service';

@Injectable({ providedIn: 'root' })
export class RecepcionService {
  constructor(private readonly http: HttpClient) {}

  listarProveedores(): Observable<any[]> {
    return this.http.get<any[]>(urlConstants.proveedor, opcionesHttp());
  }

  crearProveedor(payload: any): Observable<any> {
    return this.http.post(urlConstants.proveedor, payload, opcionesHttp());
  }

  actualizarProveedor(id: number, payload: any): Observable<any> {
    return this.http.put(`${urlConstants.proveedor}/${id}`, payload, opcionesHttp());
  }

  eliminarProveedor(id: number): Observable<any> {
    return this.http.delete(`${urlConstants.proveedor}/${id}`, opcionesHttp());
  }

  guardarProveedorPorRuc(ruc: string): Observable<any> {
    return this.http.post(urlConstants.sunat.rucProveedor, { ruc }, opcionesHttp());
  }

  listarRecepciones(): Observable<any[]> {
    return this.http.get<any[]>(urlConstants.recepcion.base, {
      headers: cabecerasAutenticadas(),
      withCredentials: true,
    });
  }

  confirmar(payload: any): Observable<any> {
    return this.http.post(urlConstants.recepcion.confirmar, payload, opcionesHttp());
  }

  observaciones(estado?: string): Observable<any[]> {
    let params = new HttpParams();
    if (estado) params = params.set('estado', estado);
    return this.http.get<any[]>(urlConstants.recepcion.observaciones, {
      headers: cabecerasAutenticadas(),
      withCredentials: true,
      params,
    });
  }

  aprobar(id: number, comentario?: string): Observable<any> {
    return this.http.post(urlConstants.recepcion.aprobar(id), { comentario }, opcionesHttp());
  }

  rechazar(id: number, comentario?: string): Observable<any> {
    return this.http.post(urlConstants.recepcion.rechazar(id), { comentario }, opcionesHttp());
  }

  subirFoto(idObservacion: number, file: File): Observable<any> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post(urlConstants.recepcion.foto(idObservacion), form, {
      headers: cabecerasAutenticadas(),
      withCredentials: true,
    });
  }
}
