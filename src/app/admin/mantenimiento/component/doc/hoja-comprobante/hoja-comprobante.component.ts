import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';

import { urlMedia } from '../../../../../shared/utils/media-url.util';
import {
  AVISO_BETA_HOJA,
  COLUMNAS_TABLA,
  HojaComprobante,
  VistaHoja,
  construirVista,
} from './hoja-comprobante.model';

/** Logo oficial de los documentos (mismo archivo que `LOGO_EMISOR_OFICIAL` del back). */
const LOGO_OFICIAL_SRC = urlMedia('/uploads/logo-hatunsales.png');

/**
 * Hoja del comprobante: copia la estructura del PDF A4 real (cabecera con logo, recuadro del documento,
 * caja de cliente/documento, tabla de 7 columnas, totales, crédito, notas, QR y pie).
 *
 * - Un solo `@Input() datos`; los adaptadores `hojaDesdePreview` / `hojaDesdeDetalle` lo arman.
 * - El ancho lo decide el contenedor (container queries), no la pantalla: sirve en la columna angosta
 *   del POS y en el panel del detalle.
 * - No genera QR (no hay librería en el front): indica que se genera al emitir o que va en el PDF.
 */
@Component({
  selector: 'app-hoja-comprobante',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hoja-comprobante.component.html',
  styleUrls: ['./hoja-comprobante.component.css'],
})
export class HojaComprobanteComponent implements OnChanges {
  @Input() datos: HojaComprobante | null = null;

  private readonly cdr = inject(ChangeDetectorRef);

  readonly columnas = COLUMNAS_TABLA;
  readonly avisoBeta = AVISO_BETA_HOJA;

  vista: VistaHoja | null = null;
  /** URL del logo ya resuelta con `urlMedia` ('' si no hay). */
  logoSrc = '';
  /** Logo que pidieron los datos (antes de un eventual respaldo al oficial). */
  private logoPedido = '';
  /** El <img> falló: se oculta y el encabezado se reacomoda. */
  logoRoto = false;

  ngOnChanges(cambios: SimpleChanges): void {
    if (!cambios['datos']) return;
    this.vista = this.datos ? construirVista(this.datos) : null;
    const src = urlMedia(this.datos?.emisor.logoUrl);
    // Solo se reinicia si cambió el logo pedido: así un logo configurado roto no se reintenta en cada recálculo.
    if (src !== this.logoPedido) {
      this.logoPedido = src;
      this.logoSrc = src;
      this.logoRoto = false;
    }
  }

  /**
   * Si falla el logo configurado (p. ej. una ruta vieja guardada en la base) se intenta el oficial una vez,
   * igual que el PDF (`obtenerLogoEmisor`); si también falla, se oculta.
   */
  alFallarLogo(): void {
    if (this.logoSrc !== LOGO_OFICIAL_SRC) {
      this.logoSrc = LOGO_OFICIAL_SRC;
      this.logoRoto = false;
    } else {
      this.logoRoto = true;
    }
    this.cdr.markForCheck();
  }

  get mostrarLogo(): boolean {
    return !!this.logoSrc && !this.logoRoto;
  }
}
