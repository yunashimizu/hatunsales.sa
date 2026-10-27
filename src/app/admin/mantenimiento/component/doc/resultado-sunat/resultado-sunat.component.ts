import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ResultadoComprobante } from '../../../../models/documentos.models';
import { VistaResultadoSunat, claseAviso, describirResultadoSunat } from '../documentos-sunat';

/**
 * Respuesta de SUNAT en el acto: aceptado (con sus observaciones), rechazado con el motivo y qué hacer,
 * o en proceso con lo que pasará; con la marca de BETA. Lo propio de cada pantalla (efectos de la
 * nota, botones de PDF) va dentro como contenido proyectado.
 *
 * Uso: `<app-resultado-sunat [resultado]="respuesta" [titular]="avisos[0]"> …extras… </app-resultado-sunat>`;
 * acepta la respuesta de cualquier emisión o acción (ResultadoComprobante, también el comprobante del POS).
 * `titular` (opcional) es la frase con que el backend resume el resultado; va antes del mensaje de SUNAT.
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
  textoTitular: string | null = null;

  @Input({ required: true })
  set resultado(valor: ResultadoComprobante | null | undefined) {
    this.vista = describirResultadoSunat(valor ?? {});
    this.numero = valor?.numero_formateado ?? '';
    this.clase = claseAviso(this.vista.tono);
  }

  @Input()
  set titular(valor: string | null | undefined) {
    this.textoTitular = valor?.trim() || null;
  }

  /** El mensaje de SUNAT, salvo que el titular ya lo diga (no se repite el motivo). */
  get detalle(): string | null {
    const detalle = this.vista.detalle;
    return detalle && this.textoTitular?.includes(detalle) ? null : detalle;
  }
}
