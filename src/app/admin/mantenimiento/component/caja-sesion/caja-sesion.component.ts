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
  LineaConteo,
  MAX_CANTIDAD_DENOMINACION,
  cantidadValida,
  hayConteo,
  lineasConteoVacias,
  subtotalCentimos,
  totalConteoSoles,
} from './conteo-denominaciones';
import {
  AbrirCajaBody,
  AperturaCaja,
  CajaDisponible,
  CajaSesionService,
  SesionCaja,
} from '../../../service/caja-sesion.service';

/** Tope que acepta el servidor para el efectivo inicial (S/ 9 999 999.99). */
const MONTO_MAXIMO = 9_999_999.99;

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
  /** «Con efectivo» (por defecto) o «Sin efectivo»: lo segundo guarda 0.00 de forma explícita. */
  conEfectivo = true;
  montoInicial: number | null = null;
  /** Se activa al intentar abrir, para mostrar el error del monto sin regañar antes de tiempo. */
  intentoAbrir = false;

  // ── Ayuda para contar billetes y monedas (solo calcula; el servidor nunca recibe el desglose) ──
  desgloseAbierto = false;
  conteo: LineaConteo[] = lineasConteoVacias();
  /** Aviso discreto cuando el cajero edita el monto a mano y se descarta el conteo. */
  avisoDesglose = '';
  readonly maxCantidadDenominacion = MAX_CANTIDAD_DENOMINACION;

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

  get cajaElegida(): CajaDisponible | null {
    return this.cajas.find((c) => c.id_caja === this.idCajaElegida) ?? null;
  }

  /** Efectivo que dejó el último turno cerrado de la caja elegida (null si no hay dato). */
  get sugerido(): number | null {
    const valor = this.cajaElegida?.sugerido_inicial;
    return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
  }

  /** Monto con el que se abriría el turno según lo elegido (null = con efectivo y aún sin monto). */
  get montoAApertura(): number | null {
    if (!this.conEfectivo) return 0;
    return this.montoValido ? this.montoInicial : null;
  }

  get montoValido(): boolean {
    const m = this.montoInicial;
    return typeof m === 'number' && Number.isFinite(m) && m >= 0 && m <= MONTO_MAXIMO;
  }

  /** Mensaje para el campo de monto; vacío si es correcto o no corresponde. */
  get errorMonto(): string {
    if (!this.conEfectivo || this.montoValido) return '';
    if (this.montoInicial === null || this.montoInicial === undefined) {
      return this.intentoAbrir ? 'Indica el efectivo con el que abres, o elige «Sin efectivo».' : '';
    }
    return 'El monto debe estar entre S/ 0 y S/ 9 999 999.99.';
  }

  /**
   * Diferencia en soles (abrir con − sugerido) o null si no hay sugerido o aún no hay monto.
   * Se calcula en céntimos para no arrastrar errores de coma flotante.
   */
  get diferenciaSugerido(): number | null {
    const sugerido = this.sugerido;
    const monto = this.montoAApertura;
    if (sugerido === null || monto === null) return null;
    return (Math.round(monto * 100) - Math.round(sugerido * 100)) / 100;
  }

  get conteoBilletes(): LineaConteo[] {
    return this.conteo.filter((l) => l.tipo === 'billete');
  }

  get conteoMonedas(): LineaConteo[] {
    return this.conteo.filter((l) => l.tipo === 'moneda');
  }

  /** Total contado en soles (las cantidades inválidas no suman). */
  get totalConteo(): number {
    return totalConteoSoles(this.conteo);
  }

  get conteoConDatos(): boolean {
    return hayConteo(this.conteo);
  }

  get conteoTieneErrores(): boolean {
    return this.conteo.some((l) => !cantidadValida(l.cantidad));
  }

  subtotalConteo(linea: LineaConteo): number {
    return subtotalCentimos(linea) / 100;
  }

  cantidadInvalida(linea: LineaConteo): boolean {
    return !cantidadValida(linea.cantidad);
  }

  alternarDesglose(): void {
    this.desgloseAbierto = !this.desgloseAbierto;
    this.cdr.markForCheck();
  }

  /** El total del conteo pasa a «Monto inicial»; el cajero aún puede corregirlo a mano. */
  alCambiarConteo(): void {
    this.avisoDesglose = '';
    this.montoInicial = this.conteoConDatos ? this.totalConteo : null;
    this.cdr.markForCheck();
  }

  /** Si el monto escrito a mano ya no coincide con el conteo, el conteo deja de valer y se descarta. */
  alEditarMonto(): void {
    if (!this.conteoConDatos) return;
    const monto = this.montoInicial;
    if (typeof monto === 'number' && Math.round(monto * 100) === Math.round(this.totalConteo * 100)) return;
    this.descartarConteo('Editaste el monto a mano: se descartó el conteo de billetes y monedas.');
  }

  limpiarConteo(): void {
    if (!this.conteoConDatos) return;
    this.conteo = lineasConteoVacias();
    this.montoInicial = null;
    this.avisoDesglose = '';
    this.cdr.markForCheck();
  }

  private descartarConteo(aviso = ''): void {
    this.conteo = lineasConteoVacias();
    this.avisoDesglose = aviso;
    this.cdr.markForCheck();
  }

  elegirModo(conEfectivo: boolean): void {
    this.conEfectivo = conEfectivo;
    this.cdr.markForCheck();
  }

  usarSugerido(): void {
    const sugerido = this.sugerido;
    if (sugerido === null) return;
    this.conEfectivo = true;
    this.montoInicial = sugerido;
    if (this.conteoConDatos && Math.round(sugerido * 100) !== Math.round(this.totalConteo * 100)) {
      this.descartarConteo('Usaste el monto sugerido: se descartó el conteo de billetes y monedas.');
    }
    this.cdr.markForCheck();
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
    this.intentoAbrir = true;
    if (this.conEfectivo && !this.montoValido) {
      this.cdr.markForCheck();
      this.alerta.toast({ type: 'warning', title: this.errorMonto || 'Revisa el monto inicial.' });
      return;
    }
    this.abriendo = true;
    this.cdr.markForCheck();
    const cuerpo: AbrirCajaBody = this.conEfectivo
      ? { id_caja: this.idCajaElegida, monto_inicial: Math.round((this.montoInicial as number) * 100) / 100 }
      : { id_caja: this.idCajaElegida, sin_efectivo: true };
    this.api
      .abrir(cuerpo)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: () => {
          this.abriendo = false;
          this.montoInicial = null;
          this.conEfectivo = true;
          this.intentoAbrir = false;
          this.descartarConteo();
          this.desgloseAbierto = false;
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
