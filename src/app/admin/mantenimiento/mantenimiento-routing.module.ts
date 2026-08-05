import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { roleGuard } from '../../guard/role.guard';

/**
 * Roles alineados al sidebar. El menú oculta; estos guards bloquean
 * si alguien escribe la URL a mano.
 */
const routes: Routes = [
  {
    path: 'usuarios',
    canActivate: [roleGuard],
    data: {
      roles: ['admin'],
      title: 'Usuarios',
      subtitle: 'Administra usuarios, roles y permisos.',
      icon: 'fa-users',
    },
    loadComponent: () => import('./component/usuarios/usuarios.component').then((c) => c.UsuariosComponent),
  },
  {
    path: 'roles',
    canActivate: [roleGuard],
    data: {
      roles: ['admin'],
      title: 'Roles',
      subtitle: 'IDs de rol para autenticación y acceso.',
      icon: 'fa-user-shield',
    },
    loadComponent: () => import('./component/roles/roles.component').then((c) => c.RolesComponent),
  },
  {
    path: 'categorias',
    canActivate: [roleGuard],
    data: {
      roles: ['admin', 'vendedor', 'consulta'],
      title: 'Categorías',
      subtitle: 'Gestiona categorías de productos.',
      icon: 'fa-tags',
    },
    loadComponent: () => import('./component/categorias/categorias.component').then((c) => c.CategoriasComponent),
  },
  {
    path: 'marcas',
    canActivate: [roleGuard],
    data: {
      roles: ['admin', 'vendedor', 'consulta'],
      title: 'Marcas',
      subtitle: 'Catálogo de marcas de productos.',
      icon: 'fa-award',
    },
    loadComponent: () => import('./component/marcas/marcas.component').then((c) => c.MarcasComponent),
  },
  {
    path: 'productos',
    canActivate: [roleGuard],
    data: {
      roles: ['admin', 'vendedor', 'consulta'],
      title: 'Productos',
      subtitle: 'Catálogo de productos y variantes.',
      icon: 'fa-box',
    },
    loadComponent: () => import('./component/productos/productos.component').then((c) => c.ProductosComponent),
  },
  {
    path: 'inventario',
    canActivate: [roleGuard],
    data: {
      roles: ['admin', 'vendedor'],
      title: 'Inventario',
      subtitle: 'Control y movimientos de inventario.',
      icon: 'fa-warehouse',
    },
    loadComponent: () => import('./component/inventario/inventario.component').then((c) => c.InventarioComponent),
  },
  {
    path: 'reportes',
    canActivate: [roleGuard],
    data: {
      roles: ['admin', 'vendedor', 'caja'],
      title: 'Reportes',
      subtitle: 'Ventas, categorías e informes descargables.',
      icon: 'fa-chart-line',
    },
    loadComponent: () => import('./component/reportes/reportes.component').then((c) => c.ReportesComponent),
  },
  {
    path: 'stock',
    canActivate: [roleGuard],
    data: {
      roles: ['admin', 'vendedor', 'consulta'],
      title: 'Stock',
      subtitle: 'Resumen de stock y transferencias.',
      icon: 'fa-chart-pie',
    },
    loadComponent: () => import('./component/stock/stock.component').then((c) => c.StockComponent),
  },
  {
    path: 'clientes',
    canActivate: [roleGuard],
    data: {
      roles: ['admin', 'vendedor', 'caja'],
      title: 'Clientes',
      subtitle: 'Lista y detalles de clientes.',
      icon: 'fa-handshake',
    },
    loadComponent: () => import('./component/clientes/clientes.component').then((c) => c.ClientesComponent),
  },
  {
    path: 'doc',
    canActivate: [roleGuard],
    data: {
      roles: ['admin', 'vendedor', 'caja'],
      title: 'Documentos',
      subtitle: 'Gestión de documentos y comprobantes.',
      icon: 'fa-file-alt',
    },
    loadComponent: () => import('./component/doc/doc.component').then((c) => c.DocComponent),
  },
  {
    path: 'ventas',
    canActivate: [roleGuard],
    data: {
      roles: ['admin', 'vendedor', 'caja'],
      title: 'Ventas',
      subtitle: 'Genera comprobantes y consulta SUNAT.',
      icon: 'fa-receipt',
    },
    loadComponent: () => import('./component/ventas/ventas.component').then((c) => c.VentasComponent),
  },
  {
    path: 'cotizaciones',
    canActivate: [roleGuard],
    data: {
      roles: ['admin', 'vendedor', 'caja'],
      title: 'Cotizaciones',
      subtitle: 'Cotice, envíe por WhatsApp y pase a venta.',
      icon: 'fa-file-invoice',
    },
    loadComponent: () =>
      import('./component/cotizaciones/cotizaciones.component').then((c) => c.CotizacionesComponent),
  },
  {
    path: 'caja-sesion',
    canActivate: [roleGuard],
    data: {
      roles: ['admin', 'vendedor', 'caja'],
      title: 'Caja',
      subtitle: 'Abre y cierra tu turno de caja.',
      icon: 'fa-cash-register',
    },
    loadComponent: () =>
      import('./component/caja-sesion/caja-sesion.component').then((c) => c.CajaSesionComponent),
  },
  {
    path: 'cuentas-por-cobrar',
    canActivate: [roleGuard],
    data: {
      roles: ['admin', 'caja', 'vendedor'],
      title: 'Cuentas por cobrar',
      subtitle: 'Créditos y abonos de clientes.',
      icon: 'fa-hand-holding-usd',
    },
    loadComponent: () => import('./component/cuentas-por-cobrar/cuentas-por-cobrar.component').then((c) => c.CuentasPorCobrarComponent),
  },
  {
    path: 'almacen',
    canActivate: [roleGuard],
    data: {
      roles: ['admin'],
      title: 'Almacenes',
      subtitle: 'Ubicaciones de stock y sucursales.',
      icon: 'fa-warehouse',
    },
    loadComponent: () => import('./component/almacen/almacen.component').then((c) => c.AlmacenComponent),
  },
  {
    path: 'proveedores',
    canActivate: [roleGuard],
    data: {
      roles: ['admin', 'vendedor'],
      title: 'Proveedores',
      subtitle: 'Catálogo de proveedores.',
      icon: 'fa-truck',
    },
    loadComponent: () => import('./component/proveedores/proveedores.component').then((c) => c.ProveedoresComponent),
  },
  {
    path: 'recepcion',
    canActivate: [roleGuard],
    data: {
      roles: ['admin', 'vendedor'],
      title: 'Recepción',
      subtitle: 'Ingreso de mercadería y observaciones.',
      icon: 'fa-box-seam',
    },
    loadComponent: () => import('./component/recepcion/recepcion.component').then((c) => c.RecepcionComponent),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MantenimientoRoutingModule {}
