import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Tarjeta «¿Qué hacer?» de Envíos y Lotes (SUNAT-4, S10.3): la explicación en palabras de lo que pasó con un envío o un
 * lote que necesita a alguien (EXCEPCION, «liberar», número de seguimiento sin resolver) y, al lado, el botón de la
 * acción. Las acciones llegan por proyección de contenido (`<ng-content>`): la pantalla decide cuáles ofrecer.
 * Un solo componente para las dos pantallas: el aviso se ve y se lee igual en ambas.
 */
@Component({
  selector: 'app-que-hacer-sunat',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './que-hacer-sunat.component.html',
  styleUrl: './que-hacer-sunat.component.css',
})
export class QueHacerSunatComponent {
  /** El texto que explica qué pasó y qué conviene hacer. */
  @Input({ required: true }) texto = '';
  /** `peligro` para lo que requiere revisión; `aviso` para lo que solo espera. */
  @Input() tono: 'peligro' | 'aviso' = 'aviso';
  @Input() titulo = '¿Qué hacer?';
}
