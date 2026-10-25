import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
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
import { EMPRESA_TIENDA, urlTelefono, urlWhatsapp } from '../../config/empresa-tienda.config';
import { BotonTemaComponent } from '../../../shared/ui/boton-tema.component';

@Component({
  selector: 'app-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, BotonTemaComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent implements OnInit, AfterViewInit, OnDestroy {

  /** Marca de la tienda (mismo origen que footer / contacto). */
  readonly empresa = EMPRESA_TIENDA;
  readonly telHref = urlTelefono();
  readonly waHref = urlWhatsapp('Hola, quisiera una asesoría para mi proyecto.');

  @ViewChild('campoBusqueda') private campoBusqueda?: ElementRef<HTMLInputElement>;
  @ViewChild('cabecera') private cabecera?: ElementRef<HTMLElement>;

  private readonly cart = inject(CartService);
  private readonly catalogo = inject(CatalogoService);
  private readonly cuenta = inject(CuentaTiendaService);
  private readonly alerta = inject(AlertService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zona = inject(NgZone);

  private readonly destruir$ = new Subject<void>();
  private observadorAlto?: ResizeObserver;
  private ultimoScroll = 0;
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
  /** La barra se esconde al bajar por la página y vuelve al subir (solo presentación). */
  oculto = false;
  /** El campo de búsqueda tiene el foco: la barra no se esconde y se muestran atajos. */
  buscadorActivo = false;
  /** La última búsqueda terminó sin coincidencias (para el aviso del desplegable). */
  sinResultados = false;

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
        this.sinResultados = resultados.length === 0;
        this.buscando = false;
        this.cdr.markForCheck();
      });

    this.cart.cargar().pipe(takeUntil(this.destruir$)).subscribe();
    if (this.autenticado) this.cuenta.sincronizarFavoritos().pipe(takeUntil(this.destruir$)).subscribe();
  }

  ngAfterViewInit(): void {
    // Publica el alto real de la barra fija: los avisos (toasts) y los filtros fijos
    // del catálogo se colocan debajo de ella (tokens.css: --t-cabecera-alto).
    const el = this.cabecera?.nativeElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    this.zona.runOutsideAngular(() => {
      this.observadorAlto = new ResizeObserver(() => {
        document.documentElement.style.setProperty('--t-cabecera-alto', `${Math.round(el.getBoundingClientRect().height)}px`);
      });
      this.observadorAlto.observe(el);
    });
  }

  ngOnDestroy(): void {
    this.observadorAlto?.disconnect();
    this.destruir$.next();
    this.destruir$.complete();
  }

  @HostListener('window:scroll')
  alDesplazar(): void {
    const y = window.scrollY;
    const siguiente = y > 24;
    // Baja de la página → se esconde; sube → vuelve. Nunca con un panel abierto o escribiendo.
    const bloqueada = this.menuAbierto || this.menuCuentaAbierto || this.megaMenuAbierto || this.buscadorActivo;
    const bajando = y > this.ultimoScroll + 6;
    const subiendo = y < this.ultimoScroll - 6;
    let oculto = this.oculto;
    if (bloqueada || y < 240 || subiendo) oculto = false;
    else if (bajando) oculto = true;
    if (bajando || subiendo) this.ultimoScroll = y;
    if (siguiente === this.compacto && oculto === this.oculto) return;
    this.compacto = siguiente;
    this.oculto = oculto;
    this.cdr.markForCheck();
  }

  /** «/» salta al buscador (como en las tiendas y documentaciones modernas). */
  @HostListener('document:keydown', ['$event'])
  alTeclear(evento: KeyboardEvent): void {
    if (evento.key !== '/' || evento.ctrlKey || evento.metaKey || evento.altKey) return;
    const destino = evento.target as HTMLElement | null;
    if (destino && (destino.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName))) return;
    evento.preventDefault();
    this.campoBusqueda?.nativeElement.focus();
  }

  alEnfocarBuscador(): void {
    this.buscadorActivo = true;
    this.oculto = false;
    // El buscador manda: los menús de categorías y de cuenta se cierran para no taparle las sugerencias.
    this.megaMenuAbierto = false;
    this.menuCuentaAbierto = false;
    this.cdr.markForCheck();
  }

  alDesenfocarBuscador(): void {
    this.buscadorActivo = false;
    this.cdr.markForCheck();
  }

  /** Cualquier foco dentro de la barra (teclado) la hace visible. */
  alEnfocarCabecera(): void {
    if (!this.oculto) return;
    this.oculto = false;
    this.cdr.markForCheck();
  }

  @HostListener('document:click', ['$event'])
  alClicFuera(evento: MouseEvent): void {
    const objetivo = evento.target as HTMLElement;
    let cambio = false;
    if (!objetivo.closest('.buscador') && (this.sugerencias.length || this.sinResultados)) {
      this.sugerencias = [];
      this.sinResultados = false;
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
      this.sinResultados = false;
      this.buscando = false;
      this.cdr.markForCheck();
      return;
    }

    this.buscando = true;
    this.sinResultados = false;
    this.cdr.markForCheck();
    this.termino$.next(texto);
  }

  buscar(): void {
    const texto = this.termino.trim();
    if (!texto) return;

    this.sugerencias = [];
    this.sinResultados = false;
    this.menuAbierto = false;
    this.router.navigate(['/store/catalogo'], { queryParams: { q: texto } });
  }

  irAProducto(producto: ProductoTienda): void {
    this.sugerencias = [];
    this.sinResultados = false;
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
