import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FiltrosComponent } from '../../components/filtros/filtros.component';
import { ProductoCardComponent } from '../../components/producto-card/producto-card.component';
import { CatalogoService } from '../../service/catalogo.service';
import { AccionesTiendaService } from '../../service/acciones.service';
import { CuentaTiendaService } from '../../service/cuenta.service';
import { ConsultaCatalogo, FiltrosDisponibles, ProductoTienda } from '../../models/tienda.models';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, FiltrosComponent, ProductoCardComponent],
  templateUrl: './catalogo.component.html',
  styleUrl: './catalogo.component.css',
})
export class CatalogoComponent implements OnInit, OnDestroy {

  private readonly catalogo = inject(CatalogoService);
  private readonly acciones = inject(AccionesTiendaService);
  private readonly cuenta = inject(CuentaTiendaService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destruir$ = new Subject<void>();

  productos: ProductoTienda[] = [];
  disponibles: FiltrosDisponibles = { categorias: [], marcas: [], precio_min: 0, precio_max: 0, atributos: [] };
  consulta: ConsultaCatalogo = { pagina: 1, limite: 12, orden: 'relevancia' };

  total = 0;
  totalPaginas = 1;
  cargando = true;
  filtrosAbiertos = false;
  vista: 'grilla' | 'lista' = 'grilla';

  private favoritos = new Set<number>();

  readonly ordenamientos = [
    { valor: 'relevancia',  etiqueta: 'Más relevantes' },
    { valor: 'nuevo',       etiqueta: 'Más recientes' },
    { valor: 'precio_asc',  etiqueta: 'Menor precio' },
    { valor: 'precio_desc', etiqueta: 'Mayor precio' },
    { valor: 'rating',      etiqueta: 'Mejor calificados' },
    { valor: 'nombre',      etiqueta: 'Nombre (A-Z)' },
  ];

  ngOnInit(): void {
    // Datos frescos al entrar (admin pudo crear marcas/categorías).
    this.catalogo.invalidarCatalogos();

    this.ruta.queryParams.pipe(takeUntil(this.destruir$)).subscribe((params) => {
      this.consulta = this.desdeParams(params);
      this.cargarProductos();
      this.catalogo.filtros(this.consulta.id_categoria).pipe(takeUntil(this.destruir$)).subscribe((f) => {
        this.disponibles = f;
        this.cdr.markForCheck();
      });
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

  get rangoMostrado(): string {
    if (this.total === 0) return '0 productos';
    const limite = this.consulta.limite ?? 12;
    const desde = ((this.consulta.pagina ?? 1) - 1) * limite + 1;
    const hasta = Math.min(desde + limite - 1, this.total);
    return `${desde}–${hasta} de ${this.total} productos`;
  }

  get paginas(): number[] {
    const actual = this.consulta.pagina ?? 1;
    const inicio = Math.max(1, Math.min(actual - 2, this.totalPaginas - 4));
    const fin = Math.min(this.totalPaginas, inicio + 4);
    return Array.from({ length: fin - inicio + 1 }, (_, i) => inicio + i);
  }

  get tituloPagina(): string {
    if (this.consulta.q) return `Resultados para "${this.consulta.q}"`;
    if (this.consulta.solo_oferta) return 'Ofertas';

    const categoria = this.disponibles.categorias.find((c) => c.id_categoria === this.consulta.id_categoria);
    return categoria?.nombre ?? 'Catálogo completo';
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

  aplicarFiltros(consulta: ConsultaCatalogo): void {
    this.navegar({ ...consulta, pagina: 1 });
  }

  limpiarFiltros(): void {
    this.router.navigate(['/store/catalogo'], { queryParams: {} });
  }

  trackProducto(_i: number, p: ProductoTienda): number {
    return p.id_producto;
  }

  cambiarOrden(orden: string): void {
    this.navegar({ ...this.consulta, orden: orden as ConsultaCatalogo['orden'], pagina: 1 });
  }

  irAPagina(pagina: number): void {
    if (pagina < 1 || pagina > this.totalPaginas) return;
    this.navegar({ ...this.consulta, pagina });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  alternarFiltrosMovil(): void {
    this.filtrosAbiertos = !this.filtrosAbiertos;
  }

  get esqueletos(): number[] {
    return Array.from({ length: this.consulta.limite ?? 12 }, (_, i) => i);
  }

  // --------------------------------------------------------------- privados

  private cargarProductos(): void {
    this.cargando = true;
    this.cdr.markForCheck();

    this.catalogo
      .listarProductos(this.consulta)
      .pipe(takeUntil(this.destruir$))
      .subscribe((pagina) => {
        this.productos = pagina.items;
        this.total = pagina.total;
        this.totalPaginas = pagina.total_paginas;
        this.cargando = false;
        this.cdr.markForCheck();
      });
  }

  /** La URL es la fuente de verdad de los filtros: así se puede compartir y volver atrás. */
  private navegar(consulta: ConsultaCatalogo): void {
    const params: Params = {};

    if (consulta.q) params['q'] = consulta.q;
    if (consulta.id_categoria) params['categoria'] = consulta.id_categoria;
    if (consulta.id_marca) params['marca'] = consulta.id_marca;
    if (consulta.precio_min) params['min'] = consulta.precio_min;
    if (consulta.precio_max) params['max'] = consulta.precio_max;
    if (consulta.solo_stock) params['stock'] = 1;
    if (consulta.solo_oferta) params['oferta'] = 1;
    if (consulta.orden && consulta.orden !== 'relevancia') params['orden'] = consulta.orden;
    if (consulta.pagina && consulta.pagina > 1) params['pagina'] = consulta.pagina;

    const atributos = Object.entries(consulta.atributos ?? {});
    if (atributos.length > 0) {
      params['attr'] = atributos.map(([nombre, valor]) => `${nombre}:${valor}`).join(',');
    }

    this.router.navigate(['/store/catalogo'], { queryParams: params });
    this.filtrosAbiertos = false;
  }

  private desdeParams(params: Params): ConsultaCatalogo {
    const atributos: Record<string, string> = {};

    for (const par of String(params['attr'] ?? '').split(',')) {
      const [nombre, valor] = par.split(':');
      if (nombre && valor) atributos[nombre] = valor;
    }

    return {
      q: params['q'] || undefined,
      id_categoria: params['categoria'] ? Number(params['categoria']) : undefined,
      id_marca: params['marca'] ? Number(params['marca']) : undefined,
      precio_min: params['min'] ? Number(params['min']) : undefined,
      precio_max: params['max'] ? Number(params['max']) : undefined,
      solo_stock: params['stock'] === '1',
      solo_oferta: params['oferta'] === '1',
      atributos,
      orden: (params['orden'] as ConsultaCatalogo['orden']) ?? 'relevancia',
      pagina: params['pagina'] ? Number(params['pagina']) : 1,
      limite: 12,
    };
  }
}
