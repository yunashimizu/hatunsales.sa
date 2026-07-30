import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StorageUtil } from '../utils/storage.util';
import { esRolStaff, rolPermitido } from '../auth/roles.constants';

/**
 * Protege rutas según `data.roles` (misma lógica que el sidebar).
 * No ofusca URLs: bloquea el acceso si el rol no corresponde.
 */
export const roleGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const rolNombre = StorageUtil.get('rolNombre') ?? StorageUtil.get('rol') ?? '';
  const rolId = Number(StorageUtil.get('rolId') ?? 0);
  const rolesPermitidos: string[] = route.data?.['roles'] ?? [];
  const token = StorageUtil.get('token') ?? sessionStorage.getItem('token');

  if (!token) {
    StorageUtil.set('redirectUrl', state.url);
    router.navigate(['/auth']);
    return false;
  }

  if (rolesPermitidos.length && !rolPermitido(rolNombre, rolesPermitidos, rolId)) {
    if (esRolStaff(rolId, rolNombre)) {
      router.navigate(['/dashboard/home']);
      return false;
    }
    router.navigate(['/store']);
    return false;
  }

  return true;
};
