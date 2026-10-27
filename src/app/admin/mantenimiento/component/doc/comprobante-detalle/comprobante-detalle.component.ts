import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, Subscription, finalize } from 'rxjs';

import { AuthService } from '../../../../../auth/service/auth.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { descargarArchivo } from '../../../../../shared/utils/descargar-archivo';
import {
  AnulacionComprobante,
  ComprobanteDetalle,
  CorreoComprobante,
  CorreoHistorial,
  EstadoCorreo,
  FormatoPdfComprobante,
  ResultadoComprobante,
  SolicitudAnularComprobante,
  TipoArchivoComprobante,
  TonoEstado,
  textoEstadoSunat,
} from '../../../../models/documentos.models';
import {
  codigoDeError,
  errorOperativo,
  mensajeDeError,
  normalizarErrorBlob,
} from '../../../../service/api-base.service';
import { ComprobanteService } from '../../../../service/comprobante.service';
import { FiscalEstadoService } from '../../../../service/fiscal-estado.service';
import {
  ChipAmbiente,
  NOMBRE_ARCHIVO,
  RUTA_DOCUMENTOS_VENTA,
  RUTA_GUIAS,
  archivosDescargables,
  chipAmbiente,
  claseAviso,
  claseInsignia,
  estadoDeComprobante,
  fechaYmdLegible,
  nombreDescarga,
  textoAccionSunat,
} from '../documentos-sunat';
import { ResultadoSunatComponent } from '../resultado-sunat/resultado-sunat.component';

/** Acción que la lista pide ejecutar apenas se abre el detalle. */
export type AccionDetalle = 'reintentar' | 'recuperar_cdr' | 'confirmar' | 'anular';

/** Catálogo 06 de SUNAT: tipo de documento del cliente. */
const TIPO_DOCUMENTO: Readonly<Record<number, string>> = {
  0: 'Sin documento',
  1: 'DNI',
  4: 'Carné de extranjería',
  6: 'RUC',
  7: 'Pasaporte',
};

/** Cómo se rotula cada estado del correo al cliente. */
const TEXTO_CORREO: Readonly<Record<EstadoCorreo, { titulo: string; tono: TonoEstado; icono: string }>> = {
  SIN_SOLICITAR: { titulo: 'No se pidió enviarlo', tono: 'neutro', icono: 'bi-envelope' },
  PENDIENTE: { titulo: 'Pendiente de envío', tono: 'aviso', icono: 'bi-hourglass-split' },
  ENVIANDO: { titulo: 'Enviando', tono: 'info', icono: 'bi-send' },
  ENVIADO: { titulo: 'Enviado', tono: 'exito', icono: 'bi-envelope-check' },
  ERROR: { titulo: 'No se pudo enviar', tono: 'peligro', icono: 'bi-envelope-exclamation' },
  OMITIDO: { titulo: 'Omitido', tono: 'neutro', icono: 'bi-envelope-slash' },
};

/** Formato razonable de correo (la validación real es la del backend). */
export function correoPlausible(texto: string): boolean {
  const limpio = texto.trim();
  return limpio.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpio);
}

/** guias_remision.estado en palabras. */
const ESTADO_GUIA: Readonly<Record<string, string>> = {
  legacy: 'Registro anterior',
  borrador: 'Borrador',
  pendiente: 'Pendiente de envío',
  enviado: 'En proceso en SUNAT',
  aceptado: 'Aceptada por SUNAT',
  rechazado: 'Rechazada por SUNAT',
  anulado: 'Anulada',
};

const TEXTO_ANULACION: Readonly<Record<AnulacionComprobante['estado'], { titulo: string; tono: TonoEstado; icono: string }>> = {
  anulada: { titulo: 'Anulado', tono: 'exito', icono: 'bi-check2-circle' },
  anulacion_en_curso: {
    titulo: 'Anulación en curso: falta que SUNAT acepte la nota de crédito',
    tono: 'aviso',
    icono: 'bi-hourglass-split',
  },
  anulacion_rechazada: {
    titulo: 'SUNAT rechazó la nota de anulación: el comprobante sigue vigente',
    tono: 'peligro',
    icono: 'bi-x-octagon',
  },
};

/**
 * Detalle de un comprobante en un panel lateral: lo que se imprimió (emisor real, cliente, ítems y
 * totales), su estado en SUNAT y su último envío, lo que lo enlaza (venta, nota que lo modifica,
 * notas y guías) y las acciones que el backend admite hoy (flags puede_*). Cada acción que habla con
 * SUNAT muestra su respuesta en el acto, arriba del detalle, y luego vuelve a leer el comprobante.
 */
@Component({
  selector: 'app-comprobante-detalle',
  standalone: true,
  imports: [CommonModule, RouterLink, ResultadoSunatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comprobante-detalle.component.html',
  styleUrl: './comprobante-detalle.component.css',
})
export class ComprobanteDetalleComponent implements OnChanges {
  @Input({ required: true }) idComprobante!: number;
  /** Acción pedida desde la lista: se ejecuta una vez al cargar, solo si el backend todavía la permite. */
  @Input() accionInicial: AccionDetalle | null = null;
  @Output() readonly cerrado = new EventEmitter<void>();
  /** Una acción cambió el comprobante: quien lo lista lo vuelve a leer. */
  @Output() readonly cambio = new EventEmitter<void>();
  /** Pide abrir el asistente de nota de crédito de este comprobante. */
  @Output() readonly notaCredito = new EventEmitter<number>();
  /** Pide abrir otro comprobante (el que modifica esta nota, una nota enlazada o la de anulación). */
  @Output() readonly abrir = new EventEmitter<number>();

  // Getters y no campos `= CONSTANTE`: en las pruebas, Vite copia la constante importada que es
  // valor de un campo al cargar el módulo, antes de que se inicialice, y el campo quedaría undefined
  // según el orden de los specs.
  get rutaVenta(): string {
    return RUTA_DOCUMENTOS_VENTA;
  }
  get rutaGuias(): string {
    return RUTA_GUIAS;
  }
  get nombresArchivo(): Readonly<Record<TipoArchivoComprobante, string>> {
    return NOMBRE_ARCHIVO;
  }

  readonly claseInsignia = claseInsignia;
  readonly claseAviso = claseAviso;
  readonly estadoDe = estadoDeComprobante;
  readonly textoAccion = textoAccionSunat;
  readonly fechaLegible = fechaYmdLegible;

  detalle: ComprobanteDetalle | null = null;
  cargando = false;
  error = '';
  estado: { texto: string; tono: TonoEstado } = { texto: '', tono: 'neutro' };
  ambiente: ChipAmbiente | null = null;
  archivos: TipoArchivoComprobante[] = [];
  /** Acción o descarga en curso ('reintentar', 'pdf_a4', 'xml_firmado'…): bloquea las demás. */
  enProceso: string | null = null;
  /** Respuesta de SUNAT a la última acción, para mostrarla en el acto. */
  resultado: ResultadoComprobante | null = null;
  anulacion: AnulacionComprobante | null = null;
  /** Resultado de SUNAT de la nota con la que se anuló. */
  resultadoNotaAnulacion: ResultadoComprobante | null = null;
  /** Destino del reenvío por correo (precargado con el del comprobante). */
  destinoCorreo = '';
  /** Historial de correos; null mientras el bloque plegable no se abrió. */
  historialCorreo: CorreoHistorial[] | null = null;
  cargandoHistorial = false;
  historialAbierto = false;

  readonly esAdmin: boolean;
  /** El backend emite notas de crédito para admin y vendedor (caja solo las consulta). */
  readonly puedeEmitirNota: boolean;

  private readonly api = inject(ComprobanteService);
  private readonly alerta = inject(AlertService);
  private readonly fiscal = inject(FiscalEstadoService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private lectura: Subscription | null = null;
  private accionPendiente: AccionDetalle | null = null;

  /** Al abrir, el foco entra al panel (Escape lo cierra y el lector de pantalla lo anuncia). */
  @ViewChild('panel')
  set panel(elemento: ElementRef<HTMLElement> | undefined) {
    elemento?.nativeElement.focus();
  }

  constructor() {
    const auth = inject(AuthService);
    this.esAdmin = auth.puedeVer(['admin']);
    this.puedeEmitirNota = auth.puedeVer(['admin', 'vendedor']);
  }

  ngOnChanges(cambios: SimpleChanges): void {
    if (cambios['idComprobante']) {
      this.detalle = null;
      this.resultado = null;
      this.anulacion = null;
      this.resultadoNotaAnulacion = null;
      this.historialCorreo = null;
      this.historialAbierto = false;
      this.accionPendiente = this.accionInicial;
      this.cargar();
    } else if (cambios['accionInicial'] && this.accionInicial) {
      this.accionPendiente = this.accionInicial;
      this.ejecutarPendiente();
    }
  }

  get tieneAcciones(): boolean {
    const d = this.detalle;
    if (!d) return false;
    return (
      d.puede_reintentar ||
      d.puede_recuperar_cdr ||
      (d.puede_confirmar_manual && this.esAdmin) ||
      (d.puede_nota_credito && this.puedeEmitirNota) ||
      (d.puede_anular && this.esAdmin)
    );
  }

  /** Vuelve a leer el comprobante (también lo pide Documentos tras emitir una nota de crédito). */
  cargar(): void {
    this.lectura?.unsubscribe();
    this.cargando = true;
    this.error = '';
    this.cdr.markForCheck();
    this.lectura = this.api
      .detalle(this.idComprobante)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (detalle) => {
          this.detalle = detalle;
          this.estado = estadoDeComprobante(detalle);
          this.ambiente = chipAmbiente(detalle.proveedor_fiscal, detalle.ambiente_fiscal);
          this.archivos = archivosDescargables(detalle.archivos);
          this.destinoCorreo = detalle.correo?.destino || detalle.receptor.email || '';
          this.ejecutarPendiente();
        },
        error: (e) => {
          this.accionPendiente = null;
          this.error = mensajeDeError(e, 'No se pudo consultar el comprobante');
        },
      });
  }

  cerrar(): void {
    this.cerrado.emit();
  }

  // ── Descargas ────────────────────────────────────────────────

  descargarPdf(formato: FormatoPdfComprobante): void {
    const d = this.detalle;
    if (!d) return;
    this.descargar(
      `pdf_${formato}`,
      this.api.descargarPdf(d.id_comprobante, formato),
      nombreDescarga(d.numero_formateado, formato === 'ticket' ? 'pdf_ticket' : 'pdf_a4'),
      'No se pudo descargar el PDF',
    );
  }

  descargarArchivoEnvio(tipo: TipoArchivoComprobante): void {
    const d = this.detalle;
    if (!d) return;
    this.descargar(
      tipo,
      this.api.descargarArchivo(d.id_comprobante, tipo),
      nombreDescarga(d.numero_formateado, tipo),
      `No se pudo descargar el ${NOMBRE_ARCHIVO[tipo]}`,
    );
  }

  // ── Acciones con SUNAT ───────────────────────────────────────

  reintentar(): void {
    this.ejecutar('reintentar', this.api.reintentar(this.idComprobante), 'No se pudo reintentar el envío a SUNAT');
  }

  recuperarCdr(): void {
    this.ejecutar(
      'recuperar_cdr',
      this.api.recuperarCdr(this.idComprobante),
      'No se pudo consultar la constancia (CDR) en SUNAT',
    );
  }

  async confirmarAceptado(): Promise<void> {
    const d = this.detalle;
    if (!d || this.enProceso || !this.esAdmin) return;
    const nota = await this.alerta.pedirTexto({
      title: `¿SUNAT aceptó ${d.numero_formateado}?`,
      message:
        'Confírmelo solo después de verlo ACEPTADO en SUNAT Operaciones en Línea (consulta de validez del comprobante). ' +
        'Queda registrado con su usuario y su nota, y no se puede deshacer.',
      etiqueta: 'Qué verificó en SUNAT (5 a 300 caracteres)',
      placeholder: 'Ej.: lo consulté en SOL el 25/10 y figura como aceptado',
      minimo: 5,
      maximo: 300,
      multilinea: true,
      mensajeMinimo: 'Escriba al menos 5 caracteres sobre lo que verificó en SUNAT',
      confirmText: 'Confirmar aceptado',
      type: 'warning',
    });
    if (nota === null || this.destroyRef.destroyed) return;
    this.ejecutar('confirmar', this.api.confirmarAceptado(this.idComprobante, nota), 'No se pudo confirmar el comprobante');
  }

  pedirNotaCredito(): void {
    if (this.detalle?.puede_nota_credito && this.puedeEmitirNota) this.notaCredito.emit(this.idComprobante);
  }

  // ── Correo al cliente ────────────────────────────────────────

  textoCorreo(c: CorreoComprobante): { titulo: string; tono: TonoEstado; icono: string } {
    return TEXTO_CORREO[c.estado] ?? TEXTO_CORREO.SIN_SOLICITAR;
  }

  tonoCorreo(estado: EstadoCorreo): TonoEstado {
    return TEXTO_CORREO[estado]?.tono ?? 'neutro';
  }

  get destinoCorreoValido(): boolean {
    return correoPlausible(this.destinoCorreo);
  }

  cambiarDestinoCorreo(valor: string): void {
    this.destinoCorreo = valor;
    this.cdr.markForCheck();
  }

  /** Confirma el destino y reenvía el PDF y el XML; muestra el resultado en un aviso y refresca el estado. */
  async reenviarCorreo(): Promise<void> {
    const d = this.detalle;
    if (!d || this.enProceso || !d.correo?.puede_reenviar) return;
    if (!this.destinoCorreoValido) {
      this.alerta.toast({ type: 'warning', title: 'Correo no válido', message: 'Escriba un correo de destino con el formato nombre@dominio.pe.' });
      return;
    }
    const destino = this.destinoCorreo.trim();
    const confirmado = await this.alerta.confirmar({
      title: `¿Enviar ${d.numero_formateado} por correo?`,
      message: `Se enviarán el PDF y el XML a ${destino}.`,
      confirmText: 'Enviar',
      type: 'question',
    });
    if (!confirmado || this.destroyRef.destroyed) return;
    this.enProceso = 'correo';
    this.cdr.markForCheck();
    this.api
      .reenviarCorreo(d.id_comprobante, destino)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.enProceso = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (fila) => {
          const enviado = fila.estado === 'ENVIADO';
          this.alerta.toast({
            type: enviado ? 'success' : 'warning',
            title: enviado ? 'Correo enviado' : 'Correo en cola',
            message: enviado
              ? `${d.numero_formateado} se envió a ${fila.destino ?? destino}.`
              : `${d.numero_formateado} quedó ${fila.estado.toLowerCase()}${fila.ultimo_error ? `: ${fila.ultimo_error}` : ''}.`,
          });
          this.historialCorreo = null;
          if (this.historialAbierto) this.cargarHistorialCorreo();
          this.cargar();
        },
        error: (e) => {
          void this.alerta.error(errorOperativo(e, 'No se pudo enviar el correo'));
          this.cargar();
        },
      });
  }

  /** El bloque plegable del historial pide las filas la primera vez que se abre. */
  alternarHistorialCorreo(abierto: boolean): void {
    this.historialAbierto = abierto;
    if (abierto && this.historialCorreo === null) this.cargarHistorialCorreo();
  }

  private cargarHistorialCorreo(): void {
    if (!this.detalle || this.cargandoHistorial) return;
    this.cargandoHistorial = true;
    this.cdr.markForCheck();
    this.api
      .historialCorreos(this.detalle.id_comprobante)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargandoHistorial = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (filas) => (this.historialCorreo = filas),
        error: (e) => {
          this.historialCorreo = [];
          void this.alerta.error(errorOperativo(e, 'No se pudo leer el historial de correos'));
        },
      });
  }

  // ── Anulación (PLAN V3, D9) ──────────────────────────────────

  async anular(): Promise<void> {
    const d = this.detalle;
    if (!d || this.enProceso || !this.esAdmin) return;
    const motivo = await this.alerta.pedirTexto({
      title: `¿Anular ${d.numero_formateado}?`,
      message: this.explicacionAnulacion(d),
      etiqueta: 'Motivo de la anulación (5 a 250 caracteres)',
      placeholder: 'Ej.: el cliente desistió de la compra',
      minimo: 5,
      maximo: 250,
      multilinea: true,
      mensajeMinimo: 'Escriba un motivo de al menos 5 caracteres',
      confirmText: 'Sí, anular',
      danger: true,
      type: 'warning',
    });
    if (motivo === null || this.destroyRef.destroyed) return;
    this.enviarAnulacion({ id_comprobante: d.id_comprobante, motivo });
  }

  textoAnulacion(estado: AnulacionComprobante['estado']): { titulo: string; tono: TonoEstado; icono: string } {
    return TEXTO_ANULACION[estado];
  }

  /** Qué hará el backend con la anulación, en palabras, antes de confirmarla. */
  private explicacionAnulacion(d: ComprobanteDetalle): string {
    const vigente = this.fiscal.estado()?.ambiente ?? null;
    const aceptado =
      d.proveedor_fiscal === 'sunat_directo' &&
      d.aceptada_sunat &&
      (vigente === null || d.ambiente_fiscal === vigente);
    if (aceptado) {
      const venta = d.id_venta
        ? ` La venta #${d.id_venta} se anula cuando SUNAT acepte esa nota: recién entonces vuelve el stock y se ajusta la deuda.`
        : '';
      return `SUNAT ya aceptó este comprobante: se anula emitiendo a SUNAT, ahora mismo, una nota de crédito por lo que queda del comprobante (motivo 01).${venta} No se puede deshacer.`;
    }
    const venta = d.id_venta
      ? ` También se anula la venta #${d.id_venta}: lo vendido vuelve al almacén y se cierran sus cuentas por cobrar.`
      : '';
    return `Este comprobante no está aceptado por SUNAT en el ambiente vigente: se anula solo en el sistema, sin enviar nada a SUNAT.${venta} No se puede deshacer.`;
  }

  private enviarAnulacion(solicitud: SolicitudAnularComprobante): void {
    if (this.enProceso) return;
    this.enProceso = 'anular';
    this.limpiarResultados();
    this.api
      .anular(solicitud)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.enProceso = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (respuesta) => {
          this.anulacion = respuesta;
          this.resultadoNotaAnulacion = respuesta.nota
            ? {
                id_comprobante: respuesta.nota.id_comprobante,
                numero_formateado: respuesta.nota.numero_formateado,
                estado: respuesta.nota.estado,
                estado_sunat: respuesta.nota.estado_sunat,
                aceptada_sunat: respuesta.nota.aceptada_sunat,
                error: respuesta.nota.error,
                ambiente_fiscal: this.detalle?.ambiente_fiscal ?? null,
              }
            : null;
          this.cambio.emit();
          this.cargar();
        },
        error: (e) => {
          // D9 (d): el envío quedó sin confirmar; el administrador lo verifica en SUNAT y responde.
          if (codigoDeError(e) === 'ANULACION_REQUIERE_VERIFICACION_SOL' && !solicitud.confirmar_verificado_sol) {
            void this.verificarEnSunat(solicitud, mensajeDeError(e, ''));
            return;
          }
          void this.alerta.error(errorOperativo(e, 'No se pudo anular'));
          this.cargar();
        },
      });
  }

  private async verificarEnSunat(solicitud: SolicitudAnularComprobante, mensaje: string): Promise<void> {
    const numero = this.detalle?.numero_formateado ?? 'el comprobante';
    const respuesta = await this.alerta.confirm({
      title: `Verifique ${numero} en SUNAT`,
      message:
        `${mensaje} Búsquelo en SUNAT Operaciones en Línea (consulta de validez del comprobante) ` +
        'y responda lo que encontró: queda registrado con su usuario.',
      confirmText: 'Sí, SUNAT lo tiene',
      denyText: 'No existe en SUNAT',
      cancelText: 'Cancelar',
      type: 'warning',
    });
    if (this.destroyRef.destroyed || (!respuesta.isConfirmed && !respuesta.isDenied)) return;
    const existe = respuesta.isConfirmed === true;
    const nota = await this.alerta.pedirTexto({
      title: existe ? 'SUNAT tiene el comprobante' : 'El comprobante no existe en SUNAT',
      message: existe
        ? 'Se confirmará como aceptado y se anulará emitiendo una nota de crédito.'
        : 'Se descartará su envío (no se volverá a enviar) y se anulará en el sistema.',
      etiqueta: 'Qué verificó en SUNAT (5 a 300 caracteres)',
      placeholder: 'Ej.: lo consulté en SOL el 25/10 a las 10:30',
      minimo: 5,
      maximo: 300,
      multilinea: true,
      mensajeMinimo: 'Escriba al menos 5 caracteres sobre lo que verificó',
      confirmText: 'Anular',
      danger: true,
      type: 'warning',
    });
    if (nota === null || this.destroyRef.destroyed) return;
    this.enviarAnulacion({ ...solicitud, confirmar_verificado_sol: true, existe_en_sunat: existe, nota });
  }

  // ── Presentación ─────────────────────────────────────────────

  abrirOtro(id: number | null | undefined): void {
    if (id && id !== this.idComprobante) this.abrir.emit(id);
  }

  textoEstadoEnvio(estado: string): string {
    return textoEstadoSunat(estado);
  }

  tipoDocumento(tipo: number): string {
    return TIPO_DOCUMENTO[Number(tipo)] ?? 'Documento';
  }

  textoEstadoGuia(estado: string | null): string {
    return ESTADO_GUIA[estado ?? ''] ?? 'Sin estado';
  }

  /**
   * Qué hacer con un comprobante fuera de plazo (D5.2): la factura y sus notas (series F) ya no se
   * reenvían; la boleta y sus notas (series B) se informan por resumen diario.
   */
  textoVencido(d: ComprobanteDetalle): string {
    const limite = fechaYmdLegible(d.fecha_limite_envio);
    return d.serie.toUpperCase().startsWith('F')
      ? `El plazo de envío venció el ${limite}: SUNAT ya no lo recibe. Emita un comprobante nuevo.`
      : `El plazo de envío individual venció el ${limite}: informe la boleta por resumen diario en SUNAT.`;
  }

  // ── Interno ──────────────────────────────────────────────────

  private ejecutarPendiente(): void {
    const accion = this.accionPendiente;
    const d = this.detalle;
    if (!accion || !d || this.enProceso) return;
    this.accionPendiente = null;
    if (accion === 'reintentar' && d.puede_reintentar) this.reintentar();
    else if (accion === 'recuperar_cdr' && d.puede_recuperar_cdr) this.recuperarCdr();
    else if (accion === 'confirmar' && d.puede_confirmar_manual && this.esAdmin) void this.confirmarAceptado();
    else if (accion === 'anular' && d.puede_anular && this.esAdmin) void this.anular();
    else {
      this.alerta.toast({
        type: 'info',
        title: `${d.numero_formateado} cambió`,
        message: 'Esa acción ya no corresponde a su estado actual: revíselo en el detalle.',
      });
    }
  }

  private ejecutar(accion: string, solicitud: Observable<ResultadoComprobante>, fallo: string): void {
    if (this.enProceso) return;
    this.enProceso = accion;
    this.limpiarResultados();
    solicitud
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.enProceso = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (respuesta) => {
          this.resultado = respuesta;
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

  private descargar(clave: string, solicitud: Observable<Blob>, nombre: string, fallo: string): void {
    if (this.enProceso) return;
    this.enProceso = clave;
    this.cdr.markForCheck();
    solicitud
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.enProceso = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) => descargarArchivo(blob, nombre),
        error: async (e) => this.alerta.error(errorOperativo(await normalizarErrorBlob(e), fallo)),
      });
  }

  private limpiarResultados(): void {
    this.resultado = null;
    this.anulacion = null;
    this.resultadoNotaAnulacion = null;
    this.cdr.markForCheck();
  }
}
