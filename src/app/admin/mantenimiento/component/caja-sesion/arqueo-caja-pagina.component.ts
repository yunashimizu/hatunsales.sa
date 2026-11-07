import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, catchError, combineLatest, finalize, map, of, startWith, switchMap } from 'rxjs';
import { AuthService } from '../../../../auth/service/auth.service';
import { descargarArchivo } from '../../../../shared/utils/descargar-archivo';
import {
  ResumenSucursalCaja,
  ResumenSucursalesCaja,
  TotalesCaja,
  TurnoCajaListado,
} from '../../../models/caja-arqueo.models';
import { mensajeDeError, normalizarErrorBlob } from '../../../service/api-base.service';
import { CajaDisponible, CajaSesionService } from '../../../service/caja-sesion.service';
import { CajaArqueoComponent } from './caja-arqueo.component';

/** Filtros editables del formulario (las fechas son `AAAA-MM-DD`, días de Lima). */
export interface FiltrosArqueo {
  id_sucursal: number | null;
  id_caja: number | null;
  id_usuario: number | null;
  desde: string;
  hasta: string;
}

export type TarjetaSucursal = ResumenSucursalCaja & { esTotal?: boolean };

export type SignoDiferencia = 'cuadra' | 'sobra' | 'falta';

const RANGO_MAXIMO_DIAS = 366;
const POR_PAGINA = 20;

/** 'aaaa-mm-dd' del día de Lima. */
function hoyEnLima(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/** Lo que el servidor no calcula llega como null; así la vista distingue «sin dato» de 0. */
function normalizarTotales<T extends Partial<TotalesCaja>>(t: T): T & TotalesCaja {
  return {
    ...t,
    turnos: Number(t.turnos) || 0,
    turnos_abiertos: Number(t.turnos_abiertos) || 0,
    efectivo_inicial: t.efectivo_inicial ?? null,
    ventas_total: t.ventas_total ?? null,
    por_metodo: Array.isArray(t.por_metodo) ? t.por_metodo : [],
    efectivo_esperado: t.efectivo_esperado ?? null,
    efectivo_contado: t.efectivo_contado ?? null,
    diferencia: t.diferencia ?? null,
  };
}

function nombrePdfResumen(desde: string, hasta: string): string {
  const rango = desde && hasta ? (desde === hasta ? desde : `${desde}_${hasta}`) : desde || hasta;
  return rango ? `resumen-sucursales-${rango}.pdf` : 'resumen-sucursales.pdf';
}

function aMilisegundos(ymd: string): number {
  const [a, m, d] = ymd.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

@Component({
  selector: 'app-arqueo-caja-pagina',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CajaArqueoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './arqueo-caja-pagina.component.html',
  styleUrl: './arqueo-caja-pagina.component.css',
})
export class ArqueoCajaPaginaComponent implements OnInit {
  @ViewChild(CajaArqueoComponent) private arqueo?: CajaArqueoComponent;
  idApertura: number | null = null;
  idConsulta: number | null = null;
  cargando = false;
  error = '';

  // ── Arqueo por sucursal (T3c) ──
  readonly esAdmin = inject(AuthService).puedeVer(['admin']);
  readonly porPagina = POR_PAGINA;
  filtros: FiltrosArqueo = this.filtrosIniciales();
  /** Filtros ya aplicados: los usan el resumen, el listado y la paginación. */
  aplicados: FiltrosArqueo = { ...this.filtros };
  errorFiltro = '';
  cajas: CajaDisponible[] = [];
  resumen: ResumenSucursalesCaja | null = null;
  cargandoResumen = false;
  errorResumen = '';
  /** Descarga del PDF del resumen: «Generando…» mientras dura y error con reintento si falla. */
  generandoPdf = false;
  errorPdf = '';
  turnos: TurnoCajaListado[] = [];
  total = 0;
  pagina = 1;
  cargandoTurnos = false;
  errorTurnos = '';
  private cargaResumen?: Subscription;
  private cargaTurnos?: Subscription;
  private readonly recargar$ = new Subject<void>();
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CajaSesionService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  get ocupado(): boolean {
    return !!(this.arqueo?.guardando || this.arqueo?.guardandoMovimiento);
  }

  get sucursales(): { id: number; nombre: string }[] {
    const vistas = new Map<number, string>();
    for (const c of this.cajas) {
      if (c.id_sucursal !== null && c.id_sucursal !== undefined && !vistas.has(c.id_sucursal)) {
        vistas.set(c.id_sucursal, c.sucursal_nombre || `Sucursal ${c.id_sucursal}`);
      }
    }
    return [...vistas].map(([id, nombre]) => ({ id, nombre }));
  }

  get cajasDeLaSucursal(): CajaDisponible[] {
    const sucursal = this.filtros.id_sucursal;
    return sucursal === null ? this.cajas : this.cajas.filter((c) => c.id_sucursal === sucursal);
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.total / this.porPagina));
  }

  get hayFiltros(): boolean {
    const f = this.aplicados;
    return f.id_sucursal !== null || f.id_caja !== null || f.id_usuario !== null;
  }

  /** Solo con más de una sucursal tiene sentido una tarjeta de total. */
  get mostrarTotal(): boolean {
    return (this.resumen?.sucursales.length ?? 0) > 1;
  }

  get tarjetas(): TarjetaSucursal[] {
    const r = this.resumen;
    if (!r) return [];
    return this.mostrarTotal
      ? [...r.sucursales, { ...r.total, id_sucursal: null, nombre: 'Total', esTotal: true }]
      : r.sucursales;
  }

  ngOnInit(): void {
    this.cargarCajas();
    this.cargarListados();
    combineLatest([this.ruta.queryParamMap, this.recargar$.pipe(startWith(undefined))])
      .pipe(
        switchMap(([params]) => {
          this.cargando = true;
          this.error = '';
          this.idApertura = null;
          const valor = params.get('id_apertura');
          if (valor !== null) {
            const id = Number(valor);
            return of(
              /^\d+$/.test(valor) && Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647
                ? { id, error: '' }
                : { id: null, error: 'Indique un número de turno válido.' },
            );
          }
          return this.api.sesion().pipe(
            map((sesion) => ({ id: sesion.apertura?.id_apertura ?? null, error: '' })),
            catchError((error) =>
              of({
                id: null,
                error: mensajeDeError(error, 'No se pudo consultar su turno actual'),
              }),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((estado) => {
        this.idApertura = estado.id;
        this.idConsulta = estado.id;
        this.error = estado.error;
        this.cargando = false;
        this.cdr.markForCheck();
      });
  }

  actualizar(): void {
    if (!this.ocupado) this.recargar$.next();
  }

  consultar(): void {
    if (this.ocupado || this.cargando) return;
    const id = this.idConsulta;
    if (id === null || !Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
      this.error = 'Indique un número de turno válido.';
      return;
    }
    if (this.ruta.snapshot.queryParamMap.get('id_apertura') === String(id)) this.actualizar();
    else
      void this.router.navigate([], {
        relativeTo: this.ruta,
        queryParams: { id_apertura: id },
        queryParamsHandling: 'merge',
      });
  }

  usarTurnoActual(): void {
    if (this.ocupado || this.cargando) return;
    if (!this.ruta.snapshot.queryParamMap.has('id_apertura')) this.actualizar();
    else
      void this.router.navigate([], {
        relativeTo: this.ruta,
        queryParams: { id_apertura: null },
        queryParamsHandling: 'merge',
      });
  }

  // ── Filtros, resumen y listado de turnos ────────────────────────────────

  private filtrosIniciales(): FiltrosArqueo {
    const hoy = hoyEnLima();
    return { id_sucursal: null, id_caja: null, id_usuario: null, desde: hoy, hasta: hoy };
  }

  private cargarCajas(): void {
    this.api
      .disponibles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.cajas = Array.isArray(r?.items) ? r.items : [];
          this.cdr.markForCheck();
        },
        // Sin la lista de cajas los desplegables quedan en «Todas»: el resumen y el listado siguen funcionando.
        error: () => {
          this.cajas = [];
          this.cdr.markForCheck();
        },
      });
  }

  alCambiarSucursal(): void {
    const caja = this.filtros.id_caja;
    if (caja !== null && !this.cajasDeLaSucursal.some((c) => c.id_caja === caja)) this.filtros.id_caja = null;
  }

  private validarFiltros(): string {
    const { desde, hasta } = this.filtros;
    const fecha = /^\d{4}-\d{2}-\d{2}$/;
    if ((desde && !fecha.test(desde)) || (hasta && !fecha.test(hasta))) return 'Indique fechas válidas.';
    if (desde && hasta) {
      if (desde > hasta) return 'La fecha «Desde» no puede ser posterior a «Hasta».';
      if ((aMilisegundos(hasta) - aMilisegundos(desde)) / 86_400_000 > RANGO_MAXIMO_DIAS) {
        return `El rango no puede pasar de ${RANGO_MAXIMO_DIAS} días.`;
      }
    }
    const usuario = this.filtros.id_usuario;
    if (usuario !== null && (!Number.isInteger(usuario) || usuario < 1)) return 'El número de usuario no es válido.';
    return '';
  }

  aplicarFiltros(): void {
    this.errorFiltro = this.validarFiltros();
    if (this.errorFiltro) return;
    this.aplicados = { ...this.filtros };
    this.pagina = 1;
    this.cargarListados();
  }

  limpiarFiltros(): void {
    this.filtros = this.filtrosIniciales();
    this.errorFiltro = '';
    this.aplicados = { ...this.filtros };
    this.pagina = 1;
    this.cargarListados();
  }

  cargarListados(): void {
    this.cargarResumen();
    this.cargarTurnos();
  }

  cargarResumen(): void {
    this.cargaResumen?.unsubscribe();
    this.cargandoResumen = true;
    this.errorResumen = '';
    this.cdr.markForCheck();
    const { desde, hasta } = this.aplicados;
    this.cargaResumen = this.api
      .resumenSucursales({ desde, hasta })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.resumen = {
            ...r,
            sucursales: this.sucursalesFiltradas((r.sucursales ?? []).map((x) => normalizarTotales(x))),
            total: normalizarTotales(r.total ?? ({} as TotalesCaja)),
          };
          this.cargandoResumen = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.resumen = null;
          this.cargandoResumen = false;
          this.errorResumen = mensajeDeError(error, 'No se pudo cargar el resumen por sucursal');
          this.cdr.markForCheck();
        },
      });
  }

  /** Descarga el resumen por sucursal en PDF con los mismos filtros que las tarjetas (sucursal solo si está elegida). */
  descargarPdf(): void {
    if (this.generandoPdf) return;
    this.generandoPdf = true;
    this.errorPdf = '';
    this.cdr.markForCheck();
    const { desde, hasta, id_sucursal } = this.aplicados;
    this.api
      .resumenSucursalesPdf({ desde, hasta, id_sucursal })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.generandoPdf = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) => descargarArchivo(blob, nombrePdfResumen(desde, hasta)),
        error: async (e) => {
          this.errorPdf = mensajeDeError(await normalizarErrorBlob(e), 'No se pudo generar el PDF del resumen');
          this.cdr.markForCheck();
        },
      });
  }

  /** El resumen del servidor no filtra por sucursal: se aplica aquí para que las tarjetas sigan al desplegable. */
  private sucursalesFiltradas(lista: ResumenSucursalCaja[]): ResumenSucursalCaja[] {
    const id = this.aplicados.id_sucursal;
    return id === null ? lista : lista.filter((x) => x.id_sucursal === id);
  }

  cargarTurnos(pagina: number = this.pagina): void {
    this.cargaTurnos?.unsubscribe();
    this.cargandoTurnos = true;
    this.errorTurnos = '';
    this.cdr.markForCheck();
    const f = this.aplicados;
    this.cargaTurnos = this.api
      .aperturas({
        id_sucursal: f.id_sucursal,
        id_caja: f.id_caja,
        id_usuario: this.esAdmin ? f.id_usuario : null,
        desde: f.desde,
        hasta: f.hasta,
        pagina,
        por_pagina: this.porPagina,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.turnos = Array.isArray(r?.items) ? r.items : [];
          this.total = Number(r?.total) || 0;
          this.pagina = Number(r?.pagina) || pagina;
          this.cargandoTurnos = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.turnos = [];
          this.total = 0;
          this.cargandoTurnos = false;
          this.errorTurnos = mensajeDeError(error, 'No se pudo cargar el listado de turnos');
          this.cdr.markForCheck();
        },
      });
  }

  irA(pagina: number): void {
    if (this.cargandoTurnos || pagina < 1 || pagina > this.totalPaginas || pagina === this.pagina) return;
    this.cargarTurnos(pagina);
  }

  /** Lleva el turno elegido del listado al arqueo detallado de abajo. */
  verTurno(idApertura: number): void {
    this.idConsulta = idApertura;
    this.consultar();
    if (typeof document !== 'undefined') {
      setTimeout(() => document.getElementById('arqueo-turno')?.scrollIntoView({ block: 'start' }));
    }
  }

  // ── Presentación ────────────────────────────────────────────────────────

  /** Diferencia en céntimos: ±0,004 no cuenta. */
  signoDiferencia(valor: number | null | undefined): SignoDiferencia | null {
    if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
    const centimos = Math.round(valor * 100);
    return centimos === 0 ? 'cuadra' : centimos > 0 ? 'sobra' : 'falta';
  }

  textoDiferencia(valor: number | null | undefined): string {
    const signo = this.signoDiferencia(valor);
    if (signo === null) return '—';
    if (signo === 'cuadra') return 'Cuadra';
    const absoluto = Math.abs(valor as number).toFixed(2);
    return signo === 'sobra' ? `Sobra S/ ${absoluto}` : `Falta S/ ${absoluto}`;
  }

  nombreSucursal(s: Pick<ResumenSucursalCaja, 'nombre' | 'id_sucursal'>): string {
    return s.nombre || (s.id_sucursal === null ? 'Sin sucursal' : `Sucursal ${s.id_sucursal}`);
  }

  trackSucursal(s: TarjetaSucursal): string {
    return `${s.esTotal ? 'total' : 'sucursal'}-${s.id_sucursal ?? 'sin'}`;
  }
}
