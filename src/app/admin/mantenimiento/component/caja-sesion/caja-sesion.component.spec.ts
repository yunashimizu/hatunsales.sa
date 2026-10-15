import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlConstants } from '../../../../constants/urlConstants';
import { AlertService } from '../../../../shared/services/alert.service';
import { CajaSesionComponent } from './caja-sesion.component';

describe('CajaSesionComponent: compatibilidad y estado verificado', () => {
  let component: CajaSesionComponent;
  let http: HttpTestingController;
  const alerta = {
    toast: vi.fn(),
    error: vi.fn(),
    confirm: vi.fn(async () => ({ isConfirmed: true })),
  };
  const apertura = {
    id_apertura: 12,
    id_caja: 1,
    caja_nombre: 'Caja 1',
    id_sucursal: 1,
    sucursal_nombre: 'Principal',
    id_usuario: 1,
    fecha: null,
    monto_inicial: 50,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [CajaSesionComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AlertService, useValue: alerta },
      ],
    })
      .overrideComponent(CajaSesionComponent, { set: { template: '' } })
      .compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CajaSesionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('conserva el cierre anterior si el servidor aún no ofrece arqueos', async () => {
    http.expectOne(urlConstants.caja.sesion).flush({ abierta: true, modo: 'blando', apertura });
    http.expectOne(urlConstants.caja.disponibles).flush({ items: [] });
    component.arqueoDisponible = false;
    component.montoConteo = 100;
    component.observacion = 'Cierre de prueba';
    await component.cerrarSinArqueo();
    const cierre = http.expectOne(urlConstants.caja.cerrar);
    expect(cierre.request.body).toEqual({
      id_apertura: 12,
      monto_conteo: 100,
      observacion: 'Cierre de prueba',
    });
    cierre.flush({ cerrada: true });
    http
      .expectOne(urlConstants.caja.sesion)
      .flush({ abierta: false, modo: 'blando', apertura: null });
    http.expectOne(urlConstants.caja.disponibles).flush({ items: [] });
    expect(component.idTurnoArqueo).toBe(12);
  });

  it('usa el flujo de arqueo cuando el nuevo módulo está disponible', async () => {
    http.expectOne(urlConstants.caja.sesion).flush({ abierta: true, modo: 'blando', apertura });
    http.expectOne(urlConstants.caja.disponibles).flush({ items: [] });
    component.arqueoDisponible = true;
    await component.cerrarSinArqueo();
    http.expectNone((r) => r.method === 'POST');
    expect(alerta.confirm).not.toHaveBeenCalled();
  });

  it('bloquea la apertura cuando no se pudo comprobar la sesión actual', () => {
    http
      .expectOne(urlConstants.caja.sesion)
      .flush({ message: 'Servidor ocupado' }, { status: 503, statusText: 'Service Unavailable' });
    http
      .expectOne(urlConstants.caja.disponibles)
      .flush({ items: [{ id_caja: 1, nombre: 'Caja libre', ocupada: false }] });
    component.abrir();
    expect(component.errorSesion).toBeTruthy();
    http.expectNone((r) => r.method === 'POST');
  });
});
