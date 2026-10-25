import { DOCUMENT } from '@angular/common';
import { Component, NgZone, afterNextRender, inject, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, Router, RouterOutlet } from '@angular/router';
import { filter, take } from 'rxjs';
import { ToastsComponent } from './shared/components/toasts/toasts.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastsComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('ferreteria');

  constructor() {
    const doc = inject(DOCUMENT);
    const zona = inject(NgZone);
    const router = inject(Router);

    // Pantalla de arranque de index.html: se desvanece al terminar la primera navegación
    // (ya hay contenido que mostrar) y, por si algo la bloquea, se retira sola a los 8 s.
    const quitar = (): void => {
      const arranque = doc.getElementById('hs-arranque');
      if (!arranque) return;
      arranque.classList.add('hs-arranque--sale');
      setTimeout(() => arranque.remove(), 450);
    };

    afterNextRender(() => {
      if (router.navigated) {
        quitar();
        return;
      }
      router.events
        .pipe(
          filter((e) => e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError),
          take(1),
        )
        .subscribe(quitar);
      zona.runOutsideAngular(() => setTimeout(quitar, 8000));
    });
  }
}
