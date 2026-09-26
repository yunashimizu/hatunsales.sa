import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService, SesionUsuario } from '../../../auth/service/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit {
  /** true cuando el sidebar está expandido (menú visible). */
  @Input() sidebarAbierto = true;
  @Output() onToggleSidebar = new EventEmitter<void>();

  showUser = false;
  paginaActual = 'Dashboard';
  /** Icono (Bootstrap Icons) y módulo de la página actual, para la cabecera. */
  iconoActual = 'bi-house-door';
  grupoActual = '';
  /** Fecha de hoy en español, sin depender del locale global de Angular. */
  readonly fechaCorta = formatearFecha(new Date(), { weekday: 'short', day: 'numeric', month: 'short' });
  readonly fechaLarga = formatearFecha(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  sesion: SesionUsuario = {
    idUsuario: 0,
    nombre: '',
    email: '',
    rolId: 0,
    rolNombre: '',
    permisos: [],
    iniciales: '?',
  };

  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly titleDoc = inject(Title);

  ngOnInit(): void {
    this.refrescarSesion();
    this.auth.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.refrescarSesion();
      this.cdr.markForCheck();
    });

    this.aplicarPagina(this.router.url);
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        this.aplicarPagina(e.urlAfterRedirects);
        this.showUser = false;
        this.cdr.markForCheck();
      });
  }

  private aplicarTituloPestana(pagina: string): void {
    const base = 'HatunSales S.A.C';
    this.titleDoc.setTitle(pagina && pagina !== base ? `${pagina} | ${base}` : base);
  }

  get etiquetaRol(): string {
    return this.auth.etiquetaRol(this.sesion.rolNombre);
  }

  toggleUser(): void {
    this.showUser = !this.showUser;
  }

  /** Enter/Espacio sobre la píldora (no sobre los enlaces del desplegable, que ya responden solos). */
  alTeclaUsuario(event: Event): void {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    this.toggleUser();
  }

  logout(): void {
    // En dashboard solo hay staff; van al login del personal.
    this.auth.logout();
    this.router.navigate(['/auth']);
  }

  @HostListener('document:click', ['$event'])
  cerrarAlClickFuera(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.user-pill') && this.showUser) {
      this.showUser = false;
      this.cdr.markForCheck();
    }
  }

  private refrescarSesion(): void {
    this.sesion = this.auth.getSesion();
  }

  private aplicarPagina(url: string): void {
    const pagina = paginaDe(url);
    this.paginaActual = pagina.titulo;
    this.iconoActual = pagina.icono;
    this.grupoActual = pagina.grupo;
    this.aplicarTituloPestana(pagina.titulo);
  }
}

interface PaginaPanel {
  titulo: string;
  icono: string;
  grupo: string;
}

/** Mismas rutas e iconos que el menú lateral. El orden importa: la más específica primero. */
const PAGINAS: Array<{ fragmento: string; pagina: PaginaPanel }> = [
  { fragmento: '/mantenimiento/ventas', pagina: { titulo: 'Ventas', icono: 'bi-receipt', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/caja-sesion', pagina: { titulo: 'Caja', icono: 'bi-cash-stack', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/cotizaciones', pagina: { titulo: 'Cotizaciones', icono: 'bi-file-earmark-ruled', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/doc', pagina: { titulo: 'Documentos', icono: 'bi-file-earmark-text', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/guias-remision', pagina: { titulo: 'Guías de remisión', icono: 'bi-truck', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/clientes', pagina: { titulo: 'Clientes', icono: 'bi-people', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/cuentas-por-cobrar', pagina: { titulo: 'Cuentas por cobrar', icono: 'bi-wallet2', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/productos', pagina: { titulo: 'Productos', icono: 'bi-box-seam', grupo: 'Catálogo' } },
  { fragmento: '/mantenimiento/categorias', pagina: { titulo: 'Categorías', icono: 'bi-tags', grupo: 'Catálogo' } },
  { fragmento: '/mantenimiento/marcas', pagina: { titulo: 'Marcas', icono: 'bi-award', grupo: 'Catálogo' } },
  { fragmento: '/mantenimiento/inventario', pagina: { titulo: 'Inventario', icono: 'bi-boxes', grupo: 'Almacén' } },
  { fragmento: '/mantenimiento/stock', pagina: { titulo: 'Stock', icono: 'bi-clipboard-data', grupo: 'Almacén' } },
  { fragmento: '/mantenimiento/almacen', pagina: { titulo: 'Almacén', icono: 'bi-building', grupo: 'Almacén' } },
  { fragmento: '/mantenimiento/proveedores', pagina: { titulo: 'Proveedores', icono: 'bi-truck-front', grupo: 'Almacén' } },
  { fragmento: '/mantenimiento/recepcion', pagina: { titulo: 'Recepción', icono: 'bi-box-arrow-in-down', grupo: 'Almacén' } },
  { fragmento: '/mantenimiento/reportes', pagina: { titulo: 'Reportes', icono: 'bi-bar-chart-line', grupo: 'Reportes' } },
  { fragmento: '/mantenimiento/usuarios', pagina: { titulo: 'Usuarios', icono: 'bi-person-badge', grupo: 'Administración' } },
  { fragmento: '/mantenimiento/roles', pagina: { titulo: 'Roles', icono: 'bi-shield-check', grupo: 'Administración' } },
  { fragmento: '/perfil', pagina: { titulo: 'Mi perfil', icono: 'bi-person-circle', grupo: 'Cuenta' } },
  { fragmento: '/configuracion', pagina: { titulo: 'Configuración', icono: 'bi-gear', grupo: 'Cuenta' } },
  { fragmento: '/dashboard/home', pagina: { titulo: 'Inicio', icono: 'bi-house-door', grupo: 'Panel' } },
];

function paginaDe(url: string): PaginaPanel {
  const encontrada = PAGINAS.find((p) => url.includes(p.fragmento));
  if (encontrada) return encontrada.pagina;
  if (url.endsWith('/dashboard')) return { titulo: 'Inicio', icono: 'bi-house-door', grupo: 'Panel' };
  return { titulo: 'Dashboard', icono: 'bi-grid-1x2', grupo: 'Panel' };
}

function formatearFecha(fecha: Date, opciones: Intl.DateTimeFormatOptions): string {
  try {
    return fecha.toLocaleDateString('es-PE', opciones).replace(/\./g, '');
  } catch {
    return fecha.toLocaleDateString();
  }
}
