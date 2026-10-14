import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { esRolCliente, esRolStaff, rolPermitido } from '../auth/roles.constants';
import { NotificationService } from '../shared/services/notification.service';
import { guardarAvisoLogin, guardarRedireccion } from '../shared/utils/aviso-login.util';
import { StorageUtil } from '../utils/storage.util';

/**
 * Protege rutas según `data.roles` (misma lógica que el sidebar).
 *
 * - Sin sesión → login (que explica el motivo y vuelve a la página pedida).
 * - Cliente (id 5) o rol desconocido en /dashboard → tienda, sin aviso.
 * - Personal sin permiso para esa sección → inicio del panel con un aviso
 *   que explica por qué no entró.
 */
export const roleGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);

  if (!StorageUtil.get('token')) {
    guardarRedireccion(state.url);
    guardarAvisoLogin('requiere_sesion');
    return router.createUrlTree(['/auth']);
  }

  const rolNombre = StorageUtil.get('rolNombre') ?? StorageUtil.get('rol') ?? '';
  const rolId = Number(StorageUtil.get('rolId') ?? 0);
  const rolesPermitidos: string[] = route.data?.['roles'] ?? [];
  const staff = esRolStaff(rolId, rolNombre);
  const cliente = esRolCliente(rolId, rolNombre);

  // Blindaje: tienda/cliente no usa el panel aunque pegue la URL.
  if ((cliente || !staff) && state.url.startsWith('/dashboard')) {
    return router.createUrlTree(['/store']);
  }

  if (rolesPermitidos.length && !rolPermitido(rolNombre, rolesPermitidos, rolId)) {
    if (!staff) return router.createUrlTree(['/store']);
    inject(NotificationService).advertencia('No tienes acceso a esa sección', {
      mensaje: 'Pide a un administrador que te dé permiso.',
      clave: 'sin-acceso',
    });
    return router.createUrlTree(['/dashboard/home']);
  }

  return true;
};
