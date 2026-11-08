import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { conTiempoLimite, peticionSilenciosa } from '../../interceptors/contexto-http';
import { VentasPorHora } from '../models/admin.models';
import { opcionesHttp } from './api-base.service';

/** Fila de «Top productos» tal como la devuelve reportes/ventas. */
export interface TopProductoReporte {
  id_producto?: number | null;
  codigo?: string;
  producto?: string;
  cantidad?: number | string;
  total?: number | string;
}

export interface DetalleVentaReporte {
  fecha?: string;
  total_vendido?: number | string;
  tipo_documento?: 'venta' | 'nota_credito' | 'nota_debito' | string;
}

/** Lo que el Inicio lee de reportes/ventas (el reporte completo trae más campos que aquí no se usan). */
export interface ReporteVentasResumen {
  total_vendido?: number | string;
  detalle?: DetalleVentaReporte[];
  top_productos_vendidos?: TopProductoReporte[];
}

export type PeriodoReporte = 'diario' | 'semana' | 'quincenal' | 'mensual' | 'anual';

/** Días de Lima en formato AAAA-MM-DD. Con los dos, el servidor usa ese rango y no el periodo. */
export interface RangoReporte {
  fecha_inicio: string;
  fecha_fin: string;
}

/** Producto de `reportes/productos` (Fase F1): lo vendido en el rango con su costo y margen. */
export interface FilaRentabilidad {
  id_producto: number | null;
  codigo: string;
  producto: string;
  categoria: string;
  cantidad: number;
  /** Total cobrado, con IGV. */
  ingreso: number;
  /** Venta sin IGV: la base del margen. */
  ingreso_sin_igv: number;
  costo: number;
  /** Venta sin IGV − costo. */
  margen: number;
  /** null si la venta sin IGV es 0. */
  margen_pct: number | null;
  /** AAAA-MM-DD (Lima) o null. */
  ultima_venta: string | null;
  /** El producto no tiene precio de compra: su costo y su margen no son confiables. */
  sin_costo: boolean;
}

export interface FilaRentabilidadCategoria {
  categoria: string;
  productos: number;
  cantidad: number;
  ingreso: number;
  ingreso_sin_igv: number;
  costo: number;
  margen: number;
  margen_pct: number | null;
}

export interface RentabilidadReporte {
  fecha_inicio: string;
  fecha_fin: string;
  productos: FilaRentabilidad[];
  categorias: FilaRentabilidadCategoria[];
  totales: { productos: number; cantidad: number; ingreso: number; ingreso_sin_igv: number; costo: number; margen: number; margen_pct: number | null };
  recortado: boolean;
  nota_costo: string;
}

export interface FilaEstancado {
  id_producto: number;
  codigo: string;
  producto: string;
  categoria: string;
  stock: number;
  precio_compra: number;
  valorizado: number;
  ultima_venta: string | null;
  dias_sin_venta: number | null;
}

export interface EstancadosReporte {
  dias: number;
  productos: FilaEstancado[];
  total_productos: number;
  valorizado_total: number;
  recortado: boolean;
}

/** Una celda del mapa de calor (`dia` 0 = domingo … 6 = sábado; `hora` 0..23 de Lima). */
export interface CeldaMapaCalor {
  dia: number;
  hora: number;
  total: number;
  ventas: number;
}

export interface MapaCalorReporte {
  desde: string;
  hasta: string;
  semanas: number;
  celdas: CeldaMapaCalor[];
  mejor: { dia: number; hora_inicio: number; hora_fin: number; total: number } | null;
}

/** Raíz de las rutas de reportes (`.../reportes/`), sacada de la de ventas para no tocar las constantes. */
const RAIZ_REPORTES = urlConstants.reportes.ventas.replace(/ventas$/, '');

/** Lecturas de reportes que no tienen pantalla propia (el Inicio las usa para sus gráficos). */
@Injectable({ providedIn: 'root' })
export class ReportesService {
  constructor(private http: HttpClient) {}

  /**
   * Reporte de ventas del periodo (`reportes/ventas`). Con `rango` manda `fecha_inicio` y `fecha_fin`:
   * el servidor entonces ignora el periodo y devuelve esos días (así se pide «ayer»).
   * `silenciosa` es para las lecturas de fondo (la actualización automática): sin avisos globales ni reintentos.
   */
  ventas(
    periodo: PeriodoReporte,
    rango?: RangoReporte | null,
    opciones: { silenciosa?: boolean } = {},
  ): Observable<ReporteVentasResumen> {
    let params = new HttpParams().set('periodo', periodo);
    if (rango?.fecha_inicio && rango?.fecha_fin) {
      params = params.set('fecha_inicio', rango.fecha_inicio).set('fecha_fin', rango.fecha_fin);
    }
    return this.http.get<ReporteVentasResumen>(urlConstants.reportes.ventas, {
      ...opcionesHttp(),
      params,
      ...(opciones.silenciosa ? { context: peticionSilenciosa() } : {}),
    });
  }

  /**
   * Ventas netas por hora del día y del mismo día de la semana anterior (contrato B2).
   * `fecha` = 'YYYY-MM-DD'; sin fecha el servidor toma hoy.
   * Ruta: `reportes/ventas-por-hora` (hermana de `reportes/ventas`).
   */
  ventasPorHora(fecha?: string): Observable<VentasPorHora> {
    let params = new HttpParams();
    if (fecha) params = params.set('fecha', fecha);
    return this.http.get<VentasPorHora>(`${urlConstants.reportes.ventas}-por-hora`, {
      ...opcionesHttp(),
      params,
      // Gráfico opcional del Inicio: sin avisos globales, sin reintentos y con tope de 8 s;
      // si falla, el Inicio sigue con el gráfico semanal.
      context: peticionSilenciosa(conTiempoLimite(8_000)),
    });
  }
  /** Rentabilidad por producto y categoría del rango (Fase F1, solo administrador). */
  rentabilidad(rango: RangoReporte): Observable<RentabilidadReporte> {
    const params = new HttpParams().set('fecha_inicio', rango.fecha_inicio).set('fecha_fin', rango.fecha_fin);
    return this.http.get<RentabilidadReporte>(`${RAIZ_REPORTES}productos`, { ...opcionesHttp(), params });
  }

  /** Productos con existencias que no se venden hace 30, 60 o 90 días (Fase F1, solo administrador). */
  estancados(dias: number): Observable<EstancadosReporte> {
    const params = new HttpParams().set('dias', String(dias));
    return this.http.get<EstancadosReporte>(`${RAIZ_REPORTES}productos/estancados`, { ...opcionesHttp(), params });
  }

  /** Ventas netas por hora y día de la semana de las últimas `semanas` semanas (Fase F2). */
  mapaCalor(semanas = 4): Observable<MapaCalorReporte> {
    const params = new HttpParams().set('semanas', String(semanas));
    return this.http.get<MapaCalorReporte>(`${RAIZ_REPORTES}ventas-mapa-calor`, { ...opcionesHttp(), params });
  }
}
