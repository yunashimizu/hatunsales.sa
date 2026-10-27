import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AlertService } from '../../../../../shared/services/alert.service';
import { NotificationService } from '../../../../../shared/services/notification.service';
import {
  CatalogosGuia,
  ContextoVentaGuia,
  GuardarGuiaRemision,
  GuiaRemision,
  GuiaRemisionService,
  ModoGre,
  OperacionGuia,
} from '../../../../service/guia-remision.service';
import { PuntoVentaService } from '../../../../service/punto-venta.service';
import { UbigeoService } from '../../../../service/ubigeo.service';
import { GestionService } from '../../../service/gestion.service';
import { GuiaFormularioComponent } from './guia-formulario.component';

const CATALOGOS: CatalogosGuia = {
  motivos: [
    { codigo: '01', nombre: 'Venta', descripcion: 'Entrega al comprador.', requiere_venta: true, requiere_descripcion: false, requiere_establecimiento: false },
    { codigo: '04', nombre: 'Traslado entre establecimientos', descripcion: 'A otro local.', requiere_venta: false, requiere_descripcion: false, requiere_establecimiento: true },
    { codigo: '13', nombre: 'Otros', descripcion: 'Describa el motivo.', requiere_venta: false, requiere_descripcion: true, requiere_establecimiento: false },
  ],
  modalidades: [
    { codigo: '01', nombre: 'Transporte público', descripcion: 'Empresa de transporte con RUC.' },
    { codigo: '02', nombre: 'Transporte privado', descripcion: 'Vehículo y conductor propios.' },
  ],
  unidades_peso: [{ codigo: 'KGM', nombre: 'Kilogramos' }, { codigo: 'TNE', nombre: 'Toneladas' }],
  tipos_documento_destinatario: [{ codigo: '1', nombre: 'DNI' }, { codigo: '6', nombre: 'RUC' }],
  tipos_documento_conductor: [{ codigo: '1', nombre: 'DNI' }],
  unidades_medida: [{ codigo: 'NIU', nombre: 'Unidad' }],
  documentos_relacionados: [],
  estados: [],
  ubigeo: { minimo_caracteres: 3, maximo_resultados: 20 },
  hoy: '2026-10-25',
};

function contexto(cambios: Partial<ContextoVentaGuia> = {}): ContextoVentaGuia {
  return {
    venta: { id_venta: 7, fecha: '2026-10-24', total: 150, estado: 'activa', id_cliente: 1, id_empresa: null },
    permitido: true,
    motivo_no_permitido: null,
    destinatario: { tipo_documento: '1', numero_documento: '45678912', denominacion: 'JUAN PEREZ', direccion: 'Av. Lima 123' },
    documento_relacionado: { id_comprobante: 30, tipo: '03', tipo_texto: 'Boleta de venta', serie: 'B001', numero: 12, numero_formateado: 'B001-00000012' },
    partida: { ubigeo: '150119', ubigeo_texto: '150119 - LURIN - LIMA - LIMA', direccion: 'Jr. Almacén 1', codigo_establecimiento: null },
    llegada: { ubigeo: null, ubigeo_texto: null, direccion: 'Av. Lima 123', codigo_establecimiento: null },
    almacen: null,
    items: [
      { id_producto: 3, id_venta_detalle: 11, codigo: 'CEM-01', descripcion: 'Cemento 42.5 kg', unidad: 'NIU', cantidad_vendida: 10, cantidad_en_guias: 4, cantidad_pendiente: 6 },
      { id_producto: 4, id_venta_detalle: 12, codigo: 'FIE-08', descripcion: 'Fierro 8 mm', unidad: 'NIU', cantidad_vendida: 5, cantidad_en_guias: 5, cantidad_pendiente: 0 },
    ],
    guias: [{ id_guia: 2, numero_formateado: 'T001-00000002', estado: 'aceptado', estado_texto: 'Aceptada' }],
    avisos: [],
    ...cambios,
  };
}

function guiaGuardada(cambios: Partial<GuiaRemision> = {}): GuiaRemision {
  return {
    id_guia: 15,
    id_venta: 7,
    id_comprobante: 30,
    serie: null,
    numero: null,
    numero_formateado: null,
    estado: 'borrador',
    estado_texto: 'Borrador',
    solo_lectura: false,
    fecha_emision: null,
    fecha_inicio_traslado: '2026-10-25',
    motivo_traslado: '01',
    motivo_traslado_texto: 'Venta',
    modalidad_traslado: '02',
    modalidad_traslado_texto: 'Transporte privado',
    destinatario: { tipo_documento: '1', numero_documento: '45678912', denominacion: 'JUAN PEREZ', direccion: null },
    llegada: { ubigeo: null, ubigeo_texto: null, direccion: 'Av. Lima 123', codigo_establecimiento: null },
    documento_relacionado: null,
    sunat_ticket: null,
    error_mensaje: null,
    creado_en: '2026-10-25T15:00:00.000Z',
    acciones: { puede_editar: true, puede_validar: true, puede_emitir: true, puede_consultar: false, puede_anular: true },
    hora_emision: null,
    descripcion_motivo: null,
    fecha_entrega_transportista: null,
    peso_bruto_total: 120,
    unidad_peso: 'KGM',
    numero_bultos: null,
    partida: { ubigeo: '150119', ubigeo_texto: '150119 - LURIN - LIMA - LIMA', direccion: 'Jr. Almacén 1', codigo_establecimiento: null },
    transportista: null,
    vehiculo: null,
    conductor: null,
    items: [],
    observaciones: null,
    sunat: { ticket: null, codigo: null, descripcion: null, cadena_qr: null, codigo_hash: null },
    envio: null,
    archivos: [],
    anulacion: null,
    avisos: [],
    ...cambios,
  };
}

function operacion(estado: GuiaRemision['estado']): OperacionGuia {
  return {
    guia: guiaGuardada({ id_guia: 21, estado, numero_formateado: 'T001-00000009' }),
    resultado: { estado: 'ACEPTADA', codigo: '0', mensaje: 'Aceptada', ticket: 'tk-1', errores: [] },
  };
}

describe('GuiaFormularioComponent', () => {
  let fixture: ComponentFixture<GuiaFormularioComponent>;
  let componente: GuiaFormularioComponent;
  let modo: ModoGre;
  const api = {
    catalogos: vi.fn(),
    modo: vi.fn(),
    obtener: vi.fn(),
    contextoVenta: vi.fn(),
    crear: vi.fn(),
    crearYEmitir: vi.fn(),
    actualizar: vi.fn(),
    validar: vi.fn(),
    emitir: vi.fn(),
  };
  const alerta = { confirmar: vi.fn(async () => true), errorHttp: vi.fn(async () => undefined) };
  const avisos = { exito: vi.fn(), advertencia: vi.fn(), error: vi.fn() };
  const ventasApi = {
    listar: vi.fn(() => of({ datos: [] })),
    buscarProductos: vi.fn(() => of([])),
    resolverCodigo: vi.fn(),
  };

  async function crear(entradas: { idVenta?: number | null; idGuia?: number | null } = {}): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [GuiaFormularioComponent],
      providers: [
        { provide: GuiaRemisionService, useValue: api },
        { provide: PuntoVentaService, useValue: ventasApi },
        { provide: GestionService, useValue: { getSunatRuc: vi.fn(() => of({ nombre: 'TRANSPORTES SAC', estado: 'ACTIVO', condicion: 'HABIDO' })) } },
        { provide: UbigeoService, useValue: { buscar: vi.fn(() => of([])), obtener: vi.fn() } },
        { provide: AlertService, useValue: alerta },
        { provide: NotificationService, useValue: avisos },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(GuiaFormularioComponent);
    componente = fixture.componentInstance;
    fixture.componentRef.setInput('idVenta', entradas.idVenta ?? null);
    fixture.componentRef.setInput('idGuia', entradas.idGuia ?? null);
    fixture.detectChanges();
  }

  /** El formulario es OnPush: tras cambiar su estado desde la prueba hay que marcarlo antes de pintar. */
  function pintar(): void {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  }

  function ultimoCuerpo(espia: ReturnType<typeof vi.fn>): GuardarGuiaRemision {
    return espia.mock.calls[espia.mock.calls.length - 1][espia === api.actualizar ? 1 : 0] as GuardarGuiaRemision;
  }

  function completarTransportePrivado(): void {
    componente.f.modalidad_traslado = '02';
    componente.f.vehiculo.placa = 'ABC123';
    componente.f.conductor = { tipo_documento: '1', numero_documento: '40404040', nombres: 'Ana', apellidos: 'Ruiz', licencia: 'Q40404040' };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    modo = { activo: true };
    api.catalogos.mockReturnValue(of(CATALOGOS));
    api.modo.mockImplementation(() => of(modo));
    api.contextoVenta.mockReturnValue(of(contexto()));
  });

  it('precarga la guía desde la venta: destinatario, partida, lo pendiente de cada producto y el comprobante', async () => {
    await crear({ idVenta: 7 });
    expect(api.contextoVenta).toHaveBeenCalledWith(7);
    expect(componente.f.motivo_traslado).toBe('01');
    expect(componente.f.destinatario.denominacion).toBe('JUAN PEREZ');
    const [cemento, fierro] = componente.f.items;
    expect([cemento.incluir, cemento.cantidad, cemento.tope]).toEqual([true, 6, 6]);
    expect([fierro.incluir, fierro.cantidad, fierro.tope]).toEqual([false, null, 0]);
    expect(fixture.nativeElement.textContent).toContain('B001-00000012');
    expect(componente.motivos.map((m) => m.codigo)).toEqual(['01']);
    expect(componente.haySinGuardar).toBe(false);

    completarTransportePrivado();
    api.crear.mockReturnValue(of(guiaGuardada()));
    componente.guardarBorrador();
    const cuerpo = ultimoCuerpo(api.crear);
    expect(cuerpo).toEqual(
      expect.objectContaining({
        id_venta: 7,
        motivo_traslado: '01',
        modalidad_traslado: '02',
        fecha_inicio_traslado: '2026-10-25',
        destinatario: { tipo_documento: '1', numero_documento: '45678912', denominacion: 'JUAN PEREZ', direccion: 'Av. Lima 123' },
        partida: { ubigeo: '150119', direccion: 'Jr. Almacén 1' },
        vehiculo: { placa: 'ABC123' },
        items: [{ id_producto: 3, cantidad: 6, descripcion: 'Cemento 42.5 kg' }],
      }),
    );
    expect(cuerpo.transportista).toBeUndefined();
    expect(cuerpo.clave_idempotencia).toMatch(/^gre-/);
    expect(avisos.exito).toHaveBeenCalled();

    // Ya guardada: lo siguiente actualiza la misma guía.
    api.actualizar.mockReturnValue(of(guiaGuardada()));
    componente.guardarBorrador();
    expect(api.actualizar).toHaveBeenCalledWith(15, expect.objectContaining({ id_venta: 7 }));
    expect(api.crear).toHaveBeenCalledTimes(1);
  });

  it('sin venta solo ofrece 04 y 13: con 04 no manda destinatario y sí el establecimiento; en público solo el transportista', async () => {
    await crear();
    componente.cambiarOrigen('sin_venta');
    expect(componente.motivos.map((m) => m.codigo)).toEqual(['04', '13']);

    componente.f.motivo_traslado = '13';
    componente.f.modalidad_traslado = '01';
    componente.agregarProducto({ id_producto: 9, nombre: 'Taladro', sku: 'TAL-1', codigo_barras: '', unidad_medida: 'UND' } as never);
    componente.guardarBorrador();
    expect(api.crear).not.toHaveBeenCalled();
    expect(componente.error('descripcion_motivo')).toContain('Describa el motivo');
    expect(componente.paso).toBe('origen');

    componente.f.motivo_traslado = '04';
    componente.f.transportista = { ruc: '20123456789', razon_social: 'TRANSPORTES SAC', registro_mtc: '' };
    componente.f.vehiculo.placa = 'NO-VA';
    componente.f.partida.codigo_establecimiento = '0000';
    componente.f.llegada = { ubigeo: '040101', ubigeo_texto: '040101 - AREQUIPA', direccion: 'Calle Sur 4', codigo_establecimiento: '0001' };
    api.crear.mockReturnValue(of(guiaGuardada({ id_venta: null, motivo_traslado: '04' })));
    componente.guardarBorrador();
    const cuerpo = ultimoCuerpo(api.crear);
    expect(cuerpo.id_venta).toBeUndefined();
    expect(cuerpo.destinatario).toBeUndefined();
    expect(cuerpo.partida).toEqual({ codigo_establecimiento: '0000' });
    expect(cuerpo.llegada).toEqual({ ubigeo: '040101', direccion: 'Calle Sur 4', codigo_establecimiento: '0001' });
    expect(cuerpo.transportista).toEqual({ ruc: '20123456789', razon_social: 'TRANSPORTES SAC' });
    expect(cuerpo.vehiculo).toBeUndefined();
    expect(cuerpo.conductor).toBeUndefined();
    expect(cuerpo.items).toEqual([{ id_producto: 9, cantidad: 1, descripcion: 'Taladro' }]);
  });

  it('no emite con el traslado antes de hoy ni con más de lo pendiente de la venta', async () => {
    await crear({ idVenta: 7 });
    completarTransportePrivado();
    componente.f.fecha_inicio_traslado = '2026-10-24';
    componente.f.items[0].cantidad = 7;
    await componente.emitirASunat();
    expect(alerta.confirmar).not.toHaveBeenCalled();
    expect(api.crearYEmitir).not.toHaveBeenCalled();
    expect(componente.error('fecha_inicio_traslado')).toContain('anterior a hoy');
    expect(componente.errorItem(componente.f.items[0], 'cantidad')).toContain('supera lo pendiente de la venta (6)');
    expect(componente.paso).toBe('trayecto');
    pintar();
    const resumen = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(resumen.textContent).toContain('Hay 2 datos por corregir');
    expect(resumen.textContent).toContain('Ir a «Bienes y peso»');
  });

  it('«Validar sin enviar» guarda y muestra cada error del backend junto a su campo y las advertencias aparte', async () => {
    await crear({ idVenta: 7 });
    completarTransportePrivado();
    api.crear.mockReturnValue(of(guiaGuardada()));
    api.validar.mockReturnValue(
      of({
        valido: false,
        errores: ['Punto de llegada: indique el ubigeo.', 'Conductor: indique la licencia.'],
        advertencias: ['El peso parece bajo para los bienes.'],
        por_campo: [
          { campo: 'envio.llegada.ubigeo', campo_formulario: 'llegada.ubigeo', nivel: 'error', mensaje: 'Punto de llegada: indique el ubigeo.' },
          { campo: 'conductores[0].licencia', campo_formulario: 'conductor.licencia', nivel: 'error', mensaje: 'Conductor: indique la licencia.' },
          { campo: 'envio.pesoBrutoTotal', campo_formulario: 'peso_bruto_total', nivel: 'advertencia', mensaje: 'El peso parece bajo para los bienes.' },
        ],
      }),
    );
    componente.validarSinEnviar();
    expect(api.validar).toHaveBeenCalledWith(15);
    expect(componente.error('llegada.ubigeo')).toBe('Punto de llegada: indique el ubigeo.');
    expect(componente.error('conductor.licencia')).toBe('Conductor: indique la licencia.');
    expect(componente.erroresDePaso('trayecto')).toBe(1);
    expect(componente.erroresDePaso('transporte')).toBe(1);
    expect(componente.paso).toBe('trayecto');
    expect(componente.advertencias).toEqual(['El peso parece bajo para los bienes.']);
    pintar();
    expect(fixture.nativeElement.querySelector('#gre-llegada-ubigeo-ayuda')?.textContent).toContain('indique el ubigeo');

    api.actualizar.mockReturnValue(of(guiaGuardada()));
    api.validar.mockReturnValue(of({ valido: true, errores: [], advertencias: [], por_campo: [] }));
    componente.validarSinEnviar();
    expect(api.actualizar).toHaveBeenCalledWith(15, expect.anything());
    expect(componente.validacionVigente).toBe(true);
    componente.f.observaciones = 'Entregar por la tarde';
    expect(componente.validacionVigente).toBe(false);
  });

  it('con la GRE inactiva, «Emitir a SUNAT» queda deshabilitado con el motivo del backend y se puede guardar', async () => {
    modo = { activo: false, codigo: 'GRE_SIN_BETA', motivo: 'La GRE no tiene ambiente de pruebas en SUNAT: solo se puede validar sin enviar.' };
    await crear({ idVenta: 7 });
    pintar();
    const botones = Array.from(fixture.nativeElement.querySelectorAll('.adm-panel__pie button')) as HTMLButtonElement[];
    const emitir = botones.find((b) => b.textContent?.includes('Emitir a SUNAT'))!;
    const guardar = botones.find((b) => b.textContent?.includes('Guardar borrador'))!;
    expect(emitir.disabled).toBe(true);
    expect(guardar.disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('#gre-sin-emitir')?.textContent).toContain('solo se puede validar sin enviar');
    expect(emitir.getAttribute('aria-describedby')).toBe('gre-sin-emitir');
    await componente.emitirASunat();
    expect(api.crearYEmitir).not.toHaveBeenCalled();
  });

  it('bloquea el doble envío y, si SUNAT no la admite por datos, la deja como borrador y corrige con PUT', async () => {
    await crear({ idVenta: 7 });
    completarTransportePrivado();
    const respuesta = new Subject<OperacionGuia>();
    api.crearYEmitir.mockReturnValue(respuesta);
    await componente.emitirASunat();
    await componente.emitirASunat();
    expect(api.crearYEmitir).toHaveBeenCalledTimes(1);
    expect(componente.ocupado).toBe('emitir');

    const guardadas: number[] = [];
    componente.guardada.subscribe((id) => guardadas.push(id));
    respuesta.error({
      status: 400,
      error: {
        codigo: 'GRE_INVALIDA',
        message: 'La guía tiene 1 error(es) que impiden emitirla',
        errores: ['Punto de llegada: indique el ubigeo.'],
        advertencias: [],
        por_campo: [{ campo: 'envio.llegada.ubigeo', campo_formulario: 'llegada.ubigeo', nivel: 'error', mensaje: 'Punto de llegada: indique el ubigeo.' }],
        id_guia: 21,
      },
    });
    expect(componente.ocupado).toBeNull();
    expect(guardadas).toEqual([21]);
    expect(componente.avisoGuardado).toContain('borrador #21');
    expect(componente.error('llegada.ubigeo')).toContain('indique el ubigeo');
    expect(alerta.errorHttp).not.toHaveBeenCalled();

    const emitidas: OperacionGuia[] = [];
    componente.emitida.subscribe((op) => emitidas.push(op));
    api.actualizar.mockReturnValue(of(guiaGuardada({ id_guia: 21 })));
    api.emitir.mockReturnValue(of(operacion('aceptado')));
    await componente.emitirASunat();
    expect(api.actualizar).toHaveBeenCalledWith(21, expect.objectContaining({ id_venta: 7 }));
    expect(api.emitir).toHaveBeenCalledWith(21);
    expect(api.crearYEmitir).toHaveBeenCalledTimes(1);
    expect(emitidas[0].guia.estado).toBe('aceptado');
  });

  it('si «Emitir» queda sin respuesta, recupera la guía con la misma clave sin duplicarla y abre la ya enviada', async () => {
    await crear({ idVenta: 7 });
    completarTransportePrivado();
    api.crearYEmitir.mockReturnValue(throwError(() => ({ status: 0, error: { codigo: 'TIEMPO_AGOTADO', message: 'El servidor tardó demasiado en responder.' } })));
    api.crear.mockReturnValue(of(guiaGuardada({ id_guia: 33, estado: 'enviado', acciones: { puede_editar: false, puede_validar: false, puede_emitir: false, puede_consultar: true, puede_anular: false } })));
    const abiertas: number[] = [];
    componente.abrir.subscribe((id) => abiertas.push(id));

    await componente.emitirASunat();
    const clave = ultimoCuerpo(api.crearYEmitir).clave_idempotencia;
    expect(ultimoCuerpo(api.crear).clave_idempotencia).toBe(clave);
    expect(abiertas).toEqual([33]);
    expect(alerta.errorHttp).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }), 'No se pudo emitir la guía a SUNAT');
  });

  it('un tope rebasado por otra guía (409) marca la línea con lo que queda; un 503 va al modal y relee el modo', async () => {
    await crear({ idVenta: 7 });
    completarTransportePrivado();
    api.crear.mockReturnValue(
      throwError(() => ({
        status: 409,
        error: {
          codigo: 'GRE_CANTIDAD_EXCEDE_VENTA',
          message: 'Las cantidades superan lo pendiente de guía en la venta 7.',
          detalle: [{ id_producto: 3, descripcion: 'Cemento 42.5 kg', cantidad_vendida: 10, cantidad_en_guias: 8, cantidad_solicitada: 6, cantidad_pendiente: 2 }],
        },
      })),
    );
    componente.guardarBorrador();
    const cemento = componente.f.items[0];
    expect(cemento.tope).toBe(2);
    expect(componente.errorItem(cemento, 'cantidad')).toContain('solo queda pendiente 2');
    expect(componente.paso).toBe('bienes');

    cemento.cantidad = 2;
    api.crearYEmitir.mockReturnValue(
      throwError(() => ({ status: 503, error: { codigo: 'GRE_DESACTIVADA', message: 'La guía electrónica está desactivada.' } })),
    );
    await componente.emitirASunat();
    expect(alerta.errorHttp).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }), 'No se pudo emitir la guía a SUNAT');
    expect(api.modo).toHaveBeenLastCalledWith(true);
  });

  describe('escaneo en el buscador de bienes', () => {
    const cemento = { id_producto: 3, nombre: 'Cemento 42.5 kg', sku: 'CEM-01', codigo_barras: '7501234567890', unidad_medida: 'NIU' } as any;
    const enter = () => ({ preventDefault: vi.fn() }) as unknown as Event;

    function escanear(texto: string): Event {
      componente.busquedaProducto = texto;
      const evento = enter();
      componente.alEnterBuscarProducto(evento);
      return evento;
    }

    it('un código leído agrega la línea, vacía el campo y no envía el formulario', async () => {
      ventasApi.resolverCodigo.mockReturnValue(of({ estado: 'ok', producto: cemento }));
      await crear();

      const evento = escanear('7501234567890');

      expect(evento.preventDefault).toHaveBeenCalled();
      expect(ventasApi.resolverCodigo).toHaveBeenCalledWith('7501234567890');
      expect(componente.f.items.map((i) => [i.id_producto, i.descripcion, i.cantidad])).toEqual([[3, 'Cemento 42.5 kg', 1]]);
      expect(componente.busquedaProducto).toBe('');

      // Repetirlo avisa «ya está en la guía» y no duplica la línea.
      escanear('7501234567890');
      expect(componente.f.items).toHaveLength(1);
      expect(avisos.advertencia).toHaveBeenCalledWith('Ese producto ya está en la guía', expect.anything());
    });

    it('un código inexistente avisa y no agrega', async () => {
      ventasApi.resolverCodigo.mockReturnValue(of({ estado: 'no_existe' }));
      await crear();

      escanear('000111222');

      expect(componente.f.items).toHaveLength(0);
      expect(avisos.advertencia).toHaveBeenCalledWith('No hay producto con el código 000111222');
    });

    it('un nombre no llama al servicio; con un único resultado lo agrega, y con varios no hace nada', async () => {
      await crear();

      componente.productosEncontrados = [cemento, { ...cemento, id_producto: 4 }];
      escanear('cemento');
      expect(componente.f.items).toHaveLength(0);

      componente.productosEncontrados = [cemento];
      escanear('cemento');
      expect(componente.f.items.map((i) => i.id_producto)).toEqual([3]);
      expect(ventasApi.resolverCodigo).not.toHaveBeenCalled();
    });
  });
});
