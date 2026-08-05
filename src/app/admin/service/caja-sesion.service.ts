import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { opcionesHttp } from './api-base.service';

export interface AperturaCaja {
  id_apertura: number;
  id_caja: number;
  caja_nombre: string;
  id_sucursal: number | null;
  sucursal_nombre: string | null;
  id_usuario: number | null;
  fecha: string | null;
  monto_inicial: number | null;
}

export interface ResumenTurnoCaja {
  ventas: number;
  total: number;
  por_metodo: { metodo: string; total: number; cantidad: number }[];
}

export interface SesionCaja {
  modo: 'blando' | 'estricto';
  abierta: boolean;
  apertura: AperturaCaja | null;
  resumen?: ResumenTurnoCaja | null;
}

export interface CajaDisponible {
  id_caja: number;
  nombre: string;
  id_sucursal: number | null;
  sucursal_nombre: string | null;
  ocupada: boolean;
}

@Injectable({ providedIn: 'root' })
export class CajaSesionService {
  constructor(private readonly http: HttpClient) {}

  sesion(): Observable<SesionCaja> {
    return this.http.get<SesionCaja>(urlConstants.caja.sesion, opcionesHttp());
  }

  disponibles(): Observable<{ items: CajaDisponible[] }> {
    return this.http.get<{ items: CajaDisponible[] }>(urlConstants.caja.disponibles, opcionesHttp());
  }

  abrir(body: { id_caja: number; monto_inicial?: number | null }): Observable<AperturaCaja> {
    return this.http.post<AperturaCaja>(urlConstants.caja.abrir, body, opcionesHttp());
  }

  cerrar(body: {
    id_apertura?: number;
    monto_conteo?: number | null;
    observacion?: string | null;
  }): Observable<{
    id_apertura: number;
    id_cierre: number | null;
    cerrada: boolean;
    monto_conteo: number | null;
    resumen?: ResumenTurnoCaja;
  }> {
    return this.http.post<{
      id_apertura: number;
      id_cierre: number | null;
      cerrada: boolean;
      monto_conteo: number | null;
      resumen?: ResumenTurnoCaja;
    }>(urlConstants.caja.cerrar, body, opcionesHttp());
  }
}
