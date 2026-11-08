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
import { fechaYmdCorta, nombreEstadoEnvio, plazoVencido, segundosSunat, textoPlazoVencido } from '../../../mantenimiento/component/doc/documentos-sunat';
import { QueHacerSunatComponent } from '../que-hacer/que-hacer-sunat.component';

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
  cdr_xml: 'Constancia de SUNAT (XML)',
  cdr_zip: 'Constancia de SUNAT (ZIP)',
};

/** Envíos que todavía pueden cambiar con una consulta a SUNAT (un aceptado o rechazado ya no). */
const ESTADOS_ABIERTOS: readonly string[] = ['PENDIENTE_REENVIO', 'ENVIANDO', 'EXCEPCION'];

/** Intentos rápidos del sistema (2, 5, 15, 30 y 60 min): después sigue cada hora hasta el último día del plazo. */
const INTENTOS_RAPIDOS = 6;

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
  imports: [CommonModule, FormsModule, QueHacerSunatComponent],
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

  /** «2,3 s»: lo que tardó SUNAT en la última respuesta (vacío si no se sabe). */
  readonly segundosSunat = segundosSunat;

  nombreEstado(estado: string): string {
    return nombreEstadoEnvio(estado);
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

  /**
   * «Reintentar ahora» (solo administrador): el envío quedó en «Requiere revisión» y todavía está dentro
   * de su plazo. Pasado el plazo no tiene sentido reenviar: queda recuperar la constancia o confirmarlo.
   */
  puedeReintentarAhora(envio: EnvioSunat): boolean {
    return envio.estado === 'EXCEPCION' && this.libre(envio) && this.esAdmin && !this.vencido(envio);
  }

  /** Resultado incierto (SUNAT dijo que ya lo tenía o no respondió) o que requiere revisión: se confirma tras verlo en SOL. */
  puedeConfirmarAceptado(envio: EnvioSunat): boolean {
    return (
      (envio.estado === 'PENDIENTE_REENVIO' && envio.accion_sunat === 'RECUPERAR_CDR') ||
      ((envio.estado === 'ENVIANDO' || envio.estado === 'EXCEPCION') && this.libre(envio))
    );
  }

  tieneAcciones(envio: EnvioSunat): boolean {
    return (
      this.puedeReintentar(envio) ||
      this.puedeReintentarAhora(envio) ||
      this.puedeRecuperarCdr(envio) ||
      this.puedeConfirmarAceptado(envio)
    );
  }

  get esAdmin(): boolean {
    return this.auth.puedeVer(['admin']);
  }

  /** Pasó el último día para enviarlo a SUNAT (sin fecha conocida, no se da por vencido). */
  vencido(envio: EnvioSunat): boolean {
    return plazoVencido(envio.fecha_limite_envio);
  }

  /**
   * ¿Se muestra la tarjeta «¿Qué hacer?» (con las acciones al lado) en lugar de una línea de texto? Solo cuando el envío
   * necesita a una persona: «Requiere revisión» (EXCEPCION).
   */
  conTarjeta(envio: EnvioSunat): boolean {
    return envio.estado === 'EXCEPCION' && !!this.indicacion(envio);
  }

  /** Qué hacer con un envío abierto, para que nadie lo reenvíe a ciegas. */
  indicacion(envio: EnvioSunat): string {
    if (envio.estado === 'POR_RESUMIR') {
      return 'La boleta ya es válida y no se envía sola: SUNAT la recibe en el resumen diario. Un administrador puede adelantarlo con «Enviar resumen del día» en Lotes.';
    }
    if (envio.estado === 'TICKET_PENDIENTE') {
      return 'Va en un resumen diario que SUNAT está procesando: el resultado se ve en Lotes.';
    }
    if (envio.estado === 'PENDIENTE_REENVIO' && envio.accion_sunat === 'RECUPERAR_CDR') {
      return 'SUNAT indicó que ya lo había recibido: no lo reenvíe. Recupere la constancia de SUNAT o confírmelo tras verificarlo en SUNAT.';
    }
    if (envio.estado === 'ENVIANDO') {
      return this.libre(envio)
        ? 'SUNAT no respondió: reintentarlo es seguro (se manda el mismo XML) o verifíquelo en SUNAT.'
        : 'Se está enviando ahora mismo: actualice en unos segundos.';
    }
    if (envio.estado === 'PENDIENTE_REENVIO' && (envio.intento ?? 0) >= INTENTOS_RAPIDOS && envio.fecha_limite_envio && !this.vencido(envio)) {
      return (
        `Se intentó ${envio.intento} veces sin respuesta de SUNAT. Puede reintentar; si SUNAT sigue sin responder, espere a que vuelva: ` +
        `el sistema seguirá intentando cada hora hasta el ${fechaYmdCorta(envio.fecha_limite_envio)}.`
      );
    }
    if (envio.estado === 'EXCEPCION') {
      const aclaracion = ' Si ya lo vio aceptado allí, use «Confirmar aceptado».';
      if (this.vencido(envio)) return textoPlazoVencido(this.serie(envio), envio.fecha_limite_envio, envio.accion_sunat) + aclaracion;
      return `Puede reintentarlo ahora o verificarlo en SUNAT Operaciones en Línea.${aclaracion}`;
    }
    return '';
  }

  /** Lo que el sistema dice del envío (por qué sigue pendiente), cuando la indicación no lo cuenta ya. */
  mensajeSistema(envio: EnvioSunat): string {
    if (!envio.ultimo_error || envio.estado === 'ACEPTADO' || envio.estado === 'ACEPTADO_OBS') return '';
    if (envio.estado === 'EXCEPCION' && this.vencido(envio)) return '';
    if (envio.estado === 'PENDIENTE_REENVIO' && (envio.intento ?? 0) >= INTENTOS_RAPIDOS && envio.fecha_limite_envio && !this.vencido(envio)) return '';
    return envio.ultimo_error;
  }

  async reintentar(envio: EnvioSunat): Promise<void> {
    if (this.idEnProceso !== null) return;
    const confirmado = await this.alerta.confirmar({
      title: `¿Reintentar el envío de ${this.documento(envio)}?`,
      message: 'Se vuelve a mandar a SUNAT el mismo archivo firmado: no se crea un número nuevo ni se duplica el comprobante.',
      confirmText: 'Sí, reintentar',
      type: 'question',
    });
    if (!confirmado || this.destroyRef.destroyed) return;
    this.ejecutar(envio, this.api.reintentarEnvio(envio.id_envio), 'No se pudo reintentar el envío');
  }

  async reintentarAhora(envio: EnvioSunat): Promise<void> {
    if (this.idEnProceso !== null || !this.esAdmin) return;
    const confirmado = await this.alerta.confirmar({
      title: `¿Reintentar ahora ${this.documento(envio)}?`,
      message:
        `Se intentó ${envio.intento ?? 1} veces sin una respuesta válida de SUNAT. Se vuelve a mandar el mismo archivo firmado ` +
        '(en facturas de producción antes se pregunta a SUNAT si ya lo tiene). Queda registrado con su usuario.',
      confirmText: 'Sí, reintentar ahora',
      type: 'warning',
    });
    if (!confirmado || this.destroyRef.destroyed) return;
    this.ejecutar(envio, this.api.reintentarEnvio(envio.id_envio, true), 'No se pudo reintentar el envío');
  }

  async recuperarCdr(envio: EnvioSunat): Promise<void> {
    if (this.idEnProceso !== null) return;
    const confirmado = await this.alerta.confirmar({
      title: `¿Pedir a SUNAT la constancia de ${this.documento(envio)}?`,
      message: 'Solo se pregunta a SUNAT si ya tiene este comprobante: no se envía nada nuevo.',
      confirmText: 'Sí, consultar',
      type: 'question',
    });
    if (!confirmado || this.destroyRef.destroyed) return;
    this.ejecutar(
      envio,
      this.api.recuperarCdr(envio.id_envio),
      'No se pudo consultar la constancia de SUNAT',
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
