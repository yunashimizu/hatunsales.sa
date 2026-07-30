import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../auth/service/auth.service';
import { GestionService } from '../../service/gestion.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { mensajeDeError } from '../../../service/api-base.service';
import { CatalogoService } from '../../../../store/service/catalogo.service';

@Component({
  selector: 'app-marcas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './marcas.component.html',
  styleUrl: './marcas.component.css',
})
export class MarcasComponent implements OnInit {
  marcas: any[] = [];
  cargando = false;
  guardando = false;
  idDestacado: number | null = null;
  editandoId: number | null = null;

  modelo = { nombre: '', logo_url: '', activo: true };

  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private readonly gestion: GestionService,
    private readonly ns: NotificationService,
    private readonly alerta: AlertService,
    private readonly catalogoTienda: CatalogoService,
    private readonly auth: AuthService,
  ) {}

  get puedeEditar(): boolean {
    return this.auth.puedeEditarCatalogo();
  }

  ngOnInit(): void {
    this.cargar();
  }

  identificarMarca(_i: number, m: any): number {
    return m.id_marca;
  }

  get totalActivas(): number {
    return this.marcas.filter((m) => m.activo !== false).length;
  }

  get totalProductos(): number {
    return this.marcas.reduce((sum, m) => sum + Number(m.productos ?? 0), 0);
  }

  cargar(): void {
    this.cargando = true;
    this.cdr.markForCheck();
    this.gestion.getMarcas().subscribe({
      next: (lista) => {
        this.marcas = Array.isArray(lista) ? [...lista] : [];
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.cargando = false;
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(error, 'No se pudieron cargar las marcas'));
      },
    });
  }

  nuevo(): void {
    if (!this.puedeEditar) return;
    this.editandoId = null;
    this.modelo = { nombre: '', logo_url: '', activo: true };
  }

  editar(m: any): void {
    this.editandoId = Number(m.id_marca);
    this.modelo = {
      nombre: m.nombre ?? '',
      logo_url: m.logo_url ?? '',
      activo: m.activo !== false,
    };
  }

  cancelar(): void {
    this.nuevo();
  }

  guardar(): void {
    if (!this.puedeEditar) return;
    const nombre = this.modelo.nombre?.trim();
    if (!nombre) {
      this.ns.error('El nombre es obligatorio');
      return;
    }

    const payload = {
      nombre,
      logo_url: this.modelo.logo_url?.trim() || '',
      activo: this.modelo.activo !== false,
    };

    this.guardando = true;
    this.cdr.markForCheck();
    const esEdicion = !!this.editandoId;
    const peticion = esEdicion
      ? this.gestion.actualizarMarca(this.editandoId!, payload)
      : this.gestion.crearMarca(payload);

    peticion.subscribe({
      next: (item) => {
        this.guardando = false;
        const fila = {
          ...(item ?? {}),
          id_marca: Number(item?.id_marca ?? this.editandoId),
          nombre: item?.nombre ?? payload.nombre,
          logo_url: item?.logo_url ?? payload.logo_url,
          activo: item?.activo !== false,
          productos: item?.productos ?? 0,
        };
        if (!fila.id_marca) {
          this.cargar();
          this.cdr.markForCheck();
          this.ns.success(esEdicion ? 'Marca actualizada' : 'Marca creada');
          return;
        }
        this.reflejarEnLista(fila);
        this.destacar(fila.id_marca);
        this.cancelar();
        this.catalogoTienda.invalidarCatalogos();
        this.cdr.markForCheck();
        this.ns.success(esEdicion ? 'Marca actualizada' : 'Marca creada');
      },
      error: (error) => {
        this.guardando = false;
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(error, 'No se pudo guardar la marca'));
      },
    });
  }

  async eliminar(m: any): Promise<void> {
    if (!this.puedeEditar) return;
    const ok = await this.alerta.confirm({
      title: `¿Eliminar marca "${m.nombre}"?`,
      message: 'Solo si ningún producto la usa. En Productos puedes cambiar la marca antes.',
      confirmText: 'Sí, eliminar',
    });
    if (!ok.isConfirmed) return;

    this.gestion.eliminarMarca(Number(m.id_marca)).subscribe({
      next: () => {
        this.marcas = this.marcas.filter((x) => Number(x.id_marca) !== Number(m.id_marca));
        if (this.editandoId === Number(m.id_marca)) this.cancelar();
        this.catalogoTienda.invalidarCatalogos();
        this.cdr.markForCheck();
        this.ns.success('Marca eliminada');
      },
      error: (error) => {
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(error, 'No se pudo eliminar'));
      },
    });
  }

  private reflejarEnLista(item: any): void {
    const id = Number(item.id_marca);
    const indice = this.marcas.findIndex((m) => Number(m.id_marca) === id);
    if (indice >= 0) {
      this.marcas[indice] = { ...this.marcas[indice], ...item };
      this.marcas = [...this.marcas];
    } else {
      this.marcas = [{ ...item, productos: item.productos ?? 0 }, ...this.marcas];
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
