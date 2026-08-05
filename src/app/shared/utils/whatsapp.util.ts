/**
 * Utilidades WhatsApp (mismo criterio que la tienda: wa.me + dígitos con país).
 * Meta Cloud API vive en el backend; aquí solo normalización y enlaces.
 */

/** Celular Perú → 51XXXXXXXXX o null si inválido. */
export function normalizarTelefonoPe(telefono: string): string | null {
  let d = String(telefono ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('51') && d.length >= 11) return d.slice(0, 12);
  if (d.length === 9 && d.startsWith('9')) return `51${d}`;
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
}

export function urlWhatsappCliente(telefono: string, texto?: string): string | null {
  const dest = normalizarTelefonoPe(telefono);
  if (!dest) return null;
  const base = `https://wa.me/${dest}`;
  if (!texto?.trim()) return base;
  return `${base}?text=${encodeURIComponent(texto.trim())}`;
}

export function telefonoValidoPe(telefono: string): boolean {
  return !!normalizarTelefonoPe(telefono);
}
