import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  ViewChild,
  computed,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, finalize } from 'rxjs';

import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { descargarArchivo } from '../../../../shared/utils/descargar-archivo';
import { ComprobanteFila, TIPO_FACTURA, TIPO_BOLETA, TIPO_NOTA_CREDITO, TIPO_NOTA_DEBITO } from '../../../models/admin.models';
import { AmbienteFiscal, TEXTO_ESTADO_SUNAT, TonoEstado } from '../../../models/documentos.models';
import { errorOperativo, mensajeDeError, normalizarErrorBlob } from '../../../service/api-base.service';
import { ComprobanteService } from '../../../service/comprobante.service';
import { FiscalEstadoService } from '../../../service/fiscal-estado.service';
import { AccionDetalle, ComprobanteDetalleComponent } from './comprobante-detalle/comprobante-detalle.component';
import {
  ChipAmbiente,
  RUTA_DOCUMENTOS_VENTA,
  chipAmbiente,
  claseInsignia,
  estadoDeComprobante,
  fechaYmdLegible,
  nombreDescarga,
} from './documentos-sunat';
import { NotaCreditoAsistenteComponent } from './nota-credito-asistente/nota-credito-asistente.component';
import { VentasSinComprobanteComponent } from './ventas-sin-comprobante/ventas-sin-comprobante.component';

type Pestana = 'comprobantes' | 'sin-comprobante';

/** Fila con su estado y su ambiente ya resueltos en palabras (se calculan una vez por lectura). */
interface FilaDocumento extends ComprobanteFila {
  vistaEstado: { texto: string; tono: TonoEstado };
  vistaAmbiente: ChipAmbiente;
}

interface FiltroDocumentos {
  texto: string;
  id_tipo: number | '';
  /** Situación de la fila: 'error' | 'pendiente' | 'anulado' ('' = todas). */
  estado: string;
  estado_sunat: string;
  ambiente: AmbienteFiscal | '';
  desde: string;
  hasta: string;
}

const FILTRO_VACIO: Readonly<FiltroDocumentos> = {
  texto: '',
  id_tipo: '',
  estado: '',
  estado_sunat: '',
  ambiente: '',
  desde: '',
  hasta: '',
};

/** Enlaces profundos de Documentos (contrato fijo entre pantallas). */
const PARAMETRO_COMPROBANTE = 'comprobante';
const PARAMETRO_NOTA = 'nota_credito';
const PARAMETRO_PESTANA = 'pestana';

function idDeParametro(params: ParamMap, clave: string): number | null | undefined {
  const valor = params.get(clave);
  if (valor === null) return undefined;
  const id = Number(valor);
  return /^\d+$/.test(valor) && Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

/**
 * Documentos electrónicos: facturas, boletas y notas de crédito con su estado en SUNAT (emisión
 * directa), y las ventas que quedaron sin comprobante. Un comprobante no se edita: desde aquí se
 * reintenta su envío, se recupera su constancia, se le emite una nota de crédito o se anula, siempre
 * según lo que el backend admite (flags puede_*).
 *
 * Enlaces profundos: ?comprobante=<id> abre el detalle, ?nota_credito=<id> el asistente de nota de
 * crédito de ese comprobante y ?pestana=sin-comprobante la pestaña de ventas sin comprobante.
 */
@Component({
  selector: 'app-doc',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ComprobanteDetalleComponent,
    NotaCreditoAsistenteComponent,
    VentasSinComprobanteComponent,
  ],
  templateUrl: './doc.component.html',
  styleUrls: ['./doc.component.css'],
})
export class DocComponent implements OnInit {

  readonly porPagina = 20;
  readonly rutaVenta = RUTA_DOCUMENTOS_VENTA;
  readonly claseInsignia = claseInsignia;
  readonly fechaLegible = fechaYmdLegible;
  readonly tipos = [
    { valor: TIPO_FACTURA, texto: 'Facturas' },
    { valor: TIPO_BOLETA, texto: 'Boletas' },
    { valor: TIPO_NOTA_CREDITO, texto: 'Notas de crédito' },
    { valor: TIPO_NOTA_DEBITO, texto: 'Notas de débito' },
  ];
  readonly estadosSunat = Object.entries(TEXTO_ESTADO_SUNAT).map(([valor, texto]) => ({ valor, texto }));
  /** Situación de la fila, como chips: lo que requiere atención se ve de un toque. */
  readonly situaciones = [
    { valor: '', texto: 'Todos' },
    { valor: 'error', texto: 'Con error' },
    { valor: 'pendiente', texto: 'Esperando a SUNAT' },
    { valor: 'anulado', texto: 'Anulados' },
  ];

  pestana: Pestana = 'comprobantes';
  comprobantes: FilaDocumento[] = [];
  total = 0;
  pagina = 1;
  cargando = false;
  error = '';
  /** CPE pendiente + error (monitor diario). */
  atencion = { pendientes: 0, errores: 0, total: 0 };
  errorMonitor = '';
  filtro: FiltroDocumentos = { ...FILTRO_VACIO };

  idDetalle: number | null = null;
  accionDetalle: AccionDetalle | null = null;
  idAsistente: number | null = null;
  /** Comprobante con una descarga en curso desde la lista. */
  idEnProceso: number | null = null;

  readonly esAdmin: boolean;
  readonly puedeEmitirNota: boolean;

  private readonly service = inject(ComprobanteService);
  private readonly alerta = inject(AlertService);
  private readonly fiscal = inject(FiscalEstadoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filtrar$ = new Subject<void>();
  private lectura: Subscription | null = null;

  @ViewChild(ComprobanteDetalleComponent) private detalle?: ComprobanteDetalleComponent;

  /** Ambiente y estado de la emisión: se avisa ANTES de que una acción termine en 503. */
  readonly avisoEmision = computed(() => {
    const estado = this.fiscal.estado();
    if (!estado) return null;
    if (estado.emision_activa === false) {
      return {
        tono: 'peligro' as const,
        icono: 'bi-pause-circle',
        titulo: 'La emisión electrónica no está activa',
        texto: `${estado.motivo || 'No se envía nada a SUNAT por ahora.'} Las notas de crédito y los comprobantes de ventas pendientes no se podrán emitir hasta reactivarla.`,
      };
    }
    if (estado.ambiente === 'beta') {
      return {
        tono: 'aviso' as const,
        icono: 'bi-cone-striped',
        titulo: 'Emisión de prueba en SUNAT BETA',
        texto: 'Lo que se emita desde aquí se envía a SUNAT BETA y no tiene validez tributaria.',
      };
    }
    return null;
  });

  constructor() {
    const auth = inject(AuthService);
    this.esAdmin = auth.puedeVer(['admin']);
    this.puedeEmitirNota = auth.puedeVer(['admin', 'vendedor']);
  }

  ngOnInit(): void {
    this.fiscal.iniciar();
    this.filtrar$
      .pipe(debounceTime(320), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargar(1));
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.aplicarEnlace(params));
    this.cargar(1);
  }

  get conFiltros(): boolean {
    const f = this.filtro;
    return !!(f.texto || f.id_tipo || f.estado || f.estado_sunat || f.ambiente || f.desde || f.hasta);
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.total / this.porPagina));
  }

  // ── Pestañas y enlaces profundos ─────────────────────────────

  cambiarPestana(pestana: Pestana): void {
    if (pestana === this.pestana) return;
    this.pestana = pestana;
    // La pestaña queda en la URL (sin historial) para que recargar y volver la respeten.
    this.navegarParametros({ [PARAMETRO_PESTANA]: pestana === 'sin-comprobante' ? pestana : null });
  }

  private aplicarEnlace(params: ParamMap): void {
    this.pestana = params.get(PARAMETRO_PESTANA) === 'sin-comprobante' ? 'sin-comprobante' : 'comprobantes';
    const comprobante = idDeParametro(params, PARAMETRO_COMPROBANTE);
    const nota = idDeParametro(params, PARAMETRO_NOTA);
    if (comprobante === null || nota === null) {
      this.alerta.toast({ type: 'warning', title: 'Enlace no válido', message: 'El enlace no indica un comprobante válido.' });
      this.navegarParametros({
        ...(comprobante === null ? { [PARAMETRO_COMPROBANTE]: null } : {}),
        ...(nota === null ? { [PARAMETRO_NOTA]: null } : {}),
      });
    }
    if (comprobante) {
      this.idDetalle = comprobante;
      this.accionDetalle = null;
      // Abrir un comprobante desde un enlace cierra el asistente que lo pidió.
      if (!nota) this.idAsistente = null;
    }
    if (nota) this.idAsistente = nota;
    this.cdr.markForCheck();
  }

  /** Cambia parámetros de la URL sin agregar historial (cerrar un panel no debe dejar un "atrás" que lo reabra). */
  private navegarParametros(parametros: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: parametros,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private limpiarParametro(clave: string): void {
    if (this.route.snapshot.queryParamMap.has(clave)) this.navegarParametros({ [clave]: null });
  }

  // ── Listado ──────────────────────────────────────────────────

  cargar(pagina = this.pagina): void {
    // La última consulta manda: un filtro nuevo cancela la lectura anterior.
    this.lectura?.unsubscribe();
    this.pagina = pagina;
    this.cargando = true;
    this.error = '';
    this.cdr.markForCheck();
    this.lectura = this.service
      .listar({ ...this.filtro, pagina, por_pagina: this.porPagina })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (respuesta) => {
          this.comprobantes = (respuesta.datos ?? []).map((fila) => ({
            ...fila,
            vistaEstado: estadoDeComprobante(fila),
            vistaAmbiente: chipAmbiente(fila.proveedor_fiscal, fila.ambiente_fiscal),
          }));
          this.total = Number(respuesta.total) || 0;
          this.pagina = Number(respuesta.pagina) || pagina;
          this.cargarMonitor();
        },
        error: (e) => {
          this.comprobantes = [];
          this.total = 0;
          this.error = mensajeDeError(e, 'No se pudieron cargar los documentos');
        },
      });
  }

  cargarMonitor(): void {
    this.errorMonitor = '';
    this.service.monitorAtencion().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => {
        this.atencion = {
          pendientes: Number(r?.pendientes ?? 0),
          errores: Number(r?.errores ?? 0),
          total: Number(r?.total ?? 0),
        };
        this.errorMonitor = '';
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.errorMonitor = mensajeDeError(error, 'No se pudo actualizar el monitor de documentos');
        this.cdr.markForCheck();
      },
    });
  }

  verSoloAtencion(): void {
    // Prioriza los rechazados; si no hay, los que esperan respuesta de SUNAT.
    this.elegirSituacion(this.atencion.errores > 0 ? 'error' : 'pendiente');
    if (this.pestana !== 'comprobantes') this.cambiarPestana('comprobantes');
  }

  elegirSituacion(estado: string): void {
    this.filtro.estado = estado;
    this.cargar(1);
  }

  alFiltrar(): void {
    this.filtrar$.next();
  }

  limpiarFiltros(): void {
    this.filtro = { ...FILTRO_VACIO };
    this.cargar(1);
  }

  irA(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginas && pagina !== this.pagina) this.cargar(pagina);
  }

  descargarPdf(fila: ComprobanteFila): void {
    if (this.idEnProceso !== null) return;
    this.idEnProceso = fila.id_comprobante;
    this.service
      .descargarPdf(fila.id_comprobante, 'a4')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.idEnProceso = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) => descargarArchivo(blob, nombreDescarga(fila.numero_formateado, 'pdf_a4')),
        error: async (e) => this.alerta.error(errorOperativo(await normalizarErrorBlob(e), 'No se pudo descargar el PDF')),
      });
  }

  // ── Detalle y asistente ──────────────────────────────────────

  abrirDetalle(id: number | null | undefined, accion: AccionDetalle | null = null): void {
    if (!id) return;
    // Lo abierto a mano manda sobre el enlace con que se llegó (si no, la URL lo volvería a abrir).
    this.limpiarParametro(PARAMETRO_COMPROBANTE);
    this.idDetalle = id;
    this.accionDetalle = accion;
  }

  cerrarDetalle(): void {
    this.idDetalle = null;
    this.accionDetalle = null;
    this.limpiarParametro(PARAMETRO_COMPROBANTE);
  }

  abrirAsistente(id: number): void {
    this.limpiarParametro(PARAMETRO_NOTA);
    this.idAsistente = id;
  }

  cerrarAsistente(): void {
    this.idAsistente = null;
    this.limpiarParametro(PARAMETRO_NOTA);
  }

  /** Una acción del detalle cambió el comprobante: la lista y el monitor se vuelven a leer. */
  alCambiarComprobante(): void {
    this.cargar();
  }

  /** La nota ya se envió a SUNAT: aparece en la lista y el comprobante abierto muestra su saldo nuevo. */
  alEmitirNota(): void {
    this.cargar();
    this.detalle?.cargar();
  }

  alEmitirComprobante(): void {
    this.cargar(1);
  }
}
