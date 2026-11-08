import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, effect, inject, viewChild } from '@angular/core';
import { AyudaAtajosService, esCampoDeEscritura } from './ayuda-atajos.service';

interface Atajo {
  /** Teclas, una por cada `<kbd>`; las que van juntas se escriben «Ctrl K». */
  teclas: string[];
  texto: string;
}

interface GrupoAtajos {
  titulo: string;
  atajos: Atajo[];
}

const ES_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Ventana con todos los atajos de teclado del panel. Se abre con «?» (cuando no se
 * está escribiendo), desde el menú de usuario o desde la paleta de comandos.
 * Solo informa: no ejecuta nada.
 */
@Component({
  selector: 'app-ayuda-atajos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ayuda-atajos.component.html',
  styleUrl: './ayuda-atajos.component.scss',
})
export class AyudaAtajosComponent {
  protected readonly ayuda = inject(AyudaAtajosService);
  private readonly doc = inject(DOCUMENT);

  protected readonly botonCerrar = viewChild<ElementRef<HTMLButtonElement>>('cerrarBtn');
  protected readonly botonPie = viewChild<ElementRef<HTMLButtonElement>>('pieBtn');
  private enfocadoAntes: HTMLElement | null = null;

  protected readonly grupos: GrupoAtajos[] = [
    {
      titulo: 'Generales',
      atajos: [
        { teclas: [ES_MAC ? '⌘ K' : 'Ctrl K'], texto: 'Buscar o ir a una pantalla' },
        { teclas: ['?'], texto: 'Abrir esta ayuda' },
        { teclas: ['Esc'], texto: 'Cerrar paneles, ventanas y menús' },
      ],
    },
    {
      titulo: 'Al vender',
      atajos: [
        { teclas: ['Enter'], texto: 'Agregar el producto al carrito' },
        { teclas: ['↑', '↓'], texto: 'Elegir de la lista de resultados' },
        { teclas: ['Esc'], texto: 'Cerrar la lista de resultados' },
        { teclas: ['F2'], texto: 'Crear un producto nuevo (si tiene permiso)' },
        { teclas: ['F9'], texto: 'Cobrar' },
        { teclas: ['5*'], texto: 'Antes de escanear: llevar 5 unidades' },
      ],
    },
    {
      titulo: 'En los listados',
      atajos: [
        { teclas: ['Tab'], texto: 'Pasar al siguiente campo o botón' },
        { teclas: ['Shift', 'Tab'], texto: 'Volver al anterior' },
        { teclas: ['Enter'], texto: 'Usar el botón o enlace que tiene el cursor' },
        { teclas: ['Esc'], texto: 'Cerrar la ficha o ventana abierta' },
      ],
    },
  ];

  constructor() {
    effect(() => {
      if (this.ayuda.abierta()) {
        this.enfocadoAntes = this.doc.activeElement as HTMLElement | null;
      }
    });
    effect(() => {
      const boton = this.botonCerrar();
      if (boton) queueMicrotask(() => boton.nativeElement.focus());
    });
  }

  /** «?» abre la ayuda, salvo que se esté escribiendo (ahí es un carácter más). Único listener de la ayuda. */
  @HostListener('document:keydown', ['$event'])
  protected alTeclaGlobal(evento: KeyboardEvent): void {
    if (evento.key !== '?' || evento.ctrlKey || evento.metaKey || evento.altKey || evento.defaultPrevented) return;
    if (this.ayuda.abierta() || esCampoDeEscritura(evento.target)) return;
    evento.preventDefault();
    this.ayuda.abrir();
  }

  protected cerrar(): void {
    this.ayuda.cerrar();
    const volver = this.enfocadoAntes;
    this.enfocadoAntes = null;
    if (volver && this.doc.contains(volver)) queueMicrotask(() => volver.focus());
  }

  /** El foco se queda dentro de la ventana: Tab del último botón vuelve al primero y al revés. */
  protected alTabular(evento: KeyboardEvent): void {
    const primero = this.botonCerrar()?.nativeElement;
    const ultimo = this.botonPie()?.nativeElement;
    if (!primero || !ultimo) return;
    const actual = this.doc.activeElement;
    if (evento.shiftKey && actual === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && actual === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }
}
