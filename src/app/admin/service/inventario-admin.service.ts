import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import {
  Almacen, FilaInventario, MovimientoInventario, Paginado, ResumenInventario,
} from '../models/admin.models';
import { cabecerasAutenticadas, opcionesHttp } from './api-base.service';

export interface FiltroInventario {
  texto?: string;
  id_almacen?: number | '';
  id_categoria?: number | '';
  solo_alertas?: boolean;
  pagina?: number;
  por_pagina?: number;
}

export interface AjusteStock {
  id_producto: number;
  id_almacen: number;
  cantidad: number;
  motivo: string;
  comentario?: string;
}

@Injectable({ providedIn: 'root' })
export class InventarioAdminService {

  constructor(private http: HttpClient) {}

  listar(filtro: FiltroInventario = {}): Observable<Paginado<FilaInventario>> {
    let params = new HttpParams();
    Object.entries(filtro).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '' && valor !== false) {
        params = params.set(clave, String(valor));
      }
    });

    return this.http.get<Paginado<FilaInventario>>(urlConstants.inventario.detallado, {
      headers: cabecerasAutenticadas(),
      withCredentials: true,
      params,
    });
  }

  resumen(): Observable<ResumenInventario> {
    return this.http.get<ResumenInventario>(urlConstants.inventario.resumen, opcionesHttp());
  }

  almacenes(): Observable<Almacen[]> {
    return this.http.get<Almacen[]>(urlConstants.inventario.almacenes, opcionesHttp());
  }

  movimientos(idProducto?: number, limite = 50): Observable<MovimientoInventario[]> {
    let params = new HttpParams().set('limite', String(limite));
    if (idProducto) params = params.set('id_producto', String(idProducto));

    return this.http.get<MovimientoInventario[]>(urlConstants.inventario.movimientos, {
      headers: cabecerasAutenticadas(),
      withCredentials: true,
      params,
    });
  }

  /** Entrada o salida con motivo, que queda registrada en el kardex. */
  ajustar(ajuste: AjusteStock): Observable<{ stock: number }> {
    return this.http.post<{ stock: number }>(urlConstants.inventario.ajuste, ajuste, opcionesHttp());
  }

  transferir(datos: {
    id_producto: number;
    id_almacen_origen: number;
    id_almacen_destino: number;
    cantidad: number;
    comentario?: string;
  }): Observable<any> {
    return this.http.post(urlConstants.inventario.transferencia, datos, opcionesHttp());
  }

  fijarStockMinimo(idInventario: number, stockMinimo: number): Observable<any> {
    return this.http.put(
      urlConstants.inventario.stockMinimo(idInventario),
      { stock_minimo: stockMinimo },
      opcionesHttp(),
    );
  }
}
