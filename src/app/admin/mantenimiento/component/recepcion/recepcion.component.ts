import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, finalize, firstValueFrom, tap } from 'rxjs';
import { VisorImagenComponent } from '../../../../shared/components/visor-imagen/visor-imagen.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { SonidoCajaService } from '../../../../shared/services/sonido-caja.service';
import { extraerMultiplicador, normalizarCodigo, pareceCodigoExacto } from '../../../../shared/utils/codigo-barras.util';
import { ColaEscaneos } from '../../../../shared/utils/cola-escaneos';
import { urlMedia } from '../../../../shared/utils/media-url.util';
import { CountUpDirective } from '../../../../shared/ui/count-up.directive';
import { esErrorDeRed } from '../../../../shared/utils/errores-http.util';
import { mensajeDeError, escapeHtmlAlerta } from '../../../service/api-base.service';
import { PuntoVentaService } from '../../../service/punto-venta.service';
import { RecepcionService } from '../../../service/recepcion.service';
import { GestionService } from '../../service/gestion.service';

interface LineaRecepcion {
  id_producto: number;
  nombre: string;
  sku: string;
  codigo_barras: string;
  cantidad_ok: number;
  cantidad_observada: number;
  motivo_observacion: string;
  /** Vacío = no tocar precio_compra del producto. */
  precio_compra: number | null;
  foto?: File | null;
  fotoPreview?: string;
}

/** Código ya normalizado y cantidad del multiplicador (`5*código`), esperando turno. */
interface EscaneoRecepcion {
  codigo: string;
  cantidad: number;
}

@Component({
  selector: 'app-recepcion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, VisorImagenComponent, CountUpDirective],
  templateUrl: './recepcion.component.html',
  styleUrl: './recepcion.component.css',
})
export class RecepcionComponent implements OnInit, OnDestroy {
  @ViewChild('inputProducto') private inputProducto?: ElementRef<HTMLInputElement>;

  pestana: 'nueva' | 'historial' | 'observaciones' = 'nueva';

  proveedores: any[] = [];
  almacenes: any[] = [];
  historial: any[] = [];
  observaciones: any[] = [];

  idProveedor: number | null = null;
  idAlmacen: number | null = null;
  nroGuia = '';
  nroDocumento = '';
  observacionesCabecera = '';

  textoProducto = '';
  lineas: LineaRecepcion[] = [];
  confirmando = false;

  /** Estados de carga y error de las listas (solo para mostrarlos en pantalla). */
  cargandoHistorial = false;
  errorHistorial = false;
  cargandoObs = false;
  errorObs = false;

  filtroObs: 'pendiente' | 'todas' = 'pendiente';
  vistaImagen: string | null = null;
  detalleAbierto: any | null = null;
  cargandoDetalle = false;
  actualizarPrecios = false;

  /**
   * Observación con una revisión en curso (visto bueno o rechazo). Mientras tanto los botones
   * quedan deshabilitados: un doble clic ya no manda dos peticiones.
   */
  revisandoObs: number | null = null;

  /**
   * Clave de idempotencia atada al contenido del formulario: si la respuesta se pierde y se
   * vuelve a confirmar lo mismo, el servidor devuelve la recepción ya registrada en vez de
   * duplicarla (y sumar el stock dos veces). Si el formulario cambia, la clave es otra.
   */
  private intento: { contenido: string; clave: string } | null = null;

  get totalOk(): number {
    return this.lineas.reduce((s, l) => s + (Number(l.cantidad_ok) || 0), 0);
  }

  get totalObs(): number {
    return this.lineas.reduce((s, l) => s + (Number(l.cantidad_observada) || 0), 0);
  }

  /** Proveedor, almacén y guía completos: marca el primer paso de la pantalla. */
  get cabeceraLista(): boolean {
    return !!this.idProveedor && !!this.idAlmacen && !!this.nroGuia.trim();
  }

  /** Lo que falta de la cabecera, en palabras («proveedor, almacén y guía»). */
  get textoFaltantes(): string {
    const falta: string[] = [];
    if (!this.idProveedor) falta.push('proveedor');
    if (!this.idAlmacen) falta.push('almacén');
    if (!this.nroGuia.trim()) falta.push('guía');
    return falta.length > 1 ? `${falta.slice(0, -1).join(', ')} y ${falta[falta.length - 1]}` : falta.join('');
  }

  /** Parte de lo recibido que queda en observación (0–100): barra del resumen. */
  get pctObservado(): number {
    const total = this.totalOk + this.totalObs;
    return total > 0 ? (this.totalObs / total) * 100 : 0;
  }

  /** Líneas con unidades observadas. */
  get lineasObservadas(): number {
    return this.lineas.filter((l) => Number(l.cantidad_observada) > 0).length;
  }

  /** Totales del historial y de las observaciones (chips de resumen). */
  get historialOk(): number {
    return this.historial.reduce((s, r) => s + (Number(r.unidades_ok) || 0), 0);
  }

  get historialObs(): number {
    return this.historial.reduce((s, r) => s + (Number(r.unidades_obs) || 0), 0);
  }

  get aprobadasObs(): number {
    return this.observaciones.filter((o) => o.estado === 'aprobado').length;
  }

  get rechazadasObs(): number {
    return this.observaciones.filter((o) => o.estado === 'rechazado').length;
  }

  /** Totales del detalle abierto. */
  get detalleOk(): number {
    return (this.detalleAbierto?.items ?? []).reduce((s: number, it: any) => s + (Number(it.cantidad_ok) || 0), 0);
  }

  get detalleObs(): number {
    return (this.detalleAbierto?.items ?? []).reduce((s: number, it: any) => s + (Number(it.cantidad_observada) || 0), 0);
  }

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly sonido = inject(SonidoCajaService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Cola serial de escaneos (igual que el POS): el Enter vacía el campo y encola el código, así dos
   * productos seguidos no se concatenan ni se pierden aunque el primero espere al servidor.
   */
  private readonly colaEscaneos = new ColaEscaneos<EscaneoRecepcion>(
    (escaneo) => this.resolverEscaneo(escaneo),
    () => this.cdr.markForCheck(),
  );

  /** Verdadero mientras haya un escaneo en curso o esperando turno (lo mira la plantilla). */
  get escaneando(): boolean {
    return this.colaEscaneos.ocupada;
  }

  ngOnDestroy(): void {
    this.colaEscaneos.vaciar();
  }

  constructor(
    private readonly api: RecepcionService,
    private readonly puntoVenta: PuntoVentaService,
    private readonly gestion: GestionService,
    private readonly alerta: AlertService,
    private readonly ns: NotificationService,
  ) {}

  ngOnInit(): void {
    this.cargarCatalogos();
    this.cargarHistorial();
    this.cargarObservaciones();
  }

  identificarLinea(_i: number, l: LineaRecepcion): number {
    return l.id_producto;
  }

  identificarHistorial(_i: number, r: any): number | string {
    return r.id_recepcion ?? r.id ?? _i;
  }

  identificarObservacion(_i: number, o: any): number {
    return o.id_observacion;
  }

  identificarAdjunto(_i: number, a: any): string | number {
    return a?.url ?? a?.ruta ?? _i;
  }

  abrirDetalle(r: any): void {
    const id = Number(r?.id_recepcion);
    if (!id) return;
    this.cargandoDetalle = true;
    this.detalleAbierto = null;
    this.cdr.markForCheck();
    this.api.detalle(id).subscribe({
      next: (det) => {
        this.detalleAbierto = det;
        this.cargandoDetalle = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cargandoDetalle = false;
        this.cdr.markForCheck();
        this.alerta.error({ title: 'No se pudo abrir el detalle', message: mensajeDeError(e) });
      },
    });
  }

  cerrarDetalle(): void {
    this.detalleAbierto = null;
  }

  urlDe(ruta?: string): string {
    return urlMedia(ruta);
  }

  abrirVistaImagen(ruta?: string | null): void {
    if (!ruta) return;
    // Preview local (data URL) o ruta del servidor
    this.vistaImagen = ruta.startsWith('data:') ? ruta : this.urlDe(ruta);
  }

  cerrarVistaImagen(): void {
    this.vistaImagen = null;
  }

  quitarFoto(linea: LineaRecepcion): void {
    linea.foto = null;
    linea.fotoPreview = undefined;
  }

  get pendientesObs(): number {
    return this.observaciones.filter((o) => o.estado === 'pendiente').length;
  }

  cambiarPestana(p: 'nueva' | 'historial' | 'observaciones'): void {
    this.pestana = p;
    if (p === 'historial' && this.historial.length === 0) this.cargarHistorial();
    if (p === 'observaciones' && this.observaciones.length === 0) this.cargarObservaciones();
  }

  private cargarCatalogos(): void {
    this.api.listarProveedores().subscribe({
      next: (lista) => {
        this.proveedores = Array.isArray(lista) ? lista : [];
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(e, 'No se cargaron proveedores'));
      },
    });
    this.gestion.getAlmacenesAdmin().subscribe({
      next: (lista: any[]) => {
        this.almacenes = Array.isArray(lista) ? lista : [];
        if (!this.idAlmacen && this.almacenes.length) {
          this.idAlmacen = Number(this.almacenes[0].id_almacen);
        }
        this.cdr.markForCheck();
      },
      error: (e: unknown) => {
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(e, 'No se cargaron almacenes'));
      },
    });
  }

  cargarHistorial(): void {
    this.cargandoHistorial = true;
    this.errorHistorial = false;
    this.cdr.markForCheck();
    this.api.listarRecepciones().subscribe({
      next: (lista) => {
        this.historial = Array.isArray(lista) ? lista : [];
        this.cargandoHistorial = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cargandoHistorial = false;
        this.errorHistorial = true;
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(e));
      },
    });
  }

  cargarObservaciones(): void {
    const estado = this.filtroObs === 'pendiente' ? 'pendiente' : undefined;
    this.cargandoObs = true;
    this.errorObs = false;
    this.cdr.markForCheck();
    this.api.observaciones(estado).subscribe({
      next: (lista) => {
        this.observaciones = (Array.isArray(lista) ? lista : []).map((o) => ({
          ...o,
          adjuntos: typeof o.adjuntos === 'string' ? JSON.parse(o.adjuntos) : (o.adjuntos || []),
        }));
        this.cargandoObs = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cargandoObs = false;
        this.errorObs = true;
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(e));
      },
    });
  }

  alPresionarProducto(evento: KeyboardEvent): void {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();

    // Orden fijo: normalizar → multiplicador (`5*código`) → ¿parece código?
    const texto = normalizarCodigo(this.textoProducto);
    if (!texto) return;
    const { cantidad, codigo } = extraerMultiplicador(texto);

    // Un nombre escrito no es un código: no va al servidor y se deja el texto para corregirlo.
    if (!pareceCodigoExacto(codigo)) {
      this.sonido.aviso();
      this.alerta.toast({ type: 'info', title: 'Escriba o escanee un código' });
      this.enfocar();
      return;
    }

    // Se vacía el campo en el acto para que el siguiente escaneo no se concatene.
    this.textoProducto = '';
    this.colaEscaneos.encolar({ codigo, cantidad });
    this.cdr.markForCheck();
  }

  /** Resuelve un código de la cola. Nunca falla: cada resultado avisa por separado. */
  private resolverEscaneo({ codigo, cantidad }: EscaneoRecepcion): Observable<unknown> {
    return this.puntoVenta.resolverCodigo(codigo, this.idAlmacen).pipe(
      takeUntilDestroyed(this.destroyRef),
      tap((r) => {
        if (r.estado === 'ok' && r.producto) {
          const producto = r.producto;
          const antes = this.lineas.find((l) => l.id_producto === producto.id_producto)?.cantidad_ok;
          this.agregarProducto(
            {
              id_producto: producto.id_producto,
              nombre: producto.nombre,
              sku: producto.sku,
              codigo_barras: producto.codigo_barras,
            },
            cantidad,
          );
          const ahora = this.lineas.find((l) => l.id_producto === producto.id_producto)?.cantidad_ok;
          this.sonido.ok();
          this.alerta.toast({
            type: 'success',
            title: antes !== undefined ? `${producto.nombre} · ahora ${ahora}` : producto.nombre,
            timer: 1000,
          });
        } else if (r.estado === 'inactivo') {
          this.sonido.error();
          this.alerta.toast({
            type: 'warning',
            title: r.mensaje || `El producto con el código ${codigo} está inactivo`,
          });
        } else if (r.estado === 'no_existe') {
          this.sonido.error();
          this.alerta.toast({ type: 'warning', title: `No hay producto con el código ${codigo}` });
        } else {
          this.sonido.error();
          this.alerta.toast({
            type: 'error',
            title: `No se pudo verificar el código ${codigo}: ${r.mensaje || 'error de conexión'}`,
          });
        }
        this.cdr.markForCheck();
        this.enfocar();
      }),
    );
  }

  private agregarProducto(
    p: { id_producto: number; nombre: string; sku: string; codigo_barras: string },
    cantidad = 1,
  ): void {
    const existente = this.lineas.find((l) => l.id_producto === p.id_producto);
    if (existente) {
      existente.cantidad_ok += cantidad;
      return;
    }
    this.lineas = [
      {
        id_producto: p.id_producto,
        nombre: p.nombre,
        sku: p.sku,
        codigo_barras: p.codigo_barras,
        cantidad_ok: cantidad,
        cantidad_observada: 0,
        motivo_observacion: '',
        precio_compra: null,
        foto: null,
      },
      ...this.lineas,
    ];
  }

  quitarLinea(linea: LineaRecepcion): void {
    this.lineas = this.lineas.filter((l) => l !== linea);
  }

  onFoto(linea: LineaRecepcion, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    linea.foto = file;
    const reader = new FileReader();
    reader.onload = () => {
      linea.fotoPreview = String(reader.result || '');
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
  }

  async confirmar(): Promise<void> {
    if (!this.idProveedor) {
      this.alerta.toast({ type: 'warning', title: 'Seleccione el proveedor' });
      return;
    }
    if (!this.idAlmacen) {
      this.alerta.toast({ type: 'warning', title: 'Seleccione el almacén' });
      return;
    }
    if (!this.nroGuia.trim()) {
      this.alerta.toast({ type: 'warning', title: 'Ingrese el número de guía' });
      return;
    }
    if (!this.lineas.length) {
      this.alerta.toast({ type: 'warning', title: 'Escanee al menos un producto' });
      return;
    }
    for (const l of this.lineas) {
      if (l.cantidad_observada > 0 && !l.motivo_observacion.trim()) {
        this.alerta.toast({ type: 'warning', title: `Indique motivo de observación: ${l.nombre}` });
        return;
      }
    }

    const ok = await this.alerta.confirm({
      title: '¿Confirmar recepción?',
      allowHtml: true,
      message:
        `OK: <strong>${this.totalOk}</strong> · Observado: <strong>${this.totalObs}</strong>.<br>` +
        'Lo OK entra al inventario. Lo observado espera visto bueno.' +
        (this.actualizarPrecios
          ? '<br>También se actualizarán los precios de compra indicados.'
          : ''),
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;

    const payload = {
      id_proveedor: this.idProveedor,
      id_almacen: this.idAlmacen,
      nro_guia: this.nroGuia.trim(),
      nro_documento: this.nroDocumento.trim(),
      observaciones: this.observacionesCabecera.trim(),
      items: this.lineas.map((l) => ({
        id_producto: l.id_producto,
        cantidad_ok: Number(l.cantidad_ok) || 0,
        cantidad_observada: Number(l.cantidad_observada) || 0,
        motivo_observacion: l.motivo_observacion,
        nota: l.motivo_observacion,
        precio_compra:
          this.actualizarPrecios && l.precio_compra != null && l.precio_compra >= 0
            ? Number(l.precio_compra)
            : undefined,
      })),
    };

    const contenido = JSON.stringify(payload);
    if (this.intento?.contenido !== contenido) {
      this.intento = {
        contenido,
        clave:
          globalThis.crypto?.randomUUID?.() ??
          `recepcion-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };
    }

    this.confirmando = true;
    this.cdr.markForCheck();
    this.alerta.loading('Confirmando recepción…');
    this.api.confirmar({ ...payload, clave_idempotencia: this.intento.clave }).subscribe({
      next: async (resp) => {
        this.intento = null;
        const fotosPendientes = this.lineas.filter((l) => l.cantidad_observada > 0 && l.foto);
        const mapaObs = new Map<number, number>(
          (resp?.observaciones ?? []).map((o: any) => [Number(o.id_producto), Number(o.id_observacion)]),
        );

        let fotosFallidas = 0;
        for (const linea of fotosPendientes) {
          const idObs = mapaObs.get(linea.id_producto);
          if (idObs && linea.foto) {
            try {
              await firstValueFrom(this.api.subirFoto(idObs, linea.foto));
            } catch {
              fotosFallidas += 1;
            }
          }
        }

        this.alerta.close();
        this.confirmando = false;
        this.cdr.markForCheck();
        const fallosStock = Array.isArray(resp?.stock_fallido) ? resp.stock_fallido.length : 0;
        let mensaje = resp?.mensaje || 'Listo';
        if (fotosFallidas) {
          mensaje += ` ${fotosFallidas} foto(s) no se subieron; puede adjuntarlas luego en Observaciones.`;
        }
        if (fallosStock) {
          void this.alerta.warning({
            title: 'Recepción con alertas de stock',
            message: mensaje,
          });
        } else {
          this.alerta.success({
            title: resp?.repetida ? 'Recepción ya registrada' : 'Recepción registrada',
            message: mensaje,
            timer: 2500,
          });
        }
        if (fotosFallidas && !fallosStock) {
          this.alerta.toast({
            type: 'warning',
            title: `${fotosFallidas} foto(s) no se subieron`,
          });
        }
        this.limpiarFormulario();
        this.cargarHistorial();
        this.cargarObservaciones();
        if ((resp?.observaciones ?? []).length) {
          this.pestana = 'observaciones';
        }
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.alerta.close();
        this.confirmando = false;
        this.cdr.markForCheck();
        // La recepción es todo o nada. Si la respuesta no llegó, el servidor pudo haberla
        // registrado: al reintentar con la misma clave no se duplica.
        this.alerta.error({
          title: 'No se pudo confirmar',
          message: `${mensajeDeError(e)} ${
            esErrorDeRed(e)
              ? 'Vuelva a confirmar: si ya se había registrado, no se duplicará.'
              : 'No se registró la recepción ni se movió el stock.'
          }`,
        });
      },
    });
  }

  private limpiarFormulario(): void {
    this.nroGuia = '';
    this.nroDocumento = '';
    this.observacionesCabecera = '';
    this.lineas = [];
    this.textoProducto = '';
    this.enfocar();
  }

  async aprobar(obs: any): Promise<void> {
    const id = Number(obs?.id_observacion);
    if (!id || !this.tomarRevision(id)) return;
    const ok = await this.alerta.confirm({
      title: '¿Dar visto bueno?',
      allowHtml: true,
      message: `Se ingresarán <strong>${escapeHtmlAlerta(String(obs.cantidad))}</strong> de <strong>${escapeHtmlAlerta(obs.producto)}</strong> al inventario.`,
      confirmText: 'Visto bueno',
    });
    if (!ok.isConfirmed) {
      this.soltarRevision();
      return;
    }

    this.api.aprobar(id).pipe(finalize(() => this.soltarRevision())).subscribe({
      next: () => {
        this.alerta.toast({ type: 'success', title: 'Stock ingresado' });
        this.cargarObservaciones();
      },
      error: (e) => {
        this.alerta.error({ title: 'No se pudo dar el visto bueno', message: mensajeDeError(e) });
        // Otro usuario pudo revisarla antes: la lista muestra el estado real.
        this.cargarObservaciones();
      },
    });
  }

  async rechazar(obs: any): Promise<void> {
    const id = Number(obs?.id_observacion);
    if (!id || !this.tomarRevision(id)) return;
    const ok = await this.alerta.confirm({
      title: '¿Rechazar observación?',
      message: 'No entrará al inventario. Quedará en el historial.',
      type: 'warning',
      confirmText: 'Rechazar',
    });
    if (!ok.isConfirmed) {
      this.soltarRevision();
      return;
    }

    this.api.rechazar(id, 'Rechazado en revisión').pipe(finalize(() => this.soltarRevision())).subscribe({
      next: () => {
        this.alerta.toast({ type: 'success', title: 'Observación rechazada' });
        this.cargarObservaciones();
      },
      error: (e) => {
        this.alerta.error({ title: 'No se pudo rechazar', message: mensajeDeError(e) });
        this.cargarObservaciones();
      },
    });
  }

  /** Una revisión a la vez: el segundo clic (o el otro botón) no hace nada mientras dure. */
  private tomarRevision(id: number): boolean {
    if (this.revisandoObs !== null) return false;
    this.revisandoObs = id;
    this.cdr.markForCheck();
    return true;
  }

  private soltarRevision(): void {
    this.revisandoObs = null;
    this.cdr.markForCheck();
  }

  private enfocar(): void {
    queueMicrotask(() => this.inputProducto?.nativeElement?.focus());
  }
}
