import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { urlConstants } from '../../../../constants/urlConstants';
import { AlertService } from '../../../../shared/services/alert.service';
import { ConfiguracionSunat } from '../../../models/fiscal.models';
import { ActivacionProduccionComponent, SolicitudGuardadoFiscal } from './activacion-produccion.component';

function configuracion(listo: boolean): ConfiguracionSunat {
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
      ruc: '20610206337',
      razon_social: 'HATUNSALES S.A.C.',
      nombre_comercial: '',
      direccion: 'Av. Prueba 123',
      ubigeo: '150119',
      distrito: 'Lurín',
      provincia: 'Lima',
      departamento: 'Lima',
      codigo_establecimiento: '0000',
    },
    sol: { usuario: 'HATUN001', tiene_clave: true },
    gre: {
      activa: false,
      correlativo_inicial: 1,
      partida: {
        ubigeo: '150119',
        direccion: 'Av. Prueba 123',
        codigo_establecimiento: '0000',
        heredada_del_emisor: { ubigeo: true, direccion: true, codigo_establecimiento: true },
      },
      credenciales: { tiene_credenciales: false, client_id_mascara: null },
    },
    certificado: { beta: null, produccion: null },
    confirmacion_no_ose: null,
    aviso_legal_ose: {
      titulo: 'Antes de activar SUNAT directo',
      texto: 'Si tiene un OSE registrado no puede emitir por SEE - Del Contribuyente.',
      confirmacion: 'Confirmo que no tengo un OSE registrado.',
      normas: [],
    },
    correlativo_inicial: { F001: 1, B001: 1, FC01: 1, BC01: 1, FD01: 1, BD01: 1 },
    correlativo_inicial_revisado: listo,
    cert_ruc_confirmado: false,
    confirmaciones: {
      emisor_electronico_sol: listo,
      certificado_en_sol: listo,
      usuario_sol_secundario: listo,
      ruc_habido: listo,
    },
    emision_bloqueada: { beta: null, produccion: null },
    estado: {
      esquema: { listo: true, mensaje: null, faltantes: [] },
      cifrado_disponible: true,
      cifrado_problema: null,
      listo_para_produccion: listo,
      gre_lista_para_produccion: false,
      advertencias: [],
      checklist: {
        cpe: {
          titulo: 'Factura, boleta y notas electrónicas',
          listo,
          items: [
            {
              codigo: 'certificado_produccion',
              titulo: 'Certificado digital de producción',
              ok: listo,
              detalle: listo ? null : 'No hay un certificado de producción cargado.',
              accion: listo ? null : 'Suba el .pfx/.p12 con su contraseña.',
            },
            {
              codigo: 'confirmacion.ruc_habido',
              titulo: 'Confirmación: RUC activo y habido',
              ok: listo,
              detalle: listo ? null : 'Falta confirmar que el RUC está activo y habido.',
              accion: listo ? null : 'Revíselo en la Consulta RUC y marque la confirmación.',
            },
          ],
        },
        gre: { titulo: 'Guía de remisión', listo: false, items: [] },
      },
      pruebas_beta: { listo: true, faltantes: [] },
    },
  };
}

describe('ActivacionProduccionComponent', () => {
  let fixture: ComponentFixture<ActivacionProduccionComponent>;
  let component: ActivacionProduccionComponent;
  let http: HttpTestingController;
  let guardados: SolicitudGuardadoFiscal[];
  const alerta = {
    toast: vi.fn(),
    pedirTexto: vi.fn(async (): Promise<string | null> => null),
    confirmar: vi.fn(async () => true),
    confirmarPeligro: vi.fn(async () => true),
  };

  async function crear(config: ConfiguracionSunat): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ActivacionProduccionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AlertService, useValue: alerta }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ActivacionProduccionComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('config', config);
    guardados = [];
    component.guardar.subscribe((solicitud) => guardados.push(solicitud));
    fixture.detectChanges();
  }

  const botonActivar = (): HTMLButtonElement =>
    Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find((b) =>
      b.textContent?.includes('Activar emisión en producción'),
    )!;

  beforeEach(() => vi.clearAllMocks());

  afterEach(() => http.verify());

  it('no deja activar mientras falten requisitos y lleva a corregirlos', async () => {
    await crear(configuracion(false));
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Certificado digital de producción');
    expect(texto).toContain('Suba el .pfx/.p12 con su contraseña.');
    expect(botonActivar().disabled).toBe(true);

    await component.activar();
    expect(alerta.pedirTexto).not.toHaveBeenCalled();
    expect(guardados).toEqual([]);

    const destinos: string[] = [];
    component.irA.subscribe((destino) => destinos.push(destino));
    (fixture.nativeElement.querySelector('.activacion__item button') as HTMLButtonElement).click();
    expect(destinos).toEqual(['certificados']);
  });

  it('exige escribir PRODUCCION y solo entonces cambia el ambiente y el proveedor', async () => {
    await crear(configuracion(true));
    expect(botonActivar().disabled).toBe(false);

    alerta.pedirTexto.mockResolvedValueOnce('PRODUCTION');
    await component.activar();
    expect(alerta.pedirTexto).toHaveBeenCalledWith(
      expect.objectContaining({ danger: true, allowHtml: true, etiqueta: 'Escriba PRODUCCION para confirmar' }),
    );
    const resumen = (alerta.pedirTexto.mock.calls[0] as unknown as [{ message: string }])[0].message;
    expect(resumen).toContain('20610206337');
    expect(resumen).toContain('F001');
    expect(guardados).toEqual([]);
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));

    alerta.pedirTexto.mockResolvedValueOnce(' producción ');
    await component.activar();
    expect(guardados).toEqual([
      { cambios: { ambiente: 'produccion', proveedor: 'sunat_directo' }, mensaje: 'Emisión de producción activada' },
    ]);
  });

  it('guarda solo las declaraciones que cambiaron y conserva el borrador si el panel recarga', async () => {
    await crear(configuracion(false));
    component.declaraciones.ruc_habido = true;
    component.declaraciones.no_ose = true;
    fixture.detectChanges();
    expect(botonActivar().disabled).toBe(true);

    fixture.componentRef.setInput('config', configuracion(false));
    fixture.detectChanges();
    expect(component.declaraciones.ruc_habido).toBe(true);

    component.guardarDeclaraciones();
    expect(guardados[0]).toEqual({
      cambios: { confirmaciones: { ruc_habido: true }, confirmo_no_ose: true },
      mensaje: 'Declaraciones guardadas',
    });

    component.correlativos[0].valor = 120;
    component.guardarCorrelativos();
    expect(guardados[1].cambios.correlativo_inicial).toEqual({
      F001: 120,
      B001: 1,
      FC01: 1,
      BC01: 1,
      FD01: 1,
      BD01: 1,
    });
  });

  it('prueba las credenciales SOL de producción y muestra la respuesta de SUNAT', async () => {
    await crear(configuracion(true));
    let probado = false;
    component.probado.subscribe(() => (probado = true));
    component.probarCredenciales();
    const peticion = http.expectOne(urlConstants.fiscal.probarCredencialesProduccion);
    expect(peticion.request.method).toBe('POST');
    peticion.flush({
      ok: false,
      codigo: '0102',
      mensaje: 'SUNAT no reconoce el usuario o la clave SOL: revise el usuario secundario y su clave.',
      detalle: 'Usuario o contraseña incorrectos',
      consulta: { tipo: '01', serie: 'F001', numero: 99999999 },
      tiempo_ms: 420,
    });
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Las credenciales SOL no funcionan');
    expect(texto).toContain('SUNAT no reconoce el usuario o la clave SOL');
    expect(texto).toContain('código 0102');
    expect(probado).toBe(true);
  });
});
