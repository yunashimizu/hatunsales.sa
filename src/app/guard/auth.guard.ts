import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { guardarAvisoLogin, guardarRedireccion } from '../shared/utils/aviso-login.util';
import { StorageUtil } from '../utils/storage.util';

/**
 * Rutas que necesitan sesión (panel y cuenta de la tienda).
 *
 * Sin token lleva al login, que explica por qué ("Inicia sesión para
 * continuar.") y, al entrar, vuelve a la página pedida.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  if (StorageUtil.get('token')) return true;

  guardarRedireccion(state.url);
  guardarAvisoLogin('requiere_sesion');
  return inject(Router).createUrlTree(['/auth']);
};
