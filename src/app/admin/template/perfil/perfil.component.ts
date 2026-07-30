import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService, SesionUsuario } from '../../../auth/service/auth.service';
import { AlertService } from '../../../shared/services/alert.service';
import { mensajeDeError } from '../../service/api-base.service';

@Component({
  selector: 'app-admin-perfil',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css',
})
export class AdminPerfilComponent implements OnInit {
  sesion: SesionUsuario = {
    idUsuario: 0,
    nombre: '',
    email: '',
    rolId: 0,
    rolNombre: '',
    permisos: [],
    iniciales: '?',
  };

  formulario = {
    nombre: '',
    email: '',
    password_actual: '',
    password_nueva: '',
    password_confirma: '',
  };

  guardando = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly auth: AuthService,
    private readonly alerta: AlertService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.auth.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cargar());
  }

  get etiquetaRol(): string {
    return this.auth.etiquetaRol(this.sesion.rolNombre);
  }

  guardar(): void {
    const nombre = this.formulario.nombre.trim();
    const email = this.formulario.email.trim();

    if (!nombre || !email) {
      this.alerta.toast({ type: 'warning', title: 'Nombre y correo son obligatorios' });
      return;
    }

    if (this.formulario.password_nueva || this.formulario.password_confirma || this.formulario.password_actual) {
      if (!this.formulario.password_actual) {
        this.alerta.toast({ type: 'warning', title: 'Indique su contraseña actual' });
        return;
      }
      if (this.formulario.password_nueva.length < 6) {
        this.alerta.toast({ type: 'warning', title: 'La nueva contraseña debe tener al menos 6 caracteres' });
        return;
      }
      if (this.formulario.password_nueva !== this.formulario.password_confirma) {
        this.alerta.toast({ type: 'warning', title: 'Las contraseñas nuevas no coinciden' });
        return;
      }
    }

    const payload: {
      nombre: string;
      email: string;
      password_actual?: string;
      password_nueva?: string;
    } = { nombre, email };

    if (this.formulario.password_nueva) {
      payload.password_actual = this.formulario.password_actual;
      payload.password_nueva = this.formulario.password_nueva;
    }

    this.guardando = true;
    this.cdr.markForCheck();
    this.auth.actualizarPerfil(payload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.guardando = false;
        this.auth.sendData(data);
        this.formulario.password_actual = '';
        this.formulario.password_nueva = '';
        this.formulario.password_confirma = '';
        this.cargar();
        this.cdr.markForCheck();
        this.alerta.toast({ type: 'success', title: 'Perfil actualizado' });
      },
      error: (error) => {
        this.guardando = false;
        this.cdr.markForCheck();
        this.alerta.error({ title: 'No se pudo guardar', message: mensajeDeError(error) });
      },
    });
  }

  private cargar(): void {
    this.sesion = this.auth.getSesion();
    this.formulario.nombre = this.sesion.nombre;
    this.formulario.email = this.sesion.email;
    this.cdr.markForCheck();
  }
}
