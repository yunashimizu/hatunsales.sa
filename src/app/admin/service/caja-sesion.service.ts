import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { peticionSilenciosa } from '../../interceptors/contexto-http';
import { cacheCorto, opcionesHttp } from './api-base.service';
import { EventosPanelService } from './eventos-panel.service';
import {
  FiltroTurnosCaja,
  ListadoTurnosCaja,
  ResumenSucursalesCaja,
} from '../models/caja-arqueo.models';

export interface AperturaCaja {
  id_apertura: number;
  id_caja: number;
  caja_nombre: string;
  id_sucursal: number | null;
  sucursal_nombre: string | null;
  id_usuario: number | null;
  fecha: string | null;
  monto_inicial: number | null;
  /** Solo en la respuesta de abrir: efectivo que dejó el último cierre de la caja y diferencia con lo declarado. */
  sugerido_inicial?: number | null;
  diferencia_sugerido?: number | null;
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
  /** Efectivo contado en el último cierre de esta caja; null si no hay cierre previo. */
  sugerido_inicial?: number | null;
}

/** Cuerpo de POST /caja/abrir. `sin_efectivo: true` guarda 0.00 e ignora `monto_inicial`. */
export interface AbrirCajaBody {
  id_caja: number;
  monto_inicial?: number | null;
  sin_efectivo?: boolean;
}

function parametros(valores: object): Record<string, string | number> {
  const salida: Record<string, string | number> = {};
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor !== null && valor !== undefined && valor !== '') salida[clave] = valor as string | number;
  }
  return salida;
}

@Injectable({ providedIn: 'root' })
export class CajaSesionService {
  /** El Inicio, la campana y el POS piden la sesión a la vez: una sola petición cada 5 s. No es readonly: abrir/cerrar la recrean. */
  private sesionCompartida = cacheCorto<SesionCaja>(5000);
  private readonly eventos = inject(EventosPanelService);

  constructor(private readonly http: HttpClient) {}

  sesion(opciones: { silenciosa?: boolean } = {}): Observable<SesionCaja> {
    return this.sesionCompartida(() =>
      this.http.get<SesionCaja>(urlConstants.caja.sesion, {
        ...opcionesHttp(),
        ...(opciones.silenciosa ? { context: peticionSilenciosa() } : {}),
      }),
    );
  }

  /** Olvida la sesión guardada: la siguiente lectura consulta de nuevo (tras abrir o cerrar caja). */
  invalidarSesion(): void {
    this.sesionCompartida = cacheCorto<SesionCaja>(5000);
  }

  disponibles(): Observable<{ items: CajaDisponible[] }> {
    return this.http.get<{ items: CajaDisponible[] }>(urlConstants.caja.disponibles, opcionesHttp());
  }

  abrir(body: AbrirCajaBody): Observable<AperturaCaja> {
    return this.http
      .post<AperturaCaja>(urlConstants.caja.abrir, body, opcionesHttp())
      .pipe(
        tap(() => {
          this.invalidarSesion();
          this.eventos.emitir({ tipo: 'caja-cambio' });
        }),
      );
  }

  /** Turnos paginados. Solo se mandan los filtros con valor. */
  aperturas(filtro: FiltroTurnosCaja = {}): Observable<ListadoTurnosCaja> {
    return this.http.get<ListadoTurnosCaja>(urlConstants.caja.aperturas, {
      ...opcionesHttp(),
      params: parametros(filtro),
    });
  }

  resumenSucursales(rango: { desde?: string | null; hasta?: string | null } = {}): Observable<ResumenSucursalesCaja> {
    return this.http.get<ResumenSucursalesCaja>(urlConstants.caja.resumenSucursales, {
      ...opcionesHttp(),
      params: parametros(rango),
    });
  }

  /** PDF del resumen por sucursal. `id_sucursal` solo viaja si hay una sucursal elegida. */
  resumenSucursalesPdf(
    filtro: { desde?: string | null; hasta?: string | null; id_sucursal?: number | null } = {},
  ): Observable<Blob> {
    return this.http.get(urlConstants.caja.resumenSucursalesPdf, {
      ...opcionesHttp(),
      params: parametros(filtro),
      responseType: 'blob',
    });
  }

  cerrar(body: {
    id_apertura?: number;
    monto_conteo?: number | null;
    observacion?: string | null;
    id_arqueo?: number;
  }): Observable<{
    id_apertura: number;
    id_cierre: number | null;
    cerrada: boolean;
    monto_conteo: number | null;
    resumen?: ResumenTurnoCaja;
  }> {
    return this.http
      .post<{
        id_apertura: number;
        id_cierre: number | null;
        cerrada: boolean;
        monto_conteo: number | null;
        resumen?: ResumenTurnoCaja;
      }>(urlConstants.caja.cerrar, body, opcionesHttp())
      .pipe(
        tap(() => {
          this.invalidarSesion();
          this.eventos.emitir({ tipo: 'caja-cambio' });
        }),
      );
  }
}
