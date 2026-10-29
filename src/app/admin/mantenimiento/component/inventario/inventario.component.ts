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
import { Subject, debounceTime, takeUntil } from 'rxjs';

import { VisorImagenComponent } from '../../../../shared/components/visor-imagen/visor-imagen.component';
import { CountUpDirective } from '../../../../shared/ui/count-up.directive';
import { RevealDirective } from '../../../../shared/ui/reveal.directive';
import { BusquedaPendiente, filtrarInstantaneo } from '../../../../shared/utils/filtro-instantaneo.util';
import { AlertService } from '../../../../shared/services/alert.service';
import { urlMedia } from '../../../../shared/utils/media-url.util';
import { mensajeDeError } from '../../../service/api-base.service';
import { FiltroInventario, InventarioAdminService } from '../../../service/inventario-admin.service';
import { ProductoImagenService } from '../../../service/producto-imagen.service';
import {
  Almacen, FilaInventario, MovimientoInventario, ResumenInventario,
} from '../../../models/admin.models';
import { UnidadMedidaPipe } from '../../../../shared/ui/unidad-medida.pipe';

type ModoPanel = 'ajuste' | 'transferencia' | 'movimientos';

const MOTIVOS = [
  { valor: 'compra', texto: 'Ingreso por compra' },
  { valor: 'devolucion', texto: 'Devolución de cliente' },
  { valor: 'conteo_fisico', texto: 'Ajuste por conteo físico' },
  { valor: 'merma', texto: 'Merma o producto dañado' },
  { valor: 'robo', texto: 'Faltante o robo' },
  { valor: 'correccion', texto: 'Corrección de registro' },
  { valor: 'otro', texto: 'Otro motivo' },
];

@Component({
  selector: 'app-inventario',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, VisorImagenComponent, CountUpDirective, RevealDirective, UnidadMedidaPipe],
  templateUrl: './inventario.component.html',
  styleUrl: './inventario.component.css',
})
export class InventarioComponent implements OnInit, OnDestroy {

  filas: FilaInventario[] = [];
  /** Filas cargadas filtradas por el texto escrito (al instante, sin esperar al servidor). */
  filasVisibles: readonly FilaInventario[] = [];
  /** Búsqueda pendiente en el servidor: evita mostrar «sin resultados» antes de que llegue. */
  readonly busqueda = new BusquedaPendiente();
  almacenes: Almacen[] = [];
  resumen: ResumenInventario | null = null;

  total = 0;
  pagina = 1;
  porPagina = 50;
  cargando = false;
  /** La última carga de la lista falló (solo para mostrar el estado de error en pantalla). */
  errorCarga = false;

  filtro: FiltroInventario = { texto: '', id_almacen: '', solo_alertas: false };

  panelAbierto = false;
  modo: ModoPanel = 'ajuste';
  seleccionada: FilaInventario | null = null;
  procesando = false;

  ajuste = { tipo: 'entrada' as 'entrada' | 'salida', cantidad: 1, motivo: 'compra', comentario: '' };
  transferencia = { id_almacen_destino: null as number | null, cantidad: 1, comentario: '' };

  movimientos: MovimientoInventario[] = [];
  cargandoMovimientos = false;

  idDestacado: number | null = null;
  edicionMinimo: number | null = null;
  valorMinimo = 0;
  /** URL abierta en el visor (null = cerrado). */
  vistaImagen: string | null = null;
  urlsVista: string[] = [];
  indiceVista = 0;

  readonly motivos = MOTIVOS;
  private readonly buscar$ = new Subject<void>();
  private readonly destruir$ = new Subject<void>();
  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private readonly service: InventarioAdminService,
    private readonly imagenes: ProductoImagenService,
    private readonly alerta: AlertService,
  ) {}

  ngOnInit(): void {
    this.buscar$.pipe(debounceTime(220), takeUntil(this.destruir$)).subscribe(() => this.cargar(1));

    this.cargar(1);
    this.cargarResumen();
    this.cargarAlmacenes();
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  // ── Datos ────────────────────────────────────────────────────

  cargar(pagina = this.pagina): void {
    const alTerminar = this.busqueda.alLanzar();
    this.cargando = true;
    this.errorCarga = false;
    this.cdr.markForCheck();

    this.service
      .listar({ ...this.filtro, pagina, por_pagina: this.porPagina })
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (respuesta) => {
          this.cargando = false;
          alTerminar();
          this.filas = respuesta.datos;
          this.refiltrar();
          this.total = respuesta.total;
          this.pagina = respuesta.pagina;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.cargando = false;
          alTerminar();
          this.errorCarga = true;
          this.cdr.markForCheck();
          this.alerta.error({
            title: 'No se pudo cargar el inventario',
            message: mensajeDeError(error),
          });
        },
      });
  }

  private cargarResumen(): void {
    this.service.resumen().pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (resumen) => {
          this.resumen = resumen;
          this.cdr.markForCheck();
        },
        error: () => {
          this.resumen = null;
          this.cdr.markForCheck();
        },
      });
  }

  private cargarAlmacenes(): void {
    this.service.almacenes().pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (lista) => {
          this.almacenes = lista;
          this.cdr.markForCheck();
        },
        error: () => {
          this.almacenes = [];
          this.cdr.markForCheck();
        },
      });
  }

  /** Filtra al instante las filas ya cargadas; el servidor completa el resultado en segundo plano. */
  alBuscar(): void {
    this.busqueda.iniciar();
    this.refiltrar();
    this.buscar$.next();
  }

  private refiltrar(): void {
    // Mismos campos que busca el servidor (inventario.repository: nombre, SKU y código de barras).
    this.filasVisibles = filtrarInstantaneo(this.filas, this.filtro.texto, (f) => [
      f.producto,
      f.sku,
      f.codigo_barras,
    ]);
  }

  alternarAlertas(): void {
    this.filtro.solo_alertas = !this.filtro.solo_alertas;
    this.cargar(1);
  }

  /** Productos sin stock + bajo mínimo según el resumen (solo para el contador del filtro de alertas). */
  get totalAlertas(): number {
    return (this.resumen?.sin_stock ?? 0) + (this.resumen?.bajo_stock ?? 0);
  }

  /** Relleno (0–100) de la barra de nivel: el stock medido contra el doble del mínimo; sin mínimo, llena si hay existencias. */
  nivel(stock: number | string | null | undefined, minimo: number | string | null | undefined): number {
    const existencias = Number(stock) || 0;
    const umbral = Number(minimo) || 0;
    if (existencias <= 0) return 0;
    if (umbral <= 0) return 100;
    return Math.min(100, (existencias / (umbral * 2)) * 100);
  }

  /** Estado de la barra de nivel (solo color; no toca los datos). */
  estadoNivel(stock: number | string | null | undefined, minimo: number | string | null | undefined): FilaInventario['estado'] {
    const existencias = Number(stock) || 0;
    const umbral = Number(minimo) || 0;
    if (existencias <= 0) return 'sin_stock';
    if (umbral > 0 && existencias <= umbral) return 'bajo';
    return 'ok';
  }

  /** Color de la insignia del tipo de movimiento del kardex. */
  claseTipo(tipo: string): string {
    const mapa: Record<string, string> = {
      entrada: 'adm-insignia--exito',
      salida: 'adm-insignia--peligro',
      ajuste: 'adm-insignia--aviso',
      transferencia: 'adm-insignia--info',
    };
    return mapa[tipo] ?? 'adm-insignia--neutra';
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.total / this.porPagina));
  }

  irA(pagina: number): void {
    if (pagina < 1 || pagina > this.totalPaginas || pagina === this.pagina) return;
    this.cargar(pagina);
  }

  get almacenesDestino(): Almacen[] {
    return this.almacenes.filter((a) => a.id_almacen !== this.seleccionada?.id_almacen);
  }

  // ── Panel ────────────────────────────────────────────────────

  abrir(fila: FilaInventario, modo: ModoPanel): void {
    this.seleccionada = fila;
    this.modo = modo;
    this.panelAbierto = true;

    this.ajuste = { tipo: 'entrada', cantidad: 1, motivo: 'compra', comentario: '' };
    this.transferencia = {
      id_almacen_destino: this.almacenesDestino[0]?.id_almacen ?? null,
      cantidad: 1,
      comentario: '',
    };

    if (modo === 'movimientos') this.cargarMovimientos(fila.id_producto);
  }

  cerrarPanel(): void {
    if (this.procesando) return;
    this.panelAbierto = false;
    this.seleccionada = null;
    this.movimientos = [];
  }

  private cargarMovimientos(idProducto: number): void {
    this.cargandoMovimientos = true;
    this.movimientos = [];
    this.cdr.markForCheck();

    this.service.movimientos(idProducto, 40).pipe(takeUntil(this.destruir$)).subscribe({
      next: (lista) => {
        this.cargandoMovimientos = false;
        this.movimientos = lista;
        this.cdr.markForCheck();
      },
      error: () => {
        this.cargandoMovimientos = false;
        this.cdr.markForCheck();
      },
    });
  }

  get stockResultante(): number {
    if (!this.seleccionada) return 0;
    const cantidad = Math.abs(Number(this.ajuste.cantidad) || 0);
    const signo = this.ajuste.tipo === 'entrada' ? 1 : -1;
    return Number(this.seleccionada.stock) + signo * cantidad;
  }

  // ── Acciones ─────────────────────────────────────────────────

  registrarAjuste(): void {
    if (!this.seleccionada) return;

    const cantidad = Math.abs(Number(this.ajuste.cantidad) || 0);
    if (cantidad <= 0) {
      this.alerta.toast({ type: 'warning', title: 'Indique una cantidad mayor a cero' });
      return;
    }

    if (this.stockResultante < 0) {
      this.alerta.toast({
        type: 'warning',
        title: `Solo hay ${this.seleccionada.stock} unidades en este almacén`,
      });
      return;
    }

    this.procesando = true;
    this.cdr.markForCheck();
    const fila = this.seleccionada;

    this.service
      .ajustar({
        id_producto: fila.id_producto,
        id_almacen: fila.id_almacen,
        cantidad: this.ajuste.tipo === 'entrada' ? cantidad : -cantidad,
        motivo: this.ajuste.motivo,
        comentario: this.ajuste.comentario?.trim() || undefined,
      })
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (respuesta) => {
          this.procesando = false;
          this.actualizarStockEnTabla(fila, respuesta.stock);
          this.cdr.markForCheck();
          this.alerta.toast({
            type: 'success',
            title: `Stock actualizado: ${respuesta.stock} unidades`,
          });

          // El formulario queda listo para el siguiente ajuste del mismo producto.
          this.ajuste = { tipo: 'entrada', cantidad: 1, motivo: 'compra', comentario: '' };
          this.cargarResumen();
          this.cerrarPanel();
        },
        error: (error) => {
          this.procesando = false;
          this.cdr.markForCheck();
          this.alerta.error({ title: 'No se pudo ajustar', message: mensajeDeError(error) });
        },
      });
  }

  registrarTransferencia(): void {
    if (!this.seleccionada) return;

    const cantidad = Math.abs(Number(this.transferencia.cantidad) || 0);
    if (!this.transferencia.id_almacen_destino) {
      this.alerta.toast({ type: 'warning', title: 'Elija el almacén de destino' });
      return;
    }
    if (cantidad <= 0 || cantidad > Number(this.seleccionada.stock)) {
      this.alerta.toast({
        type: 'warning',
        title: `La cantidad debe estar entre 1 y ${this.seleccionada.stock}`,
      });
      return;
    }

    this.procesando = true;
    this.cdr.markForCheck();
    const fila = this.seleccionada;

    this.service
      .transferir({
        id_producto: fila.id_producto,
        id_almacen_origen: fila.id_almacen,
        id_almacen_destino: this.transferencia.id_almacen_destino,
        cantidad,
        comentario: this.transferencia.comentario?.trim() || undefined,
      })
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: () => {
          this.procesando = false;
          this.cdr.markForCheck();
          this.alerta.toast({ type: 'success', title: `${cantidad} unidades transferidas` });
          this.transferencia = { id_almacen_destino: null, cantidad: 1, comentario: '' };
          this.cerrarPanel();
          this.cargar();
          this.cargarResumen();
        },
        error: (error) => {
          this.procesando = false;
          this.cdr.markForCheck();
          this.alerta.error({ title: 'No se pudo transferir', message: mensajeDeError(error) });
        },
      });
  }

  // ── Stock mínimo en línea ────────────────────────────────────

  editarMinimo(fila: FilaInventario): void {
    this.edicionMinimo = fila.id_inventario;
    this.valorMinimo = Number(fila.stock_minimo) || 0;
  }

  cancelarMinimo(): void {
    this.edicionMinimo = null;
  }

  guardarMinimo(fila: FilaInventario): void {
    const minimo = Math.max(0, Number(this.valorMinimo) || 0);

    this.service.fijarStockMinimo(fila.id_inventario, minimo)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: () => {
          fila.stock_minimo = minimo;
          fila.estado = this.calcularEstado(fila);
          this.edicionMinimo = null;
          this.destacar(fila.id_inventario);
          this.cdr.markForCheck();
          this.alerta.toast({ type: 'success', title: 'Stock mínimo actualizado' });
        },
        error: (error) => {
          this.edicionMinimo = null;
          this.cdr.markForCheck();
          this.alerta.error({ message: mensajeDeError(error) });
        },
      });
  }

  // ── Auxiliares ───────────────────────────────────────────────

  private actualizarStockEnTabla(fila: FilaInventario, stock: number): void {
    fila.stock = stock;
    fila.valorizado = stock * Number(fila.precio_compra ?? 0);
    fila.estado = this.calcularEstado(fila);
    this.destacar(fila.id_inventario);
  }

  private calcularEstado(fila: FilaInventario): FilaInventario['estado'] {
    if (Number(fila.stock) <= 0) return 'sin_stock';
    if (Number(fila.stock_minimo) > 0 && Number(fila.stock) <= Number(fila.stock_minimo)) return 'bajo';
    return 'ok';
  }

  private destacar(idInventario: number): void {
    this.idDestacado = idInventario;
    setTimeout(() => {
      this.idDestacado = null;
      this.cdr.markForCheck();
    }, 2600);
  }

  claseEstado(estado: string): string {
    const mapa: Record<string, string> = {
      sin_stock: 'adm-insignia--peligro',
      bajo: 'adm-insignia--aviso',
      ok: 'adm-insignia--exito',
    };
    return mapa[estado] ?? 'adm-insignia--neutra';
  }

  textoEstado(estado: string): string {
    const mapa: Record<string, string> = {
      sin_stock: 'Sin stock',
      bajo: 'Bajo mínimo',
      ok: 'Disponible',
    };
    return mapa[estado] ?? estado;
  }

  identificarFila(_indice: number, fila: FilaInventario): number {
    return fila.id_inventario;
  }

  identificarMovimiento(_indice: number, m: MovimientoInventario): number {
    return m.id_movimiento;
  }

  urlDe(ruta?: string | null): string {
    return urlMedia(ruta);
  }

  abrirVistaImagenFila(fila: FilaInventario, evento?: Event): void {
    evento?.stopPropagation();
    const fallback = this.urlDe(fila.imagen_url);
    this.imagenes.listar(fila.id_producto).pipe(takeUntil(this.destruir$)).subscribe({
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
  }

  abrirVistaImagen(ruta?: string | null, evento?: Event): void {
    evento?.stopPropagation();
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
}
