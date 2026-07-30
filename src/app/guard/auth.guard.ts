import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StorageUtil } from '../utils/storage.util';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const token = sessionStorage.getItem('token');

  if (!token) {
     // Guarda la URL a la que quería ir para redirigir después del login
    StorageUtil.set('redirectUrl', state.url);
    router.navigate(['auth']);
    return false;
  }
  return true;
};