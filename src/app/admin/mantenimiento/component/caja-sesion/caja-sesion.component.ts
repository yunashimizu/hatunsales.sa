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
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './caja-sesion.component.html',
  styleUrl: './caja-sesion.component.css',
})
export class CajaSesionComponent implements OnInit, OnDestroy {
  sesion: SesionCaja | null = null;
  cajas: CajaDisponible[] = [];
  cargando = false;
  abriendo = false;
  cerrando = false;

  idCajaElegida: number | null = null;
  montoInicial: number | null = null;
  montoConteo: number | null = null;
  observacion = '';

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
    this.cargando = true;
    this.cdr.markForCheck();
    this.api.sesion().pipe(takeUntil(this.destruir$)).subscribe({
      next: (s) => {
        this.sesion = s;
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.cargando = false;
        this.cdr.markForCheck();
        this.alerta.error(errorOperativo(err, 'No se pudo cargar la sesión de caja'));
      },
    });
    this.api.disponibles().pipe(takeUntil(this.destruir$)).subscribe({
      next: (r) => {
        this.cajas = Array.isArray(r?.items) ? r.items : [];
        if (this.idCajaElegida == null) {
          const libre = this.cajas.find((c) => !c.ocupada);
          this.idCajaElegida = libre?.id_caja ?? null;
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.cajas = [];
        this.cdr.markForCheck();
      },
    });
  }

  abrir(): void {
    if (!this.idCajaElegida) {
      this.alerta.toast({ type: 'warning', title: 'Elige una caja' });
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

  async cerrar(): Promise<void> {
    if (!this.apertura) return;
    const r = this.sesion?.resumen;
    const detalleMetodos = (r?.por_metodo || [])
      .map((m) => `${m.metodo}: S/ ${Number(m.total).toFixed(2)}`)
      .join(' · ');
    const ok = await this.alerta.confirm({
      title: '¿Cerrar caja?',
      allowHtml: true,
      message:
        `Se cerrará <strong>${this.apertura.caja_nombre}</strong>.<br>` +
        `Turno: <strong>${r?.ventas ?? 0}</strong> ventas · ` +
        `total <strong>S/ ${Number(r?.total ?? 0).toFixed(2)}</strong>` +
        (detalleMetodos ? `<br>${detalleMetodos}` : '') +
        `<br><span class="adm-ayuda">Modo blando: puede seguir vendiendo sin caja abierta.</span>`,
      confirmText: 'Sí, cerrar',
    });
    if (!ok.isConfirmed) return;

    this.cerrando = true;
    this.cdr.markForCheck();
    this.api
      .cerrar({
        id_apertura: this.apertura.id_apertura,
        monto_conteo: this.montoConteo,
        observacion: this.observacion?.trim() || null,
      })
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (resp) => {
          this.cerrando = false;
          this.montoConteo = null;
          this.observacion = '';
          const total = resp?.resumen?.total;
          this.alerta.success({
            title: 'Caja cerrada',
            message:
              total != null
                ? `Resumen del turno: ${resp.resumen?.ventas ?? 0} ventas · S/ ${Number(total).toFixed(2)}`
                : 'Turno cerrado correctamente.',
            timer: 3500,
          });
          this.cargarTodo();
        },
        error: (err) => {
          this.cerrando = false;
          this.cdr.markForCheck();
          this.alerta.error(errorOperativo(err, mensajeDeError(err, 'No se pudo cerrar')));
        },
      });
  }

  etiquetaModo(modo?: string): string {
    return modo === 'estricto' ? 'Estricto' : 'Blando';
  }
}
