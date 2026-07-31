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
import { forkJoin, of } from 'rxjs';
import { catchError, filter } from 'rxjs/operators';
import { AuthService, SesionUsuario } from '../../../auth/service/auth.service';
import { ComprobanteService } from '../../service/comprobante.service';
import { InventarioAdminService } from '../../service/inventario-admin.service';

interface ItemMenu {
  etiqueta: string;
  ruta: string;
  icono: string;
  roles: string[];
  permisos?: string[];
  /** Clave de badge opcional (ej. cpe_atencion). */
  badgeKey?: string;
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
  private readonly comprobantes = inject(ComprobanteService);
  private readonly inventario = inject(InventarioAdminService);

  sesion: SesionUsuario = {
    idUsuario: 0,
    nombre: '',
    email: '',
    rolId: 0,
    rolNombre: '',
    permisos: [],
    iniciales: '?',
  };

  /** Contadores para badges del menú. */
  badges: Record<string, number> = {};

  /** Secciones abiertas (varias a la vez). */
  abiertas: Record<string, boolean> = {};

  /** Mismas rutas/roles; iconos Bootstrap Icons (ya cargados en el admin). */
  readonly secciones: SeccionMenu[] = [
    {
      titulo: 'Navegación',
      items: [
        {
          etiqueta: 'Dashboard',
          ruta: '/dashboard/home',
          icono: 'bi-house-door',
          roles: ['admin', 'superadmin', 'vendedor', 'caja', 'consulta'],
        },
      ],
    },
    {
      titulo: 'Ventas',
      items: [
        {
          etiqueta: 'Ventas',
          ruta: '/dashboard/mantenimiento/ventas',
          icono: 'bi-receipt',
          roles: ['admin', 'superadmin', 'vendedor', 'caja'],
        },
        {
          etiqueta: 'Caja',
          ruta: '/dashboard/mantenimiento/caja-sesion',
          icono: 'bi-cash-stack',
          roles: ['admin', 'superadmin', 'vendedor', 'caja'],
        },
        {
          etiqueta: 'Documentos',
          ruta: '/dashboard/mantenimiento/doc',
          icono: 'bi-file-earmark-text',
          roles: ['admin', 'superadmin', 'vendedor', 'caja'],
          badgeKey: 'cpe_atencion',
        },
        {
          etiqueta: 'Clientes',
          ruta: '/dashboard/mantenimiento/clientes',
          icono: 'bi-people',
          roles: ['admin', 'superadmin', 'vendedor', 'caja'],
        },
        {
          etiqueta: 'Cuentas por cobrar',
          ruta: '/dashboard/mantenimiento/cuentas-por-cobrar',
          icono: 'bi-wallet2',
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
          icono: 'bi-box-seam',
          roles: ['admin', 'superadmin', 'vendedor', 'consulta'],
        },
        {
          etiqueta: 'Categorías',
          ruta: '/dashboard/mantenimiento/categorias',
          icono: 'bi-tags',
          roles: ['admin', 'superadmin', 'vendedor', 'consulta'],
        },
        {
          etiqueta: 'Marcas',
          ruta: '/dashboard/mantenimiento/marcas',
          icono: 'bi-award',
          roles: ['admin', 'superadmin', 'vendedor', 'consulta'],
        },
      ],
    },
    {
      titulo: 'Almacén',
      items: [
        {
          etiqueta: 'Inventario',
          ruta: '/dashboard/mantenimiento/inventario',
          icono: 'bi-building',
          roles: ['admin', 'superadmin', 'vendedor'],
          badgeKey: 'stock_alerta',
        },
        {
          etiqueta: 'Stock',
          ruta: '/dashboard/mantenimiento/stock',
          icono: 'bi-layers',
          roles: ['admin', 'superadmin', 'vendedor', 'consulta'],
          badgeKey: 'stock_alerta',
        },
        {
          etiqueta: 'Almacén',
          ruta: '/dashboard/mantenimiento/almacen',
          icono: 'bi-houses',
          roles: ['admin', 'superadmin'],
        },
        {
          etiqueta: 'Proveedores',
          ruta: '/dashboard/mantenimiento/proveedores',
          icono: 'bi-truck',
          roles: ['admin', 'superadmin', 'vendedor'],
        },
        {
          etiqueta: 'Recepción',
          ruta: '/dashboard/mantenimiento/recepcion',
          icono: 'bi-clipboard-check',
          roles: ['admin', 'superadmin', 'vendedor'],
        },
      ],
    },
    {
      titulo: 'Reportes',
      items: [
        {
          etiqueta: 'Reportes',
          ruta: '/dashboard/mantenimiento/reportes',
          icono: 'bi-bar-chart',
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
          icono: 'bi-person-gear',
          roles: ['admin', 'superadmin'],
        },
        {
          etiqueta: 'Roles',
          ruta: '/dashboard/mantenimiento/roles',
          icono: 'bi-shield-lock',
          roles: ['admin', 'superadmin'],
        },
      ],
    },
  ];

  /** Sin cambios de rutas: siempre al final y siempre visible (no accordion). */
  readonly cuenta: ItemMenu[] = [
    {
      etiqueta: 'Mi perfil',
      ruta: '/dashboard/perfil',
      icono: 'bi-person',
      roles: ['admin', 'superadmin', 'vendedor', 'caja', 'consulta'],
    },
    {
      etiqueta: 'Configuración',
      ruta: '/dashboard/configuracion',
      icono: 'bi-gear',
      roles: ['admin', 'superadmin'],
    },
  ];

  ngOnInit(): void {
    this.refrescar();
    this.abrirSeccionActiva(this.router.url);
    this.cargarBadges();

    this.auth.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.refrescar();
      this.abrirSeccionActiva(this.router.url);
      this.cargarBadges();
      this.cdr.markForCheck();
    });

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        this.abrirSeccionActiva(e.urlAfterRedirects);
        const u = e.urlAfterRedirects;
        if (
          u.includes('/mantenimiento/doc')
          || u.includes('/mantenimiento/stock')
          || u.includes('/mantenimiento/inventario')
        ) {
          this.cargarBadges();
        }
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

  badgeDe(item: ItemMenu): number {
    if (!item.badgeKey) return 0;
    return Number(this.badges[item.badgeKey] ?? 0) || 0;
  }

  /** Rojo si hay sin stock; ámbar si solo mínimos. CPE sigue rojo por defecto. */
  tonoBadge(item: ItemMenu): 'peligro' | 'aviso' | 'neutra' {
    if (item.badgeKey === 'stock_alerta') {
      return Number(this.badges['stock_sin'] ?? 0) > 0 ? 'peligro' : 'aviso';
    }
    if (item.badgeKey === 'cpe_atencion') return 'peligro';
    return 'neutra';
  }

  tituloBadge(item: ItemMenu): string {
    const n = this.badgeDe(item);
    if (item.badgeKey === 'stock_alerta') {
      const sin = Number(this.badges['stock_sin'] ?? 0);
      const bajo = Number(this.badges['stock_bajo'] ?? 0);
      return `Stock: ${sin} en cero · ${bajo} bajo mínimo (${n} alertas)`;
    }
    return `${n} por revisar`;
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

  private cargarBadges(): void {
    if (!this.sesion.idUsuario) return;

    const veDocumentos = this.auth.puedeVer(['admin', 'superadmin', 'vendedor', 'caja']);
    const veStock = this.auth.puedeVer(['admin', 'superadmin', 'vendedor', 'consulta']);

    const cpe$ = veDocumentos
      ? this.comprobantes.monitorAtencion().pipe(catchError(() => of({ total: 0 })))
      : of({ total: 0 });

    const stock$ = veStock
      ? this.inventario.resumen().pipe(catchError(() => of({ sin_stock: 0, bajo_stock: 0 })))
      : of({ sin_stock: 0, bajo_stock: 0 });

    forkJoin({ cpe: cpe$, stock: stock$ }).subscribe({
      next: ({ cpe, stock }) => {
        const sin = Number((stock as { sin_stock?: number }).sin_stock ?? 0) || 0;
        const bajo = Number((stock as { bajo_stock?: number }).bajo_stock ?? 0) || 0;
        this.badges = {
          ...this.badges,
          cpe_atencion: Number((cpe as { total?: number }).total ?? 0) || 0,
          stock_sin: sin,
          stock_bajo: bajo,
          stock_alerta: sin + bajo,
        };
        this.cdr.markForCheck();
      },
      error: () => {
        this.badges = {
          ...this.badges,
          cpe_atencion: 0,
          stock_sin: 0,
          stock_bajo: 0,
          stock_alerta: 0,
        };
        this.cdr.markForCheck();
      },
    });
  }
}
