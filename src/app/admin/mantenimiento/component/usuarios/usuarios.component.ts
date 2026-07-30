import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GestionService } from '../../service/gestion.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { AlertService } from '../../../../shared/services/alert.service';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.css',
})
export class UsuariosComponent implements OnInit {
  usuarios: any[] = [];
  cargando = false;
  guardando = false;
  idDestacado: number | null = null;
  editando: any = null;
  formulario = { nombre: '', email: '', password: '', id_rol: 0 as number, estado: true };
  roles: any[] = [];

  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private gestionService: GestionService,
    private ns: NotificationService,
    private alerta: AlertService,
  ) {}

  ngOnInit(): void {
    this.cargarTodo();
  }

  identificarUsuario(_i: number, u: any): number {
    return u.id_usuario;
  }

  get rolesEmpleado(): any[] {
    return (this.roles ?? []).filter((r) => !this.esRolCliente(r));
  }

  get totalActivos(): number {
    return this.usuarios.filter((u) => u.estado !== false).length;
  }

  cargarTodo(): void {
    this.cargarUsuarios();
    this.cargarRoles();
  }

  cargarUsuarios(): void {
    this.cargando = true;
    this.cdr.markForCheck();
    this.gestionService.getUsuariosAdmin().subscribe({
      next: (data) => {
        this.usuarios = Array.isArray(data) ? [...data] : [];
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.gestionService.getUsuariosAdminAlt().subscribe({
          next: (data) => {
            this.usuarios = Array.isArray(data) ? [...data] : [];
            this.cargando = false;
            this.cdr.markForCheck();
          },
          error: () => {
            this.cargando = false;
            this.cdr.markForCheck();
            this.ns.error('No se pudieron cargar los usuarios');
          },
        });
      },
    });
  }

  cargarRoles(): void {
    this.gestionService.getRoles().subscribe({
      next: (r) => {
        this.roles = Array.isArray(r) ? [...r] : [];
        this.asegurarRolPorDefecto();
        this.cdr.markForCheck();
      },
      error: () => {
        this.gestionService.getRolesAdmin().subscribe({
          next: (lista) => {
            this.roles = Array.isArray(lista) ? [...lista] : [];
            this.asegurarRolPorDefecto();
            this.cdr.markForCheck();
          },
          error: () => {
            this.roles = [];
            this.cdr.markForCheck();
          },
        });
      },
    });
  }

  nuevo(): void {
    this.editando = null;
    this.limpiarFormulario();
  }

  editar(usuario: any): void {
    this.editando = { ...usuario };
    const idRol =
      Number(usuario.id_rol) ||
      Number(
        this.rolesEmpleado.find(
          (r) => String(r.nombre).toLowerCase() === String(usuario.rol || '').toLowerCase(),
        )?.id_rol,
      ) ||
      0;

    this.formulario = {
      nombre: usuario.nombre ?? '',
      email: usuario.email ?? '',
      password: '',
      id_rol: idRol,
      estado: usuario.estado !== false,
    };
    this.asegurarRolPorDefecto();
  }

  cancelar(): void {
    this.editando = null;
    this.limpiarFormulario();
  }

  guardar(): void {
    const nombre = this.formulario.nombre?.trim();
    const email = this.formulario.email?.trim().toLowerCase();
    const password = this.formulario.password ?? '';
    const idRol = Number(this.formulario.id_rol);
    const rolElegido = this.rolesEmpleado.find((r) => Number(r.id_rol) === idRol);

    if (!nombre || !email) {
      this.ns.error('Complete nombre y correo');
      return;
    }
    if (!rolElegido) {
      this.ns.error('Seleccione un rol de la lista');
      return;
    }

    if (!this.editando) {
      if (!password || password.length < 6) {
        this.ns.error('La contraseña debe tener al menos 6 caracteres');
        return;
      }
      if (this.usuarios.some((u) => String(u.email || '').toLowerCase() === email)) {
        this.ns.error('Ese correo ya está en la lista. Usa otro.');
        return;
      }

      this.guardando = true;
      this.cdr.markForCheck();
      this.gestionService.crearUsuarioAdmin({ nombre, email, password, id_rol: idRol }).subscribe({
        next: (respuesta) => {
          this.guardando = false;
          if (respuesta?.success === false) {
            this.cdr.markForCheck();
            this.ns.error(respuesta?.message || 'No se pudo crear el usuario');
            return;
          }
          const id = Number(respuesta?.id_usuario);
          if (!id) {
            this.cdr.markForCheck();
            this.ns.error('No se recibió el usuario creado');
            return;
          }
          this.reflejarEnLista({
            id_usuario: id,
            nombre: respuesta?.nombre ?? nombre,
            email: respuesta?.email ?? email,
            id_rol: idRol,
            rol: respuesta?.rol || rolElegido.nombre,
            estado: respuesta?.estado ?? true,
          });
          this.destacar(id);
          this.cancelar();
          this.cdr.markForCheck();
          this.ns.success('Usuario creado correctamente');
        },
        error: (err) => this.manejarErrorGuardar(err),
      });
      return;
    }

    if (password && password.length < 6) {
      this.ns.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    const idUsuario = Number(this.editando.id_usuario);
    const payload: any = {
      id_usuario: idUsuario,
      nombre,
      email,
      id_rol: idRol,
      estado: this.formulario.estado,
    };
    if (password.trim()) payload.password = password.trim();

    this.guardando = true;
    this.cdr.markForCheck();
    this.gestionService.actualizarUsuarioAdmin(payload).subscribe({
      next: (respuesta) => {
        this.guardando = false;
        this.reflejarEnLista({
          id_usuario: idUsuario,
          nombre: respuesta?.nombre ?? nombre,
          email: respuesta?.email ?? email,
          id_rol: Number(respuesta?.id_rol ?? idRol),
          rol: respuesta?.rol || rolElegido.nombre,
          estado: respuesta?.estado ?? this.formulario.estado,
        });
        this.destacar(idUsuario);
        this.cancelar();
        this.cdr.markForCheck();
        this.ns.success('Usuario actualizado');
      },
      error: (err) => {
        if (err?.status === 404) {
          this.gestionService.cambiarRolAdmin(idUsuario, idRol).subscribe({
            next: (r) => {
              this.guardando = false;
              this.reflejarEnLista({
                ...this.editando,
                nombre,
                email,
                id_rol: idRol,
                rol: r?.rol || rolElegido.nombre,
                estado: this.formulario.estado,
              });
              this.destacar(idUsuario);
              this.cancelar();
              this.cdr.markForCheck();
              this.ns.success('Rol actualizado. Redeploy del backend para editar nombre/correo/clave.');
            },
            error: (e) => this.manejarErrorGuardar(e),
          });
          return;
        }
        this.manejarErrorGuardar(err);
      },
    });
  }

  async eliminar(usuario: any): Promise<void> {
    if (Number(usuario.id_usuario) === 1) {
      this.ns.error('No se puede eliminar al admin principal');
      return;
    }

    const ok = await this.alerta.confirm({
      title: `¿Eliminar a ${usuario.nombre || usuario.email}?`,
      message: 'Se quitará del sistema. Esta acción no se puede deshacer.',
      confirmText: 'Sí, eliminar',
    });
    if (!ok.isConfirmed) return;

    this.gestionService.eliminarUsuarioAdmin(Number(usuario.id_usuario)).subscribe({
      next: () => {
        this.usuarios = this.usuarios.filter((u) => Number(u.id_usuario) !== Number(usuario.id_usuario));
        if (this.editando && Number(this.editando.id_usuario) === Number(usuario.id_usuario)) {
          this.cancelar();
        }
        this.cdr.markForCheck();
        this.ns.success('Usuario eliminado');
      },
      error: (err) => {
        this.cdr.markForCheck();
        const msg = err?.error?.message || 'No se pudo eliminar el usuario';
        this.ns.error(Array.isArray(msg) ? msg.join('. ') : msg);
      },
    });
  }

  private manejarErrorGuardar(err: any): void {
    this.guardando = false;
    this.cdr.markForCheck();
    const status = err?.status;
    const msg = err?.error?.message || 'No se pudo guardar el usuario';
    const texto = Array.isArray(msg) ? msg.join('. ') : msg;
    if (status === 409) {
      this.ns.error(texto || 'Ese correo ya está registrado. Usa otro.');
      return;
    }
    this.ns.error(texto);
  }

  private esRolCliente(rol: any): boolean {
    const id = Number(rol?.id_rol);
    const nombre = String(rol?.nombre || '').trim().toLowerCase();
    return id === 5 || nombre === 'cliente';
  }

  private asegurarRolPorDefecto(): void {
    const actuales = this.rolesEmpleado;
    if (!actuales.length) {
      this.formulario.id_rol = 0;
      return;
    }
    const sigueValido = actuales.some((r) => Number(r.id_rol) === Number(this.formulario.id_rol));
    if (!sigueValido) {
      const vendedor = actuales.find((r) => String(r.nombre).toLowerCase() === 'vendedor');
      this.formulario.id_rol = Number((vendedor ?? actuales[0]).id_rol);
    }
  }

  private reflejarEnLista(usuario: any): void {
    const indice = this.usuarios.findIndex((u) => Number(u.id_usuario) === Number(usuario.id_usuario));
    if (indice >= 0) {
      this.usuarios[indice] = { ...this.usuarios[indice], ...usuario };
      this.usuarios = [...this.usuarios];
    } else {
      this.usuarios = [usuario, ...this.usuarios];
    }
  }

  private limpiarFormulario(): void {
    this.formulario = { nombre: '', email: '', password: '', id_rol: 0, estado: true };
    this.asegurarRolPorDefecto();
  }

  private destacar(id: number): void {
    this.idDestacado = id;
    setTimeout(() => {
      this.idDestacado = null;
      this.cdr.markForCheck();
    }, 2600);
  }
}
