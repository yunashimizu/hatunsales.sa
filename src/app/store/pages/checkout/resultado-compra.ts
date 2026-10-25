import { escapeHtml } from '../../../shared/services/alert.service';
import { codigoDeError } from '../../../shared/utils/errores-http.util';
import { Pedido } from '../../models/tienda.models';

export interface AvisoFinalCompra {
  titulo: string;
  /** HTML ya escapado, para AlertService con `allowHtml`. */
  mensaje: string;
}

/**
 * Mensaje al cerrar la compra. Un pedido cobrado con tarjeta queda confirmado;
 * uno con transferencia, Yape o pago contra entrega queda pendiente hasta que la
 * tienda valida el pago, y así se le dice al cliente (antes todos decían
 * "confirmado" aunque nadie hubiera cobrado nada).
 */
export function avisoFinalCompra(pedido: Pedido, metodoPago?: string): AvisoFinalCompra {
  const codigo = `<strong>${escapeHtml(pedido.codigo)}</strong>`;

  if (pedido.estado === 'pendiente') {
    const metodo = metodoPago?.trim() ? ` con ${escapeHtml(metodoPago.trim())}` : '';
    return {
      titulo: '¡Pedido registrado!',
      mensaje:
        `Tu número de pedido es ${codigo}. Ahora validaremos tu pago${metodo} y te avisaremos ` +
        'cuando lo confirmemos. Puedes seguir su estado en «Mis pedidos».',
    };
  }

  return {
    titulo: '¡Pedido confirmado!',
    mensaje: `Tu número de pedido es ${codigo}. Te enviaremos las novedades por correo.`,
  };
}

/** El backend no creó el pedido porque cambió un precio del carrito desde que el cliente lo vio. */
export function esPreciosActualizados(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 409 && codigoDeError(error) === 'PRECIOS_ACTUALIZADOS';
}
