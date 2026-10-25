import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthService } from '../../../auth/service/auth.service';
import { urlConstants } from '../../../constants/urlConstants';
import { EstadoFiscalApi } from '../../models/fiscal.models';
import { FiscalEstadoService } from '../../service/fiscal-estado.service';
import { HeaderComponent } from './header.component';

@Component({ template: '' })
class PaginaVacia {}

function estadoApi(cambios: Partial<EstadoFiscalApi> = {}): EstadoFiscalApi {
  return {
    proveedor: 'nubefact',
    proveedor_efectivo: 'nubefact',
    ambiente: 'beta',
    semaforo: 'verde',
    listo: false,
    faltantes: [],
    advertencias: [],
    certificado: {
      cargado: true,
      ambiente: 'beta',
      dias_para_vencer: 200,
      vencido: false,
      autofirmado: true,
      alerta: null,
    },
    emision: { activa: true, ambiente: 'beta' },
    bloqueo: null,
    cola: { pendientes: 0, inciertos: 0 },
    plazos: { vencen_hoy: 0, vencidos: 0 },
    tareas: null,
    evaluado_en: '2026-10-22T15:00:00.000Z',
    ...cambios,
  };
}

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let http: HttpTestingController;
  let logueado = true;
  let rol = 'admin';

  const auth = {
    data$: new Subject<void>(),
    getSesion: () => ({
      idUsuario: 1,
      nombre: 'Moisés',
      email: '',
      rolId: 1,
      rolNombre: rol,
      permisos: [],
      iniciales: 'M',
    }),
    isLoggedIn: () => logueado,
    puedeVer: (roles: string[]) => roles.includes(rol),
    etiquetaRol: () => 'Administrador',
    logout: vi.fn(),
  };

  async function crear(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([{ path: 'dashboard/facturacion-sunat', component: PaginaVacia }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function responderEstado(estado: EstadoFiscalApi): void {
    http.expectOne((r) => r.url === urlConstants.fiscal.estado).flush(estado);
    fixture.detectChanges();
  }

  const chip = (): HTMLElement | null => fixture.nativeElement.querySelector('.tb-fiscal');

  beforeEach(() => {
    logueado = true;
    rol = 'admin';
  });

  afterEach(() => http.verify());

  it('muestra el ambiente de emisión con su color y el motivo cuando está detenida', async () => {
    await crear();
    responderEstado(estadoApi());
    expect(chip()?.textContent).toContain('SUNAT BETA - pruebas');
    expect(chip()?.classList).toContain('tb-fiscal--beta');
    expect(chip()?.tagName).toBe('A');
    expect(chip()?.querySelector('.tb-fiscal__alerta')).toBeNull();

    const estado = TestBed.inject(FiscalEstadoService);
    estado.refrescar(true);
    responderEstado(estadoApi({ ambiente: 'produccion', emision: { activa: true, ambiente: 'produccion' } }));
    expect(chip()?.textContent).toContain('SUNAT PRODUCCIÓN');
    expect(chip()?.classList).toContain('tb-fiscal--produccion');

    const motivo = 'La emisión está detenida: SUNAT no reconoce el usuario o la clave SOL.';
    estado.refrescar(true);
    responderEstado(
      estadoApi({
        ambiente: 'produccion',
        emision: { activa: false, ambiente: 'produccion', codigo: 'FISCAL_EMISION_BLOQUEADA', motivo },
        bloqueo: { codigo: '0102', motivo: 'Usuario o clave SOL incorrectos.', fecha: '2026-10-22T14:00:00.000Z' },
        plazos: { vencen_hoy: 0, vencidos: 2 },
      }),
    );
    expect(chip()?.textContent).toContain('Emisión detenida');
    expect(chip()?.classList).toContain('tb-fiscal--detenida');
    expect(chip()?.getAttribute('title')).toContain(motivo);
    expect(chip()?.getAttribute('title')).toContain('2 comprobante(s) fuera del plazo');
    expect(chip()?.querySelector('.tb-fiscal__alerta')).not.toBeNull();
  });

  it('si el estado no se puede leer oculta el chip y la cabecera sigue funcionando', async () => {
    await crear();
    http
      .expectOne((r) => r.url === urlConstants.fiscal.estado)
      .flush({ message: 'Error interno' }, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();
    expect(chip()).toBeNull();
    expect(fixture.nativeElement.querySelector('.tb-title__text')?.textContent).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('[object Object]');
  });

  it('no consulta el estado sin sesión ni para roles que no venden', async () => {
    logueado = false;
    await crear();
    http.expectNone(urlConstants.fiscal.estado);
    expect(chip()).toBeNull();

    TestBed.resetTestingModule();
    logueado = true;
    rol = 'consulta';
    await crear();
    http.expectNone(urlConstants.fiscal.estado);
    expect(chip()).toBeNull();
  });

  it('para vendedor el chip no enlaza al panel y el título reconoce Facturación SUNAT', async () => {
    rol = 'vendedor';
    await crear();
    responderEstado(estadoApi());
    expect(chip()?.tagName).toBe('SPAN');

    await TestBed.inject(Router).navigateByUrl('/dashboard/facturacion-sunat');
    expect(component.paginaActual).toBe('Facturación SUNAT');
  });
});
