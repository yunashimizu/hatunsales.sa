import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subscription, finalize, forkJoin, map, of, switchMap } from 'rxjs';
import { AlertService } from '../../../../shared/services/alert.service';
import { descargarArchivo } from '../../../../shared/utils/descargar-archivo';
import {
  ArqueoEsperado,
  ArqueoResumen,
  MovimientoCaja,
  RegistrarArqueo,
} from '../../../models/caja-arqueo.models';
import {
  errorOperativo,
  mensajeDeError,
  normalizarErrorBlob,
} from '../../../service/api-base.service';
import { CajaArqueoService } from '../../../service/caja-arqueo.service';
import { CajaSesionService } from '../../../service/caja-sesion.service';

@Component({
  selector: 'app-caja-arqueo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './caja-arqueo.component.html',
  styleUrl: './caja-arqueo.component.css',
})
export class CajaArqueoComponent implements OnChanges {
  @Input({ required: true }) idApertura!: number;
  @Output() actualizado = new EventEmitter<void>();
  @Output() disponibilidad = new EventEmitter<boolean | null>();
  esperado: ArqueoEsperado | null = null;
  historial: ArqueoResumen[] = [];
  movimientos: MovimientoCaja[] = [];
  denominaciones: {
    tipo: 'billete' | 'moneda';
    denominacion: number;
    etiqueta: string;
    cantidad: number | null;
  }[] = [];
  medios: { id_metodo: number; nombre: string; declarado: number | null }[] = [];
  porDenominacion = true;
  efectivoManual: number | null = null;
  observacion = '';
  cargando = false;
  guardando = false;
  errorCarga = '';
  cierrePendiente: ArqueoResumen | null = null;
  movimiento = {
    tipo: 'ingreso' as 'ingreso' | 'egreso',
    monto: null as number | null,
    descripcion: '',
  };
  guardandoMovimiento = false;
  descargando: number | null = null;
  private intento: { contenido: string; clave: string } | null = null;
  private carga?: Subscription;
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly api = inject(CajaArqueoService);
  private readonly sesiones = inject(CajaSesionService);
  private readonly alerta = inject(AlertService);

  ngOnChanges(): void {
    this.esperado = null;
    this.denominaciones = [];
    this.medios = [];
    this.efectivoManual = null;
    this.observacion = '';
    this.cierrePendiente = null;
    this.intento = null;
    this.cargar();
  }

  cargar(): void {
    if (this.guardando || this.guardandoMovimiento) return;
    this.carga?.unsubscribe();
    this.cargando = true;
    this.disponibilidad.emit(null);
    this.errorCarga = '';
    this.carga = forkJoin({
      esperado: this.api.esperado(this.idApertura),
      historial: this.api.historial(this.idApertura),
      movimientos: this.api.movimientos(this.idApertura),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (r) => {
          this.disponibilidad.emit(true);
          this.esperado = r.esperado;
          if (!r.esperado.apertura.abierta) this.cierrePendiente = null;
          this.historial = r.historial.items;
          this.movimientos = r.movimientos.items;
          this.denominaciones = r.esperado.denominaciones.map((d) => ({
            ...d,
            cantidad:
              this.denominaciones.find((a) => a.denominacion === d.denominacion)?.cantidad ?? 0,
          }));
          this.medios = r.esperado.medios_declarables.map((m) => ({
            ...m,
            declarado: this.medios.find((a) => a.id_metodo === m.id_metodo)?.declarado ?? null,
          }));
        },
        error: (error) => {
          const noDisponible =
            (error.status === 404 && !error.error?.codigo) ||
            error.error?.codigo === 'CAJA_ESQUEMA_PENDIENTE';
          if (noDisponible) this.disponibilidad.emit(false);
          this.errorCarga = noDisponible
            ? 'El arqueo está pendiente de habilitar en el servidor. Puede usar el cierre de turno disponible arriba.'
            : mensajeDeError(error, 'No se pudo cargar el arqueo del turno');
        },
      });
  }

  get contado(): number {
    if (!this.porDenominacion) return this.efectivoManual ?? 0;
    return (
      this.denominaciones.reduce(
        (suma, d) => suma + Math.round(d.denominacion * 100) * (d.cantidad ?? 0),
        0,
      ) / 100
    );
  }

  get diferencia(): number {
    return (
      (Math.round(this.contado * 100) - Math.round((this.esperado?.efectivo.esperado ?? 0) * 100)) /
      100
    );
  }

  esperadoMedio(id: number): number {
    return this.esperado?.otros_medios.find((m) => m.id_metodo === id)?.esperado ?? 0;
  }

  get requiereObservacion(): boolean {
    const tolerancia = Math.round((this.esperado?.tolerancia ?? 0) * 100);
    return (
      Math.abs(Math.round(this.diferencia * 100)) > tolerancia ||
      this.medios.some(
        (m) =>
          m.declarado !== null &&
          Math.abs(
            Math.round(m.declarado * 100) - Math.round(this.esperadoMedio(m.id_metodo) * 100),
          ) > tolerancia,
      )
    );
  }

  async registrar(tipo: 'parcial' | 'cierre'): Promise<void> {
    if (
      this.guardando ||
      this.guardandoMovimiento ||
      this.cargando ||
      this.cierrePendiente ||
      this.errorCarga ||
      !this.esperado?.apertura.abierta
    )
      return;
    const montoValido = (n: number | null): n is number =>
      n !== null && Number.isFinite(n) && n >= 0 && n <= 10_000_000;
    const conteoValido = this.porDenominacion
      ? this.denominaciones.every(
          (d) =>
            Number.isInteger(d.cantidad ?? 0) &&
            (d.cantidad ?? 0) >= 0 &&
            (d.cantidad ?? 0) <= 100_000,
        )
      : montoValido(this.efectivoManual);
    if (
      !conteoValido ||
      !montoValido(this.contado) ||
      this.medios.some((m) => m.declarado !== null && !montoValido(m.declarado))
    ) {
      this.alerta.toast({
        type: 'warning',
        title: 'Revise el conteo: cantidades enteras y montos no negativos.',
      });
      return;
    }
    if (this.requiereObservacion && this.observacion.trim().length < 5) {
      this.alerta.toast({
        type: 'warning',
        title: 'Explique la diferencia con al menos 5 caracteres.',
      });
      return;
    }
    this.guardando = true;
    if (tipo === 'cierre') {
      const respuesta = await this.alerta.confirm({
        title: '¿Guardar arqueo y cerrar turno?',
        message: `Efectivo contado: S/ ${this.contado.toFixed(2)}. Diferencia: S/ ${this.diferencia.toFixed(2)}.`,
        confirmText: 'Guardar y cerrar',
      });
      if (!respuesta.isConfirmed || this.destroyRef.destroyed) {
        this.guardando = false;
        this.cdr.markForCheck();
        return;
      }
    }
    const body: RegistrarArqueo = {
      id_apertura: this.idApertura,
      tipo,
      ...(this.porDenominacion
        ? {
            denominaciones: this.denominaciones.map((d) => ({
              tipo: d.tipo,
              denominacion: d.denominacion,
              cantidad: d.cantidad ?? 0,
            })),
          }
        : { efectivo_contado: this.efectivoManual! }),
      medios: this.medios
        .filter((m) => m.declarado !== null)
        .map((m) => ({ id_metodo: m.id_metodo, declarado: m.declarado! })),
      ...(this.observacion.trim() ? { observacion: this.observacion.trim() } : {}),
    };
    const contenido = JSON.stringify(body);
    if (this.intento?.contenido !== contenido) {
      this.intento = {
        contenido,
        clave:
          globalThis.crypto?.randomUUID?.() ??
          `arqueo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };
    }
    body.clave_idempotencia = this.intento.clave;
    this.api
      .registrar(body)
      .pipe(
        switchMap((arqueo) => {
          this.intento = null;
          if (tipo === 'parcial') return of(arqueo);
          this.cierrePendiente = arqueo;
          return this.sesiones
            .cerrar({ id_apertura: this.idApertura, id_arqueo: arqueo.id_arqueo })
            .pipe(map(() => arqueo));
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.guardando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => this.registroCompletado(tipo),
        error: (error) => {
          this.alerta.error(
            errorOperativo(
              error,
              this.cierrePendiente
                ? 'El arqueo se guardó; falta cerrar el turno'
                : 'No se pudo guardar el arqueo',
            ),
          );
        },
      });
  }

  reintentarCierre(): void {
    if (!this.cierrePendiente || this.guardando) return;
    this.guardando = true;
    this.sesiones
      .cerrar({ id_apertura: this.idApertura, id_arqueo: this.cierrePendiente.id_arqueo })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.guardando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => this.registroCompletado('cierre'),
        error: (e) => this.alerta.error(errorOperativo(e, 'No se pudo cerrar el turno')),
      });
  }

  private registroCompletado(tipo: 'parcial' | 'cierre'): void {
    this.cierrePendiente = null;
    this.alerta.toast({
      type: 'success',
      title: tipo === 'cierre' ? 'Arqueo guardado y turno cerrado' : 'Arqueo parcial guardado',
    });
    this.actualizado.emit();
    // La suscripción aún no ha finalizado: permite refrescar sin duplicar la escritura.
    this.guardando = false;
    this.cargar();
  }

  registrarMovimiento(): void {
    if (
      this.guardandoMovimiento ||
      this.guardando ||
      this.cargando ||
      this.cierrePendiente ||
      !this.esperado?.apertura.abierta
    )
      return;
    const { monto, tipo } = this.movimiento;
    const descripcion = this.movimiento.descripcion.trim();
    if (
      monto === null ||
      !Number.isFinite(monto) ||
      monto <= 0 ||
      monto > 10_000_000 ||
      descripcion.length < 3 ||
      descripcion.length > 200
    ) {
      this.alerta.toast({
        type: 'warning',
        title: 'Ingrese un monto positivo y un motivo de al menos 3 caracteres.',
      });
      return;
    }
    this.guardandoMovimiento = true;
    this.api
      .registrarMovimiento({ id_apertura: this.idApertura, tipo, monto, descripcion })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.guardandoMovimiento = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.movimiento = { tipo: 'ingreso', monto: null, descripcion: '' };
          this.alerta.toast({ type: 'success', title: 'Movimiento registrado' });
          this.actualizado.emit();
          this.guardandoMovimiento = false;
          this.cargar();
        },
        error: (e) => this.alerta.error(errorOperativo(e, 'No se pudo registrar el movimiento')),
      });
  }

  descargar(arqueo: ArqueoResumen, formato: 'ticket' | 'a4'): void {
    if (this.descargando !== null) return;
    this.descargando = arqueo.id_arqueo;
    this.api
      .pdf(arqueo.id_arqueo, formato)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.descargando = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) => descargarArchivo(blob, `${arqueo.codigo}-${formato}.pdf`),
        error: async (e) =>
          this.alerta.error(
            errorOperativo(await normalizarErrorBlob(e), 'No se pudo descargar el arqueo'),
          ),
      });
  }
}
