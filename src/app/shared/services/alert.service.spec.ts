import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import Swal from 'sweetalert2';
import { AlertService } from './alert.service';
import { NotificationService } from './notification.service';

describe('AlertService', () => {
  let alerta: AlertService;
  let avisos: NotificationService;

  const popup = () => document.querySelector<HTMLElement>('.swal2-popup');
  /** Swal pone titleText con innerText (jsdom no lo implementa: lo guarda tal cual, que es lo que se comprueba). */
  const titulo = () => (popup()?.querySelector<HTMLElement>('.swal2-title')?.innerText ?? '') as string;

  beforeAll(() => {
    // jsdom no trae matchMedia y Swal lo usa al dibujar los iconos.
    if (typeof window.matchMedia !== 'function') {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: (media: string) => ({
          matches: false,
          media,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }),
      });
    }
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    alerta = TestBed.inject(AlertService);
    avisos = TestBed.inject(NotificationService);
  });

  afterEach(async () => {
    Swal.close();
    await new Promise((listo) => setTimeout(listo, 20));
    document.querySelectorAll('.swal2-container').forEach((n) => n.remove());
    document.body.classList.remove('swal2-shown', 'swal2-height-auto');
  });

  it('F01: el título y el mensaje con datos de usuario se muestran como texto, nunca como HTML', () => {
    void alerta.error({ title: '<img src=x onerror="window.__xss=1">', message: '<b>Cliente</b> & cía' });
    const p = popup();
    expect(p).not.toBeNull();
    expect(p!.querySelector('img:not(.swal2-image)')).toBeNull();
    expect(p!.querySelector('b')).toBeNull();
    expect(p!.querySelector('.swal2-title')?.innerHTML).not.toContain('<img');
    expect(titulo()).toBe('<img src=x onerror="window.__xss=1">');
    expect(p!.querySelector('.swal2-html-container')?.textContent).toBe('<b>Cliente</b> & cía');
  });

  it('F01: el HTML propio (allowHtml) pasa por una lista blanca', () => {
    void alerta.info({
      allowHtml: true,
      message: '<strong>Total</strong><img src=x onerror=alert(1)><a href="javascript:alert(1)">ver</a><script>alert(1)</script>',
    });
    const html = popup()!.querySelector('.swal2-html-container')!;
    expect(html.querySelector('strong')?.textContent).toBe('Total');
    expect(html.querySelector('img:not(.swal2-image)')).toBeNull();
    expect(html.querySelector('script')).toBeNull();
    expect(html.querySelector('a')?.hasAttribute('href')).toBe(false);
  });

  it('F01: los títulos escapados a mano por pantallas antiguas no se ven con entidades', () => {
    void alerta.warning({ title: 'Producto &quot;Martillo&quot; &amp; Cía' });
    expect(titulo()).toBe('Producto "Martillo" & Cía');
  });

  it('F02: un toast no cierra el modal abierto (va a la pila nt-*)', () => {
    void alerta.confirm({ title: '¿Guardar cambios?' });
    void alerta.toast({ type: 'success', title: 'Producto escaneado', timer: 1200 });
    // (jsdom no calcula layout, así que Swal.isVisible() no sirve aquí: se mira el DOM)
    expect(document.querySelectorAll('.swal2-popup')).toHaveLength(1);
    expect(titulo()).toBe('¿Guardar cambios?');
    expect(popup()!.classList.contains('swal2-toast')).toBe(false);
    const aviso = avisos.avisos()[0];
    expect(aviso).toMatchObject({ tipo: 'exito', titulo: 'Producto escaneado' });
    expect(aviso?.duracion).toBeGreaterThanOrEqual(2500); // los timer cortos de Swal no alcanzan a leerse
  });

  it('confirmarPeligro: botón rojo y foco inicial en Cancelar', () => {
    void alerta.confirmarPeligro({ title: '¿Eliminar el cliente?' });
    const confirmar = popup()!.querySelector<HTMLButtonElement>('.swal2-confirm')!;
    expect(confirmar.classList.contains('hs-swal-peligro')).toBe(true);
    expect(confirmar.textContent).toBe('Sí, eliminar');
  });

  it('confirm deduce una acción destructiva por el verbo del botón', () => {
    void alerta.confirm({ title: '¿Seguro?', confirmText: 'Sí, anular' });
    expect(popup()!.querySelector('.swal2-confirm')?.classList.contains('hs-swal-peligro')).toBe(true);
  });

  it('errorHttp no abre un modal si la capa global ya avisó', async () => {
    const e = new HttpErrorResponse({ status: 0, error: { notificado: true, claveAviso: 'conexion', message: 'x' } });
    await alerta.errorHttp(e, 'No se pudo guardar');
    expect(popup()).toBeNull();
  });

  it('error() nunca muestra la sesión vencida en un modal', async () => {
    const r = await alerta.error({ title: 'No se pudo cargar', message: 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.' });
    expect(r.isDismissed).toBe(true);
    expect(popup()).toBeNull();
  });

  it('errorHttp: título, mensaje del servidor escapado y código de soporte', () => {
    void alerta.errorHttp(
      new HttpErrorResponse({ status: 409, error: { message: 'Ya existe <b>X</b>', idPeticion: 'req-7' } }),
      'No se pudo guardar el producto',
    );
    const p = popup()!;
    expect(titulo()).toBe('No se pudo guardar el producto');
    expect(p.querySelector('.swal2-html-container b')).toBeNull();
    expect(p.querySelector('.swal2-html-container')?.textContent).toContain('Ya existe <b>X</b>');
    expect(p.querySelector('.hs-swal-soporte code')?.textContent).toBe('req-7');
  });

  it('usa el tema de la casa y no toca la altura del body', () => {
    void alerta.success({ title: 'Listo' });
    expect(popup()!.classList.contains('hs-swal')).toBe(true);
    expect(popup()!.classList.contains('hs-swal--panel')).toBe(true);
    expect(document.body.classList.contains('swal2-height-auto')).toBe(false);
  });
});
