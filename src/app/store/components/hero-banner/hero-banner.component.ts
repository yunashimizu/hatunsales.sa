import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { BannerTienda } from '../../models/tienda.models';
import { PalabrasPipe } from '../../../shared/ui/palabras.pipe';
import { ParallaxPunteroDirective } from '../../../shared/ui/parallax-puntero.directive';
import { MagneticDirective } from '../../../shared/ui/magnetic.directive';
import { movimientoPermitido } from '../../../shared/ui/movimiento.util';

const INTERVALO_MS = 6000;

/** Herramientas que orbitan el dial del escenario (icono Bootstrap + color de la rampa). */
const HERRAMIENTAS: { icono: string; color: string; nombre: string }[] = [
  { icono: 'bi-hammer', color: 'var(--x-coral)', nombre: 'Herramientas manuales' },
  { icono: 'bi-lightning-charge-fill', color: 'var(--x-amarillo)', nombre: 'Herramientas eléctricas' },
  { icono: 'bi-brush', color: 'var(--x-menta)', nombre: 'Pinturas' },
  { icono: 'bi-plug-fill', color: 'var(--x-cian)', nombre: 'Electricidad' },
  { icono: 'bi-wrench-adjustable', color: 'var(--x-azul)', nombre: 'Gasfitería' },
  { icono: 'bi-shield-check', color: 'var(--x-rosa)', nombre: 'Seguridad' },
];

/** Colores del sticker de cada diapositiva (rota por posición). */
const STICKERS = ['x-sticker--rosa', 'x-sticker--limon', 'x-sticker--menta', 'x-sticker--cielo'];

@Component({
  selector: 'app-hero-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, PalabrasPipe, ParallaxPunteroDirective, MagneticDirective],
  templateUrl: './hero-banner.component.html',
  styleUrl: './hero-banner.component.css',
})
export class HeroBannerComponent implements OnInit, OnDestroy {

  @Input() slides: BannerTienda[] = [];

  actual = 0;
  /** Duración de cada diapositiva (la barra de progreso del CSS la usa). */
  readonly intervalo = INTERVALO_MS;
  readonly herramientas = HERRAMIENTAS;
  /** Cada reinicio del ciclo (cambio de diapositiva, fin de pausa) vuelve a lanzar la barra de progreso. */
  ciclo = 0;
  pausado = false;
  private temporizador?: ReturnType<typeof setInterval>;

  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.iniciar();
  }

  ngOnDestroy(): void {
    this.detener();
  }

  get slide(): BannerTienda | undefined {
    return this.slides[this.actual];
  }

  ir(indice: number): void {
    if (this.slides.length === 0) return;
    this.actual = (indice + this.slides.length) % this.slides.length;
    this.ciclo++;
    this.cdr.markForCheck();
    this.reiniciar();
  }

  siguiente(): void {
    this.ir(this.actual + 1);
  }

  anterior(): void {
    this.ir(this.actual - 1);
  }

  /** El carrusel se detiene mientras el usuario lo está mirando o navegando con teclado. */
  pausar(): void {
    if (this.pausado) return;
    this.pausado = true;
    this.cdr.markForCheck();
  }

  /** Al reanudar empieza un ciclo completo: así la barra de progreso y el temporizador van a la par. */
  reanudar(): void {
    if (!this.pausado) return;
    this.pausado = false;
    this.ciclo++;
    this.reiniciar();
    this.cdr.markForCheck();
  }

  stickerDe(indice: number): string {
    return STICKERS[indice % STICKERS.length];
  }

  /** Dos dígitos para los contadores («01», «02»…). */
  dos(n: number): string {
    return String(n).padStart(2, '0');
  }

  irACta(): void {
    const destino = this.slide?.cta_url;
    if (!destino) return;

    const [ruta, consulta] = destino.split('?');
    const params = Object.fromEntries(new URLSearchParams(consulta ?? ''));
    this.router.navigate([ruta], { queryParams: params });
  }

  private iniciar(): void {
    this.detener();
    if (this.slides.length <= 1) return;
    // Con movimiento reducido no hay cambio automático (el usuario avanza con las flechas).
    if (!movimientoPermitido()) return;

    this.temporizador = setInterval(() => {
      if (!this.pausado) {
        this.actual = (this.actual + 1) % this.slides.length;
        this.ciclo++;
        this.cdr.markForCheck();
      }
    }, INTERVALO_MS);
  }

  private reiniciar(): void {
    this.iniciar();
  }

  private detener(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = undefined;
  }
}
