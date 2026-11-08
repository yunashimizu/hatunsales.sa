import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FECHA_VERSION, VERSION } from '../../../constants/version';
import { ConectividadService } from '../../../shared/services/conectividad.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css',
})
export class FooterComponent {
  readonly year = new Date().getFullYear();
  readonly version = VERSION;
  /** Fecha del despliegue en español («8 nov 2026»), sin depender del locale global de Angular. */
  readonly fechaVersion = fechaCorta(FECHA_VERSION);
  readonly enLinea = inject(ConectividadService).enLinea;
}

/** «2026-11-08» → «8 nov 2026». A mediodía local para que ninguna zona horaria la corra de día. */
export function fechaCorta(iso: string): string {
  const fecha = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(fecha.getTime())) return iso;
  try {
    return fecha.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');
  } catch {
    return iso;
  }
}
