import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GestionService } from '../../service/gestion.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { CatalogoService } from '../../../../store/service/catalogo.service';

@Component({
  selector: 'app-categorias',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './categorias.component.html',
  styleUrl: './categorias.component.css',
})
export class CategoriasComponent implements OnInit {
  categorias: any[] = [];
  cargando = false;
  guardando = false;
  idDestacado: number | null = null;

  modelo: any = { nombre: '', descripcion: '', color: '#4f46e5' };
  editandoId: number | null = null;

  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private gestion: GestionService,
    private ns: NotificationService,
    private catalogoTienda: CatalogoService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  identificarCategoria(_i: number, c: any): number {
    return c.id_categoria;
  }

  cargar(): void {
    this.cargando = true;
    this.cdr.markForCheck();
    this.gestion.getCategorias().subscribe({
      next: (r) => {
        this.categorias = Array.isArray(r) ? [...r] : [];
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.cargando = false;
        this.cdr.markForCheck();
        this.ns.error('No se pudieron cargar las categorías');
      },
    });
  }

  guardar(): void {
    const nombre = this.modelo.nombre?.trim();
    if (!nombre) {
      this.ns.error('Nombre requerido');
      return;
    }

    const payload = {
      nombre,
      descripcion: this.modelo.descripcion?.trim() ?? '',
    };

    this.guardando = true;
    this.cdr.markForCheck();
    const esEdicion = !!this.editandoId;
    const enCurso = esEdicion
      ? this.gestion.actualizarCategoria(this.editandoId!, payload)
      : this.gestion.crearCategoria(payload);

    enCurso.subscribe({
      next: (categoria) => {
        this.guardando = false;

        const fila = {
          ...(categoria ?? {}),
          id_categoria: Number(categoria?.id_categoria ?? this.editandoId),
          nombre: categoria?.nombre ?? payload.nombre,
          descripcion: categoria?.descripcion ?? payload.descripcion,
        };

        if (!fila.id_categoria) {
          this.cdr.markForCheck();
          this.ns.error('No se recibió la categoría guardada');
          return;
        }

        // Igual que productos: se ve al toque y el form queda limpio / listo.
        this.reflejarEnLista(fila);
        this.destacar(fila.id_categoria);
        this.cancelarEdicion();
        this.catalogoTienda.invalidarCatalogos();
        this.cdr.markForCheck();
        this.ns.success(esEdicion ? 'Categoría actualizada' : 'Categoría creada');
      },
      error: () => {
        this.guardando = false;
        this.cdr.markForCheck();
        this.ns.error(esEdicion ? 'Error al actualizar categoría' : 'Error al crear categoría');
      },
    });
  }

  editar(c: any): void {
    this.editandoId = c.id_categoria;
    this.modelo = {
      nombre: c.nombre,
      descripcion: c.descripcion,
      color: c.color?.trim() || '#4f46e5',
    };
  }

  cancelarEdicion(): void {
    this.editandoId = null;
    this.modelo = { nombre: '', descripcion: '', color: '#4f46e5' };
  }

  eliminar(id: number): void {
    if (!confirm('¿Eliminar categoría?')) return;
    this.gestion.eliminarCategoria(id).subscribe({
      next: () => {
        this.categorias = this.categorias.filter((c) => c.id_categoria !== id);
        this.catalogoTienda.invalidarCatalogos();
        this.cdr.markForCheck();
        this.ns.success('Categoría eliminada');
      },
      error: () => {
        this.cdr.markForCheck();
        this.ns.error('Error al eliminar');
      },
    });
  }

  /** Inserta o reemplaza en la tabla sin recargar el listado. */
  private reflejarEnLista(categoria: any): void {
    const indice = this.categorias.findIndex(
      (c) => Number(c.id_categoria) === Number(categoria.id_categoria),
    );
    if (indice >= 0) {
      this.categorias[indice] = { ...this.categorias[indice], ...categoria };
      this.categorias = [...this.categorias];
    } else {
      this.categorias = [categoria, ...this.categorias];
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
