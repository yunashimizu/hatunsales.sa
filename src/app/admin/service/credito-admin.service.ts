import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { peticionSilenciosa } from '../../interceptors/contexto-http';
import { cacheCorto, opcionesHttp } from './api-base.service';

/** Deuda vencida: cuántas cuentas y cuánto suman (conteo y suma calculados en el servidor). */
export interface ResumenVencidas {
  cuentas: number;
  total: number;
}

/** Créditos y cuentas por cobrar vistos desde el panel (lecturas livianas compartidas). */
@Injectable({ providedIn: 'root' })
export class CreditoAdminService {
  private readonly http = inject(HttpClient);

  /** El Inicio y la campana lo piden a la vez: una sola petición cada 5 s. */
  private vencidasCompartida = cacheCorto<ResumenVencidas>(5000);

  /** Total de la deuda vencida (`GET credito/cuentas/vencidas-resumen`). */
  vencidasResumen(opciones: { silenciosa?: boolean } = {}): Observable<ResumenVencidas> {
    return this.vencidasCompartida(() =>
      this.http.get<ResumenVencidas>(urlConstants.credito.vencidasResumen, {
        ...opcionesHttp(),
        ...(opciones.silenciosa ? { context: peticionSilenciosa() } : {}),
      }),
    );
  }

  /** Olvida la lectura guardada: la siguiente consulta va al servidor. */
  invalidar(): void {
    this.vencidasCompartida = cacheCorto<ResumenVencidas>(5000);
  }
}
