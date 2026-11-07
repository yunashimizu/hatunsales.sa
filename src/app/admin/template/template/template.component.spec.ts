import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TemplateComponent } from './template.component';

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

    /** Simula la ventana: `ancho` decide qué consultas de medios se cumplen. */
    function simularAncho(ancho: number): void {
      window.matchMedia = vi.fn((consulta: string) => {
        const m = /min-width:\s*(\d+)px/.exec(consulta);
        const x = /max-width:\s*(\d+)px/.exec(consulta);
        const cumple = (!m || ancho >= +m[1]) && (!x || ancho <= +x[1]);
        return { matches: cumple, media: consulta, addEventListener: vi.fn(), removeEventListener: vi.fn() };
      }) as unknown as typeof window.matchMedia;
    }

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
});
