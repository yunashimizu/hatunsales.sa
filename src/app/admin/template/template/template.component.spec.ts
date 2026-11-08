import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';

import { TemaService } from '../../../shared/ui/tema.service';
import { TemplateComponent } from './template.component';

/** Simula la ventana: `ancho` decide qué consultas de medios se cumplen. */
function simularAncho(ancho: number): void {
  window.matchMedia = vi.fn((consulta: string) => {
    const m = /min-width:\s*(\d+)px/.exec(consulta);
    const x = /max-width:\s*(\d+)px/.exec(consulta);
    const cumple = (!m || ancho >= +m[1]) && (!x || ancho <= +x[1]);
    return { matches: cumple, media: consulta, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  }) as unknown as typeof window.matchMedia;
}

describe('TemplateComponent', () => {
  let component: TemplateComponent;
  let fixture: ComponentFixture<TemplateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TemplateComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(TemplateComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('menú lateral por ancho', () => {
    const original = window.matchMedia;

    beforeEach(() => localStorage.removeItem('hs.panel.menu'));
    afterEach(() => {
      window.matchMedia = original;
      localStorage.removeItem('hs.panel.menu');
    });

    it('en tablet arranca plegado (rail)', () => {
      simularAncho(1024);
      component.ngOnInit();
      expect(component.sidebarCollapsed).toBe(true);
    });

    it('en tablet con la preferencia «abierto» guardada arranca abierto', () => {
      simularAncho(1024);
      localStorage.setItem('hs.panel.menu', 'abierto');
      component.ngOnInit();
      expect(component.sidebarCollapsed).toBe(false);
    });

    it('en escritorio arranca abierto y recuerda «compacto»', () => {
      simularAncho(1440);
      component.ngOnInit();
      expect(component.sidebarCollapsed).toBe(false);
      component.toggleSidebar();
      expect(localStorage.getItem('hs.panel.menu')).toBe('compacto');
    });
  });

  describe('accesibilidad y barra del navegador', () => {
    const original = window.matchMedia;
    let eventos: Subject<unknown>;

    const contenido = (): HTMLElement => fixture.nativeElement.querySelector('.main-content') as HTMLElement;
    const meta = (): string | null =>
      document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.getAttribute('content') ?? null;
    const terminarNavegacion = (id: number, url = `/dashboard/pantalla-${id}`): void =>
      eventos.next(new NavigationEnd(id, url, url));

    beforeEach(() => {
      vi.useFakeTimers();
      simularAncho(1440);
      eventos = TestBed.inject(Router).events as unknown as Subject<unknown>;
      fixture.detectChanges();
    });

    afterEach(() => {
      vi.useRealTimers();
      window.matchMedia = original;
      (document.activeElement as HTMLElement | null)?.blur?.();
    });

    it('ofrece «Saltar al contenido» y el contenido puede recibir el foco', () => {
      const salto = fixture.nativeElement.querySelector('#wrapper > .adm-saltar') as HTMLAnchorElement;
      expect(salto.textContent).toContain('Saltar al contenido');
      expect(contenido().id).toBe('contenido');
      expect(contenido().getAttribute('tabindex')).toBe('-1');
      salto.click();
      expect(document.activeElement).toBe(contenido());
    });

    it('al cambiar de pantalla pasa el foco al contenido si nadie lo tomó; con solo cambiar filtros no', () => {
      const boton = fixture.nativeElement.querySelector('app-header .toggle-btn') as HTMLElement | null;

      // Misma pantalla (la actual es «/»), solo otra consulta: el foco no se mueve.
      boton?.focus();
      terminarNavegacion(1, '/?q=tuerca');
      vi.advanceTimersByTime(10);
      expect(document.activeElement).toBe(boton);

      terminarNavegacion(2);
      vi.advanceTimersByTime(10);
      expect(document.activeElement).toBe(contenido());
    });

    it('no le quita el foco a una pantalla que ya enfocó su propio campo (el escáner de Vender)', () => {
      const escaner = document.createElement('input');
      contenido().append(escaner);
      escaner.focus();
      terminarNavegacion(2);
      vi.advanceTimersByTime(10);
      expect(document.activeElement).toBe(escaner);
    });

    it('si la pantalla nueva marca un campo con autofocus (escáner) lo enfoca, pero solo con ratón', () => {
      const escaner = document.createElement('input');
      escaner.setAttribute('autofocus', '');
      contenido().append(escaner);
      (document.activeElement as HTMLElement | null)?.blur(); // jsdom ya procesa el autofocus al insertar

      // Sin puntero fino (teléfono): se enfoca el contenido, no el campo (evita abrir el teclado).
      const consulta = (fino: boolean) =>
        vi.fn((c: string) => ({
          matches: c.includes('pointer') ? fino : false,
          media: c,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })) as unknown as typeof window.matchMedia;
      window.matchMedia = consulta(false);
      terminarNavegacion(1);
      vi.advanceTimersByTime(10);
      expect(document.activeElement).toBe(contenido());

      (document.activeElement as HTMLElement).blur();
      window.matchMedia = consulta(true);
      terminarNavegacion(2);
      vi.advanceTimersByTime(10);
      expect(document.activeElement).toBe(escaner);
    });

    it('pinta la barra del navegador con el fondo del panel y la devuelve al salir', () => {
      expect(meta()).toBe('#f4f3ef');
      TestBed.inject(TemaService).fijar('oscuro');
      expect(meta()).toBe('#161716');
      fixture.destroy();
      expect(meta()).toBe('#0d1220');
    });
  });
});
