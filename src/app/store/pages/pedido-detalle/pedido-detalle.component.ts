import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, switchMap, takeUntil } from 'rxjs';
import { PASOS_PEDIDO, PedidoService } from '../../service/pedido.service';
import { CatalogoService } from '../../service/catalogo.service';
import { CartService } from '../../service/cart.service';
import { AlertService, escapeHtml } from '../../../shared/services/alert.service';
import { EstadoPedido, Pedido, PedidoItem } from '../../models/tienda.models';

@Component({
  selector: 'app-pedido-detalle',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './pedido-detalle.component.html',
  styleUrl: './pedido-detalle.component.css',
})
export class PedidoDetalleComponent implements OnInit, OnDestroy {

  private readonly pedidoService = inject(PedidoService);
  private readonly catalogo = inject(CatalogoService);
  private readonly cart = inject(CartService);
  private readonly alerta = inject(AlertService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destruir$ = new Subject<void>();

  readonly pasos = PASOS_PEDIDO;

  pedido?: Pedido;
  cargando = true;
  error = false;

  ngOnInit(): void {
    this.ruta.paramMap
      .pipe(
        takeUntil(this.destruir$),
        switchMap((params) => {
          this.cargando = true;
          this.error = false;
          return this.pedidoService.detalle(Number(params.get('id')));
        }),
      )
      .subscribe({
        next: (pedido) => {
          this.pedido = pedido;
          this.cargando = false;
        },
        error: () => {
          this.cargando = false;
          this.error = true;
        },
      });
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  get cancelado(): boolean {
    return this.pedido?.estado === 'cancelado';
  }

  get pasoActual(): number {
    return this.pedido ? this.pedidoService.indicePaso(this.pedido.estado) : 0;
  }

  get puedeCancelar(): boolean {
    return !!this.pedido && ['pendiente', 'pagado'].includes(this.pedido.estado);
  }

  imagen(item: PedidoItem): string {
    return this.catalogo.urlImagen(item.imagen);
  }

  /** Fecha registrada en el historial para un estado del timeline. */
  fechaDe(estado: EstadoPedido): string | undefined {
    return this.pedido?.historial.find((h) => h.estado === estado)?.fecha;
  }

  comentarioDe(estado: EstadoPedido): string | undefined {
    return this.pedido?.historial.find((h) => h.estado === estado)?.comentario;
  }

  async cancelar(): Promise<void> {
    if (!this.pedido) return;

    const resultado = await this.alerta.confirm({
      title: '¿Cancelar este pedido?',
      allowHtml: true,
      message: `Se anulará el pedido <strong>${escapeHtml(this.pedido.codigo)}</strong>. Esta acción no se puede deshacer.`,
      confirmText: 'Sí, cancelar',
      cancelText: 'No, mantenerlo',
    });

    if (!resultado.isConfirmed) return;

    this.pedidoService.cancelar(this.pedido.id_pedido).subscribe({
      next: (pedido) => {
        this.pedido = pedido;
        this.alerta.toast({ type: 'success', title: 'Pedido cancelado' });
      },
      error: (err) =>
        this.alerta.error({
          title: 'No pudimos cancelar el pedido',
          message: err?.error?.message ?? 'Comunícate con nosotros para gestionarlo.',
        }),
    });
  }

  /** Vuelve a poner en el carrito todos los productos del pedido. */
  volverAComprar(): void {
    if (!this.pedido) return;

    const items = this.pedido.items.filter((item) => !!item.id_producto);
    if (items.length === 0) return;

    let pendientes = items.length;
    this.alerta.loading('Agregando productos…');

    items.forEach((item) => {
      this.cart.agregar(item.id_producto!, item.cantidad).subscribe({
        next: () => this.finalizarRecompra(--pendientes),
        error: () => this.finalizarRecompra(--pendientes),
      });
    });
  }

  private finalizarRecompra(pendientes: number): void {
    if (pendientes > 0) return;
    this.alerta.close();
    this.alerta.toast({ type: 'success', title: 'Productos agregados al carrito' });
    this.router.navigate(['/store/carrito']);
  }
}
