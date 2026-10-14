import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { NotificationService } from '../shared/services/notification.service';
import { tomarAvisoLogin, tomarRedireccion } from '../shared/utils/aviso-login.util';
import { roleGuard } from './role.guard';

describe('roleGuard', () => {
  const ejecutar = (url: string, roles: string[] = []) =>
    TestBed.runInInjectionContext(() =>
      roleGuard({ data: { roles } } as unknown as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
  const destino = (resultado: unknown) => TestBed.inject(Router).serializeUrl(resultado as UrlTree);

  function sesion(rolId: number, rolNombre: string): void {
    sessionStorage.setItem('token', 'abc');
    sessionStorage.setItem('rolId', String(rolId));
    sessionStorage.setItem('rolNombre', rolNombre);
  }

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => sessionStorage.clear());

  it('sin sesión lleva al login con motivo y retorno', () => {
    const resultado = ejecutar('/dashboard/mantenimiento/ventas', ['admin']);

    expect(resultado).toBeInstanceOf(UrlTree);
    expect(destino(resultado)).toBe('/auth');
    expect(tomarRedireccion()).toBe('/dashboard/mantenimiento/ventas');
    expect(tomarAvisoLogin()?.motivo).toBe('requiere_sesion');
  });

  it('un cliente que entra al panel vuelve a la tienda sin aviso', () => {
    sesion(5, 'cliente');
    const avisos = TestBed.inject(NotificationService);

    const resultado = ejecutar('/dashboard/home', ['admin', 'vendedor']);

    expect(destino(resultado)).toBe('/store');
    expect(avisos.avisos().length).toBe(0);
  });

  it('el personal sin permiso vuelve al inicio del panel y se le explica por qué', () => {
    sesion(3, 'vendedor');
    const avisos = TestBed.inject(NotificationService);

    const resultado = ejecutar('/dashboard/mantenimiento/usuarios', ['admin']);

    expect(destino(resultado)).toBe('/dashboard/home');
    const aviso = avisos.avisos()[0];
    expect(aviso?.tipo).toBe('advertencia');
    expect(aviso?.titulo).toBe('No tienes acceso a esa sección');
    expect(aviso?.clave).toBe('sin-acceso');
  });

  it('deja pasar a un rol permitido', () => {
    sesion(1, 'admin');
    expect(ejecutar('/dashboard/mantenimiento/usuarios', ['admin'])).toBe(true);
  });
});
