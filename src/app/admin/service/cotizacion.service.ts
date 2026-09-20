import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { opcionesHttp } from './api-base.service';

export interface CotizacionItem {
  id_producto: number;
  /** Entero >= 1 (la columna en BD es INTEGER, igual que el stock). */
  cantidad: number;
  /** Precio con IGV. Al guardar, el backend usa el precio vigente del catálogo. */
  precio_unitario: number;
  subtotal?: number;
  descripcion?: string;
  sku?: string;
}

export interface Cotizacion {
  id_proforma: number;
  codigo?: string | null;
  estado: string;
  id_empresa?: number | null;
  id_cliente?: number | null;
  cliente_nombre?: string | null;
  /** DNI o RUC del cliente/empresa, si el backend lo resuelve. */
  cliente_documento?: string | null;
  cliente_direccion?: string | null;
  telefono_envio?: string | null;
  id_almacen?: number | null;
  almacen_nombre?: string | null;
  observaciones?: string | null;
  valida_hasta?: string | null;
  serie?: string | null;
  numero?: number | null;
  total_gravada: number;
  total_igv: number;
  total: number;
  porcentaje_igv?: number;
  id_venta?: number | null;
  enviada_wa_en?: string | null;
  items: CotizacionItem[];
  creado_en?: string;
}

export interface CrearCotizacionPayload {
  id_cliente?: number;
  id_empresa?: number;
  cliente_nombre?: string;
  telefono_envio?: string;
  id_almacen?: number;
  observaciones?: string;
  dias_vigencia?: number;
  total_gravada?: number;
  total_igv?: number;
  total?: number;
  items: CotizacionItem[];
}

export interface RespuestaEnvioWhatsapp {
  modo: string;
  ok: boolean;
  wa_me_url?: string;
  mensaje?: string;
  texto?: string;
}

@Injectable({ providedIn: 'root' })
export class CotizacionService {
  constructor(private readonly http: HttpClient) {}

  listar(): Observable<Cotizacion[]> {
    return this.http.get<Cotizacion[]>(urlConstants.proforma.base, opcionesHttp());
  }

  porId(id: number): Observable<Cotizacion> {
    return this.http.get<Cotizacion>(urlConstants.proforma.byId(id), opcionesHttp());
  }

  crear(payload: CrearCotizacionPayload): Observable<Cotizacion> {
    return this.http.post<Cotizacion>(urlConstants.proforma.base, payload, opcionesHttp());
  }

  marcar(id: number, body: { estado?: string; id_venta?: number }): Observable<Cotizacion> {
    return this.http.put<Cotizacion>(urlConstants.proforma.byId(id), body, opcionesHttp());
  }

  /**
   * PDF de la proforma generado en el backend.
   * Si falla, el JSON de error llega como Blob: leerlo con `normalizarErrorBlob`.
   */
  pdf(id: number): Observable<Blob> {
    return this.http.get(urlConstants.proforma.pdf(id), {
      ...opcionesHttp(),
      responseType: 'blob' as const,
    });
  }

  /** Excel (.xlsx) de la proforma generado en el backend. Errores igual que `pdf()`. */
  excel(id: number): Observable<Blob> {
    return this.http.get(urlConstants.proforma.excel(id), {
      ...opcionesHttp(),
      responseType: 'blob' as const,
    });
  }

  whatsappEstado(): Observable<{ cloud_habilitado: boolean; modo: string; mensaje: string }> {
    return this.http.get<{ cloud_habilitado: boolean; modo: string; mensaje: string }>(
      urlConstants.proforma.whatsappEstado,
      opcionesHttp(),
    );
  }

  enviarWhatsapp(body: {
    id_proforma?: number;
    telefono: string;
    texto?: string;
    /** Por defecto el API usa wa.me (el vendedor adjunta el PDF de la proforma). */
    solo_wa_me?: boolean;
  }): Observable<RespuestaEnvioWhatsapp> {
    return this.http.post<RespuestaEnvioWhatsapp>(
      urlConstants.proforma.whatsappEnviar,
      { solo_wa_me: true, ...body },
      opcionesHttp(),
    );
  }
}
