import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, of, switchMap, takeUntil, catchError } from 'rxjs';

import { AlertService } from '../../../../shared/services/alert.service';
import { telefonoValidoPe, urlWhatsappCliente } from '../../../../shared/utils/whatsapp.util';
import { errorOperativo, mensajeDeError } from '../../../service/api-base.service';
import { Cotizacion, CotizacionService } from '../../../service/cotizacion.service';
import { AlmacenPos, PuntoVentaService } from '../../../service/punto-venta.service';
import { ReceptorService } from '../../../service/receptor.service';
import { ProductoVenta, Receptor, SugerenciaReceptor } from '../../../models/admin.models';

type LineaCot = {
  id_producto: number;
  descripcion: string;
  sku: string;
  cantidad: number;
  precio_unitario: number;
  stock_disponible: number;
};

@Component({
  selector: 'app-cotizaciones',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './cotizaciones.component.html',
  styleUrl: './cotizaciones.component.css',
})
export class CotizacionesComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destruir$ = new Subject<void>();
  private readonly buscarProd$ = new Subject<string>();
  private readonly buscarCli$ = new Subject<string>();
  private readonly documentoExacto$ = new Subject<string>();

  lista: Cotizacion[] = [];
  cargandoLista = false;
  guardando = false;
  enviandoWa = false;

  modo: 'lista' | 'nueva' = 'lista';
  filtro = '';

  lineas: LineaCot[] = [];
  textoProducto = '';
  sugerenciasProd: ProductoVenta[] = [];
  buscandoProd = false;
  cargandoProductos = false;
  errorProductos = '';
  almacenes: AlmacenPos[] = [];
  buscarTodasLasSedes = true;

  textoCliente = '';
  sugerenciasCli: SugerenciaReceptor[] = [];
  buscandoCliente = false;
  receptor: Receptor | null = null;
  clienteNombreManual = '';
  telefono = '';
  observaciones = '';
  diasVigencia = 7;
  idAlmacen: number | null = null;
  porcentajeIgv = 18;

  cotizacionActual: Cotizacion | null = null;

  private escaneandoCodigo = false;
  private ultimoDocumentoAuto = '';

  constructor(
    private readonly api: CotizacionService,
    private readonly pv: PuntoVentaService,
    private readonly receptorSvc: ReceptorService,
    private readonly alerta: AlertService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.escucharBusquedas();
    this.cargarLista();
    this.cargarContexto();
    if (this.route.snapshot.queryParamMap.get('desdePos') === '1') {
      this.cargarBorradorDesdePos();
    }
  }

  /** Atajo desde Ventas: sessionStorage pos_cotizacion_borrador. */
  private cargarBorradorDesdePos(): void {
    try {
      const raw = sessionStorage.getItem('pos_cotizacion_borrador');
      if (!raw) return;
      sessionStorage.removeItem('pos_cotizacion_borrador');
      const data = JSON.parse(raw);
      this.nueva();
      this.lineas = Array.isArray(data.lineas)
        ? data.lineas.map((l: any) => ({
            id_producto: l.id_producto,
            descripcion: l.descripcion,
            sku: l.sku || '',
            cantidad: Number(l.cantidad) || 1,
            precio_unitario: Number(l.precio_unitario) || 0,
            stock_disponible: Number(l.stock_disponible) || 0,
          }))
        : [];
      this.receptor = data.receptor || null;
      this.clienteNombreManual = data.receptor?.denominacion || '';
      this.telefono = data.receptor?.telefono || '';
      this.observaciones = data.observaciones || '';
      if (data.id_almacen) this.idAlmacen = Number(data.id_almacen);
      this.alerta.toast({ type: 'info', title: 'Carrito del POS listo para cotizar' });
      this.refrescar();
    } catch { /* ignore */ }
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  get total(): number {
    return Math.round(
      (this.lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0) + Number.EPSILON) * 100,
    ) / 100;
  }

  get gravada(): number {
    return Math.round((this.total / (1 + this.porcentajeIgv / 100) + Number.EPSILON) * 100) / 100;
  }

  get igv(): number {
    return Math.round((this.total - this.gravada + Number.EPSILON) * 100) / 100;
  }

  get telefonoOk(): boolean {
    return telefonoValidoPe(this.telefono);
  }

  get fechaVigenciaPreview(): string {
    if (this.cotizacionActual?.valida_hasta) return this.formatearFecha(this.cotizacionActual.valida_hasta);
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + Math.max(1, Number(this.diasVigencia) || 7));
    return this.formatearFecha(fecha.toISOString().slice(0, 10));
  }

  get cotizacionVencida(): boolean {
    return !!this.cotizacionActual?.valida_hasta && this.fechaYaPaso(this.cotizacionActual.valida_hasta);
  }

  private fechaYaPaso(fecha: string): boolean {
    return new Date(`${fecha}T23:59:59`).getTime() < Date.now();
  }

  private formatearFecha(fecha: string): string {
    const partes = String(fecha).slice(0, 10).split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : fecha;
  }

  get listaFiltrada(): Cotizacion[] {
    const t = this.filtro.trim().toLowerCase();
    if (!t) return this.lista;
    return this.lista.filter((c) =>
      `${c.codigo} ${c.cliente_nombre} ${c.estado} ${c.total}`.toLowerCase().includes(t),
    );
  }

  private refrescar(): void {
    this.cdr.markForCheck();
  }

  private cargarContexto(): void {
    this.pv.contextoPos().pipe(
      takeUntil(this.destruir$),
      catchError(() => of({ almacenes: [] as AlmacenPos[], almacen_default: undefined })),
    ).subscribe((ctx) => {
      this.almacenes = Array.isArray(ctx.almacenes) ? ctx.almacenes : [];
      const guardado = Number(localStorage.getItem('pos_id_almacen') || 0);
      const existeGuardado = this.almacenes.some((a) => a.id_almacen === guardado);
      this.idAlmacen = existeGuardado
        ? guardado
        : ctx.almacen_default || this.almacenes[0]?.id_almacen || null;
      this.cargarCatalogoCotizacion();
      this.refrescar();
    });
  }

  private cargarCatalogoCotizacion(): void {
    this.cargandoProductos = true;
    this.errorProductos = '';
    this.refrescar();
    this.pv.cargarCatalogo(true, this.buscarTodasLasSedes ? null : this.idAlmacen).pipe(
      takeUntil(this.destruir$),
    ).subscribe({
      next: () => {
        this.cargandoProductos = false;
        this.refrescar();
      },
      error: (error) => {
        this.cargandoProductos = false;
        this.errorProductos = mensajeDeError(error, 'No se pudo cargar el catálogo de productos');
        this.refrescar();
      },
    });
  }

  cambiarAlmacen(valor: number | string): void {
    const id = Number(valor);
    if (!Number.isFinite(id) || id <= 0) return;
    this.idAlmacen = id;
    localStorage.setItem('pos_id_almacen', String(id));
    this.buscarTodasLasSedes = false;
    this.sugerenciasProd = [];
    this.cargarCatalogoCotizacion();
  }

  cambiarAlcanceStock(valor: boolean): void {
    this.buscarTodasLasSedes = !!valor;
    this.sugerenciasProd = [];
    this.cargarCatalogoCotizacion();
  }

  get nombreAlmacenDespacho(): string {
    const almacen = this.almacenes.find((a) => a.id_almacen === this.idAlmacen);
    return almacen ? `${almacen.nombre}${almacen.sucursal ? ` · ${almacen.sucursal}` : ''}` : 'Sin almacén';
  }

  private productosConStock(productos: ProductoVenta[]): ProductoVenta[] {
    return productos.filter((producto) => Number(producto.stock_disponible ?? 0) > 0).slice(0, 12);
  }

  cargarLista(): void {
    this.cargandoLista = true;
    this.refrescar();
    this.api.listar().pipe(takeUntil(this.destruir$)).subscribe({
      next: (lista) => {
        this.lista = Array.isArray(lista) ? [...lista] : [];
        this.cargandoLista = false;
        this.refrescar();
      },
      error: (e) => {
        this.cargandoLista = false;
        this.refrescar();
        this.alerta.error(errorOperativo(e, 'No se pudieron cargar las cotizaciones'));
      },
    });
  }

  nueva(): void {
    this.modo = 'nueva';
    this.cotizacionActual = null;
    this.lineas = [];
    this.receptor = null;
    this.clienteNombreManual = '';
    this.telefono = '';
    this.observaciones = '';
    this.porcentajeIgv = 18;
    this.textoProducto = '';
    this.textoCliente = '';
    this.sugerenciasProd = [];
    this.sugerenciasCli = [];
    this.ultimoDocumentoAuto = '';
    this.refrescar();
  }

  volverLista(): void {
    this.modo = 'lista';
    this.cotizacionActual = null;
    this.cargarLista();
  }

  private escucharBusquedas(): void {
    this.buscarProd$
      .pipe(
        debounceTime(80),
        distinctUntilChanged(),
        takeUntil(this.destruir$),
      )
      .subscribe((termino) => {
        const t = termino.trim();
        if (!t) {
          this.sugerenciasProd = [];
          this.buscandoProd = false;
          this.refrescar();
          return;
        }
        if (this.pv.tieneCatalogo) {
          this.sugerenciasProd = this.productosConStock(this.pv.filtrarLocal(t));
          this.buscandoProd = false;
          this.refrescar();
          return;
        }
        this.buscandoProd = true;
        this.refrescar();
        this.pv.buscarProductos(t, 12, this.buscarTodasLasSedes ? null : this.idAlmacen).pipe(
          catchError((error) => {
            this.errorProductos = mensajeDeError(error, 'No se pudo buscar el producto');
            return of([] as ProductoVenta[]);
          }),
        ).subscribe((lista) => {
          this.sugerenciasProd = this.productosConStock(lista);
          this.buscandoProd = false;
          this.refrescar();
        });
      });

    this.buscarCli$
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((termino) => {
          if (termino.trim().length < 2) return of([] as SugerenciaReceptor[]);
          if (this.esDocumentoExacto(termino)) return of([] as SugerenciaReceptor[]);
          return this.receptorSvc.sugerencias(termino).pipe(catchError(() => of([])));
        }),
        takeUntil(this.destruir$),
      )
      .subscribe((lista) => {
        this.sugerenciasCli = lista;
        this.refrescar();
      });

    this.documentoExacto$
      .pipe(
        debounceTime(280),
        distinctUntilChanged(),
        switchMap((documento) => {
          this.buscandoCliente = true;
          this.sugerenciasCli = [];
          this.refrescar();
          return this.receptorSvc.buscar(documento).pipe(
            catchError((error) => {
              this.buscandoCliente = false;
              this.ultimoDocumentoAuto = '';
              this.alerta.error({
                title: 'No se encontró el documento',
                message: mensajeDeError(error, 'Verifique el DNI o RUC e intente nuevamente'),
              });
              this.refrescar();
              return of(null as Receptor | null);
            }),
          );
        }),
        takeUntil(this.destruir$),
      )
      .subscribe((receptor) => {
        this.buscandoCliente = false;
        if (receptor) this.aplicarCliente(receptor);
        this.refrescar();
      });
  }

  alEscribirProducto(): void {
    this.buscarProd$.next(this.textoProducto);
  }

  alEscribirCliente(): void {
    this.clienteNombreManual = this.textoCliente;
    if (this.esDocumentoExacto(this.textoCliente)) {
      const documento = this.textoCliente.replace(/\D/g, '');
      if (documento !== this.ultimoDocumentoAuto) {
        this.ultimoDocumentoAuto = documento;
        this.documentoExacto$.next(documento);
      }
      return;
    }
    this.ultimoDocumentoAuto = '';
    this.buscarCli$.next(this.textoCliente);
  }

  private esDocumentoExacto(texto: string): boolean {
    const limpio = texto.trim();
    return /^\d+$/.test(limpio) && (limpio.length === 8 || limpio.length === 11);
  }

  private aplicarCliente(receptor: Receptor): void {
    this.receptor = receptor;
    this.clienteNombreManual = receptor.denominacion || '';
    this.textoCliente = '';
    this.telefono = (receptor.telefono || this.telefono || '').trim();
    this.sugerenciasCli = [];
    this.ultimoDocumentoAuto = '';
    this.refrescar();
  }

  agregarProducto(p: ProductoVenta): void {
    const existente = this.lineas.find((l) => l.id_producto === p.id_producto);
    if (existente) {
      existente.cantidad += 1;
    } else {
      this.lineas = [
        ...this.lineas,
        {
          id_producto: p.id_producto,
          descripcion: p.nombre,
          sku: p.sku || '',
          cantidad: 1,
          precio_unitario: Number(p.precio_final) || 0,
          stock_disponible: Number(p.stock_disponible) || 0,
        },
      ];
    }
    this.textoProducto = '';
    this.sugerenciasProd = [];
    this.refrescar();
  }

  /** Permite usar lectores HID en la cotización igual que en el POS. */
  alPresionarEnProducto(evento: KeyboardEvent): void {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    if (this.escaneandoCodigo) return;

    const codigo = this.textoProducto.trim();
    if (!codigo) return;

    const local = this.pv.porCodigoLocal(codigo);
    if (local) {
      this.agregarProducto(local);
      this.alerta.toast({ type: 'success', title: local.nombre, timer: 1200 });
      return;
    }

    if (!this.pareceCodigoExacto(codigo)) {
      if (this.sugerenciasProd.length === 1) this.agregarProducto(this.sugerenciasProd[0]);
      return;
    }

    this.escaneandoCodigo = true;
    this.buscandoProd = true;
    this.refrescar();
    this.pv.porCodigoBarras(codigo, this.buscarTodasLasSedes ? null : this.idAlmacen).pipe(
      takeUntil(this.destruir$),
      catchError(() => of(null as ProductoVenta | null)),
    ).subscribe((producto) => {
      this.escaneandoCodigo = false;
      this.buscandoProd = false;
      if (producto) {
        this.agregarProducto(producto);
        this.alerta.toast({ type: 'success', title: producto.nombre, timer: 1200 });
      } else if (this.sugerenciasProd.length === 1) {
        this.agregarProducto(this.sugerenciasProd[0]);
      } else {
        this.alerta.toast({ type: 'warning', title: `No hay producto con el código ${codigo}` });
      }
      this.refrescar();
    });
  }

  private pareceCodigoExacto(texto: string): boolean {
    const t = texto.trim();
    if (!t || /\s/.test(t)) return false;
    if (/^\d{4,}$/.test(t)) return true;
    return /^[A-Za-z0-9][A-Za-z0-9\-_.]*$/.test(t) && /\d/.test(t);
  }

  cambiarCantidad(linea: LineaCot, v: number | string): void {
    const n = Number(v);
    linea.cantidad = Number.isFinite(n) && n > 0 ? n : 1;
    this.refrescar();
  }

  quitarLinea(linea: LineaCot): void {
    this.lineas = this.lineas.filter((l) => l !== linea);
    this.refrescar();
  }

  elegirCliente(s: SugerenciaReceptor): void {
    this.sugerenciasCli = [];
    const consulta$ = s.tipo === 'empresa'
      ? this.receptorSvc.porEmpresa(s.id_empresa!)
      : this.receptorSvc.porCliente(s.id_cliente!);

    consulta$.pipe(takeUntil(this.destruir$)).subscribe({
      next: (r) => {
        this.aplicarCliente(r);
        this.refrescar();
      },
      error: (e) => this.alerta.error(errorOperativo(e)),
    });
  }

  quitarCliente(): void {
    this.receptor = null;
    this.textoCliente = '';
    this.clienteNombreManual = '';
    this.ultimoDocumentoAuto = '';
    this.refrescar();
  }

  guardar(): void {
    if (this.cotizacionActual?.id_proforma) {
      this.alerta.toast({ type: 'info', title: 'La cotización ya está guardada. Cree una nueva para duplicarla.' });
      return;
    }
    if (!this.lineas.length) {
      this.alerta.toast({ type: 'warning', title: 'Agregue al menos un producto' });
      return;
    }
    const nombre = (this.receptor?.denominacion || this.clienteNombreManual || '').trim();
    if (!this.receptor?.id_cliente && !this.receptor?.id_empresa && !nombre) {
      this.alerta.toast({ type: 'warning', title: 'Indique cliente o un nombre' });
      return;
    }

    this.guardando = true;
    this.refrescar();

    this.api.crear({
      id_cliente: this.receptor?.id_cliente,
      id_empresa: this.receptor?.id_empresa,
      cliente_nombre: nombre,
      telefono_envio: this.telefono,
      id_almacen: this.idAlmacen ?? undefined,
      observaciones: this.observaciones,
      dias_vigencia: this.diasVigencia,
      items: this.lineas.map((l) => ({
        id_producto: l.id_producto,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        descripcion: l.descripcion,
        sku: l.sku,
      })),
    }).pipe(takeUntil(this.destruir$)).subscribe({
      next: (cot) => {
        this.guardando = false;
        this.cotizacionActual = cot;
        this.porcentajeIgv = Number(cot.porcentaje_igv) || 18;
        this.alerta.toast({ type: 'success', title: `${cot.codigo || 'Cotización'} guardada` });
        this.refrescar();
      },
      error: (e) => {
        this.guardando = false;
        this.refrescar();
        this.alerta.error(errorOperativo(e, 'No se pudo guardar la cotización'));
      },
    });
  }

  abrirCotizacion(c: Cotizacion): void {
    this.api.porId(c.id_proforma).pipe(takeUntil(this.destruir$)).subscribe({
      next: (cot) => {
        this.cotizacionActual = cot;
        this.porcentajeIgv = Number(cot.porcentaje_igv) || 18;
        this.modo = 'nueva';
        this.lineas = (cot.items || []).map((i) => ({
          id_producto: i.id_producto,
          descripcion: i.descripcion || 'Producto',
          sku: i.sku || '',
          cantidad: Number(i.cantidad),
          precio_unitario: Number(i.precio_unitario),
          stock_disponible: 0,
        }));
        this.clienteNombreManual = cot.cliente_nombre || '';
        this.telefono = cot.telefono_envio || '';
        this.observaciones = cot.observaciones || '';
        this.receptor = cot.id_cliente || cot.id_empresa
          ? {
              tipo_documento: cot.id_empresa ? 6 : 1,
              numero_documento: '',
              denominacion: cot.cliente_nombre || '',
              id_cliente: cot.id_cliente ?? undefined,
              id_empresa: cot.id_empresa ?? undefined,
            } as Receptor
          : null;
        this.refrescar();
      },
      error: (e) => this.alerta.error(errorOperativo(e)),
    });
  }

  aprobar(): void {
    const id = this.cotizacionActual?.id_proforma;
    if (!id || this.cotizacionActual?.estado === 'convertida' || this.cotizacionActual?.estado === 'anulada') return;
    if (!this.idAlmacen) {
      this.alerta.toast({ type: 'warning', title: 'Seleccione el almacén de despacho' });
      return;
    }
    if (this.cotizacionVencida) {
      this.alerta.toast({ type: 'warning', title: 'La cotización está vencida. Cree una nueva con vigencia actual.' });
      return;
    }

    this.alerta.confirm({
      title: '¿Aprobar esta cotización?',
      message: 'La aprobación no descuenta stock. El inventario se actualizará recién al registrar la venta.',
      confirmText: 'Aprobar',
    }).then((resultado) => {
      if (!resultado.isConfirmed) return;
      this.api.marcar(id, { estado: 'aprobada' }).pipe(takeUntil(this.destruir$)).subscribe({
        next: (cot) => {
          this.cotizacionActual = cot;
          this.alerta.toast({ type: 'success', title: 'Cotización aprobada' });
          this.cargarLista();
          this.refrescar();
        },
        error: (e) => this.alerta.error(errorOperativo(e, 'No se pudo aprobar la cotización')),
      });
    });
  }

  anular(cotizacion = this.cotizacionActual): void {
    const id = cotizacion?.id_proforma;
    if (!id || cotizacion?.estado === 'convertida' || cotizacion?.estado === 'anulada') return;

    this.alerta.confirm({
      title: '¿Anular esta cotización?',
      message: 'Se conservará en el historial como anulada y no afectará el stock.',
      confirmText: 'Sí, anular',
      cancelText: 'Cancelar',
    }).then((resultado) => {
      if (!resultado.isConfirmed) return;
      this.api.marcar(id, { estado: 'anulada' }).pipe(takeUntil(this.destruir$)).subscribe({
        next: (actualizada) => {
          this.cotizacionActual = actualizada;
          this.alerta.toast({ type: 'success', title: 'Cotización anulada' });
          this.cargarLista();
          this.refrescar();
        },
        error: (e) => this.alerta.error(errorOperativo(e, 'No se pudo anular la cotización')),
      });
    });
  }

  exportarExcel(): void {
    if (!this.lineas.length) {
      this.alerta.toast({ type: 'warning', title: 'Sin ítems para exportar' });
      return;
    }
    const codigo = this.cotizacionActual?.codigo || 'COT-borrador';
    const filas = [
      ['Cotización', codigo],
      ['Cliente', this.receptor?.denominacion || this.clienteNombreManual || ''],
      ['Teléfono', this.telefono],
      ['Válida hasta', this.cotizacionActual?.valida_hasta || ''],
      [],
      ['SKU', 'Descripción', 'Cantidad', 'P.Unit', 'Subtotal'],
      ...this.lineas.map((l) => [
        l.sku,
        l.descripcion,
        String(l.cantidad),
        l.precio_unitario.toFixed(2),
        (l.cantidad * l.precio_unitario).toFixed(2),
      ]),
      [],
      ['Subtotal sin IGV', this.gravada.toFixed(2)],
      [`IGV ${this.porcentajeIgv}%`, this.igv.toFixed(2)],
      ['Total', this.total.toFixed(2)],
    ];
    const csv = filas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${codigo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.alerta.toast({ type: 'success', title: 'Excel/CSV descargado' });
  }

  /** PDF imprimible (Guardar como PDF desde el diálogo). */
  exportarPdf(): void {
    if (!this.lineas.length) {
      this.alerta.toast({ type: 'warning', title: 'Sin ítems para imprimir' });
      return;
    }
    const html = this.construirHtmlProforma(true);
    const w = window.open('', '_blank', 'noopener,width=900,height=700');
    if (!w) {
      this.alerta.toast({ type: 'warning', title: 'Permita ventanas emergentes para el PDF' });
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  /** Archivo de proforma para adjuntar en WhatsApp. */
  private descargarProforma(): void {
    if (!this.lineas.length) return;
    const codigo = (this.cotizacionActual?.codigo || 'COT-borrador').replace(/[^\w.-]+/g, '_');
    const html = this.construirHtmlProforma(false);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Proforma-${codigo}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private construirHtmlProforma(autoPrint: boolean): string {
    const codigo = this.cotizacionActual?.codigo || 'COT-borrador';
    const cliente = this.receptor?.denominacion || this.clienteNombreManual || '—';
    const filas = this.lineas
      .map(
        (l) =>
          `<tr><td>${escape(l.sku)}</td><td>${escape(l.descripcion)}</td><td style="text-align:right">${l.cantidad}</td><td style="text-align:right">${l.precio_unitario.toFixed(2)}</td><td style="text-align:right">${(l.cantidad * l.precio_unitario).toFixed(2)}</td></tr>`,
      )
      .join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escape(codigo)}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#111}
        h1{font-size:20px;margin:0 0 4px}
        .sub{color:#555;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{border-bottom:1px solid #ddd;padding:8px;font-size:13px}
        th{text-align:left;background:#f5f5f5}
        .tot{margin-top:16px;text-align:right;font-size:14px}
        .tot strong{font-size:18px}
        @media print{body{padding:0}}
      </style></head><body>
      <h1>Proforma / Cotización ${escape(codigo)}</h1>
      <div class="sub">HatunSales S.A.C · Cliente: ${escape(cliente)}
      ${this.telefono ? ` · Tel: ${escape(this.telefono)}` : ''}
      ${this.cotizacionActual?.valida_hasta ? ` · Válida hasta ${escape(this.cotizacionActual.valida_hasta)}` : ''}
      </div>
      <table><thead><tr><th>SKU</th><th>Descripción</th><th>Cant.</th><th>P.Unit</th><th>Subtotal</th></tr></thead>
      <tbody>${filas}</tbody></table>
      <div class="tot">
         <div>Subtotal sin IGV: S/ ${this.gravada.toFixed(2)}</div>
         <div>IGV (${this.porcentajeIgv}%): S/ ${this.igv.toFixed(2)}</div>
        <div><strong>Total: S/ ${this.total.toFixed(2)}</strong></div>
      </div>
      ${this.observaciones ? `<p class="sub">Obs: ${escape(this.observaciones)}</p>` : ''}
      <p class="sub">Documento comercial (no es comprobante SUNAT).</p>
      ${autoPrint ? '<script>window.onload=()=>window.print()</script>' : ''}
      </body></html>`;
  }

  async enviarWhatsapp(): Promise<void> {
    if (!this.telefonoOk) {
      this.alerta.toast({ type: 'warning', title: 'Ingrese un celular válido (9 dígitos)' });
      return;
    }
    if (!this.lineas.length) {
      this.alerta.toast({ type: 'warning', title: 'Agregue al menos un producto' });
      return;
    }

    await this.ofertarActualizarTelefonoFicha();

    if (!this.cotizacionActual?.id_proforma) {
      const ok = await this.alerta.confirm({
        title: '¿Guardar y enviar por WhatsApp?',
        message: 'Se guarda la cotización, se descarga la proforma y se abre el chat para adjuntarla.',
        confirmText: 'Guardar y enviar',
      });
      if (!ok.isConfirmed) return;
      this.guardando = true;
      this.refrescar();
      this.api.crear({
        id_cliente: this.receptor?.id_cliente,
        id_empresa: this.receptor?.id_empresa,
        cliente_nombre: (this.receptor?.denominacion || this.clienteNombreManual || '').trim(),
        telefono_envio: this.telefono,
        id_almacen: this.idAlmacen ?? undefined,
        observaciones: this.observaciones,
        dias_vigencia: this.diasVigencia,
        items: this.lineas.map((l) => ({
          id_producto: l.id_producto,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          descripcion: l.descripcion,
          sku: l.sku,
        })),
      }).pipe(takeUntil(this.destruir$)).subscribe({
        next: (cot) => {
          this.guardando = false;
          this.cotizacionActual = cot;
          this.porcentajeIgv = Number(cot.porcentaje_igv) || 18;
          this.refrescar();
          this.dispararWa(cot.id_proforma);
        },
        error: (e) => {
          this.guardando = false;
          this.refrescar();
          this.alerta.error(errorOperativo(e));
        },
      });
      return;
    }
    this.dispararWa(this.cotizacionActual.id_proforma);
  }

  /** Si el celular difiere del padrón, pregunta si actualizar la ficha (no obliga). */
  private async ofertarActualizarTelefonoFicha(): Promise<void> {
    const idCli = this.receptor?.id_cliente;
    const idEmp = this.receptor?.id_empresa;
    if (!idCli && !idEmp) return;

    const ficha = String(this.receptor?.telefono || '').replace(/\D/g, '');
    const envio = String(this.telefono || '').replace(/\D/g, '');
    if (!envio) return;
    const mismos =
      ficha === envio ||
      (ficha.length >= 9 && envio.endsWith(ficha.slice(-9))) ||
      (envio.length >= 9 && ficha.endsWith(envio.slice(-9)));
    if (mismos && ficha) return;

    const r = await this.alerta.confirm({
      title: ficha ? '¿Actualizar celular en la ficha?' : '¿Guardar este celular en la ficha?',
      message: ficha
        ? `Ficha: ${ficha || '—'}. Este envío: ${envio}. Así queda listo para próximas cotizaciones.`
        : `Se guardará ${envio} en el cliente/empresa.`,
      confirmText: 'Sí, actualizar ficha',
      cancelText: 'Solo este envío',
    });
    if (!r.isConfirmed) return;

    const req = idCli
      ? this.receptorSvc.actualizarCliente(idCli, { telefono: this.telefono.trim() })
      : this.receptorSvc.actualizarEmpresa(idEmp!, { telefonos: this.telefono.trim() });

    await new Promise<void>((resolve) => {
      req.pipe(takeUntil(this.destruir$)).subscribe({
        next: () => {
          if (this.receptor) this.receptor = { ...this.receptor, telefono: this.telefono.trim() };
          this.alerta.toast({ type: 'success', title: 'Teléfono actualizado en la ficha' });
          this.refrescar();
          resolve();
        },
        error: (e) => {
          this.alerta.toast({
            type: 'warning',
            title: mensajeDeError(e) || 'No se pudo actualizar la ficha; el envío sigue',
          });
          resolve();
        },
      });
    });
  }

  private dispararWa(id: number): void {
    this.enviandoWa = true;
    this.refrescar();
    this.api
      .enviarWhatsapp({ id_proforma: id, telefono: this.telefono, solo_wa_me: true })
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (r) => {
          this.enviandoWa = false;
          this.refrescar();
          this.descargarProforma();
          const texto = r.texto || 'Cotización HatunSales — adjunto proforma.';
          const url = r.wa_me_url || urlWhatsappCliente(this.telefono, texto);
          if (url) {
            const abierta = window.open(url, '_blank', 'noopener');
            if (!abierta) {
              void navigator.clipboard?.writeText(url);
              this.alerta.toast({ type: 'info', title: 'Enlace WA copiado (permita ventanas emergentes)' });
            }
          }
          void this.alerta.info({
            title: 'Proforma lista para WhatsApp',
            message:
              '1) Se descargó el archivo Proforma-….html\n' +
              '2) Se abrió el chat con el detalle y total\n' +
              '3) En WhatsApp: clip → Documento → elija el archivo → Enviar\n\n' +
              'Tip: si quiere PDF, abra el archivo y use Imprimir → Guardar como PDF.',
            confirmText: 'Entendido',
          });
          this.cargarLista();
        },
        error: (e) => {
          this.enviandoWa = false;
          this.refrescar();
          this.descargarProforma();
          const link = urlWhatsappCliente(this.telefono, this.armarTextoLocal());
          if (link) window.open(link, '_blank', 'noopener');
          this.alerta.error(errorOperativo(e, 'Error al marcar envío; se abrió wa.me con la proforma'));
        },
      });
  }

  private armarTextoLocal(): string {
    const codigo = this.cotizacionActual?.codigo || 'COT';
    const nombre = this.receptor?.denominacion || this.clienteNombreManual || '';
    const lineas = this.lineas
      .slice(0, 8)
      .map((l) => `• ${l.descripcion} x${l.cantidad} — S/ ${(l.cantidad * l.precio_unitario).toFixed(2)}`)
      .join('\n');
    return [
      `Hola${nombre ? ` ${nombre}` : ''},`,
      `Cotización *${codigo}* — HatunSales S.A.C`,
      '',
      lineas,
      '',
      `*Total: S/ ${this.total.toFixed(2)}* (inc. IGV)`,
      '',
      'Adjunto la proforma de cotización.',
    ].join('\n');
  }

  pasarAVenta(): void {
    const id = this.cotizacionActual?.id_proforma;
    if (!id) {
      this.alerta.toast({ type: 'warning', title: 'Guarde la cotización antes de pasar a venta' });
      return;
    }
    if (this.cotizacionActual?.estado === 'convertida') {
      this.alerta.toast({ type: 'warning', title: 'Esta cotización ya fue convertida' });
      return;
    }
    if (this.cotizacionActual?.estado !== 'aprobada') {
      this.alerta.toast({ type: 'warning', title: 'Apruebe la cotización antes de pasarla a venta' });
      return;
    }
    void this.router.navigate(['/dashboard/mantenimiento/ventas'], {
      queryParams: { cotizacion: id },
    });
  }

  estadoClase(estado: string): string {
    if (estado === 'convertida') return 'adm-insignia--exito';
    if (estado === 'aprobada') return 'adm-insignia--exito';
    if (estado === 'enviada') return 'adm-insignia--info';
    if (estado === 'anulada') return 'adm-insignia--peligro';
    return 'adm-insignia--neutra';
  }

  identificar(_i: number, c: Cotizacion): number {
    return c.id_proforma;
  }

  identificarLinea(_i: number, l: LineaCot): number {
    return l.id_producto;
  }
}

function escape(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
