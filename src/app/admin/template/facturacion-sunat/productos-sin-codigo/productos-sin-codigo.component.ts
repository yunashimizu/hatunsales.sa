import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { AlertService } from '../../../../shared/services/alert.service';
import { mensajeDeError } from '../../../service/api-base.service';
import {
  ProductoAdminService,
  ProductoSinCodigoSunat,
  ResultadoAsignacionCodigoSunat,
} from '../../../service/producto-admin.service';

const LIMITE_LISTA = 500;
const CODIGO_VALIDO = /^\d{8}$/;
const MENSAJE_CODIGO = 'El código SUNAT debe tener 8 dígitos';

/**
 * Productos activos sin código de producto SUNAT (catálogo 25, UNSPSC). Desde el 1/1/2027 una línea sin
 * código bloquea el comprobante; aquí se carga uno por uno o en bloque sin entrar a cada ficha.
 */
@Component({
  selector: 'app-productos-sin-codigo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './productos-sin-codigo.component.html',
  styleUrl: './productos-sin-codigo.component.css',
})
export class ProductosSinCodigoComponent implements OnInit {
  /** Código por defecto vigente en «Operación y series» (null si no hay). */
  @Input() codigoDefecto: string | null = null;
  /** Tras asignar códigos: el panel vuelve a leer el estado fiscal (checklist y avisos). */
  @Output() readonly cambio = new EventEmitter<void>();

  productos: ProductoSinCodigoSunat[] = [];
  total = 0;
  cargando = false;
  error = '';
  /** Código escrito en cada fila, por id de producto. */
  codigos: Record<number, string> = {};
  seleccionados = new Set<number>();
  codigoLote = '';
  /** Producto que se está guardando ahora; `-1` mientras corre la asignación en bloque. */
  idEnProceso: number | null = null;

  private readonly productosApi = inject(ProductoAdminService);
  private readonly alerta = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private lectura: Subscription | null = null;

  get hayDefecto(): boolean {
    return !!this.codigoDefecto?.trim();
  }

  get ocupado(): boolean {
    return this.idEnProceso !== null;
  }

  get todosSeleccionados(): boolean {
    return this.productos.length > 0 && this.seleccionados.size === this.productos.length;
  }

  get hayMas(): boolean {
    return this.total > this.productos.length;
  }

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    // La última lectura manda.
    this.lectura?.unsubscribe();
    this.cargando = true;
    this.error = '';
    this.lectura = this.productosApi
      .sinCodigoSunat(LIMITE_LISTA)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (respuesta) => {
          this.productos = respuesta.datos ?? [];
          this.total = Number(respuesta.total) || this.productos.length;
          const ids = new Set(this.productos.map((p) => p.id_producto));
          this.seleccionados = new Set([...this.seleccionados].filter((id) => ids.has(id)));
          for (const id of Object.keys(this.codigos).map(Number)) if (!ids.has(id)) delete this.codigos[id];
        },
        error: (e) => {
          this.productos = [];
          this.total = 0;
          this.error = mensajeDeError(e, 'No se pudo consultar los productos sin código SUNAT');
        },
      });
  }

  esValido(codigo: string | undefined): boolean {
    return CODIGO_VALIDO.test((codigo ?? '').trim());
  }

  alternar(id: number, marcado: boolean): void {
    if (marcado) this.seleccionados.add(id);
    else this.seleccionados.delete(id);
  }

  alternarTodos(marcado: boolean): void {
    this.seleccionados = marcado ? new Set(this.productos.map((p) => p.id_producto)) : new Set();
  }

  guardarFila(producto: ProductoSinCodigoSunat): void {
    if (this.ocupado) return;
    const codigo = (this.codigos[producto.id_producto] ?? '').trim();
    if (!CODIGO_VALIDO.test(codigo)) {
      this.alerta.toast({ type: 'warning', title: MENSAJE_CODIGO });
      return;
    }
    this.asignar([{ id_producto: producto.id_producto, codigo_sunat: codigo }], producto.id_producto);
  }

  asignarSeleccionados(): void {
    if (this.ocupado) return;
    if (!this.seleccionados.size) {
      this.alerta.toast({ type: 'warning', title: 'Marque al menos un producto' });
      return;
    }
    const codigo = this.codigoLote.trim();
    if (!CODIGO_VALIDO.test(codigo)) {
      this.alerta.toast({ type: 'warning', title: MENSAJE_CODIGO });
      return;
    }
    this.asignar(
      [...this.seleccionados].map((id) => ({ id_producto: id, codigo_sunat: codigo })),
      -1,
    );
  }

  private asignar(asignaciones: { id_producto: number; codigo_sunat: string }[], marca: number): void {
    this.idEnProceso = marca;
    this.productosApi
      .asignarCodigoSunat(asignaciones)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.idEnProceso = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (resultado) => this.alTerminar(resultado, marca === -1),
        error: (e) => {
          void this.alerta.error({
            title: 'No se pudo guardar el código SUNAT',
            message: mensajeDeError(e, 'Intente de nuevo en unos segundos'),
          });
          this.cargar();
        },
      });
  }

  private alTerminar(resultado: ResultadoAsignacionCodigoSunat, enBloque: boolean): void {
    const rechazados = resultado.rechazados ?? [];
    if (resultado.actualizados > 0) {
      this.alerta.toast({
        type: 'success',
        title:
          resultado.actualizados === 1
            ? 'Código SUNAT guardado en 1 producto'
            : `Código SUNAT guardado en ${resultado.actualizados} productos`,
      });
      if (enBloque) this.codigoLote = '';
    }
    if (rechazados.length) {
      const nombres = new Map(this.productos.map((p) => [p.id_producto, p.nombre]));
      void this.alerta.error({
        title: rechazados.length === 1 ? 'Un producto no se actualizó' : `${rechazados.length} productos no se actualizaron`,
        message: rechazados
          .map((r) => `${nombres.get(r.id_producto) ?? 'Producto ' + r.id_producto}: ${r.motivo}`)
          .join('\n'),
      });
    }
    this.cargar();
    if (resultado.actualizados > 0) this.cambio.emit();
  }
}
