import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

/** Datos del formulario: el mismo objeto que guarda la ficha (`nuevaResena`). */
export interface DatosResena {
  calificacion: number;
  titulo: string;
  comentario: string;
}

/**
 * Formulario «Deja tu opinión» (o el aviso para iniciar sesión). Solo presentación: no envía nada
 * por su cuenta; al enviar emite `publicar` y la ficha ejecuta su `enviarResena()` de siempre.
 */
@Component({
  selector: 'app-formulario-resena',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <form class="formulario" *ngIf="autenticado" (ngSubmit)="publicar.emit()">
      <h3>Deja tu opinión</h3>

      <div class="estrellas">
        <button
          type="button"
          *ngFor="let n of [1, 2, 3, 4, 5]"
          (click)="datos.calificacion = n"
          [attr.aria-pressed]="n <= datos.calificacion"
          [attr.aria-label]="n + ' estrellas'">
          <i class="bi" [class.bi-star-fill]="n <= datos.calificacion" [class.bi-star]="n > datos.calificacion"></i>
        </button>
      </div>

      <input type="text" [(ngModel)]="datos.titulo" name="titulo" placeholder="Título (opcional)" maxlength="160" aria-label="Título de tu opinión" />
      <textarea [(ngModel)]="datos.comentario" name="comentario" rows="3" placeholder="Cuéntanos qué te pareció el producto" aria-label="Tu comentario"></textarea>

      <button type="submit" class="x-boton" [disabled]="enviando">
        {{ enviando ? 'Enviando…' : 'Publicar opinión' }}
      </button>
    </form>

    <p class="aviso" *ngIf="!autenticado">
      <i class="bi bi-info-circle" aria-hidden="true"></i>
      <span><a routerLink="/auth">Inicia sesión</a> para dejar tu opinión sobre este producto.</span>
    </p>
  `,
  styles: [`
    :host { display: block; margin-bottom: 28px; }

    .formulario {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 600px;
      padding: 22px;
      border: 1px solid var(--t-borde);
      border-radius: var(--t-r-md);
    }

    h3 { margin: 0; font-size: 1.05rem; font-weight: 800; letter-spacing: -0.02em; color: var(--t-texto); }
    .x-boton { align-self: flex-start; }
    .estrellas { display: flex; gap: 4px; }

    .estrellas button {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--t-estrella);
      font-size: 1.5rem;
      cursor: pointer;
      transition: scale 340ms var(--x-resorte), background-color 160ms ease;
    }

    .estrellas button:hover { scale: 1.2; background: var(--t-superficie-2); }

    input,
    textarea {
      width: 100%;
      padding: 13px 16px;
      border: 1px solid var(--t-borde-fuerte);
      border-radius: 14px;
      background: var(--t-superficie-2);
      font-size: 0.9375rem;
      color: var(--t-texto);
      resize: vertical;
      transition: border-color 160ms ease, box-shadow 200ms ease, background-color 160ms ease;
    }

    input:focus,
    textarea:focus {
      outline: 0;
      border-color: var(--t-texto);
      background: var(--t-superficie);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--t-primario) 20%, transparent);
    }

    .aviso {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0;
      padding: 14px 18px;
      border-radius: var(--t-r-sm);
      background: var(--t-primario-claro);
      font-size: 0.9rem;
      color: var(--t-texto-suave);
    }

    .aviso i,
    .aviso a { color: var(--t-primario-texto); }
    .aviso a { font-weight: 650; }
  `],
})
export class FormularioResenaComponent {
  @Input() autenticado = false;
  @Input({ required: true }) datos!: DatosResena;
  @Input() enviando = false;
  @Output() publicar = new EventEmitter<void>();
}
