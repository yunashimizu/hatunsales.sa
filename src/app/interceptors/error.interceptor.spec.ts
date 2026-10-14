import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/service/auth.service';
import { NotificationService } from '../shared/services/notification.service';
import { tomarAvisoLogin, tomarRedireccion } from '../shared/utils/aviso-login.util';
import { CuerpoErrorApi, MENSAJE_SESION_EXPIRADA, MENSAJE_SIN_CONEXION } from '../shared/utils/errores-http.util';
import { conReintentos, peticionSilenciosa, sinAvisoGlobal } from './contexto-http';
import { errorInterceptor, reiniciarEstadoInterceptorErrores } from './error.interceptor';

const API = 'https://api.prueba/';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let avisos: NotificationService;
  let router: { url: string; navigateByUrl: ReturnType<typeof vi.fn> };
  let logout: ReturnType<typeof vi.fn>;

  /** Lanza la petición y devuelve el error que recibe la pantalla. */
  function fallo<T = unknown>(peticion: Promise<T>): Promise<HttpErrorResponse> {
    return peticion.then(
      () => {
        throw new Error('se esperaba un error');
      },
      (e: HttpErrorResponse) => e,
    );
  }

  const cuerpo = (e: HttpErrorResponse) => e.error as CuerpoErrorApi;

  beforeEach(() => {
    sessionStorage.clear();
    reiniciarEstadoInterceptorErrores();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    router = { url: '/dashboard/mantenimiento/ventas', navigateByUrl: vi.fn(() => Promise.resolve(true)) };
    logout = vi.fn(() => sessionStorage.clear());
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: { logout } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    avisos = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    backend.verify();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('normaliza las validaciones de Nest en español sin aviso global', async () => {
    const p = fallo(firstValueFrom(http.post(`${API}producto`, {})));
    backend.expectOne(`${API}producto`).flush(
      { statusCode: 400, message: ['nombre should not be empty', 'precio must be a positive number'], error: 'Bad Request' },
      { status: 400, statusText: 'Bad Request' },
    );
    const e = await p;
    expect(e.status).toBe(400);
    expect(cuerpo(e).message).toBe('El campo «nombre» es obligatorio. El campo «precio» debe ser mayor que cero.');
    expect(cuerpo(e).mensajes).toHaveLength(2);
    expect(cuerpo(e).notificado).toBeUndefined();
    expect(avisos.avisos()).toHaveLength(0);
  });

  it('conserva status, cabeceras y los campos del backend (409 con producto)', async () => {
    const p = fallo(firstValueFrom(http.post(`${API}producto`, {})));
    backend.expectOne(`${API}producto`).flush(
      { statusCode: 409, message: 'Ya existe', codigo: 'PRODUCTO_DUPLICADO', producto: { id_producto: 9 } },
      { status: 409, statusText: 'Conflict', headers: { 'X-Algo': '1' } },
    );
    const e = await p;
    expect(e).toBeInstanceOf(HttpErrorResponse);
    expect(e.status).toBe(409);
    expect(e.headers.get('X-Algo')).toBe('1');
    expect(cuerpo(e).codigo).toBe('PRODUCTO_DUPLICADO');
    expect(cuerpo(e)['producto']).toEqual({ id_producto: 9 });
  });

  it('401 de «contraseña actual incorrecta» en PUT /auth/perfil NO cierra la sesión', async () => {
    sessionStorage.setItem('token', 'abc');
    const p = fallo(firstValueFrom(http.put(`${API}auth/perfil`, { password_actual: 'x' })));
    backend.expectOne(`${API}auth/perfil`).flush(
      { statusCode: 401, message: 'La contraseña actual no es correcta', error: 'Unauthorized' },
      { status: 401, statusText: 'Unauthorized' },
    );
    const e = await p;
    expect(cuerpo(e).message).toBe('La contraseña actual no es correcta');
    expect(cuerpo(e).codigo).not.toBe('SESION_EXPIRADA');
    expect(logout).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('token')).toBe('abc');
  });

  it('401 de PUT /auth/perfil con el texto del backend nuevo ("Tu sesión no es válida…") SÍ es sesión vencida', async () => {
    sessionStorage.setItem('token', 'abc');
    const p = fallo(firstValueFrom(http.put(`${API}auth/perfil`, { nombre: 'x' })));
    backend.expectOne(`${API}auth/perfil`).flush(
      {
        statusCode: 401,
        message: 'Tu sesión no es válida o expiró. Inicia sesión nuevamente.',
        error: 'No autenticado',
        codigo: 'NO_AUTENTICADO',
      },
      { status: 401, statusText: 'Unauthorized' },
    );
    const e = await p;
    expect(cuerpo(e).codigo).toBe('SESION_EXPIRADA');
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('401 de login no es sesión vencida', async () => {
    sessionStorage.setItem('token', 'viejo');
    const p = fallo(firstValueFrom(http.post(`${API}auth/login`, {})));
    backend.expectOne(`${API}auth/login`).flush({ message: 'Credenciales incorrectas' }, { status: 401, statusText: 'Unauthorized' });
    const e = await p;
    expect(cuerpo(e).message).toBe('Credenciales incorrectas');
    expect(logout).not.toHaveBeenCalled();
  });

  it('401 con sesión en el panel: cierra sesión, explica el motivo en el login y recuerda la página', async () => {
    sessionStorage.setItem('token', 'abc');
    const p1 = fallo(firstValueFrom(http.get(`${API}venta`)));
    const p2 = fallo(firstValueFrom(http.get(`${API}caja`)));
    backend.expectOne(`${API}venta`).flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne(`${API}caja`).flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    const [e1, e2] = await Promise.all([p1, p2]);

    for (const e of [e1, e2]) {
      expect(cuerpo(e).codigo).toBe('SESION_EXPIRADA');
      expect(cuerpo(e).message).toBe(MENSAJE_SESION_EXPIRADA);
      expect(cuerpo(e).notificado).toBe(true);
    }
    expect(logout).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth');
    expect(tomarAvisoLogin()?.motivo).toBe('sesion_expirada');
    expect(tomarRedireccion()).toBe('/dashboard/mantenimiento/ventas');
    expect(avisos.avisos()).toHaveLength(0);
  });

  it('401 con sesión en la tienda: aviso con «Iniciar sesión» sin sacar al cliente', async () => {
    router.url = '/store/catalogo';
    sessionStorage.setItem('token', 'abc');
    const p = fallo(firstValueFrom(http.get(`${API}tienda/carrito`)));
    backend.expectOne(`${API}tienda/carrito`).flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    await p;
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    const aviso = avisos.avisos()[0];
    expect(aviso?.clave).toBe('sesion');
    expect(aviso?.accion?.etiqueta).toBe('Iniciar sesión');
  });

  it('sin conexión (status 0): un solo aviso global y el error sale marcado como notificado', async () => {
    const p1 = fallo(firstValueFrom(http.get(`${API}producto`, { context: conReintentos(0) })));
    const p2 = fallo(firstValueFrom(http.get(`${API}marca`, { context: conReintentos(0) })));
    backend.expectOne(`${API}producto`).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    backend.expectOne(`${API}marca`).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    const [e1] = await Promise.all([p1, p2]);
    expect(cuerpo(e1).message).toBe(MENSAJE_SIN_CONEXION);
    expect(cuerpo(e1).notificado).toBe(true);
    expect(cuerpo(e1).claveAviso).toBe('conexion');
    expect(avisos.avisos()).toHaveLength(1);
    expect(avisos.avisos()[0]).toMatchObject({ clave: 'conexion', titulo: 'No se pudo cargar la información', repeticiones: 1 });
  });

  it('una escritura sin conexión avisa «No se guardaron los cambios» y no se reintenta', async () => {
    const p = fallo(firstValueFrom(http.post(`${API}venta`, {})));
    backend.expectOne(`${API}venta`).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await p;
    backend.expectNone(`${API}venta`);
    expect(avisos.avisos()[0]?.titulo).toBe('No se guardaron los cambios');
  });

  it('reintenta las lecturas ante 502/503 (servidor despertando) y entrega la respuesta', async () => {
    vi.useFakeTimers();
    const p = firstValueFrom(http.get<{ ok: boolean }>(`${API}inventario`));
    backend.expectOne(`${API}inventario`).flush('Bad gateway', { status: 502, statusText: 'Bad Gateway' });
    await vi.advanceTimersByTimeAsync(1500);
    backend.expectOne(`${API}inventario`).flush('', { status: 503, statusText: 'Service Unavailable' });
    await vi.advanceTimersByTimeAsync(4000);
    backend.expectOne(`${API}inventario`).flush({ ok: true });
    await expect(p).resolves.toEqual({ ok: true });
    expect(avisos.avisos().some((a) => a.clave === 'conexion')).toBe(false);
  });

  it('503 con código de negocio (FISCAL_*): sin reintentos, sin aviso global y con el mensaje del servidor', async () => {
    const p = fallo(firstValueFrom(http.get(`${API}sunat/estado`)));
    backend.expectOne(`${API}sunat/estado`).flush(
      { statusCode: 503, message: 'SUNAT no respondió; inténtalo en unos minutos.', codigo: 'FISCAL_SUNAT_NO_DISPONIBLE' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    const e = await p;
    backend.expectNone(`${API}sunat/estado`);
    expect(cuerpo(e).message).toBe('SUNAT no respondió; inténtalo en unos minutos.');
    expect(cuerpo(e).notificado).toBeUndefined();
    expect(avisos.avisos()).toHaveLength(0);
  });

  it('lee el JSON de error de una descarga (responseType blob)', async () => {
    const p = fallo(firstValueFrom(http.get(`${API}comprobante/1/pdf`, { responseType: 'blob' })));
    const blob = new Blob([JSON.stringify({ statusCode: 404, message: 'El comprobante aún no tiene PDF' })], {
      type: 'application/json',
    });
    backend.expectOne(`${API}comprobante/1/pdf`).flush(blob, { status: 404, statusText: 'Not Found' });
    const e = await p;
    expect(cuerpo(e).message).toBe('El comprobante aún no tiene PDF');
    expect(e.status).toBe(404);
  });

  it('tiempo agotado → TIEMPO_AGOTADO con aviso global', async () => {
    vi.useFakeTimers();
    const p = fallo(firstValueFrom(http.post(`${API}venta`, {})));
    const req = backend.expectOne(`${API}venta`);
    await vi.advanceTimersByTimeAsync(90_001);
    const e = await p;
    expect(req.cancelled).toBe(true);
    expect(e.status).toBe(0);
    expect(cuerpo(e).codigo).toBe('TIEMPO_AGOTADO');
    expect(avisos.avisos()[0]?.titulo).toBe('El servidor no confirmó la operación');
  });

  it('429 → aviso «Demasiados intentos» con la espera de Retry-After', async () => {
    const p = fallo(firstValueFrom(http.post(`${API}receptor/consultar`, {})));
    backend.expectOne(`${API}receptor/consultar`).flush(
      { statusCode: 429, message: 'ThrottlerException: Too Many Requests' },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '12' } },
    );
    const e = await p;
    expect(cuerpo(e).reintentarEnSeg).toBe(12);
    expect(cuerpo(e).notificado).toBe(true);
    expect(avisos.avisos()[0]).toMatchObject({ clave: '429', mensaje: 'Espera 12 segundos y vuelve a intentarlo.' });
  });

  it('sinAvisoGlobal: la pantalla decide (sin aviso y sin marca de notificado)', async () => {
    const p = fallo(firstValueFrom(http.get(`${API}producto`, { context: sinAvisoGlobal(conReintentos(0)) })));
    backend.expectOne(`${API}producto`).error(new ProgressEvent('error'), { status: 0 });
    const e = await p;
    expect(cuerpo(e).message).toBe(MENSAJE_SIN_CONEXION);
    expect(cuerpo(e).notificado).toBeUndefined();
    expect(avisos.avisos()).toHaveLength(0);
  });

  it('peticionSilenciosa: sin avisos, sin reintentos y marcada como silenciosa', async () => {
    const p = fallo(firstValueFrom(http.get(`${API}comprobante/monitor`, { context: peticionSilenciosa() })));
    backend.expectOne(`${API}comprobante/monitor`).flush('', { status: 503, statusText: 'Service Unavailable' });
    const e = await p;
    backend.expectNone(`${API}comprobante/monitor`);
    expect(cuerpo(e).silenciosa).toBe(true);
    expect(avisos.avisos()).toHaveLength(0);
  });
});
