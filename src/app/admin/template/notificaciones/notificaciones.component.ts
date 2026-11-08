import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostListener,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { AvisoPanel, AvisosPanelService } from '../../service/avisos-panel.service';
import { tiempoRelativo } from '../../../shared/utils/tiempo-relativo';

/** Tiempo con el panel abierto antes de dar los avisos por vistos. */
const ESPERA_VISTOS_MS = 1_500;

/**
 * Campana de la barra superior: un solo lugar con lo que pide atención (SUNAT, stock, pedidos web,
 * cobranza y caja). El contador cuenta los avisos que el usuario aún no vio; el panel los marca como
 * vistos al estar abierto un momento. Esc, un clic fuera o ir a un aviso lo cierran.
 */
@Component({
  selector: 'app-notificaciones',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterModule],
  templateUrl: './notificaciones.component.html',
  styleUrl: './notificaciones.component.scss',
})
export class NotificacionesComponent {
  /** Avisa al abrirse, para que la barra cierre el menú de usuario. */
  @Output() readonly alAbrir = new EventEmitter<void>();

  protected readonly avisos = inject(AvisosPanelService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  abierto = false;
  private readonly ahora = signal(new Date());
  private espera: ReturnType<typeof setTimeout> | null = null;
  private reloj: ReturnType<typeof setInterval> | null = null;

  /** «9+» a partir de diez. */
  protected readonly textoContador = computed(() => {
    const n = this.avisos.noVistos();
    return n > 9 ? '9+' : String(n);
  });
  protected readonly etiquetaBoton = computed(() => {
    const n = this.avisos.noVistos();
    return n === 0 ? 'Avisos: nada nuevo' : `Avisos: ${n} sin ver`;
  });
  protected readonly textoActualizado = computed(() => {
    const cuando = this.avisos.actualizadoEn();
    return cuando ? `Actualizado ${tiempoRelativo(cuando, this.ahora())}` : 'Revisando…';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detenerRelojes());
  }

  alternar(): void {
    if (this.abierto) this.cerrar();
    else this.abrir();
  }

  abrir(): void {
    if (this.abierto) return;
    this.abierto = true;
    this.alAbrir.emit();
    this.ahora.set(new Date());
    this.avisos.refrescar();
    this.detenerRelojes();
    this.espera = setTimeout(() => {
      this.espera = null;
      if (this.abierto) this.avisos.marcarVistos();
    }, ESPERA_VISTOS_MS);
    this.reloj = setInterval(() => this.ahora.set(new Date()), 30_000);
    this.cdr.markForCheck();
  }

  /** Cierra el panel. `devolverFoco` lleva el foco al botón (al usar Esc). */
  cerrar(devolverFoco = false): void {
    if (!this.abierto) return;
    this.abierto = false;
    this.detenerRelojes();
    if (devolverFoco) this.el.nativeElement.querySelector<HTMLElement>('.nt-boton')?.focus();
    this.cdr.markForCheck();
  }

  protected marcarVistos(): void {
    this.avisos.marcarVistos();
  }

  protected trackAviso(_: number, aviso: AvisoPanel): string {
    return aviso.clave;
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar(true);
  }

  @HostListener('document:click', ['$event'])
  protected alClicFuera(evento: MouseEvent): void {
    if (this.abierto && !this.el.nativeElement.contains(evento.target as Node | null)) this.cerrar();
  }

  private detenerRelojes(): void {
    if (this.espera) clearTimeout(this.espera);
    if (this.reloj) clearInterval(this.reloj);
    this.espera = null;
    this.reloj = null;
  }
}
