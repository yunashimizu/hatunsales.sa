import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ManejadorErroresGlobal, esErrorDeCargaDeModulo } from './manejador-errores';
import { NotificationService } from './notification.service';

describe('ManejadorErroresGlobal', () => {
  let manejador: ManejadorErroresGlobal;
  let avisos: NotificationService;
  let consola: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [{ provide: ErrorHandler, useClass: ManejadorErroresGlobal }] });
    manejador = TestBed.inject(ErrorHandler) as ManejadorErroresGlobal;
    avisos = TestBed.inject(NotificationService);
  });

  afterEach(() => consola.mockRestore());

  it('tras un deploy (chunk que no carga) ofrece recargar con un aviso persistente', () => {
    manejador.handleError({ rejection: new TypeError('Failed to fetch dynamically imported module: https://x/chunk-ABC.js') });
    const aviso = avisos.avisos()[0];
    expect(aviso).toMatchObject({ clave: 'nueva-version', tipo: 'info', duracion: 0 });
    expect(aviso?.accion?.etiqueta).toBe('Recargar');
    expect(consola).toHaveBeenCalled();
  });

  it('reconoce los distintos mensajes de fallo de carga de módulos', () => {
    expect(esErrorDeCargaDeModulo(new Error("Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of 'text/html'"))).toBe(true);
    expect(esErrorDeCargaDeModulo(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(esErrorDeCargaDeModulo(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(esErrorDeCargaDeModulo(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('un HttpErrorResponse que nadie manejó se avisa (salvo si ya lo avisó el interceptor)', () => {
    manejador.handleError(new HttpErrorResponse({ status: 0, error: { notificado: true } }));
    expect(avisos.avisos()).toHaveLength(0);
    manejador.handleError(new HttpErrorResponse({ status: 500, error: { silenciosa: true } }));
    expect(avisos.avisos()).toHaveLength(0);
    manejador.handleError(new HttpErrorResponse({ status: 404, error: { message: 'No existe el pedido' } }));
    expect(avisos.avisos()[0]).toMatchObject({ clave: 'http-no-manejado', tipo: 'error', mensaje: 'No existe el pedido' });
  });

  it('otros errores: como mucho un aviso genérico cada 30 s', () => {
    manejador.handleError(new Error('x is undefined'));
    manejador.handleError(new Error('otra cosa'));
    const genericos = avisos.avisos().filter((a) => a.clave === 'error-pantalla');
    expect(genericos).toHaveLength(1);
    expect(genericos[0]?.repeticiones).toBe(1);
  });

  it('ignora el ruido del navegador sin avisar', () => {
    manejador.handleError(new Error('ResizeObserver loop completed with undelivered notifications.'));
    manejador.handleError(new DOMException('The user aborted a request.', 'AbortError'));
    manejador.handleError('Script error.');
    expect(avisos.avisos()).toHaveLength(0);
    expect(consola).not.toHaveBeenCalled();
  });
});
