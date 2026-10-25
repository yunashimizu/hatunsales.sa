import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  computed,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService, SesionUsuario } from '../../../auth/service/auth.service';
import { EstadoFiscalGlobal } from '../../models/fiscal.models';
import { FiscalEstadoService } from '../../service/fiscal-estado.service';
import { BotonTemaComponent } from '../../../shared/ui/boton-tema.component';
import { PaletaComandosService } from '../paleta-comandos/paleta-comandos.service';

@Component({
  selector: 'app-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, BotonTemaComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit {
  /** true cuando el sidebar está expandido (menú visible). */
  @Input() sidebarAbierto = true;
  @Output() onToggleSidebar = new EventEmitter<void>();

  showUser = false;
  paginaActual = 'Dashboard';
  /** Icono (Bootstrap Icons) y módulo de la página actual, para la cabecera. */
  iconoActual = 'bi-house-door';
  grupoActual = '';
  /** Fecha de hoy en español, sin depender del locale global de Angular. */
  readonly fechaCorta = formatearFecha(new Date(), { weekday: 'short', day: 'numeric', month: 'short' });
  readonly fechaLarga = formatearFecha(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  sesion: SesionUsuario = {
    idUsuario: 0,
    nombre: '',
    email: '',
    rolId: 0,
    rolNombre: '',
    permisos: [],
    iniciales: '?',
  };
  /** Solo con sesión de admin, vendedor o caja (otros roles ni lo ven ni lo consultan). */
  mostrarEstadoFiscal = false;
  /** El chip lleva al panel fiscal solo si el usuario puede abrirlo. */
  esAdmin = false;

  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly titleDoc = inject(Title);
  private readonly fiscal = inject(FiscalEstadoService);
  private readonly paleta = inject(PaletaComandosService);
  /** Atajo de teclado que abre la paleta de comandos (⌘ K en Mac, Ctrl K en el resto). */
  readonly atajoPaleta = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
  /** Oculto mientras el estado no se pudo leer: el servicio reintenta solo. */
  readonly chipFiscal = computed(() => chipDeEstadoFiscal(this.fiscal.estado()));

  ngOnInit(): void {
    // Fuera del panel (tienda, login) el estado fiscal no se sigue ni se reintenta.
    this.destroyRef.onDestroy(() => this.fiscal.detener());
    this.refrescarSesion();
    this.auth.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.refrescarSesion();
      this.cdr.markForCheck();
    });

    this.aplicarPagina(this.router.url);
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        this.aplicarPagina(e.urlAfterRedirects);
        this.showUser = false;
        this.cdr.markForCheck();
      });
  }

  private aplicarTituloPestana(pagina: string): void {
    const base = 'HatunSales S.A.C';
    this.titleDoc.setTitle(pagina && pagina !== base ? `${pagina} | ${base}` : base);
  }

  get etiquetaRol(): string {
    return this.auth.etiquetaRol(this.sesion.rolNombre);
  }

  abrirPaleta(): void {
    this.paleta.abrir();
  }

  toggleUser(): void {
    this.showUser = !this.showUser;
  }

  /** Enter/Espacio sobre la píldora (no sobre los enlaces del desplegable, que ya responden solos). */
  alTeclaUsuario(event: Event): void {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    this.toggleUser();
  }

  logout(): void {
    // En dashboard solo hay staff; van al login del personal.
    this.auth.logout();
    this.router.navigate(['/auth']);
  }

  @HostListener('document:click', ['$event'])
  cerrarAlClickFuera(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.user-pill') && this.showUser) {
      this.showUser = false;
      this.cdr.markForCheck();
    }
  }

  private refrescarSesion(): void {
    this.sesion = this.auth.getSesion();
    this.mostrarEstadoFiscal = this.auth.isLoggedIn() && this.auth.puedeVer(ROLES_ESTADO_FISCAL);
    this.esAdmin = this.mostrarEstadoFiscal && this.auth.puedeVer(['admin']);
    if (this.mostrarEstadoFiscal) this.fiscal.iniciar();
  }

  private aplicarPagina(url: string): void {
    const pagina = paginaDe(url);
    this.paginaActual = pagina.titulo;
    this.iconoActual = pagina.icono;
    this.grupoActual = pagina.grupo;
    this.aplicarTituloPestana(pagina.titulo);
  }
}

/** Roles que operan ventas: ven en la cabecera en qué ambiente se emiten los comprobantes. */
const ROLES_ESTADO_FISCAL = ['admin', 'vendedor', 'caja'];

/** Chip de la cabecera con el ambiente de emisión (beta ámbar, producción verde, detenida rojo). */
export interface ChipFiscal {
  texto: string;
  /** Versión corta para pantallas chicas. */
  corto: string;
  tono: 'beta' | 'produccion' | 'detenida' | 'neutro';
  /** Motivo y alertas: va en el tooltip y en el texto para lectores de pantalla. */
  detalle: string;
  /** Punto de alerta: emisión detenida por SUNAT o comprobantes fuera de plazo. */
  alerta: boolean;
}

export function chipDeEstadoFiscal(estado: EstadoFiscalGlobal | null): ChipFiscal | null {
  if (!estado) return null;
  const alertas: string[] = [];
  if (estado.bloqueo) {
    alertas.push(`SUNAT detuvo la emisión (${estado.bloqueo.codigo}): ${estado.bloqueo.motivo}`);
  }
  const vencidos = estado.plazos?.vencidos ?? 0;
  if (vencidos > 0) {
    alertas.push(`${vencidos} comprobante(s) fuera del plazo de envío: revíselos en Facturación SUNAT.`);
  }

  const produccion = estado.ambiente === 'produccion';
  let chip: Omit<ChipFiscal, 'alerta'>;
  if (estado.emision_activa === true) {
    chip = produccion
      ? {
          texto: 'SUNAT PRODUCCIÓN',
          corto: 'PROD.',
          tono: 'produccion',
          detalle: 'Emisión electrónica activa en SUNAT: los comprobantes tienen validez tributaria.',
        }
      : {
          texto: 'SUNAT BETA - pruebas',
          corto: 'BETA',
          tono: 'beta',
          detalle: 'Emisión de prueba en SUNAT BETA: los comprobantes no tienen validez tributaria.',
        };
  } else if (estado.emision_activa === false) {
    chip = {
      texto: 'Emisión detenida',
      corto: 'Detenida',
      tono: 'detenida',
      detalle:
        estado.motivo || 'La emisión electrónica no está activa: las ventas se registran sin comprobante.',
    };
  } else {
    // El servidor no pudo confirmarlo: se muestra el ambiente sin color de «activa».
    chip = {
      texto: produccion ? 'SUNAT PRODUCCIÓN' : 'SUNAT BETA - pruebas',
      corto: produccion ? 'PROD.' : 'BETA',
      tono: 'neutro',
      detalle: 'No se pudo confirmar si la emisión electrónica está activa.',
    };
  }
  return { ...chip, detalle: [chip.detalle, ...alertas].join(' '), alerta: alertas.length > 0 };
}

interface PaginaPanel {
  titulo: string;
  icono: string;
  grupo: string;
}

/** Mismas rutas e iconos que el menú lateral. El orden importa: la más específica primero. */
const PAGINAS: Array<{ fragmento: string; pagina: PaginaPanel }> = [
  { fragmento: '/mantenimiento/ventas-historial', pagina: { titulo: 'Historial de ventas', icono: 'bi-clock-history', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/ventas', pagina: { titulo: 'Ventas', icono: 'bi-receipt', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/caja-sesion', pagina: { titulo: 'Caja', icono: 'bi-cash-stack', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/cotizaciones', pagina: { titulo: 'Cotizaciones', icono: 'bi-file-earmark-ruled', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/doc', pagina: { titulo: 'Documentos', icono: 'bi-file-earmark-text', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/guias-remision', pagina: { titulo: 'Guías de remisión', icono: 'bi-truck', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/clientes', pagina: { titulo: 'Clientes', icono: 'bi-people', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/cuentas-por-cobrar', pagina: { titulo: 'Cuentas por cobrar', icono: 'bi-wallet2', grupo: 'Ventas' } },
  { fragmento: '/mantenimiento/productos', pagina: { titulo: 'Productos', icono: 'bi-box-seam', grupo: 'Catálogo' } },
  { fragmento: '/mantenimiento/categorias', pagina: { titulo: 'Categorías', icono: 'bi-tags', grupo: 'Catálogo' } },
  { fragmento: '/mantenimiento/marcas', pagina: { titulo: 'Marcas', icono: 'bi-award', grupo: 'Catálogo' } },
  { fragmento: '/mantenimiento/inventario', pagina: { titulo: 'Inventario', icono: 'bi-boxes', grupo: 'Almacén' } },
  { fragmento: '/mantenimiento/stock', pagina: { titulo: 'Stock', icono: 'bi-clipboard-data', grupo: 'Almacén' } },
  { fragmento: '/mantenimiento/almacen', pagina: { titulo: 'Almacén', icono: 'bi-building', grupo: 'Almacén' } },
  { fragmento: '/mantenimiento/proveedores', pagina: { titulo: 'Proveedores', icono: 'bi-truck-front', grupo: 'Almacén' } },
  { fragmento: '/mantenimiento/recepcion', pagina: { titulo: 'Recepción', icono: 'bi-box-arrow-in-down', grupo: 'Almacén' } },
  { fragmento: '/mantenimiento/reportes', pagina: { titulo: 'Reportes', icono: 'bi-bar-chart-line', grupo: 'Reportes' } },
  { fragmento: '/mantenimiento/usuarios', pagina: { titulo: 'Usuarios', icono: 'bi-person-badge', grupo: 'Administración' } },
  { fragmento: '/mantenimiento/roles', pagina: { titulo: 'Roles', icono: 'bi-shield-check', grupo: 'Administración' } },
  { fragmento: '/facturacion-sunat', pagina: { titulo: 'Facturación SUNAT', icono: 'bi-file-earmark-check', grupo: 'Administración' } },
  { fragmento: '/perfil', pagina: { titulo: 'Mi perfil', icono: 'bi-person-circle', grupo: 'Cuenta' } },
  { fragmento: '/configuracion', pagina: { titulo: 'Configuración', icono: 'bi-gear', grupo: 'Cuenta' } },
  { fragmento: '/dashboard/home', pagina: { titulo: 'Inicio', icono: 'bi-house-door', grupo: 'Panel' } },
];

function paginaDe(url: string): PaginaPanel {
  const encontrada = PAGINAS.find((p) => url.includes(p.fragmento));
  if (encontrada) return encontrada.pagina;
  if (url.endsWith('/dashboard')) return { titulo: 'Inicio', icono: 'bi-house-door', grupo: 'Panel' };
  return { titulo: 'Dashboard', icono: 'bi-grid-1x2', grupo: 'Panel' };
}

function formatearFecha(fecha: Date, opciones: Intl.DateTimeFormatOptions): string {
  try {
    return fecha.toLocaleDateString('es-PE', opciones).replace(/\./g, '');
  } catch {
    return fecha.toLocaleDateString();
  }
}
