import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { GestionService } from './gestion.service';
import { urlConstants } from '../../../constants/urlConstants';

describe('GestionService · reportes de ventas con rango', () => {
  let servicio: GestionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(GestionService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('sin rango manda solo el periodo, como antes', () => {
    servicio.getReportesVentas('mensual').subscribe();
    const req = http.expectOne((r) => r.url === urlConstants.reportes.ventas);
    expect(req.request.params.keys()).toEqual(['periodo']);
    expect(req.request.params.get('periodo')).toBe('mensual');
    req.flush({});
  });

  it('con rango manda fecha_inicio y fecha_fin junto al periodo; un rango incompleto se ignora', () => {
    servicio.getReportesVentas('mensual', { desde: '2026-10-01', hasta: '2026-10-31' }).subscribe();
    const req = http.expectOne((r) => r.url === urlConstants.reportes.ventas);
    expect(req.request.params.get('fecha_inicio')).toBe('2026-10-01');
    expect(req.request.params.get('fecha_fin')).toBe('2026-10-31');
    expect(req.request.params.get('periodo')).toBe('mensual');
    req.flush({});

    servicio.getReportesVentas('diario', { desde: '2026-10-01' }).subscribe();
    const incompleto = http.expectOne((r) => r.url === urlConstants.reportes.ventas);
    expect(incompleto.request.params.has('fecha_inicio')).toBe(false);
    incompleto.flush({});
  });

  it('Excel y PDF respetan el mismo rango', () => {
    const rango = { desde: '2026-10-01', hasta: '2026-10-31' };
    servicio.exportReportesVentasExcel('mensual', rango).subscribe();
    const excel = http.expectOne((r) => r.url === urlConstants.reportes.ventasExcel);
    expect(excel.request.params.get('fecha_fin')).toBe('2026-10-31');
    expect(excel.request.responseType).toBe('blob');
    excel.flush(new Blob());

    servicio.exportReportesVentasPdf('diario').subscribe();
    const pdf = http.expectOne((r) => r.url === urlConstants.reportes.ventasPdf);
    expect(pdf.request.params.keys()).toEqual(['periodo']);
    pdf.flush(new Blob());
  });
});
