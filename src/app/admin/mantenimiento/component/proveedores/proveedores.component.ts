import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ColumnaOrdenable, OrdenMovilComponent } from '../../../../shared/components/orden-movil/orden-movil.component';
import { PiePaginacionComponent } from '../../../../shared/components/pie-paginacion/pie-paginacion.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { ColumnaCsv, exportarCsv } from '../../../../shared/utils/exportar-csv';
import {
  EstadoOrden, alternarOrden, ariaSort, guardarOrden, iconoOrden, leerOrdenGuardado, ordenarLista,
} from '../../../../shared/utils/orden-lista';
import { PaginaLocal, guardarFilasPorPagina, leerFilasPorPagina, paginar } from '../../../../shared/utils/paginacion-local';
import { NotificationService } from '../../../../shared/services/notification.service';
import { mensajeDeError, escapeHtmlAlerta } from '../../../service/api-base.service';
import { RecepcionService } from '../../../service/recepcion.service';
import { CountUpDirective } from '../../../../shared/ui/count-up.directive';
import { RevealDirective } from '../../../../shared/ui/reveal.directive';

const COLUMNAS_ORDEN: ColumnaOrdenable[] = [
  { clave: 'nombre', titulo: 'Proveedor', tipo: 'texto' },
  { clave: 'ruc', titulo: 'RUC', tipo: 'numero' },
];

@Component({
  selector: 'app-proveedores',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, CountUpDirective, RevealDirective, PiePaginacionComponent, OrdenMovilComponent],
  templateUrl: './proveedores.component.html',
  styleUrl: './proveedores.component.css',
})
export class ProveedoresComponent implements OnInit {
  proveedores: any[] = [];
  cargando = false;
  /** La última carga de la lista falló (solo para mostrar el estado de error en pantalla). */
  errorCarga = false;
  guardando = false;
  /** Ficha lateral de alta/edición abierta. */
  panelAbierto = false;
  consultandoRuc = false;
  editandoId: number | null = null;
  idDestacado: number | null = null;
  private filtroTexto = '';
  /** Buscar vuelve a la primera página. */
  get filtro(): string { return this.filtroTexto; }
  set filtro(valor: string) {
    if (valor === this.filtroTexto) return;
    this.filtroTexto = valor;
    this.pagina = 1;
  }
  orden: EstadoOrden = leerOrdenGuardado('proveedores', COLUMNAS_ORDEN.map((c) => c.clave));
  readonly columnasOrden = COLUMNAS_ORDEN;
  pagina = 1;
  porPagina = leerFilasPorPagina();
  /** Proveedor recién guardado: al llegar la lista se va a la página donde quedó. */
  private irAlGuardado: number | null = null;
  private memoFiltrados?: { lista: any[]; texto: string; orden: EstadoOrden; resultado: any[] };
  private memoPagina?: { lista: any[]; pagina: number; porPagina: number; resultado: PaginaLocal<any> };
  recepcionesProv: any[] = [];
  cargandoRecepciones = false;
  proveedorHistorial: any | null = null;

  modelo = { nombre: '', ruc: '', telefono: '', email: '', direccion: '' };

  /** Proveedores que cumplen la búsqueda, ya ordenados (se recalcula solo cuando algo cambió). */
  get proveedoresFiltrados(): any[] {
    const t = this.filtroTexto.trim().toLowerCase();
    const m = this.memoFiltrados;
    if (m && m.lista === this.proveedores && m.texto === t && m.orden === this.orden) return m.resultado;
    const filtrados = !t ? this.proveedores : this.proveedores.filter((p) =>
      `${p.nombre} ${p.ruc} ${p.telefono} ${p.email}`.toLowerCase().includes(t),
    );
    const orden = this.orden;
    const resultado = orden.clave
      ? ordenarLista(filtrados, (p) => (orden.clave === 'ruc' ? (p.ruc ? String(p.ruc) : null) : p.nombre), orden.dir)
      : filtrados;
    this.memoFiltrados = { lista: this.proveedores, texto: t, orden, resultado };
    return resultado;
  }

  get paginaProveedores(): PaginaLocal<any> {
    const lista = this.proveedoresFiltrados;
    const m = this.memoPagina;
    if (m && m.lista === lista && m.pagina === this.pagina && m.porPagina === this.porPagina) return m.resultado;
    const resultado = paginar(lista, this.pagina, this.porPagina);
    this.memoPagina = { lista, pagina: this.pagina, porPagina: this.porPagina, resultado };
    return resultado;
  }

  ordenar(clave: string): void {
    this.fijarOrden(alternarOrden(this.orden, clave));
  }

  fijarOrden(orden: EstadoOrden): void {
    this.orden = orden;
    guardarOrden('proveedores', orden);
    this.pagina = 1;
  }

  ariaSort(clave: string): 'ascending' | 'descending' | 'none' { return ariaSort(this.orden, clave); }
  iconoOrden(clave: string): string { return iconoOrden(this.orden, clave); }

  irAPagina(pagina: number): void { this.pagina = pagina; }

  cambiarFilasPorPagina(porPagina: number): void {
    this.porPagina = porPagina;
    guardarFilasPorPagina(porPagina);
    this.pagina = 1;
  }

  /** Descarga la lista filtrada y ordenada completa (no solo la página que se ve). */
  exportarCsv(): void {
    const filas = this.proveedoresFiltrados;
    if (!filas.length) return;
    const columnas: ColumnaCsv<any>[] = [
      { titulo: 'Proveedor', valor: (p) => p.nombre },
      { titulo: 'RUC', valor: (p) => (p.ruc ? String(p.ruc) : '') },
      { titulo: 'Teléfono', valor: (p) => p.telefono },
      { titulo: 'Correo', valor: (p) => p.email },
      { titulo: 'Dirección', valor: (p) => p.direccion },
    ];
    const total = exportarCsv('proveedores', columnas, filas);
    this.alerta.toast({ type: 'success', title: `CSV descargado: ${total} ${total === 1 ? 'fila' : 'filas'}` });
  }

  get conRuc(): number {
    return this.proveedores.filter((p) => String(p.ruc || '').replace(/\D/g, '').length === 11).length;
  }

  get conTelefono(): number {
    return this.proveedores.filter((p) => String(p.telefono || '').trim()).length;
  }

  /** Estado del RUC para su insignia: 11 dígitos = válido; algo escrito pero incompleto; o vacío. */
  estadoRuc(p: any): 'valido' | 'incompleto' | 'vacio' {
    if (String(p?.ruc || '').replace(/\D/g, '').length === 11) return 'valido';
    return String(p?.ruc || '').trim() ? 'incompleto' : 'vacio';
  }

  /** Totales del historial abierto (cabecera del panel de recepciones). */
  get unidadesOkProv(): number {
    return this.recepcionesProv.reduce((s, r) => s + (Number(r.unidades_ok) || 0), 0);
  }

  get unidadesObsProv(): number {
    return this.recepcionesProv.reduce((s, r) => s + (Number(r.unidades_obs) || 0), 0);
  }

  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private readonly api: RecepcionService,
    private readonly alerta: AlertService,
    private readonly ns: NotificationService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  identificarProveedor(_i: number, p: any): number {
    return p.id_proveedor;
  }

  cargar(): void {
    this.cargando = true;
    this.errorCarga = false;
    this.cdr.markForCheck();
    this.api.listarProveedores().subscribe({
      next: (lista) => {
        this.proveedores = Array.isArray(lista) ? [...lista] : [];
        if (this.irAlGuardado !== null) {
          const posicion = this.proveedoresFiltrados.findIndex((p) => Number(p.id_proveedor) === this.irAlGuardado);
          if (posicion >= 0) this.pagina = Math.floor(posicion / this.porPagina) + 1;
          this.irAlGuardado = null;
        }
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cargando = false;
        this.errorCarga = true;
        this.cdr.markForCheck();
        this.ns.error(mensajeDeError(e, 'No se pudieron cargar los proveedores'));
      },
    });
  }

  /** Abre la ficha en blanco para un alta. */
  nuevo(): void {
    this.reiniciarModelo();
    this.abrirPanel('prov-ruc');
  }

  /** Abre la ficha con los datos del proveedor. */
  editar(p: any): void {
    this.editandoId = Number(p.id_proveedor);
    this.modelo = {
      nombre: p.nombre ?? '',
      ruc: p.ruc ?? '',
      telefono: p.telefono ?? '',
      email: p.email ?? '',
      direccion: p.direccion ?? '',
    };
    this.abrirPanel('prov-nombre');
  }

  cancelar(): void {
    this.cerrarPanel();
  }

  /** Esc cierra la ficha, salvo que haya un diálogo (SweetAlert) abierto: ese se queda con la tecla. */
  @HostListener('document:keydown.escape')
  alPulsarEscape(): void {
    if (document.querySelector('.swal2-container')) return;
    this.cerrarPanel();
  }

  /** Cierra la ficha y deja el formulario en blanco. */
  cerrarPanel(): void {
    if (!this.panelAbierto) return;
    this.panelAbierto = false;
    this.reiniciarModelo();
    this.cdr.markForCheck();
  }

  private reiniciarModelo(): void {
    this.editandoId = null;
    this.modelo = { nombre: '', ruc: '', telefono: '', email: '', direccion: '' };
  }

  /** La ficha y el historial comparten el mismo lugar: se abre una y se cierra la otra. */
  private abrirPanel(idCampo: string): void {
    this.proveedorHistorial = null;
    this.recepcionesProv = [];
    this.panelAbierto = true;
    this.cdr.markForCheck();
    setTimeout(() => document.getElementById(idCampo)?.focus(), 0);
  }

  buscarRuc(): void {
    const ruc = (this.modelo.ruc ?? '').replace(/\D/g, '');
    if (ruc.length !== 11) {
      this.alerta.toast({ type: 'warning', title: 'Ingrese un RUC de 11 dígitos' });
      return;
    }
    this.consultandoRuc = true;
    this.cdr.markForCheck();
    this.api.guardarProveedorPorRuc(ruc).subscribe({
      next: (resp) => {
        this.consultandoRuc = false;
        this.modelo.nombre = resp?.razon_social || resp?.nombre || this.modelo.nombre;
        this.modelo.ruc = resp?.ruc || ruc;
        this.modelo.direccion = resp?.direccion || this.modelo.direccion;
        this.cdr.markForCheck();
        if (resp?.id_proveedor) {
          this.alerta.toast({ type: 'success', title: 'Proveedor cargado desde SUNAT' });
          this.cargar();
          this.editandoId = Number(resp.id_proveedor);
        } else {
          this.alerta.toast({ type: 'success', title: 'Datos SUNAT listos para guardar' });
        }
      },
      error: (e) => {
        this.consultandoRuc = false;
        this.cdr.markForCheck();
        this.alerta.error({
          title: 'No se pudo consultar el RUC',
          message: mensajeDeError(e),
        });
      },
    });
  }

  guardar(): void {
    const nombre = this.modelo.nombre?.trim();
    if (!nombre) {
      this.alerta.toast({ type: 'warning', title: 'El nombre es obligatorio' });
      return;
    }
    const payload = {
      nombre,
      ruc: this.modelo.ruc?.trim() || undefined,
      telefono: this.modelo.telefono?.trim() || undefined,
      email: this.modelo.email?.trim() || undefined,
      direccion: this.modelo.direccion?.trim() || undefined,
    };

    this.guardando = true;
    this.cdr.markForCheck();
    const peticion = this.editandoId
      ? this.api.actualizarProveedor(this.editandoId, payload)
      : this.api.crearProveedor(payload);

    peticion.subscribe({
      next: (item) => {
        this.guardando = false;
        this.idDestacado = Number(item?.id_proveedor ?? this.editandoId);
        this.irAlGuardado = this.idDestacado;
        this.cdr.markForCheck();
        this.alerta.toast({
          type: 'success',
          title: this.editandoId ? 'Proveedor actualizado' : 'Proveedor creado',
        });
        this.cerrarPanel();
        this.cargar();
      },
      error: (e) => {
        this.guardando = false;
        this.cdr.markForCheck();
        this.alerta.error({ title: 'No se pudo guardar', message: mensajeDeError(e) });
      },
    });
  }

  verRecepciones(p: any): void {
    if (this.panelAbierto) this.cerrarPanel();
    this.proveedorHistorial = p;
    this.cargandoRecepciones = true;
    this.recepcionesProv = [];
    this.cdr.markForCheck();
    this.api.listarRecepciones(Number(p.id_proveedor)).subscribe({
      next: (lista) => {
        this.recepcionesProv = Array.isArray(lista) ? lista : [];
        this.cargandoRecepciones = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cargandoRecepciones = false;
        this.cdr.markForCheck();
        this.alerta.error({
          title: 'No se pudieron cargar recepciones',
          message: mensajeDeError(e),
        });
      },
    });
  }

  cerrarRecepciones(): void {
    this.proveedorHistorial = null;
    this.recepcionesProv = [];
  }

  async eliminar(p: any): Promise<void> {
    const ok = await this.alerta.confirm({
      title: '¿Eliminar proveedor?',
      allowHtml: true,
      message: `Se eliminará <strong>${escapeHtmlAlerta(p.nombre)}</strong>.`,
      type: 'warning',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;

    this.api.eliminarProveedor(Number(p.id_proveedor)).subscribe({
      next: () => {
        this.cdr.markForCheck();
        this.alerta.toast({ type: 'success', title: 'Proveedor eliminado' });
        this.cargar();
        if (this.editandoId === Number(p.id_proveedor)) this.cerrarPanel();
      },
      error: (e) => {
        this.cdr.markForCheck();
        this.alerta.error({ title: 'No se pudo eliminar', message: mensajeDeError(e) });
      },
    });
  }
}
