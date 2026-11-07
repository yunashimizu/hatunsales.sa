import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../auth/service/auth.service';
import { ItemMenu, SECCIONES_MENU } from '../sidebar/sidebar.component';

/** Entradas fijas de la barra: la ruta decide el rol permitido (se lee del mismo catálogo que el menú lateral). */
const ENTRADAS: { ruta: string; etiqueta: string; icono: string; exacta: boolean }[] = [
  { ruta: '/dashboard/home', etiqueta: 'Inicio', icono: 'bi-house-door', exacta: true },
  { ruta: '/dashboard/mantenimiento/ventas', etiqueta: 'Vender', icono: 'bi-receipt', exacta: false },
  { ruta: '/dashboard/mantenimiento/doc', etiqueta: 'Documentos', icono: 'bi-file-earmark-text', exacta: false },
  { ruta: '/dashboard/mantenimiento/caja-sesion', etiqueta: 'Caja', icono: 'bi-cash-stack', exacta: false },
];

/**
 * Navegación inferior del panel en teléfono (≤ 900 px, el mismo corte que el cajón del menú):
 * Inicio · Vender · Documentos · Caja · Menú. Las entradas sin permiso se ocultan y el resto reparte el ancho.
 * «Menú» no navega: avisa al shell para que abra el cajón lateral.
 */
@Component({
  selector: 'app-barra-inferior',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './barra-inferior.component.html',
  styleUrl: './barra-inferior.component.scss',
})
export class BarraInferiorComponent {
  /** Se pidió abrir el menú lateral (el mismo evento que el botón hamburguesa de la cabecera). */
  @Output() menu = new EventEmitter<void>();

  private readonly auth = inject(AuthService);

  private readonly itemsMenu: ItemMenu[] = SECCIONES_MENU.flatMap((s) => s.items);

  /** Entradas que el usuario puede ver, según los roles/permisos de ese ítem en el menú lateral. */
  get entradas() {
    return ENTRADAS.filter((e) => {
      const item = this.itemsMenu.find((i) => i.ruta === e.ruta);
      return !item || this.auth.puedeVer(item.roles, item.permisos ?? []);
    });
  }
}
