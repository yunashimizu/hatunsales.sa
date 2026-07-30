import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LayoutComponent } from './template/layout/layout.component';
import { authGuard } from '../guard/auth.guard';

const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/home/home.component').then(x => x.HomeComponent),
        title: 'Tienda',
      },
      {
        path: 'catalogo',
        loadComponent: () => import('./pages/catalogo/catalogo.component').then(x => x.CatalogoComponent),
        title: 'Catálogo',
      },
      {
        path: 'producto/:id',
        loadComponent: () => import('./pages/producto-detalle/producto-detalle.component').then(x => x.ProductoDetalleComponent),
      },
      {
        path: 'carrito',
        loadComponent: () => import('./pages/carrito/carrito.component').then(x => x.CarritoComponent),
        title: 'Mi carrito',
      },
      {
        path: 'checkout',
        loadComponent: () => import('./pages/checkout/checkout.component').then(x => x.CheckoutComponent),
        title: 'Finalizar compra',
      },
      {
        path: 'pedidos',
        canActivate: [authGuard],
        loadComponent: () => import('./pages/pedidos/pedidos.component').then(x => x.PedidosComponent),
        title: 'Mis pedidos',
      },
      {
        path: 'pedidos/:id',
        canActivate: [authGuard],
        loadComponent: () => import('./pages/pedido-detalle/pedido-detalle.component').then(x => x.PedidoDetalleComponent),
        title: 'Seguimiento del pedido',
      },
      {
        path: 'favoritos',
        canActivate: [authGuard],
        loadComponent: () => import('./pages/favoritos/favoritos.component').then(x => x.FavoritosComponent),
        title: 'Mis favoritos',
      },
      {
        path: 'perfil',
        canActivate: [authGuard],
        loadComponent: () => import('./pages/perfil/perfil.component').then(x => x.PerfilComponent),
        title: 'Mi cuenta',
      },
      {
        path: 'contacto',
        loadComponent: () => import('./pages/contacto/contacto.component').then(x => x.ContactoComponent),
        title: 'Contacto',
      },
      { path: '**', redirectTo: '' },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class StoreRoutingModule {}
