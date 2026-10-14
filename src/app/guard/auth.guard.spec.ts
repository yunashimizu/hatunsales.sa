import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { tomarAvisoLogin, tomarRedireccion } from '../shared/utils/aviso-login.util';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  const ejecutar = (url: string) =>
    TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => sessionStorage.clear());

  it('deja pasar con sesión', () => {
    sessionStorage.setItem('token', 'abc');
    expect(ejecutar('/store/pedidos')).toBe(true);
  });

  it('sin sesión lleva al login, explica el motivo y recuerda la página', () => {
    const resultado = ejecutar('/store/pedidos?pagina=2');

    expect(resultado).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(resultado as UrlTree)).toBe('/auth');
    expect(tomarRedireccion()).toBe('/store/pedidos?pagina=2');
    expect(tomarAvisoLogin()?.motivo).toBe('requiere_sesion');
  });

  it('no guarda como retorno una ruta del propio login', () => {
    ejecutar('/auth/registro');
    expect(tomarRedireccion()).toBeNull();
  });
});
