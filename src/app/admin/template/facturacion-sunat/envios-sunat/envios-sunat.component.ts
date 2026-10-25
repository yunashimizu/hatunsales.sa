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
import { AlertService } from '../../../../shared/services/alert.service';
import { descargarArchivo } from '../../../../shared/utils/descargar-archivo';
import {
  AmbienteFiscal,
  ESTADOS_SUNAT,
  EnvioSunat,
  ResultadoEnvio,
  TipoArchivoEnvio,
} from '../../../models/fiscal.models';
import {
  errorOperativo,
  mensajeDeError,
  normalizarErrorBlob,
} from '../../../service/api-base.service';
import { FiscalAdminService } from '../../../service/fiscal-admin.service';

const NOMBRES_ESTADO: Readonly<Record<string, string>> = {
  NO_ENVIADO: 'No enviado',
  POR_RESUMIR: 'Por informar en resumen',
  ENVIANDO: 'Enviando',
  PENDIENTE_REENVIO: 'Pendiente de reenvío',
  TICKET_PENDIENTE: 'Ticket pendiente',
  ACEPTADO: 'Aceptado',
  ACEPTADO_OBS: 'Aceptado con observaciones',
  RECHAZADO: 'Rechazado',
  EXCEPCION: 'Excepción: revisar',
  ERROR_CONFIG: 'Error de configuración',
  BAJA_PENDIENTE: 'Baja pendiente',
  ANULADO: 'Anulado',
};

const CLASES_ESTADO: Readonly<Record<string, string>> = {
  ACEPTADO: 'adm-insignia--exito',
  ACEPTADO_OBS: 'adm-insignia--exito',
  RECHAZADO: 'adm-insignia--peligro',
  EXCEPCION: 'adm-insignia--peligro',
  ERROR_CONFIG: 'adm-insignia--peligro',
  ENVIANDO: 'adm-insignia--aviso',
  PENDIENTE_REENVIO: 'adm-insignia--aviso',
  TICKET_PENDIENTE: 'adm-insignia--aviso',
  POR_RESUMIR: 'adm-insignia--info',
  BAJA_PENDIENTE: 'adm-insignia--info',
};

const NOMBRES_TIPO: Readonly<Record<string, string>> = {
  '01': 'Factura',
  '03': 'Boleta',
  '07': 'Nota de crédito',
  '08': 'Nota de débito',
};

const NOMBRES_ARCHIVO: Readonly<Record<TipoArchivoEnvio, string>> = {
  xml_original: 'XML sin firmar',
  xml_firmado: 'XML firmado',
  zip: 'ZIP enviado',
  cdr_xml: 'CDR (XML)',
  cdr_zip: 'CDR (ZIP)',
};

/** Envíos que todavía pueden cambiar con una consulta a SUNAT (un aceptado o rechazado ya no). */
const ESTADOS_ABIERTOS: readonly string[] = ['PENDIENTE_REENVIO', 'ENVIANDO', 'EXCEPCION'];

/** Partes de RUC-TT-SERIE-NNNNNNNN.zip (envíos guardados antes de las columnas serie y número). */
function partesNombre(envio: EnvioSunat): string[] {
  return envio.nombre_archivo.replace(/\.zip$/i, '').split('-');
}

function nombreDescarga(envio: EnvioSunat, tipo: TipoArchivoEnvio): string {
  const base = envio.nombre_archivo.replace(/\.zip$/i, '') || `envio-${envio.id_envio}`;
  switch (tipo) {
    case 'zip':
      return `${base}.zip`;
    case 'xml_firmado':
      return `${base}.xml`;
    case 'xml_original':
      return `${base}-sin-firmar.xml`;
    case 'cdr_zip':
      return `R-${base}.zip`;
    case 'cdr_xml':
      return `R-${base}.xml`;
  }
}

/**
 * Envíos de factura, boleta y notas a SUNAT (BETA y producción): filtros, archivos y las acciones que
 * el servidor admite en cada estado. Las reglas de cada botón son las mismas del backend
 * (sunat-emision.service): así nadie ve un botón que solo puede terminar en error.
 */
@Component({
  selector: 'app-envios-sunat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './envios-sunat.component.html',
  styleUrl: './envios-sunat.component.css',
})
export class EnviosSunatComponent implements OnInit, OnChanges {
  /** Ambiente vigente: es el filtro inicial (el otro se ve cambiando el filtro). */
  @Input() ambienteVigente: AmbienteFiscal = 'beta';
  /** Tras una acción que cambió un envío (el panel vuelve a leer el estado de la emisión). */
  @Output() readonly cambio = new EventEmitter<void>();

  readonly estados = ESTADOS_SUNAT;
  readonly nombresEstado = NOMBRES_ESTADO;
  readonly nombresTipo = NOMBRES_TIPO;
  readonly nombresArchivo = NOMBRES_ARCHIVO;
  readonly porPagina = 20;
  filtro: { ambiente: AmbienteFiscal | ''; estado: string; tipo: string } = {
    ambiente: '',
    estado: '',
    tipo: '',
  };
  envios: EnvioSunat[] = [];
  total = 0;
  pagina = 1;
  cargando = false;
  error = '';
  /** Envío con una acción o descarga en curso. */
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
    return this.filtro.ambiente !== this.ambienteVigente || !!this.filtro.estado || !!this.filtro.tipo;
  }

  ngOnInit(): void {
    this.iniciado = true;
    this.mostrar();
  }

  ngOnChanges(cambios: SimpleChanges): void {
    // Al pasar de BETA a producción (o volver) se muestran los envíos del ambiente nuevo.
    if (this.iniciado && cambios['ambienteVigente'] && !cambios['ambienteVigente'].firstChange) this.mostrar();
  }

  /** Envíos del ambiente vigente con ese estado (lo usa el estado de la emisión del panel). */
  mostrar(estado = ''): void {
    this.filtro = { ambiente: this.ambienteVigente, estado, tipo: '' };
    this.cargar(1);
  }

  cargar(pagina = this.pagina): void {
    // La última consulta manda: un filtro nuevo cancela la lectura anterior.
    this.lectura?.unsubscribe();
    this.pagina = pagina;
    this.cargando = true;
    this.error = '';
    this.lectura = this.api
      .envios({ ...this.filtro, pagina, por_pagina: this.porPagina })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (respuesta) => {
          this.envios = respuesta.datos ?? [];
          this.total = Number(respuesta.total) || 0;
          this.pagina = Number(respuesta.pagina) || pagina;
        },
        error: (e) => {
          this.envios = [];
          this.total = 0;
          this.error = mensajeDeError(e, 'No se pudieron consultar los envíos a SUNAT');
        },
      });
  }

  irA(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginas && pagina !== this.pagina) this.cargar(pagina);
  }

  documento(envio: EnvioSunat): string {
    if (envio.serie && envio.numero) return `${envio.serie}-${envio.numero}`;
    const partes = partesNombre(envio);
    return partes.length >= 4 ? `${partes[2]}-${Number(partes[3])}` : envio.nombre_archivo;
  }

  nombreEstado(estado: string): string {
    return NOMBRES_ESTADO[estado] ?? estado;
  }

  claseEstado(estado: string): string {
    return CLASES_ESTADO[estado] ?? 'adm-insignia--neutra';
  }

  /** Reintento seguro del MISMO ZIP: pendiente de reenvío o enviando sin respuesta (reclamo vencido). */
  puedeReintentar(envio: EnvioSunat): boolean {
    return (
      (envio.estado === 'PENDIENTE_REENVIO' && envio.accion_sunat !== 'RECUPERAR_CDR') ||
      (envio.estado === 'ENVIANDO' && this.libre(envio))
    );
  }

  /** getStatusCdr: solo producción, facturas y sus notas (series F) y sin respuesta definitiva. */
  puedeRecuperarCdr(envio: EnvioSunat): boolean {
    return (
      envio.ambiente === 'produccion' &&
      ['01', '07', '08'].includes(envio.tipo_documento) &&
      /^F/i.test(this.serie(envio)) &&
      ESTADOS_ABIERTOS.includes(envio.estado) &&
      this.libre(envio)
    );
  }

  /** Resultado incierto (SUNAT dijo que ya lo tenía o no respondió): se confirma tras verlo en SOL. */
  puedeConfirmarAceptado(envio: EnvioSunat): boolean {
    return (
      (envio.estado === 'PENDIENTE_REENVIO' && envio.accion_sunat === 'RECUPERAR_CDR') ||
      (envio.estado === 'ENVIANDO' && this.libre(envio))
    );
  }

  tieneAcciones(envio: EnvioSunat): boolean {
    return this.puedeReintentar(envio) || this.puedeRecuperarCdr(envio) || this.puedeConfirmarAceptado(envio);
  }

  /** Qué hacer con un envío abierto, para que nadie lo reenvíe a ciegas. */
  indicacion(envio: EnvioSunat): string {
    if (envio.estado === 'PENDIENTE_REENVIO' && envio.accion_sunat === 'RECUPERAR_CDR') {
      return 'SUNAT indicó que ya lo había recibido: no lo reenvíe. Recupere la constancia o confírmelo tras verificarlo en SUNAT.';
    }
    if (envio.estado === 'ENVIANDO') {
      return this.libre(envio)
        ? 'SUNAT no respondió: reintentarlo es seguro (se manda el mismo XML) o verifíquelo en SUNAT.'
        : 'Se está enviando ahora mismo: actualice en unos segundos.';
    }
    return '';
  }

  reintentar(envio: EnvioSunat): void {
    this.ejecutar(envio, this.api.reintentarEnvio(envio.id_envio), 'No se pudo reintentar el envío');
  }

  recuperarCdr(envio: EnvioSunat): void {
    this.ejecutar(
      envio,
      this.api.recuperarCdr(envio.id_envio),
      'No se pudo consultar la constancia (CDR) en SUNAT',
    );
  }

  async confirmarAceptado(envio: EnvioSunat): Promise<void> {
    if (this.idEnProceso !== null) return;
    const nota = await this.alerta.pedirTexto({
      title: `¿SUNAT aceptó ${this.documento(envio)}?`,
      message:
        'Confírmelo solo después de verlo ACEPTADO en SUNAT Operaciones en Línea (consulta de comprobantes). ' +
        'Queda registrado con su usuario y su nota, y no se puede deshacer.',
      etiqueta: 'Qué verificó en SUNAT (5 a 300 caracteres)',
      placeholder: 'Ej.: consulté en SOL el 22/10 y figura como aceptado',
      minimo: 5,
      maximo: 300,
      multilinea: true,
      mensajeMinimo: 'Escriba al menos 5 caracteres sobre lo que verificó en SUNAT',
      confirmText: 'Confirmar aceptado',
      type: 'warning',
    });
    if (nota === null || this.destroyRef.destroyed) return;
    this.ejecutar(
      envio,
      this.api.confirmarAceptado(envio.id_envio, nota),
      'No se pudo confirmar el envío',
    );
  }

  descargar(envio: EnvioSunat, tipo: TipoArchivoEnvio): void {
    if (this.idEnProceso !== null) return;
    this.idEnProceso = envio.id_envio;
    this.api
      .archivoEnvio(envio.id_envio, tipo)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.idEnProceso = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) => descargarArchivo(blob, nombreDescarga(envio, tipo)),
        error: async (e) =>
          this.alerta.error(
            errorOperativo(await normalizarErrorBlob(e), 'No se pudo descargar el archivo'),
          ),
      });
  }

  private ejecutar(envio: EnvioSunat, solicitud: Observable<ResultadoEnvio>, fallo: string): void {
    if (this.idEnProceso !== null) return;
    this.idEnProceso = envio.id_envio;
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
              ? `${this.documento(envio)}: aceptado por SUNAT`
              : `${this.documento(envio)}: ${this.nombreEstado(resultado.estado)}`,
            message: resultado.mensaje ?? '',
          });
          this.cambio.emit();
          this.cargar();
        },
        error: (e) => {
          void this.alerta.error(errorOperativo(e, fallo));
          // Otro proceso pudo tomar el envío mientras tanto: se muestra como está ahora.
          this.cargar();
        },
      });
  }

  /** Nadie está hablando con SUNAT por este envío ahora mismo (sin reclamo o con el reclamo vencido). */
  private libre(envio: EnvioSunat): boolean {
    return !envio.bloqueado_hasta || Date.parse(envio.bloqueado_hasta) < Date.now();
  }

  private serie(envio: EnvioSunat): string {
    return envio.serie || partesNombre(envio)[2] || '';
  }
}
