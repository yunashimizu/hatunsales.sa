import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { peticionSilenciosa } from '../../interceptors/contexto-http';
import {
  Almacen, FilaInventario, MovimientoInventario, Paginado, ResumenInventario,
} from '../models/admin.models';
import { cabecerasAutenticadas, cacheCorto, opcionesHttp } from './api-base.service';
import { EventosPanelService } from './eventos-panel.service';

export interface FiltroInventario {
  texto?: string;
  id_almacen?: number | '';
  id_categoria?: number | '';
  /** Solo las filas de ese producto (la ficha de producto lee así su stock exacto). */
  id_producto?: number;
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

/** Stock de un producto en un almacén (los almacenes sin fila salen con `stock 0` y `registrado false`). */
export interface StockPorAlmacen {
  id_almacen: number;
  almacen: string;
  sucursal: string;
  stock: number;
  registrado: boolean;
}

@Injectable({ providedIn: 'root' })
export class InventarioAdminService {

  /** Sidebar, dashboard, Inventario y Stock lo piden a la vez al cargar: una sola petición. No es readonly: `invalidarResumen()` lo recrea. */
  private resumenCompartido = cacheCorto<ResumenInventario>(5000);
  private readonly eventos = inject(EventosPanelService);

  constructor(private http: HttpClient) {}

  /** Olvida el resumen guardado: la siguiente lectura consulta de nuevo (tras una venta, una recepción o un ajuste). */
  invalidarResumen(): void {
    this.resumenCompartido = cacheCorto<ResumenInventario>(5000);
  }

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

  resumen(opciones: { silenciosa?: boolean } = {}): Observable<ResumenInventario> {
    return this.resumenCompartido(() =>
      this.http.get<ResumenInventario>(urlConstants.inventario.resumen, {
        ...opcionesHttp(),
        ...(opciones.silenciosa ? { context: peticionSilenciosa() } : {}),
      }),
    );
  }

  almacenes(): Observable<Almacen[]> {
    return this.http.get<Almacen[]>(urlConstants.inventario.almacenes, opcionesHttp());
  }

  /** Stock de un producto en todos los almacenes con una sola consulta (la ficha cambia de almacén sin red). */
  stockPorProducto(idProducto: number): Observable<StockPorAlmacen[]> {
    return this.http.get<StockPorAlmacen[]>(urlConstants.inventario.stockProducto(idProducto), opcionesHttp());
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
    return this.http.post<{ stock: number }>(urlConstants.inventario.ajuste, ajuste, opcionesHttp()).pipe(
      tap(() => this.eventos.emitir({ tipo: 'stock-cambio', datos: { id_producto: ajuste.id_producto } })),
    );
  }

  transferir(datos: {
    id_producto: number;
    id_almacen_origen: number;
    id_almacen_destino: number;
    cantidad: number;
    comentario?: string;
  }): Observable<any> {
    return this.http.post(urlConstants.inventario.transferencia, datos, opcionesHttp()).pipe(
      tap(() => this.eventos.emitir({ tipo: 'stock-cambio', datos: { id_producto: datos.id_producto } })),
    );
  }

  fijarStockMinimo(idInventario: number, stockMinimo: number): Observable<any> {
    return this.http.put(
      urlConstants.inventario.stockMinimo(idInventario),
      { stock_minimo: stockMinimo },
      opcionesHttp(),
    );
  }
}
