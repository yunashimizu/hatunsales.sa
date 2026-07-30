import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { VisorImagenComponent } from '../../../../shared/components/visor-imagen/visor-imagen.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { urlMedia } from '../../../../shared/utils/media-url.util';
import { mensajeDeError } from '../../../service/api-base.service';
import { ProductoAdminService, ProductoFormulario } from '../../../service/producto-admin.service';
import { ProductoImagenService } from '../../../service/producto-imagen.service';
import {
  ImagenProducto, OpcionCategoria, OpcionMarca, ProductoAdmin,
} from '../../../models/admin.models';

const FORMULARIO_VACIO: ProductoFormulario = {
  nombre: '',
  descripcion: '',
  descripcion_corta: '',
  codigo_barras: '',
  sku: '',
  precio_compra: 0,
  precio_venta: 0,
  descuento: 0,
  unidad_medida: 'NIU',
  id_categoria: undefined,
  id_marca: undefined,
  estado: true,
  destacado: false,
  stock: 0,
};

const UNIDADES = ['NIU', 'ZZ', 'KGM', 'MTR', 'LTR', 'GLL', 'BX', 'PK', 'SET'];

@Component({
  selector: 'app-productos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, VisorImagenComponent],
  templateUrl: './productos.component.html',
  styleUrl: './productos.component.css',
})
export class ProductosComponent implements OnInit, OnDestroy {

  productos: ProductoAdmin[] = [];
  categorias: OpcionCategoria[] = [];
  marcas: OpcionMarca[] = [];
  cargando = false;
  /** URL abierta en el visor moderado (null = cerrado). */
  vistaImagen: string | null = null;

  filtro = '';
  filtroCategoria: number | '' = '';
  filtroEstado: '' | 'activos' | 'inactivos' | 'sin_stock' | 'sin_imagen' = '';

  panelAbierto = false;
  editando: ProductoAdmin | null = null;
  formulario: ProductoFormulario = { ...FORMULARIO_VACIO };
  guardando = false;

  imagenes: ImagenProducto[] = [];
  cargandoImagenes = false;
  subiendo = false;
  zonaActiva = false;
  indiceArrastrado: number | null = null;

  /** Fila que acaba de guardarse: se resalta unos segundos para ubicarla. */
  idDestacado: number | null = null;

  readonly unidades = UNIDADES;
  private readonly destruir$ = new Subject<void>();
  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private readonly service: ProductoAdminService,
    private readonly imagenService: ProductoImagenService,
    private readonly alerta: AlertService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.cargarCatalogos();
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  // ── Datos ────────────────────────────────────────────────────

  cargar(): void {
    this.cargando = true;
    this.cdr.markForCheck();

    this.service.listar().pipe(takeUntil(this.destruir$)).subscribe({
      next: (productos) => {
        this.cargando = false;
        this.productos = productos;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.cargando = false;
        this.cdr.markForCheck();
        this.alerta.error({
          title: 'No se pudieron cargar los productos',
          message: mensajeDeError(error),
        });
      },
    });
  }

  private cargarCatalogos(): void {
    this.service.categorias().pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (lista) => {
          this.categorias = lista;
          this.cdr.markForCheck();
        },
        error: () => {
          this.categorias = [];
          this.cdr.markForCheck();
        },
      });

    this.cargarMarcas();
  }

  /** Recarga marcas activas; si el producto tiene una inactiva, la conserva en el select. */
  private cargarMarcas(marcaActual?: { id_marca?: number; nombre?: string }): void {
    this.service.marcas().pipe(takeUntil(this.destruir$)).subscribe({
      next: (lista) => {
        this.marcas = [...lista];
        const id = marcaActual?.id_marca ? Number(marcaActual.id_marca) : 0;
        if (id && !this.marcas.some((m) => Number(m.id_marca) === id)) {
          this.marcas = [
            ...this.marcas,
            {
              id_marca: id,
              nombre: `${marcaActual?.nombre?.trim() || 'Marca'} (inactiva)`,
            },
          ];
        }
        this.cdr.markForCheck();
      },
      error: () => {
        if (!this.marcas.length) this.marcas = [];
        this.cdr.markForCheck();
      },
    });
  }

  get productosFiltrados(): ProductoAdmin[] {
    const texto = this.filtro.trim().toLowerCase();

    return this.productos.filter((p) => {
      if (texto) {
        const buscable = `${p.nombre} ${p.sku} ${p.codigo_barras} ${p.categoria} ${p.marca}`.toLowerCase();
        if (!buscable.includes(texto)) return false;
      }

      if (this.filtroCategoria !== '' && p.id_categoria !== Number(this.filtroCategoria)) return false;

      switch (this.filtroEstado) {
        case 'activos': return p.estado;
        case 'inactivos': return !p.estado;
        case 'sin_stock': return Number(p.stock_total) <= 0;
        case 'sin_imagen': return Number(p.total_imagenes) === 0;
        default: return true;
      }
    });
  }

  get totalSinImagen(): number {
    return this.productos.filter((p) => Number(p.total_imagenes) === 0).length;
  }

  get totalSinStock(): number {
    return this.productos.filter((p) => Number(p.stock_total) <= 0).length;
  }

  // ── Formulario ───────────────────────────────────────────────

  abrirNuevo(): void {
    this.editando = null;
    this.formulario = { ...FORMULARIO_VACIO };
    this.imagenes = [];
    this.panelAbierto = true;
    this.cargarMarcas();
  }

  abrirEdicion(producto: ProductoAdmin): void {
    this.editando = producto;
    this.formulario = {
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      descripcion_corta: producto.descripcion_corta,
      codigo_barras: producto.codigo_barras,
      sku: producto.sku,
      precio_compra: Number(producto.precio_compra),
      precio_venta: Number(producto.precio_venta),
      descuento: Number(producto.descuento),
      unidad_medida: producto.unidad_medida || 'NIU',
      id_categoria: producto.id_categoria,
      id_marca: producto.id_marca,
      estado: producto.estado,
      destacado: producto.destacado,
    };
    this.panelAbierto = true;
    this.cargarMarcas({ id_marca: producto.id_marca, nombre: producto.marca });
    this.cargarImagenes(producto.id_producto);
  }

  cerrarPanel(): void {
    if (this.guardando || this.subiendo) return;
    this.panelAbierto = false;
    this.editando = null;
    this.imagenes = [];
  }

  guardar(): void {
    const nombre = this.formulario.nombre?.trim();
    if (!nombre) {
      this.alerta.toast({ type: 'warning', title: 'El nombre es obligatorio' });
      return;
    }

    if (Number(this.formulario.precio_venta) <= 0) {
      this.alerta.toast({ type: 'warning', title: 'El precio de venta debe ser mayor a cero' });
      return;
    }

    const datos: ProductoFormulario = {
      ...this.formulario,
      nombre,
      codigo_barras: this.formulario.codigo_barras?.trim() || undefined,
      sku: this.formulario.sku?.trim() || undefined,
      precio_compra: Number(this.formulario.precio_compra) || 0,
      precio_venta: Number(this.formulario.precio_venta) || 0,
      descuento: Number(this.formulario.descuento) || 0,
      id_categoria: this.formulario.id_categoria ? Number(this.formulario.id_categoria) : undefined,
      id_marca: this.formulario.id_marca ? Number(this.formulario.id_marca) : undefined,
    };

    // El stock solo se fija al crear; al editar no se toca inventario desde aquí.
    if (this.editando) {
      delete datos.stock;
    } else {
      datos.stock = Math.max(0, Math.trunc(Number(this.formulario.stock) || 0));
    }

    this.guardando = true;
    this.cdr.markForCheck();
    const enCurso = this.editando
      ? this.service.actualizar(this.editando.id_producto, datos)
      : this.service.crear(datos);

    enCurso.pipe(takeUntil(this.destruir$)).subscribe({
      next: (producto) => {
        this.guardando = false;
        const esNuevo = !this.editando;

        this.reflejarEnLista(producto);
        this.destacar(producto.id_producto);
        this.cdr.markForCheck();
        this.alerta.toast({
          type: 'success',
          title: esNuevo ? 'Producto creado' : 'Cambios guardados',
        });

        // Tras crearlo se queda abierto en modo edición para poder subir las
        // fotos de inmediato, que es lo que sigue casi siempre.
        if (esNuevo) {
          this.editando = producto;
          this.cargarImagenes(producto.id_producto);
        } else {
          this.cerrarPanel();
        }
      },
      error: (error) => {
        this.guardando = false;
        this.cdr.markForCheck();
        this.alerta.error({ title: 'No se pudo guardar', message: mensajeDeError(error) });
      },
    });
  }

  async eliminar(producto: ProductoAdmin): Promise<void> {
    const respuesta = await this.alerta.confirm({
      title: `¿Eliminar ${producto.nombre}?`,
      message: 'Se quitará del catálogo. Si ya tiene ventas registradas, conviene desactivarlo en lugar de borrarlo.',
      confirmText: 'Sí, eliminar',
    });

    if (!respuesta.isConfirmed) return;

    this.service.eliminar(producto.id_producto).pipe(takeUntil(this.destruir$)).subscribe({
      next: () => {
        this.productos = this.productos.filter((p) => p.id_producto !== producto.id_producto);
        this.cdr.markForCheck();
        this.alerta.toast({ type: 'success', title: 'Producto eliminado' });
      },
      error: (error) => {
        this.cdr.markForCheck();
        this.alerta.error({
          title: 'No se pudo eliminar',
          message: mensajeDeError(error, 'Puede que tenga ventas o inventario asociado. Desactívelo en su lugar.'),
        });
      },
    });
  }

  alternarEstado(producto: ProductoAdmin): void {
    this.service
      .actualizar(producto.id_producto, { nombre: producto.nombre, estado: !producto.estado })
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (actualizado) => {
          this.reflejarEnLista(actualizado);
          this.cdr.markForCheck();
          this.alerta.toast({
            type: 'success',
            title: actualizado.estado ? 'Producto activado' : 'Producto desactivado',
          });
        },
        error: (error) => {
          this.cdr.markForCheck();
          this.alerta.error({ message: mensajeDeError(error) });
        },
      });
  }

  // ── Imágenes ─────────────────────────────────────────────────

  private cargarImagenes(idProducto: number): void {
    this.cargandoImagenes = true;
    this.cdr.markForCheck();

    this.imagenService.listar(idProducto).pipe(takeUntil(this.destruir$)).subscribe({
      next: (imagenes) => {
        this.cargandoImagenes = false;
        this.imagenes = imagenes;
        this.cdr.markForCheck();
      },
      error: () => {
        this.cargandoImagenes = false;
        this.imagenes = [];
        this.cdr.markForCheck();
      },
    });
  }

  alSeleccionarArchivos(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    this.subirArchivos(Array.from(entrada.files ?? []));
    entrada.value = '';
  }

  alArrastrarSobreZona(evento: DragEvent, activa: boolean): void {
    evento.preventDefault();
    this.zonaActiva = activa;
  }

  alSoltarArchivos(evento: DragEvent): void {
    evento.preventDefault();
    this.zonaActiva = false;
    this.subirArchivos(Array.from(evento.dataTransfer?.files ?? []));
  }

  private subirArchivos(archivos: File[]): void {
    if (!this.editando || !archivos.length) return;

    const imagenes = archivos.filter((archivo) => archivo.type.startsWith('image/'));
    if (imagenes.length !== archivos.length) {
      this.alerta.toast({ type: 'warning', title: 'Se omitieron archivos que no son imágenes' });
    }
    if (!imagenes.length) return;

    this.subiendo = true;
    this.cdr.markForCheck();

    this.imagenService.subir(this.editando.id_producto, imagenes)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (galeria) => {
          this.subiendo = false;
          this.imagenes = galeria;
          this.sincronizarImagenEnLista();
          this.cdr.markForCheck();
          this.alerta.toast({
            type: 'success',
            title: `${imagenes.length} ${imagenes.length === 1 ? 'imagen subida' : 'imágenes subidas'}`,
          });
        },
        error: (error) => {
          this.subiendo = false;
          this.cdr.markForCheck();
          this.alerta.error({ title: 'No se pudieron subir', message: mensajeDeError(error) });
        },
      });
  }

  marcarPrincipal(imagen: ImagenProducto): void {
    if (!this.editando || imagen.is_primary) return;

    this.imagenService.marcarPrincipal(this.editando.id_producto, imagen.id_imagen)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (galeria) => {
          this.imagenes = galeria;
          this.sincronizarImagenEnLista();
          this.cdr.markForCheck();
          this.alerta.toast({ type: 'success', title: 'Imagen principal actualizada' });
        },
        error: (error) => {
          this.cdr.markForCheck();
          this.alerta.error({ message: mensajeDeError(error) });
        },
      });
  }

  async eliminarImagen(imagen: ImagenProducto): Promise<void> {
    if (!this.editando) return;

    const respuesta = await this.alerta.confirm({
      title: '¿Eliminar la imagen?',
      message: 'Se borra también del almacenamiento.',
      confirmText: 'Sí, eliminar',
    });
    if (!respuesta.isConfirmed) return;

    this.imagenService.eliminar(this.editando.id_producto, imagen.id_imagen)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (galeria) => {
          this.imagenes = galeria;
          this.sincronizarImagenEnLista();
          this.cdr.markForCheck();
          this.alerta.toast({ type: 'success', title: 'Imagen eliminada' });
        },
        error: (error) => {
          this.cdr.markForCheck();
          this.alerta.error({ message: mensajeDeError(error) });
        },
      });
  }

  // Reordenamiento por arrastre: el nuevo orden se envía al soltar.
  alIniciarArrastre(indice: number): void {
    this.indiceArrastrado = indice;
  }

  alArrastrarSobre(evento: DragEvent): void {
    evento.preventDefault();
  }

  alSoltarEn(indice: number): void {
    if (this.indiceArrastrado === null || this.indiceArrastrado === indice) {
      this.indiceArrastrado = null;
      return;
    }

    const reordenadas = [...this.imagenes];
    const [movida] = reordenadas.splice(this.indiceArrastrado, 1);
    reordenadas.splice(indice, 0, movida);

    this.imagenes = reordenadas;
    this.indiceArrastrado = null;

    if (!this.editando) return;

    this.imagenService
      .reordenar(this.editando.id_producto, reordenadas.map((i) => i.id_imagen))
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (galeria) => {
          this.imagenes = galeria;
          this.sincronizarImagenEnLista();
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.cdr.markForCheck();
          this.alerta.error({ message: mensajeDeError(error) });
          this.cargarImagenes(this.editando!.id_producto);
        },
      });
  }

  // ── Auxiliares ───────────────────────────────────────────────

  /** Inserta o reemplaza el producto en la tabla sin recargar todo el listado. */
  private reflejarEnLista(producto: ProductoAdmin): void {
    const indice = this.productos.findIndex((p) => p.id_producto === producto.id_producto);
    if (indice >= 0) {
      this.productos[indice] = { ...this.productos[indice], ...producto };
      this.productos = [...this.productos];
    } else {
      this.productos = [producto, ...this.productos];
    }
  }

  private sincronizarImagenEnLista(): void {
    if (!this.editando) return;

    const principal = this.imagenes.find((i) => i.is_primary) ?? this.imagenes[0];
    this.reflejarEnLista({
      ...this.editando,
      imagen_url: principal?.url ?? '',
      thumb_url: principal?.thumb_url ?? principal?.url ?? '',
      total_imagenes: this.imagenes.length,
    });
  }

  private destacar(idProducto: number): void {
    this.idDestacado = idProducto;
    setTimeout(() => {
      this.idDestacado = null;
      this.cdr.markForCheck();
    }, 2600);
  }

  precioFinal(producto: ProductoAdmin): number {
    const descuento = Number(producto.descuento) || 0;
    return Math.max(0, Number(producto.precio_venta) - descuento);
  }

  /** URL lista para el <img>: Cloudinary o /archivos del backend. */
  urlDe(ruta?: string | null): string {
    return urlMedia(ruta);
  }

  abrirVistaImagen(ruta?: string | null, evento?: Event): void {
    evento?.stopPropagation();
    const url = this.urlDe(ruta);
    if (url) this.vistaImagen = url;
  }

  cerrarVistaImagen(): void {
    this.vistaImagen = null;
  }

  identificarProducto(_indice: number, producto: ProductoAdmin): number {
    return producto.id_producto;
  }

  identificarImagen(_indice: number, imagen: ImagenProducto): number {
    return imagen.id_imagen;
  }
}
