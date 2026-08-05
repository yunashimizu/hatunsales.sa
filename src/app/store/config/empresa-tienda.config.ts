/**
 * Datos públicos de la empresa en la tienda.
 * Cambiar aquí (marca, dirección, teléfono, mapa) sin tocar las pantallas.
 *
 * Marca:
 * - nombreCorto → logo / header / pie corto
 * - nombre → razón social (legal, contacto, ©)
 */
export const EMPRESA_TIENDA = {
  nombreCorto: 'HatunSales',
  nombre: 'HatunSales S.A.C',
  eslogan: 'Ferretería y construcción',
  /** Dirección visible al cliente */
  direccion: 'Av. Principal 123, Lima, Perú',
  distrito: 'Lima',
  referencia: 'A una cuadra del óvalo principal',
  /** Solo dígitos con código país, sin + (WhatsApp / tel) */
  telefonoWhatsapp: '51999999999',
  telefonoMostrar: '(01) 999 999 999',
  email: 'ventas@hatunsales.pe',
  horario: 'Lun a Sáb, 8:00 – 19:00',
  horarioDomingo: 'Domingo: cerrado',
  /** Query para Google Maps Embed (sin API key) */
  mapaQuery: 'Lima, Perú',
  facebook: 'https://facebook.com',
  instagram: 'https://instagram.com',
  tiktok: 'https://tiktok.com',
} as const;

export function urlWhatsapp(texto?: string): string {
  const base = `https://wa.me/${EMPRESA_TIENDA.telefonoWhatsapp}`;
  if (!texto?.trim()) return base;
  return `${base}?text=${encodeURIComponent(texto.trim())}`;
}

export function urlTelefono(): string {
  return `tel:+${EMPRESA_TIENDA.telefonoWhatsapp}`;
}

export function urlMailto(): string {
  return `mailto:${EMPRESA_TIENDA.email}`;
}

/** Iframe de Maps sin clave de API (embed clásico). */
export function urlMapaEmbed(): string {
  const q = encodeURIComponent(EMPRESA_TIENDA.mapaQuery);
  return `https://maps.google.com/maps?q=${q}&hl=es&z=15&output=embed`;
}

export function urlMapaAbrir(): string {
  const q = encodeURIComponent(EMPRESA_TIENDA.mapaQuery);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
