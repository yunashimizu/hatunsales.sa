import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Observable,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
  map,
  of,
  switchMap,
  takeUntil,
} from 'rxjs';

import { AlertService } from '../../../../shared/services/alert.service';
import { telefonoValidoPe, urlWhatsappCliente } from '../../../../shared/utils/whatsapp.util';
import {
  errorOperativo,
  escapeHtmlAlerta,
  mensajeDeError,
  normalizarErrorBlob,
} from '../../../service/api-base.service';
import {
  Cotizacion,
  CotizacionItem,
  CotizacionService,
  CrearCotizacionPayload,
} from '../../../service/cotizacion.service';
import { AlmacenPos, PuntoVentaService } from '../../../service/punto-venta.service';
import { ReceptorService } from '../../../service/receptor.service';
import { ProductoVenta, Receptor, SugerenciaReceptor } from '../../../models/admin.models';

type LineaCot = {
  id_producto: number;
  descripcion: string;
  sku: string;
  /** Entero >= 1: la columna en BD es INTEGER, igual que en ventas/stock. */
  cantidad: number;
  precio_unitario: number;
  /** Subtotal que guardó el backend (solo en cotizaciones guardadas). */
  subtotal?: number;
  stock_disponible: number;
};

type TipoDocumento = 'pdf' | 'excel';

/** De dónde salieron las sugerencias visibles: sirve para explicar un resultado vacío. */
type OrigenSugerencias = 'ninguno' | 'catalogo' | 'servidor';

type ResultadoBusqueda = { lista: ProductoVenta[]; origen: OrigenSugerencias };

/** Cuántas sugerencias se muestran bajo el buscador. */
const MAX_SUGERENCIAS = 12;

const DOCUMENTOS: Record<TipoDocumento, { etiqueta: string; extension: string }> = {
  pdf: { etiqueta: 'PDF', extension: 'pdf' },
  excel: { etiqueta: 'Excel', extension: 'xlsx' },
};

const DIAS_VIGENCIA_MAX = 90;

/** Productos que se listan en el mensaje de WhatsApp antes de resumir (igual que el backend). */
const MAX_ITEMS_TEXTO_WA = 8;

/** Tiempo antes de liberar el object URL: Firefox cancela la descarga si se revoca al instante. */
const REVOCAR_URL_MS = 30_000;

/** Solo se abren enlaces de WhatsApp (evita navegar a un esquema raro si el API devuelve otra cosa). */
const URL_WHATSAPP_SEGURA = /^https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i;

function redondear2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function numeroOpcional(valor: unknown): number | undefined {
  if (valor === null || valor === undefined || valor === '') return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

function soloDigitos(texto: unknown): string {
  return String(texto ?? '').replace(/\D/g, '');
}

/** Error con la misma forma que un HttpErrorResponse de Nest, para `errorOperativo`. */
function errorLocal(message: string, codigo = 'COTIZACION_DOCUMENTO_ERROR') {
  return { status: 0, error: { codigo, message } };
}

@Component({
  selector: 'app-cotizaciones',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './cotizaciones.component.html',
  styleUrl: './cotizaciones.component.css',
})
export class CotizacionesComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destruir$ = new Subject<void>();
  private readonly buscarProd$ = new Subject<string>();
  private readonly buscarCli$ = new Subject<string>();
  private readonly documentoExacto$ = new Subject<string>();

  lista: Cotizacion[] = [];
  cargandoLista = false;
  guardando = false;
  generandoPdf = false;
  generandoExcel = false;
  enviandoWa = false;
  abriendoId: number | null = null;

  modo: 'lista' | 'nueva' = 'lista';
  filtro = '';

  lineas: LineaCot[] = [];
  textoProducto = '';
  sugerenciasProd: ProductoVenta[] = [];
  buscandoProd = false;
  cargandoProductos = false;
  errorProductos = '';
  /**
   * El catálogo cargó pero vino sin productos. No bloquea nada: el buscador sigue
   * consultando al servidor, pero hay que decirlo para no confundirlo con "sin coincidencias".
   */
  catalogoVacio = false;
  /** Origen de lo que hay en `sugerenciasProd` (para el mensaje cuando no hay resultados). */
  origenSugerencias: OrigenSugerencias = 'ninguno';
  almacenes: AlmacenPos[] = [];
  /**
   * Alcance del stock que se MUESTRA (todas las sedes vs. el almacén de despacho).
   * Nunca decide qué productos se ven: el catálogo de la proforma siempre trae
   * todos los productos activos.
   */
  buscarTodasLasSedes = false;
  /** El contexto POS (almacenes) ya respondió: recién entonces vale pedir el catálogo. */
  private contextoListo = false;

  textoCliente = '';
  sugerenciasCli: SugerenciaReceptor[] = [];
  buscandoCliente = false;
  receptor: Receptor | null = null;
  clienteNombreManual = '';
  telefono = '';
  observaciones = '';
  diasVigencia = 7;
  idAlmacen: number | null = null;
  porcentajeIgv = 18;

  cotizacionActual: Cotizacion | null = null;

  private escaneandoCodigo = false;
  private ultimoDocumentoAuto = '';
  private destruido = false;
  /** Guardado en vuelo: si llegan dos clics (Guardar + PDF) se reutiliza el mismo POST. */
  private guardadoEnCurso: Promise<Cotizacion | null> | null = null;
  /** Descargas lanzadas desde la lista. Clave `${id_proforma}:${tipo}`. */
  private readonly descargasLista = new Set<string>();

  constructor(
    private readonly api: CotizacionService,
    private readonly pv: PuntoVentaService,
    private readonly receptorSvc: ReceptorService,
    private readonly alerta: AlertService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.escucharBusquedas();
    this.cargarLista();
    this.cargarContexto();
    if (this.route.snapshot.queryParamMap.get('desdePos') === '1') {
      this.cargarBorradorDesdePos();
    }
  }

  /** Atajo desde Ventas: sessionStorage pos_cotizacion_borrador. */
  private cargarBorradorDesdePos(): void {
    try {
      const raw = sessionStorage.getItem('pos_cotizacion_borrador');
      if (!raw) return;
      sessionStorage.removeItem('pos_cotizacion_borrador');
      const data = JSON.parse(raw);
      this.nueva();
      this.lineas = Array.isArray(data.lineas)
        ? data.lineas.map((l: any) => ({
            id_producto: l.id_producto,
            descripcion: l.descripcion,
            sku: l.sku || '',
            cantidad: this.normalizarCantidad(l.cantidad),
            precio_unitario: Number(l.precio_unitario) || 0,
            stock_disponible: Number(l.stock_disponible) || 0,
          }))
        : [];
      this.receptor = data.receptor || null;
      this.clienteNombreManual = data.receptor?.denominacion || '';
      this.telefono = String(data.receptor?.telefono || '');
      this.observaciones = data.observaciones || '';
      if (data.id_almacen) this.idAlmacen = Number(data.id_almacen);
      this.alerta.toast({ type: 'info', title: 'Carrito del POS listo para cotizar' });
      this.refrescar();
    } catch { /* ignore */ }
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.destruir$.next();
    this.destruir$.complete();
  }

  // ─── Totales y estado de la vista ──────────────────────────────────

  /** Total con IGV. Guardada: manda lo que guardó el backend. */
  get total(): number {
    const guardado = numeroOpcional(this.cotizacionActual?.total);
    if (this.cotizacionActual && guardado !== undefined) return redondear2(guardado);
    return redondear2(this.lineas.reduce((s, l) => s + this.subtotalLinea(l), 0));
  }

  get gravada(): number {
    const guardados = this.totalesGuardadosCoherentes();
    if (guardados) return guardados.gravada;
    return redondear2(this.total / (1 + this.porcentajeIgv / 100));
  }

  get igv(): number {
    const guardados = this.totalesGuardadosCoherentes();
    if (guardados) return guardados.igv;
    return redondear2(this.total - this.gravada);
  }

  /**
   * Usa gravada/IGV guardados solo si cuadran con el total.
   * Hay filas heredadas con total_igv = 0: ahí se recalcula desde el total.
   */
  private totalesGuardadosCoherentes(): { gravada: number; igv: number } | null {
    const c = this.cotizacionActual;
    if (!c) return null;
    const total = numeroOpcional(c.total);
    const gravada = numeroOpcional(c.total_gravada);
    const igv = numeroOpcional(c.total_igv);
    if (total === undefined || gravada === undefined || igv === undefined) return null;
    if (total > 0 && igv <= 0 && this.porcentajeIgv > 0) return null;
    if (Math.abs(gravada + igv - total) > 0.05) return null;
    return { gravada: redondear2(gravada), igv: redondear2(igv) };
  }

  subtotalLinea(linea: LineaCot): number {
    if (linea.subtotal !== undefined) return redondear2(linea.subtotal);
    return redondear2(linea.cantidad * linea.precio_unitario);
  }

  get telefonoOk(): boolean {
    return telefonoValidoPe(this.telefono);
  }

  /** Una cotización guardada ya no se edita: el backend no actualiza ítems. */
  get soloLectura(): boolean {
    return !!this.cotizacionActual?.id_proforma;
  }

  /** Hay una operación con el servidor en curso sobre la cotización abierta. */
  get ocupado(): boolean {
    return this.guardando || this.generandoPdf || this.generandoExcel || this.enviandoWa;
  }

  get documentoCliente(): string {
    return this.receptor?.numero_documento || this.cotizacionActual?.cliente_documento || '';
  }

  get fechaVigenciaPreview(): string {
    if (this.cotizacionActual?.valida_hasta) return this.fechaCorta(this.cotizacionActual.valida_hasta);
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + Math.max(1, Math.round(Number(this.diasVigencia)) || 7));
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${d}/${m}/${y}`;
  }

  get cotizacionVencida(): boolean {
    return !!this.cotizacionActual?.valida_hasta && this.fechaYaPaso(this.cotizacionActual.valida_hasta);
  }

  private fechaYaPaso(fecha: string): boolean {
    return new Date(`${String(fecha).slice(0, 10)}T23:59:59`).getTime() < Date.now();
  }

  /** yyyy-mm-dd → dd/mm/yyyy. */
  fechaCorta(fecha?: string | null): string {
    if (!fecha) return '—';
    const partes = String(fecha).slice(0, 10).split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : String(fecha);
  }

  /** Fecha y hora local (dd/mm/yyyy hh:mm) o vacío si no es válida. */
  fechaHora(valor?: string | null): string {
    if (!valor) return '';
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
  }

  get listaFiltrada(): Cotizacion[] {
    const t = this.filtro.trim().toLowerCase();
    if (!t) return this.lista;
    return this.lista.filter((c) =>
      `${c.codigo || ''} #${c.id_proforma} ${c.cliente_nombre || ''} ${c.estado} ${c.total}`
        .toLowerCase()
        .includes(t),
    );
  }

  private refrescar(): void {
    this.cdr.markForCheck();
  }

  /** Observable HTTP → Promise; se cancela si el componente se destruye. */
  private aPromesa<T>(peticion: Observable<T>): Promise<T> {
    return firstValueFrom(peticion.pipe(takeUntil(this.destruir$)));
  }

  // ─── Contexto, catálogo y lista ────────────────────────────────────

  private cargarContexto(): void {
    this.pv.contextoPos().pipe(
      takeUntil(this.destruir$),
      catchError(() => of({ almacenes: [] as AlmacenPos[], almacen_default: undefined })),
    ).subscribe((ctx) => {
      this.almacenes = Array.isArray(ctx.almacenes) ? ctx.almacenes : [];
      const guardado = Number(localStorage.getItem('pos_id_almacen') || 0);
      const existeGuardado = this.almacenes.some((a) => a.id_almacen === guardado);
      this.idAlmacen = existeGuardado
        ? guardado
        : ctx.almacen_default || this.almacenes[0]?.id_almacen || null;
      this.contextoListo = true;
      this.cargarCatalogoCotizacion();
      this.refrescar();
    });
  }

  /** Alcance del stock que se muestra. null = suma de todas las sedes. */
  private get alcanceStock(): number | null {
    return this.buscarTodasLasSedes ? null : this.idAlmacen;
  }

  /**
   * Trae el catálogo para mostrar stock. La proforma no depende de él para poder
   * cotizar: si falla o llega vacío, el buscador sigue consultando al servidor.
   *
   * Se conserva la intención del usuario (`forzar = false`, sin recargas de más);
   * solo se fuerza cuando la cache compartida con el POS quedó VACÍA, porque en ese
   * caso la cotización se quedaría sin productos durante todo el TTL.
   */
  private cargarCatalogoCotizacion(forzar = false): void {
    this.cargandoProductos = true;
    this.errorProductos = '';
    this.refrescar();

    const recargar = forzar || this.pv.catalogoVacio;
    this.pv.cargarCatalogo(recargar, this.alcanceStock).pipe(
      takeUntil(this.destruir$),
    ).subscribe({
      next: (lista) => {
        this.cargandoProductos = false;
        this.catalogoVacio = !Array.isArray(lista) || lista.length === 0;
        this.repetirBusqueda();
        this.refrescar();
      },
      error: (error) => {
        this.cargandoProductos = false;
        this.catalogoVacio = false;
        this.errorProductos = mensajeDeError(error, 'No se pudo cargar el stock de los productos');
        // El buscador no se cae con el catálogo: sigue contra el servidor.
        this.repetirBusqueda();
        this.refrescar();
      },
    });
  }

  /** Botón "Reintentar" del aviso de error: fuerza una recarga del catálogo. */
  reintentarCatalogo(): void {
    if (this.cargandoProductos) return;
    this.cargarCatalogoCotizacion(true);
  }

  cambiarAlmacen(valor: number | string): void {
    const id = Number(valor);
    if (!Number.isFinite(id) || id <= 0) return;
    this.idAlmacen = id;
    localStorage.setItem('pos_id_almacen', String(id));
    this.buscarTodasLasSedes = false;
    this.cargarCatalogoCotizacion();
  }

  cambiarAlcanceStock(valor: boolean): void {
    this.buscarTodasLasSedes = !!valor;
    this.cargarCatalogoCotizacion();
  }

  get nombreAlmacenDespacho(): string {
    if (this.soloLectura && this.cotizacionActual?.almacen_nombre) return this.cotizacionActual.almacen_nombre;
    const almacen = this.almacenes.find((a) => a.id_almacen === this.idAlmacen);
    return almacen ? `${almacen.nombre}${almacen.sucursal ? ` · ${almacen.sucursal}` : ''}` : 'Sin almacén';
  }

  /** Stock informativo de una línea/sugerencia. Nunca bloquea: la proforma no mueve inventario. */
  textoStock(valor: unknown): string {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) return 'Sin stock';
    return `Stock ${n}${this.buscarTodasLasSedes ? ' (todas las sedes)' : ''}`;
  }

  sinStock(valor: unknown): boolean {
    const n = Number(valor);
    return !Number.isFinite(n) || n <= 0;
  }

  /** Se escribió algo y no quedó ninguna sugerencia (ya terminó de buscar). */
  get busquedaSinResultados(): boolean {
    return !!this.textoProducto.trim() && !this.sugerenciasProd.length && !this.buscandoProd;
  }

  /**
   * Explica POR QUÉ no hay sugerencias. "Catálogo vacío" no puede verse igual que
   * "no hay coincidencias": son problemas distintos.
   */
  get mensajeSinResultados(): string {
    if (this.errorProductos) {
      return 'La búsqueda falló. Revise el aviso de arriba y reintente.';
    }
    if (this.origenSugerencias === 'servidor') {
      return `No se encontró ningún producto activo con “${this.textoProducto.trim()}”. ` +
        'Revise el nombre, el SKU o el código de barras.';
    }
    if (this.catalogoVacio) {
      return 'El catálogo llegó vacío. Se está buscando directo en el servidor; si sigue sin salir, ' +
        'reintente o revise que los productos estén activos.';
    }
    if (this.cargandoProductos) return 'Cargando el catálogo…';
    return 'No se encontró ningún producto activo con ese texto.';
  }

  /**
   * Corta a 12 sugerencias RESPETANDO el orden de relevancia que ya calcularon
   * `filtrarLocal` (código exacto → SKU exacto → parciales) o el backend.
   * No se reordena por stock: en una proforma el stock es solo informativo.
   */
  private productosVisibles(productos: ProductoVenta[]): ProductoVenta[] {
    return Array.isArray(productos) ? productos.slice(0, MAX_SUGERENCIAS) : [];
  }

  cargarLista(): void {
    this.cargandoLista = true;
    this.refrescar();
    this.api.listar().pipe(takeUntil(this.destruir$)).subscribe({
      next: (lista) => {
        this.lista = Array.isArray(lista) ? [...lista] : [];
        this.cargandoLista = false;
        this.refrescar();
      },
      error: (e) => {
        this.cargandoLista = false;
        this.refrescar();
        this.alerta.error(errorOperativo(e, 'No se pudieron cargar las cotizaciones'));
      },
    });
  }

  nueva(): void {
    this.modo = 'nueva';
    this.cotizacionActual = null;
    this.lineas = [];
    this.receptor = null;
    this.clienteNombreManual = '';
    this.telefono = '';
    this.observaciones = '';
    this.porcentajeIgv = 18;
    this.textoProducto = '';
    this.textoCliente = '';
    this.sugerenciasProd = [];
    this.origenSugerencias = 'ninguno';
    this.sugerenciasCli = [];
    this.ultimoDocumentoAuto = '';
    // Refresca el stock si el TTL venció; si sigue vigente el servicio devuelve la cache.
    if (this.contextoListo) this.cargarCatalogoCotizacion();
    this.refrescar();
  }

  /**
   * Copia productos y cliente de una cotización guardada a una NUEVA editable.
   * Una proforma guardada queda fijada (el backend no actualiza sus ítems), así que
   * esta es la forma de seguir agregando productos sin perder lo armado.
   */
  duplicarEnNueva(): void {
    if (!this.cotizacionActual || this.ocupado) return;
    const lineas: LineaCot[] = this.lineas.map((l) => ({
      id_producto: l.id_producto,
      descripcion: l.descripcion,
      sku: l.sku,
      cantidad: this.normalizarCantidad(l.cantidad),
      precio_unitario: l.precio_unitario,
      stock_disponible: l.stock_disponible,
    }));
    const receptor = this.receptor;
    const telefono = this.telefono;
    const observaciones = this.observaciones;

    this.nueva();
    this.lineas = lineas;
    this.receptor = receptor;
    this.clienteNombreManual = receptor?.denominacion || '';
    this.telefono = telefono;
    this.observaciones = observaciones;
    this.alerta.toast({
      type: 'info',
      title: 'Copia editable lista',
      message: 'Agregue o quite productos y guárdela para generar la nueva proforma.',
    });
    this.refrescar();
  }

  volverLista(): void {
    if (this.ocupado) return;
    this.modo = 'lista';
    this.cotizacionActual = null;
    this.cargarLista();
  }

  // ─── Búsquedas de producto y cliente ───────────────────────────────

  private escucharBusquedas(): void {
    this.buscarProd$
      .pipe(
        debounceTime(80),
        distinctUntilChanged(),
        // switchMap: una respuesta vieja no puede pisar la búsqueda que el usuario ve.
        switchMap((termino) => this.resolverSugerencias(termino)),
        takeUntil(this.destruir$),
      )
      .subscribe((resultado) => this.aplicarSugerencias(resultado));

    this.buscarCli$
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((termino) => {
          if (termino.trim().length < 2) return of([] as SugerenciaReceptor[]);
          if (this.esDocumentoExacto(termino)) return of([] as SugerenciaReceptor[]);
          return this.receptorSvc.sugerencias(termino).pipe(catchError(() => of([])));
        }),
        takeUntil(this.destruir$),
      )
      .subscribe((lista) => {
        this.sugerenciasCli = lista;
        this.refrescar();
      });

    this.documentoExacto$
      .pipe(
        debounceTime(280),
        distinctUntilChanged(),
        switchMap((documento) => {
          this.buscandoCliente = true;
          this.sugerenciasCli = [];
          this.refrescar();
          return this.receptorSvc.buscar(documento).pipe(
            catchError((error) => {
              this.buscandoCliente = false;
              this.ultimoDocumentoAuto = '';
              this.alerta.error({
                title: 'No se encontró el documento',
                message: mensajeDeError(error, 'Verifique el DNI o RUC e intente nuevamente'),
              });
              this.refrescar();
              return of(null as Receptor | null);
            }),
          );
        }),
        takeUntil(this.destruir$),
      )
      .subscribe((receptor) => {
        this.buscandoCliente = false;
        if (receptor) this.aplicarCliente(receptor);
        this.refrescar();
      });
  }

  alEscribirProducto(): void {
    this.errorProductos = '';
    this.sugerenciasProd = [];
    this.origenSugerencias = 'ninguno';
    this.buscarProd$.next(this.textoProducto);
  }

  alEnfocarProducto(): void {
    if (this.textoProducto.trim() && !this.sugerenciasProd.length && !this.buscandoProd) {
      this.buscarProd$.next(this.textoProducto);
    }
  }

  /**
   * Resuelve las sugerencias de un término.
   *
   * Regla de la proforma: el stock NUNCA decide qué productos se ven. Por eso, si el
   * catálogo en memoria (compartido con el POS) no devuelve nada — porque llegó vacío,
   * quedó desfasado o se cargó con otro alcance — se consulta al servidor en vez de
   * mostrar cero resultados.
   */
  private resolverSugerencias(termino: string): Observable<ResultadoBusqueda> {
    const t = (termino ?? '').trim();
    if (!t) return of({ lista: [] as ProductoVenta[], origen: 'ninguno' as const });

    if (this.pv.tieneCatalogo) {
      const locales = this.pv.filtrarLocal(t, MAX_SUGERENCIAS);
      if (locales.length) {
        return of({ lista: locales, origen: 'catalogo' as const });
      }
      // Sin coincidencias locales: se confirma contra el servidor antes de decir que no hay.
    }

    this.buscandoProd = true;
    this.refrescar();
    return this.pv.buscarProductos(t, MAX_SUGERENCIAS, this.alcanceStock).pipe(
      map((lista) => ({
        lista: Array.isArray(lista) ? lista : [],
        origen: 'servidor' as const,
      })),
      catchError((error) => {
        this.errorProductos = mensajeDeError(error, 'No se pudo buscar el producto');
        return of({ lista: [] as ProductoVenta[], origen: 'servidor' as const });
      }),
    );
  }

  private aplicarSugerencias({ lista, origen }: ResultadoBusqueda): void {
    this.sugerenciasProd = this.productosVisibles(lista);
    this.origenSugerencias = origen;
    this.buscandoProd = false;
    this.refrescar();
  }

  /**
   * Repite la búsqueda escrita sin pasar por el Subject (`distinctUntilChanged` la
   * bloquearía). Se usa tras recargar el catálogo o cambiar el alcance del stock.
   */
  private repetirBusqueda(): void {
    if (!this.textoProducto.trim()) return;
    this.resolverSugerencias(this.textoProducto).pipe(
      takeUntil(this.destruir$),
    ).subscribe((resultado) => this.aplicarSugerencias(resultado));
  }

  alEscribirCliente(): void {
    this.clienteNombreManual = this.textoCliente;
    if (this.esDocumentoExacto(this.textoCliente)) {
      const documento = this.textoCliente.replace(/\D/g, '');
      if (documento !== this.ultimoDocumentoAuto) {
        this.ultimoDocumentoAuto = documento;
        this.documentoExacto$.next(documento);
      }
      return;
    }
    this.ultimoDocumentoAuto = '';
    this.buscarCli$.next(this.textoCliente);
  }

  private esDocumentoExacto(texto: string): boolean {
    const limpio = texto.trim();
    return /^\d+$/.test(limpio) && (limpio.length === 8 || limpio.length === 11);
  }

  private aplicarCliente(receptor: Receptor): void {
    if (this.soloLectura) return;
    this.receptor = receptor;
    this.clienteNombreManual = receptor.denominacion || '';
    this.textoCliente = '';
    this.telefono = String(receptor.telefono || this.telefono || '').trim();
    this.sugerenciasCli = [];
    this.ultimoDocumentoAuto = '';
    this.refrescar();
  }

  agregarProducto(p: ProductoVenta): void {
    if (this.soloLectura) return;
    const existente = this.lineas.find((l) => l.id_producto === p.id_producto);
    if (existente) {
      existente.cantidad += 1;
    } else {
      this.lineas = [
        ...this.lineas,
        {
          id_producto: p.id_producto,
          descripcion: p.nombre,
          sku: p.sku || '',
          cantidad: 1,
          precio_unitario: Number(p.precio_final) || 0,
          stock_disponible: Number(p.stock_disponible) || 0,
        },
      ];
    }
    this.textoProducto = '';
    this.sugerenciasProd = [];
    this.origenSugerencias = 'ninguno';
    this.refrescar();
  }

  /** Permite usar lectores HID en la cotización igual que en el POS. */
  alPresionarEnProducto(evento: KeyboardEvent): void {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    if (this.escaneandoCodigo || this.soloLectura) return;

    const codigo = this.textoProducto.trim();
    if (!codigo) return;

    const local = this.pv.porCodigoLocal(codigo);
    if (local) {
      this.agregarProducto(local);
      this.alerta.toast({ type: 'success', title: local.nombre, timer: 1200 });
      return;
    }

    if (!this.pareceCodigoExacto(codigo)) {
      if (this.sugerenciasProd.length === 1) this.agregarProducto(this.sugerenciasProd[0]);
      return;
    }

    this.escaneandoCodigo = true;
    this.buscandoProd = true;
    this.refrescar();
    this.pv.porCodigoBarras(codigo, this.buscarTodasLasSedes ? null : this.idAlmacen).pipe(
      takeUntil(this.destruir$),
      catchError(() => of(null as ProductoVenta | null)),
    ).subscribe((producto) => {
      this.escaneandoCodigo = false;
      this.buscandoProd = false;
      if (producto) {
        this.agregarProducto(producto);
        this.alerta.toast({ type: 'success', title: producto.nombre, timer: 1200 });
      } else if (this.sugerenciasProd.length === 1) {
        this.agregarProducto(this.sugerenciasProd[0]);
      } else {
        this.alerta.toast({ type: 'warning', title: `No hay producto con el código ${codigo}` });
      }
      this.refrescar();
    });
  }

  private pareceCodigoExacto(texto: string): boolean {
    const t = texto.trim();
    if (!t || /\s/.test(t)) return false;
    if (/^\d{4,}$/.test(t)) return true;
    return /^[A-Za-z0-9][A-Za-z0-9\-_.]*$/.test(t) && /\d/.test(t);
  }

  /** Cantidad entera >= 1 (misma regla que el POS y la columna INTEGER). */
  private normalizarCantidad(valor: unknown): number {
    const n = Math.round(Number(valor));
    return Number.isFinite(n) && n >= 1 ? n : 1;
  }

  cambiarCantidad(linea: LineaCot, v: number | string): void {
    if (this.soloLectura) return;
    linea.cantidad = this.normalizarCantidad(v);
    this.refrescar();
  }

  /** Al salir del input, muestra el entero que realmente quedó (p. ej. 2.5 → 3). */
  sincronizarInputCantidad(input: HTMLInputElement, linea: LineaCot): void {
    const texto = String(linea.cantidad);
    if (input.value !== texto) input.value = texto;
  }

  quitarLinea(linea: LineaCot): void {
    if (this.soloLectura) return;
    this.lineas = this.lineas.filter((l) => l !== linea);
    this.refrescar();
  }

  elegirCliente(s: SugerenciaReceptor): void {
    this.sugerenciasCli = [];
    const consulta$ = s.tipo === 'empresa'
      ? this.receptorSvc.porEmpresa(s.id_empresa!)
      : this.receptorSvc.porCliente(s.id_cliente!);

    consulta$.pipe(takeUntil(this.destruir$)).subscribe({
      next: (r) => {
        this.aplicarCliente(r);
        this.refrescar();
      },
      error: (e) => this.alerta.error(errorOperativo(e)),
    });
  }

  quitarCliente(): void {
    if (this.soloLectura) return;
    this.receptor = null;
    this.textoCliente = '';
    this.clienteNombreManual = '';
    this.ultimoDocumentoAuto = '';
    this.refrescar();
  }

  // ─── Guardado (único punto para Guardar, PDF, Excel y WhatsApp) ────

  async guardar(): Promise<void> {
    if (this.cotizacionActual?.id_proforma) {
      this.alerta.toast({ type: 'info', title: 'La cotización ya está guardada. Cree una nueva para duplicarla.' });
      return;
    }
    await this.asegurarGuardada();
  }

  /**
   * Valida el formulario y arma el cuerpo del POST.
   * Devuelve null (y avisa al usuario) si falta algo.
   */
  private validarParaGuardar(): CrearCotizacionPayload | null {
    if (!this.lineas.length) {
      this.alerta.toast({ type: 'warning', title: 'Agregue al menos un producto' });
      return null;
    }
    const nombre = (this.receptor?.denominacion || this.clienteNombreManual || '').trim();
    if (!this.receptor?.id_cliente && !this.receptor?.id_empresa && !nombre) {
      this.alerta.toast({ type: 'warning', title: 'Indique cliente o un nombre' });
      return null;
    }
    const lineaInvalida = this.lineas.find((l) => !Number.isInteger(l.cantidad) || l.cantidad < 1);
    if (lineaInvalida) {
      this.alerta.toast({
        type: 'warning',
        title: `Cantidad inválida en "${lineaInvalida.descripcion}": use enteros de 1 o más`,
      });
      return null;
    }
    const dias = Math.round(Number(this.diasVigencia));
    if (!Number.isFinite(dias) || dias < 1 || dias > DIAS_VIGENCIA_MAX) {
      this.alerta.toast({ type: 'warning', title: `La vigencia debe ser de 1 a ${DIAS_VIGENCIA_MAX} días` });
      return null;
    }

    return {
      id_cliente: this.receptor?.id_cliente,
      id_empresa: this.receptor?.id_empresa,
      cliente_nombre: nombre || undefined,
      telefono_envio: String(this.telefono ?? '').trim() || undefined,
      id_almacen: this.idAlmacen ?? undefined,
      observaciones: String(this.observaciones ?? '').trim() || undefined,
      dias_vigencia: dias,
      items: this.lineas.map((l) => ({
        id_producto: l.id_producto,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        descripcion: l.descripcion,
        sku: l.sku,
      })),
    };
  }

  /**
   * Devuelve la cotización guardada. Si aún no lo está, valida, (opcionalmente) confirma
   * y la crea. Devuelve null si faltan datos, el usuario cancela o el API falla
   * (el aviso ya se mostró). Nunca crea dos veces la misma cotización.
   */
  private async asegurarGuardada(
    confirmacion?: { title: string; message: string; confirmText: string },
  ): Promise<Cotizacion | null> {
    if (this.cotizacionActual?.id_proforma) return this.cotizacionActual;
    if (this.guardadoEnCurso) return this.guardadoEnCurso;

    const payload = this.validarParaGuardar();
    if (!payload) return null;

    if (confirmacion) {
      const respuesta = await this.alerta.confirm({ ...confirmacion, cancelText: 'Cancelar' });
      if (!respuesta.isConfirmed || this.destruido) return null;
      // Mientras el diálogo estaba abierto pudo terminar otro guardado.
      if (this.cotizacionActual?.id_proforma) return this.cotizacionActual;
      if (this.guardadoEnCurso) return this.guardadoEnCurso;
    }

    const guardado = this.crearEnServidor(payload);
    this.guardadoEnCurso = guardado;
    try {
      return await guardado;
    } finally {
      if (this.guardadoEnCurso === guardado) this.guardadoEnCurso = null;
    }
  }

  private async crearEnServidor(payload: CrearCotizacionPayload): Promise<Cotizacion | null> {
    this.guardando = true;
    this.refrescar();
    try {
      const cot = await this.aPromesa(this.api.crear(payload));
      if (!cot?.id_proforma) {
        throw errorLocal('El servidor no confirmó la cotización guardada. Revise la lista antes de reintentar.', 'COTIZACION_ERROR_INTERNO');
      }
      const preciosCambiados = this.sincronizarConServidor(cot);
      const codigo = cot.codigo || `Cotización #${cot.id_proforma}`;
      this.alerta.toast(
        preciosCambiados
          ? {
              type: 'info',
              title: `${codigo} guardada`,
              message: `Se aplicó el precio vigente del catálogo en ${preciosCambiados} producto(s).`,
              timer: 5000,
            }
          : { type: 'success', title: `${codigo} guardada` },
      );
      return cot;
    } catch (e) {
      if (!this.destruido) this.alerta.error(errorOperativo(e, 'No se pudo guardar la cotización'));
      return null;
    } finally {
      this.guardando = false;
      this.refrescar();
    }
  }

  /**
   * Deja la vista igual a lo que guardó el backend (precios del catálogo, subtotales y totales).
   * Devuelve cuántas líneas cambiaron de precio respecto a lo que se veía en pantalla.
   */
  private sincronizarConServidor(cot: Cotizacion): number {
    const locales = new Map(this.lineas.map((l) => [l.id_producto, l]));
    let cambios = 0;
    if (Array.isArray(cot.items) && cot.items.length) {
      this.lineas = this.lineasDesdeItems(cot.items, locales);
      for (const linea of this.lineas) {
        const local = locales.get(linea.id_producto);
        if (local && Math.abs(local.precio_unitario - linea.precio_unitario) >= 0.005) cambios += 1;
      }
    }
    this.cotizacionActual = cot;
    this.porcentajeIgv = this.igvDe(cot);
    this.refrescar();
    return cambios;
  }

  private lineasDesdeItems(items: CotizacionItem[], locales = new Map<number, LineaCot>()): LineaCot[] {
    return items.map((i) => {
      const id = Number(i.id_producto);
      const local = locales.get(id);
      return {
        id_producto: id,
        descripcion: i.descripcion || local?.descripcion || 'Producto',
        sku: i.sku || local?.sku || '',
        cantidad: this.normalizarCantidad(i.cantidad),
        precio_unitario: redondear2(Number(i.precio_unitario) || 0),
        subtotal: numeroOpcional(i.subtotal),
        stock_disponible: local?.stock_disponible ?? 0,
      };
    });
  }

  private igvDe(cot: Cotizacion): number {
    const p = numeroOpcional(cot.porcentaje_igv);
    return p !== undefined && p >= 0 ? p : 18;
  }

  abrirCotizacion(c: Cotizacion): void {
    if (this.abriendoId) return;
    this.abriendoId = c.id_proforma;
    this.refrescar();
    this.api.porId(c.id_proforma).pipe(takeUntil(this.destruir$)).subscribe({
      next: (cot) => {
        this.abriendoId = null;
        this.modo = 'nueva';
        this.textoProducto = '';
        this.textoCliente = '';
        this.sugerenciasProd = [];
        this.origenSugerencias = 'ninguno';
        this.sugerenciasCli = [];
        this.lineas = this.lineasDesdeItems(Array.isArray(cot.items) ? cot.items : []);
        this.cotizacionActual = cot;
        this.porcentajeIgv = this.igvDe(cot);
        this.clienteNombreManual = cot.cliente_nombre || '';
        this.telefono = cot.telefono_envio || '';
        this.observaciones = cot.observaciones || '';
        this.receptor = cot.id_cliente || cot.id_empresa
          ? {
              origen: 'base',
              tipo: cot.id_empresa ? 'empresa' : 'cliente',
              id_cliente: cot.id_cliente ?? undefined,
              id_empresa: cot.id_empresa ?? undefined,
              tipo_documento: cot.id_empresa ? 6 : 1,
              numero_documento: cot.cliente_documento || '',
              denominacion: cot.cliente_nombre || '',
              direccion: cot.cliente_direccion || '',
              email: '',
              telefono: '',
              admite_factura: !!cot.id_empresa,
            }
          : null;
        this.completarFichaCliente(cot);
        this.refrescar();
      },
      error: (e) => {
        this.abriendoId = null;
        this.refrescar();
        this.alerta.error(errorOperativo(e, 'No se pudo abrir la cotización'));
      },
    });
  }

  /**
   * Trae la ficha real del cliente/empresa (documento y celular registrado) para no
   * preguntar de más al enviar por WhatsApp. Si falla, se queda con lo de la cotización.
   */
  private completarFichaCliente(cot: Cotizacion): void {
    const consulta$ = cot.id_empresa
      ? this.receptorSvc.porEmpresa(Number(cot.id_empresa))
      : cot.id_cliente
        ? this.receptorSvc.porCliente(Number(cot.id_cliente))
        : null;
    if (!consulta$) return;
    consulta$.pipe(
      takeUntil(this.destruir$),
      catchError(() => of(null as Receptor | null)),
    ).subscribe((ficha) => {
      if (!ficha || this.cotizacionActual?.id_proforma !== cot.id_proforma || !this.receptor) return;
      this.receptor = {
        ...ficha,
        // En pantalla se respeta el nombre con el que se guardó la cotización.
        denominacion: cot.cliente_nombre || ficha.denominacion,
        numero_documento: ficha.numero_documento || this.receptor.numero_documento,
      };
      this.refrescar();
    });
  }

  aprobar(): void {
    const id = this.cotizacionActual?.id_proforma;
    if (!id || this.cotizacionActual?.estado === 'convertida' || this.cotizacionActual?.estado === 'anulada') return;
    if (!this.cotizacionActual?.id_almacen && !this.idAlmacen) {
      this.alerta.toast({ type: 'warning', title: 'Seleccione el almacén de despacho' });
      return;
    }
    if (this.cotizacionVencida) {
      this.alerta.toast({ type: 'warning', title: 'La cotización está vencida. Cree una nueva con vigencia actual.' });
      return;
    }

    this.alerta.confirm({
      title: '¿Aprobar esta cotización?',
      message: 'La aprobación no descuenta stock. El inventario se actualizará recién al registrar la venta.',
      confirmText: 'Aprobar',
    }).then((resultado) => {
      if (!resultado.isConfirmed) return;
      this.api.marcar(id, { estado: 'aprobada' }).pipe(takeUntil(this.destruir$)).subscribe({
        next: (cot) => {
          if (this.cotizacionActual?.id_proforma === id) this.cotizacionActual = cot;
          this.alerta.toast({ type: 'success', title: 'Cotización aprobada' });
          this.cargarLista();
          this.refrescar();
        },
        error: (e) => this.alerta.error(errorOperativo(e, 'No se pudo aprobar la cotización')),
      });
    });
  }

  anular(cotizacion = this.cotizacionActual): void {
    const id = cotizacion?.id_proforma;
    if (!id || cotizacion?.estado === 'convertida' || cotizacion?.estado === 'anulada') return;

    this.alerta.confirm({
      title: '¿Anular esta cotización?',
      message: 'Se conservará en el historial como anulada y no afectará el stock.',
      confirmText: 'Sí, anular',
      cancelText: 'Cancelar',
    }).then((resultado) => {
      if (!resultado.isConfirmed) return;
      this.api.marcar(id, { estado: 'anulada' }).pipe(takeUntil(this.destruir$)).subscribe({
        next: (actualizada) => {
          // Desde la lista no hay cotización abierta: no se pisa el formulario.
          if (this.cotizacionActual?.id_proforma === id) this.cotizacionActual = actualizada;
          this.alerta.toast({ type: 'success', title: 'Cotización anulada' });
          this.cargarLista();
          this.refrescar();
        },
        error: (e) => this.alerta.error(errorOperativo(e, 'No se pudo anular la cotización')),
      });
    });
  }

  // ─── PDF / Excel (generados por el backend) ────────────────────────

  exportarPdf(): Promise<void> {
    return this.exportarDocumento('pdf');
  }

  exportarExcel(): Promise<void> {
    return this.exportarDocumento('excel');
  }

  private generando(tipo: TipoDocumento): boolean {
    return tipo === 'pdf' ? this.generandoPdf : this.generandoExcel;
  }

  private marcarGenerando(tipo: TipoDocumento, valor: boolean): void {
    if (tipo === 'pdf') this.generandoPdf = valor;
    else this.generandoExcel = valor;
    this.refrescar();
  }

  private async exportarDocumento(tipo: TipoDocumento): Promise<void> {
    const { etiqueta } = DOCUMENTOS[tipo];
    if (this.ocupado) return;
    if (!this.cotizacionActual?.id_proforma && !this.lineas.length) {
      this.alerta.toast({ type: 'warning', title: 'Agregue al menos un producto' });
      return;
    }

    this.marcarGenerando(tipo, true);
    try {
      const cot = await this.asegurarGuardada({
        title: `¿Guardar y generar ${etiqueta}?`,
        message: `La cotización se guardará con los precios vigentes del catálogo y luego se descargará el ${etiqueta}.`,
        confirmText: `Guardar y generar ${etiqueta}`,
      });
      if (!cot) return;
      const blob = await this.obtenerDocumento(cot.id_proforma, tipo);
      const nombre = this.nombreArchivo(cot, tipo);
      this.descargarBlob(blob, nombre);
      this.alerta.toast({ type: 'success', title: `${etiqueta} descargado`, message: nombre });
    } catch (e) {
      await this.mostrarErrorDocumento(e, `No se pudo generar el ${etiqueta} de la cotización`);
    } finally {
      this.marcarGenerando(tipo, false);
    }
  }

  descargandoFila(c: Cotizacion, tipo: TipoDocumento): boolean {
    return this.descargasLista.has(`${c.id_proforma}:${tipo}`);
  }

  /** Descarga PDF/Excel de una cotización guardada directamente desde la lista. */
  async descargarDesdeLista(c: Cotizacion, tipo: TipoDocumento): Promise<void> {
    const clave = `${c.id_proforma}:${tipo}`;
    if (!c?.id_proforma || this.descargasLista.has(clave)) return;
    const { etiqueta } = DOCUMENTOS[tipo];

    this.descargasLista.add(clave);
    this.refrescar();
    try {
      const blob = await this.obtenerDocumento(c.id_proforma, tipo);
      const nombre = this.nombreArchivo(c, tipo);
      this.descargarBlob(blob, nombre);
      this.alerta.toast({ type: 'success', title: `${etiqueta} descargado`, message: nombre });
    } catch (e) {
      await this.mostrarErrorDocumento(e, `No se pudo generar el ${etiqueta} de la cotización`);
    } finally {
      this.descargasLista.delete(clave);
      this.refrescar();
    }
  }

  /** Pide el archivo al backend y verifica que realmente sea un archivo. */
  private async obtenerDocumento(id: number, tipo: TipoDocumento): Promise<Blob> {
    const { etiqueta } = DOCUMENTOS[tipo];
    const blob = await this.aPromesa(tipo === 'pdf' ? this.api.pdf(id) : this.api.excel(id));
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw errorLocal(`El servidor devolvió el ${etiqueta} vacío. Reintente.`);
    }
    const mime = (blob.type || '').toLowerCase();
    if (mime.includes('json') || mime.includes('text/html')) {
      throw errorLocal(`El servidor no devolvió un ${etiqueta} válido. Reintente.`);
    }
    return blob;
  }

  /** Proforma-<codigo>.pdf / .xlsx (lo arma el frontend; no depende de Content-Disposition). */
  private nombreArchivo(cot: Cotizacion, tipo: TipoDocumento): string {
    const codigo = (cot.codigo || `COT-${cot.id_proforma}`).trim().replace(/[^\w.-]+/g, '_');
    return `Proforma-${codigo}.${DOCUMENTOS[tipo].extension}`;
  }

  private descargarBlob(blob: Blob, nombre: string): void {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    enlace.rel = 'noopener';
    enlace.style.display = 'none';
    document.body.appendChild(enlace);
    try {
      enlace.click();
    } finally {
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), REVOCAR_URL_MS);
    }
  }

  /** Los errores de peticiones blob llegan como Blob: se leen antes de mostrarlos. */
  private async mostrarErrorDocumento(error: unknown, porDefecto: string, detalleHtml = ''): Promise<void> {
    if (this.destruido) return;
    const normalizado = await normalizarErrorBlob(error);
    if (this.destruido) return;
    const aviso = errorOperativo(normalizado, porDefecto);
    this.alerta.error(detalleHtml ? { ...aviso, message: `${aviso.message}<br><br>${detalleHtml}` } : aviso);
  }

  // ─── WhatsApp + proforma PDF ───────────────────────────────────────

  /**
   * Guarda si hace falta, descarga el PDF real del backend, registra el envío y abre wa.me.
   *
   * Los navegadores bloquean window.open después de esperas de red, así que la pestaña se
   * abre en blanco dentro del gesto del usuario: en el mismo clic si no hay preguntas, o
   * justo al aceptar la última pregunta (ese clic también es un gesto). Se abre DESPUÉS de
   * las preguntas para no taparlas. Si algo falla o se cancela, la pestaña se cierra.
   */
  async enviarWhatsapp(): Promise<void> {
    if (this.ocupado) return;
    if (!this.telefonoOk) {
      this.alerta.toast({ type: 'warning', title: 'Ingrese un celular válido (9 dígitos)' });
      return;
    }
    if (!this.lineas.length && !this.cotizacionActual?.id_proforma) {
      this.alerta.toast({ type: 'warning', title: 'Agregue al menos un producto' });
      return;
    }
    if (this.cotizacionActual?.estado === 'anulada') {
      this.alerta.toast({ type: 'warning', title: 'La cotización está anulada; cree una nueva para enviarla' });
      return;
    }
    const yaGuardada = !!this.cotizacionActual?.id_proforma;
    if (!yaGuardada && !this.validarParaGuardar()) return;

    const telefono = String(this.telefono ?? '').trim();
    const preguntarFicha = this.debeOfrecerActualizarFicha();

    let pestana: Window | null = null;
    let pestanaUsada = false;
    this.enviandoWa = true;
    this.refrescar();
    try {
      // Sin preguntas: la pestaña se abre en este mismo clic (antes de cualquier await).
      if (!preguntarFicha && yaGuardada) pestana = this.abrirPestanaEspera();

      const actualizarFicha = preguntarFicha ? await this.preguntarActualizarFicha(telefono) : false;
      if (this.destruido) return;
      if (!yaGuardada) {
        const respuesta = await this.alerta.confirm({
          title: '¿Guardar y enviar por WhatsApp?',
          message: 'Se guardará la cotización, se descargará la proforma en PDF y se abrirá el chat del cliente para adjuntarla.',
          confirmText: 'Guardar y enviar',
          cancelText: 'Cancelar',
        });
        if (!respuesta.isConfirmed || this.destruido) return;
      }
      // Con preguntas: se abre al aceptar la última (antes de las esperas de red).
      if (!pestana) pestana = this.abrirPestanaEspera();

      const avisos: string[] = [];
      if (actualizarFicha) {
        const aviso = await this.actualizarTelefonoFicha(telefono);
        if (aviso) avisos.push(aviso);
      }

      const cot = await this.asegurarGuardada();
      if (!cot || this.destruido) return;
      if (pestana?.closed) pestana = null;

      const nombrePdf = this.nombreArchivo(cot, 'pdf');
      try {
        const pdf = await this.obtenerDocumento(cot.id_proforma, 'pdf');
        this.descargarBlob(pdf, nombrePdf);
      } catch (e) {
        // Sin PDF no se abre el chat: el mensaje dice "adjunto la proforma" y no habría adjunto.
        this.cerrarPestana(pestana);
        await this.mostrarErrorDocumento(
          e,
          'No se pudo generar el PDF de la proforma',
          `<small>No se abrió WhatsApp para no enviar el mensaje sin la proforma. La cotización ` +
            `<strong>${escapeHtmlAlerta(cot.codigo || `#${cot.id_proforma}`)}</strong> sí quedó guardada: ` +
            `reintente con “WhatsApp + proforma”.</small>`,
        );
        return;
      }

      let url: string | null = null;
      try {
        const r = await this.aPromesa(
          this.api.enviarWhatsapp({ id_proforma: cot.id_proforma, telefono, solo_wa_me: true }),
        );
        url = r?.wa_me_url && URL_WHATSAPP_SEGURA.test(r.wa_me_url)
          ? r.wa_me_url
          : urlWhatsappCliente(telefono, r?.texto || this.armarTextoLocal(cot));
        this.marcarEnviadaLocal(cot.id_proforma, telefono);
      } catch (e) {
        if (this.destruido) return;
        // El PDF ya está descargado: se abre el chat igual con el texto armado aquí.
        url = urlWhatsappCliente(telefono, this.armarTextoLocal(cot));
        avisos.push(
          `No se pudo registrar el envío en el sistema (${escapeHtmlAlerta(
            mensajeDeError(e, 'error de conexión'),
          )}). La cotización seguirá como “${escapeHtmlAlerta(cot.estado)}”.`,
        );
      }

      if (!url) {
        this.cerrarPestana(pestana);
        this.alerta.error({ title: 'Teléfono inválido', message: 'Revise el celular del cliente (9 dígitos).' });
        return;
      }

      pestanaUsada = this.abrirUrlWhatsapp(pestana, url);
      let enlaceManual = '';
      if (!pestanaUsada) {
        const copiado = await this.copiarAlPortapapeles(url);
        enlaceManual =
          `<p style="margin-top:12px">El navegador bloqueó la ventana de WhatsApp.` +
          `${copiado ? ' El enlace se copió al portapapeles.' : ''} ` +
          `<a href="${escapeHtmlAlerta(url)}" target="_blank" rel="noopener noreferrer">Abrir chat de WhatsApp</a></p>`;
      }

      this.cargarLista();
      if (this.destruido) return;
      const pasos = this.pasosAdjuntarHtml(nombrePdf, pestanaUsada);
      if (avisos.length) {
        void this.alerta.warning({
          title: 'Chat listo, revise los avisos',
          message: `${avisos.map((a) => `<p>${a}</p>`).join('')}${pasos}${enlaceManual}`,
          allowHtml: true,
          confirmText: 'Entendido',
        });
      } else {
        void this.alerta.info({
          title: 'Proforma lista para WhatsApp',
          message: `${pasos}${enlaceManual}`,
          allowHtml: true,
          confirmText: 'Entendido',
        });
      }
    } catch (e) {
      this.cerrarPestana(pestana);
      if (!this.destruido) {
        this.alerta.error(errorOperativo(e, 'No se pudo preparar el envío por WhatsApp'));
      }
    } finally {
      if (!pestanaUsada) this.cerrarPestana(pestana);
      this.enviandoWa = false;
      this.refrescar();
    }
  }

  private pasosAdjuntarHtml(nombrePdf: string, chatAbierto: boolean): string {
    return (
      '<ol style="text-align:left;margin:8px 0 0;padding-left:20px;line-height:1.6">' +
      `<li>Se descargó <strong>${escapeHtmlAlerta(nombrePdf)}</strong>.</li>` +
      `<li>${chatAbierto ? 'Se abrió' : 'Abra'} el chat del cliente con el detalle y el total.</li>` +
      '<li>En WhatsApp: clip → Documento → elija el PDF descargado → Enviar.</li>' +
      '</ol>'
    );
  }

  /** Pestaña en blanco abierta dentro del gesto del usuario (se navega a wa.me al final). */
  private abrirPestanaEspera(): Window | null {
    let w: Window | null = null;
    try {
      w = window.open('', '_blank');
    } catch {
      return null;
    }
    if (!w) return null;
    try {
      w.opener = null;
      w.document.title = 'Preparando WhatsApp…';
      if (w.document.body) {
        w.document.body.style.cssText =
          'font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#444';
        w.document.body.textContent = 'Preparando la proforma para WhatsApp…';
      }
    } catch { /* la pestaña sigue sirviendo aunque no se pueda escribir en ella */ }
    return w;
  }

  private abrirUrlWhatsapp(pestana: Window | null, url: string): boolean {
    if (pestana && !pestana.closed) {
      try {
        pestana.location.href = url;
        return true;
      } catch { /* se intenta abrir una nueva */ }
    }
    try {
      // Sin 'noopener': con esa bandera window.open siempre devuelve null y no se sabría si abrió.
      const nueva = window.open(url, '_blank');
      if (nueva) {
        try { nueva.opener = null; } catch { /* ya es de otro origen */ }
        // No dejar la pestaña de espera colgada con el "Preparando WhatsApp…".
        if (nueva !== pestana) this.cerrarPestana(pestana);
        return true;
      }
    } catch { /* bloqueada */ }
    return false;
  }

  private cerrarPestana(pestana: Window | null): void {
    try {
      if (pestana && !pestana.closed) pestana.close();
    } catch { /* ya cerrada */ }
  }

  private async copiarAlPortapapeles(texto: string): Promise<boolean> {
    try {
      if (!navigator.clipboard?.writeText) return false;
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      return false;
    }
  }

  private marcarEnviadaLocal(id: number, telefono: string): void {
    const actual = this.cotizacionActual;
    if (!actual || actual.id_proforma !== id) return;
    this.cotizacionActual = {
      ...actual,
      estado: actual.estado === 'borrador' ? 'enviada' : actual.estado,
      telefono_envio: soloDigitos(telefono),
      enviada_wa_en: new Date().toISOString(),
    };
    this.refrescar();
  }

  /** true si el celular de envío difiere del registrado en la ficha del cliente/empresa. */
  private debeOfrecerActualizarFicha(): boolean {
    if (!this.receptor?.id_cliente && !this.receptor?.id_empresa) return false;
    const ficha = soloDigitos(this.receptor?.telefono);
    const envio = soloDigitos(this.telefono);
    if (!envio) return false;
    const mismos =
      ficha === envio ||
      (ficha.length >= 9 && envio.endsWith(ficha.slice(-9))) ||
      (envio.length >= 9 && ficha.endsWith(envio.slice(-9)));
    return !(mismos && ficha);
  }

  /** Pregunta si guardar el celular en la ficha (no obliga: "Solo este envío" sigue igual). */
  private async preguntarActualizarFicha(telefono: string): Promise<boolean> {
    const ficha = soloDigitos(this.receptor?.telefono);
    const envio = soloDigitos(telefono);
    const r = await this.alerta.confirm({
      title: ficha ? '¿Actualizar celular en la ficha?' : '¿Guardar este celular en la ficha?',
      message: ficha
        ? `Ficha: ${ficha}. Este envío: ${envio}. Así queda listo para próximas cotizaciones.`
        : `Se guardará ${envio} en el cliente/empresa.`,
      confirmText: 'Sí, actualizar ficha',
      cancelText: 'Solo este envío',
    });
    return !!r.isConfirmed;
  }

  /** Actualiza el celular en la ficha. Devuelve un aviso (HTML escapado) si falla; no corta el envío. */
  private async actualizarTelefonoFicha(telefono: string): Promise<string | null> {
    const idCli = this.receptor?.id_cliente;
    const idEmp = this.receptor?.id_empresa;
    if (!idCli && !idEmp) return null;
    try {
      await this.aPromesa<unknown>(
        idCli
          ? this.receptorSvc.actualizarCliente(idCli, { telefono })
          : this.receptorSvc.actualizarEmpresa(idEmp!, { telefonos: telefono }),
      );
      if (this.receptor) this.receptor = { ...this.receptor, telefono };
      this.refrescar();
      return null;
    } catch (e) {
      return `No se pudo actualizar el celular en la ficha (${escapeHtmlAlerta(
        mensajeDeError(e, 'error de conexión'),
      )}); el envío siguió igual.`;
    }
  }

  /**
   * Texto de respaldo si el backend no pudo armar el mensaje. Mismo formato que el del
   * servidor (S/ 1,234.50 y dd/mm/aaaa) para que el cliente lea lo mismo en el chat y en el PDF.
   */
  private armarTextoLocal(cot: Cotizacion): string {
    const codigo = cot.codigo || `COT-${cot.id_proforma}`;
    const nombre = (cot.cliente_nombre || this.receptor?.denominacion || this.clienteNombreManual || '')
      .replace(/[*~]/g, '')
      .trim();
    const esEmpresa = !!cot.id_empresa || soloDigitos(cot.cliente_documento).length === 11;
    const saludo = !nombre
      ? 'Estimado cliente:'
      : esEmpresa ? `Estimados señores de ${nombre}:` : `Estimado(a) ${nombre}:`;
    const items = Array.isArray(cot.items) && cot.items.length
      ? this.lineasDesdeItems(cot.items)
      : this.lineas;
    const detalle = items
      .slice(0, MAX_ITEMS_TEXTO_WA)
      .map((l) => `• ${this.recortarTexto(l.descripcion, 56)} × ${l.cantidad} — ${this.soles(this.subtotalLinea(l))}`);
    if (items.length > MAX_ITEMS_TEXTO_WA) {
      detalle.push(`… y ${items.length - MAX_ITEMS_TEXTO_WA} ítem(s) más (ver detalle en el PDF)`);
    }
    const total = numeroOpcional(cot.total) ?? this.total;

    return [
      saludo,
      '',
      `Le compartimos la proforma *${codigo}*:`,
      '',
      ...detalle,
      '',
      `*TOTAL: ${this.soles(total)}* (IGV incluido)`,
      cot.valida_hasta ? `Oferta válida hasta el ${this.fechaCorta(cot.valida_hasta)}.` : null,
      '',
      'El detalle completo va en el PDF adjunto.',
      'Para confirmar su pedido, responda a este mensaje.',
    ]
      .filter((x): x is string => x !== null)
      .join('\n');
  }

  /** "S/ 1,234.50" (misma forma que imprimen el PDF y el Excel). */
  private soles(valor: number): string {
    return `S/ ${redondear2(valor).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private recortarTexto(texto: string, largo: number): string {
    const limpio = String(texto ?? '').replace(/[*~]/g, '').replace(/\s+/g, ' ').trim() || 'Producto';
    return limpio.length <= largo ? limpio : `${limpio.slice(0, largo - 1).trimEnd()}…`;
  }

  // ─── Otros ─────────────────────────────────────────────────────────

  pasarAVenta(): void {
    const id = this.cotizacionActual?.id_proforma;
    if (!id) {
      this.alerta.toast({ type: 'warning', title: 'Guarde la cotización antes de pasar a venta' });
      return;
    }
    if (this.cotizacionActual?.estado === 'convertida') {
      this.alerta.toast({ type: 'warning', title: 'Esta cotización ya fue convertida' });
      return;
    }
    if (this.cotizacionActual?.estado !== 'aprobada') {
      this.alerta.toast({ type: 'warning', title: 'Apruebe la cotización antes de pasarla a venta' });
      return;
    }
    void this.router.navigate(['/dashboard/mantenimiento/ventas'], {
      queryParams: { cotizacion: id },
    });
  }

  estadoClase(estado: string): string {
    if (estado === 'convertida') return 'adm-insignia--exito';
    if (estado === 'aprobada') return 'adm-insignia--exito';
    if (estado === 'enviada') return 'adm-insignia--info';
    if (estado === 'anulada') return 'adm-insignia--peligro';
    return 'adm-insignia--neutra';
  }

  identificar(_i: number, c: Cotizacion): number {
    return c.id_proforma;
  }

  identificarLinea(_i: number, l: LineaCot): number {
    return l.id_producto;
  }
}
