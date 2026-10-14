import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { MENSAJE_SIN_CONEXION } from '../utils/errores-http.util';
import { NotificationService, Toast } from './notification.service';

describe('NotificationService', () => {
  let avisos: NotificationService;

  beforeEach(() => {
    // jsdom puede reportar la pestaña como oculta (pausaría todos los temporizadores).
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    avisos = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('muestra un aviso y lo cierra solo según su severidad', () => {
    const id = avisos.exito('Producto creado');
    expect(id).toBeGreaterThan(0);
    expect(avisos.avisos()[0]).toMatchObject({ tipo: 'exito', titulo: 'Producto creado', mensaje: '', duracion: 3500 });
    vi.advanceTimersByTime(3400);
    expect(avisos.avisos()).toHaveLength(1);
    vi.advanceTimersByTime(200);
    expect(avisos.avisos()).toHaveLength(0);
  });

  it('las duraciones crecen con el texto y la severidad (tope 15 s)', () => {
    avisos.info('Aviso');
    avisos.advertencia('Atención');
    avisos.error('Falló');
    avisos.error('x'.repeat(140), { mensaje: 'y'.repeat(320) });
    const [info, advertencia, error, largo] = avisos.avisos();
    expect(info?.duracion).toBe(5000);
    expect(advertencia?.duracion).toBe(6500);
    expect(error?.duracion).toBe(8000);
    expect(largo?.duracion).toBe(15000);
  });

  it('agrupa los avisos repetidos (×N) en vez de apilarlos', () => {
    avisos.exito('Agregado al carrito');
    avisos.exito('Agregado al carrito');
    avisos.exito('Agregado al carrito');
    expect(avisos.avisos()).toHaveLength(1);
    expect(avisos.avisos()[0]?.repeticiones).toBe(3);
  });

  it('con contar:false solo refresca el aviso repetido', () => {
    avisos.mostrar({ clave: 'conexion', tipo: 'error', titulo: 'Sin conexión', contar: false });
    avisos.mostrar({ clave: 'conexion', tipo: 'error', titulo: 'Sin conexión', contar: false });
    expect(avisos.avisos()[0]?.repeticiones).toBe(1);
  });

  it('nunca muestra más de 4 a la vez: salen primero los viejos sin acción', () => {
    avisos.exito('Con acción', { accion: { etiqueta: 'Deshacer', alHacer: () => undefined } });
    for (let i = 1; i <= 5; i++) avisos.info(`Aviso ${i}`);
    const titulos = avisos.avisos().map((a) => a.titulo);
    expect(titulos).toHaveLength(4);
    expect(titulos).toContain('Con acción');
    expect(titulos).toContain('Aviso 5');
    expect(titulos).not.toContain('Aviso 1');
  });

  it('pausa de verdad el temporizador (ratón encima) y lo reanuda con margen', () => {
    avisos.exito('Guardado');
    vi.advanceTimersByTime(3000);
    avisos.pausar('hover');
    vi.advanceTimersByTime(20000);
    expect(avisos.avisos()).toHaveLength(1);
    avisos.reanudar('hover');
    vi.advanceTimersByTime(1100);
    expect(avisos.avisos()).toHaveLength(1); // margen mínimo de 1,2 s tras reanudar
    vi.advanceTimersByTime(200);
    expect(avisos.avisos()).toHaveLength(0);
  });

  it('una acción ejecuta su función y cierra el aviso; un error de la acción se avisa', async () => {
    let deshecho = false;
    const id = avisos.exito('Producto quitado', { accion: { etiqueta: 'Deshacer', alHacer: () => (deshecho = true) } });
    expect(avisos.avisos()[0]?.duracion).toBeGreaterThanOrEqual(8000);
    avisos.ejecutarAccion(id);
    expect(deshecho).toBe(true);
    expect(avisos.hayActivo('exito|Producto quitado|')).toBe(false);

    const otro = avisos.info('Ver detalle', {
      accion: { etiqueta: 'Reintentar', alHacer: () => throwError(() => new HttpErrorResponse({ status: 500 })) },
    });
    avisos.ejecutarAccion(otro);
    expect(avisos.avisos().some((a) => a.tipo === 'error' && a.titulo === 'No se pudo completar la acción')).toBe(true);
  });

  it('errorHttp: título = qué falló y mensaje del servidor en español', () => {
    avisos.errorHttp(new HttpErrorResponse({ status: 400, error: { message: ['precio must be a positive number'] } }), 'No se pudo guardar');
    expect(avisos.avisos()[0]).toMatchObject({
      tipo: 'error',
      titulo: 'No se pudo guardar',
      mensaje: 'El campo «precio» debe ser mayor que cero.',
    });
  });

  it('errorHttp no repite lo que ya avisó la capa global y suma el Reintentar a ese aviso', () => {
    avisos.mostrar({ clave: 'conexion', tipo: 'error', titulo: 'No se pudo cargar la información', mensaje: MENSAJE_SIN_CONEXION });
    let reintentos = 0;
    const r = avisos.errorHttp(
      new HttpErrorResponse({ status: 0, error: { notificado: true, claveAviso: 'conexion' } }),
      'No se pudieron cargar los productos',
      { reintentar: () => reintentos++ },
    );
    expect(r).toBeNull();
    const global = avisos.avisos()[0];
    expect(avisos.avisos()).toHaveLength(1);
    expect(global?.accion?.etiqueta).toBe('Reintentar');
    avisos.ejecutarAccion(global!.id);
    expect(reintentos).toBe(1);
  });

  it('un error de pantalla con el texto de un aviso global visible no se apila', () => {
    avisos.mostrar({ clave: 'conexion', tipo: 'error', titulo: 'No se pudo cargar la información', mensaje: MENSAJE_SIN_CONEXION });
    expect(avisos.error(MENSAJE_SIN_CONEXION)).toBe(0);
    expect(avisos.error('No se pudo agregar', { mensaje: MENSAJE_SIN_CONEXION })).toBe(0);
    expect(avisos.avisos()).toHaveLength(1);
  });

  it('registrarAvisoGlobal cubre la sesión vencida aunque no haya toast', () => {
    avisos.registrarAvisoGlobal('sesion');
    expect(avisos.advertencia('Tu sesión expiró. Vuelve a iniciar sesión para continuar.')).toBe(0);
    vi.advanceTimersByTime(11000);
    expect(avisos.cubiertoGlobalmente('sesion')).toBe(false);
  });

  it('promesa(): cargando → éxito', async () => {
    const resultado = avisos.promesa(of(42), { cargando: 'Guardando…', exito: (n) => `Guardado ${n}` });
    await expect(resultado).resolves.toBe(42);
    expect(avisos.avisos()[0]).toMatchObject({ tipo: 'exito', titulo: 'Guardado 42' });
  });

  it('promesa(): cargando → error (y relanza)', async () => {
    const fallo = new HttpErrorResponse({ status: 409, error: { message: 'El código ya existe' } });
    await expect(avisos.promesa(Promise.reject(fallo), { cargando: 'Guardando…', exito: 'Listo', error: 'No se pudo guardar' })).rejects.toBe(fallo);
    expect(avisos.avisos()[0]).toMatchObject({ tipo: 'error', titulo: 'No se pudo guardar', mensaje: 'El código ya existe' });
  });

  it('compatibilidad v1: success/warn/toast y toasts$', async () => {
    const primero = firstValueFrom(avisos.toasts$);
    avisos.success('Marca creada');
    const legado: Toast = await primero;
    expect(legado).toMatchObject({ type: 'success', message: 'Marca creada' });
    avisos.warn('Revisa el nombre', 7000);
    avisos.toast('Hola', 'error', 2000);
    const tipos = avisos.avisos().map((a) => [a.tipo, a.duracion]);
    expect(tipos).toEqual([
      ['exito', 3500],
      ['advertencia', 7000],
      ['error', 2000],
    ]);
  });

  it('cargando() es persistente y no cerrable hasta actualizarlo', () => {
    const id = avisos.cargando('Subiendo imágenes…');
    vi.advanceTimersByTime(60000);
    expect(avisos.avisos()[0]).toMatchObject({ tipo: 'cargando', cerrable: false, duracion: 0 });
    avisos.actualizar(id, { tipo: 'exito', titulo: 'Imágenes subidas', cerrable: true });
    expect(avisos.avisos()[0]?.tipo).toBe('exito');
  });

  it('ignora avisos vacíos', () => {
    expect(avisos.mostrar({ titulo: '   ' })).toBe(0);
    expect(avisos.avisos()).toHaveLength(0);
  });
});
