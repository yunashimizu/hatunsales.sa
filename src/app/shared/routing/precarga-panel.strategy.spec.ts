import { TestBed } from '@angular/core/testing';
import { Route } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { PrecargaPanelStrategy, RETRASO_PRECARGA_MS } from './precarga-panel.strategy';

describe('PrecargaPanelStrategy', () => {
  const inventario: Route = {
    path: 'inventario',
    data: { precargar: true, roles: ['admin', 'vendedor'] },
  };
  let estrategia: PrecargaPanelStrategy;

  function sesion(rolId: number, rolNombre: string): void {
    sessionStorage.setItem('token', 'abc');
    sessionStorage.setItem('rolId', String(rolId));
    sessionStorage.setItem('rolNombre', rolNombre);
  }

  /** Pide la precarga y deja pasar el retraso (jsdom no trae requestIdleCallback: va por setTimeout). */
  async function precargar(route: Route, cargar: () => Observable<unknown> = () => of('bloque')) {
    const espia = vi.fn(cargar);
    const valores: unknown[] = [];
    estrategia.preload(route, espia).subscribe((valor) => valores.push(valor));
    await vi.advanceTimersByTimeAsync(RETRASO_PRECARGA_MS + 100);
    return { cargar: espia, valores };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    estrategia = TestBed.inject(PrecargaPanelStrategy);
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('no precarga sin sesión', async () => {
    const { cargar, valores } = await precargar(inventario);

    expect(cargar).not.toHaveBeenCalled();
    expect(valores).toEqual([null]);
  });

  it('no precarga para un cliente de la tienda aunque tenga token', async () => {
    sesion(5, 'cliente');

    const { cargar } = await precargar(inventario);

    expect(cargar).not.toHaveBeenCalled();
  });

  it('con sesión de personal precarga la ruta marcada después del retraso', async () => {
    sesion(3, 'vendedor');
    const cargar = vi.fn(() => of('bloque'));

    estrategia.preload(inventario, cargar).subscribe();
    await vi.advanceTimersByTimeAsync(RETRASO_PRECARGA_MS - 500);
    expect(cargar).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it('no precarga rutas sin marca ni las que el rol no puede abrir', async () => {
    sesion(4, 'caja');

    const sinMarca = await precargar({
      path: 'ventas',
      data: { roles: ['admin', 'vendedor', 'caja'] },
    });
    const sinPermiso = await precargar(inventario);
    const permitida = await precargar({
      path: 'caja-sesion',
      data: { precargar: true, roles: ['admin', 'vendedor', 'caja'] },
    });

    expect(sinMarca.cargar).not.toHaveBeenCalled();
    expect(sinPermiso.cargar).not.toHaveBeenCalled();
    expect(permitida.cargar).toHaveBeenCalledTimes(1);
  });

  it('si la sesión se cierra durante la espera ya no precarga', async () => {
    sesion(1, 'admin');
    const cargar = vi.fn(() => of('bloque'));

    estrategia.preload(inventario, cargar).subscribe();
    sessionStorage.clear();
    await vi.advanceTimersByTimeAsync(RETRASO_PRECARGA_MS + 100);

    expect(cargar).not.toHaveBeenCalled();
  });

  it('un fallo al descargar el bloque no rompe la precarga', async () => {
    sesion(1, 'admin');

    const { cargar, valores } = await precargar(inventario, () =>
      throwError(() => new Error('Failed to fetch')),
    );

    expect(cargar).toHaveBeenCalledTimes(1);
    expect(valores).toEqual([null]);
  });
});
