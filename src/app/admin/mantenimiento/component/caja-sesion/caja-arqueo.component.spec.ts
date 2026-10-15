import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { urlConstants } from '../../../../constants/urlConstants';
import { AlertService } from '../../../../shared/services/alert.service';
import { ArqueoEsperado, ArqueoResumen } from '../../../models/caja-arqueo.models';
import { CajaArqueoComponent } from './caja-arqueo.component';

function esperadoPrueba(): ArqueoEsperado {
  return {
    apertura: { id_apertura: 12, abierta: true, caja_nombre: 'Caja de prueba' },
    efectivo: { monto_inicial: 50, ventas: 50, abonos: 0, ingresos: 0, egresos: 0, esperado: 100 },
    otros_medios: [
      { clave: '2', id_metodo: 2, nombre: 'Yape', categoria: 'billetera', esperado: 20 },
    ],
    credito: { ventas: 0, operaciones: 0 },
    total_cobrado: 70,
    denominaciones: [
      { tipo: 'billete', denominacion: 100, etiqueta: 'S/ 100' },
      { tipo: 'moneda', denominacion: 0.1, etiqueta: 'S/ 0.10' },
    ],
    medios_declarables: [{ id_metodo: 2, nombre: 'Yape', categoria: 'billetera' }],
    tolerancia: 0.05,
    ultimo_arqueo: null,
    generado_en: '2026-10-15T17:00:00Z',
  };
}

const arqueoGuardado: ArqueoResumen = {
  id_arqueo: 5,
  codigo: 'ARQ-5',
  tipo: 'cierre',
  fecha: '2026-10-15T17:00:00Z',
  efectivo_esperado: 100,
  efectivo_contado: 100,
  diferencia: 0,
  mensaje: 'Cuadra',
  hay_diferencia: false,
  id_cierre: null,
};

describe('CajaArqueoComponent', () => {
  let fixture: ComponentFixture<CajaArqueoComponent>;
  let component: CajaArqueoComponent;
  let http: HttpTestingController;
  const alerta = {
    toast: vi.fn(),
    error: vi.fn(),
    confirm: vi.fn(async () => ({ isConfirmed: true })),
  };

  function responderCarga(esperado = esperadoPrueba()): void {
    const consulta = http.expectOne((r) => r.url === urlConstants.caja.arqueoEsperado);
    expect(consulta.request.params.get('id_apertura')).toBe('12');
    consulta.flush(esperado);
    http
      .expectOne((r) => r.url === urlConstants.caja.arqueo && r.method === 'GET')
      .flush({ items: [] });
    http
      .expectOne((r) => r.url === urlConstants.caja.movimientos && r.method === 'GET')
      .flush({ items: [] });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [CajaArqueoComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AlertService, useValue: alerta },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CajaArqueoComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('idApertura', 12);
    fixture.detectChanges();
    responderCarga();
  });

  afterEach(() => http.verify());

  it('informa al contenedor si el servidor todavía no tiene el módulo de arqueo', () => {
    const disponible = vi.fn();
    component.disponibilidad.subscribe(disponible);
    component.cargar();
    const consulta = http.expectOne((r) => r.url === urlConstants.caja.arqueoEsperado);
    const historial = http.expectOne(
      (r) => r.url === urlConstants.caja.arqueo && r.method === 'GET',
    );
    const movimientos = http.expectOne(
      (r) => r.url === urlConstants.caja.movimientos && r.method === 'GET',
    );
    consulta.flush(
      { message: 'Cannot GET /caja/arqueo/esperado' },
      { status: 404, statusText: 'Not Found' },
    );
    expect(disponible).toHaveBeenLastCalledWith(false);
    expect(component.errorCarga).toContain('pendiente de habilitar');
    expect(historial.cancelled).toBe(true);
    expect(movimientos.cancelled).toBe(true);
  });

  it('exige observación cuando el conteo o un medio declarado no cuadra', async () => {
    await component.registrar('parcial');
    http.expectNone((r) => r.method === 'POST');
    expect(alerta.toast).toHaveBeenCalled();
    component.denominaciones[0].cantidad = 1;
    component.medios[0].declarado = 0;
    expect(component.requiereObservacion).toBe(true);
    component.medios[0].declarado = null;
    expect(component.requiereObservacion).toBe(false);
  });

  it('calcula las monedas en céntimos y rechaza cantidades fraccionarias', async () => {
    component.denominaciones[1].cantidad = 3;
    expect(component.contado).toBe(0.3);
    component.denominaciones[0].cantidad = 0.5;
    component.observacion = 'Conteo de prueba';
    await component.registrar('parcial');
    http.expectNone((r) => r.method === 'POST');
  });

  it('conserva la clave de idempotencia al reintentar el mismo arqueo', async () => {
    component.denominaciones[0].cantidad = 1;
    await component.registrar('parcial');
    const primera = http.expectOne(
      (r) => r.url === urlConstants.caja.arqueo && r.method === 'POST',
    );
    const clave = primera.request.body.clave_idempotencia;
    expect(primera.request.body.medios).toEqual([]);
    primera.flush(
      { message: 'Temporalmente no disponible' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    await component.registrar('parcial');
    const segunda = http.expectOne(
      (r) => r.url === urlConstants.caja.arqueo && r.method === 'POST',
    );
    expect(segunda.request.body.clave_idempotencia).toBe(clave);
    segunda.flush({ ...arqueoGuardado, tipo: 'parcial' });
    responderCarga();
  });

  it('cierra el turno usando el id del arqueo guardado', async () => {
    const actualizado = vi.fn();
    component.actualizado.subscribe(actualizado);
    component.denominaciones[0].cantidad = 1;
    await component.registrar('cierre');
    http
      .expectOne((r) => r.url === urlConstants.caja.arqueo && r.method === 'POST')
      .flush(arqueoGuardado);
    const cierre = http.expectOne(urlConstants.caja.cerrar);
    expect(cierre.request.body).toEqual({ id_apertura: 12, id_arqueo: 5 });
    cierre.flush({ cerrada: true });
    responderCarga({
      ...esperadoPrueba(),
      apertura: { ...esperadoPrueba().apertura, abierta: false },
    });
    expect(actualizado).toHaveBeenCalledOnce();
    expect(component.cierrePendiente).toBeNull();
  });

  it('reintenta solo el cierre si el arqueo ya se guardó', async () => {
    component.denominaciones[0].cantidad = 1;
    await component.registrar('cierre');
    http
      .expectOne((r) => r.url === urlConstants.caja.arqueo && r.method === 'POST')
      .flush(arqueoGuardado);
    http
      .expectOne(urlConstants.caja.cerrar)
      .flush({ message: 'No se pudo cerrar' }, { status: 503, statusText: 'Service Unavailable' });
    expect(component.cierrePendiente?.id_arqueo).toBe(5);
    component.reintentarCierre();
    http.expectNone((r) => r.url === urlConstants.caja.arqueo && r.method === 'POST');
    http.expectOne(urlConstants.caja.cerrar).flush({ cerrada: true });
    responderCarga({
      ...esperadoPrueba(),
      apertura: { ...esperadoPrueba().apertura, abierta: false },
    });
    expect(component.cierrePendiente).toBeNull();
  });

  it('impide registrar dos movimientos mientras la primera petición sigue en curso', () => {
    component.movimiento = { tipo: 'egreso', monto: 10, descripcion: 'Compra de útiles' };
    component.registrarMovimiento();
    component.registrarMovimiento();
    const peticion = http.expectOne(
      (r) => r.url === urlConstants.caja.movimientos && r.method === 'POST',
    );
    expect(peticion.request.body).toEqual({
      id_apertura: 12,
      tipo: 'egreso',
      monto: 10,
      descripcion: 'Compra de útiles',
    });
    peticion.flush({ id_movimiento: 1 });
    responderCarga();
    expect(component.movimiento.monto).toBeNull();
  });
});
