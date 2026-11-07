import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpParams } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService, SesionUsuario } from '../../../auth/service/auth.service';
import { InventarioAdminService } from '../../service/inventario-admin.service';
import { ComprobanteService } from '../../service/comprobante.service';
import { CajaSesionService, SesionCaja } from '../../service/caja-sesion.service';
import { FiscalEstadoService } from '../../service/fiscal-estado.service';
import { urlConstants } from '../../../constants/urlConstants';
import { opcionesHttp } from '../../service/api-base.service';

/** Roles que ve cada bloque: los mismos que el menú lateral (sidebar.component.ts). */
const ROLES_VENTAS = ['admin', 'superadmin', 'vendedor', 'caja'];
const ROLES_REPORTES = ['admin', 'superadmin', 'vendedor', 'caja'];
const ROLES_CXC = ['admin', 'superadmin', 'caja', 'vendedor'];
const ROLES_DOCUMENTOS = ['admin', 'superadmin', 'vendedor', 'caja'];
const ROLES_INVENTARIO = ['admin', 'superadmin', 'vendedor'];
const ROLES_STOCK = ['admin', 'superadmin', 'vendedor', 'consulta'];
const ROLES_RECEPCION = ['admin', 'superadmin', 'vendedor'];
const ROLES_FISCAL_PANEL = ['admin', 'superadmin'];

const RUTA = '/dashboard/mantenimiento';

/** Fila de «Top productos» tal como la devuelve reportes/ventas (VentasTopProducto). */
interface TopProductoApi {
  id_producto?: number | null;
  codigo?: string;
  producto?: string;
  cantidad?: number | string;
  total?: number | string;
}

interface DetalleVentaApi {
  fecha?: string;
  total_vendido?: number | string;
  tipo_documento?: 'venta' | 'nota_credito' | 'nota_debito' | string;
}

interface ReporteVentasApi {
  total_vendido?: number | string;
  detalle?: DetalleVentaApi[];
  top_productos_vendidos?: TopProductoApi[];
}

interface CuentasCobrarApi {
  data?: { saldo?: number | string; estado?: string }[];
  total?: number | string;
}

export interface FilaAtencion {
  id: string;
  tono: 'peligro' | 'aviso';
  etiqueta: string;
  texto: string;
  detalle?: string;
  accion?: string;
  ruta?: string;
}

export interface ProductoTop {
  nombre: string;
  unidades: string;
  ancho: number;
  monto: number;
}

export interface Acceso {
  titulo: string;
  desc: string;
  ruta: string;
  icono: string;
  tono: 'grafito' | 'marca' | 'exito' | 'neutro';
}

export interface BarraSemana {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  /** Centro horizontal (para rótulos). */
  xc: number;
  /** Altura del rótulo del valor sobre la barra. */
  yValor: number;
  valor: number;
  valorCorto: string;
  etiqueta: string;
  titulo: string;
  esHoy: boolean;
}

export interface MarcaEje {
  y: number;
  texto: string;
}

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Zona de dibujo del gráfico (viewBox 640 × 200, igual que la maqueta).
const G_X0 = 40;
const G_X1 = 640;
const G_Y_ARRIBA = 20;
const G_Y_ABAJO = 170;

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD' en la fecha local del navegador. */
function claveDia(fecha: Date): string {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/** Paso «redondo» (1, 2, 2.5, 5 × 10ⁿ) que cubre `valor`. */
function pasoRedondo(valor: number): number {
  if (valor <= 0) return 1;
  const potencia = Math.pow(10, Math.floor(Math.log10(valor)));
  for (const f of [1, 2, 2.5, 5, 10]) {
    if (f * potencia >= valor) return f * potencia;
  }
  return 10 * potencia;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  sesion: SesionUsuario = {
    idUsuario: 0,
    nombre: '',
    email: '',
    rolId: 0,
    rolNombre: '',
    permisos: [],
    iniciales: '?',
  };

  // ── Permisos de cada bloque (se recalculan con la sesión) ──
  veVender = false;
  veCaja = false;
  veReportes = false;
  veCxc = false;
  veDocumentos = false;
  veInventario = false;
  veStock = false;
  veFiscalPanel = false;
  accesos: Acceso[] = [];

  cargando = true;

  // ── Datos (null = no cargó / sin permiso: se muestra «—», nunca un 0 falso) ──
  ventasHoy: number | null = null;
  ticketPromedio: number | null = null;
  numVentas: number | null = null;
  cxcVencidoMonto: number | null = null;
  cxcVencidoCuentas: number | null = null;
  /** La lista de vencidas llegó recortada: el monto es un mínimo. */
  cxcParcial = false;
  sinStock: number | null = null;
  bajoStock: number | null = null;
  cpeAtencion: number | null = null;
  cajaAbierta: boolean | null = null;
  cajaNombre = '';
  turnoDesde = '';
  turnoUsuario = '';
  turnoVentas: number | null = null;
  efectivoTurno: number | null = null;
  detalleMedios = '';
  actualizadoA = '';

  // ── Ventas de la semana ──
  semanaCargada = false;
  semanaConDatos = false;
  semanaFalla = false;
  barras: BarraSemana[] = [];
  marcasEje: MarcaEje[] = [];
  resumenSemana = '';
  hallazgoSemana = '';

  // ── Lo más vendido ──
  topProductos: ProductoTop[] = [];
  topCargado = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fiscal = inject(FiscalEstadoService);

  constructor(
    private readonly authService: AuthService,
    private readonly inventario: InventarioAdminService,
    private readonly comprobantes: ComprobanteService,
    private readonly caja: CajaSesionService,
    private readonly http: HttpClient,
  ) {}

  ngOnInit(): void {
    this.aplicarSesion();
    this.authService.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.aplicarSesion();
      this.cdr.markForCheck();
    });
    this.cargarDatos();
  }

  private aplicarSesion(): void {
    this.sesion = this.authService.getSesion();
    const puede = (roles: string[]) => this.authService.puedeVer(roles);
    this.veVender = puede(ROLES_VENTAS);
    this.veCaja = puede(ROLES_VENTAS);
    this.veReportes = puede(ROLES_REPORTES);
    this.veCxc = puede(ROLES_CXC);
    this.veDocumentos = puede(ROLES_DOCUMENTOS);
    this.veInventario = puede(ROLES_INVENTARIO);
    this.veStock = puede(ROLES_STOCK);
    this.veFiscalPanel = puede(ROLES_FISCAL_PANEL);

    const todos: { acceso: Acceso; roles: string[] }[] = [
      {
        acceso: { titulo: 'Vender', desc: 'Boleta o factura', ruta: `${RUTA}/ventas`, icono: 'bi-receipt', tono: 'grafito' },
        roles: ROLES_VENTAS,
      },
      {
        acceso: { titulo: 'Cotizar', desc: 'PDF y WhatsApp', ruta: `${RUTA}/cotizaciones`, icono: 'bi-file-earmark-ruled', tono: 'marca' },
        roles: ROLES_VENTAS,
      },
      {
        acceso: { titulo: 'Recibir mercadería', desc: 'Entrada a almacén', ruta: `${RUTA}/recepcion`, icono: 'bi-box-arrow-in-down', tono: 'exito' },
        roles: ROLES_RECEPCION,
      },
      {
        acceso: { titulo: 'Cerrar caja', desc: 'Arqueo del turno', ruta: `${RUTA}/caja-sesion`, icono: 'bi-cash-stack', tono: 'neutro' },
        roles: ROLES_VENTAS,
      },
    ];
    this.accesos = todos.filter((a) => puede(a.roles)).map((a) => a.acceso);
  }

  get etiquetaRol(): string {
    return this.authService.etiquetaRol(this.sesion.rolNombre);
  }

  /** Primer nombre para el saludo; el nombre completo va en el pie del menú. */
  get nombreCorto(): string {
    const nombre = (this.sesion.nombre || '').trim();
    return nombre ? nombre.split(/\s+/)[0] : 'Usuario';
  }

  get saludo(): string {
    const hora = new Date().getHours();
    if (hora < 12) return 'Buenos días';
    if (hora < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  /** Cuántas tarjetas de KPI se ven (para repartir el ancho de la fila). */
  get kpisVisibles(): number {
    return 1 + (this.veReportes ? 1 : 0) + (this.veCxc ? 1 : 0) + (this.veCaja ? 1 : 0);
  }

  /** Línea del saludo: estado del turno de caja. Vacía si no se pudo leer o el rol no usa caja. */
  get lineaTurno(): string {
    if (!this.veCaja || this.cajaAbierta == null) return '';
    if (!this.cajaAbierta) return 'Aún no abres caja hoy';
    const partes = ['Turno abierto'];
    if (this.turnoDesde) partes[0] += ` desde las ${this.turnoDesde}`;
    if (this.turnoUsuario) partes[0] += ` por ${this.turnoUsuario}`;
    if (this.turnoVentas != null) {
      partes.push(`${this.turnoVentas} ${this.turnoVentas === 1 ? 'venta' : 'ventas'} hasta ahora`);
    }
    return partes.join(' · ');
  }

  /**
   * Cosas que conviene resolver, armadas con lo que ya se lee. El estado fiscal sale del mismo
   * servicio que usa la barra superior (se renueva solo; aquí solo se lee).
   */
  get filasAtencion(): FilaAtencion[] {
    const filas: FilaAtencion[] = [];
    const estadoFiscal = this.fiscal.estado();

    if (this.veDocumentos && this.cpeAtencion) {
      filas.push({
        id: 'cpe',
        tono: 'peligro',
        etiqueta: 'SUNAT',
        texto:
          this.cpeAtencion === 1
            ? '1 comprobante necesita atención'
            : `${this.cpeAtencion} comprobantes necesitan atención`,
        detalle: 'Pendientes de envío o con error',
        accion: 'Revisar',
        ruta: `${RUTA}/doc`,
      });
    }

    if (estadoFiscal) {
      if (estadoFiscal.bloqueo) {
        filas.push({
          id: 'fiscal-bloqueo',
          tono: 'peligro',
          etiqueta: 'Fiscal',
          texto: 'SUNAT detuvo la emisión',
          detalle: estadoFiscal.bloqueo.motivo,
          accion: this.veFiscalPanel ? 'Ver' : undefined,
          ruta: this.veFiscalPanel ? '/dashboard/facturacion-sunat' : undefined,
        });
      } else if (estadoFiscal.emision_activa === false) {
        filas.push({
          id: 'fiscal-inactiva',
          tono: 'aviso',
          etiqueta: 'Fiscal',
          texto: 'La emisión electrónica está detenida',
          detalle: estadoFiscal.motivo || 'Las ventas se registran sin comprobante.',
          accion: this.veFiscalPanel ? 'Ver' : undefined,
          ruta: this.veFiscalPanel ? '/dashboard/facturacion-sunat' : undefined,
        });
      }
      const vencidos = estadoFiscal.plazos?.vencidos ?? 0;
      if (vencidos > 0) {
        filas.push({
          id: 'fiscal-plazos',
          tono: 'peligro',
          etiqueta: 'Fiscal',
          texto:
            vencidos === 1
              ? '1 comprobante fuera del plazo de envío'
              : `${vencidos} comprobantes fuera del plazo de envío`,
          detalle: 'Revísalos en Facturación SUNAT',
          accion: this.veFiscalPanel ? 'Ver' : undefined,
          ruta: this.veFiscalPanel ? '/dashboard/facturacion-sunat' : undefined,
        });
      }
      const cert = estadoFiscal.certificado;
      if (cert?.vencido) {
        filas.push({
          id: 'fiscal-cert',
          tono: 'peligro',
          etiqueta: 'Fiscal',
          texto: 'El certificado digital está vencido',
          detalle: 'Sin certificado vigente no se pueden emitir comprobantes',
          accion: this.veFiscalPanel ? 'Ver' : undefined,
          ruta: this.veFiscalPanel ? '/dashboard/facturacion-sunat' : undefined,
        });
      } else if (cert?.cargado && cert.dias_para_vencer != null && cert.dias_para_vencer <= 30) {
        filas.push({
          id: 'fiscal-cert',
          tono: 'aviso',
          etiqueta: 'Fiscal',
          texto:
            cert.dias_para_vencer <= 0
              ? 'El certificado digital vence hoy'
              : `El certificado digital vence en ${cert.dias_para_vencer} ${cert.dias_para_vencer === 1 ? 'día' : 'días'}`,
          detalle: 'Renuévalo antes para no detener la emisión',
          accion: this.veFiscalPanel ? 'Ver' : undefined,
          ruta: this.veFiscalPanel ? '/dashboard/facturacion-sunat' : undefined,
        });
      }
    }

    const rutaStock = this.veInventario ? `${RUTA}/inventario` : `${RUTA}/stock`;
    if (this.veStock && this.sinStock) {
      filas.push({
        id: 'sin-stock',
        tono: 'peligro',
        etiqueta: 'Stock',
        texto:
          this.sinStock === 1 ? '1 producto sin stock' : `${this.sinStock} productos sin stock`,
        accion: 'Reponer',
        ruta: rutaStock,
      });
    }
    if (this.veStock && this.bajoStock) {
      filas.push({
        id: 'bajo-stock',
        tono: 'aviso',
        etiqueta: 'Stock',
        texto:
          this.bajoStock === 1
            ? '1 producto con stock bajo'
            : `${this.bajoStock} productos con stock bajo`,
        detalle: 'Por debajo del mínimo',
        accion: 'Reponer',
        ruta: rutaStock,
      });
    }

    if (this.veCxc && this.cxcVencidoCuentas) {
      filas.push({
        id: 'cxc',
        tono: 'peligro',
        etiqueta: 'Cobranza',
        texto:
          this.cxcVencidoCuentas === 1
            ? '1 cuenta por cobrar vencida'
            : `${this.cxcVencidoCuentas} cuentas por cobrar vencidas`,
        detalle: this.cxcVencidoMonto != null ? `${this.cxcParcial ? 'Al menos ' : ''}${this.soles(this.cxcVencidoMonto)} por cobrar` : undefined,
        accion: 'Cobrar',
        ruta: `${RUTA}/cuentas-por-cobrar`,
      });
    }

    return filas;
  }

  /** Hubo al menos una lectura que alimenta «Necesita tu atención» (para no decir «todo en orden» a ciegas). */
  get atencionRevisada(): boolean {
    return (
      this.sinStock != null ||
      this.bajoStock != null ||
      this.cpeAtencion != null ||
      this.cxcVencidoCuentas != null ||
      this.fiscal.estado() != null
    );
  }

  /** Importe en soles con separador de miles y dos decimales. */
  soles(valor: number): string {
    return `S/ ${valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private cargarDatos(): void {
    this.cargando = true;
    this.cdr.markForCheck();

    const sinPermiso = <T>(permitido: boolean, peticion: () => Observable<T>): Observable<T | null> =>
      permitido ? peticion().pipe(catchError(() => of(null))) : of(null);

    const reporte = (periodo: 'diario' | 'semana') =>
      this.http.get<ReporteVentasApi>(`${urlConstants.reportes.ventas}?periodo=${periodo}`, opcionesHttp());

    forkJoin({
      inv: sinPermiso(this.veStock, () => this.inventario.resumen()),
      cpe: sinPermiso(this.veDocumentos, () => this.comprobantes.monitorAtencion()),
      caja: sinPermiso(this.veCaja, () => this.caja.sesion()),
      hoy: sinPermiso(this.veReportes, () => reporte('diario')),
      semana: sinPermiso(this.veReportes, () => reporte('semana')),
      cxc: sinPermiso(this.veCxc, () =>
        this.http.get<CuentasCobrarApi>(urlConstants.credito.cuentas, {
          ...opcionesHttp(),
          params: new HttpParams().set('estado', 'vencido').set('limite', '100'),
        }),
      ),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ inv, cpe, caja, hoy, semana, cxc }) => {
        this.sinStock = inv?.sin_stock ?? null;
        this.bajoStock = inv?.bajo_stock ?? null;
        this.cpeAtencion = cpe?.total ?? null;
        this.aplicarCaja(caja);
        this.aplicarVentasHoy(hoy);
        this.aplicarSemana(semana);
        this.aplicarCuentas(cxc);
        const ahora = new Date();
        this.actualizadoA = `${dosDigitos(ahora.getHours())}:${dosDigitos(ahora.getMinutes())}`;
        this.cargando = false;
        this.cdr.markForCheck();
      });
  }

  private aplicarCaja(caja: SesionCaja | null): void {
    this.cajaAbierta = caja ? caja.abierta === true : null;
    this.cajaNombre = caja?.apertura?.caja_nombre || '';
    this.turnoDesde = '';
    this.turnoUsuario = '';
    this.turnoVentas = null;
    this.efectivoTurno = null;
    this.detalleMedios = '';
    if (!caja || !caja.abierta) return;

    const apertura = caja.apertura as (SesionCaja['apertura'] & { usuario_nombre?: string | null }) | null;
    if (apertura?.fecha) {
      const fecha = new Date(apertura.fecha);
      if (!Number.isNaN(fecha.getTime())) {
        this.turnoDesde = `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`;
      }
    }
    // El nombre solo se muestra si la API lo trae o si el turno es del usuario en sesión.
    if (apertura?.usuario_nombre) this.turnoUsuario = apertura.usuario_nombre;
    else if (apertura?.id_usuario != null && apertura.id_usuario === this.sesion.idUsuario) {
      this.turnoUsuario = this.sesion.nombre;
    }

    const resumen = caja.resumen;
    if (!resumen) return;
    this.turnoVentas = resumen.ventas ?? null;
    const metodos = Array.isArray(resumen.por_metodo) ? resumen.por_metodo : [];
    const total = (patron: RegExp) =>
      metodos.filter((m) => patron.test(m.metodo || '')).reduce((s, m) => s + numero(m.total), 0);
    this.efectivoTurno = total(/efectivo/i);
    const otros: string[] = [];
    const yape = total(/yape/i);
    const tarjeta = total(/tarjeta/i);
    if (yape > 0) otros.push(`Yape ${this.soles(yape)}`);
    if (tarjeta > 0) otros.push(`tarjeta ${this.soles(tarjeta)}`);
    this.detalleMedios = otros.join(' · ');
  }

  private aplicarVentasHoy(hoy: ReporteVentasApi | null): void {
    this.ventasHoy = null;
    this.numVentas = null;
    this.ticketPromedio = null;
    if (!hoy || hoy.total_vendido == null) return;
    this.ventasHoy = numero(hoy.total_vendido);
    const ventas = (hoy.detalle ?? []).filter((d) => !d.tipo_documento || d.tipo_documento === 'venta');
    this.numVentas = ventas.length;
    if (ventas.length > 0) {
      const suma = ventas.reduce((s, d) => s + numero(d.total_vendido), 0);
      this.ticketPromedio = suma / ventas.length;
    }

    const maximo = Math.max(0, ...(hoy.top_productos_vendidos ?? []).map((p) => numero(p.cantidad)));
    this.topProductos = (hoy.top_productos_vendidos ?? []).slice(0, 4).map((p) => {
      const cantidad = numero(p.cantidad);
      return {
        nombre: (p.producto || '').trim() || 'Producto sin descripción',
        unidades: `${cantidad.toLocaleString('es-PE', { maximumFractionDigits: 2 })} ${cantidad === 1 ? 'unidad' : 'unidades'}`,
        ancho: maximo > 0 ? Math.max(4, Math.round((cantidad / maximo) * 100)) : 0,
        monto: numero(p.total),
      };
    });
    this.topCargado = true;
  }

  /** Arma las barras de lunes a hoy con el neto de cada día (los días sin ventas valen 0). */
  private aplicarSemana(semana: ReporteVentasApi | null): void {
    this.semanaCargada = true;
    this.semanaFalla = semana == null;
    this.semanaConDatos = false;
    this.barras = [];
    this.marcasEje = [];
    this.resumenSemana = '';
    this.hallazgoSemana = '';
    if (!semana) return;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const desdeLunes = (hoy.getDay() + 6) % 7;
    const dias: { clave: string; fecha: Date; total: number }[] = [];
    for (let i = desdeLunes; i >= 0; i--) {
      const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i);
      dias.push({ clave: claveDia(fecha), fecha, total: 0 });
    }
    for (const d of semana.detalle ?? []) {
      const dia = dias.find((x) => x.clave === String(d.fecha ?? '').slice(0, 10));
      if (dia) dia.total += numero(d.total_vendido);
    }

    const maximo = Math.max(...dias.map((d) => d.total));
    if (!(maximo > 0)) return;
    this.semanaConDatos = true;

    const paso = pasoRedondo(maximo / 3);
    const tope = paso * 3;
    const alto = G_Y_ABAJO - G_Y_ARRIBA;
    this.marcasEje = [3, 2, 1, 0].map((nivel) => ({
      y: G_Y_ABAJO - (alto * nivel) / 3,
      texto: this.entero(paso * nivel),
    }));

    const hueco = (G_X1 - G_X0) / dias.length;
    const ancho = Math.min(44, hueco * 0.55);
    this.barras = dias.map((d, i) => {
      const altura = Math.max(0, (d.total / tope) * alto);
      const esHoy = i === dias.length - 1;
      const x = G_X0 + hueco * i + (hueco - ancho) / 2;
      const nombre = DIAS_CORTOS[d.fecha.getDay()];
      return {
        x,
        y: G_Y_ABAJO - altura,
        ancho,
        alto: altura,
        xc: x + ancho / 2,
        yValor: G_Y_ABAJO - altura - 6,
        valor: d.total,
        valorCorto: this.entero(d.total),
        etiqueta: `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${d.fecha.getDate()}`,
        titulo: `${DIAS_LARGOS[d.fecha.getDay()]} ${d.fecha.getDate()}: ${this.soles(d.total)}`,
        esHoy,
      };
    });

    const total = dias.reduce((s, d) => s + d.total, 0);
    const mejor = dias.reduce((a, b) => (b.total > a.total ? b : a));
    this.resumenSemana = `Ventas netas de lunes a hoy: ${this.soles(total)}.`;
    this.hallazgoSemana = `El mejor día fue el ${DIAS_LARGOS[mejor.fecha.getDay()]} ${mejor.fecha.getDate()}, con ${this.soles(mejor.total)}.`;
  }

  private aplicarCuentas(cxc: CuentasCobrarApi | null): void {
    this.cxcVencidoMonto = null;
    this.cxcVencidoCuentas = null;
    this.cxcParcial = false;
    if (!cxc || !Array.isArray(cxc.data)) return;
    const vencidas = cxc.data.filter((c) => !c.estado || c.estado === 'vencido');
    const total = cxc.total != null ? numero(cxc.total) : vencidas.length;
    this.cxcVencidoCuentas = Math.max(total, vencidas.length);
    this.cxcVencidoMonto = vencidas.reduce((s, c) => s + numero(c.saldo), 0);
    this.cxcParcial = this.cxcVencidoCuentas > vencidas.length;
  }

  private entero(valor: number): string {
    return Math.round(valor).toLocaleString('es-PE');
  }
}
