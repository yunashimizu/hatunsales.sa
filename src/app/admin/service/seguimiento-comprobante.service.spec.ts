import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { urlConstants } from '../../constants/urlConstants';
import { SILENCIOSA } from '../../interceptors/contexto-http';
import { NotificationService } from '../../shared/services/notification.service';
import { EventoPanel, EventosPanelService } from './eventos-panel.service';
import { MAXIMO_SEGUIMIENTOS, SeguimientoComprobanteService } from './seguimiento-comprobante.service';

describe('SeguimientoComprobanteService', () => {
  let servicio: SeguimientoComprobanteService;
  let http: HttpTestingController;
  let eventos: EventoPanel[];
  const avisos = { exito: vi.fn(), advertencia: vi.fn(), info: vi.fn() };
  const router = { navigate: vi.fn() };

  const url = (id: number) => urlConstants.comprobante.byId(id);
  const pendiente = (id: number, extra: object = {}) => ({
    id_comprobante: id,
    estado: 'pendiente',
    estado_sunat: 'ENVIANDO',
    aceptada_sunat: false,
    ...extra,
  });
  const aceptado = (id: number) => ({ id_comprobante: id, estado: 'emitido', estado_sunat: 'ACEPTADO', aceptada_sunat: true });

  beforeEach(() => {
    vi.useFakeTimers();
    avisos.exito.mockReset();
    avisos.advertencia.mockReset();
    avisos.info.mockReset();
    router.navigate.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotificationService, useValue: avisos },
        { provide: Router, useValue: router },
      ],
    });
    servicio = TestBed.inject(SeguimientoComprobanteService);
    http = TestBed.inject(HttpTestingController);
    eventos = [];
    TestBed.inject(EventosPanelService)
      .de('comprobante-actualizado')
      .subscribe((e) => eventos.push(e));
  });

  afterEach(() => {
    servicio.detener();
    vi.useRealTimers();
  });

  it('consulta a los 2 s, en silencio, y se detiene en el primer aceptado con un aviso de éxito', () => {
    servicio.seguir(45, 'F001-45');

    vi.advanceTimersByTime(1999);
    http.expectNone(url(45));
    vi.advanceTimersByTime(1);
    const peticion = http.expectOne(url(45));
    expect(peticion.request.context.get(SILENCIOSA)).toBe(true);
    peticion.flush(aceptado(45));

    expect(avisos.exito).toHaveBeenCalledTimes(1);
    expect(avisos.exito.mock.calls[0][0]).toBe('F001-45 aceptada por SUNAT');
    expect(avisos.exito.mock.calls[0][1]).toMatchObject({ duracion: 3500 });
    expect(servicio.enCurso).toBe(0);

    vi.advanceTimersByTime(60_000);
    http.expectNone(url(45));
    expect(avisos.info).not.toHaveBeenCalled();
  });

  it('publica el cambio en el bus al aceptarse', () => {
    servicio.seguir(45, 'F001-45');
    vi.advanceTimersByTime(2000);
    http.expectOne(url(45)).flush(aceptado(45));

    expect(eventos.length).toBe(1);
    expect(eventos[0].datos).toMatchObject({ id_comprobante: 45, estado: 'emitido', estado_sunat: 'ACEPTADO', aceptada_sunat: true });
  });

  it('con estado de error avisa con el motivo de SUNAT y una acción que lleva a Documentos', () => {
    servicio.seguir(12, 'B001-12');
    vi.advanceTimersByTime(2000);
    http.expectOne(url(12)).flush({
      id_comprobante: 12,
      estado: 'error',
      estado_sunat: 'RECHAZADO',
      aceptada_sunat: false,
      sunat_description: 'El RUC del receptor no existe',
    });

    expect(avisos.advertencia).toHaveBeenCalledTimes(1);
    const [titulo, opciones] = avisos.advertencia.mock.calls[0];
    expect(titulo).toContain('B001-12');
    expect(opciones.mensaje).toBe('El RUC del receptor no existe');
    expect(opciones.accion.etiqueta).toBe('Ver en Documentos');
    opciones.accion.alHacer();
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/mantenimiento/doc'], { queryParams: { comprobante: 12 } });
    expect(avisos.exito).not.toHaveBeenCalled();
    expect(servicio.enCurso).toBe(0);
  });

  it('un comprobante por resumen no se sigue y no avisa', () => {
    servicio.seguir(3, 'B001-3');
    vi.advanceTimersByTime(2000);
    http.expectOne(url(3)).flush(pendiente(3, { estado_sunat: 'POR_RESUMIR', por_resumen: true }));

    expect(avisos.exito).not.toHaveBeenCalled();
    expect(avisos.advertencia).not.toHaveBeenCalled();
    expect(servicio.enCurso).toBe(0);
    vi.advanceTimersByTime(60_000);
    http.expectNone(url(3));
  });

  it('consulta a los 2, 4, 7, 10, 15, 20, 30 y 45 s y a los 45 s sin respuesta avisa que sigue en proceso', () => {
    servicio.seguir(8, 'F001-8');
    const momentos = [2, 4, 7, 10, 15, 20, 30, 45];
    let transcurrido = 0;
    for (const s of momentos) {
      vi.advanceTimersByTime(s * 1000 - transcurrido - 1);
      http.expectNone(url(8));
      vi.advanceTimersByTime(1);
      transcurrido = s * 1000;
      http.expectOne(url(8)).flush(pendiente(8));
    }

    expect(avisos.info).toHaveBeenCalledTimes(1);
    expect(avisos.info.mock.calls[0][0]).toContain('F001-8');
    expect(avisos.info.mock.calls[0][1].mensaje).toContain('reintenta solo');
    expect(servicio.enCurso).toBe(0);
    vi.advanceTimersByTime(120_000);
    http.expectNone(url(8));
  });

  it('un tropiezo de red no corta el seguimiento', () => {
    servicio.seguir(9, 'F001-9');
    vi.advanceTimersByTime(2000);
    http.expectOne(url(9)).error(new ProgressEvent('error'));
    expect(servicio.enCurso).toBe(1);

    vi.advanceTimersByTime(2000);
    http.expectOne(url(9)).flush(aceptado(9));
    expect(avisos.exito).toHaveBeenCalledTimes(1);
  });

  it('no duplica ids: seguir dos veces el mismo comprobante hace una sola consulta', () => {
    servicio.seguir(5, 'F001-5');
    servicio.seguir(5, 'F001-5');
    expect(servicio.enCurso).toBe(1);

    vi.advanceTimersByTime(2000);
    http.expectOne(url(5)).flush(aceptado(5));
    expect(avisos.exito).toHaveBeenCalledTimes(1);
  });

  it('ignora ids inválidos', () => {
    servicio.seguir(0, 'X');
    servicio.seguir(NaN, 'X');
    expect(servicio.enCurso).toBe(0);
  });

  it(`sigue como máximo ${MAXIMO_SEGUIMIENTOS} a la vez y el resto espera su turno`, () => {
    for (let id = 1; id <= 7; id++) servicio.seguir(id, `F001-${id}`);
    expect(servicio.enCurso).toBe(MAXIMO_SEGUIMIENTOS);

    vi.advanceTimersByTime(2000);
    for (let id = 1; id <= 5; id++) http.expectOne(url(id));
    http.expectNone(url(6));
    http.expectNone(url(7));
  });

  it('al terminar uno entra el siguiente de la cola con su propio reloj', () => {
    for (let id = 1; id <= 6; id++) servicio.seguir(id, `F001-${id}`);
    vi.advanceTimersByTime(2000);
    http.expectOne(url(1)).flush(aceptado(1));
    for (let id = 2; id <= 5; id++) http.expectOne(url(id)).flush(pendiente(id));
    expect(servicio.enCurso).toBe(5); // entró el 6

    vi.advanceTimersByTime(1999);
    http.expectNone(url(6));
    vi.advanceTimersByTime(1);
    http.expectOne(url(6)).flush(aceptado(6));
    expect(avisos.exito).toHaveBeenCalledTimes(2);
  });

  it('publica un cambio de estado intermedio, pero no la primera lectura', () => {
    servicio.seguir(20, 'F001-20');
    vi.advanceTimersByTime(2000);
    http.expectOne(url(20)).flush(pendiente(20)); // línea base
    expect(eventos.length).toBe(0);

    vi.advanceTimersByTime(2000);
    http.expectOne(url(20)).flush(pendiente(20)); // igual
    expect(eventos.length).toBe(0);

    vi.advanceTimersByTime(3000);
    http.expectOne(url(20)).flush(pendiente(20, { estado_sunat: 'PENDIENTE_REENVIO' })); // cambió
    expect(eventos.length).toBe(1);
    expect(eventos[0].datos).toMatchObject({ id_comprobante: 20, estado_sunat: 'PENDIENTE_REENVIO' });
  });

  it('detener() cancela los seguimientos y vacía la cola', () => {
    for (let id = 1; id <= 6; id++) servicio.seguir(id, `F001-${id}`);
    servicio.detener();
    expect(servicio.enCurso).toBe(0);

    vi.advanceTimersByTime(60_000);
    for (let id = 1; id <= 6; id++) http.expectNone(url(id));
  });
});
