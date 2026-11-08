import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, forkJoin, of, switchMap, takeUntil } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PuntoVentaService } from '../../../service/punto-venta.service';
import { ReceptorService } from '../../../service/receptor.service';
import { GestionService } from '../../service/gestion.service';
import { AuthService } from '../../../../auth/service/auth.service';
import { rolPermitido } from '../../../../auth/roles.constants';
import { ColumnaOrdenable, OrdenMovilComponent } from '../../../../shared/components/orden-movil/orden-movil.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { ColumnaCsv, exportarCsv } from '../../../../shared/utils/exportar-csv';
import { urlWhatsappCliente } from '../../../../shared/utils/whatsapp.util';
import {
  DefinicionTramo, TRAMOS, Tramo, claveDeudor, diasParaVencer, primerTelefonoValido, soles, textoRecordatorio, tramoDeAtraso,
} from './cobranza.util';
import {
  EstadoOrden, alternarOrden, ariaSort, guardarOrden, iconoOrden, leerOrdenGuardado, ordenarLista,
} from '../../../../shared/utils/orden-lista';
import { BusquedaPendiente, filtrarInstantaneo } from '../../../../shared/utils/filtro-instantaneo.util';
import { mensajeDeError, errorOperativo, escapeHtmlAlerta } from '../../../service/api-base.service';
import { SugerenciaReceptor } from '../../../models/admin.models';
import { CountUpDirective } from '../../../../shared/ui/count-up.directive';
import { RevealDirective } from '../../../../shared/ui/reveal.directive';

const COLUMNAS_ORDEN: ColumnaOrdenable[] = [
  { clave: 'deudor', titulo: 'Deudor', tipo: 'texto' },
  { clave: 'venta', titulo: 'Venta', tipo: 'numero' },
  { clave: 'vence', titulo: 'Vence', tipo: 'fecha' },
  { clave: 'total', titulo: 'Total', tipo: 'numero' },
  { clave: 'saldo', titulo: 'Saldo', tipo: 'numero' },
  { clave: 'estado', titulo: 'Estado', tipo: 'texto' },
];

/** Respuesta de `credito/cuentas/antiguedad`: importe y cuentas de cada tramo, de todas las cuentas con saldo. */
export interface AntiguedadServidor {
  al_dia: { cuentas: number; saldo: number };
  de_1_a_30: { cuentas: number; saldo: number };
  de_31_a_60: { cuentas: number; saldo: number };
  mas_de_60: { cuentas: number; saldo: number };
}

/** Qué campo del servidor alimenta cada tarjeta. */
const CAMPO_TRAMO: Record<Tramo, keyof AntiguedadServidor> = {
  aldia: 'al_dia',
  d1_30: 'de_1_a_30',
  d31_60: 'de_31_a_60',
  d60: 'mas_de_60',
};

/** Una tarjeta de antigüedad: importe y número de cuentas de un tramo. */
export interface ResumenTramo extends DefinicionTramo {
  importe: number;
  cuentas: number;
}

@Component({
  selector: 'app-cuentas-por-cobrar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, CountUpDirective, RevealDirective, OrdenMovilComponent],
  templateUrl: './cuentas-por-cobrar.component.html',
  styleUrl: './cuentas-por-cobrar.component.css',
})
export class CuentasPorCobrarComponent implements OnInit, OnDestroy {
  cuentas: any[] = [];
  /** Tramo de antigüedad elegido en los chips ('' = todos). Filtra la tabla, no los totales. */
  filtroTramo: Tramo | '' = '';
  /** Recordatorio de cobro abierto: la cuenta, el teléfono y el texto que el usuario puede editar. */
  recordatorio: { cuenta: any; telefono: string; texto: string } | null = null;
  @ViewChild('recordatorioTexto') private recordatorioTexto?: ElementRef<HTMLTextAreaElement>;
  /** Teléfonos del padrón por deudor (`c:ID` persona, `e:ID` empresa); se cargan una vez. */
  private telefonos = new Map<string, string>();
  private padronCargado = false;
  private memoTramos?: { lista: readonly any[]; resultado: ResumenTramo[] };
  /** Antigüedad calculada por el servidor sobre todas las cuentas; null mientras llega o si no la tiene (entonces se calcula aquí). */
  antiguedadServidor: AntiguedadServidor | null = null;
  /** Cuentas cargadas filtradas por el texto escrito (al instante, sin esperar al servidor). */
  cuentasVisibles: readonly any[] = [];
  /** Búsqueda pendiente en el servidor: evita mostrar «sin cuentas» antes de que llegue. */
  readonly busqueda = new BusquedaPendiente();
  total = 0;
  /** Orden de la tabla: solo cuando la lista llegó completa (ver `listaCompleta`). */
  orden: EstadoOrden = leerOrdenGuardado('cuentas-por-cobrar', COLUMNAS_ORDEN.map((c) => c.clave));
  readonly columnasOrden = COLUMNAS_ORDEN;
  private memoOrden?: { lista: readonly any[]; orden: EstadoOrden; completa: boolean; tramo: Tramo | ''; resultado: readonly any[] };
  cargando = false;
  /** La última carga de cuentas falló (solo para mostrar el estado de error en pantalla; el aviso modal sigue igual). */
  errorCarga = false;
  filtroEstado = '';
  filtroTexto = '';
  seleccion: any = null;
  metodos: { id_metodo: number; nombre: string; tipo?: string }[] = [];

  abono = { monto: null as number | null, id_metodo: null as number | null, referencia: '' };
  abonando = false;

  cuentasBancarias: any[] = [];
  cuentaForm = {
    banco: '',
    alias: '',
    tipo_cuenta: 'ahorros',
    numero_cuenta: '',
    cci: '',
    titular: 'Hatunsales S.A.C',
    activo: true,
    es_yape: false,
  };
  editandoCuentaId: number | null = null;
  guardandoCuenta = false;

  config = {
    tipo: 'cliente' as 'cliente' | 'empresa',
    id: null as number | null,
    credito_activo: false,
    limite_credito: 0,
    dias_credito: 15,
  };
  textoBusqueda = '';
  sugerencias: SugerenciaReceptor[] = [];
  seleccionado: SugerenciaReceptor | null = null;
  buscandoEntidad = false;
  guardandoConfig = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auth = inject(AuthService);
  private readonly gestion = inject(GestionService);
  private readonly destruir$ = new Subject<void>();
  private readonly buscar$ = new Subject<string>();
  private readonly filtrarCuentas$ = new Subject<void>();

  /** Crear / editar / desactivar cuentas bancarias: solo admin (API también lo exige). */
  get esAdmin(): boolean {
    const s = this.auth.getSesion();
    return rolPermitido(s.rolNombre, ['admin', 'superadmin'], s.rolId);
  }

  constructor(
    private readonly pv: PuntoVentaService,
    private readonly receptor: ReceptorService,
    private readonly alerta: AlertService,
  ) {}

  ngOnInit(): void {
    this.filtrarCuentas$.pipe(debounceTime(250), takeUntil(this.destruir$)).subscribe(() => this.cargar());
    this.cargar();
    this.cargarCuentas();
    this.pv.metodosPago().subscribe({
      next: (m) => {
        this.metodos = (m || []).filter((x) => (x.tipo || '').toLowerCase() !== 'credito');
        if (this.metodos[0]) this.abono.id_metodo = this.metodos[0].id_metodo;
        this.cdr.markForCheck();
      },
      error: () => {
        this.metodos = [];
        this.cdr.markForCheck();
      },
    });

    this.buscar$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((texto) => {
          const q = texto.trim();
          if (q.length < 2) return of([] as SugerenciaReceptor[]);
          this.buscandoEntidad = true;
          this.cdr.markForCheck();
          return this.receptor.sugerencias(q, 10).pipe(
            catchError(() => of([] as SugerenciaReceptor[])),
          );
        }),
        takeUntil(this.destruir$),
      )
      .subscribe((lista) => {
        this.sugerencias = (lista || []).filter((s) => s.tipo === this.config.tipo);
        this.buscandoEntidad = false;

        // Si hay un solo match claro (doc exacto), lo elige solo.
        if (!this.seleccionado && this.sugerencias.length === 1) {
          const s = this.sugerencias[0];
          const digitos = this.textoBusqueda.replace(/\D/g, '');
          const doc = (s.numero_documento || '').replace(/\D/g, '');
          if (digitos && digitos === doc && (digitos.length === 8 || digitos.length === 11)) {
            this.elegirSugerencia(s);
            return;
          }
        }

        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  // ── Resumen y presentación (solo vista; calculado sobre las cuentas que muestra la lista) ──

  private monto(valor: unknown): number {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  /** Días hasta el vencimiento (negativo = ya venció; 0 = vence hoy). null si la fecha no es válida. */
  diasPara(c: any): number | null {
    return diasParaVencer(c?.fecha_vencimiento);
  }

  /** «Vence en 5 días», «Vence hoy», «Venció hace 7 días» o «Pagada». */
  textoVence(c: any): string {
    if (c?.estado === 'pagado') return 'Pagada';
    const d = this.diasPara(c);
    if (d === null) return '';
    if (d === 0) return 'Vence hoy';
    if (d === 1) return 'Vence mañana';
    if (d > 1) return `Vence en ${d} días`;
    return d === -1 ? 'Venció ayer' : `Venció hace ${-d} días`;
  }

  /** Lo mismo en minúscula para frases: «faltan 5 días», «vence hoy», «venció hace 7 días». */
  textoDias(c: any): string {
    if (c?.estado === 'pagado') return '';
    const d = this.diasPara(c);
    if (d === null) return '';
    if (d === 0) return 'vence hoy';
    if (d === 1) return 'vence mañana';
    if (d > 1) return `faltan ${d} días`;
    return d === -1 ? 'venció ayer' : `venció hace ${-d} días`;
  }

  /** Urgencia del vencimiento para colorear el texto: neutro, aviso (≤ 3 días) o peligro (vencida). */
  urgenciaVence(c: any): 'neutro' | 'aviso' | 'peligro' | 'exito' {
    if (c?.estado === 'pagado') return 'exito';
    const d = this.diasPara(c);
    if (c?.estado === 'vencido' || (d !== null && d < 0)) return 'peligro';
    return d !== null && d <= 3 ? 'aviso' : 'neutro';
  }

  /** Parte ya cobrada de una cuenta (0–100). */
  pctCobro(c: any): number {
    const total = this.monto(c?.monto_total);
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((total - this.monto(c?.saldo)) / total) * 100)));
  }

  // ── Antigüedad de la deuda (cuentas con saldo pendiente, por días de atraso) ──

  /** Tramo de una cuenta, o null si no hay deuda que cobrar (pagada, anulada o sin fecha). */
  tramoDe(c: any): Tramo | null {
    if (c?.estado === 'pagado' || c?.estado === 'anulado' || this.monto(c?.saldo) <= 0) return null;
    const d = this.diasPara(c);
    return d === null ? null : tramoDeAtraso(-d);
  }

  /**
   * Las cuatro tarjetas: lo que calculó el servidor sobre todas las cuentas con saldo si respondió; si no, el cálculo
   * local sobre las cuentas cargadas (búsqueda aplicada).
   */
  get tarjetasTramos(): ResumenTramo[] {
    const servidor = this.antiguedadServidor;
    if (!servidor) return this.tramos;
    return TRAMOS.map((t) => ({
      ...t,
      importe: this.monto(servidor[CAMPO_TRAMO[t.clave]]?.saldo),
      cuentas: this.monto(servidor[CAMPO_TRAMO[t.clave]]?.cuentas),
    }));
  }

  /** Cálculo local por tramo, sobre las cuentas visibles; los chips de filtro cuentan lo que hay en la tabla. */
  get tramos(): ResumenTramo[] {
    const lista = this.cuentasVisibles;
    if (this.memoTramos?.lista === lista) return this.memoTramos.resultado;
    const resultado: ResumenTramo[] = TRAMOS.map((t) => ({ ...t, importe: 0, cuentas: 0 }));
    for (const c of lista) {
      const t = this.tramoDe(c);
      if (!t) continue;
      const fila = resultado.find((r) => r.clave === t)!;
      fila.importe += this.monto(c.saldo);
      fila.cuentas++;
    }
    this.memoTramos = { lista, resultado };
    return resultado;
  }

  get cuentasEnTramos(): number {
    return this.tramos.reduce((s, t) => s + t.cuentas, 0);
  }

  elegirTramo(clave: Tramo | ''): void {
    this.filtroTramo = this.filtroTramo === clave ? '' : clave;
  }

  etiquetaTramo(clave: Tramo | ''): string {
    return TRAMOS.find((t) => t.clave === clave)?.etiqueta ?? '';
  }

  /** Días de atraso de una cuenta con deuda (0 si no venció). */
  diasAtraso(c: any): number {
    const d = this.diasPara(c);
    return d !== null && d < 0 ? -d : 0;
  }

  // ── Recordatorio por WhatsApp ──

  /** Teléfono válido (51XXXXXXXXX) del deudor según el padrón, o null. */
  telefonoDe(c: any): string | null {
    const delServidor = primerTelefonoValido(c?.telefono);
    if (delServidor) return delServidor;
    const clave = claveDeudor(c);
    return clave ? (this.telefonos.get(clave) ?? null) : null;
  }

  /** Solo se cobra lo que tiene saldo pendiente. */
  puedeCobrar(c: any): boolean {
    return c?.estado !== 'pagado' && c?.estado !== 'anulado' && this.monto(c?.saldo) > 0;
  }

  /** Los teléfonos vienen del padrón de clientes y empresas: se piden una vez y sin molestar si fallan. */
  private cargarPadron(): void {
    if (this.padronCargado) return;
    this.padronCargado = true;
    forkJoin([
      this.gestion.getClientes().pipe(catchError(() => of([] as any[]))),
      this.receptor.empresas(500).pipe(catchError(() => of([] as any[]))),
    ]).pipe(takeUntil(this.destruir$)).subscribe(([personas, empresas]) => {
      const mapa = new Map<string, string>();
      for (const p of personas ?? []) {
        const tel = primerTelefonoValido(p?.telefono);
        if (tel && p?.id_cliente) mapa.set(`c:${Number(p.id_cliente)}`, tel);
      }
      for (const e of empresas ?? []) {
        const tel = primerTelefonoValido(e?.telefonos ?? e?.telefono);
        if (tel && e?.id_empresa) mapa.set(`e:${Number(e.id_empresa)}`, tel);
      }
      this.telefonos = mapa;
      this.cdr.markForCheck();
    });
  }

  abrirRecordatorio(c: any): void {
    const telefono = this.telefonoDe(c);
    if (!telefono) return;
    this.recordatorio = {
      cuenta: c,
      telefono,
      texto: textoRecordatorio({
        nombre: c.deudor,
        saldo: c.saldo,
        idVenta: c.id_venta,
        comprobante: c.comprobante,
        fechaVencimiento: c.fecha_vencimiento,
        dias: this.diasPara(c),
      }),
    };
    this.cdr.markForCheck();
    setTimeout(() => this.recordatorioTexto?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  cerrarRecordatorio(): void {
    if (!this.recordatorio) return;
    this.recordatorio = null;
    this.cdr.markForCheck();
  }

  /** Enlace wa.me con el texto editado; null si el texto quedó vacío. */
  get enlaceRecordatorio(): string | null {
    const r = this.recordatorio;
    return r && r.texto.trim() ? urlWhatsappCliente(r.telefono, r.texto) : null;
  }

  enviarRecordatorio(): void {
    const url = this.enlaceRecordatorio;
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
    this.recordatorio = null;
    this.cdr.markForCheck();
  }

  /** Importe formateado para textos (también lo usa la plantilla del cuadro). */
  soles(valor: unknown): string {
    return soles(valor);
  }

  /** Ruta de la hoja de estado de cuenta del deudor de la cuenta, o null si no se sabe quién es. */
  rutaEstadoCuenta(c: any): string[] | null {
    const clave = claveDeudor(c);
    if (!clave) return null;
    const [tipo, id] = clave.split(':');
    return ['/dashboard/mantenimiento/cuentas-por-cobrar/estado-cuenta', tipo === 'e' ? 'empresa' : 'cliente', id];
  }

  get totalSaldo(): number {
    return this.cuentasVisibles.reduce((s, c) => s + this.monto(c.saldo), 0);
  }

  get saldoVencido(): number {
    return this.cuentasVisibles.filter((c) => c.estado === 'vencido').reduce((s, c) => s + this.monto(c.saldo), 0);
  }

  get cuentasVencidas(): number {
    return this.cuentasVisibles.filter((c) => c.estado === 'vencido').length;
  }

  /** Saldo de las cuentas vigentes que vencen en los próximos 7 días (incluye hoy). */
  get saldoPorVencer(): number {
    return this.cuentasPorVencerLista.reduce((s, c) => s + this.monto(c.saldo), 0);
  }

  get cuentasPorVencer(): number {
    return this.cuentasPorVencerLista.length;
  }

  private get cuentasPorVencerLista(): any[] {
    return this.cuentasVisibles.filter((c) => {
      if (c.estado !== 'pendiente' && c.estado !== 'parcial') return false;
      const d = this.diasPara(c);
      return d !== null && d >= 0 && d <= 7;
    });
  }

  get cuentasConSaldo(): number {
    return this.cuentasVisibles.filter((c) => this.monto(c.saldo) > 0).length;
  }

  get totalCobrado(): number {
    return this.cuentasVisibles.reduce((s, c) => s + Math.max(0, this.monto(c.monto_total) - this.monto(c.saldo)), 0);
  }

  get pctCobrado(): number {
    const facturado = this.cuentasVisibles.reduce((s, c) => s + this.monto(c.monto_total), 0);
    return facturado > 0 ? Math.round((this.totalCobrado / facturado) * 100) : 0;
  }

  /** Iniciales para el avatar de un banco o deudor («BCP» → «BC», «Juan Pérez» → «JP»). */
  iniciales(texto: unknown): string {
    const partes = String(texto ?? '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    return (partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[1][0]).toUpperCase();
  }

  /** Tono estable (0–5) del avatar según el texto. */
  tonoDe(texto: unknown): number {
    const clave = String(texto ?? '');
    let h = 0;
    for (let i = 0; i < clave.length; i++) h = (h * 31 + clave.charCodeAt(i)) >>> 0;
    return h % 6;
  }

  identificarCuenta(_i: number, c: any): number {
    return c.id_cxc;
  }

  identificarTramo(_i: number, t: ResumenTramo): string {
    return t.clave;
  }

  identificarAbono(_i: number, a: any): number | string {
    return a.id_abono ?? `${a.fecha ?? ''}-${_i}`;
  }

  identificarCuentaBancaria(_i: number, c: any): number {
    return c.id_cuenta;
  }

  identificarSugerencia(_i: number, s: SugerenciaReceptor): string {
    return `${s.tipo}-${s.id_cliente ?? s.id_empresa}-${s.numero_documento}`;
  }

  alCambiarTipo(): void {
    this.limpiarSeleccionCredito();
    if (this.textoBusqueda.trim().length >= 2) this.buscar$.next(this.textoBusqueda);
  }

  alEscribirBusqueda(): void {
    this.seleccionado = null;
    this.config.id = null;
    this.buscar$.next(this.textoBusqueda);
  }

  elegirSugerencia(s: SugerenciaReceptor): void {
    this.seleccionado = s;
    this.config.tipo = s.tipo;
    this.config.id = s.tipo === 'empresa' ? Number(s.id_empresa) : Number(s.id_cliente);
    this.textoBusqueda = `${s.denominacion} · ${s.numero_documento}`;
    this.sugerencias = [];
    this.cargarLineaCredito();
    this.cdr.markForCheck();
  }

  limpiarSeleccionCredito(): void {
    this.seleccionado = null;
    this.config.id = null;
    this.config.credito_activo = false;
    this.config.limite_credito = 0;
    this.config.dias_credito = 15;
    this.textoBusqueda = '';
    this.sugerencias = [];
    this.cdr.markForCheck();
  }

  /** Carga la línea existente; si no hay, deja defaults seguros (inactivo / 0). */
  private cargarLineaCredito(): void {
    if (!this.config.id) return;
    const params =
      this.config.tipo === 'empresa'
        ? { id_empresa: Number(this.config.id) }
        : { id_cliente: Number(this.config.id) };

    this.pv.lineaCredito(params).subscribe({
      next: (linea) => {
        this.config.credito_activo = Boolean(linea?.credito_activo);
        this.config.limite_credito = Number(linea?.limite_credito ?? 0) || 0;
        this.config.dias_credito = Number(linea?.dias_credito ?? 15) || 15;
        this.cdr.markForCheck();
      },
      error: () => {
        this.config.credito_activo = false;
        this.config.limite_credito = 0;
        this.config.dias_credito = 15;
        this.cdr.markForCheck();
      },
    });
  }

  cargarCuentas(): void {
    this.pv.cuentasBancarias(true).subscribe({
      next: (lista) => {
        this.cuentasBancarias = lista || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.cuentasBancarias = [];
        this.cdr.markForCheck();
      },
    });
  }

  editarCuenta(c: any): void {
    this.editandoCuentaId = Number(c.id_cuenta);
    this.cuentaForm = {
      banco: c.banco ?? '',
      alias: c.alias ?? '',
      tipo_cuenta: c.tipo_cuenta ?? 'ahorros',
      numero_cuenta: c.numero_cuenta ?? '',
      cci: c.cci ?? '',
      titular: c.titular ?? 'Hatunsales S.A.C',
      activo: c.activo !== false,
      es_yape: !!c.es_yape,
    };
  }

  nuevaCuenta(): void {
    this.editandoCuentaId = null;
    this.cuentaForm = {
      banco: '',
      alias: '',
      tipo_cuenta: 'ahorros',
      numero_cuenta: '',
      cci: '',
      titular: 'Hatunsales S.A.C',
      activo: true,
      es_yape: false,
    };
  }

  guardarCuenta(): void {
    if (!this.esAdmin) {
      void this.alerta.toast({
        type: 'warning',
        title: 'Solo el administrador puede gestionar cuentas bancarias',
        timer: 3500,
      });
      return;
    }
    if (!this.cuentaForm.banco.trim()) {
      void this.alerta.toast({ type: 'warning', title: 'El banco es obligatorio' });
      return;
    }
    this.guardandoCuenta = true;
    this.cdr.markForCheck();
    const req = this.editandoCuentaId
      ? this.pv.actualizarCuentaBancaria(this.editandoCuentaId, this.cuentaForm)
      : this.pv.crearCuentaBancaria(this.cuentaForm);

    req.subscribe({
      next: () => {
        this.guardandoCuenta = false;
        this.cdr.markForCheck();
        void this.alerta.toast({
          type: 'success',
          title: this.editandoCuentaId ? 'Cuenta actualizada' : 'Cuenta creada',
        });
        this.nuevaCuenta();
        this.cargarCuentas();
      },
      error: (e) => {
        this.guardandoCuenta = false;
        this.cdr.markForCheck();
        void this.alerta.error({ message: mensajeDeError(e) });
      },
    });
  }

  desactivarCuenta(c: any): void {
    if (!this.esAdmin) {
      void this.alerta.toast({
        type: 'warning',
        title: 'Solo el administrador puede desactivar cuentas',
        timer: 3500,
      });
      return;
    }
    const id = Number(c?.id_cuenta);
    if (!Number.isFinite(id) || id <= 0) return;

    const nombre = [c?.banco, c?.alias || c?.numero_cuenta].filter(Boolean).join(' · ');
    void this.alerta
      .confirm({
        title: '¿Desactivar esta cuenta bancaria?',
        message: `${nombre || 'Cuenta'} dejará de aparecer en el POS al cobrar por transferencia. No se borra el historial.`,
        confirmText: 'Desactivar',
        cancelText: 'Cancelar',
        type: 'warning',
      })
      .then((resultado) => {
        if (!resultado.isConfirmed) return;
        this.pv.eliminarCuentaBancaria(id).subscribe({
          next: () => {
            this.cdr.markForCheck();
            void this.alerta.toast({ type: 'success', title: 'Cuenta desactivada' });
            this.cargarCuentas();
          },
          error: (e) => {
            this.cdr.markForCheck();
            void this.alerta.error({ message: mensajeDeError(e) });
          },
        });
      });
  }

  cargar(): void {
    const alTerminar = this.busqueda.alLanzar();
    this.cargando = true;
    this.errorCarga = false;
    this.cdr.markForCheck();
    this.pv.listarCxc({
      estado: this.filtroEstado || undefined,
      texto: this.filtroTexto || undefined,
      limite: 50,
    }).subscribe({
      next: (resp) => {
        this.cuentas = resp?.data ?? [];
        this.refiltrar();
        this.total = Number(resp?.total ?? 0);
        // El servidor ya trae el teléfono en cada cuenta (Fase F0): el padrón solo se pide si alguna cuenta cobrable no lo trae.
        if (this.cuentas.some((c) => this.puedeCobrar(c) && !primerTelefonoValido(c?.telefono))) this.cargarPadron();
        this.cargarAntiguedad();
        this.cargando = false;
        alTerminar();
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cargando = false;
        alTerminar();
        this.errorCarga = true;
        this.cdr.markForCheck();
        void this.alerta.error({
          title: 'No se pudieron cargar las cuentas',
          message: mensajeDeError(e),
        });
      },
    });
  }

  /** Pide al servidor la antigüedad exacta (todas las cuentas); si no responde, se queda el cálculo local. */
  private cargarAntiguedad(): void {
    this.gestion.getAntiguedadCxc().pipe(takeUntil(this.destruir$)).subscribe({
      next: (r) => {
        const valida = r && ['al_dia', 'de_1_a_30', 'de_31_a_60', 'mas_de_60'].every((k) => r[k] && Number.isFinite(Number(r[k].saldo)));
        this.antiguedadServidor = valida ? r : null;
        this.cdr.markForCheck();
      },
      error: () => {
        this.antiguedadServidor = null;
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * El servidor entrega las cuentas de a 50: si hay más, ordenar aquí ordenaría solo esas 50 y
   * engañaría. Con la lista completa (total ≤ filas cargadas) sí se puede ordenar por columna.
   */
  get listaCompleta(): boolean {
    return this.total <= this.cuentas.length;
  }

  /** Lo que muestra la tabla: las cuentas visibles (del tramo elegido), ordenadas si la lista está completa. */
  get cuentasMostradas(): readonly any[] {
    const completa = this.listaCompleta;
    const tramo = this.filtroTramo;
    const m = this.memoOrden;
    if (m && m.lista === this.cuentasVisibles && m.orden === this.orden && m.completa === completa && m.tramo === tramo) return m.resultado;
    const orden = this.orden;
    const base = tramo ? this.cuentasVisibles.filter((c) => this.tramoDe(c) === tramo) : this.cuentasVisibles;
    const resultado = completa && orden.clave
      ? ordenarLista(base, (c) => this.valorDeOrden(c, orden.clave!), orden.dir)
      : base;
    this.memoOrden = { lista: this.cuentasVisibles, orden, completa, tramo, resultado };
    return resultado;
  }

  private valorDeOrden(c: any, clave: string): unknown {
    switch (clave) {
      case 'deudor': return c.deudor;
      case 'venta': return Number(c.id_venta);
      case 'vence': return c.fecha_vencimiento ? String(c.fecha_vencimiento) : null;
      case 'total': return this.monto(c.monto_total);
      case 'saldo': return this.monto(c.saldo);
      case 'estado': return c.estado;
      default: return null;
    }
  }

  ordenar(clave: string): void {
    this.fijarOrden(alternarOrden(this.orden, clave));
  }

  fijarOrden(orden: EstadoOrden): void {
    this.orden = orden;
    guardarOrden('cuentas-por-cobrar', orden);
  }

  ariaSort(clave: string): 'ascending' | 'descending' | 'none' | null {
    return this.listaCompleta ? ariaSort(this.orden, clave) : null;
  }
  iconoOrden(clave: string): string { return iconoOrden(this.orden, clave); }

  /** Descarga las cuentas que se ven (con el orden elegido); si el servidor tiene más, lo dice. */
  exportarCsv(): void {
    const filas = this.cuentasMostradas;
    if (!filas.length) return;
    const columnas: ColumnaCsv<any>[] = [
      { titulo: 'Deudor', valor: (c) => c.deudor },
      { titulo: 'Documento', valor: (c) => (c.documento ? String(c.documento) : '') },
      { titulo: 'Venta', valor: (c) => (c.comprobante ? String(c.comprobante) : c.id_venta ? `#${c.id_venta}` : '') },
      { titulo: 'Vence', valor: (c) => (c.fecha_vencimiento ? String(c.fecha_vencimiento).slice(0, 10) : '') },
      { titulo: 'Días de atraso', valor: (c) => (this.puedeCobrar(c) ? this.diasAtraso(c) : '') },
      { titulo: 'Total', valor: (c) => this.monto(c.monto_total) },
      { titulo: 'Saldo', valor: (c) => this.monto(c.saldo) },
      { titulo: 'Cobrado (%)', valor: (c) => this.pctCobro(c) },
      { titulo: 'Estado', valor: (c) => c.estado },
    ];
    const cuantas = exportarCsv('cuentas-por-cobrar', columnas, filas);
    this.alerta.toast({
      type: 'success',
      title: `CSV descargado: ${cuantas} ${cuantas === 1 ? 'fila' : 'filas'}`,
      message: this.listaCompleta || this.filtroTexto.trim() ? undefined : `Hay ${this.total} cuentas en total: se exportaron las ${cuantas} que se ven. Filtre por estado para ver otras.`,
    });
  }

  /** Filtra al instante las cuentas ya cargadas; el servidor completa el resultado en segundo plano. */
  alBuscarCuentas(): void {
    this.busqueda.iniciar();
    this.refiltrar();
    this.filtrarCuentas$.next();
  }

  private refiltrar(): void {
    // Deudor y n.º de venta: lo que se ve en la fila y lo que busca el servidor (credito.repository).
    this.cuentasVisibles = filtrarInstantaneo(this.cuentas, this.filtroTexto, (c) => [c.deudor, c.id_venta, c.comprobante]);
  }

  ver(c: any): void {
    this.pv.obtenerCxc(Number(c.id_cxc)).subscribe({
      next: (detalle) => {
        this.seleccion = detalle;
        this.abono.monto = Number(detalle.saldo) || null;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cdr.markForCheck();
        void this.alerta.error({ message: mensajeDeError(e) });
      },
    });
  }

  registrarAbono(): void {
    if (!this.seleccion || !this.abono.monto) return;
    this.abonando = true;
    this.cdr.markForCheck();
    this.pv.abonarCxc(Number(this.seleccion.id_cxc), {
      monto: Number(this.abono.monto),
      id_metodo: this.abono.id_metodo ?? undefined,
      referencia: this.abono.referencia || undefined,
    }).subscribe({
      next: (detalle) => {
        this.abonando = false;
        this.seleccion = detalle;
        this.cdr.markForCheck();
        void this.alerta.toast({ type: 'success', title: 'Abono registrado' });
        this.cargar();
      },
      error: (e) => {
        this.abonando = false;
        this.cdr.markForCheck();
        void this.alerta.error({
          title: 'No se pudo registrar el abono',
          message: mensajeDeError(e),
        });
      },
    });
  }

  async guardarConfig(): Promise<void> {
    if (!this.config.id || !this.seleccionado) {
      void this.alerta.error({
        title: 'Selecciona cliente o empresa',
        message: 'Busca por DNI, RUC o nombre y elige un resultado de la lista antes de guardar.',
      });
      return;
    }

    const quien = this.seleccionado;
    const estado = this.config.credito_activo ? 'activo' : 'inactivo';
    const conf = await this.alerta.confirm({
      title: '¿Guardar línea de crédito?',
      allowHtml: true,
      message:
        `<div style="text-align:left">` +
        `<div><strong>${escapeHtmlAlerta(quien.denominacion)}</strong></div>` +
        `<div>${quien.tipo === 'empresa' ? 'RUC' : 'DNI'}: ${escapeHtmlAlerta(quien.numero_documento)}</div>` +
        `<div>ID interno: ${this.config.id}</div>` +
        `<div>Límite: S/ ${Number(this.config.limite_credito || 0).toFixed(2)} · ${this.config.dias_credito} días · ${estado}</div>` +
        `</div>`,
      confirmText: 'Sí, guardar',
    });
    if (!conf.isConfirmed) return;

    this.guardandoConfig = true;
    this.cdr.markForCheck();
    const body = {
      credito_activo: this.config.credito_activo,
      limite_credito: Number(this.config.limite_credito) || 0,
      dias_credito: Number(this.config.dias_credito) || 15,
    };
    const req = this.config.tipo === 'empresa'
      ? this.pv.actualizarCreditoEmpresa(Number(this.config.id), body)
      : this.pv.actualizarCreditoCliente(Number(this.config.id), body);

    req.subscribe({
      next: () => {
        this.guardandoConfig = false;
        this.cdr.markForCheck();
        void this.alerta.toast({
          type: 'success',
          title: 'Crédito actualizado',
          message: quien.denominacion,
          timer: 2800,
        });
        this.cargar();
      },
      error: (e) => {
        this.guardandoConfig = false;
        this.cdr.markForCheck();
        const op = errorOperativo(e, 'No se pudo guardar el crédito');
        void this.alerta.error({
          title: op.title,
          message: op.message,
          allowHtml: op.allowHtml,
        });
      },
    });
  }
}
