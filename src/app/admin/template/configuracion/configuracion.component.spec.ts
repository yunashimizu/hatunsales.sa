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

const URL_RESUMEN = urlConstants.reportes.ventas.replace(/ventas$/, '') + 'resumen-diario';
const resumenApagado = {
  activo: false,
  hora: '20:30',
  correos: [] as string[],
  destinatarios: ['ventas@hatunsales.pe'],
  ultimo_envio: '2026-11-05',
  proveedor: 'brevo',
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
    http.expectOne(`${URL_RESUMEN}/configuracion`).flush(resumenApagado);
    fixture.detectChanges();
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
  describe('Resumen diario por correo', () => {
    const tarjeta = () => fixture.nativeElement.querySelector('app-resumen-diario-config') as HTMLElement;
    const boton = (id: string) => tarjeta().querySelector<HTMLButtonElement>(id)!;
    const escribir = (id: string, valor: string) => {
      const campo = tarjeta().querySelector<HTMLInputElement>(id)!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };

    beforeEach(() => http.expectOne(urlConstants.configuracion.series).flush(seriesVigentes));

    it('muestra la hora y el contenido del correo, y si lo deja vacío explica que usa el correo del emisor', async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      expect(tarjeta().textContent).toContain('Cada día a las 20:30 recibirás un correo con las ventas, la caja, los comprobantes con problema, la deuda vencida y el stock crítico.');
      expect(tarjeta().textContent).toContain('Apagado');
      expect(tarjeta().textContent).toContain('ventas@hatunsales.pe');
      expect(tarjeta().textContent).toContain('Último envío automático: 5 de noviembre');
      expect(boton('button[type="submit"]').disabled).toBe(true);
    });

    it('valida la hora y los correos, y guarda el interruptor, la hora y la lista de correos', async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      escribir('#rd-correos', 'dueno@hatunsales.pe, malo');
      expect(tarjeta().textContent).toContain('Estos correos no parecen válidos: malo.');
      expect(boton('button[type="submit"]').disabled).toBe(true);

      escribir('#rd-correos', 'dueno@hatunsales.pe, Contador@x.pe;dueno@hatunsales.pe');
      const interruptor = tarjeta().querySelector<HTMLInputElement>('.adm-switch input')!;
      interruptor.click();
      escribir('#rd-hora', '21:15');
      expect(boton('#rd-probar').disabled).toBe(true); // hay cambios sin guardar
      expect(boton('button[type="submit"]').disabled).toBe(false);

      boton('button[type="submit"]').click();
      const peticion = http.expectOne(`${URL_RESUMEN}/configuracion`);
      expect(peticion.request.method).toBe('PUT');
      expect(peticion.request.body).toEqual({ activo: true, hora: '21:15', correos: ['dueno@hatunsales.pe', 'Contador@x.pe'] });
      peticion.flush({ ...resumenApagado, activo: true, hora: '21:15', correos: ['dueno@hatunsales.pe', 'Contador@x.pe'] });
      fixture.detectChanges();

      expect(tarjeta().textContent).toContain('Encendido');
      expect(tarjeta().textContent).toContain('a las 21:15');
      expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
      expect(boton('#rd-probar').disabled).toBe(false);
    });

    it('«Enviar ahora de prueba» dice a quién se envió, avisa si el servidor solo guarda archivos y muestra el motivo si falla', async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      boton('#rd-probar').click();
      let peticion = http.expectOne(`${URL_RESUMEN}/enviar-ahora`);
      expect(peticion.request.method).toBe('POST');
      peticion.flush({ enviados: ['ventas@hatunsales.pe'], fallidos: [], asunto: 'PRUEBA – Resumen', proveedor: 'archivo' });
      fixture.detectChanges();
      expect(tarjeta().textContent).toContain('Correo de prueba enviado a ventas@hatunsales.pe.');
      expect(tarjeta().textContent).toContain('no llegó a ninguna bandeja');

      boton('#rd-probar').click();
      peticion = http.expectOne(`${URL_RESUMEN}/enviar-ahora`);
      peticion.flush({ message: 'No se pudo enviar el correo: Brevo 503.' }, { status: 503, statusText: 'Service Unavailable' });
      fixture.detectChanges();
      const error = tarjeta().querySelector('[role="alert"]') as HTMLElement;
      expect(error.textContent).toContain('Brevo 503');
      expect(tarjeta().textContent).not.toContain('Correo de prueba enviado');
    });
  });
});
