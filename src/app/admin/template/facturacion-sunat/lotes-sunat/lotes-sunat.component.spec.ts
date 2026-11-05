import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { urlConstants } from '../../../../constants/urlConstants';
import { AlertService } from '../../../../shared/services/alert.service';
import { LoteSunat } from '../../../models/fiscal.models';
import { LotesSunatComponent } from './lotes-sunat.component';

function lote(cambios: Partial<LoteSunat>): LoteSunat {
  return {
    id_envio: 7,
    ambiente: 'produccion',
    operacion: 'baja',
    identificador: 'RA-20261105-1',
    estado: 'ACEPTADO',
    sunat_ticket: '202612345678',
    codigo_sunat: '0',
    mensaje_sunat: 'La Comunicacion de baja RA-20261105-1 ha sido aceptada',
    fecha_referencia: '2026-11-03',
    intento: 1,
    proximo_intento_en: null,
    creado_en: '2026-11-05T15:00:00.000Z',
    actualizado_en: '2026-11-05T15:02:00.000Z',
    archivos: ['xml_firmado', 'zip', 'cdr_xml'],
    lineas: [{ id_comprobante: 10, serie: 'F001', numero: 12, tipo_documento: '01', condicion: null, estado: 'ACEPTADO' }],
    ...cambios,
  };
}

const pagina = (datos: LoteSunat[]) => ({ datos, total: datos.length, pagina: 1, por_pagina: 20 });

describe('LotesSunatComponent', () => {
  let fixture: ComponentFixture<LotesSunatComponent>;
  let component: LotesSunatComponent;
  let http: HttpTestingController;
  const alerta = {
    toast: vi.fn(),
    error: vi.fn(),
  };

  const consultaLotes = () => http.expectOne((r) => r.url === urlConstants.fiscal.lotes);

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [LotesSunatComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AlertService, useValue: alerta }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LotesSunatComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('ambienteVigente', 'produccion');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('consulta los lotes del ambiente vigente y pinta la lista', () => {
    const peticion = consultaLotes();
    expect(peticion.request.params.get('ambiente')).toBe('produccion');
    expect(peticion.request.params.get('pagina')).toBe('1');
    expect(peticion.request.params.get('por_pagina')).toBe('20');
    peticion.flush(pagina([lote({}), lote({ id_envio: 8, operacion: 'resumen', identificador: 'RC-20261105-1', estado: 'TICKET_PENDIENTE', codigo_sunat: null, mensaje_sunat: null })]));
    fixture.detectChanges();
    const filas = fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>;
    expect(filas.length).toBe(2);
    expect(filas[0].textContent).toContain('RA-20261105-1');
    expect(filas[0].textContent).toContain('Baja');
    expect(filas[0].textContent).toContain('F001-12');
    expect(filas[0].textContent).toContain('202612345678');
    expect(filas[0].querySelector('[data-etiqueta="Estado SUNAT"]')?.textContent).toContain('Aceptado');
    expect(filas[0].textContent).toContain('Sin acciones');
    expect(filas[1].textContent).toContain('Resumen');
    expect(filas[1].querySelector('[data-etiqueta="Estado SUNAT"]')?.textContent).toContain('Ticket pendiente');
    expect(filas[1].querySelector('[data-etiqueta="Acciones"]')?.textContent).toContain('Consultar');
  });

  it('muestra el mensaje de vacío cuando no hay bajas ni resúmenes', () => {
    consultaLotes().flush(pagina([]));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin bajas ni resúmenes en este ambiente');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
  });

  it('ofrece reintentar o consultar solo donde el servidor lo admite', () => {
    const pendiente = lote({ estado: 'PENDIENTE_REENVIO', sunat_ticket: null });
    const conTicket = lote({ estado: 'TICKET_PENDIENTE' });
    const excepcionConTicket = lote({ estado: 'EXCEPCION', accion_sunat: 'CONSULTAR_TICKET' });
    const excepcionSinTicket = lote({ estado: 'EXCEPCION', sunat_ticket: null, accion_sunat: 'CONSULTAR_TICKET' });
    const excepcionDescartada = lote({ estado: 'EXCEPCION', accion_sunat: 'CORREGIR_Y_REENVIAR' });
    const rechazado = lote({ estado: 'RECHAZADO' });
    const enviando = lote({ estado: 'ENVIANDO', sunat_ticket: null });
    consultaLotes().flush(pagina([pendiente]));
    expect(component.puedeReintentar(pendiente)).toBe(true);
    expect(component.textoReintentar(pendiente)).toBe('Reintentar');
    expect(component.puedeReintentar(conTicket)).toBe(true);
    expect(component.textoReintentar(conTicket)).toBe('Consultar');
    expect(component.puedeReintentar(excepcionConTicket)).toBe(true);
    expect(component.puedeReintentar(excepcionSinTicket)).toBe(false);
    expect(component.puedeReintentar(excepcionDescartada)).toBe(false);
    expect(component.puedeReintentar(rechazado)).toBe(false);
    expect(component.puedeReintentar(enviando)).toBe(false);
  });

  it('reintentar llama al POST del lote, avisa, emite el cambio y vuelve a consultar la lista', () => {
    const pendiente = lote({ estado: 'TICKET_PENDIENTE' });
    consultaLotes().flush(pagina([pendiente]));
    fixture.detectChanges();
    const cambios: void[] = [];
    component.cambio.subscribe(() => cambios.push(undefined));

    component.reintentar(pendiente);
    const peticion = http.expectOne(urlConstants.fiscal.reintentarLote(7));
    expect(peticion.request.method).toBe('POST');
    peticion.flush({
      id_envio: 7, operacion: 'baja', identificador: 'RA-20261105-1', estado: 'ACEPTADO', aceptado: true,
      ticket: '202612345678', mensaje: 'Aceptada', codigo: '0',
    });
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(cambios.length).toBe(1);
    expect(component.idEnProceso).toBeNull();
    consultaLotes().flush(pagina([lote({})]));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-etiqueta="Estado SUNAT"]')?.textContent).toContain('Aceptado');
  });

  it('si el reintento falla muestra el error y recarga la lista', () => {
    const pendiente = lote({ estado: 'PENDIENTE_REENVIO', sunat_ticket: null });
    consultaLotes().flush(pagina([pendiente]));
    component.reintentar(pendiente);
    http
      .expectOne(urlConstants.fiscal.reintentarLote(7))
      .flush({ message: 'No se puede reenviar' }, { status: 409, statusText: 'Conflict' });
    expect(alerta.error).toHaveBeenCalled();
    consultaLotes().flush(pagina([pendiente]));
  });

  it('la descarga pide el archivo del lote con un nombre claro', () => {
    const entregado = lote({});
    consultaLotes().flush(pagina([entregado]));
    const nombres: string[] = [];
    // jsdom no trae createObjectURL: se simula solo aquí y luego se devuelve lo que había (los specs
    // comparten globales con isolate:false).
    const originales = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:prueba'), revokeObjectURL: vi.fn() });
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      nombres.push(this.download);
    });
    try {
      component.descargar(entregado, 'cdr_xml');
      const peticion = http.expectOne(urlConstants.fiscal.archivoLote(7, 'cdr_xml'));
      expect(peticion.request.responseType).toBe('blob');
      peticion.flush(new Blob(['<xml/>']));
      expect(nombres).toEqual(['R-RA-20261105-1.xml']);
      expect(component.idEnProceso).toBeNull();
    } finally {
      clic.mockRestore();
      Object.assign(URL, originales);
    }
  });

  it('muestra el error de la consulta con la opción de reintentar', () => {
    consultaLotes().flush({ message: 'Internal server error' }, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();
    const aviso = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(aviso.textContent).toContain('No se pudieron consultar las bajas y resúmenes');
    (aviso.querySelector('button') as HTMLButtonElement).click();
    consultaLotes().flush(pagina([]));
  });
});
