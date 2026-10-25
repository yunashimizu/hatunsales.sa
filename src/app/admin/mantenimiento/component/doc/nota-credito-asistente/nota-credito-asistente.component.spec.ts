import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { AuthService } from '../../../../../auth/service/auth.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { ContextoNotaCredito, NotaCreditoEmitida } from '../../../../models/documentos.models';
import { EstadoFiscalGlobal } from '../../../../models/fiscal.models';
import { ComprobanteService } from '../../../../service/comprobante.service';
import { FiscalEstadoService } from '../../../../service/fiscal-estado.service';
import { NotaCreditoAsistenteComponent, estimarDevolucion } from './nota-credito-asistente.component';

function contexto(cambios: Partial<ContextoNotaCredito> = {}): ContextoNotaCredito {
  return {
    permitido: true,
    origen: {
      id: 10,
      tipo: '01',
      serie: 'F001',
      numero: 12,
      numero_formateado: 'F001-00000012',
      fecha: '20-10-2026',
      cliente: { tipo_documento: 6, numero_documento: '20100000001', denominacion: 'ACME SAC' },
      moneda: 'PEN',
      total: 118,
      ambiente_fiscal: 'produccion',
      estado_sunat: 'ACEPTADO',
    },
    saldo: 118,
    items: [
      {
        id_item: 1, id_producto: 5, codigo: 'P5', descripcion: 'Martillo', unidad: 'NIU', tipo_de_igv: 1,
        cantidad_origen: 2, cantidad_acreditada: 0, cantidad_disponible: 2, precio_unitario: 50,
        descuento_unitario: 0, total_origen: 100, importe_disponible: 100, es_recargo: false,
      },
      {
        id_item: 2, id_producto: null, codigo: 'RECARGO-TARJETA', descripcion: 'RECARGO POR PAGO CON TARJETA', unidad: 'ZZ',
        tipo_de_igv: 1, cantidad_origen: 1, cantidad_acreditada: 0, cantidad_disponible: 1, precio_unitario: 18,
        descuento_unitario: 0, total_origen: 18, importe_disponible: 18, es_recargo: true,
      },
    ],
    motivos: [
      { codigo: '01', nombre: 'ANULACION DE LA OPERACION', forma: 'total', efecto: 'devolucion', reingresar_stock: true, aviso: null },
      { codigo: '05', nombre: 'DESCUENTO POR ITEM', forma: 'descuento_items', efecto: 'ninguno', reingresar_stock: null, aviso: null },
      { codigo: '07', nombre: 'DEVOLUCION POR ITEM', forma: 'items', efecto: 'devolucion', reingresar_stock: true, aviso: null },
      { codigo: '09', nombre: 'DISMINUCION EN EL VALOR', forma: 'monto', efecto: 'ninguno', reingresar_stock: null, aviso: null },
    ],
    notas_previas: [],
    venta: { id: 33, estado: 'activa', a_credito: true, saldo_cxc: 50, pagada_al_contado: true },
    avisos: ['La venta 33 debe S/ 50.00: cuando SUNAT acepte la nota, la deuda baja en el total de la nota (hasta ese saldo).'],
    ...cambios,
  };
}

describe('NotaCreditoAsistenteComponent', () => {
  let fixture: ComponentFixture<NotaCreditoAsistenteComponent>;
  let component: NotaCreditoAsistenteComponent;
  let estadoFiscal: ReturnType<typeof signal<EstadoFiscalGlobal | null>>;
  const api = {
    contextoNotaCredito: vi.fn((): Observable<ContextoNotaCredito> => of(contexto())),
    emitirNotaCredito: vi.fn(),
    descargarPdf: vi.fn(),
  };
  const alerta = { confirmar: vi.fn(async () => true), error: vi.fn(), toast: vi.fn() };

  async function crear(): Promise<void> {
    fixture = TestBed.createComponent(NotaCreditoAsistenteComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('idComprobante', 10);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function texto(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  /** Elige el motivo y pasa al detalle. */
  function aDetalle(codigo: string): void {
    const motivo = component.contexto!.motivos.find((m) => m.codigo === codigo)!;
    component.elegirMotivo(motivo);
    component.continuar();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    api.contextoNotaCredito.mockImplementation(() => of(contexto()));
    estadoFiscal = signal<EstadoFiscalGlobal | null>(null);
    await TestBed.configureTestingModule({
      imports: [NotaCreditoAsistenteComponent],
      providers: [
        provideRouter([]),
        { provide: ComprobanteService, useValue: api },
        { provide: AlertService, useValue: alerta },
        { provide: AuthService, useValue: { puedeVer: () => true } },
        { provide: FiscalEstadoService, useValue: { estado: estadoFiscal, iniciar: vi.fn() } },
      ],
    }).compileComponents();
  });

  it('ofrece solo los motivos que admite el backend, cada uno con su explicación', async () => {
    await crear();
    expect(api.contextoNotaCredito).toHaveBeenCalledWith(10);
    const opciones = fixture.nativeElement.querySelectorAll('.nca-motivo') as NodeListOf<HTMLElement>;
    expect(opciones.length).toBe(4);
    expect(texto()).toContain('DEVOLUCION POR ITEM');
    expect(texto()).toContain('indique cuántas unidades de cada uno');
    expect(texto()).not.toContain('DEVOLUCION TOTAL');
    // Avisos del backend (deuda de la venta) a la vista desde el primer paso.
    expect(texto()).toContain('La venta 33 debe S/ 50.00');
  });

  it('si el comprobante no admite nota explica por qué y no deja continuar', async () => {
    api.contextoNotaCredito.mockReturnValue(
      of(contexto({ permitido: false, motivo_no_permitido: 'La nota FC01-00000003 todavía se está enviando a SUNAT.', motivos: [] })),
    );
    await crear();
    expect(texto()).toContain('La nota FC01-00000003 todavía se está enviando a SUNAT.');
    expect(fixture.nativeElement.querySelectorAll('.nca-motivo').length).toBe(0);
    const botones = Array.from(fixture.nativeElement.querySelectorAll('.adm-modal__pie button') as NodeListOf<HTMLButtonElement>);
    expect(botones.map((b) => b.textContent?.trim())).toEqual(['Cerrar']);
  });

  it('aplica los topes de cada forma: unidades disponibles, descuento de la línea e importe del saldo', async () => {
    await crear();
    aDetalle('07');
    component.cantidades[1] = 3;
    component.recalcular();
    expect(component.erroresLinea[1]).toContain('Quedan 2 por devolver');
    expect(component.pendiente).not.toBe('');

    // Con el almacén, las unidades van enteras; sin reingreso se admite la fracción.
    component.cantidades[1] = 1.5;
    component.recalcular();
    expect(component.erroresLinea[1]).toContain('unidades completas');
    component.reingresarStock = false;
    component.recalcular();
    expect(component.erroresLinea[1]).toBeUndefined();

    // 1 de 2 martillos: 50.00 + 9.00 de recargo proporcional (igual que el backend).
    component.reingresarStock = true;
    component.cantidades[1] = 1;
    component.recalcular();
    expect(component.erroresLinea).toEqual({});
    expect(component.totalCentimos).toBe(5900);
    expect(estimarDevolucion(component.contexto!.items, { 1: 2 })).toBe(11800);

    aDetalle('05');
    component.descuentos[1] = 120;
    component.recalcular();
    expect(component.erroresLinea[1]).toContain('No puede superar S/ 100.00');

    aDetalle('09');
    component.monto = 200;
    component.recalcular();
    expect(component.errorMonto).toContain('saldo por acreditar');
    component.monto = 18.5;
    component.recalcular();
    expect(component.totalCentimos).toBe(1850);
  });

  it('exige el sustento de 3 a 250 caracteres y lo cuenta', async () => {
    await crear();
    aDetalle('09');
    component.monto = 10;
    component.recalcular();
    expect(component.pendiente).toContain('sustento');

    component.sustento = 'ab';
    expect(component.errorSustento).toContain('al menos 3');
    component.sustento = 'Ajuste de precio acordado';
    fixture.detectChanges();
    expect(component.pendiente).toBe('');
    expect(texto()).toContain(`${'Ajuste de precio acordado'.length}/250`);
  });

  it('emite a SUNAT una sola vez y muestra en el acto el resultado con los efectos aplicados', async () => {
    const envio = new Subject<NotaCreditoEmitida>();
    api.emitirNotaCredito.mockReturnValue(envio);
    const emitidas: NotaCreditoEmitida[] = [];
    await crear();
    component.emitida.subscribe((n) => emitidas.push(n));
    aDetalle('07');
    component.cantidades[1] = 1;
    component.sustento = 'Devolución de 1 martillo';
    component.recalcular();
    fixture.detectChanges();

    const primera = component.emitir();
    const segunda = component.emitir();
    await primera;
    await segunda;
    await component.emitir();
    fixture.detectChanges();
    expect(alerta.confirmar).toHaveBeenCalledTimes(1);
    expect(api.emitirNotaCredito).toHaveBeenCalledTimes(1);
    expect(api.emitirNotaCredito).toHaveBeenCalledWith(10, {
      motivo: '07',
      sustento: 'Devolución de 1 martillo',
      items: [{ id_item: 1, cantidad: 1 }],
      reingresar_stock: true,
    });
    const boton = Array.from(fixture.nativeElement.querySelectorAll('.adm-modal__pie button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Enviando a SUNAT'));
    expect(boton?.disabled).toBe(true);

    envio.next({
      id_comprobante: 80,
      numero_formateado: 'FC01-00000004',
      estado: 'emitido',
      estado_sunat: 'ACEPTADO',
      aceptada_sunat: true,
      ambiente_fiscal: 'produccion',
      efecto: 'devolucion',
      efectos_aplicados: true,
      avisos: ['Al aceptarse la nota, la deuda de la venta 33 baja S/ 50.00.'],
    });
    envio.complete();
    fixture.detectChanges();

    expect(component.paso).toBe('resultado');
    expect(emitidas.length).toBe(1);
    expect(texto()).toContain('Aceptado por SUNAT');
    expect(texto()).toContain('FC01-00000004');
    expect(texto()).toContain('Stock reingresado al almacén');
    expect(texto()).toContain('Cuenta por cobrar actualizada');
    expect(texto()).toContain('PDF A4');
  });

  it('muestra el 409 con la nota en curso (y deja abrirla) y el 503 sin migración en palabras', async () => {
    api.emitirNotaCredito.mockReturnValue(
      throwError(() => ({
        status: 409,
        error: {
          message: 'La nota FC01-00000003 de F001-00000012 todavía se está enviando a SUNAT: espere su resultado antes de emitir otra.',
          codigo: 'NOTA_CREDITO_EN_CURSO',
          id_comprobante: 77,
        },
      })),
    );
    await crear();
    const cierres: void[] = [];
    component.cerrado.subscribe(() => cierres.push(undefined));
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    aDetalle('09');
    component.monto = 10;
    component.sustento = 'Ajuste';
    component.recalcular();
    await component.emitir();
    fixture.detectChanges();

    const alertaError = fixture.nativeElement.querySelector('.nca-detalle [role="alert"]') as HTMLElement;
    expect(alertaError.textContent).toContain('FC01-00000003');
    const ver = Array.from(alertaError.querySelectorAll('button')).find((b) => b.textContent?.includes('Ver la nota en curso'))!;
    ver.click();
    expect(cierres.length).toBe(1);
    expect(navegar).toHaveBeenCalledWith(['/dashboard/mantenimiento/doc'], { queryParams: { comprobante: 77 } });

    api.contextoNotaCredito.mockReturnValue(
      throwError(() => ({
        status: 503,
        error: { message: 'Aplique sql/fase14_notas_credito_enlace.sql para habilitar las notas de crédito.', codigo: 'NOTA_CREDITO_MIGRACION_PENDIENTE' },
      })),
    );
    component.cargar();
    fixture.detectChanges();
    expect(texto()).toContain('todavía no están habilitadas en el servidor');
    expect(texto()).not.toContain('sql/fase14');
  });

  it('avisa antes de emitir que la emisión está detenida y no deja enviar', async () => {
    estadoFiscal.set({ emision_activa: false, motivo: 'Falta el certificado digital de producción.' } as EstadoFiscalGlobal);
    await crear();
    aDetalle('09');
    component.monto = 10;
    component.sustento = 'Ajuste de precio';
    component.recalcular();
    fixture.detectChanges();

    expect(texto()).toContain('Falta el certificado digital de producción.');
    expect(component.pendiente).toContain('no está activa');
    await component.emitir();
    expect(alerta.confirmar).not.toHaveBeenCalled();
    expect(api.emitirNotaCredito).not.toHaveBeenCalled();
  });
});
