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
import { HttpClient } from '@angular/common/http';
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

import { buscarClases, CatalogoSunat25, ClaseCatalogo25, leerCatalogo25, RUTA_CATALOGO_25 } from './catalogo-sunat-25';

const LIMITE_LISTA = 500;
/** Resultados que muestra el buscador a la vez. */
const RESULTADOS_BUSCADOR = 8;
/** Marca del buscador de «Código para los seleccionados». */
export const BUSQUEDA_LOTE = -1;
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

  /** Buscador abierto: id del producto, `BUSQUEDA_LOTE` para el código de los seleccionados, o null. */
  busquedaAbierta: number | null = null;
  textoBusqueda = '';
  resultados: ClaseCatalogo25[] = [];
  catalogo: CatalogoSunat25 | null = null;
  cargandoCatalogo = false;
  errorCatalogo = false;
  readonly BUSQUEDA_LOTE = BUSQUEDA_LOTE;

  private readonly http = inject(HttpClient);
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

  // ── Buscador del catálogo 25 ──────────────────────────────────────

  /** Abre (o cierra) el buscador de una fila; la lista del catálogo se baja una sola vez. */
  alternarBusqueda(id: number): void {
    if (this.busquedaAbierta === id) {
      this.cerrarBusqueda();
      return;
    }
    this.busquedaAbierta = id;
    this.textoBusqueda = '';
    this.resultados = [];
    this.cargarCatalogo();
    // El cursor va al cuadro de búsqueda en cuanto aparece.
    setTimeout(() => document.getElementById(`${id === BUSQUEDA_LOTE ? 'sin-codigo-buscador-lote' : 'sin-codigo-buscador-' + id}-texto`)?.focus());
  }

  cerrarBusqueda(): void {
    this.busquedaAbierta = null;
    this.textoBusqueda = '';
    this.resultados = [];
    this.cdr.markForCheck();
  }

  alBuscar(texto: string): void {
    this.textoBusqueda = texto;
    this.resultados = this.catalogo ? buscarClases(this.catalogo.clases, texto, RESULTADOS_BUSCADOR) : [];
  }

  /** Elegir un resultado rellena el código de la fila (o el del lote) y cierra el buscador. */
  elegir(clase: ClaseCatalogo25): void {
    const id = this.busquedaAbierta;
    if (id === null) return;
    if (id === BUSQUEDA_LOTE) this.codigoLote = clase.codigo;
    else this.codigos[id] = clase.codigo;
    this.cerrarBusqueda();
  }

  reintentarCatalogo(): void {
    this.errorCatalogo = false;
    this.cargarCatalogo();
  }

  private cargarCatalogo(): void {
    if (this.catalogo || this.cargandoCatalogo) return;
    this.cargandoCatalogo = true;
    this.http
      .get<unknown>(RUTA_CATALOGO_25)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargandoCatalogo = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (crudo) => {
          this.catalogo = leerCatalogo25(crudo);
          this.errorCatalogo = this.catalogo.clases.length === 0;
          // Si ya se había escrito algo mientras bajaba la lista, se busca ahora.
          this.alBuscar(this.textoBusqueda);
        },
        error: () => {
          this.errorCatalogo = true;
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
