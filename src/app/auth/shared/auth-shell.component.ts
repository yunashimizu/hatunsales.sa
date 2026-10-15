import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  Input,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { AnimationItem } from 'lottie-web';
import gsap from 'gsap';

@Component({
  selector: 'app-auth-shell',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.css',
})
export class AuthShellComponent implements AfterViewInit, OnDestroy {
  @Input() modo: 'login' | 'registro' = 'login';

  @ViewChild('lottieHost') lottieHost?: ElementRef<HTMLDivElement>;
  @ViewChild('shellRoot') shellRoot?: ElementRef<HTMLElement>;

  private animacion?: AnimationItem;
  private contexto?: gsap.Context;
  private destruido = false;
  private readonly enBrowser: boolean;

  readonly beneficios = [
    { icono: 'bi-truck', titulo: 'Envíos rápidos', texto: 'A todo el Perú', tono: 'bg-sky-100 text-sky-700' },
    { icono: 'bi-shield-check', titulo: 'Compra segura', texto: 'Datos cifrados', tono: 'bg-indigo-100 text-indigo-700' },
    { icono: 'bi-star', titulo: 'Calidad', texto: 'Marcas top', tono: 'bg-amber-100 text-amber-700' },
    { icono: 'bi-headset', titulo: 'Soporte', texto: 'Te ayudamos', tono: 'bg-emerald-100 text-emerald-700' },
  ];

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.enBrowser = isPlatformBrowser(platformId);
  }

  ngAfterViewInit(): void {
    if (!this.enBrowser) return;
    void this.montarLottie();
    this.contexto = gsap.context(() => this.animarEntrada(), this.shellRoot?.nativeElement);
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.animacion?.destroy();
    this.contexto?.revert();
  }

  private async montarLottie(): Promise<void> {
    const host = this.lottieHost?.nativeElement;
    if (!host) return;

    // Lottie inspecciona canvas al importar: cargarlo solo en el navegador,
    // después de montar la vista, también permite renderizar el login con SSR.
    let lottie: typeof import('lottie-web')['default'];
    try {
      lottie = (await import('lottie-web')).default;
    } catch {
      return; // La animación es decorativa; el formulario sigue disponible.
    }
    if (this.destruido) return;
    this.animacion = lottie.loadAnimation({
      container: host,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: 'https://assets2.lottiefiles.com/packages/lf20_jbrw3hcz.json',
    });

    this.contexto?.add(() => gsap.to(host, {
      y: -10,
      duration: 2.4,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    }));
  }

  private animarEntrada(): void {
    const root = this.shellRoot?.nativeElement;
    if (!root) return;

    gsap.from(root.querySelectorAll('[data-auth-enter]'), {
      opacity: 0,
      y: 24,
      filter: 'blur(6px)',
      duration: 0.7,
      stagger: 0.08,
      ease: 'power3.out',
    });
  }
}
