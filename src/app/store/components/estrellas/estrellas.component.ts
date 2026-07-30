import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-estrellas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <span class="estrellas" [attr.aria-label]="'Calificación ' + valor + ' de 5'" role="img">
      <i *ngFor="let estrella of estrellas; trackBy: trackEstrella" class="bi" [class]="estrella"></i>
      <span class="conteo" *ngIf="mostrarConteo">({{ total }})</span>
    </span>
  `,
  styles: [`
    .estrellas {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      color: var(--t-estrella);
      font-size: 0.8rem;
      line-height: 1;
    }
    .conteo {
      margin-left: 6px;
      color: var(--t-texto-tenue);
      font-size: 0.75rem;
    }
  `],
})
export class EstrellasComponent {
  @Input() valor = 0;
  @Input() total = 0;
  @Input() mostrarConteo = true;

  get estrellas(): string[] {
    const llenas = Math.floor(this.valor);
    const media = this.valor - llenas >= 0.5;

    return Array.from({ length: 5 }, (_, i) => {
      if (i < llenas) return 'bi-star-fill';
      if (i === llenas && media) return 'bi-star-half';
      return 'bi-star';
    });
  }

  trackEstrella(i: number): number {
    return i;
  }
}
