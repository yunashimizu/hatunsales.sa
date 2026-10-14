import {
  Directive,
  ElementRef,
  Renderer2,
  booleanAttribute,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { AbstractControl, ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';
import {
  ErrorNumero,
  ReglasResueltas,
  TipoNumero,
  esTipoNumero,
  formatearNumero,
  leerNumero,
  mensajeDeErrorNumero,
  resolverReglas,
  validarNumero,
} from '../utils/numero.util';

/** Qué hacer al salir de un campo vacío. */
export type VacioNumero = 'nulo' | 'cero' | 'revertir';

/** Error que expone `validate()` (clave `numero` del control). */
export interface ErrorValidacionNumero {
  error: ErrorNumero;
  motivo: string;
}

const MAQUINA = /^-?\d+(\.\d+)?$/;
const PERMITIDOS = /^[\d.,\s'’ ]*$/;
const PERMITIDOS_CON_SIGNO = /^[\d.,\s'’ +\-−]*$/;

function aNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(String(valor).trim());
  return Number.isFinite(n) ? n : null;
}

function aTipo(valor: unknown): TipoNumero {
  return esTipoNumero(valor) ? valor : 'cantidad';
}

function aVacio(valor: unknown): VacioNumero {
  return valor === 'cero' || valor === 'revertir' ? valor : 'nulo';
}

/**
 * Campo numérico escrito a mano: `<input appNumero>` (ControlValueAccessor + Validator).
 *
 * Usa type="text" + inputmode (teclado numérico en el móvil) en vez de
 * type="number", que depende del idioma del navegador ("10.000" → 10) y no
 * admite separadores de miles. Acepta "10000", "10.000", "10,000",
 * "1'000,000", "1 000 000", "S/ 1,200.50"… (reglas en numero.util.ts).
 *
 * - Mientras se escribe NO toca el texto; el modelo recibe el número limpio
 *   en cuanto el texto es válido y está en rango (nunca recibe un texto).
 * - Al salir del campo lo muestra con miles ("10,000", "1,200.50") y resuelve
 *   el vacío según `vacio`. Al entrar lo muestra sin miles y lo selecciona.
 * - Errores en español: `invalido()` / `motivo()` (signals) para pintarlos
 *   junto al campo; además pone la clase `num-invalido`, aria-invalid, title
 *   y, si se indica `errorId`, aria-describedby.
 * - ↑/↓ suman o restan `paso`; Enter confirma como al salir.
 *
 * Presets (atributo appNumero): cantidad (por defecto: enteros 0–100,000,000),
 * entero (hasta 9,007,199,254,740,991), decimal (2 dec.), moneda (2 dec.,
 * muestra siempre los céntimos), porcentaje (0–100, 2 dec.) y peso (3 dec.).
 */
@Directive({
  selector: 'input[appNumero]',
  standalone: true,
  exportAs: 'appNumero',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => NumeroDirective), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => NumeroDirective), multi: true },
  ],
  host: {
    '(beforeinput)': 'alAntesDeEscribir($event)',
    '(input)': 'alEscribir()',
    '(focus)': 'alEnfocar()',
    '(blur)': 'alSalir()',
    '(keydown)': 'alTeclear($event)',
    '(compositionstart)': 'componiendo = true',
    '(compositionend)': 'alTerminarComposicion()',
  },
})
export class NumeroDirective implements ControlValueAccessor, Validator {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private readonly r = inject(Renderer2);

  /* ------------------------------------------------------------------ entradas */

  /** Preset: 'cantidad' (por defecto), 'entero', 'decimal', 'moneda', 'porcentaje' o 'peso'. */
  readonly tipo = input<TipoNumero, unknown>('cantidad', { alias: 'appNumero', transform: aTipo });
  readonly decimalesEntrada = input<number | null, unknown>(null, { alias: 'decimales', transform: aNumero });
  /** Mínimo (por defecto 0: no se puede escribir "-"). */
  readonly minEntrada = input<number | null, unknown>(null, { alias: 'min', transform: aNumero });
  readonly maxEntrada = input<number | null, unknown>(null, { alias: 'max', transform: aNumero });
  /** Incremento de ↑/↓ (por defecto 1 en cantidad/entero/porcentaje, 0 en el resto = sin flechas). */
  readonly pasoEntrada = input<number | null, unknown>(null, { alias: 'paso', transform: aNumero });
  /** Al salir vacío: 'nulo' (null, por defecto), 'cero' (el mínimo ≥ 0) o 'revertir' (último valor). */
  readonly vacio = input<VacioNumero, unknown>('nulo', { transform: aVacio });
  /** Fuera de rango al salir: recorta al límite en vez de marcar el error. */
  readonly ajustarAlRango = input(false, { transform: booleanAttribute });
  readonly seleccionarAlEnfocar = input(true, { transform: booleanAttribute });
  /** id del texto de error (se añade a aria-describedby mientras haya error). */
  readonly errorId = input<string | null>(null);

  /** Reglas efectivas (preset + entradas). */
  readonly reglas = computed<ReglasResueltas>(() =>
    resolverReglas({
      tipo: this.tipo(),
      decimales: this.decimalesEntrada(),
      min: this.minEntrada(),
      max: this.maxEntrada(),
    }),
  );
  readonly paso = computed(() => {
    const p = this.pasoEntrada();
    return p !== null && p > 0 ? p : this.reglas().paso;
  });
  private readonly modoTeclado = computed(() => {
    if (this.reglas().min < 0) return 'text'; // los teclados numéricos de iOS no tienen "-"
    return this.reglas().decimales > 0 ? 'decimal' : 'numeric';
  });

  /* ------------------------------------------------------------------ estado */

  private readonly error = signal<ErrorNumero | null>(null);
  private readonly _motivo = signal('');
  /** El texto actual no es un número válido para este campo. */
  readonly invalido = computed(() => this.error() !== null);
  /** Mensaje en español del error ('' si no hay). */
  readonly motivo = this._motivo.asReadonly();

  protected componiendo = false;
  private enfocado = false;
  private deshabilitado = false;
  /** Último valor entregado al modelo (o escrito desde él). */
  private ultimoEmitido: number | null = null;
  /** Último valor no vacío (para vacio = 'revertir'). */
  private ultimoNoVacio: number | null = null;
  private tituloOriginal: string | null = null;
  private errorPintado = false;

  private onChange: (valor: number | null) => void = () => {};
  private onTouched: () => void = () => {};
  private onValidatorChange: () => void = () => {};

  constructor() {
    if (this.el.getAttribute('type') !== 'text') this.r.setAttribute(this.el, 'type', 'text');
    this.ponerSiFalta('autocomplete', 'off');
    this.ponerSiFalta('autocorrect', 'off');
    this.ponerSiFalta('autocapitalize', 'off');
    this.ponerSiFalta('spellcheck', 'false');
    this.ponerSiFalta('maxlength', '24');

    // Teclado del móvil y revalidación cuando cambian las reglas ([max]="stock"…).
    effect(() => {
      this.r.setAttribute(this.el, 'inputmode', this.modoTeclado());
      this.reglas();
      untracked(() => this.revalidarPorReglas());
    });
  }

  /* ------------------------------------------------------------------ API */

  /** Enfoca el campo (p. ej. el primero inválido al guardar). */
  enfocar(): void {
    this.el.focus();
  }

  /** true si el campo está deshabilitado (primerNumeroInvalido lo salta). */
  get estaDeshabilitado(): boolean {
    return this.deshabilitado || this.el.disabled;
  }

  /**
   * Confirma el texto como al salir del campo (resuelve el vacío, recorta o
   * marca el rango y formatea). La usa primerNumeroInvalido antes de guardar.
   */
  confirmar(): void {
    this.confirmarTexto(!this.enfocado);
  }

  /* ------------------------------------------------------------------ eventos */

  protected alAntesDeEscribir(evento: Event): void {
    const e = evento as InputEvent;
    if (e.inputType !== 'insertText' || !e.data) return;
    const permitidos = this.reglas().min < 0 ? PERMITIDOS_CON_SIGNO : PERMITIDOS;
    const extra = this.reglas().tipo === 'porcentaje' ? e.data.replace(/%/g, '') : e.data;
    if (!permitidos.test(extra)) e.preventDefault();
  }

  protected alEscribir(): void {
    if (this.componiendo) return;
    const resultado = validarNumero(this.el.value, this.reglas());

    if (resultado.vacio) {
      this.ponerError(null);
      if (this.vacio() === 'nulo') this.emitir(null);
      return;
    }
    if (resultado.valido) {
      this.ponerError(null);
      this.emitir(resultado.valor);
      return;
    }
    // Formato, decimales y máximo se avisan al instante; el mínimo, al salir
    // (al escribir "15" con mínimo 10, el "1" no es un error todavía), salvo
    // que el error ya estuviera a la vista: entonces sigue hasta corregirlo.
    const fueraDeRango = resultado.error === 'minimo' || resultado.error === 'maximo';
    if (this.ajustarAlRango() && fueraDeRango) {
      this.ponerError(null); // se recorta al salir
      return;
    }
    if (resultado.error === 'minimo') {
      this.ponerError(this.error() !== null ? 'minimo' : null);
      return;
    }
    this.ponerError(resultado.error);
  }

  protected alTerminarComposicion(): void {
    this.componiendo = false;
    this.alEscribir();
  }

  protected alEnfocar(): void {
    this.enfocado = true;
    if (this.estaDeshabilitado || this.el.readOnly) return;
    const lectura = leerNumero(this.el.value, this.reglas().decimales);
    // "1,234" → "1234": editar con miles cambia el significado al borrar cifras.
    if (lectura.valido && lectura.valor !== null) this.escribir(this.texto(lectura.valor, false));
    if (this.seleccionarAlEnfocar()) {
      setTimeout(() => {
        if (this.enfocado) this.el.select();
      });
    }
  }

  protected alSalir(): void {
    this.enfocado = false;
    this.confirmarTexto(true);
    this.onTouched();
  }

  protected alTeclear(evento: KeyboardEvent): void {
    if (evento.key === 'Enter' && !evento.isComposing && !this.componiendo) {
      // Enter = confirmar (los (keyup.enter) de la página ya leen el valor resuelto).
      this.confirmarTexto(false);
      return;
    }
    const paso = this.paso();
    if (paso <= 0 || (evento.key !== 'ArrowUp' && evento.key !== 'ArrowDown')) return;
    if (evento.altKey || evento.ctrlKey || evento.metaKey || this.el.readOnly || this.estaDeshabilitado) return;
    evento.preventDefault();
    const reglas = this.reglas();
    const lectura = leerNumero(this.el.value, reglas.decimales);
    const base = lectura.valido ? (lectura.valor ?? this.ultimoNoVacio ?? 0) : (this.ultimoEmitido ?? 0);
    const nuevo = this.recortar(base + (evento.key === 'ArrowUp' ? paso : -paso), reglas);
    this.escribir(this.texto(nuevo, false));
    this.ponerError(null);
    this.emitir(nuevo);
  }

  /* ------------------------------------------------------------------ ControlValueAccessor */

  writeValue(valor: unknown): void {
    const numero = this.desdeModelo(valor);
    this.ultimoEmitido = numero;
    if (numero !== null) this.ultimoNoVacio = numero;
    this.ponerError(null);

    if (this.enfocado) {
      // No mover el cursor si lo que hay escrito ya vale eso.
      const actual = leerNumero(this.el.value, this.reglas().decimales);
      if (actual.valido && actual.valor === numero) return;
      this.escribir(numero === null ? '' : this.texto(numero, false));
      return;
    }
    this.escribir(numero === null ? '' : this.texto(numero, true));
  }

  registerOnChange(fn: (valor: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(deshabilitado: boolean): void {
    this.deshabilitado = deshabilitado;
    this.r.setProperty(this.el, 'disabled', deshabilitado);
  }

  /* ------------------------------------------------------------------ Validator */

  validate(_control: AbstractControl): ValidationErrors | null {
    const error = this.error();
    if (!error) return null;
    const detalle: ErrorValidacionNumero = { error, motivo: this._motivo() };
    return { numero: detalle };
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  /* ------------------------------------------------------------------ internos */

  /** Lo que haría al salir del campo: vacío, rango y formato. */
  private confirmarTexto(formatear: boolean): void {
    if (this.componiendo) return;
    const reglas = this.reglas();
    const resultado = validarNumero(this.el.value, reglas);

    if (resultado.vacio) {
      const modo = this.vacio();
      const valor =
        modo === 'cero' ? Math.max(0, reglas.min) : modo === 'revertir' ? this.ultimoNoVacio : null;
      this.ponerError(null);
      this.emitir(valor);
      this.escribir(valor === null ? '' : this.texto(valor, formatear));
      return;
    }

    if (!resultado.valido && resultado.error !== 'minimo' && resultado.error !== 'maximo') {
      this.ponerError(resultado.error); // formato o decimales: se conserva el texto
      return;
    }

    let valor = resultado.valor;
    if (!resultado.valido) {
      if (!this.ajustarAlRango() || valor === null) {
        this.ponerError(resultado.error);
        return;
      }
      valor = this.recortar(valor, reglas);
    }

    this.ponerError(null);
    this.emitir(valor);
    if (valor !== null) this.escribir(this.texto(valor, formatear));
  }

  /** Cambiaron min/max/decimales: el mismo texto puede haber pasado a ser (in)válido. */
  private revalidarPorReglas(): void {
    if (!this.el.value.trim()) {
      this.ponerError(null);
      return;
    }
    const resultado = validarNumero(this.el.value, this.reglas());
    if (resultado.valido) {
      this.ponerError(null);
      return;
    }
    // Un mínimo pendiente solo se marca si el campo ya no se está editando.
    if (resultado.error === 'minimo' && this.enfocado) return;
    if (this.ajustarAlRango() && (resultado.error === 'minimo' || resultado.error === 'maximo')) return;
    this.ponerError(resultado.error);
  }

  private desdeModelo(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === '') return null;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
    if (typeof valor === 'string') {
      const t = valor.trim();
      if (!t) return null;
      // NUMERIC de la BD ("5.000" = 5, no 5000) y números serializados.
      if (MAQUINA.test(t)) return Number(t);
      return leerNumero(t, this.reglas().decimales).valor;
    }
    return null;
  }

  private texto(valor: number, conMiles: boolean): string {
    const reglas = this.reglas();
    return formatearNumero(valor, reglas.decimales, conMiles, reglas.minDecimales);
  }

  private recortar(valor: number, reglas: ReglasResueltas): number {
    return Math.min(reglas.max, Math.max(reglas.min, valor));
  }

  private emitir(valor: number | null): void {
    if (valor !== null) this.ultimoNoVacio = valor;
    if (Object.is(valor, this.ultimoEmitido)) return;
    this.ultimoEmitido = valor;
    this.onChange(valor);
  }

  private escribir(texto: string): void {
    if (this.el.value !== texto) this.r.setProperty(this.el, 'value', texto);
  }

  private ponerError(error: ErrorNumero | null): void {
    const mensaje = error ? mensajeDeErrorNumero(error, this.reglas()) : '';
    const cambio = this.error() !== error || this._motivo() !== mensaje;
    this.error.set(error);
    this._motivo.set(mensaje);
    this.pintar(error !== null, mensaje);
    if (cambio) this.onValidatorChange();
  }

  /** Clase num-invalido, aria-invalid, title y aria-describedby. */
  private pintar(conError: boolean, mensaje: string): void {
    const id = this.errorId();
    if (conError) {
      if (!this.errorPintado) this.tituloOriginal = this.el.getAttribute('title');
      this.r.addClass(this.el, 'num-invalido');
      this.r.setAttribute(this.el, 'aria-invalid', 'true');
      this.r.setAttribute(this.el, 'title', mensaje);
      if (id) this.r.setAttribute(this.el, 'aria-describedby', this.describedBy(id, true));
      this.errorPintado = true;
      return;
    }
    if (!this.errorPintado) return;
    this.r.removeClass(this.el, 'num-invalido');
    this.r.removeAttribute(this.el, 'aria-invalid');
    if (this.tituloOriginal === null) this.r.removeAttribute(this.el, 'title');
    else this.r.setAttribute(this.el, 'title', this.tituloOriginal);
    if (id) {
      const resto = this.describedBy(id, false);
      if (resto) this.r.setAttribute(this.el, 'aria-describedby', resto);
      else this.r.removeAttribute(this.el, 'aria-describedby');
    }
    this.errorPintado = false;
  }

  private describedBy(id: string, incluir: boolean): string {
    const actuales = (this.el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((x) => x && x !== id);
    if (incluir) actuales.push(id);
    return actuales.join(' ');
  }

  private ponerSiFalta(atributo: string, valor: string): void {
    if (!this.el.hasAttribute(atributo)) this.r.setAttribute(this.el, atributo, valor);
  }
}

/**
 * Primer campo numérico inválido de un formulario (o null). Antes confirma
 * cada campo como si se hubiera salido de él, así un mínimo pendiente o un
 * vacío por resolver cuentan. Ignora los campos deshabilitados.
 *
 *   @ViewChildren(NumeroDirective) campos?: QueryList<NumeroDirective>;
 *   const malo = primerNumeroInvalido(this.campos);
 *   if (malo) { malo.enfocar(); return; }
 */
export function primerNumeroInvalido(
  campos: Iterable<NumeroDirective> | null | undefined,
): NumeroDirective | null {
  if (!campos) return null;
  let primero: NumeroDirective | null = null;
  for (const campo of campos) {
    if (campo.estaDeshabilitado) continue;
    campo.confirmar();
    if (!primero && campo.invalido()) primero = campo;
  }
  return primero;
}
