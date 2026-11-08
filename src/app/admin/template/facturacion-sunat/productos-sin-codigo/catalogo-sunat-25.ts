/**
 * Buscador local del catálogo 25 de SUNAT (códigos de producto UNSPSC, 8 dígitos) para la ferretería.
 * La lista vive en `assets/sunat/catalogo-25-ferreteria.json` (segmentos 23, 24, 27, 30, 31, 39, 40, 46, 47 y 52).
 * Es una lista de apoyo: el archivo declara su fuente y su fecha, y `oficial` dice si salió del anexo de SUNAT.
 */

export interface ClaseCatalogo25 {
  /** 8 dígitos. */
  codigo: string;
  nombre: string;
}

export interface CatalogoSunat25 {
  fuente: string;
  fecha: string;
  /** true solo si la lista se generó desde el anexo oficial del catálogo 25. */
  oficial: boolean;
  clases: ClaseCatalogo25[];
}

export const RUTA_CATALOGO_25 = 'assets/sunat/catalogo-25-ferreteria.json';

/** Minúsculas y sin tildes: «Pintúra» y «pintura» son lo mismo al buscar. */
export function normalizarBusqueda(texto: string): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lee el JSON del catálogo sin fiarse de su forma: descarta lo que no tenga un código de 8 dígitos y un nombre. */
export function leerCatalogo25(crudo: unknown): CatalogoSunat25 {
  const base = (crudo ?? {}) as Record<string, unknown>;
  const lista = Array.isArray(base['clases']) ? (base['clases'] as unknown[]) : [];
  const clases: ClaseCatalogo25[] = [];
  for (const fila of lista) {
    if (!Array.isArray(fila)) continue;
    const codigo = String(fila[0] ?? '').trim();
    const nombre = String(fila[1] ?? '').trim();
    if (/^\d{8}$/.test(codigo) && nombre) clases.push({ codigo, nombre });
  }
  return {
    fuente: String(base['fuente'] ?? ''),
    fecha: String(base['fecha'] ?? ''),
    oficial: base['oficial'] === true,
    clases,
  };
}

/** Quita la «s» final para que «martillo» encuentre «martillos» y «llaves» encuentre «llave». */
function raiz(palabra: string): string {
  return palabra.length > 3 && palabra.endsWith('s') ? palabra.slice(0, -1) : palabra;
}

/**
 * Busca por nombre (todas las palabras escritas deben aparecer, en cualquier orden) o por el comienzo del código.
 * Primero van los nombres que empiezan con lo escrito y luego los demás, cada grupo en el orden del catálogo.
 */
export function buscarClases(clases: readonly ClaseCatalogo25[], texto: string, limite = 8): ClaseCatalogo25[] {
  const consulta = normalizarBusqueda(texto);
  if (!consulta) return [];
  if (/^\d+$/.test(consulta)) {
    return clases.filter((c) => c.codigo.startsWith(consulta)).slice(0, limite);
  }
  const palabras = consulta.split(' ').filter(Boolean).map(raiz);
  const empiezan: ClaseCatalogo25[] = [];
  const contienen: ClaseCatalogo25[] = [];
  for (const clase of clases) {
    const nombre = normalizarBusqueda(clase.nombre);
    if (!palabras.every((p) => nombre.includes(p))) continue;
    (nombre.startsWith(palabras[0]) ? empiezan : contienen).push(clase);
  }
  return [...empiezan, ...contienen].slice(0, limite);
}
