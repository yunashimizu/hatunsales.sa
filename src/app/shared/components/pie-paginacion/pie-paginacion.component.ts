import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { PaginaLocal, TAMANOS_PAGINA } from '../../utils/paginacion-local';

/**
 * Pie de una lista paginada en el navegador: «1–25 de 412», «Mostrar 25» y Anterior / Siguiente.
 * Usa las clases globales `adm-paginacion*`; no trae estilos propios.
 * No se muestra mientras la lista entera quepa en la primera opción (25 filas).
 */
@Component({
  selector: 'app-pie-paginacion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (resultado && resultado.total > tamanos[0]) {
      <nav class="adm-paginacion" [attr.aria-label]="etiqueta">
        <span class="adm-paginacion__resumen" role="status">
          <strong class="adm-tabular">{{ resultado.desde }}–{{ resultado.hasta }}</strong> de
          <span class="adm-tabular">{{ resultado.total }}</span>
          · página {{ resultado.pagina }} de {{ resultado.totalPaginas }}
        </span>
        <label class="adm-paginacion__tamano">
          Mostrar
          <select class="adm-select" (change)="cambiarTamano($event)">
            @for (t of tamanos; track t) {
              <option [value]="t" [selected]="t === resultado.porPagina">{{ t }}</option>
            }
          </select>
        </label>
        <div class="adm-paginacion__botones">
          <button type="button" class="adm-btn adm-btn--suave adm-btn--sm"
                  [disabled]="resultado.pagina <= 1" (click)="paginaChange.emit(resultado.pagina - 1)">
            <i class="bi bi-chevron-left" aria-hidden="true"></i> Anterior
          </button>
          <button type="button" class="adm-btn adm-btn--suave adm-btn--sm"
                  [disabled]="resultado.pagina >= resultado.totalPaginas" (click)="paginaChange.emit(resultado.pagina + 1)">
            Siguiente <i class="bi bi-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
      </nav>
    }
  `,
})
export class PiePaginacionComponent {
  @Input({ required: true }) resultado!: PaginaLocal<unknown>;
  @Input() etiqueta = 'Paginación de la lista';
  @Output() readonly paginaChange = new EventEmitter<number>();
  @Output() readonly porPaginaChange = new EventEmitter<number>();

  readonly tamanos = TAMANOS_PAGINA;

  cambiarTamano(evento: Event): void {
    const valor = Number((evento.target as HTMLSelectElement).value);
    if (valor) this.porPaginaChange.emit(valor);
  }
}
