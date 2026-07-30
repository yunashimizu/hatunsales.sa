export interface ProductoTienda {
  id_producto: number;
  nombre: string;
  slug?: string;
  descripcion?: string;
  descripcion_corta?: string;
  sku?: string;
  codigo_barras?: string;
  precio: number;
  precio_final: number;
  descuento: number;
  unidad_medida?: string;
  destacado: boolean;
  id_categoria?: number;
  categoria?: string;
  id_marca?: number;
  marca?: string;
  stock: number;
  disponible: boolean;
  rating: number;
  total_resenas: number;
  imagen: string | null;
}

export interface ImagenProducto {
  id_imagen: number;
  url: string;
  thumb_url?: string;
  is_primary: boolean;
}

export interface Especificacion {
  nombre: string;
  valor: string;
}

export interface StockSucursal {
  id_sucursal: number;
  sucursal: string;
  direccion?: string;
  stock: number;
}

export interface ProductoDetalle extends ProductoTienda {
  imagenes: ImagenProducto[];
  especificaciones: Especificacion[];
  stock_sucursales: StockSucursal[];
  relacionados: ProductoTienda[];
}

export interface CategoriaTienda {
  id_categoria: number;
  nombre: string;
  slug?: string;
  descripcion?: string;
  icono?: string;
  imagen_url?: string;
  total_productos: number;
}

export interface MarcaTienda {
  id_marca: number;
  nombre: string;
  slug?: string;
  logo_url?: string;
  total_productos: number;
}

export interface FiltrosDisponibles {
  categorias: CategoriaTienda[];
  marcas: MarcaTienda[];
  precio_min: number;
  precio_max: number;
  atributos: { nombre: string; valores: { valor: string; total: number }[] }[];
}

export interface Pagina<T> {
  items: T[];
  total: number;
  pagina: number;
  limite: number;
  total_paginas: number;
}

export interface BannerTienda {
  id_banner: number;
  titulo?: string;
  subtitulo?: string;
  etiqueta?: string;
  imagen_url?: string;
  cta_texto?: string;
  cta_url?: string;
}

export interface ResenaTienda {
  id_resena: number;
  calificacion: number;
  titulo?: string;
  comentario?: string;
  autor: string;
  fecha: string;
}

// -------------------------------------------------------------------- carrito

export interface CarritoItem {
  id_item: number;
  id_producto: number;
  nombre: string;
  imagen: string | null;
  marca?: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  stock_disponible: number;
  excede_stock: boolean;
}

export interface Carrito {
  id_carrito: number;
  token_invitado?: string;
  items: CarritoItem[];
  cantidad_items: number;
  subtotal: number;
  igv: number;
  total: number;
}

// ------------------------------------------------------------------- checkout

export interface MetodoEnvio {
  id_metodo_envio: number;
  nombre: string;
  descripcion: string;
  costo: number;
  dias_min: number;
  dias_max: number;
}

export interface MetodoPago {
  id_metodo: number;
  nombre: string;
  tipo: string;
  descripcion: string;
  logo_url: string | null;
}

export interface CuponValidado {
  valido: boolean;
  codigo: string;
  descripcion: string;
  tipo: string;
  valor: number;
  descuento: number;
}

export interface DireccionEnvio {
  id_direccion: number;
  alias?: string;
  destinatario?: string;
  telefono?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  direccion: string;
  referencia?: string;
  codigo_postal?: string;
  es_predeterminada: boolean;
}

export type DireccionPayload = Omit<DireccionEnvio, 'id_direccion'>;

// -------------------------------------------------------------------- pedidos

export type EstadoPedido =
  | 'pendiente'
  | 'pagado'
  | 'preparando'
  | 'enviado'
  | 'entregado'
  | 'cancelado';

export interface PedidoItem {
  id_pedido_item: number;
  id_producto?: number;
  nombre: string;
  imagen?: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  igv: number;
  total: number;
}

export interface PedidoEstado {
  estado: EstadoPedido;
  comentario?: string;
  fecha: string;
}

export interface Pedido {
  id_pedido: number;
  codigo: string;
  estado: EstadoPedido;
  subtotal: number;
  igv: number;
  descuento: number;
  costo_envio: number;
  total: number;
  tipo_comprobante?: string;
  documento_receptor?: string;
  nombre_receptor?: string;
  notas?: string;
  metodo_envio?: string;
  metodo_pago?: string;
  direccion_envio?: string;
  cantidad_items: number;
  items: PedidoItem[];
  historial: PedidoEstado[];
  creado_en: string;
}

export interface ConfiguracionPasarela {
  proveedor: string;
  llave_publica: string;
  moneda: string;
  /** true cuando hay que tokenizar la tarjeta antes de cobrar. */
  requiere_token: boolean;
}

export interface PagarPedidoPayload {
  id_metodo?: number;
  referencia?: string;
  token_pasarela?: string;
  email?: string;
}

export interface CrearPedidoPayload {
  id_direccion?: number;
  id_metodo_envio?: number;
  id_metodo_pago?: number;
  cupon?: string;
  tipo_comprobante?: 'boleta' | 'factura';
  documento_receptor?: string;
  nombre_receptor?: string;
  notas?: string;
  token_invitado?: string;
}

export interface ConsultaCatalogo {
  q?: string;
  id_categoria?: number;
  id_marca?: number;
  precio_min?: number;
  precio_max?: number;
  solo_stock?: boolean;
  solo_oferta?: boolean;
  solo_destacado?: boolean;
  atributos?: Record<string, string>;
  orden?: 'relevancia' | 'precio_asc' | 'precio_desc' | 'nombre' | 'nuevo' | 'rating';
  pagina?: number;
  limite?: number;
}
