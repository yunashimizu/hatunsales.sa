import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AlertService } from '../../../../shared/services/alert.service';
import { errorOperativo, mensajeDeError } from '../../../service/api-base.service';
import { CajaArqueoComponent } from './caja-arqueo.component';
import {
  AperturaCaja,
  CajaDisponible,
  CajaSesionService,
  SesionCaja,
} from '../../../service/caja-sesion.service';

@Component({
  selector: 'app-caja-sesion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, CajaArqueoComponent],
  templateUrl: './caja-sesion.component.html',
  styleUrl: './caja-sesion.component.css',
})
export class CajaSesionComponent implements OnInit, OnDestroy {
  sesion: SesionCaja | null = null;
  cajas: CajaDisponible[] = [];
  cargando = false;
  cargandoCajas = false;
  errorSesion = '';
  errorCajas = '';
  abriendo = false;
  idTurnoArqueo: number | null = null;
  arqueoDisponible: boolean | null = null;
  cerrando = false;
  montoConteo: number | null = null;
  observacion = '';

  idCajaElegida: number | null = null;
  montoInicial: number | null = null;

  private readonly destruir$ = new Subject<void>();
  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private readonly api: CajaSesionService,
    private readonly alerta: AlertService,
  ) {}

  ngOnInit(): void {
    this.cargarTodo();
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  get apertura(): AperturaCaja | null {
    return this.sesion?.apertura ?? null;
  }

  get cajasLibres(): CajaDisponible[] {
    return this.cajas.filter((c) => !c.ocupada);
  }

  cargarTodo(): void {
    if (this.cargando || this.cargandoCajas) return;
    this.cargando = true;
    this.cargandoCajas = true;
    this.errorSesion = '';
    this.errorCajas = '';
    this.cdr.markForCheck();
    this.api.sesion().pipe(takeUntil(this.destruir$)).subscribe({
      next: (s) => {
        this.sesion = s;
        if (s.apertura) this.idTurnoArqueo = s.apertura.id_apertura;
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.cargando = false;
        this.errorSesion = mensajeDeError(err, 'No se pudo consultar el estado de la caja');
        this.cdr.markForCheck();
        this.alerta.error(errorOperativo(err, 'No se pudo cargar la sesión de caja'));
      },
    });
    this.api.disponibles().pipe(takeUntil(this.destruir$)).subscribe({
      next: (r) => {
        this.cargandoCajas = false;
        this.cajas = Array.isArray(r?.items) ? r.items : [];
        if (!this.cajasLibres.some(c => c.id_caja === this.idCajaElegida)) {
          const libre = this.cajas.find((c) => !c.ocupada);
          this.idCajaElegida = libre?.id_caja ?? null;
        }
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.cargandoCajas = false;
        this.errorCajas = mensajeDeError(error, 'No se pudieron consultar las cajas disponibles');
        this.cajas = [];
        this.cdr.markForCheck();
      },
    });
  }

  abrir(): void {
    if (this.abriendo || this.cargando || this.cargandoCajas || this.errorSesion || this.errorCajas || this.apertura) return;
    if (!this.idCajaElegida || !this.cajasLibres.some(c => c.id_caja === this.idCajaElegida)) {
      this.alerta.toast({ type: 'warning', title: 'Elige una caja' });
      return;
    }
    if (this.montoInicial !== null && (!Number.isFinite(this.montoInicial) || this.montoInicial < 0 || this.montoInicial > 10_000_000)) {
      this.alerta.toast({ type: 'warning', title: 'El monto inicial debe estar entre 0 y S/ 10 000 000.' });
      return;
    }
    this.abriendo = true;
    this.cdr.markForCheck();
    this.api
      .abrir({
        id_caja: this.idCajaElegida,
        monto_inicial: this.montoInicial,
      })
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: () => {
          this.abriendo = false;
          this.montoInicial = null;
          this.alerta.toast({ type: 'success', title: 'Caja abierta' });
          this.cargarTodo();
        },
        error: (err) => {
          this.abriendo = false;
          this.cdr.markForCheck();
          this.alerta.error(errorOperativo(err, 'No se pudo abrir la caja'));
        },
      });
  }

  etiquetaModo(modo?: string): string {
    return modo === 'estricto' ? 'Estricto' : 'Blando';
  }

  /** Conserva el cierre existente mientras se despliega el módulo de arqueo. */
  async cerrarSinArqueo(): Promise<void> {
    const apertura = this.apertura;
    if (!apertura || this.cerrando || this.cargando || this.errorSesion || this.arqueoDisponible !== false) return;
    if (this.montoConteo !== null && (!Number.isFinite(this.montoConteo) || this.montoConteo < 0 || this.montoConteo > 10_000_000)) {
      this.alerta.toast({ type: 'warning', title: 'Revise el monto contado al cerrar.' });
      return;
    }
    this.cerrando = true;
    const respuesta = await this.alerta.confirm({
      title: '¿Cerrar turno?',
      message: `Se cerrará ${apertura.caja_nombre}. El módulo de arqueo aún está pendiente de habilitar en el servidor.`,
      confirmText: 'Cerrar turno',
    });
    if (!respuesta.isConfirmed || this.destruir$.isStopped) {
      this.cerrando = false;
      this.cdr.markForCheck();
      return;
    }
    this.api.cerrar({ id_apertura: apertura.id_apertura, monto_conteo: this.montoConteo, observacion: this.observacion.trim() || null })
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: () => {
          this.cerrando = false;
          this.montoConteo = null;
          this.observacion = '';
          this.alerta.toast({ type: 'success', title: 'Turno cerrado' });
          this.cargarTodo();
        },
        error: error => {
          this.cerrando = false;
          this.cdr.markForCheck();
          this.alerta.error(errorOperativo(error, 'No se pudo cerrar el turno'));
        },
      });
  }
}
