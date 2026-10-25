import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ResultadoComprobante } from '../../../../models/documentos.models';
import { VistaResultadoSunat, claseAviso, describirResultadoSunat } from '../documentos-sunat';

/**
 * Respuesta de SUNAT en el acto: aceptado (con sus observaciones), rechazado con el motivo y qué hacer,
 * o en proceso con lo que pasará; con la marca de BETA. Lo propio de cada pantalla (efectos de la
 * nota, botones de PDF) va dentro como contenido proyectado.
 *
 * Uso: `<app-resultado-sunat [resultado]="respuesta"> …extras… </app-resultado-sunat>`; acepta la
 * respuesta de cualquier emisión o acción (ResultadoComprobante, también el comprobante del POS).
 */
@Component({
  selector: 'app-resultado-sunat',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resultado-sunat.component.html',
  styleUrl: './resultado-sunat.component.css',
})
export class ResultadoSunatComponent {
  vista: VistaResultadoSunat = describirResultadoSunat({});
  numero = '';
  clase = claseAviso(this.vista.tono);

  @Input({ required: true })
  set resultado(valor: ResultadoComprobante | null | undefined) {
    this.vista = describirResultadoSunat(valor ?? {});
    this.numero = valor?.numero_formateado ?? '';
    this.clase = claseAviso(this.vista.tono);
  }
}
