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

import { AlertService } from '../../../../shared/services/alert.service';
import { GestionService } from '../../service/gestion.service';
import { ReceptorService } from '../../../service/receptor.service';
import { mensajeDeError } from '../../../service/api-base.service';

type Pestania = 'personas' | 'empresas';

@Component({
  selector: 'app-clientes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.css',
})
export class ClientesComponent implements OnInit, OnDestroy {

  pestania: Pestania = 'personas';

  clientes: any[] = [];
  empresas: any[] = [];
  cargando = false;
  filtro = '';

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

  constructor(
    private readonly gestion: GestionService,
    private readonly receptor: ReceptorService,
    private readonly alerta: AlertService,
  ) {}

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
    this.cdr.markForCheck();

    this.gestion.getClientes().pipe(takeUntil(this.destruir$)).subscribe({
      next: (lista) => {
        this.cargando = false;
        this.clientes = Array.isArray(lista) ? [...lista] : [];
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.cargando = false;
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
          this.cdr.markForCheck();
        },
      });
  }

  cambiarPestania(pestania: Pestania): void {
    this.pestania = pestania;
    this.filtro = '';
  }

  get personasFiltradas(): any[] {
    const texto = this.filtro.trim().toLowerCase();
    if (!texto) return this.clientes;

    return this.clientes.filter((c) =>
      `${c.nombre_completo ?? c.nombre ?? ''} ${c.dni ?? ''} ${c.email ?? ''} ${c.telefono ?? ''}`
        .toLowerCase()
        .includes(texto),
    );
  }

  get empresasFiltradas(): any[] {
    const texto = this.filtro.trim().toLowerCase();
    if (!texto) return this.empresas;

    return this.empresas.filter((e) =>
      `${e.razon_social ?? ''} ${e.nombre_comercial ?? ''} ${e.ruc ?? ''}`.toLowerCase().includes(texto),
    );
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
