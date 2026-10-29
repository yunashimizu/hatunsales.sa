import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { Observable, Subject, Subscription, debounceTime, finalize } from 'rxjs';
import { rolPermitido } from '../../../../auth/roles.constants';
import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { descargarArchivo } from '../../../../shared/utils/descargar-archivo';
import { BusquedaPendiente, filtrarInstantaneo } from '../../../../shared/utils/filtro-instantaneo.util';
import { codigoDeError, mensajeDeError, normalizarErrorBlob } from '../../../service/api-base.service';
import {
  EstadoGuia,
  GuiaRemision,
  GuiaRemisionResumen,
  GuiaRemisionService,
  ModoGre,
  OperacionGuia,
  ResultadoOperacionGuia,
  TipoArchivoGuia,
  ValidacionGuia,
} from '../../../service/guia-remision.service';
import { GuiaDetalleComponent } from './guia-detalle/guia-detalle.component';
import { GuiaFormularioComponent } from './guia-formulario/guia-formulario.component';
import {
  AccionGuia,
  claseInsigniaGuia,
  errorDeGuia,
  fechaGuia,
  nombreArchivoGuia,
  numeroGuia,
  textoEstadoGuia,
} from './guias-remision.util';

/** Consultas automáticas del ticket mientras el detalle está abierto: a los 5, 15 y 30 s; después, «Consultar». */
export const ESPERAS_CONSULTA_MS: readonly number[] = [5_000, 10_000, 15_000];
const POR_PAGINA = 20;
const ESPERA_FILTRO_MS = 250;

const FILTROS_ESTADO: ReadonlyArray<{ valor: EstadoGuia | ''; texto: string }> = [
  { valor: '', texto: 'Todas' },
  { valor: 'borrador', texto: 'Borradores' },
  { valor: 'pendiente', texto: 'Pendientes de envío' },
  { valor: 'enviado', texto: 'Enviadas a SUNAT' },
  { valor: 'aceptado', texto: 'Aceptadas' },
  { valor: 'rechazado', texto: 'Rechazadas' },
  { valor: 'anulado', texto: 'Anuladas' },
  { valor: 'legacy', texto: 'Históricas' },
];

interface FiltroPantalla {
  texto: string;
  estado: EstadoGuia | '';
  desde: string;
  hasta: string;
}

interface Manejo<T> {
  next: (respuesta: T) => void;
  error: (error: unknown) => void;
}

function enteroPositivo(valor: string | null): number | null {
  const n = Number(valor);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function filtroVacio(): FiltroPantalla {
  return { texto: '', estado: '', desde: '', hasta: '' };
}

/**
 * Guías de remisión remitente: listado con filtros, formulario por pasos y detalle con el resultado
 * de SUNAT. «Emitir» envía la guía en el acto y la pantalla muestra lo que respondió SUNAT; si quedó
 * en proceso, el ticket se consulta solo mientras el detalle está abierto. Enlaces profundos:
 * ?venta=<id> abre una guía nueva desde esa venta y ?guia=<id> abre su detalle.
 */
@Component({
  selector: 'app-guias-remision',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, GuiaFormularioComponent, GuiaDetalleComponent],
  templateUrl: './guias-remision.component.html',
  styleUrl: './guias-remision.component.css',
})
export class GuiasRemisionComponent implements OnInit {
  readonly filtrosEstado = FILTROS_ESTADO;
  readonly porPagina = POR_PAGINA;
  readonly fecha = fechaGuia;
  readonly numeroGuia = numeroGuia;
  readonly textoEstado = textoEstadoGuia;
  readonly claseEstado = claseInsigniaGuia;

  filtro: FiltroPantalla = filtroVacio();
  errorFiltro = '';
  guias: GuiaRemisionResumen[] = [];
  /** Guías cargadas filtradas por el texto escrito (al instante, sin esperar al servidor). */
  guiasVisibles: readonly GuiaRemisionResumen[] = [];
  /** Búsqueda pendiente en el servidor: evita mostrar «sin guías» antes de que llegue. */
  readonly busqueda = new BusquedaPendiente();
  total = 0;
  pagina = 1;
  cargando = false;
  error = '';

  modo: ModoGre | null = null;
  errorModo = '';

  panel: 'formulario' | 'detalle' | null = null;
  formulario: { idGuia: number | null; idVenta: number | null } | null = null;
  idAbierta: number | null = null;
  guiaAbierta: GuiaRemision | null = null;
  cargandoDetalle = false;
  errorDetalle = '';
  resultado: ResultadoOperacionGuia | null = null;
  validacion: ValidacionGuia | null = null;
  consultaAutomatica: string | null = null;
  /** Operación en curso (desde la fila o el detalle): bloquea los botones hasta que termine. */
  enCurso: { id: number; accion: AccionGuia } | null = null;

  /** Admin y vendedor crean, emiten y anulan; caja solo consulta y descarga (roles del backend). */
  readonly puedeEscribir: boolean;
  readonly esAdmin: boolean;

  private readonly api = inject(GuiaRemisionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alerta = inject(AlertService);
  private readonly avisos = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly texto$ = new Subject<void>();
  private lectura: Subscription | null = null;
  private lecturaDetalle: Subscription | null = null;
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const sesion = inject(AuthService).getSesion();
    this.puedeEscribir = rolPermitido(sesion.rolNombre, ['admin', 'vendedor'], sesion.rolId);
    this.esAdmin = rolPermitido(sesion.rolNombre, ['admin'], sesion.rolId);
    this.destroyRef.onDestroy(() => this.detenerConsultas());
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.total / this.porPagina));
  }

  get conFiltros(): boolean {
    return !!(this.filtro.texto.trim() || this.filtro.estado || this.filtro.desde || this.filtro.hasta);
  }

  /** La operación en curso sobre la guía del detalle (para su spinner). */
  get accionAbierta(): AccionGuia | null {
    return this.enCurso && this.enCurso.id === this.idAbierta ? this.enCurso.accion : null;
  }

  ngOnInit(): void {
    this.cargarModo();
    this.cargar(1);
    this.texto$.pipe(debounceTime(ESPERA_FILTRO_MS), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cargar(1));
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => this.abrirDesdeUrl(params));
  }

  // ── Listado ────────────────────────────────────────────────────────────────

  cargar(pagina = this.pagina): void {
    const alTerminar = this.busqueda.alLanzar();
    if (this.filtro.desde && this.filtro.hasta && this.filtro.desde > this.filtro.hasta) {
      this.errorFiltro = 'La fecha «desde» no puede ser posterior a «hasta».';
      alTerminar();
      return;
    }
    this.errorFiltro = '';
    // La última consulta manda: un filtro nuevo cancela la lectura anterior.
    this.lectura?.unsubscribe();
    this.pagina = pagina;
    this.cargando = true;
    this.error = '';
    this.lectura = this.api
      .listar({ ...this.filtro, pagina, por_pagina: this.porPagina })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          alTerminar();
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (respuesta) => {
          this.guias = respuesta.datos ?? [];
          this.refiltrar();
          this.total = Number(respuesta.total) || 0;
          this.pagina = Number(respuesta.pagina) || pagina;
        },
        error: (e) => {
          this.guias = [];
          this.refiltrar();
          this.total = 0;
          this.error = mensajeDeError(e, 'No se pudieron cargar las guías de remisión');
        },
      });
  }

  /** Filtra al instante las guías ya cargadas; el servidor completa el resultado en segundo plano. */
  alEscribirTexto(): void {
    this.busqueda.iniciar();
    this.refiltrar();
    this.texto$.next();
  }

  private refiltrar(): void {
    // Campos que el servidor también busca (guia-remision.repository): n.º de guía, destinatario y comprobante.
    this.guiasVisibles = filtrarInstantaneo(this.guias, this.filtro.texto, (g) => [
      g.numero_formateado,
      g.destinatario?.denominacion,
      g.destinatario?.numero_documento,
      g.documento_relacionado?.numero_formateado,
    ]);
  }

  elegirEstado(estado: EstadoGuia | ''): void {
    this.filtro = { ...this.filtro, estado };
    this.cargar(1);
  }

  limpiarFiltros(): void {
    this.filtro = filtroVacio();
    this.cargar(1);
  }

  irA(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginas && pagina !== this.pagina) this.cargar(pagina);
  }

  actualizarTodo(): void {
    this.cargarModo(true);
    this.cargar();
    if (this.panel === 'detalle') this.recargarDetalle();
  }

  cargarModo(forzar = false): void {
    this.errorModo = '';
    this.api
      .modo(forzar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (modo) => {
          this.modo = modo;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.modo = null;
          this.errorModo = mensajeDeError(e, 'No se pudo comprobar si la emisión de guías está activa');
          this.cdr.markForCheck();
        },
      });
  }

  textoEmitir(guia: GuiaRemisionResumen): string {
    if (guia.estado === 'rechazado') return 'Reenviar';
    if (guia.estado === 'pendiente') return 'Reintentar envío';
    return 'Emitir';
  }

  enCursoEn(guia: GuiaRemisionResumen, accion: AccionGuia): boolean {
    return this.enCurso?.id === guia.id_guia && this.enCurso.accion === accion;
  }

  // ── Paneles ────────────────────────────────────────────────────────────────

  nuevaGuia(idVenta: number | null = null): void {
    this.abrirFormulario(null, idVenta);
  }

  editar(guia: Pick<GuiaRemisionResumen, 'id_guia' | 'id_venta'>): void {
    this.abrirFormulario(guia.id_guia, guia.id_venta);
  }

  /** Abre el detalle; con `operacion` muestra al instante lo que acaba de responder SUNAT. */
  verDetalle(idGuia: number, operacion: OperacionGuia | null = null): void {
    this.detenerConsultas();
    this.formulario = null;
    this.panel = 'detalle';
    this.idAbierta = idGuia;
    this.validacion = null;
    this.resultado = operacion?.resultado ?? null;
    this.errorDetalle = '';
    if (operacion) {
      this.guiaAbierta = operacion.guia;
      this.programarConsultas();
      return;
    }
    this.guiaAbierta = null;
    this.recargarDetalle();
  }

  recargarDetalle(programar = true): void {
    const id = this.idAbierta;
    if (!id) return;
    this.lecturaDetalle?.unsubscribe();
    this.cargandoDetalle = true;
    this.errorDetalle = '';
    this.lecturaDetalle = this.api
      .obtener(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargandoDetalle = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (guia) => {
          if (this.idAbierta !== id) return;
          this.guiaAbierta = guia;
          this.actualizarFila(guia);
          if (programar) this.programarConsultas();
        },
        error: (e) => {
          this.errorDetalle = mensajeDeError(e, `No se pudo cargar la guía ${id}`);
        },
      });
  }

  cerrarPanel(): void {
    this.panel = null;
    this.formulario = null;
    this.cerrarDetalle();
    this.limpiarUrl();
  }

  alGuardarFormulario(): void {
    this.cargar();
  }

  alEmitirFormulario(operacion: OperacionGuia): void {
    this.limpiarUrl();
    this.verDetalle(operacion.guia.id_guia, operacion);
    this.avisarResultado(operacion);
    this.cargar();
  }

  /** El formulario descubrió que su guía ya se envió (un intento anterior quedó sin respuesta): se muestra su estado. */
  alAbrirDesdeFormulario(idGuia: number): void {
    this.limpiarUrl();
    this.verDetalle(idGuia);
    this.cargar();
  }

  // ── Operaciones (fila y detalle) ───────────────────────────────────────────

  async emitir(guia: GuiaRemisionResumen): Promise<void> {
    if (this.enCurso || !this.puedeEscribir) return;
    if (!this.modo?.activo) {
      await this.alerta.advertencia({
        title: 'Emitir a SUNAT no está disponible',
        message: this.modo?.motivo || this.errorModo || 'La emisión de guías a SUNAT no está activa.',
      });
      return;
    }
    const numero = numeroGuia(guia);
    const textos =
      guia.estado === 'rechazado'
        ? { title: `¿Reenviar la guía ${numero} a SUNAT?`, message: 'Se reenvía con el mismo número y los datos guardados.', confirmText: 'Reenviar a SUNAT' }
        : guia.estado === 'pendiente'
          ? { title: `¿Reintentar el envío de la guía ${numero}?`, message: 'Se reenvía el mismo archivo: SUNAT no la duplica.', confirmText: 'Reintentar envío' }
          : {
              title: `¿Emitir a SUNAT el borrador #${guia.id_guia}?`,
              message: 'Se le asigna el número de la serie y se envía a SUNAT ahora mismo. Una guía aceptada no se puede anular desde el sistema (la baja se hace en SUNAT).',
              confirmText: 'Emitir a SUNAT',
            };
    const confirmado = await this.alerta.confirmar(textos);
    if (!confirmado || this.destroyRef.destroyed || this.enCurso) return;
    this.ejecutar(guia.id_guia, 'emitir', this.api.emitir(guia.id_guia), {
      next: (operacion) => {
        this.actualizarFila(operacion.guia);
        this.verDetalle(operacion.guia.id_guia, operacion);
        this.avisarResultado(operacion);
      },
      error: (e) => this.alFallarEmision(guia, e),
    });
  }

  consultar(guia: GuiaRemisionResumen): void {
    if (this.enCurso || !this.puedeEscribir) return;
    // La consulta manual reemplaza a las automáticas que faltaban.
    this.detenerConsultas();
    this.ejecutar(guia.id_guia, 'consultar', this.api.consultar(guia.id_guia), {
      next: (operacion) => {
        this.aplicarOperacion(operacion);
        this.avisarResultado(operacion);
      },
      error: (e) => {
        void this.alerta.errorHttp(e, 'No se pudo consultar la guía en SUNAT');
        this.refrescarTrasError(guia.id_guia);
      },
    });
  }

  validar(guia: GuiaRemisionResumen): void {
    if (this.enCurso || !this.puedeEscribir) return;
    this.ejecutar(guia.id_guia, 'validar', this.api.validar(guia.id_guia), {
      next: (validacion) => {
        if (this.idAbierta === guia.id_guia) this.validacion = validacion;
      },
      error: (e) => void this.alerta.errorHttp(e, 'No se pudo validar la guía'),
    });
  }

  async anular(guia: GuiaRemisionResumen): Promise<void> {
    if (this.enCurso || !this.puedeEscribir) return;
    const motivo = await this.alerta.pedirTexto({
      title: `¿Anular la guía ${numeroGuia(guia)}?`,
      message:
        'Se anula solo en el sistema (no se envía nada a SUNAT) y sus cantidades vuelven a quedar disponibles para otra guía de la venta.',
      etiqueta: 'Motivo de la anulación',
      placeholder: 'Ej.: el cliente recogió en tienda',
      minimo: 3,
      maximo: 250,
      mensajeMinimo: 'Escriba el motivo (al menos 3 caracteres)',
      confirmText: 'Anular guía',
      type: 'warning',
    });
    if (motivo === null || this.destroyRef.destroyed || this.enCurso) return;
    this.ejecutar(guia.id_guia, 'anular', this.api.anular(guia.id_guia, motivo), {
      next: (anulada) => {
        this.actualizarFila(anulada);
        if (this.idAbierta === anulada.id_guia) {
          this.guiaAbierta = anulada;
          this.resultado = null;
          this.validacion = null;
        }
        this.avisos.exito(`Guía ${numeroGuia(anulada)} anulada`, { mensaje: 'Sus cantidades vuelven a estar disponibles.' });
      },
      error: (e) => {
        void this.alerta.errorHttp(e, 'No se pudo anular la guía');
        this.refrescarTrasError(guia.id_guia);
      },
    });
  }

  descargar(guia: GuiaRemisionResumen, tipo: TipoArchivoGuia | 'pdf'): void {
    if (this.enCurso) return;
    const peticion = tipo === 'pdf' ? this.api.pdf(guia.id_guia) : this.api.archivo(guia.id_guia, tipo);
    this.ejecutar(guia.id_guia, 'descargar', peticion, {
      next: (blob) => descargarArchivo(blob, nombreArchivoGuia(guia, tipo)),
      error: async (e) =>
        this.alerta.errorHttp(
          await normalizarErrorBlob(e),
          tipo === 'pdf' ? 'No se pudo generar el PDF de la guía' : 'No se pudo descargar el archivo de la guía',
        ),
    });
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  /** Cada apertura es una instancia nueva del formulario (carga la guía o la venta en su ngOnInit). */
  private abrirFormulario(idGuia: number | null, idVenta: number | null): void {
    if (!this.puedeEscribir) return;
    this.cerrarDetalle();
    if (this.panel === 'formulario') {
      this.panel = null;
      this.cdr.detectChanges();
    }
    this.formulario = { idGuia, idVenta };
    this.panel = 'formulario';
    this.cdr.markForCheck();
  }

  private ejecutar<T>(id: number, accion: AccionGuia, peticion: Observable<T>, manejo: Manejo<T>): void {
    this.enCurso = { id, accion };
    peticion
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.enCurso = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe(manejo);
  }

  /** 400 con errores por campo: se muestran en el detalle (con «Editar» para corregirlos); el resto, en un modal. */
  private alFallarEmision(guia: GuiaRemisionResumen, error: unknown): void {
    const info = errorDeGuia(error, 'No se pudo emitir la guía a SUNAT');
    if (info.estado === 503) this.cargarModo(true);
    if (info.por_campo.length || info.errores.length) {
      if (this.panel !== 'detalle' || this.idAbierta !== guia.id_guia) this.verDetalle(guia.id_guia);
      const errores = info.errores.length
        ? info.errores
        : info.por_campo.filter((o) => o.nivel === 'error').map((o) => o.mensaje);
      this.validacion = { valido: false, errores, advertencias: info.advertencias, por_campo: info.por_campo };
      return;
    }
    void this.alerta.errorHttp(error, 'No se pudo emitir la guía a SUNAT');
    this.refrescarTrasError(guia.id_guia);
  }

  /** Tras un error la guía pudo cambiar (otro usuario la emitió, la tarea la consultó…): se muestra como está. */
  private refrescarTrasError(idGuia: number): void {
    this.cargar();
    if (this.idAbierta === idGuia) this.recargarDetalle(false);
  }

  private aplicarOperacion(operacion: OperacionGuia): void {
    this.actualizarFila(operacion.guia);
    if (this.idAbierta === operacion.guia.id_guia) {
      this.guiaAbierta = operacion.guia;
      this.resultado = operacion.resultado;
      this.validacion = null;
    }
  }

  private actualizarFila(guia: GuiaRemisionResumen): void {
    this.guias = this.guias.map((fila) => (fila.id_guia === guia.id_guia ? { ...fila, ...guia } : fila));
    this.refiltrar();
  }

  private avisarResultado(operacion: OperacionGuia): void {
    const guia = operacion.guia;
    const numero = numeroGuia(guia);
    if (guia.estado === 'aceptado') {
      this.avisos.exito(`Guía ${numero} aceptada por SUNAT`, { mensaje: 'Ya puede descargar el PDF con el código QR.' });
    } else if (guia.estado === 'rechazado') {
      this.avisos.error(`SUNAT rechazó la guía ${numero}`, { mensaje: 'Corríjala y vuelva a emitirla: se reenvía con el mismo número.' });
    } else if (guia.estado === 'enviado') {
      this.avisos.info(`SUNAT está procesando la guía ${numero}`, { mensaje: 'Se vuelve a consultar en unos segundos; también puede usar «Consultar».' });
    } else {
      this.avisos.advertencia(`La guía ${numero} no quedó enviada`, { mensaje: operacion.resultado.mensaje });
    }
  }

  /** Mientras el detalle muestra una guía con el ticket pendiente, se consulta sola un par de veces. */
  private programarConsultas(): void {
    this.detenerConsultas();
    const guia = this.guiaAbierta;
    if (!guia || guia.estado !== 'enviado' || guia.envio?.revision_manual || !this.puedeEscribir) return;
    this.siguienteConsulta(0, guia.id_guia);
  }

  private siguienteConsulta(intento: number, idGuia: number): void {
    if (intento >= ESPERAS_CONSULTA_MS.length) {
      this.consultaAutomatica = 'SUNAT aún no entrega el resultado. Use «Consultar en SUNAT» en unos minutos.';
      return;
    }
    this.consultaAutomatica = `Se consultará el resultado automáticamente (consulta ${intento + 1} de ${ESPERAS_CONSULTA_MS.length}).`;
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      this.consultarAutomatico(intento, idGuia);
    }, ESPERAS_CONSULTA_MS[intento]);
  }

  private consultarAutomatico(intento: number, idGuia: number): void {
    if (this.idAbierta !== idGuia || this.guiaAbierta?.estado !== 'enviado') return;
    // Si el usuario está haciendo otra cosa con la guía, se espera al turno siguiente.
    if (this.enCurso) {
      this.siguienteConsulta(intento + 1, idGuia);
      return;
    }
    this.ejecutar(idGuia, 'consultar', this.api.consultar(idGuia), {
      next: (operacion) => {
        this.aplicarOperacion(operacion);
        if (operacion.guia.estado === 'enviado') {
          this.siguienteConsulta(intento + 1, idGuia);
          return;
        }
        this.consultaAutomatica = null;
        this.avisarResultado(operacion);
      },
      error: (e) => {
        const codigo = codigoDeError(e);
        // La tarea de fondo la está consultando en este momento: se intenta en el turno siguiente.
        if (codigo === 'GRE_CONSULTA_EN_CURSO') {
          this.siguienteConsulta(intento + 1, idGuia);
          return;
        }
        // Ya no tiene ticket pendiente (la tarea de fondo obtuvo la respuesta): se muestra como quedó.
        if (codigo === 'GRE_SIN_TICKET') {
          this.consultaAutomatica = null;
          this.recargarDetalle(false);
          return;
        }
        this.consultaAutomatica = `No se pudo consultar automáticamente: ${mensajeDeError(e, 'SUNAT no respondió')}. Use «Consultar en SUNAT».`;
      },
    });
  }

  private detenerConsultas(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.consultaAutomatica = null;
  }

  private cerrarDetalle(): void {
    this.detenerConsultas();
    this.lecturaDetalle?.unsubscribe();
    this.lecturaDetalle = null;
    this.idAbierta = null;
    this.guiaAbierta = null;
    this.resultado = null;
    this.validacion = null;
    this.errorDetalle = '';
    this.cargandoDetalle = false;
  }

  private abrirDesdeUrl(params: ParamMap): void {
    const idGuia = enteroPositivo(params.get('guia'));
    const idVenta = enteroPositivo(params.get('venta'));
    if (idGuia) {
      if (this.panel !== 'detalle' || this.idAbierta !== idGuia) this.verDetalle(idGuia);
      return;
    }
    if (!idVenta) return;
    if (!this.puedeEscribir) {
      this.avisos.advertencia('Solo administradores y vendedores crean guías', { mensaje: 'Su usuario puede consultar y descargar las guías.' });
      return;
    }
    if (this.panel !== 'formulario' || this.formulario?.idVenta !== idVenta || this.formulario?.idGuia) this.nuevaGuia(idVenta);
  }

  /** Al cerrar un panel abierto con ?guia= o ?venta=, se limpia la URL para que recargar no lo vuelva a abrir. */
  private limpiarUrl(): void {
    const params = this.route.snapshot.queryParamMap;
    if (!params.has('guia') && !params.has('venta')) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { guia: null, venta: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
