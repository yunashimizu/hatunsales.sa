import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import Swal from 'sweetalert2';

import { AlertService } from '../../../../shared/services/alert.service';
import { ComprobanteService, FiltroComprobantes } from '../../../service/comprobante.service';
import { mensajeDeError } from '../../../service/api-base.service';
import { ComprobanteFila } from '../../../models/admin.models';

/**
 * Listado de comprobantes emitidos.
 *
 * Un comprobante no se edita nunca: una vez enviado a SUNAT solo se puede
 * anular. Los que quedaron en error ni siquiera llegaron allá, así que se
 * pueden reintentar o descartar.
 */
@Component({
  selector: 'app-doc',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './doc.component.html',
  styleUrls: ['./doc.component.css'],
})
export class DocComponent implements OnInit, OnDestroy {

  comprobantes: ComprobanteFila[] = [];
  total = 0;
  pagina = 1;
  porPagina = 20;
  cargando = false;

  filtro: FiltroComprobantes = { texto: '', id_tipo: '', estado: '', desde: '', hasta: '' };

  detalle: any = null;
  cargandoDetalle = false;
  idEnProceso: number | null = null;

  private readonly filtrar$ = new Subject<void>();
  private readonly destruir$ = new Subject<void>();
  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private readonly service: ComprobanteService,
    private readonly alerta: AlertService,
  ) {}

  ngOnInit(): void {
    this.filtrar$
      .pipe(debounceTime(320), takeUntil(this.destruir$))
      .subscribe(() => this.cargar(1));

    this.cargar(1);
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  // ── Listado ──────────────────────────────────────────────────

  cargar(pagina = this.pagina): void {
    this.cargando = true;
    this.cdr.markForCheck();

    this.service
      .listar({ ...this.filtro, pagina, por_pagina: this.porPagina })
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (respuesta) => {
          this.cargando = false;
          this.comprobantes = respuesta.datos;
          this.total = respuesta.total;
          this.pagina = respuesta.pagina;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.cargando = false;
          this.cdr.markForCheck();
          this.alerta.error({
            title: 'No se pudieron cargar los documentos',
            message: mensajeDeError(error),
          });
        },
      });
  }

  alFiltrar(): void {
    this.filtrar$.next();
  }

  limpiarFiltros(): void {
    this.filtro = { texto: '', id_tipo: '', estado: '', desde: '', hasta: '' };
    this.cargar(1);
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.total / this.porPagina));
  }

  irA(pagina: number): void {
    if (pagina < 1 || pagina > this.totalPaginas || pagina === this.pagina) return;
    this.cargar(pagina);
  }

  // ── Detalle ──────────────────────────────────────────────────

  verDetalle(fila: ComprobanteFila): void {
    this.cargandoDetalle = true;
    this.detalle = null;
    this.cdr.markForCheck();

    this.service
      .detalle(fila.id_comprobante)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (detalle) => {
          this.cargandoDetalle = false;
          this.detalle = detalle;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.cargandoDetalle = false;
          this.cdr.markForCheck();
          this.alerta.error({ message: mensajeDeError(error) });
        },
      });
  }

  cerrarDetalle(): void {
    this.detalle = null;
  }

  abrirEnlace(url?: string): void {
    if (url) window.open(url, '_blank', 'noopener');
  }

  descargarPdf(fila: { id_comprobante: number; numero_formateado?: string; serie?: string; numero?: number }): void {
    if (!fila?.id_comprobante) return;
    this.idEnProceso = fila.id_comprobante;
    this.cdr.markForCheck();

    this.service
      .descargarPdf(fila.id_comprobante)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (blob) => {
          this.idEnProceso = null;
          this.cdr.markForCheck();
          const url = URL.createObjectURL(blob);
          const enlace = document.createElement('a');
          enlace.href = url;
          enlace.download = `${fila.numero_formateado || `comprobante_${fila.id_comprobante}`}.pdf`;
          enlace.click();
          URL.revokeObjectURL(url);
          this.alerta.toast({ type: 'success', title: 'PDF descargado' });
        },
        error: (error) => {
          this.idEnProceso = null;
          this.cdr.markForCheck();
          this.alerta.error({
            title: 'No se pudo descargar',
            message: mensajeDeError(error, 'El comprobante todavía no tiene PDF disponible'),
          });
        },
      });
  }

  // ── Anulación ────────────────────────────────────────────────

  async anular(fila: ComprobanteFila): Promise<void> {
    const nuncaSeEnvio = fila.estado === 'error' || fila.estado === 'pendiente';

    const resultado = await Swal.fire({
      icon: 'warning',
      title: nuncaSeEnvio ? '¿Descartar el documento?' : `¿Anular ${fila.numero_formateado}?`,
      html: nuncaSeEnvio
        ? 'Este documento nunca llegó a SUNAT, así que solo se marcará como anulado en el sistema.'
        : `Se enviará la baja a SUNAT. Esta acción no se puede deshacer.
           <div style="margin-top:8px;color:#64748b;font-size:13px">
             ${fila.cliente_denominacion} · S/ ${fila.total.toFixed(2)}
           </div>`,
      input: 'text',
      inputLabel: 'Motivo de la anulación',
      inputPlaceholder: 'Por ejemplo: error en los datos del cliente',
      inputValidator: (valor) =>
        !valor || valor.trim().length < 5 ? 'Escriba un motivo de al menos 5 caracteres' : null,
      showCancelButton: true,
      confirmButtonText: 'Sí, anular',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });

    if (!resultado.isConfirmed) return;

    this.idEnProceso = fila.id_comprobante;
    this.cdr.markForCheck();

    this.service
      .anular(fila.id_comprobante, String(resultado.value).trim())
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: () => {
          this.idEnProceso = null;
          // Se refleja al instante sin recargar toda la tabla.
          fila.anulado = true;
          fila.estado = 'anulado';
          fila.puede_anular = false;
          this.cdr.markForCheck();
          this.alerta.toast({ type: 'success', title: `${fila.numero_formateado} anulado` });
        },
        error: (error) => {
          this.idEnProceso = null;
          this.cdr.markForCheck();
          this.alerta.error({ title: 'No se pudo anular', message: mensajeDeError(error) });
        },
      });
  }

  /** Reconsulta en NUBEFACT los que quedaron sin respuesta. */
  reintentar(fila: ComprobanteFila): void {
    this.idEnProceso = fila.id_comprobante;
    this.cdr.markForCheck();

    this.service
      .reintentar(fila.id_comprobante)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: () => {
          this.idEnProceso = null;
          this.cdr.markForCheck();
          this.alerta.toast({ type: 'success', title: 'El comprobante sí estaba registrado en SUNAT' });
          this.cargar();
        },
        error: (error) => {
          this.idEnProceso = null;
          this.cdr.markForCheck();
          this.alerta.warning({
            title: 'Sigue sin registrarse',
            message: mensajeDeError(error),
          });
        },
      });
  }

  // ── Presentación ─────────────────────────────────────────────

  claseEstado(estado: string): string {
    const mapa: Record<string, string> = {
      aceptado: 'adm-insignia--exito',
      emitido: 'adm-insignia--info',
      pendiente: 'adm-insignia--aviso',
      error: 'adm-insignia--peligro',
      anulado: 'adm-insignia--neutra',
    };
    return mapa[estado] ?? 'adm-insignia--neutra';
  }

  textoEstado(estado: string): string {
    const mapa: Record<string, string> = {
      aceptado: 'Aceptado por SUNAT',
      emitido: 'Emitido',
      pendiente: 'Pendiente de envío',
      error: 'Rechazado',
      anulado: 'Anulado',
    };
    return mapa[estado] ?? estado;
  }

  identificarFila(_indice: number, fila: ComprobanteFila): number {
    return fila.id_comprobante;
  }

  identificarItemDetalle(_indice: number, item: any): string | number {
    return item.id_detalle ?? item.id_producto ?? _indice;
  }
}
