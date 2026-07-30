import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { CuentaTiendaService } from '../../service/cuenta.service';
import { PedidoService } from '../../service/pedido.service';
import { AlertService } from '../../../shared/services/alert.service';
import { AuthService } from '../../../auth/service/auth.service';
import { DireccionEnvio, DireccionPayload, Pedido } from '../../models/tienda.models';
import { mensajeDeError } from '../../../admin/service/api-base.service';

type Seccion = 'datos' | 'direcciones' | 'pedidos';

const DIRECCION_VACIA: DireccionPayload = {
  alias: '',
  destinatario: '',
  telefono: '',
  departamento: '',
  provincia: '',
  distrito: '',
  direccion: '',
  referencia: '',
  codigo_postal: '',
  es_predeterminada: false,
};

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css',
})
export class PerfilComponent implements OnInit, OnDestroy {

  private readonly cuenta = inject(CuentaTiendaService);
  private readonly pedidoService = inject(PedidoService);
  private readonly alerta = inject(AlertService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destruir$ = new Subject<void>();

  readonly secciones: { id: Seccion; titulo: string; icono: string }[] = [
    { id: 'datos',       titulo: 'Mis datos',   icono: 'bi-person' },
    { id: 'direcciones', titulo: 'Direcciones', icono: 'bi-geo-alt' },
    { id: 'pedidos',     titulo: 'Últimos pedidos', icono: 'bi-box-seam' },
  ];

  seccion: Seccion = 'datos';

  usuario = { nombre: '', email: '', rol: '' };
  formulario = {
    nombre: '',
    email: '',
    password_actual: '',
    password_nueva: '',
    password_confirma: '',
  };
  direcciones: DireccionEnvio[] = [];
  pedidos: Pedido[] = [];

  formularioDireccion: DireccionPayload = { ...DIRECCION_VACIA };
  editandoId?: number;
  mostrarFormulario = false;
  guardando = false;
  guardandoPerfil = false;
  cargando = true;

  ngOnInit(): void {
    if (!this.autenticado) {
      void this.pedirLogin();
      return;
    }

    const sesion = this.auth.getSesion();
    this.usuario = {
      nombre: sesion.nombre || 'Cliente',
      email: sesion.email,
      rol: sesion.rolNombre,
    };
    this.formulario.nombre = this.usuario.nombre;
    this.formulario.email = this.usuario.email;

    this.cuenta
      .listarDirecciones()
      .pipe(takeUntil(this.destruir$))
      .subscribe((direcciones) => {
        this.direcciones = direcciones;
        this.cargando = false;
      });

    this.pedidoService
      .misPedidos()
      .pipe(takeUntil(this.destruir$))
      .subscribe((pedidos) => (this.pedidos = pedidos.slice(0, 4)));
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  get autenticado(): boolean {
    return typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('token');
  }

  get iniciales(): string {
    return this.usuario.nombre
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0].toUpperCase())
      .join('');
  }

  textoDireccion(d: DireccionEnvio): string {
    return [d.direccion, d.distrito, d.provincia, d.departamento].filter(Boolean).join(', ');
  }

  // ------------------------------------------------------------ direcciones

  nueva(): void {
    this.formularioDireccion = { ...DIRECCION_VACIA, es_predeterminada: this.direcciones.length === 0 };
    this.editandoId = undefined;
    this.mostrarFormulario = true;
  }

  editar(direccion: DireccionEnvio): void {
    const { id_direccion, ...resto } = direccion;
    this.formularioDireccion = { ...DIRECCION_VACIA, ...resto };
    this.editandoId = id_direccion;
    this.mostrarFormulario = true;
  }

  cancelar(): void {
    this.mostrarFormulario = false;
    this.editandoId = undefined;
    this.formularioDireccion = { ...DIRECCION_VACIA };
  }

  guardar(): void {
    if (!this.formularioDireccion.direccion.trim()) {
      this.alerta.toast({ type: 'warning', title: 'Escribe la dirección' });
      return;
    }

    this.guardando = true;
    const peticion = this.editandoId
      ? this.cuenta.actualizarDireccion(this.editandoId, this.formularioDireccion)
      : this.cuenta.crearDireccion(this.formularioDireccion);

    peticion.subscribe({
      next: (direccion) => {
        this.guardando = false;
        this.aplicarDireccion(direccion);
        this.cancelar();
        this.alerta.toast({ type: 'success', title: 'Dirección guardada' });
      },
      error: (err) => {
        this.guardando = false;
        this.alerta.error({
          title: 'No pudimos guardar la dirección',
          message: err?.error?.message ?? 'Revisa los datos e inténtalo nuevamente.',
        });
      },
    });
  }

  guardarPerfil(): void {
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

    this.guardandoPerfil = true;
    this.auth.actualizarPerfil(payload).subscribe({
      next: (data) => {
        this.guardandoPerfil = false;
        this.auth.sendData(data);
        const sesion = this.auth.getSesion();
        this.usuario = {
          nombre: sesion.nombre,
          email: sesion.email,
          rol: sesion.rolNombre,
        };
        this.formulario.password_actual = '';
        this.formulario.password_nueva = '';
        this.formulario.password_confirma = '';
        this.alerta.toast({ type: 'success', title: 'Datos actualizados' });
      },
      error: (error) => {
        this.guardandoPerfil = false;
        this.alerta.error({ title: 'No se pudo guardar', message: mensajeDeError(error) });
      },
    });
  }

  async eliminar(direccion: DireccionEnvio): Promise<void> {
    const resultado = await this.alerta.confirm({
      title: '¿Eliminar esta dirección?',
      message: this.textoDireccion(direccion),
      confirmText: 'Sí, eliminar',
    });

    if (!resultado.isConfirmed) return;

    this.cuenta.eliminarDireccion(direccion.id_direccion).subscribe({
      next: () => {
        this.direcciones = this.direcciones.filter((d) => d.id_direccion !== direccion.id_direccion);
        this.alerta.toast({ type: 'success', title: 'Dirección eliminada' });
      },
      error: () => this.alerta.toast({ type: 'error', title: 'No pudimos eliminar la dirección' }),
    });
  }

  private aplicarDireccion(direccion: DireccionEnvio): void {
    const existente = this.direcciones.findIndex((d) => d.id_direccion === direccion.id_direccion);
    const lista = existente >= 0
      ? this.direcciones.map((d, i) => (i === existente ? direccion : d))
      : [direccion, ...this.direcciones];

    // Solo una dirección puede quedar marcada como predeterminada.
    this.direcciones = direccion.es_predeterminada
      ? lista.map((d) => ({ ...d, es_predeterminada: d.id_direccion === direccion.id_direccion }))
      : lista;
  }

  private async pedirLogin(): Promise<void> {
    const resultado = await this.alerta.confirm({
      title: 'Inicia sesión para ver tu perfil',
      message: 'Gestiona tus datos, direcciones y pedidos desde un solo lugar.',
      confirmText: 'Iniciar sesión',
      cancelText: 'Volver a la tienda',
    });

    this.router.navigate([resultado.isConfirmed ? '/auth' : '/store']);
  }
}
