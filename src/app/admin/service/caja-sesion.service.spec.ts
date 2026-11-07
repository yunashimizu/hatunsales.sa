import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlConstants } from '../../constants/urlConstants';
import { CajaSesionService } from './caja-sesion.service';

describe('CajaSesionService: apertura y arqueo por sucursal', () => {
  let servicio: CajaSesionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(CajaSesionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('abre con efectivo mandando solo id_caja y monto_inicial', () => {
    servicio.abrir({ id_caja: 3, monto_inicial: 120.5 }).subscribe();
    const peticion = http.expectOne(urlConstants.caja.abrir);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ id_caja: 3, monto_inicial: 120.5 });
    peticion.flush({ id_apertura: 1, sugerido_inicial: 100, diferencia_sugerido: 20.5 });
  });

  it('abre sin efectivo con sin_efectivo: true', () => {
    servicio.abrir({ id_caja: 3, sin_efectivo: true }).subscribe();
    const peticion = http.expectOne(urlConstants.caja.abrir);
    expect(peticion.request.body).toEqual({ id_caja: 3, sin_efectivo: true });
    peticion.flush({});
  });

  it('pide los turnos con paginación y descarta los filtros vacíos', () => {
    let respuesta: unknown;
    servicio
      .aperturas({
        id_sucursal: 2,
        id_caja: null,
        id_usuario: undefined,
        desde: '2026-11-01',
        hasta: '',
        pagina: 3,
        por_pagina: 20,
      })
      .subscribe((r) => (respuesta = r));
    const peticion = http.expectOne((r) => r.url === urlConstants.caja.aperturas);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.get('id_sucursal')).toBe('2');
    expect(peticion.request.params.get('desde')).toBe('2026-11-01');
    expect(peticion.request.params.get('pagina')).toBe('3');
    expect(peticion.request.params.get('por_pagina')).toBe('20');
    for (const ausente of ['id_caja', 'id_usuario', 'hasta']) {
      expect(peticion.request.params.has(ausente)).toBe(false);
    }
    peticion.flush({ items: [], total: 0, pagina: 3, por_pagina: 20 });
    expect(respuesta).toEqual({ items: [], total: 0, pagina: 3, por_pagina: 20 });
  });

  it('pide el resumen por sucursal solo con el rango de fechas', () => {
    servicio.resumenSucursales({ desde: '2026-11-01', hasta: '2026-11-06' }).subscribe();
    const peticion = http.expectOne((r) => r.url === urlConstants.caja.resumenSucursales);
    expect(peticion.request.params.get('desde')).toBe('2026-11-01');
    expect(peticion.request.params.get('hasta')).toBe('2026-11-06');
    expect(peticion.request.params.keys()).toEqual(['desde', 'hasta']);
    peticion.flush({ desde: '2026-11-01', hasta: '2026-11-06', sucursales: [], total: {} });
  });

  it('descarga el PDF del resumen como blob con desde, hasta e id_sucursal', () => {
    let blob: Blob | undefined;
    servicio
      .resumenSucursalesPdf({ desde: '2026-11-01', hasta: '2026-11-06', id_sucursal: 2 })
      .subscribe((b) => (blob = b));
    const peticion = http.expectOne((r) => r.url === urlConstants.caja.resumenSucursalesPdf);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.responseType).toBe('blob');
    expect(peticion.request.params.get('desde')).toBe('2026-11-01');
    expect(peticion.request.params.get('hasta')).toBe('2026-11-06');
    expect(peticion.request.params.get('id_sucursal')).toBe('2');
    peticion.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
    expect(blob?.type).toBe('application/pdf');
  });

  it('el PDF del resumen no manda id_sucursal si no hay sucursal elegida', () => {
    servicio.resumenSucursalesPdf({ desde: '2026-11-01', hasta: '2026-11-06', id_sucursal: null }).subscribe();
    const peticion = http.expectOne((r) => r.url === urlConstants.caja.resumenSucursalesPdf);
    expect(peticion.request.params.keys()).toEqual(['desde', 'hasta']);
    peticion.flush(new Blob(['%PDF']));
  });

  it('las rutas nuevas cuelgan de /caja', () => {
    expect(urlConstants.caja.aperturas.endsWith('/caja/aperturas')).toBe(true);
    expect(urlConstants.caja.resumenSucursales.endsWith('/caja/resumen-sucursales')).toBe(true);
    expect(urlConstants.caja.resumenSucursalesPdf.endsWith('/caja/resumen-sucursales/pdf')).toBe(true);
  });
});
