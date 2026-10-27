import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** Producto del ranking de lo vendido (neto de notas de crédito); lo calcula el backend. */
export interface ProductoVendidoReporte {
  id_producto: number | null;
  codigo: string;
  producto: string;
  cantidad: number;
  total: number;
  comprobantes: number;
}

/** Producto del ranking de cotizaciones (proformas no anuladas del periodo). */
export interface ProductoCotizadoReporte {
  id_producto: number | null;
  sku: string;
  producto: string;
  cotizaciones: number;
  cantidad: number;
  total: number;
  convertidas: number;
}

/**
 * Ranking de productos del reporte de ventas, en tres modos: lo más vendido, lo más devuelto (cuando el
 * reporte es solo de notas de crédito) y lo más cotizado. Solo presentación: los datos llegan ya
 * calculados y ordenados; aquí se dibujan con su barra relativa al primero.
 */
@Component({
  selector: 'app-reporte-productos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section class="adm-tarjeta rp" [attr.aria-busy]="cargando">
      <div class="adm-tarjeta__cabecera">
        <div class="adm-tarjeta__encabezado">
          <h2 class="adm-tarjeta__titulo" [class.adm-tarjeta__titulo--aviso]="modo === 'cotizados'">
            <i class="bi" [ngClass]="icono"></i> {{ titulo }}
            <span class="adm-insignia adm-insignia--neutra">{{ cantidadFilas }}</span>
          </h2>
          <p class="adm-tarjeta__sub">{{ descripcion }}</p>
        </div>
      </div>

      <div class="adm-esqueletos" *ngIf="cargando && !cantidadFilas" aria-label="Cargando productos">
        <div class="adm-esqueleto adm-esqueleto--fila" *ngFor="let n of [1, 2, 3, 4]"></div>
      </div>

      <div class="adm-vacio adm-vacio--compacto" *ngIf="!cargando && !cantidadFilas">
        <div class="adm-vacio__icono adm-vacio__icono--neutro"><i class="bi" [ngClass]="icono" aria-hidden="true"></i></div>
        <div class="adm-vacio__titulo">{{ vacioTitulo }}</div>
        <p>{{ vacioTexto }}</p>
      </div>

      <!-- Vendidos / devueltos -->
      <div class="adm-tabla-envoltorio" *ngIf="modo !== 'cotizados' && vendidos.length">
        <table class="adm-tabla adm-tabla--adaptable rp__tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th class="adm-num">{{ modo === 'devueltos' ? 'Devuelto' : 'Cantidad' }}</th>
              <th class="adm-num">Importe</th>
              <th class="adm-num">{{ modo === 'devueltos' ? '% de lo devuelto' : '% de las ventas' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let p of vendidos; trackBy: idVendido">
              <td data-etiqueta="Producto">
                <div class="rp__producto">
                  <span class="rp__puesto" aria-hidden="true"></span>
                  <div class="rp__texto">
                    <div class="adm-tabla__principal">{{ p.producto }}</div>
                    <div class="adm-tabla__secundario adm-tabular" *ngIf="p.codigo">Código {{ p.codigo }}</div>
                    <div class="rp__barra" aria-hidden="true"><i [style.--n]="relativo(p.total, maxVendido)"></i></div>
                  </div>
                </div>
              </td>
              <td [attr.data-etiqueta]="modo === 'devueltos' ? 'Devuelto' : 'Cantidad'" class="adm-num">{{ p.cantidad | number: '1.0-2' }}</td>
              <td data-etiqueta="Importe" class="adm-num"><strong class="rp__monto">{{ moneda(p.total) }}</strong></td>
              <td data-etiqueta="Participación" class="adm-num rp__pct">{{ participacion(p.total) | number: '1.0-1' }} %</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Cotizados -->
      <div class="adm-tabla-envoltorio" *ngIf="modo === 'cotizados' && cotizados.length">
        <table class="adm-tabla adm-tabla--adaptable rp__tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th class="adm-num">Cotizaciones</th>
              <th class="adm-num">Cantidad</th>
              <th class="adm-num">Importe</th>
              <th class="adm-num">Convertidas en venta</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let p of cotizados; trackBy: idCotizado">
              <td data-etiqueta="Producto">
                <div class="rp__producto">
                  <span class="rp__puesto" aria-hidden="true"></span>
                  <div class="rp__texto">
                    <div class="adm-tabla__principal">{{ p.producto }}</div>
                    <div class="adm-tabla__secundario adm-tabular" *ngIf="p.sku">Código {{ p.sku }}</div>
                    <div class="rp__barra" aria-hidden="true"><i [style.--n]="relativo(p.cotizaciones, maxCotizado)"></i></div>
                  </div>
                </div>
              </td>
              <td data-etiqueta="Cotizaciones" class="adm-num"><strong class="rp__monto">{{ p.cotizaciones }}</strong></td>
              <td data-etiqueta="Cantidad" class="adm-num">{{ p.cantidad | number: '1.0-2' }}</td>
              <td data-etiqueta="Importe" class="adm-num">{{ moneda(p.total) }}</td>
              <td data-etiqueta="Convertidas en venta" class="adm-num">
                <span class="adm-insignia adm-insignia--punto" [ngClass]="p.convertidas > 0 ? 'adm-insignia--exito' : 'adm-insignia--neutra'">
                  {{ p.convertidas }} de {{ p.cotizaciones }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [
    `
      :host { display: block; min-width: 0; }
      .rp { height: 100%; }

      .rp__tabla tbody { counter-reset: rp-puesto; }
      .rp__tabla tbody tr { counter-increment: rp-puesto; }

      .rp__producto { display: flex; align-items: center; gap: 12px; min-width: 0; }

      .rp__puesto {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        flex-shrink: 0;
        border-radius: 50%;
        background: var(--adm-superficie-3);
        color: var(--adm-texto-2);
        font-family: var(--x-mono);
        font-size: 12px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }

      .rp__puesto::before { content: counter(rp-puesto); }

      /* El primero brilla con la rampa viva; el 2.º y el 3.º con el tinte de marca */
      .rp__tabla tbody tr:first-child .rp__puesto {
        background: linear-gradient(135deg, var(--x-ambar), var(--x-coral));
        color: var(--x-tinta);
      }

      .rp__tabla tbody tr:nth-child(2) .rp__puesto,
      .rp__tabla tbody tr:nth-child(3) .rp__puesto {
        background: var(--adm-primario-claro);
        color: var(--adm-primario);
      }

      .rp__texto { min-width: 0; overflow-wrap: anywhere; }

      .rp__barra {
        max-width: 220px;
        height: 4px;
        margin-top: 7px;
        border-radius: 999px;
        background: var(--adm-superficie-3);
        overflow: hidden;
      }

      .rp__barra > i {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--adm-primario);
        transform-origin: left center;
        scale: clamp(0.02, calc(var(--n, 0) / 100), 1) 1;
        animation: rp-barra-entra 700ms var(--x-ease, ease) backwards;
      }

      .rp__tabla tbody tr:first-child .rp__barra > i { background: linear-gradient(90deg, var(--x-ambar), var(--x-coral)); }

      @keyframes rp-barra-entra { from { scale: 0 1; } }

      .rp__monto { font-weight: 700; color: var(--adm-texto); font-variant-numeric: tabular-nums; }
      .rp__pct { font-family: var(--x-mono); font-size: 12.5px; color: var(--adm-texto-suave); white-space: nowrap; }

      @media (max-width: 640px) {
        /* En la ficha móvil el producto encabeza (puesto, nombre y barra) sin etiqueta */
        .rp__tabla.adm-tabla--adaptable tbody td:first-child {
          display: block;
          padding: 10px 12px 9px;
          margin-bottom: 4px;
          text-align: left;
          border-bottom: 1px dashed var(--adm-borde);
        }

        .rp__tabla.adm-tabla--adaptable tbody td:first-child::before { content: none; }
      }

      @media (prefers-reduced-motion: reduce) {
        .rp__barra > i { animation: none; }
      }
    `,
  ],
})
export class ReporteProductosComponent {
  @Input() modo: 'vendidos' | 'devueltos' | 'cotizados' = 'vendidos';
  @Input() vendidos: ProductoVendidoReporte[] = [];
  @Input() cotizados: ProductoCotizadoReporte[] = [];
  @Input() cargando = false;
  /** Ventas netas del periodo: el % de cada producto se mide contra ellas. */
  @Input() totalVendido = 0;

  get titulo(): string {
    if (this.modo === 'cotizados') return 'Productos más cotizados';
    return this.modo === 'devueltos' ? 'Productos con más devoluciones' : 'Productos más vendidos';
  }

  get descripcion(): string {
    if (this.modo === 'cotizados') {
      return 'Cotizaciones del periodo (sin las anuladas) que incluyen cada producto, y cuántas llegaron a ser venta.';
    }
    return this.modo === 'devueltos'
      ? 'Productos de las notas de crédito del periodo, ordenados por importe devuelto.'
      : 'Ordenados por importe neto vendido (las notas de crédito restan).';
  }

  get icono(): string {
    if (this.modo === 'cotizados') return 'bi-file-earmark-ruled';
    return this.modo === 'devueltos' ? 'bi-arrow-return-left' : 'bi-box-seam';
  }

  get vacioTitulo(): string {
    if (this.modo === 'cotizados') return 'Sin cotizaciones en el periodo';
    return this.modo === 'devueltos' ? 'Sin devoluciones en el periodo' : 'Sin productos vendidos en el periodo';
  }

  get vacioTexto(): string {
    if (this.modo === 'cotizados') return 'El ranking aparecerá cuando se registren cotizaciones.';
    return this.modo === 'devueltos'
      ? 'Aquí aparecerán los productos de las notas de crédito.'
      : 'El ranking aparecerá en cuanto haya ventas con productos.';
  }

  get cantidadFilas(): number {
    return this.modo === 'cotizados' ? this.cotizados.length : this.vendidos.length;
  }

  get maxVendido(): number {
    return Math.max(...this.vendidos.map((p) => Math.abs(Number(p.total) || 0)), 1);
  }

  get maxCotizado(): number {
    return Math.max(...this.cotizados.map((p) => Number(p.cotizaciones) || 0), 1);
  }

  idVendido(i: number, p: ProductoVendidoReporte): string | number {
    return p.id_producto ?? `${p.codigo}-${i}`;
  }

  idCotizado(i: number, p: ProductoCotizadoReporte): string | number {
    return p.id_producto ?? `${p.sku}-${i}`;
  }

  /** Qué parte (0–100) del máximo es `valor`: la barra de cada producto se mide contra el primero. */
  relativo(valor: number, maximo: number): number {
    return maximo > 0 ? Math.max(0, Math.min(100, (Math.abs(Number(valor) || 0) / maximo) * 100)) : 0;
  }

  /** Qué parte (0–100) de las ventas netas (o de lo devuelto) pesa el producto. */
  participacion(valor: number): number {
    const base = this.modo === 'devueltos' ? this.vendidos.reduce((s, p) => s + (Number(p.total) || 0), 0) : this.totalVendido;
    return base > 0 ? Math.max(0, ((Number(valor) || 0) / base) * 100) : 0;
  }

  moneda(valor: number | string | null | undefined): string {
    return Number(valor ?? 0).toLocaleString('es-PE', { style: 'currency', currency: 'PEN' });
  }
}
