import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PuntoVentaService } from '../../../service/punto-venta.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { mensajeDeError } from '../../../service/api-base.service';

@Component({
  selector: 'app-cuentas-por-cobrar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './cuentas-por-cobrar.component.html',
  styleUrl: './cuentas-por-cobrar.component.css',
})
export class CuentasPorCobrarComponent implements OnInit {
  cuentas: any[] = [];
  total = 0;
  cargando = false;
  filtroEstado = '';
  filtroTexto = '';
  seleccion: any = null;
  metodos: { id_metodo: number; nombre: string; tipo?: string }[] = [];

  abono = { monto: null as number | null, id_metodo: null as number | null, referencia: '' };
  abonando = false;

  // Cuentas bancarias (transferencias)
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

  // Configurar línea de crédito rápida
  config = {
    tipo: 'cliente' as 'cliente' | 'empresa',
    id: null as number | null,
    credito_activo: true,
    limite_credito: 1000,
    dias_credito: 15,
  };
  guardandoConfig = false;

  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private readonly pv: PuntoVentaService,
    private readonly ns: NotificationService,
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
      this.ns.error('El banco es obligatorio');
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
        this.ns.success(this.editandoCuentaId ? 'Cuenta actualizada' : 'Cuenta creada');
        this.nuevaCuenta();
        this.cargarCuentas();
      },
      error: (e) => {
        this.guardandoCuenta = false;
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(e));
      },
    });
  }

  desactivarCuenta(c: any): void {
    this.pv.eliminarCuentaBancaria(Number(c.id_cuenta)).subscribe({
      next: () => {
        this.cdr.markForCheck();
        this.ns.success('Cuenta desactivada');
        this.cargarCuentas();
      },
      error: (e) => {
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(e));
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
        this.ns.error(mensajeDeError(e, 'No se pudieron cargar las cuentas'));
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
        this.ns.error(mensajeDeError(e));
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
        this.ns.success('Abono registrado');
        this.cargar();
      },
      error: (e) => {
        this.abonando = false;
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(e, 'No se pudo registrar el abono'));
      },
    });
  }

  guardarConfig(): void {
    if (!this.config.id) {
      this.ns.error('Indique el ID de cliente o empresa');
      return;
    }
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
        this.ns.success('Línea de crédito actualizada');
        this.cargar();
      },
      error: (e) => {
        this.guardandoConfig = false;
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(e));
      },
    });
  }
}
