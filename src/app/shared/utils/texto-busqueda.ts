/** Texto para comparar al buscar: sin tildes ni mayúsculas y con espacios simples. «Caña  Pescar» → «cana pescar». */
export function normalizarBusqueda(texto: string | null | undefined): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿Están todas las palabras de `consulta` en `texto`, en cualquier orden? Los dos ya normalizados. Consulta vacía = sí. */
export function contienePalabras(texto: string, consulta: string): boolean {
  if (!consulta) return true;
  return consulta.split(' ').every((palabra) => texto.includes(palabra));
}
