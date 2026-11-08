import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription, finalize } from 'rxjs';
import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { descargarArchivo } from '../../../../shared/utils/descargar-archivo';
import { AmbienteFiscal, LoteSunat, ResultadoLote, ResultadoResumen, TipoArchivoLote } from '../../../models/fiscal.models';
import {
  errorOperativo,
  mensajeDeError,
  normalizarErrorBlob,
} from '../../../service/api-base.service';
import { FiscalAdminService } from '../../../service/fiscal-admin.service';
import { fechaYmdCorta, hoyLimaYmd, nombreEstadoEnvio, nombreLote } from '../../../mantenimiento/component/doc/documentos-sunat';
import { QueHacerSunatComponent } from '../que-hacer/que-hacer-sunat.component';

const CLASES_ESTADO: Readonly<Record<string, string>> = {
  ACEPTADO: 'adm-insignia--exito',
  ACEPTADO_OBS: 'adm-insignia--exito',
  RECHAZADO: 'adm-insignia--peligro',
  EXCEPCION: 'adm-insignia--peligro',
  ENVIANDO: 'adm-insignia--aviso',
  PENDIENTE_REENVIO: 'adm-insignia--aviso',
  TICKET_PENDIENTE: 'adm-insignia--aviso',
};

const NOMBRES_ARCHIVO: Readonly<Record<TipoArchivoLote, string>> = {
  xml_firmado: 'XML firmado',
  zip: 'ZIP enviado',
  cdr_xml: 'Constancia de SUNAT (XML)',
  cdr_zip: 'Constancia de SUNAT (ZIP)',
};

/** Comprobantes que se nombran en la fila; el resto se resume como «+N». */
const LINEAS_VISIBLES = 3;

/** Consultas rápidas del ticket; después el sistema consulta cada 2 horas hasta 7 días desde que se registró el lote. */
const CONSULTAS_RAPIDAS = 12;
const DIAS_CONSULTA_TICKET = 7;

function nombreDescarga(lote: LoteSunat, tipo: TipoArchivoLote): string {
  const base = lote.identificador || `lote-${lote.id_envio}`;
  switch (tipo) {
    case 'zip':
      return `${base}.zip`;
    case 'xml_firmado':
      return `${base}.xml`;
    case 'cdr_zip':
      return `R-${base}.zip`;
    case 'cdr_xml':
      return `R-${base}.xml`;
  }
}

/**
 * Comunicaciones de baja (RA) de facturas y resúmenes diarios (RC) enviados a SUNAT: con boletas anuladas (anulan sin
 * nota de crédito) o con las boletas del día que se informan en un resumen («Resumen de boletas del dd/mm»). Un lote con
 * ticket se consulta de nuevo con «Reintentar / Consultar»; el servidor decide si reenvía o consulta según el estado.
 * «Enviar resumen del día» (solo administrador) crea el resumen de una fecha de emisión con las boletas por informar.
 */
@Component({
  selector: 'app-lotes-sunat',
  standalone: true,
  imports: [CommonModule, FormsModule, QueHacerSunatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lotes-sunat.component.html',
  styleUrl: './lotes-sunat.component.css',
})
export class LotesSunatComponent implements OnInit, OnChanges {
  /** Ambiente vigente: es el filtro inicial (el otro se ve cambiando el filtro). */
  @Input() ambienteVigente: AmbienteFiscal = 'beta';
  /** Tras una acción que cambió un lote (el panel vuelve a leer el estado de la emisión). */
  @Output() readonly cambio = new EventEmitter<void>();

  readonly nombresArchivo = NOMBRES_ARCHIVO;
  readonly lineasVisibles = LINEAS_VISIBLES;
  readonly porPagina = 20;
  ambiente: AmbienteFiscal | '' = '';
  lotes: LoteSunat[] = [];
  total = 0;
  pagina = 1;
  cargando = false;
  error = '';
  /** Lote con una acción o descarga en curso. */
  idEnProceso: number | null = null;
  /** yyyy-mm-dd: día de emisión de las boletas del resumen que se envía a mano (por omisión, hoy en Lima). */
  fechaResumen = hoyLimaYmd();
  /** Primer día (7 días atrás) que admite el resumen diario. */
  readonly fechaMinimaResumen = hoyLimaYmd(new Date(Date.now() - 7 * 86_400_000));
  readonly fechaMaximaResumen = hoyLimaYmd();
  enviandoResumen = false;

  private readonly api = inject(FiscalAdminService);
  private readonly auth = inject(AuthService);
  private readonly alerta = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private lectura: Subscription | null = null;
  private iniciado = false;

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.total / this.porPagina));
  }

  get conFiltros(): boolean {
    return this.ambiente !== this.ambienteVigente;
  }

  ngOnInit(): void {
    this.iniciado = true;
    this.mostrar();
  }

  ngOnChanges(cambios: SimpleChanges): void {
    // Al pasar de BETA a producción (o volver) se muestran los lotes del ambiente nuevo.
    if (this.iniciado && cambios['ambienteVigente'] && !cambios['ambienteVigente'].firstChange) this.mostrar();
  }

  mostrar(): void {
    this.ambiente = this.ambienteVigente;
    this.cargar(1);
  }

  cargar(pagina = this.pagina): void {
    // La última consulta manda: un filtro nuevo cancela la lectura anterior.
    this.lectura?.unsubscribe();
    this.pagina = pagina;
    this.cargando = true;
    this.error = '';
    this.lectura = this.api
      .lotes({ ambiente: this.ambiente, pagina, por_pagina: this.porPagina })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (respuesta) => {
          this.lotes = respuesta.datos ?? [];
          this.total = Number(respuesta.total) || 0;
          this.pagina = Number(respuesta.pagina) || pagina;
        },
        error: (e) => {
          this.lotes = [];
          this.total = 0;
          this.error = mensajeDeError(e, 'No se pudieron consultar las bajas y resúmenes');
        },
      });
  }

  irA(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginas && pagina !== this.pagina) this.cargar(pagina);
  }

  nombreEstado(estado: string): string {
    return nombreEstadoEnvio(estado);
  }

  claseEstado(estado: string): string {
    return CLASES_ESTADO[estado] ?? 'adm-insignia--neutra';
  }

  nombreTipo(lote: LoteSunat): string {
    if (this.esResumenDeBoletas(lote)) return 'Resumen diario';
    return lote.operacion === 'baja' ? 'Baja' : 'Resumen';
  }

  /** Resumen diario que INFORMA boletas (condición 1), no el que anula una (condición 3). */
  esResumenDeBoletas(lote: LoteSunat): boolean {
    return lote.operacion === 'resumen' && lote.lineas.length > 0 && lote.lineas.every((l) => l.condicion === 1);
  }

  /** «Baja del 05/11 (n.º 1)» o «Resumen del 05/11 (n.º 2)»: el identificador RA-/RC- va solo en el `title`. */
  nombreLote(lote: LoteSunat): string {
    return nombreLote(lote.identificador).texto;
  }

  /** «Resumen de boletas del 03/11 · 2 boletas»; el resto de los lotes muestra su nombre en palabras. */
  tituloLote(lote: LoteSunat): string {
    if (!this.esResumenDeBoletas(lote)) return this.nombreLote(lote);
    const n = lote.lineas.length;
    const fecha = lote.fecha_referencia ? fechaYmdCorta(lote.fecha_referencia) : '';
    return `Resumen de boletas${fecha ? ` del ${fecha}` : ''} · ${n} ${n === 1 ? 'boleta' : 'boletas'}`;
  }

  documento(linea: LoteSunat['lineas'][number]): string {
    return `${linea.serie}-${linea.numero}`;
  }

  /** Reenvía (pendiente de reenvío) o consulta el ticket (ticket pendiente, o sin resolver en 7 días: el servidor lo marca LIBERAR). */
  puedeReintentar(lote: LoteSunat): boolean {
    return (
      lote.estado === 'PENDIENTE_REENVIO' ||
      lote.estado === 'TICKET_PENDIENTE' ||
      (lote.estado === 'EXCEPCION' && !!lote.sunat_ticket && this.ticketSinResolver(lote))
    );
  }

  /** «Liberar» (solo administrador): el ticket no se resolvió y el lote sigue reteniendo a sus comprobantes. */
  puedeLiberar(lote: LoteSunat): boolean {
    return this.esAdmin && lote.estado === 'EXCEPCION' && !!lote.sunat_ticket && this.ticketSinResolver(lote);
  }

  get esAdmin(): boolean {
    return this.auth.puedeVer(['admin']);
  }

  textoReintentar(lote: LoteSunat): string {
    return lote.estado === 'PENDIENTE_REENVIO' ? 'Reintentar' : 'Consultar ahora';
  }

  /**
   * ¿Tarjeta «¿Qué hacer?» con las acciones al lado? Cuando el lote necesita a una persona: «Requiere revisión»
   * (consultar de nuevo, liberar) o un número de seguimiento que SUNAT lleva más de 12 consultas sin resolver.
   */
  conTarjeta(lote: LoteSunat): boolean {
    if (!this.indicacion(lote)) return false;
    return lote.estado === 'EXCEPCION' || (lote.estado === 'TICKET_PENDIENTE' && lote.intento - 1 >= CONSULTAS_RAPIDAS);
  }

  /** Qué está pasando con un lote que tarda y qué se puede hacer (el texto va junto a los botones). */
  indicacion(lote: LoteSunat): string {
    const resumen = this.esResumenDeBoletas(lote);
    if (lote.estado === 'TICKET_PENDIENTE' && lote.intento - 1 >= CONSULTAS_RAPIDAS) {
      return (
        `SUNAT todavía no responde este número de seguimiento. El sistema lo consulta cada 2 horas hasta el ${this.fechaLimiteConsulta(lote)}; ` +
        (resumen ? 'mientras tanto las boletas quedan en este resumen. Puede consultarlo ahora.' : 'mientras tanto el comprobante queda con la baja en proceso. Puede consultarlo ahora.')
      );
    }
    if (resumen && lote.estado === 'RECHAZADO') {
      return 'SUNAT rechazó este resumen: las boletas volvieron a quedar por informar. Revise el motivo y, si corresponde, envíe el resumen del día otra vez.';
    }
    if (resumen && lote.estado === 'EXCEPCION' && lote.accion_sunat === 'LIBERAR') {
      return (
        'SUNAT no resolvió el número de seguimiento en 7 días. Consúltelo de nuevo; si busca las boletas en SUNAT Operaciones en Línea y no figuran, ' +
        'libere el lote: vuelven a quedar por informar mientras estén dentro de los 7 días de su emisión.'
      );
    }
    if (lote.estado === 'EXCEPCION' && lote.accion_sunat === 'LIBERAR') {
      return (
        'SUNAT no resolvió el número de seguimiento en 7 días. Consúltelo de nuevo; si ya buscó el comprobante en SUNAT Operaciones en Línea y la baja no figura, ' +
        'libere el lote: el comprobante vuelve a su estado anterior.'
      );
    }
    if (lote.estado === 'EXCEPCION' && lote.accion_sunat === 'CONSULTAR_TICKET') {
      return 'SUNAT no resolvió el número de seguimiento tras varias consultas. Consúltelo de nuevo o, tras revisar en SUNAT Operaciones en Línea, libere el lote.';
    }
    if (lote.estado === 'EXCEPCION' && lote.accion_sunat === 'LIBERADO') {
      return 'Lote liberado: los comprobantes volvieron a su estado anterior. Si todavía está dentro de los 7 días de la emisión, pida la baja de nuevo; si no, anule con nota de crédito.';
    }
    return '';
  }

  async reintentar(lote: LoteSunat): Promise<void> {
    if (this.idEnProceso !== null) return;
    const reenvia = lote.estado === 'PENDIENTE_REENVIO';
    const confirmado = await this.alerta.confirmar({
      title: reenvia ? `¿Reintentar el envío de «${this.nombreLote(lote)}»?` : `¿Consultar ahora «${this.nombreLote(lote)}»?`,
      message: reenvia
        ? 'Se vuelve a mandar a SUNAT el mismo archivo firmado: no se crea un lote nuevo.'
        : this.esResumenDeBoletas(lote)
          ? 'Se pregunta a SUNAT si ya resolvió este resumen. Si lo aceptó, las boletas quedan aceptadas; si lo rechazó, vuelven a quedar por informar.'
          : 'Se pregunta a SUNAT si ya resolvió este lote. Si lo aceptó, los comprobantes quedan anulados; si lo rechazó, vuelven a su estado anterior.',
      confirmText: reenvia ? 'Sí, reintentar' : 'Sí, consultar',
      type: 'question',
    });
    if (!confirmado || this.destroyRef.destroyed || this.idEnProceso !== null) return;
    this.ejecutar(lote, this.api.reintentarLote(lote.id_envio), 'No se pudo reintentar la baja o el resumen');
  }

  async liberar(lote: LoteSunat): Promise<void> {
    if (this.idEnProceso !== null || !this.esAdmin) return;
    const comprobantes = lote.lineas.map((l) => this.documento(l)).join(', ');
    const confirmado = await this.alerta.confirmarPeligro({
      title: `¿Liberar «${this.nombreLote(lote)}»?`,
      message: this.esResumenDeBoletas(lote)
        ? `SUNAT no respondió el número de seguimiento ${lote.sunat_ticket ?? ''}. Al liberarlo, ${comprobantes || 'las boletas'} vuelve(n) a quedar por informar. ` +
          'Antes, busque las boletas en SUNAT Operaciones en Línea: si SUNAT sí las recibió, informarlas otra vez las rechazaría como repetidas. ' +
          'Pasados 7 días de la emisión ya no se pueden informar en un resumen. Queda registrado con su usuario.'
        : `SUNAT no respondió el número de seguimiento ${lote.sunat_ticket ?? ''}. Al liberarlo, ${comprobantes || 'los comprobantes'} vuelve(n) a su estado anterior (aceptado). ` +
          'Antes, busque la baja en SUNAT Operaciones en Línea: si SUNAT sí la procesó, el comprobante ya figura anulado allá. ' +
          'Pasados 7 días de la emisión, la anulación se hace con nota de crédito. Queda registrado con su usuario.',
      confirmText: 'Sí, liberar',
      type: 'warning',
    });
    if (!confirmado || this.destroyRef.destroyed || this.idEnProceso !== null) return;
    this.ejecutar(lote, this.api.liberarLote(lote.id_envio), 'No se pudo liberar el lote');
  }

  /**
   * «Enviar resumen del día» (solo administrador): informa a SUNAT las boletas de la fecha elegida que esperan su
   * resumen o no pudieron enviarse solas. Nunca incluye las que SUNAT ya aceptó. Queda en la bitácora con el usuario.
   */
  async enviarResumenDelDia(): Promise<void> {
    if (this.enviandoResumen || this.idEnProceso !== null || !this.esAdmin) return;
    const fecha = this.fechaResumen;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < this.fechaMinimaResumen || fecha > this.fechaMaximaResumen) {
      void this.alerta.error({ title: 'Fecha no válida', message: 'Elija un día de emisión de hoy hasta 7 días atrás.' });
      return;
    }
    const confirmado = await this.alerta.confirmar({
      title: `¿Enviar el resumen de boletas del ${fechaYmdCorta(fecha)}?`,
      message:
        `Se informan a SUNAT, juntas en un resumen diario, las boletas emitidas el ${fechaYmdCorta(fecha)} que esperan su resumen o no pudieron enviarse solas. ` +
        'No se incluyen las que SUNAT ya aceptó. Queda registrado con su usuario.',
      confirmText: 'Sí, enviar resumen',
      type: 'question',
    });
    if (!confirmado || this.destroyRef.destroyed || this.enviandoResumen) return;
    this.enviandoResumen = true;
    this.api
      .enviarResumenDiario(fecha)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.enviandoResumen = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (resultado: ResultadoResumen) => {
          const n = resultado.comprobantes;
          this.alerta.toast({
            type: resultado.aceptado ? 'success' : 'info',
            title: `Resumen de boletas del ${fechaYmdCorta(resultado.fecha_emision || fecha)}: ${n} ${n === 1 ? 'boleta' : 'boletas'}`,
            message: resultado.pendientes > 0
              ? `Faltan ${resultado.pendientes} para el siguiente resumen (cada uno admite 500).`
              : resultado.mensaje ?? 'SUNAT lo está procesando.',
          });
          this.cambio.emit();
          this.cargar(1);
        },
        error: (e) => {
          void this.alerta.error(errorOperativo(e, 'No se pudo enviar el resumen'));
          this.cargar();
        },
      });
  }

  private ejecutar(lote: LoteSunat, solicitud: Observable<ResultadoLote>, fallo: string): void {
    this.idEnProceso = lote.id_envio;
    solicitud
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.idEnProceso = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (resultado) => {
          this.alerta.toast({
            type: resultado.aceptado ? 'success' : 'warning',
            title: resultado.aceptado
              ? `${this.nombreLote(lote)}: aceptado por SUNAT`
              : `${this.nombreLote(lote)}: ${this.nombreEstado(resultado.estado)}`,
            message: resultado.mensaje ?? '',
          });
          this.cambio.emit();
          this.cargar();
        },
        error: (e) => {
          void this.alerta.error(errorOperativo(e, fallo));
          // Otro proceso pudo tomar el lote mientras tanto: se muestra como está ahora.
          this.cargar();
        },
      });
  }

  /** El ticket sigue sin resolverse (7 días de consultas cumplidos, o un lote del esquema anterior). */
  private ticketSinResolver(lote: LoteSunat): boolean {
    return lote.accion_sunat === 'CONSULTAR_TICKET' || lote.accion_sunat === 'LIBERAR';
  }

  /** dd/mm del último día en que el sistema consulta solo el ticket (7 días desde que se registró el lote). */
  private fechaLimiteConsulta(lote: LoteSunat): string {
    const creado = new Date(lote.creado_en);
    if (Number.isNaN(creado.getTime())) return 'cumplir 7 días';
    return fechaYmdCorta(hoyLimaYmd(new Date(creado.getTime() + DIAS_CONSULTA_TICKET * 86_400_000)));
  }

  descargar(lote: LoteSunat, tipo: TipoArchivoLote): void {
    if (this.idEnProceso !== null) return;
    this.idEnProceso = lote.id_envio;
    this.api
      .archivoLote(lote.id_envio, tipo)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.idEnProceso = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) => descargarArchivo(blob, nombreDescarga(lote, tipo)),
        error: async (e) =>
          this.alerta.error(
            errorOperativo(await normalizarErrorBlob(e), 'No se pudo descargar el archivo'),
          ),
      });
  }
}
