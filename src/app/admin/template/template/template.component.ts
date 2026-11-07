import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { FooterComponent } from '../footer/footer.component';
import { BarraInferiorComponent } from '../barra-inferior/barra-inferior.component';
import { PaletaComandosComponent } from '../paleta-comandos/paleta-comandos.component';

/** Mismo punto de corte que el CSS del sidebar (cajón sobre el contenido). */
const MEDIA_MOVIL = '(max-width: 900px)';
/** Tablet y portátil chico: el menú arranca plegado (rail de 56 px) para dejar sitio al contenido. */
const MEDIA_TABLET = '(min-width: 901px) and (max-width: 1200px)';
/** Preferencia del usuario: en escritorio se guarda «compacto»; en tablet, «abierto» (lo contrario del arranque). */
const CLAVE_MENU = 'hs.panel.menu';

@Component({
  selector: 'app-template',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, HeaderComponent, SidebarComponent, FooterComponent, PaletaComandosComponent, BarraInferiorComponent],
  templateUrl: './template.component.html',
  styleUrl: './template.component.scss',
})
export class TemplateComponent implements OnInit {
  @ViewChild('contenidoPanel') private contenidoPanel?: ElementRef<HTMLDivElement>;
  sidebarCollapsed = false;

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    // En móvil el menú es un cajón: arranca cerrado y se cierra al navegar,
    // para que no tape la página. En tablet arranca plegado (rail) salvo que el usuario lo haya
    // dejado abierto; en escritorio arranca abierto salvo que lo haya dejado compacto.
    this.sidebarCollapsed = this.plegadoPorDefecto();
    this.vigilarCambioDeAncho();
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        const contenido = this.contenidoPanel?.nativeElement;
        if (contenido) {
          contenido.scrollTop = 0;
          contenido.scrollLeft = 0;
        }
        if (this.esMovil() && !this.sidebarCollapsed) {
          this.sidebarCollapsed = true;
          this.cdr.markForCheck();
        }
      });
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    if (!this.esMovil()) this.guardarMenu(this.sidebarCollapsed);
  }

  /** Estado inicial del menú según el ancho y la preferencia guardada. */
  private plegadoPorDefecto(): boolean {
    if (this.esMovil()) return true;
    const guardado = this.menuGuardado();
    return this.esTablet() ? guardado !== 'abierto' : guardado === 'compacto';
  }

  /** Al cruzar el corte de móvil / tablet / escritorio, el menú adopta el estado que le toca. */
  private vigilarCambioDeAncho(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const alCambiar = () => {
      this.sidebarCollapsed = this.plegadoPorDefecto();
      this.cdr.markForCheck();
    };
    for (const consulta of [MEDIA_MOVIL, MEDIA_TABLET]) {
      const mql = window.matchMedia(consulta);
      mql.addEventListener?.('change', alCambiar);
      this.destroyRef.onDestroy(() => mql.removeEventListener?.('change', alCambiar));
    }
  }

  private menuGuardado(): string | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(CLAVE_MENU) : null;
    } catch {
      return null;
    }
  }

  private guardarMenu(plegado: boolean): void {
    try {
      if (typeof localStorage === 'undefined') return;
      // Se guarda solo lo que se aparta del arranque: «abierto» en tablet, «compacto» en escritorio.
      const desviado = this.esTablet() ? !plegado : plegado;
      if (!desviado) localStorage.removeItem(CLAVE_MENU);
      else localStorage.setItem(CLAVE_MENU, this.esTablet() ? 'abierto' : 'compacto');
    } catch {
      /* almacenamiento bloqueado: se ignora, no afecta a la navegación */
    }
  }

  private esTablet(): boolean {
    return typeof window !== 'undefined' && window.matchMedia(MEDIA_TABLET).matches;
  }

  private esMovil(): boolean {
    return typeof window !== 'undefined' && window.matchMedia(MEDIA_MOVIL).matches;
  }
}
