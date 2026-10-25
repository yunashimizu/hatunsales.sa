import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthService } from '../../../auth/service/auth.service';
import { urlConstants } from '../../../constants/urlConstants';
import { AlertService } from '../../../shared/services/alert.service';
import { ConfigFiscal } from '../../service/configuracion-fiscal.service';
import { AdminConfiguracionComponent } from './configuracion.component';

const configFiscal: ConfigFiscal = {
  emisor: {
    ruc: '20610206337',
    razon_social: 'HATUNSALES S.A.C.',
    direccion: 'Av. Prueba 123',
    ubicacion: 'LURIN - LIMA - LIMA',
    logo_url: '',
  },
  proforma: { condiciones: '' },
  series: { serie_boleta: 'B001', serie_factura: 'F001', editable: false },
  estados: { whatsapp_cloud: false, caja_modo: 'blando' },
};

const seriesVigentes = {
  serie_boleta: 'BB01',
  serie_factura: 'FB01',
  por_tipo: { 1: 'FB01', 2: 'BB01' },
  editable_en_pos: false,
  fuente: 'fiscal',
  ambiente: 'beta',
  emision_activa: true,
  aviso: 'Prueba SUNAT BETA: sin validez tributaria',
  mensaje: 'Prueba SUNAT BETA: sin validez tributaria. Series FB01 (factura) y BB01 (boleta).',
};

describe('AdminConfiguracionComponent', () => {
  let fixture: ComponentFixture<AdminConfiguracionComponent>;
  let http: HttpTestingController;
  const alerta = { toast: vi.fn(), error: vi.fn() };
  const auth = {
    data$: new Subject<void>(),
    getSesion: () => ({
      idUsuario: 1,
      nombre: 'Moisés',
      email: '',
      rolId: 1,
      rolNombre: 'admin',
      permisos: [],
      iniciales: 'M',
    }),
    etiquetaRol: () => 'Administrador',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AdminConfiguracionComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: AlertService, useValue: alerta },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminConfiguracionComponent);
    fixture.detectChanges();
    http.expectOne(urlConstants.configuracion.fiscal).flush(configFiscal);
  });

  afterEach(() => http.verify());

  it('muestra las series vigentes en solo lectura y guarda sin enviar series', () => {
    http.expectOne(urlConstants.configuracion.series).flush(seriesVigentes);
    fixture.detectChanges();
    const pagina = fixture.nativeElement as HTMLElement;
    expect(pagina.textContent).toContain('FB01');
    expect(pagina.textContent).toContain('BB01');
    expect(pagina.textContent).toContain('Las series se configuran en Facturación SUNAT');
    expect(pagina.querySelector('#cfg-serie-b')).toBeNull();
    const enlace = Array.from(pagina.querySelectorAll('a')).find((a) => a.textContent?.includes('Ir a Facturación SUNAT'));
    expect(enlace?.getAttribute('href')).toBe('/dashboard/facturacion-sunat');

    fixture.componentInstance.guardarFiscal();
    const peticion = http.expectOne(urlConstants.configuracion.fiscal);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body.series).toBeUndefined();
    expect(peticion.request.body.emisor.ruc).toBe('20610206337');
    peticion.flush(configFiscal);
  });

  it('avisa si no se pudieron leer las series y permite reintentar', () => {
    http
      .expectOne(urlConstants.configuracion.series)
      .flush({ message: 'Internal server error' }, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();
    const aviso = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(aviso.textContent).toContain('No se pudieron leer las series vigentes');
    (aviso.querySelector('button') as HTMLButtonElement).click();
    http.expectOne(urlConstants.configuracion.series).flush(seriesVigentes);
  });
});
