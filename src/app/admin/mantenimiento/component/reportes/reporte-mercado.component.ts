import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import {
  CeldaMapaCalor,
  EstancadosReporte,
  FilaEstancado,
  FilaRentabilidad,
  MapaCalorReporte,
  RentabilidadReporte,
  ReportesService,
} from '../../../service/reportes.service';
import { mensajeDeError } from '../../../service/api-base.service';
import { ColumnaCsv, exportarCsv } from '../../../../shared/utils/exportar-csv';
import { EstadoOrden, SIN_ORDEN, alternarOrden, ariaSort, iconoOrden, ordenarLista } from '../../../../shared/utils/orden-lista';
import { RangoYmd } from './rango-fechas.util';

export type VistaMercado = 'rentabilidad' | 'estancados' | 'calor';

/** Lunes primero (como se lee una semana de trabajo); `dia` es el número del servidor (0 = domingo). */
export const DIAS_MAPA = [
  { dia: 1, corto: 'Lun', largo: 'lunes' },
  { dia: 2, corto: 'Mar', largo: 'martes' },
  { dia: 3, corto: 'Mié', largo: 'miércoles' },
  { dia: 4, corto: 'Jue', largo: 'jueves' },
  { dia: 5, corto: 'Vie', largo: 'viernes' },
  { dia: 6, corto: 'Sáb', largo: 'sábado' },
  { dia: 0, corto: 'Dom', largo: 'domingo' },
] as const;

export const HORAS_MAPA = Array.from({ length: 24 }, (_, h) => h);

/** «S/ 1,234.50» con separador de miles y dos decimales, igual en todos los navegadores. */
export function soles(valor: unknown): string {
  const n = Number(valor);
  const v = Number.isFinite(n) ? n : 0;
  const [entero, decimales] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '-' : ''}S/ ${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimales}`;
}

function fechaCorta(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function horaTexto(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

/** Celda lista para dibujar: su intensidad (0 = sin ventas; de 0,15 a 1 con ventas) y su texto accesible. */
export interface CeldaVista extends CeldaMapaCalor {
  intensidad: number;
  etiqueta: string;
  enMejor: boolean;
}

interface Tooltip {
  izquierda: number;
  arriba: number;
  titulo: string;
  total: string;
  ventas: string;
}

/**
 * Análisis de mercado del reporte (Fase F): rentabilidad por producto y categoría, stock estancado y el mapa de calor
 * «Cuándo se vende más». Rentabilidad y estancados respetan el rango de fechas del reporte y son del administrador;
 * el mapa de calor usa las últimas semanas. Solo presentación: el servidor calcula todo.
 */
@Component({
  selector: 'app-reporte-mercado',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './reporte-mercado.component.html',
  styleUrl: './reporte-mercado.component.css',
})
export class ReporteMercadoComponent implements OnInit, OnChanges {
  /** Rango (días de Lima) del reporte que se está viendo. */
  @Input() rango: RangoYmd | null = null;
  /** Rentabilidad y estancados muestran costos: solo el administrador. */
  @Input() admin = false;

  readonly diasMapa = DIAS_MAPA;
  readonly horasMapa = HORAS_MAPA;
  readonly opcionesEstancado = [30, 60, 90];
  readonly opcionesSemanas = [4, 8, 12];

  vista: VistaMercado = 'calor';

  // Rentabilidad
  rentabilidad: RentabilidadReporte | null = null;
  cargandoRent = false;
  errorRent = '';
  ordenRent: EstadoOrden = { ...SIN_ORDEN };

  // Estancados
  diasEstancado = 30;
  estancados: EstancadosReporte | null = null;
  cargandoEst = false;
  errorEst = '';
  ordenEst: EstadoOrden = { ...SIN_ORDEN };

  // Mapa de calor
  semanas = 4;
  mapa: MapaCalorReporte | null = null;
  cargandoMapa = false;
  errorMapa = '';
  celdas: CeldaVista[][] = [];
  /** Celda enfocada (fila 0–6 en el orden de la pantalla, hora 0–23): la única con tabindex 0. */
  foco = { f: 0, h: 0 };
  tooltip: Tooltip | null = null;
  @ViewChild('calor') private calor?: ElementRef<HTMLElement>;

  private lecturaRent?: Subscription;
  private lecturaEst?: Subscription;
  private lecturaMapa?: Subscription;
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor(private readonly api: ReportesService) {}

  ngOnInit(): void {
    this.vista = this.admin ? 'rentabilidad' : 'calor';
    this.cargarVista();
  }

  ngOnChanges(cambios: SimpleChanges): void {
    if (cambios['rango'] && !cambios['rango'].firstChange) {
      // Otro rango: lo cargado deja de valer. Se vuelve a pedir solo lo que se está viendo.
      this.rentabilidad = null;
      this.estancados = null;
      if (this.vista === 'rentabilidad' || this.vista === 'estancados') this.cargarVista();
    }
  }

  // ── Pestañas ──

  get vistas(): Array<{ id: VistaMercado; etiqueta: string; icono: string }> {
    const todas: Array<{ id: VistaMercado; etiqueta: string; icono: string }> = [
      { id: 'rentabilidad', etiqueta: 'Rentabilidad', icono: 'bi-graph-up-arrow' },
      { id: 'estancados', etiqueta: 'Stock estancado', icono: 'bi-box-seam' },
      { id: 'calor', etiqueta: 'Cuándo se vende más', icono: 'bi-grid-3x3-gap' },
    ];
    return this.admin ? todas : todas.filter((v) => v.id === 'calor');
  }

  elegirVista(id: VistaMercado): void {
    if (this.vista === id) return;
    this.vista = id;
    this.tooltip = null;
    this.cargarVista();
    this.cdr.markForCheck();
  }

  teclasPestanas(evento: KeyboardEvent): void {
    const lista = this.vistas;
    const i = lista.findIndex((v) => v.id === this.vista);
    let destino = -1;
    if (evento.key === 'ArrowRight') destino = (i + 1) % lista.length;
    else if (evento.key === 'ArrowLeft') destino = (i - 1 + lista.length) % lista.length;
    else if (evento.key === 'Home') destino = 0;
    else if (evento.key === 'End') destino = lista.length - 1;
    if (destino < 0) return;
    evento.preventDefault();
    this.elegirVista(lista[destino].id);
    setTimeout(() => (document.getElementById(`rm-tab-${lista[destino].id}`) as HTMLElement | null)?.focus());
  }

  private cargarVista(): void {
    if (this.vista === 'rentabilidad' && !this.rentabilidad) this.cargarRentabilidad();
    else if (this.vista === 'estancados' && !this.estancados) this.cargarEstancados();
    else if (this.vista === 'calor' && !this.mapa) this.cargarMapa();
  }

  // ── Rentabilidad ──

  cargarRentabilidad(): void {
    if (!this.admin || !this.rango) return;
    this.lecturaRent?.unsubscribe();
    this.cargandoRent = true;
    this.errorRent = '';
    this.cdr.markForCheck();
    this.lecturaRent = this.api
      .rentabilidad({ fecha_inicio: this.rango.desde, fecha_fin: this.rango.hasta })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.rentabilidad = r;
          this.cargandoRent = false;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.cargandoRent = false;
          this.errorRent = mensajeDeError(e, 'No se pudo leer la rentabilidad');
          this.cdr.markForCheck();
        },
      });
  }

  get filasRent(): FilaRentabilidad[] {
    const filas = this.rentabilidad?.productos ?? [];
    return this.ordenRent.clave ? ordenarLista(filas, this.ordenRent.clave as keyof FilaRentabilidad, this.ordenRent.dir) : filas;
  }

  get sinCostoRent(): number {
    return (this.rentabilidad?.productos ?? []).filter((p) => p.sin_costo).length;
  }

  ordenarRent(clave: string): void {
    this.ordenRent = alternarOrden(this.ordenRent, clave);
  }

  exportarRent(): void {
    const filas = this.filasRent;
    if (!filas.length || !this.rentabilidad) return;
    const columnas: ColumnaCsv<FilaRentabilidad>[] = [
      { titulo: 'Producto', valor: (p) => p.producto },
      { titulo: 'Código', valor: (p) => p.codigo },
      { titulo: 'Categoría', valor: (p) => p.categoria },
      { titulo: 'Vendido', valor: (p) => p.cantidad },
      { titulo: 'Venta sin IGV', valor: (p) => p.ingreso_sin_igv },
      { titulo: 'Total cobrado (con IGV)', valor: (p) => p.ingreso },
      { titulo: 'Costo', valor: (p) => p.costo },
      { titulo: 'Margen S/', valor: (p) => p.margen },
      { titulo: 'Margen %', valor: (p) => p.margen_pct },
      { titulo: 'Última venta', valor: (p) => p.ultima_venta },
      { titulo: 'Sin precio de compra', valor: (p) => (p.sin_costo ? 'sí' : 'no') },
    ];
    exportarCsv(`rentabilidad_${this.rentabilidad.fecha_inicio}_a_${this.rentabilidad.fecha_fin}`, columnas, filas);
  }

  // ── Estancados ──

  cargarEstancados(): void {
    if (!this.admin) return;
    this.lecturaEst?.unsubscribe();
    this.cargandoEst = true;
    this.errorEst = '';
    this.cdr.markForCheck();
    this.lecturaEst = this.api
      .estancados(this.diasEstancado)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.estancados = r;
          this.cargandoEst = false;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.cargandoEst = false;
          this.errorEst = mensajeDeError(e, 'No se pudo leer el stock estancado');
          this.cdr.markForCheck();
        },
      });
  }

  elegirDias(dias: number): void {
    if (this.diasEstancado === dias && this.estancados) return;
    this.diasEstancado = dias;
    this.estancados = null;
    this.cargarEstancados();
  }

  get filasEst(): FilaEstancado[] {
    const filas = this.estancados?.productos ?? [];
    return this.ordenEst.clave ? ordenarLista(filas, this.ordenEst.clave as keyof FilaEstancado, this.ordenEst.dir) : filas;
  }

  ordenarEst(clave: string): void {
    this.ordenEst = alternarOrden(this.ordenEst, clave);
  }

  exportarEst(): void {
    const filas = this.filasEst;
    if (!filas.length) return;
    const columnas: ColumnaCsv<FilaEstancado>[] = [
      { titulo: 'Producto', valor: (p) => p.producto },
      { titulo: 'Código', valor: (p) => p.codigo },
      { titulo: 'Categoría', valor: (p) => p.categoria },
      { titulo: 'Stock', valor: (p) => p.stock },
      { titulo: 'Precio de compra', valor: (p) => p.precio_compra },
      { titulo: 'Valorizado', valor: (p) => p.valorizado },
      { titulo: 'Última venta', valor: (p) => p.ultima_venta ?? 'nunca' },
      { titulo: 'Días sin vender', valor: (p) => p.dias_sin_venta },
    ];
    exportarCsv(`stock-estancado_${this.diasEstancado}-dias`, columnas, filas);
  }

  // ── Mapa de calor ──

  cargarMapa(): void {
    this.lecturaMapa?.unsubscribe();
    this.cargandoMapa = true;
    this.errorMapa = '';
    this.cdr.markForCheck();
    this.lecturaMapa = this.api
      .mapaCalor(this.semanas)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (m) => {
          this.mapa = m;
          this.celdas = this.armarCeldas(m);
          this.foco = this.focoInicial(m);
          this.cargandoMapa = false;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.cargandoMapa = false;
          this.errorMapa = mensajeDeError(e, 'No se pudo leer el mapa de calor');
          this.cdr.markForCheck();
        },
      });
  }

  elegirSemanas(n: number): void {
    if (this.semanas === n && this.mapa) return;
    this.semanas = n;
    this.mapa = null;
    this.tooltip = null;
    this.cargarMapa();
  }

  /** Una fila por día (lunes primero) con sus 24 horas. Sin ventas = intensidad 0; con ventas, de 0,15 a 1. */
  private armarCeldas(m: MapaCalorReporte): CeldaVista[][] {
    const porClave = new Map<string, CeldaMapaCalor>();
    for (const c of m.celdas ?? []) porClave.set(`${c.dia}-${c.hora}`, c);
    const maximo = Math.max(0, ...(m.celdas ?? []).map((c) => Number(c.total) || 0));
    const mejor = m.mejor;
    return DIAS_MAPA.map(({ dia, largo }) =>
      HORAS_MAPA.map((hora) => {
        const base = porClave.get(`${dia}-${hora}`) ?? { dia, hora, total: 0, ventas: 0 };
        const total = Number(base.total) || 0;
        const ventas = Number(base.ventas) || 0;
        const intensidad = total > 0 && maximo > 0 ? Math.round((0.15 + 0.85 * (total / maximo)) * 100) / 100 : 0;
        return {
          dia,
          hora,
          total,
          ventas,
          intensidad,
          enMejor: !!mejor && mejor.dia === dia && hora >= mejor.hora_inicio && hora < mejor.hora_fin,
          etiqueta:
            `${largo} de ${horaTexto(hora)} a ${horaTexto(hora + 1)}: ` +
            (total > 0 || ventas > 0 ? `${soles(total)}, ${ventas} ${ventas === 1 ? 'venta' : 'ventas'}` : 'sin ventas'),
        };
      }),
    );
  }

  private focoInicial(m: MapaCalorReporte): { f: number; h: number } {
    if (!m.mejor) return { f: 0, h: 0 };
    return { f: Math.max(0, DIAS_MAPA.findIndex((d) => d.dia === m.mejor!.dia)), h: m.mejor.hora_inicio };
  }

  get hayVentasMapa(): boolean {
    return !!this.mapa?.mejor;
  }

  get totalMapa(): number {
    return (this.mapa?.celdas ?? []).reduce((acc, c) => acc + (Number(c.total) || 0), 0);
  }

  /** «jueves 16–18 h» */
  get textoMejor(): string {
    const m = this.mapa?.mejor;
    if (!m) return '';
    const dia = DIAS_MAPA.find((d) => d.dia === m.dia)?.largo ?? '';
    return `${dia} ${m.hora_inicio}–${m.hora_fin} h`;
  }

  get fechasMapa(): string {
    return this.mapa ? `${fechaCorta(this.mapa.desde)} – ${fechaCorta(this.mapa.hasta)}` : '';
  }

  esFoco(f: number, h: number): boolean {
    return this.foco.f === f && this.foco.h === h;
  }

  mostrarTooltip(evento: Event, f: number, h: number): void {
    const caja = this.calor?.nativeElement;
    const celda = evento.currentTarget as HTMLElement | null;
    const datos = this.celdas[f]?.[h];
    if (!caja || !celda || !datos) return;
    const cr = caja.getBoundingClientRect();
    const r = celda.getBoundingClientRect();
    const mitad = 112; // la mitad del ancho máximo del tooltip
    const izquierda = Math.min(Math.max(r.left - cr.left + r.width / 2, mitad), Math.max(mitad, cr.width - mitad));
    const dia = DIAS_MAPA[f].largo;
    this.tooltip = {
      izquierda,
      arriba: r.top - cr.top - 6,
      titulo: `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${horaTexto(h)}–${horaTexto(h + 1)}`,
      total: datos.total > 0 || datos.ventas > 0 ? soles(datos.total) : 'Sin ventas',
      ventas: datos.ventas > 0 ? `${datos.ventas} ${datos.ventas === 1 ? 'venta' : 'ventas'}` : '',
    };
    this.cdr.markForCheck();
  }

  ocultarTooltip(): void {
    if (!this.tooltip) return;
    this.tooltip = null;
    this.cdr.markForCheck();
  }

  /** Flechas, Inicio y Fin mueven el foco entre celdas (una sola celda es parada de Tab). */
  teclasMapa(evento: KeyboardEvent): void {
    let { f, h } = this.foco;
    switch (evento.key) {
      case 'ArrowRight': h = Math.min(23, h + 1); break;
      case 'ArrowLeft': h = Math.max(0, h - 1); break;
      case 'ArrowDown': f = Math.min(6, f + 1); break;
      case 'ArrowUp': f = Math.max(0, f - 1); break;
      case 'Home': h = 0; break;
      case 'End': h = 23; break;
      default: return;
    }
    evento.preventDefault();
    this.foco = { f, h };
    this.cdr.detectChanges();
    this.calor?.nativeElement.querySelector<HTMLElement>(`[data-f="${f}"][data-h="${h}"]`)?.focus();
  }

  // ── Presentación ──

  moneda(valor: unknown): string {
    return soles(valor);
  }

  fecha(ymd: string | null | undefined): string {
    return fechaCorta(ymd);
  }

  porcentaje(valor: number | null | undefined): string {
    return valor === null || valor === undefined ? '—' : `${valor.toFixed(1)} %`;
  }

  ariaSort(orden: EstadoOrden, clave: string): 'ascending' | 'descending' | 'none' {
    return ariaSort(orden, clave);
  }

  iconoOrden(orden: EstadoOrden, clave: string): string {
    return iconoOrden(orden, clave);
  }

  identificarProducto(_i: number, p: { id_producto: number | null; producto: string }): string {
    return `${p.id_producto ?? 'x'}|${p.producto}`;
  }
}
