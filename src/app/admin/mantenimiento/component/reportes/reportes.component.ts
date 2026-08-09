import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { GestionService } from '../../service/gestion.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { errorOperativo, normalizarErrorBlob } from '../../../service/api-base.service';

type PeriodoReporte = 'diario' | 'quincenal' | 'mensual' | 'anual';

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
  imports: [CommonModule],
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

  periodo: PeriodoReporte = 'diario';
  cargando = false;
  exportando: 'excel' | 'pdf' | null = null;

  totalVendido = 0;
  cantidadComprobantes = 0;
  ticketPromedio = 0;
  fechaInicio = '';
  fechaFin = '';
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

  constructor(
    private readonly gestion: GestionService,
    private readonly alerta: AlertService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  ngOnDestroy(): void {
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

  elegirPeriodo(periodo: PeriodoReporte): void {
    if (this.periodo === periodo && !this.cargando) return;
    this.periodo = periodo;
    this.cargar();
  }

  cargar(): void {
    this.cargando = true;
    this.cdr.markForCheck();
    this.gestion.getReportesVentas(this.periodo)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (data) => {
          this.cargando = false;
          this.aplicarRespuesta(data);
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.cargando = false;
          this.limpiar();
          this.cdr.markForCheck();
          this.alerta.error(errorOperativo(error, 'No se pudo cargar el reporte'));
        },
      });
  }

  exportarExcel(): void {
    this.exportando = 'excel';
    this.cdr.markForCheck();
    this.gestion.exportReportesVentasExcel(this.periodo)
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
          this.descargarBlob(blob, `ventas_${this.periodo}_${stamp}.xlsx`);
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

  exportarPdf(): void {
    this.exportando = 'pdf';
    this.cdr.markForCheck();
    this.gestion.exportReportesVentasPdf(this.periodo)
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
          this.descargarBlob(blob, `ventas_${this.periodo}_${stamp}.pdf`);
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

  fechaCorta(valor?: string): string {
    if (!valor) return '—';
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return String(valor).slice(0, 10);
    return d.toLocaleDateString('es-PE');
  }

  private aplicarRespuesta(data: any): void {
    this.totalVendido = Number(data?.total_vendido ?? 0);
    this.cantidadComprobantes = Number(data?.cantidad_comprobantes ?? 0);
    this.ticketPromedio = Number(data?.ticket_promedio ?? 0);
    this.fechaInicio = data?.fecha_inicio ?? '';
    this.fechaFin = data?.fecha_fin ?? '';
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
