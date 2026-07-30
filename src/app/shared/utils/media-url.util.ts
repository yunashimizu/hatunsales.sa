import { dominio } from '../../constants/urlConstants';

/**
 * Convierte rutas de imagen de la API en URLs que el navegador puede cargar.
 *
 * - Cloudinary / http(s) → se dejan igual
 * - `/archivos/12` → `https://api.../archivos/12`
 * - `uploads/...` (legado) → `https://api.../uploads/...`
 */
export function urlMedia(
  ruta: string | null | undefined,
  placeholder = '',
): string {
  if (!ruta?.trim()) return placeholder;

  const valor = ruta.trim();
  if (/^https?:\/\//i.test(valor) || valor.startsWith('data:') || valor.startsWith('assets/')) {
    return valor;
  }

  // Evita duplicar el dominio si alguna vez llega absoluto sin protocolo raro.
  if (valor.startsWith(dominio)) return valor;

  return `${dominio}${valor.replace(/^\/+/, '')}`;
}
