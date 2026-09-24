import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { FooterComponent } from '../footer/footer.component';

/** Mismo punto de corte que el CSS del sidebar (cajón sobre el contenido). */
const MEDIA_MOVIL = '(max-width: 900px)';

@Component({
  selector: 'app-template',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, HeaderComponent, SidebarComponent, FooterComponent],
  templateUrl: './template.component.html',
  styleUrl: './template.component.scss',
})
export class TemplateComponent implements OnInit {
  sidebarCollapsed = false;

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    // En móvil el menú es un cajón: arranca cerrado y se cierra al navegar,
    // para que no tape la página. En escritorio se mantiene abierto.
    this.sidebarCollapsed = this.esMovil();
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.esMovil() && !this.sidebarCollapsed) {
          this.sidebarCollapsed = true;
          this.cdr.markForCheck();
        }
      });
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  private esMovil(): boolean {
    return typeof window !== 'undefined' && window.matchMedia(MEDIA_MOVIL).matches;
  }
}
