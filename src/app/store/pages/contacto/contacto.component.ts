import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { AlertService } from '../../../shared/services/alert.service';
import { MagneticDirective } from '../../../shared/ui/magnetic.directive';
import { RevealDirective } from '../../../shared/ui/reveal.directive';
import { SpotlightDirective } from '../../../shared/ui/spotlight.directive';
import {
  EMPRESA_TIENDA,
  urlMapaAbrir,
  urlMapaEmbed,
  urlMailto,
  urlTelefono,
  urlWhatsapp,
} from '../../config/empresa-tienda.config';

/** «Abierto ahora» / «Cerrado» con el detalle de la próxima hora de cierre o apertura. */
interface EstadoTienda {
  abierto: boolean;
  texto: string;
  detalle: string;
}

/** Tramo de atención en minutos desde la medianoche. */
interface Tramo {
  abre: number;
  cierra: number;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ABREVIATURAS: Record<string, number> = { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 };

/** Perú no usa horario de verano: Lima es siempre UTC−5. */
const UTC_LIMA = -5;

const sinTildes = (texto: string): string => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** «8:00 – 19:00» → tramo en minutos (null si el texto no trae un horario válido). */
function leerTramo(texto: string): Tramo | null {
  const m = texto.match(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const abre = Number(m[1]) * 60 + Number(m[2]);
  const cierra = Number(m[3]) * 60 + Number(m[4]);
  return cierra > abre ? { abre, cierra } : null;
}

/** «Lun a Sáb» → [1, 2, 3, 4, 5, 6] (null si no se reconoce el rango de días). */
function leerDias(texto: string): number[] | null {
  const m = sinTildes(texto).match(/\b(dom|lun|mar|mie|jue|vie|sab)\w*\s+a\s+(dom|lun|mar|mie|jue|vie|sab)\w*/);
  if (!m) return null;
  let dia = ABREVIATURAS[m[1]];
  const fin = ABREVIATURAS[m[2]];
  const dias = [dia];
  while (dia !== fin && dias.length < 8) {
    dia = (dia + 1) % 7;
    dias.push(dia);
  }
  return dias;
}

const formatearHora = (minutos: number): string =>
  `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`;

/**
 * Lee el horario de EMPRESA_TIENDA («Lun a Sáb, 8:00 – 19:00» y «Domingo: cerrado») y dice si la
 * tienda está abierta a la hora de Lima. Si el texto cambia a algo que no se entiende devuelve
 * null y la pantalla no muestra el indicador (mejor callar que afirmar un horario equivocado).
 */
function calcularEstadoTienda(ahora: Date): EstadoTienda | null {
  const tramo = leerTramo(EMPRESA_TIENDA.horario);
  const dias = leerDias(EMPRESA_TIENDA.horario);
  if (!tramo || !dias) return null;

  const semana: (Tramo | null)[] = [null, null, null, null, null, null, null];
  for (const dia of dias) semana[dia] = tramo;

  const domingo = sinTildes(EMPRESA_TIENDA.horarioDomingo);
  if (/cerrad/.test(domingo)) {
    semana[0] = null;
  } else {
    const tramoDomingo = leerTramo(domingo);
    if (!tramoDomingo) return null;
    semana[0] = tramoDomingo;
  }

  const lima = new Date(ahora.getTime() + UTC_LIMA * 3_600_000);
  const hoy = lima.getUTCDay();
  const minutos = lima.getUTCHours() * 60 + lima.getUTCMinutes();
  const tramoHoy = semana[hoy];

  if (tramoHoy && minutos >= tramoHoy.abre && minutos < tramoHoy.cierra) {
    return { abierto: true, texto: 'Abierto ahora', detalle: `Cierra a las ${formatearHora(tramoHoy.cierra)}` };
  }

  for (let i = 0; i < 8; i++) {
    const dia = (hoy + i) % 7;
    const t = semana[dia];
    if (!t || (i === 0 && minutos >= t.abre)) continue;
    const cuando = i === 0 ? 'hoy' : i === 1 ? 'mañana' : `el ${DIAS[dia]}`;
    return { abierto: false, texto: 'Cerrado', detalle: `Abre ${cuando} a las ${formatearHora(t.abre)}` };
  }
  return { abierto: false, texto: 'Cerrado', detalle: '' };
}

@Component({
  selector: 'app-contacto',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, MagneticDirective, RevealDirective, SpotlightDirective],
  templateUrl: './contacto.component.html',
  styleUrl: './contacto.component.css',
})
export class ContactoComponent {
  private readonly alerta = inject(AlertService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly empresa = EMPRESA_TIENDA;
  readonly mapaEmbed: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(urlMapaEmbed());
  readonly mapaAbrir = urlMapaAbrir();
  readonly telHref = urlTelefono();
  readonly mailHref = urlMailto();
  readonly waHref = urlWhatsapp(`Hola ${EMPRESA_TIENDA.nombreCorto}, quisiera más información.`);

  // ---------------------------------------------------- presentación (solo vista)

  /** Indicador «Abierto ahora / Cerrado» (se calcula al abrir la pantalla). */
  readonly estado: EstadoTienda | null = calcularEstadoTienda(new Date());

  /** Atajos de conversación: cada uno abre WhatsApp con el mensaje ya escrito. */
  readonly temas = [
    { icono: 'bi-hammer', etiqueta: 'Cotizar un proyecto', mensaje: 'quisiera cotizar un proyecto.' },
    { icono: 'bi-box-seam', etiqueta: 'Consultar stock', mensaje: 'quisiera consultar el stock de un producto.' },
    { icono: 'bi-truck', etiqueta: 'Estado de mi pedido', mensaje: 'quisiera saber el estado de mi pedido.' },
    { icono: 'bi-wrench-adjustable', etiqueta: 'Asesoría técnica', mensaje: 'necesito asesoría técnica.' },
  ].map((tema) => ({
    icono: tema.icono,
    etiqueta: tema.etiqueta,
    href: urlWhatsapp(`Hola ${EMPRESA_TIENDA.nombreCorto}, ${tema.mensaje}`),
  }));

  async copiar(texto: string, etiqueta: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.alerta.toast({ type: 'success', title: `${etiqueta} copiado`, timer: 1800 });
    } catch {
      this.alerta.toast({ type: 'info', title: texto, timer: 3200 });
    }
  }
}
