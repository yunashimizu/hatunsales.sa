import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpParams } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Observable, Subscription, debounceTime, defer, finalize, forkJoin, fromEvent, interval, map, of } from 'rxjs';
import { catchError, filter } from 'rxjs/operators';
import { AuthService, SesionUsuario } from '../../../auth/service/auth.service';
import { InventarioAdminService } from '../../service/inventario-admin.service';
import { ComprobanteService } from '../../service/comprobante.service';
import { CajaSesionService, SesionCaja } from '../../service/caja-sesion.service';
import { CreditoAdminService, ResumenVencidas } from '../../service/credito-admin.service';
import { EventosPanelService } from '../../service/eventos-panel.service';
import { FiscalEstadoService } from '../../service/fiscal-estado.service';
import { PeriodoReporte, RangoReporte, ReporteVentasResumen, ReportesService } from '../../service/reportes.service';
import { PedidoAdminService, ResumenPedidosWeb } from '../../service/pedido-admin.service';
import { ComprobanteFila, Paginado, ResumenInventario, VentasPorHora } from '../../models/admin.models';
import { ResumenSucursalesCaja } from '../../models/caja-arqueo.models';
import { urlConstants } from '../../../constants/urlConstants';
import { peticionSilenciosa } from '../../../interceptors/contexto-http';
import { opcionesHttp } from '../../service/api-base.service';
import { NumeroDirective } from '../../../shared/directives/numero.directive';
import { tiempoRelativo } from '../../../shared/utils/tiempo-relativo';
import {
  Acceso,
  IdTarjeta,
  NOMBRES_TARJETA,
  ORDEN_TARJETAS,
  guardar,
  leerGuardado,
  PERIODOS_INICIO,
  PeriodoInicio,
  ROLES_ADMIN,
  ROLES_CXC,
  ROLES_DOCUMENTOS,
  ROLES_FISCAL_PANEL,
  ROLES_INVENTARIO,
  ROLES_PEDIDOS,
  ROLES_REPORTES,
  ROLES_STOCK,
  ROLES_VENTAS,
  ROTULOS_PERIODO,
  RUTA,
  construirAccesos,
  CobroMedio,
  FilaActividad,
  FilaAtencion,
  FilaSucursal,
  ProductoTop,
  DeltaVista,
  construirActividad,
  construirCobros,
  construirFilasAtencion,
  construirSucursales,
  construirTopProductos,
  vistaDelta,
} from './inicio-datos.util';
import {
  BarraDia,
  BarraHora,
  DetalleTooltip,
  G_ANCHO,
  MarcaEje,
  claveDia,
  construirBarrasDias,
  construirBarrasHora,
  delta,
  diasEntre,
  dosDigitos,
  formatoSoles,
  numero,
  totalesHasta,
  totalesPorDia,
} from './inicio-graficos.util';

/** Parámetro de Documentos que abre un comprobante (`PARAMETRO_COMPROBANTE` en doc.component.ts). */
const PARAMETRO_COMPROBANTE = 'comprobante';

/** Cada cuánto se renueva solo el Inicio mientras la pestaña está visible. */
const REFRESCO_MS = 60_000;
/** Al volver a la pestaña se vuelve a leer si la última lectura fue hace más de esto (el reloj de 60 s no cambia). */
export const UMBRAL_VISIBLE_MS = 10_000;
/** Tras un cambio del panel (venta, comprobante…) se espera este margen y se lee una sola vez. */
const ESPERA_EVENTOS_MS = 1_000;
/** Cada cuánto se recalculan los «hace X min». */
const RELOJ_MS = 30_000;

const CLAVE_PERIODO = 'hs.inicio.periodo';
const CLAVE_OCULTAS = 'hs.inicio.ocultas';
const CLAVE_META = 'hs.panel.meta-diaria';

interface TooltipVista {
  izquierda: number;
  arriba: number;
  tip: DetalleTooltip;
}

interface ResultadoPeriodo {
  reporte?: ReporteVentasResumen | null;
  semana?: ReporteVentasResumen | null;
  hora?: VentasPorHora | null;
}

interface ResultadoBase {
  inv: ResumenInventario | null;
  cpe: { total?: number } | null;
  pedidos: ResumenPedidosWeb | null;
  caja: SesionCaja | null;
  cxc: ResumenVencidas | null;
  actividad: Paginado<ComprobanteFila> | null;
  sucursales: ResumenSucursalesCaja | null;
}

function ayerDe(hoy: Date): Date {
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterModule, FormsModule, NumeroDirective],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  sesion: SesionUsuario = {
    idUsuario: 0,
    nombre: '',
    email: '',
    rolId: 0,
    rolNombre: '',
    permisos: [],
    iniciales: '?',
  };

  // ── Permisos de cada bloque (se recalculan con la sesión) ──
  veVender = false;
  veCaja = false;
  veReportes = false;
  veCxc = false;
  veDocumentos = false;
  veInventario = false;
  veStock = false;
  veFiscalPanel = false;
  vePedidos = false;
  esAdmin = false;
  accesos: Acceso[] = [];

  /** Primera carga de la pantalla (esqueletos en todo). */
  cargando = true;
  /** Cambio de periodo en curso (esqueletos solo en lo que depende del periodo). */
  cargandoPeriodo = false;
  /** Hay una lectura en marcha, también las automáticas (gira el botón Actualizar). */
  actualizando = false;

  // ── Periodo ──
  readonly periodos = PERIODOS_INICIO;
  periodo: PeriodoInicio = 'hoy';

  // ── Datos (null = no cargó / sin permiso: se muestra «—», nunca un 0 falso) ──
  ventasPeriodo: number | null = null;
  ticketPromedio: number | null = null;
  numVentas: number | null = null;
  deltaVentas: DeltaVista | null = null;
  deltaTicket: DeltaVista | null = null;
  cxcVencidoMonto: number | null = null;
  cxcVencidoCuentas: number | null = null;
  /** La lista de vencidas llegó recortada: el monto es un mínimo. */
  cxcParcial = false;
  sinStock: number | null = null;
  bajoStock: number | null = null;
  cpeAtencion: number | null = null;
  /** Pedidos web por cobrar y por preparar (null = no cargó / sin permiso). */
  pedidosWeb: ResumenPedidosWeb | null = null;
  cajaAbierta: boolean | null = null;
  cajaNombre = '';
  turnoDesde = '';
  turnoUsuario = '';
  turnoVentas: number | null = null;
  efectivoTurno: number | null = null;
  detalleMedios = '';
  /** Cobros del turno por medio de pago (vacío si no hay turno o no hubo cobros). */
  cobros: CobroMedio[] = [];
  cobrosTotal = 0;
  actualizadoEn: Date | null = null;
  /** Reloj para los «hace X min»: se renueva cada 30 s. */
  ahora = new Date();

  // ── Actividad reciente y sucursales ──
  actividad: FilaActividad[] = [];
  actividadCargada = false;
  sucursales: FilaSucursal[] = [];

  // ── Gráfico por día (semana o mes) ──
  diasCargados = false;
  diasConDatos = false;
  semanaFalla = false;
  barras: BarraDia[] = [];
  marcasEje: MarcaEje[] = [];
  resumenDias = '';
  hallazgoDias = '';

  // ── Ventas por hora (si falla o viene vacío en «Hoy» se queda el gráfico semanal) ──
  horaConDatos = false;
  barrasHora: BarraHora[] = [];
  marcasEjeHora: MarcaEje[] = [];
  resumenHora = '';
  hallazgoHora = '';
  /** Barra con el tooltip o el foco (null = ninguna). */
  zonaActiva: number | null = null;
  tooltip: TooltipVista | null = null;

  // ── Lo más vendido ──
  topProductos: ProductoTop[] = [];
  topCargado = false;

  // ── Meta del día (solo administrador) ──
  metaDiaria: number | null = null;
  editandoMeta = false;
  metaBorrador: number | null = null;

  // ── Personalizar ──
  ocultas: IdTarjeta[] = [];
  personalizando = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly fiscal = inject(FiscalEstadoService);
  private readonly reportes = inject(ReportesService);
  private readonly pedidos = inject(PedidoAdminService);
  private readonly credito = inject(CreditoAdminService);
  private readonly eventos = inject(EventosPanelService);

  private subTodo: Subscription | null = null;
  private subPeriodo: Subscription | null = null;
  private pendientesPeriodo = 0;
  private fichaPeriodo = 0;
  private ultimaCarga = 0;

  constructor(
    private readonly authService: AuthService,
    private readonly inventario: InventarioAdminService,
    private readonly comprobantes: ComprobanteService,
    private readonly caja: CajaSesionService,
    private readonly http: HttpClient,
  ) {}

  ngOnInit(): void {
    this.leerPreferencias();
    this.aplicarSesion();
    this.authService.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.aplicarSesion();
      this.cdr.markForCheck();
    });
    this.cargarTodo('inicial');
    this.vigilarRefresco();
  }

  private leerPreferencias(): void {
    const periodo = leerGuardado<string>('sesion', CLAVE_PERIODO);
    if (this.periodos.some((p) => p.id === periodo)) this.periodo = periodo as PeriodoInicio;
    const ocultas = leerGuardado<unknown>('local', CLAVE_OCULTAS);
    if (Array.isArray(ocultas)) this.ocultas = ocultas.filter((id): id is IdTarjeta => id in NOMBRES_TARJETA);
    const meta = Number(leerGuardado<unknown>('local', CLAVE_META));
    this.metaDiaria = Number.isFinite(meta) && meta > 0 ? meta : null;
  }

  private aplicarSesion(): void {
    this.sesion = this.authService.getSesion();
    const puede = (roles: string[]) => this.authService.puedeVer(roles);
    this.veVender = puede(ROLES_VENTAS);
    this.veCaja = puede(ROLES_VENTAS);
    this.veReportes = puede(ROLES_REPORTES);
    this.veCxc = puede(ROLES_CXC);
    this.veDocumentos = puede(ROLES_DOCUMENTOS);
    this.veInventario = puede(ROLES_INVENTARIO);
    this.veStock = puede(ROLES_STOCK);
    this.veFiscalPanel = puede(ROLES_FISCAL_PANEL);
    this.vePedidos = puede(ROLES_PEDIDOS);
    this.esAdmin = puede(ROLES_ADMIN);

    this.accesos = construirAccesos(puede, this.pedidosWeb);
  }

  get etiquetaRol(): string {
    return this.authService.etiquetaRol(this.sesion.rolNombre);
  }

  /** Primer nombre para el saludo; el nombre completo va en el pie del menú. */
  get nombreCorto(): string {
    const nombre = (this.sesion.nombre || '').trim();
    return nombre ? nombre.split(/\s+/)[0] : 'Usuario';
  }

  get saludo(): string {
    const hora = new Date().getHours();
    if (hora < 12) return 'Buenos días';
    if (hora < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  /** Cuántas tarjetas de KPI se ven (para repartir el ancho de la fila). */
  get kpisVisibles(): number {
    return 1 + (this.veReportes ? 1 : 0) + (this.veCxc ? 1 : 0) + (this.veCaja ? 1 : 0);
  }

  /** Línea del saludo: estado del turno de caja. Vacía si no se pudo leer o el rol no usa caja. */
  get lineaTurno(): string {
    if (!this.veCaja || this.cajaAbierta == null) return '';
    if (!this.cajaAbierta) return 'Aún no abres caja hoy';
    const partes = ['Turno abierto'];
    if (this.turnoDesde) partes[0] += ` desde las ${this.turnoDesde}`;
    if (this.turnoUsuario) partes[0] += ` por ${this.turnoUsuario}`;
    if (this.turnoVentas != null) {
      partes.push(`${this.turnoVentas} ${this.turnoVentas === 1 ? 'venta' : 'ventas'} hasta ahora`);
    }
    return partes.join(' · ');
  }

  // ── Rótulos que cambian con el periodo ──

  get cargandoVentas(): boolean {
    return this.cargando || this.cargandoPeriodo;
  }

  get rotulos(): (typeof ROTULOS_PERIODO)[PeriodoInicio] {
    return ROTULOS_PERIODO[this.periodo ?? 'hoy'];
  }

  get tituloGrafico(): string {
    return this.horaConDatos ? 'Ventas por hora' : this.rotulos.tituloDias;
  }

  /** Quién es la barra principal del gráfico por hora. */
  get nombreDia(): string {
    return this.periodo === 'ayer' ? 'Ayer' : 'Hoy';
  }

  get referenciaDelta(): string {
    return this.periodo === 'ayer' ? 'vs. el mismo día de la semana pasada' : 'vs. la semana pasada a esta hora';
  }

  get textoActualizado(): string {
    return this.actualizadoEn ? `actualizado ${tiempoRelativo(this.actualizadoEn, this.ahora)}` : '';
  }

  hace(fecha: string): string {
    return tiempoRelativo(fecha, this.ahora);
  }

  // ── Tarjetas visibles (rol + «Personalizar») ──

  private visible(id: IdTarjeta): boolean {
    return !this.ocultas.includes(id);
  }

  get verGrafico(): boolean { return this.veReportes && this.visible('grafico'); }
  get verAtencion(): boolean { return this.visible('atencion'); }
  get verActividad(): boolean { return this.veDocumentos && this.visible('actividad'); }
  get verCobros(): boolean { return this.veCaja && this.visible('cobros'); }
  get verTop(): boolean { return this.veReportes && this.visible('top'); }
  get verAccesos(): boolean { return this.accesos.length > 0 && this.visible('accesos'); }
  get verSucursales(): boolean { return this.esAdmin && this.sucursales.length > 1 && this.visible('sucursales'); }

  get tarjetasFila1(): number { return +this.verGrafico + +this.verAtencion; }
  get tarjetasFila2(): number { return +this.verActividad + +this.verCobros; }
  get tarjetasFila3(): number { return +this.verTop + +this.verAccesos; }

  /** Tarjetas que este usuario puede mostrar u ocultar. */
  get tarjetasPersonalizables(): { id: IdTarjeta; nombre: string; visible: boolean }[] {
    const permitidas: Record<IdTarjeta, boolean> = {
      grafico: this.veReportes,
      atencion: true,
      actividad: this.veDocumentos,
      cobros: this.veCaja,
      sucursales: this.esAdmin,
      top: this.veReportes,
      accesos: true,
    };
    return ORDEN_TARJETAS.filter((id) => permitidas[id]).map((id) => ({
      id,
      nombre: NOMBRES_TARJETA[id],
      visible: this.visible(id),
    }));
  }

  /**
   * Cosas que conviene resolver, armadas con lo que ya se lee. El estado fiscal sale del mismo
   * servicio que usa la barra superior (se renueva solo; aquí solo se lee).
   */
  get filasAtencion(): FilaAtencion[] {
    return construirFilasAtencion({
      estadoFiscal: this.fiscal.estado(),
      veDocumentos: this.veDocumentos,
      vePedidos: this.vePedidos,
      veFiscalPanel: this.veFiscalPanel,
      veInventario: this.veInventario,
      veStock: this.veStock,
      veCxc: this.veCxc,
      cpeAtencion: this.cpeAtencion,
      pedidosWeb: this.pedidosWeb,
      sinStock: this.sinStock,
      bajoStock: this.bajoStock,
      cxcVencidoCuentas: this.cxcVencidoCuentas,
      cxcVencidoMonto: this.cxcVencidoMonto,
      cxcParcial: this.cxcParcial,
    });
  }

  /** Importe en soles con separador de miles y dos decimales. */
  soles(valor: number): string {
    return formatoSoles(valor);
  }

  // ───────────────────────────────────────────────────────────── acciones de la pantalla

  cambiarPeriodo(periodo: PeriodoInicio): void {
    if (periodo === this.periodo) return;
    this.periodo = periodo;
    guardar('sesion', CLAVE_PERIODO, periodo);
    this.cerrarTooltip();
    this.editandoMeta = false;
    this.subPeriodo?.unsubscribe();
    this.subPeriodo = this.cargarPeriodo(false).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cdr.markForCheck());
    this.cdr.markForCheck();
  }

  /** Botón «Actualizar»: vuelve a leer todo, con el botón girando (sin esqueletos). */
  actualizar(): void {
    this.cargarTodo('manual');
  }

  alternarPersonalizar(): void {
    this.personalizando = !this.personalizando;
    this.cdr.markForCheck();
  }

  alternarTarjeta(id: IdTarjeta): void {
    const apareceDeNuevo = this.ocultas.includes(id);
    this.ocultas = apareceDeNuevo ? this.ocultas.filter((x) => x !== id) : [...this.ocultas, id];
    guardar('local', CLAVE_OCULTAS, this.ocultas);
    this.cdr.markForCheck();
    // Lo que no se pedía mientras estaba oculto se lee al volver a mostrarlo.
    if (apareceDeNuevo && (id === 'actividad' || id === 'sucursales')) this.cargarTodo('auto');
  }

  @HostListener('document:click', ['$event'])
  protected alClicFuera(evento: MouseEvent): void {
    if (this.personalizando && !(evento.target as HTMLElement | null)?.closest('.ini-personalizar')) {
      this.personalizando = false;
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    if (!this.personalizando) return;
    this.personalizando = false;
    this.el.nativeElement.querySelector<HTMLElement>('.ini-personalizar__boton')?.focus();
    this.cdr.markForCheck();
  }

  // ── Meta del día ──

  /** La meta es del administrador y solo se mide con el día de hoy. */
  get puedeMeta(): boolean {
    return this.esAdmin && this.veReportes && this.periodo === 'hoy';
  }

  /** Avance sobre la meta, en % entero: 99 hasta llegar de verdad a la meta, y desde ahí el real (puede pasar de 100). */
  get porcentajeMeta(): number {
    if (!this.metaDiaria || this.ventasPeriodo == null) return 0;
    const avance = Math.max(0, this.ventasPeriodo / this.metaDiaria);
    return avance < 1 ? Math.min(99, Math.round(avance * 100)) : Math.round(avance * 100);
  }

  get metaCumplida(): boolean {
    return !!this.metaDiaria && this.ventasPeriodo != null && this.ventasPeriodo >= this.metaDiaria;
  }

  /** Avance de la meta limitado a 100 para la barra. */
  get avanceMeta(): number {
    return Math.min(100, this.porcentajeMeta);
  }

  editarMeta(): void {
    this.metaBorrador = this.metaDiaria;
    this.editandoMeta = true;
    this.cdr.detectChanges(); // el campo aparece ya: se le puede dar el foco
    this.el.nativeElement.querySelector<HTMLElement>('#ini-meta-campo')?.focus();
  }

  guardarMeta(): void {
    const valor = Number(this.metaBorrador);
    this.metaDiaria = Number.isFinite(valor) && valor > 0 ? valor : null;
    guardar('local', CLAVE_META, this.metaDiaria);
    this.editandoMeta = false;
    this.cdr.detectChanges();
    this.el.nativeElement.querySelector<HTMLElement>('.ini-meta__editar, .ini-meta__definir')?.focus();
  }

  cancelarMeta(): void {
    this.editandoMeta = false;
    this.cdr.detectChanges();
    this.el.nativeElement.querySelector<HTMLElement>('.ini-meta__editar, .ini-meta__definir')?.focus();
  }

  // ── Tooltip del gráfico ──

  /** Muestra el detalle de una barra (con el ratón, el foco o un toque). */
  activarZona(indice: number, evento: Event): void {
    const barras: (BarraHora | BarraDia)[] = this.horaConDatos ? this.barrasHora : this.barras;
    const barra = barras[indice];
    const svg = (evento.target as SVGElement | null)?.ownerSVGElement;
    const tarjeta = svg?.closest('.ini-tarjeta');
    if (!barra || !svg || !tarjeta) return;
    const rs = svg.getBoundingClientRect();
    const rt = tarjeta.getBoundingClientRect();
    const escala = rs.width / G_ANCHO;
    const mitad = 112; // semiancho aproximado del tooltip: no se sale de la tarjeta por ningún lado
    const izquierda = Math.min(Math.max(rs.left - rt.left + barra.xc * escala, mitad), Math.max(mitad, rt.width - mitad));
    const arriba = Math.max(rs.top - rt.top + barra.yTope * escala - 8, 96);
    this.zonaActiva = indice;
    this.tooltip = { izquierda, arriba, tip: barra.tip };
    this.cdr.markForCheck();
  }

  cerrarTooltip(): void {
    if (this.zonaActiva === null && this.tooltip === null) return;
    this.zonaActiva = null;
    this.tooltip = null;
    this.cdr.markForCheck();
  }

  /** Flechas, Inicio y Fin pasan de una barra a otra (solo una barra está en el orden de Tab). */
  teclaZona(evento: KeyboardEvent, indice: number, total: number): void {
    const salto: Record<string, number> = {
      ArrowRight: indice + 1,
      ArrowLeft: indice - 1,
      Home: 0,
      End: total - 1,
    };
    if (!(evento.key in salto)) return;
    const destino = Math.min(total - 1, Math.max(0, salto[evento.key]));
    const zonas = (evento.currentTarget as SVGElement).ownerSVGElement?.querySelectorAll<SVGElement>('.ini-grafico__zona');
    if (!zonas?.[destino]) return;
    evento.preventDefault();
    zonas[destino].focus();
  }

  // ───────────────────────────────────────────────────────────── actualización automática

  /** Cada minuto, con la pestaña visible, vuelve a leer todo; al volver a la pestaña lo hace al instante si pasaron más de 10 s. */
  private vigilarRefresco(): void {
    const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
    interval(REFRESCO_MS)
      .pipe(filter(visible), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarTodo('auto'));
    interval(RELOJ_MS)
      .pipe(filter(visible), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.ahora = new Date();
        this.cdr.markForCheck();
      });
    // Una venta, un comprobante, la caja o un pedido que cambian aquí mismo: el Inicio se entera sin esperar al minuto.
    // La campana ya invalidó las cachés cortas (AvisosPanelService), así que esta lectura trae lo nuevo.
    this.eventos
      .de()
      .pipe(debounceTime(ESPERA_EVENTOS_MS), filter(visible), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarTodo('auto'));
    if (typeof document === 'undefined') return;
    fromEvent(document, 'visibilitychange')
      .pipe(filter(visible), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.ahora = new Date();
        if (Date.now() - this.ultimaCarga > UMBRAL_VISIBLE_MS) this.cargarTodo('auto');
        else this.cdr.markForCheck();
      });
  }

  /** Hubo al menos una lectura que alimenta «Necesita tu atención» (para no decir «todo en orden» a ciegas). */
  get atencionRevisada(): boolean {
    return (
      this.sinStock != null ||
      this.bajoStock != null ||
      this.cpeAtencion != null ||
      this.pedidosWeb != null ||
      this.cxcVencidoCuentas != null ||
      this.fiscal.estado() != null
    );
  }

  // ───────────────────────────────────────────────────────────── lecturas

  /** Lee todo lo del Inicio. `auto` (cada minuto) va en silencio: sin esqueletos y sin avisos si falla. */
  private cargarTodo(modo: 'inicial' | 'manual' | 'auto'): void {
    const silenciosa = modo === 'auto';
    if (modo === 'inicial') this.cargando = true;
    this.actualizando = true;
    this.ultimaCarga = Date.now();
    this.cdr.markForCheck();

    this.subTodo?.unsubscribe();
    this.subTodo = forkJoin([this.cargarBase(silenciosa), this.cargarPeriodo(silenciosa)])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.actualizadoEn = new Date();
        this.ahora = this.actualizadoEn;
        this.cargando = false;
        this.actualizando = false;
        this.cdr.markForCheck();
      });
  }

  private sinPermiso<T>(permitido: boolean, peticion: () => Observable<T>): Observable<T | null> {
    return permitido ? peticion().pipe(catchError(() => of(null))) : of(null);
  }

  /** Lo que no depende del periodo: stock, SUNAT, pedidos, caja, cuentas, actividad y sucursales. */
  private cargarBase(silenciosa: boolean): Observable<void> {
    const hoy = claveDia(new Date());
    return forkJoin({
      inv: this.sinPermiso(this.veStock, () => this.inventario.resumen()),
      cpe: this.sinPermiso(this.veDocumentos, () => this.comprobantes.monitorAtencion()),
      pedidos: this.sinPermiso(this.vePedidos, () => this.pedidos.porPreparar()),
      caja: this.sinPermiso(this.veCaja, () => this.caja.sesion()),
      cxc: this.sinPermiso(this.veCxc, () => this.credito.vencidasResumen({ silenciosa })),
      actividad: this.sinPermiso(this.verActividad, () =>
        this.http.get<Paginado<ComprobanteFila>>(urlConstants.comprobante.base, {
          ...opcionesHttp(),
          context: peticionSilenciosa(),
          params: new HttpParams().set('pagina', '1').set('por_pagina', '6'),
        }),
      ),
      sucursales: this.sinPermiso(this.esAdmin && this.visible('sucursales'), () =>
        this.caja.resumenSucursales({ desde: hoy, hasta: hoy }),
      ),
    }).pipe(
      map((r) => this.aplicarBase(r as ResultadoBase)),
    );
  }

  /** Lo que depende del periodo: ventas, gráfico y lo más vendido. Solo esto se vuelve a pedir al cambiar de periodo. */
  private cargarPeriodo(silenciosa: boolean): Observable<void> {
    const periodo = this.periodo;
    const ficha = ++this.fichaPeriodo;
    return defer(() => {
      if (!silenciosa) this.pendientesPeriodo++;
      this.cargandoPeriodo = this.pendientesPeriodo > 0;
      return this.pedirPeriodo(periodo, silenciosa).pipe(
        // Si mientras tanto se eligió otro periodo, esta respuesta ya no vale.
        map((r) => {
          if (ficha === this.fichaPeriodo) this.aplicarPeriodo(periodo, r);
        }),
        finalize(() => {
          if (!silenciosa) this.pendientesPeriodo--;
          this.cargandoPeriodo = this.pendientesPeriodo > 0;
          this.cdr.markForCheck();
        }),
      );
    });
  }

  private pedirPeriodo(periodo: PeriodoInicio, silenciosa: boolean): Observable<ResultadoPeriodo> {
    const opciones = { silenciosa };
    const reporte = (p: PeriodoReporte, rango?: RangoReporte) =>
      this.sinPermiso(this.veReportes, () => this.reportes.ventas(p, rango, opciones));
    const hoy = new Date();
    const ayer = claveDia(ayerDe(hoy));

    switch (periodo) {
      case 'ayer':
        return forkJoin({
          reporte: reporte('diario', { fecha_inicio: ayer, fecha_fin: ayer }),
          hora: this.sinPermiso(this.veReportes, () => this.reportes.ventasPorHora(ayer)),
        });
      case 'semana':
        return forkJoin({ reporte: reporte('semana') });
      case 'mes':
        return forkJoin({ reporte: reporte('mensual') });
      default:
        // «Hoy»: la hora es opcional (si el servidor no la tiene, falla o tarda, vale null y se muestra la semana).
        return forkJoin({
          reporte: reporte('diario'),
          semana: reporte('semana'),
          hora: this.sinPermiso(this.veReportes, () => this.reportes.ventasPorHora()),
        });
    }
  }

  // ───────────────────────────────────────────────────────────── aplicar lo leído

  private aplicarBase(r: ResultadoBase): void {
    this.sinStock = r.inv?.sin_stock ?? null;
    this.bajoStock = r.inv?.bajo_stock ?? null;
    this.cpeAtencion = r.cpe?.total ?? null;
    this.pedidosWeb = r.pedidos;
    this.aplicarSesion(); // vuelve a armar los accesos: «Pedidos web» aparece si hay alguno
    this.aplicarCaja(r.caja);
    this.aplicarCuentas(r.cxc);
    this.aplicarActividad(r.actividad);
    this.aplicarSucursales(r.sucursales);
  }

  private aplicarPeriodo(periodo: PeriodoInicio, r: ResultadoPeriodo): void {
    this.ventasPeriodo = null;
    this.numVentas = null;
    this.ticketPromedio = null;
    this.deltaVentas = null;
    this.deltaTicket = null;
    this.aplicarVentas(r.reporte ?? null);
    this.topCargado = true;
    this.cerrarTooltip();

    if (periodo === 'hoy' || periodo === 'ayer') {
      this.aplicarHoras(r.hora ?? null);
      this.aplicarComparacion(r.hora ?? null);
      // «Hoy» sin gráfico por hora cae en el semanal; «Ayer» no tiene semanal de respaldo.
      this.aplicarDias(periodo === 'hoy' ? (r.semana ?? null) : null, 'semana', periodo === 'hoy' && r.semana == null);
    } else {
      this.aplicarHoras(null);
      this.aplicarDias(r.reporte ?? null, periodo, r.reporte == null);
    }
  }

  private aplicarCaja(caja: SesionCaja | null): void {
    this.cajaAbierta = caja ? caja.abierta === true : null;
    this.cajaNombre = caja?.apertura?.caja_nombre || '';
    this.turnoDesde = '';
    this.turnoUsuario = '';
    this.turnoVentas = null;
    this.efectivoTurno = null;
    this.detalleMedios = '';
    this.cobros = [];
    this.cobrosTotal = 0;
    if (!caja || !caja.abierta) return;

    const apertura = caja.apertura as (SesionCaja['apertura'] & { usuario_nombre?: string | null }) | null;
    if (apertura?.fecha) {
      const fecha = new Date(apertura.fecha);
      if (!Number.isNaN(fecha.getTime())) {
        this.turnoDesde = `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`;
      }
    }
    // El nombre solo se muestra si la API lo trae o si el turno es del usuario en sesión.
    if (apertura?.usuario_nombre) this.turnoUsuario = apertura.usuario_nombre;
    else if (apertura?.id_usuario != null && apertura.id_usuario === this.sesion.idUsuario) {
      this.turnoUsuario = this.sesion.nombre;
    }

    const resumen = caja.resumen;
    if (!resumen) return;
    this.turnoVentas = resumen.ventas ?? null;
    const metodos = Array.isArray(resumen.por_metodo) ? resumen.por_metodo : [];
    const total = (patron: RegExp) =>
      metodos.filter((m) => patron.test(m.metodo || '')).reduce((s, m) => s + numero(m.total), 0);
    this.efectivoTurno = total(/efectivo/i);
    const otros: string[] = [];
    const yape = total(/yape/i);
    const tarjeta = total(/tarjeta/i);
    if (yape > 0) otros.push(`Yape ${this.soles(yape)}`);
    if (tarjeta > 0) otros.push(`tarjeta ${this.soles(tarjeta)}`);
    this.detalleMedios = otros.join(' · ');

    const medios = construirCobros(metodos);
    this.cobros = medios.cobros;
    this.cobrosTotal = medios.total;
  }

  /** Total, ticket promedio, número de ventas y lo más vendido del periodo. */
  private aplicarVentas(rep: ReporteVentasResumen | null): void {
    if (!rep || rep.total_vendido == null) {
      this.topProductos = [];
      return;
    }
    this.ventasPeriodo = numero(rep.total_vendido);
    const ventas = (rep.detalle ?? []).filter((d) => !d.tipo_documento || d.tipo_documento === 'venta');
    this.numVentas = ventas.length;
    if (ventas.length > 0) {
      const suma = ventas.reduce((s, d) => s + numero(d.total_vendido), 0);
      this.ticketPromedio = suma / ventas.length;
    }

    this.topProductos = construirTopProductos(rep);
  }

  /** «▲ 12 % vs. la semana pasada a esta hora»: hoy hasta la hora actual; ayer, el día completo. */
  private aplicarComparacion(datos: VentasPorHora | null): void {
    const hastaHora = this.periodo === 'ayer' ? 23 : new Date().getHours();
    const t = totalesHasta(datos, hastaHora);
    if (!t) return;
    // Si el reporte del día no llegó, los totales salen de las mismas horas.
    if (this.ventasPeriodo == null) {
      this.ventasPeriodo = t.total;
      this.numVentas = t.ventas;
      this.ticketPromedio = t.ventas > 0 ? t.total / t.ventas : null;
    }
    this.deltaVentas = vistaDelta(delta(t.total, t.totalPrevio), this.referenciaDelta);
    if (t.ventas > 0) {
      const ticketPrevio = t.ventasPrevio > 0 ? t.totalPrevio / t.ventasPrevio : 0;
      this.deltaTicket = vistaDelta(delta(t.total / t.ventas, ticketPrevio), this.referenciaDelta);
    }
  }

  /** Barras de la semana (lunes a hoy) o del mes (día 1 a hoy) con el neto de cada día. `falla`: la lectura no llegó. */
  private aplicarDias(rep: ReporteVentasResumen | null, tipo: 'semana' | 'mes', falla: boolean): void {
    this.diasCargados = true;
    this.semanaFalla = falla;
    this.diasConDatos = false;
    this.barras = [];
    this.marcasEje = [];
    this.resumenDias = '';
    this.hallazgoDias = '';
    if (!rep) return;

    const hoy = new Date();
    const desde =
      tipo === 'mes'
        ? new Date(hoy.getFullYear(), hoy.getMonth(), 1)
        : new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7));
    const dias = totalesPorDia(diasEntre(desde, hoy), rep.detalle);
    const grafico = construirBarrasDias(dias);
    if (!grafico) return;

    this.diasConDatos = true;
    this.barras = grafico.barras;
    this.marcasEje = grafico.marcas;
    const mejor = dias[grafico.mejor];
    const nombre = mejor.fecha.toLocaleDateString('es-PE', { weekday: 'long' });
    this.resumenDias = `Ventas netas ${tipo === 'mes' ? 'del mes' : 'de lunes a hoy'}: ${this.soles(grafico.total)}.`;
    this.hallazgoDias = `El mejor día fue el ${nombre} ${mejor.fecha.getDate()}, con ${this.soles(mejor.total)}.`;
  }

  /** Barras por hora contra el mismo día de la semana pasada. Eje de 7 a 21 h, ampliado si hay ventas fuera. */
  private aplicarHoras(datos: VentasPorHora | null): void {
    this.horaConDatos = false;
    this.barrasHora = [];
    this.marcasEjeHora = [];
    this.resumenHora = '';
    this.hallazgoHora = '';
    const dia = this.periodo === 'ayer' ? 'ayer' : 'hoy';
    const grafico = construirBarrasHora(datos, dia);
    if (!grafico) return;

    this.horaConDatos = true;
    this.barrasHora = grafico.barras;
    this.marcasEjeHora = grafico.marcas;
    const rotulo = (h: number) => `${dosDigitos(h)}:00`;
    const quien = dia === 'ayer' ? 'Ayer' : 'Hoy';
    this.resumenHora = `${quien} ${this.soles(grafico.totalActual)} · el mismo día de la semana pasada, ${this.soles(grafico.totalPrevio)}.`;
    this.hallazgoHora =
      grafico.pico >= 0
        ? `La hora pico fue ${rotulo(grafico.pico)}, con ${this.soles(grafico.totalPico)}.`
        : `${quien} todavía no hay ventas; en gris, el mismo día de la semana pasada.`;
  }

  private aplicarCuentas(r: ResumenVencidas | null): void {
    this.cxcVencidoCuentas = r?.cuentas ?? null;
    this.cxcVencidoMonto = r?.total ?? null;
    this.cxcParcial = false;
  }

  private aplicarActividad(lista: Paginado<ComprobanteFila> | null): void {
    this.actividadCargada = lista != null;
    this.actividad = construirActividad(lista?.datos ?? []);
  }

  /** Solo con más de una sucursal: nombre, barra proporcional al total y cuántos turnos hubo hoy. */
  private aplicarSucursales(r: ResumenSucursalesCaja | null): void {
    this.sucursales = construirSucursales(r);
  }

  /** Ruta y parámetros para abrir un comprobante en Documentos. */
  readonly rutaDocumentos = `${RUTA}/doc`;
  parametrosComprobante(id: number): Record<string, number> {
    return { [PARAMETRO_COMPROBANTE]: id };
  }
}
