import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, finalize } from 'rxjs';

import { AuthService } from '../../../../../auth/service/auth.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { NumeroDirective } from '../../../../../shared/directives/numero.directive';
import { descargarArchivo } from '../../../../../shared/utils/descargar-archivo';
import {
  ContextoNotaCredito,
  FormaNotaCredito,
  FormatoPdfComprobante,
  ItemNotaCredito,
  MotivoNotaCredito,
  NotaCreditoEmitida,
  SolicitudNotaCredito,
  textoEstadoSunat,
  tonoEstadoSunat,
} from '../../../../models/documentos.models';
import {
  codigoDeError,
  errorOperativo,
  esErrorDeRed,
  mensajeDeError,
  normalizarErrorBlob,
} from '../../../../service/api-base.service';
import { ComprobanteService } from '../../../../service/comprobante.service';
import { FiscalEstadoService } from '../../../../service/fiscal-estado.service';
import { RUTA_DOCUMENTOS, claseInsignia, nombreDescarga } from '../documentos-sunat';
import { ResultadoSunatComponent } from '../resultado-sunat/resultado-sunat.component';

type PasoAsistente = 'motivo' | 'detalle' | 'resultado';

/** Qué significa cada motivo del catálogo 09 para quien vende (el backend decide cuáles se ofrecen). */
const EXPLICACION_MOTIVO: Readonly<Record<string, string>> = {
  '01': 'Deja sin efecto toda la operación: se acredita el total y, cuando SUNAT acepte la nota, lo vendido vuelve al almacén y baja la deuda. Para anular también la venta use «Anular».',
  '02': 'El comprobante salió con un RUC equivocado: se acredita el total. Después emita aparte el comprobante correcto desde la venta.',
  '05': 'Rebaja el importe de una o más líneas sin devolver productos (solo facturas).',
  '06': 'El cliente devuelve todo lo comprado: se acredita el total y lo devuelto vuelve al almacén.',
  '07': 'El cliente devuelve parte de los productos: indique cuántas unidades de cada uno.',
  '09': 'Rebaja un importe del comprobante sin devolver productos (por ejemplo, un ajuste de precio acordado).',
  '10': 'Otro ajuste por importe que no corresponde a los motivos anteriores.',
};

const NOMBRE_FORMA: Readonly<Record<FormaNotaCredito, string>> = {
  total: 'Acredita todo',
  items: 'Por unidades devueltas',
  descuento_items: 'Descuento por línea',
  monto: 'Por importe',
};

/** Motivos sin devolución que igual bajan la deuda de una venta al crédito (D8). */
const MOTIVOS_QUE_BAJAN_DEUDA: ReadonlySet<string> = new Set(['05', '09', '10']);

const MAXIMO_SUSTENTO = 250;
const MINIMO_SUSTENTO = 3;

/**
 * Valor ×100 en enteros, como valida y suma el backend (nunca floats sueltos): importes en céntimos
 * y cantidades en centésimas (NUMERIC(10,2)).
 */
export function centesimas(valor: number): number {
  return Math.round((Number(valor) || 0) * 100 + 1e-7);
}

function conDosDecimales(valor: number): boolean {
  return Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6;
}

/**
 * Total (en céntimos) de una devolución por ítem (07), con la misma regla que el backend
 * (planificarNota): cada línea acredita la parte proporcional de lo que queda de ella y el recargo
 * por tarjeta va en proporción a lo devuelto (completo si con esta nota ya no queda nada).
 */
export function estimarDevolucion(items: readonly ItemNotaCredito[], cantidades: Readonly<Record<number, number | null>>): number {
  const productos = items.filter((i) => !i.es_recargo);
  const agotados = new Set<number>();
  let devuelto = 0;
  for (const item of productos) {
    const cantidad = Number(cantidades[item.id_item] ?? 0);
    if (!(cantidad > 0) || item.cantidad_disponible <= 0) continue;
    const disponible = centesimas(item.importe_disponible);
    const todo = centesimas(cantidad) === centesimas(item.cantidad_disponible);
    const bruto = centesimas(item.precio_unitario * cantidad);
    const acreditado = Math.min(bruto, todo ? disponible : Math.round((disponible * cantidad) / item.cantidad_disponible));
    devuelto += acreditado;
    if (todo || acreditado >= disponible) agotados.add(item.id_item);
  }
  if (devuelto <= 0) return 0;

  const totalProductos = productos.reduce((suma, i) => suma + centesimas(i.total_origen), 0);
  const cierra = productos.every(
    (i) => agotados.has(i.id_item) || i.cantidad_disponible <= 0 || i.importe_disponible <= 0,
  );
  const recargo = items
    .filter((i) => i.es_recargo && i.importe_disponible > 0)
    .reduce((suma, r) => {
      const disponible = centesimas(r.importe_disponible);
      const proporcional = totalProductos > 0 ? Math.round((centesimas(r.total_origen) * devuelto) / totalProductos) : 0;
      return suma + (cierra ? disponible : Math.min(disponible, proporcional));
    }, 0);
  return devuelto + recargo;
}

/**
 * Asistente de nota de crédito sobre una factura o boleta aceptada (PLAN V3, D8), en un modal.
 * REUTILIZABLE: Documentos lo abre desde la lista o el detalle y Ventas desde «Documentos de la venta».
 *
 * - `idComprobante` (obligatorio): comprobante origen. Carga GET /comprobante/:id/nota-credito/contexto.
 * - `(emitida)`: la nota ya se envió a SUNAT (aceptada, rechazada o en proceso); trae su respuesta.
 *   El asistente sigue abierto mostrando el resultado hasta que el usuario lo cierre.
 * - `(cerrado)`: el usuario cerró el asistente (con o sin emitir). Quien lo abrió lo quita del DOM.
 *
 * Solo ofrece los motivos que el backend admite para ese comprobante, aplica los topes de cada forma
 * (unidades, descuento por línea, importe) y no deja enviar dos veces. La nota se envía a SUNAT en el
 * acto: el resultado (y los efectos en stock y cuenta por cobrar) se ve apenas responde.
 */
@Component({
  selector: 'app-nota-credito-asistente',
  standalone: true,
  imports: [CommonModule, FormsModule, NumeroDirective, ResultadoSunatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nota-credito-asistente.component.html',
  styleUrl: './nota-credito-asistente.component.css',
})
export class NotaCreditoAsistenteComponent implements OnChanges {
  @Input({ required: true }) idComprobante!: number;
  @Output() readonly emitida = new EventEmitter<NotaCreditoEmitida>();
  @Output() readonly cerrado = new EventEmitter<void>();

  readonly nombreForma = NOMBRE_FORMA;
  readonly maximoSustento = MAXIMO_SUSTENTO;
  readonly claseInsignia = claseInsignia;
  readonly textoEstadoSunat = textoEstadoSunat;
  readonly tonoEstadoSunat = tonoEstadoSunat;

  contexto: ContextoNotaCredito | null = null;
  cargando = false;
  errorCarga = '';
  paso: PasoAsistente = 'motivo';
  motivo: MotivoNotaCredito | null = null;
  cantidades: Record<number, number | null> = {};
  descuentos: Record<number, number | null> = {};
  monto: number | null = null;
  sustento = '';
  reingresarStock = true;
  /** Errores por línea (id_item → texto), del importe y del conjunto, recalculados en cada cambio. */
  erroresLinea: Record<number, string> = {};
  errorMonto = '';
  errorDetalle = '';
  totalCentimos = 0;
  enviando = false;
  /** idNota: la nota en curso (409); recargar: hay que releer el contexto antes de reintentar. */
  errorEnvio: { titulo: string; mensaje: string; idNota: number | null; recargar: boolean } | null = null;
  resultado: NotaCreditoEmitida | null = null;
  efectos: string[] = [];
  descargando: FormatoPdfComprobante | null = null;

  /** El backend emite notas para admin y vendedor; caja solo puede consultarlas. */
  readonly puedeEmitir: boolean;

  private readonly api = inject(ComprobanteService);
  private readonly alerta = inject(AlertService);
  private readonly fiscal = inject(FiscalEstadoService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private lectura: Subscription | null = null;
  private confirmando = false;
  private reingresoEnviado = false;

  @ViewChild('formNota') private formNota?: NgForm;

  /** Al abrir, el foco entra al modal (Escape lo cierra y el lector de pantalla lo anuncia). */
  @ViewChild('marco')
  set marco(elemento: ElementRef<HTMLElement> | undefined) {
    elemento?.nativeElement.focus();
  }

  constructor() {
    this.puedeEmitir = inject(AuthService).puedeVer(['admin', 'vendedor']);
    this.fiscal.iniciar();
  }

  ngOnChanges(cambios: SimpleChanges): void {
    if (cambios['idComprobante']) this.cargar();
  }

  // ── Datos ────────────────────────────────────────────────────

  cargar(): void {
    this.lectura?.unsubscribe();
    this.cargando = true;
    this.errorCarga = '';
    this.errorEnvio = null;
    this.cdr.markForCheck();
    this.lectura = this.api
      .contextoNotaCredito(this.idComprobante)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (contexto) => {
          this.contexto = contexto;
          this.reiniciar();
        },
        error: (e) => {
          this.contexto = null;
          this.errorCarga = this.mensajeSegunCodigo(e, 'No se pudo preparar la nota de crédito');
        },
      });
  }

  get productos(): ItemNotaCredito[] {
    return (this.contexto?.items ?? []).filter((i) => !i.es_recargo);
  }

  get tieneRecargo(): boolean {
    return (this.contexto?.items ?? []).some((i) => i.es_recargo && i.importe_disponible > 0);
  }

  get simbolo(): string {
    return this.contexto?.origen.moneda === 'USD' ? 'US$' : 'S/';
  }

  get esBeta(): boolean {
    return this.contexto?.origen.ambiente_fiscal === 'beta';
  }

  /** FiscalEstadoService avisa ANTES de emitir que la emisión está detenida (sin esperar el 503). */
  get emisionInactiva(): string | null {
    const estado = this.fiscal.estado();
    if (estado?.emision_activa !== false) return null;
    return estado.motivo || 'La emisión electrónica no está activa.';
  }

  /** El motivo devuelve mercadería y la venta sigue activa: se puede elegir si vuelve al almacén. */
  get ofreceReingreso(): boolean {
    const venta = this.contexto?.venta;
    return !!this.motivo && this.motivo.reingresar_stock !== null && !!venta && venta.estado !== 'anulada';
  }

  // ── Pasos ────────────────────────────────────────────────────

  explicacion(motivo: MotivoNotaCredito): string {
    return EXPLICACION_MOTIVO[motivo.codigo] ?? 'Ajuste del comprobante según el catálogo 09 de SUNAT.';
  }

  elegirMotivo(motivo: MotivoNotaCredito): void {
    if (this.enviando) return;
    this.motivo = motivo;
    this.reingresarStock = motivo.reingresar_stock ?? false;
    this.cantidades = {};
    this.descuentos = {};
    this.monto = null;
    this.errorEnvio = null;
    this.recalcular();
  }

  continuar(): void {
    if (this.motivo && this.puedeEmitir && this.contexto?.permitido) this.paso = 'detalle';
  }

  volver(): void {
    if (this.enviando) return;
    this.paso = 'motivo';
    this.errorEnvio = null;
  }

  /** Recalcula topes, errores y total estimado tras cada cambio de un campo. */
  recalcular(): void {
    this.erroresLinea = {};
    this.errorMonto = '';
    this.errorDetalle = '';
    this.totalCentimos = 0;
    const contexto = this.contexto;
    const motivo = this.motivo;
    if (!contexto || !motivo) return;

    switch (motivo.forma) {
      case 'total':
        this.totalCentimos = centesimas(contexto.saldo);
        break;
      case 'items': {
        const pedidos = this.productos.filter((i) => Number(this.cantidades[i.id_item] ?? 0) > 0);
        for (const item of pedidos) {
          const error = this.errorCantidad(item, Number(this.cantidades[item.id_item]));
          if (error) this.erroresLinea[item.id_item] = error;
        }
        if (!pedidos.length) this.errorDetalle = 'Indique cuántas unidades de al menos un producto se devuelven.';
        else if (!Object.keys(this.erroresLinea).length) this.totalCentimos = estimarDevolucion(contexto.items, this.cantidades);
        break;
      }
      case 'descuento_items': {
        const pedidos = this.productos.filter((i) => Number(this.descuentos[i.id_item] ?? 0) > 0);
        for (const item of pedidos) {
          const error = this.errorDescuento(item, Number(this.descuentos[item.id_item]));
          if (error) this.erroresLinea[item.id_item] = error;
        }
        if (!pedidos.length) this.errorDetalle = 'Indique el descuento de al menos una línea.';
        else if (!Object.keys(this.erroresLinea).length) {
          this.totalCentimos = pedidos.reduce((suma, i) => suma + centesimas(Number(this.descuentos[i.id_item])), 0);
        }
        break;
      }
      case 'monto': {
        const monto = Number(this.monto ?? 0);
        if (!(monto > 0)) this.errorMonto = 'Indique el importe que acredita la nota.';
        else if (!conDosDecimales(monto)) this.errorMonto = 'El importe admite hasta 2 decimales.';
        else if (centesimas(monto) > centesimas(contexto.saldo)) {
          this.errorMonto = `No puede superar el saldo por acreditar (${this.simbolo} ${contexto.saldo.toFixed(2)}).`;
        } else this.totalCentimos = centesimas(monto);
        break;
      }
    }
  }

  get errorSustento(): string {
    const largo = this.sustento.trim().length;
    if (!largo) return 'Escriba el sustento: es el motivo que viaja a SUNAT en la nota.';
    if (largo < MINIMO_SUSTENTO) return `El sustento debe tener al menos ${MINIMO_SUSTENTO} caracteres.`;
    if (largo > MAXIMO_SUSTENTO) return `El sustento admite hasta ${MAXIMO_SUSTENTO} caracteres.`;
    return '';
  }

  /** Lo primero que falta para poder emitir, en palabras ('' = lista para emitir). */
  get pendiente(): string {
    if (!this.puedeEmitir) return 'Solo un administrador o un vendedor puede emitir notas de crédito.';
    if (this.emisionInactiva) return 'La emisión electrónica no está activa: no se puede enviar a SUNAT ahora.';
    if (!this.contexto?.permitido || !this.motivo) return 'Elija el motivo de la nota.';
    if (this.formNota?.invalid) return 'Corrija los importes marcados.';
    if (this.errorDetalle) return this.errorDetalle;
    if (Object.keys(this.erroresLinea).length) return 'Corrija las líneas marcadas.';
    if (this.errorMonto) return this.errorMonto;
    if (this.errorSustento) return this.errorSustento;
    if (this.totalCentimos <= 0) return 'La nota debe acreditar un importe mayor a cero.';
    return '';
  }

  async emitir(): Promise<void> {
    this.recalcular();
    const contexto = this.contexto;
    const motivo = this.motivo;
    if (this.pendiente || this.enviando || this.confirmando || !contexto || !motivo) return;

    this.confirmando = true;
    const total = `${this.simbolo} ${(this.totalCentimos / 100).toFixed(2)}`;
    const confirmado = await this.alerta.confirmar({
      title: '¿Emitir la nota de crédito a SUNAT?',
      message:
        `Se enviará ahora mismo a SUNAT una nota de crédito de ${total} sobre ${contexto.origen.numero_formateado} ` +
        `(motivo ${motivo.codigo}: ${motivo.nombre.toLowerCase()}). Una vez aceptada no se puede deshacer.` +
        (this.esBeta ? ' Es una prueba en SUNAT BETA: no tiene validez tributaria.' : ''),
      confirmText: 'Sí, emitir a SUNAT',
      type: 'question',
    });
    this.confirmando = false;
    if (!confirmado || this.destroyRef.destroyed || this.enviando) return;

    const solicitud = this.solicitud(motivo);
    this.reingresoEnviado = solicitud.reingresar_stock === true;
    this.enviando = true;
    this.errorEnvio = null;
    this.cdr.markForCheck();
    this.api
      .emitirNotaCredito(this.idComprobante, solicitud)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.enviando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (respuesta) => {
          this.resultado = respuesta;
          this.efectos = this.efectosDe(respuesta);
          this.paso = 'resultado';
          this.emitida.emit(respuesta);
        },
        error: (e) => this.mostrarErrorEnvio(e),
      });
  }

  descargarPdf(formato: FormatoPdfComprobante): void {
    const nota = this.resultado;
    if (!nota?.id_comprobante || this.descargando) return;
    this.descargando = formato;
    this.api
      .descargarPdf(nota.id_comprobante, formato)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.descargando = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) =>
          descargarArchivo(blob, nombreDescarga(nota.numero_formateado ?? `nota-${nota.id_comprobante}`, formato === 'ticket' ? 'pdf_ticket' : 'pdf_a4')),
        error: async (e) => this.alerta.error(errorOperativo(await normalizarErrorBlob(e), 'No se pudo descargar el PDF de la nota')),
      });
  }

  /** Abre la nota (la emitida o la que está en curso) en Documentos. */
  verEnDocumentos(id: number | null | undefined): void {
    if (!id) return;
    // Primero se cierra: así la navegación a Documentos es la última y nadie la pisa.
    this.cerrar();
    void this.router.navigate([RUTA_DOCUMENTOS], { queryParams: { comprobante: id } });
  }

  cerrar(): void {
    if (this.enviando) return;
    this.cerrado.emit();
  }

  // ── Interno ──────────────────────────────────────────────────

  private reiniciar(): void {
    this.paso = 'motivo';
    this.motivo = null;
    this.cantidades = {};
    this.descuentos = {};
    this.monto = null;
    // Con un solo motivo posible no hay nada que elegir.
    const motivos = this.contexto?.permitido ? this.contexto.motivos : [];
    if (motivos.length === 1) this.elegirMotivo(motivos[0]);
    else this.recalcular();
  }

  private errorCantidad(item: ItemNotaCredito, cantidad: number): string {
    if (!Number.isFinite(cantidad) || cantidad < 0) return 'Cantidad no válida.';
    if (!conDosDecimales(cantidad)) return 'Admite hasta 2 decimales.';
    if (centesimas(cantidad) > centesimas(item.cantidad_disponible)) {
      return item.cantidad_disponible > 0 ? `Quedan ${item.cantidad_disponible} por devolver.` : 'Ya se devolvió todo.';
    }
    if (item.importe_disponible <= 0) return 'Esta línea ya se acreditó por completo.';
    // El inventario se lleva en unidades enteras (el backend rechaza la fracción si se reingresa).
    if (this.ofreceReingreso && this.reingresarStock && item.id_producto !== null && !Number.isInteger(cantidad)) {
      return 'El almacén cuenta unidades enteras: devuelva unidades completas o desmarque «Reingresar al almacén».';
    }
    return '';
  }

  private errorDescuento(item: ItemNotaCredito, descuento: number): string {
    if (!Number.isFinite(descuento) || descuento < 0) return 'Importe no válido.';
    if (!conDosDecimales(descuento)) return 'Admite hasta 2 decimales.';
    if (centesimas(descuento) > centesimas(item.importe_disponible)) {
      return `No puede superar ${this.simbolo} ${item.importe_disponible.toFixed(2)} (lo que queda de la línea).`;
    }
    return '';
  }

  private solicitud(motivo: MotivoNotaCredito): SolicitudNotaCredito {
    const solicitud: SolicitudNotaCredito = { motivo: motivo.codigo, sustento: this.sustento.trim() };
    if (motivo.forma === 'items') {
      solicitud.items = this.productos
        .filter((i) => Number(this.cantidades[i.id_item] ?? 0) > 0)
        .map((i) => ({ id_item: i.id_item, cantidad: Number(this.cantidades[i.id_item]) }));
    } else if (motivo.forma === 'descuento_items') {
      solicitud.items = this.productos
        .filter((i) => Number(this.descuentos[i.id_item] ?? 0) > 0)
        .map((i) => ({ id_item: i.id_item, descuento: Number(this.descuentos[i.id_item]) }));
    } else if (motivo.forma === 'monto') {
      solicitud.monto = Number(this.monto);
    }
    if (this.ofreceReingreso) solicitud.reingresar_stock = this.reingresarStock;
    return solicitud;
  }

  /** Lo que la nota aceptada ya cambió (stock, cuenta por cobrar), en palabras. */
  private efectosDe(nota: NotaCreditoEmitida): string[] {
    if (!nota.aceptada_sunat) return [];
    if (!nota.efectos_aplicados) {
      return ['SUNAT la aceptó: el stock y la cuenta por cobrar se ajustarán en unos minutos (el sistema lo completa solo).'];
    }
    const venta = this.contexto?.venta;
    const ventaActiva = !!venta && venta.estado !== 'anulada';
    const motivo = this.motivo?.codigo ?? '';
    const efectos: string[] = [];
    if (nota.efecto === 'devolucion' && ventaActiva) {
      efectos.push(this.reingresoEnviado ? 'Stock reingresado al almacén' : 'Lo devuelto no se reingresó al almacén (así lo indicó)');
    }
    if (ventaActiva && (venta?.saldo_cxc ?? 0) > 0 && (nota.efecto === 'devolucion' || MOTIVOS_QUE_BAJAN_DEUDA.has(motivo))) {
      efectos.push('Cuenta por cobrar actualizada');
    }
    if (motivo === '02') efectos.push('El comprobante original quedó anulado: emita el comprobante correcto desde la venta.');
    return efectos;
  }

  private mostrarErrorEnvio(e: unknown): void {
    const estado = (e as { status?: number } | null)?.status;
    const red = esErrorDeRed(e);
    let mensaje = this.mensajeSegunCodigo(e, 'No se pudo emitir la nota de crédito');
    // Sin respuesta no se sabe si la nota llegó a registrarse: se actualiza antes de repetir.
    if (red) mensaje = `${mensaje} La nota pudo quedar registrada: actualice antes de volver a intentarlo.`;
    const idNota = estado === 409 ? Number((e as { error?: { id_comprobante?: unknown } }).error?.id_comprobante) || null : null;
    this.errorEnvio = {
      titulo: red ? 'No se pudo confirmar si la nota se emitió' : 'No se emitió la nota de crédito',
      mensaje,
      idNota,
      recargar: red || estado === 409,
    };
  }

  /** 503 sin la migración de notas o con la emisión detenida: mensaje accionable, no el técnico. */
  private mensajeSegunCodigo(e: unknown, porDefecto: string): string {
    const codigo = codigoDeError(e);
    if (codigo === 'NOTA_CREDITO_MIGRACION_PENDIENTE') {
      return 'Las notas de crédito todavía no están habilitadas en el servidor: falta actualizar su base de datos. Avise a sistemas.';
    }
    const mensaje = mensajeDeError(e, porDefecto);
    if ((e as { status?: number } | null)?.status === 503 && !esErrorDeRed(e)) {
      return `${mensaje} Un administrador puede revisarlo en Facturación SUNAT.`;
    }
    return mensaje;
  }
}
