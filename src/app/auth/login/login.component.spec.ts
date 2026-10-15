import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../service/auth.service';
import { AuthShellComponent } from '../shared/auth-shell.component';
import { GoogleSignInComponent } from '../shared/google-sign-in.component';

import { LoginComponent } from './login.component';

@Component({ selector: 'app-auth-shell', standalone: true, template: '<ng-content />' })
class AuthShellPrueba {
  @Input() modo = 'login';
}

@Component({ selector: 'app-google-sign-in', standalone: true, template: '' })
class GoogleSignInPrueba {
  @Input() cargando = false;
  @Input() etiqueta = '';
  @Output() credential = new EventEmitter<string>();
  @Output() fallo = new EventEmitter<string>();
}

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let auth: { login: ReturnType<typeof vi.fn>; sendData: ReturnType<typeof vi.fn>; isCliente: ReturnType<typeof vi.fn>; isAdmin: ReturnType<typeof vi.fn>; googleConfig: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    auth = {
      login: vi.fn(), sendData: vi.fn(), isCliente: vi.fn(() => false), isAdmin: vi.fn(() => true),
      googleConfig: vi.fn(() => of({ habilitado: false, clientId: null })),
    };
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).overrideComponent(LoginComponent, {
      remove: { imports: [AuthShellComponent, GoogleSignInComponent] },
      add: { imports: [AuthShellPrueba, GoogleSignInPrueba] },
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('no envía credenciales cuando el formulario es inválido', () => {
    component.login();
    expect(auth.login).not.toHaveBeenCalled();
    expect(component.loginForm.touched).toBe(true);
  });

  it('guarda la sesión y abre el panel cuando entra un empleado', () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const respuesta = { success: true, token: 'token-de-prueba' };
    auth.login.mockReturnValue(of(respuesta));
    component.loginForm.setValue({ email: 'prueba@example.com', password: 'clave-de-prueba' });
    component.login();
    expect(auth.sendData).toHaveBeenCalledWith(respuesta);
    expect(navegar).toHaveBeenCalledWith(['/dashboard']);
    expect(component.cargando).toBe(false);
  });

  it('permite reintentar después de un error de autenticación', () => {
    auth.login.mockReturnValue(throwError(() => ({ status: 401, error: { message: 'Credenciales incorrectas' } })));
    component.loginForm.setValue({ email: 'prueba@example.com', password: 'incorrecta' });
    component.login();
    expect(component.errorMsg).toContain('Credenciales incorrectas');
    expect(component.cargando).toBe(false);
    expect(auth.sendData).not.toHaveBeenCalled();
  });
});
