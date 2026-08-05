import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs';
import { CartService } from '../../service/cart.service';
import { CatalogoService } from '../../service/catalogo.service';
import { CuentaTiendaService } from '../../service/cuenta.service';
import { AlertService } from '../../../shared/services/alert.service';
import { AuthService } from '../../../auth/service/auth.service';
import { CategoriaTienda, ProductoTienda } from '../../models/tienda.models';
import { EMPRESA_TIENDA } from '../../config/empresa-tienda.config';

@Component({
  selector: 'app-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent implements OnInit, OnDestroy {

  /** Marca de la tienda (mismo origen que footer / contacto). */
  readonly empresa = EMPRESA_TIENDA;

  private readonly cart = inject(CartService);
  private readonly catalogo = inject(CatalogoService);
  private readonly cuenta = inject(CuentaTiendaService);
  private readonly alerta = inject(AlertService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly destruir$ = new Subject<void>();
  private readonly termino$ = new Subject<string>();

  categorias: CategoriaTienda[] = [];
  sugerencias: ProductoTienda[] = [];
  favoritos = 0;
  cantidadCarrito = 0;

  termino = '';
  buscando = false;
  menuAbierto = false;
  menuCuentaAbierto = false;
  megaMenuAbierto = false;
  compacto = false;

  nombreUsuario = '';
  autenticado = false;

  ngOnInit(): void {
    this.leerSesion();

    this.catalogo.categorias().pipe(takeUntil(this.destruir$)).subscribe((c) => {
      this.categorias = c;
      this.cdr.markForCheck();
    });

    this.cart.carrito$
      .pipe(takeUntil(this.destruir$))
      .subscribe((carrito) => {
        this.cantidadCarrito = carrito.cantidad_items;
        this.cdr.markForCheck();
      });

    this.cuenta.favoritos$
      .pipe(takeUntil(this.destruir$))
      .subscribe((ids) => {
        this.favoritos = ids.size;
        this.cdr.markForCheck();
      });

    this.termino$
      .pipe(
        debounceTime(220),
        distinctUntilChanged(),
        switchMap((texto) => this.catalogo.buscar(texto)),
        takeUntil(this.destruir$),
      )
      .subscribe((resultados) => {
        this.sugerencias = resultados;
        this.buscando = false;
        this.cdr.markForCheck();
      });

    this.cart.cargar().pipe(takeUntil(this.destruir$)).subscribe();
    if (this.autenticado) this.cuenta.sincronizarFavoritos().pipe(takeUntil(this.destruir$)).subscribe();
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  @HostListener('window:scroll')
  alDesplazar(): void {
    const siguiente = window.scrollY > 24;
    if (siguiente === this.compacto) return;
    this.compacto = siguiente;
    this.cdr.markForCheck();
  }

  @HostListener('document:click', ['$event'])
  alClicFuera(evento: MouseEvent): void {
    const objetivo = evento.target as HTMLElement;
    let cambio = false;
    if (!objetivo.closest('.buscador') && this.sugerencias.length) {
      this.sugerencias = [];
      cambio = true;
    }
    if (!objetivo.closest('.cuenta') && this.menuCuentaAbierto) {
      this.menuCuentaAbierto = false;
      cambio = true;
    }
    if (!objetivo.closest('.mega') && this.megaMenuAbierto) {
      this.megaMenuAbierto = false;
      cambio = true;
    }
    if (cambio) this.cdr.markForCheck();
  }

  imagen(producto: ProductoTienda): string {
    return this.catalogo.urlImagen(producto.imagen);
  }

  alEscribir(): void {
    const texto = this.termino.trim();

    if (texto.length < 2) {
      this.sugerencias = [];
      this.buscando = false;
      this.cdr.markForCheck();
      return;
    }

    this.buscando = true;
    this.cdr.markForCheck();
    this.termino$.next(texto);
  }

  buscar(): void {
    const texto = this.termino.trim();
    if (!texto) return;

    this.sugerencias = [];
    this.menuAbierto = false;
    this.router.navigate(['/store/catalogo'], { queryParams: { q: texto } });
  }

  irAProducto(producto: ProductoTienda): void {
    this.sugerencias = [];
    this.termino = '';
    this.catalogo.guardarPreview(producto);
    this.router.navigate(['/store/producto', producto.id_producto]);
  }

  abrirCarrito(): void {
    this.cart.abrirPanel();
  }

  alternarMenu(): void {
    this.menuAbierto = !this.menuAbierto;
  }

  alternarCuenta(): void {
    this.menuCuentaAbierto = !this.menuCuentaAbierto;
  }

  alternarMega(): void {
    this.megaMenuAbierto = !this.megaMenuAbierto;
  }

  cerrarTodo(): void {
    this.menuAbierto = false;
    this.megaMenuAbierto = false;
    this.menuCuentaAbierto = false;
  }

  async cerrarSesion(): Promise<void> {
    const eraStaff = this.auth.isAdmin();
    const destino = this.auth.rutaTrasCerrarSesion(eraStaff);

    const resultado = await this.alerta.confirm({
      title: '¿Cerrar sesión?',
      message: eraStaff
        ? 'Saldrás de tu cuenta de personal.'
        : 'Volverás a la tienda como visitante.',
      confirmText: 'Sí, cerrar sesión',
    });
    if (!resultado.isConfirmed) return;

    this.auth.logout();
    this.cart.reiniciar();
    this.cuenta.limpiarFavoritos();
    this.autenticado = false;
    this.nombreUsuario = '';
    this.cerrarTodo();
    this.cdr.markForCheck();

    this.alerta.toast({ type: 'success', title: 'Sesión cerrada' });
    this.router.navigate([destino]);
  }

  private leerSesion(): void {
    if (typeof sessionStorage === 'undefined') return;
    this.autenticado = !!sessionStorage.getItem('token');
    this.nombreUsuario = sessionStorage.getItem('nombre') ?? '';
  }
}
