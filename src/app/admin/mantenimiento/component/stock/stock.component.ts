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

import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { InventarioAdminService } from '../../../service/inventario-admin.service';
import { mensajeDeError } from '../../../service/api-base.service';
import { Almacen, FilaInventario, ResumenInventario } from '../../../models/admin.models';
import { urlMedia } from '../../../../shared/utils/media-url.util';

type FiltroEstado = 'alertas' | 'sin_stock' | 'bajo' | 'ok' | 'todos';

@Component({
  selector: 'app-stock',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './stock.component.html',
  styleUrl: './stock.component.css',
})
export class StockComponent implements OnInit, OnDestroy {
  filas: FilaInventario[] = [];
  almacenes: Almacen[] = [];
  resumen: ResumenInventario | null = null;

  cargando = false;
  filtroEstado: FiltroEstado = 'alertas';
  idAlmacen: number | '' = '';
  texto = '';

  private readonly destruir$ = new Subject<void>();
  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private readonly service: InventarioAdminService,
    private readonly alerta: AlertService,
    private readonly auth: AuthService,
  ) {}

  /** Inventario (ajustes) solo admin/vendedor. */
  get puedeIrInventario(): boolean {
    return this.auth.puedeEditarCatalogo();
  }

  ngOnInit(): void {
    this.cargarResumen();
    this.cargarAlmacenes();
    this.cargar();
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  get filasVisibles(): FilaInventario[] {
    let lista = this.filas;
    const q = this.texto.trim().toLowerCase();
    if (q) {
      lista = lista.filter((f) =>
        `${f.producto} ${f.sku} ${f.codigo_barras} ${f.almacen} ${f.sucursal} ${f.categoria}`
          .toLowerCase()
          .includes(q),
      );
    }
    if (this.idAlmacen) {
      lista = lista.filter((f) => Number(f.id_almacen) === Number(this.idAlmacen));
    }
    if (this.filtroEstado === 'sin_stock') lista = lista.filter((f) => f.estado === 'sin_stock');
    if (this.filtroEstado === 'bajo') lista = lista.filter((f) => f.estado === 'bajo');
    if (this.filtroEstado === 'ok') lista = lista.filter((f) => f.estado === 'ok');
    if (this.filtroEstado === 'alertas') {
      lista = lista.filter((f) => f.estado === 'sin_stock' || f.estado === 'bajo');
    }
    return lista;
  }

  get totalAlertas(): number {
    return (this.resumen?.sin_stock ?? 0) + (this.resumen?.bajo_stock ?? 0);
  }

  identificarFila(_i: number, f: FilaInventario): string {
    return `${f.id_producto}-${f.id_almacen}`;
  }

  cargar(): void {
    this.cargando = true;
    this.cdr.markForCheck();
    // Pedimos detalle amplio; el filtro fino (sin_stock/bajo/ok) se aplica en pantalla.
    this.service
      .listar({
        solo_alertas: this.modoSoloAlertas(this.filtroEstado),
        id_almacen: this.idAlmacen,
        pagina: 1,
        por_pagina: 200,
      })
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (respuesta) => {
          this.cargando = false;
          this.filas = Array.isArray(respuesta?.datos) ? [...respuesta.datos] : [];
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.cargando = false;
          this.filas = [];
          this.cdr.markForCheck();
          this.alerta.error({
            title: 'No se pudo cargar el stock',
            message: mensajeDeError(error),
          });
        },
      });
  }

  actualizarTodo(): void {
    this.cargarResumen();
    this.cargar();
  }

  /** Solo re-GET si cambia el modo alertas↔completo; entre chips de alerta basta el filtro local. */
  cambiarFiltro(estado: FiltroEstado): void {
    const refetch =
      this.modoSoloAlertas(this.filtroEstado) !== this.modoSoloAlertas(estado);
    this.filtroEstado = estado;
    if (refetch) this.cargar();
    else this.cdr.markForCheck();
  }

  alCambiarAlmacen(): void {
    this.cargar();
  }

  etiquetaEstado(estado: FilaInventario['estado']): string {
    if (estado === 'sin_stock') return 'Sin stock';
    if (estado === 'bajo') return 'Bajo mínimo';
    return 'OK';
  }

  claseEstado(estado: FilaInventario['estado']): string {
    if (estado === 'sin_stock') return 'adm-insignia--peligro';
    if (estado === 'bajo') return 'adm-insignia--aviso';
    return 'adm-insignia--exito';
  }

  moneda(valor: number | null | undefined): string {
    return Number(valor ?? 0).toLocaleString('es-PE', { style: 'currency', currency: 'PEN' });
  }

  urlDe(ruta?: string | null): string {
    return urlMedia(ruta);
  }

  private modoSoloAlertas(f: FiltroEstado): boolean {
    return f === 'alertas' || f === 'sin_stock' || f === 'bajo';
  }

  private cargarResumen(): void {
    this.service.resumen().pipe(takeUntil(this.destruir$)).subscribe({
      next: (r) => {
        this.resumen = r;
        this.cdr.markForCheck();
      },
      error: () => {
        this.resumen = null;
        this.cdr.markForCheck();
      },
    });
  }

  private cargarAlmacenes(): void {
    this.service.almacenes().pipe(takeUntil(this.destruir$)).subscribe({
      next: (lista) => {
        this.almacenes = Array.isArray(lista) ? lista : [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.almacenes = [];
        this.cdr.markForCheck();
      },
    });
  }
}
