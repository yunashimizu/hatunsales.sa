import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { conTiempoLimite, peticionSilenciosa } from '../../interceptors/contexto-http';
import { VentasPorHora } from '../models/admin.models';
import { opcionesHttp } from './api-base.service';

/** Lecturas de reportes que no tienen pantalla propia (el Inicio las usa para sus gráficos). */
@Injectable({ providedIn: 'root' })
export class ReportesService {
  constructor(private http: HttpClient) {}

  /**
   * Ventas netas por hora del día y del mismo día de la semana anterior (contrato B2).
   * `fecha` = 'YYYY-MM-DD'; sin fecha el servidor toma hoy.
   * Ruta: `reportes/ventas-por-hora` (hermana de `reportes/ventas`).
   */
  ventasPorHora(fecha?: string): Observable<VentasPorHora> {
    let params = new HttpParams();
    if (fecha) params = params.set('fecha', fecha);
    return this.http.get<VentasPorHora>(`${urlConstants.reportes.ventas}-por-hora`, {
      ...opcionesHttp(),
      params,
      // Gráfico opcional del Inicio: sin avisos globales, sin reintentos y con tope de 8 s;
      // si falla, el Inicio sigue con el gráfico semanal.
      context: peticionSilenciosa(conTiempoLimite(8_000)),
    });
  }
}
