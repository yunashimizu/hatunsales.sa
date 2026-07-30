import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthShellComponent } from '../shared/auth-shell.component';
import { GoogleSignInComponent } from '../shared/google-sign-in.component';
import { AuthService } from '../service/auth.service';
import { mensajeDeError } from '../../admin/service/api-base.service';

function coincidenPasswords(group: AbstractControl): ValidationErrors | null {
  const pass = group.get('password')?.value;
  const confirm = group.get('password_confirm')?.value;
  if (!pass || !confirm) return null;
  return pass === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    AuthShellComponent,
    GoogleSignInComponent,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  @ViewChild('cardInner') cardInner?: ElementRef<HTMLElement>;

  form: FormGroup;
  cargando = false;
  googleCargando = false;
  mostrarPassword = false;
  mostrarConfirm = false;
  errorMsg = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {
    this.form = this.fb.group(
      {
        nombres: ['', [Validators.required, Validators.minLength(2)]],
        apellidos: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        telefono: ['', [Validators.pattern(/^[\d+\s()-]{6,20}$/)]],
        password: ['', [Validators.required, Validators.minLength(8)]],
        password_confirm: ['', [Validators.required]],
        terminos: [false, [Validators.requiredTrue]],
        ofertas: [false],
      },
      { validators: coincidenPasswords },
    );
  }

  get password(): string {
    return this.form.get('password')?.value ?? '';
  }

  get fuerza(): { nivel: number; etiqueta: string; color: string } {
    const p = this.password;
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[a-z]/.test(p)) score++;
    if (/\d/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;

    if (score <= 2) return { nivel: score, etiqueta: 'Débil', color: 'bg-rose-500' };
    if (score === 3) return { nivel: score, etiqueta: 'Media', color: 'bg-amber-500' };
    if (score === 4) return { nivel: score, etiqueta: 'Buena', color: 'bg-sky-500' };
    return { nivel: score, etiqueta: 'Fuerte', color: 'bg-emerald-500' };
  }

  get requisitos() {
    const p = this.password;
    return [
      { ok: p.length >= 8, texto: 'Mínimo 8 caracteres' },
      { ok: /[A-Z]/.test(p), texto: 'Una mayúscula' },
      { ok: /[a-z]/.test(p), texto: 'Una minúscula' },
      { ok: /\d/.test(p), texto: 'Un número' },
      { ok: /[^A-Za-z0-9]/.test(p), texto: 'Un símbolo' },
    ];
  }

  submit(): void {
    this.errorMsg = '';
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.shake();
      return;
    }

    const v = this.form.getRawValue();
    this.cargando = true;

    this.auth
      .register({
        nombres: v.nombres.trim(),
        apellidos: v.apellidos.trim(),
        email: v.email.trim().toLowerCase(),
        password: v.password,
        telefono: (v.telefono || '').trim() || undefined,
      })
      .subscribe({
        next: () => {
          // Auto-login como en tiendas grandes
          this.auth.login({
              email: v.email.trim().toLowerCase(),
              password: v.password,
              name: `${v.nombres} ${v.apellidos}`.trim(),
            }).subscribe({
            next: (data) => {
              this.cargando = false;
              this.auth.sendData(data);
              this.router.navigate(['/store']);
            },
            error: () => {
              this.cargando = false;
              this.router.navigate(['/auth']);
            },
          });
        },
        error: (err) => {
          this.cargando = false;
          this.errorMsg = mensajeDeError(err, 'No se pudo crear la cuenta');
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
        this.router.navigate(['/store']);
      },
      error: (err) => {
        this.googleCargando = false;
        this.errorMsg = mensajeDeError(err, 'No se pudo continuar con Google');
        this.shake();
      },
    });
  }

  onGoogleError(msg: string): void {
    this.errorMsg = msg;
  }

  private shake(): void {
    const el = this.cardInner?.nativeElement;
    if (!el) return;
    el.classList.remove('auth-shake');
    void el.offsetWidth;
    el.classList.add('auth-shake');
  }
}
