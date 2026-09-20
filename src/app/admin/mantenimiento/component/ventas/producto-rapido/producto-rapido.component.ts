import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, catchError, debounceTime, map, of, takeUntil, timer } from 'rxjs';

import { AuthService } from '../../../../../auth/service/auth.service';
import { AlertConfig, AlertService, escapeHtml } from '../../../../../shared/services/alert.service';
import { ProductoVenta } from '../../../../models/admin.models';
import { errorOperativo, escapeHtmlAlerta, mensajeDeError } from '../../../../service/api-base.service';
import { InventarioAdminService } from '../../../../service/inventario-admin.service';
import { ProductoAdminService, ProductoFormulario } from '../../../../service/producto-admin.service';
import { PuntoVentaService } from '../../../../service/punto-venta.service';
import {
  CampoAltaRapida,
  MAX_LARGO_CODIGO,
  MAX_LARGO_NOMBRE,
  ResultadoValidacion,
  UNIDAD_POR_DEFECTO,
  aNumero,
  armarComentario,
  avisoPrecioBajoCosto,
  buscarDuplicadoExacto,
  cantidadSeLleva,
  coincideConTexto,
  combinarParecidos,
  construirProductoVenta,
  esEnteroPositivo,
  esErrorDeRed,
  formatearMoneda,
  limpiarNombre,
  redondear2,
  sonMismoNombre,
  textoCantidades,
  textoUnidades,
  validarAltaRapida,
  validarCantidades,
} from './alta-rapida.util';

/** crear = producto nuevo + ingreso; ingresar = solo ingreso a un producto que ya existe. */
export type ModoAltaRapida = 'crear' | 'ingresar';

/** Lo que el panel entrega al POS cuando el producto ya tiene stock y hay que ponerlo en el carrito. */
export interface ResultadoAltaRapida {
  producto: ProductoVenta;
  cantidadCarrito: number;
  /** true si el producto se acaba de crear; false si ya existía y solo se le ingresó stock o se usó tal cual. */
  creado: boolean;
}

/** formulario = se llena y se guarda; stock = el producto quedó creado pero falló su ingreso. */
type FaseAltaRapida = 'formulario' | 'stock';
type ProgresoAltaRapida = 'verificando' | 'creando' | 'ingresando' | null;

interface FormularioRapido {
  nombre: string;
  codigo_barras: string;
  precio_venta: number | null;
  precio_compra: number | null;
  unidad_medida: string;
  /** Unidades que entran al almacén. */
  ingresa: number | null;
  /** Unidades que van al carrito (lo que se lleva el cliente). */
  se_lleva: number | null;
}

const FORMULARIO_VACIO: FormularioRapido = {
  nombre: '',
  codigo_barras: '',
  precio_venta: null,
  precio_compra: 0,
  unidad_medida: UNIDAD_POR_DEFECTO,
  ingresa: 1,
  se_lleva: 1,
};

/** Copia de UNIDADES de productos.component.ts (no se importa para no acoplar las dos pantallas). */
const UNIDADES = ['NIU', 'ZZ', 'KGM', 'MTR', 'LTR', 'GLL', 'BX', 'PK', 'SET'];

/**
 * Alta rápida de producto desde el punto de venta.
 *
 * Dos usos, un mismo panel lateral:
 *  - crear: producto que no existe. POST /producto (sin stock) y después
 *    POST /inventario/ajuste (motivo «compra») para que el ingreso deje kardex.
 *  - ingresar: producto que ya existe pero sin stock. Solo el ajuste.
 *
 * El panel no toca el carrito: entrega `agregado` y es el POS quien añade la línea.
 * OnPush + markForCheck: el shell admin es OnPush; sin refrescarVista() tras HTTP
 * la UI no se pinta hasta el primer click.
 */
@Component({
  selector: 'app-producto-rapido',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './producto-rapido.component.html',
  styleUrl: './producto-rapido.component.css',
})
export class ProductoRapidoComponent implements OnInit, OnChanges, OnDestroy {

  @Input() abierto = false;
  @Input() modo: ModoAltaRapida = 'crear';
  /** Nombre con el que arranca el formulario (lo que se había buscado por nombre). */
  @Input() textoInicial = '';
  /** Código de barras con el que arranca el formulario (lo que se había escaneado). */
  @Input() codigoInicial = '';
  /** Producto que ya existe (solo en modo ingresar). */
  @Input() productoExistente: ProductoVenta | null = null;
  /** Almacén activo del POS. Se lee de nuevo justo antes del ajuste, no al abrir. */
  @Input() idAlmacen: number | null = null;
  @Input() nombreAlmacen = '';
  /** El POS está cambiando de almacén o cobrando: no se guarda hasta que termine. */
  @Input() ocupado = false;

  @Output() readonly agregado = new EventEmitter<ResultadoAltaRapida>();
  @Output() readonly cerrado = new EventEmitter<void>();

  @ViewChild('campoNombre') private campoNombre?: ElementRef<HTMLInputElement>;
  @ViewChild('campoCodigo') private campoCodigo?: ElementRef<HTMLInputElement>;
  @ViewChild('campoPrecio') private campoPrecio?: ElementRef<HTMLInputElement>;
  @ViewChild('campoIngresa') private campoIngresa?: ElementRef<HTMLInputElement>;
  @ViewChild('campoSeLleva') private campoSeLleva?: ElementRef<HTMLInputElement>;
  @ViewChild('campoCompra') private campoCompra?: ElementRef<HTMLInputElement>;

  formulario: FormularioRapido = { ...FORMULARIO_VACIO };
  /** Modo en el que está el panel ahora (puede pasar de crear a ingresar si el producto ya existía). */
  modoActivo: ModoAltaRapida = 'crear';
  /** Producto existente sobre el que se ingresa stock (modo ingresar). */
  productoFijo: ProductoVenta | null = null;
  fase: FaseAltaRapida = 'formulario';
  progreso: ProgresoAltaRapida = null;
  guardando = false;
  /** Hay un aviso o confirmación de SweetAlert encima: Esc y Enter del panel no deben actuar. */
  dialogoAbierto = false;
  /** Producto ya creado en el servidor, pendiente de ingreso (fase stock). */
  productoCreado: ProductoVenta | null = null;
  /** Motivo exacto con el que el servidor rechazó el ingreso. */
  motivoFallo = '';
  parecidos: ProductoVenta[] = [];

  readonly unidades = UNIDADES;
  readonly maxLargoNombre = MAX_LARGO_NOMBRE;
  readonly maxLargoCodigo = MAX_LARGO_CODIGO;

  /** «Se lleva el cliente» deja de seguir a «Ingresa» en cuanto el usuario la toca. */
  private seLlevaEditado = false;
  /** Resultado del servidor al abrir el panel (ve lo que otro cajero creó y esta caché no tiene). */
  private resultadosServidor: ProductoVenta[] = [];
  /** Descarta respuestas de una consulta de un panel que ya se cerró o se volvió a abrir. */
  private generacionConsulta = 0;
  private destruido = false;
  private readonly escribiendoNombre$ = new Subject<void>();
  private readonly destruir$ = new Subject<void>();
  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private readonly puntoVenta: PuntoVentaService,
    private readonly productos: ProductoAdminService,
    private readonly inventario: InventarioAdminService,
    private readonly alerta: AlertService,
    private readonly auth: AuthService,
  ) {}

  /** Fuerza repaint bajo shell OnPush (mismo patrón que Productos/Clientes). */
  private refrescarVista(): void {
    this.cdr.markForCheck();
  }

  ngOnInit(): void {
    // Parecidos en vivo: síncrono contra la caché en memoria, sin red.
    this.escribiendoNombre$
      .pipe(debounceTime(200), takeUntil(this.destruir$))
      .subscribe(() => {
        this.recalcularParecidos();
        this.refrescarVista();
      });
  }

  ngOnChanges(cambios: SimpleChanges): void {
    const cambioAbierto = cambios['abierto'];
    if (!cambioAbierto) return;
    if (this.abierto) {
      this.prepararApertura();
    } else {
      this.generacionConsulta += 1;
    }
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.destruir$.next();
    this.destruir$.complete();
  }

  // ── Apertura ─────────────────────────────────────────────────

  private prepararApertura(): void {
    this.generacionConsulta += 1;
    this.modoActivo = this.modo;
    this.productoFijo = this.modo === 'ingresar' ? this.productoExistente : null;
    this.fase = 'formulario';
    this.progreso = null;
    this.guardando = false;
    this.dialogoAbierto = false;
    this.productoCreado = null;
    this.motivoFallo = '';
    this.seLlevaEditado = false;
    this.resultadosServidor = [];
    this.parecidos = [];
    this.formulario = {
      ...FORMULARIO_VACIO,
      nombre: limpiarNombre(this.textoInicial),
      codigo_barras: (this.codigoInicial ?? '').trim(),
    };

    if (this.modoActivo === 'crear') {
      this.recalcularParecidos();
      this.consultarServidorAlAbrir();
    }
    this.programarFocoInicial();
  }

  /** Una sola consulta al servidor al abrir: ve productos que la caché local no tiene. */
  private consultarServidorAlAbrir(): void {
    const nombre = this.formulario.nombre.trim();
    if (nombre.length < 2) return;

    const generacion = this.generacionConsulta;
    this.puntoVenta
      .buscarProductos(nombre, 12, this.idAlmacen)
      .pipe(
        catchError(() => of([] as ProductoVenta[])),
        takeUntil(this.destruir$),
      )
      .subscribe((lista) => {
        if (generacion !== this.generacionConsulta || !this.abierto) return;
        this.resultadosServidor = Array.isArray(lista) ? lista : [];
        this.recalcularParecidos();
        this.refrescarVista();
      });
  }

  /**
   * Foco inicial con ~80 ms de espera: el POS llama a enfocarBuscadorProducto()
   * en un microtask y, si se enfocara antes, el buscador se lo llevaría de vuelta.
   */
  private programarFocoInicial(): void {
    timer(80)
      .pipe(takeUntil(this.destruir$))
      .subscribe(() => {
        if (!this.abierto) return;
        if (this.modoActivo === 'ingresar') {
          this.enfocar(this.campoIngresa);
        } else if (this.formulario.nombre.trim()) {
          // El nombre ya vino escrito: lo siguiente que falta es el precio.
          this.enfocar(this.campoPrecio);
        } else {
          // Vino un código escaneado (o nada): falta el nombre.
          this.enfocar(this.campoNombre);
        }
      });
  }

  private enfocar(campo?: ElementRef<HTMLInputElement>): void {
    const elemento = campo?.nativeElement;
    if (!elemento) return;
    elemento.focus();
    elemento.select();
  }

  private enfocarCampo(campo?: CampoAltaRapida): void {
    switch (campo) {
      case 'nombre': this.enfocar(this.campoNombre); break;
      case 'codigo_barras': this.enfocar(this.campoCodigo); break;
      case 'precio_venta': this.enfocar(this.campoPrecio); break;
      case 'precio_compra': this.enfocar(this.campoCompra); break;
      case 'ingresa': this.enfocar(this.campoIngresa); break;
      case 'se_lleva': this.enfocar(this.campoSeLleva); break;
      default: break;
    }
  }

  // ── Vista ────────────────────────────────────────────────────

  get tituloCabecera(): string {
    if (this.fase === 'stock') return 'Falta el stock';
    return this.modoActivo === 'crear' ? 'Producto nuevo' : 'Ingresar stock';
  }

  get iconoCabecera(): string {
    if (this.fase === 'stock') return 'bi-exclamation-triangle';
    return this.modoActivo === 'crear' ? 'bi-plus-square' : 'bi-box-arrow-in-down';
  }

  get bloqueado(): boolean {
    return this.guardando || this.ocupado || this.dialogoAbierto;
  }

  /** «Entran N unidades al almacén. Al carrito se agregan M.» */
  get textoAyudaCantidades(): string {
    return textoCantidades(this.formulario.ingresa, this.formulario.se_lleva);
  }

  /** Eco del precio ya formateado: el descuido del punto decimal es el error más común. */
  get precioVista(): string {
    return aNumero(this.formulario.precio_venta) > 0 ? formatearMoneda(this.formulario.precio_venta) : '';
  }

  get avisoPrecio(): string {
    return avisoPrecioBajoCosto(this.formulario.precio_venta, this.formulario.precio_compra);
  }

  get textoProgreso(): string {
    switch (this.progreso) {
      case 'verificando': return 'Verificando…';
      case 'creando': return 'Creando producto…';
      case 'ingresando': return `Ingresando ${textoUnidades(this.formulario.ingresa)}…`;
      default: return '';
    }
  }

  get stockActual(): number {
    return Number(this.productoFijo?.stock_disponible ?? 0);
  }

  /** El producto existente ya tiene con qué cubrir lo que se lleva el cliente: basta agregarlo. */
  get puedeSoloAgregar(): boolean {
    if (this.modoActivo !== 'ingresar' || !this.productoFijo) return false;
    const seLleva = aNumero(this.formulario.se_lleva);
    return esEnteroPositivo(seLleva) && this.stockActual >= seLleva;
  }

  identificarParecido(_indice: number, producto: ProductoVenta): number {
    return producto.id_producto;
  }

  esMismoNombre(producto: ProductoVenta): boolean {
    return sonMismoNombre(producto.nombre, this.formulario.nombre);
  }

  // ── Formulario ───────────────────────────────────────────────

  alEscribirNombre(): void {
    this.escribiendoNombre$.next();
  }

  alCambiarIngresa(): void {
    if (this.seLlevaEditado) return;
    this.formulario.se_lleva = cantidadSeLleva(this.formulario.ingresa, this.formulario.se_lleva, false);
  }

  alCambiarSeLleva(): void {
    this.seLlevaEditado = true;
  }

  private recalcularParecidos(): void {
    const nombre = this.formulario.nombre.trim();
    if (this.modoActivo !== 'crear' || nombre.length < 2) {
      this.parecidos = [];
      return;
    }
    const locales = this.puntoVenta.filtrarLocal(nombre, 3);
    const delServidor = this.resultadosServidor.filter((p) => coincideConTexto(p.nombre, nombre));
    this.parecidos = combinarParecidos(nombre, [locales, delServidor], 3);
  }

  /** Teclado del cuerpo: Enter guarda desde cualquier campo, sin submit nativo. */
  alPresionarTecla(evento: KeyboardEvent): void {
    if (evento.key !== 'Enter' || evento.isComposing) return;
    const destino = evento.target as HTMLElement | null;
    // Un botón (p. ej. «Usar») conserva su Enter nativo.
    if (destino?.tagName === 'BUTTON') return;
    evento.preventDefault();
    if (evento.repeat) return;
    this.guardar();
  }

  /**
   * El lector HID termina cada lectura con Enter: en el código de barras eso
   * no debe guardar, solo pasar al precio.
   */
  alPresionarEnCodigo(evento: KeyboardEvent): void {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    evento.stopPropagation();
    this.enfocar(this.campoPrecio);
  }

  volverACrear(): void {
    if (this.bloqueado || this.modo !== 'crear') return;
    this.modoActivo = 'crear';
    this.productoFijo = null;
    this.recalcularParecidos();
    this.refrescarVista();
    this.programarFocoInicial();
  }

  /** Pasa a ingresar stock sobre un producto que ya existe, conservando lo tecleado. */
  private pasarAModoIngreso(producto: ProductoVenta): void {
    this.modoActivo = 'ingresar';
    this.productoFijo = producto;
    this.fase = 'formulario';
    this.parecidos = [];
    this.refrescarVista();
    this.programarFocoInicial();
  }

  /** «Usar» sobre un parecido: en vez de crear otro, se ingresa stock al que ya existe. */
  usarExistente(producto: ProductoVenta): void {
    if (this.bloqueado) return;
    this.pasarAModoIngreso(producto);
  }

  // ── Cierre ───────────────────────────────────────────────────

  /** Cancelar, velo o Esc: cierra sin guardar. Inerte mientras se guarda o hay un diálogo encima. */
  cerrar(): void {
    if (this.guardando || this.dialogoAbierto) return;
    if (this.fase === 'stock') {
      this.loHareDespues();
      return;
    }
    this.cerrado.emit();
  }

  @HostListener('document:keydown.escape')
  alPresionarEscape(): void {
    if (!this.abierto || this.guardando || this.dialogoAbierto) return;
    this.cerrar();
  }

  /** El producto ya está creado pero sin stock: queda en la caché para completarlo luego con «+ Stock». */
  loHareDespues(): void {
    if (this.guardando || this.dialogoAbierto) return;
    const creado = this.productoCreado;
    if (creado) {
      this.puntoVenta.agregarAlCatalogoLocal({ ...creado, stock_disponible: 0 }, this.idAlmacen);
      this.alerta.toast({
        type: 'info',
        title: `«${escapeHtml(creado.nombre)}» quedó creado sin stock`,
        message: 'Búsquelo y use «+ Stock» cuando vaya a ingresarlo.',
        timer: 4500,
      });
    }
    this.cerrado.emit();
  }

  // ── Guardar ──────────────────────────────────────────────────

  guardar(): void {
    // Protege del doble disparo (doble Enter del lector, doble clic) y de guardar con un aviso encima.
    if (this.bloqueado) return;

    if (this.fase === 'stock') {
      this.reintentarIngreso();
      return;
    }

    const validacion = validarAltaRapida({
      modo: this.modoActivo,
      nombre: this.formulario.nombre,
      codigoBarras: this.formulario.codigo_barras,
      precioVenta: this.formulario.precio_venta,
      precioCompra: this.formulario.precio_compra,
      ingresa: this.formulario.ingresa,
      seLleva: this.formulario.se_lleva,
    });
    if (!validacion.valido) {
      this.avisarValidacion(validacion);
      return;
    }

    if (this.modoActivo === 'ingresar') {
      if (!this.productoFijo) {
        this.alerta.toast({ type: 'warning', title: 'No hay un producto elegido' });
        return;
      }
      this.ingresarStock(this.productoFijo);
      return;
    }

    this.verificarYCrear();
  }

  private avisarValidacion(validacion: ResultadoValidacion): void {
    if (validacion.mensaje) {
      this.alerta.toast({ type: 'warning', title: validacion.mensaje });
    }
    this.enfocarCampo(validacion.campo);
  }

  private terminarProgreso(): void {
    this.guardando = false;
    this.progreso = null;
    this.refrescarVista();
  }

  /**
   * Antes de crear se busca un producto de igual nombre (caché local + servidor):
   * dos nombres que normalizan igual chocan en el slug de la tienda web.
   */
  private buscarDuplicado$(nombre: string): Observable<ProductoVenta | null> {
    const conocidos = [...this.puntoVenta.filtrarLocal(nombre, 12), ...this.resultadosServidor];
    const yaConocido = buscarDuplicadoExacto(nombre, conocidos);
    if (yaConocido) return of(yaConocido);
    return this.buscarEnServidor$(nombre);
  }

  private buscarEnServidor$(nombre: string): Observable<ProductoVenta | null> {
    return this.puntoVenta.buscarProductos(nombre, 12, this.idAlmacen).pipe(
      map((lista) => buscarDuplicadoExacto(nombre, Array.isArray(lista) ? lista : [])),
      catchError(() => of(null)),
    );
  }

  private verificarYCrear(): void {
    const nombre = limpiarNombre(this.formulario.nombre);
    this.guardando = true;
    this.progreso = 'verificando';
    this.refrescarVista();

    this.buscarDuplicado$(nombre).pipe(takeUntil(this.destruir$)).subscribe({
      next: (duplicado) => {
        if (duplicado) {
          this.terminarProgreso();
          void this.avisarDuplicado(duplicado);
          return;
        }
        this.crearProducto(nombre);
      },
      error: () => this.terminarProgreso(),
    });
  }

  private async avisarDuplicado(duplicado: ProductoVenta): Promise<void> {
    const usarEse = await this.confirmar({
      title: `Ya existe «${escapeHtml(duplicado.nombre)}»`,
      message: 'Ya hay un producto con ese nombre en el catálogo. Use ese mismo para no duplicarlo, '
        + 'o cambie el nombre si se trata de otro artículo.',
      confirmText: 'Usar ese producto',
      cancelText: 'Cambiar el nombre',
    });
    if (this.destruido || !this.abierto) return;
    if (usarEse) {
      this.pasarAModoIngreso(duplicado);
    } else {
      this.enfocar(this.campoNombre);
    }
  }

  /** Paso 1: POST /producto sin stock, sin almacén, sin SKU y sin descripción corta. */
  private crearProducto(nombre: string): void {
    this.progreso = 'creando';
    this.refrescarVista();

    const unidad = this.formulario.unidad_medida || UNIDAD_POR_DEFECTO;
    const codigo = (this.formulario.codigo_barras ?? '').trim();
    const datos: ProductoFormulario = {
      nombre,
      precio_venta: redondear2(Number(this.formulario.precio_venta)),
      precio_compra: redondear2(aNumero(this.formulario.precio_compra) || 0),
      unidad_medida: unidad,
      estado: true,
    };
    if (codigo) datos.codigo_barras = codigo;

    this.productos.crear(datos).pipe(takeUntil(this.destruir$)).subscribe({
      next: (creado) => {
        this.productoCreado = construirProductoVenta(creado, 0, unidad);
        this.refrescarVista();
        this.ingresarStock(this.productoCreado);
      },
      error: (error) => this.alFallarCreacion(error, nombre, codigo),
    });
  }

  private alFallarCreacion(error: any, nombre: string, codigo: string): void {
    this.terminarProgreso();

    // Código de barras repetido (el backend lo lanza como texto plano, sin código estable).
    if (error?.status === 409) {
      void this.avisarCodigoRepetido(codigo);
      return;
    }

    // Sin respuesta: puede que el producto sí se haya creado. No se reintenta a ciegas.
    if (esErrorDeRed(error?.status)) {
      this.verificarCreacionPerdida(nombre, error);
      return;
    }

    void this.mostrarError(
      this.opcionesDeError(errorOperativo(error, 'No se pudo crear el producto')),
    ).then(() => this.enfocarTrasAviso());
  }

  /**
   * Un POST /producto que se perdió por red puede haberse procesado igual. Se busca
   * por nombre: si el producto ya está, se sigue con su ingreso en vez de crearlo dos veces.
   */
  private verificarCreacionPerdida(nombre: string, errorOriginal: any): void {
    this.guardando = true;
    this.progreso = 'verificando';
    this.refrescarVista();

    this.buscarEnServidor$(nombre).pipe(takeUntil(this.destruir$)).subscribe((existente) => {
      if (existente) {
        this.productoCreado = existente;
        this.refrescarVista();
        this.ingresarStock(existente);
        return;
      }
      this.terminarProgreso();
      const motivo = escapeHtmlAlerta(mensajeDeError(errorOriginal, 'Sin respuesta del servidor'));
      void this.mostrarError({
        title: 'No se pudo confirmar la creación',
        message: `${motivo}<br><br><small>Revise su conexión y vuelva a pulsar «Crear y agregar»: `
          + 'antes de crear se comprueba que el producto no haya quedado registrado.</small>',
        allowHtml: true,
      }).then(() => this.enfocarTrasAviso());
    });
  }

  private async avisarCodigoRepetido(codigo: string): Promise<void> {
    const agregarlo = await this.confirmar({
      title: 'Ese código ya está registrado',
      message: 'Ya existe un producto con ese código de barras. ¿Quiere agregarlo al carrito?',
      confirmText: 'Sí, agregarlo',
      cancelText: 'Cambiar el código',
    });
    if (this.destruido || !this.abierto) return;
    if (!agregarlo) {
      this.enfocar(this.campoCodigo);
      return;
    }
    this.traerPorCodigo(codigo);
  }

  /** Trae el producto que ya usa ese código: con stock va al carrito; sin stock, a ingresarle. */
  private traerPorCodigo(codigo: string): void {
    this.guardando = true;
    this.progreso = 'verificando';
    this.refrescarVista();

    this.puntoVenta.porCodigoBarras(codigo, this.idAlmacen).pipe(takeUntil(this.destruir$)).subscribe({
      next: (existente) => {
        this.terminarProgreso();
        const seLleva = aNumero(this.formulario.se_lleva);
        if (Number(existente.stock_disponible ?? 0) >= seLleva) {
          this.entregarAlCarrito(existente, seLleva, false);
        } else {
          this.pasarAModoIngreso(existente);
        }
      },
      error: (error) => {
        this.terminarProgreso();
        void this.mostrarError({
          title: 'No se pudo traer el producto',
          message: `${escapeHtmlAlerta(mensajeDeError(error, 'No se pudo consultar el código'))}<br><br><small>`
            + 'Puede que ese producto esté inactivo y no aparezca en el punto de venta: '
            + 'revíselo en Productos o use otro código.</small>',
          allowHtml: true,
        }).then(() => this.enfocar(this.campoCodigo));
      },
    });
  }

  // ── Ingreso de stock ─────────────────────────────────────────

  /**
   * Paso 2 (o único paso en modo ingresar): POST /inventario/ajuste con motivo «compra».
   * El almacén se lee AQUÍ, no al abrir el panel: el POS puede haberlo revertido entre tanto.
   */
  private ingresarStock(producto: ProductoVenta): void {
    const idAlmacenUsado = this.idAlmacen;
    if (!idAlmacenUsado) {
      this.terminarProgreso();
      void this.mostrarError({
        title: 'No hay un almacén activo',
        message: 'Elija el almacén del punto de venta antes de ingresar el stock.',
      });
      return;
    }
    const nombreAlmacenUsado = this.nombreAlmacen;
    const cantidad = Math.trunc(aNumero(this.formulario.ingresa));
    const esAlta = producto === this.productoCreado;
    const prefijo = esAlta ? 'Alta rápida en caja' : 'Ingreso rápido en caja';

    this.guardando = true;
    this.progreso = 'ingresando';
    this.refrescarVista();

    this.inventario
      .ajustar({
        id_producto: producto.id_producto,
        id_almacen: idAlmacenUsado,
        cantidad,
        motivo: 'compra',
        comentario: armarComentario(prefijo, this.auth.getSesion().nombre),
      })
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (respuesta) => this.alIngresarStock(producto, cantidad, Number(respuesta?.stock), idAlmacenUsado, nombreAlmacenUsado, esAlta),
        error: (error) => this.alFallarIngreso(error),
      });
  }

  private alIngresarStock(
    producto: ProductoVenta,
    cantidadIngresada: number,
    stockResultante: number,
    idAlmacenUsado: number,
    nombreAlmacenUsado: string,
    esAlta: boolean,
  ): void {
    this.terminarProgreso();

    const stock = Number.isFinite(stockResultante)
      ? stockResultante
      : Math.max(0, Number(producto.stock_disponible ?? 0)) + cantidadIngresada;
    const conStock: ProductoVenta = { ...producto, stock_disponible: stock };

    // La caché local sabe del producto desde ya: no se depende de recargar el catálogo.
    this.puntoVenta.agregarAlCatalogoLocal(conStock, idAlmacenUsado);

    const donde = nombreAlmacenUsado || 'el almacén activo';

    // El almacén activo cambió mientras se ingresaba: el stock entró al anterior.
    if (this.idAlmacen !== idAlmacenUsado) {
      this.alerta.toast({
        type: 'warning',
        title: `El stock entró a ${escapeHtml(donde)}`,
        message: 'Cambió de almacén mientras se guardaba. Cámbielo de nuevo para venderlo.',
        timer: 5000,
      });
      this.cerrado.emit();
      return;
    }

    this.alerta.toast({
      type: 'success',
      title: `«${escapeHtml(conStock.nombre)}» ${esAlta ? 'creado' : 'con stock ingresado'}`,
      message: `${textoUnidades(cantidadIngresada)} ${cantidadIngresada === 1 ? 'ingresada' : 'ingresadas'} en ${donde}`,
      timer: 2500,
    });
    this.entregarAlCarrito(conStock, aNumero(this.formulario.se_lleva), esAlta);
  }

  private alFallarIngreso(error: any): void {
    this.terminarProgreso();

    // El producto ya quedó creado: el panel no se cierra y solo se reintenta el ajuste.
    if (this.modoActivo === 'crear' && this.productoCreado) {
      this.fase = 'stock';
      this.motivoFallo = mensajeDeError(error, 'No se pudo registrar el ingreso');
      this.refrescarVista();
      timer(80).pipe(takeUntil(this.destruir$)).subscribe(() => this.enfocar(this.campoIngresa));
      return;
    }

    void this.mostrarError(
      this.opcionesDeError(errorOperativo(error, 'No se pudo ingresar el stock')),
    ).then(() => this.enfocarTrasAviso());
  }

  reintentarIngreso(): void {
    if (this.bloqueado || !this.productoCreado) return;
    const validacion = validarCantidades(this.formulario.ingresa, this.formulario.se_lleva);
    if (!validacion.valido) {
      this.avisarValidacion(validacion);
      return;
    }
    this.ingresarStock(this.productoCreado);
  }

  /** Producto existente con stock suficiente: no hace falta ingresar nada, solo llevarlo al carrito. */
  soloAgregar(): void {
    if (this.bloqueado || !this.productoFijo) return;
    const seLleva = aNumero(this.formulario.se_lleva);
    if (!esEnteroPositivo(seLleva)) {
      this.avisarValidacion({
        valido: false,
        campo: 'se_lleva',
        mensaje: 'Indique cuántas unidades se lleva el cliente',
      });
      return;
    }
    if (seLleva > this.stockActual) {
      this.alerta.toast({ type: 'warning', title: `Solo hay ${this.stockActual} unidades en este almacén` });
      this.enfocar(this.campoSeLleva);
      return;
    }
    this.entregarAlCarrito(this.productoFijo, seLleva, false);
  }

  private entregarAlCarrito(producto: ProductoVenta, cantidadCarrito: number, creado: boolean): void {
    this.agregado.emit({ producto, cantidadCarrito, creado });
  }

  // ── Avisos con SweetAlert ────────────────────────────────────

  /**
   * Todo aviso abierto desde el panel bloquea Esc (allowEscapeKey false) y levanta
   * `dialogoAbierto`, para que la misma tecla no cierre también el panel y pierda lo tecleado.
   */
  private confirmar(config: AlertConfig): Promise<boolean> {
    this.dialogoAbierto = true;
    this.refrescarVista();
    return this.alerta
      .confirm({ ...config, allowEscapeKey: false })
      .then((resultado) => resultado.isConfirmed)
      .finally(() => this.cerrarDialogo());
  }

  private mostrarError(config: AlertConfig): Promise<void> {
    this.dialogoAbierto = true;
    this.refrescarVista();
    return this.alerta
      .error({ ...config, allowEscapeKey: false })
      .then(() => undefined)
      .finally(() => this.cerrarDialogo());
  }

  private cerrarDialogo(): void {
    this.dialogoAbierto = false;
    if (!this.destruido) this.refrescarVista();
  }

  private opcionesDeError(op: { title: string; message: string; allowHtml: boolean }): AlertConfig {
    return { title: op.title, message: op.message, allowHtml: op.allowHtml };
  }

  /** Tras un aviso de error el foco vuelve al panel, para poder corregir y pulsar Enter. */
  private enfocarTrasAviso(): void {
    if (this.destruido || !this.abierto) return;
    if (this.fase === 'stock' || this.modoActivo === 'ingresar') {
      this.enfocar(this.campoIngresa);
    } else {
      this.enfocar(this.campoPrecio);
    }
  }
}
