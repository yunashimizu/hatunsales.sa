import { CommonModule, DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, catchError, finalize, forkJoin, map, of } from 'rxjs';
import { AlertService } from '../../../shared/services/alert.service';
import { descargarArchivo } from '../../../shared/utils/descargar-archivo';
import {
  AmbienteFiscal,
  AuditoriaFiscal,
  CertificadoFiscal,
  ConfigGre,
  ConfiguracionSunat,
  EmisorBeta,
  EmisorSunat,
  EstadoFiscalGlobal,
  EstadoPosBetaFiscal,
  ItemChecklistFiscal,
  OperacionFiscal,
  ResultadoPruebaFiscal,
  SeriesSunat,
} from '../../models/fiscal.models';
import {
  errorOperativo,
  mensajeDeError,
  normalizarErrorBlob,
} from '../../service/api-base.service';
import { FiscalAdminService } from '../../service/fiscal-admin.service';
import { FiscalEstadoService } from '../../service/fiscal-estado.service';
import {
  ActivacionProduccionComponent,
  DestinoFiscal,
  SolicitudGuardadoFiscal,
} from './activacion-produccion/activacion-produccion.component';
import { EnviosSunatComponent } from './envios-sunat/envios-sunat.component';

type SeccionFiscal = 'resumen' | 'envios' | 'configuracion' | 'pruebas' | 'bitacora';

/** Aviso del estado de la emisión (certificado y plazos de envío). */
interface AlertaFiscal {
  tono: 'aviso' | 'peligro';
  icono: string;
  titulo: string;
  texto: string;
}

/** Una lectura de un grupo que no tumba a las demás: trae el valor o el aviso que se muestra. */
interface Lectura<T> {
  valor: T | null;
  error: string;
}

function lecturaSegura<T>(fuente: Observable<T>, fallo: string): Observable<Lectura<T>> {
  return fuente.pipe(
    map((valor) => ({ valor, error: '' })),
    catchError((e) => of({ valor: null, error: mensajeDeError(e, fallo) })),
  );
}

/** El PUT /fiscal/configuracion devuelve avisos no bloqueantes del cambio (p. ej. al activar producción). */
function advertenciasDe(respuesta: unknown): string[] {
  const lista = (respuesta as { advertencias?: unknown } | null)?.advertencias;
  return Array.isArray(lista) ? lista.filter((a): a is string => typeof a === 'string' && !!a) : [];
}

/** Igual que el aviso del servidor: un certificado que vence en menos de 30 días se renueva ya. */
const DIAS_AVISO_CERTIFICADO = 30;

const NOMBRES_ACCION_AUDITORIA: Readonly<Record<string, string>> = {
  PROVEEDOR_CAMBIADO: 'Emisión de producción activada o desactivada',
  AMBIENTE_CAMBIADO: 'Ambiente cambiado (BETA / producción)',
  CONFIG_OPERACION: 'Opciones de operación',
  CONFIG_EMISOR: 'Datos del emisor',
  SERIES: 'Series',
  CRED_SOL_ACTUALIZADA: 'Credenciales SOL actualizadas',
  CRED_SOL_ELIMINADA: 'Credenciales SOL eliminadas',
  CRED_GRE_ACTUALIZADA: 'Credenciales API de guías actualizadas',
  CRED_GRE_ELIMINADA: 'Credenciales API de guías eliminadas',
  CONFIG_GRE: 'Configuración de guías',
  CONFIRMACION_NO_OSE: 'Declaración «sin OSE» confirmada',
  CONFIRMACION_NO_OSE_RETIRADA: 'Declaración «sin OSE» retirada',
  CERT_SUBIDO: 'Certificado subido',
  CERT_REEMPLAZADO: 'Certificado reemplazado',
  CERT_ELIMINADO: 'Certificado eliminado',
  CERT_AUTOFIRMADO_GENERADO: 'Certificado de pruebas generado',
  CERT_RECIFRADO: 'Certificado protegido con la llave nueva',
  PRUEBA_CONEXION: 'Prueba de conexión',
  CONFIRMACIONES_ACTIVACION: 'Declaraciones sobre SOL',
  CERT_RUC_CONFIRMADO: 'RUC del certificado confirmado',
  CERT_RUC_CONFIRMACION_RETIRADA: 'Confirmación del RUC del certificado retirada',
  CORRELATIVO_INICIAL_CPE: 'Primer número de las series',
  EMISION_BLOQUEADA: 'Emisión detenida por SUNAT',
  EMISION_REANUDADA: 'Emisión reanudada',
  ENVIO_CONFIRMADO_MANUAL: 'Envío confirmado manualmente',
  PRUEBA_CREDENCIALES_PRODUCCION: 'Prueba de credenciales SOL de producción',
  POS_BETA_ACTIVADO: 'Emisión de prueba del POS activada',
  POS_BETA_DESACTIVADO: 'Emisión de prueba del POS desactivada',
};

@Component({
  selector: 'app-facturacion-sunat',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ActivacionProduccionComponent, EnviosSunatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './facturacion-sunat.component.html',
  styleUrl: './facturacion-sunat.component.css',
})
export class FacturacionSunatComponent implements OnInit {
  @ViewChild('archivoCertificado') archivoInput?: ElementRef<HTMLInputElement>;
  @ViewChild(EnviosSunatComponent) envios?: EnviosSunatComponent;
  /** Estado global de la emisión (lo comparten la cabecera y el POS). */
  readonly fiscalEstado = inject(FiscalEstadoService);
  seccion: SeccionFiscal = 'resumen';
  readonly secciones: ReadonlyArray<{ id: SeccionFiscal; etiqueta: string; icono: string }> = [
    { id: 'resumen', etiqueta: 'Estado y activación', icono: 'bi-broadcast' },
    { id: 'envios', etiqueta: 'Envíos SUNAT', icono: 'bi-send-check' },
    { id: 'configuracion', etiqueta: 'Configuración', icono: 'bi-sliders' },
    { id: 'pruebas', etiqueta: 'Pruebas BETA', icono: 'bi-flask' },
    { id: 'bitacora', etiqueta: 'Bitácora', icono: 'bi-journal-text' },
  ];
  config: ConfiguracionSunat | null = null;
  operacion!: OperacionFiscal;
  emisor!: EmisorSunat;
  gre!: ConfigGre;
  cargando = false;
  ocupado = false;
  errorCarga = '';
  ambienteCertificado: AmbienteFiscal = 'beta';
  otroEmisorBeta = false;
  archivo: File | null = null;
  claveCertificado = '';
  sol = { usuario: '', clave: '' };
  credencialesGre = { clientId: '', clientSecret: '' };
  ambientePrueba: AmbienteFiscal = 'beta';
  documentoPrueba: 'cpe' | 'gre' = 'cpe';
  tipoCpePrueba: '01' | '03' = '01';
  emisorBeta: EmisorBeta | null = null;
  rucCertificadoBeta: string | null = null;
  rucEmisorBetaGuardado: string | null = null;
  estadoPosBeta: EstadoPosBetaFiscal | null = null;
  cargandoBeta = false;
  errorEmisorBeta = '';
  errorPosBeta = '';
  resultadoPrueba: ResultadoPruebaFiscal | null = null;
  auditoria: AuditoriaFiscal[] = [];
  siguienteAuditoria: number | null = null;
  cargandoAuditoria = false;
  errorAuditoria = '';
  readonly ambientes: AmbienteFiscal[] = ['beta', 'produccion'];
  readonly camposEmisor: {
    clave: keyof EmisorSunat;
    etiqueta: string;
    maximo: number;
    patron: string;
  }[] = [
    { clave: 'razon_social', etiqueta: 'Razón social', maximo: 200, patron: '.*' },
    {
      clave: 'nombre_comercial',
      etiqueta: 'Nombre comercial (opcional)',
      maximo: 200,
      patron: '.*',
    },
    { clave: 'direccion', etiqueta: 'Dirección fiscal', maximo: 200, patron: '.*' },
    { clave: 'ubigeo', etiqueta: 'Ubigeo (6 dígitos)', maximo: 6, patron: '[0-9]{6}' },
    { clave: 'distrito', etiqueta: 'Distrito', maximo: 60, patron: '.*' },
    { clave: 'provincia', etiqueta: 'Provincia', maximo: 60, patron: '.*' },
    { clave: 'departamento', etiqueta: 'Departamento', maximo: 60, patron: '.*' },
    {
      clave: 'codigo_establecimiento',
      etiqueta: 'Establecimiento (0000 = domicilio fiscal)',
      maximo: 4,
      patron: '[0-9]{4}',
    },
  ];
  readonly series: { clave: keyof SeriesSunat; etiqueta: string; patron: string }[] = [
    { clave: 'factura', etiqueta: 'Factura', patron: 'F[A-Z0-9]{3}' },
    { clave: 'boleta', etiqueta: 'Boleta', patron: 'B[A-Z0-9]{3}' },
    { clave: 'nc_factura', etiqueta: 'NC de factura', patron: 'F[A-Z0-9]{3}' },
    { clave: 'nc_boleta', etiqueta: 'NC de boleta', patron: 'B[A-Z0-9]{3}' },
    { clave: 'nd_factura', etiqueta: 'ND de factura', patron: 'F[A-Z0-9]{3}' },
    { clave: 'nd_boleta', etiqueta: 'ND de boleta', patron: 'B[A-Z0-9]{3}' },
    { clave: 'gre_remitente', etiqueta: 'Guía remitente', patron: 'T[A-Z0-9]{3}' },
  ];
  /** Envíos por atender (pendientes de reenvío y sin respuesta) del ambiente vigente. */
  readonly porAtender = computed(() => {
    const cola = this.fiscalEstado.estado()?.cola;
    return cola ? cola.pendientes + cola.inciertos : 0;
  });
  readonly alertas = computed(() => alertasDeEstado(this.fiscalEstado.estado()));
  private readonly api = inject(FiscalAdminService);
  private readonly alerta = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly documento = inject(DOCUMENT);

  ngOnInit(): void {
    this.cargar();
    this.fiscalEstado.iniciar();
  }

  /** «Actualizar» de la cabecera: descarta los borradores y vuelve a leer todo. */
  actualizarTodo(): void {
    this.cargar();
    this.fiscalEstado.refrescar(true);
    this.envios?.cargar();
  }

  cargar(restablecer = true): void {
    if (this.cargando) return;
    this.cargando = true;
    this.errorCarga = '';
    this.api
      .configuracion()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (config) => {
          this.aplicarConfiguracion(config, restablecer);
          this.cargarAuditoria();
          this.cargarBeta(restablecer);
        },
        error: (e) => {
          this.errorCarga =
            e.status === 404
              ? 'La administración de SUNAT aún no está disponible en el servidor. La pantalla estará lista al desplegar ese módulo.'
              : mensajeDeError(e, 'No se pudo leer la configuración de SUNAT');
        },
      });
  }

  elegirSeccion(seccion: SeccionFiscal): void {
    this.seccion = seccion;
  }

  /** Desde el estado de la emisión: abre Envíos SUNAT con ese estado filtrado. */
  verEnvios(estado = ''): void {
    this.seccion = 'envios';
    this.envios?.mostrar(estado);
    this.desplazarA('fiscal-panel-envios');
  }

  /** Desde un requisito pendiente del asistente: lleva a la tarjeta donde se corrige. */
  irA(destino: DestinoFiscal): void {
    this.seccion = 'configuracion';
    this.desplazarA(`fiscal-${destino}`);
  }

  guardarOperacion(): void {
    this.ejecutar(
      this.api.guardar({ ...this.operacion, series: { ...this.operacion.series } }),
      'Operación y series guardadas',
    );
  }

  guardarEmisor(): void {
    this.ejecutar(this.api.guardar({ emisor: this.emisor }), 'Datos fiscales del emisor guardados');
  }

  guardarGre(): void {
    this.ejecutar(this.api.guardar({ gre: this.gre }), 'Configuración de guías guardada');
  }

  /** Lo que pide el asistente de activación (declaraciones, correlativos, ambiente). */
  guardarCambios(solicitud: SolicitudGuardadoFiscal): void {
    this.ejecutar(this.api.guardar(solicitud.cambios), solicitud.mensaje);
  }

  async cambiarTareas(interruptor: HTMLInputElement): Promise<void> {
    const activas = interruptor.checked;
    const revertir = () => {
      interruptor.checked = !activas;
      this.cdr.markForCheck();
    };
    if (this.ocupado || this.cargando || !this.config) {
      revertir();
      return;
    }
    if (!activas) {
      const confirmado = await this.alerta.confirmar({
        title: '¿Desactivar las tareas programadas?',
        message:
          'Los envíos pendientes ya no se reintentarán solos ni se recuperarán los que quedaron sin respuesta: ' +
          'tendrá que hacerlo con «Reintentar» en Envíos SUNAT.',
        confirmText: 'Desactivar tareas',
        danger: true,
      });
      if (!confirmado || this.destroyRef.destroyed) {
        revertir();
        return;
      }
    }
    this.ejecutar(
      this.api.guardar({ tareas_activas: activas }),
      activas ? 'Tareas programadas activadas' : 'Tareas programadas desactivadas',
      undefined,
      revertir,
    );
  }

  async reanudarEmision(): Promise<void> {
    if (this.ocupado || this.cargando) return;
    const confirmado = await this.alerta.confirmar({
      title: '¿Reanudar la emisión?',
      message:
        'Hágalo solo después de corregir la causa que indicó SUNAT (clave SOL o certificado). Si sigue igual, ' +
        'SUNAT volverá a rechazar el envío y la emisión se detendrá de nuevo.',
      confirmText: 'Reanudar emisión',
    });
    if (!confirmado || this.destroyRef.destroyed) return;
    this.ocupado = true;
    this.api
      .reanudarEmision()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.ocupado = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (resultado) => {
          this.alerta.toast(
            resultado.reanudada
              ? { type: 'success', title: 'Emisión reanudada' }
              : { type: 'info', title: 'La emisión no estaba detenida' },
          );
          this.fiscalEstado.refrescar(true);
          this.cargar(false);
        },
        error: (e) => this.alerta.error(errorOperativo(e, 'No se pudo reanudar la emisión')),
      });
  }

  /** Un envío cambió (reintento, CDR, confirmación): el estado y la bitácora también. */
  alCambiarEnvios(): void {
    this.fiscalEstado.refrescar(true);
    this.cargarAuditoria();
  }

  textoEmision(estado: EstadoFiscalGlobal): string {
    const produccion = estado.ambiente === 'produccion';
    if (estado.emision_activa === null) return 'Estado de la emisión sin confirmar';
    if (!estado.emision_activa) return produccion ? 'Emisión detenida · producción' : 'Emisión detenida · SUNAT BETA';
    return produccion ? 'Emisión activa · PRODUCCIÓN' : 'Emisión activa · SUNAT BETA (pruebas)';
  }

  claseEmision(estado: EstadoFiscalGlobal): string {
    if (estado.emision_activa === null) return 'adm-insignia--neutra';
    if (!estado.emision_activa) return 'adm-insignia--peligro';
    return estado.ambiente === 'produccion' ? 'adm-insignia--exito' : 'adm-insignia--aviso';
  }

  descripcionEmision(estado: EstadoFiscalGlobal): string {
    if (estado.emision_activa === null) {
      return 'El servidor no pudo confirmar si la emisión está activa. Actualice en unos segundos.';
    }
    if (!estado.emision_activa) {
      return estado.motivo || 'La emisión electrónica no está activa: las ventas se registran sin comprobante.';
    }
    return estado.ambiente === 'produccion'
      ? 'Las ventas con comprobante se emiten en SUNAT con validez tributaria.'
      : 'Las ventas del POS se envían a SUNAT BETA con el emisor de pruebas: no tienen validez tributaria.';
  }

  /** Vencido, por vencer (menos de 30 días) o autofirmado en producción. */
  alertasCertificado(certificado: CertificadoFiscal): AlertaFiscal[] {
    const alertas: AlertaFiscal[] = [];
    if (certificado.vencido) {
      alertas.push({
        tono: 'peligro',
        icono: 'bi-shield-x',
        titulo: 'Certificado vencido',
        texto: 'SUNAT rechaza lo que se firme con él: suba uno vigente.',
      });
    } else if (certificado.dias_para_vencer < DIAS_AVISO_CERTIFICADO) {
      alertas.push({
        tono: 'aviso',
        icono: 'bi-hourglass-split',
        titulo: `Vence en ${certificado.dias_para_vencer} día(s)`,
        texto: 'Renuévelo y súbalo antes de esa fecha para no detener la emisión.',
      });
    }
    if (certificado.ambiente === 'produccion' && certificado.autofirmado) {
      alertas.push({
        tono: 'peligro',
        icono: 'bi-shield-exclamation',
        titulo: 'Autofirmado',
        texto: 'No sirve para producción: suba el certificado real (CDT de SUNAT o de una entidad acreditada).',
      });
    }
    return alertas;
  }

  pendientesGre(cfg: ConfiguracionSunat): ItemChecklistFiscal[] {
    return cfg.estado.checklist.gre.items.filter((item) => !item.ok);
  }

  nombreAccion(accion: string): string {
    return NOMBRES_ACCION_AUDITORIA[accion] ?? accion;
  }

  seleccionarArchivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0] ?? null;
    this.archivo = null;
    if (!archivo) return;
    if (!/\.(pfx|p12)$/i.test(archivo.name) || archivo.size === 0 || archivo.size > 200 * 1024) {
      input.value = '';
      this.alerta.toast({
        type: 'warning',
        title: 'Seleccione un certificado .pfx o .p12 de hasta 200 KB.',
      });
      return;
    }
    this.archivo = archivo;
  }

  subirCertificado(): void {
    if (!this.archivo) return;
    this.ejecutar(
      this.api.subirCertificado(
        this.archivo,
        this.claveCertificado,
        this.ambienteCertificado,
        this.otroEmisorBeta,
      ),
      'Certificado guardado',
      () => {
        this.claveCertificado = '';
        this.archivo = null;
        if (this.archivoInput) this.archivoInput.nativeElement.value = '';
      },
    );
  }

  generarAutofirmado(): void {
    this.ejecutar(this.api.generarAutofirmado(), 'Certificado de pruebas BETA generado');
  }

  async eliminarCertificado(ambiente: AmbienteFiscal): Promise<void> {
    if (this.ocupado || this.cargando) return;
    const respuesta = await this.alerta.confirm({
      title: `¿Eliminar el certificado de ${ambiente === 'produccion' ? 'producción' : 'BETA'}?`,
      confirmText: 'Eliminar certificado',
    });
    if (respuesta.isConfirmed && !this.destroyRef.destroyed)
      this.ejecutar(this.api.eliminarCertificado(ambiente), 'Certificado eliminado');
  }

  guardarSol(): void {
    this.ejecutar(
      this.api.guardarSol(this.sol.usuario, this.sol.clave),
      'Credenciales SOL guardadas',
      () => {
        this.sol.clave = '';
      },
    );
  }

  guardarCredencialesGre(): void {
    this.ejecutar(
      this.api.guardarGre(this.credencialesGre.clientId, this.credencialesGre.clientSecret),
      'Credenciales API de guías guardadas',
      () => {
        this.credencialesGre = { clientId: '', clientSecret: '' };
      },
    );
  }

  async eliminarCredenciales(tipo: 'sol' | 'gre'): Promise<void> {
    if (this.ocupado || this.cargando) return;
    const respuesta = await this.alerta.confirm({
      title: `¿Eliminar las credenciales ${tipo === 'sol' ? 'SOL' : 'API de guías'}?`,
      confirmText: 'Eliminar credenciales',
    });
    if (respuesta.isConfirmed && !this.destroyRef.destroyed)
      this.ejecutar(this.api.eliminarCredenciales(tipo), 'Credenciales eliminadas');
  }

  get puedeProbar(): boolean {
    return (
      !!this.config?.estado.esquema.listo &&
      this.config.estado.cifrado_disponible &&
      !!this.config.certificado[this.ambientePrueba] &&
      (this.ambientePrueba !== 'beta' ||
        this.documentoPrueba !== 'cpe' ||
        (!this.cargandoBeta &&
          !this.errorEmisorBeta &&
          this.rucEmisorBetaGuardado === this.config.certificado.beta?.ruc))
    );
  }

  probar(): void {
    if (!this.puedeProbar || this.ocupado || this.cargando || this.errorCarga) return;
    this.ocupado = true;
    this.resultadoPrueba = null;
    this.api
      .probar(this.ambientePrueba, this.documentoPrueba, this.tipoCpePrueba)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.ocupado = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (r) => {
          this.resultadoPrueba = r;
          this.cargarAuditoria();
          this.cargarBeta();
          // Una prueba BETA de comprobante deja un envío nuevo en la lista.
          this.envios?.cargar();
        },
        error: (e) => this.alerta.error(errorOperativo(e, 'No se pudo validar la configuración')),
      });
  }

  descargarPublico(ambiente: AmbienteFiscal): void {
    if (this.ocupado) return;
    this.ocupado = true;
    this.api
      .certificadoPublico(ambiente)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.ocupado = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) => descargarArchivo(blob, `certificado-publico-${ambiente}.cer`),
        error: async (e) =>
          this.alerta.error(
            errorOperativo(
              await normalizarErrorBlob(e),
              'No se pudo descargar el certificado público',
            ),
          ),
      });
  }

  /** Emisor de pruebas y emisión de prueba del POS: si una falla, la otra se muestra igual. */
  cargarBeta(restablecer = false): void {
    if (this.cargandoBeta) return;
    this.cargandoBeta = true;
    forkJoin({
      emisor: lecturaSegura(this.api.emisorBeta(), 'No se pudo leer el emisor de pruebas BETA'),
      pos: lecturaSegura(
        this.api.estadoPosBeta(),
        'No se pudo leer el estado de la emisión de prueba del POS',
      ),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargandoBeta = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe(({ emisor, pos }) => {
        this.errorEmisorBeta = emisor.error;
        if (emisor.valor) {
          if (restablecer || !this.emisorBeta) this.emisorBeta = { ...emisor.valor.emisor };
          this.rucCertificadoBeta = emisor.valor.ruc_certificado_beta;
          this.rucEmisorBetaGuardado = emisor.valor.emisor.ruc;
        }
        this.errorPosBeta = pos.error;
        this.estadoPosBeta = pos.valor;
      });
  }

  guardarEmisorBeta(): void {
    if (!this.emisorBeta) return;
    this.ejecutar(this.api.guardarEmisorBeta(this.emisorBeta), 'Emisor de pruebas BETA guardado');
  }

  get puedeActivarPosBeta(): boolean {
    return (
      this.config?.ambiente === 'beta' &&
      !!this.config.estado.esquema.listo &&
      !!this.estadoPosBeta?.listo &&
      this.estadoPosBeta.ruc_emisor_beta === this.estadoPosBeta.ruc_certificado_beta
    );
  }

  async cambiarEstadoPosBeta(): Promise<void> {
    if (!this.estadoPosBeta || this.ocupado || this.cargando || this.cargandoBeta) return;
    const activar = !this.estadoPosBeta.habilitado;
    if (activar && !this.puedeActivarPosBeta) return;
    const respuesta = await this.alerta.confirm({
      title: activar ? '¿Activar la emisión de prueba del POS en BETA?' : '¿Desactivar la emisión de prueba del POS?',
      message: activar
        ? 'Las ventas del POS se enviarán a SUNAT BETA con el emisor de pruebas configurado. Estos comprobantes no tienen validez tributaria y no sustituyen la emisión real.'
        : 'Las ventas nuevas dejarán de enviarse a SUNAT BETA y se registrarán sin comprobante.',
      confirmText: activar ? 'Activar solo para pruebas' : 'Desactivar',
    });
    if (respuesta.isConfirmed && !this.destroyRef.destroyed) {
      this.ejecutar(
        this.api.cambiarEstadoPosBeta(activar),
        activar ? 'Emisión de prueba del POS activada' : 'Emisión de prueba del POS desactivada',
      );
    }
  }

  cargarAuditoria(mas = false): void {
    if (this.cargandoAuditoria || (mas && !this.siguienteAuditoria)) return;
    this.cargandoAuditoria = true;
    this.errorAuditoria = '';
    this.api
      .auditoria(mas ? this.siguienteAuditoria! : undefined)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargandoAuditoria = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (r) => {
          this.auditoria = mas ? [...this.auditoria, ...r.registros] : r.registros;
          this.siguienteAuditoria = r.siguiente;
        },
        error: (e) => {
          this.errorAuditoria = mensajeDeError(e, 'No se pudo consultar la bitácora');
        },
      });
  }

  private aplicarConfiguracion(config: ConfiguracionSunat, restablecer: boolean): void {
    this.config = config;
    if (!restablecer) return;
    this.operacion = {
      boletas_modo: config.boletas_modo,
      envio_en_linea: config.envio_en_linea,
      aplicar_reglas_2027: config.aplicar_reglas_2027,
      codigo_producto_defecto: config.codigo_producto_defecto ?? '',
      series: { ...config.series },
    };
    const { ruc, ...emisor } = config.emisor;
    this.emisor = { ...emisor };
    const partida = config.gre.partida;
    this.gre = {
      activa: config.gre.activa,
      correlativo_inicial: config.gre.correlativo_inicial,
      partida: {
        ubigeo: partida.heredada_del_emisor.ubigeo ? '' : partida.ubigeo,
        direccion: partida.heredada_del_emisor.direccion ? '' : partida.direccion,
        codigo_establecimiento: partida.heredada_del_emisor.codigo_establecimiento
          ? ''
          : partida.codigo_establecimiento,
      },
    };
    this.sol.usuario = config.sol.usuario ?? '';
  }

  /**
   * Guarda, avisa (con las advertencias del servidor si las hay) y vuelve a leer la configuración sin
   * tocar los borradores de las demás secciones; el estado de la emisión también puede haber cambiado.
   */
  private ejecutar<T>(
    solicitud: Observable<T>,
    mensaje: string,
    alCompletar?: () => void,
    alFallar?: () => void,
  ): void {
    if (this.ocupado || this.cargando || !this.config || this.errorCarga) {
      alFallar?.();
      return;
    }
    this.ocupado = true;
    solicitud
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.ocupado = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (respuesta) => {
          alCompletar?.();
          this.resultadoPrueba = null;
          const advertencias = advertenciasDe(respuesta);
          if (advertencias.length) {
            void this.alerta.warning({ title: mensaje, message: advertencias.join(' ') });
          } else {
            this.alerta.toast({ type: 'success', title: mensaje });
          }
          this.cargar(false);
          this.fiscalEstado.refrescar(true);
        },
        error: (e) => {
          alFallar?.();
          this.alerta.error(errorOperativo(e, 'No se pudo guardar la configuración fiscal'));
        },
      });
  }

  /** Después de mostrar la pestaña (el panel oculto no se puede desplazar). */
  private desplazarA(id: string): void {
    this.cdr.markForCheck();
    setTimeout(() => this.documento.getElementById(id)?.scrollIntoView?.({ block: 'start' }));
  }
}

function alertasDeEstado(estado: EstadoFiscalGlobal | null): AlertaFiscal[] {
  if (!estado) return [];
  const alertas: AlertaFiscal[] = [];
  const produccion = estado.ambiente === 'produccion';
  const certificado = estado.certificado;
  const nombre = produccion ? 'de producción' : 'de pruebas';
  if (produccion && !certificado.cargado) {
    alertas.push({
      tono: 'peligro',
      icono: 'bi-shield-x',
      titulo: 'No hay certificado de producción',
      texto: 'Súbalo en Configuración › Certificados digitales.',
    });
  }
  if (certificado.vencido) {
    alertas.push({
      tono: 'peligro',
      icono: 'bi-shield-x',
      titulo: `El certificado ${nombre} está vencido`,
      texto: 'SUNAT rechaza lo que se firme con él: renuévelo y súbalo en Configuración › Certificados digitales.',
    });
  } else if (certificado.dias_para_vencer !== null && certificado.dias_para_vencer < DIAS_AVISO_CERTIFICADO) {
    alertas.push({
      tono: 'aviso',
      icono: 'bi-hourglass-split',
      titulo: `El certificado ${nombre} vence en ${certificado.dias_para_vencer} día(s)`,
      texto: 'Renuévelo (CDT en SOL o con su proveedor) y súbalo antes de esa fecha para no detener la emisión.',
    });
  }
  if (produccion && certificado.autofirmado) {
    alertas.push({
      tono: 'peligro',
      icono: 'bi-shield-exclamation',
      titulo: 'Certificado autofirmado en producción',
      texto: 'Solo sirve para pruebas en BETA: suba el certificado real (CDT de SUNAT o de una entidad acreditada).',
    });
  }
  const plazos = estado.plazos;
  if (plazos && plazos.vencidos > 0) {
    alertas.push({
      tono: 'peligro',
      icono: 'bi-calendar-x',
      titulo: `${plazos.vencidos} comprobante(s) fuera del plazo de envío`,
      texto:
        'Las facturas y sus notas fuera de plazo se reemplazan por un comprobante nuevo; las boletas se informan por resumen diario en SUNAT.',
    });
  }
  if (plazos && plazos.vencen_hoy > 0) {
    alertas.push({
      tono: 'aviso',
      icono: 'bi-calendar-event',
      titulo: `${plazos.vencen_hoy} comprobante(s) vencen hoy`,
      texto: 'Reintente su envío hoy mismo desde Envíos SUNAT.',
    });
  }
  return alertas;
}
