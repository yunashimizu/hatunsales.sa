import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { VisorImagenComponent } from '../../../../shared/components/visor-imagen/visor-imagen.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { urlMedia } from '../../../../shared/utils/media-url.util';
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

@Component({
  selector: 'app-recepcion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, VisorImagenComponent],
  templateUrl: './recepcion.component.html',
  styleUrl: './recepcion.component.css',
})
export class RecepcionComponent implements OnInit {
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
  escaneando = false;
  confirmando = false;

  filtroObs: 'pendiente' | 'todas' = 'pendiente';
  vistaImagen: string | null = null;
  detalleAbierto: any | null = null;
  cargandoDetalle = false;
  actualizarPrecios = false;

  get totalOk(): number {
    return this.lineas.reduce((s, l) => s + (Number(l.cantidad_ok) || 0), 0);
  }

  get totalObs(): number {
    return this.lineas.reduce((s, l) => s + (Number(l.cantidad_observada) || 0), 0);
  }

  private readonly cdr = inject(ChangeDetectorRef);

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
    this.api.listarRecepciones().subscribe({
      next: (lista) => {
        this.historial = Array.isArray(lista) ? lista : [];
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(e));
      },
    });
  }

  cargarObservaciones(): void {
    const estado = this.filtroObs === 'pendiente' ? 'pendiente' : undefined;
    this.api.observaciones(estado).subscribe({
      next: (lista) => {
        this.observaciones = (Array.isArray(lista) ? lista : []).map((o) => ({
          ...o,
          adjuntos: typeof o.adjuntos === 'string' ? JSON.parse(o.adjuntos) : (o.adjuntos || []),
        }));
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(e));
      },
    });
  }

  alPresionarProducto(evento: KeyboardEvent): void {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    if (this.escaneando) return;

    const codigo = this.textoProducto.trim();
    if (!codigo) return;

    this.escaneando = true;
    this.cdr.markForCheck();
    this.puntoVenta.porCodigoBarras(codigo).subscribe({
      next: (producto) => {
        this.escaneando = false;
        this.agregarProducto({
          id_producto: producto.id_producto,
          nombre: producto.nombre,
          sku: producto.sku,
          codigo_barras: producto.codigo_barras,
        });
        this.textoProducto = '';
        this.cdr.markForCheck();
        this.alerta.toast({ type: 'success', title: producto.nombre, timer: 1000 });
        this.enfocar();
      },
      error: () => {
        this.escaneando = false;
        this.cdr.markForCheck();
        this.alerta.toast({ type: 'warning', title: `No hay producto con el código ${codigo}` });
        this.enfocar();
      },
    });
  }

  private agregarProducto(p: {
    id_producto: number; nombre: string; sku: string; codigo_barras: string;
  }): void {
    const existente = this.lineas.find((l) => l.id_producto === p.id_producto);
    if (existente) {
      existente.cantidad_ok += 1;
      return;
    }
    this.lineas = [
      {
        id_producto: p.id_producto,
        nombre: p.nombre,
        sku: p.sku,
        codigo_barras: p.codigo_barras,
        cantidad_ok: 1,
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

    this.confirmando = true;
    this.cdr.markForCheck();
    this.alerta.loading('Confirmando recepción…');
    this.api.confirmar(payload).subscribe({
      next: async (resp) => {
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
            title: 'Recepción registrada',
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
        this.alerta.error({ title: 'No se pudo confirmar', message: mensajeDeError(e) });
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
    const ok = await this.alerta.confirm({
      title: '¿Dar visto bueno?',
      allowHtml: true,
      message: `Se ingresarán <strong>${escapeHtmlAlerta(String(obs.cantidad))}</strong> de <strong>${escapeHtmlAlerta(obs.producto)}</strong> al inventario.`,
      confirmText: 'Visto bueno',
    });
    if (!ok.isConfirmed) return;

    this.api.aprobar(Number(obs.id_observacion)).subscribe({
      next: () => {
        this.cdr.markForCheck();
        this.alerta.toast({ type: 'success', title: 'Stock ingresado' });
        this.cargarObservaciones();
      },
      error: (e) => {
        this.cdr.markForCheck();
        this.alerta.error({ title: 'Error', message: mensajeDeError(e) });
      },
    });
  }

  async rechazar(obs: any): Promise<void> {
    const ok = await this.alerta.confirm({
      title: '¿Rechazar observación?',
      message: 'No entrará al inventario. Quedará en el historial.',
      type: 'warning',
      confirmText: 'Rechazar',
    });
    if (!ok.isConfirmed) return;

    this.api.rechazar(Number(obs.id_observacion), 'Rechazado en revisión').subscribe({
      next: () => {
        this.cdr.markForCheck();
        this.alerta.toast({ type: 'success', title: 'Observación rechazada' });
        this.cargarObservaciones();
      },
      error: (e) => {
        this.cdr.markForCheck();
        this.alerta.error({ title: 'Error', message: mensajeDeError(e) });
      },
    });
  }

  private enfocar(): void {
    queueMicrotask(() => this.inputProducto?.nativeElement?.focus());
  }
}
