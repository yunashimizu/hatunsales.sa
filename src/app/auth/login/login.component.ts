import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthShellComponent } from '../shared/auth-shell.component';
import { GoogleSignInComponent } from '../shared/google-sign-in.component';
import { AuthService } from '../service/auth.service';
import { loginRequest } from '../models/login-request';
import { loginResponse } from '../models/login-response.model';
import { mensajeDeError } from '../../admin/service/api-base.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    AuthShellComponent,
    GoogleSignInComponent,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  @ViewChild('cardInner') cardInner?: ElementRef<HTMLElement>;

  loginForm: FormGroup;
  cargando = false;
  googleCargando = false;
  mostrarPassword = false;
  recordarme = true;
  errorMsg = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }

  login(): void {
    this.errorMsg = '';
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      this.shake();
      return;
    }

    this.cargando = true;
    const body: loginRequest = this.loginForm.getRawValue();

    this.auth.login(body).subscribe({
      next: (data: loginResponse) => {
        this.cargando = false;
        if (data.success && data.token) {
          this.auth.sendData(data);
          this.navegarSegunRol();
        } else {
          this.errorMsg = data.mensaje || 'Credenciales incorrectas';
          this.shake();
        }
      },
      error: (err) => {
        this.cargando = false;
        this.errorMsg = mensajeDeError(err, 'No se pudo iniciar sesión');
        this.shake();
      },
    });
  }

  onGoogle(credential: string): void {
    this.errorMsg = '';
    this.googleCargando = true;
    this.auth.loginConGoogle(credential).subscribe({
      next: (data) => {
        this.googleCargando = false;
        this.auth.sendData(data);
        this.navegarSegunRol();
      },
      error: (err) => {
        this.googleCargando = false;
        this.errorMsg = mensajeDeError(err, 'No se pudo entrar con Google');
        this.shake();
      },
    });
  }

  onGoogleError(msg: string): void {
    this.errorMsg = msg;
  }

  private navegarSegunRol(): void {
    // Staff (admin/vendedor/caja/consulta) → panel. Cliente → tienda.
    if (this.auth.isCliente()) {
      this.router.navigate(['/store']);
      return;
    }
    if (this.auth.isAdmin()) {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.router.navigate(['/store']);
  }

  private shake(): void {
    const el = this.cardInner?.nativeElement;
    if (!el) return;
    el.classList.remove('auth-shake');
    // reflow
    void el.offsetWidth;
    el.classList.add('auth-shake');
  }
}
