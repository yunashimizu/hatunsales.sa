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
