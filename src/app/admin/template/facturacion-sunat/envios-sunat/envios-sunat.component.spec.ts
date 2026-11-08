import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { urlConstants } from '../../../../constants/urlConstants';
import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { EnvioSunat } from '../../../models/fiscal.models';
import { EnviosSunatComponent } from './envios-sunat.component';
import { hoyLimaYmd } from '../../../mantenimiento/component/doc/documentos-sunat';

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
    confirmar: vi.fn(async (): Promise<boolean> => true),
  };
  let esAdmin = true;
  const auth = { puedeVer: vi.fn((roles: string[]) => esAdmin && roles.includes('admin')) };

  const consultaEnvios = () => http.expectOne((r) => r.url === urlConstants.fiscal.envios);

  beforeEach(async () => {
    vi.clearAllMocks();
    esAdmin = true;
    alerta.confirmar.mockResolvedValue(true);
    await TestBed.configureTestingModule({
      imports: [EnviosSunatComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AlertService, useValue: alerta },
        { provide: AuthService, useValue: auth },
      ],
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

  describe('envíos que requieren revisión (EXCEPCION) y reintento lento', () => {
    const futuro = '2099-12-31';
    const pasado = '2020-01-15';
    const excepcion = (cambios: Partial<EnvioSunat> = {}) =>
      envio({ id_envio: 7, estado: 'EXCEPCION', accion_sunat: 'NINGUNA', intento: 6, fecha_limite_envio: futuro, ultimo_error: 'Se intentó 6 veces sin una respuesta válida de SUNAT.', ...cambios });
    const acciones = (e: EnvioSunat) => [component.puedeReintentar(e), component.puedeReintentarAhora(e), component.puedeRecuperarCdr(e), component.puedeConfirmarAceptado(e)];

    function mostrar(envios: EnvioSunat[]): HTMLElement[] {
      consultaEnvios().flush({ datos: envios, total: envios.length, pagina: 1, por_pagina: 20 });
      fixture.detectChanges();
      return Array.from(fixture.nativeElement.querySelectorAll('tbody tr')) as HTMLElement[];
    }
    const botonDe = (fila: HTMLElement, texto: string) =>
      (Array.from(fila.querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent?.includes(texto));

    it('dentro del plazo el administrador ve «Reintentar ahora» (y puede recuperar la constancia o confirmar); sin ser administrador, no', () => {
      const e = excepcion();
      const [fila] = mostrar([e]);
      expect(acciones(e)).toEqual([false, true, true, true]);
      expect(botonDe(fila, 'Reintentar ahora')).toBeTruthy();
      expect(botonDe(fila, 'Recuperar constancia')).toBeTruthy();
      expect(botonDe(fila, 'Confirmar aceptado')).toBeTruthy();
      expect(fila.textContent).toContain('Requiere revisión');
      expect(fila.textContent).toContain('Se intentó 6 veces sin una respuesta válida de SUNAT.');

      esAdmin = false;
      expect(component.puedeReintentarAhora(e)).toBe(false);
    });

    it('«Reintentar ahora» pide confirmación (con las veces que se intentó) y manda forzar; si se cancela no envía nada', async () => {
      const e = excepcion();
      mostrar([e]);

      alerta.confirmar.mockResolvedValueOnce(false);
      await component.reintentarAhora(e);
      http.expectNone((r) => r.method === 'POST');

      await component.reintentarAhora(e);
      expect(alerta.confirmar).toHaveBeenLastCalledWith(
        expect.objectContaining({ title: '¿Reintentar ahora F001-1?', message: expect.stringContaining('Se intentó 6 veces') }),
      );
      const peticion = http.expectOne(urlConstants.fiscal.reintentarEnvio(7));
      expect(peticion.request.body).toEqual({ forzar: true });
      peticion.flush({ ambiente: 'produccion', id_envio: 7, estado: 'ACEPTADO', aceptado: true, codigo: '0', mensaje: 'Aceptado' });
      expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
      consultaEnvios().flush({ datos: [envio({ id_envio: 7 })], total: 1, pagina: 1, por_pagina: 20 });
    });

    it('un no administrador no puede forzar aunque llame al método', async () => {
      const e = excepcion();
      mostrar([e]);
      esAdmin = false;
      await component.reintentarAhora(e);
      expect(alerta.confirmar).not.toHaveBeenCalled();
      http.expectNone((r) => r.method === 'POST');
    });

    it('«Reintentar» y «Recuperar constancia» piden confirmación antes de hablar con SUNAT', async () => {
      const pendiente = envio({ id_envio: 8, estado: 'PENDIENTE_REENVIO', accion_sunat: 'REINTENTAR' });
      mostrar([pendiente]);

      alerta.confirmar.mockResolvedValue(false);
      await component.reintentar(pendiente);
      await component.recuperarCdr(pendiente);
      http.expectNone((r) => r.method === 'POST');
      expect(alerta.confirmar).toHaveBeenCalledTimes(2);

      alerta.confirmar.mockResolvedValue(true);
      await component.reintentar(pendiente);
      const reintento = http.expectOne(urlConstants.fiscal.reintentarEnvio(8));
      expect(reintento.request.body).toEqual({});
      reintento.flush({ ambiente: 'produccion', id_envio: 8, estado: 'PENDIENTE_REENVIO', aceptado: false, codigo: null, mensaje: 'SUNAT no respondió' });
      consultaEnvios().flush({ datos: [pendiente], total: 1, pagina: 1, por_pagina: 20 });

      await component.recuperarCdr(pendiente);
      expect(alerta.confirmar).toHaveBeenLastCalledWith(expect.objectContaining({ title: '¿Pedir a SUNAT la constancia de F001-1?' }));
      http.expectOne(urlConstants.fiscal.recuperarCdr(8)).flush({ ambiente: 'produccion', id_envio: 8, estado: 'ACEPTADO', aceptado: true, codigo: '0', mensaje: null });
      consultaEnvios().flush({ datos: [pendiente], total: 1, pagina: 1, por_pagina: 20 });
    });

    it('seis intentos sin respuesta dentro del plazo: explica que el sistema sigue cada hora hasta el último día', () => {
      const lento = envio({ id_envio: 9, estado: 'PENDIENTE_REENVIO', accion_sunat: 'REINTENTAR', intento: 7, fecha_limite_envio: '2099-12-31' });
      const [fila] = mostrar([lento]);
      expect(fila.textContent).toContain('Se intentó 7 veces sin respuesta de SUNAT');
      expect(fila.textContent).toContain('el sistema seguirá intentando cada hora hasta el 31/12');
      expect(component.puedeReintentar(lento)).toBe(true);
    });

    it('fuera de plazo y de los 7 días una boleta solo se resuelve con nota de crédito y otra emisión', () => {
      const boleta = excepcion({ tipo_documento: '03', serie: 'B001', nombre_archivo: '20610206337-03-B001-00000009.zip', fecha_limite_envio: pasado, accion_sunat: 'EMITIR_NUEVO' });
      const [fila] = mostrar([boleta]);
      expect(fila.textContent).toContain('El plazo de envío individual venció el 15/01/2020 y ya pasaron los 7 días del resumen diario');
      expect(fila.textContent).toContain('anúlelo con nota de crédito y emita uno nuevo');
      // Vencido: no se reenvía, pero se puede confirmar si SOL la muestra aceptada.
      expect(acciones(boleta)).toEqual([false, false, false, true]);
      expect(botonDe(fila, 'Reintentar ahora')).toBeUndefined();
    });

    it('fuera de plazo pero dentro de los 7 días, una boleta se informará en el próximo resumen diario', () => {
      const ayer = hoyLimaYmd(new Date(Date.now() - 86_400_000));
      const boleta = excepcion({ tipo_documento: '03', serie: 'B001', nombre_archivo: '20610206337-03-B001-00000009.zip', fecha_limite_envio: ayer, accion_sunat: 'RESUMIR' });
      const [fila] = mostrar([boleta]);
      expect(fila.textContent).toContain('Se informará a SUNAT en el próximo resumen diario (hasta 7 días después de la emisión)');
      expect(fila.textContent).not.toMatch(/anúlelo con nota de crédito/);
    });

    it('la boleta del modo «resumen» figura «Va en el resumen diario» y explica que no se envía sola; en un resumen en curso, que se mira en Lotes', () => {
      const porResumir = envio({ id_envio: 11, estado: 'POR_RESUMIR', accion_sunat: 'RESUMIR', tipo_documento: '03', serie: 'B001', fecha_limite_envio: '2099-12-31' });
      const enResumen = envio({ id_envio: 12, estado: 'TICKET_PENDIENTE', accion_sunat: 'NINGUNA', tipo_documento: '03', serie: 'B001', fecha_limite_envio: '2099-12-31' });
      const [fila1, fila2] = mostrar([porResumir, enResumen]);
      expect(fila1.textContent).toContain('Va en el resumen diario');
      expect(fila1.textContent).toContain('SUNAT la recibe en el resumen diario');
      expect(fila1.textContent).toContain('«Enviar resumen del día» en Lotes');
      expect(fila2.textContent).toContain('Va en un resumen diario que SUNAT está procesando');
      expect(acciones(porResumir)).toEqual([false, false, false, false]);
    });

    it('fuera de plazo una factura de producción queda para recuperar la constancia o emitir una nueva', () => {
      const factura = excepcion({ fecha_limite_envio: pasado, accion_sunat: 'RECUPERAR_CDR' });
      const [fila] = mostrar([factura]);
      expect(fila.textContent).toContain('Use «Recuperar constancia» para saber si SUNAT lo recibió');
      expect(acciones(factura)).toEqual([false, false, true, true]);
      const emitirNuevo = excepcion({ id_envio: 10, fecha_limite_envio: pasado, accion_sunat: 'EMITIR_NUEVO', ambiente: 'beta' });
      expect(component.indicacion(emitirNuevo)).toContain('SUNAT ya no lo recibe. Emita un comprobante nuevo.');
    });

    it('un envío con otro proceso encima no ofrece reintentar ahora ni confirmar', () => {
      const ocupado = excepcion({ bloqueado_hasta: new Date(Date.now() + 60_000).toISOString() });
      mostrar([ocupado]);
      expect(acciones(ocupado)).toEqual([false, false, false, false]);
    });
  });
  describe('glosario y tarjeta «¿Qué hacer?» (SUNAT-4)', () => {
    const excepcion = (cambios: Partial<EnvioSunat> = {}) =>
      envio({ id_envio: 7, estado: 'EXCEPCION', accion_sunat: 'NINGUNA', intento: 6, fecha_limite_envio: '2099-12-31', ultimo_error: null, ...cambios });
    function mostrar(envios: EnvioSunat[]): HTMLElement[] {
      consultaEnvios().flush({ datos: envios, total: envios.length, pagina: 1, por_pagina: 20 });
      fixture.detectChanges();
      return Array.from(fixture.nativeElement.querySelectorAll('tbody tr')) as HTMLElement[];
    }

    it('los estados se dicen con el glosario: «Por reenviar», «SUNAT lo está procesando», «Requiere revisión»', () => {
      const filas = mostrar([
        envio({ id_envio: 1, estado: 'PENDIENTE_REENVIO', accion_sunat: 'REINTENTAR' }),
        envio({ id_envio: 2, estado: 'TICKET_PENDIENTE' }),
        excepcion({ id_envio: 3 }),
        envio({ id_envio: 4, estado: 'BAJA_PENDIENTE' }),
        envio({ id_envio: 5, estado: 'POR_RESUMIR' }),
      ]);
      const estado = (i: number) => filas[i].querySelector('[data-etiqueta="Estado SUNAT"]')?.textContent ?? '';
      expect(estado(0)).toContain('Por reenviar');
      expect(estado(1)).toContain('SUNAT lo está procesando');
      expect(estado(2)).toContain('Requiere revisión');
      expect(estado(3)).toContain('Baja en proceso');
      expect(estado(4)).toContain('Va en el resumen diario');
      const texto = fixture.nativeElement.textContent as string;
      expect(texto).not.toMatch(/Pendiente de reenv/);
      expect(texto).not.toMatch(/Ticket pendiente/);
    });

    it('el filtro de estado y los archivos usan las mismas palabras (sin «CDR»)', () => {
      mostrar([envio({ archivos: ['xml_firmado', 'cdr_xml', 'cdr_zip'] })]);
      const opciones = Array.from(fixture.nativeElement.querySelectorAll('select option')).map((o) => (o as HTMLElement).textContent?.trim());
      expect(opciones).toContain('Por reenviar');
      expect(opciones).toContain('SUNAT lo está procesando');
      const texto = fixture.nativeElement.textContent as string;
      expect(texto).toContain('Constancia de SUNAT (XML)');
      expect(texto).not.toMatch(/\bCDR\b/);
    });

    it('«Requiere revisión» muestra la tarjeta con sus acciones DENTRO y deja la columna de acciones sin repetirlas', () => {
      const [fila] = mostrar([excepcion()]);
      const tarjeta = fila.querySelector('app-que-hacer-sunat') as HTMLElement;
      expect(tarjeta).toBeTruthy();
      expect(tarjeta.querySelector('.que-hacer--peligro')).toBeTruthy();
      expect(tarjeta.textContent).toContain('¿Qué hacer?');
      expect(tarjeta.textContent).toContain('Puede reintentarlo ahora o verificarlo en SUNAT Operaciones en Línea.');
      const botones = Array.from(tarjeta.querySelectorAll('button')).map((b) => b.textContent?.trim());
      expect(botones).toEqual(['Reintentar ahora', 'Recuperar constancia', 'Confirmar aceptado']);
      expect(fila.querySelector('[data-etiqueta="Acciones"] button')).toBeNull();
      expect(fila.querySelector('[data-etiqueta="Acciones"]')?.textContent).toContain('Ver «¿Qué hacer?»');
    });

    it('el botón de la tarjeta ejecuta la acción (pide confirmación y manda forzar)', async () => {
      mostrar([excepcion()]);
      const boton = Array.from(fixture.nativeElement.querySelectorAll('app-que-hacer-sunat button')).find((b) => (b as HTMLElement).textContent?.includes('Reintentar ahora')) as HTMLButtonElement;
      boton.click();
      await Promise.resolve();
      expect(alerta.confirmar).toHaveBeenCalled();
      const peticion = http.expectOne(urlConstants.fiscal.reintentarEnvio(7));
      expect(peticion.request.body).toEqual({ forzar: true });
      peticion.flush({ ambiente: 'produccion', id_envio: 7, estado: 'ACEPTADO', aceptado: true, codigo: '0', mensaje: 'Aceptado' });
      consultaEnvios().flush({ datos: [], total: 0, pagina: 1, por_pagina: 20 });
    });

    it('los envíos que no necesitan a nadie siguen con su línea de texto y sus botones en la columna', () => {
      const filas = mostrar([
        envio({ id_envio: 1, estado: 'PENDIENTE_REENVIO', accion_sunat: 'REINTENTAR' }),
        envio({ id_envio: 2, estado: 'TICKET_PENDIENTE' }),
      ]);
      expect(fixture.nativeElement.querySelector('app-que-hacer-sunat')).toBeNull();
      expect(filas[0].querySelector('[data-etiqueta="Acciones"]')?.textContent).toContain('Reintentar');
      expect(filas[1].textContent).toContain('Va en un resumen diario que SUNAT está procesando');
    });
  });
});
