import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay, tap } from 'rxjs/operators';
import { urlConstants } from '../../constants/urlConstants';
import {
  Paginado, PreviewComprobante, ProductoVenta, VentaRegistrada,
} from '../models/admin.models';
import { cabecerasAutenticadas, opcionesHttp } from './api-base.service';

export interface SolicitudVenta {
  documento?: string;
  id_cliente?: number;
  id_empresa?: number;
  cliente_denominacion?: string;
  cliente_direccion?: string;
  id_tipo: number;
  serie?: string;
  id_moneda?: number;
  emitir_comprobante?: boolean;
  enviar_cliente?: boolean;
  id_almacen?: number;
  descontar_stock?: boolean;
  observaciones?: string;
  clave_idempotencia?: string;
  items: { id_producto: number; cantidad: number; precio_unitario?: number; descuento?: number }[];
  pagos?: {
    id_metodo?: number;
    monto: number;
    referencia?: string;
    monto_recibido?: number;
    vuelto?: number;
    id_cuenta_bancaria?: number;
    voucher_pos?: string;
    validacion?: string;
    referencia_externa?: string;
  }[];
}

export interface AlmacenPos {
  id_almacen: number;
  nombre: string;
  sucursal: string;
  id_sucursal: number | null;
}

export interface ContextoPos {
  almacenes: AlmacenPos[];
  almacen_default?: number;
}

const CATALOGO_TTL_MS = 3 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class PuntoVentaService {

  /** Cache en memoria del catálogo POS (datos reales del API). */
  private catalogo: ProductoVenta[] = [];
  private catalogoListo = false;
  private catalogoEnCurso$: Observable<ProductoVenta[]> | null = null;
  /** Almacén con el que se cargó el catálogo en cache. */
  private idAlmacenCatalogo: number | null = null;
  private catalogoCargadoEn = 0;

  constructor(private http: HttpClient) {}

  get tieneCatalogo(): boolean {
    return this.catalogoListo && this.catalogo.length > 0;
  }

  get catalogoExpirado(): boolean {
    if (!this.catalogoListo || !this.catalogoCargadoEn) return true;
    return Date.now() - this.catalogoCargadoEn > CATALOGO_TTL_MS;
  }

  /** Fuerza recarga en el próximo cargarCatalogo. */
  invalidarCatalogo(): void {
    this.catalogoListo = false;
    this.catalogoEnCurso$ = null;
    this.catalogoCargadoEn = 0;
  }

  contextoPos(): Observable<ContextoPos> {
    return this.http.get<ContextoPos>(urlConstants.puntoVenta.contextoPos, opcionesHttp()).pipe(
      catchError(() => of({ almacenes: [] as AlmacenPos[] })),
    );
  }

  /**
   * Carga el catálogo activo desde el API.
   * Si el almacén cambia o el TTL (3 min) venció, recarga.
   */
  cargarCatalogo(forzar = false, idAlmacen?: number | null): Observable<ProductoVenta[]> {
    const alm = idAlmacen != null && Number(idAlmacen) > 0 ? Number(idAlmacen) : null;
    const cambioAlmacen = alm !== this.idAlmacenCatalogo;
    const expirado = this.catalogoExpirado;
    const debeForzar = forzar || cambioAlmacen || expirado;

    if (this.catalogoListo && !debeForzar) {
      return of(this.catalogo);
    }
    if (this.catalogoEnCurso$ && !debeForzar) {
      return this.catalogoEnCurso$;
    }

    let params = new HttpParams().set('limite', '5000');
    if (alm != null) params = params.set('id_almacen', String(alm));

    this.catalogoEnCurso$ = this.http
      .get<ProductoVenta[]>(urlConstants.puntoVenta.catalogoProductos, {
        ...opcionesHttp(),
        params,
      })
      .pipe(
        catchError(() => of(this.catalogo)),
        tap((lista) => {
          this.catalogo = Array.isArray(lista) ? lista : [];
          this.catalogoListo = this.catalogo.length > 0;
          this.idAlmacenCatalogo = alm;
          this.catalogoCargadoEn = Date.now();
          this.catalogoEnCurso$ = null;
        }),
        shareReplay(1),
      );

    return this.catalogoEnCurso$;
  }

  /** Autocompletado local: mismos criterios de prioridad que el backend. */
  filtrarLocal(termino: string, limite = 12): ProductoVenta[] {
    const texto = (termino ?? '').trim();
    if (!texto || !this.catalogo.length) return [];

    const t = texto.toLowerCase();
    const exactosBarcode: ProductoVenta[] = [];
    const exactosSku: ProductoVenta[] = [];
    const parciales: ProductoVenta[] = [];

    for (const p of this.catalogo) {
      const sku = (p.sku || '').toLowerCase();
      const barcode = p.codigo_barras || '';
      const nombre = (p.nombre || '').toLowerCase();

      if (barcode === texto) {
        exactosBarcode.push(p);
        continue;
      }
      if (sku === t) {
        exactosSku.push(p);
        continue;
      }
      if (nombre.includes(t) || sku.includes(t) || barcode.includes(texto)) {
        parciales.push(p);
      }
    }

    parciales.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
    return [...exactosBarcode, ...exactosSku, ...parciales].slice(0, limite);
  }

  /** Match exacto local (lector / SKU). */
  porCodigoLocal(codigo: string): ProductoVenta | null {
    const valor = (codigo ?? '').trim();
    if (!valor || !this.catalogo.length) return null;

    const porBarcode = this.catalogo.find((p) => (p.codigo_barras || '') === valor);
    if (porBarcode) return porBarcode;

    const lower = valor.toLowerCase();
    return this.catalogo.find((p) => (p.sku || '').toLowerCase() === lower) ?? null;
  }

  /** Tras una venta: baja stock local para no esperar otro GET. */
  descontarStockLocal(items: { id_producto: number; cantidad: number }[]): void {
    if (!items.length || !this.catalogo.length) return;
    const mapa = new Map(items.map((i) => [i.id_producto, i.cantidad]));
    this.catalogo = this.catalogo.map((p) => {
      const qty = mapa.get(p.id_producto);
      if (!qty) return p;
      return {
        ...p,
        stock_disponible: Math.max(0, Number(p.stock_disponible ?? 0) - qty),
      };
    });
  }

  buscarProductos(termino: string, limite = 12, idAlmacen?: number | null): Observable<ProductoVenta[]> {
    let params = new HttpParams().set('q', termino).set('limite', String(limite));
    if (idAlmacen != null && Number(idAlmacen) > 0) {
      params = params.set('id_almacen', String(idAlmacen));
    }
    return this.http.get<ProductoVenta[]>(urlConstants.puntoVenta.productos, {
      headers: cabecerasAutenticadas(),
      withCredentials: true,
      params,
    });
  }

  porCodigoBarras(codigo: string, idAlmacen?: number | null): Observable<ProductoVenta> {
    let params = new HttpParams();
    if (idAlmacen != null && Number(idAlmacen) > 0) {
      params = params.set('id_almacen', String(idAlmacen));
    }
    return this.http.get<ProductoVenta>(urlConstants.puntoVenta.porCodigoBarras(codigo), {
      ...opcionesHttp(),
      params,
    });
  }

  metodosPago(): Observable<{ id_metodo: number; nombre: string; tipo?: string }[]> {
    return this.http.get<{ id_metodo: number; nombre: string; tipo?: string }[]>(
      urlConstants.puntoVenta.metodosPago,
      opcionesHttp(),
    );
  }

  lineaCredito(params: { id_cliente?: number; id_empresa?: number }): Observable<any> {
    let httpParams = new HttpParams();
    if (params.id_cliente) httpParams = httpParams.set('id_cliente', String(params.id_cliente));
    if (params.id_empresa) httpParams = httpParams.set('id_empresa', String(params.id_empresa));
    return this.http.get(urlConstants.credito.linea, {
      ...opcionesHttp(),
      params: httpParams,
    });
  }

  listarCxc(filtros: Record<string, any> = {}): Observable<any> {
    let params = new HttpParams();
    Object.entries(filtros).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return this.http.get(urlConstants.credito.cuentas, { ...opcionesHttp(), params });
  }

  obtenerCxc(id: number): Observable<any> {
    return this.http.get(urlConstants.credito.cuenta(id), opcionesHttp());
  }

  abonarCxc(id: number, body: { monto: number; id_metodo?: number; referencia?: string }): Observable<any> {
    return this.http.post(urlConstants.credito.abonar(id), body, opcionesHttp());
  }

  actualizarCreditoCliente(id: number, body: any): Observable<any> {
    return this.http.put(urlConstants.credito.cliente(id), body, opcionesHttp());
  }

  actualizarCreditoEmpresa(id: number, body: any): Observable<any> {
    return this.http.put(urlConstants.credito.empresa(id), body, opcionesHttp());
  }

  pasarelaCaja(): Observable<any> {
    return this.http.get(urlConstants.caja.pasarela, opcionesHttp());
  }

  cuentasBancarias(todas = false): Observable<any[]> {
    let params = new HttpParams();
    if (todas) params = params.set('todas', '1');
    return this.http.get<any[]>(urlConstants.caja.cuentasBancarias, { ...opcionesHttp(), params });
  }

  crearCuentaBancaria(body: any): Observable<any> {
    return this.http.post(urlConstants.caja.cuentasBancarias, body, opcionesHttp());
  }

  actualizarCuentaBancaria(id: number, body: any): Observable<any> {
    return this.http.put(urlConstants.caja.cuentaBancaria(id), body, opcionesHttp());
  }

  eliminarCuentaBancaria(id: number): Observable<any> {
    return this.http.delete(urlConstants.caja.cuentaBancaria(id), opcionesHttp());
  }

  iniciarYape(body: { monto: number; email?: string }): Observable<any> {
    return this.http.post(urlConstants.caja.yapeIniciar, body, opcionesHttp());
  }

  verificarYape(orderId: string): Observable<any> {
    return this.http.get(urlConstants.caja.yapeVerificar(orderId), opcionesHttp());
  }

  /** Calcula el comprobante sin registrar nada, para mostrarlo en pantalla. */
  preview(solicitud: SolicitudVenta): Observable<PreviewComprobante> {
    return this.http.post<PreviewComprobante>(urlConstants.puntoVenta.preview, solicitud, opcionesHttp());
  }

  registrar(solicitud: SolicitudVenta): Observable<VentaRegistrada> {
    return this.http.post<VentaRegistrada>(urlConstants.puntoVenta.base, solicitud, opcionesHttp());
  }

  listar(filtros: Record<string, any> = {}): Observable<Paginado<any>> {
    let params = new HttpParams();
    Object.entries(filtros).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') params = params.set(clave, String(valor));
    });

    return this.http.get<Paginado<any>>(urlConstants.puntoVenta.base, {
      headers: cabecerasAutenticadas(),
      withCredentials: true,
      params,
    });
  }

  obtener(idVenta: number): Observable<VentaRegistrada> {
    return this.http.get<VentaRegistrada>(urlConstants.puntoVenta.byId(idVenta), opcionesHttp());
  }

  anular(idVenta: number): Observable<any> {
    return this.http.post(urlConstants.puntoVenta.anular(idVenta), {}, opcionesHttp());
  }

  /**
   * Identificador único del intento de cobro. Se genera una vez por venta y se
   * mantiene si hay que reintentar, para que el backend reconozca que es la
   * misma operación y no la registre dos veces.
   */
  nuevaClaveIdempotencia(): string {
    const aleatorio = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `pos-${aleatorio}`;
  }
}
