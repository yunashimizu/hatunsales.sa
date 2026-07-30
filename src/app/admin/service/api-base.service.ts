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
  if (typeof cuerpo?.message === 'string') return cuerpo.message;
  if (typeof cuerpo?.error === 'string') return cuerpo.error;
  if (error?.status === 0) return 'No hay conexión con el servidor';
  if (typeof error?.message === 'string') return error.message;

  return porDefecto;
}

/** Código estable enviado por el backend (`error.error.codigo`). */
export function codigoDeError(error: any): string {
  const c = error?.error?.codigo;
  return typeof c === 'string' ? c : '';
}

const HINTS: Record<string, string> = {
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
};

const TITULOS: Record<string, string> = {
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
