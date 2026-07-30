import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, Subject, takeUntil } from 'rxjs';
import { PedidoService } from '../../service/pedido.service';
import { CatalogoService } from '../../service/catalogo.service';
import { EstadoPedido, Pedido } from '../../models/tienda.models';

const ETIQUETAS: Record<EstadoPedido, { texto: string; clase: string }> = {
  pendiente:  { texto: 'Pendiente de pago', clase: 'pendiente' },
  pagado:     { texto: 'Pagado',            clase: 'pagado' },
  preparando: { texto: 'En preparación',    clase: 'preparando' },
  enviado:    { texto: 'En camino',         clase: 'enviado' },
  entregado:  { texto: 'Entregado',         clase: 'entregado' },
  cancelado:  { texto: 'Cancelado',         clase: 'cancelado' },
};

@Component({
  selector: 'app-pedidos',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './pedidos.component.html',
  styleUrl: './pedidos.component.css',
})
export class PedidosComponent implements OnInit, OnDestroy {

  private readonly pedidoService = inject(PedidoService);
  private readonly catalogo = inject(CatalogoService);
  private readonly router = inject(Router);
  private readonly destruir$ = new Subject<void>();

  pedidos: Pedido[] = [];
  filtro: EstadoPedido | 'todos' = 'todos';
  cargando = true;

  readonly filtros: { valor: EstadoPedido | 'todos'; etiqueta: string }[] = [
    { valor: 'todos',      etiqueta: 'Todos' },
    { valor: 'pendiente',  etiqueta: 'Pendientes' },
    { valor: 'preparando', etiqueta: 'En preparación' },
    { valor: 'enviado',    etiqueta: 'En camino' },
    { valor: 'entregado',  etiqueta: 'Entregados' },
    { valor: 'cancelado',  etiqueta: 'Cancelados' },
  ];

  ngOnInit(): void {
    this.cargarPedidos();
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        filter((e) => {
          const url = e.urlAfterRedirects.split('?')[0];
          return /\/pedidos\/?$/.test(url) || url.endsWith('/pedidos');
        }),
        takeUntil(this.destruir$),
      )
      .subscribe(() => this.cargarPedidos());
  }

  private cargarPedidos(): void {
    this.cargando = true;
    this.pedidoService
      .misPedidos()
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (pedidos) => {
          this.pedidos = pedidos;
          this.cargando = false;
        },
        error: () => {
          this.pedidos = [];
          this.cargando = false;
        },
      });
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  get visibles(): Pedido[] {
    if (this.filtro === 'todos') return this.pedidos;
    return this.pedidos.filter((p) => p.estado === this.filtro);
  }

  contar(estado: EstadoPedido | 'todos'): number {
    if (estado === 'todos') return this.pedidos.length;
    return this.pedidos.filter((p) => p.estado === estado).length;
  }

  etiqueta(estado: EstadoPedido) {
    return ETIQUETAS[estado] ?? { texto: estado, clase: 'pendiente' };
  }

  imagen(url?: string): string {
    return this.catalogo.urlImagen(url);
  }
}
