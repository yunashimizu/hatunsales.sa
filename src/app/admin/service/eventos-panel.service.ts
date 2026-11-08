import { Injectable } from '@angular/core';
import { Observable, Subject, filter } from 'rxjs';

/** Qué pasó en el panel: lo emiten los servicios al terminar la operación y lo escuchan las pantallas que lo muestran. */
export type TipoEventoPanel =
  | 'venta-registrada'
  | 'comprobante-actualizado'
  | 'caja-cambio'
  | 'pedido-cambio'
  | 'stock-cambio';

export interface EventoPanel {
  tipo: TipoEventoPanel;
  /** Datos del cambio (p. ej. `{ id_comprobante, estado, estado_sunat, aceptada_sunat }`). */
  datos?: Record<string, unknown>;
  /**
   * true: aviso de «esto está en camino» (estado optimista) que aún no cambió nada en el servidor.
   * `de()` no lo entrega (no hay que refrescar cachés); `deConProvisionales()` sí.
   */
  provisional?: boolean;
}

/**
 * Bus de eventos del panel: en vez de que cada pantalla espere a su reloj de 60 s, el servicio que hizo el
 * cambio lo avisa y quien lo muestra se actualiza al instante (campana, Inicio, menú, Documentos).
 *
 * No depende de ningún otro servicio: así cualquiera puede inyectarlo sin ciclos. Vive en memoria, solo en
 * esta pestaña (no hay WebSocket).
 */
@Injectable({ providedIn: 'root' })
export class EventosPanelService {
  private readonly flujo = new Subject<EventoPanel>();

  emitir(evento: EventoPanel): void {
    this.flujo.next(evento);
  }

  /** Eventos de los tipos pedidos (todos si no se indica ninguno), sin los provisionales. */
  de(...tipos: TipoEventoPanel[]): Observable<EventoPanel> {
    return this.deConProvisionales(...tipos).pipe(filter((e) => !e.provisional));
  }

  /** Igual que `de()` pero también entrega los eventos provisionales (estados optimistas). */
  deConProvisionales(...tipos: TipoEventoPanel[]): Observable<EventoPanel> {
    return this.flujo.pipe(filter((e) => !tipos.length || tipos.includes(e.tipo)));
  }
}
