import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { EstadoPedido, Pedido, PedidoEstado, PedidoItem } from '../../../../store/models/tienda.models';
import { ColumnaOrdenable, OrdenMovilComponent } from '../../../../shared/components/orden-movil/orden-movil.component';
import { PiePaginacionComponent } from '../../../../shared/components/pie-paginacion/pie-paginacion.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { ColumnaCsv, exportarCsv, fechaCsv } from '../../../../shared/utils/exportar-csv';
import { EscritorFiltrosUrl, EsquemaFiltros, leerFiltros } from '../../../../shared/utils/filtros-url';
import {
  EstadoOrden, alternarOrden, ariaSort, guardarOrden, iconoOrden, leerOrdenGuardado, ordenarLista,
} from '../../../../shared/utils/orden-lista';
import { PaginaLocal, guardarFilasPorPagina, leerFilasPorPagina, paginar } from '../../../../shared/utils/paginacion-local';
import { NotificationService } from '../../../../shared/services/notification.service';
import { mensajeDeError } from '../../../service/api-base.service';
import { PedidoAdminService, pedidoCancelable, siguienteEstadoPedido } from '../../../service/pedido-admin.service';

type FiltroEstado = '' | EstadoPedido;
type TonoInsignia = 'aviso' | 'primaria' | 'info' | 'exito' | 'neutra';

interface MetaEstado {
  etiqueta: string;
  /** Plural del chip de filtro. */
  chip: string;
  tono: TonoInsignia;
  icono: string;
}

/** Cómo se ve cada estado: pendiente ámbar, pagado oro, preparando y enviado info, entregado dinero, cancelado neutro. */
export const META_ESTADO: Record<EstadoPedido, MetaEstado> = {
  pendiente: { etiqueta: 'Pendiente', chip: 'Pendientes', tono: 'aviso', icono: 'bi-hourglass-split' },
  pagado: { etiqueta: 'Pagado', chip: 'Pagados', tono: 'primaria', icono: 'bi-cash-coin' },
  preparando: { etiqueta: 'Preparando', chip: 'Preparando', tono: 'info', icono: 'bi-box-seam' },
  enviado: { etiqueta: 'Enviado', chip: 'Enviados', tono: 'info', icono: 'bi-truck' },
  entregado: { etiqueta: 'Entregado', chip: 'Entregados', tono: 'exito', icono: 'bi-bag-check' },
  cancelado: { etiqueta: 'Cancelado', chip: 'Cancelados', tono: 'neutra', icono: 'bi-x-circle' },
};

/** Orden de los chips: el flujo y, al final, los cancelados. */
const ORDEN_CHIPS: EstadoPedido[] = ['pendiente', 'pagado', 'preparando', 'enviado', 'entregado', 'cancelado'];

/** Qué se guarda en la URL: enlace compartible y filtros que sobreviven a F5. */
const ESQUEMA_URL: EsquemaFiltros = {
  q: { tipo: 'texto' },
  estado: { tipo: 'opcion', opciones: ORDEN_CHIPS, defecto: '' },
};

const COLUMNAS_ORDEN: ColumnaOrdenable[] = [
  { clave: 'codigo', titulo: 'Pedido', tipo: 'texto' },
  { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
  { clave: 'cliente', titulo: 'Cliente', tipo: 'texto' },
  { clave: 'total', titulo: 'Total', tipo: 'numero' },
  { clave: 'estado', titulo: 'Estado', tipo: 'flujo' },
];

/** Sin elegir columna: los más recientes primero (como siempre). */
const ORDEN_INICIAL: EstadoOrden = { clave: 'fecha', dir: 'desc' };

function minusculas(texto: unknown): string {
  return String(texto ?? '').toLowerCase();
}

/**
 * Pedidos de la tienda web vistos desde el panel: lista con chips de estado y ficha lateral
 * con detalle, historial y las acciones del flujo (confirmar pago, avanzar, cancelar).
 * El servidor valida cada transición; aquí solo se ofrece la que corresponde al estado.
 */
@Component({
  selector: 'app-pedidos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, PiePaginacionComponent, OrdenMovilComponent],
  templateUrl: './pedidos.component.html',
  styleUrl: './pedidos.component.css',
})
export class PedidosComponent implements OnInit {
  pedidos: Pedido[] = [];
  cargando = false;
  /** La última carga falló (para mostrar el estado de error en pantalla). */
  errorCarga = false;

  // Los filtros son propiedades con setter: cambiarlos vuelve a la página 1 y los deja en la URL.
  private filtroEst: FiltroEstado = '';
  private filtroTexto = '';

  get filtroEstado(): FiltroEstado { return this.filtroEst; }
  set filtroEstado(valor: FiltroEstado) {
    if (valor === this.filtroEst) return;
    this.filtroEst = valor;
    this.alCambiarFiltros(false);
  }

  get filtro(): string { return this.filtroTexto; }
  set filtro(valor: string) {
    if (valor === this.filtroTexto) return;
    this.filtroTexto = valor;
    this.alCambiarFiltros(true);
  }

  /** Orden de la tabla; se recuerda mientras la pestaña siga abierta. */
  orden: EstadoOrden = this.ordenGuardado();
  readonly columnasOrden = COLUMNAS_ORDEN;
  pagina = 1;
  porPagina = leerFilasPorPagina();

  /** Ficha lateral abierta con este pedido. */
  seleccionado: Pedido | null = null;
  panelAbierto = false;
  /** Hay una acción (confirmar, avanzar, cancelar) en curso: bloquea los botones. */
  procesando = false;
  /** Fila recién actualizada (resalta un instante). */
  idDestacado: number | null = null;

  /** Campos de la ficha: se piden junto al paso que corresponde y son opcionales. */
  referencia = '';
  comentario = '';

  readonly meta = META_ESTADO;
  readonly chips = ORDEN_CHIPS;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly urlFiltros = new EscritorFiltrosUrl(this.router, this.route, ESQUEMA_URL);
  private memoFiltrados?: { pedidos: Pedido[]; estado: FiltroEstado; texto: string; orden: EstadoOrden; resultado: Pedido[] };
  private memoPagina?: { lista: Pedido[]; pagina: number; porPagina: number; resultado: PaginaLocal<Pedido> };

  constructor(
    private readonly api: PedidoAdminService,
    private readonly alerta: AlertService,
    private readonly ns: NotificationService,
  ) {}

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.urlFiltros.cancelar());
    // La URL manda antes de la primera carga; si la ruta cambia desde fuera (menú o paleta hacia
    // /admin/pedidos limpio), los filtros se vacían.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.aplicarFiltrosDeUrl());
    this.cargar();
  }

  // ── Lista ──────────────────────────────────────────────────────────

  private ordenGuardado(): EstadoOrden {
    const guardado = leerOrdenGuardado('pedidos', COLUMNAS_ORDEN.map((c) => c.clave));
    return guardado.clave ? guardado : { ...ORDEN_INICIAL };
  }

  /** Cuántos pedidos hay en cada estado (con todos los pedidos, no solo los visibles). */
  conteo(estado: EstadoPedido): number {
    return this.pedidos.filter((p) => p.estado === estado).length;
  }

  get hayFiltros(): boolean {
    return !!this.filtroTexto.trim() || this.filtroEst !== '';
  }

  /** Por estado y por texto (código, cliente, documento o pago), en el orden elegido; sin elegir, más recientes primero. */
  get pedidosFiltrados(): Pedido[] {
    const m = this.memoFiltrados;
    if (m && m.pedidos === this.pedidos && m.estado === this.filtroEst && m.texto === this.filtroTexto && m.orden === this.orden) {
      return m.resultado;
    }
    const t = minusculas(this.filtroTexto).trim();
    const filtrados = this.pedidos
      .filter((p) => !this.filtroEst || p.estado === this.filtroEst)
      .filter(
        (p) =>
          !t ||
          `${p.codigo} ${p.nombre_receptor ?? ''} ${p.documento_receptor ?? ''} ${p.metodo_pago ?? ''}`
            .toLowerCase()
            .includes(t),
      );
    const orden = this.orden.clave ? this.orden : ORDEN_INICIAL;
    const resultado = ordenarLista(filtrados, (p) => this.valorDeOrden(p, orden.clave!), orden.dir);
    this.memoFiltrados = { pedidos: this.pedidos, estado: this.filtroEst, texto: this.filtroTexto, orden: this.orden, resultado };
    return resultado;
  }

  private valorDeOrden(p: Pedido, clave: string): unknown {
    switch (clave) {
      case 'codigo': return p.codigo;
      case 'fecha': return new Date(p.creado_en).getTime();
      case 'cliente': return this.cliente(p);
      case 'total': return Number(p.total);
      case 'estado': return ORDEN_CHIPS.indexOf(p.estado);
      default: return null;
    }
  }

  get paginaPedidos(): PaginaLocal<Pedido> {
    const lista = this.pedidosFiltrados;
    const m = this.memoPagina;
    if (m && m.lista === lista && m.pagina === this.pagina && m.porPagina === this.porPagina) return m.resultado;
    const resultado = paginar(lista, this.pagina, this.porPagina);
    this.memoPagina = { lista, pagina: this.pagina, porPagina: this.porPagina, resultado };
    return resultado;
  }

  ordenar(clave: string): void {
    this.fijarOrden(alternarOrden(this.orden, clave));
  }

  fijarOrden(orden: EstadoOrden): void {
    this.orden = orden;
    guardarOrden('pedidos', orden);
    this.pagina = 1;
  }

  ariaSort(clave: string): 'ascending' | 'descending' | 'none' { return ariaSort(this.orden, clave); }
  iconoOrden(clave: string): string { return iconoOrden(this.orden, clave); }

  irAPagina(pagina: number): void { this.pagina = pagina; }

  cambiarFilasPorPagina(porPagina: number): void {
    this.porPagina = porPagina;
    guardarFilasPorPagina(porPagina);
    this.pagina = 1;
  }

  /** Descarga la lista filtrada y ordenada completa (no solo la página que se ve). */
  exportarCsv(): void {
    const filas = this.pedidosFiltrados;
    if (!filas.length) return;
    const columnas: ColumnaCsv<Pedido>[] = [
      { titulo: 'Pedido', valor: (p) => p.codigo },
      { titulo: 'Fecha', valor: (p) => fechaCsv(p.creado_en) },
      { titulo: 'Cliente', valor: (p) => this.cliente(p) },
      { titulo: 'Documento', valor: (p) => p.documento_receptor },
      { titulo: 'Ítems', valor: (p) => Number(p.cantidad_items) || 0 },
      { titulo: 'Total', valor: (p) => Number(p.total) || 0 },
      { titulo: 'Pago', valor: (p) => p.metodo_pago },
      { titulo: 'Estado', valor: (p) => META_ESTADO[p.estado]?.etiqueta ?? p.estado },
      { titulo: 'Comprobante', valor: (p) => this.etiquetaComprobante(p) },
    ];
    const total = exportarCsv('pedidos-web', columnas, filas);
    this.alerta.toast({ type: 'success', title: `CSV descargado: ${total} ${total === 1 ? 'fila' : 'filas'}` });
  }

  private alCambiarFiltros(teclando: boolean): void {
    this.pagina = 1;
    this.urlFiltros.escribir({ q: this.filtroTexto, estado: this.filtroEst }, { retardar: teclando });
  }

  /** Lleva a pantalla lo que dice la URL (sin volver a escribirla). */
  private aplicarFiltrosDeUrl(): void {
    if (this.urlFiltros.ocupado) return; // es el eco de lo que acabamos de escribir
    const f = leerFiltros(this.route, ESQUEMA_URL);
    this.filtroTexto = String(f['q'] ?? '');
    this.filtroEst = String(f['estado'] ?? '') as FiltroEstado;
    this.pagina = 1;
    this.cdr.markForCheck();
  }

  identificar(_i: number, p: Pedido): number {
    return p.id_pedido;
  }

  cargar(): void {
    this.cargando = true;
    this.errorCarga = false;
    this.cdr.markForCheck();
    this.api.listar().subscribe({
      next: (lista) => {
        this.pedidos = Array.isArray(lista) ? [...lista] : [];
        this.cargando = false;
        // La ficha abierta se refresca con la versión nueva (o se cierra si el pedido ya no está).
        if (this.seleccionado) {
          const actual = this.pedidos.find((p) => p.id_pedido === this.seleccionado!.id_pedido);
          if (actual) this.seleccionado = actual;
          else this.cerrarPanel();
        }
        this.api.publicarDesde(this.pedidos);
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cargando = false;
        this.errorCarga = true;
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(e, 'No se pudieron cargar los pedidos'));
      },
    });
  }

  elegirEstado(estado: FiltroEstado): void {
    this.filtroEstado = estado;
  }

  limpiarFiltros(): void {
    this.filtroTexto = '';
    this.filtroEst = '';
    this.alCambiarFiltros(false);
  }

  // ── Ficha ──────────────────────────────────────────────────────────

  /** Abre la ficha con lo que ya trae la lista y, en paralelo, pide el detalle para tener la versión más reciente. */
  abrir(p: Pedido): void {
    this.seleccionado = p;
    this.panelAbierto = true;
    this.referencia = '';
    this.comentario = '';
    this.cdr.markForCheck();
    this.api.detalle(p.id_pedido).subscribe({
      next: (detalle) => {
        if (this.seleccionado?.id_pedido !== detalle.id_pedido) return;
        this.aplicar(detalle);
        this.cdr.markForCheck();
      },
      // Sin detalle se queda con los datos de la lista; no se molesta con un aviso.
      error: () => undefined,
    });
  }

  cerrarPanel(): void {
    if (!this.panelAbierto) return;
    this.panelAbierto = false;
    this.seleccionado = null;
    this.referencia = '';
    this.comentario = '';
    this.cdr.markForCheck();
  }

  /** Esc cierra la ficha, salvo que haya un diálogo (SweetAlert) abierto: ese se queda con la tecla. */
  @HostListener('document:keydown.escape')
  alPulsarEscape(): void {
    if (document.querySelector('.swal2-container')) return;
    this.cerrarPanel();
  }

  // ── Acciones ───────────────────────────────────────────────────────

  /** Estado al que «Avanzar» mueve el pedido abierto (null si no aplica). */
  get siguiente(): EstadoPedido | null {
    return this.seleccionado ? siguienteEstadoPedido(this.seleccionado.estado) : null;
  }

  get cancelable(): boolean {
    return !!this.seleccionado && pedidoCancelable(this.seleccionado.estado);
  }

  get esFinal(): boolean {
    return !!this.seleccionado && (this.seleccionado.estado === 'entregado' || this.seleccionado.estado === 'cancelado');
  }

  confirmarPago(): void {
    const p = this.seleccionado;
    if (!p || p.estado !== 'pendiente' || this.procesando) return;
    this.ejecutar(
      this.api.confirmarPago(p.id_pedido, this.referencia),
      `Pago confirmado · ${p.codigo}`,
      'Se registró el cobro y se generó la venta. Ya puede prepararlo.',
      'No se pudo confirmar el pago',
    );
  }

  avanzar(): void {
    const p = this.seleccionado;
    const destino = this.siguiente;
    if (!p || !destino || this.procesando) return;
    this.ejecutar(
      this.api.cambiarEstado(p.id_pedido, destino, this.comentario),
      `${p.codigo} · ${META_ESTADO[destino].etiqueta}`,
      undefined,
      'No se pudo cambiar el estado',
    );
  }

  async cancelar(): Promise<void> {
    const p = this.seleccionado;
    if (!p || !pedidoCancelable(p.estado) || this.procesando) return;
    const cobrado = p.estado !== 'pendiente';
    const confirmado = await this.alerta.confirmarPeligro({
      title: `¿Cancelar el pedido ${p.codigo}?`,
      message: cobrado
        ? 'El pedido ya está cobrado: si tiene una venta, anúlela primero desde Ventas y devuelva el dinero al cliente. La cancelación no se puede deshacer.'
        : 'Se devuelve el stock reservado y el pedido queda cancelado. No se puede deshacer.',
      confirmText: 'Sí, cancelar pedido',
      cancelText: 'No, mantenerlo',
    });
    if (!confirmado) return;
    this.ejecutar(
      this.api.cambiarEstado(p.id_pedido, 'cancelado', this.comentario),
      `Pedido ${p.codigo} cancelado`,
      undefined,
      'No se pudo cancelar el pedido',
    );
  }

  private ejecutar(
    peticion: Observable<Pedido>,
    titulo: string,
    mensaje: string | undefined,
    fallo: string,
  ): void {
    this.procesando = true;
    this.cdr.markForCheck();
    peticion.subscribe({
      next: (actualizado) => {
        this.procesando = false;
        this.referencia = '';
        this.comentario = '';
        this.aplicar(actualizado);
        this.idDestacado = actualizado.id_pedido;
        this.api.publicarDesde(this.pedidos);
        this.cdr.markForCheck();
        this.ns.exito(titulo, mensaje ? { mensaje } : undefined);
      },
      error: (e) => {
        this.procesando = false;
        this.cdr.markForCheck();
        this.alerta.error({ title: fallo, message: mensajeDeError(e) });
      },
    });
  }

  /** Reemplaza el pedido en la lista y en la ficha. */
  private aplicar(p: Pedido): void {
    const i = this.pedidos.findIndex((x) => x.id_pedido === p.id_pedido);
    if (i >= 0) {
      this.pedidos = this.pedidos.map((x, j) => (j === i ? p : x));
    } else {
      this.pedidos = [p, ...this.pedidos];
    }
    if (this.seleccionado?.id_pedido === p.id_pedido) this.seleccionado = p;
  }

  // ── Presentación ───────────────────────────────────────────────────

  /** Historial con lo más reciente arriba. */
  historialOrdenado(p: Pedido): PedidoEstado[] {
    return [...(p.historial ?? [])].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }

  identificarItem(_i: number, it: PedidoItem): number {
    return it.id_pedido_item;
  }

  /** Cliente para la tabla: nombre del receptor o, si falta, su documento. */
  cliente(p: Pedido): string {
    return (p.nombre_receptor || '').trim() || (p.documento_receptor || '').trim() || 'Sin nombre';
  }

  /** Parámetro de Documentos que abre un comprobante (`PARAMETRO_COMPROBANTE` en doc.component.ts). */
  readonly rutaDocumentos = '/dashboard/mantenimiento/doc';
  parametrosComprobante(id: number): Record<string, number> {
    return { comprobante: id };
  }

  /** Estado del comprobante en palabras de quien atiende: «B001-123 · Aceptado», «En proceso»… */
  estadoComprobante(p: Pedido): { texto: string; tono: TonoInsignia } | null {
    const c = p.comprobante;
    if (!c) return null;
    switch (c.estado) {
      case 'aceptado': return { texto: 'Aceptado por SUNAT', tono: 'exito' };
      case 'en_proceso': return { texto: 'En proceso', tono: 'info' };
      case 'requiere_revision': return { texto: 'Requiere revisión', tono: 'aviso' };
      case 'rechazado': return { texto: 'Rechazado por SUNAT', tono: 'aviso' };
      case 'anulado': return { texto: 'Anulado', tono: 'neutra' };
      default: return { texto: 'Sin comprobante', tono: 'neutra' };
    }
  }

  etiquetaComprobante(p: Pedido): string {
    const t = minusculas(p.tipo_comprobante);
    return t === 'factura' ? 'Factura' : t === 'boleta' ? 'Boleta' : '';
  }

  /** Texto del botón de avanzar: «Avanzar a preparando». */
  get textoAvanzar(): string {
    const s = this.siguiente;
    return s ? `Avanzar a ${META_ESTADO[s].etiqueta.toLowerCase()}` : '';
  }
}
