import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import {
  EstadoGuia,
  GuiaRemision,
  GuiaRemisionResumen,
  GuiaRemisionService,
  ModoGre,
  OperacionGuia,
} from '../../../service/guia-remision.service';
import { GuiaFormularioComponent } from './guia-formulario/guia-formulario.component';
import { ESPERAS_CONSULTA_MS, GuiasRemisionComponent } from './guias-remision.component';

/** El formulario tiene su propia prueba: aquí solo importa con qué se abre y qué avisa. */
@Component({ selector: 'app-guia-formulario', standalone: true, template: '' })
class FormularioFalso {
  @Input() idGuia: number | null = null;
  @Input() idVenta: number | null = null;
  @Output() readonly cerrar = new EventEmitter<void>();
  @Output() readonly guardada = new EventEmitter<number>();
  @Output() readonly emitida = new EventEmitter<OperacionGuia>();
  @Output() readonly abrir = new EventEmitter<number>();
}

const SIN_ACCIONES = { puede_editar: false, puede_validar: false, puede_emitir: false, puede_consultar: false, puede_anular: false };
const ACCIONES: Readonly<Record<EstadoGuia, GuiaRemisionResumen['acciones']>> = {
  borrador: { puede_editar: true, puede_validar: true, puede_emitir: true, puede_consultar: false, puede_anular: true },
  rechazado: { puede_editar: true, puede_validar: true, puede_emitir: true, puede_consultar: false, puede_anular: true },
  enviado: { ...SIN_ACCIONES, puede_consultar: true },
  pendiente: { ...SIN_ACCIONES, puede_validar: true, puede_emitir: true },
  aceptado: SIN_ACCIONES,
  anulado: SIN_ACCIONES,
  legacy: SIN_ACCIONES,
};
const TEXTO: Readonly<Record<EstadoGuia, string>> = {
  borrador: 'Borrador',
  pendiente: 'Pendiente de envío',
  enviado: 'Enviada a SUNAT',
  aceptado: 'Aceptada',
  rechazado: 'Rechazada',
  anulado: 'Anulada',
  legacy: 'Histórica (solo lectura)',
};

function guia(id: number, estado: EstadoGuia, cambios: Partial<GuiaRemision> = {}): GuiaRemision {
  const numerada = estado !== 'borrador';
  return {
    id_guia: id,
    id_venta: 7,
    id_comprobante: null,
    serie: numerada ? 'T001' : null,
    numero: numerada ? id : null,
    numero_formateado: numerada ? `T001-0000000${id}` : null,
    estado,
    estado_texto: TEXTO[estado],
    solo_lectura: estado === 'legacy',
    fecha_emision: numerada ? '2026-10-25' : null,
    fecha_inicio_traslado: '2026-10-25',
    motivo_traslado: '01',
    motivo_traslado_texto: 'Venta',
    modalidad_traslado: '02',
    modalidad_traslado_texto: 'Transporte privado',
    destinatario: { tipo_documento: '1', numero_documento: '45678912', denominacion: 'JUAN PEREZ', direccion: null },
    llegada: { ubigeo: '150122', ubigeo_texto: '150122 - MIRAFLORES - LIMA - LIMA', direccion: 'Av. Larco 1', codigo_establecimiento: null },
    documento_relacionado: null,
    sunat_ticket: estado === 'enviado' ? 'tk-9' : null,
    error_mensaje: estado === 'rechazado' ? 'El ubigeo de llegada no existe.' : null,
    creado_en: '2026-10-25T15:00:00.000Z',
    acciones: ACCIONES[estado],
    hora_emision: numerada ? '10:00:00' : null,
    descripcion_motivo: null,
    fecha_entrega_transportista: null,
    peso_bruto_total: 50,
    unidad_peso: 'KGM',
    numero_bultos: 2,
    partida: { ubigeo: '150119', ubigeo_texto: '150119 - LURIN - LIMA - LIMA', direccion: 'Jr. Almacén 1', codigo_establecimiento: null },
    transportista: null,
    vehiculo: { placa: 'ABC123', tarjeta_circulacion: null, marca: null },
    conductor: { tipo_documento: '1', numero_documento: '40404040', nombres: 'Ana', apellidos: 'Ruiz', licencia: 'Q40404040' },
    items: [{ id_item: 1, id_producto: 3, id_venta_detalle: 11, codigo: 'CEM-01', descripcion: 'Cemento', unidad: 'NIU', cantidad: 6, orden: 0 }],
    observaciones: null,
    sunat: { ticket: estado === 'enviado' ? 'tk-9' : null, codigo: null, descripcion: null, cadena_qr: null, codigo_hash: null },
    envio: null,
    archivos: [],
    anulacion: null,
    avisos: [],
    ...cambios,
  };
}

function listado(guias: GuiaRemision[]) {
  return of({ datos: guias, total: guias.length, pagina: 1, por_pagina: 20 });
}

function operacion(g: GuiaRemision): OperacionGuia {
  const estado = g.estado === 'aceptado' ? 'ACEPTADA' : 'TICKET_PENDIENTE';
  return { guia: g, resultado: { estado, codigo: g.estado === 'aceptado' ? '0' : '98', mensaje: 'SUNAT respondió', ticket: 'tk-9', errores: [] } };
}

describe('GuiasRemisionComponent', () => {
  let fixture: ComponentFixture<GuiasRemisionComponent>;
  let componente: GuiasRemisionComponent;
  let parametros: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let modo: ModoGre;
  let rol: { rolNombre: string; rolId: number };
  let navegar: ReturnType<typeof vi.spyOn>;
  const api = {
    listar: vi.fn(),
    modo: vi.fn(),
    obtener: vi.fn(),
    emitir: vi.fn(),
    consultar: vi.fn(),
    validar: vi.fn(),
    anular: vi.fn(),
    pdf: vi.fn(),
    archivo: vi.fn(),
  };
  const alerta = {
    confirmar: vi.fn(async () => true),
    pedirTexto: vi.fn(async (): Promise<string | null> => null),
    errorHttp: vi.fn(async () => undefined),
    advertencia: vi.fn(async () => undefined),
  };
  const avisos = { exito: vi.fn(), error: vi.fn(), info: vi.fn(), advertencia: vi.fn() };

  async function crear(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [GuiasRemisionComponent],
      providers: [
        provideRouter([]),
        { provide: GuiaRemisionService, useValue: api },
        { provide: AuthService, useValue: { getSesion: () => rol } },
        { provide: AlertService, useValue: alerta },
        { provide: NotificationService, useValue: avisos },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: parametros.asObservable(),
            get snapshot() {
              return { queryParamMap: parametros.value };
            },
          },
        },
      ],
    })
      .overrideComponent(GuiasRemisionComponent, {
        remove: { imports: [GuiaFormularioComponent] },
        add: { imports: [FormularioFalso] },
      })
      .compileComponents();
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(GuiasRemisionComponent);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  const texto = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const filas = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('tbody tr'));
  const botones = (raiz: HTMLElement): string[] =>
    Array.from(raiz.querySelectorAll('button')).map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '');

  beforeEach(() => {
    vi.clearAllMocks();
    parametros = new BehaviorSubject(convertToParamMap({}));
    modo = { activo: true };
    rol = { rolNombre: 'vendedor', rolId: 3 };
    api.modo.mockImplementation(() => of(modo));
    api.listar.mockReturnValue(listado([]));
  });

  afterEach(() => vi.useRealTimers());

  it('lista cada guía con su estado en palabras y solo las acciones que admite', async () => {
    api.listar.mockReturnValue(listado([guia(1, 'borrador'), guia(2, 'enviado'), guia(3, 'aceptado'), guia(4, 'rechazado')]));
    await crear();
    const [borrador, enviada, aceptada, rechazada] = filas();
    expect(borrador.querySelector('[data-etiqueta="Estado"]')?.textContent).toContain('Borrador');
    expect(enviada.querySelector('[data-etiqueta="Estado"]')?.textContent).toContain('Ticket tk-9');
    expect(rechazada.textContent).toContain('El ubigeo de llegada no existe.');

    expect(botones(borrador).join('|')).toContain('Emitir a SUNAT la guía Borrador #1');
    expect(botones(borrador).join('|')).toContain('Anular la guía Borrador #1');
    expect(botones(enviada).join('|')).toContain('Consultar en SUNAT la guía T001-00000002');
    expect(botones(enviada).join('|')).not.toContain('Emitir');
    expect(botones(aceptada)).toEqual(['Ver el detalle de la guía T001-00000003', 'Ver el detalle de la guía T001-00000003', 'Descargar el PDF de la guía T001-00000003']);
    expect(botones(rechazada).join('|')).toContain('Corregir la guía T001-00000004');
    expect(botones(rechazada).join('|')).toContain('Reenviar a SUNAT la guía T001-00000004');

    const chip = Array.from(fixture.nativeElement.querySelectorAll('.adm-chip') as NodeListOf<HTMLButtonElement>).find((c) => c.textContent?.trim() === 'Aceptadas')!;
    chip.click();
    expect(api.listar).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'aceptado', pagina: 1, por_pagina: 20 }));
  });

  it('con la GRE inactiva avisa el motivo arriba y deja «Emitir» deshabilitado con ese motivo', async () => {
    modo = { activo: false, codigo: 'GRE_SIN_BETA', motivo: 'La GRE solo se emite en producción con las credenciales API de SUNAT.' };
    api.listar.mockReturnValue(listado([guia(1, 'borrador')]));
    await crear();
    expect(texto()).toContain('La emisión de guías a SUNAT no está activa');
    expect(texto()).toContain('solo se emite en producción');
    const emitir = filas()[0].querySelector('[aria-label^="Emitir"]') as HTMLButtonElement;
    expect(emitir.disabled).toBe(true);
    expect(emitir.title).toContain('solo se emite en producción');
  });

  it('el rol caja solo consulta y descarga', async () => {
    rol = { rolNombre: 'caja', rolId: 4 };
    api.listar.mockReturnValue(listado([guia(1, 'borrador'), guia(2, 'enviado')]));
    await crear();
    expect(texto()).not.toContain('Nueva guía');
    const acciones = filas().map((f) => botones(f).join('|')).join('||');
    expect(acciones).not.toMatch(/Emitir|Consultar|Editar|Anular/);
    expect(acciones).toContain('Descargar el PDF de la guía Borrador #1');

    parametros.next(convertToParamMap({ venta: '7' }));
    expect(componente.panel).toBeNull();
    expect(avisos.advertencia).toHaveBeenCalledWith('Solo administradores y vendedores crean guías', expect.anything());
  });

  it('?venta=ID abre el formulario de una guía nueva de esa venta y al cerrarlo limpia la URL', async () => {
    parametros.next(convertToParamMap({ venta: '7' }));
    await crear();
    const formulario = (): FormularioFalso => fixture.debugElement.query(By.directive(FormularioFalso)).componentInstance;
    expect([formulario().idVenta, formulario().idGuia]).toEqual([7, null]);

    formulario().cerrar.emit();
    expect(componente.panel).toBeNull();
    expect(navegar).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { guia: null, venta: null }, replaceUrl: true }));

    // Si el formulario descubre que su guía ya se envió (un intento sin respuesta), se abre su detalle.
    parametros.next(convertToParamMap({ venta: '7' }));
    fixture.detectChanges();
    api.obtener.mockReturnValue(of(guia(31, 'enviado')));
    formulario().abrir.emit(31);
    expect(componente.panel).toBe('detalle');
    expect(api.obtener).toHaveBeenCalledWith(31);
  });

  it('emitir muestra en el acto la respuesta de SUNAT y consulta el ticket a los 5, 15 y 30 s', async () => {
    api.listar.mockReturnValue(listado([guia(1, 'borrador')]));
    await crear();
    vi.useFakeTimers();
    const enviada = guia(1, 'enviado');
    api.emitir.mockReturnValue(of(operacion(enviada)));
    api.consultar.mockReturnValue(of(operacion(enviada)));

    await componente.emitir(componente.guias[0]);
    expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Emitir a SUNAT el borrador #1?' }));
    expect(api.emitir).toHaveBeenCalledWith(1);
    fixture.detectChanges();
    expect(texto()).toContain('En proceso en SUNAT');
    expect(texto()).toContain('consulta 1 de 3');
    expect(avisos.info).toHaveBeenCalled();

    vi.advanceTimersByTime(ESPERAS_CONSULTA_MS[0] - 1);
    expect(api.consultar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(api.consultar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(ESPERAS_CONSULTA_MS[1]);
    expect(api.consultar).toHaveBeenCalledTimes(2);

    api.consultar.mockReturnValue(of(operacion(guia(1, 'aceptado', { sunat: { ticket: 'tk-9', codigo: '0', descripcion: 'La guía T001-00000001 ha sido aceptada', cadena_qr: 'https://e-factura.sunat.gob.pe/qr?h=1', codigo_hash: 'abc' } }))));
    vi.advanceTimersByTime(ESPERAS_CONSULTA_MS[2]);
    expect(api.consultar).toHaveBeenCalledTimes(3);
    fixture.detectChanges();
    expect(texto()).toContain('Aceptada por SUNAT');
    expect(texto()).toContain('ha sido aceptada');
    expect((fixture.nativeElement.querySelector('a[href^="https://e-factura"]') as HTMLAnchorElement).rel).toContain('noopener');
    expect(avisos.exito).toHaveBeenCalledWith('Guía T001-00000001 aceptada por SUNAT', expect.anything());

    vi.advanceTimersByTime(60_000);
    expect(api.consultar).toHaveBeenCalledTimes(3);
  });

  it('?guia=ID abre el detalle; si la carga falla se ve el error con «Reintentar»', async () => {
    api.obtener.mockReturnValue(throwError(() => ({ status: 500, error: { message: 'Internal server error' } })));
    parametros.next(convertToParamMap({ guia: '9' }));
    await crear();
    expect(api.obtener).toHaveBeenCalledWith(9);
    const aviso = fixture.nativeElement.querySelector('.gre-detalle [role="alert"]') as HTMLElement;
    expect(aviso.textContent).toContain('No se pudo cargar la guía');

    api.obtener.mockReturnValue(of(guia(9, 'rechazado', { numero_formateado: 'T001-00000009' })));
    (aviso.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.obtener).toHaveBeenCalledTimes(2);
    expect(texto()).toContain('Rechazada por SUNAT');
    expect(texto()).toContain('se reenviará con el mismo número T001-00000009');
  });

  it('si SUNAT no admite la guía por datos, el detalle lista los errores; un 503 va al modal y relee el modo', async () => {
    api.listar.mockReturnValue(listado([guia(1, 'borrador'), guia(2, 'borrador')]));
    api.obtener.mockReturnValue(of(guia(1, 'borrador')));
    await crear();
    api.emitir.mockReturnValue(
      throwError(() => ({
        status: 400,
        error: {
          codigo: 'GRE_INVALIDA',
          message: 'La guía tiene 1 error(es) que impiden emitirla',
          errores: ['Conductor: indique la licencia.'],
          advertencias: [],
          por_campo: [{ campo: 'conductores[0].licencia', campo_formulario: 'conductor.licencia', nivel: 'error', mensaje: 'Conductor: indique la licencia.' }],
        },
      })),
    );
    await componente.emitir(componente.guias[0]);
    fixture.detectChanges();
    expect(componente.panel).toBe('detalle');
    expect(componente.validacion?.errores).toEqual(['Conductor: indique la licencia.']);
    expect(texto()).toContain('1 error(es) que impiden emitirla');
    expect(alerta.errorHttp).not.toHaveBeenCalled();

    api.emitir.mockReturnValue(throwError(() => ({ status: 503, error: { codigo: 'GRE_DESACTIVADA', message: 'La GRE está desactivada.' } })));
    await componente.emitir(componente.guias[1]);
    expect(alerta.errorHttp).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }), 'No se pudo emitir la guía a SUNAT');
    expect(api.modo).toHaveBeenLastCalledWith(true);
  });
});
