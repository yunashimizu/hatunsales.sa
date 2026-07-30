import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StorageUtil } from '../utils/storage.util';
import { esRolCliente, esRolStaff, rolPermitido } from '../auth/roles.constants';

/**
 * Protege rutas según `data.roles` (misma lógica que el sidebar).
 * Cliente (id 5) nunca entra a /dashboard: va a /store.
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

  const staff = esRolStaff(rolId, rolNombre);
  const cliente = esRolCliente(rolId, rolNombre);

  // Blindaje: tienda/cliente no usa el panel aunque pegue la URL.
  if ((cliente || !staff) && state.url.startsWith('/dashboard')) {
    router.navigate(['/store']);
    return false;
  }

  if (rolesPermitidos.length && !rolPermitido(rolNombre, rolesPermitidos, rolId)) {
    if (staff) {
      router.navigate(['/dashboard/home']);
      return false;
    }
    router.navigate(['/store']);
    return false;
  }

  return true;
};
