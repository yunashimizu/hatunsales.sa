import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { urlConstants } from '../../../../constants/urlConstants';
import { AlertService } from '../../../../shared/services/alert.service';
import { EnvioSunat } from '../../../models/fiscal.models';
import { EnviosSunatComponent } from './envios-sunat.component';

function envio(cambios: Partial<EnvioSunat>): EnvioSunat {
  return {
    id_envio: 1,
    ambiente: 'produccion',
    tipo_documento: '01',
    nombre_archivo: '20610206337-01-F001-00000001.zip',
    estado: 'ACEPTADO',
    codigo_sunat: '0',
    mensaje_sunat: null,
    accion_sunat: null,
    id_comprobante: 10,
    creado_en: '2026-10-22T15:00:00.000Z',
    archivos: ['xml_firmado', 'zip', 'cdr_xml'],
    serie: 'F001',
    numero: 1,
    intento: 1,
    bloqueado_hasta: null,
    ...cambios,
  };
}

describe('EnviosSunatComponent', () => {
  let fixture: ComponentFixture<EnviosSunatComponent>;
  let component: EnviosSunatComponent;
  let http: HttpTestingController;
  const alerta = {
    toast: vi.fn(),
    error: vi.fn(),
    pedirTexto: vi.fn(async (): Promise<string | null> => null),
  };

  const consultaEnvios = () => http.expectOne((r) => r.url === urlConstants.fiscal.envios);

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [EnviosSunatComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AlertService, useValue: alerta }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(EnviosSunatComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('ambienteVigente', 'produccion');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('consulta los envíos del ambiente vigente sin mandar filtros vacíos', () => {
    const peticion = consultaEnvios();
    expect(peticion.request.params.get('ambiente')).toBe('produccion');
    expect(peticion.request.params.get('pagina')).toBe('1');
    expect(peticion.request.params.get('por_pagina')).toBe('20');
    expect(peticion.request.params.has('estado')).toBe(false);
    expect(peticion.request.params.has('tipo')).toBe(false);
    peticion.flush({ datos: [envio({})], total: 1, pagina: 1, por_pagina: 20 });
    fixture.detectChanges();
    const fila = fixture.nativeElement.querySelector('tbody tr') as HTMLElement;
    expect(fila.textContent).toContain('F001-1');
    expect(fila.querySelector('[data-etiqueta="Estado SUNAT"]')?.textContent).toContain('Aceptado');
    expect(fila.textContent).toContain('Sin acciones');
  });

  it('ofrece solo las acciones que el servidor admite en cada estado', () => {
    const futuro = new Date(Date.now() + 60_000).toISOString();
    const pasado = new Date(Date.now() - 60_000).toISOString();
    const pendienteFactura = envio({ id_envio: 1, estado: 'PENDIENTE_REENVIO', accion_sunat: 'REINTENTAR' });
    const yaRecibidaBoleta = envio({
      id_envio: 2,
      tipo_documento: '03',
      serie: 'B001',
      nombre_archivo: '20610206337-03-B001-00000007.zip',
      estado: 'PENDIENTE_REENVIO',
      accion_sunat: 'RECUPERAR_CDR',
    });
    const enviandoAhora = envio({ id_envio: 3, estado: 'ENVIANDO', bloqueado_hasta: futuro });
    const sinRespuestaBeta = envio({ id_envio: 4, ambiente: 'beta', estado: 'ENVIANDO', bloqueado_hasta: pasado });
    const aceptado = envio({ id_envio: 5 });
    consultaEnvios().flush({
      datos: [pendienteFactura, yaRecibidaBoleta, enviandoAhora, sinRespuestaBeta, aceptado],
      total: 5,
      pagina: 1,
      por_pagina: 20,
    });
    fixture.detectChanges();

    const acciones = (e: EnvioSunat) => [
      component.puedeReintentar(e),
      component.puedeRecuperarCdr(e),
      component.puedeConfirmarAceptado(e),
    ];
    expect(acciones(pendienteFactura)).toEqual([true, true, false]);
    expect(acciones(yaRecibidaBoleta)).toEqual([false, false, true]);
    expect(acciones(enviandoAhora)).toEqual([false, false, false]);
    expect(acciones(sinRespuestaBeta)).toEqual([true, false, true]);
    expect(acciones(aceptado)).toEqual([false, false, false]);

    const filas = fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>;
    expect(filas[1].textContent).toContain('no lo reenvíe');
    expect(filas[1].querySelector('[data-etiqueta="Acciones"]')?.textContent).not.toContain('Reintentar');
    expect(filas[2].textContent).toContain('Se está enviando ahora mismo');
  });

  it('confirma un aceptado solo con la nota de lo verificado en SUNAT y vuelve a consultar', async () => {
    const incierto = envio({ estado: 'PENDIENTE_REENVIO', accion_sunat: 'RECUPERAR_CDR', tipo_documento: '03', serie: 'B001' });
    consultaEnvios().flush({ datos: [incierto], total: 1, pagina: 1, por_pagina: 20 });
    const cambios: void[] = [];
    component.cambio.subscribe(() => cambios.push(undefined));

    await component.confirmarAceptado(incierto);
    expect(alerta.pedirTexto).toHaveBeenCalledWith(expect.objectContaining({ minimo: 5, maximo: 300 }));
    http.expectNone((r) => r.method === 'POST');

    alerta.pedirTexto.mockResolvedValueOnce('Consultado en SOL: figura aceptado');
    await component.confirmarAceptado(incierto);
    const peticion = http.expectOne(urlConstants.fiscal.confirmarAceptado(incierto.id_envio));
    expect(peticion.request.body).toEqual({ nota: 'Consultado en SOL: figura aceptado' });
    peticion.flush({ ambiente: 'produccion', id_envio: 1, estado: 'ACEPTADO', aceptado: true, codigo: null, mensaje: 'Aceptado' });
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(cambios.length).toBe(1);
    consultaEnvios().flush({ datos: [envio({})], total: 1, pagina: 1, por_pagina: 20 });
  });

  it('muestra el error de la consulta con la opción de reintentar', () => {
    consultaEnvios().flush({ message: 'Internal server error' }, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();
    const aviso = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(aviso.textContent).toContain('No se pudieron consultar los envíos a SUNAT');
    (aviso.querySelector('button') as HTMLButtonElement).click();
    consultaEnvios().flush({ datos: [], total: 0, pagina: 1, por_pagina: 20 });
  });
});
