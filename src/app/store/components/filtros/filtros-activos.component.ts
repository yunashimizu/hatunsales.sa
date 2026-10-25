import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConsultaCatalogo, FiltrosDisponibles } from '../../models/tienda.models';

interface ChipFiltro {
  clave: string;
  grupo: string;
  etiqueta: string;
  /** Cambios que, aplicados a la selección, dejan este filtro sin efecto. */
  quitar: Partial<ConsultaCatalogo>;
}

/**
 * Filtros activos como chips quitables. No guarda estado ni navega: deriva los chips de la
 * selección actual y, al quitar uno, emite la selección resultante por el mismo camino que
 * `app-filtros` (`cambio` → `aplicarFiltros` del catálogo, que actualiza la URL).
 */
@Component({
  selector: 'app-filtros-activos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <ng-container *ngIf="chips.length > 0">
      <button
        type="button"
        class="chip"
        *ngFor="let c of chips; trackBy: trackChip"
        (click)="quitar(c)"
        [attr.aria-label]="'Quitar filtro ' + c.grupo + ': ' + c.etiqueta">
        <span class="chip__grupo">{{ c.grupo }}</span>
        <span class="chip__valor">{{ c.etiqueta }}</span>
        <span class="chip__x" aria-hidden="true"><i class="bi bi-x-lg"></i></span>
      </button>

      <button type="button" class="todos" (click)="limpiar.emit()">Quitar todos</button>
    </ng-container>
  `,
  styles: [`
    :host { display: contents; }

    .chip {
      flex: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 38px;
      padding: 0 5px 0 14px;
      border: 1px solid var(--t-borde-fuerte);
      border-radius: var(--t-r-full);
      background: var(--t-superficie);
      color: var(--t-texto);
      font-size: 0.8125rem;
      cursor: pointer;
      animation: chip-entra 460ms var(--x-resorte) backwards;
      transition: border-color 160ms ease, scale 260ms var(--x-resorte-suave);
    }

    .chip:hover { border-color: var(--t-texto); }
    .chip:active { scale: 0.96; }

    .chip__grupo {
      font-family: var(--x-mono);
      font-size: 0.625rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--t-texto-tenue);
    }

    .chip__valor { font-weight: 650; }

    .chip__x {
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: var(--t-superficie-2);
      color: var(--t-texto-suave);
      font-size: 0.62rem;
      transition: background-color 160ms ease, color 160ms ease, rotate 380ms var(--x-resorte);
    }

    .chip:hover .chip__x {
      background: var(--x-coral);
      color: var(--x-tinta);
      rotate: 90deg;
    }

    .todos {
      flex: none;
      min-height: 38px;
      padding: 0 6px;
      border: 0;
      background: none;
      font-family: var(--x-mono);
      font-size: 0.6875rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-decoration: underline;
      text-decoration-color: var(--t-borde-fuerte);
      text-underline-offset: 0.35em;
      color: var(--t-texto-suave);
      cursor: pointer;
      transition: color 160ms ease, text-decoration-color 160ms ease;
    }

    .todos:hover { color: var(--t-texto); text-decoration-color: var(--x-coral); }

    @keyframes chip-entra {
      from { opacity: 0; scale: 0.7; }
    }

    @media (max-width: 960px) {
      .chip, .todos { min-height: 44px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .chip { animation: none; }
    }
  `],
})
export class FiltrosActivosComponent {

  @Input() seleccion: ConsultaCatalogo = {};
  @Input() disponibles: FiltrosDisponibles = {
    categorias: [], marcas: [], precio_min: 0, precio_max: 0, atributos: [],
  };

  @Output() cambio = new EventEmitter<ConsultaCatalogo>();
  @Output() limpiar = new EventEmitter<void>();

  get chips(): ChipFiltro[] {
    const s = this.seleccion;
    const d = this.disponibles;
    const lista: ChipFiltro[] = [];

    if (s.q) {
      lista.push({ clave: 'q', grupo: 'Búsqueda', etiqueta: `«${s.q}»`, quitar: { q: undefined } });
    }

    if (s.id_categoria) {
      const nombre = d.categorias.find((c) => c.id_categoria === s.id_categoria)?.nombre;
      lista.push({ clave: 'categoria', grupo: 'Categoría', etiqueta: nombre ?? 'Elegida', quitar: { id_categoria: undefined } });
    }

    if (s.id_marca) {
      const nombre = d.marcas.find((m) => m.id_marca === s.id_marca)?.nombre;
      lista.push({ clave: 'marca', grupo: 'Marca', etiqueta: nombre ?? 'Elegida', quitar: { id_marca: undefined } });
    }

    const min = s.precio_min;
    const max = s.precio_max;
    if (min || max) {
      const etiqueta = min && max ? `S/ ${min} – S/ ${max}` : min ? `Desde S/ ${min}` : `Hasta S/ ${max}`;
      lista.push({ clave: 'precio', grupo: 'Precio', etiqueta, quitar: { precio_min: undefined, precio_max: undefined } });
    }

    if (s.solo_stock) {
      lista.push({ clave: 'stock', grupo: 'Stock', etiqueta: 'Solo con stock', quitar: { solo_stock: false } });
    }

    if (s.solo_oferta) {
      lista.push({ clave: 'oferta', grupo: 'Oferta', etiqueta: 'Solo en oferta', quitar: { solo_oferta: false } });
    }

    for (const [nombre, valor] of Object.entries(s.atributos ?? {})) {
      const resto = { ...(s.atributos ?? {}) };
      delete resto[nombre];
      lista.push({ clave: `attr:${nombre}`, grupo: nombre, etiqueta: valor, quitar: { atributos: resto } });
    }

    return lista;
  }

  trackChip(_i: number, chip: ChipFiltro): string {
    return chip.clave;
  }

  quitar(chip: ChipFiltro): void {
    this.cambio.emit({ ...this.seleccion, ...chip.quitar, pagina: 1 });
  }
}
