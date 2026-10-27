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
import { Subject, Subscription, catchError, concatMap, finalize, from, of, takeUntil, tap } from 'rxjs';

import { VisorImagenComponent } from '../../../../shared/components/visor-imagen/visor-imagen.component';
import { CountUpDirective } from '../../../../shared/ui/count-up.directive';
import { RevealDirective } from '../../../../shared/ui/reveal.directive';
import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { prepararImagen, partirEnLotes } from '../../../../shared/utils/imagen-cliente.util';
import { urlMedia } from '../../../../shared/utils/media-url.util';
import { mensajeDeError } from '../../../service/api-base.service';
import { ProductoAdminService, ProductoFormulario } from '../../../service/producto-admin.service';
import { ProductoImagenService } from '../../../service/producto-imagen.service';
import { InventarioAdminService } from '../../../service/inventario-admin.service';
import { PuntoVentaService } from '../../../service/punto-venta.service';
import { UnidadMedidaService } from '../../../service/unidad-medida.service';
import { SelectorUnidadComponent } from '../../../../shared/components/selector-unidad/selector-unidad.component';
import { UnidadMedidaPipe } from '../../../../shared/ui/unidad-medida.pipe';
import {
  ImagenProducto, OpcionCategoria, OpcionMarca, ProductoAdmin,
} from '../../../models/admin.models';

/** Foto elegida que aún no está en el servidor. */
export interface FotoPendiente {
  archivo: File;
  /** objectURL de la miniatura; se libera con URL.revokeObjectURL. */
  vista: string;
  /** Motivo por el que no se pudo subir (queda en la cola para reintentar). */
  error?: string;
}

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

@Component({
  selector: 'app-productos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, RouterLink, VisorImagenComponent, CountUpDirective, RevealDirective,
    SelectorUnidadComponent, UnidadMedidaPipe,
  ],
  templateUrl: './productos.component.html',
  styleUrl: './productos.component.css',
})
export class ProductosComponent implements OnInit, OnDestroy {

  productos: ProductoAdmin[] = [];
  categorias: OpcionCategoria[] = [];
  marcas: OpcionMarca[] = [];
  cargando = false;
  /** Mensaje de la última carga fallida de la lista (solo para mostrar el estado de error en pantalla). */
  errorCarga = '';
  /** URL abierta en el visor moderado (null = cerrado). */
  vistaImagen: string | null = null;
  urlsVista: string[] = [];
  indiceVista = 0;

  filtro = '';
  filtroCategoria: number | '' = '';
  filtroEstado: '' | 'activos' | 'inactivos' | 'sin_stock' | 'sin_imagen' = '';

  panelAbierto = false;
  editando: ProductoAdmin | null = null;
  formulario: ProductoFormulario = { ...FORMULARIO_VACIO };
  guardando = false;
  cargandoStock = false;
  errorStock = '';
  almacenes: { id_almacen: number; nombre: string; sucursal: string }[] = [];
  idAlmacenStock: number | null = null;
  stockActualEdicion = 0;
  /**
   * true solo cuando stockActualEdicion es el stock leído de ESTE producto en ESTE almacén.
   * Sin eso no se guarda: el ajuste se calcula contra este valor y nunca se asume 0.
   */
  stockVerificado = false;
  /** El producto no tiene fila de inventario en el almacén elegido (su stock ahí es 0). */
  sinStockRegistrado = false;
  private consultaStock?: Subscription;

  imagenes: ImagenProducto[] = [];
  cargandoImagenes = false;
  subiendo = false;
  zonaActiva = false;
  indiceArrastrado: number | null = null;

  /**
   * Fotos elegidas que todavía no están en el servidor. En «Nuevo producto» esperan a que se cree
   * el producto; si la subida falla, siguen aquí (con `error`) para reintentar sin duplicar nada.
   * La primera es la principal. `vista` es un objectURL que hay que liberar al quitarla.
   */
  fotosPendientes: FotoPendiente[] = [];
  /** Comprimiendo/validando las fotos recién elegidas. */
  preparandoFotos = false;
  /** Avance de la subida en lotes: «Subiendo 2 de 5…». null cuando no se está subiendo. */
  progresoSubida: { desde: number; hasta: number; total: number } | null = null;
  /** Imagen de la galería cuyo archivo se está cambiando. */
  reemplazandoId: number | null = null;
  indiceFotoArrastrada: number | null = null;
  private destruido = false;

  /** Fila que acaba de guardarse: se resalta unos segundos para ubicarla. */
  idDestacado: number | null = null;

  private readonly destruir$ = new Subject<void>();
  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private readonly service: ProductoAdminService,
    private readonly imagenService: ProductoImagenService,
    private readonly inventario: InventarioAdminService,
    private readonly alerta: AlertService,
    private readonly auth: AuthService,
    private readonly puntoVenta: PuntoVentaService,
    private readonly unidadesMedida: UnidadMedidaService,
  ) {}

  /** false = rol consulta (solo lectura). */
  get puedeEditar(): boolean {
    return this.auth.puedeEditarCatalogo();
  }

  ngOnInit(): void {
    this.cargar();
    this.cargarCatalogos();
    this.inventario.almacenes().pipe(
      catchError(() => of([])),
      takeUntil(this.destruir$),
    ).subscribe((almacenes) => {
      this.almacenes = almacenes;
      if (!this.idAlmacenStock) this.idAlmacenStock = almacenes[0]?.id_almacen ?? null;
      // Si la ficha se abrió antes de que llegaran los almacenes, recién ahora se puede leer su stock.
      if (this.panelAbierto && this.editando && !this.stockVerificado && !this.cargandoStock) {
        this.cargarStockEdicion();
      }
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.liberarFotosPendientes();
    this.destruir$.next();
    this.destruir$.complete();
  }

  // ── Datos ────────────────────────────────────────────────────

  cargar(): void {
    this.cargando = true;
    this.errorCarga = '';
    this.cdr.markForCheck();

    this.service.listar().pipe(takeUntil(this.destruir$)).subscribe({
      next: (productos) => {
        this.cargando = false;
        this.productos = productos;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.cargando = false;
        this.errorCarga = mensajeDeError(error);
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

  /** Hay algún filtro aplicado (para mostrar «Limpiar»). */
  get hayFiltros(): boolean {
    return !!this.filtro.trim() || this.filtroCategoria !== '' || this.filtroEstado !== '';
  }

  get totalActivos(): number {
    return this.productos.filter((p) => p.estado).length;
  }

  get totalInactivos(): number {
    return this.productos.filter((p) => !p.estado).length;
  }

  get totalDestacados(): number {
    return this.productos.filter((p) => p.destacado).length;
  }

  get totalSinImagen(): number {
    return this.productos.filter((p) => Number(p.total_imagenes) === 0).length;
  }

  get totalSinStock(): number {
    return this.productos.filter((p) => Number(p.stock_total) <= 0).length;
  }

  // ── Formulario ───────────────────────────────────────────────

  abrirNuevo(): void {
    if (!this.puedeEditar) return;
    this.consultaStock?.unsubscribe();
    this.editando = null;
    this.formulario = { ...FORMULARIO_VACIO };
    this.idAlmacenStock = this.almacenes[0]?.id_almacen ?? null;
    this.stockActualEdicion = 0;
    this.stockVerificado = false;
    this.sinStockRegistrado = false;
    this.cargandoStock = false;
    this.errorStock = '';
    this.imagenes = [];
    this.liberarFotosPendientes();
    this.panelAbierto = true;
    this.cargarMarcas();
  }

  abrirEdicion(producto: ProductoAdmin): void {
    this.liberarFotosPendientes();
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
      stock: Number(producto.stock_total) || 0,
    };
    this.idAlmacenStock = this.almacenes[0]?.id_almacen ?? null;
    this.stockActualEdicion = Number(producto.stock_total) || 0;
    this.errorStock = '';
    this.panelAbierto = true;
    this.cargarMarcas({ id_marca: producto.id_marca, nombre: producto.marca });
    this.cargarImagenes(producto.id_producto);
    this.cargarStockEdicion();
  }

  /**
   * Lee el stock de ESTE producto en el almacén elegido (filtro exacto, una fila). Antes se
   * pedían las 200 primeras filas del almacén y, si el producto no estaba entre ellas, se
   * mostraba 0: al guardar, el ajuste se calculaba contra 0 y dejaba mal el stock.
   */
  private cargarStockEdicion(): void {
    this.consultaStock?.unsubscribe();
    this.stockVerificado = false;
    this.sinStockRegistrado = false;
    if (!this.idAlmacenStock || !this.editando) {
      this.cargandoStock = false;
      this.errorStock = this.almacenes.length ? '' : 'No hay almacenes disponibles.';
      return;
    }
    const idProducto = Number(this.editando.id_producto);
    const idAlmacen = Number(this.idAlmacenStock);
    this.cargandoStock = true;
    this.errorStock = '';
    this.cdr.markForCheck();
    this.consultaStock = this.inventario.listar({ id_almacen: idAlmacen, id_producto: idProducto, por_pagina: 1 }).pipe(
      takeUntil(this.destruir$),
    ).subscribe({
      next: (respuesta) => {
        const filas = respuesta?.datos ?? [];
        const fila = filas.find(
          (item) => Number(item.id_producto) === idProducto && Number(item.id_almacen) === idAlmacen,
        );
        this.cargandoStock = false;
        if (!fila && filas.length) {
          // Llegaron filas de otro producto (servidor sin el filtro): el stock real se desconoce.
          this.errorStock = 'No se pudo leer el stock de este producto en el almacén. Recargue la página e intente de nuevo.';
        } else {
          // Sin fila, el producto nunca tuvo stock en ese almacén: ahí su stock es 0 de verdad.
          this.sinStockRegistrado = !fila;
          this.stockActualEdicion = fila ? Number(fila.stock) || 0 : 0;
          this.formulario.stock = this.stockActualEdicion;
          this.stockVerificado = true;
        }
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.cargandoStock = false;
        this.errorStock = mensajeDeError(error, 'No se pudo consultar el stock del almacén');
        this.cdr.markForCheck();
      },
    });
  }

  cambiarAlmacenStock(id: number | string): void {
    const almacen = Number(id);
    if (!Number.isInteger(almacen) || almacen <= 0 || almacen === this.idAlmacenStock || !this.editando) return;
    this.idAlmacenStock = almacen;
    this.cargarStockEdicion();
  }

  cerrarPanel(): void {
    if (this.guardando || this.subiendo || this.reemplazandoId !== null) return;
    this.consultaStock?.unsubscribe();
    this.cargandoStock = false;
    this.panelAbierto = false;
    this.editando = null;
    this.imagenes = [];
    this.liberarFotosPendientes();
  }

  guardar(): void {
    if (!this.puedeEditar) return;
    if (this.preparandoFotos) {
      this.alerta.toast({ type: 'warning', title: 'Espere a que terminen de prepararse las fotos' });
      return;
    }
    const nombre = this.formulario.nombre?.trim();
    if (!nombre) {
      this.alerta.toast({ type: 'warning', title: 'El nombre es obligatorio' });
      return;
    }

    if (Number(this.formulario.precio_venta) <= 0) {
      this.alerta.toast({ type: 'warning', title: 'El precio de venta debe ser mayor a cero' });
      return;
    }

    const unidad = this.unidadesMedida.resolver(this.formulario.unidad_medida);
    if (unidad.estado === 'invalida') {
      this.alerta.toast({
        type: 'warning',
        title: `La unidad «${unidad.original}» no es válida: elija una de la lista`,
      });
      return;
    }

    const datos: ProductoFormulario = {
      ...this.formulario,
      nombre,
      unidad_medida: unidad.codigo,
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
      if (!this.idAlmacenStock || this.cargandoStock || this.errorStock || !this.stockVerificado) {
        this.guardando = false;
        this.alerta.toast({
          type: 'warning',
          title: this.errorStock || 'Espere a que cargue el stock del almacén',
        });
        return;
      }
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
        // El producto ya quedó guardado: el catálogo del POS (caché de 3 min) debe recargarse.
        this.puntoVenta.invalidarCatalogo();
        const editado = this.editando;
        if (editado && this.idAlmacenStock && Number(this.formulario.stock) !== this.stockActualEdicion) {
          const diferencia = Math.trunc(Number(this.formulario.stock)) - this.stockActualEdicion;
          this.inventario.ajustar({
            id_producto: editado.id_producto,
            id_almacen: this.idAlmacenStock,
            cantidad: diferencia,
            motivo: 'correccion',
            comentario: 'Ajuste de stock desde edición de producto',
          }).pipe(takeUntil(this.destruir$)).subscribe({
            next: (respuesta) => {
              this.guardando = false;
              this.stockActualEdicion = Number(respuesta.stock) || 0;
              this.formulario.stock = this.stockActualEdicion;
              const stockAnteriorTotal = Number(editado.stock_total) || 0;
              this.reflejarEnLista({
                ...producto,
                stock_total: stockAnteriorTotal + diferencia,
              });
              this.destacar(producto.id_producto);
              this.asegurarVisibleEnLista(producto.id_producto);
              // El ajuste de stock también cambia lo que ve el POS.
              this.puntoVenta.invalidarCatalogo();
              this.cdr.markForCheck();
              this.alerta.toast({ type: 'success', title: 'Cambios y stock guardados' });
              this.cerrarPanel();
            },
            error: (error) => {
              this.guardando = false;
              this.reflejarEnLista(producto);
              this.cdr.markForCheck();
              this.alerta.error({ title: 'Producto guardado, stock no actualizado', message: mensajeDeError(error) });
            },
          });
          return;
        }
        const esNuevo = !this.editando;
        const conFotos = esNuevo && this.fotosPendientes.length > 0;
        // Con fotos en cola el guardado sigue hasta que termine la subida (bloquea cerrar y reintentar «Crear»).
        this.guardando = conFotos;

        this.reflejarEnLista(producto);
        this.asegurarVisibleEnLista(producto.id_producto);
        this.destacar(producto.id_producto);
        this.cdr.markForCheck();
        if (conFotos) {
          this.subirFotosPendientes(producto, { alCrear: true, sinStock: datos.stock === 0 });
          return;
        }
        if (esNuevo && datos.stock === 0) {
          this.alerta.toast({
            type: 'info',
            title: 'Creado sin stock: no se podrá vender hasta ingresar stock',
          });
        } else {
          this.alerta.toast({
            type: 'success',
            title: esNuevo ? 'Producto creado' : 'Cambios guardados',
          });
        }

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
    if (!this.puedeEditar) return;
    const respuesta = await this.alerta.confirm({
      title: `¿Eliminar ${producto.nombre}?`,
      message: 'Se quitará del catálogo. Si ya tiene ventas registradas, conviene desactivarlo en lugar de borrarlo.',
      confirmText: 'Sí, eliminar',
      danger: true,
    });

    if (!respuesta.isConfirmed) return;

    this.service.eliminar(producto.id_producto).pipe(takeUntil(this.destruir$)).subscribe({
      next: () => {
        this.productos = this.productos.filter((p) => p.id_producto !== producto.id_producto);
        this.puntoVenta.invalidarCatalogo();
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
    if (!this.puedeEditar) return;
    this.service
      .actualizar(producto.id_producto, { nombre: producto.nombre, estado: !producto.estado })
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (actualizado) => {
          this.reflejarEnLista(actualizado);
          this.puntoVenta.invalidarCatalogo();
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

  private cargarImagenes(idProducto: number, alCargar?: () => void): void {
    this.cargandoImagenes = true;
    this.cdr.markForCheck();

    this.imagenService.listar(idProducto).pipe(takeUntil(this.destruir$)).subscribe({
      next: (imagenes) => {
        this.cargandoImagenes = false;
        this.imagenes = imagenes;
        alCargar?.();
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
    this.recibirArchivos(Array.from(entrada.files ?? []));
    entrada.value = '';
  }

  alArrastrarSobreZona(evento: DragEvent, activa: boolean): void {
    evento.preventDefault();
    this.zonaActiva = activa;
  }

  alSoltarArchivos(evento: DragEvent): void {
    evento.preventDefault();
    this.zonaActiva = false;
    this.recibirArchivos(Array.from(evento.dataTransfer?.files ?? []));
  }

  /** Producto ya guardado: sube de inmediato. Producto nuevo: las deja en cola hasta crearlo. */
  private recibirArchivos(archivos: File[]): void {
    if (!this.puedeEditar || this.guardando || !archivos.length) return;
    if (this.editando) {
      void this.subirArchivos(archivos);
    } else {
      void this.agregarFotosPendientes(archivos);
    }
  }

  // ── Fotos en cola (producto nuevo) ───────────────────────────

  /** Valida y comprime cada foto; las que no sirven se avisan por nombre y no entran a la cola. */
  async agregarFotosPendientes(archivos: File[]): Promise<void> {
    if (!archivos.length) return;
    this.preparandoFotos = true;
    this.cdr.markForCheck();

    const { listas, rechazos } = await this.prepararFotos(archivos);
    if (this.destruido) return;

    this.fotosPendientes = [
      ...this.fotosPendientes,
      ...listas.map((archivo) => ({ archivo, vista: URL.createObjectURL(archivo) })),
    ];
    this.preparandoFotos = false;
    this.cdr.markForCheck();
    this.avisarRechazos(rechazos);
  }

  /** Pasa cada archivo por validar + comprimir; devuelve los que sirven y los motivos de los que no. */
  private async prepararFotos(archivos: File[]): Promise<{ listas: File[]; rechazos: string[] }> {
    const listas: File[] = [];
    const rechazos: string[] = [];
    for (const archivo of archivos) {
      const resultado = await prepararImagen(archivo);
      if (this.destruido) break;
      if (resultado.archivo) listas.push(resultado.archivo);
      else if (resultado.error) rechazos.push(resultado.error);
    }
    return { listas, rechazos };
  }

  private avisarRechazos(rechazos: string[]): void {
    if (!rechazos.length) return;
    const resto = rechazos.length - 2;
    this.alerta.toast({
      type: 'warning',
      title: rechazos.slice(0, 2).join(' · ') + (resto > 0 ? ` · y ${resto} más` : ''),
    });
  }

  quitarFotoPendiente(indice: number): void {
    if (this.guardando || this.subiendo) return;
    const [quitada] = this.fotosPendientes.splice(indice, 1);
    if (quitada) URL.revokeObjectURL(quitada.vista);
    this.fotosPendientes = [...this.fotosPendientes];
  }

  /** La principal es la primera de la cola: se sube primero y el backend la marca principal. */
  hacerPrincipalPendiente(indice: number): void {
    if (this.guardando || this.subiendo || indice <= 0) return;
    this.moverFotoPendiente(indice, 0);
  }

  alIniciarArrastreFoto(indice: number): void {
    this.indiceFotoArrastrada = indice;
  }

  alSoltarFotoEn(indice: number): void {
    const origen = this.indiceFotoArrastrada;
    this.indiceFotoArrastrada = null;
    if (origen === null || origen === indice || this.guardando || this.subiendo) return;
    this.moverFotoPendiente(origen, indice);
  }

  private moverFotoPendiente(origen: number, destino: number): void {
    const lista = [...this.fotosPendientes];
    const [movida] = lista.splice(origen, 1);
    if (!movida) return;
    lista.splice(destino, 0, movida);
    this.fotosPendientes = lista;
  }

  /** Reintenta subir las fotos que quedaron en cola (el producto ya existe). */
  reintentarFotosPendientes(): void {
    if (!this.editando || this.guardando || this.subiendo || !this.fotosPendientes.length) return;
    this.subirFotosPendientes(this.editando, { alCrear: false, sinStock: false });
  }

  /**
   * Sube la cola en trozos de 10 (límite del backend). Cada trozo que llega bien sale de la cola;
   * si uno falla, el resto queda marcado y el panel se queda en modo edición: el producto ya
   * existe y reintentar nunca vuelve a crearlo.
   */
  private subirFotosPendientes(
    producto: ProductoAdmin,
    opciones: { alCrear: boolean; sinStock: boolean },
  ): void {
    // Se limpian los errores de un intento anterior ANTES de partir en lotes: los lotes guardan estas mismas referencias.
    this.fotosPendientes = this.fotosPendientes.map((f) => ({ archivo: f.archivo, vista: f.vista }));
    const lotes = partirEnLotes(this.fotosPendientes);
    const total = this.fotosPendientes.length;
    let subidas = 0;
    let galeria: ImagenProducto[] = [];

    this.subiendo = true;
    this.cdr.markForCheck();

    from(lotes).pipe(
      concatMap((lote) => this.imagenService.subir(producto.id_producto, lote.map((f) => f.archivo)).pipe(
        tap((resultado) => {
          galeria = resultado;
          subidas += lote.length;
          lote.forEach((f) => URL.revokeObjectURL(f.vista));
          this.fotosPendientes = this.fotosPendientes.filter((f) => !lote.includes(f));
        }),
      )),
      takeUntil(this.destruir$),
    ).subscribe({
      complete: () => {
        if (this.destruido) return;
        this.subiendo = false;
        this.guardando = false;
        // La fila de la lista y el POS pasan a mostrar la foto principal recién subida.
        this.editando = producto;
        this.imagenes = galeria;
        this.sincronizarImagenEnLista();
        this.cdr.markForCheck();
        const etiqueta = `${total} ${total === 1 ? 'foto' : 'fotos'}`;
        if (opciones.alCrear) {
          this.alerta.toast({ type: 'success', title: `Producto creado con ${etiqueta}` });
          if (opciones.sinStock) {
            this.alerta.toast({
              type: 'info',
              title: 'Creado sin stock: no se podrá vender hasta ingresar stock',
            });
          }
          this.cerrarPanel();
        } else {
          this.alerta.toast({ type: 'success', title: `${etiqueta} ${total === 1 ? 'subida' : 'subidas'}` });
        }
      },
      error: (error) => {
        this.subiendo = false;
        this.guardando = false;
        const quedan = this.fotosPendientes.length;
        this.fotosPendientes = this.fotosPendientes.map((f) => ({ ...f, error: mensajeDeError(error) }));
        // El producto existe: el panel pasa a edición con la cola para reintentar (nunca se vuelve a crear).
        this.editando = producto;
        this.imagenes = galeria;
        if (subidas) this.sincronizarImagenEnLista();
        // Lo que sí quedó guardado en el servidor, por si el trozo fallido llegó a medias.
        this.cargarImagenes(producto.id_producto, () => this.sincronizarImagenEnLista());
        this.cdr.markForCheck();
        this.alerta.error({
          title: opciones.alCrear
            ? `Producto creado; ${quedan} ${quedan === 1 ? 'foto no se subió' : 'fotos no se subieron'}`
            : 'No se pudieron subir las fotos',
          message: mensajeDeError(error),
        });
      },
    });
  }

  private liberarFotosPendientes(): void {
    this.fotosPendientes.forEach((f) => URL.revokeObjectURL(f.vista));
    this.fotosPendientes = [];
    this.indiceFotoArrastrada = null;
  }

  /**
   * Producto ya guardado: valida y comprime cada foto, la sube en trozos de 10 (límite del backend)
   * con avance «Subiendo 2 de 5…» y, si algo falla, recarga la galería real: un trozo fallido puede
   * haber llegado a medias y lo que sí quedó guardado tiene que verse.
   */
  async subirArchivos(archivos: File[]): Promise<void> {
    const producto = this.editando;
    if (!producto || !archivos.length || this.subiendo || this.preparandoFotos || this.reemplazandoId !== null) return;

    this.preparandoFotos = true;
    this.cdr.markForCheck();
    const { listas, rechazos } = await this.prepararFotos(archivos);
    if (this.destruido) return;
    this.preparandoFotos = false;
    this.avisarRechazos(rechazos);
    // Si se cerró o cambió el panel mientras se preparaban, no se sube a un producto que ya no se ve.
    if (!listas.length || this.editando !== producto) {
      this.cdr.markForCheck();
      return;
    }

    const lotes = partirEnLotes(listas);
    const total = listas.length;
    let subidas = 0;
    let galeria: ImagenProducto[] | null = null;

    this.subiendo = true;
    this.progresoSubida = { desde: 1, hasta: Math.min(lotes[0].length, total), total };
    this.cdr.markForCheck();

    from(lotes).pipe(
      concatMap((lote) => {
        this.progresoSubida = { desde: subidas + 1, hasta: subidas + lote.length, total };
        this.cdr.markForCheck();
        return this.imagenService.subir(producto.id_producto, lote).pipe(
          tap((resultado) => {
            galeria = resultado;
            subidas += lote.length;
          }),
        );
      }),
      takeUntil(this.destruir$),
    ).subscribe({
      complete: () => {
        this.subiendo = false;
        this.progresoSubida = null;
        if (galeria) this.imagenes = galeria;
        this.sincronizarImagenEnLista();
        this.cdr.markForCheck();
        this.alerta.toast({
          type: 'success',
          title: `${subidas} ${subidas === 1 ? 'imagen subida' : 'imágenes subidas'}`,
        });
      },
      error: (error) => {
        this.subiendo = false;
        this.progresoSubida = null;
        this.cdr.markForCheck();
        this.alerta.error({
          title: subidas
            ? `Se subieron ${subidas} de ${total}; el resto no`
            : 'No se pudieron subir',
          message: mensajeDeError(error),
        });
        // Refleja lo que sí quedó guardado (y la foto/total de la lista y el POS).
        this.cargarImagenes(producto.id_producto, () => this.sincronizarImagenEnLista());
      },
    });
  }

  /** Texto de la zona de soltar mientras se prepara o se sube. */
  get textoSubida(): string {
    if (this.preparandoFotos) return 'Preparando fotos…';
    const p = this.progresoSubida;
    if (!p) return 'Subiendo…';
    return p.desde === p.hasta
      ? `Subiendo ${p.desde} de ${p.total}…`
      : `Subiendo ${p.desde}–${p.hasta} de ${p.total}…`;
  }

  alElegirReemplazo(imagen: ImagenProducto, evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (archivo) void this.reemplazarImagen(imagen, archivo);
  }

  /**
   * Cambia el archivo de una foto ya subida (por ejemplo una equivocada). Mantiene su posición y si
   * es la principal. Valida/comprime antes de enviar; si falla, la foto vieja sigue ahí.
   */
  async reemplazarImagen(imagen: ImagenProducto, archivo: File): Promise<void> {
    const producto = this.editando;
    if (!producto || !this.puedeEditar || this.subiendo || this.preparandoFotos || this.reemplazandoId !== null) return;

    this.reemplazandoId = imagen.id_imagen;
    this.cdr.markForCheck();

    const resultado = await prepararImagen(archivo);
    if (this.destruido) return;
    if (!resultado.archivo || this.editando !== producto) {
      this.reemplazandoId = null;
      this.cdr.markForCheck();
      if (!resultado.archivo) this.alerta.toast({ type: 'warning', title: resultado.error ?? 'No se pudo preparar la foto' });
      return;
    }

    this.imagenService.reemplazar(producto.id_producto, imagen.id_imagen, resultado.archivo).pipe(
      finalize(() => {
        this.reemplazandoId = null;
        this.cdr.markForCheck();
      }),
      takeUntil(this.destruir$),
    ).subscribe({
      next: (galeria) => {
        this.imagenes = galeria;
        // Pasa por aquí para heredar la invalidación del catálogo del POS y refrescar la fila de la lista.
        this.sincronizarImagenEnLista();
        this.cdr.markForCheck();
        this.alerta.toast({ type: 'success', title: 'Foto reemplazada' });
      },
      error: (error) => {
        this.cdr.markForCheck();
        this.alerta.error({ title: 'No se pudo reemplazar la foto', message: mensajeDeError(error) });
        this.cargarImagenes(producto.id_producto, () => this.sincronizarImagenEnLista());
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
      danger: true,
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

  /**
   * Si los filtros activos esconden el producto recién guardado, los limpia para que
   * no «desaparezca» de la lista (el aviso del toast ya confirma que se guardó).
   */
  private asegurarVisibleEnLista(idProducto: number): void {
    if (this.productosFiltrados.some((p) => p.id_producto === idProducto)) return;
    this.filtro = '';
    this.filtroCategoria = '';
    this.filtroEstado = '';
  }

  private sincronizarImagenEnLista(): void {
    // Subir, quitar, reordenar o cambiar la principal altera la foto que muestra el POS.
    this.puntoVenta.invalidarCatalogo();
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

  /** Descuento como porcentaje del precio de venta (solo para mostrarlo en la tabla). */
  descuentoPct(producto: ProductoAdmin): number {
    const venta = Number(producto.precio_venta) || 0;
    return venta > 0 ? ((Number(producto.descuento) || 0) / venta) * 100 : 0;
  }

  /** Margen sobre el precio final; null si el producto no tiene costo cargado. */
  margen(producto: ProductoAdmin): number | null {
    const costo = Number(producto.precio_compra) || 0;
    const final = this.precioFinal(producto);
    return costo > 0 && final > 0 ? ((final - costo) / final) * 100 : (costo > 0 ? -100 : null);
  }

  /** Resumen de precios de la ficha, calculado en vivo con lo que se está escribiendo. */
  get precioFinalFormulario(): number {
    return Math.max(0, (Number(this.formulario.precio_venta) || 0) - (Number(this.formulario.descuento) || 0));
  }

  get gananciaFormulario(): number {
    return this.precioFinalFormulario - (Number(this.formulario.precio_compra) || 0);
  }

  get margenFormulario(): number | null {
    const costo = Number(this.formulario.precio_compra) || 0;
    const final = this.precioFinalFormulario;
    return costo > 0 && final > 0 ? (this.gananciaFormulario / final) * 100 : null;
  }

  /** URL lista para el <img>: Cloudinary o /archivos del backend. */
  urlDe(ruta?: string | null): string {
    return urlMedia(ruta);
  }

  /** Desde la lista: si hay varias imágenes, las carga y permite pasar una a una. */
  abrirVistaImagenProducto(producto: ProductoAdmin, evento?: Event): void {
    evento?.stopPropagation();
    const fallback = this.urlDe(producto.imagen_url || producto.thumb_url);
    if (Number(producto.total_imagenes) > 1) {
      this.imagenService.listar(producto.id_producto).pipe(takeUntil(this.destruir$)).subscribe({
        next: (galeria) => {
          const urls = (galeria || [])
            .map((i) => this.urlDe(i.url || i.thumb_url))
            .filter(Boolean);
          this.urlsVista = urls.length ? urls : fallback ? [fallback] : [];
          this.indiceVista = 0;
          this.vistaImagen = this.urlsVista[0] || null;
          this.cdr.markForCheck();
        },
        error: () => {
          this.urlsVista = fallback ? [fallback] : [];
          this.indiceVista = 0;
          this.vistaImagen = fallback;
          this.cdr.markForCheck();
        },
      });
      return;
    }
    this.abrirVistaImagen(producto.imagen_url || producto.thumb_url);
  }

  abrirVistaImagen(ruta?: string | null, evento?: Event): void {
    evento?.stopPropagation();
    // Desde la galería del panel: navegar todas las imágenes del producto
    if (this.imagenes.length > 1) {
      const urls = this.imagenes
        .map((i) => this.urlDe(i.url || i.thumb_url))
        .filter(Boolean);
      const clicked = this.urlDe(ruta);
      const idx = Math.max(0, urls.indexOf(clicked));
      this.urlsVista = urls;
      this.indiceVista = idx >= 0 ? idx : 0;
      this.vistaImagen = urls[this.indiceVista] || clicked || null;
      return;
    }
    const url = this.urlDe(ruta);
    this.urlsVista = url ? [url] : [];
    this.indiceVista = 0;
    if (url) this.vistaImagen = url;
  }

  cerrarVistaImagen(): void {
    this.vistaImagen = null;
    this.urlsVista = [];
    this.indiceVista = 0;
  }

  identificarProducto(_indice: number, producto: ProductoAdmin): number {
    return producto.id_producto;
  }

  identificarImagen(_indice: number, imagen: ImagenProducto): number {
    return imagen.id_imagen;
  }

  identificarFotoPendiente(_indice: number, foto: FotoPendiente): string {
    return foto.vista;
  }
}
