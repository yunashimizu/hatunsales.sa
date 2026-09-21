import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Subject, debounceTime, distinctUntilChanged, of, switchMap, takeUntil,
  catchError, EMPTY, finalize, tap, timer,
} from 'rxjs';

import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { urlMedia } from '../../../../shared/utils/media-url.util';
import { ReceptorService } from '../../../service/receptor.service';
import { AlmacenPos, ContextoPos, PuntoVentaService, SolicitudVenta } from '../../../service/punto-venta.service';
import { CajaSesionService } from '../../../service/caja-sesion.service';
import { CotizacionService } from '../../../service/cotizacion.service';
import { ConfiguracionFiscalService } from '../../../service/configuracion-fiscal.service';
import { mensajeDeError, errorOperativo, escapeHtmlAlerta } from '../../../service/api-base.service';
import {
  LineaVenta, PreviewComprobante, ProductoVenta, Receptor, SugerenciaReceptor,
  VentaRegistrada, TIPO_BOLETA, TIPO_FACTURA,
} from '../../../models/admin.models';
import {
  ModoAltaRapida, ProductoRapidoComponent, ResultadoAltaRapida,
} from './producto-rapido/producto-rapido.component';

const LS_ALMACEN = 'pos_id_almacen';

/**
 * Punto de venta de mostrador.
 *
 * La vista previa del comprobante la calcula el backend, no esta pantalla. Así
 * lo que ve el cajero es exactamente lo que se va a emitir, sin dos fórmulas de
 * IGV que puedan discrepar.
 *
 * OnPush + markForCheck: el shell admin es OnPush; sin refrescarVista() tras HTTP
 * la UI no se pinta hasta el primer click.
 */
@Component({
  selector: 'app-ventas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, ProductoRapidoComponent],
  templateUrl: './ventas.component.html',
  styleUrls: ['./ventas.component.css'],
})
export class VentasComponent implements OnInit, OnDestroy {

  @ViewChild('inputProducto') private inputProducto?: ElementRef<HTMLInputElement>;

  private readonly cdr = inject(ChangeDetectorRef);

  /** Fuerza repaint bajo shell OnPush (mismo patrón que Productos/Clientes). */
  private refrescarVista(): void {
    this.cdr.markForCheck();
  }

  readonly TIPO_FACTURA = TIPO_FACTURA;
  readonly TIPO_BOLETA = TIPO_BOLETA;

  /** Evita doble Enter del lector mientras llega la respuesta exacta. */
  private escaneandoCodigo = false;

  idTipo: number = TIPO_BOLETA;
  /** Serie fiscal solo lectura: la asigna el sistema según boleta/factura. */
  serie = '';
  private serieBoletaCfg = 'BBB1';
  private serieFacturaCfg = 'FFF1';
  observaciones = '';
  enviarPorCorreo = false;
  emitirComprobante = true;

  /** Almacén activo del POS (caja → almacén; se puede cambiar). */
  almacenes: AlmacenPos[] = [];
  idAlmacen: number | null = null;
  /** Evita doble cambio / UI mientras recarga catálogo del almacén. */
  cambiandoAlmacen = false;
  cargandoContextoPos = true;

  // ── Receptor ──────────────────────────────────────────────────
  textoReceptor = '';
  receptor: Receptor | null = null;
  sugerenciasReceptor: SugerenciaReceptor[] = [];
  indiceReceptor = -1;
  buscandoReceptor = false;

  // ── Productos ─────────────────────────────────────────────────
  textoProducto = '';
  sugerenciasProducto: ProductoVenta[] = [];
  indiceProducto = -1;
  buscandoProducto = false;
  /** Último intento explícito (Enter / lector) que no encontró nada; habilita la tarjeta «Sin resultados». */
  busquedaFallida: { texto: string; esCodigo: boolean } | null = null;

  // ── Alta rápida de producto ───────────────────────────────────
  /** Admin/vendedor: los únicos roles que pueden crear productos e ingresar stock (se lee una vez). */
  private editaCatalogo = false;
  panelAltaRapida = false;
  modoAltaRapida: ModoAltaRapida = 'crear';
  textoInicialAlta = '';
  codigoInicialAlta = '';
  productoIngresoAlta: ProductoVenta | null = null;
  /** Línea del carrito recién creada o con stock recién ingresado: se resalta unos segundos. */
  idLineaDestacada: number | null = null;

  // ── Carrito ───────────────────────────────────────────────────
  lineas: LineaVenta[] = [];

  // ── Cobro ─────────────────────────────────────────────────────
  metodosPago: { id_metodo: number; nombre: string; tipo: string }[] = [];
  lineasPago: {
    id_metodo: number | null;
    monto: number | null;
    referencia: string;
    monto_recibido: number | null;
    id_cuenta_bancaria: number | null;
    voucher_pos: string;
    validacion: string;
    referencia_externa: string;
    yape_orden_id: string;
    yape_estado: string;
  }[] = [this.lineaPagoVacia()];
  lineaCredito: {
    credito_activo: boolean;
    disponible: number;
    limite_credito: number;
    saldo_pendiente: number;
    dias_credito: number;
    denominacion: string;
  } | null = null;
  cuentasBancarias: any[] = [];
  pasarelaInfo: any = null;
  yapeCargando = false;

  /** Chip informativo: turno de caja (modo blando no bloquea cobro). */
  cajaChip: { abierta: boolean; etiqueta: string; modo: string } | null = null;

  /** Cotización cargada vía ?cotizacion=ID (no bloquea cobro normal). */
  idCotizacionCargada: number | null = null;
  codigoCotizacionCargada = '';
  private idAlmacenCotizacion: number | null = null;

  private lineaPagoVacia() {
    return {
      id_metodo: null as number | null,
      monto: null as number | null,
      referencia: '',
      monto_recibido: null as number | null,
      id_cuenta_bancaria: null as number | null,
      voucher_pos: '',
      validacion: '',
      referencia_externa: '',
      yape_orden_id: '',
      yape_estado: '',
    };
  }

  /** @deprecated compat: se deriva de lineasPago[0] */
  get idMetodoPago(): number | null {
    return this.lineasPago[0]?.id_metodo ?? null;
  }
  set idMetodoPago(v: number | null) {
    if (this.lineasPago[0]) this.lineasPago[0].id_metodo = v;
  }
  montoRecibido: number | null = null;

  // ── Vista previa y resultado ──────────────────────────────────
  preview: PreviewComprobante | null = null;
  calculandoPreview = false;
  errorPreview = '';
  emitiendo = false;
  ultimaVenta: VentaRegistrada | null = null;

  private claveIdempotencia = '';
  private readonly buscarReceptor$ = new Subject<string>();
  private readonly documentoExacto$ = new Subject<string>();
  private readonly buscarProducto$ = new Subject<string>();
  private readonly recalcular$ = new Subject<void>();
  private readonly cambiarAlmacen$ = new Subject<number>();
  private readonly destruir$ = new Subject<void>();
  private busquedaProductoId = 0;
  /** Evita re-disparar la misma búsqueda automática de DNI/RUC. */
  private ultimoDocumentoAuto = '';
  private autoEligiendoReceptor = false;
  /** Generación para no apagar el spinner si un cambio de almacén canceló al anterior. */
  private generacionAlmacen = 0;

  constructor(
    private readonly receptorService: ReceptorService,
    private readonly puntoVenta: PuntoVentaService,
    private readonly alerta: AlertService,
    private readonly cajaSesion: CajaSesionService,
    private readonly cotizaciones: CotizacionService,
    private readonly fiscalCfg: ConfiguracionFiscalService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.editaCatalogo = this.auth.puedeEditarCatalogo();
    this.claveIdempotencia = this.puntoVenta.nuevaClaveIdempotencia();
    this.escucharBusquedaReceptor();
    this.escucharBusquedaProducto();
    this.escucharRecalculo();
    this.escucharCambioAlmacen();
    this.cargarMetodosPago();
    this.cargarSeriesFiscales();
    this.cargarContextoPos();
    this.cargarChipCaja();
    this.route.queryParamMap.pipe(takeUntil(this.destruir$)).subscribe((params) => {
      const id = Number(params.get('cotizacion') || 0);
      if (id > 0 && id !== this.idCotizacionCargada) {
        this.cargarCotizacionEnPos(id);
      }
    });
  }

  get nombreAlmacenActivo(): string {
    if (!this.idAlmacen) return '';
    const a = this.almacenes.find((x) => x.id_almacen === this.idAlmacen);
    if (!a) return '';
    return a.sucursal ? `${a.nombre} · ${a.sucursal}` : a.nombre;
  }

  /** Hidrata carrito/cliente desde Cotizaciones sin tocar el cobro. */
  private cargarCotizacionEnPos(id: number): void {
    this.cotizaciones.porId(id).pipe(takeUntil(this.destruir$)).subscribe({
      next: (cot) => {
        if (cot.estado === 'convertida') {
          this.alerta.toast({
            type: 'warning',
            title: 'Cotización ya convertida',
            message: cot.id_venta ? `Venta #${cot.id_venta}` : undefined,
          });
          this.refrescarVista();
          return;
        }
        if (cot.valida_hasta) {
          const fin = new Date(cot.valida_hasta + 'T23:59:59');
          if (fin.getTime() < Date.now()) {
            this.alerta.toast({
              type: 'warning',
              title: 'Cotización vencida',
              message: 'Se cargan precios de la cotización; revise stock actual.',
              timer: 4500,
            });
          }
        }

        this.idCotizacionCargada = cot.id_proforma;
        this.codigoCotizacionCargada = cot.codigo || `#${cot.id_proforma}`;
        this.idAlmacenCotizacion = cot.id_almacen ? Number(cot.id_almacen) : null;
        if (this.idAlmacenCotizacion) this.idAlmacen = this.idAlmacenCotizacion;
        this.lineas = (cot.items || []).map((i) => ({
          id_producto: i.id_producto,
          descripcion: i.descripcion || 'Producto',
          sku: i.sku || '',
          unidad_medida: 'NIU',
          cantidad: Number(i.cantidad),
          precio_unitario: Number(i.precio_unitario),
          descuento: 0,
          stock_disponible: this.puntoVenta.productoPorId(i.id_producto)?.stock_disponible ?? 0,
        }));
        this.observaciones = cot.observaciones || '';

        if (cot.id_cliente) {
          this.receptorService.porCliente(cot.id_cliente).pipe(
            takeUntil(this.destruir$),
            catchError(() => of(null)),
          ).subscribe((r) => {
            if (r) this.aplicarReceptor(r);
            else {
              this.receptor = {
                tipo_documento: 1,
                numero_documento: '',
                denominacion: cot.cliente_nombre || 'Cliente',
                id_cliente: cot.id_cliente!,
              } as Receptor;
              this.cargarLineaCredito();
            }
            this.pedirRecalculo();
            this.refrescarVista();
          });
        } else if (cot.id_empresa) {
          this.receptorService.porEmpresa(cot.id_empresa).pipe(
            takeUntil(this.destruir$),
            catchError(() => of(null)),
          ).subscribe((r) => {
            if (r) this.aplicarReceptor(r);
            this.pedirRecalculo();
            this.refrescarVista();
          });
        } else if (cot.cliente_nombre) {
          this.receptor = {
            tipo_documento: 1,
            numero_documento: '00000000',
            denominacion: cot.cliente_nombre,
            origen: 'generico',
          } as Receptor;
          this.pedirRecalculo();
        } else {
          this.pedirRecalculo();
        }

        this.cargarCatalogoParaCotizacion();
        this.alerta.toast({
          type: 'info',
          title: `Cotización ${this.codigoCotizacionCargada}`,
          message: 'Revise stock y cobre cuando esté listo.',
          timer: 3500,
        });
        this.refrescarVista();
      },
      error: (e) => {
        this.alerta.error(errorOperativo(e, 'No se pudo cargar la cotización'));
        this.refrescarVista();
      },
    });
  }

  /** Recarga el almacén de la cotización antes de validar stock en el POS. */
  private cargarCatalogoParaCotizacion(): void {
    if (!this.idAlmacen) {
      this.sincronizarStockCarritoDesdeCatalogo(true);
      return;
    }
    this.puntoVenta.cargarCatalogo(true, this.idAlmacen).pipe(
      takeUntil(this.destruir$),
      catchError(() => EMPTY),
    ).subscribe(() => {
      this.sincronizarStockCarritoDesdeCatalogo(true);
      this.pedirRecalculo();
      this.refrescarVista();
    });
  }

  /** Atajo: manda el carrito actual a Cotizaciones (sessionStorage). */
  irACotizarCarrito(): void {
    if (!this.lineas.length) {
      this.alerta.toast({ type: 'warning', title: 'Agregue productos antes de cotizar' });
      return;
    }
    try {
      sessionStorage.setItem(
        'pos_cotizacion_borrador',
        JSON.stringify({
          lineas: this.lineas,
          receptor: this.receptor,
          observaciones: this.observaciones,
          id_almacen: this.idAlmacen,
        }),
      );
    } catch { /* ignore */ }
    void this.router.navigate(['/dashboard/mantenimiento/cotizaciones'], {
      queryParams: { desdePos: 1 },
    });
  }

  private cargarChipCaja(): void {
    this.cajaSesion.sesion().pipe(takeUntil(this.destruir$), catchError(() => of(null))).subscribe((s) => {
      if (!s) {
        this.cajaChip = null;
        this.refrescarVista();
        return;
      }
      this.cajaChip = {
        abierta: !!s.abierta,
        modo: s.modo || 'blando',
        etiqueta: s.abierta
          ? `Caja: ${s.apertura?.caja_nombre || 'abierta'}`
          : 'Caja: sin apertura',
      };
      this.refrescarVista();
    });
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  /** Soft refresh del catálogo al volver a la pestaña (si TTL venció). */
  @HostListener('document:visibilitychange')
  onVisibilidad(): void {
    if (document.visibilityState !== 'visible') return;
    if (this.cambiandoAlmacen || this.emitiendo) return;
    if (!this.puntoVenta.catalogoExpirado) return;
    this.puntoVenta
      .cargarCatalogo(false, this.idAlmacen)
      .pipe(
        takeUntil(this.destruir$),
        catchError(() => EMPTY),
      )
      .subscribe((lista) => {
        if (lista) this.sincronizarStockCarritoDesdeCatalogo(false);
        this.refrescarVista();
      });
  }

  private cargarContextoPos(): void {
    this.cargandoContextoPos = true;
    this.refrescarVista();
    this.puntoVenta.contextoPos().pipe(
      takeUntil(this.destruir$),
      catchError(() => of({ almacenes: [] as AlmacenPos[], almacen_default: undefined } as ContextoPos)),
      finalize(() => {
        this.cargandoContextoPos = false;
        this.refrescarVista();
      }),
    ).subscribe((ctx) => {
      this.almacenes = ctx.almacenes ?? [];

      const guardado = Number(localStorage.getItem(LS_ALMACEN) || 0);
      const enLista = this.almacenes.some((a) => a.id_almacen === guardado);
       const almacenCotizacionEnLista = this.idAlmacenCotizacion
         && this.almacenes.some((a) => a.id_almacen === this.idAlmacenCotizacion);
       if (almacenCotizacionEnLista) {
         this.idAlmacen = this.idAlmacenCotizacion;
       } else if (enLista) {
        this.idAlmacen = guardado;
      } else if (ctx.almacen_default && this.almacenes.some((a) => a.id_almacen === ctx.almacen_default)) {
        this.idAlmacen = ctx.almacen_default;
      } else {
        this.idAlmacen = this.almacenes[0]?.id_almacen ?? null;
      }

      if (this.idAlmacen) {
        localStorage.setItem(LS_ALMACEN, String(this.idAlmacen));
      }

      this.restaurarSerie();
      this.refrescarVista();
      if (!this.idAlmacen) return;

      this.puntoVenta
        .cargarCatalogo(true, this.idAlmacen)
        .pipe(
          takeUntil(this.destruir$),
          catchError(() => {
            this.alerta.toast({
              type: 'warning',
              title: 'No se pudo cargar el stock del almacén',
              timer: 4000,
            });
            return EMPTY;
          }),
          tap(() => {
            this.sincronizarStockCarritoDesdeCatalogo(true);
            this.pedirRecalculo();
          }),
          finalize(() => this.refrescarVista()),
        )
        .subscribe();
    });
  }

  /**
   * Cambia el almacén del POS. El cobro no se toca: solo catálogo + stock del carrito.
   * Si la API falla, se revierte al almacén anterior.
   */
  cambiarAlmacen(id: number | string): void {
    const nuevo = Number(id);
    if (!Number.isFinite(nuevo) || nuevo <= 0 || nuevo === this.idAlmacen) return;
    if (this.emitiendo) return;
    this.cambiarAlmacen$.next(nuevo);
  }

  private escucharCambioAlmacen(): void {
    this.cambiarAlmacen$
      .pipe(
        switchMap((nuevo) => {
          const anterior = this.idAlmacen;
          // Comparar aquí (no distinctUntilChanged): tras un fallo se revierte
          // y el usuario debe poder reintentar el mismo almacén.
          if (nuevo === anterior) return EMPTY;

          const gen = ++this.generacionAlmacen;
          this.cambiandoAlmacen = true;
          this.idAlmacen = nuevo;
          localStorage.setItem(LS_ALMACEN, String(nuevo));
          this.sugerenciasProducto = [];
          this.textoProducto = '';
          this.indiceProducto = -1;
          this.aplicarSeriePorTipo();
          this.refrescarVista();

          const nombre =
            this.almacenes.find((a) => a.id_almacen === nuevo)?.nombre ?? `Almacén ${nuevo}`;

          this.puntoVenta.invalidarCatalogo();
          return this.puntoVenta.cargarCatalogo(true, nuevo).pipe(
            tap(() => {
              this.sincronizarStockCarritoDesdeCatalogo(true);
              this.alerta.toast({
                type: 'info',
                title: `Stock de ${nombre}`,
                timer: 2200,
              });
              this.refrescarVista();
            }),
            catchError(() => {
              this.idAlmacen = anterior;
              if (anterior) {
                localStorage.setItem(LS_ALMACEN, String(anterior));
              } else {
                localStorage.removeItem(LS_ALMACEN);
              }
              this.restaurarSerie();
              this.alerta.toast({
                type: 'error',
                title: 'No se pudo cambiar el almacén',
                message: 'Se mantiene el anterior. Reintente en un momento.',
                timer: 4500,
              });
              this.refrescarVista();
              // Rehidratar catálogo del almacén que quedó activo (sin romper el cobro).
              if (anterior) {
                this.puntoVenta
                  .cargarCatalogo(true, anterior)
                  .pipe(
                    takeUntil(this.destruir$),
                    catchError(() => EMPTY),
                    tap(() => this.sincronizarStockCarritoDesdeCatalogo(false)),
                    finalize(() => this.refrescarVista()),
                  )
                  .subscribe();
              }
              return EMPTY;
            }),
            finalize(() => {
              if (this.generacionAlmacen === gen) {
                this.cambiandoAlmacen = false;
              }
              this.refrescarVista();
            }),
          );
        }),
        takeUntil(this.destruir$),
      )
      .subscribe();
  }

  /**
   * Ajusta stock_disponible de cada línea con el catálogo del almacén activo.
   * No vacía el carrito; solo avisa si hay líneas sin stock o que exceden.
   */
  private sincronizarStockCarritoDesdeCatalogo(avisar: boolean): void {
    if (!this.lineas.length) return;

    let sinStockEnAlmacen = 0;
    let exceden = 0;

    for (const linea of this.lineas) {
      const producto = this.puntoVenta.productoPorId(linea.id_producto);
      if (!producto) {
        linea.stock_disponible = 0;
        sinStockEnAlmacen += 1;
        continue;
      }
      linea.stock_disponible = Number(producto.stock_disponible ?? 0);
      if (linea.cantidad > linea.stock_disponible) {
        exceden += 1;
      }
    }

    if (avisar && (sinStockEnAlmacen || exceden)) {
      const partes: string[] = [];
      if (sinStockEnAlmacen) {
        partes.push(`${sinStockEnAlmacen} sin stock aquí`);
      }
      if (exceden) {
        partes.push(`${exceden} exceden cantidad`);
      }
      this.alerta.toast({
        type: 'warning',
        title: `Carrito vs ${this.nombreAlmacenActivo || 'almacén'}`,
        message: partes.join(' · '),
        timer: 4500,
      });
    }

    this.pedirRecalculo();
  }

  /** Carga series desde config (Nubefact). No editables en el POS. */
  private cargarSeriesFiscales(): void {
    this.fiscalCfg
      .seriesPos()
      .pipe(takeUntil(this.destruir$), catchError(() => of(null)))
      .subscribe((s) => {
        if (s) {
          this.serieBoletaCfg = s.serie_boleta || 'BBB1';
          this.serieFacturaCfg = s.serie_factura || 'FFF1';
        }
        this.aplicarSeriePorTipo();
        this.refrescarVista();
      });
  }

  private aplicarSeriePorTipo(): void {
    this.serie =
      this.idTipo === TIPO_FACTURA ? this.serieFacturaCfg : this.serieBoletaCfg;
  }

  /** @deprecated localStorage ya no define la serie; se mantiene nombre por llamadas existentes. */
  private restaurarSerie(): void {
    this.aplicarSeriePorTipo();
  }

  // ── Búsqueda del cliente ─────────────────────────────────────

  private escucharBusquedaReceptor(): void {
    this.buscarReceptor$
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((termino) => {
          if (termino.trim().length < 2) return of([] as SugerenciaReceptor[]);
          // DNI/RUC completo lo resuelve documentoExacto$ (base o SUNAT).
          if (this.esDocumentoExacto(termino)) return of([] as SugerenciaReceptor[]);
          this.buscandoReceptor = true;
          return this.receptorService.sugerencias(termino).pipe(catchError(() => of([])));
        }),
        takeUntil(this.destruir$),
      )
      .subscribe((sugerencias) => {
        this.buscandoReceptor = false;
        this.sugerenciasReceptor = sugerencias;
        this.indiceReceptor = -1;
        this.intentarAutocompletarSugerencia(sugerencias);
        this.refrescarVista();
      });

    this.documentoExacto$
      .pipe(
        debounceTime(280),
        distinctUntilChanged(),
        switchMap((documento) => {
          this.buscandoReceptor = true;
          this.sugerenciasReceptor = [];
          this.refrescarVista();
          return this.receptorService.buscar(documento).pipe(
            catchError((error) => {
              this.buscandoReceptor = false;
              this.ultimoDocumentoAuto = '';
              this.refrescarVista();
              void this.alerta.error({
                title: 'No se encontró el documento',
                message: mensajeDeError(error, 'Verifique el número e intente de nuevo'),
              });
              return EMPTY;
            }),
          );
        }),
        takeUntil(this.destruir$),
      )
      .subscribe((receptor) => {
        this.buscandoReceptor = false;
        this.aplicarReceptor(receptor);
        this.refrescarVista();
      });
  }

  alEscribirReceptor(): void {
    const texto = this.textoReceptor.trim();
    if (this.esDocumentoExacto(texto)) {
      const documento = texto.replace(/\D/g, '');
      if (documento !== this.ultimoDocumentoAuto) {
        this.ultimoDocumentoAuto = documento;
        this.documentoExacto$.next(documento);
      }
      return;
    }

    this.ultimoDocumentoAuto = '';
    this.buscarReceptor$.next(this.textoReceptor);
  }

  private esDocumentoExacto(texto: string): boolean {
    const limpio = texto.trim();
    if (!/^\d+$/.test(limpio)) return false;
    return limpio.length === 8 || limpio.length === 11;
  }

  /** Si la base ya tiene un match claro, lo aplica solo (sin click). */
  private intentarAutocompletarSugerencia(sugerencias: SugerenciaReceptor[]): void {
    if (this.autoEligiendoReceptor || !sugerencias.length) return;

    const texto = this.textoReceptor.trim().toLowerCase();
    const digitos = this.textoReceptor.replace(/\D/g, '');

    const exactaPorDoc = sugerencias.find(
      (s) => (s.numero_documento || '').replace(/\D/g, '') === digitos
        && (digitos.length === 8 || digitos.length === 11),
    );
    if (exactaPorDoc) {
      this.autoEligiendoReceptor = true;
      this.elegirSugerenciaReceptor(exactaPorDoc);
      return;
    }

    if (sugerencias.length === 1 && texto.length >= 3) {
      const unica = sugerencias[0];
      const nombre = (unica.denominacion || '').toLowerCase();
      const doc = (unica.numero_documento || '').replace(/\D/g, '');
      if (nombre.includes(texto) || texto.includes(doc) || doc.startsWith(digitos)) {
        this.autoEligiendoReceptor = true;
        this.elegirSugerenciaReceptor(unica);
      }
    }
  }

  /** El documento completo se busca directo, sin esperar a las sugerencias. */
  get documentoCompleto(): boolean {
    return this.esDocumentoExacto(this.textoReceptor);
  }

  buscarDocumento(): void {
    const documento = this.textoReceptor.replace(/\D/g, '');
    if (!this.documentoCompleto) {
      this.alerta.toast({ type: 'warning', title: 'Ingrese un DNI de 8 dígitos o un RUC de 11' });
      return;
    }

    this.ultimoDocumentoAuto = documento;
    this.documentoExacto$.next(documento);
  }

  elegirSugerenciaReceptor(sugerencia: SugerenciaReceptor): void {
    this.sugerenciasReceptor = [];
    const consulta$ = sugerencia.tipo === 'empresa'
      ? this.receptorService.porEmpresa(sugerencia.id_empresa!)
      : this.receptorService.porCliente(sugerencia.id_cliente!);

    consulta$.pipe(takeUntil(this.destruir$)).subscribe({
      next: (receptor) => {
        this.autoEligiendoReceptor = false;
        this.aplicarReceptor(receptor);
        this.refrescarVista();
      },
      error: (error) => {
        this.autoEligiendoReceptor = false;
        this.refrescarVista();
        this.alerta.error({ message: mensajeDeError(error) });
      },
    });
  }

  usarConsumidorFinal(): void {
    this.receptorService
      .consumidorFinal()
      .pipe(takeUntil(this.destruir$))
      .subscribe((receptor) => {
        this.aplicarReceptor(receptor);
        this.refrescarVista();
      });
  }

  private aplicarReceptor(receptor: Receptor): void {
    this.receptor = receptor;
    this.cargarLineaCredito();
    this.textoReceptor = '';
    this.sugerenciasReceptor = [];
    this.ultimoDocumentoAuto = '';
    this.autoEligiendoReceptor = false;
    this.refrescarVista();

    // Con RUC lo natural es factura; con DNI, boleta.
    const tipoNuevo = receptor.tipo_documento === 6 ? TIPO_FACTURA : TIPO_BOLETA;
    if (tipoNuevo !== this.idTipo) {
      this.idTipo = tipoNuevo;
      this.aplicarSeriePorTipo();
    }

    if (receptor.advertencia) {
      this.alerta.toast({ type: 'warning', title: receptor.advertencia, timer: 5000 });
    }

    this.cargarLineaCredito();
    this.pedirRecalculo();
  }

  quitarReceptor(): void {
    this.receptor = null;
    this.lineaCredito = null;
    this.pedirRecalculo();
  }

  // ── Búsqueda de productos ────────────────────────────────────

  private escucharBusquedaProducto(): void {
    this.buscarProducto$
      .pipe(
        debounceTime(50),
        distinctUntilChanged(),
        takeUntil(this.destruir$),
      )
      .subscribe((termino) => {
        const texto = termino.trim();
        if (!texto) {
          this.buscandoProducto = false;
          this.sugerenciasProducto = [];
          this.indiceProducto = -1;
          this.refrescarVista();
          return;
        }

        if (this.puntoVenta.tieneCatalogo) {
          const locales = this.puntoVenta.filtrarLocal(texto);
          if (locales.length) {
            this.buscandoProducto = false;
            this.sugerenciasProducto = locales;
            this.indiceProducto = -1;
            this.busquedaFallida = null;
            this.refrescarVista();
            return;
          }
        }

        // Sin coincidencia local: se confirma contra la base de datos. Esto cubre
        // productos nuevos o catálogos en caché todavía desactualizados.
        const busquedaId = ++this.busquedaProductoId;
        this.buscandoProducto = true;
        this.busquedaFallida = null;
        this.refrescarVista();
        this.puntoVenta.buscarProductos(texto, 12, this.idAlmacen).pipe(
          catchError(() => of([] as ProductoVenta[])),
          takeUntil(this.destruir$),
        ).subscribe((productos) => {
          if (busquedaId !== this.busquedaProductoId) return;
          this.buscandoProducto = false;
          this.sugerenciasProducto = productos;
          this.indiceProducto = -1;
          if (!productos.length && this.textoProducto.trim() === texto) {
            this.marcarBusquedaFallida(texto);
          } else if (this.textoProducto.trim() === texto) {
            this.busquedaFallida = null;
          }
          this.refrescarVista();
        });
      });
  }

  alEscribirProducto(): void {
    const texto = this.textoProducto.trim();
    if (!texto) {
      this.busquedaFallida = null;
      this.sugerenciasProducto = [];
      this.indiceProducto = -1;
      this.refrescarVista();
      return;
    }
    this.busquedaFallida = null;
    this.buscarProducto$.next(this.textoProducto);
  }

  /**
   * Si el usuario enfoca el buscador con texto ya cargado, se activa la búsqueda
   * de inmediato para que la sugerencia aparezca sin depender de Enter o click.
   */
  alEnfocarProducto(): void {
    const texto = this.textoProducto.trim();
    if (!texto) return;
    this.busquedaFallida = null;
    this.buscarProducto$.next(texto);
  }

  /**
   * Enter del lector USB (escribe código + Enter) o del teclado.
   * Prioridad: sugerencia resaltada → código/SKU exacto → 1 sugerencia por nombre.
   * No salta a emitir: solo agrega al carrito.
   */
  alPresionarEnProducto(evento: KeyboardEvent): void {
    if (evento.key === 'F2') {
      // Alta rápida: solo si el rol puede crear productos; para caja la tecla no hace nada.
      if (this.puedeCrearRapido) {
        evento.preventDefault();
        this.abrirAltaRapida();
      }
      return;
    }
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      this.indiceProducto = Math.min(this.indiceProducto + 1, this.sugerenciasProducto.length - 1);
      return;
    }
    if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      this.indiceProducto = Math.max(this.indiceProducto - 1, 0);
      return;
    }
    if (evento.key === 'Escape') {
      this.sugerenciasProducto = [];
      this.busquedaFallida = null;
      return;
    }
    if (evento.key !== 'Enter') return;

    evento.preventDefault();
    if (this.escaneandoCodigo) return;

    if (this.indiceProducto >= 0 && this.sugerenciasProducto[this.indiceProducto]) {
      this.agregarProducto(this.sugerenciasProducto[this.indiceProducto]);
      return;
    }

    const codigo = this.textoProducto.trim();
    if (!codigo) return;

    // Lector USB / SKU: lookup exacto. Nombres ("acero") van por búsqueda, no por barcode.
    if (this.pareceCodigoExacto(codigo)) {
      this.consultarCodigoExacto(codigo);
      return;
    }

    this.resolverBusquedaPorNombre(codigo);
  }

  /** Códigos de barras / SKU: numéricos o alfanuméricos con dígito, sin espacios. */
  private pareceCodigoExacto(texto: string): boolean {
    const t = texto.trim();
    if (!t || /\s/.test(t)) return false;
    if (/^\d{4,}$/.test(t)) return true;
    return /^[A-Za-z0-9][A-Za-z0-9\-_.]*$/.test(t) && /\d/.test(t);
  }

  private consultarCodigoExacto(codigo: string): void {
    const local = this.puntoVenta.porCodigoLocal(codigo);
    if (local) {
      this.agregarProducto(local);
      this.alerta.toast({ type: 'success', title: local.nombre, timer: 1200 });
      return;
    }

    this.escaneandoCodigo = true;
    this.buscandoProducto = true;
    this.refrescarVista();
    this.puntoVenta.porCodigoBarras(codigo, this.idAlmacen).subscribe({
      next: (producto) => {
        this.escaneandoCodigo = false;
        this.buscandoProducto = false;
        this.agregarProducto(producto);
        this.alerta.toast({ type: 'success', title: producto.nombre, timer: 1200 });
        this.refrescarVista();
      },
      error: (error) => {
        this.escaneandoCodigo = false;
        this.buscandoProducto = false;
        this.refrescarVista();
        if (this.sugerenciasProducto.length === 1) {
          this.agregarProducto(this.sugerenciasProducto[0]);
          return;
        }
        if (this.sugerenciasProducto.length > 1) {
          this.alerta.toast({ type: 'warning', title: 'Elija el producto de la lista' });
          return;
        }
        this.alerta.toast({ type: 'warning', title: `No hay producto con el código ${codigo}` });
        // Solo un 404 prueba que el código no existe; con un corte de red no se ofrece crearlo.
        if (error?.status === 404) this.marcarBusquedaFallida(codigo);
        this.enfocarBuscadorProducto();
      },
    });
  }

  private resolverBusquedaPorNombre(termino: string): void {
    const lista = this.puntoVenta.tieneCatalogo
      ? this.puntoVenta.filtrarLocal(termino)
      : this.sugerenciasProducto;

    if (lista.length === 1) {
      this.agregarProducto(lista[0]);
      return;
    }
    if (lista.length > 1) {
      this.sugerenciasProducto = lista;
      this.indiceProducto = 0;
      this.alerta.toast({ type: 'warning', title: 'Elija el producto de la lista' });
      return;
    }

    // Sin coincidencia local: confirmar siempre contra el servidor, incluso si
    // la caché ya cargó, porque puede estar desactualizada.
    const busquedaId = ++this.busquedaProductoId;
    this.buscandoProducto = true;
    this.refrescarVista();
    this.puntoVenta.buscarProductos(termino, 12, this.idAlmacen).pipe(catchError(() => of([] as ProductoVenta[]))).subscribe({
      next: (productos) => {
        if (busquedaId !== this.busquedaProductoId) return;
        this.buscandoProducto = false;
        this.sugerenciasProducto = productos;
        this.indiceProducto = -1;
        this.refrescarVista();
        if (productos.length === 1) {
          this.agregarProducto(productos[0]);
          return;
        }
        if (productos.length > 1) {
          this.indiceProducto = 0;
          this.alerta.toast({ type: 'warning', title: 'Elija el producto de la lista' });
          return;
        }
        this.alerta.toast({ type: 'warning', title: `No se encontró "${termino}"` });
        this.marcarBusquedaFallida(termino);
        this.enfocarBuscadorProducto();
      },
    });
  }

  alPresionarEnReceptor(evento: KeyboardEvent): void {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      this.indiceReceptor = Math.min(this.indiceReceptor + 1, this.sugerenciasReceptor.length - 1);
      return;
    }
    if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      this.indiceReceptor = Math.max(this.indiceReceptor - 1, 0);
      return;
    }
    if (evento.key !== 'Enter') return;

    evento.preventDefault();

    if (this.indiceReceptor >= 0 && this.sugerenciasReceptor[this.indiceReceptor]) {
      this.elegirSugerenciaReceptor(this.sugerenciasReceptor[this.indiceReceptor]);
    } else if (this.documentoCompleto) {
      this.buscarDocumento();
    }
  }

  agregarProducto(producto: ProductoVenta): void {
    if (this.emitiendo) return;
    this.busquedaFallida = null;
    this.textoProducto = '';
    this.sugerenciasProducto = [];
    this.indiceProducto = -1;

    const existente = this.lineas.find((l) => l.id_producto === producto.id_producto);

    if (existente) {
      existente.cantidad += 1;
      this.avisarSiExcedeStock(existente);
    } else {
      this.lineas = [
        ...this.lineas,
        {
          id_producto: producto.id_producto,
          descripcion: producto.nombre,
          sku: producto.sku,
          unidad_medida: producto.unidad_medida,
          cantidad: 1,
          precio_unitario: producto.precio_venta,
          stock_disponible: producto.stock_disponible,
        },
      ];
    }

    this.pedirRecalculo();
    this.enfocarBuscadorProducto();
  }

  private enfocarBuscadorProducto(): void {
    queueMicrotask(() => this.inputProducto?.nativeElement?.focus());
  }

  cambiarCantidad(linea: LineaVenta, valor: number | string): void {
    if (this.emitiendo) return;
    const cantidad = Number(valor);
    linea.cantidad = Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1;
    this.avisarSiExcedeStock(linea);
    this.pedirRecalculo();
  }

  sumarCantidad(linea: LineaVenta, delta: number): void {
    this.cambiarCantidad(linea, linea.cantidad + delta);
  }

  cambiarPrecio(linea: LineaVenta, valor: number | string): void {
    if (this.emitiendo) return;
    const precio = Number(valor);
    linea.precio_unitario = Number.isFinite(precio) && precio >= 0 ? precio : 0;
    this.pedirRecalculo();
  }

  quitarLinea(linea: LineaVenta): void {
    if (this.emitiendo) return;
    this.lineas = this.lineas.filter((l) => l !== linea);
    this.pedirRecalculo();
  }

  vaciarCarrito(): void {
    if (!this.lineas.length) return;

    this.alerta
      .confirm({ title: '¿Vaciar el carrito?', message: 'Se quitarán todos los productos.' })
      .then((resultado) => {
        if (!resultado.isConfirmed) return;
        this.lineas = [];
        this.pedirRecalculo();
        this.refrescarVista();
      });
  }

  private avisarSiExcedeStock(linea: LineaVenta): void {
    if (linea.cantidad > linea.stock_disponible) {
      this.alerta.toast({
        type: 'warning',
        title: `Solo hay ${linea.stock_disponible} unidades de ${linea.descripcion}`,
        timer: 3500,
      });
    }
  }

  // ── Vista previa ─────────────────────────────────────────────

  private escucharRecalculo(): void {
    this.recalcular$
      .pipe(
        debounceTime(220),
        switchMap(() => {
          if (!this.lineas.length) {
            this.preview = null;
            this.errorPreview = '';
            this.refrescarVista();
            return of(null);
          }

          this.calculandoPreview = true;
          this.refrescarVista();
          return this.puntoVenta.preview(this.armarSolicitud(false)).pipe(
            catchError((error) => {
              this.errorPreview = mensajeDeError(error, 'No se pudo calcular el comprobante');
              this.refrescarVista();
              return of(null);
            }),
          );
        }),
        takeUntil(this.destruir$),
      )
      .subscribe((preview) => {
        this.calculandoPreview = false;
        if (preview) {
          this.preview = preview;
          this.errorPreview = '';
        }
        this.refrescarVista();
      });
  }

  private pedirRecalculo(): void {
    this.recalcular$.next();
    this.refrescarVista();
  }

  /** Expuesto al template para cuando se completa el nombre a mano. */
  pedirRecalculoPublico(): void {
    this.pedirRecalculo();
  }

  cambiarTipo(idTipo: number): void {
    this.idTipo = Number(idTipo);
    this.aplicarSeriePorTipo();
    this.pedirRecalculo();
  }

  /** Total aproximado mientras llega la respuesta del servidor. */
  get totalLocal(): number {
    return this.redondear(this.brutoCarrito());
  }

  private redondear(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
  }

  private brutoLinea(linea: LineaVenta): number {
    return Math.max(0, Number(linea.cantidad || 0) * Number(linea.precio_unitario || 0));
  }

  private brutoCarrito(): number {
    return this.lineas.reduce((suma, linea) => suma + this.brutoLinea(linea), 0);
  }


  get total(): number {
    return this.preview?.totales.total ?? this.totalLocal;
  }

  get vuelto(): number {
    const efectivo = this.lineasPago.find((l) => this.esEfectivo(l.id_metodo));
    const recibido = efectivo?.monto_recibido;
    const monto = Number(efectivo?.monto ?? 0);
    if (recibido === null || recibido === undefined) return 0;
    return Math.max(0, Math.round((Number(recibido) - monto + Number.EPSILON) * 100) / 100);
  }

  get sumaPagos(): number {
    return Math.round(
      (this.lineasPago.reduce((s, l) => s + (Number(l.monto) || 0), 0) + Number.EPSILON) * 100,
    ) / 100;
  }

  get restantePago(): number {
    return Math.max(0, Math.round((this.total - this.sumaPagos + Number.EPSILON) * 100) / 100);
  }

  get pagoCubierto(): boolean {
    return Math.abs(this.sumaPagos - this.total) <= 0.05;
  }

  get puedeEmitir(): boolean {
    if (!this.lineas.length || this.emitiendo) return false;
    if (this.idTipo === TIPO_FACTURA && this.receptor?.tipo_documento !== 6) return false;
    if (
      this.receptor
      && this.receptor.numero_documento !== '00000000'
      && !this.receptor.denominacion?.trim()
    ) {
      return false;
    }
    if (!this.metodosPago.length || !this.pagoCubierto) return false;
    if (this.lineasPago.some((linea) => Number(linea.monto) > 0 && !linea.id_metodo)) return false;
    return true;
  }

  get avisoFactura(): string {
    if (this.idTipo !== TIPO_FACTURA) return '';
    if (!this.receptor) return 'Para emitir una factura debe indicar el RUC del cliente.';
    if (this.receptor.tipo_documento !== 6) {
      return 'Este cliente tiene DNI. Con DNI corresponde una boleta, no una factura.';
    }
    return '';
  }

  // ── Emisión ──────────────────────────────────────────────────

  private armarSolicitud(paraRegistrar: boolean): SolicitudVenta {
    const solicitud: SolicitudVenta = {
      id_tipo: this.idTipo,
      serie: this.serie.trim() || undefined,
      emitir_comprobante: this.emitirComprobante,
      enviar_cliente: this.enviarPorCorreo,
      observaciones: this.observaciones.trim() || undefined,
      items: this.lineas.map((l, indice) => ({
        id_producto: l.id_producto,
        cantidad: l.cantidad,
      })),
    };

    if (this.idAlmacen) solicitud.id_almacen = this.idAlmacen;
    if (paraRegistrar && this.idCotizacionCargada) {
      solicitud.id_proforma = this.idCotizacionCargada;
    }

    if (this.receptor?.numero_documento && this.receptor.numero_documento !== '00000000') {
      solicitud.documento = this.receptor.numero_documento;
    }

    if (this.receptor?.id_empresa) solicitud.id_empresa = this.receptor.id_empresa;
    else if (this.receptor?.id_cliente) solicitud.id_cliente = this.receptor.id_cliente;

    if (this.receptor?.denominacion?.trim()) {
      solicitud.cliente_denominacion = this.receptor.denominacion.trim();
    }
    if (this.receptor?.direccion?.trim()) {
      solicitud.cliente_direccion = this.receptor.direccion.trim();
    }

    if (paraRegistrar) {
      solicitud.clave_idempotencia = this.claveIdempotencia;
      const pagos = this.lineasPago
        .filter((l) => l.id_metodo && Number(l.monto) > 0)
        .map((l) => ({
          id_metodo: Number(l.id_metodo),
          monto: Number(l.monto),
          referencia: l.referencia?.trim() || l.voucher_pos?.trim() || undefined,
          monto_recibido: this.esEfectivo(l.id_metodo) && l.monto_recibido != null
            ? Number(l.monto_recibido)
            : undefined,
          vuelto: this.esEfectivo(l.id_metodo) ? this.vueltoDe(l) : undefined,
          id_cuenta_bancaria: this.esTransferencia(l.id_metodo) && l.id_cuenta_bancaria
            ? Number(l.id_cuenta_bancaria)
            : undefined,
          voucher_pos: this.esTarjeta(l.id_metodo) ? (l.voucher_pos || l.referencia || undefined) : undefined,
          validacion: l.validacion || undefined,
          referencia_externa: l.referencia_externa || undefined,
        }));
      if (pagos.length) solicitud.pagos = pagos;
    }

    return solicitud;
  }

  tipoMetodo(idMetodo: number | null): string {
    return (this.metodosPago.find((x) => x.id_metodo === idMetodo)?.tipo || '').toLowerCase();
  }

  nombreMetodo(idMetodo: number | null): string {
    return (this.metodosPago.find((x) => x.id_metodo === idMetodo)?.nombre || '').toLowerCase();
  }

  esEfectivo(idMetodo: number | null): boolean {
    return this.tipoMetodo(idMetodo) === 'efectivo' || this.nombreMetodo(idMetodo) === 'efectivo';
  }

  esCredito(idMetodo: number | null): boolean {
    const n = this.nombreMetodo(idMetodo);
    return this.tipoMetodo(idMetodo) === 'credito' || n === 'crédito' || n === 'credito';
  }

  esTransferencia(idMetodo: number | null): boolean {
    return this.tipoMetodo(idMetodo) === 'transferencia' || this.nombreMetodo(idMetodo).includes('transfer');
  }

  esYape(idMetodo: number | null): boolean {
    return this.nombreMetodo(idMetodo).includes('yape');
  }

  esPlin(idMetodo: number | null): boolean {
    return this.nombreMetodo(idMetodo).includes('plin');
  }

  esTarjeta(idMetodo: number | null): boolean {
    return this.tipoMetodo(idMetodo) === 'tarjeta' || this.nombreMetodo(idMetodo).includes('tarjeta');
  }

  vueltoDe(linea: { monto: number | null; monto_recibido: number | null }): number {
    if (linea.monto_recibido == null) return 0;
    return Math.max(0, Math.round((Number(linea.monto_recibido) - Number(linea.monto || 0) + Number.EPSILON) * 100) / 100);
  }

  agregarLineaPago(): void {
    this.lineasPago = [
      ...this.lineasPago,
      {
        ...this.lineaPagoVacia(),
        id_metodo: this.metodosPago[0]?.id_metodo ?? null,
        monto: this.restantePago || null,
      },
    ];
  }

  quitarLineaPago(indice: number): void {
    if (this.lineasPago.length <= 1) return;
    this.lineasPago = this.lineasPago.filter((_, i) => i !== indice);
  }

  completarConRestante(indice: number): void {
    const otros = this.lineasPago.reduce(
      (s, l, i) => (i === indice ? s : s + (Number(l.monto) || 0)),
      0,
    );
    const resto = Math.max(0, Math.round((this.total - otros + Number.EPSILON) * 100) / 100);
    this.lineasPago[indice].monto = resto;
  }

  iniciarYape(indice: number): void {
    const linea = this.lineasPago[indice];
    const monto = Number(linea.monto) || this.restantePago || this.total;
    if (!(monto > 0)) {
      this.alerta.toast({ type: 'warning', title: 'Indica el monto Yape primero' });
      return;
    }
    linea.monto = monto;
    this.yapeCargando = true;
    this.refrescarVista();
    this.puntoVenta.iniciarYape({
      monto,
      email: this.receptor?.email || undefined,
    }).pipe(takeUntil(this.destruir$)).subscribe({
      next: (resp) => {
        this.yapeCargando = false;
        if (resp?.modo === 'manual' || !resp?.order_id) {
          this.alerta.toast({
            type: 'info',
            title: resp?.mensaje || 'Usa N° de operación manual',
            timer: 4500,
          });
          linea.validacion = 'manual';
          this.refrescarVista();
          return;
        }
        linea.yape_orden_id = resp.order_id;
        linea.referencia_externa = resp.order_id;
        linea.yape_estado = 'pendiente';
        linea.validacion = '';
        this.alerta.toast({ type: 'success', title: 'Orden Yape creada. Pide el pago y verifica.' });
        this.refrescarVista();
      },
      error: (e) => {
        this.yapeCargando = false;
        this.refrescarVista();
        this.alerta.toast({ type: 'error', title: mensajeDeError(e, 'No se pudo iniciar Yape') });
      },
    });
  }

  verificarYape(indice: number): void {
    const linea = this.lineasPago[indice];
    if (!linea.yape_orden_id) return;
    this.yapeCargando = true;
    this.refrescarVista();
    this.puntoVenta.verificarYape(linea.yape_orden_id).pipe(takeUntil(this.destruir$)).subscribe({
      next: (resp) => {
        this.yapeCargando = false;
        if (resp?.pagado) {
          linea.validacion = 'culqi';
          linea.referencia_externa = resp.order_id || linea.yape_orden_id;
          linea.referencia = linea.referencia || linea.referencia_externa;
          linea.yape_estado = 'pagado';
          this.alerta.toast({ type: 'success', title: 'Yape confirmado' });
        } else {
          linea.yape_estado = 'pendiente';
          this.alerta.toast({ type: 'warning', title: resp?.mensaje || 'Aún pendiente' });
        }
        this.refrescarVista();
      },
      error: (e) => {
        this.yapeCargando = false;
        this.refrescarVista();
        this.alerta.toast({ type: 'error', title: mensajeDeError(e) });
      },
    });
  }

  cargarLineaCredito(): void {
    this.lineaCredito = null;
    this.refrescarVista();
    const idCliente = this.receptor?.id_cliente;
    const idEmpresa = this.receptor?.id_empresa;
    if (!idCliente && !idEmpresa) return;

    this.puntoVenta.lineaCredito({ id_cliente: idCliente, id_empresa: idEmpresa })
      .pipe(takeUntil(this.destruir$), catchError(() => of(null)))
      .subscribe((linea) => {
        this.lineaCredito = linea;
        this.refrescarVista();
      });
  }

  cobrar(): void {
    if (!this.puedeEmitir) return;

    if (this.errorPreview) {
      void this.alerta.error({
        title: 'Comprobante inválido',
        message: this.errorPreview,
      });
      return;
    }

    // Una sola línea sin monto → asume el total (flujo rápido).
    if (this.lineasPago.length === 1 && !Number(this.lineasPago[0].monto)) {
      this.lineasPago[0].monto = this.total;
    }

    if (!this.pagoCubierto) {
      this.alerta.toast({ type: 'warning', title: 'Los pagos deben cubrir el total' });
      return;
    }

    const bloqueoCredito = this.validarCreditoAntesDeCobrar();
    if (bloqueoCredito) {
      void this.alerta.error({
        title: 'No se puede cobrar a crédito',
        message: bloqueoCredito,
      });
      return;
    }

    const resumen = `
      <div style="text-align:left;font-size:14px">
        <div><strong>${escapeHtmlAlerta(this.preview?.tipo_nombre ?? 'Comprobante')}</strong> ${escapeHtmlAlerta(this.preview?.numero_formateado ?? '')}</div>
        <div>Cliente: ${escapeHtmlAlerta(this.receptor?.denominacion ?? 'CLIENTES VARIOS')}</div>
        <div>IGV (${this.preview?.porcentaje_igv ?? 18}%): S/ ${(this.preview?.totales.igv ?? 0).toFixed(2)}</div>
        <div style="margin-top:6px;font-size:18px"><strong>Total: S/ ${this.total.toFixed(2)}</strong></div>
      </div>`;

    this.alerta
      .confirm({ title: '¿Confirmar la venta?', message: resumen, confirmText: 'Sí, cobrar', allowHtml: true })
      .then((resultado) => {
        if (resultado.isConfirmed) this.registrar();
      });
  }

  /** Misma reglas que el backend, para avisar antes del POST /venta. */
  private validarCreditoAntesDeCobrar(): string | null {
    const montoCredito = this.lineasPago.reduce((suma, pago) => {
      if (!this.esCredito(pago.id_metodo)) return suma;
      return suma + (Number(pago.monto) || 0);
    }, 0);
    if (montoCredito <= 0) return null;

    if (!this.receptor?.id_cliente && !this.receptor?.id_empresa) {
      return 'El crédito solo aplica a clientes o empresas registradas. Busque DNI/RUC antes de cobrar.';
    }
    if (!this.lineaCredito?.credito_activo) {
      return 'Este cliente/empresa no tiene crédito activo. Actívelo en Cuentas por cobrar (límite y días).';
    }
    const disponible = Number(this.lineaCredito.disponible) || 0;
    if (montoCredito > disponible + 0.05) {
      return `Crédito insuficiente. Disponible S/ ${disponible.toFixed(2)} (límite ${Number(this.lineaCredito.limite_credito).toFixed(2)}, deuda ${Number(this.lineaCredito.saldo_pendiente).toFixed(2)}).`;
    }
    return null;
  }

  private registrar(): void {
    this.emitiendo = true;
    this.refrescarVista();
    const lineasRegistradas = this.lineas.map((linea) => ({
      id_producto: linea.id_producto,
      cantidad: linea.cantidad,
    }));
    const solicitud = this.armarSolicitud(true);

    this.puntoVenta
      .registrar(solicitud)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (venta) => {
          this.emitiendo = false;
          this.ultimaVenta = venta;

          if (venta.comprobante_error) {
            // La venta quedó registrada; solo falló el envío a NUBEFACT.
            this.alerta.warning({
              title: 'Venta registrada, comprobante pendiente',
              allowHtml: true,
              message: `${escapeHtmlAlerta(venta.comprobante_error)}<br><br>Puede reintentar el envío desde la pantalla de Documentos.`,
            });
          } else {
            this.alerta.toast({
              type: 'success',
              title: `${venta.comprobante?.numero_formateado ?? 'Venta'} emitida`,
              timer: 3500,
            });
          }

          this.puntoVenta.descontarStockLocal(
            lineasRegistradas,
          );
          this.puntoVenta
            .cargarCatalogo(true, this.idAlmacen)
            .pipe(
              takeUntil(this.destruir$),
              catchError(() => EMPTY),
              finalize(() => this.refrescarVista()),
            )
            .subscribe();
          this.limpiarParaSiguienteVenta();
          this.refrescarVista();
        },
        error: (error) => {
          this.emitiendo = false;
          this.refrescarVista();
          const op = errorOperativo(error, 'No se pudo registrar la venta');
          this.alerta.error({
            title: op.title,
            message: op.message,
            allowHtml: op.allowHtml,
          });
        },
      });
  }

  /**
   * Deja la pantalla lista para la siguiente venta sin que el cajero tenga que
   * borrar nada a mano. El comprobante recién emitido se mantiene a la vista.
   */
  private limpiarParaSiguienteVenta(): void {
    this.lineas = [];
    this.preview = null;
    this.errorPreview = '';
    this.receptor = null;
    this.textoReceptor = '';
    this.textoProducto = '';
    this.observaciones = '';
    this.idCotizacionCargada = null;
    this.codigoCotizacionCargada = '';
    this.idAlmacenCotizacion = null;
    this.montoRecibido = null;
    this.lineasPago = [{
      ...this.lineaPagoVacia(),
      id_metodo: this.metodosPago[0]?.id_metodo ?? null,
    }];
    this.lineaCredito = null;
    this.idTipo = TIPO_BOLETA;
    this.aplicarSeriePorTipo();
    this.claveIdempotencia = this.puntoVenta.nuevaClaveIdempotencia();

    this.refrescarVista();
    setTimeout(() => document.getElementById('adm-buscar-producto')?.focus(), 60);
  }

  cerrarUltimaVenta(): void {
    this.ultimaVenta = null;
    this.refrescarVista();
  }

  abrirComprobante(): void {
    const enlace = this.ultimaVenta?.comprobante?.enlace_pdf ?? this.ultimaVenta?.comprobante?.enlace;
    if (enlace) window.open(enlace, '_blank', 'noopener');
  }

  private cargarMetodosPago(): void {
    this.puntoVenta
      .metodosPago()
      .pipe(takeUntil(this.destruir$), catchError(() => of([])))
      .subscribe((metodos) => {
        this.metodosPago = metodos as any;
        if (metodos.length && !this.lineasPago[0]?.id_metodo) {
          this.lineasPago[0].id_metodo = metodos[0].id_metodo;
        }
        this.refrescarVista();
      });

    this.puntoVenta.cuentasBancarias(false)
      .pipe(takeUntil(this.destruir$), catchError(() => of([])))
      .subscribe((cuentas) => {
        this.cuentasBancarias = cuentas || [];
        this.refrescarVista();
      });

    this.puntoVenta.pasarelaCaja()
      .pipe(takeUntil(this.destruir$), catchError(() => of(null)))
      .subscribe((info) => {
        this.pasarelaInfo = info;
        this.refrescarVista();
      });
  }

  // ── Alta rápida de producto ──────────────────────────────────

  /** Admin/vendedor con un almacén activo. Para caja no existe ningún disparador ni botón. */
  get puedeCrearRapido(): boolean {
    return this.editaCatalogo && this.idAlmacen != null;
  }

  /**
   * La tarjeta «Sin resultados» solo sale tras un intento fallido explícito (Enter o
   * lector, los mismos puntos del toast «No se encontró…»). En vivo parpadearía en
   * cada tecla mientras se escribe «perno 1/2».
   */
  get mostrarBotonAltaProductoEnBusqueda(): boolean {
    const texto = this.textoProducto.trim();
    return !!texto
      && this.puedeCrearRapido
      && !this.panelAltaRapida
      && !this.emitiendo
      && !this.buscandoProducto
      && !this.cambiandoAlmacen
      && !this.cargandoContextoPos
      && !this.sugerenciasProducto.length;
  }

  get mostrarTarjetaSinResultados(): boolean {
    const texto = this.textoProducto.trim();
    const fallida = this.busquedaFallida;
    const tieneBusquedaActiva = !!texto && !this.sugerenciasProducto.length;
    return !!fallida
      && this.puedeCrearRapido
      && !this.panelAltaRapida
      && !this.emitiendo
      && !this.buscandoProducto
      && !this.cambiandoAlmacen
      && !this.cargandoContextoPos
      && tieneBusquedaActiva
      && texto === fallida.texto;
  }

  sinStock(producto: ProductoVenta): boolean {
    return Number(producto.stock_disponible ?? 0) <= 0;
  }

  private marcarBusquedaFallida(texto: string): void {
    this.busquedaFallida = { texto, esCodigo: this.pareceCodigoExacto(texto) };
    this.refrescarVista();
  }

  /** Abre el alta rápida con lo que haya en el buscador (botón de la tarjeta o F2). */
  abrirAltaRapida(): void {
    if (!this.puedeCrearRapido || this.panelAltaRapida) return;
    // Mientras hay una consulta en curso, su respuesta volvería a enfocar el buscador y le robaría el foco al panel.
    if (this.emitiendo || this.cambiandoAlmacen || this.buscandoProducto || this.escaneandoCodigo) return;

    // Se captura ANTES de nada: agregarProducto() limpia el texto del buscador.
    const texto = this.textoProducto.trim();
    const esCodigo = !!texto && this.pareceCodigoExacto(texto);
    this.modoAltaRapida = 'crear';
    this.productoIngresoAlta = null;
    this.textoInicialAlta = esCodigo ? '' : texto;
    this.codigoInicialAlta = esCodigo ? texto : '';
    this.busquedaFallida = null;
    this.panelAltaRapida = true;
    this.refrescarVista();
  }

  /** «+ Stock» de una sugerencia sin existencias: ingresa unidades a un producto que ya existe. */
  abrirIngresoStock(producto: ProductoVenta, evento: Event): void {
    evento.stopPropagation(); // no debe agregar la fila al carrito
    if (!this.puedeCrearRapido || this.panelAltaRapida) return;
    if (this.emitiendo || this.cambiandoAlmacen) return;

    this.modoAltaRapida = 'ingresar';
    this.productoIngresoAlta = producto;
    this.textoInicialAlta = '';
    this.codigoInicialAlta = '';
    this.busquedaFallida = null;
    this.panelAltaRapida = true;
    this.refrescarVista();
  }

  /** El panel se cerró sin agregar nada: el foco vuelve al buscador con el texto intacto. */
  alCerrarAltaRapida(): void {
    this.panelAltaRapida = false;
    this.refrescarVista();
    this.enfocarBuscadorProducto();
  }

  /** El producto ya tiene stock en el almacén: se pone en el carrito con lo que se lleva el cliente. */
  alAgregarDesdeAltaRapida(resultado: ResultadoAltaRapida): void {
    const { producto, cantidadCarrito, creado } = resultado;
    this.panelAltaRapida = false;

    // La caché local ya conoce el producto; esto solo la pone al día con el servidor (no es crítico).
    this.puntoVenta
      .cargarCatalogo(true, this.idAlmacen)
      .pipe(
        takeUntil(this.destruir$),
        catchError(() => EMPTY),
        finalize(() => this.refrescarVista()),
      )
      .subscribe();

    // agregarProducto() sale si hay un cobro en curso: no se pierde lo hecho, solo se avisa.
    if (this.emitiendo) {
      const unidades = Number(producto.stock_disponible ?? 0);
      this.alerta.toast({
        type: 'info',
        title: `«${escapeHtmlAlerta(producto.nombre)}» listo`,
        message: `El producto quedó ${creado ? 'creado ' : ''}con ${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}; `
          + 'agréguelo cuando termine el cobro',
        timer: 6000,
      });
      this.enfocarBuscadorProducto();
      this.refrescarVista();
      return;
    }

    const existente = this.lineas.find((l) => l.id_producto === producto.id_producto);
    if (existente) {
      // La línea ya estaba con el stock de antes: se pone al día antes de fijar la cantidad.
      existente.stock_disponible = Number(producto.stock_disponible ?? 0);
      this.textoProducto = '';
      this.sugerenciasProducto = [];
      this.indiceProducto = -1;
      this.busquedaFallida = null;
    } else {
      this.agregarProducto(producto);
    }

    const linea = this.lineas.find((l) => l.id_producto === producto.id_producto);
    if (linea) {
      // Misma lógica de cantidad del carrito; la línea queda con lo que se lleva el cliente.
      if (linea.cantidad !== cantidadCarrito) this.cambiarCantidad(linea, cantidadCarrito);
      this.destacarLinea(linea.id_producto);
    }
    this.pedirRecalculo();
    this.enfocarBuscadorProducto();
    this.refrescarVista();
  }

  private destacarLinea(idProducto: number): void {
    this.idLineaDestacada = idProducto;
    this.refrescarVista();
    timer(2600)
      .pipe(takeUntil(this.destruir$))
      .subscribe(() => {
        if (this.idLineaDestacada === idProducto) this.idLineaDestacada = null;
        this.refrescarVista();
      });
  }

  identificarLinea(_indice: number, linea: LineaVenta): number {
    return linea.id_producto;
  }

  identificarProductoSugerido(_i: number, p: ProductoVenta): number {
    return p.id_producto;
  }

  identificarReceptorSugerido(_i: number, r: SugerenciaReceptor): string {
    return String(r.id_cliente ?? r.id_empresa ?? r.numero_documento ?? _i);
  }

  identificarPago(_i: number): number {
    return _i;
  }

  urlDe(ruta?: string | null): string {
    return urlMedia(ruta);
  }
}
