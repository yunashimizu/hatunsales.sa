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
import { ActualizacionAppService } from '../../../shared/ui/actualizacion-app.service';
import { DensidadService } from '../../../shared/ui/densidad.service';
import { TemaService } from '../../../shared/ui/tema.service';
import { AyudaAtajosService } from '../ayuda-atajos/ayuda-atajos.service';
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

  it('la campana de avisos y el menú de usuario no se abren a la vez, y Esc cierra el menú', async () => {
    rol = 'consulta'; // sin estado fiscal: solo la lectura del stock
    await crear();
    const campana = (): HTMLButtonElement => fixture.nativeElement.querySelector('.nt-boton') as HTMLButtonElement;
    const panelAvisos = (): HTMLElement | null => fixture.nativeElement.querySelector('.nt-panel');
    expect(campana()).not.toBeNull();

    component.toggleUser();
    fixture.detectChanges();
    expect(component.showUser).toBe(true);

    campana().click();
    fixture.detectChanges();
    http.match(() => true); // la campana lee los avisos al abrirse
    expect(component.showUser).toBe(false);
    expect(panelAvisos()).not.toBeNull();

    component.toggleUser();
    fixture.detectChanges();
    expect(component.showUser).toBe(true);
    expect(panelAvisos()).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.showUser).toBe(false);
  });

  describe('menú de usuario: tema, densidad y atajos', () => {
    const original = window.matchMedia;
    const menu = (): HTMLElement => fixture.nativeElement.querySelector('.user-dropdown') as HTMLElement;
    const boton = (texto: string): HTMLButtonElement =>
      Array.from(menu().querySelectorAll('button')).find((b) => b.textContent?.trim() === texto) as HTMLButtonElement;

    function simularPunteroFino(fino: boolean): void {
      window.matchMedia = vi.fn((consulta: string) => ({
        matches: fino && consulta.includes('pointer: fine'),
        media: consulta,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia;
    }

    beforeEach(() => {
      rol = 'consulta'; // sin estado fiscal: el menú no depende de ninguna petición
      localStorage.clear();
      document.documentElement.removeAttribute('data-densidad');
    });
    afterEach(() => {
      window.matchMedia = original;
      localStorage.clear();
      document.documentElement.removeAttribute('data-densidad');
    });

    it('cambia el tema (claro, oscuro o sistema) y la densidad desde el menú', async () => {
      simularPunteroFino(true);
      await crear();
      const tema = TestBed.inject(TemaService);

      boton('Oscuro').click();
      fixture.detectChanges();
      expect(tema.modo()).toBe('oscuro');
      expect(boton('Oscuro').getAttribute('aria-pressed')).toBe('true');
      expect(boton('Claro').getAttribute('aria-pressed')).toBe('false');

      boton('Sistema').click();
      fixture.detectChanges();
      expect(tema.modo()).toBe('sistema');
      expect(localStorage.getItem('hs.tema')).toBeNull();

      boton('Compacta').click();
      fixture.detectChanges();
      expect(TestBed.inject(DensidadService).esCompacta()).toBe(true);
      expect(document.documentElement.getAttribute('data-densidad')).toBe('compacta');
      expect(boton('Compacta').getAttribute('aria-pressed')).toBe('true');
    });

    it('con pantalla táctil no ofrece la densidad y «Atajos de teclado» abre la ayuda', async () => {
      simularPunteroFino(false);
      await crear();
      expect(menu().textContent).not.toContain('Densidad');
      expect(menu().textContent).toContain('Tema');

      const ayuda = TestBed.inject(AyudaAtajosService);
      component.showUser = true;
      boton('Atajos de teclado').click();
      expect(ayuda.abierta()).toBe(true);
      expect(component.showUser).toBe(false);
    });

    it('«Instalar HatunSales» solo aparece cuando el navegador ofrece instalar y abre su cuadro', async () => {
      simularPunteroFino(true);
      await crear();
      const app = TestBed.inject(ActualizacionAppService);
      app.iniciar();
      expect(boton('Instalar HatunSales')).toBeUndefined();

      const prompt = vi.fn().mockResolvedValue({ outcome: 'accepted' });
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }));
      fixture.detectChanges();
      expect(boton('Instalar HatunSales')).toBeDefined();

      component.showUser = true;
      boton('Instalar HatunSales').click();
      expect(prompt).toHaveBeenCalledTimes(1);
      expect(component.showUser).toBe(false);
      fixture.detectChanges();
      expect(boton('Instalar HatunSales')).toBeUndefined();
    });
  });
});
