import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, forkJoin, map, tap } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { peticionSilenciosa } from '../../interceptors/contexto-http';
import { EstadoPedido, Pedido } from '../../store/models/tienda.models';
import { cacheCorto, opcionesHttp } from './api-base.service';

/** Lo que el panel debe atender de los pedidos web: cobrar los pendientes y preparar los pagados. */
export interface ResumenPedidosWeb {
  pendientes: number;
  pagados: number;
  /** pendientes + pagados: es el número del badge del menú y de la fila del Inicio. */
  total: number;
}

/**
 * Flujo de estados del pedido (espejo de `FLUJO_ESTADOS` en pedido.bussnies.ts):
 * solo avanza; «cancelado» se alcanza desde cualquier estado no final.
 */
export const FLUJO_PEDIDO: readonly EstadoPedido[] = ['pendiente', 'pagado', 'preparando', 'enviado', 'entregado'];

/** Siguiente estado al que el panel puede mover el pedido con «Avanzar» (pendiente → pagado va por «Confirmar pago»). */
export function siguienteEstadoPedido(estado: EstadoPedido): EstadoPedido | null {
  if (estado === 'cancelado' || estado === 'entregado' || estado === 'pendiente') return null;
  const i = FLUJO_PEDIDO.indexOf(estado);
  return i >= 0 && i < FLUJO_PEDIDO.length - 1 ? FLUJO_PEDIDO[i + 1] : null;
}

/** ¿Se puede cancelar? Cualquier estado que no sea final. */
export function pedidoCancelable(estado: EstadoPedido): boolean {
  return estado !== 'cancelado' && estado !== 'entregado';
}

/** Pedidos web de la tienda vistos desde el panel (`admin/pedidos`; roles admin, vendedor y caja). */
@Injectable({ providedIn: 'root' })
export class PedidoAdminService {
  private readonly resumen$ = new BehaviorSubject<ResumenPedidosWeb | null>(null);
  private readonly compartir = cacheCorto<ResumenPedidosWeb>(5000);

  /** Último resumen conocido (null hasta la primera lectura): lo escuchan el menú y el Inicio. */
  readonly resumen = this.resumen$.asObservable();

  constructor(private http: HttpClient) {}

  listar(estado?: EstadoPedido | ''): Observable<Pedido[]> {
    let params = new HttpParams();
    if (estado) params = params.set('estado', estado);
    return this.http.get<Pedido[]>(urlConstants.admin.pedidos, { ...opcionesHttp(), params });
  }

  detalle(id: number): Observable<Pedido> {
    return this.http.get<Pedido>(`${urlConstants.admin.pedidos}/${id}`, opcionesHttp());
  }

  /** Mueve el pedido al estado indicado. El servidor valida la transición (solo avanza; «pagado» va por confirmarPago). */
  cambiarEstado(id: number, estado: EstadoPedido, comentario?: string): Observable<Pedido> {
    const cuerpo: { estado: EstadoPedido; comentario?: string } = { estado };
    if (comentario?.trim()) cuerpo.comentario = comentario.trim();
    return this.http.put<Pedido>(`${urlConstants.admin.pedidos}/${id}/estado`, cuerpo, opcionesHttp());
  }

  /** Confirma un pago hecho por fuera de la pasarela (transferencia, Yape, contra entrega): registra el cobro y genera la venta. */
  confirmarPago(id: number, referencia?: string): Observable<Pedido> {
    const cuerpo: { referencia?: string } = {};
    if (referencia?.trim()) cuerpo.referencia = referencia.trim();
    return this.http.put<Pedido>(`${urlConstants.admin.pedidos}/${id}/confirmar-pago`, cuerpo, opcionesHttp());
  }

  /** Cuenta pendientes y pagados (dos lecturas filtradas, ligeras) y publica el resultado. Silenciosa: no avisa si falla. */
  porPreparar(): Observable<ResumenPedidosWeb> {
    return this.compartir(() => {
      const leer = (estado: EstadoPedido) =>
        this.http.get<Pedido[]>(urlConstants.admin.pedidos, {
          ...opcionesHttp(),
          params: new HttpParams().set('estado', estado),
          context: peticionSilenciosa(),
        });
      return forkJoin({ p: leer('pendiente'), g: leer('pagado') }).pipe(
        map(({ p, g }) => this.armarResumen(Array.isArray(p) ? p.length : 0, Array.isArray(g) ? g.length : 0)),
      );
    }).pipe(tap((r) => this.resumen$.next(r)));
  }

  /** La pantalla de pedidos ya tiene la lista completa: publica el resumen sin otra petición. */
  publicarDesde(pedidos: Pedido[]): void {
    const cuenta = (e: EstadoPedido) => pedidos.filter((p) => p.estado === e).length;
    this.resumen$.next(this.armarResumen(cuenta('pendiente'), cuenta('pagado')));
  }

  private armarResumen(pendientes: number, pagados: number): ResumenPedidosWeb {
    return { pendientes, pagados, total: pendientes + pagados };
  }
}
