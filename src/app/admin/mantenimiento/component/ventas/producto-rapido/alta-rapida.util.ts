/**
 * Lógica pura del alta rápida de producto en el punto de venta.
 *
 * No usa Angular ni HTTP a propósito: así cada regla (normalización del nombre,
 * duplicados, validaciones, cantidades, moneda) se puede probar con node sin
 * levantar nada. El componente `producto-rapido` solo la orquesta.
 */
import type { ProductoVenta } from '../../../../models/admin.models';

/** Límites del backend (CrearProductoRequest / AjustarStockRequest). */
export const MAX_LARGO_NOMBRE = 200;
export const MAX_LARGO_CODIGO = 60;
export const MAX_LARGO_COMENTARIO = 250;

/** Unidad de medida por defecto (código SUNAT «unidad»). */
export const UNIDAD_POR_DEFECTO = 'NIU';

/** Campos del formulario a los que puede apuntar una validación fallida. */
export type CampoAltaRapida =
  | 'nombre'
  | 'codigo_barras'
  | 'precio_venta'
  | 'precio_compra'
  | 'ingresa'
  | 'se_lleva';

export interface EntradaValidacion {
  modo: 'crear' | 'ingresar';
  nombre: string;
  codigoBarras?: string;
  precioVenta: unknown;
  precioCompra: unknown;
  ingresa: unknown;
  seLleva: unknown;
}

export interface ResultadoValidacion {
  valido: boolean;
  campo?: CampoAltaRapida;
  mensaje?: string;
}

/** Lo mínimo que hace falta de la respuesta de POST /producto para armar el ítem del POS. */
export interface ProductoCreadoLike {
  id_producto: number;
  nombre: string;
  sku?: string | null;
  codigo_barras?: string | null;
  unidad_medida?: string | null;
  precio_venta: number | string;
  descuento?: number | string | null;
}

/**
 * Misma normalización que `generarSlug` del backend
 * (hatunsales/src/bussnies/Bussnies/producto.bussnies.ts): NFD, sin marcas
 * diacríticas (tildes y la eñe pasan a n), minúsculas, todo lo que no sea
 * a-z / 0-9 se vuelve un guion, sin guiones en los bordes y recorte a 120.
 *
 * Dos nombres que dan la misma clave chocan en el slug de la tienda web, así
 * que esta clave es la que decide si un producto ya existe.
 */
export function normalizarNombre(nombre: string | null | undefined): string {
  return (nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/** El nombre debe dejar al menos un carácter útil tras normalizar (si no, el slug sale vacío). */
export function nombreTieneContenido(nombre: string | null | undefined): boolean {
  return normalizarNombre(nombre).length > 0;
}

/** Quita espacios de los bordes y colapsa los repetidos del medio. */
export function limpiarNombre(nombre: string | null | undefined): string {
  return (nombre ?? '').replace(/\s+/g, ' ').trim();
}

/** Dos nombres son «el mismo producto» cuando su clave normalizada coincide y no está vacía. */
export function sonMismoNombre(a: string | null | undefined, b: string | null | undefined): boolean {
  const clave = normalizarNombre(a);
  return clave.length > 0 && clave === normalizarNombre(b);
}

/** Busca entre los candidatos uno cuyo nombre sea idéntico al escrito (tras normalizar). */
export function buscarDuplicadoExacto<T extends { nombre: string }>(
  nombre: string,
  candidatos: readonly T[],
): T | null {
  const clave = normalizarNombre(nombre);
  if (!clave) return null;
  return candidatos.find((c) => normalizarNombre(c.nombre) === clave) ?? null;
}

/** Texto plano para comparar «contiene»: sin tildes, en minúsculas y con espacios simples. */
function textoPlano(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿El nombre del producto contiene lo que se está escribiendo (sin importar tildes ni mayúsculas)? */
export function coincideConTexto(nombreProducto: string | null | undefined, texto: string | null | undefined): boolean {
  const buscado = textoPlano(texto);
  if (!buscado) return false;
  return textoPlano(nombreProducto).includes(buscado);
}

/**
 * Junta varias listas de productos (local, servidor…) sin repetir ids, pone
 * primero los de nombre idéntico y recorta al límite.
 */
export function combinarParecidos<T extends { id_producto: number; nombre: string }>(
  nombre: string,
  listas: readonly (readonly T[])[],
  limite = 3,
): T[] {
  const vistos = new Set<number>();
  const todos: T[] = [];
  for (const lista of listas) {
    for (const producto of lista) {
      const id = Number(producto.id_producto);
      if (vistos.has(id)) continue;
      vistos.add(id);
      todos.push(producto);
    }
  }
  const clave = normalizarNombre(nombre);
  const exactos = clave ? todos.filter((p) => normalizarNombre(p.nombre) === clave) : [];
  const resto = todos.filter((p) => !exactos.includes(p));
  return [...exactos, ...resto].slice(0, Math.max(0, limite));
}

/** Convierte lo que deja un input numérico (number, string o null) en número; NaN si no hay dato. */
export function aNumero(valor: unknown): number {
  if (typeof valor === 'number') return valor;
  if (valor === null || valor === undefined) return NaN;
  if (typeof valor === 'string' && valor.trim() === '') return NaN;
  return Number(valor);
}

/** Entero de 1 en adelante (las unidades del alta rápida no admiten decimales). */
export function esEnteroPositivo(valor: unknown): boolean {
  const n = aNumero(valor);
  return Number.isSafeInteger(n) && n >= 1;
}

/** Redondeo comercial a 2 decimales (misma fórmula que el backend para precio_final). */
export function redondear2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Formato de moneda de la caja: `S/ 2,850.00`. No depende del idioma del
 * navegador, para que el eco del precio se lea igual en todas las PC.
 */
export function formatearMoneda(valor: unknown): string {
  const n = aNumero(valor);
  if (!Number.isFinite(n)) return 'S/ 0.00';
  const redondeado = redondear2(Math.abs(n));
  const [entero, decimales] = redondeado.toFixed(2).split('.');
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const signo = n < 0 && redondeado > 0 ? '-' : '';
  return `${signo}S/ ${conMiles}.${decimales}`;
}

/**
 * Aviso (no bloqueante) cuando se vende por debajo del costo. Solo aplica si
 * ambos precios están cargados: con compra en 0 no se sabe el costo.
 */
export function avisoPrecioBajoCosto(precioVenta: unknown, precioCompra: unknown): string {
  const venta = aNumero(precioVenta);
  const compra = aNumero(precioCompra);
  if (!(venta > 0) || !(compra > 0)) return '';
  if (venta >= compra) return '';
  return `El precio de venta (${formatearMoneda(venta)}) es menor que el de compra (${formatearMoneda(compra)}): venderá con pérdida.`;
}

/**
 * «Se lleva el cliente» sigue a «Ingresa al almacén» mientras el usuario no
 * la edite; una vez editada conserva su valor.
 */
export function cantidadSeLleva(
  ingresa: unknown,
  seLlevaActual: unknown,
  editadaPorUsuario: boolean,
): number | null {
  if (editadaPorUsuario) {
    const actual = aNumero(seLlevaActual);
    return Number.isFinite(actual) ? actual : null;
  }
  const n = aNumero(ingresa);
  return Number.isFinite(n) ? n : null;
}

/** Ayuda bajo las cantidades: «Entran N unidades al almacén. Al carrito se agregan M.» */
export function textoCantidades(ingresa: unknown, seLleva: unknown): string {
  if (!esEnteroPositivo(ingresa)) return 'Indique cuántas unidades ingresan al almacén.';
  const i = aNumero(ingresa);
  const entra = i === 1 ? 'Entra 1 unidad al almacén.' : `Entran ${i} unidades al almacén.`;
  if (!esEnteroPositivo(seLleva)) return entra;
  const s = aNumero(seLleva);
  const agrega = s === 1 ? 'Al carrito se agrega 1.' : `Al carrito se agregan ${s}.`;
  return `${entra} ${agrega}`;
}

/** «1 unidad» / «5 unidades», para los textos del botón y de los avisos. */
export function textoUnidades(cantidad: unknown): string {
  const n = aNumero(cantidad);
  if (!Number.isFinite(n)) return '0 unidades';
  return `${n} ${n === 1 ? 'unidad' : 'unidades'}`;
}

/**
 * Valida el formulario en el orden en que se llena y devuelve el primer
 * problema con el campo al que hay que llevar el foco.
 */
export function validarAltaRapida(datos: EntradaValidacion): ResultadoValidacion {
  if (datos.modo === 'crear') {
    const nombre = limpiarNombre(datos.nombre);
    if (!nombre) {
      return { valido: false, campo: 'nombre', mensaje: 'El nombre es obligatorio' };
    }
    if (!nombreTieneContenido(nombre)) {
      return { valido: false, campo: 'nombre', mensaje: 'El nombre debe tener letras o números' };
    }
    if (nombre.length > MAX_LARGO_NOMBRE) {
      return { valido: false, campo: 'nombre', mensaje: `El nombre admite hasta ${MAX_LARGO_NOMBRE} caracteres` };
    }
    if ((datos.codigoBarras ?? '').trim().length > MAX_LARGO_CODIGO) {
      return { valido: false, campo: 'codigo_barras', mensaje: `El código de barras admite hasta ${MAX_LARGO_CODIGO} caracteres` };
    }
    const venta = aNumero(datos.precioVenta);
    if (!Number.isFinite(venta) || venta <= 0) {
      return { valido: false, campo: 'precio_venta', mensaje: 'El precio de venta debe ser mayor a cero' };
    }
    const compra = aNumero(datos.precioCompra);
    if (Number.isFinite(compra) && compra < 0) {
      return { valido: false, campo: 'precio_compra', mensaje: 'El precio de compra no puede ser negativo' };
    }
  }

  if (datos.modo === 'crear') {
    if (!esEnteroPositivo(datos.ingresa)) {
      return { valido: false, campo: 'ingresa', mensaje: 'Indique cuántas unidades ingresan' };
    }
    return { valido: true };
  }

  return validarCantidades(datos.ingresa, datos.seLleva);
}

/** Cantidades del ingreso: enteras desde 1 y el cliente no se lleva más de lo que ingresa. */
export function validarCantidades(ingresa: unknown, seLleva: unknown): ResultadoValidacion {
  if (!esEnteroPositivo(ingresa)) {
    return { valido: false, campo: 'ingresa', mensaje: 'Indique cuántas unidades ingresan' };
  }
  if (!esEnteroPositivo(seLleva)) {
    return { valido: false, campo: 'se_lleva', mensaje: 'Indique cuántas unidades se lleva el cliente' };
  }
  if (aNumero(seLleva) > aNumero(ingresa)) {
    return {
      valido: false,
      campo: 'se_lleva',
      mensaje: 'El cliente no puede llevarse más unidades de las que ingresan',
    };
  }
  return { valido: true };
}

/**
 * Arma el ítem del POS a partir de la respuesta de POST /producto, con la misma
 * fórmula de `precio_final` que usa el backend (precio − descuento, a 2 decimales).
 */
export function construirProductoVenta(
  creado: ProductoCreadoLike,
  stockDisponible: number,
  unidadElegida: string = UNIDAD_POR_DEFECTO,
): ProductoVenta {
  const precioVenta = Number(creado.precio_venta) || 0;
  const descuento = Number(creado.descuento ?? 0) || 0;
  return {
    id_producto: Number(creado.id_producto),
    nombre: creado.nombre,
    sku: creado.sku ?? '',
    codigo_barras: creado.codigo_barras ?? '',
    unidad_medida: creado.unidad_medida || unidadElegida || UNIDAD_POR_DEFECTO,
    precio_venta: precioVenta,
    descuento,
    precio_final: redondear2(precioVenta - descuento),
    stock_disponible: Number.isFinite(stockDisponible) ? stockDisponible : 0,
    imagen_url: '',
  };
}

/** Estados HTTP en los que no se sabe si el servidor llegó a procesar la petición. */
export function esErrorDeRed(status: unknown): boolean {
  return typeof status === 'number' && [0, 408, 502, 503, 504].includes(status);
}

/** Comentario del ajuste de stock: «Alta rápida en caja · Nombre del usuario» (máx. 250). */
export function armarComentario(prefijo: string, usuario?: string | null): string {
  const quien = (usuario ?? '').trim();
  return (quien ? `${prefijo} · ${quien}` : prefijo).slice(0, MAX_LARGO_COMENTARIO);
}
