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
import { RouterLink } from '@angular/router';
import { Observable, finalize, forkJoin } from 'rxjs';
import { AlertService } from '../../../shared/services/alert.service';
import { descargarArchivo } from '../../../shared/utils/descargar-archivo';
import {
  AmbienteFiscal,
  AuditoriaFiscal,
  ConfigGre,
  ConfiguracionSunat,
  EmisorSunat,
  EmisorBeta,
  EnvioBeta,
  EstadoPosBetaFiscal,
  TipoArchivoBeta,
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

@Component({
  selector: 'app-facturacion-sunat',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './facturacion-sunat.component.html',
  styleUrl: './facturacion-sunat.component.css',
})
export class FacturacionSunatComponent implements OnInit {
  @ViewChild('archivoCertificado') archivoInput?: ElementRef<HTMLInputElement>;
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
  enviosBeta: EnvioBeta[] = [];
  estadoPosBeta: EstadoPosBetaFiscal | null = null;
  cargandoBeta = false;
  errorBeta = '';
  puedeReintentarBeta(envio: Pick<EnvioBeta, 'estado' | 'accion_sunat'>): boolean {
    return envio.estado === 'PENDIENTE_REENVIO' && envio.accion_sunat !== 'RECUPERAR_CDR';
  }
  readonly nombresArchivoBeta: Record<TipoArchivoBeta, string> = {
    xml_original: 'XML original',
    xml_firmado: 'XML firmado',
    zip: 'ZIP enviado',
    cdr_xml: 'CDR XML',
    cdr_zip: 'CDR ZIP',
  };
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
  private readonly api = inject(FiscalAdminService);
  private readonly alerta = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.cargar();
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
          this.config = config;
          if (restablecer) {
            this.operacion = {
              proveedor: config.proveedor,
              ambiente: config.ambiente,
              boletas_modo: config.boletas_modo,
              envio_en_linea: config.envio_en_linea,
              tareas_activas: config.tareas_activas,
              aplicar_reglas_2027: config.aplicar_reglas_2027,
              codigo_producto_defecto: config.codigo_producto_defecto ?? '',
              series: { ...config.series },
              confirmo_no_ose: !!config.confirmacion_no_ose,
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

  guardarOperacion(): void {
    const operacion = { ...this.operacion };
    delete operacion.proveedor;
    this.ejecutar(this.api.guardar(operacion), 'Configuración fiscal guardada');
  }
  guardarEmisor(): void {
    this.ejecutar(this.api.guardar({ emisor: this.emisor }), 'Datos fiscales del emisor guardados');
  }
  guardarGre(): void {
    this.ejecutar(this.api.guardar({ gre: this.gre }), 'Configuración de guías guardada');
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
      title: `¿Eliminar certificado de ${ambiente}?`,
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
      title: `¿Eliminar credenciales ${tipo.toUpperCase()}?`,
      confirmText: 'Eliminar credenciales',
    });
    if (respuesta.isConfirmed && !this.destroyRef.destroyed)
      this.ejecutar(this.api.eliminarCredenciales(tipo), 'Credenciales eliminadas');
  }

  private ejecutar<T>(solicitud: Observable<T>, mensaje: string, alCompletar?: () => void): void {
    if (this.ocupado || this.cargando || !this.config || this.errorCarga) return;
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
        next: () => {
          alCompletar?.();
          this.resultadoPrueba = null;
          this.alerta.toast({ type: 'success', title: mensaje });
          this.cargar(false);
        },
        error: (e) =>
          this.alerta.error(errorOperativo(e, 'No se pudo guardar la configuración fiscal')),
      });
  }

  get puedeProbar(): boolean {
    return (
      !!this.config?.estado.esquema.listo &&
      this.config.estado.cifrado_disponible &&
      !!this.config.certificado[this.ambientePrueba] &&
      (this.ambientePrueba !== 'beta' ||
        this.documentoPrueba !== 'cpe' ||
        (!this.cargandoBeta &&
          !this.errorBeta &&
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

  cargarBeta(restablecer = false): void {
    if (this.cargandoBeta) return;
    this.cargandoBeta = true;
    this.errorBeta = '';
    forkJoin({
      emisor: this.api.emisorBeta(),
      envios: this.api.enviosBeta(),
      pos: this.api.estadoPosBeta(),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargandoBeta = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (r) => {
          if (restablecer || !this.emisorBeta) this.emisorBeta = { ...r.emisor.emisor };
          this.rucCertificadoBeta = r.emisor.ruc_certificado_beta;
          this.rucEmisorBetaGuardado = r.emisor.emisor.ruc;
          this.enviosBeta = r.envios.items;
          this.estadoPosBeta = r.pos;
        },
        error: (e) => {
          this.errorBeta = mensajeDeError(e, 'El módulo de pruebas BETA aún no está disponible');
        },
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
      title: activar ? '¿Activar emisión comercial de prueba en BETA?' : '¿Desactivar emisión comercial BETA?',
      message: activar
        ? 'Las ventas del POS se enviarán a SUNAT BETA con el emisor de pruebas configurado. Estos comprobantes no tienen validez tributaria y no sustituyen la emisión real.'
        : 'Las nuevas ventas dejarán de enviarse directamente a SUNAT BETA.',
      confirmText: activar ? 'Activar solo para pruebas' : 'Desactivar',
    });
    if (respuesta.isConfirmed && !this.destroyRef.destroyed) {
      this.ejecutar(
        this.api.cambiarEstadoPosBeta(activar),
        activar ? 'Emisión comercial BETA activada' : 'Emisión comercial BETA desactivada',
      );
    }
  }

  descargarBeta(envio: EnvioBeta, tipo: TipoArchivoBeta): void {
    if (this.ocupado) return;
    this.ocupado = true;
    this.api
      .archivoBeta(envio.id_envio, tipo)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.ocupado = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) => {
          const base = envio.nombre_archivo.replace(/\.zip$/i, '');
          const nombre =
            tipo === 'zip'
              ? `${base}.zip`
              : tipo === 'xml_firmado'
                ? `${base}.xml`
                : tipo === 'xml_original'
                  ? `${base}-original.xml`
                  : `R-${base}.${tipo === 'cdr_zip' ? 'zip' : 'xml'}`;
          descargarArchivo(blob, nombre);
        },
        error: async (e) =>
          this.alerta.error(
            errorOperativo(
              await normalizarErrorBlob(e),
              'No se pudo descargar el archivo de prueba',
            ),
          ),
      });
  }

  reintentarBeta(envio: EnvioBeta): void {
    if (this.ocupado || this.cargandoBeta) return;
    this.ocupado = true;
    this.api
      .reintentarBeta(envio.id_envio)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.ocupado = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (r) => {
          this.alerta.toast({ type: r.aceptado ? 'success' : 'warning', title: r.mensaje });
          this.cargarBeta();
        },
        error: (e) => this.alerta.error(errorOperativo(e, 'No se pudo recuperar el envío BETA')),
      });
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
}
