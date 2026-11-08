import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { AlertService } from '../../../../shared/services/alert.service';
import { AlertasFiscalesApi, EstadoSecretoRecifrado, LlaveFiscalApi, ResultadoRecifrado } from '../../../models/fiscal.models';
import { mensajeDeError } from '../../../service/api-base.service';
import { FiscalAdminService } from '../../../service/fiscal-admin.service';

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lo que cada estado de un secreto significa para quien administra, en palabras llanas. */
export const TEXTO_ESTADO_SECRETO: Record<EstadoSecretoRecifrado, string> = {
  al_dia: 'Ya estaba con la llave vigente',
  con_llave_anterior: 'Todavía depende de la llave anterior',
  recifrado: 'Re-cifrado con la llave vigente',
  falta: 'No hay nada guardado',
  ilegible: 'No se puede abrir: vuelva a cargarlo',
  sin_cifrado: 'El servidor no tiene la llave vigente',
};

/**
 * Tarjeta «Llave y alertas» de Facturación SUNAT (administrador): estado de la llave de seguridad del servidor
 * (FISCAL_SECRET_KEY) con el botón «Re-cifrar ahora» para terminar una rotación sin perder secretos, y el correo
 * al que llegan los avisos diarios (certificado por vencer, envíos que requieren revisión…).
 */
@Component({
  selector: 'app-llave-alertas-sunat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './llave-alertas-sunat.component.html',
  styleUrl: './llave-alertas-sunat.component.css',
})
export class LlaveAlertasSunatComponent implements OnInit {
  /** Se re-cifró algo: el panel puede volver a leer su estado (el aviso de la llave sale del checklist). */
  @Output() readonly cambio = new EventEmitter<void>();

  llave: LlaveFiscalApi | null = null;
  alertas: AlertasFiscalesApi | null = null;
  cargando = false;
  error = '';

  correo = '';
  guardandoCorreo = false;
  recifrando = false;
  resultado: ResultadoRecifrado | null = null;

  readonly textoEstado = TEXTO_ESTADO_SECRETO;

  private readonly api = inject(FiscalAdminService);
  private readonly alerta = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.cargar();
  }

  get correoValido(): boolean {
    const texto = this.correo.trim();
    return texto === '' || CORREO_VALIDO.test(texto);
  }

  get correoCambiado(): boolean {
    return this.correo.trim().toLowerCase() !== (this.alertas?.correo ?? '');
  }

  get destino(): string {
    const a = this.alertas;
    if (!a?.correo_efectivo) return 'Todavía no hay un correo para los avisos: escriba uno o configure el correo del emisor.';
    return a.origen === 'configurado'
      ? `Los avisos llegan a ${a.correo_efectivo}.`
      : `Sin un correo propio, los avisos llegan al del emisor (${a.correo_efectivo}).`;
  }

  get rotacionEnCurso(): boolean {
    return !!this.llave?.anterior_definida;
  }

  get pendientes(): number {
    return this.llave?.secretos_con_llave_anterior ?? 0;
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';
    forkJoin({ estado: this.api.estadoCompleto(), alertas: this.api.alertas() })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ estado, alertas }) => {
          this.llave = estado.llave ?? { anterior_definida: false, secretos_con_llave_anterior: 0 };
          this.alertas = alertas;
          this.correo = alertas.correo ?? '';
        },
        error: (e) => {
          this.error = mensajeDeError(e, 'No se pudo consultar la llave de seguridad ni los avisos');
        },
      });
  }

  guardarCorreo(): void {
    if (this.guardandoCorreo || !this.correoValido) return;
    this.guardandoCorreo = true;
    this.api
      .guardarAlertas(this.correo.trim())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.guardandoCorreo = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (alertas) => {
          this.alertas = alertas;
          this.correo = alertas.correo ?? '';
          this.alerta.toast({ type: 'success', title: alertas.correo ? 'Correo de avisos guardado' : 'Se usará el correo del emisor' });
        },
        error: (e) => {
          void this.alerta.error({ title: 'No se pudo guardar el correo', message: mensajeDeError(e, 'Intente de nuevo en unos segundos') });
        },
      });
  }

  async recifrar(): Promise<void> {
    if (this.recifrando) return;
    const confirmado = await this.alerta.confirmar({
      title: '¿Re-cifrar los secretos ahora?',
      message:
        'Se vuelven a guardar con la llave de seguridad vigente la clave SOL, las credenciales de la guía de remisión y los certificados. ' +
        'No cambia ningún dato y no interrumpe las ventas. Queda registrado con su usuario.',
      confirmText: 'Sí, re-cifrar',
      type: 'question',
    });
    if (!confirmado || this.destroyRef.destroyed || this.recifrando) return;

    this.recifrando = true;
    this.cdr.markForCheck();
    this.api
      .recifrarSecretos()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.recifrando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (resultado) => {
          this.resultado = resultado;
          this.llave = {
            anterior_definida: this.llave?.anterior_definida ?? false,
            secretos_con_llave_anterior: resultado.detalle.filter((d) => d.estado === 'con_llave_anterior').length,
          };
          this.alerta.toast({
            type: resultado.ilegibles ? 'warning' : 'success',
            title: resultado.recifrados ? `Re-cifrados: ${resultado.recifrados}` : 'Todo ya estaba con la llave vigente',
          });
          this.cambio.emit();
        },
        error: (e) => {
          void this.alerta.error({ title: 'No se pudo re-cifrar', message: mensajeDeError(e, 'Intente de nuevo en unos segundos') });
        },
      });
  }
}
