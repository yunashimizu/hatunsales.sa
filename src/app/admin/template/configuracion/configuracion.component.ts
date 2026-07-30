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
import { RouterModule } from '@angular/router';
import { AuthService, SesionUsuario } from '../../../auth/service/auth.service';
import { esRolStaff, ROL_IDS } from '../../../auth/roles.constants';

@Component({
  selector: 'app-admin-configuracion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './configuracion.component.html',
  styleUrl: './configuracion.component.css',
})
export class AdminConfiguracionComponent implements OnInit {
  sesion: SesionUsuario = {
    idUsuario: 0,
    nombre: '',
    email: '',
    rolId: 0,
    rolNombre: '',
    permisos: [],
    iniciales: '?',
  };

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor(private readonly auth: AuthService) {}

  ngOnInit(): void {
    this.refrescar();
    this.auth.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.refrescar());
  }

  get etiquetaRol(): string {
    return this.auth.etiquetaRol(this.sesion.rolNombre);
  }

  get destinoAcceso(): string {
    return esRolStaff(this.sesion.rolId, this.sesion.rolNombre) ? 'Panel' : 'Store';
  }

  get esAdminPuro(): boolean {
    const rol = this.sesion.rolNombre.toLowerCase();
    return this.sesion.rolId === ROL_IDS.ADMIN || rol === 'admin' || rol === 'superadmin';
  }

  private refrescar(): void {
    this.sesion = this.auth.getSesion();
    this.cdr.markForCheck();
  }
}
