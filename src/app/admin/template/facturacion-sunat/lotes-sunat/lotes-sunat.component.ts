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
import { Subscription, finalize } from 'rxjs';
import { AlertService } from '../../../../shared/services/alert.service';
import { descargarArchivo } from '../../../../shared/utils/descargar-archivo';
import { AmbienteFiscal, LoteSunat, TipoArchivoLote } from '../../../models/fiscal.models';
import {
  errorOperativo,
  mensajeDeError,
  normalizarErrorBlob,
} from '../../../service/api-base.service';
import { FiscalAdminService } from '../../../service/fiscal-admin.service';

const NOMBRES_ESTADO: Readonly<Record<string, string>> = {
  ENVIANDO: 'Enviando',
  PENDIENTE_REENVIO: 'Pendiente de reenvío',
  TICKET_PENDIENTE: 'Ticket pendiente',
  ACEPTADO: 'Aceptado',
  ACEPTADO_OBS: 'Aceptado con observaciones',
  RECHAZADO: 'Rechazado',
  EXCEPCION: 'Excepción: revisar',
};

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
  cdr_xml: 'CDR (XML)',
  cdr_zip: 'CDR (ZIP)',
};

/** Comprobantes que se nombran en la fila; el resto se resume como «+N». */
const LINEAS_VISIBLES = 3;

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
 * Comunicaciones de baja (RA) de facturas y resúmenes diarios (RC) con boletas anuladas, enviados a
 * SUNAT para anular sin nota de crédito. Un lote con ticket se consulta de nuevo con «Reintentar /
 * Consultar»; el servidor decide si reenvía o consulta según el estado.
 */
@Component({
  selector: 'app-lotes-sunat',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  private readonly api = inject(FiscalAdminService);
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
    return NOMBRES_ESTADO[estado] ?? estado;
  }

  claseEstado(estado: string): string {
    return CLASES_ESTADO[estado] ?? 'adm-insignia--neutra';
  }

  nombreTipo(lote: LoteSunat): string {
    return lote.operacion === 'baja' ? 'Baja' : 'Resumen';
  }

  documento(linea: LoteSunat['lineas'][number]): string {
    return `${linea.serie}-${linea.numero}`;
  }

  /** Reenvía (pendiente de reenvío) o consulta el ticket (ticket pendiente, o consultas agotadas: el servidor lo marca CONSULTAR_TICKET). */
  puedeReintentar(lote: LoteSunat): boolean {
    return (
      lote.estado === 'PENDIENTE_REENVIO' ||
      lote.estado === 'TICKET_PENDIENTE' ||
      (lote.estado === 'EXCEPCION' && !!lote.sunat_ticket && lote.accion_sunat === 'CONSULTAR_TICKET')
    );
  }

  textoReintentar(lote: LoteSunat): string {
    return lote.estado === 'PENDIENTE_REENVIO' ? 'Reintentar' : 'Consultar';
  }

  reintentar(lote: LoteSunat): void {
    if (this.idEnProceso !== null) return;
    this.idEnProceso = lote.id_envio;
    this.api
      .reintentarLote(lote.id_envio)
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
              ? `${lote.identificador}: aceptado por SUNAT`
              : `${lote.identificador}: ${this.nombreEstado(resultado.estado)}`,
            message: resultado.mensaje ?? '',
          });
          this.cambio.emit();
          this.cargar();
        },
        error: (e) => {
          void this.alerta.error(errorOperativo(e, 'No se pudo reintentar la baja o el resumen'));
          // Otro proceso pudo tomar el lote mientras tanto: se muestra como está ahora.
          this.cargar();
        },
      });
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
