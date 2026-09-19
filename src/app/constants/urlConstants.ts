// API en la nube por defecto
export const dominio = 'https://hatunsales-production.up.railway.app/';


//https://hatunsales-production-c83e.up.railway.app/api#/
// Para probar localmente, descomenta la línea siguiente y comenta la de arriba:
// export const dominio = 'http://localhost:3000/';

export const urlConstants = {
  auth: `${dominio}auth/login`,
  authRoutes: {
    login: `${dominio}auth/login`,
    register: `${dominio}auth/register`,
    logout: `${dominio}auth/logout`,
    perfil: `${dominio}auth/perfil`,
    google: `${dominio}auth/google`,
    googleConfig: `${dominio}auth/google/config`,
  },

  admin: {
    usuarios: `${dominio}admin/usuarios`,
    crearEmpleado: `${dominio}admin/crear-empleado`,
    actualizarEmpleado: `${dominio}admin/actualizar-empleado`,
    cambiarRol: `${dominio}admin/cambiar-rol`,
    eliminar: `${dominio}admin/eliminar`,
    desactivar: `${dominio}admin/desactivar`,
    roles: `${dominio}admin/roles`,
    rolesUsuarios: `${dominio}admin/roles/usuarios`,
    crearUsuarioAdmin: `${dominio}admin/roles/usuarios`,
    cambiarRolAdmin: (id: string | number) => `${dominio}admin/roles/usuarios/${id}/rol`,
  },

  usuario: {
    base: `${dominio}usuario`,
    byId: (id: string | number) => `${dominio}usuario/${id}`,
  },

  cliente: {
    base: `${dominio}cliente`,
    byId: (id: string | number) => `${dominio}cliente/${id}`,
    dni: (dni: string) => `${dominio}cliente/sunat/dni/${dni}`,
    ruc: (ruc: string) => `${dominio}cliente/sunat/ruc/${ruc}`,
  },

  producto: {
    base: `${dominio}producto`,
    byId: (id: string | number) => `${dominio}producto/${id}`,
    barcode: `${dominio}producto/barcode`,
    barcodeByCode: (codigo: string) => `${dominio}producto/barcode/${codigo}`,
    images: (id: string | number) => `${dominio}producto/${id}/images`,
    imagesLote: (id: string | number) => `${dominio}producto/${id}/images/lote`,
    imagesOrden: (id: string | number) => `${dominio}producto/${id}/images/orden`,
    imagePrimary: (id: string | number, imgId: string | number) => `${dominio}producto/${id}/images/${imgId}/primary`,
    imageDelete: (id: string | number, imgId: string | number) => `${dominio}producto/${id}/images/${imgId}`,
  },

  inventario: {
    base: `${dominio}inventario`,
    byProducto: (idProducto: string | number) => `${dominio}inventario/producto/${idProducto}`,
    detallado: `${dominio}inventario/detallado`,
    resumen: `${dominio}inventario/resumen`,
    almacenes: `${dominio}inventario/almacenes`,
    alertas: `${dominio}inventario/alertas`,
    movimientos: `${dominio}inventario/movimientos`,
    ajuste: `${dominio}inventario/ajuste`,
    transferencia: `${dominio}inventario/transferencia`,
    stockMinimo: (idInventario: string | number) => `${dominio}inventario/${idInventario}/stock-minimo`,
  },

  // Receptor del comprobante: una sola búsqueda para DNI y RUC
  receptor: {
    sugerencias: `${dominio}receptor/sugerencias`,
    buscar: (documento: string) => `${dominio}receptor/buscar/${documento}`,
    consultar: (documento: string) => `${dominio}receptor/consultar/${documento}`,
    consumidorFinal: `${dominio}receptor/consumidor-final`,
    cliente: (id: string | number) => `${dominio}receptor/cliente/${id}`,
    empresa: (id: string | number) => `${dominio}receptor/empresa/${id}`,
    empresas: `${dominio}receptor/empresas`,
    actualizarCliente: (id: string | number) => `${dominio}receptor/cliente/${id}`,
    actualizarEmpresa: (id: string | number) => `${dominio}receptor/empresa/${id}`,
    eliminarEmpresa: (id: string | number) => `${dominio}receptor/empresa/${id}`,
  },

  // Punto de venta de mostrador
  puntoVenta: {
    base: `${dominio}venta`,
    byId: (id: string | number) => `${dominio}venta/${id}`,
    productos: `${dominio}venta/productos`,
    catalogoProductos: `${dominio}venta/productos/catalogo`,
    porCodigoBarras: (codigo: string) => `${dominio}venta/productos/barcode/${codigo}`,
    metodosPago: `${dominio}venta/metodos-pago`,
    preview: `${dominio}venta/preview`,
    anular: (id: string | number) => `${dominio}venta/${id}/anular`,
    contextoPos: `${dominio}venta/contexto-pos`,
  },

  credito: {
    linea: `${dominio}credito/linea`,
    cuentas: `${dominio}credito/cuentas`,
    cuenta: (id: string | number) => `${dominio}credito/cuentas/${id}`,
    abonar: (id: string | number) => `${dominio}credito/cuentas/${id}/abonos`,
    cliente: (id: string | number) => `${dominio}credito/cliente/${id}`,
    empresa: (id: string | number) => `${dominio}credito/empresa/${id}`,
  },

  caja: {
    pasarela: `${dominio}caja/pasarela`,
    cuentasBancarias: `${dominio}caja/cuentas-bancarias`,
    cuentaBancaria: (id: string | number) => `${dominio}caja/cuentas-bancarias/${id}`,
    yapeIniciar: `${dominio}caja/yape/iniciar`,
    yapeVerificar: (orderId: string) => `${dominio}caja/yape/verificar/${orderId}`,
    sesion: `${dominio}caja/sesion`,
    disponibles: `${dominio}caja/disponibles`,
    abrir: `${dominio}caja/abrir`,
    cerrar: `${dominio}caja/cerrar`,
  },

  guiaRemision: {
    base: `${dominio}guia-remision`,
  },

  proforma: {
    base: `${dominio}proforma`,
    byId: (id: string | number) => `${dominio}proforma/${id}`,
    whatsappEstado: `${dominio}proforma/whatsapp/estado`,
    whatsappEnviar: `${dominio}proforma/whatsapp/enviar`,
  },

  comprobante: {
    base: `${dominio}comprobante`,
    generar: `${dominio}comprobante/generar`,
    preview: `${dominio}comprobante/preview`,
    consultar: `${dominio}comprobante/consultar`,
    anular: `${dominio}comprobante/anular`,
    motivos: `${dominio}comprobante/catalogos/motivos`,
    monitorAtencion: `${dominio}comprobante/monitor/atencion`,
    byId: (id: string | number) => `${dominio}comprobante/${id}`,
    detalle: (id: string | number) => `${dominio}comprobante/${id}/detalle`,
    reintentar: (id: string | number) => `${dominio}comprobante/${id}/reintentar`,
    pdf: (id: string | number) => `${dominio}comprobante/${id}/pdf`,
  },

  reportes: {
    ventas: `${dominio}reportes/ventas`,
    categorias: `${dominio}reportes/categorias`,
    ventasExcel: `${dominio}reportes/ventas/excel`,
    ventasPdf: `${dominio}reportes/ventas/pdf`,
  },

  configuracion: {
    series: `${dominio}configuracion/series`,
    fiscal: `${dominio}configuracion/fiscal`,
  },

  stock: {
    byProductoSucursal: (idProducto: string | number, idSucursal: string | number) => `${dominio}stock/producto/${idProducto}/sucursal/${idSucursal}`,
    filtro: `${dominio}stock/filtro`,
    transfer: `${dominio}stock/transfer`,
    bajoStock: `${dominio}stock/bajo-stock`,
    alertasStockMinimo: `${dominio}stock/alertas-stock-minimo`,
    movimientos: `${dominio}stock/movimientos`,
    resumenSucursal: `${dominio}stock/resumen-sucursal`,
  },

  sunat: {
    dni: (dni: string) => `${dominio}sunat/dni/${dni}`,
    ruc: (ruc: string) => `${dominio}sunat/ruc/${ruc}`,
    dniCliente: `${dominio}sunat/dni/cliente`,
    rucEmpresa: `${dominio}sunat/ruc/empresa`,
    rucProveedor: `${dominio}sunat/ruc/proveedor`,
  },

  // Tienda pública: catálogo, carrito, checkout, pedidos y cuenta del cliente
  tienda: {
    productos: `${dominio}tienda/productos`,
    productoById: (id: string | number) => `${dominio}tienda/productos/${id}`,
    productoBySlug: (slug: string) => `${dominio}tienda/productos/slug/${slug}`,
    productoResenas: (id: string | number) => `${dominio}tienda/productos/${id}/resenas`,
    destacados: `${dominio}tienda/productos/destacados`,
    ofertas: `${dominio}tienda/productos/ofertas`,
    buscar: `${dominio}tienda/productos/buscar`,
    categorias: `${dominio}tienda/categorias`,
    marcas: `${dominio}tienda/marcas`,
    filtros: `${dominio}tienda/filtros`,
    banners: `${dominio}tienda/banners`,

    carrito: `${dominio}tienda/carrito`,
    carritoItems: `${dominio}tienda/carrito/items`,
    carritoItem: (idItem: string | number) => `${dominio}tienda/carrito/items/${idItem}`,
    carritoFusionar: `${dominio}tienda/carrito/fusionar`,

    metodosEnvio: `${dominio}tienda/checkout/metodos-envio`,
    metodosPago: `${dominio}tienda/checkout/metodos-pago`,
    validarCupon: `${dominio}tienda/checkout/validar-cupon`,
    pasarela: `${dominio}tienda/checkout/pasarela`,

    pedidos: `${dominio}tienda/pedidos`,
    pedidoById: (id: string | number) => `${dominio}tienda/pedidos/${id}`,
    pedidoByCodigo: (codigo: string) => `${dominio}tienda/pedidos/codigo/${codigo}`,
    pedidoCancelar: (id: string | number) => `${dominio}tienda/pedidos/${id}/cancelar`,
    pedidoPagar: (id: string | number) => `${dominio}tienda/pedidos/${id}/pagar`,

    cuenta: `${dominio}tienda/cuenta`,
    direcciones: `${dominio}tienda/cuenta/direcciones`,
    direccionById: (id: string | number) => `${dominio}tienda/cuenta/direcciones/${id}`,
    favoritos: `${dominio}tienda/cuenta/favoritos`,
    favoritosIds: `${dominio}tienda/cuenta/favoritos/ids`,
    favoritoToggle: (idProducto: string | number) => `${dominio}tienda/cuenta/favoritos/${idProducto}`,
    resena: (idProducto: string | number) => `${dominio}tienda/cuenta/resenas/${idProducto}`,
  },

  otros: {
    log: `${dominio}log`,
    comprobanteVenta: (id: string | number) => `${dominio}comprobante/venta/${id}`,
    comprobanteCliente: (id: string | number) => `${dominio}comprobante/cliente/${id}`,
  },

  // compatibilidad con el código existente
  logout: `${dominio}auth/logout`,
  register: `${dominio}auth/register`,
  perfil: `${dominio}auth/perfil`,
  usuarios: `${dominio}admin/usuarios`,
  rol: `${dominio}rol/`,
  categoria: `${dominio}categoria`,
  marca: `${dominio}marca`,
  almacen: `${dominio}almacen`,
  venta: `${dominio}venta`,
  proveedor: `${dominio}proveedor`,
  recepcion: {
    base: `${dominio}recepcion`,
    confirmar: `${dominio}recepcion/confirmar`,
    byId: (id: string | number) => `${dominio}recepcion/${id}`,
    observaciones: `${dominio}recepcion/observaciones`,
    aprobar: (id: string | number) => `${dominio}recepcion/observaciones/${id}/aprobar`,
    rechazar: (id: string | number) => `${dominio}recepcion/observaciones/${id}/rechazar`,
    foto: (id: string | number) => `${dominio}recepcion/observaciones/${id}/fotos`,
  },
  carrito: `${dominio}carrito/`,
  inventarioLegacy: `${dominio}inventario/`,
};