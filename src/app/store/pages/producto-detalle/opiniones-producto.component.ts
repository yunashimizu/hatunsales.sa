import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EstrellasComponent } from '../../components/estrellas/estrellas.component';
import { ResenaTienda } from '../../models/tienda.models';
import { CountUpDirective } from '../../../shared/ui/count-up.directive';

/**
 * Resumen de opiniones (promedio, estrellas y barras de reparto) y lista de reseñas.
 * Solo presentación: recibe lo que la ficha ya cargó. Las barras se calculan SOLO con las
 * reseñas recibidas (no es el histórico completo). El formulario para opinar lo pone la
 * ficha por proyección de contenido, entre el resumen y la lista.
 */
@Component({
  selector: 'app-opiniones-producto',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, EstrellasComponent, CountUpDirective],
  template: `
    <div class="resumen">
      <div class="puntaje">
        <strong class="x-numero"><span [hsCountUp]="rating" [hsDecimales]="1"></span></strong>
        <app-estrellas [valor]="rating" [mostrarConteo]="false"></app-estrellas>
        <small class="x-numero">{{ total }} {{ total === 1 ? 'opinión' : 'opiniones' }}</small>
      </div>

      <div class="reparto" *ngIf="resenas.length > 0">
        <ul class="distribucion" aria-label="Distribución de las opiniones cargadas">
          <li *ngFor="let d of distribucion">
            <span class="d-estrellas x-numero">{{ d.estrellas }}<i class="bi bi-star-fill" aria-hidden="true"></i></span>
            <span class="d-barra" aria-hidden="true"><i [style.--p]="d.fraccion"></i></span>
            <span class="d-cifra x-numero">{{ d.cantidad }}</span>
          </li>
        </ul>
        <p class="nota x-etiqueta">Según las {{ resenas.length }} {{ resenas.length === 1 ? 'opinión cargada' : 'opiniones cargadas' }}</p>
      </div>
    </div>

    <ng-content></ng-content>

    <ul class="lista" *ngIf="resenas.length > 0">
      <li *ngFor="let r of resenas">
        <div class="cabecera">
          <span class="avatar" aria-hidden="true">{{ r.autor.charAt(0).toUpperCase() }}</span>
          <div>
            <strong>{{ r.autor }}</strong>
            <app-estrellas [valor]="r.calificacion" [mostrarConteo]="false"></app-estrellas>
          </div>
          <time class="x-numero">{{ r.fecha | date: 'dd/MM/yyyy' }}</time>
        </div>
        <strong class="titulo" *ngIf="r.titulo">{{ r.titulo }}</strong>
        <p *ngIf="r.comentario">{{ r.comentario }}</p>
      </li>
    </ul>

    <p class="vacio" *ngIf="resenas.length === 0">Todavía nadie ha opinado sobre este producto. ¡Sé el primero!</p>
  `,
  styles: [`
    :host { display: block; }

    .resumen {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: clamp(20px, 4vw, 52px);
      align-items: center;
      margin-bottom: 26px;
      padding: clamp(18px, 2.4vw, 28px);
      border-radius: var(--t-r-md);
      background: var(--t-superficie-2);
    }

    .puntaje {
      --est-size: 1.1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .puntaje strong {
      font-size: clamp(3rem, 2rem + 3vw, 4.6rem);
      font-weight: 600;
      line-height: 0.9;
      letter-spacing: -0.06em;
      color: var(--t-texto);
    }

    .puntaje small { font-size: 0.75rem; color: var(--t-texto-suave); }

    .distribucion { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }

    .distribucion li {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) 28px;
      align-items: center;
      gap: 12px;
    }

    .d-estrellas { display: inline-flex; align-items: center; gap: 4px; font-size: 0.8125rem; color: var(--t-texto-suave); }
    .d-estrellas i { font-size: 0.7rem; color: var(--t-estrella); }
    .d-barra { display: block; height: 8px; overflow: hidden; border-radius: 8px; background: var(--t-borde); }

    .d-barra i {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--t-estrella);
      transform-origin: 0 50%;
      scale: var(--p, 0) 1;
      animation: op-barra 900ms var(--x-ease) backwards;
    }

    @keyframes op-barra { from { scale: 0 1; } }

    .d-cifra { font-size: 0.75rem; text-align: right; color: var(--t-texto-suave); }
    .nota { margin: 12px 0 0; }

    .lista { display: grid; gap: 14px; margin: 0; padding: 0; list-style: none; }
    .lista li { padding: 20px 22px; border: 1px solid var(--t-borde); border-radius: var(--t-r-md); }

    .cabecera { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .cabecera > div { display: flex; flex-direction: column; gap: 4px; }
    .cabecera strong { font-size: 0.9375rem; color: var(--t-texto); }
    .cabecera time { margin-left: auto; font-size: 0.75rem; color: var(--t-texto-tenue); }

    .avatar {
      --tono: var(--x-coral);
      display: grid;
      flex: none;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--tono) 34%, var(--t-superficie));
      font-family: var(--hs-fuente-titulos);
      font-weight: 800;
      color: var(--t-texto);
    }

    .lista li:nth-child(4n + 2) .avatar { --tono: var(--x-menta); }
    .lista li:nth-child(4n + 3) .avatar { --tono: var(--x-azul); }
    .lista li:nth-child(4n) .avatar { --tono: var(--x-amarillo); }

    .titulo { display: block; margin-bottom: 4px; font-size: 0.95rem; color: var(--t-texto); }
    .lista p { margin: 0; font-size: 0.9375rem; line-height: 1.7; color: var(--t-texto-suave); }
    .vacio { margin: 0; font-size: 0.9375rem; color: var(--t-texto-tenue); }

    @media (max-width: 620px) {
      .resumen { grid-template-columns: minmax(0, 1fr); }
    }

    @media (prefers-reduced-motion: reduce) {
      .d-barra i { animation: none; }
    }
  `],
})
export class OpinionesProductoComponent {
  @Input() rating = 0;
  @Input() total = 0;
  @Input() resenas: ResenaTienda[] = [];

  /** Cuántas opiniones cargadas hay por cada puntuación (5 → 1). */
  get distribucion(): { estrellas: number; cantidad: number; fraccion: number }[] {
    const cantidadTotal = this.resenas.length;
    return [5, 4, 3, 2, 1].map((estrellas) => {
      const cantidad = this.resenas.filter((r) => Math.round(r.calificacion) === estrellas).length;
      return { estrellas, cantidad, fraccion: cantidadTotal > 0 ? cantidad / cantidadTotal : 0 };
    });
  }
}
