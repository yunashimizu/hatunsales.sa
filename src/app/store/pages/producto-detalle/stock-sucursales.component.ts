import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StockSucursal } from '../../models/tienda.models';
import { RevealDirective } from '../../../shared/ui/reveal.directive';
import { NivelStockComponent } from './nivel-stock.component';

/** Tarjetas de stock por sucursal con medidor de nivel. Solo presentación de lo que trae la ficha. */
@Component({
  selector: 'app-stock-sucursales',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NivelStockComponent, RevealDirective],
  template: `
    <section aria-label="Stock por sucursal">
      <span class="x-etiqueta x-etiqueta--corchetes">Stock por sucursal</span>

      <div class="lista" hsReveal="lista">
        <article *ngFor="let s of sucursales" [class.bajo]="s.stock > 0 && s.stock <= 5" [class.agotado]="!(s.stock > 0)">
          <div class="info">
            <strong>{{ s.sucursal }}</strong>
            <small *ngIf="s.direccion">{{ s.direccion }}</small>
          </div>
          <span class="cifra x-numero">{{ s.stock > 0 ? s.stock + ' disponibles' : 'Sin stock' }}</span>
          <app-nivel-stock [unidades]="s.stock"></app-nivel-stock>
        </article>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }

    section { display: flex; flex-direction: column; gap: 16px; }

    .lista {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
    }

    article {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 12px;
      padding: 16px 18px;
      border: 1px solid var(--t-borde);
      border-radius: var(--t-r-md);
      background: var(--t-superficie);
    }

    .info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .info strong { font-size: 0.9375rem; font-weight: 700; color: var(--t-texto); }
    .info small { font-size: 0.78rem; color: var(--t-texto-tenue); }

    .cifra { align-self: start; font-size: 0.75rem; white-space: nowrap; color: var(--t-exito-texto); }
    .bajo .cifra { color: var(--t-aviso-texto); }
    .agotado .cifra { color: var(--t-texto-tenue); }

    app-nivel-stock { grid-column: 1 / -1; margin-top: 10px; }

    @media (max-width: 620px) {
      .lista { grid-template-columns: minmax(0, 1fr); }
    }
  `],
})
export class StockSucursalesComponent {
  @Input() sucursales: StockSucursal[] = [];
}
