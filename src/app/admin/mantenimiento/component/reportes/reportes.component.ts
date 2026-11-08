import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, skip, takeUntil } from 'rxjs';
import { GestionService, ResumenRegistroVentasSire } from '../../service/gestion.service';
import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { ColumnaCsv, exportarCsv } from '../../../../shared/utils/exportar-csv';
import { EscritorFiltrosUrl, EsquemaFiltros, leerFiltros } from '../../../../shared/utils/filtros-url';
import { DeltaReporte, calcularDelta } from './comparacion.util';
import {
  PRESETS, PresetId, RangoYmd, diasEnRango, esFechaYmd, etiquetaRango, fechaCortaYmd, hoyEnLima, periodoParaRango,
  presetDeRango, rangoAnterior, rangoDePreset, rangoValido, ymdDeInstante,
} from './rango-fechas.util';
import { errorOperativo, normalizarErrorBlob } from '../../../service/api-base.service';
import { CountUpDirective } from '../../../../shared/ui/count-up.directive';
import { RevealDirective } from '../../../../shared/ui/reveal.directive';
import { ReporteMercadoComponent } from './reporte-mercado.component';

const MESES_SIRE = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Los últimos 12 meses de Lima, del actual hacia atrás: «Octubre 2026» con el valor AAAAMM. */
export function mesesParaSire(hoy: string): Array<{ valor: string; etiqueta: string }> {
  const [anio, mes] = hoy.split('-').map(Number);
  const meses: Array<{ valor: string; etiqueta: string }> = [];
  for (let i = 0; i < 12; i += 1) {
    const indice = mes - 1 - i;
    const a = anio + Math.floor(indice / 12);
    const m = ((indice % 12) + 12) % 12;
    meses.push({ valor: `${a}${String(m + 1).padStart(2, '0')}`, etiqueta: `${MESES_SIRE[m]} ${a}` });
  }
  return meses;
}

/** `attachment; filename="LE2061...txt"` → el nombre (null si no viene o trae algo raro). */
function nombreDeContentDisposition(cabecera: string | null): string | null {
  const m = /filename="?([A-Za-z0-9._-]+)"?/.exec(cabecera ?? '');
  return m ? m[1] : null;
}

/** El resumen viaja en la cabecera `X-Rvie-Resumen` (JSON con encodeURIComponent); una cabecera ausente o dañada no estorba. */
function leerResumenSire(cabecera: string | null): ResumenRegistroVentasSire | null {
  if (!cabecera) return null;
  try {
    const resumen = JSON.parse(decodeURIComponent(cabecera)) as ResumenRegistroVentasSire;
    return resumen && typeof resumen.filas === 'number' && resumen.omitidos ? resumen : null;
  } catch {
    return null;
  }
}

type PeriodoReporte = 'diario' | 'quincenal' | 'mensual' | 'anual';

/** Qué guarda la URL: el periodo fijo, o un rango de fechas (el rango manda). */
const ESQUEMA_URL: EsquemaFiltros = {
  periodo: { tipo: 'opcion', opciones: ['diario', 'quincenal', 'mensual', 'anual'], defecto: 'diario' },
  desde: { tipo: 'texto' },
  hasta: { tipo: 'texto' },
};

/** Cifras del periodo anterior con las que se comparan los indicadores. */
interface DatosPrevio {
  rango: RangoYmd;
  totalVendido: number;
  cantidadComprobantes: number;
  ticketPromedio: number;
}

interface FilaTipo {
  id_tipo: number;
  tipo: string;
  cantidad: number;
  total: number;
  /** Parte (0–100) del total entre facturas, boletas y otros tipos de venta. */
  porcentaje: number;
}

const NOMBRE_TIPO: Record<string, string> = {
  nota_credito: 'Nota de crédito',
  nota_debito: 'Nota de débito',
};

interface PeriodoInfo {
  id: PeriodoReporte;
  etiqueta: string;
  plan: string;
  icono: string;
}

@Component({
  selector: 'app-reportes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, CountUpDirective, RevealDirective, ReporteMercadoComponent],
  templateUrl: './reportes.component.html',
  styleUrl: './reportes.component.css',
})
export class ReportesComponent implements OnInit, OnDestroy {
  readonly periodos: PeriodoInfo[] = [
    {
      id: 'diario',
      etiqueta: 'Diario',
      icono: 'bi-sun',
      plan: 'Cierre del día: ventas de hoy para cuadrar caja y ver el ritmo actual.',
    },
    {
      id: 'quincenal',
      etiqueta: 'Quincenal',
      icono: 'bi-calendar2-week',
      plan: 'Quincena actual (1–15 o 16–fin de mes): avances de metas quincenales.',
    },
    {
      id: 'mensual',
      etiqueta: 'Mensual',
      icono: 'bi-calendar3',
      plan: 'Mes en curso desde el día 1: panorama del mes para metas internas.',
    },
    {
      id: 'anual',
      etiqueta: 'Anual',
      icono: 'bi-calendar-range',
      plan: 'Año calendario desde enero: tendencia y estacionalidad.',
    },
  ];

  /** Atajos de fechas del desplegable (un getter: así no depende del orden en que se evalúan los módulos). */
  get presets(): typeof PRESETS {
    return PRESETS;
  }
  periodo: PeriodoReporte = 'diario';
  /** Rango de fechas elegido (días de Lima). Con rango, el periodo fijo queda sin elegir. */
  rango: RangoYmd | null = null;
  presetActivo: PresetId | null = null;
  fechasAbiertas = false;

  /** «Registro de ventas (SIRE)»: panel con el mes y las dos descargas (solo administrador). */
  sireAbierto = false;
  mesesSire: Array<{ valor: string; etiqueta: string }> = [];
  mesSire = '';
  descargandoSire: 'txt' | 'csv' | null = null;
  resumenSire: ResumenRegistroVentasSire | null = null;
  readonly avisoSire =
    'Compare el archivo con la propuesta de SUNAT antes de aceptarla; las diferencias se corrigen en el portal SIRE. ' +
    'Estructura basada en PLE 14.1; el contador debe validar el primer archivo contra la propuesta SIRE.';
  /** El desplegable muestra los dos campos de fecha del «Personalizado». */
  personalizando = false;
  fechaDesde = '';
  fechaHasta = '';
  errorFechas = '';
  /** Cifras del periodo anterior; null mientras llegan o si la consulta falló (entonces no hay deltas). */
  previo: DatosPrevio | null = null;
  comparando = false;
  /** Desglose por tipo de comprobante. */
  porTipo: FilaTipo[] = [];
  notasDebito = { cantidad: 0, total: 0 };
  /** Columna del gráfico con el tooltip (posición dentro del área del gráfico). */
  tooltipColumna: { indice: number; izquierda: number; arriba: number } | null = null;
  indiceFoco = 0;
  cargando = false;
  /** La última consulta falló (solo para mostrar el estado de error en pantalla; el aviso modal sigue igual). */
  errorCarga = false;
  exportando: 'excel' | 'pdf' | null = null;

  totalVendido = 0;
  cantidadComprobantes = 0;
  ticketPromedio = 0;
  /** Notas de crédito del periodo: ya están restadas de totalVendido (ventas netas). */
  notasCredito = { cantidad: 0, total: 0 };
  fechaInicio = '';
  fechaFin = '';
  /** Días de Lima del reporte en pantalla: el análisis de mercado (rentabilidad, estancados) usa este mismo rango. */
  rangoMercado: RangoYmd | null = null;
  detalle: any[] = [];

  ventaMaxima = 0;
  ventaMinima = 0;
  emitidos = 0;
  anulados = 0;
  conError = 0;
  diasConVenta = 0;
  planTexto = '';
  serie: Array<{ clave: string; etiqueta: string; total: number; cantidad: number; porcentaje: number }> = [];
  topClientes: Array<{ cliente: string; documento?: string; total: number; cantidad: number; id_cliente?: number }> = [];

  private readonly destruir$ = new Subject<void>();
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly urlFiltros = new EscritorFiltrosUrl(this.router, this.route, ESQUEMA_URL);
  private lectura: Subscription | null = null;
  private lecturaPrevia: Subscription | null = null;

  constructor(
    private readonly gestion: GestionService,
    private readonly alerta: AlertService,
  ) {}

  /** El registro de ventas para el SIRE es del administrador (el servidor también lo exige). */
  get puedeSire(): boolean {
    return this.auth.puedeVer(['admin']);
  }

  ngOnInit(): void {
    // La URL manda antes de la primera carga; si la ruta cambia desde fuera (menú o paleta hacia
    // Reportes limpio), vuelve al periodo de siempre.
    this.aplicarDesdeUrl();
    this.route.queryParamMap.pipe(skip(1), takeUntil(this.destruir$)).subscribe(() => {
      if (this.urlFiltros.ocupado || this.coincideConLaUrl()) return;
      this.aplicarDesdeUrl();
      this.cargar();
    });
    this.cargar();
  }

  ngOnDestroy(): void {
    this.urlFiltros.cancelar();
    this.destruir$.next();
    this.destruir$.complete();
  }

  identificarSerie(_i: number, p: { clave: string }): string {
    return p.clave;
  }

  identificarCliente(_i: number, c: { id_cliente?: number; documento?: string; cliente: string }): string | number {
    return c.id_cliente ?? c.documento ?? `${c.cliente}-${_i}`;
  }

  identificarDetalle(_i: number, fila: any): string | number {
    return fila.id_comprobante ?? `${fila.fecha ?? ''}-${_i}`;
  }

  get periodoActivo(): PeriodoInfo {
    return this.periodos.find((p) => p.id === this.periodo) ?? this.periodos[0];
  }

  get maxSerie(): number {
    return Math.max(...this.serie.map((s) => s.total), 1);
  }

  /** Mayor importe del ranking de clientes: la barra de cada uno se mide contra él. */
  get maxTopCliente(): number {
    return Math.max(...this.topClientes.map((c) => Math.abs(Number(c.total) || 0)), 1);
  }

  /** Qué parte (0–100) del total vendido concentran los clientes del ranking. */
  get participacionTop(): number {
    const suma = this.topClientes.reduce((acc, c) => acc + (Number(c.total) || 0), 0);
    return this.totalVendido > 0 ? Math.max(0, Math.min(100, Math.round((suma / this.totalVendido) * 100))) : 0;
  }

  /** Cifra corta para el eje del gráfico: «S/ 850», «S/ 2.4 mil», «S/ 1.2 M». */
  monedaCorta(valor: number | string | null | undefined): string {
    const n = Number(valor ?? 0);
    const a = Math.abs(Number.isFinite(n) ? n : 0);
    const signo = n < 0 ? '−' : '';
    const sinCeroFinal = (x: number) => x.toFixed(1).replace(/\.0$/, '');
    if (a >= 1_000_000) return `${signo}S/ ${sinCeroFinal(a / 1_000_000)} M`;
    if (a >= 10_000) return `${signo}S/ ${Math.round(a / 1000)} mil`;
    if (a >= 1_000) return `${signo}S/ ${sinCeroFinal(a / 1000)} mil`;
    return `${signo}S/ ${Math.round(a)}`;
  }

  // ── Periodo y fechas ─────────────────────────────────────────

  /** Periodo que se manda al servidor: con rango, el que agrupa bien la tendencia según sus días. */
  get periodoEnvio(): string {
    return this.rango ? periodoParaRango(this.rango) : this.periodo;
  }

  private get rangoEnvio(): { desde: string; hasta: string } | undefined {
    return this.rango ? { desde: this.rango.desde, hasta: this.rango.hasta } : undefined;
  }

  /** Nombre del periodo o atajo en uso («Mensual», «Mes pasado», «Fechas elegidas»). */
  get etiquetaActiva(): string {
    if (!this.rango) return this.periodoActivo.etiqueta;
    const preset = this.presets.find((p) => p.id === this.presetActivo && p.id !== 'personalizado');
    return preset?.etiqueta ?? 'Fechas elegidas';
  }

  /** Texto bajo el título: el plan del periodo fijo, o los días del rango elegido. */
  get textoPlan(): string {
    if (!this.rango) return this.planTexto;
    const dias = diasEnRango(this.rango);
    return `${this.rango.desde === this.rango.hasta ? 'El día' : 'Del'} ${this.fechaLarga(this.rango.desde)}${
      this.rango.desde === this.rango.hasta ? '' : ` al ${this.fechaLarga(this.rango.hasta)}`
    } · ${dias} ${dias === 1 ? 'día' : 'días'}.`;
  }

  fechaLarga(ymd: string): string {
    return fechaCortaYmd(ymd, true);
  }

  elegirPeriodo(periodo: PeriodoReporte): void {
    if (this.periodo === periodo && !this.rango && !this.cargando) return;
    this.periodo = periodo;
    this.rango = null;
    this.presetActivo = null;
    this.cerrarFechas(false);
    this.escribirUrl();
    this.cargar();
  }

  abrirFechas(): void {
    if (this.fechasAbiertas) {
      this.cerrarFechas(true);
      return;
    }
    this.fechasAbiertas = true;
    this.personalizando = this.presetActivo === 'personalizado';
    this.fechaDesde = this.rango?.desde ?? '';
    this.fechaHasta = this.rango?.hasta ?? '';
    this.errorFechas = '';
    this.cdr.detectChanges();
    this.host.nativeElement
      .querySelector<HTMLElement>('.rep-fechas__preset[aria-pressed="true"], .rep-fechas__preset')?.focus();
  }

  cerrarFechas(devolverFoco = false): void {
    if (!this.fechasAbiertas) return;
    this.fechasAbiertas = false;
    this.personalizando = false;
    this.errorFechas = '';
    this.cdr.markForCheck();
    if (devolverFoco) this.host.nativeElement.querySelector<HTMLElement>('.rep-fechas__boton')?.focus();
  }

  @HostListener('document:keydown.escape')
  alPulsarEscape(): void {
    this.cerrarFechas(true);
    this.cerrarSire();
  }

  @HostListener('document:click', ['$event'])
  alHacerClic(evento: Event): void {
    const objetivo = evento.target as Element | null;
    if (this.sireAbierto && !objetivo?.closest?.('.rep-sire')) this.cerrarSire();
    if (!this.fechasAbiertas) return;
    const dentro = objetivo?.closest?.('.rep-fechas');
    if (!dentro) this.cerrarFechas(false);
  }

  // ── Registro de ventas (SIRE) ───────────────────────────────

  abrirSire(): void {
    if (this.sireAbierto) {
      this.cerrarSire();
      return;
    }
    this.cerrarFechas(false);
    this.mesesSire = mesesParaSire(hoyEnLima());
    // Lo habitual es declarar el mes que acaba de cerrar.
    if (!this.mesesSire.some((m) => m.valor === this.mesSire)) this.mesSire = this.mesesSire[1]?.valor ?? this.mesesSire[0].valor;
    this.resumenSire = null;
    this.sireAbierto = true;
    this.cdr.markForCheck();
  }

  cerrarSire(): void {
    if (!this.sireAbierto) return;
    this.sireAbierto = false;
    this.cdr.markForCheck();
  }

  descargarSire(formato: 'txt' | 'csv'): void {
    if (this.descargandoSire || !this.puedeSire || !/^\d{6}$/.test(this.mesSire)) return;
    this.descargandoSire = formato;
    this.resumenSire = null;
    this.cdr.markForCheck();
    this.gestion.descargarRegistroVentasSire(this.mesSire, formato)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (respuesta) => {
          this.descargandoSire = null;
          const blob = respuesta.body;
          if (!blob) {
            this.alerta.error({ title: 'Archivo vacío', message: 'El servidor no devolvió el registro de ventas. Reintente.' });
            this.cdr.markForCheck();
            return;
          }
          const nombre = nombreDeContentDisposition(respuesta.headers.get('Content-Disposition'))
            ?? `registro-ventas-sire-${this.mesSire}.${formato}`;
          this.resumenSire = leerResumenSire(respuesta.headers.get('X-Rvie-Resumen'));
          // El TXT del SIRE puede quedar vacío (mes sin ventas): igual se descarga, con el nombre que lo dice.
          this.descargarBlob(blob, nombre);
          const filas = this.resumenSire?.filas;
          this.alerta.toast({
            type: 'success',
            title: formato === 'txt' ? 'Registro de ventas (TXT) descargado' : 'Registro de ventas (CSV) descargado',
            message: filas === undefined ? undefined : filas === 0 ? 'El mes no tiene ventas aceptadas por SUNAT.' : `${filas} ${filas === 1 ? 'comprobante' : 'comprobantes'}.`,
          });
          this.cdr.markForCheck();
        },
        error: async (error) => {
          this.descargandoSire = null;
          this.cdr.markForCheck();
          this.alerta.error(errorOperativo(await normalizarErrorBlob(error), 'No se pudo generar el registro de ventas'));
        },
      });
  }

  /** Lo que quedó fuera del archivo, en palabras (para que el contador no lo busque de más). */
  get omitidosSire(): string[] {
    const o = this.resumenSire?.omitidos;
    if (!o) return [];
    const lineas: string[] = [];
    const n = (cantidad: number, uno: string, varios: string) => `${cantidad} ${cantidad === 1 ? uno : varios}`;
    if (o.sin_aceptar) lineas.push(`${n(o.sin_aceptar, 'comprobante todavía sin aceptar por SUNAT', 'comprobantes todavía sin aceptar por SUNAT')}`);
    if (o.rechazados) lineas.push(`${n(o.rechazados, 'rechazado por SUNAT', 'rechazados por SUNAT')}`);
    if (o.con_error) lineas.push(`${n(o.con_error, 'con error', 'con error')}`);
    if (o.pruebas) lineas.push(`${n(o.pruebas, 'de prueba (BETA)', 'de prueba (BETA)')}`);
    if (o.anulados_sin_sunat) lineas.push(`${n(o.anulados_sin_sunat, 'anulado solo en el sistema', 'anulados solo en el sistema')}`);
    return lineas;
  }

  elegirPreset(id: PresetId): void {
    if (id === 'personalizado') {
      this.personalizando = true;
      this.fechaDesde ||= this.rango?.desde ?? rangoDePreset('mes')?.desde ?? '';
      this.fechaHasta ||= this.rango?.hasta ?? hoyEnLima();
      this.errorFechas = '';
      this.cdr.markForCheck();
      return;
    }
    const rango = rangoDePreset(id);
    if (rango) this.aplicarRango(rango);
  }

  aplicarPersonalizado(): void {
    if (!esFechaYmd(this.fechaDesde) || !esFechaYmd(this.fechaHasta)) {
      this.errorFechas = 'Elija las dos fechas.';
      return;
    }
    if (!rangoValido(this.fechaDesde, this.fechaHasta)) {
      this.errorFechas = 'La fecha «desde» no puede ser posterior a «hasta».';
      return;
    }
    this.aplicarRango({ desde: this.fechaDesde, hasta: this.fechaHasta });
  }

  private aplicarRango(rango: RangoYmd): void {
    this.rango = rango;
    this.presetActivo = presetDeRango(rango);
    this.cerrarFechas(true);
    this.escribirUrl();
    this.cargar();
  }

  private escribirUrl(): void {
    this.urlFiltros.escribir(this.valoresDeUrl());
  }

  private valoresDeUrl(): Record<string, string | null> {
    return this.rango
      ? { periodo: null, desde: this.rango.desde, hasta: this.rango.hasta }
      : { periodo: this.periodo, desde: null, hasta: null };
  }

  private coincideConLaUrl(): boolean {
    const url = leerFiltros(this.route, ESQUEMA_URL);
    const hoy = this.rango
      ? { periodo: 'diario', desde: this.rango.desde, hasta: this.rango.hasta }
      : { periodo: this.periodo, desde: '', hasta: '' };
    const conRango = esFechaYmd(url['desde']) && esFechaYmd(url['hasta']) && rangoValido(String(url['desde']), String(url['hasta']));
    return conRango
      ? !!this.rango && url['desde'] === hoy.desde && url['hasta'] === hoy.hasta
      : !this.rango && url['periodo'] === hoy.periodo;
  }

  private aplicarDesdeUrl(): void {
    const url = leerFiltros(this.route, ESQUEMA_URL);
    const desde = String(url['desde'] ?? '');
    const hasta = String(url['hasta'] ?? '');
    if (rangoValido(desde, hasta)) {
      this.rango = { desde, hasta };
      this.presetActivo = presetDeRango(this.rango);
    } else {
      this.rango = null;
      this.presetActivo = null;
      this.periodo = String(url['periodo'] || 'diario') as PeriodoReporte;
    }
    this.cdr.markForCheck();
  }

  // ── Datos ────────────────────────────────────────────────────

  cargar(): void {
    this.lectura?.unsubscribe();
    this.lecturaPrevia?.unsubscribe();
    this.cargando = true;
    this.errorCarga = false;
    this.previo = null;
    this.comparando = false;
    this.cdr.markForCheck();
    this.lectura = this.gestion.getReportesVentas(this.periodoEnvio, this.rangoEnvio)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (data) => {
          this.cargando = false;
          this.aplicarRespuesta(data);
          this.cdr.markForCheck();
          this.cargarPrevio(data);
        },
        error: (error) => {
          this.cargando = false;
          this.errorCarga = true;
          this.limpiar();
          this.cdr.markForCheck();
          this.alerta.error(errorOperativo(error, 'No se pudo cargar el reporte'));
        },
      });
  }

  /**
   * Segunda lectura, del periodo anterior equivalente, para los porcentajes de cambio. Se calcula
   * con las fechas que devolvió el servidor (así sirve para «Mensual» y para un rango). Si falla,
   * el reporte sigue completo y solo faltan los porcentajes (sin avisos).
   */
  private cargarPrevio(data: any): void {
    const desde = ymdDeInstante(data?.fecha_inicio);
    const hasta = ymdDeInstante(data?.fecha_fin);
    if (!desde || !hasta || !rangoValido(desde, hasta)) return;
    const rango = rangoAnterior({ desde, hasta });
    this.comparando = true;
    this.cdr.markForCheck();
    this.lecturaPrevia = this.gestion
      .getReportesVentas(periodoParaRango(rango), { desde: rango.desde, hasta: rango.hasta }, { silenciosa: true })
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (previa) => {
          this.comparando = false;
          this.previo = {
            rango,
            totalVendido: Number(previa?.total_vendido ?? 0),
            cantidadComprobantes: Number(previa?.cantidad_comprobantes ?? 0),
            ticketPromedio: Number(previa?.ticket_promedio ?? 0),
          };
          this.cdr.markForCheck();
        },
        error: () => {
          this.comparando = false;
          this.cdr.markForCheck();
        },
      });
  }

  /** Cambio de cada indicador frente al periodo anterior; null mientras no hay comparación. */
  get deltaTotal(): DeltaReporte | null {
    return this.previo ? calcularDelta(this.totalVendido, this.previo.totalVendido) : null;
  }

  get deltaComprobantes(): DeltaReporte | null {
    return this.previo ? calcularDelta(this.cantidadComprobantes, this.previo.cantidadComprobantes) : null;
  }

  get deltaTicket(): DeltaReporte | null {
    return this.previo ? calcularDelta(this.ticketPromedio, this.previo.ticketPromedio) : null;
  }

  /** «vs. periodo anterior (01/10 – 31/10)». */
  get referenciaPrevio(): string {
    return this.previo ? `vs. periodo anterior (${etiquetaRango(this.previo.rango)})` : '';
  }

  // ── Tipos de comprobante ─────────────────────────────────────

  /** Facturas, boletas y otros tipos de venta (las notas van aparte, en su línea). */
  get tiposDeVenta(): FilaTipo[] {
    return this.porTipo.filter((t) => t.id_tipo !== 7 && t.id_tipo !== 8);
  }

  get textoTipos(): string {
    return this.tiposDeVenta
      .filter((t) => t.total > 0)
      .map((t) => `${t.tipo} ${Math.round(t.porcentaje)} %`)
      .join(', ');
  }

  claseTipo(t: FilaTipo): string {
    return t.id_tipo === 1 ? 'rep-tipos__tramo--factura' : t.id_tipo === 2 ? 'rep-tipos__tramo--boleta' : 'rep-tipos__tramo--otro';
  }

  // ── Gráfico: tooltip y teclado ───────────────────────────────

  activarColumna(indice: number, evento: Event): void {
    const columna = evento.currentTarget as HTMLElement | null;
    const area = columna?.parentElement;
    if (!columna || !area) return;
    const mitad = 112; // semiancho aproximado del tooltip
    const izquierda = Math.min(Math.max(columna.offsetLeft + columna.offsetWidth / 2, mitad), Math.max(mitad, area.clientWidth - mitad));
    const porcentaje = this.serie[indice]?.porcentaje ?? 0;
    // Sobre la barra; si es muy alta, queda dentro del área en lugar de salirse de la tarjeta.
    const arriba = Math.max(area.clientHeight * (1 - Math.max(porcentaje, 1.5) / 100), 84);
    this.indiceFoco = indice;
    this.tooltipColumna = { indice, izquierda, arriba };
    this.cdr.markForCheck();
  }

  cerrarTooltipColumna(): void {
    if (this.tooltipColumna === null) return;
    this.tooltipColumna = null;
    this.cdr.markForCheck();
  }

  teclaColumna(evento: KeyboardEvent, indice: number): void {
    const ultimo = this.serie.length - 1;
    const destino = evento.key === 'ArrowRight' ? Math.min(indice + 1, ultimo)
      : evento.key === 'ArrowLeft' ? Math.max(indice - 1, 0)
        : evento.key === 'Home' ? 0
          : evento.key === 'End' ? ultimo
            : -1;
    if (destino < 0) return;
    evento.preventDefault();
    this.indiceFoco = destino;
    this.cdr.detectChanges();
    const columnas = (evento.currentTarget as HTMLElement).parentElement?.children;
    (columnas?.[destino] as HTMLElement | undefined)?.focus();
  }

  /** Tooltip de la columna activa: título, importe y cantidad. */
  get puntoTooltip(): { etiqueta: string; total: number; cantidad: number } | null {
    const punto = this.tooltipColumna ? this.serie[this.tooltipColumna.indice] : null;
    return punto ? { etiqueta: punto.etiqueta, total: punto.total, cantidad: punto.cantidad } : null;
  }

  textoColumna(p: { etiqueta: string; total: number; cantidad: number }): string {
    return `${p.etiqueta}: ${this.moneda(p.total)}, ${p.cantidad} comprobante${p.cantidad === 1 ? '' : 's'}`;
  }

  exportarExcel(): void {
    this.exportando = 'excel';
    this.cdr.markForCheck();
    this.gestion.exportReportesVentasExcel(this.periodoEnvio, this.rangoEnvio)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (blob) => {
          this.exportando = null;
          this.cdr.markForCheck();
          if (!blob || blob.size === 0) {
            this.alerta.error({
              title: 'Excel vacío',
              message: 'El servidor no devolvió el archivo. Reintente.',
            });
            return;
          }
          const stamp = this.stampArchivo();
          this.descargarBlob(blob, `${this.baseArchivo()}_${stamp}.xlsx`);
          this.alerta.toast({
            type: 'success',
            title: this.detalle.length
              ? 'Excel descargado'
              : 'Excel descargado (sin movimientos en el periodo)',
          });
        },
        error: (error) => void this.manejarErrorExport(error, 'No se pudo exportar Excel'),
      });
  }

  /** Lo que se ve en el detalle del periodo, en un CSV que abre Excel (una fila por comprobante). */
  exportarCsv(): void {
    if (!this.detalle.length) return;
    const columnas: ColumnaCsv<any>[] = [
      { titulo: 'Fecha', valor: (f) => (f.fecha ? String(f.fecha).slice(0, 10) : '') },
      { titulo: 'Tipo', valor: (f) => this.nombreTipo(f) },
      { titulo: 'Comprobante', valor: (f) => f.numero_formateado || [f.serie, f.numero].filter(Boolean).join('-') },
      { titulo: 'Cliente', valor: (f) => f.cliente },
      { titulo: 'Documento', valor: (f) => (f.documento_cliente ? String(f.documento_cliente) : '') },
      { titulo: 'Estado', valor: (f) => f.estado },
      { titulo: 'Total', valor: (f) => Number(f.total_vendido) || 0 },
    ];
    const total = exportarCsv(this.baseArchivo(), columnas, this.detalle);
    this.alerta.toast({ type: 'success', title: `CSV descargado: ${total} ${total === 1 ? 'fila' : 'filas'}` });
  }

  /** «Factura», «Boleta», «Nota de crédito»… de una fila del detalle. */
  nombreTipo(fila: any): string {
    const porNombre = NOMBRE_TIPO[String(fila?.tipo_documento ?? '')];
    if (porNombre) return porNombre;
    return fila?.id_tipo === 1 ? 'Factura' : fila?.id_tipo === 2 ? 'Boleta' : 'Comprobante';
  }

  /** «ventas_mensual» o «ventas_2026-10-01_a_2026-10-31». */
  private baseArchivo(): string {
    return this.rango ? `ventas_${this.rango.desde}_a_${this.rango.hasta}` : `ventas_${this.periodo}`;
  }

  /** Abre el cuadro de impresión del navegador; el CSS de impresión (admin-ui.css) oculta menú, barra y botones. */
  imprimir(): void {
    window.print();
  }

  exportarPdf(): void {
    this.exportando = 'pdf';
    this.cdr.markForCheck();
    this.gestion.exportReportesVentasPdf(this.periodoEnvio, this.rangoEnvio)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (blob) => {
          this.exportando = null;
          this.cdr.markForCheck();
          if (!blob || blob.size === 0) {
            this.alerta.error({
              title: 'PDF vacío',
              message: 'El servidor no devolvió el archivo. Reintente.',
            });
            return;
          }
          const stamp = this.stampArchivo();
          this.descargarBlob(blob, `${this.baseArchivo()}_${stamp}.pdf`);
          this.alerta.toast({
            type: 'success',
            title: this.detalle.length
              ? 'PDF descargado'
              : 'PDF descargado (sin movimientos en el periodo)',
          });
        },
        error: (error) => void this.manejarErrorExport(error, 'No se pudo exportar PDF'),
      });
  }

  moneda(valor: number | string | null | undefined): string {
    const n = Number(valor ?? 0);
    return n.toLocaleString('es-PE', { style: 'currency', currency: 'PEN' });
  }

  /**
   * 'AAAA-MM-DD' (día de Lima que manda el backend) se muestra tal cual: pasarlo por Date lo
   * leía como medianoche UTC y en Lima salía el día anterior. Los instantes (inicio y fin del
   * periodo) se muestran en hora de Lima.
   */
  fechaCorta(valor?: string): string {
    if (!valor) return '—';
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor));
    if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return String(valor).slice(0, 10);
    return d.toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
  }

  /** Mismo objeto mientras no cambien los días, para que el análisis de mercado no vuelva a pedir sin motivo. */
  private calcularRangoMercado(inicio: string, fin: string): RangoYmd | null {
    const desde = ymdDeInstante(inicio);
    const hasta = ymdDeInstante(fin);
    if (!desde || !hasta || !rangoValido(desde, hasta)) return null;
    const actual = this.rangoMercado;
    return actual && actual.desde === desde && actual.hasta === hasta ? actual : { desde, hasta };
  }

  private aplicarRespuesta(data: any): void {
    this.totalVendido = Number(data?.total_vendido ?? 0);
    this.cantidadComprobantes = Number(data?.cantidad_comprobantes ?? 0);
    this.ticketPromedio = Number(data?.ticket_promedio ?? 0);
    this.notasCredito = {
      cantidad: Number(data?.notas_credito?.cantidad ?? 0),
      total: Number(data?.notas_credito?.total ?? 0),
    };
    this.notasDebito = {
      cantidad: Number(data?.notas_debito?.cantidad ?? 0),
      total: Number(data?.notas_debito?.total ?? 0),
    };
    this.porTipo = this.armarTipos(data?.por_tipo);
    this.fechaInicio = data?.fecha_inicio ?? '';
    this.fechaFin = data?.fecha_fin ?? '';
    this.rangoMercado = this.calcularRangoMercado(this.fechaInicio, this.fechaFin);
    this.detalle = Array.isArray(data?.detalle) ? [...data.detalle] : [];

    const stats = data?.estadisticas;
    if (stats) {
      this.ventaMaxima = Number(stats.venta_maxima ?? 0);
      this.ventaMinima = Number(stats.venta_minima ?? 0);
      this.emitidos = Number(stats.emitidos ?? 0);
      this.anulados = Number(stats.anulados ?? 0);
      this.conError = Number(stats.con_error ?? 0);
      this.diasConVenta = Number(stats.dias_con_venta ?? 0);
      this.planTexto = stats.plan || this.periodoActivo.plan;
      this.topClientes = Array.isArray(stats.top_clientes) ? [...stats.top_clientes] : [];
      const serieRaw = Array.isArray(stats.serie) ? stats.serie : [];
      this.indiceFoco = 0;
      this.tooltipColumna = null;
      const max = Math.max(...serieRaw.map((s: any) => Number(s.total ?? 0)), 1);
      this.serie = serieRaw.map((s: any) => ({
        clave: s.clave,
        etiqueta: s.etiqueta,
        total: Number(s.total ?? 0),
        cantidad: Number(s.cantidad ?? 0),
        porcentaje: Math.round((Number(s.total ?? 0) / max) * 100),
      }));
      return;
    }

    // Fallback si el backend aún no desplegó `estadisticas`.
    this.calcularFallbackLocal();
  }

  private armarTipos(crudo: unknown): FilaTipo[] {
    const lista = (Array.isArray(crudo) ? crudo : []).map((t: any) => ({
      id_tipo: Number(t?.id_tipo ?? 0),
      tipo: String(t?.tipo ?? 'Otros'),
      cantidad: Number(t?.cantidad ?? 0),
      total: Number(t?.total ?? 0),
      porcentaje: 0,
    }));
    const base = lista.filter((t) => t.id_tipo !== 7 && t.id_tipo !== 8).reduce((suma, t) => suma + Math.max(0, t.total), 0);
    return lista.map((t) => ({ ...t, porcentaje: base > 0 && t.total > 0 ? (t.total / base) * 100 : 0 }));
  }

  private calcularFallbackLocal(): void {
    const totales = this.detalle.map((d) => Number(d.total_vendido ?? 0));
    this.ventaMaxima = totales.length ? Math.max(...totales) : 0;
    this.ventaMinima = totales.length ? Math.min(...totales) : 0;
    this.emitidos = this.detalle.filter((d) => !d.anulado && d.estado !== 'anulado' && d.estado !== 'error').length;
    this.anulados = this.detalle.filter((d) => d.anulado || d.estado === 'anulado').length;
    this.conError = this.detalle.filter((d) => d.estado === 'error').length;
    this.diasConVenta = new Set(this.detalle.map((d) => String(d.fecha || '').slice(0, 10))).size;
    this.planTexto = this.periodoActivo.plan;

    const mapa = new Map<string, { etiqueta: string; total: number; cantidad: number }>();
    const porMes = this.periodo === 'anual';
    for (const d of this.detalle) {
      const fecha = new Date(d.fecha);
      let clave: string;
      let etiqueta: string;
      if (Number.isNaN(fecha.getTime())) {
        clave = String(d.fecha || 'x').slice(0, 10);
        etiqueta = clave;
      } else if (porMes) {
        clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        etiqueta = fecha.toLocaleDateString('es-PE', { month: 'short', year: 'numeric' });
      } else {
        clave = fecha.toISOString().slice(0, 10);
        etiqueta = fecha.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
      }
      const actual = mapa.get(clave) ?? { etiqueta, total: 0, cantidad: 0 };
      actual.total += Number(d.total_vendido ?? 0);
      actual.cantidad += 1;
      mapa.set(clave, actual);
    }
    const serieRaw = Array.from(mapa.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([clave, v]) => ({ clave, ...v }));
    const max = Math.max(...serieRaw.map((s) => s.total), 1);
    this.serie = serieRaw.map((s) => ({
      ...s,
      porcentaje: Math.round((s.total / max) * 100),
    }));

    const clientes = new Map<string, { cliente: string; documento?: string; total: number; cantidad: number }>();
    for (const d of this.detalle) {
      const nombre = d.cliente || '—';
      const key = `${nombre}|${d.documento_cliente || ''}`;
      const actual = clientes.get(key) ?? { cliente: nombre, documento: d.documento_cliente, total: 0, cantidad: 0 };
      actual.total += Number(d.total_vendido ?? 0);
      actual.cantidad += 1;
      clientes.set(key, actual);
    }
    this.topClientes = Array.from(clientes.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }

  private limpiar(): void {
    this.detalle = [];
    this.serie = [];
    this.topClientes = [];
    this.totalVendido = 0;
    this.cantidadComprobantes = 0;
    this.ticketPromedio = 0;
    this.notasCredito = { cantidad: 0, total: 0 };
    this.notasDebito = { cantidad: 0, total: 0 };
    this.porTipo = [];
    this.previo = null;
    this.ventaMaxima = 0;
    this.ventaMinima = 0;
    this.emitidos = 0;
    this.anulados = 0;
    this.conError = 0;
    this.diasConVenta = 0;
    this.planTexto = this.periodoActivo.plan;
  }

  private stampArchivo(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  private async manejarErrorExport(error: any, porDefecto: string): Promise<void> {
    this.exportando = null;
    this.cdr.markForCheck();
    const normalizado = await normalizarErrorBlob(error);
    this.alerta.error(errorOperativo(normalizado, porDefecto));
  }

  private descargarBlob(blob: Blob, nombre: string): void {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    URL.revokeObjectURL(url);
  }
}
