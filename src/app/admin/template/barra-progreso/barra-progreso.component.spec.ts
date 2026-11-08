import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { cargaGlobalInterceptor } from '../../../interceptors/carga-global.interceptor';
import { peticionSilenciosa } from '../../../interceptors/contexto-http';
import { BarraProgresoComponent } from './barra-progreso.component';

describe('BarraProgresoComponent', () => {
  let fixture: ComponentFixture<BarraProgresoComponent>;
  let eventos: Subject<unknown>;

  const barra = (): HTMLElement => fixture.nativeElement.querySelector('.bp') as HTMLElement;
  const refrescar = (): void => {
    fixture.detectChanges();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // Un router mínimo: la barra solo lee `events` y `url`, y así los eventos se emiten a mano y sin efectos laterales.
    eventos = new Subject<unknown>();
    TestBed.configureTestingModule({
      imports: [BarraProgresoComponent],
      providers: [
        { provide: Router, useValue: { events: eventos, url: '/dashboard/home' } },
        provideHttpClient(withInterceptors([cargaGlobalInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    fixture = TestBed.createComponent(BarraProgresoComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aparece al empezar a cambiar de pantalla', () => {
    expect(barra().classList).not.toContain('bp--avance');
    eventos.next(new NavigationStart(1, '/dashboard/mantenimiento/productos'));
    refrescar();
    expect(barra().classList).toContain('bp--avance');
    expect(barra().getAttribute('aria-hidden')).toBe('true');
  });

  it('se completa y se retira cuando termina la navegación', () => {
    eventos.next(new NavigationStart(1, '/dashboard/mantenimiento/productos'));
    refrescar();
    eventos.next(new NavigationEnd(1, '/dashboard/mantenimiento/productos', '/dashboard/mantenimiento/productos'));
    refrescar();
    expect(barra().classList).toContain('bp--cierre');
    expect(barra().classList).not.toContain('bp--avance');

    vi.advanceTimersByTime(600);
    refrescar();
    expect(barra().classList).not.toContain('bp--cierre');
    expect(barra().classList).not.toContain('bp--avance');
  });

  it('ignora las peticiones silenciosas y solo cuenta las de primer plano que tardan', () => {
    const http = TestBed.inject(HttpClient);
    const control = TestBed.inject(HttpTestingController);

    http.get('/sondeo', { context: peticionSilenciosa() }).subscribe();
    vi.advanceTimersByTime(1_000);
    refrescar();
    expect(barra().classList).not.toContain('bp--avance');
    control.expectOne('/sondeo').flush({});

    // Una petición normal que responde rápido tampoco enciende la barra.
    http.get('/rapida').subscribe();
    vi.advanceTimersByTime(100);
    control.expectOne('/rapida').flush({});
    vi.advanceTimersByTime(1_000);
    refrescar();
    expect(barra().classList).not.toContain('bp--avance');

    // Una lenta (más de 400 ms) sí.
    http.get('/lenta').subscribe();
    vi.advanceTimersByTime(450);
    refrescar();
    expect(barra().classList).toContain('bp--avance');
    control.expectOne('/lenta').flush({});
    refrescar();
    expect(barra().classList).toContain('bp--cierre');
  });
});
