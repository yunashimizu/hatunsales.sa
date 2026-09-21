// Tipos que devuelve el backend del panel. Reflejan uno a uno las respuestas
// para no tener que adivinar la forma de los datos en cada componente.

export type OrigenReceptor = 'base' | 'externo' | 'generico';

export interface Receptor {
  origen: OrigenReceptor;
  tipo: 'cliente' | 'empresa';
  id_cliente?: number;
  id_empresa?: number;
  tipo_documento: number;
  numero_documento: string;
  denominacion: string;
  direccion: string;
  email: string;
  telefono: string;
  nombre_comercial?: string;
  estado?: string;
  condicion?: string;
  admite_factura: boolean;
  advertencia?: string;
}

export interface SugerenciaReceptor {
  tipo: 'cliente' | 'empresa';
  id_cliente?: number;
  id_empresa?: number;
  tipo_documento: number;
  numero_documento: string;
  denominacion: string;
}

export interface ProductoVenta {
  id_producto: number;
  nombre: string;
  sku: string;
  codigo_barras: string;
  unidad_medida: string;
  precio_venta: number;
  descuento: number;
  precio_final: number;
  reglas_mayoristas?: { id_regla: number; cantidad_minima: number; descuento_unitario: number }[];
  stock_disponible: number;
  imagen_url: string;
}

/** Línea del carrito del mostrador, antes de calcular impuestos. */
export interface LineaVenta {
  id_producto: number;
  descripcion: string;
  sku: string;
  unidad_medida: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number | null;
  stock_disponible: number;
}

export interface ItemPreview {
  id_producto?: number;
  codigo: string;
  codigo_producto_sunat: string;
  unidad_de_medida: string;
  descripcion: string;
  cantidad: number;
  valor_unitario: number;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
  igv: number;
  total: number;
  tipo_de_igv: number;
}

export interface PreviewComprobante {
  emisor: { ruc: string; razon_social: string; direccion: string; ubicacion: string; logo_url: string };
  id_tipo: number;
  tipo_nombre: string;
  serie: string;
  numero: number;
  numero_formateado: string;
  fecha_de_emision: string;
  fecha_de_vencimiento: string;
  moneda: { id_moneda: number; nombre: string; simbolo: string };
  receptor: Receptor;
  items: ItemPreview[];
  porcentaje_igv: number;
  totales: {
    gravada: number;
    exonerada: number;
    inafecta: number;
    descuento: number;
    igv: number;
    total: number;
  };
  importe_en_letras: string;
  observaciones: string;
  nota?: { motivo_codigo: string; motivo_texto: string; documento_modificado: string };
  advertencias: string[];
  json_nubefact: Record<string, any>;
}

export interface ComprobanteEmitido {
  id_comprobante?: number;
  serie?: string;
  numero?: number;
  numero_formateado?: string;
  enlace?: string;
  enlace_pdf?: string;
  aceptada_sunat?: boolean;
  sunat_description?: string;
  cadena_qr?: string;
  anulado?: boolean;
  estado?: string;
}

export interface ComprobanteFila {
  id_comprobante: number;
  id_tipo?: number;
  tipo_nombre: string;
  serie: string;
  numero: number;
  numero_formateado: string;
  fecha_de_emision: string;
  creado_en: string;
  cliente_numero_doc: string;
  cliente_denominacion: string;
  moneda_simbolo: string;
  total: number;
  estado: string;
  aceptada_sunat: boolean;
  anulado: boolean;
  sunat_description?: string;
  error_mensaje?: string;
  enlace?: string;
  enlace_pdf?: string;
  puede_anular: boolean;
}

export interface VentaRegistrada {
  id_venta: number;
  fecha: string;
  origen: string;
  cliente_denominacion: string;
  subtotal: number;
  igv: number;
  total: number;
  comprobante?: ComprobanteEmitido;
  comprobante_error?: string;
}

export interface Paginado<T> {
  datos: T[];
  total: number;
  pagina: number;
  por_pagina: number;
}

export interface FilaInventario {
  id_inventario: number;
  id_producto: number;
  producto: string;
  sku: string;
  codigo_barras: string;
  unidad_medida: string;
  categoria: string;
  id_almacen: number;
  almacen: string;
  sucursal: string;
  stock: number;
  stock_minimo: number;
  precio_compra: number;
  precio_venta: number;
  valorizado: number;
  estado: 'sin_stock' | 'bajo' | 'ok';
  imagen_url: string;
}

export interface ResumenInventario {
  productos: number;
  sin_stock: number;
  bajo_stock: number;
  valorizado: number;
  unidades: number;
}

export interface Almacen {
  id_almacen: number;
  nombre: string;
  sucursal: string;
}

export interface MovimientoInventario {
  id_movimiento: number;
  id_producto: number;
  producto: string;
  tipo: string;
  cantidad: number;
  descripcion: string;
  fecha: string;
  sucursal_origen: string;
  sucursal_destino: string;
}

export interface ImagenProducto {
  id_imagen: number;
  url: string;
  thumb_url: string;
  is_primary: boolean;
  orden: number;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
}

export interface MotivoCatalogo {
  codigo: string;
  nombre: string;
}

export interface ProductoAdmin {
  id_producto: number;
  nombre: string;
  descripcion: string;
  descripcion_corta: string;
  codigo_barras: string;
  sku: string;
  precio_compra: number;
  precio_venta: number;
  descuento: number;
  unidad_medida: string;
  id_categoria?: number;
  categoria: string;
  id_marca?: number;
  marca: string;
  estado: boolean;
  destacado: boolean;
  imagen_url: string;
  thumb_url: string;
  total_imagenes: number;
  stock_total: number;
  creado_en?: string;
}

export interface OpcionCategoria {
  id_categoria: number;
  nombre: string;
}

export interface OpcionMarca {
  id_marca: number;
  nombre: string;
}

/** Tipos de comprobante tal como los identifica nuestra base de datos. */
export const TIPO_FACTURA = 1;
export const TIPO_BOLETA = 2;
export const TIPO_NOTA_CREDITO = 7;
export const TIPO_NOTA_DEBITO = 8;
