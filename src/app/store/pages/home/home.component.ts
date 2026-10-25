import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { HeroBannerComponent } from '../../components/hero-banner/hero-banner.component';
import { CategoriasGridComponent } from '../../components/categorias-grid/categorias-grid.component';
import { ProductoCardComponent } from '../../components/producto-card/producto-card.component';
import { CatalogoService } from '../../service/catalogo.service';
import { AccionesTiendaService } from '../../service/acciones.service';
import { CuentaTiendaService } from '../../service/cuenta.service';
import { BannerTienda, CategoriaTienda, MarcaTienda, ProductoTienda } from '../../models/tienda.models';
import { urlWhatsapp } from '../../config/empresa-tienda.config';
import { CountUpDirective } from '../../../shared/ui/count-up.directive';
import { MagneticDirective } from '../../../shared/ui/magnetic.directive';
import { RevealDirective } from '../../../shared/ui/reveal.directive';
import { SpotlightDirective } from '../../../shared/ui/spotlight.directive';

@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    HeroBannerComponent,
    CategoriasGridComponent,
    ProductoCardComponent,
    RevealDirective,
    CountUpDirective,
    MagneticDirective,
    SpotlightDirective,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit, OnDestroy {

  private readonly catalogo = inject(CatalogoService);
  private readonly acciones = inject(AccionesTiendaService);
  private readonly cuenta = inject(CuentaTiendaService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destruir$ = new Subject<void>();

  banners: BannerTienda[] = [];
  categorias: CategoriaTienda[] = [];
  marcas: MarcaTienda[] = [];
  /** Marcas con productos (la lista visible se recorta a 8). */
  marcasTotal = 0;

  /** Diapositiva por defecto cuando la tienda aún no tiene banners cargados. */
  readonly bannerRespaldo: BannerTienda[] = [
    {
      id_banner: 0,
      etiqueta: 'Nuevo catálogo en línea',
      titulo: 'Todo lo que necesitas para construir tus proyectos',
      subtitulo: 'Herramientas, materiales y equipos de las mejores marcas, con envío a todo el Perú.',
      cta_texto: 'Explorar catálogo',
      cta_url: '/store/catalogo',
    },
  ];
  readonly waCotizar = urlWhatsapp('Hola, quisiera cotizar un proyecto.');
  /** Graduación de la cinta métrica decorativa (cm). */
  readonly cinta = Array.from({ length: 16 }, (_, i) => i * 10);

  destacados: ProductoTienda[] = [];
  ofertas: ProductoTienda[] = [];
  nuevos: ProductoTienda[] = [];

  /** Hero y vacíos: se liberan al llegar banners (o al fallar). */
  cargandoHero = true;
  /** Skeletons de destacados + estado vacío de la página. */
  cargando = true;
  readonly esqueletos = Array.from({ length: 8 }, (_, i) => i);
  private favoritos = new Set<number>();

  ngOnInit(): void {
    // Carga por sección: la portada no espera a que terminen las 6 APIs.
    this.catalogo.banners().pipe(takeUntil(this.destruir$)).subscribe({
      next: (banners) => {
        this.banners = banners;
        this.cargandoHero = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.cargandoHero = false;
        this.cdr.markForCheck();
      },
    });

    this.catalogo.categorias().pipe(takeUntil(this.destruir$)).subscribe({
      next: (categorias) => {
        this.categorias = categorias;
        this.cdr.markForCheck();
      },
    });

    this.catalogo.marcas().pipe(takeUntil(this.destruir$)).subscribe({
      next: (marcas) => {
        const conProductos = marcas.filter((m) => m.total_productos > 0);
        this.marcasTotal = conProductos.length;
        this.marcas = conProductos.slice(0, 8);
        this.cdr.markForCheck();
      },
    });

    this.catalogo.destacados(8).pipe(takeUntil(this.destruir$)).subscribe({
      next: (destacados) => {
        this.destacados = destacados;
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.cargando = false;
        this.cdr.markForCheck();
      },
    });

    this.catalogo.ofertas(4).pipe(takeUntil(this.destruir$)).subscribe({
      next: (ofertas) => {
        this.ofertas = ofertas;
        this.cdr.markForCheck();
      },
    });

    this.catalogo.listarProductos({ orden: 'nuevo', limite: 4 }).pipe(takeUntil(this.destruir$)).subscribe({
      next: (pagina) => {
        this.nuevos = pagina.items;
        this.cdr.markForCheck();
      },
    });

    this.cuenta.favoritos$.pipe(takeUntil(this.destruir$)).subscribe((ids) => {
      this.favoritos = ids;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  /** Cifras de la franja de datos: salen de las mismas listas que ya carga la portada. */
  get totalProductos(): number {
    return this.categorias.reduce((suma, c) => suma + (Number(c.total_productos) || 0), 0);
  }

  get hayContenido(): boolean {
    return this.destacados.length > 0 || this.ofertas.length > 0 || this.nuevos.length > 0;
  }

  esFavorito(producto: ProductoTienda): boolean {
    return this.favoritos.has(producto.id_producto);
  }

  agregar(producto: ProductoTienda): void {
    void this.acciones.agregarAlCarrito(producto);
  }

  alternarFavorito(producto: ProductoTienda): void {
    void this.acciones.alternarFavorito(producto);
  }

  trackProducto(_i: number, p: ProductoTienda): number {
    return p.id_producto;
  }
}
