import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { EstadoOrden, SIN_ORDEN } from '../../utils/orden-lista';

export interface ColumnaOrdenable {
  clave: string;
  titulo: string;
  /** Cómo se leen los dos sentidos: A → Z, menor a mayor, antiguo a reciente o por etapas de un flujo. */
  tipo: 'texto' | 'numero' | 'fecha' | 'flujo';
}

const SENTIDOS: Record<ColumnaOrdenable['tipo'], [string, string]> = {
  texto: ['A → Z', 'Z → A'],
  numero: ['menor a mayor', 'mayor a menor'],
  fecha: ['antiguo a reciente', 'reciente a antiguo'],
  flujo: ['del inicio al final', 'del final al inicio'],
};

/**
 * «Ordenar por» para cuando la tabla se convierte en tarjetas y desaparece la cabecera.
 * Se muestra solo con el corte de la tabla (`.adm-tabla__orden-movil`); ponerlo dentro de
 * `.adm-tabla-envoltorio`, antes de la tabla.
 */
@Component({
  selector: 'app-orden-movil',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-tabla__orden-movil">
      <label [attr.for]="idCampo">Ordenar por</label>
      <select class="adm-select" [id]="idCampo" (change)="elegir($event)">
        <option value="" [selected]="!estado.clave">Como llegan</option>
        @for (c of columnas; track c.clave) {
          @for (d of dirs; track d) {
            <option [value]="c.clave + ':' + d" [selected]="estado.clave === c.clave && estado.dir === d">
              {{ c.titulo }}: {{ sentido(c, d) }}
            </option>
          }
        }
      </select>
    </div>
  `,
})
export class OrdenMovilComponent {
  @Input({ required: true }) columnas: ColumnaOrdenable[] = [];
  @Input() estado: EstadoOrden = SIN_ORDEN;
  @Input() idCampo = 'orden-movil';
  @Output() readonly estadoChange = new EventEmitter<EstadoOrden>();

  readonly dirs = ['asc', 'desc'] as const;

  sentido(columna: ColumnaOrdenable, dir: 'asc' | 'desc'): string {
    return SENTIDOS[columna.tipo][dir === 'asc' ? 0 : 1];
  }

  elegir(evento: Event): void {
    const [clave, dir] = (evento.target as HTMLSelectElement).value.split(':');
    this.estadoChange.emit(clave ? { clave, dir: dir === 'desc' ? 'desc' : 'asc' } : { ...SIN_ORDEN });
  }
}
