import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import {
  aParametros, EscritorFiltrosUrl, EsquemaFiltros, escribirFiltros, leerDesdeParametros, leerFiltros,
} from './filtros-url';

const ESQUEMA: EsquemaFiltros = {
  q: { tipo: 'texto' },
  estado: { tipo: 'opcion', opciones: ['activos', 'inactivos'], defecto: '' },
  categoria: { tipo: 'numero' },
  pagina: { tipo: 'numero', defecto: 1, min: 1 },
  alertas: { tipo: 'bandera' },
};

describe('filtros en la URL', () => {
  const parametros = (texto: string) => new URLSearchParams(texto);

  it('lee los valores válidos y cae al valor por defecto con lo inválido', () => {
    expect(leerDesdeParametros(parametros('q=%20clavo%20&estado=activos&categoria=7&pagina=3&alertas=1'), ESQUEMA))
      .toEqual({ q: 'clavo', estado: 'activos', categoria: 7, pagina: 3, alertas: true });
    expect(leerDesdeParametros(parametros('estado=otro&categoria=abc&pagina=0&alertas=no'), ESQUEMA))
      .toEqual({ q: '', estado: '', categoria: null, pagina: 1, alertas: false });
  });

  it('omite vacíos, falsos y valores por defecto al armar los parámetros', () => {
    expect(aParametros({ q: ' ', estado: 'activos', categoria: null, pagina: 1, alertas: false }, ESQUEMA))
      .toEqual({ q: null, estado: 'activos', categoria: null, pagina: null, alertas: null });
    expect(aParametros({ q: 'tubo', pagina: 2, alertas: true }, ESQUEMA))
      .toEqual({ q: 'tubo', pagina: '2', alertas: '1' });
  });

  describe('con el router', () => {
    let router: Router;
    let route: ActivatedRoute;

    beforeEach(async () => {
      TestBed.configureTestingModule({
        providers: [provideRouter([{ path: 'lista', children: [] }])],
      });
      router = TestBed.inject(Router);
      route = TestBed.inject(ActivatedRoute);
      await router.navigateByUrl('/lista?q=viejo&otro=1');
    });

    afterEach(() => vi.useRealTimers());

    it('escribe sin historial nuevo, conserva los demás parámetros y lee lo escrito', async () => {
      const navegar = vi.spyOn(router, 'navigate');
      await escribirFiltros(router, route, { q: 'clavo', estado: 'activos', categoria: null }, ESQUEMA);
      expect(navegar).toHaveBeenCalledWith([], expect.objectContaining({
        replaceUrl: true,
        queryParamsHandling: 'merge',
        queryParams: { q: 'clavo', estado: 'activos', categoria: null },
      }));
      expect(router.url).toBe('/lista?q=clavo&otro=1&estado=activos');
      expect(leerFiltros(route, ESQUEMA)).toMatchObject({ q: 'clavo' });
    });

    it('espera 300 ms al teclear, junta los cambios en una sola escritura y avisa que está ocupado', async () => {
      vi.useFakeTimers();
      const escritor = new EscritorFiltrosUrl(router, route, ESQUEMA);
      const navegar = vi.spyOn(router, 'navigate');
      escritor.escribir({ q: 'c' }, { retardar: true });
      escritor.escribir({ q: 'cl' }, { retardar: true });
      expect(escritor.ocupado).toBe(true);
      await vi.advanceTimersByTimeAsync(299);
      expect(navegar).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2);
      expect(navegar).toHaveBeenCalledTimes(1);
      expect(navegar.mock.calls[0][1]?.queryParams).toEqual({ q: 'cl' });
      await vi.runAllTimersAsync();
      expect(escritor.ocupado).toBe(false);
    });

    it('cancelar descarta lo pendiente', async () => {
      vi.useFakeTimers();
      const escritor = new EscritorFiltrosUrl(router, route, ESQUEMA);
      const navegar = vi.spyOn(router, 'navigate');
      escritor.escribir({ q: 'x' }, { retardar: true });
      escritor.cancelar();
      await vi.advanceTimersByTimeAsync(1000);
      expect(navegar).not.toHaveBeenCalled();
      expect(escritor.ocupado).toBe(false);
    });
  });
});
