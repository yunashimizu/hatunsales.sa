import { Observable, isObservable } from 'rxjs';

/**
 * Cola serial de escaneos: el lector entrega varios códigos seguidos y cada uno debe procesarse
 * en orden, uno a la vez, sin que un fallo detenga a los siguientes ni se pierda ninguno.
 *
 * `procesar` resuelve un código y devuelve un Observable que termina cuando acabó (o `void` si fue
 * síncrono). Debe manejar sus propios errores; si lanza o el Observable falla, la cola sigue igual.
 */
export class ColaEscaneos<T = string> {
  private pendientes: T[] = [];
  private procesando = false;
  private generacion = 0;

  constructor(
    private readonly procesar: (codigo: T) => Observable<unknown> | void,
    private readonly alVaciarse?: () => void,
  ) {}

  /** Verdadero mientras haya un escaneo en curso o esperando turno. */
  get ocupada(): boolean {
    return this.procesando || this.pendientes.length > 0;
  }

  /** Cantidad de escaneos esperando (sin contar el que está en curso). */
  get enEspera(): number {
    return this.pendientes.length;
  }

  encolar(codigo: T): void {
    this.pendientes.push(codigo);
    if (!this.procesando) this.siguiente();
  }

  /** Descarta lo pendiente (p. ej. al destruir el componente). */
  vaciar(): void {
    this.generacion++;
    this.pendientes = [];
    this.procesando = false;
  }

  private siguiente(): void {
    const generacion = this.generacion;
    // Bucle y no recursión para los escaneos síncronos (catálogo en memoria): no crece la pila.
    while (generacion === this.generacion) {
      const codigo = this.pendientes.shift();
      if (codigo === undefined) {
        this.procesando = false;
        this.alVaciarse?.();
        return;
      }
      this.procesando = true;

      let resultado: Observable<unknown> | void;
      try {
        resultado = this.procesar(codigo);
      } catch {
        continue;
      }
      if (!isObservable(resultado)) continue;

      let terminado = false;
      let sincrono = true;
      const terminar = () => {
        if (terminado || generacion !== this.generacion) return;
        terminado = true;
        if (!sincrono) this.siguiente();
      };
      resultado.subscribe({ next: terminar, error: terminar, complete: terminar });
      sincrono = false;
      if (!terminado) return; // sigue en vuelo: terminar() retomará la cola
    }
  }
}
