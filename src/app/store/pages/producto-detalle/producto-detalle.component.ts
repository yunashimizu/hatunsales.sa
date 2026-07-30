import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, switchMap, takeUntil } from 'rxjs';
import { EstrellasComponent } from '../../components/estrellas/estrellas.component';
import { ProductoCardComponent } from '../../components/producto-card/producto-card.component';
import { CatalogoService } from '../../service/catalogo.service';
import { CuentaTiendaService } from '../../service/cuenta.service';
import { AccionesTiendaService } from '../../service/acciones.service';
import { AlertService } from '../../../shared/services/alert.service';
import { ImagenProducto, ProductoDetalle, ProductoTienda, ResenaTienda } from '../../models/tienda.models';

@Component({
  selector: 'app-producto-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, EstrellasComponent, ProductoCardComponent],
  templateUrl: './producto-detalle.component.html',
  styleUrl: './producto-detalle.component.css',
})
export class ProductoDetalleComponent implements OnInit, OnDestroy {

  private readonly catalogo = inject(CatalogoService);
  private readonly cuenta = inject(CuentaTiendaService);
  private readonly acciones = inject(AccionesTiendaService);
  private readonly alerta = inject(AlertService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly destruir$ = new Subject<void>();

  producto?: ProductoDetalle;
  resenas: ResenaTienda[] = [];
  imagenActiva?: ImagenProducto;
  cantidad = 1;
  pestana: 'descripcion' | 'especificaciones' | 'sucursales' | 'opiniones' = 'descripcion';
  cargando = true;
  noEncontrado = false;
  zoom = false;

  nuevaResena = { calificacion: 5, titulo: '', comentario: '' };
  enviandoResena = false;

  private favoritos = new Set<number>();

  ngOnInit(): void {
    this.ruta.params
      .pipe(
        takeUntil(this.destruir$),
        switchMap((params) => {
          const id = Number(params['id']);
          this.prepararVista(id);
          this.cargarResenas(id);
          return this.catalogo.detalle(id);
        }),
      )
      .subscribe({
        next: (detalle) => {
          this.producto = detalle;
          this.imagenActiva = detalle.imagenes.find((i) => i.is_primary) ?? detalle.imagenes[0];
          this.cargando = false;
        },
        error: () => {
          this.cargando = false;
          if (!this.producto) this.noEncontrado = true;
        },
      });

    this.cuenta.favoritos$.pipe(takeUntil(this.destruir$)).subscribe((ids) => (this.favoritos = ids));
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  get autenticado(): boolean {
    return this.acciones.autenticado;
  }

  get esFavorito(): boolean {
    return !!this.producto && this.favoritos.has(this.producto.id_producto);
  }

  get imagenPrincipal(): string {
    return this.catalogo.urlImagen(this.imagenActiva?.url ?? this.producto?.imagen);
  }

  get ahorro(): number {
    if (!this.producto) return 0;
    return Math.max(0, this.producto.precio - this.producto.precio_final);
  }

  get stockTotal(): number {
    return this.producto?.stock ?? 0;
  }

  get maximo(): number {
    return Math.max(1, this.stockTotal);
  }

  imagenUrl(imagen: ImagenProducto): string {
    return this.catalogo.urlImagen(imagen.thumb_url || imagen.url);
  }

  elegirImagen(imagen: ImagenProducto): void {
    this.imagenActiva = imagen;
    this.zoom = false;
  }

  alternarZoom(): void {
    this.zoom = !this.zoom;
  }

  cambiarCantidad(delta: number): void {
    const nueva = this.cantidad + delta;
    if (nueva < 1 || nueva > this.maximo) return;
    this.cantidad = nueva;
  }

  agregarAlCarrito(): void {
    if (!this.producto || this.stockTotal <= 0) return;
    void this.acciones.agregarAlCarrito(this.producto, this.cantidad);
  }

  alternarFavorito(): void {
    if (!this.producto) return;
    void this.acciones.alternarFavorito(this.producto);
  }

  agregarRelacionado(producto: ProductoTienda): void {
    void this.acciones.agregarAlCarrito(producto);
  }

  favoritoRelacionado(producto: ProductoTienda): boolean {
    return this.favoritos.has(producto.id_producto);
  }

  alternarFavoritoRelacionado(producto: ProductoTienda): void {
    void this.acciones.alternarFavorito(producto);
  }

  compartir(): void {
    const url = window.location.href;

    if (navigator.share) {
      void navigator.share({ title: this.producto?.nombre, url });
      return;
    }

    void navigator.clipboard.writeText(url);
    this.alerta.toast({ type: 'success', title: 'Enlace copiado' });
  }

  enviarResena(): void {
    if (!this.producto) return;

    this.enviandoResena = true;
    this.cuenta
      .guardarResena(
        this.producto.id_producto,
        this.nuevaResena.calificacion,
        this.nuevaResena.titulo || undefined,
        this.nuevaResena.comentario || undefined,
      )
      .subscribe({
        next: () => {
          this.enviandoResena = false;
          this.nuevaResena = { calificacion: 5, titulo: '', comentario: '' };
          this.alerta.toast({ type: 'success', title: 'Gracias por tu opinión' });
          this.cargarResenas(this.producto!.id_producto);
        },
        error: (err) => {
          this.enviandoResena = false;
          this.alerta.error({
            title: 'No pudimos guardar tu reseña',
            message: err?.error?.message ?? 'Inténtalo nuevamente en unos minutos.',
          });
        },
      });
  }

  imagenAlternativa(evento: Event): void {
    (evento.target as HTMLImageElement).src = 'assets/img/producto-sin-imagen.svg';
  }

  // --------------------------------------------------------------- privados

  /** Preview desde card (si hay) + estado inicial antes de hidratar con el API. */
  private prepararVista(id: number): void {
    this.noEncontrado = false;
    this.cantidad = 1;
    this.pestana = 'descripcion';

    const preview = this.catalogo.tomarPreview(id);
    if (preview) {
      this.producto = {
        ...preview,
        imagenes: preview.imagen
          ? [{ id_imagen: 0, url: preview.imagen, is_primary: true }]
          : [],
        especificaciones: [],
        stock_sucursales: [],
        relacionados: [],
      };
      this.imagenActiva = this.producto.imagenes[0];
      this.cargando = false;
    } else {
      this.cargando = true;
      this.producto = undefined;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  private cargarResenas(id: number): void {
    this.catalogo.resenas(id).pipe(takeUntil(this.destruir$)).subscribe((r) => (this.resenas = r));
  }
}
