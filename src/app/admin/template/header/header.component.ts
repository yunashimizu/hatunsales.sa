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

  ngOnInit(): void {
    this.refrescarSesion();
    this.auth.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.refrescarSesion();
      this.cdr.markForCheck();
    });

    this.paginaActual = this.tituloDe(this.router.url);
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        this.paginaActual = this.tituloDe(e.urlAfterRedirects);
        this.showUser = false;
        this.cdr.markForCheck();
      });
  }

  get etiquetaRol(): string {
    return this.auth.etiquetaRol(this.sesion.rolNombre);
  }

  toggleUser(): void {
    this.showUser = !this.showUser;
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

  private tituloDe(url: string): string {
    if (url.includes('/mantenimiento/ventas')) return 'Ventas';
    if (url.includes('/mantenimiento/productos')) return 'Productos';
    if (url.includes('/mantenimiento/inventario')) return 'Inventario';
    if (url.includes('/mantenimiento/clientes')) return 'Clientes';
    if (url.includes('/mantenimiento/doc')) return 'Documentos';
    if (url.includes('/mantenimiento/usuarios')) return 'Usuarios';
    if (url.includes('/mantenimiento/roles')) return 'Roles';
    if (url.includes('/mantenimiento/reportes')) return 'Reportes';
    if (url.includes('/mantenimiento/stock')) return 'Stock';
    if (url.includes('/mantenimiento/almacen')) return 'Almacén';
    if (url.includes('/mantenimiento/proveedores')) return 'Proveedores';
    if (url.includes('/mantenimiento/recepcion')) return 'Recepción';
    if (url.includes('/mantenimiento/marcas')) return 'Marcas';
    if (url.includes('/mantenimiento/cuentas-por-cobrar')) return 'Cuentas por cobrar';
    if (url.includes('/mantenimiento/categorias')) return 'Categorías';
    if (url.includes('/perfil')) return 'Mi perfil';
    if (url.includes('/configuracion')) return 'Configuración';
    if (url.includes('/dashboard/home') || url.endsWith('/dashboard')) return 'Inicio';
    return 'Dashboard';
  }
}
