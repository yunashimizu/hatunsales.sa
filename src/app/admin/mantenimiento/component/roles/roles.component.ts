import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AlertService } from '../../../../shared/services/alert.service';
import { mensajeDeError } from '../../../service/api-base.service';
import { RolAdmin, RolesAdminCrudService } from '../../../service/roles-crud.service';

@Component({
  selector: 'app-roles',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './roles.component.html',
  styleUrl: './roles.component.css',
})
export class RolesComponent implements OnInit, OnDestroy {
  roles: RolAdmin[] = [];
  cargando = false;
  guardando = false;
  editando: RolAdmin | null = null;
  nombre = '';
  idDestacado: number | null = null;

  private readonly destruir$ = new Subject<void>();
  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private readonly service: RolesAdminCrudService,
    private readonly alerta: AlertService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  identificarRol(_i: number, r: RolAdmin): number {
    return r.id_rol;
  }

  cargar(): void {
    this.cargando = true;
    this.cdr.markForCheck();
    this.service.listar().pipe(takeUntil(this.destruir$)).subscribe({
      next: (roles) => {
        this.roles = Array.isArray(roles) ? [...roles] : [];
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.cargando = false;
        this.cdr.markForCheck();
        this.alerta.error({ title: 'No se pudieron cargar los roles', message: mensajeDeError(error) });
      },
    });
  }

  nuevo(): void {
    this.editando = null;
    this.nombre = '';
  }

  editar(rol: RolAdmin): void {
    this.editando = rol;
    this.nombre = rol.nombre;
  }

  cancelar(): void {
    this.editando = null;
    this.nombre = '';
  }

  guardar(): void {
    const nombre = this.nombre.trim().toLowerCase();
    if (nombre.length < 2) {
      this.alerta.toast({ type: 'warning', title: 'Escribe un nombre de rol válido' });
      return;
    }

    this.guardando = true;
    this.cdr.markForCheck();
    const esEdicion = !!this.editando;
    const peticion = this.editando
      ? this.service.actualizar(this.editando.id_rol, nombre)
      : this.service.crear(nombre);

    peticion.pipe(takeUntil(this.destruir$)).subscribe({
      next: (rol) => {
        this.guardando = false;

        const fila: RolAdmin = {
          id_rol: Number(rol?.id_rol ?? this.editando?.id_rol),
          nombre: rol?.nombre ?? nombre,
          usuarios: rol?.usuarios ?? this.editando?.usuarios ?? 0,
          protegido: rol?.protegido ?? this.editando?.protegido ?? false,
        };

        if (!fila.id_rol) {
          this.cdr.markForCheck();
          this.alerta.error({ title: 'No se recibió el rol guardado' });
          return;
        }

        // Igual que productos: aparece al toque y el form queda limpio.
        this.reflejarEnLista(fila);
        this.destacar(fila.id_rol);
        this.cancelar();
        this.cdr.markForCheck();
        this.alerta.toast({
          type: 'success',
          title: esEdicion ? 'Rol actualizado' : 'Rol creado',
        });
      },
      error: (error) => {
        this.guardando = false;
        this.cdr.markForCheck();
        this.alerta.error({ title: 'No se pudo guardar', message: mensajeDeError(error) });
      },
    });
  }

  async eliminar(rol: RolAdmin): Promise<void> {
    if (rol.protegido) {
      this.alerta.toast({ type: 'warning', title: 'Este rol del sistema no se puede eliminar' });
      return;
    }

    const ok = await this.alerta.confirm({
      title: `¿Eliminar rol "${rol.nombre}"?`,
      message: `ID ${rol.id_rol}. Solo si no tiene usuarios asignados.`,
      confirmText: 'Sí, eliminar',
    });
    if (!ok.isConfirmed) return;

    this.service.eliminar(rol.id_rol).pipe(takeUntil(this.destruir$)).subscribe({
      next: () => {
        this.roles = this.roles.filter((r) => r.id_rol !== rol.id_rol);
        this.cdr.markForCheck();
        this.alerta.toast({ type: 'success', title: 'Rol eliminado' });
      },
      error: (error) => {
        this.cdr.markForCheck();
        this.alerta.error({ title: 'No se pudo eliminar', message: mensajeDeError(error) });
      },
    });
  }

  /** Inserta o reemplaza en la tabla sin recargar el listado. */
  private reflejarEnLista(rol: RolAdmin): void {
    const indice = this.roles.findIndex((r) => Number(r.id_rol) === Number(rol.id_rol));
    if (indice >= 0) {
      this.roles[indice] = { ...this.roles[indice], ...rol };
      this.roles = [...this.roles];
    } else {
      this.roles = [rol, ...this.roles];
    }
  }

  private destacar(id: number): void {
    this.idDestacado = id;
    setTimeout(() => {
      this.idDestacado = null;
      this.cdr.markForCheck();
    }, 2600);
  }

  destinoDe(rol: RolAdmin): string {
    const id = Number(rol.id_rol);
    if ([1, 3, 4].includes(id)) return 'Panel admin';
    if (id === 5 || (rol.nombre || '').toLowerCase() === 'cliente') return 'Store (cuenta)';
    if (id === 2) return 'Store';
    return 'Store (por defecto)';
  }

  esPanel(rol: RolAdmin): boolean {
    return this.destinoDe(rol).startsWith('Panel');
  }

  get totalPanel(): number {
    return this.roles.filter((r) => this.esPanel(r)).length;
  }

  get totalStore(): number {
    return this.roles.filter((r) => !this.esPanel(r)).length;
  }
}
