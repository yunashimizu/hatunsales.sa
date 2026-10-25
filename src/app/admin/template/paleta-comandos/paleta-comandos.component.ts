import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../auth/service/auth.service';
import { TemaService } from '../../../shared/ui/tema.service';
import { CUENTA_MENU, SECCIONES_MENU } from '../sidebar/sidebar.component';
import { PaletaComandosService } from './paleta-comandos.service';

interface Comando {
  id: string;
  etiqueta: string;
  grupo: string;
  icono: string;
  /** Ruta a la que navega; si falta, ejecuta `accion`. */
  ruta?: string;
  accion?: () => void;
  /** Sinónimos para encontrarlo escribiendo («boleta» → Documentos). */
  palabras: string;
}

interface ComandoVisible extends Comando {
  indice: number;
}

interface GrupoVisible {
  titulo: string;
  items: ComandoVisible[];
}

/** Palabras clave por ruta: no cambian el menú, solo ayudan a buscar. */
const PALABRAS: Record<string, string> = {
  '/dashboard/home': 'inicio resumen panel kpi',
  '/dashboard/mantenimiento/ventas': 'pos punto de venta cobrar vender boleta factura carrito',
  '/dashboard/mantenimiento/ventas-historial': 'ventas anteriores historial buscar comprobante reimprimir',
  '/dashboard/mantenimiento/caja-sesion': 'turno efectivo apertura cierre caja dinero',
  '/dashboard/mantenimiento/arqueo-caja': 'arqueo cuadre conteo billetes cierre',
  '/dashboard/mantenimiento/cotizaciones': 'proforma presupuesto cotizar',
  '/dashboard/mantenimiento/doc': 'documentos boletas facturas notas credito sunat cpe comprobantes',
  '/dashboard/mantenimiento/guias-remision': 'guia remision traslado transporte gre',
  '/dashboard/mantenimiento/clientes': 'personas empresas ruc dni clientes',
  '/dashboard/mantenimiento/cuentas-por-cobrar': 'credito deuda cobranza fiado pendientes',
  '/dashboard/mantenimiento/productos': 'articulos catalogo precios sku imagenes',
  '/dashboard/mantenimiento/categorias': 'rubros familias clasificacion',
  '/dashboard/mantenimiento/marcas': 'fabricantes marcas',
  '/dashboard/mantenimiento/inventario': 'kardex almacen existencias movimientos',
  '/dashboard/mantenimiento/stock': 'ajuste minimo alertas existencias',
  '/dashboard/mantenimiento/almacen': 'sucursales depositos almacenes',
  '/dashboard/mantenimiento/proveedores': 'compras proveedores ruc',
  '/dashboard/mantenimiento/recepcion': 'ingreso mercaderia compra orden recepcion',
  '/dashboard/mantenimiento/reportes': 'ventas por periodo excel pdf estadisticas graficos',
  '/dashboard/facturacion-sunat': 'sunat fiscal certificado emision beta produccion envios',
  '/dashboard/mantenimiento/usuarios': 'empleados personal accesos cuentas',
  '/dashboard/mantenimiento/roles': 'permisos perfiles seguridad',
  '/dashboard/perfil': 'mi cuenta contraseña datos personales',
  '/dashboard/configuracion': 'ajustes empresa series sistema',
};

const CLAVE_RECIENTES = 'hs.panel.recientes';
const MAX_RECIENTES = 4;

/** Quita tildes y mayúsculas para comparar. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Puntaje de coincidencia: 0 = no coincide; más alto = mejor. */
function puntaje(comando: Comando, consulta: string): number {
  const etiqueta = normalizar(comando.etiqueta);
  const resto = normalizar(`${comando.grupo} ${comando.palabras}`);
  if (etiqueta === consulta) return 100;
  if (etiqueta.startsWith(consulta)) return 80;
  if (etiqueta.split(/\s+/).some((p) => p.startsWith(consulta))) return 65;
  if (etiqueta.includes(consulta)) return 50;
  if (resto.split(/\s+/).some((p) => p.startsWith(consulta))) return 35;
  if (resto.includes(consulta)) return 25;
  // Coincidencia «salteada» (cada letra en orden): «invent» ~ «Inventario»
  let i = 0;
  for (const c of etiqueta) if (c === consulta[i]) i++;
  return i === consulta.length && consulta.length >= 3 ? 10 : 0;
}

/**
 * Paleta de comandos del panel (Ctrl/⌘ + K): salta a cualquier pantalla a la que
 * el usuario tenga acceso (mismo menú y mismos roles que el menú lateral) y
 * ofrece acciones rápidas. Solo navega: no contiene lógica de negocio.
 */
@Component({
  selector: 'app-paleta-comandos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './paleta-comandos.component.html',
  styleUrl: './paleta-comandos.component.css',
})
export class PaletaComandosComponent {
  protected readonly paleta = inject(PaletaComandosService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly tema = inject(TemaService);
  private readonly doc = inject(DOCUMENT);

  protected readonly entrada = viewChild<ElementRef<HTMLInputElement>>('entrada');
  protected readonly consulta = signal('');
  protected readonly activo = signal(0);
  private enfocadoAntes: HTMLElement | null = null;

  /** Todos los comandos visibles para este usuario (se recalcula al abrir). */
  private readonly todos = computed<Comando[]>(() => {
    if (!this.paleta.abierta()) return [];
    const lista: Comando[] = [];
    for (const seccion of SECCIONES_MENU) {
      for (const item of seccion.items) {
        if (!this.auth.puedeVer(item.roles, item.permisos ?? [])) continue;
        lista.push({
          id: item.ruta,
          etiqueta: item.etiqueta,
          grupo: seccion.titulo,
          icono: item.icono,
          ruta: item.ruta,
          palabras: PALABRAS[item.ruta] ?? '',
        });
      }
    }
    for (const item of CUENTA_MENU) {
      if (!this.auth.puedeVer(item.roles, item.permisos ?? [])) continue;
      lista.push({ id: item.ruta, etiqueta: item.etiqueta, grupo: 'Cuenta', icono: item.icono, ruta: item.ruta, palabras: PALABRAS[item.ruta] ?? '' });
    }
    return lista;
  });

  private readonly acciones = computed<Comando[]>(() => {
    if (!this.paleta.abierta()) return [];
    const lista: Comando[] = [];
    const vende = this.auth.puedeVer(['admin', 'superadmin', 'vendedor', 'caja']);
    if (vende) {
      lista.push({ id: 'accion:venta', etiqueta: 'Nueva venta', grupo: 'Acciones', icono: 'bi-cart-plus', ruta: '/dashboard/mantenimiento/ventas', palabras: 'cobrar pos vender caja' });
      lista.push({ id: 'accion:caja', etiqueta: 'Abrir o ver la caja', grupo: 'Acciones', icono: 'bi-unlock', ruta: '/dashboard/mantenimiento/caja-sesion', palabras: 'turno efectivo apertura' });
    }
    lista.push({
      id: 'accion:tema',
      etiqueta: this.tema.esOscuro() ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
      grupo: 'Acciones',
      icono: this.tema.esOscuro() ? 'bi-sun' : 'bi-moon-stars',
      accion: () => this.tema.alternar(),
      palabras: 'apariencia modo oscuro claro noche dia',
    });
    lista.push({ id: 'accion:tienda', etiqueta: 'Ver la tienda online', grupo: 'Acciones', icono: 'bi-shop', ruta: '/store', palabras: 'ecommerce catalogo clientes publico' });
    return lista;
  });

  /** Lista plana en el orden en que se muestra (la usa el teclado). */
  protected readonly plano = computed<ComandoVisible[]>(() => {
    const q = normalizar(this.consulta());
    const base = [...this.acciones(), ...this.todos()];
    if (!q) {
      const recientes = this.leerRecientes()
        .map((id) => base.find((c) => c.id === id))
        .filter((c): c is Comando => !!c)
        .map((c) => ({ ...c, grupo: 'Recientes' }));
      const ids = new Set(recientes.map((c) => c.id));
      return [...recientes, ...base.filter((c) => !ids.has(c.id) || c.grupo === 'Acciones')].map((c, indice) => ({ ...c, indice }));
    }
    return base
      .map((c) => ({ c, p: puntaje(c, q) }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p)
      .map((x, indice) => ({ ...x.c, indice }));
  });

  protected readonly grupos = computed<GrupoVisible[]>(() => {
    const lista = this.plano();
    if (this.consulta().trim()) return lista.length ? [{ titulo: `${lista.length} ${lista.length === 1 ? 'resultado' : 'resultados'}`, items: lista }] : [];
    const mapa = new Map<string, ComandoVisible[]>();
    for (const c of lista) mapa.set(c.grupo, [...(mapa.get(c.grupo) ?? []), c]);
    return [...mapa].map(([titulo, items]) => ({ titulo, items }));
  });

  /** Atajo que se muestra en los botones (⌘K en Mac, Ctrl K en el resto). */
  readonly atajo = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';

  constructor() {
    effect(() => {
      if (this.paleta.abierta()) {
        this.enfocadoAntes = this.doc.activeElement as HTMLElement | null;
        this.consulta.set('');
        this.activo.set(0);
      }
    });
    effect(() => {
      const campo = this.entrada();
      if (campo) queueMicrotask(() => campo.nativeElement.focus());
    });
  }

  @HostListener('document:keydown', ['$event'])
  protected alTeclaGlobal(evento: KeyboardEvent): void {
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
      evento.preventDefault();
      this.paleta.alternar();
      if (!this.paleta.abierta()) this.devolverFoco();
    }
  }

  protected alEscribir(valor: string): void {
    this.consulta.set(valor);
    this.activo.set(0);
  }

  protected alTeclear(evento: KeyboardEvent): void {
    const total = this.plano().length;
    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        this.mover(total ? (this.activo() + 1) % total : 0);
        break;
      case 'ArrowUp':
        evento.preventDefault();
        this.mover(total ? (this.activo() - 1 + total) % total : 0);
        break;
      case 'Home':
        evento.preventDefault();
        this.mover(0);
        break;
      case 'End':
        evento.preventDefault();
        this.mover(Math.max(0, total - 1));
        break;
      case 'Enter': {
        evento.preventDefault();
        const comando = this.plano()[this.activo()];
        if (comando) this.ejecutar(comando);
        break;
      }
      case 'Escape':
        evento.preventDefault();
        this.cerrar();
        break;
      case 'Tab':
        evento.preventDefault(); // el foco se queda en el campo mientras la paleta está abierta
        break;
    }
  }

  protected mover(indice: number): void {
    this.activo.set(indice);
    queueMicrotask(() => this.doc.getElementById(`pc-op-${indice}`)?.scrollIntoView({ block: 'nearest' }));
  }

  protected ejecutar(comando: Comando): void {
    this.guardarReciente(comando.id);
    this.cerrar(false);
    if (comando.accion) comando.accion();
    else if (comando.ruta) void this.router.navigateByUrl(comando.ruta);
  }

  protected cerrar(devolverFoco = true): void {
    this.paleta.cerrar();
    if (devolverFoco) this.devolverFoco();
  }

  private devolverFoco(): void {
    const anterior = this.enfocadoAntes;
    this.enfocadoAntes = null;
    if (anterior && typeof anterior.focus === 'function') queueMicrotask(() => anterior.focus());
  }

  private leerRecientes(): string[] {
    try {
      const crudo = localStorage.getItem(CLAVE_RECIENTES);
      const lista = crudo ? JSON.parse(crudo) : [];
      return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  private guardarReciente(id: string): void {
    if (id.startsWith('accion:')) return;
    try {
      const lista = [id, ...this.leerRecientes().filter((x) => x !== id)].slice(0, MAX_RECIENTES);
      localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(lista));
    } catch {
      /* almacenamiento bloqueado: la lista de recientes es opcional */
    }
  }
}
