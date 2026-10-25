import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthShellComponent, CARGAR_LOTTIE, PRECARGAR_PANEL } from './auth-shell.component';

@Component({
  selector: 'app-anfitrion-prueba',
  standalone: true,
  imports: [AuthShellComponent],
  template: `
    <app-auth-shell [modo]="modo">
      <form id="formulario"><input id="correo" type="email" /></form>
    </app-auth-shell>
  `,
})
class AnfitrionPrueba {
  modo: 'login' | 'registro' = 'login';
}

describe('AuthShellComponent', () => {
  let loadAnimation: ReturnType<typeof vi.fn>;
  let cargarLottie: ReturnType<typeof vi.fn>;
  let precargarPanel: ReturnType<typeof vi.fn>;

  /** jsdom no trae matchMedia: se simulan el ancho de pantalla y la preferencia de movimiento. */
  function pantalla(escritorio: boolean, menosMovimiento = false): void {
    vi.stubGlobal('matchMedia', (consulta: string) => ({
      matches: consulta.includes('min-width')
        ? escritorio
        : consulta.includes('reduced-motion') && menosMovimiento,
      media: consulta,
    }));
  }

  function crear(modo: 'login' | 'registro' = 'login'): ComponentFixture<AnfitrionPrueba> {
    const fixture = TestBed.createComponent(AnfitrionPrueba);
    fixture.componentInstance.modo = modo;
    fixture.detectChanges();
    return fixture;
  }

  function enfocarFormulario(fixture: ComponentFixture<AnfitrionPrueba>): void {
    const correo = fixture.nativeElement.querySelector('#correo') as HTMLInputElement;
    correo.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    loadAnimation = vi.fn(() => ({ destroy: vi.fn() }));
    cargarLottie = vi.fn(() => Promise.resolve({ loadAnimation }));
    precargarPanel = vi.fn(() => Promise.resolve({}));
    TestBed.configureTestingModule({
      imports: [AnfitrionPrueba],
      providers: [
        provideRouter([]),
        { provide: CARGAR_LOTTIE, useValue: cargarLottie },
        { provide: PRECARGAR_PANEL, useValue: precargarPanel },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('muestra el formulario al instante: sin fundido de entrada ni espera de gsap o lottie', () => {
    pantalla(true);
    const fixture = crear();
    const main = fixture.nativeElement.querySelector('main') as HTMLElement;

    expect(main.querySelector('#formulario')).not.toBeNull();
    expect(main.className).not.toContain('mov-');
    expect(main.querySelector('.auth-card')?.className).not.toContain('mov-');
    expect(main.style.opacity).toBe('');
    expect(fixture.nativeElement.querySelector('[data-auth-enter]')).toBeNull();
    expect(cargarLottie).not.toHaveBeenCalled();
  });

  it('en móvil no descarga lottie ni el panel y el formulario va antes que la ilustración', async () => {
    pantalla(false);
    const fixture = crear();

    enfocarFormulario(fixture);
    await vi.runAllTimersAsync();

    expect(cargarLottie).not.toHaveBeenCalled();
    expect(precargarPanel).not.toHaveBeenCalled();
    const main = fixture.nativeElement.querySelector('main') as HTMLElement;
    const lottieHost = fixture.nativeElement.querySelector('.auth-ilustracion') as HTMLElement;
    const ilustracion = lottieHost.parentElement as HTMLElement;
    expect(main.classList).toContain('order-first');
    expect(ilustracion.classList).toContain('hidden');
    expect(ilustracion.classList).toContain('lg:block');
  });

  it('en escritorio monta lottie cuando el navegador queda libre', async () => {
    pantalla(true);
    const fixture = crear();
    expect(cargarLottie).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(cargarLottie).toHaveBeenCalledTimes(1);
    expect(loadAnimation).toHaveBeenCalledWith(
      expect.objectContaining({
        container: fixture.nativeElement.querySelector('.auth-ilustracion'),
        renderer: 'svg',
        autoplay: true,
        loop: true,
      }),
    );
  });

  it('con movimiento reducido la ilustración queda quieta', async () => {
    pantalla(true, true);
    crear();

    await vi.runAllTimersAsync();

    expect(loadAnimation).toHaveBeenCalledWith(
      expect.objectContaining({ autoplay: false, loop: false }),
    );
  });

  it('precarga el panel una sola vez al escribir en el login y nunca en el registro', async () => {
    pantalla(true);
    const login = crear('login');
    enfocarFormulario(login);
    enfocarFormulario(login);
    await vi.runAllTimersAsync();
    expect(precargarPanel).toHaveBeenCalledTimes(1);

    precargarPanel.mockClear();
    const registro = crear('registro');
    enfocarFormulario(registro);
    await vi.runAllTimersAsync();
    expect(precargarPanel).not.toHaveBeenCalled();
  });

  it('si se sale antes del reposo no descarga nada', async () => {
    pantalla(true);
    const fixture = crear();
    enfocarFormulario(fixture);

    fixture.destroy();
    await vi.runAllTimersAsync();

    expect(cargarLottie).not.toHaveBeenCalled();
    expect(precargarPanel).not.toHaveBeenCalled();
  });

  it('si una descarga falla el formulario sigue disponible y no queda un error sin manejar', async () => {
    pantalla(true);
    cargarLottie.mockRejectedValue(new Error('Failed to fetch dynamically imported module'));
    precargarPanel.mockRejectedValue(new Error('Failed to fetch dynamically imported module'));
    const fixture = crear();

    enfocarFormulario(fixture);
    await vi.runAllTimersAsync();

    expect(cargarLottie).toHaveBeenCalledTimes(1);
    expect(precargarPanel).toHaveBeenCalledTimes(1);
    expect(loadAnimation).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('main #formulario')).not.toBeNull();
  });
});
