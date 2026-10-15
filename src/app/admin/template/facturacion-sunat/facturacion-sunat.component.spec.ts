import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { urlConstants } from '../../../constants/urlConstants';
import { AlertService } from '../../../shared/services/alert.service';
import { ConfiguracionSunat } from '../../models/fiscal.models';
import { FacturacionSunatComponent } from './facturacion-sunat.component';

function configuracionPrueba(): ConfiguracionSunat {
  return {
    proveedor: 'nubefact',
    proveedor_efectivo: 'nubefact',
    ambiente: 'beta',
    boletas_modo: 'individual',
    envio_en_linea: true,
    tareas_activas: true,
    aplicar_reglas_2027: 'auto',
    codigo_producto_defecto: null,
    series: {
      factura: 'F001',
      boleta: 'B001',
      nc_factura: 'FC01',
      nc_boleta: 'BC01',
      nd_factura: 'FD01',
      nd_boleta: 'BD01',
      gre_remitente: 'T001',
    },
    emisor: {
      ruc: '20123456789',
      razon_social: 'Empresa de pruebas',
      nombre_comercial: '',
      direccion: 'Dirección de prueba',
      ubigeo: '150101',
      distrito: 'Lima',
      provincia: 'Lima',
      departamento: 'Lima',
      codigo_establecimiento: '0000',
    },
    sol: { usuario: 'USUARIO1', tiene_clave: true },
    gre: {
      activa: false,
      correlativo_inicial: 1,
      partida: {
        ubigeo: '150101',
        direccion: 'Dirección de prueba',
        codigo_establecimiento: '0000',
        heredada_del_emisor: { ubigeo: true, direccion: true, codigo_establecimiento: true },
      },
      credenciales: { tiene_credenciales: false, client_id_mascara: null },
    },
    certificado: { beta: null, produccion: null },
    confirmacion_no_ose: null,
    aviso_legal_ose: {
      titulo: 'Condición de la empresa',
      texto: 'Texto recibido del servidor.',
      confirmacion: 'Confirmación recibida del servidor.',
      normas: [],
    },
    estado: {
      esquema: { listo: true, mensaje: null, faltantes: [] },
      cifrado_disponible: true,
      cifrado_problema: null,
      listo_para_produccion: false,
      gre_lista_para_produccion: false,
      advertencias: [],
      checklist: {
        cpe: {
          titulo: 'Comprobantes',
          listo: false,
          items: [
            {
              codigo: 'certificado_produccion',
              titulo: 'Certificado de producción',
              ok: false,
              detalle: 'Certificado pendiente',
              accion: 'Cargar certificado',
            },
          ],
        },
        gre: { titulo: 'Guías', listo: false, items: [] },
      },
      pruebas_beta: { listo: false, faltantes: ['certificado_beta'] },
    },
  };
}

describe('FacturacionSunatComponent', () => {
  let fixture: ComponentFixture<FacturacionSunatComponent>;
  let component: FacturacionSunatComponent;
  let http: HttpTestingController;
  const alerta = {
    toast: vi.fn(),
    error: vi.fn(),
    confirm: vi.fn(async () => ({ isConfirmed: true })),
  };

  function responderConfiguracion(config = configuracionPrueba()): void {
    http.expectOne(urlConstants.fiscal.configuracion).flush(config);
    http
      .expectOne((r) => r.url === urlConstants.fiscal.auditoria)
      .flush({ registros: [], siguiente: null });
    responderBeta(config);
    fixture.detectChanges();
  }

  function responderBeta(config = configuracionPrueba()): void {
    http
      .expectOne(urlConstants.fiscal.emisorBeta)
      .flush({ emisor: config.emisor, ruc_certificado_beta: config.certificado.beta?.ruc ?? null });
    http.expectOne(urlConstants.fiscal.enviosBeta).flush({ items: [] });
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [FacturacionSunatComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AlertService, useValue: alerta },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FacturacionSunatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('muestra el certificado pendiente y solo consulta al abrir la pantalla', () => {
    responderConfiguracion();
    expect(component.puedeProbar).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Certificado pendiente de cargar');
    expect(fixture.nativeElement.textContent).toContain('Texto recibido del servidor.');
    expect(fixture.nativeElement.textContent).not.toContain('[object Object]');
    component.probar();
    http.expectNone((r) => r.method !== 'GET');
  });

  it('conserva los borradores de otras secciones y omite la clave SOL vacía', () => {
    responderConfiguracion();
    component.operacion.series.factura = 'F999';
    component.sol.clave = '';
    component.guardarSol();
    const peticion = http.expectOne(urlConstants.fiscal.sol);
    expect(peticion.request.body).toEqual({ usuario: 'USUARIO1' });
    peticion.flush({ usuario: 'USUARIO1', tiene_clave: true });
    responderConfiguracion();
    expect(component.operacion.series.factura).toBe('F999');
    expect(component.sol.clave).toBe('');
  });

  it('envía el certificado como multipart y borra el archivo y su clave tras guardar', () => {
    responderConfiguracion();
    const archivo = new File(['certificado-de-prueba'], 'certificado.pfx');
    component.archivo = archivo;
    component.claveCertificado = 'clave-de-prueba';
    component.ambienteCertificado = 'produccion';
    component.otroEmisorBeta = true;
    component.subirCertificado();
    const peticion = http.expectOne(urlConstants.fiscal.certificado);
    expect(peticion.request.body).toBeInstanceOf(FormData);
    expect(peticion.request.body.get('archivo')).toBe(archivo);
    expect(peticion.request.body.get('clave')).toBe('clave-de-prueba');
    expect(peticion.request.body.get('ambiente')).toBe('produccion');
    expect(peticion.request.body.get('forzar')).toBeNull();
    expect(peticion.request.headers.has('Content-Type')).toBe(false);
    peticion.flush({ id: 1 });
    responderConfiguracion();
    expect(component.claveCertificado).toBe('');
    expect(component.archivo).toBeNull();
  });

  it('rechaza archivos que exceden el límite antes de hacer una petición', () => {
    responderConfiguracion();
    const input = {
      files: [new File([new Uint8Array(200 * 1024 + 1)], 'grande.pfx')],
      value: 'grande.pfx',
    };
    component.seleccionarArchivo({ target: input } as unknown as Event);
    expect(component.archivo).toBeNull();
    expect(input.value).toBe('');
    component.subirCertificado();
    http.expectNone(urlConstants.fiscal.certificado);
  });

  it('mantiene la herencia del punto de partida al guardar guías', () => {
    responderConfiguracion();
    component.guardarGre();
    const peticion = http.expectOne(urlConstants.fiscal.configuracion);
    expect(peticion.request.body).toEqual({
      gre: {
        activa: false,
        correlativo_inicial: 1,
        partida: { ubigeo: '', direccion: '', codigo_establecimiento: '' },
      },
    });
    peticion.flush(configuracionPrueba());
    responderConfiguracion();
  });

  it('distingue las comprobaciones locales de un envío todavía no disponible', () => {
    const config = configuracionPrueba();
    config.certificado.beta = {
      id: 1,
      ambiente: 'beta',
      titular: 'Prueba',
      ruc: config.emisor.ruc,
      nombre_archivo: null,
      vigente_hasta: '2030-01-01',
      dias_para_vencer: 100,
      vencido: false,
      autofirmado: true,
      advertencias: [],
    };
    responderConfiguracion(config);
    component.probar();
    const peticion = http.expectOne(urlConstants.fiscal.probarConexion);
    expect(peticion.request.body).toEqual({ ambiente: 'beta', documento: 'cpe', tipo_cpe: '01' });
    peticion.flush({
      ok: true,
      ambiente: 'beta',
      documento: 'cpe',
      tiempo_ms: 10,
      envio_disponible: false,
      pasos: [{ paso: 'envio', ok: null, detalle: 'Módulo pendiente' }],
    });
    http
      .expectOne((r) => r.url === urlConstants.fiscal.auditoria)
      .flush({ registros: [], siguiente: null });
    responderBeta(config);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Resultado de comprobaciones locales');
    expect(fixture.nativeElement.textContent).toContain('Sin ejecutar');
  });

  it('impide guardar valores por defecto si el servidor aún no tiene el módulo', () => {
    http
      .expectOne(urlConstants.fiscal.configuracion)
      .flush({ message: 'Not Found' }, { status: 404, statusText: 'Not Found' });
    component.guardarEmisor();
    expect(component.config).toBeNull();
    expect(component.errorCarga).toContain('aún no está disponible');
    http.expectNone((r) => r.method !== 'GET');
  });

  it('guarda el emisor de pruebas por su endpoint separado', () => {
    responderConfiguracion();
    component.emisorBeta!.razon_social = 'Empresa separada de pruebas';
    component.guardarEmisorBeta();
    const peticion = http.expectOne(urlConstants.fiscal.emisorBeta);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body.razon_social).toBe('Empresa separada de pruebas');
    http.expectNone((r) => r.url === urlConstants.fiscal.configuracion && r.method === 'PUT');
    peticion.flush({});
    responderConfiguracion();
  });

  it('no habilita el envío usando solamente un RUC editado sin guardar', () => {
    const config = configuracionPrueba();
    config.certificado.beta = {
      id: 1,
      ambiente: 'beta',
      titular: 'Otra empresa',
      ruc: '20610206337',
      nombre_archivo: null,
      vigente_hasta: '2030-01-01',
      dias_para_vencer: 100,
      vencido: false,
      autofirmado: false,
      advertencias: [],
    };
    responderConfiguracion(config);
    component.emisorBeta!.ruc = '20610206337';
    expect(component.puedeProbar).toBe(false);
    component.probar();
    http.expectNone(urlConstants.fiscal.probarConexion);
  });
});
