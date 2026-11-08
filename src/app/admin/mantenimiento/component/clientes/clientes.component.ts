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
import { Subject, takeUntil } from 'rxjs';

import { ColumnaOrdenable, OrdenMovilComponent } from '../../../../shared/components/orden-movil/orden-movil.component';
import { PiePaginacionComponent } from '../../../../shared/components/pie-paginacion/pie-paginacion.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { ColumnaCsv, exportarCsv } from '../../../../shared/utils/exportar-csv';
import {
  EstadoOrden, alternarOrden, ariaSort, guardarOrden, iconoOrden, leerOrdenGuardado, ordenarLista,
} from '../../../../shared/utils/orden-lista';
import { PaginaLocal, guardarFilasPorPagina, leerFilasPorPagina, paginar } from '../../../../shared/utils/paginacion-local';
import { AuthService } from '../../../../auth/service/auth.service';
import { rolPermitido } from '../../../../auth/roles.constants';
import { GestionService } from '../../service/gestion.service';
import { ReceptorService } from '../../../service/receptor.service';
import { errorOperativo, mensajeDeError } from '../../../service/api-base.service';
import { CountUpDirective } from '../../../../shared/ui/count-up.directive';
import { RevealDirective } from '../../../../shared/ui/reveal.directive';

type Pestania = 'personas' | 'empresas';

const COLUMNAS_PERSONAS: ColumnaOrdenable[] = [
  { clave: 'nombre', titulo: 'Cliente', tipo: 'texto' },
  { clave: 'documento', titulo: 'DNI', tipo: 'numero' },
  { clave: 'correo', titulo: 'Correo', tipo: 'texto' },
  { clave: 'telefono', titulo: 'Teléfono', tipo: 'numero' },
];
const COLUMNAS_EMPRESAS: ColumnaOrdenable[] = [
  { clave: 'nombre', titulo: 'Empresa', tipo: 'texto' },
  { clave: 'documento', titulo: 'RUC', tipo: 'numero' },
  { clave: 'situacion', titulo: 'Situación', tipo: 'texto' },
];

@Component({
  selector: 'app-clientes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, CountUpDirective, RevealDirective, PiePaginacionComponent, OrdenMovilComponent],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.css',
})
export class ClientesComponent implements OnInit, OnDestroy {

  pestania: Pestania = 'personas';

  clientes: any[] = [];
  empresas: any[] = [];
  cargando = false;
  /** La última carga falló (solo para mostrar el estado de error en pantalla; el aviso modal sigue igual). */
  errorCarga = false;
  errorEmpresas = false;
  private filtroTexto = '';
  /** Buscar vuelve a la primera página. */
  get filtro(): string { return this.filtroTexto; }
  set filtro(valor: string) {
    if (valor === this.filtroTexto) return;
    this.filtroTexto = valor;
    this.pagina = 1;
  }

  /** Orden de cada pestaña (se recuerda mientras la pestaña del navegador siga abierta). */
  ordenPersonas: EstadoOrden = leerOrdenGuardado('clientes-personas', COLUMNAS_PERSONAS.map((c) => c.clave));
  ordenEmpresas: EstadoOrden = leerOrdenGuardado('clientes-empresas', COLUMNAS_EMPRESAS.map((c) => c.clave));
  readonly columnasPersonas = COLUMNAS_PERSONAS;
  readonly columnasEmpresas = COLUMNAS_EMPRESAS;
  pagina = 1;
  porPagina = leerFilasPorPagina();
  private memoPersonas?: { lista: any[]; texto: string; orden: EstadoOrden; resultado: any[] };
  private memoEmpresas?: { lista: any[]; texto: string; orden: EstadoOrden; resultado: any[] };
  private memoPagina?: { lista: any[]; pagina: number; porPagina: number; resultado: PaginaLocal<any> };

  /** Alta por documento: el backend consulta SUNAT y guarda el resultado. */
  documento = '';
  registrando = false;

  panelAbierto = false;
  editando: any = null;
  formularioPersona = { nombre: '', apellido_paterno: '', apellido_materno: '', telefono: '', email: '', direccion: '' };
  formularioEmpresa = { razon_social: '', nombre_comercial: '', telefonos: '', direccion: '', departamento: '', provincia: '', distrito: '' };
  guardando = false;

  idDestacado: number | null = null;

  private readonly destruir$ = new Subject<void>();
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auth = inject(AuthService);

  constructor(
    private readonly gestion: GestionService,
    private readonly receptor: ReceptorService,
    private readonly alerta: AlertService,
  ) {}

  /**
   * Eliminar personas o empresas: solo admin (la API responde 403 a vendedor y caja). Sin
   * esto, vendedor y caja veían el botón y el error recién después de confirmar.
   */
  get esAdmin(): boolean {
    const sesion = this.auth.getSesion();
    return rolPermitido(sesion.rolNombre, ['admin'], sesion.rolId);
  }

  ngOnInit(): void {
    this.cargar();
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  // ── Datos ────────────────────────────────────────────────────

  cargar(): void {
    this.cargando = true;
    this.errorCarga = false;
    this.errorEmpresas = false;
    this.cdr.markForCheck();

    this.gestion.getClientes().pipe(takeUntil(this.destruir$)).subscribe({
      next: (lista) => {
        this.cargando = false;
        this.clientes = Array.isArray(lista) ? [...lista] : [];
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.cargando = false;
        this.errorCarga = true;
        this.cdr.markForCheck();
        this.alerta.error({ title: 'No se pudieron cargar los clientes', message: mensajeDeError(error) });
      },
    });

    this.receptor.empresas().pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (lista) => {
          this.empresas = Array.isArray(lista) ? [...lista] : [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.empresas = [];
          this.errorEmpresas = true;
          this.cdr.markForCheck();
        },
      });
  }

  cambiarPestania(pestania: Pestania): void {
    this.pestania = pestania;
    this.filtro = '';
    this.pagina = 1;
  }

  get personasFiltradas(): any[] {
    const texto = this.filtroTexto.trim().toLowerCase();
    const m = this.memoPersonas;
    if (m && m.lista === this.clientes && m.texto === texto && m.orden === this.ordenPersonas) return m.resultado;

    const filtradas = !texto ? this.clientes : this.clientes.filter((c) =>
      `${c.nombre_completo ?? c.nombre ?? ''} ${c.dni ?? ''} ${c.email ?? ''} ${c.telefono ?? ''}`
        .toLowerCase()
        .includes(texto),
    );
    const orden = this.ordenPersonas;
    const resultado = orden.clave
      ? ordenarLista(filtradas, (c) => this.valorPersona(c, orden.clave!), orden.dir)
      : filtradas;
    this.memoPersonas = { lista: this.clientes, texto, orden, resultado };
    return resultado;
  }

  get empresasFiltradas(): any[] {
    const texto = this.filtroTexto.trim().toLowerCase();
    const m = this.memoEmpresas;
    if (m && m.lista === this.empresas && m.texto === texto && m.orden === this.ordenEmpresas) return m.resultado;

    const filtradas = !texto ? this.empresas : this.empresas.filter((e) =>
      `${e.razon_social ?? ''} ${e.nombre_comercial ?? ''} ${e.ruc ?? ''}`.toLowerCase().includes(texto),
    );
    const orden = this.ordenEmpresas;
    const resultado = orden.clave
      ? ordenarLista(filtradas, (e) => this.valorEmpresa(e, orden.clave!), orden.dir)
      : filtradas;
    this.memoEmpresas = { lista: this.empresas, texto, orden, resultado };
    return resultado;
  }

  private valorPersona(c: any, clave: string): unknown {
    switch (clave) {
      case 'nombre': return this.nombreDe(c);
      case 'documento': return c.dni ? String(c.dni) : null;
      case 'correo': return `${c.email ?? ''}`.trim() || null;
      case 'telefono': return `${c.telefono ?? ''}`.trim() || null;
      default: return null;
    }
  }

  private valorEmpresa(e: any, clave: string): unknown {
    switch (clave) {
      case 'nombre': return e.razon_social;
      case 'documento': return e.ruc ? String(e.ruc) : null;
      case 'situacion': return e.estado;
      default: return null;
    }
  }

  // ── Orden, páginas y CSV ─────────────────────────────────────

  get orden(): EstadoOrden { return this.pestania === 'personas' ? this.ordenPersonas : this.ordenEmpresas; }
  get columnasOrden(): ColumnaOrdenable[] { return this.pestania === 'personas' ? COLUMNAS_PERSONAS : COLUMNAS_EMPRESAS; }

  ordenar(clave: string): void {
    this.fijarOrden(alternarOrden(this.orden, clave));
  }

  fijarOrden(orden: EstadoOrden): void {
    if (this.pestania === 'personas') {
      this.ordenPersonas = orden;
      guardarOrden('clientes-personas', orden);
    } else {
      this.ordenEmpresas = orden;
      guardarOrden('clientes-empresas', orden);
    }
    this.pagina = 1;
  }

  ariaSort(clave: string): 'ascending' | 'descending' | 'none' { return ariaSort(this.orden, clave); }
  iconoOrden(clave: string): string { return iconoOrden(this.orden, clave); }

  /** Lo que se ve en la pestaña actual: orden → búsqueda → página. */
  get paginaActual(): PaginaLocal<any> {
    const lista = this.pestania === 'personas' ? this.personasFiltradas : this.empresasFiltradas;
    const m = this.memoPagina;
    if (m && m.lista === lista && m.pagina === this.pagina && m.porPagina === this.porPagina) return m.resultado;
    const resultado = paginar(lista, this.pagina, this.porPagina);
    this.memoPagina = { lista, pagina: this.pagina, porPagina: this.porPagina, resultado };
    return resultado;
  }

  irAPagina(pagina: number): void { this.pagina = pagina; }

  /** Lleva la tabla a la página donde cayó un registro recién creado (el orden elegido puede ponerlo lejos). */
  private irAlRegistro(id: number): void {
    const personas = this.pestania === 'personas';
    const lista = personas ? this.personasFiltradas : this.empresasFiltradas;
    const posicion = lista.findIndex((i) => Number(personas ? i.id_cliente : i.id_empresa) === id);
    this.pagina = posicion >= 0 ? Math.floor(posicion / this.porPagina) + 1 : 1;
  }

  cambiarFilasPorPagina(porPagina: number): void {
    this.porPagina = porPagina;
    guardarFilasPorPagina(porPagina);
    this.pagina = 1;
  }

  /** Descarga la lista de la pestaña con la búsqueda aplicada, completa (no solo la página). */
  exportarCsv(): void {
    const personas = this.pestania === 'personas';
    const filas = personas ? this.personasFiltradas : this.empresasFiltradas;
    if (!filas.length) return;
    const columnas: ColumnaCsv<any>[] = personas
      ? [
        { titulo: 'Nombre', valor: (c) => this.nombreDe(c) },
        { titulo: 'DNI', valor: (c) => (c.dni ? String(c.dni) : '') },
        { titulo: 'Correo', valor: (c) => c.email },
        { titulo: 'Teléfono', valor: (c) => c.telefono },
        { titulo: 'Dirección', valor: (c) => c.direccion },
        { titulo: 'Con cuenta en la tienda', valor: (c) => (c.tiene_cuenta ? 'Sí' : 'No') },
      ]
      : [
        { titulo: 'Razón social', valor: (e) => e.razon_social },
        { titulo: 'Nombre comercial', valor: (e) => e.nombre_comercial },
        { titulo: 'RUC', valor: (e) => (e.ruc ? String(e.ruc) : '') },
        { titulo: 'Situación', valor: (e) => e.estado },
        { titulo: 'Condición', valor: (e) => e.condicion },
        { titulo: 'Teléfonos', valor: (e) => e.telefonos },
        { titulo: 'Dirección', valor: (e) => e.direccion },
        { titulo: 'Distrito', valor: (e) => e.distrito },
        { titulo: 'Provincia', valor: (e) => e.provincia },
      ];
    const total = exportarCsv(personas ? 'clientes-personas' : 'clientes-empresas', columnas, filas);
    this.alerta.toast({ type: 'success', title: `CSV descargado: ${total} ${total === 1 ? 'fila' : 'filas'}` });
  }

  // ── Resumen y presentación (solo vista) ──────────────────────

  get personasConCuenta(): number {
    return this.clientes.filter((c) => !!c.tiene_cuenta).length;
  }

  get personasConCorreo(): number {
    return this.clientes.filter((c) => !!`${c.email ?? ''}`.trim()).length;
  }

  get personasConTelefono(): number {
    return this.clientes.filter((c) => !!`${c.telefono ?? ''}`.trim()).length;
  }

  get empresasActivas(): number {
    return this.empresas.filter((e) => `${e.estado ?? ''}`.toUpperCase() === 'ACTIVO').length;
  }

  get empresasConAviso(): number {
    return this.empresas.length - this.empresasActivas;
  }

  /** Dígitos escritos en «Registrar por documento» (alimenta el contador y el tipo detectado). */
  get digitosDocumento(): number {
    return this.documento.replace(/\D/g, '').length;
  }

  get tipoDocumento(): 'dni' | 'ruc' | null {
    const n = this.digitosDocumento;
    return n === 8 ? 'dni' : n === 11 ? 'ruc' : null;
  }

  /** Tono estable (0–5) del avatar: la misma persona o empresa conserva siempre su color. */
  tonoDe(item: any): number {
    const clave = String(item?.id_cliente ?? item?.id_empresa ?? this.nombreDe(item ?? {}));
    let h = 0;
    for (let i = 0; i < clave.length; i++) h = (h * 31 + clave.charCodeAt(i)) >>> 0;
    return h % 6;
  }

  /** Color de la insignia de la situación de la empresa en SUNAT. */
  claseEstadoEmpresa(estado: string | null | undefined): string {
    const e = `${estado ?? ''}`.toUpperCase();
    if (e === 'ACTIVO') return 'adm-insignia--exito';
    if (e.startsWith('BAJA')) return 'adm-insignia--peligro';
    return 'adm-insignia--aviso';
  }

  /** Color de la condición de domicilio (HABIDO / NO HABIDO …). */
  claseCondicion(condicion: string | null | undefined): string {
    const c = `${condicion ?? ''}`.toUpperCase();
    if (c === 'HABIDO') return 'adm-insignia--exito';
    if (c.startsWith('NO ')) return 'adm-insignia--peligro';
    return 'adm-insignia--neutra';
  }

  // ── Alta por documento ───────────────────────────────────────

  get documentoValido(): boolean {
    const digitos = this.documento.replace(/\D/g, '');
    return digitos.length === 8 || digitos.length === 11;
  }

  registrarPorDocumento(): void {
    if (!this.documentoValido) {
      this.alerta.toast({ type: 'warning', title: 'Ingrese un DNI de 8 dígitos o un RUC de 11' });
      return;
    }

    this.registrando = true;
    this.cdr.markForCheck();
    const documento = this.documento.replace(/\D/g, '');

    this.receptor.buscar(documento)
      .pipe(takeUntil(this.destruir$))
      .subscribe({
        next: (resultado) => {
          this.registrando = false;
          this.documento = '';
          this.filtro = '';
          this.pestania = resultado.tipo === 'empresa' ? 'empresas' : 'personas';

          const fila = this.filaDesdeResultado(resultado);
          const id = resultado.tipo === 'empresa'
            ? Number(resultado.id_empresa)
            : Number(resultado.id_cliente);

          if (fila && id) {
            // Igual que productos: aparece al toque, sin recargar toda la lista.
            this.reflejarEnLista(fila, this.pestania);
            this.irAlRegistro(id);
            this.destacar(id);
          }

          this.cdr.markForCheck();
          this.alerta.toast({
            type: 'success',
            title: resultado.denominacion || 'Registro listo',
            message: resultado.origen === 'base' ? 'Ya estaba registrado' : 'Registrado desde SUNAT',
          });
        },
        error: (error) => {
          this.registrando = false;
          this.cdr.markForCheck();
          this.alerta.error({
            title: 'No se encontró el documento',
            message: mensajeDeError(error, 'Verifique el número e intente de nuevo'),
          });
        },
      });
  }

  private filaDesdeResultado(resultado: any): any | null {
    if (resultado.tipo === 'empresa' && resultado.id_empresa) {
      return {
        id_empresa: Number(resultado.id_empresa),
        ruc: resultado.numero_documento,
        razon_social: resultado.denominacion,
        nombre_comercial: resultado.nombre_comercial ?? '',
        direccion: resultado.direccion ?? '',
        telefonos: resultado.telefono ?? '',
        estado: resultado.estado ?? '',
        condicion: resultado.condicion ?? '',
      };
    }

    if (resultado.id_cliente) {
      const partes = String(resultado.denominacion ?? '').trim().split(/\s+/);
      return {
        id_cliente: Number(resultado.id_cliente),
        dni: resultado.numero_documento,
        nombre: partes[0] ?? resultado.denominacion,
        apellido_paterno: partes[1] ?? '',
        apellido_materno: partes.slice(2).join(' '),
        nombre_completo: resultado.denominacion,
        email: resultado.email ?? '',
        telefono: resultado.telefono ?? '',
        direccion: resultado.direccion ?? '',
      };
    }

    return null;
  }

  /** Inserta o reemplaza en la tabla sin recargar el listado. */
  private reflejarEnLista(item: any, tipo: Pestania): void {
    if (tipo === 'empresas') {
      const indice = this.empresas.findIndex((e) => Number(e.id_empresa) === Number(item.id_empresa));
      if (indice >= 0) {
        this.empresas[indice] = { ...this.empresas[indice], ...item };
        this.empresas = [...this.empresas];
      } else {
        this.empresas = [item, ...this.empresas];
      }
      return;
    }

    const indice = this.clientes.findIndex((c) => Number(c.id_cliente) === Number(item.id_cliente));
    if (indice >= 0) {
      this.clientes[indice] = { ...this.clientes[indice], ...item };
      this.clientes = [...this.clientes];
    } else {
      this.clientes = [item, ...this.clientes];
    }
  }

  // ── Edición ──────────────────────────────────────────────────

  editarPersona(cliente: any): void {
    this.editando = { ...cliente, tipo: 'cliente' };
    this.formularioPersona = {
      nombre: cliente.nombre ?? '',
      apellido_paterno: cliente.apellido_paterno ?? '',
      apellido_materno: cliente.apellido_materno ?? '',
      telefono: cliente.telefono ?? '',
      email: cliente.email ?? '',
      direccion: cliente.direccion ?? '',
    };
    this.panelAbierto = true;
  }

  editarEmpresa(empresa: any): void {
    this.editando = { ...empresa, tipo: 'empresa' };
    this.formularioEmpresa = {
      razon_social: empresa.razon_social ?? '',
      nombre_comercial: empresa.nombre_comercial ?? '',
      telefonos: Array.isArray(empresa.telefonos) ? empresa.telefonos.join(', ') : (empresa.telefonos ?? ''),
      direccion: empresa.direccion ?? '',
      departamento: empresa.departamento ?? '',
      provincia: empresa.provincia ?? '',
      distrito: empresa.distrito ?? '',
    };
    this.panelAbierto = true;
  }

  async eliminarPersona(cliente: any): Promise<void> {
    const id = Number(cliente?.id_cliente);
    if (!id || !this.esAdmin) return;

    const nombre = this.nombreDe(cliente);
    const ok = await this.alerta.confirm({
      title: `¿Eliminar a ${nombre}?`,
      message: cliente.tiene_cuenta
        ? 'Se quitará del padrón. Si tenía cuenta en la tienda, ese acceso quedará desactivado. No se puede deshacer.'
        : 'Se quitará del padrón de clientes. No se puede deshacer.',
      confirmText: 'Sí, eliminar',
    });
    if (!ok.isConfirmed) return;

    this.gestion.eliminarCliente(id).pipe(takeUntil(this.destruir$)).subscribe({
      next: () => {
        this.clientes = this.clientes.filter((c) => Number(c.id_cliente) !== id);
        if (this.editando && Number(this.editando.id_cliente) === id) {
          this.cerrarPanel();
        }
        this.cdr.markForCheck();
        this.alerta.toast({ type: 'success', title: 'Cliente eliminado' });
      },
      error: (error) => {
        this.cdr.markForCheck();
        const info = errorOperativo(error, 'No se pudo eliminar el cliente');
        this.alerta.error(info);
      },
    });
  }

  async eliminarEmpresa(empresa: any): Promise<void> {
    const id = Number(empresa?.id_empresa);
    if (!id || !this.esAdmin) return;

    const ok = await this.alerta.confirm({
      title: `¿Eliminar ${empresa.razon_social || 'esta empresa'}?`,
      message: 'Se quitará del padrón. Si tiene ventas o crédito, la operación será rechazada.',
      confirmText: 'Sí, eliminar',
    });
    if (!ok.isConfirmed) return;

    this.receptor.eliminarEmpresa(id).pipe(takeUntil(this.destruir$)).subscribe({
      next: () => {
        this.empresas = this.empresas.filter((e) => Number(e.id_empresa) !== id);
        if (this.editando && Number(this.editando.id_empresa) === id) {
          this.cerrarPanel();
        }
        this.cdr.markForCheck();
        this.alerta.toast({ type: 'success', title: 'Empresa eliminada' });
      },
      error: (error) => {
        this.cdr.markForCheck();
        const info = errorOperativo(error, 'No se pudo eliminar la empresa');
        this.alerta.error(info);
      },
    });
  }

  cerrarPanel(): void {
    if (this.guardando) return;
    this.panelAbierto = false;
    this.editando = null;
  }

  guardar(): void {
    if (!this.editando) return;

    const esEmpresa = this.editando.tipo === 'empresa';

    if (esEmpresa && !this.formularioEmpresa.razon_social.trim()) {
      this.alerta.toast({ type: 'warning', title: 'La razón social es obligatoria' });
      return;
    }
    if (!esEmpresa && !this.formularioPersona.nombre.trim()) {
      this.alerta.toast({ type: 'warning', title: 'El nombre es obligatorio' });
      return;
    }

    this.guardando = true;
    this.cdr.markForCheck();

    const enCurso = esEmpresa
      ? this.receptor.actualizarEmpresa(this.editando.id_empresa, this.formularioEmpresa)
      : this.receptor.actualizarCliente(this.editando.id_cliente, this.formularioPersona);

    enCurso.pipe(takeUntil(this.destruir$)).subscribe({
      next: () => {
        this.guardando = false;
        this.aplicarCambiosEnLista(esEmpresa);
        this.cdr.markForCheck();
        this.alerta.toast({ type: 'success', title: 'Datos actualizados' });
        this.cerrarPanel();
      },
      error: (error) => {
        this.guardando = false;
        this.cdr.markForCheck();
        this.alerta.error({ title: 'No se pudo guardar', message: mensajeDeError(error) });
      },
    });
  }

  /** Refleja la edición en la tabla sin volver a pedir toda la lista. */
  private aplicarCambiosEnLista(esEmpresa: boolean): void {
    if (esEmpresa) {
      const actualizado = {
        ...this.editando,
        ...this.formularioEmpresa,
        id_empresa: this.editando.id_empresa,
      };
      this.reflejarEnLista(actualizado, 'empresas');
      this.destacar(this.editando.id_empresa);
      return;
    }

    const actualizado = {
      ...this.editando,
      ...this.formularioPersona,
      id_cliente: this.editando.id_cliente,
      nombre_completo: [
        this.formularioPersona.nombre,
        this.formularioPersona.apellido_paterno,
        this.formularioPersona.apellido_materno,
      ].filter(Boolean).join(' '),
    };
    this.reflejarEnLista(actualizado, 'personas');
    this.destacar(this.editando.id_cliente);
  }

  private destacar(id: number): void {
    this.idDestacado = id;
    setTimeout(() => {
      this.idDestacado = null;
      this.cdr.markForCheck();
    }, 2600);
  }

  nombreDe(cliente: any): string {
    return cliente.nombre_completo?.trim()
      || [cliente.nombre, cliente.apellido_paterno, cliente.apellido_materno].filter(Boolean).join(' ')
      || 'Sin nombre';
  }

  telefonosDe(empresa: any): string {
    if (Array.isArray(empresa.telefonos)) return empresa.telefonos.join(', ');
    return empresa.telefonos ?? '';
  }

  identificarCliente(_indice: number, cliente: any): number {
    return cliente.id_cliente;
  }

  identificarEmpresa(_indice: number, empresa: any): number {
    return empresa.id_empresa;
  }
}
