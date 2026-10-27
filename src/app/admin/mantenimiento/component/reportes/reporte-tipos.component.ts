import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/** Reparto de lo vendido por tipo de comprobante (lo calcula el backend; el total lleva signo). */
export interface PorTipoReporte {
  id_tipo: number;
  tipo: string;
  cantidad: number;
  total: number;
}

const ICONOS: Record<number, string> = {
  1: 'bi-building',
  2: 'bi-receipt',
  7: 'bi-arrow-return-left',
  8: 'bi-plus-circle',
};

/**
 * «Ventas por tipo de comprobante»: cuánto se vendió en facturas, boletas y notas. Cada fila es un
 * botón: al pulsarla se pide el reporte (y las descargas) solo de ese tipo; pulsarla otra vez
 * vuelve a todos. Solo presentación: el filtro lo aplica la pantalla de reportes.
 */
@Component({
  selector: 'app-reporte-tipos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section class="adm-tarjeta" [attr.aria-busy]="cargando">
      <div class="adm-tarjeta__cabecera">
        <div class="adm-tarjeta__encabezado">
          <h2 class="adm-tarjeta__titulo">
            <i class="bi bi-diagram-3"></i> Ventas por tipo de comprobante
            <span class="adm-insignia adm-insignia--neutra">{{ tipos.length }}</span>
          </h2>
          <p class="adm-tarjeta__sub">
            Cómo se reparte lo vendido. Pulse un tipo para ver y descargar solo ese reporte; púlselo de nuevo para volver a todos.
          </p>
        </div>
      </div>

      <div class="adm-esqueletos" *ngIf="cargando && !tipos.length" aria-label="Cargando tipos de comprobante">
        <div class="adm-esqueleto adm-esqueleto--fila" *ngFor="let n of [1, 2, 3]"></div>
      </div>

      <div class="adm-vacio adm-vacio--compacto" *ngIf="!cargando && !tipos.length">
        <div class="adm-vacio__icono adm-vacio__icono--neutro"><i class="bi bi-diagram-3" aria-hidden="true"></i></div>
        <div class="adm-vacio__titulo">Sin comprobantes en el periodo</div>
        <p>El reparto por tipo aparecerá en cuanto haya ventas.</p>
      </div>

      <ul class="tipos" *ngIf="tipos.length">
        <li *ngFor="let t of tipos; trackBy: porId">
          <button
            type="button"
            class="tipo"
            [class.tipo--activo]="seleccion === t.id_tipo"
            [class.tipo--neg]="t.total < 0"
            [attr.aria-pressed]="seleccion === t.id_tipo"
            [disabled]="cargando"
            (click)="alternar(t.id_tipo)"
          >
            <span class="tipo__icono" aria-hidden="true"><i class="bi" [ngClass]="icono(t.id_tipo)"></i></span>
            <span class="tipo__texto">
              <strong>{{ t.tipo }}</strong>
              <small>{{ t.cantidad }} comprobante{{ t.cantidad === 1 ? '' : 's' }}</small>
            </span>
            <strong class="tipo__monto">{{ moneda(t.total) }}</strong>
            <span class="tipo__barra" aria-hidden="true"><i [style.--n]="parte(t)"></i></span>
            <span class="tipo__pct">{{ parte(t) | number: '1.0-1' }} %</span>
          </button>
        </li>
      </ul>
    </section>
  `,
  styles: [
    `
      :host { display: block; }

      .tipos {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 12px;
        margin: 0;
        padding: 16px 20px 20px;
        list-style: none;
      }

      .tipo {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr) auto;
        grid-template-areas: 'icono texto monto' 'icono barra pct';
        align-items: center;
        gap: 6px 14px;
        width: 100%;
        min-height: 72px;
        padding: 13px 16px;
        border: 1px solid var(--adm-borde);
        border-radius: var(--adm-r-lg, 16px);
        background: var(--adm-superficie);
        color: var(--adm-texto);
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: border-color 160ms ease, background-color 160ms ease, box-shadow 200ms ease;
      }

      .tipo:hover:not(:disabled) { border-color: var(--adm-primario-borde); background: var(--adm-superficie-2); }
      .tipo:focus-visible { outline: 2px solid var(--adm-primario); outline-offset: 2px; }
      .tipo:disabled { cursor: progress; opacity: 0.65; }

      .tipo--activo,
      .tipo--activo:hover:not(:disabled) {
        border-color: var(--adm-primario);
        background: var(--adm-primario-claro);
        box-shadow: var(--adm-anillo);
      }

      .tipo__icono {
        grid-area: icono;
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        border-radius: 12px;
        background: var(--adm-primario-claro);
        color: var(--adm-primario);
        font-size: 18px;
      }

      .tipo--activo .tipo__icono { background: var(--adm-gradiente); color: var(--x-lienzo-texto); }
      .tipo--neg .tipo__icono { background: var(--adm-peligro-claro); color: var(--adm-peligro-texto); }

      .tipo__texto { grid-area: texto; display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
      .tipo__texto strong { font-size: 14px; }
      .tipo__texto small { font-size: 12px; color: var(--adm-texto-suave); }

      .tipo__monto {
        grid-area: monto;
        font-size: 15px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .tipo--neg .tipo__monto { color: var(--adm-peligro-texto); }

      .tipo__barra {
        grid-area: barra;
        display: block;
        height: 6px;
        border-radius: 999px;
        background: var(--adm-superficie-3);
        overflow: hidden;
      }

      .tipo__barra > i {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--adm-primario);
        transform-origin: left center;
        scale: clamp(0.02, calc(var(--n, 0) / 100), 1) 1;
        transition: scale 280ms ease;
      }

      .tipo--neg .tipo__barra > i { background: var(--adm-peligro); }

      .tipo__pct {
        grid-area: pct;
        font-family: var(--x-mono);
        font-size: 11px;
        color: var(--adm-texto-suave);
        font-variant-numeric: tabular-nums;
        text-align: right;
      }

      @media (max-width: 640px) {
        .tipos { padding: 14px; grid-template-columns: minmax(0, 1fr); }
        .tipo { min-height: 64px; }
      }

      @media (prefers-reduced-motion: reduce) {
        .tipo, .tipo__barra > i { transition: none; }
      }
    `,
  ],
})
export class ReporteTiposComponent {
  @Input() tipos: PorTipoReporte[] = [];
  /** Tipo por el que está filtrado el reporte (null = todos). */
  @Input() seleccion: number | null = null;
  @Input() cargando = false;
  /** Cada fila pide su tipo; pulsar la que ya está activa pide todos (null). */
  @Output() elegir = new EventEmitter<number | null>();

  private get sumaAbsoluta(): number {
    return this.tipos.reduce((suma, t) => suma + Math.abs(Number(t.total) || 0), 0);
  }

  porId(_i: number, t: PorTipoReporte): number {
    return t.id_tipo;
  }

  icono(idTipo: number): string {
    return ICONOS[idTipo] ?? 'bi-file-earmark-text';
  }

  /** Parte (0–100) que pesa el tipo sobre el total de los importes (en valor absoluto). */
  parte(t: PorTipoReporte): number {
    const suma = this.sumaAbsoluta;
    return suma > 0 ? (Math.abs(Number(t.total) || 0) / suma) * 100 : 0;
  }

  alternar(idTipo: number): void {
    this.elegir.emit(this.seleccion === idTipo ? null : idTipo);
  }

  moneda(valor: number | string | null | undefined): string {
    return Number(valor ?? 0).toLocaleString('es-PE', { style: 'currency', currency: 'PEN' });
  }
}
