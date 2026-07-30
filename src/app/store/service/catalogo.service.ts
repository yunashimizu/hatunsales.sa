import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { urlConstants } from '../../constants/urlConstants';
import { urlMedia } from '../../shared/utils/media-url.util';
import {
  BannerTienda,
  CategoriaTienda,
  ConsultaCatalogo,
  FiltrosDisponibles,
  MarcaTienda,
  Pagina,
  ProductoDetalle,
  ProductoTienda,
  ResenaTienda,
} from '../models/tienda.models';

@Injectable({ providedIn: 'root' })
export class CatalogoService {

  private readonly http = inject(HttpClient);

  /** Los catálogos cambian poco, así que se comparten entre componentes. */
  private categoriasCache?: Observable<CategoriaTienda[]>;
  private marcasCache?: Observable<MarcaTienda[]>;

  /** Preview al navegar desde una card → detalle se pinta al instante. */
  private previewProducto: ProductoTienda | null = null;

  /** Tras CRUD en admin: limpia caché para que la tienda vea datos frescos. */
  invalidarCatalogos(): void {
    this.categoriasCache = undefined;
    this.marcasCache = undefined;
  }

  guardarPreview(producto: ProductoTienda): void {
    this.previewProducto = producto;
  }

  tomarPreview(idProducto: number): ProductoTienda | null {
    if (this.previewProducto?.id_producto === idProducto) {
      const p = this.previewProducto;
      this.previewProducto = null;
      return p;
    }
    return null;
  }

  listarProductos(consulta: ConsultaCatalogo = {}): Observable<Pagina<ProductoTienda>> {
    return this.http
      .get<Pagina<ProductoTienda>>(urlConstants.tienda.productos, { params: this.aParams(consulta) })
      .pipe(catchError(() => of(this.paginaVacia(consulta))));
  }

  destacados(limite = 8): Observable<ProductoTienda[]> {
    return this.http
      .get<ProductoTienda[]>(urlConstants.tienda.destacados, { params: { limite } })
      .pipe(catchError(() => of([])));
  }

  ofertas(limite = 8): Observable<ProductoTienda[]> {
    return this.http
      .get<ProductoTienda[]>(urlConstants.tienda.ofertas, { params: { limite } })
      .pipe(catchError(() => of([])));
  }

  buscar(q: string, limite = 8): Observable<ProductoTienda[]> {
    if (!q || q.trim().length < 2) return of([]);
    return this.http
      .get<ProductoTienda[]>(urlConstants.tienda.buscar, { params: { q: q.trim(), limite } })
      .pipe(catchError(() => of([])));
  }

  detalle(id: number): Observable<ProductoDetalle> {
    return this.http.get<ProductoDetalle>(urlConstants.tienda.productoById(id));
  }

  detallePorSlug(slug: string): Observable<ProductoDetalle> {
    return this.http.get<ProductoDetalle>(urlConstants.tienda.productoBySlug(slug));
  }

  resenas(idProducto: number): Observable<ResenaTienda[]> {
    return this.http
      .get<ResenaTienda[]>(urlConstants.tienda.productoResenas(idProducto))
      .pipe(catchError(() => of([])));
  }

  categorias(): Observable<CategoriaTienda[]> {
    this.categoriasCache ??= this.http
      .get<CategoriaTienda[]>(urlConstants.tienda.categorias)
      .pipe(catchError(() => of([])), shareReplay(1));
    return this.categoriasCache;
  }

  marcas(): Observable<MarcaTienda[]> {
    this.marcasCache ??= this.http
      .get<MarcaTienda[]>(urlConstants.tienda.marcas)
      .pipe(catchError(() => of([])), shareReplay(1));
    return this.marcasCache;
  }

  filtros(idCategoria?: number): Observable<FiltrosDisponibles> {
    let params = new HttpParams();
    if (idCategoria) params = params.set('id_categoria', idCategoria);

    return this.http.get<FiltrosDisponibles>(urlConstants.tienda.filtros, { params }).pipe(
      catchError(() =>
        of<FiltrosDisponibles>({ categorias: [], marcas: [], precio_min: 0, precio_max: 0, atributos: [] }),
      ),
    );
  }

  banners(): Observable<BannerTienda[]> {
    return this.http.get<BannerTienda[]>(urlConstants.tienda.banners).pipe(catchError(() => of([])));
  }

  /**
   * Cloudinary (https) o rutas relativas del backend (`/archivos/12`).
   */
  urlImagen(ruta: string | null | undefined): string {
    return urlMedia(ruta, 'assets/img/producto-sin-imagen.svg');
  }

  private aParams(consulta: ConsultaCatalogo): HttpParams {
    let params = new HttpParams();

    const agregar = (clave: string, valor: unknown) => {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    };

    agregar('q', consulta.q);
    agregar('id_categoria', consulta.id_categoria);
    agregar('id_marca', consulta.id_marca);
    agregar('precio_min', consulta.precio_min);
    agregar('precio_max', consulta.precio_max);
    agregar('orden', consulta.orden);
    agregar('pagina', consulta.pagina);
    agregar('limite', consulta.limite);
    agregar('solo_stock', consulta.solo_stock);
    agregar('solo_oferta', consulta.solo_oferta);
    agregar('solo_destacado', consulta.solo_destacado);

    return params;
  }

  private paginaVacia(consulta: ConsultaCatalogo): Pagina<ProductoTienda> {
    return {
      items: [],
      total: 0,
      pagina: Number(consulta.pagina) || 1,
      limite: Number(consulta.limite) || 24,
      total_paginas: 0,
    };
  }
}
