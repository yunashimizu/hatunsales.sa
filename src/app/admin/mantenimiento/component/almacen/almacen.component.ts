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
import { GestionService } from '../../service/gestion.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { mensajeDeError } from '../../../service/api-base.service';

@Component({
  selector: 'app-almacen',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './almacen.component.html',
  styleUrl: './almacen.component.css',
})
export class AlmacenComponent implements OnInit {
  almacenes: any[] = [];
  sucursales: any[] = [];
  cargando = false;
  guardando = false;
  idDestacado: number | null = null;
  editandoId: number | null = null;

  modelo = { nombre: '', descripcion: '', id_sucursal: null as number | null };

  private readonly cdr = inject(ChangeDetectorRef);

  get totalProductos(): number {
    return this.almacenes.reduce((sum, a) => sum + Number(a.productos ?? 0), 0);
  }

  get totalUnidades(): number {
    return this.almacenes.reduce((sum, a) => sum + Number(a.unidades ?? 0), 0);
  }

  constructor(
    private readonly gestion: GestionService,
    private readonly ns: NotificationService,
    private readonly alerta: AlertService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.cargarSucursales();
  }

  identificarAlmacen(_i: number, a: any): number {
    return a.id_almacen;
  }

  cargar(): void {
    this.cargando = true;
    this.cdr.markForCheck();
    this.gestion.getAlmacenesAdmin().subscribe({
      next: (lista) => {
        this.almacenes = Array.isArray(lista) ? [...lista] : [];
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.cargando = false;
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(error, 'No se pudieron cargar los almacenes'));
      },
    });
  }

  nuevo(): void {
    this.editandoId = null;
    this.modelo = { nombre: '', descripcion: '', id_sucursal: null };
  }

  editar(a: any): void {
    this.editandoId = Number(a.id_almacen);
    this.modelo = {
      nombre: a.nombre ?? '',
      descripcion: a.descripcion ?? '',
      id_sucursal: a.id_sucursal ? Number(a.id_sucursal) : null,
    };
  }

  cancelar(): void {
    this.nuevo();
  }

  guardar(): void {
    const nombre = this.modelo.nombre?.trim();
    if (!nombre) {
      this.ns.error('El nombre es obligatorio');
      return;
    }

    const payload = {
      nombre,
      descripcion: this.modelo.descripcion?.trim() || '',
      id_sucursal: this.modelo.id_sucursal ? Number(this.modelo.id_sucursal) : null,
    };

    this.guardando = true;
    this.cdr.markForCheck();
    const esEdicion = !!this.editandoId;
    const peticion = esEdicion
      ? this.gestion.actualizarAlmacen(this.editandoId!, payload)
      : this.gestion.crearAlmacen(payload);

    peticion.subscribe({
      next: (item) => {
        this.guardando = false;
        this.reflejarEnLista(item);
        this.destacar(Number(item.id_almacen));
        this.cancelar();
        this.cdr.markForCheck();
        this.ns.success(esEdicion ? 'Almacén actualizado' : 'Almacén creado');
      },
      error: (error) => {
        this.guardando = false;
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(error, 'No se pudo guardar el almacén'));
      },
    });
  }

  async eliminar(a: any): Promise<void> {
    const ok = await this.alerta.confirm({
      title: `¿Eliminar almacén "${a.nombre}"?`,
      message: 'Solo si no tiene productos con stock. Esta acción no se puede deshacer.',
      confirmText: 'Sí, eliminar',
    });
    if (!ok.isConfirmed) return;

    this.gestion.eliminarAlmacen(Number(a.id_almacen)).subscribe({
      next: () => {
        this.almacenes = this.almacenes.filter((x) => Number(x.id_almacen) !== Number(a.id_almacen));
        if (this.editandoId === Number(a.id_almacen)) this.cancelar();
        this.cdr.markForCheck();
        this.ns.success('Almacén eliminado');
      },
      error: (error) => {
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(error, 'No se pudo eliminar'));
      },
    });
  }

  private cargarSucursales(): void {
    this.gestion.getSucursalesAlmacen().subscribe({
      next: (lista) => {
        this.sucursales = Array.isArray(lista) ? lista : [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.sucursales = [];
        this.cdr.markForCheck();
      },
    });
  }

  private reflejarEnLista(item: any): void {
    const id = Number(item.id_almacen);
    const indice = this.almacenes.findIndex((a) => Number(a.id_almacen) === id);
    const fila = {
      ...item,
      productos: item.productos ?? (indice >= 0 ? this.almacenes[indice].productos : 0),
      unidades: item.unidades ?? (indice >= 0 ? this.almacenes[indice].unidades : 0),
    };
    if (indice >= 0) {
      this.almacenes[indice] = { ...this.almacenes[indice], ...fila };
      this.almacenes = [...this.almacenes];
    } else {
      this.almacenes = [fila, ...this.almacenes];
    }
  }

  private destacar(id: number): void {
    this.idDestacado = id;
    setTimeout(() => {
      this.idDestacado = null;
      this.cdr.markForCheck();
    }, 2600);
  }
}
