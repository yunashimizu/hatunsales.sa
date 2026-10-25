import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConsultaCatalogo, FiltrosDisponibles } from '../../models/tienda.models';

@Component({
  selector: 'app-filtros',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './filtros.component.html',
  styleUrl: './filtros.component.css',
})
export class FiltrosComponent implements OnChanges {

  @Input() disponibles: FiltrosDisponibles = {
    categorias: [], marcas: [], precio_min: 0, precio_max: 0, atributos: [],
  };
  @Input() seleccion: ConsultaCatalogo = {};
  @Input() abiertoEnMovil = false;

  @Output() cambio = new EventEmitter<ConsultaCatalogo>();
  @Output() limpiar = new EventEmitter<void>();
  @Output() cerrarEnMovil = new EventEmitter<void>();

  /** Botón de cierre del cajón móvil: recibe el foco al abrirse (solo presentación). */
  @ViewChild('cerrar') private botonCerrar?: ElementRef<HTMLButtonElement>;

  /** Secciones colapsables; se guardan por nombre para no perder el estado al re-renderizar. */
  private colapsadas = new Set<string>();

  get totalActivos(): number {
    const s = this.seleccion;
    return [
      s.id_categoria, s.id_marca, s.precio_min, s.precio_max,
      s.solo_stock || undefined, s.solo_oferta || undefined,
    ].filter((v) => v !== undefined && v !== null).length + Object.keys(s.atributos ?? {}).length;
  }

  /**
   * Tramo (0–1) del riel de precios que cubre la selección actual dentro del rango
   * disponible. Solo presentación: el riel es una cinta métrica, no un control.
   */
  get tramoPrecio(): { desde: number; ancho: number } {
    const { precio_min: piso, precio_max: techo } = this.disponibles;
    const rango = techo - piso;
    if (!(rango > 0)) return { desde: 0, ancho: 1 };
    const acotar = (v: number): number => Math.min(1, Math.max(0, v));
    const a = acotar((Number(this.seleccion.precio_min ?? piso) - piso) / rango);
    const b = acotar((Number(this.seleccion.precio_max ?? techo) - piso) / rango);
    return { desde: Math.min(a, b), ancho: Math.abs(b - a) };
  }

  estaColapsada(nombre: string): boolean {
    return this.colapsadas.has(nombre);
  }

  alternar(nombre: string): void {
    this.colapsadas.has(nombre) ? this.colapsadas.delete(nombre) : this.colapsadas.add(nombre);
  }

  elegirCategoria(id?: number): void {
    this.emitir({ id_categoria: this.seleccion.id_categoria === id ? undefined : id });
  }

  elegirMarca(id?: number): void {
    this.emitir({ id_marca: this.seleccion.id_marca === id ? undefined : id });
  }

  elegirAtributo(nombre: string, valor: string): void {
    const atributos = { ...(this.seleccion.atributos ?? {}) };
    atributos[nombre] === valor ? delete atributos[nombre] : (atributos[nombre] = valor);
    this.emitir({ atributos });
  }

  atributoActivo(nombre: string, valor: string): boolean {
    return this.seleccion.atributos?.[nombre] === valor;
  }

  cambiarPrecio(): void {
    this.emitir({});
  }

  alternarStock(): void {
    this.emitir({ solo_stock: !this.seleccion.solo_stock });
  }

  alternarOferta(): void {
    this.emitir({ solo_oferta: !this.seleccion.solo_oferta });
  }

  ngOnChanges(cambios: SimpleChanges): void {
    // Al abrirse como cajón (móvil) el foco pasa a su botón de cierre.
    const abierto = cambios['abiertoEnMovil'];
    if (abierto && !abierto.firstChange && abierto.currentValue === true) {
      setTimeout(() => this.botonCerrar?.nativeElement.focus({ preventScroll: true }));
    }
  }

  /** Esc cierra el cajón móvil (con el panel cerrado no hace nada). */
  @HostListener('document:keydown.escape')
  alPulsarEscape(): void {
    if (this.abiertoEnMovil) this.cerrarEnMovil.emit();
  }

  private emitir(parcial: Partial<ConsultaCatalogo>): void {
    this.cambio.emit({ ...this.seleccion, ...parcial, pagina: 1 });
  }
}
