import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TemplateComponent } from './template/template.component';
import { DashboardComponent } from './home/dashboard.component';
import { AdminPerfilComponent } from './perfil/perfil.component';
import { AdminConfiguracionComponent } from './configuracion/configuracion.component';
import { roleGuard } from '../../guard/role.guard';

const routes: Routes = [
  {
    path: '',
    component: TemplateComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      {
        path: 'home',
        component: DashboardComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'vendedor', 'caja', 'consulta'] },
      },
      {
        path: 'perfil',
        component: AdminPerfilComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'vendedor', 'caja', 'consulta'] },
      },
      {
        path: 'configuracion',
        component: AdminConfiguracionComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },
      {
        path: 'mantenimiento',
        loadChildren: () => import('../mantenimiento/mantenimiento.module').then((m) => m.MantenimientoModule)
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TemplateRoutingModule {}
