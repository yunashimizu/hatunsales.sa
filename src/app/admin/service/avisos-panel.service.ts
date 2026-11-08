import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, NgZone, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subscription, catchError, debounceTime, forkJoin, map, of } from 'rxjs';
import { AuthService } from '../../auth/service/auth.service';
import { CajaSesionService } from './caja-sesion.service';
import { ComprobanteService } from './comprobante.service';
import { CreditoAdminService } from './credito-admin.service';
import { EventosPanelService } from './eventos-panel.service';
import { FiscalEstadoService } from './fiscal-estado.service';
import { InventarioAdminService } from './inventario-admin.service';
import { PedidoAdminService } from './pedido-admin.service';

/** Un aviso de la campana. `valor` es la cifra que lo motiva: si cambia, vuelve a contar como «no visto». */
export interface AvisoPanel {
  clave: string;
  tono: 'peligro' | 'aviso' | 'info';
  /** Clase de Bootstrap Icons (bi-…). */
  icono: string;
  texto: string;
  detalle?: string;
  valor: number;
  ruta?: string;
  accion?: string;
}

/** Mismos roles que usa el Inicio para cada bloque (dashboard.component.ts). */
const ROLES_DOCUMENTOS = ['admin', 'superadmin', 'vendedor', 'caja'];
const ROLES_STOCK = ['admin', 'superadmin', 'vendedor', 'consulta'];
const ROLES_INVENTARIO = ['admin', 'superadmin', 'vendedor'];
const ROLES_CXC = ['admin', 'superadmin', 'caja', 'vendedor'];
const ROLES_CAJA = ['admin', 'superadmin', 'vendedor', 'caja'];
const ROLES_PEDIDOS = ['admin', 'superadmin', 'vendedor', 'caja'];
/** Los mismos que el chip SUNAT de la barra superior. */
const ROLES_FISCAL = ['admin', 'vendedor', 'caja'];
const ROLES_FISCAL_PANEL = ['admin', 'superadmin'];

const RUTA = '/dashboard/mantenimiento';
const RUTA_FISCAL = '/dashboard/facturacion-sunat';

export const CLAVE_AVISOS_VISTOS = 'hs.panel.avisos-vistos';
const CADA_MS = 60_000;
/** Al volver a la pestaña se refresca si el último tic fue hace más de esto (el reloj de 60 s no cambia). */
export const UMBRAL_VISIBLE_MS = 10_000;
/** Una venta dispara varios eventos seguidos: se espera este margen y se lee una sola vez. */
const ESPERA_EVENTOS_MS = 500;
/** Antes de esta hora (Lima) no se avisa de que falta abrir caja. */
const HORA_APERTURA = 9;
/** Pasado el cierre ya no tiene sentido pedir que abra caja. */
const HORA_CIERRE = 21;

type FuenteRemota = 'cpe' | 'stock' | 'cxc' | 'caja';
type Resultados = Partial<Record<FuenteRemota, AvisoPanel[]>>;

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

function leerVistos(): Record<string, number> {
  try {
    const bruto = localStorage.getItem(CLAVE_AVISOS_VISTOS);
    const dato = bruto ? JSON.parse(bruto) : null;
    if (!dato || typeof dato !== 'object' || Array.isArray(dato)) return {};
    const limpio: Record<string, number> = {};
    for (const [clave, valor] of Object.entries(dato)) {
      if (typeof valor === 'number' && Number.isFinite(valor)) limpio[clave] = valor;
    }
    return limpio;
  } catch {
    return {};
  }
}

function guardarVistos(vistos: Record<string, number>): void {
  try {
    localStorage.setItem(CLAVE_AVISOS_VISTOS, JSON.stringify(vistos));
  } catch {
    /* sin almacenamiento: los avisos solo vuelven a contar como nuevos al recargar */
  }
}

const ORDEN_TONO: Record<AvisoPanel['tono'], number> = { peligro: 0, aviso: 1, info: 2 };

/** Hora actual (0–23) en Lima. */
function horaEnLima(ahora: Date): number {
  const texto = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', hour: 'numeric', hourCycle: 'h23' }).format(ahora);
  return Number(texto) % 24;
}

/**
 * Centro de avisos de la campana de la barra superior: reúne en un solo lugar lo que pide atención
 * (SUNAT, stock, pedidos web, cobranza y caja). Lee en segundo plano (peticiones silenciosas) cada minuto
 * mientras la pestaña está visible; el estado fiscal y los pedidos web se toman de los servicios que ya los
 * siguen (no añade sondeos). Cada fuente solo se pide si el rol del usuario puede verla.
 */
@Injectable({ providedIn: 'root' })
export class AvisosPanelService {
  private readonly comprobantes = inject(ComprobanteService);
  private readonly inventario = inject(InventarioAdminService);
  private readonly credito = inject(CreditoAdminService);
  private readonly caja = inject(CajaSesionService);
  private readonly auth = inject(AuthService);
  private readonly fiscal = inject(FiscalEstadoService);
  private readonly pedidos = inject(PedidoAdminService);
  private readonly eventos = inject(EventosPanelService);
  private readonly zona = inject(NgZone);
  private readonly documento = inject(DOCUMENT);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly remotos = signal<Resultados>({});
  private readonly permisos = signal({ fiscal: false, pedidos: false, panelFiscal: false });
  private readonly resumenPedidos = toSignal(this.pedidos.resumen, { initialValue: null });
  private readonly vistos = signal<Record<string, number>>(leerVistos());
  private readonly falloTotal = signal(false);
  private readonly ultimaLectura = signal<Date | null>(null);
  private readonly leyendo = signal(false);

  /** Todos los avisos de ahora, los graves primero. */
  readonly items = computed<AvisoPanel[]>(() => {
    const remotos = this.remotos();
    const todos = [
      ...(remotos.cpe ?? []),
      ...this.avisosFiscales(),
      ...this.avisosPedidos(),
      ...(remotos.stock ?? []),
      ...(remotos.cxc ?? []),
      ...(remotos.caja ?? []),
    ];
    return todos
      .map((aviso, i) => ({ aviso, i }))
      .sort((a, b) => ORDEN_TONO[a.aviso.tono] - ORDEN_TONO[b.aviso.tono] || a.i - b.i)
      .map((x) => x.aviso);
  });
  /** Avisos cuya cifra no es la que el usuario ya vio. */
  readonly noVistos = computed(() => {
    const vistos = this.vistos();
    return this.items().filter((a) => vistos[a.clave] !== a.valor).length;
  });
  readonly hayPeligro = computed(() => this.items().some((a) => a.tono === 'peligro'));
  /** Cuándo terminó la última lectura (null si aún no hubo ninguna). */
  readonly actualizadoEn = this.ultimaLectura.asReadonly();
  readonly cargando = this.leyendo.asReadonly();
  /** Todas las lecturas de la última vuelta fallaron: no se sabe si todo está en orden. */
  readonly sinLectura = this.falloTotal.asReadonly();

  private iniciado = false;
  private lectura: Subscription | null = null;
  private escuchaEventos: Subscription | null = null;
  private temporizador: ReturnType<typeof setInterval> | null = null;
  private ultimaVuelta = 0;
  private readonly alCambiarVisibilidad = () => {
    if (this.documento.visibilityState !== 'visible') {
      this.pararReloj();
      return;
    }
    this.zona.run(() => {
      if (Date.now() - this.ultimaVuelta > UMBRAL_VISIBLE_MS) this.refrescar();
      this.arrancarReloj();
    });
  };

  /** Empieza a seguir los avisos (idempotente): primera lectura ya y una más cada minuto con la pestaña visible. */
  iniciar(): void {
    if (this.iniciado || !this.navegador) return;
    this.iniciado = true;
    this.permisos.set({
      fiscal: this.auth.puedeVer(ROLES_FISCAL),
      pedidos: this.auth.puedeVer(ROLES_PEDIDOS),
      panelFiscal: this.auth.puedeVer(ROLES_FISCAL_PANEL),
    });
    if (this.permisos().fiscal) this.fiscal.iniciar();
    this.zona.runOutsideAngular(() => this.documento.addEventListener('visibilitychange', this.alCambiarVisibilidad));
    if (this.documento.visibilityState === 'visible') this.arrancarReloj();
    this.escucharEventos();
    this.refrescar();
  }

  /** Deja de seguir y olvida los avisos (al salir del panel). */
  detener(): void {
    if (!this.iniciado) return;
    this.iniciado = false;
    this.pararReloj();
    this.lectura?.unsubscribe();
    this.lectura = null;
    this.escuchaEventos?.unsubscribe();
    this.escuchaEventos = null;
    if (this.navegador) this.documento.removeEventListener('visibilitychange', this.alCambiarVisibilidad);
    this.remotos.set({});
    this.permisos.set({ fiscal: false, pedidos: false, panelFiscal: false });
    this.ultimaLectura.set(null);
    this.falloTotal.set(false);
    this.leyendo.set(false);
  }

  /** Vuelve a leer las fuentes que pide el servidor (las demás ya están al día). */
  refrescar(): void {
    if (!this.navegador) return;
    this.lectura?.unsubscribe();
    this.ultimaVuelta = Date.now();

    const lecturas: Partial<Record<FuenteRemota, Observable<AvisoPanel[] | null>>> = {};
    if (this.auth.puedeVer(ROLES_DOCUMENTOS)) lecturas.cpe = this.leerCpe();
    if (this.auth.puedeVer(ROLES_STOCK)) lecturas.stock = this.leerStock();
    if (this.auth.puedeVer(ROLES_CXC)) lecturas.cxc = this.leerCuentas();
    if (this.auth.puedeVer(ROLES_CAJA)) lecturas.caja = this.leerCaja();

    const fuentes = Object.keys(lecturas) as FuenteRemota[];
    if (!fuentes.length) {
      this.falloTotal.set(false);
      this.ultimaLectura.set(new Date());
      return;
    }

    this.leyendo.set(true);
    this.lectura = forkJoin(fuentes.map((f) => lecturas[f] as Observable<AvisoPanel[] | null>)).subscribe({
      next: (listas) => {
        // Si una lectura falla se conserva lo que había de esa fuente: un tropiezo de red no borra los avisos.
        const previo = this.remotos();
        const nuevo: Resultados = { ...previo };
        let fallaron = 0;
        fuentes.forEach((fuente, i) => {
          const lista = listas[i];
          if (lista === null) fallaron += 1;
          else nuevo[fuente] = lista;
        });
        this.remotos.set(nuevo);
        this.falloTotal.set(fallaron === fuentes.length);
        this.ultimaLectura.set(new Date());
        this.leyendo.set(false);
      },
      error: () => {
        this.falloTotal.set(true);
        this.leyendo.set(false);
      },
    });
  }

  /** El usuario ya vio la lista: lo de ahora deja de contar como nuevo hasta que cambie. */
  marcarVistos(): void {
    const siguiente: Record<string, number> = {};
    for (const aviso of this.items()) siguiente[aviso.clave] = aviso.valor;
    this.vistos.set(siguiente);
    guardarVistos(siguiente);
  }

  /**
   * Cualquier cambio del panel (venta, comprobante, caja, pedido, stock) olvida lo guardado en las cuatro cachés
   * cortas y vuelve a leer una sola vez, aunque lleguen varios eventos juntos.
   */
  private escucharEventos(): void {
    this.escuchaEventos?.unsubscribe();
    this.escuchaEventos = this.eventos.de().subscribe(() => {
      this.comprobantes.invalidarMonitor();
      this.inventario.invalidarResumen();
      this.credito.invalidar();
      this.caja.invalidarSesion();
    });
    this.escuchaEventos.add(
      this.eventos
        .de()
        .pipe(debounceTime(ESPERA_EVENTOS_MS))
        .subscribe(() => this.zona.run(() => this.refrescar())),
    );
  }

  /** Hora actual; aparte para poder probar con otra. */
  protected ahora(): Date {
    return new Date();
  }

  private arrancarReloj(): void {
    if (this.temporizador) return;
    this.zona.runOutsideAngular(() => {
      this.temporizador = setInterval(() => this.zona.run(() => this.refrescar()), CADA_MS);
    });
  }

  private pararReloj(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
  }

  /* ────────────────────────────────────────────────────────────── lecturas del servidor */

  private leerCpe(): Observable<AvisoPanel[] | null> {
    return this.comprobantes.monitorAtencion({ silenciosa: true }).pipe(
      map((m) => {
        const lista: AvisoPanel[] = [];
        const errores = numero(m?.errores);
        const pendientes = numero(m?.pendientes);
        if (errores > 0) {
          lista.push({
            clave: 'cpe-error',
            tono: 'peligro',
            icono: 'bi-file-earmark-x',
            texto: plural(errores, 'comprobante con error', 'comprobantes con error'),
            detalle: 'SUNAT no los recibió bien: revísalos y reenvíalos',
            valor: errores,
            ruta: `${RUTA}/doc`,
            accion: 'Revisar',
          });
        }
        if (pendientes > 0) {
          lista.push({
            clave: 'cpe-pendiente',
            tono: 'aviso',
            icono: 'bi-hourglass-split',
            texto: plural(pendientes, 'comprobante pendiente de envío', 'comprobantes pendientes de envío'),
            detalle: 'Aún no llegaron a SUNAT',
            valor: pendientes,
            ruta: `${RUTA}/doc`,
            accion: 'Revisar',
          });
        }
        return lista;
      }),
      catchError(() => of(null)),
    );
  }

  private leerStock(): Observable<AvisoPanel[] | null> {
    const ruta = this.auth.puedeVer(ROLES_INVENTARIO) ? `${RUTA}/inventario` : `${RUTA}/stock`;
    return this.inventario.resumen({ silenciosa: true }).pipe(
      map((r) => {
        const lista: AvisoPanel[] = [];
        const sin = numero(r?.sin_stock);
        const bajo = numero(r?.bajo_stock);
        if (sin > 0) {
          lista.push({
            clave: 'stock-cero',
            tono: 'peligro',
            icono: 'bi-box-seam',
            texto: plural(sin, 'producto sin stock', 'productos sin stock'),
            valor: sin,
            ruta,
            accion: 'Reponer',
          });
        }
        if (bajo > 0) {
          lista.push({
            clave: 'stock-bajo',
            tono: 'aviso',
            icono: 'bi-box-seam',
            texto: plural(bajo, 'producto con stock bajo', 'productos con stock bajo'),
            detalle: 'Por debajo del mínimo',
            valor: bajo,
            ruta,
            accion: 'Reponer',
          });
        }
        return lista;
      }),
      catchError(() => of(null)),
    );
  }

  private leerCuentas(): Observable<AvisoPanel[] | null> {
    return this.credito.vencidasResumen({ silenciosa: true }).pipe(
      map((r) => {
        const cuentas = numero(r?.cuentas);
        if (cuentas <= 0) return [];
        const monto = numero(r?.total);
        const texto = `S/ ${monto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        return [
          {
            clave: 'cxc-vencidas',
            tono: 'peligro',
            icono: 'bi-wallet2',
            texto: plural(cuentas, 'cuenta por cobrar vencida', 'cuentas por cobrar vencidas'),
            detalle: monto > 0 ? `${texto} por cobrar` : undefined,
            valor: cuentas,
            ruta: `${RUTA}/cuentas-por-cobrar`,
            accion: 'Cobrar',
          } satisfies AvisoPanel,
        ];
      }),
      catchError(() => of(null)),
    );
  }

  private leerCaja(): Observable<AvisoPanel[] | null> {
    return this.caja.sesion({ silenciosa: true }).pipe(
      map((s) => {
        const hora = horaEnLima(this.ahora());
        if (!s || s.abierta !== false || hora < HORA_APERTURA || hora >= HORA_CIERRE) return [];
        return [
          {
            clave: 'caja-cerrada',
            tono: 'info',
            icono: 'bi-cash-stack',
            texto: 'No has abierto caja',
            detalle: 'Ábrela para registrar cobros en tu turno',
            valor: 1,
            ruta: `${RUTA}/caja-sesion`,
            accion: 'Abrir caja',
          } satisfies AvisoPanel,
        ];
      }),
      catchError(() => of(null)),
    );
  }

  /* ────────────────────────────────────────────────────────────── lo que ya siguen otros servicios */

  private avisosPedidos(): AvisoPanel[] {
    const resumen = this.resumenPedidos();
    if (!this.permisos().pedidos || !resumen?.total) return [];
    const { pendientes, pagados, total } = resumen;
    const partes: string[] = [];
    if (pagados) partes.push(`${pagados} ${pagados === 1 ? 'pagado' : 'pagados'}, a preparar`);
    if (pendientes) partes.push(`${pendientes} por cobrar`);
    return [
      {
        clave: 'pedidos-web',
        tono: 'aviso',
        icono: 'bi-bag-check',
        texto: plural(total, 'pedido web por preparar', 'pedidos web por preparar'),
        detalle: partes.join(' · ') || undefined,
        valor: total,
        ruta: `${RUTA}/pedidos`,
        accion: 'Ver',
      },
    ];
  }

  private avisosFiscales(): AvisoPanel[] {
    const { fiscal: puede, panelFiscal } = this.permisos();
    const estado = puede ? this.fiscal.estado() : null;
    if (!estado) return [];
    const ruta = panelFiscal ? RUTA_FISCAL : undefined;
    const accion = panelFiscal ? 'Ver' : undefined;
    const lista: AvisoPanel[] = [];

    if (estado.bloqueo) {
      lista.push({
        clave: 'fiscal-rojo',
        tono: 'peligro',
        icono: 'bi-shield-exclamation',
        texto: 'SUNAT detuvo la emisión',
        detalle: estado.bloqueo.motivo,
        valor: 1,
        ruta,
        accion,
      });
    } else if (estado.semaforo === 'rojo') {
      lista.push({
        clave: 'fiscal-rojo',
        tono: 'peligro',
        icono: 'bi-shield-exclamation',
        texto: 'Hay un problema con la facturación electrónica',
        detalle: estado.motivo || 'Revisa el estado en Facturación SUNAT',
        valor: 1,
        ruta,
        accion,
      });
    } else if (estado.emision_activa === false) {
      lista.push({
        clave: 'fiscal-detenida',
        tono: 'aviso',
        icono: 'bi-pause-circle',
        texto: 'La emisión electrónica está detenida',
        detalle: estado.motivo || 'Las ventas se registran sin comprobante',
        valor: 1,
        ruta,
        accion,
      });
    }

    const vencidos = estado.plazos?.vencidos ?? 0;
    if (vencidos > 0) {
      lista.push({
        clave: 'cpe-vencidos',
        tono: 'peligro',
        icono: 'bi-calendar-x',
        texto: plural(vencidos, 'comprobante fuera del plazo de envío', 'comprobantes fuera del plazo de envío'),
        detalle: 'Revísalos en Facturación SUNAT',
        valor: vencidos,
        ruta: ruta ?? `${RUTA}/doc`,
        accion: accion ?? 'Revisar',
      });
    }
    const vencenHoy = estado.plazos?.vencen_hoy ?? 0;
    if (vencenHoy > 0) {
      lista.push({
        clave: 'cpe-vence-hoy',
        tono: 'aviso',
        icono: 'bi-clock-history',
        texto: plural(vencenHoy, 'comprobante vence hoy su plazo de envío', 'comprobantes vencen hoy su plazo de envío'),
        detalle: 'Envíalos hoy para no quedar fuera de plazo',
        valor: vencenHoy,
        ruta: ruta ?? `${RUTA}/doc`,
        accion: accion ?? 'Revisar',
      });
    }

    const cert = estado.certificado;
    if (cert?.vencido) {
      lista.push({
        clave: 'fiscal-cert',
        tono: 'peligro',
        icono: 'bi-patch-exclamation',
        texto: 'El certificado digital está vencido',
        detalle: 'Sin certificado vigente no se pueden emitir comprobantes',
        valor: 0,
        ruta,
        accion,
      });
    } else if (cert?.cargado && cert.dias_para_vencer != null && cert.dias_para_vencer <= 30) {
      const dias = cert.dias_para_vencer;
      lista.push({
        clave: 'fiscal-cert',
        tono: 'aviso',
        icono: 'bi-patch-exclamation',
        texto: dias <= 0 ? 'El certificado digital vence hoy' : `El certificado digital vence en ${plural(dias, 'día', 'días')}`,
        detalle: 'Renuévalo antes para no detener la emisión',
        // Por tramos (30, 15, 7, 0 días): vuelve a contar como nuevo en cada tramo, no cada día.
        valor: dias <= 0 ? 0 : dias <= 7 ? 7 : dias <= 15 ? 15 : 30,
        ruta,
        accion,
      });
    }
    return lista;
  }
}
