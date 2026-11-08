import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlConstants } from '../../constants/urlConstants';
import { SILENCIOSA } from '../../interceptors/contexto-http';
import { ReportesService } from './reportes.service';

describe('ReportesService.ventas', () => {
  let servicio: ReportesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(ReportesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('manda solo el periodo cuando no hay rango', () => {
    servicio.ventas('mensual').subscribe();
    const req = http.expectOne((r) => r.url === urlConstants.reportes.ventas);
    expect(req.request.params.get('periodo')).toBe('mensual');
    expect(req.request.params.has('fecha_inicio')).toBe(false);
    expect(req.request.params.has('fecha_fin')).toBe(false);
    expect(req.request.context.get(SILENCIOSA)).toBe(false);
    req.flush({});
  });

  it('con rango manda fecha_inicio y fecha_fin, y la lectura de fondo va en silencio', () => {
    servicio.ventas('diario', { fecha_inicio: '2026-11-07', fecha_fin: '2026-11-07' }, { silenciosa: true }).subscribe();
    const req = http.expectOne((r) => r.url === urlConstants.reportes.ventas);
    expect(req.request.params.get('periodo')).toBe('diario');
    expect(req.request.params.get('fecha_inicio')).toBe('2026-11-07');
    expect(req.request.params.get('fecha_fin')).toBe('2026-11-07');
    expect(req.request.context.get(SILENCIOSA)).toBe(true);
    req.flush({});
  });
});
