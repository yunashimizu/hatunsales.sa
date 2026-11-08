import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AlertService } from '../../../shared/services/alert.service';
import { mensajeDeError } from '../../service/api-base.service';
import { ConfigResumenDiario, ResultadoEnvioResumen, ResumenDiarioService } from '../../service/resumen-diario.service';

const PATRON_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const PATRON_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HORA_DEFECTO = '20:30';

/** Los correos escritos separados por coma, punto y coma o salto de línea, sin repetidos (da igual mayúsculas). */
export function separarCorreos(texto: string): string[] {
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const crudo of (texto ?? '').split(/[,;\n]/)) {
    const correo = crudo.trim();
    if (!correo || vistos.has(correo.toLowerCase())) continue;
    vistos.add(correo.toLowerCase());
    lista.push(correo);
  }
  return lista;
}

/** «2026-11-05» → «5 de noviembre» (sin pasar por la zona horaria). */
function diaLegible(ymd: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? '');
  if (!m) return '';
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(m[3])} de ${meses[Number(m[2]) - 1]}`;
}

/**
 * Tarjeta «Resumen diario por correo» de Configuración (solo administrador): interruptor, hora (de Lima), correos y
 * «Enviar ahora de prueba». El servidor envía una sola vez al día; aquí solo se configura y se prueba.
 */
@Component({
  selector: 'app-resumen-diario-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './resumen-diario.component.html',
  styleUrl: './resumen-diario.component.css',
})
export class ResumenDiarioConfigComponent implements OnInit {
  config: ConfigResumenDiario | null = null;
  cargando = false;
  errorCarga = '';
  guardando = false;
  enviando = false;
  /** Resultado de la última prueba: lo enviado o el motivo del fallo. */
  resultado: { ok: boolean; mensaje: string; aviso?: string } | null = null;

  form = { activo: false, hora: HORA_DEFECTO, correos: '' };

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly api: ResumenDiarioService,
    private readonly alerta: AlertService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando = true;
    this.errorCarga = '';
    this.cdr.markForCheck();
    this.api
      .configuracion()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (c) => this.aplicar(c),
        error: (e) => {
          this.errorCarga = mensajeDeError(e, 'No se pudo leer la configuración del resumen diario');
        },
      });
  }

  private aplicar(c: ConfigResumenDiario): void {
    this.config = c;
    this.form = { activo: c.activo, hora: c.hora || HORA_DEFECTO, correos: (c.correos ?? []).join(', ') };
  }

  // ── Validación y estado del formulario ──

  get errorHora(): string {
    return PATRON_HORA.test(this.form.hora) ? '' : 'Escriba la hora completa, por ejemplo 20:30.';
  }

  get errorCorreos(): string {
    const malos = separarCorreos(this.form.correos).filter((c) => !PATRON_CORREO.test(c));
    if (malos.length) return `Estos correos no parecen válidos: ${malos.join(', ')}.`;
    return separarCorreos(this.form.correos).length > 10 ? 'Use como máximo 10 correos.' : '';
  }

  /** Hay cambios sin guardar (la prueba usa lo guardado, no lo que se está escribiendo). */
  get sinGuardar(): boolean {
    const c = this.config;
    if (!c) return false;
    return (
      this.form.activo !== c.activo ||
      this.form.hora !== c.hora ||
      separarCorreos(this.form.correos).join(',') !== (c.correos ?? []).join(',')
    );
  }

  get puedeGuardar(): boolean {
    return !!this.config && !this.guardando && !this.cargando && this.sinGuardar && !this.errorHora && !this.errorCorreos;
  }

  /** A quién llegará si no escribe correos: el del emisor. */
  get destinoActual(): string {
    return (this.config?.destinatarios ?? []).join(', ');
  }

  get explicacion(): string {
    const hora = this.config?.hora || HORA_DEFECTO;
    return (
      `Cada día a las ${hora} recibirás un correo con las ventas, la caja, los comprobantes con problema, ` +
      `la deuda vencida y el stock crítico.`
    );
  }

  get ultimoEnvio(): string {
    return diaLegible(this.config?.ultimo_envio ?? null);
  }

  // ── Acciones ──

  guardar(): void {
    if (!this.puedeGuardar) return;
    this.guardando = true;
    this.cdr.markForCheck();
    this.api
      .guardar({ activo: this.form.activo, hora: this.form.hora, correos: separarCorreos(this.form.correos) })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.guardando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (c) => {
          this.aplicar(c);
          this.resultado = null;
          this.alerta.toast({ type: 'success', title: c.activo ? 'Resumen diario guardado y encendido' : 'Resumen diario guardado (apagado)' });
        },
        error: (e) => {
          this.alerta.error({ title: 'No se pudo guardar el resumen diario', message: mensajeDeError(e) });
        },
      });
  }

  enviarPrueba(): void {
    if (this.enviando || this.sinGuardar || !this.config) return;
    this.enviando = true;
    this.resultado = null;
    this.cdr.markForCheck();
    this.api
      .enviarAhora()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.enviando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (r) => (this.resultado = this.describir(r)),
        error: (e) => {
          this.resultado = { ok: false, mensaje: mensajeDeError(e, 'No se pudo enviar el correo de prueba') };
        },
      });
  }

  private describir(r: ResultadoEnvioResumen): { ok: boolean; mensaje: string; aviso?: string } {
    const quien = r.enviados.join(', ');
    const fallidos = r.fallidos.length ? ` No se pudo enviar a: ${r.fallidos.map((f) => f.correo).join(', ')}.` : '';
    return {
      ok: true,
      mensaje: `Correo de prueba enviado a ${quien}.${fallidos}`,
      aviso:
        r.proveedor === 'archivo'
          ? 'El servidor no tiene un proveedor de correo configurado: el mensaje se guardó como archivo en el servidor y no llegó a ninguna bandeja.'
          : undefined,
    };
  }
}
