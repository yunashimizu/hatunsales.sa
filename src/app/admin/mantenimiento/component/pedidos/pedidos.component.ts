import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { EstadoPedido, Pedido, PedidoEstado, PedidoItem } from '../../../../store/models/tienda.models';
import { AlertService } from '../../../../shared/services/alert.service';
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
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './pedidos.component.html',
  styleUrl: './pedidos.component.css',
})
export class PedidosComponent implements OnInit {
  pedidos: Pedido[] = [];
  cargando = false;
  /** La última carga falló (para mostrar el estado de error en pantalla). */
  errorCarga = false;

  filtroEstado: FiltroEstado = '';
  filtro = '';

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

  constructor(
    private readonly api: PedidoAdminService,
    private readonly alerta: AlertService,
    private readonly ns: NotificationService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  // ── Lista ──────────────────────────────────────────────────────────

  /** Cuántos pedidos hay en cada estado (con todos los pedidos, no solo los visibles). */
  conteo(estado: EstadoPedido): number {
    return this.pedidos.filter((p) => p.estado === estado).length;
  }

  get hayFiltros(): boolean {
    return !!this.filtro.trim() || this.filtroEstado !== '';
  }

  /** Por estado y por texto (código, cliente, documento o pago); más recientes primero. */
  get pedidosFiltrados(): Pedido[] {
    const t = minusculas(this.filtro).trim();
    return this.pedidos
      .filter((p) => !this.filtroEstado || p.estado === this.filtroEstado)
      .filter(
        (p) =>
          !t ||
          `${p.codigo} ${p.nombre_receptor ?? ''} ${p.documento_receptor ?? ''} ${p.metodo_pago ?? ''}`
            .toLowerCase()
            .includes(t),
      )
      .sort((a, b) => new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime());
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
    this.filtro = '';
    this.filtroEstado = '';
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
