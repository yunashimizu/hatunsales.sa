import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { mensajeDeError } from '../../../../service/api-base.service';
import { MINIMO_CARACTERES_UBIGEO, Ubigeo, UbigeoService } from '../../../../service/ubigeo.service';

export interface UbigeoElegido {
  codigo: string | null;
  /** «150119 - LURIN - LIMA - LIMA» (la misma forma que `ubigeo_texto` del backend). */
  texto: string | null;
}

type EstadoBusqueda = 'inactivo' | 'buscando' | 'listo' | 'error';

/** Espera tras la última tecla: una búsqueda por palabra, no una por letra. */
const ESPERA_MS = 300;

/**
 * Buscador de distritos del catálogo INEI (GET /ubigeo?q=) para la partida y la llegada de la guía.
 * Solo vale un distrito elegido de la lista: si se edita el texto después de elegir, el código se
 * descarta hasta elegir otro (así nunca viaja un ubigeo escrito a mano que SUNAT rechace).
 */
@Component({
  selector: 'app-ubigeo-buscador',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ubigeo-buscador.component.html',
  styleUrl: './ubigeo-buscador.component.css',
})
export class UbigeoBuscadorComponent implements OnInit, OnChanges {
  @Input({ required: true }) idCampo!: string;
  @Input() etiqueta = 'Distrito (ubigeo)';
  @Input() codigo: string | null = null;
  @Input() texto: string | null = null;
  /** Error de validación del backend para este campo. */
  @Input() error: string | null = null;
  @Input() minimo = MINIMO_CARACTERES_UBIGEO;
  @Input() deshabilitado = false;
  @Output() readonly cambio = new EventEmitter<UbigeoElegido>();

  consulta = '';
  resultados: Ubigeo[] = [];
  estado: EstadoBusqueda = 'inactivo';
  mensajeError = '';
  activo = -1;
  abierto = false;

  private readonly api = inject(UbigeoService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly escrito$ = new Subject<string>();
  /** Último código que este buscador avisó al formulario: su eco en `codigo` no debe borrar lo que se escribe. */
  private emitido: string | null | undefined = undefined;

  get idLista(): string {
    return `${this.idCampo}-lista`;
  }

  get idAyuda(): string {
    return `${this.idCampo}-ayuda`;
  }

  /** Texto de ayuda o estado bajo el campo (y si es un error). */
  get ayuda(): { texto: string; error: boolean } {
    if (this.error) return { texto: this.error, error: true };
    if (this.estado === 'error') return { texto: this.mensajeError, error: true };
    if (this.estado === 'buscando') return { texto: 'Buscando distritos…', error: false };
    if (this.estado === 'listo' && !this.resultados.length) {
      return { texto: `Ningún distrito coincide con «${this.consulta.trim()}». Pruebe con otro nombre o con el código INEI.`, error: false };
    }
    if (this.codigo) return { texto: `Código INEI ${this.codigo}`, error: false };
    const escrito = this.consulta.trim();
    if (escrito && escrito.length < this.minimo) return { texto: `Escriba al menos ${this.minimo} letras o dígitos.`, error: false };
    if (escrito) return { texto: 'Elija un distrito de la lista.', error: false };
    return { texto: 'Busque por distrito, provincia o código INEI (p. ej. Lurín o 150119).', error: false };
  }

  ngOnInit(): void {
    this.escrito$
      .pipe(
        debounceTime(ESPERA_MS),
        switchMap((q) => {
          if (q.trim().length < this.minimo) return of(null);
          this.estado = 'buscando';
          this.cdr.markForCheck();
          return this.api.buscar(q, this.minimo).pipe(
            map((lista) => ({ lista, error: '' })),
            // El fallo se muestra bajo el campo (role="alert"); escribir de nuevo vuelve a buscar.
            catchError((e) => of({ lista: [] as Ubigeo[], error: mensajeDeError(e, 'No se pudo buscar el distrito') })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((r) => {
        if (r === null) {
          this.estado = 'inactivo';
          this.resultados = [];
          this.abierto = false;
        } else if (r.error) {
          this.estado = 'error';
          this.mensajeError = r.error;
          this.resultados = [];
          this.abierto = false;
        } else {
          this.estado = 'listo';
          this.resultados = r.lista;
          this.activo = r.lista.length ? 0 : -1;
          this.abierto = r.lista.length > 0;
        }
        this.cdr.markForCheck();
      });
  }

  ngOnChanges(cambios: SimpleChanges): void {
    if (!cambios['codigo'] && !cambios['texto']) return;
    if (this.codigo === this.emitido) return;
    this.emitido = this.codigo;
    this.consulta = this.texto || this.codigo || '';
    this.estado = 'inactivo';
    if (this.codigo && !this.texto) this.resolverNombre(this.codigo);
  }

  alEscribir(valor: string): void {
    this.consulta = valor ?? '';
    if (this.codigo) this.avisar(null, null);
    this.escrito$.next(this.consulta);
  }

  alTeclear(evento: KeyboardEvent): void {
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      if (!this.resultados.length) return;
      evento.preventDefault();
      this.abierto = true;
      const paso = evento.key === 'ArrowDown' ? 1 : -1;
      this.activo = (this.activo + paso + this.resultados.length) % this.resultados.length;
    } else if (evento.key === 'Enter') {
      // Enter elige la sugerencia marcada y nunca envía el formulario que contiene al buscador.
      evento.preventDefault();
      const elegido = this.resultados[this.activo] ?? (this.resultados.length === 1 ? this.resultados[0] : undefined);
      if (this.abierto && elegido) this.elegir(elegido);
    } else if (evento.key === 'Escape' && this.abierto) {
      evento.stopPropagation();
      this.abierto = false;
    }
  }

  /** Al salir con un código completo escrito que está en la lista, se toma ese distrito. */
  alSalir(): void {
    const escrito = this.consulta.trim();
    const exacto = /^\d{6}$/.test(escrito) ? this.resultados.find((u) => u.codigo === escrito) : undefined;
    if (exacto) this.elegir(exacto);
    this.abierto = false;
  }

  elegir(ubigeo: Ubigeo): void {
    const texto = `${ubigeo.codigo} - ${ubigeo.texto}`;
    this.consulta = texto;
    this.resultados = [];
    this.abierto = false;
    this.estado = 'inactivo';
    // Descarta una búsqueda que aún estaba esperando su turno.
    this.escrito$.next('');
    this.avisar(ubigeo.codigo, texto);
  }

  limpiar(): void {
    this.consulta = '';
    this.resultados = [];
    this.abierto = false;
    this.estado = 'inactivo';
    this.escrito$.next('');
    this.avisar(null, null);
  }

  idOpcion(indice: number): string {
    return `${this.idCampo}-op-${indice}`;
  }

  private avisar(codigo: string | null, texto: string | null): void {
    this.emitido = codigo;
    this.cambio.emit({ codigo, texto });
  }

  /** Un código guardado sin su nombre (p. ej. de una guía antigua): se muestra con el nombre del catálogo. */
  private resolverNombre(codigo: string): void {
    this.api
      .obtener(codigo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (u) => {
          if (this.codigo !== u.codigo) return;
          this.consulta = `${u.codigo} - ${u.texto}`;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.estado = 'error';
          this.mensajeError = mensajeDeError(e, `No se encontró el distrito ${codigo} en el catálogo INEI`);
          this.cdr.markForCheck();
        },
      });
  }
}
