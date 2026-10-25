import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  CambiosConfiguracionFiscal,
  ConfiguracionSunat,
  ConfirmacionesActivacion,
  ItemChecklistFiscal,
  ResultadoPruebaCredenciales,
  SeriesSunat,
} from '../../../models/fiscal.models';
import { escapeHtmlAlerta, mensajeDeError } from '../../../service/api-base.service';
import { FiscalAdminService } from '../../../service/fiscal-admin.service';

/** Cambio que el panel guarda con su flujo común (PUT /fiscal/configuracion, aviso y recarga). */
export interface SolicitudGuardadoFiscal {
  cambios: CambiosConfiguracionFiscal;
  mensaje: string;
}

/** Tarjeta de la pestaña Configuración donde se corrige un requisito. */
export type DestinoFiscal = 'operacion' | 'emisor' | 'certificados' | 'sol';

/** Lo que el administrador escribe para confirmar el paso a producción. */
export const PALABRA_CONFIRMACION = 'PRODUCCION';

const MAXIMO_CORRELATIVO = 99_999_999;

const CONFIRMACIONES_SOL: ReadonlyArray<{
  clave: keyof ConfirmacionesActivacion;
  titulo: string;
  explicacion: string;
}> = [
  {
    clave: 'emisor_electronico_sol',
    titulo: 'Alta como emisor electrónico desde su propio sistema',
    explicacion:
      'En SOL › Comprobantes de pago › SEE - Del Contribuyente, la empresa declaró que emite desde su sistema. ' +
      'Sin esa alta SUNAT rechaza todos los envíos.',
  },
  {
    clave: 'certificado_en_sol',
    titulo: 'Certificado digital registrado en SOL',
    explicacion:
      'Descargó la parte pública (.cer) del certificado de producción desde este panel y la registró en ' +
      'SOL › «Actualización de certificado digital». Si no está registrado, SUNAT rechaza la firma.',
  },
  {
    clave: 'usuario_sol_secundario',
    titulo: 'Usuario secundario SOL con perfil de envío',
    explicacion:
      'El usuario secundario registrado aquí tiene asignado en SOL el perfil para enviar comprobantes ' +
      'electrónicos (sin ese perfil SUNAT responde que no está autorizado).',
  },
  {
    clave: 'ruc_habido',
    titulo: 'RUC activo y habido',
    explicacion: 'En la Consulta RUC de SUNAT la empresa figura ACTIVA y con domicilio fiscal HABIDO.',
  },
];

const SERIES_CPE: ReadonlyArray<{ tipo: keyof SeriesSunat; etiqueta: string }> = [
  { tipo: 'factura', etiqueta: 'Factura' },
  { tipo: 'boleta', etiqueta: 'Boleta' },
  { tipo: 'nc_factura', etiqueta: 'Nota de crédito de factura' },
  { tipo: 'nc_boleta', etiqueta: 'Nota de crédito de boleta' },
  { tipo: 'nd_factura', etiqueta: 'Nota de débito de factura' },
  { tipo: 'nd_boleta', etiqueta: 'Nota de débito de boleta' },
];

/** Requisitos que se corrigen en otra tarjeta del panel (los demás, aquí o en el servidor). */
const DESTINOS: ReadonlyArray<[RegExp, DestinoFiscal]> = [
  [/^(certificado_|ruc_certificado$)/, 'certificados'],
  [/^(usuario_sol|clave_sol)$/, 'sol'],
  [/^emisor\./, 'emisor'],
  [/^series$/, 'operacion'],
];

type Declaraciones = ConfirmacionesActivacion & { no_ose: boolean; cert_ruc: boolean };

interface Correlativo {
  serie: string;
  etiqueta: string;
  valor: number | null;
}

function declaracionesDe(config: ConfiguracionSunat): Declaraciones {
  return {
    emisor_electronico_sol: config.confirmaciones.emisor_electronico_sol,
    certificado_en_sol: config.confirmaciones.certificado_en_sol,
    usuario_sol_secundario: config.confirmaciones.usuario_sol_secundario,
    ruc_habido: config.confirmaciones.ruc_habido,
    no_ose: !!config.confirmacion_no_ose,
    cert_ruc: config.cert_ruc_confirmado,
  };
}

function correlativosDe(config: ConfiguracionSunat): Correlativo[] {
  return SERIES_CPE.map(({ tipo, etiqueta }) => {
    const serie = config.series[tipo];
    return { serie, etiqueta, valor: config.correlativo_inicial[serie] ?? 1 };
  });
}

function mismos(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** «producción», « Produccion » y «PRODUCCION» valen igual: lo importante es escribirlo. */
function normalizarPalabra(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
}

function fechaCorta(valor: string): string {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime())
    ? valor
    : fecha.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Asistente de activación de la emisión en PRODUCCIÓN (D1.4): requisitos del checklist con lo que falta,
 * declaraciones sobre SOL, primer número de cada serie, prueba de credenciales SOL y el cambio de
 * ambiente con confirmación fuerte. Los guardados los hace el panel (evento `guardar`); los borradores
 * con cambios sin guardar sobreviven a las recargas que provocan otras secciones.
 */
@Component({
  selector: 'app-activacion-produccion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './activacion-produccion.component.html',
  styleUrl: './activacion-produccion.component.css',
})
export class ActivacionProduccionComponent implements OnChanges {
  @Input({ required: true }) config!: ConfiguracionSunat;
  /** El panel está guardando o recargando: no se acepta otra acción. */
  @Input() bloqueado = false;
  @Output() readonly guardar = new EventEmitter<SolicitudGuardadoFiscal>();
  @Output() readonly irA = new EventEmitter<DestinoFiscal>();
  /** Se probaron las credenciales (queda en la bitácora). */
  @Output() readonly probado = new EventEmitter<void>();

  readonly confirmacionesSol = CONFIRMACIONES_SOL;
  readonly palabra = PALABRA_CONFIRMACION;
  declaraciones: Declaraciones = {
    emisor_electronico_sol: false,
    certificado_en_sol: false,
    usuario_sol_secundario: false,
    ruc_habido: false,
    no_ose: false,
    cert_ruc: false,
  };
  correlativos: Correlativo[] = [];
  probando = false;
  resultadoPrueba: ResultadoPruebaCredenciales | null = null;
  errorPrueba = '';

  private readonly api = inject(FiscalAdminService);
  private readonly alerta = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  ngOnChanges(cambios: SimpleChanges): void {
    const cambio = cambios['config'];
    if (!cambio) return;
    const anterior = cambio.previousValue as ConfiguracionSunat | undefined;
    // Lo editado y no guardado se conserva cuando el panel recarga por otra sección.
    if (!anterior || mismos(this.declaraciones, declaracionesDe(anterior))) {
      this.declaraciones = declaracionesDe(this.config);
    }
    const nuevos = correlativosDe(this.config);
    const otrasSeries = !mismos(
      nuevos.map((c) => c.serie),
      this.correlativos.map((c) => c.serie),
    );
    if (!anterior || otrasSeries || mismos(this.correlativos, correlativosDe(anterior))) {
      this.correlativos = nuevos;
    }
  }

  get items(): ItemChecklistFiscal[] {
    return this.config.estado.checklist.cpe.items;
  }

  get pendientes(): ItemChecklistFiscal[] {
    return this.items.filter((item) => !item.ok);
  }

  get cumplidos(): ItemChecklistFiscal[] {
    return this.items.filter((item) => item.ok);
  }

  get progreso(): number {
    return this.items.length ? Math.round((this.cumplidos.length / this.items.length) * 100) : 0;
  }

  get emisionActiva(): boolean {
    return this.config.proveedor === 'sunat_directo' && this.config.ambiente === 'produccion';
  }

  get enProduccion(): boolean {
    return this.config.ambiente === 'produccion';
  }

  /** El RUC no se pudo leer del certificado de producción: lo confirma el administrador (D1). */
  get certificadoSinRuc(): boolean {
    const certificado = this.config.certificado.produccion;
    return !!certificado && !certificado.ruc;
  }

  get declaracionesSinGuardar(): boolean {
    return this.cambiosDeclaraciones() !== null;
  }

  get correlativosValidos(): boolean {
    return this.correlativos.every(
      (c) => Number.isInteger(c.valor) && (c.valor as number) >= 1 && (c.valor as number) <= MAXIMO_CORRELATIVO,
    );
  }

  get correlativosSinGuardar(): boolean {
    return !mismos(this.correlativos, correlativosDe(this.config));
  }

  get puedeProbarCredenciales(): boolean {
    const c = this.config;
    return (
      !!c.sol.usuario &&
      c.sol.tiene_clave &&
      c.estado.esquema.listo &&
      c.estado.cifrado_disponible &&
      !this.probando &&
      !this.bloqueado
    );
  }

  /** Exige el checklist completo y guardado (el servidor lo vuelve a validar al activar). */
  get puedeActivar(): boolean {
    const c = this.config;
    return (
      !this.emisionActiva &&
      c.estado.listo_para_produccion &&
      c.estado.esquema.listo &&
      !this.bloqueado &&
      !this.declaracionesSinGuardar &&
      !this.correlativosSinGuardar
    );
  }

  destino(item: ItemChecklistFiscal): DestinoFiscal | null {
    return DESTINOS.find(([patron]) => patron.test(item.codigo))?.[1] ?? null;
  }

  guardarDeclaraciones(): void {
    if (this.bloqueado) return;
    const cambios = this.cambiosDeclaraciones();
    if (!cambios) {
      this.alerta.toast({ type: 'info', title: 'No hay cambios en las declaraciones' });
      return;
    }
    this.guardar.emit({ cambios, mensaje: 'Declaraciones guardadas' });
  }

  /** Guardar con los mismos valores también cuenta: deja constancia de que se revisaron. */
  guardarCorrelativos(): void {
    if (this.bloqueado || !this.correlativosValidos) return;
    const correlativo_inicial = Object.fromEntries(
      this.correlativos.map((c) => [c.serie, Math.trunc(Number(c.valor))]),
    );
    this.guardar.emit({ cambios: { correlativo_inicial }, mensaje: 'Primer número de cada serie guardado' });
  }

  probarCredenciales(): void {
    if (!this.puedeProbarCredenciales) return;
    this.probando = true;
    this.resultadoPrueba = null;
    this.errorPrueba = '';
    this.api
      .probarCredencialesProduccion()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.probando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (resultado) => {
          this.resultadoPrueba = resultado;
          this.probado.emit();
        },
        error: (e) => {
          this.errorPrueba = mensajeDeError(e, 'No se pudieron probar las credenciales SOL de producción');
        },
      });
  }

  async activar(): Promise<void> {
    if (!this.puedeActivar) return;
    const texto = await this.alerta.pedirTexto({
      title: '¿Activar la emisión en PRODUCCIÓN?',
      message: this.resumenActivacion(),
      allowHtml: true,
      etiqueta: `Escriba ${PALABRA_CONFIRMACION} para confirmar`,
      placeholder: PALABRA_CONFIRMACION,
      minimo: PALABRA_CONFIRMACION.length,
      maximo: 20,
      mensajeMinimo: `Escriba ${PALABRA_CONFIRMACION} para confirmar`,
      confirmText: 'Activar producción',
      danger: true,
    });
    if (texto === null || this.destroyRef.destroyed) return;
    if (normalizarPalabra(texto) !== PALABRA_CONFIRMACION) {
      this.alerta.toast({
        type: 'warning',
        title: 'No se activó la producción',
        message: `Para confirmar escriba ${PALABRA_CONFIRMACION} tal cual.`,
      });
      return;
    }
    this.guardar.emit({
      cambios: { ambiente: 'produccion', proveedor: 'sunat_directo' },
      mensaje: 'Emisión de producción activada',
    });
  }

  async desactivar(): Promise<void> {
    if (this.bloqueado) return;
    const confirmado = await this.alerta.confirmarPeligro({
      title: '¿Desactivar la emisión electrónica?',
      message:
        'Las ventas nuevas se registrarán sin comprobante y quedarán en «ventas sin comprobante» para emitirlo ' +
        'después. Los comprobantes ya enviados no cambian.',
      confirmText: 'Desactivar emisión',
    });
    if (!confirmado || this.destroyRef.destroyed) return;
    this.guardar.emit({ cambios: { proveedor: 'nubefact' }, mensaje: 'Emisión electrónica desactivada' });
  }

  async volverABeta(): Promise<void> {
    if (this.bloqueado) return;
    const confirmado = await this.alerta.confirmar({
      title: '¿Volver al ambiente BETA (pruebas)?',
      message:
        'Se desactiva la emisión de producción y el sistema vuelve a SUNAT BETA: allí solo se emiten pruebas sin ' +
        'validez tributaria, y solo si activa la emisión de prueba del POS. Mientras tanto las ventas se registran ' +
        'sin comprobante.',
      confirmText: 'Volver a BETA',
      danger: true,
    });
    if (!confirmado || this.destroyRef.destroyed) return;
    this.guardar.emit({
      cambios: { ambiente: 'beta', proveedor: 'nubefact' },
      mensaje: 'Ambiente BETA (pruebas) restablecido',
    });
  }

  /** Solo lo que cambió respecto de lo guardado (la declaración sin OSE se registra con fecha). */
  private cambiosDeclaraciones(): CambiosConfiguracionFiscal | null {
    const guardadas = declaracionesDe(this.config);
    const cambios: CambiosConfiguracionFiscal = {};
    const confirmaciones: Partial<ConfirmacionesActivacion> = {};
    for (const { clave } of CONFIRMACIONES_SOL) {
      if (this.declaraciones[clave] !== guardadas[clave]) confirmaciones[clave] = this.declaraciones[clave];
    }
    if (Object.keys(confirmaciones).length) cambios.confirmaciones = confirmaciones;
    if (this.declaraciones.no_ose !== guardadas.no_ose) cambios.confirmo_no_ose = this.declaraciones.no_ose;
    if (this.certificadoSinRuc && this.declaraciones.cert_ruc !== guardadas.cert_ruc) {
      cambios.cert_ruc_confirmado = this.declaraciones.cert_ruc;
    }
    return Object.keys(cambios).length ? cambios : null;
  }

  /** Resumen de lo que cambia, para la confirmación (todo dato del servidor va escapado). */
  private resumenActivacion(): string {
    const c = this.config;
    const e = escapeHtmlAlerta;
    const s = c.series;
    const desde = (serie: string) => c.correlativo_inicial[serie] ?? 1;
    const certificado = c.certificado.produccion;
    const lineas = [
      `Ambiente: <strong>${c.ambiente === 'produccion' ? 'PRODUCCIÓN' : 'SUNAT BETA → PRODUCCIÓN'}</strong>. ` +
        'Las ventas con comprobante se envían a SUNAT con validez tributaria.',
      `Emisor: <strong>${e(c.emisor.ruc)} · ${e(c.emisor.razon_social)}</strong>.`,
      `Series: factura <strong>${e(s.factura)}</strong> desde el N.º ${desde(s.factura)} y boleta ` +
        `<strong>${e(s.boleta)}</strong> desde el N.º ${desde(s.boleta)}; notas ${e(s.nc_factura)}, ` +
        `${e(s.nc_boleta)}, ${e(s.nd_factura)} y ${e(s.nd_boleta)}.`,
      certificado
        ? `Certificado de producción: ${e(certificado.titular || certificado.nombre_archivo || 'cargado')}` +
          `${certificado.ruc ? ` (RUC ${e(certificado.ruc)})` : ''}, vence el ${e(fechaCorta(certificado.vigente_hasta))}.`
        : '',
      c.sol.usuario ? `Usuario secundario SOL: <strong>${e(c.sol.usuario)}</strong>.` : '',
      'La emisión de prueba del POS en SUNAT BETA deja de usarse.',
    ].filter(Boolean);
    return (
      '<p>Esto cambia desde ahora:</p>' +
      `<ul class="hs-swal-lista">${lineas.map((linea) => `<li>${linea}</li>`).join('')}</ul>` +
      '<small>Para detenerla al instante use «Desactivar emisión» en este panel.</small>'
    );
  }
}
