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
import { AlertService } from '../../../../shared/services/alert.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { mensajeDeError } from '../../../service/api-base.service';
import { RecepcionService } from '../../../service/recepcion.service';

@Component({
  selector: 'app-proveedores',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './proveedores.component.html',
  styleUrl: './proveedores.component.css',
})
export class ProveedoresComponent implements OnInit {
  proveedores: any[] = [];
  cargando = false;
  guardando = false;
  consultandoRuc = false;
  editandoId: number | null = null;
  idDestacado: number | null = null;

  modelo = { nombre: '', ruc: '', telefono: '', email: '', direccion: '' };

  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private readonly api: RecepcionService,
    private readonly alerta: AlertService,
    private readonly ns: NotificationService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  identificarProveedor(_i: number, p: any): number {
    return p.id_proveedor;
  }

  cargar(): void {
    this.cargando = true;
    this.cdr.markForCheck();
    this.api.listarProveedores().subscribe({
      next: (lista) => {
        this.proveedores = Array.isArray(lista) ? [...lista] : [];
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cargando = false;
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(e, 'No se pudieron cargar los proveedores'));
      },
    });
  }

  nuevo(): void {
    this.editandoId = null;
    this.modelo = { nombre: '', ruc: '', telefono: '', email: '', direccion: '' };
  }

  editar(p: any): void {
    this.editandoId = Number(p.id_proveedor);
    this.modelo = {
      nombre: p.nombre ?? '',
      ruc: p.ruc ?? '',
      telefono: p.telefono ?? '',
      email: p.email ?? '',
      direccion: p.direccion ?? '',
    };
  }

  cancelar(): void {
    this.nuevo();
  }

  buscarRuc(): void {
    const ruc = (this.modelo.ruc ?? '').replace(/\D/g, '');
    if (ruc.length !== 11) {
      this.alerta.toast({ type: 'warning', title: 'Ingrese un RUC de 11 dígitos' });
      return;
    }
    this.consultandoRuc = true;
    this.cdr.markForCheck();
    this.api.guardarProveedorPorRuc(ruc).subscribe({
      next: (resp) => {
        this.consultandoRuc = false;
        this.modelo.nombre = resp?.razon_social || resp?.nombre || this.modelo.nombre;
        this.modelo.ruc = resp?.ruc || ruc;
        this.modelo.direccion = resp?.direccion || this.modelo.direccion;
        this.cdr.markForCheck();
        if (resp?.id_proveedor) {
          this.alerta.toast({ type: 'success', title: 'Proveedor cargado desde SUNAT' });
          this.cargar();
          this.editandoId = Number(resp.id_proveedor);
        } else {
          this.alerta.toast({ type: 'success', title: 'Datos SUNAT listos para guardar' });
        }
      },
      error: (e) => {
        this.consultandoRuc = false;
        this.cdr.markForCheck();
        this.alerta.error({
          title: 'No se pudo consultar el RUC',
          message: mensajeDeError(e),
        });
      },
    });
  }

  guardar(): void {
    const nombre = this.modelo.nombre?.trim();
    if (!nombre) {
      this.alerta.toast({ type: 'warning', title: 'El nombre es obligatorio' });
      return;
    }
    const payload = {
      nombre,
      ruc: this.modelo.ruc?.trim() || undefined,
      telefono: this.modelo.telefono?.trim() || undefined,
      email: this.modelo.email?.trim() || undefined,
      direccion: this.modelo.direccion?.trim() || undefined,
    };

    this.guardando = true;
    this.cdr.markForCheck();
    const peticion = this.editandoId
      ? this.api.actualizarProveedor(this.editandoId, payload)
      : this.api.crearProveedor(payload);

    peticion.subscribe({
      next: (item) => {
        this.guardando = false;
        this.idDestacado = Number(item?.id_proveedor ?? this.editandoId);
        this.cdr.markForCheck();
        this.alerta.toast({
          type: 'success',
          title: this.editandoId ? 'Proveedor actualizado' : 'Proveedor creado',
        });
        this.nuevo();
        this.cargar();
      },
      error: (e) => {
        this.guardando = false;
        this.cdr.markForCheck();
        this.alerta.error({ title: 'No se pudo guardar', message: mensajeDeError(e) });
      },
    });
  }

  async eliminar(p: any): Promise<void> {
    const ok = await this.alerta.confirm({
      title: '¿Eliminar proveedor?',
      message: `Se eliminará <strong>${p.nombre}</strong>.`,
      type: 'warning',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;

    this.api.eliminarProveedor(Number(p.id_proveedor)).subscribe({
      next: () => {
        this.cdr.markForCheck();
        this.alerta.toast({ type: 'success', title: 'Proveedor eliminado' });
        this.cargar();
        if (this.editandoId === Number(p.id_proveedor)) this.nuevo();
      },
      error: (e) => {
        this.cdr.markForCheck();
        this.alerta.error({ title: 'No se pudo eliminar', message: mensajeDeError(e) });
      },
    });
  }
}
