import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { urlConstants } from '../../constants/urlConstants';
import {
  ConfiguracionPasarela,
  CrearPedidoPayload,
  CuponValidado,
  MetodoEnvio,
  MetodoPago,
  PagarPedidoPayload,
  Pedido,
} from '../models/tienda.models';

const PASARELA_POR_DEFECTO: ConfiguracionPasarela = {
  proveedor: 'simulada',
  llave_publica: '',
  moneda: 'PEN',
  requiere_token: false,
};

@Injectable({ providedIn: 'root' })
export class CheckoutService {

  private readonly http = inject(HttpClient);

  metodosEnvio(): Observable<MetodoEnvio[]> {
    return this.http.get<MetodoEnvio[]>(urlConstants.tienda.metodosEnvio).pipe(catchError(() => of([])));
  }

  metodosPago(): Observable<MetodoPago[]> {
    return this.http.get<MetodoPago[]>(urlConstants.tienda.metodosPago).pipe(catchError(() => of([])));
  }

  /** Proveedor activo y llave pública para tokenizar la tarjeta. */
  pasarela(): Observable<ConfiguracionPasarela> {
    return this.http
      .get<ConfiguracionPasarela>(urlConstants.tienda.pasarela)
      .pipe(catchError(() => of(PASARELA_POR_DEFECTO)));
  }

  validarCupon(codigo: string, monto: number): Observable<CuponValidado> {
    return this.http.post<CuponValidado>(urlConstants.tienda.validarCupon, { codigo, monto });
  }

  /**
   * Crea el pedido enviando la clave de idempotencia. Si la respuesta se pierde
   * y el usuario reintenta, el backend reconoce la clave y devuelve el mismo
   * pedido en lugar de crear otro.
   */
  crearPedido(payload: CrearPedidoPayload, clave: string): Observable<Pedido> {
    return this.http.post<Pedido>(
      urlConstants.tienda.pedidos,
      { ...payload, clave_idempotencia: clave },
      { headers: this.conClave(clave) },
    );
  }

  pagar(idPedido: number, payload: PagarPedidoPayload, clave: string): Observable<Pedido> {
    return this.http.post<Pedido>(
      urlConstants.tienda.pedidoPagar(idPedido),
      { ...payload, clave_idempotencia: clave },
      { headers: this.conClave(clave) },
    );
  }

  private conClave(clave: string): HttpHeaders {
    return new HttpHeaders({ 'Idempotency-Key': clave });
  }
}
