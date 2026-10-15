import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { urlConstants } from '../../constants/urlConstants';
import {
  ArqueoEsperado,
  ArqueoResumen,
  MovimientoCaja,
  RegistrarArqueo,
} from '../models/caja-arqueo.models';
import { opcionesHttp } from './api-base.service';

@Injectable({ providedIn: 'root' })
export class CajaArqueoService {
  constructor(private readonly http: HttpClient) {}

  esperado(idApertura: number) {
    return this.http.get<ArqueoEsperado>(urlConstants.caja.arqueoEsperado, {
      ...opcionesHttp(),
      params: { id_apertura: idApertura },
    });
  }

  historial(idApertura: number) {
    return this.http.get<{ items: ArqueoResumen[] }>(urlConstants.caja.arqueo, {
      ...opcionesHttp(),
      params: { id_apertura: idApertura, limite: 50 },
    });
  }

  registrar(body: RegistrarArqueo) {
    return this.http.post<ArqueoResumen>(urlConstants.caja.arqueo, body, opcionesHttp());
  }

  movimientos(idApertura: number) {
    return this.http.get<{ items: MovimientoCaja[] }>(urlConstants.caja.movimientos, {
      ...opcionesHttp(),
      params: { id_apertura: idApertura, limite: 100 },
    });
  }

  registrarMovimiento(body: {
    id_apertura: number;
    tipo: 'ingreso' | 'egreso';
    monto: number;
    descripcion: string;
  }) {
    return this.http.post<MovimientoCaja>(urlConstants.caja.movimientos, body, opcionesHttp());
  }

  pdf(id: number, formato: 'ticket' | 'a4') {
    return this.http.get(urlConstants.caja.arqueoPdf(id), {
      ...opcionesHttp(),
      params: { formato },
      responseType: 'blob',
    });
  }
}
