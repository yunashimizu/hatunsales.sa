import { HttpHeaders } from '@angular/common/http';

/**
 * Cabeceras con el token de sesión. Estaba repetido en cada servicio del panel.
 */
export function cabecerasAutenticadas(): HttpHeaders {
  const token = sessionStorage.getItem('token') ?? '';
  return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
}

export const opcionesHttp = () => ({
  headers: cabecerasAutenticadas(),
  withCredentials: true,
});

/**
 * Saca un mensaje legible de un error de la API.
 *
 * NestJS devuelve `message` como texto o como arreglo cuando falla la
 * validación, y hay que contemplar ambos casos para no mostrar "[object Object]".
 */
export function mensajeDeError(error: any, porDefecto = 'Ocurrió un error inesperado'): string {
  const cuerpo = error?.error;

  if (typeof cuerpo === 'string' && cuerpo.trim()) return cuerpo;
  if (Array.isArray(cuerpo?.message)) return cuerpo.message.join('. ');
  if (typeof cuerpo?.message === 'string') {
    // Nest responde "Internal server error" (en inglés y sin detalle) ante errores no controlados.
    if (/^internal server error$/i.test(cuerpo.message.trim())) {
      return `${porDefecto} (error interno del servidor)`;
    }
    return cuerpo.message;
  }
  if (typeof cuerpo?.error === 'string') return cuerpo.error;
  if (error?.status === 0) return 'No hay conexión con el servidor';
  if (typeof error?.message === 'string') return error.message;

  return porDefecto;
}

/**
 * Cuando el request usa `responseType: 'blob'`, Nest manda el JSON de error
 * también como Blob. Hay que leerlo antes de mostrar Alert2.
 */
export async function normalizarErrorBlob(error: any): Promise<any> {
  const cuerpo = error?.error;
  if (!(typeof Blob !== 'undefined' && cuerpo instanceof Blob)) {
    return error;
  }
  try {
    const texto = await cuerpo.text();
    if (!texto?.trim()) return error;
    try {
      return { ...error, error: JSON.parse(texto) };
    } catch {
      return { ...error, error: { message: texto } };
    }
  } catch {
    return error;
  }
}

/** Código estable enviado por el backend (`error.error.codigo`). */
export function codigoDeError(error: any): string {
  const c = error?.error?.codigo;
  return typeof c === 'string' ? c : '';
}

const HINTS: Record<string, string> = {
  SESION_EXPIRADA: 'Vuelve a iniciar sesión para continuar donde estabas.',
  CREDITO_INACTIVO: 'Ve a Cuentas por cobrar, busca el cliente/empresa y activa el crédito.',
  CREDITO_INSUFICIENTE: 'Baja el monto a crédito o aumenta el límite en CxC.',
  CREDITO_SIN_CLIENTE: 'Busca DNI/RUC en el POS antes de cobrar a crédito.',
  CREDITO_SIN_PERMISO: 'Inicia sesión como admin o caja.',
  PAGOS_NO_CUADRAN: 'Ajusta los montos de cada medio hasta igualar el total.',
  STOCK_INSUFICIENTE: 'Quita ítems o cambia de almacén.',
  CULQI_NO_CONFIRMADO: 'Verifica el cobro Yape otra vez o usa N° de operación manual.',
  CULQI_NO_CONFIG: 'Culqi aún no está configurado: usa referencia manual.',
  ENTIDAD_NO_ENCONTRADA: 'Créalo primero en Clientes y vuelve a buscar.',
  VENTA_SIN_ITEMS: 'Agrega al menos un producto al carrito.',
  CAJA_YA_ABIERTA_USUARIO: 'Cierra tu caja actual antes de abrir otra.',
  CAJA_OCUPADA: 'Elige otra caja libre o pide que cierren esa.',
  CAJA_APERTURA_NO_ENCONTRADA: 'Abre una caja desde el menú Caja.',
  CAJA_YA_CERRADA: 'Esa apertura ya estaba cerrada.',
  CAJA_CIERRE_NO_PERMITIDO: 'Solo puedes cerrar tu propia apertura (o un admin).',
  CAJA_NO_ABIERTA: 'Ve a Caja y abre tu turno antes de cobrar.',
  CLIENTE_CON_HISTORIAL: 'Conserve el cliente; tiene ventas, crédito u otros vínculos.',
  EMPRESA_CON_HISTORIAL: 'Conserve la empresa; tiene ventas o crédito vinculados.',
  COTIZACION_SIN_ITEMS: 'Agregue productos al carrito de la cotización.',
  COTIZACION_SIN_CLIENTE: 'Busque un cliente/empresa o escriba un nombre.',
  COTIZACION_TELEFONO_INVALIDO: 'Celular Perú: 9 dígitos empezando en 9.',
  COTIZACION_NO_ENCONTRADA: 'Vuelva a la lista e intente de nuevo.',
  COTIZACION_VENCIDA: 'Puede continuar con precios actuales si confirma.',
  COTIZACION_YA_CONVERTIDA: 'Abra la venta asociada o cree una cotización nueva.',
  COTIZACION_ESTADO_INVALIDO: 'Recargue la lista: el estado de la cotización cambió.',
  COTIZACION_CANTIDAD_INVALIDA: 'Use cantidades enteras de 1 o más (sin decimales).',
  COTIZACION_PRODUCTO_SIN_PRECIO: 'Asigne un precio de venta al producto en Productos o quítelo de la cotización.',
  COTIZACION_PRODUCTO_NO_ENCONTRADO: 'Quite el producto de la cotización y vuelva a buscarlo en el catálogo.',
  COTIZACION_DOCUMENTO_ERROR: 'La cotización sí quedó guardada. Reintente la descarga en unos segundos.',
  COTIZACION_ERROR_INTERNO: 'Reintente en unos segundos; si persiste, avise a sistemas.',
  SERIE_INVALIDA: 'La serie debe tener 4 caracteres y empezar con B (boleta) o F (factura).',
  SERIE_NO_CONFIGURADA: 'Configure las series en Configuración (admin).',
  INVENTARIO_STOCK_NEGATIVO: 'No hay suficientes unidades en ese almacén.',
  RECEPCION_SIN_ITEMS: 'Agregue al menos un producto a la recepción.',
  COMPROBANTE_EMISION_FALLIDA: 'La venta pudo quedar registrada; reintente en Documentos.',
  REPORTE_PERIODO_INVALIDO: 'Elija diario, quincenal, mensual o anual.',
  REPORTE_FECHA_INVALIDA: 'Revise el rango de fechas del reporte.',
  REPORTE_EXPORT_FALLIDA: 'Reintente la descarga; si persiste, avise a sistemas.',
};

const TITULOS: Record<string, string> = {
  SESION_EXPIRADA: 'Sesión expirada',
  CREDITO_INACTIVO: 'Crédito inactivo',
  CREDITO_INSUFICIENTE: 'Cupo insuficiente',
  CREDITO_SIN_CLIENTE: 'Cliente requerido',
  CREDITO_SIN_PERMISO: 'Sin permiso',
  PAGOS_NO_CUADRAN: 'Pagos incompletos',
  STOCK_INSUFICIENTE: 'Sin stock',
  CULQI_NO_CONFIRMADO: 'Pago no confirmado',
  CULQI_NO_CONFIG: 'Culqi no configurado',
  ENTIDAD_NO_ENCONTRADA: 'No encontrado',
  VENTA_SIN_ITEMS: 'Carrito vacío',
  CAJA_YA_ABIERTA_USUARIO: 'Ya tienes caja abierta',
  CAJA_OCUPADA: 'Caja ocupada',
  CAJA_APERTURA_NO_ENCONTRADA: 'Sin apertura',
  CAJA_YA_CERRADA: 'Ya cerrada',
  CAJA_CIERRE_NO_PERMITIDO: 'Cierre no permitido',
  CAJA_NO_ABIERTA: 'Abre caja primero',
  CLIENTE_CON_HISTORIAL: 'No se puede eliminar',
  EMPRESA_CON_HISTORIAL: 'No se puede eliminar',
  COTIZACION_SIN_ITEMS: 'Sin productos',
  COTIZACION_SIN_CLIENTE: 'Cliente requerido',
  COTIZACION_TELEFONO_INVALIDO: 'Teléfono inválido',
  COTIZACION_NO_ENCONTRADA: 'Cotización no encontrada',
  COTIZACION_VENCIDA: 'Cotización vencida',
  COTIZACION_YA_CONVERTIDA: 'Ya convertida en venta',
  COTIZACION_ESTADO_INVALIDO: 'Estado no permitido',
  COTIZACION_CANTIDAD_INVALIDA: 'Cantidad inválida',
  COTIZACION_PRODUCTO_SIN_PRECIO: 'Producto sin precio',
  COTIZACION_PRODUCTO_NO_ENCONTRADO: 'Producto no encontrado',
  COTIZACION_DOCUMENTO_ERROR: 'No se pudo generar el documento',
  COTIZACION_ERROR_INTERNO: 'Error al procesar la cotización',
  SERIE_INVALIDA: 'Serie inválida',
  SERIE_NO_CONFIGURADA: 'Configure series en Configuración',
  INVENTARIO_STOCK_NEGATIVO: 'Stock insuficiente',
  RECEPCION_SIN_ITEMS: 'Sin productos en recepción',
  COMPROBANTE_EMISION_FALLIDA: 'Error al emitir comprobante',
  REPORTE_PERIODO_INVALIDO: 'Periodo inválido',
  REPORTE_FECHA_INVALIDA: 'Fechas inválidas',
  REPORTE_EXPORT_FALLIDA: 'No se pudo exportar',
};

/**
 * Para Alert2: título + mensaje + hint según código del backend.
 * Compatible con errores viejos (sin codigo).
 * El mensaje ya viene escapado; usar `allowHtml: true` en AlertService.
 */
export function errorOperativo(
  error: any,
  porDefecto = 'Ocurrió un error inesperado',
): { title: string; message: string; codigo: string; allowHtml: true } {
  const codigo = codigoDeError(error);
  const message = escapeHtmlAlerta(mensajeDeError(error, porDefecto));
  const hint = HINTS[codigo];
  return {
    codigo,
    title: TITULOS[codigo] || 'No se pudo completar',
    message: hint ? `${message}<br><br><small>${escapeHtmlAlerta(hint)}</small>` : message,
    allowHtml: true,
  };
}

/** Escapa texto dinámico antes de insertarlo en HTML de Alert2. */
export function escapeHtmlAlerta(texto: string): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
