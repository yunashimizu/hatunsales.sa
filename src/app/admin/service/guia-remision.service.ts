import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { opcionesHttp } from './api-base.service';

export interface GuiaRemisionItem {
  id_producto: number;
  id_venta_detalle?: number;
  codigo: string;
  descripcion: string;
  cantidad: number;
  unidad_medida: string;
  orden?: number;
}

export interface ContextoVentaGuia {
  venta: { id_venta: number; fecha: string; total: number; id_cliente?: number; id_empresa?: number };
  comprobante?: { id_comprobante: number; serie: string; numero: number; estado: string; aceptada_sunat: boolean };
  destinatario: { tipo_documento: string; numero_documento: string; denominacion: string; direccion: string; ubigeo: string };
  items: GuiaRemisionItem[];
  origen: { id_almacen: number | null; direccion: string; ubigeo: string; nombre: string; almacenes: number[] };
}

export interface GuiaRemision {
  id_guia?: number;
  id_venta?: number;
  id_comprobante?: number;
  serie?: string;
  numero?: number;
  estado: string;
  fecha_inicio_traslado?: string;
  direccion_origen: string;
  direccion_destino: string;
  destinatario?: { tipo_documento: string; numero_documento: string; denominacion: string; direccion: string };
  items: GuiaRemisionItem[];
  error_mensaje?: string;
  creado_en?: string;
}

export interface CrearGuiaRemision {
  id_venta: number;
  id_comprobante?: number;
  fecha_inicio_traslado: string;
  motivo_traslado_codigo: string;
  modalidad_traslado: string;
  direccion_origen: string;
  direccion_destino: string;
  origen_ubigeo?: string;
  destino_ubigeo?: string;
  peso_bruto_total: number;
  unidad_peso: string;
  numero_bultos?: number;
  placa_principal?: string;
  marca_vehiculo?: string;
  conductor_nombre?: string;
  conductor_tipo_doc?: string;
  conductor_numero_doc?: string;
  conductor_licencia?: string;
  observaciones?: string;
  clave_idempotencia?: string;
}

@Injectable({ providedIn: 'root' })
export class GuiaRemisionService {
  constructor(private readonly http: HttpClient) {}

  listar(): Observable<GuiaRemision[]> {
    return this.http.get<GuiaRemision[]>(urlConstants.guiaRemision.base, opcionesHttp());
  }

  contextoVenta(idVenta: number): Observable<ContextoVentaGuia> {
    return this.http.get<ContextoVentaGuia>(urlConstants.guiaRemision.contextoVenta(idVenta), opcionesHttp());
  }

  crear(datos: CrearGuiaRemision): Observable<GuiaRemision> {
    return this.http.post<GuiaRemision>(urlConstants.guiaRemision.base, datos, opcionesHttp());
  }

  porId(id: number): Observable<GuiaRemision> {
    return this.http.get<GuiaRemision>(urlConstants.guiaRemision.byId(id), opcionesHttp());
  }

  pdf(id: number): Observable<Blob> {
    return this.http.get(urlConstants.guiaRemision.pdf(id), { ...opcionesHttp(), responseType: 'blob' });
  }
}
