import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, of, switchMap, takeUntil, catchError } from 'rxjs';

import { AlertService } from '../../../../shared/services/alert.service';
import { urlMedia } from '../../../../shared/utils/media-url.util';
import { ReceptorService } from '../../../service/receptor.service';
import { PuntoVentaService, SolicitudVenta } from '../../../service/punto-venta.service';
import { mensajeDeError } from '../../../service/api-base.service';
import {
  LineaVenta, PreviewComprobante, ProductoVenta, Receptor, SugerenciaReceptor,
  VentaRegistrada, TIPO_BOLETA, TIPO_FACTURA,
} from '../../../models/admin.models';

/**
 * Punto de venta de mostrador.
 *
 * La vista previa del comprobante la calcula el backend, no esta pantalla. Así
 * lo que ve el cajero es exactamente lo que se va a emitir, sin dos fórmulas de
 * IGV que puedan discrepar.
 */
@Component({
  selector: 'app-ventas',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './ventas.component.html',
  styleUrls: ['./ventas.component.css'],
})
export class VentasComponent implements OnInit, OnDestroy {

  @ViewChild('inputProducto') private inputProducto?: ElementRef<HTMLInputElement>;

  readonly TIPO_FACTURA = TIPO_FACTURA;
  readonly TIPO_BOLETA = TIPO_BOLETA;

  /** Evita doble Enter del lector mientras llega la respuesta exacta. */
  private escaneandoCodigo = false;

  idTipo: number = TIPO_BOLETA;
  serie = '';
  observaciones = '';
  enviarPorCorreo = false;
  emitirComprobante = true;

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
  private readonly buscarProducto$ = new Subject<string>();
  private readonly recalcular$ = new Subject<void>();
  private readonly destruir$ = new Subject<void>();

  constructor(
    private readonly receptorService: ReceptorService,
    private readonly puntoVenta: PuntoVentaService,
    private readonly alerta: AlertService,
  ) {}

  ngOnInit(): void {
    this.claveIdempotencia = this.puntoVenta.nuevaClaveIdempotencia();
    this.escucharBusquedaReceptor();
    this.escucharBusquedaProducto();
    this.escucharRecalculo();
    this.cargarMetodosPago();
    // Prefetch real del API → filtro local al instante (sin cambiar la UI).
    this.puntoVenta.cargarCatalogo().pipe(takeUntil(this.destruir$)).subscribe();
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  // ── Búsqueda del cliente ─────────────────────────────────────

  private escucharBusquedaReceptor(): void {
    this.buscarReceptor$
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((termino) => {
          if (termino.trim().length < 2) return of([] as SugerenciaReceptor[]);
          this.buscandoReceptor = true;
          return this.receptorService.sugerencias(termino).pipe(catchError(() => of([])));
        }),
        takeUntil(this.destruir$),
      )
      .subscribe((sugerencias) => {
        this.buscandoReceptor = false;
        this.sugerenciasReceptor = sugerencias;
        this.indiceReceptor = -1;
      });
  }

  alEscribirReceptor(): void {
    this.buscarReceptor$.next(this.textoReceptor);
  }

  /** El documento completo se busca directo, sin esperar a las sugerencias. */
  get documentoCompleto(): boolean {
    const digitos = this.textoReceptor.replace(/\D/g, '');
    return digitos.length === 8 || digitos.length === 11;
  }

  buscarDocumento(): void {
    const documento = this.textoReceptor.replace(/\D/g, '');
    if (!this.documentoCompleto) {
      this.alerta.toast({ type: 'warning', title: 'Ingrese un DNI de 8 dígitos o un RUC de 11' });
      return;
    }

    this.buscandoReceptor = true;
    this.sugerenciasReceptor = [];

    this.receptorService
      .buscar(documento)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (receptor) => {
          this.buscandoReceptor = false;
          this.aplicarReceptor(receptor);
        },
        error: (error) => {
          this.buscandoReceptor = false;
          this.alerta.error({
            title: 'No se encontró el documento',
            message: mensajeDeError(error, 'Verifique el número e intente de nuevo'),
          });
        },
      });
  }

  elegirSugerenciaReceptor(sugerencia: SugerenciaReceptor): void {
    this.sugerenciasReceptor = [];
    const consulta$ = sugerencia.tipo === 'empresa'
      ? this.receptorService.porEmpresa(sugerencia.id_empresa!)
      : this.receptorService.porCliente(sugerencia.id_cliente!);

    consulta$.pipe(takeUntil(this.destruir$)).subscribe({
      next: (receptor) => this.aplicarReceptor(receptor),
      error: (error) => this.alerta.error({ message: mensajeDeError(error) }),
    });
  }

  usarConsumidorFinal(): void {
    this.receptorService
      .consumidorFinal()
      .pipe(takeUntil(this.destruir$))
      .subscribe((receptor) => this.aplicarReceptor(receptor));
  }

  private aplicarReceptor(receptor: Receptor): void {
    this.receptor = receptor;
    this.cargarLineaCredito();
    this.textoReceptor = '';
    this.sugerenciasReceptor = [];

    // Con RUC lo natural es factura; con DNI, boleta.
    this.idTipo = receptor.tipo_documento === 6 ? TIPO_FACTURA : TIPO_BOLETA;

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
          return;
        }

        if (this.puntoVenta.tieneCatalogo) {
          this.buscandoProducto = false;
          this.sugerenciasProducto = this.puntoVenta.filtrarLocal(texto);
          this.indiceProducto = -1;
          return;
        }

        // Catálogo aún no listo: mismo API de siempre como respaldo.
        this.buscandoProducto = true;
        this.puntoVenta.buscarProductos(texto).pipe(
          catchError(() => of([] as ProductoVenta[])),
          takeUntil(this.destruir$),
        ).subscribe((productos) => {
          this.buscandoProducto = false;
          this.sugerenciasProducto = productos;
          this.indiceProducto = -1;
        });
      });
  }

  alEscribirProducto(): void {
    this.buscarProducto$.next(this.textoProducto);
  }

  /**
   * Enter del lector USB (escribe código + Enter) o del teclado.
   * Prioridad: sugerencia resaltada → código/SKU exacto → 1 sugerencia por nombre.
   * No salta a emitir: solo agrega al carrito.
   */
  alPresionarEnProducto(evento: KeyboardEvent): void {
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
    this.puntoVenta.porCodigoBarras(codigo).subscribe({
      next: (producto) => {
        this.escaneandoCodigo = false;
        this.buscandoProducto = false;
        this.agregarProducto(producto);
        this.alerta.toast({ type: 'success', title: producto.nombre, timer: 1200 });
      },
      error: () => {
        this.escaneandoCodigo = false;
        this.buscandoProducto = false;
        if (this.sugerenciasProducto.length === 1) {
          this.agregarProducto(this.sugerenciasProducto[0]);
          return;
        }
        if (this.sugerenciasProducto.length > 1) {
          this.alerta.toast({ type: 'warning', title: 'Elija el producto de la lista' });
          return;
        }
        this.alerta.toast({ type: 'warning', title: `No hay producto con el código ${codigo}` });
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

    if (this.puntoVenta.tieneCatalogo) {
      this.sugerenciasProducto = [];
      this.alerta.toast({ type: 'warning', title: `No se encontró "${termino}"` });
      this.enfocarBuscadorProducto();
      return;
    }

    // Sin cache aún: buscar en API (mismo comportamiento de respaldo).
    this.buscandoProducto = true;
    this.puntoVenta.buscarProductos(termino).pipe(catchError(() => of([] as ProductoVenta[]))).subscribe({
      next: (productos) => {
        this.buscandoProducto = false;
        this.sugerenciasProducto = productos;
        this.indiceProducto = -1;
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
          precio_unitario: producto.precio_final,
          descuento: 0,
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
    const cantidad = Number(valor);
    linea.cantidad = Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1;
    this.avisarSiExcedeStock(linea);
    this.pedirRecalculo();
  }

  sumarCantidad(linea: LineaVenta, delta: number): void {
    this.cambiarCantidad(linea, linea.cantidad + delta);
  }

  cambiarPrecio(linea: LineaVenta, valor: number | string): void {
    const precio = Number(valor);
    linea.precio_unitario = Number.isFinite(precio) && precio >= 0 ? precio : 0;
    this.pedirRecalculo();
  }

  cambiarDescuento(linea: LineaVenta, valor: number | string): void {
    const descuento = Number(valor);
    linea.descuento = Number.isFinite(descuento) && descuento >= 0 ? descuento : 0;
    this.pedirRecalculo();
  }

  quitarLinea(linea: LineaVenta): void {
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
            return of(null);
          }

          this.calculandoPreview = true;
          return this.puntoVenta.preview(this.armarSolicitud(false)).pipe(
            catchError((error) => {
              this.errorPreview = mensajeDeError(error, 'No se pudo calcular el comprobante');
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
      });
  }

  private pedirRecalculo(): void {
    this.recalcular$.next();
  }

  /** Expuesto al template para cuando se completa el nombre a mano. */
  pedirRecalculoPublico(): void {
    this.pedirRecalculo();
  }

  cambiarTipo(idTipo: number): void {
    this.idTipo = Number(idTipo);
    this.pedirRecalculo();
  }

  /** Total aproximado mientras llega la respuesta del servidor. */
  get totalLocal(): number {
    const bruto = this.lineas.reduce(
      (suma, l) => suma + l.cantidad * l.precio_unitario - (l.descuento ?? 0),
      0,
    );
    return Math.round((bruto + Number.EPSILON) * 100) / 100;
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
    if (this.metodosPago.length && !this.pagoCubierto) return false;
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
      items: this.lineas.map((l) => ({
        id_producto: l.id_producto,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        descuento: l.descuento || undefined,
      })),
    };

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
          return;
        }
        linea.yape_orden_id = resp.order_id;
        linea.referencia_externa = resp.order_id;
        linea.yape_estado = 'pendiente';
        linea.validacion = '';
        this.alerta.toast({ type: 'success', title: 'Orden Yape creada. Pide el pago y verifica.' });
      },
      error: (e) => {
        this.yapeCargando = false;
        this.alerta.toast({ type: 'error', title: mensajeDeError(e, 'No se pudo iniciar Yape') });
      },
    });
  }

  verificarYape(indice: number): void {
    const linea = this.lineasPago[indice];
    if (!linea.yape_orden_id) return;
    this.yapeCargando = true;
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
      },
      error: (e) => {
        this.yapeCargando = false;
        this.alerta.toast({ type: 'error', title: mensajeDeError(e) });
      },
    });
  }

  cargarLineaCredito(): void {
    this.lineaCredito = null;
    const idCliente = this.receptor?.id_cliente;
    const idEmpresa = this.receptor?.id_empresa;
    if (!idCliente && !idEmpresa) return;

    this.puntoVenta.lineaCredito({ id_cliente: idCliente, id_empresa: idEmpresa })
      .pipe(takeUntil(this.destruir$), catchError(() => of(null)))
      .subscribe((linea) => {
        this.lineaCredito = linea;
      });
  }

  cobrar(): void {
    if (!this.puedeEmitir) return;

    // Una sola línea sin monto → asume el total (flujo rápido).
    if (this.lineasPago.length === 1 && !Number(this.lineasPago[0].monto)) {
      this.lineasPago[0].monto = this.total;
    }

    if (!this.pagoCubierto) {
      this.alerta.toast({ type: 'warning', title: 'Los pagos deben cubrir el total' });
      return;
    }

    const resumen = `
      <div style="text-align:left;font-size:14px">
        <div><strong>${this.preview?.tipo_nombre ?? 'Comprobante'}</strong> ${this.preview?.numero_formateado ?? ''}</div>
        <div>Cliente: ${this.receptor?.denominacion ?? 'CLIENTES VARIOS'}</div>
        <div>IGV (${this.preview?.porcentaje_igv ?? 18}%): S/ ${(this.preview?.totales.igv ?? 0).toFixed(2)}</div>
        <div style="margin-top:6px;font-size:18px"><strong>Total: S/ ${this.total.toFixed(2)}</strong></div>
      </div>`;

    this.alerta
      .confirm({ title: '¿Confirmar la venta?', message: resumen, confirmText: 'Sí, cobrar' })
      .then((resultado) => {
        if (resultado.isConfirmed) this.registrar();
      });
  }

  private registrar(): void {
    this.emitiendo = true;

    this.puntoVenta
      .registrar(this.armarSolicitud(true))
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (venta) => {
          this.emitiendo = false;
          this.ultimaVenta = venta;

          if (venta.comprobante_error) {
            // La venta quedó registrada; solo falló el envío a NUBEFACT.
            this.alerta.warning({
              title: 'Venta registrada, comprobante pendiente',
              message: `${venta.comprobante_error}<br><br>Puede reintentar el envío desde la pantalla de Documentos.`,
            });
          } else {
            this.alerta.toast({
              type: 'success',
              title: `${venta.comprobante?.numero_formateado ?? 'Venta'} emitida`,
              timer: 3500,
            });
          }

          this.puntoVenta.descontarStockLocal(
            this.lineas.map((l) => ({ id_producto: l.id_producto, cantidad: l.cantidad })),
          );
          this.limpiarParaSiguienteVenta();
        },
        error: (error) => {
          this.emitiendo = false;
          this.alerta.error({
            title: 'No se pudo registrar la venta',
            message: mensajeDeError(error),
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
    this.montoRecibido = null;
    this.lineasPago = [{
      ...this.lineaPagoVacia(),
      id_metodo: this.metodosPago[0]?.id_metodo ?? null,
    }];
    this.lineaCredito = null;
    this.idTipo = TIPO_BOLETA;
    this.claveIdempotencia = this.puntoVenta.nuevaClaveIdempotencia();

    setTimeout(() => document.getElementById('adm-buscar-producto')?.focus(), 60);
  }

  cerrarUltimaVenta(): void {
    this.ultimaVenta = null;
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
      });

    this.puntoVenta.cuentasBancarias(false)
      .pipe(takeUntil(this.destruir$), catchError(() => of([])))
      .subscribe((cuentas) => (this.cuentasBancarias = cuentas || []));

    this.puntoVenta.pasarelaCaja()
      .pipe(takeUntil(this.destruir$), catchError(() => of(null)))
      .subscribe((info) => (this.pasarelaInfo = info));
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
