import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Input,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService, SesionUsuario } from '../../../auth/service/auth.service';

interface ItemMenu {
  etiqueta: string;
  ruta: string;
  icono: string;
  roles: string[];
  permisos?: string[];
}

interface SeccionMenu {
  titulo: string;
  items: ItemMenu[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit {
  @Input() collapsed = false;

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  sesion: SesionUsuario = {
    idUsuario: 0,
    nombre: '',
    email: '',
    rolId: 0,
    rolNombre: '',
    permisos: [],
    iniciales: '?',
  };

  /** Secciones abiertas (varias a la vez). */
  abiertas: Record<string, boolean> = {};

  /** Mismas rutas/roles/iconos; solo agrupados por tipo de negocio. */
  readonly secciones: SeccionMenu[] = [
    {
      titulo: 'Navegación',
      items: [
        {
          etiqueta: 'Dashboard',
          ruta: '/dashboard/home',
          icono: 'fa-tachometer-alt',
          roles: ['admin', 'superadmin', 'vendedor', 'caja'],
        },
      ],
    },
    {
      titulo: 'Ventas',
      items: [
        {
          etiqueta: 'Ventas',
          ruta: '/dashboard/mantenimiento/ventas',
          icono: 'fa-receipt',
          roles: ['admin', 'superadmin', 'vendedor', 'caja'],
        },
        {
          etiqueta: 'Documentos',
          ruta: '/dashboard/mantenimiento/doc',
          icono: 'fa-file-alt',
          roles: ['admin', 'superadmin', 'vendedor', 'caja'],
        },
        {
          etiqueta: 'Clientes',
          ruta: '/dashboard/mantenimiento/clientes',
          icono: 'fa-handshake',
          roles: ['admin', 'superadmin', 'vendedor', 'caja'],
        },
        {
          etiqueta: 'Cuentas por cobrar',
          ruta: '/dashboard/mantenimiento/cuentas-por-cobrar',
          icono: 'fa-hand-holding-usd',
          roles: ['admin', 'superadmin', 'caja', 'vendedor'],
        },
      ],
    },
    {
      titulo: 'Catálogo',
      items: [
        {
          etiqueta: 'Productos',
          ruta: '/dashboard/mantenimiento/productos',
          icono: 'fa-box',
          roles: ['admin', 'superadmin', 'vendedor'],
        },
        {
          etiqueta: 'Categorías',
          ruta: '/dashboard/mantenimiento/categorias',
          icono: 'fa-tags',
          roles: ['admin', 'superadmin', 'vendedor'],
        },
        {
          etiqueta: 'Marcas',
          ruta: '/dashboard/mantenimiento/marcas',
          icono: 'fa-award',
          roles: ['admin', 'superadmin', 'vendedor'],
        },
      ],
    },
    {
      titulo: 'Almacén',
      items: [
        {
          etiqueta: 'Inventario',
          ruta: '/dashboard/mantenimiento/inventario',
          icono: 'fa-warehouse',
          roles: ['admin', 'superadmin', 'vendedor'],
        },
        {
          etiqueta: 'Stock',
          ruta: '/dashboard/mantenimiento/stock',
          icono: 'fa-layer-group',
          roles: ['admin', 'superadmin', 'vendedor'],
        },
        {
          etiqueta: 'Almacén',
          ruta: '/dashboard/mantenimiento/almacen',
          icono: 'fa-boxes',
          roles: ['admin', 'superadmin'],
        },
        {
          etiqueta: 'Proveedores',
          ruta: '/dashboard/mantenimiento/proveedores',
          icono: 'fa-truck',
          roles: ['admin', 'superadmin', 'vendedor'],
        },
        {
          etiqueta: 'Recepción',
          ruta: '/dashboard/mantenimiento/recepcion',
          icono: 'fa-box-seam',
          roles: ['admin', 'superadmin', 'vendedor', 'caja'],
        },
      ],
    },
    {
      titulo: 'Reportes',
      items: [
        {
          etiqueta: 'Reportes',
          ruta: '/dashboard/mantenimiento/reportes',
          icono: 'fa-chart-bar',
          roles: ['admin', 'superadmin', 'vendedor', 'caja'],
        },
      ],
    },
    {
      titulo: 'Administración',
      items: [
        {
          etiqueta: 'Usuarios',
          ruta: '/dashboard/mantenimiento/usuarios',
          icono: 'fa-users',
          roles: ['admin', 'superadmin'],
        },
        {
          etiqueta: 'Roles',
          ruta: '/dashboard/mantenimiento/roles',
          icono: 'fa-user-shield',
          roles: ['admin', 'superadmin'],
        },
      ],
    },
  ];

  /** Sin cambios: siempre al final y siempre visible (no accordion). */
  readonly cuenta: ItemMenu[] = [
    {
      etiqueta: 'Mi perfil',
      ruta: '/dashboard/perfil',
      icono: 'fa-user',
      roles: ['admin', 'superadmin', 'vendedor', 'caja'],
    },
    {
      etiqueta: 'Configuración',
      ruta: '/dashboard/configuracion',
      icono: 'fa-cog',
      roles: ['admin', 'superadmin', 'vendedor', 'caja'],
    },
  ];

  ngOnInit(): void {
    this.refrescar();
    this.abrirSeccionActiva(this.router.url);

    this.auth.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.refrescar();
      this.abrirSeccionActiva(this.router.url);
      this.cdr.markForCheck();
    });

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        this.abrirSeccionActiva(e.urlAfterRedirects);
        this.cdr.markForCheck();
      });
  }

  get etiquetaRol(): string {
    return this.auth.etiquetaRol(this.sesion.rolNombre);
  }

  visible(item: ItemMenu): boolean {
    return this.auth.puedeVer(item.roles, item.permisos ?? []);
  }

  seccionVisible(seccion: SeccionMenu): boolean {
    return seccion.items.some((i) => this.visible(i));
  }

  estaAbierta(titulo: string): boolean {
    return !!this.abiertas[titulo];
  }

  toggleSeccion(titulo: string): void {
    this.abiertas = { ...this.abiertas, [titulo]: !this.abiertas[titulo] };
  }

  /** Abre la sección de la ruta actual (sin cerrar las que el usuario ya abrió). */
  private abrirSeccionActiva(url: string): void {
    const path = url.split('?')[0];
    const seccion = this.secciones.find((s) =>
      s.items.some((i) => this.visible(i) && (path === i.ruta || path.startsWith(i.ruta + '/'))),
    );
    if (seccion && !this.abiertas[seccion.titulo]) {
      this.abiertas = { ...this.abiertas, [seccion.titulo]: true };
    }
  }

  private refrescar(): void {
    this.sesion = this.auth.getSesion();
  }
}
