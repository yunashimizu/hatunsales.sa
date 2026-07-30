import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BannerTienda } from '../../models/tienda.models';

const INTERVALO_MS = 6000;

@Component({
  selector: 'app-hero-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hero-banner.component.html',
  styleUrl: './hero-banner.component.css',
})
export class HeroBannerComponent implements OnInit, OnDestroy {

  @Input() slides: BannerTienda[] = [];

  actual = 0;
  private temporizador?: ReturnType<typeof setInterval>;
  private pausado = false;

  constructor(private readonly router: Router) {}

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
    this.pausado = true;
  }

  reanudar(): void {
    this.pausado = false;
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

    this.temporizador = setInterval(() => {
      if (!this.pausado) this.actual = (this.actual + 1) % this.slides.length;
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
