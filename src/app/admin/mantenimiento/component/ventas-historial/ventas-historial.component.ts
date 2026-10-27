import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, finalize } from 'rxjs';

import { AlertService } from '../../../../shared/services/alert.service';
import { descargarArchivo } from '../../../../shared/utils/descargar-archivo';
import { TIPO_BOLETA, TIPO_FACTURA, TIPO_NOTA_CREDITO } from '../../../models/admin.models';
import {
  FormatoPdfComprobante,
  TonoEstado,
  VentaDocumentosResponse,
  VentaHistorialFila,
} from '../../../models/documentos.models';
import {
  codigoDeError,
  errorOperativo,
  mensajeDeError,
  normalizarErrorBlob,
} from '../../../service/api-base.service';
import { ComprobanteService } from '../../../service/comprobante.service';
import { AccionDetalle, ComprobanteDetalleComponent } from '../doc/comprobante-detalle/comprobante-detalle.component';
import {
  RUTA_DOCUMENTOS,
  RUTA_GUIAS,
  claseAviso,
  claseInsignia,
  estadoDeComprobante,
  nombreDescarga,
} from '../doc/documentos-sunat';
import { NotaCreditoAsistenteComponent } from '../doc/nota-credito-asistente/nota-credito-asistente.component';

const PARAMETRO_VENTA = 'venta';

/** Filtros del historial: los mismos nombres que GET /venta, con '' = sin filtro. */
export interface FiltroHistorial {
  texto: string;
  /** 'activa' | 'anulada'. */
  estado: string;
  /** 'si' | 'no'. */
  tiene_comprobante: string;
  /** 'mostrador' | 'tienda'. */
  origen: string;
  desde: string;
  hasta: string;
}

export const FILTRO_HISTORIAL_VACIO: Readonly<FiltroHistorial> = {
  texto: '',
  estado: '',
  tiene_comprobante: '',
  origen: '',
  desde: '',
  hasta: '',
};

/** Fila con lo que se pinta ya resuelto en palabras (se calcula una vez por lectura). */
export interface FilaHistorial extends VentaHistorialFila {
  vistaEstadoVenta: { texto: string; tono: TonoEstado };
  vistaComprobante: { texto: string; tono: TonoEstado } | null;
  nombreTipo: string;
}

export type RangoRapido = 'hoy' | 'ayer' | '7dias' | 'mes';

/** 'aaaa-mm-dd' del día de Lima; `ahora` se inyecta para poder probarlo. */
export function hoyEnLima(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

function sumarDias(ymd: string, dias: number): string {
  const [a, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Rango de fechas (días de Lima) de cada atajo. */
export function rangoDe(rango: RangoRapido, hoy: string = hoyEnLima()): { desde: string; hasta: string } {
  switch (rango) {
    case 'hoy':
      return { desde: hoy, hasta: hoy };
    case 'ayer': {
      const ayer = sumarDias(hoy, -1);
      return { desde: ayer, hasta: ayer };
    }
    case '7dias':
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case 'mes':
      return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
  }
}

function enteroPositivo(valor: string | null): number | null {
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Una celda de CSV: comillas dobles escapadas y sin fórmulas (=, +, -, @) que Excel ejecutaría. */
function celdaCsv(valor: unknown): string {
  let texto = String(valor ?? '');
  if (/^[=+\-@]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}

/**
 * Historial de ventas: todas las ventas con su comprobante vigente, notas y guías (GET /venta), y el
 * detalle documental de cada una (GET /venta/:id/documentos) con lo que se puede hacer hoy: ver o
 * descargar el comprobante, emitir una nota de crédito, llegar a su guía o emitir lo que falta.
 *
 * Enlace profundo: ?venta=<id> abre el detalle de esa venta (lo usan Documentos y Guías).
 */
@Component({
  selector: 'app-ventas-historial',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ComprobanteDetalleComponent, NotaCreditoAsistenteComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ventas-historial.component.html',
  styleUrl: './ventas-historial.component.css',
})
export class VentasHistorialComponent implements OnInit {
  readonly porPagina = 20;
  readonly claseInsignia = claseInsignia;
  readonly claseAviso = claseAviso;
  readonly estadoDe = estadoDeComprobante;
  // Getters y no campos `= CONSTANTE`: en las pruebas, Vite copia la constante importada que es valor de un
  // campo al cargar el módulo, antes de que se inicialice, y el enlace quedaría sin ruta según el orden de los specs.
  get rutaDocumentos(): string {
    return RUTA_DOCUMENTOS;
  }
  get rutaGuias(): string {
    return RUTA_GUIAS;
  }
  readonly rangos: ReadonlyArray<{ valor: RangoRapido; texto: string }> = [
    { valor: 'hoy', texto: 'Hoy' },
    { valor: 'ayer', texto: 'Ayer' },
    { valor: '7dias', texto: 'Últimos 7 días' },
    { valor: 'mes', texto: 'Este mes' },
  ];

  filtro: FiltroHistorial = { ...FILTRO_HISTORIAL_VACIO };
  filas: FilaHistorial[] = [];
  total = 0;
  pagina = 1;
  cargando = false;
  error = '';

  /** Venta abierta en el detalle. */
  idVenta: number | null = null;
  documentos: VentaDocumentosResponse | null = null;
  cargandoDocumentos = false;
  errorDocumentos = '';
  descargando: string | null = null;

  /** Comprobante o asistente de nota de crédito abiertos desde el detalle. */
  idComprobante: number | null = null;
  accionComprobante: AccionDetalle | null = null;
  idAsistente: number | null = null;

  private readonly api = inject(ComprobanteService);
  private readonly alerta = inject(AlertService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filtrar$ = new Subject<void>();
  private lectura: Subscription | null = null;
  private lecturaDocumentos: Subscription | null = null;

  @ViewChild(ComprobanteDetalleComponent) private detalleComprobante?: ComprobanteDetalleComponent;

  /** Al abrir el detalle, el foco entra a él (Escape lo cierra). */
  @ViewChild('marco')
  set marco(elemento: ElementRef<HTMLElement> | undefined) {
    elemento?.nativeElement.focus();
  }

  ngOnInit(): void {
    this.filtrar$.pipe(debounceTime(320), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cargar(1));
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => this.aplicarEnlace(params));
    this.cargar(1);
  }

  // ── Resumen de lo que se ve ──────────────────────────────────

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.total / this.porPagina));
  }

  get conFiltros(): boolean {
    const f = this.filtro;
    return !!(f.texto.trim() || f.estado || f.tiene_comprobante || f.origen || f.desde || f.hasta);
  }

  /** Rango imposible: se avisa sin consultar (el backend respondería 400 con el mismo texto). */
  get errorFechas(): string {
    const { desde, hasta } = this.filtro;
    return desde && hasta && desde > hasta ? 'La fecha «desde» no puede ser posterior a «hasta».' : '';
  }

  /** Suma de las ventas vigentes de la página que se ve (las anuladas no cuentan). */
  get totalPagina(): number {
    return this.filas.filter((f) => f.estado !== 'anulada').reduce((suma, f) => suma + f.total, 0);
  }

  get anuladasPagina(): number {
    return this.filas.filter((f) => f.estado === 'anulada').length;
  }

  /** Ventas activas de la página sin factura ni boleta vigente. */
  get sinComprobantePagina(): number {
    return this.filas.filter((f) => f.estado !== 'anulada' && !f.id_comprobante).length;
  }

  get rangoActivo(): RangoRapido | null {
    const { desde, hasta } = this.filtro;
    if (!desde || !hasta) return null;
    const hoy = hoyEnLima();
    return this.rangos.find((r) => {
      const rango = rangoDe(r.valor, hoy);
      return rango.desde === desde && rango.hasta === hasta;
    })?.valor ?? null;
  }

  // ── Listado ──────────────────────────────────────────────────

  cargar(pagina = this.pagina): void {
    // La última consulta manda: un filtro nuevo cancela la lectura anterior.
    this.lectura?.unsubscribe();
    this.pagina = pagina;
    this.error = '';
    if (this.errorFechas) {
      this.filas = [];
      this.total = 0;
      this.cargando = false;
      this.cdr.markForCheck();
      return;
    }
    this.cargando = true;
    this.cdr.markForCheck();
    const { texto, estado, tiene_comprobante, origen, desde, hasta } = this.filtro;
    this.lectura = this.api
      .historialVentas({
        texto: texto.trim(),
        estado,
        tiene_comprobante: tiene_comprobante === 'si' || tiene_comprobante === 'no' ? tiene_comprobante : undefined,
        origen,
        desde,
        hasta,
        pagina,
        por_pagina: this.porPagina,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (respuesta) => {
          this.filas = (respuesta.datos ?? []).map((fila) => this.resolver(fila));
          this.total = Number(respuesta.total) || 0;
          this.pagina = Number(respuesta.pagina) || pagina;
        },
        error: (e) => {
          this.filas = [];
          this.total = 0;
          this.error = mensajeDeError(e, 'No se pudo cargar el historial de ventas');
        },
      });
  }

  private resolver(fila: VentaHistorialFila): FilaHistorial {
    const anulada = fila.estado === 'anulada';
    return {
      ...fila,
      vistaEstadoVenta: anulada ? { texto: 'Anulada', tono: 'neutro' } : { texto: 'Activa', tono: 'exito' },
      vistaComprobante: fila.id_comprobante
        ? estadoDeComprobante({
            estado: fila.comprobante_estado ?? '',
            anulado: false,
            estado_sunat: fila.comprobante_estado_sunat,
          })
        : null,
      nombreTipo:
        fila.comprobante_tipo === TIPO_FACTURA
          ? 'Factura'
          : fila.comprobante_tipo === TIPO_BOLETA
            ? 'Boleta'
            : fila.comprobante_tipo === TIPO_NOTA_CREDITO
              ? 'Nota de crédito'
              : 'Comprobante',
    };
  }

  alFiltrar(): void {
    this.filtrar$.next();
  }

  elegirRango(rango: RangoRapido): void {
    this.filtro = { ...this.filtro, ...(this.rangoActivo === rango ? { desde: '', hasta: '' } : rangoDe(rango)) };
    this.cargar(1);
  }

  limpiarFiltros(): void {
    this.filtro = { ...FILTRO_HISTORIAL_VACIO };
    this.cargar(1);
  }

  irA(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginas && pagina !== this.pagina) this.cargar(pagina);
  }

  /** Las ventas que se ven (la página actual) en un CSV que abre Excel, con las cifras tal cual. */
  exportarCsv(): void {
    if (!this.filas.length) return;
    const cabecera = ['Venta', 'Fecha', 'Origen', 'Cliente', 'Ítems', 'Medios de pago', 'Total', 'Estado', 'Comprobante', 'Estado SUNAT', 'Notas', 'Guías'];
    const filas = this.filas.map((f) => [
      f.id_venta,
      f.fecha.slice(0, 16).replace('T', ' '),
      f.origen,
      f.cliente_denominacion,
      f.cantidad_items,
      f.metodos_pago,
      f.total.toFixed(2),
      f.vistaEstadoVenta.texto,
      f.comprobante ?? '',
      f.vistaComprobante?.texto ?? '',
      f.cantidad_notas,
      f.cantidad_guias,
    ]);
    const csv = [cabecera, ...filas].map((fila) => fila.map(celdaCsv).join(',')).join('\r\n');
    // BOM: Excel reconoce así las tildes (UTF-8).
    descargarArchivo(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }), `ventas-pagina-${this.pagina}.csv`);
  }

  // ── Detalle de la venta ──────────────────────────────────────

  private aplicarEnlace(params: ParamMap): void {
    if (!params.has(PARAMETRO_VENTA)) return;
    const id = enteroPositivo(params.get(PARAMETRO_VENTA));
    if (id === null) {
      this.alerta.toast({ type: 'warning', title: 'Enlace no válido', message: 'El enlace no indica una venta válida.' });
      this.quitarParametro();
      return;
    }
    if (id !== this.idVenta) this.abrirVenta(id, false);
  }

  abrirVenta(id: number, actualizarUrl = true): void {
    this.idVenta = id;
    this.idComprobante = null;
    this.idAsistente = null;
    if (actualizarUrl) this.navegar({ [PARAMETRO_VENTA]: String(id) });
    this.cargarDocumentos();
  }

  cerrarVenta(): void {
    this.lecturaDocumentos?.unsubscribe();
    this.idVenta = null;
    this.documentos = null;
    this.errorDocumentos = '';
    this.quitarParametro();
    this.cdr.markForCheck();
  }

  cargarDocumentos(): void {
    const id = this.idVenta;
    if (id === null) return;
    this.lecturaDocumentos?.unsubscribe();
    this.cargandoDocumentos = true;
    this.errorDocumentos = '';
    this.cdr.markForCheck();
    this.lecturaDocumentos = this.api
      .documentosDeVenta(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargandoDocumentos = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (respuesta) => (this.documentos = respuesta),
        error: (e) => {
          this.documentos = null;
          this.errorDocumentos =
            codigoDeError(e) === 'VENTA_NO_ENCONTRADA' || (e as { status?: unknown } | null)?.status === 404
              ? `No existe la venta ${id}.`
              : mensajeDeError(e, 'No se pudieron cargar los documentos de la venta');
        },
      });
  }

  /** Cambios en el comprobante o en sus notas: el detalle y la lista se vuelven a leer. */
  alCambiarDocumentos(): void {
    this.cargar();
    this.cargarDocumentos();
  }

  abrirComprobante(id: number | null | undefined, accion: AccionDetalle | null = null): void {
    if (!id) return;
    this.idComprobante = id;
    this.accionComprobante = accion;
  }

  cerrarComprobante(): void {
    this.idComprobante = null;
    this.accionComprobante = null;
    this.alCambiarDocumentos();
  }

  abrirAsistente(id: number): void {
    this.idAsistente = id;
  }

  cerrarAsistente(): void {
    this.idAsistente = null;
  }

  alEmitirNota(): void {
    this.alCambiarDocumentos();
    this.detalleComprobante?.cargar();
  }

  descargarPdf(idComprobante: number, numero: string, formato: FormatoPdfComprobante): void {
    if (this.descargando) return;
    this.descargando = `${idComprobante}-${formato}`;
    this.cdr.markForCheck();
    this.api
      .descargarPdf(idComprobante, formato)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.descargando = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) => descargarArchivo(blob, nombreDescarga(numero, formato === 'ticket' ? 'pdf_ticket' : 'pdf_a4')),
        error: async (e) => this.alerta.error(errorOperativo(await normalizarErrorBlob(e), 'No se pudo descargar el PDF')),
      });
  }

  // ── URL ──────────────────────────────────────────────────────

  private quitarParametro(): void {
    if (this.route.snapshot.queryParamMap.has(PARAMETRO_VENTA)) this.navegar({ [PARAMETRO_VENTA]: null });
  }

  /** Cambia parámetros de la URL sin agregar historial (cerrar un panel no debe dejar un «atrás» que lo reabra). */
  private navegar(parametros: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: parametros,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
