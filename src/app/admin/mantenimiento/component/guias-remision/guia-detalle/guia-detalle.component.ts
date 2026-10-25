import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  GuiaRemision,
  ModoGre,
  ResultadoOperacionGuia,
  TipoArchivoGuia,
  ValidacionGuia,
} from '../../../../service/guia-remision.service';
import {
  AccionGuia,
  NOMBRE_ARCHIVO_GUIA,
  ResumenSunatGuia,
  claseInsigniaGuia,
  fechaGuia,
  numeroGuia,
  resumenSunatGuia,
  textoEstadoGuia,
} from '../guias-remision.util';

export interface DescargaGuia {
  guia: GuiaRemision;
  tipo: TipoArchivoGuia | 'pdf';
}

const NOMBRE_DOCUMENTO: Readonly<Record<string, string>> = {
  '1': 'DNI',
  '4': 'Carné de extranjería',
  '6': 'RUC',
  '7': 'Pasaporte',
};

/**
 * Detalle de una guía con el resultado de SUNAT en palabras y las acciones que admite su estado.
 * Solo presenta: la página hace cada operación (así la fila del listado y este panel comparten la
 * misma lógica y la consulta automática del ticket).
 */
@Component({
  selector: 'app-guia-detalle',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './guia-detalle.component.html',
  styleUrl: './guia-detalle.component.css',
})
export class GuiaDetalleComponent {
  @Input() guia: GuiaRemision | null = null;
  @Input() cargando = false;
  @Input() error = '';
  /** Lo que respondió SUNAT en la última operación de esta pantalla (emitir o consultar). */
  @Input() resultado: ResultadoOperacionGuia | null = null;
  @Input() validacion: ValidacionGuia | null = null;
  @Input() modo: ModoGre | null = null;
  @Input() accion: AccionGuia | null = null;
  /** Estado de la consulta automática del ticket, en palabras. */
  @Input() consultaAutomatica: string | null = null;
  /** Admin y vendedor; caja solo consulta y descarga. */
  @Input() puedeEscribir = false;
  @Output() readonly cerrar = new EventEmitter<void>();
  @Output() readonly recargar = new EventEmitter<void>();
  @Output() readonly editar = new EventEmitter<GuiaRemision>();
  @Output() readonly emitir = new EventEmitter<GuiaRemision>();
  @Output() readonly consultar = new EventEmitter<GuiaRemision>();
  @Output() readonly validar = new EventEmitter<GuiaRemision>();
  @Output() readonly anular = new EventEmitter<GuiaRemision>();
  @Output() readonly descargar = new EventEmitter<DescargaGuia>();

  readonly nombresArchivo = NOMBRE_ARCHIVO_GUIA;
  readonly fecha = fechaGuia;

  get resumen(): ResumenSunatGuia | null {
    return this.guia ? resumenSunatGuia(this.guia, this.resultado) : null;
  }

  get numero(): string {
    return this.guia ? numeroGuia(this.guia) : '';
  }

  get estadoTexto(): string {
    return this.guia ? textoEstadoGuia(this.guia) : '';
  }

  get claseEstado(): string {
    return this.guia ? claseInsigniaGuia(this.guia.estado) : 'adm-insignia--neutra';
  }

  /** Solo un enlace https de SUNAT (la constancia lo trae así); nunca otro esquema. */
  get enlaceQr(): string | null {
    const enlace = this.guia?.sunat.cadena_qr?.trim() ?? '';
    return /^https:\/\//i.test(enlace) ? enlace : null;
  }

  get ocupado(): boolean {
    return this.accion !== null;
  }

  get textoEmitir(): string {
    if (this.guia?.estado === 'rechazado') return 'Reenviar a SUNAT';
    if (this.guia?.estado === 'pendiente') return 'Reintentar envío';
    return 'Emitir a SUNAT';
  }

  /** Por qué no se puede emitir ahora (se muestra junto al botón); null si se puede. */
  get motivoSinEmitir(): string | null {
    if (!this.modo) return 'Comprobando si la emisión de guías a SUNAT está activa…';
    return this.modo.activo ? null : this.modo.motivo || 'La emisión de guías a SUNAT no está activa.';
  }

  nombreDocumento(tipo: string | null): string {
    return tipo ? (NOMBRE_DOCUMENTO[tipo] ?? `Tipo ${tipo}`) : 'Documento';
  }
}
