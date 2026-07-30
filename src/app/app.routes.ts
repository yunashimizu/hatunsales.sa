import { Routes } from '@angular/router';
import { authGuard } from './guard/auth.guard';
import { roleGuard } from './guard/role.guard';

export const routes: Routes = [
  // Entrada pública: la app arranca en la tienda
  {
    path: '',
    redirectTo: 'store',
    pathMatch: 'full'
  },
  // Login (clientes y personal). Tras login: staff → dashboard, cliente → store
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.module').then(x => x.AuthModule)
  },
  // Panel interno → solo personal (admin / vendedor / caja)
  {
    path: 'dashboard',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin', 'vendedor', 'caja'] },
    loadChildren: () => import('./admin/template/template.module').then(x => x.TemplateModule)
  },
  // Tienda pública
  {
    path: 'store',
    loadChildren: () => import('./store/store.module').then(x => x.StoreModule)
  },
  {
    path: '404',
    loadComponent: () => import('./pages/not-found/not-found.component').then(x => x.NotFoundComponent)
  },
  { path: '**', redirectTo: '404' }

];
