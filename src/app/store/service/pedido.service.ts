import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { urlConstants } from '../../constants/urlConstants';
import { EstadoPedido, Pedido } from '../models/tienda.models';

/** Etiquetas y estilo del timeline de seguimiento, en un solo lugar. */
export const PASOS_PEDIDO: { estado: EstadoPedido; etiqueta: string; icono: string }[] = [
  { estado: 'pendiente',  etiqueta: 'Pedido recibido', icono: 'bi-receipt' },
  { estado: 'pagado',     etiqueta: 'Pago confirmado', icono: 'bi-credit-card' },
  { estado: 'preparando', etiqueta: 'En preparación',  icono: 'bi-box-seam' },
  { estado: 'enviado',    etiqueta: 'En camino',       icono: 'bi-truck' },
  { estado: 'entregado',  etiqueta: 'Entregado',       icono: 'bi-check-circle' },
];

@Injectable({ providedIn: 'root' })
export class PedidoService {

  private readonly http = inject(HttpClient);

  misPedidos(): Observable<Pedido[]> {
    return this.http.get<Pedido[]>(urlConstants.tienda.pedidos).pipe(catchError(() => of([])));
  }

  detalle(id: number): Observable<Pedido> {
    return this.http.get<Pedido>(urlConstants.tienda.pedidoById(id));
  }

  porCodigo(codigo: string): Observable<Pedido> {
    return this.http.get<Pedido>(urlConstants.tienda.pedidoByCodigo(codigo));
  }

  cancelar(id: number, motivo?: string): Observable<Pedido> {
    return this.http.put<Pedido>(urlConstants.tienda.pedidoCancelar(id), { motivo });
  }

  /** Índice del estado dentro del flujo; -1 si el pedido fue cancelado. */
  indicePaso(estado: EstadoPedido): number {
    if (estado === 'cancelado') return -1;
    return PASOS_PEDIDO.findIndex((paso) => paso.estado === estado);
  }
}
