import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  forwardRef,
  inject,
} from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';

import {
  ResolucionUnidad,
  UNIDAD_POR_DEFECTO,
  UnidadAmigable,
  UnidadMedidaService,
} from '../../../admin/service/unidad-medida.service';

interface GrupoOpciones {
  etiqueta: string;
  unidades: UnidadAmigable[];
}

/**
 * Selector de unidad de medida: «Kilogramo (kg)» en vez de KGM, con los frecuentes arriba.
 * Funciona con `[(ngModel)]` y el valor que viaja es siempre el código SUNAT.
 *
 * Valor que llega y no está en la lista:
 *  1. sinónimo (UND, kg, Plancha) → se reemplaza por su código y se avisa;
 *  2. código válido pero oculto (MIL, UM…) → queda como opción extra en «Otros»;
 *  3. cualquier otra cosa → opción «“X” — no válida, elija una», control inválido.
 * Nunca deja el select en blanco: un valor vacío se muestra como NIU (no se emite al modelo,
 * porque el primer writeValue de ngModel siempre es null y pisaría el valor real; el formulario
 * que guarda convierte vacío en NIU).
 */
@Component({
  selector: 'app-selector-unidad',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectorUnidadComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => SelectorUnidadComponent), multi: true },
  ],
  template: `
    <select class="adm-select" [attr.id]="idCampo" [disabled]="deshabilitado" [class.is-invalid]="resolucion.estado === 'invalida'"
            (change)="elegir($any($event.target).value)" (blur)="alTocar()">
      <option *ngIf="resolucion.estado === 'invalida'" [value]="resolucion.original" selected>
        “{{ resolucion.original }}” — no válida, elija una
      </option>
      <optgroup *ngIf="frecuentes.length" label="Frecuentes">
        <option *ngFor="let u of frecuentes" [value]="u.codigo" [selected]="u.codigo === valorSeleccionado">{{ etiqueta(u) }}</option>
      </optgroup>
      <optgroup *ngFor="let g of grupos" [label]="g.etiqueta">
        <option *ngFor="let u of g.unidades" [value]="u.codigo" [selected]="!u.frecuente && u.codigo === valorSeleccionado">{{ etiqueta(u) }}</option>
      </optgroup>
      <optgroup *ngIf="extra" label="Otros">
        <option [value]="extra" [selected]="extra === valorSeleccionado">{{ extra }}</option>
      </optgroup>
    </select>
    <p class="adm-ayuda" *ngIf="aviso">{{ aviso }}</p>
    <p class="adm-ayuda" *ngIf="resolucion.estado === 'invalida'">Elija una unidad de la lista.</p>
    <p class="adm-ayuda" *ngIf="valorSeleccionado && resolucion.estado !== 'invalida'">Código SUNAT: {{ valorSeleccionado }}</p>
  `,
  styles: [`
    :host { display: block; }
    select { width: 100%; }
    .is-invalid { border-color: var(--adm-peligro, #c0392b); }
  `],
})
export class SelectorUnidadComponent implements ControlValueAccessor, Validator, OnInit {
  /** Id del <select>, para que el <label for> del formulario lo enfoque. */
  @Input() idCampo: string | null = null;

  private readonly servicio = inject(UnidadMedidaService);
  private readonly cdr = inject(ChangeDetectorRef);

  frecuentes: UnidadAmigable[] = [];
  grupos: GrupoOpciones[] = [];
  /** Código válido pero oculto del catálogo, que se ofrece en «Otros». */
  extra = '';
  aviso = '';
  valorSeleccionado = UNIDAD_POR_DEFECTO;
  resolucion: ResolucionUnidad = { estado: 'ok', codigo: UNIDAD_POR_DEFECTO, original: '' };
  deshabilitado = false;

  /** Lo último que llegó por writeValue (se vuelve a resolver cuando termina de cargar el catálogo). */
  private recibido: string | null | undefined = undefined;
  private alCambiar: (valor: string) => void = () => undefined;
  private alTocarFn: () => void = () => undefined;
  private alCambiarValidacion: () => void = () => undefined;

  ngOnInit(): void {
    this.armarOpciones();
    this.servicio.cargar().subscribe(() => {
      this.armarOpciones();
      // Sin writeValue previo no hay valor que resolver (evita pisar el modelo con NIU).
      if (this.recibido !== undefined) this.aplicar(this.recibido, true);
    });
  }

  etiqueta(u: UnidadAmigable): string {
    return this.servicio.etiqueta(u);
  }

  writeValue(valor: string | null | undefined): void {
    this.recibido = valor ?? null;
    this.aplicar(this.recibido, true);
  }

  registerOnChange(fn: (valor: string) => void): void { this.alCambiar = fn; }
  registerOnTouched(fn: () => void): void { this.alTocarFn = fn; }
  registerOnValidatorChange(fn: () => void): void { this.alCambiarValidacion = fn; }

  setDisabledState(deshabilitado: boolean): void {
    this.deshabilitado = deshabilitado;
    this.cdr.markForCheck();
  }

  validate(_control: AbstractControl): ValidationErrors | null {
    return this.resolucion.estado === 'invalida' ? { unidadNoValida: this.resolucion.original } : null;
  }

  alTocar(): void {
    this.alTocarFn();
  }

  elegir(codigo: string): void {
    this.recibido = codigo;
    this.aplicar(codigo, false);
    this.alCambiar(this.valorSeleccionado);
    this.alCambiarValidacion();
  }

  /**
   * Decide qué se ve para el valor recibido. Si es un sinónimo se corrige y, solo cuando el
   * cambio vino del modelo (no del usuario), se avisa y se emite el código nuevo.
   */
  private aplicar(valor: string | null, desdeModelo: boolean): void {
    const r = this.servicio.resolver(valor);
    this.resolucion = r;
    this.aviso = '';
    this.extra = '';

    if (r.estado === 'invalida' || r.estado === 'pendiente') {
      // Sin catálogo del servidor no se puede afirmar que sea inválida: se conserva como opción extra.
      this.valorSeleccionado = r.original;
      if (r.estado === 'pendiente') this.extra = r.original;
    } else {
      this.valorSeleccionado = r.codigo;
      if (r.estado === 'oculta' || (r.estado === 'corregida' && !r.unidad)) this.extra = r.codigo;
    }

    if (desdeModelo && r.estado === 'corregida') {
      const nombre = r.unidad ? this.servicio.etiqueta(r.unidad) : r.codigo;
      this.aviso = `Se corrigió a ${nombre}`;
      // Fuera del ciclo actual: el modelo se actualiza sin tocar un valor ya comprobado.
      Promise.resolve().then(() => {
        this.alCambiar(r.codigo);
        this.alCambiarValidacion();
        this.cdr.markForCheck();
      });
    }
    this.alCambiarValidacion();
    this.cdr.markForCheck();
  }

  private armarOpciones(): void {
    const visibles = [...this.servicio.mapa.values()];
    this.frecuentes = visibles.filter((u) => u.frecuente);
    this.grupos = this.servicio.grupos
      .map((g) => ({ etiqueta: g, unidades: visibles.filter((u) => u.grupo === g) }))
      .filter((g) => g.unidades.length);
    this.cdr.markForCheck();
  }
}
