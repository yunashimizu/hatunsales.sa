import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { HeroBannerComponent } from '../../components/hero-banner/hero-banner.component';
import { CategoriasGridComponent } from '../../components/categorias-grid/categorias-grid.component';
import { ProductoCardComponent } from '../../components/producto-card/producto-card.component';
import { CatalogoService } from '../../service/catalogo.service';
import { AccionesTiendaService } from '../../service/acciones.service';
import { CuentaTiendaService } from '../../service/cuenta.service';
import { BannerTienda, CategoriaTienda, MarcaTienda, ProductoTienda } from '../../models/tienda.models';

@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, HeroBannerComponent, CategoriasGridComponent, ProductoCardComponent],
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
  destacados: ProductoTienda[] = [];
  ofertas: ProductoTienda[] = [];
  nuevos: ProductoTienda[] = [];

  cargando = true;
  readonly esqueletos = Array.from({ length: 8 }, (_, i) => i);
  private favoritos = new Set<number>();

  ngOnInit(): void {
    forkJoin({
      banners: this.catalogo.banners(),
      categorias: this.catalogo.categorias(),
      marcas: this.catalogo.marcas(),
      destacados: this.catalogo.destacados(8),
      ofertas: this.catalogo.ofertas(4),
      nuevos: this.catalogo.listarProductos({ orden: 'nuevo', limite: 4 }),
    })
      .pipe(takeUntil(this.destruir$))
      .subscribe((datos) => {
        this.banners = datos.banners;
        this.categorias = datos.categorias;
        this.marcas = datos.marcas.filter((m) => m.total_productos > 0).slice(0, 8);
        this.destacados = datos.destacados;
        this.ofertas = datos.ofertas;
        this.nuevos = datos.nuevos.items;
        this.cargando = false;
        this.cdr.markForCheck();
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
