import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  OnInit,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, finalize } from 'rxjs';

import { AlertService } from '../../../../../shared/services/alert.service';
import { descargarArchivo } from '../../../../../shared/utils/descargar-archivo';
import { Receptor, TIPO_BOLETA, TIPO_FACTURA } from '../../../../models/admin.models';
import {
  FormatoPdfComprobante,
  ResultadoEmisionVenta,
  SolicitudEmitirComprobanteVenta,
  VentaSinComprobante,
} from '../../../../models/documentos.models';
import {
  codigoDeError,
  errorOperativo,
  esErrorDeRed,
  mensajeDeError,
  normalizarErrorBlob,
} from '../../../../service/api-base.service';
import { ComprobanteService } from '../../../../service/comprobante.service';
import { FiscalEstadoService } from '../../../../service/fiscal-estado.service';
import { ReceptorService } from '../../../../service/receptor.service';
import { RUTA_DOCUMENTOS_VENTA, nombreDescarga } from '../documentos-sunat';
import { ResultadoSunatComponent } from '../resultado-sunat/resultado-sunat.component';

/** Documento del cliente: DNI de 8 dígitos o RUC de 11 (el backend decide cuál es por la longitud). */
const PATRON_DOCUMENTO = /^(\d{8}|\d{11})$/;

function soloDigitos(texto: string | null | undefined): string {
  return String(texto ?? '').replace(/\D/g, '');
}

/**
 * Un backend anterior a esta consulta toma «sin-comprobante» como el id de GET /venta/:id y responde
 * 400 (dato o id no válido) o 404: no es un problema de los filtros, falta actualizar el servidor.
 */
function consultaNoPublicada(error: unknown): boolean {
  const estado = (error as { status?: unknown } | null)?.status;
  const codigo = codigoDeError(error);
  return estado === 404 || (estado === 400 && (codigo === 'DATO_INVALIDO' || codigo === 'ID_INVALIDO'));
}

/**
 * Ventas que quedaron registradas sin factura ni boleta (emisión detenida, SUNAT caída, datos del
 * cliente incompletos…) y su emisión posterior: POST /venta/:id/emitir-comprobante con los montos ya
 * cobrados. El comprobante se envía a SUNAT en el acto y su respuesta se muestra apenas llega.
 */
@Component({
  selector: 'app-ventas-sin-comprobante',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ResultadoSunatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ventas-sin-comprobante.component.html',
  styleUrl: './ventas-sin-comprobante.component.css',
})
export class VentasSinComprobanteComponent implements OnInit {
  /** Se emitió el comprobante de una venta (Documentos vuelve a leer su lista). */
  @Output() readonly emitido = new EventEmitter<ResultadoEmisionVenta>();
  /** Pide abrir el detalle de un comprobante (el recién emitido o el que la venta ya tenía). */
  @Output() readonly verComprobante = new EventEmitter<number>();

  readonly porPagina = 20;
  // Getters y no campos `= CONSTANTE`: en las pruebas, Vite copia la constante importada que es
  // valor de un campo al cargar el módulo, antes de que se inicialice, y el campo quedaría undefined
  // según el orden de los specs.
  get rutaVenta(): string {
    return RUTA_DOCUMENTOS_VENTA;
  }
  get TIPO_FACTURA(): number {
    return TIPO_FACTURA;
  }
  get TIPO_BOLETA(): number {
    return TIPO_BOLETA;
  }

  ventas: VentaSinComprobante[] = [];
  total = 0;
  pagina = 1;
  cargando = false;
  error = '';
  filtro = { desde: '', hasta: '' };

  /** Venta cuya emisión está abierta en el modal. */
  venta: VentaSinComprobante | null = null;
  formulario = { id_tipo: TIPO_BOLETA, documento: '', cliente_denominacion: '', cliente_direccion: '' };
  receptor: Receptor | null = null;
  buscandoReceptor = false;
  avisoReceptor = '';
  /** La consulta del documento no trajo el nombre: se escribe a mano (el backend lo registra). */
  pedirNombre = false;
  emitiendo = false;
  errorEmision = '';
  /** La venta ya tenía comprobante (409): se ofrece abrirlo. */
  idComprobanteExistente: number | null = null;
  /** Sin respuesta del servidor: no se sabe si se emitió; hay que actualizar antes de repetir. */
  emisionIncierta = false;
  resultado: ResultadoEmisionVenta | null = null;
  descargando: FormatoPdfComprobante | null = null;

  private readonly api = inject(ComprobanteService);
  private readonly receptores = inject(ReceptorService);
  private readonly alerta = inject(AlertService);
  private readonly fiscal = inject(FiscalEstadoService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private lectura: Subscription | null = null;
  private busqueda: Subscription | null = null;

  /** Al abrir el modal, el foco entra a él (Escape lo cierra). */
  @ViewChild('marco')
  set marco(elemento: ElementRef<HTMLElement> | undefined) {
    elemento?.nativeElement.focus();
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.total / this.porPagina));
  }

  get conFiltros(): boolean {
    return !!this.filtro.desde || !!this.filtro.hasta;
  }

  /** Rango imposible: se avisa sin consultar (el backend respondería 400 con el mismo texto). */
  get errorFechas(): string {
    const { desde, hasta } = this.filtro;
    return desde && hasta && desde > hasta ? 'La fecha «desde» no puede ser posterior a «hasta».' : '';
  }

  /** Aviso ANTES de emitir: con la emisión detenida, el backend la rechazaría. */
  get emisionInactiva(): string | null {
    const estado = this.fiscal.estado();
    if (estado?.emision_activa !== false) return null;
    return estado.motivo || 'La emisión electrónica no está activa.';
  }

  get esBeta(): boolean {
    const estado = this.fiscal.estado();
    return estado?.ambiente === 'beta' && estado.emision_activa !== false;
  }

  get documentoValido(): boolean {
    return PATRON_DOCUMENTO.test(soloDigitos(this.formulario.documento));
  }

  /** Lo que impide emitir con los datos del formulario ('' = se puede). */
  get errorFormulario(): string {
    const documento = soloDigitos(this.formulario.documento);
    if (this.formulario.documento.trim() && !PATRON_DOCUMENTO.test(documento)) {
      return 'Escriba un DNI de 8 dígitos o un RUC de 11.';
    }
    if (this.formulario.id_tipo === TIPO_FACTURA) {
      const ruc = documento || soloDigitos(this.venta?.documento_cliente);
      if (ruc.length !== 11) return 'Una factura solo se emite a un RUC: escriba el RUC del cliente o elija boleta.';
    }
    if (this.pedirNombre && documento && !this.formulario.cliente_denominacion.trim()) {
      return 'Escriba el nombre o la razón social del cliente.';
    }
    return '';
  }

  ngOnInit(): void {
    this.fiscal.iniciar();
    this.cargar(1);
  }

  cargar(pagina = this.pagina): void {
    this.lectura?.unsubscribe();
    this.pagina = pagina;
    this.error = '';
    if (this.errorFechas) {
      this.ventas = [];
      this.total = 0;
      this.cargando = false;
      this.cdr.markForCheck();
      return;
    }
    this.cargando = true;
    this.cdr.markForCheck();
    this.lectura = this.api
      .ventasSinComprobante({ ...this.filtro, pagina, por_pagina: this.porPagina })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (respuesta) => {
          this.ventas = respuesta.datos ?? [];
          this.total = Number(respuesta.total) || 0;
          this.pagina = Number(respuesta.pagina) || pagina;
        },
        error: (e) => {
          this.ventas = [];
          this.total = 0;
          this.error = consultaNoPublicada(e)
            ? 'El servidor todavía no tiene esta consulta: falta publicar la actualización del sistema. Avise a sistemas; las ventas y sus cobros no se ven afectados.'
            : mensajeDeError(e, 'No se pudieron consultar las ventas sin comprobante');
        },
      });
  }

  irA(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginas && pagina !== this.pagina) this.cargar(pagina);
  }

  limpiarFiltros(): void {
    this.filtro = { desde: '', hasta: '' };
    this.cargar(1);
  }

  // ── Emisión ──────────────────────────────────────────────────

  abrirEmision(venta: VentaSinComprobante): void {
    const documento = soloDigitos(venta.documento_cliente);
    this.venta = venta;
    this.formulario = {
      id_tipo: documento.length === 11 ? TIPO_FACTURA : TIPO_BOLETA,
      documento: PATRON_DOCUMENTO.test(documento) ? documento : '',
      cliente_denominacion: '',
      cliente_direccion: '',
    };
    this.receptor = null;
    this.avisoReceptor = '';
    this.pedirNombre = false;
    this.errorEmision = '';
    this.idComprobanteExistente = null;
    this.emisionIncierta = false;
    this.resultado = null;
    this.fiscal.iniciar();
  }

  cerrarEmision(): void {
    if (this.emitiendo) return;
    this.busqueda?.unsubscribe();
    this.venta = null;
  }

  elegirTipo(idTipo: number): void {
    if (!this.emitiendo) this.formulario.id_tipo = idTipo;
  }

  alCambiarDocumento(): void {
    // Otro documento: lo consultado antes ya no vale.
    this.receptor = null;
    this.avisoReceptor = '';
    this.pedirNombre = false;
  }

  buscarReceptor(): void {
    const documento = soloDigitos(this.formulario.documento);
    if (!PATRON_DOCUMENTO.test(documento) || this.buscandoReceptor) return;
    this.busqueda?.unsubscribe();
    this.buscandoReceptor = true;
    this.avisoReceptor = '';
    this.busqueda = this.receptores
      .buscar(documento)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.buscandoReceptor = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (receptor) => {
          this.receptor = receptor;
          this.pedirNombre = !receptor?.denominacion?.trim();
          if (this.pedirNombre) this.avisoReceptor = 'No se encontró el nombre del cliente: escríbalo a mano.';
          else if (receptor.advertencia) this.avisoReceptor = receptor.advertencia;
        },
        error: (e) => {
          this.receptor = null;
          this.pedirNombre = true;
          this.avisoReceptor = `${mensajeDeError(e, 'No se pudo consultar el documento')}. Puede escribir el nombre a mano.`;
        },
      });
  }

  emitir(): void {
    const venta = this.venta;
    if (!venta || this.emitiendo || this.errorFormulario || this.emisionInactiva) return;
    const documento = soloDigitos(this.formulario.documento);
    const solicitud: SolicitudEmitirComprobanteVenta = { id_tipo: this.formulario.id_tipo };
    if (documento) solicitud.documento = documento;
    if (this.pedirNombre && this.formulario.cliente_denominacion.trim()) {
      solicitud.cliente_denominacion = this.formulario.cliente_denominacion.trim();
      if (this.formulario.cliente_direccion.trim()) solicitud.cliente_direccion = this.formulario.cliente_direccion.trim();
    }

    this.emitiendo = true;
    this.errorEmision = '';
    this.idComprobanteExistente = null;
    this.emisionIncierta = false;
    this.resultado = null;
    this.cdr.markForCheck();
    this.api
      .emitirComprobanteDeVenta(venta.id_venta, solicitud)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.emitiendo = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (respuesta) => {
          this.resultado = respuesta;
          if (respuesta.comprobante) this.emitido.emit(respuesta);
          // Emitida, la venta sale de la lista; si no, sigue con su nuevo motivo.
          this.cargar(this.pagina);
        },
        error: (e) => {
          this.errorEmision = mensajeDeError(e, 'No se pudo emitir el comprobante');
          if (codigoDeError(e) === 'VENTA_CON_COMPROBANTE') {
            this.idComprobanteExistente = Number((e as { error?: { id_comprobante?: unknown } }).error?.id_comprobante) || null;
            this.cargar(this.pagina);
          }
          this.emisionIncierta = esErrorDeRed(e);
        },
      });
  }

  abrirComprobante(id: number | null | undefined): void {
    if (!id) return;
    this.verComprobante.emit(id);
    this.venta = null;
  }

  descargarPdf(formato: FormatoPdfComprobante): void {
    const comprobante = this.resultado?.comprobante;
    if (!comprobante?.id_comprobante || this.descargando) return;
    const id = comprobante.id_comprobante;
    this.descargando = formato;
    this.api
      .descargarPdf(id, formato)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.descargando = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) =>
          descargarArchivo(blob, nombreDescarga(comprobante.numero_formateado ?? `comprobante-${id}`, formato === 'ticket' ? 'pdf_ticket' : 'pdf_a4')),
        error: async (e) => this.alerta.error(errorOperativo(await normalizarErrorBlob(e), 'No se pudo descargar el PDF')),
      });
  }
}
