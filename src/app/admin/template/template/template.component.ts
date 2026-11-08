import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { FooterComponent } from '../footer/footer.component';
import { BarraInferiorComponent } from '../barra-inferior/barra-inferior.component';
import { PaletaComandosComponent } from '../paleta-comandos/paleta-comandos.component';
import { BarraProgresoComponent } from '../barra-progreso/barra-progreso.component';
import { AyudaAtajosComponent } from '../ayuda-atajos/ayuda-atajos.component';
import { PaletaComandosService } from '../paleta-comandos/paleta-comandos.service';
import { AvisosPanelService } from '../../service/avisos-panel.service';
import { punteroFino } from '../../../shared/ui/movimiento.util';
import { TemaService } from '../../../shared/ui/tema.service';

/** Ruta sin consulta ni fragmento ("/dashboard/mantenimiento/doc?q=x" → "/dashboard/mantenimiento/doc"). */
function rutaSinConsulta(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? url;
}

/** Mismo punto de corte que el CSS del sidebar (cajón sobre el contenido). */
const MEDIA_MOVIL = '(max-width: 900px)';
/** Tablet y portátil chico: el menú arranca plegado (rail de 56 px) para dejar sitio al contenido. */
const MEDIA_TABLET = '(min-width: 901px) and (max-width: 1200px)';
/** Preferencia del usuario: en escritorio se guarda «compacto»; en tablet, «abierto» (lo contrario del arranque). */
const CLAVE_MENU = 'hs.panel.menu';
/** Color de la barra del navegador (Android) en el panel: el fondo de cada tema, para que no desentone. */
const COLOR_BARRA_PANEL = { claro: '#f4f3ef', oscuro: '#161716' };
/** Zonas que se quedan con el foco al hacer clic en ellas: si el foco sigue ahí tras navegar, pasa al contenido. */
const ZONAS_DE_NAVEGACION = 'app-sidebar, app-header, app-barra-inferior';

@Component({
  selector: 'app-template',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    HeaderComponent,
    SidebarComponent,
    FooterComponent,
    PaletaComandosComponent,
    BarraInferiorComponent,
    BarraProgresoComponent,
    AyudaAtajosComponent,
  ],
  templateUrl: './template.component.html',
  styleUrl: './template.component.scss',
})
export class TemplateComponent implements OnInit, OnDestroy {
  @ViewChild('contenidoPanel') private contenidoPanel?: ElementRef<HTMLDivElement>;
  sidebarCollapsed = false;

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly doc = inject(DOCUMENT);
  private readonly tema = inject(TemaService);
  private readonly paleta = inject(PaletaComandosService);
  private readonly avisos = inject(AvisosPanelService);
  /** Ruta (sin consulta) de la pantalla actual: el foco solo se mueve al cambiar de pantalla, no al cambiar filtros. */
  private rutaActual = '';

  ngOnInit(): void {
    this.tema.fijarColorBarra(COLOR_BARRA_PANEL);
    // La campana de avisos empieza a leer en segundo plano al entrar al panel.
    this.avisos.iniciar();
    this.rutaActual = rutaSinConsulta(this.router.url);
    // En móvil el menú es un cajón: arranca cerrado y se cierra al navegar,
    // para que no tape la página. En tablet arranca plegado (rail) salvo que el usuario lo haya
    // dejado abierto; en escritorio arranca abierto salvo que lo haya dejado compacto.
    this.sidebarCollapsed = this.plegadoPorDefecto();
    this.vigilarCambioDeAncho();
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        const contenido = this.contenidoPanel?.nativeElement;
        if (contenido) {
          contenido.scrollTop = 0;
          contenido.scrollLeft = 0;
        }
        if (this.esMovil() && !this.sidebarCollapsed) {
          this.sidebarCollapsed = true;
          this.cdr.markForCheck();
        }
        const ruta = rutaSinConsulta(e.urlAfterRedirects);
        const cambioDePantalla = ruta !== this.rutaActual;
        this.rutaActual = ruta;
        if (cambioDePantalla) this.enfocarContenidoSiNadieTomoElFoco();
      });
  }

  ngOnDestroy(): void {
    // Fuera del panel (tienda, login) la barra del navegador vuelve a su color de siempre.
    this.tema.fijarColorBarra(null);
    this.avisos.detener();
  }

  /** El papel es blanco: durante la impresión el panel va en claro aunque esté en oscuro. */
  @HostListener('window:beforeprint')
  protected alEmpezarImpresion(): void {
    this.tema.paraImpresion(true);
  }

  @HostListener('window:afterprint')
  protected alTerminarImpresion(): void {
    this.tema.paraImpresion(false);
  }

  /** «Saltar al contenido»: lleva el foco al contenido sin cambiar la URL (el href del enlace es solo un respaldo). */
  saltarAlContenido(evento: Event): void {
    evento.preventDefault();
    this.contenidoPanel?.nativeElement.focus({ preventScroll: true });
  }

  /**
   * Tras cambiar de pantalla el foco puede quedar en el enlace del menú que se pulsó (o en <body>
   * si ese enlace desapareció): se pasa al contenido para que el teclado y los lectores de pantalla
   * sigan desde ahí. Si la pantalla nueva ya enfocó algo, no se toca.
   * Va en setTimeout(0) para dejar que la pantalla nueva tome su foco primero.
   */
  private enfocarContenidoSiNadieTomoElFoco(): void {
    setTimeout(() => {
      const contenido = this.contenidoPanel?.nativeElement;
      if (!contenido) return;
      const activo = this.doc.activeElement;
      // La paleta de comandos tarda unos 150 ms en irse (animación de salida) y mientras tanto conserva el foco.
      const paletaCerrandose = !this.paleta.abierta() && activo?.closest('app-paleta-comandos') != null;
      const libre = !activo || activo === this.doc.body || paletaCerrandose || activo.closest(ZONAS_DE_NAVEGACION) !== null;
      if (!libre) return;
      // Pantallas de escáner (Vender, Recepción) marcan su campo con `autofocus`, que el navegador solo
      // respeta al cargar la página: al llegar desde el menú se enfoca aquí, y solo con ratón (en el
      // teléfono abriría el teclado en pantalla sin que nadie lo pida).
      const campo = punteroFino() ? contenido.querySelector<HTMLElement>('[autofocus]') : null;
      (campo ?? contenido).focus({ preventScroll: true });
    }, 0);
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
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(MEDIA_TABLET).matches;
  }

  private esMovil(): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(MEDIA_MOVIL).matches;
  }
}
