import { Subject, of, throwError } from 'rxjs';
import { ColaEscaneos } from './cola-escaneos';

describe('ColaEscaneos', () => {
  it('procesa en orden los escaneos síncronos y queda libre', () => {
    const vistos: string[] = [];
    const cola = new ColaEscaneos((c) => { vistos.push(c); });

    cola.encolar('A1');
    cola.encolar('B2');

    expect(vistos).toEqual(['A1', 'B2']);
    expect(cola.ocupada).toBe(false);
  });

  it('un segundo código espera a que termine el primero (serial) y no se pierde', () => {
    const respuestas = [new Subject<void>(), new Subject<void>()];
    const vistos: string[] = [];
    const cola = new ColaEscaneos((c) => {
      vistos.push(c);
      return respuestas[vistos.length - 1];
    });

    cola.encolar('111');
    cola.encolar('222');

    expect(vistos).toEqual(['111']);
    expect(cola.ocupada).toBe(true);
    expect(cola.enEspera).toBe(1);

    respuestas[0].next();
    expect(vistos).toEqual(['111', '222']);
    expect(cola.ocupada).toBe(true);

    respuestas[1].next();
    expect(cola.ocupada).toBe(false);
  });

  it('un Observable que falla no detiene los siguientes', () => {
    const vistos: string[] = [];
    const cola = new ColaEscaneos((c) => {
      vistos.push(c);
      return c === 'mal' ? throwError(() => new Error('404')) : of(null);
    });

    cola.encolar('mal');
    cola.encolar('bien');

    expect(vistos).toEqual(['mal', 'bien']);
    expect(cola.ocupada).toBe(false);
  });

  it('una excepción síncrona tampoco detiene la cola', () => {
    const vistos: string[] = [];
    const cola = new ColaEscaneos((c) => {
      vistos.push(c);
      if (c === 'x') throw new Error('boom');
    });

    cola.encolar('x');
    cola.encolar('y');

    expect(vistos).toEqual(['x', 'y']);
    expect(cola.ocupada).toBe(false);
  });

  it('avisa al vaciarse una sola vez por tanda', () => {
    const fin = vi.fn();
    const r = new Subject<void>();
    const cola = new ColaEscaneos(() => r, fin);

    cola.encolar('1');
    cola.encolar('2');
    r.next();
    expect(fin).not.toHaveBeenCalled();
    r.next();
    expect(fin).toHaveBeenCalledTimes(1);
  });

  it('vaciar() descarta lo pendiente y la respuesta tardía no reanuda la cola', () => {
    const r = new Subject<void>();
    const vistos: string[] = [];
    const cola = new ColaEscaneos((c) => { vistos.push(c); return r; });

    cola.encolar('1');
    cola.encolar('2');
    cola.vaciar();
    r.next();

    expect(vistos).toEqual(['1']);
    expect(cola.ocupada).toBe(false);
  });

  it('aguanta muchos escaneos síncronos sin desbordar la pila', () => {
    let n = 0;
    const cola = new ColaEscaneos(() => { n++; });
    for (let i = 0; i < 20000; i++) cola.encolar(String(i));
    expect(n).toBe(20000);
  });
});
