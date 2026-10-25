import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../auth/service/auth.service';
import { urlConstants } from '../../constants/urlConstants';
import { SILENCIOSA } from '../../interceptors/contexto-http';
import { EstadoFiscalApi } from '../models/fiscal.models';
import { FiscalEstadoService } from './fiscal-estado.service';

function estadoApi(cambios: Partial<EstadoFiscalApi> = {}): EstadoFiscalApi {
  return {
    proveedor: 'nubefact',
    proveedor_efectivo: 'nubefact',
    ambiente: 'beta',
    semaforo: 'amarillo',
    listo: false,
    faltantes: [],
    advertencias: [],
    certificado: {
      cargado: true,
      ambiente: 'beta',
      dias_para_vencer: 20,
      vencido: false,
      autofirmado: true,
      alerta: null,
    },
    emision: {
      activa: false,
      ambiente: 'beta',
      codigo: 'FISCAL_BETA_POS_APAGADO',
      motivo: 'La emisión de prueba en SUNAT BETA está apagada.',
    },
    bloqueo: null,
    cola: { pendientes: 2, inciertos: 1 },
    plazos: { vencen_hoy: 0, vencidos: 3 },
    tareas: { activas: true, ultima_ejecucion: null },
    evaluado_en: '2026-10-22T15:00:00.000Z',
    ...cambios,
  };
}

describe('FiscalEstadoService', () => {
  let http: HttpTestingController;
  let conSesion = true;

  function crear(): FiscalEstadoService {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isLoggedIn: () => conSesion } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(FiscalEstadoService);
  }

  const peticionEstado = () => http.expectOne((r) => r.url === urlConstants.fiscal.estado);

  beforeEach(() => {
    conSesion = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  it('no consulta nada sin sesión', () => {
    conSesion = false;
    const servicio = crear();
    servicio.iniciar();
    servicio.refrescar(true);
    http.expectNone(urlConstants.fiscal.estado);
    expect(servicio.estado()).toBeNull();
  });

  it('resume el estado en una lectura silenciosa compartida y solo la repite forzada', () => {
    const servicio = crear();
    servicio.iniciar();
    const peticion = peticionEstado();
    expect(peticion.request.context.get(SILENCIOSA)).toBe(true);
    peticion.flush(estadoApi());

    expect(servicio.estado()).toEqual(
      expect.objectContaining({
        ambiente: 'beta',
        emision_activa: false,
        codigo: 'FISCAL_BETA_POS_APAGADO',
        motivo: 'La emisión de prueba en SUNAT BETA está apagada.',
        cola: { pendientes: 2, inciertos: 1 },
        plazos: { vencen_hoy: 0, vencidos: 3 },
      }),
    );
    expect(servicio.estado()?.certificado.dias_para_vencer).toBe(20);
    expect(servicio.error()).toBeNull();

    servicio.iniciar();
    servicio.refrescar();
    http.expectNone(urlConstants.fiscal.estado);

    servicio.refrescar(true);
    peticionEstado().flush(estadoApi({ emision: null, cola: null }));
    expect(servicio.estado()?.emision_activa).toBeNull();
    expect(servicio.estado()?.cola).toBeNull();
  });

  it('si la lectura falla oculta el estado, guarda el aviso y reintenta sola al minuto', () => {
    vi.useFakeTimers();
    const servicio = crear();
    servicio.iniciar();
    peticionEstado().flush(estadoApi());
    servicio.refrescar(true);
    peticionEstado().flush(
      { message: 'El servidor no está disponible en este momento.' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(servicio.estado()).toBeNull();
    expect(servicio.error()).toContain('no está disponible');
    expect(servicio.error()).not.toContain('[object');

    vi.advanceTimersByTime(59_000);
    http.expectNone(urlConstants.fiscal.estado);
    vi.advanceTimersByTime(1_000);
    peticionEstado().flush(estadoApi({ emision: { activa: true, ambiente: 'beta' } }));
    expect(servicio.estado()?.emision_activa).toBe(true);
    expect(servicio.error()).toBeNull();
  });

  it('no reintenta cuando el rol no puede ver el estado y renueva el estado viejo al volver a la pestaña', () => {
    vi.useFakeTimers();
    const servicio = crear();
    servicio.iniciar();
    peticionEstado().flush({ message: 'Sin permiso' }, { status: 403, statusText: 'Forbidden' });
    vi.advanceTimersByTime(180_000);
    http.expectNone(urlConstants.fiscal.estado);

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      peticionEstado().flush(estadoApi());
      document.dispatchEvent(new Event('visibilitychange'));
      http.expectNone(urlConstants.fiscal.estado);

      vi.advanceTimersByTime(31_000);
      document.dispatchEvent(new Event('visibilitychange'));
      peticionEstado().flush(estadoApi());
    } finally {
      delete (document as { visibilityState?: unknown }).visibilityState;
    }
  });
});
