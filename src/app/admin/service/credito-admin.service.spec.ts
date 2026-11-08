import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlConstants } from '../../constants/urlConstants';
import { SILENCIOSA } from '../../interceptors/contexto-http';
import { CreditoAdminService } from './credito-admin.service';

describe('CreditoAdminService', () => {
  let servicio: CreditoAdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(CreditoAdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('apunta a credito/cuentas/vencidas-resumen', () => {
    expect(urlConstants.credito.vencidasResumen.endsWith('credito/cuentas/vencidas-resumen')).toBe(true);
  });

  it('dos llamadas seguidas comparten una sola petición', () => {
    const recibidos: unknown[] = [];
    servicio.vencidasResumen().subscribe((r) => recibidos.push(r));
    servicio.vencidasResumen().subscribe((r) => recibidos.push(r));
    const peticion = http.expectOne(urlConstants.credito.vencidasResumen);
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ cuentas: 2, total: 150.5 });
    expect(recibidos).toEqual([
      { cuentas: 2, total: 150.5 },
      { cuentas: 2, total: 150.5 },
    ]);
  });

  it('invalidar() fuerza una petición nueva', () => {
    servicio.vencidasResumen().subscribe();
    http.expectOne(urlConstants.credito.vencidasResumen).flush({ cuentas: 1, total: 10 });
    servicio.invalidar();
    servicio.vencidasResumen().subscribe();
    http.expectOne(urlConstants.credito.vencidasResumen).flush({ cuentas: 0, total: 0 });
  });

  it('silenciosa marca la petición con el contexto SILENCIOSA; sin ella no', () => {
    servicio.vencidasResumen({ silenciosa: true }).subscribe();
    const silenciosa = http.expectOne(urlConstants.credito.vencidasResumen);
    expect(silenciosa.request.context.get(SILENCIOSA)).toBe(true);
    silenciosa.flush({ cuentas: 0, total: 0 });

    servicio.invalidar();
    servicio.vencidasResumen().subscribe();
    const normal = http.expectOne(urlConstants.credito.vencidasResumen);
    expect(normal.request.context.get(SILENCIOSA)).toBe(false);
    normal.flush({ cuentas: 0, total: 0 });
  });
});
