import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, of, switchMap, takeUntil } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PuntoVentaService } from '../../../service/punto-venta.service';
import { ReceptorService } from '../../../service/receptor.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { mensajeDeError, errorOperativo, escapeHtmlAlerta } from '../../../service/api-base.service';
import { SugerenciaReceptor } from '../../../models/admin.models';

@Component({
  selector: 'app-cuentas-por-cobrar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './cuentas-por-cobrar.component.html',
  styleUrl: './cuentas-por-cobrar.component.css',
})
export class CuentasPorCobrarComponent implements OnInit, OnDestroy {
  cuentas: any[] = [];
  total = 0;
  cargando = false;
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
  private readonly destruir$ = new Subject<void>();
  private readonly buscar$ = new Subject<string>();

  constructor(
    private readonly pv: PuntoVentaService,
    private readonly receptor: ReceptorService,
    private readonly alerta: AlertService,
  ) {}

  ngOnInit(): void {
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

  identificarCuenta(_i: number, c: any): number {
    return c.id_cxc;
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
    this.pv.eliminarCuentaBancaria(Number(c.id_cuenta)).subscribe({
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
  }

  cargar(): void {
    this.cargando = true;
    this.cdr.markForCheck();
    this.pv.listarCxc({
      estado: this.filtroEstado || undefined,
      texto: this.filtroTexto || undefined,
      limite: 50,
    }).subscribe({
      next: (resp) => {
        this.cuentas = resp?.data ?? [];
        this.total = Number(resp?.total ?? 0);
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cargando = false;
        this.cdr.markForCheck();
        void this.alerta.error({
          title: 'No se pudieron cargar las cuentas',
          message: mensajeDeError(e),
        });
      },
    });
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
