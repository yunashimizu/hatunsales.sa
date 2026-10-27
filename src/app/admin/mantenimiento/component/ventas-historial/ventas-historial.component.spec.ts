import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';

import { AlertService } from '../../../../shared/services/alert.service';
import { TIPO_BOLETA, TIPO_FACTURA } from '../../../models/admin.models';
import { VentaDocumentosResponse, VentaHistorialFila } from '../../../models/documentos.models';
import { ComprobanteService } from '../../../service/comprobante.service';
import { VentasHistorialComponent, hoyEnLima, rangoDe } from './ventas-historial.component';

const FILA_FACTURA: VentaHistorialFila = {
  id_venta: 33,
  fecha: '2026-10-24T18:30:00-05:00',
  origen: 'mostrador',
  cliente_denominacion: 'ACME SAC',
  total: 118,
  cantidad_items: 3,
  estado: 'activa',
  metodos_pago: 'Efectivo, Tarjeta',
  comprobante: 'F001-00000012',
  comprobante_estado: 'emitido',
  id_comprobante: 12,
  comprobante_tipo: TIPO_FACTURA,
  comprobante_estado_sunat: 'ACEPTADO',
  cantidad_notas: 1,
  cantidad_guias: 0,
};

const FILA_SIN_COMPROBANTE: VentaHistorialFila = {
  id_venta: 34,
  fecha: '2026-10-24T19:00:00-05:00',
  origen: 'tienda',
  cliente_denominacion: 'JUAN PEREZ',
  total: 25,
  cantidad_items: 1,
  estado: 'activa',
  metodos_pago: '',
  comprobante_tipo: null,
  comprobante_estado_sunat: null,
  cantidad_notas: 0,
  cantidad_guias: 2,
};

const FILA_ANULADA: VentaHistorialFila = {
  id_venta: 35,
  fecha: '2026-10-23T10:00:00-05:00',
  origen: 'mostrador',
  cliente_denominacion: 'CLIENTES VARIOS',
  total: 40,
  cantidad_items: 2,
  estado: 'anulada',
  metodos_pago: 'Efectivo',
  comprobante_tipo: null,
  comprobante_estado_sunat: null,
  cantidad_notas: 0,
  cantidad_guias: 0,
};

function documentos(parcial: Partial<VentaDocumentosResponse> = {}): VentaDocumentosResponse {
  return {
    venta: {
      id: 33,
      fecha: '2026-10-24T18:30:00-05:00',
      total: 118,
      estado: 'activa',
      cliente: { nombre: 'ACME SAC', documento: '20100000001' },
      pagos: [
        { metodo: 'Efectivo', monto: 100 },
        { metodo: 'Tarjeta', monto: 18 },
      ],
      a_credito: false,
      saldo_cxc: 0,
    },
    comprobante: {
      id_comprobante: 12,
      id_tipo: TIPO_FACTURA,
      tipo_nombre: 'Factura electrónica',
      serie: 'F001',
      numero: 12,
      numero_formateado: 'F001-00000012',
      fecha_de_emision: '24/10/2026',
      total: 118,
      estado: 'emitido',
      anulado: false,
      estado_sunat: 'ACEPTADO',
      ambiente_fiscal: 'produccion',
      accion_sunat: null,
      mensaje: null,
      puede_reintentar: false,
      puede_recuperar_cdr: false,
      puede_confirmar_manual: false,
      puede_nota_credito: true,
      puede_anular: true,
    },
    comprobantes_anteriores: [],
    notas: [],
    guias: [],
    acciones: {
      emitir_comprobante: { permitido: false, motivo: 'La venta ya tiene comprobante.' },
      nota_credito: { permitido: true },
      guia: { permitido: true },
      anular: { permitido: true },
    },
    avisos: [],
    ...parcial,
  };
}

describe('VentasHistorialComponent', () => {
  let fixture: ComponentFixture<VentasHistorialComponent>;
  let component: VentasHistorialComponent;
  const pagina = (datos: VentaHistorialFila[], total = datos.length) => of({ datos, total, pagina: 1, por_pagina: 20 });
  const api = {
    historialVentas: vi.fn(),
    documentosDeVenta: vi.fn(),
    descargarPdf: vi.fn(),
  };

  function html(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function texto(): string {
    return html().textContent ?? '';
  }

  async function montar(): Promise<void> {
    fixture = TestBed.createComponent(VentasHistorialComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    api.historialVentas.mockImplementation(() => pagina([FILA_FACTURA, FILA_SIN_COMPROBANTE, FILA_ANULADA]));
    api.documentosDeVenta.mockImplementation(() => of(documentos()));
    await TestBed.configureTestingModule({
      imports: [VentasHistorialComponent],
      providers: [
        provideRouter([]),
        { provide: ComprobanteService, useValue: api },
        { provide: AlertService, useValue: { error: vi.fn(), toast: vi.fn() } },
      ],
    }).compileComponents();
  });

  it('lista las ventas con su comprobante, su estado y los contadores de notas y guías', async () => {
    await montar();
    expect(api.historialVentas).toHaveBeenCalledWith(expect.objectContaining({ pagina: 1, por_pagina: 20 }));
    const filas = html().querySelectorAll('tbody tr') as NodeListOf<HTMLElement>;
    expect(filas.length).toBe(3);

    expect(filas[0].textContent).toContain('#33');
    expect(filas[0].textContent).toContain('24/10/2026 18:30');
    expect(filas[0].textContent).toContain('ACME SAC');
    expect(filas[0].textContent).toContain('Efectivo, Tarjeta');
    expect(filas[0].textContent).toContain('F001-00000012');
    expect(filas[0].textContent).toContain('Factura');
    expect(filas[0].textContent).toContain('Aceptado por SUNAT');

    expect(filas[1].textContent).toContain('Sin comprobante');
    expect(filas[1].textContent).toContain('Tienda web');
    expect(filas[1].textContent).toContain('Sin pago registrado');

    expect(filas[2].textContent).toContain('Anulada');
    expect(filas[2].classList).toContain('vh-fila--anulada');
  });

  it('el resumen suma solo las ventas vigentes de la página y cuenta las que no tienen comprobante', async () => {
    await montar();
    expect(component.totalPagina).toBe(143);
    expect(component.anuladasPagina).toBe(1);
    expect(component.sinComprobantePagina).toBe(1);
    expect(texto()).toContain('S/ 143.00');
  });

  it('manda al servidor solo los filtros con valor y vuelve a la página 1', async () => {
    await montar();
    component.filtro = { texto: '  F001-12  ', estado: 'activa', tiene_comprobante: 'si', origen: '', desde: '2026-10-01', hasta: '2026-10-25' };
    component.cargar(1);
    expect(api.historialVentas).toHaveBeenLastCalledWith({
      texto: 'F001-12',
      estado: 'activa',
      tiene_comprobante: 'si',
      origen: '',
      desde: '2026-10-01',
      hasta: '2026-10-25',
      pagina: 1,
      por_pagina: 20,
    });
  });

  it('un rango de fechas imposible se avisa sin consultar al servidor', async () => {
    await montar();
    component.filtro = { ...component.filtro, desde: '2026-10-25', hasta: '2026-10-20' };
    component.cargar(1);
    fixture.detectChanges();
    expect(api.historialVentas).toHaveBeenCalledTimes(1);
    const aviso = html().querySelector('#vh-error-fechas') as HTMLElement;
    expect(aviso.getAttribute('role')).toBe('alert');
    expect(aviso.textContent).toContain('La fecha «desde» no puede ser posterior a «hasta».');
    expect(html().querySelectorAll('tbody tr').length).toBe(0);
  });

  it('un atajo de fechas aplica el rango y, al repetirlo, lo quita', async () => {
    await montar();
    component.elegirRango('hoy');
    const hoy = hoyEnLima();
    expect(component.filtro.desde).toBe(hoy);
    expect(component.filtro.hasta).toBe(hoy);
    expect(component.rangoActivo).toBe('hoy');
    expect(api.historialVentas).toHaveBeenLastCalledWith(expect.objectContaining({ desde: hoy, hasta: hoy }));

    component.elegirRango('hoy');
    expect(component.filtro.desde).toBe('');
    expect(component.rangoActivo).toBeNull();
  });

  it('muestra el error del servidor con la opción de reintentar', async () => {
    api.historialVentas.mockReturnValueOnce(
      throwError(() => ({ status: 500, error: { message: 'Ocurrió un error interno.', codigo: 'ERROR_SERVIDOR' } })),
    );
    await montar();
    const aviso = html().querySelector('[role="alert"]') as HTMLElement;
    expect(aviso.textContent).toContain('No se pudo cargar el historial de ventas');
    expect(component.filas.length).toBe(0);

    (aviso.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(html().querySelectorAll('tbody tr').length).toBe(3);
  });

  it('sin resultados con filtros ofrece limpiarlos', async () => {
    api.historialVentas.mockImplementation(() => pagina([]));
    await montar();
    component.filtro = { ...component.filtro, texto: 'nadie' };
    component.cargar(1);
    fixture.detectChanges();
    expect(texto()).toContain('Ninguna venta coincide con los filtros');
    component.limpiarFiltros();
    expect(component.conFiltros).toBe(false);
  });

  it('pagina el listado', async () => {
    api.historialVentas.mockImplementation(() => pagina([FILA_FACTURA], 45));
    await montar();
    expect(component.totalPaginas).toBe(3);
    component.irA(2);
    expect(api.historialVentas).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 2 }));
    component.irA(9);
    expect(api.historialVentas).toHaveBeenCalledTimes(2);
  });

  describe('detalle de la venta', () => {
    it('abre los documentos de la venta con el comprobante, los pagos y las acciones', async () => {
      await montar();
      component.abrirVenta(33);
      fixture.detectChanges();
      expect(api.documentosDeVenta).toHaveBeenCalledWith(33);
      const modal = html().querySelector('[role="dialog"]') as HTMLElement;
      expect(modal.textContent).toContain('Venta #33');
      expect(modal.textContent).toContain('ACME SAC');
      expect(modal.textContent).toContain('S/ 118.00');
      expect(modal.textContent).toContain('Efectivo: S/ 100.00');
      expect(modal.textContent).toContain('F001-00000012');
      expect(modal.textContent).toContain('PDF A4');
      expect(modal.textContent).toContain('Ticket');
      expect(modal.textContent).toContain('Nota de crédito');
      expect(modal.textContent).toContain('Crear guía de remisión');
    });

    it('si no se puede emitir la nota de crédito explica el motivo y no ofrece el botón', async () => {
      api.documentosDeVenta.mockImplementation(() =>
        of(
          documentos({
            acciones: {
              emitir_comprobante: { permitido: false },
              nota_credito: { permitido: false, motivo: 'El comprobante ya está anulado.' },
              guia: { permitido: false, motivo: 'La venta no tiene productos pendientes de guía.' },
              anular: { permitido: false },
            },
          }),
        ),
      );
      await montar();
      component.abrirVenta(33);
      fixture.detectChanges();
      const modal = html().querySelector('[role="dialog"]') as HTMLElement;
      expect(modal.textContent).toContain('El comprobante ya está anulado.');
      expect(modal.textContent).toContain('La venta no tiene productos pendientes de guía.');
      expect(Array.from(modal.querySelectorAll('button')).some((b) => b.textContent?.includes('Nota de crédito'))).toBe(false);
      expect(modal.textContent).not.toContain('Crear guía de remisión');
    });

    it('una venta sin comprobante ofrece emitirlo desde Documentos', async () => {
      api.documentosDeVenta.mockImplementation(() =>
        of(
          documentos({
            comprobante: null,
            acciones: {
              emitir_comprobante: { permitido: true },
              nota_credito: { permitido: false, motivo: 'La venta no tiene comprobante.' },
              guia: { permitido: false },
              anular: { permitido: true },
            },
            avisos: ['La emisión del comprobante quedó detenida.'],
          }),
        ),
      );
      await montar();
      component.abrirVenta(34);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const modal = html().querySelector('[role="dialog"]') as HTMLElement;
      expect(modal.textContent).toContain('no tiene factura ni boleta vigente');
      expect(modal.textContent).toContain('La emisión del comprobante quedó detenida.');
      const enlace = Array.from(modal.querySelectorAll('a')).find((a) => a.textContent?.includes('Emitir')) as HTMLAnchorElement;
      expect(enlace.getAttribute('href')).toBe('/dashboard/mantenimiento/doc?pestana=sin-comprobante');
    });

    it('lista las notas de crédito, las guías y los comprobantes anteriores', async () => {
      api.documentosDeVenta.mockImplementation(() =>
        of(
          documentos({
            comprobantes_anteriores: [
              {
                ...documentos().comprobante!,
                id_comprobante: 9,
                numero_formateado: 'B001-00000007',
                tipo_nombre: 'Boleta de venta electrónica',
                id_tipo: TIPO_BOLETA,
                anulado: true,
              },
            ],
            notas: [
              {
                id_comprobante: 20,
                serie: 'FC01',
                numero: 1,
                numero_formateado: 'FC01-00000001',
                motivo: '01',
                motivo_nombre: 'Anulación de la operación',
                total: 118,
                estado: 'emitido',
                anulado: false,
                estado_sunat: 'ACEPTADO',
                efecto: 'anular_venta',
                efectos_aplicados: true,
                doc_modificado: 'F001-00000012',
              },
            ],
            guias: [
              {
                id_guia: 5,
                serie: 'T001',
                numero: 3,
                numero_formateado: 'T001-00000003',
                estado: 'aceptado',
                estado_texto: 'Aceptada',
                fecha_emision: '2026-10-24',
                motivo: '01',
                motivo_nombre: 'Venta',
              },
            ],
          }),
        ),
      );
      await montar();
      component.abrirVenta(33);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const modal = html().querySelector('[role="dialog"]') as HTMLElement;
      expect(modal.textContent).toContain('B001-00000007');
      expect(modal.textContent).toContain('FC01-00000001');
      expect(modal.textContent).toContain('Anulación de la operación');
      expect(modal.textContent).toContain('T001-00000003');
      const guia = Array.from(modal.querySelectorAll('a')).find((a) => a.textContent?.includes('T001-00000003')) as HTMLAnchorElement;
      expect(guia.getAttribute('href')).toBe('/dashboard/mantenimiento/guias-remision?guia=5');
    });

    it('si la venta no existe lo dice en palabras y permite reintentar', async () => {
      api.documentosDeVenta.mockReturnValueOnce(
        throwError(() => ({ status: 404, error: { message: 'No existe la venta 999.', codigo: 'VENTA_NO_ENCONTRADA' } })),
      );
      await montar();
      component.abrirVenta(999);
      fixture.detectChanges();
      const modal = html().querySelector('[role="dialog"]') as HTMLElement;
      expect(modal.textContent).toContain('No existe la venta 999.');
      expect(modal.textContent).toContain('Reintentar');
    });

    it('descarga el PDF del comprobante en el formato pedido', async () => {
      api.descargarPdf.mockReturnValue(of(new Blob(['%PDF'])));
      const crear = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:prueba');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      await montar();
      component.descargarPdf(12, 'F001-00000012', 'ticket');
      expect(api.descargarPdf).toHaveBeenCalledWith(12, 'ticket');
      expect(crear).toHaveBeenCalled();
      expect(component.descargando).toBeNull();
    });

    it('Escape cierra el detalle', async () => {
      await montar();
      component.abrirVenta(33);
      fixture.detectChanges();
      const marco = html().querySelector('[role="dialog"]') as HTMLElement;
      marco.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(component.idVenta).toBeNull();
      expect(html().querySelector('[role="dialog"]')).toBeNull();
    });
  });

  describe('enlace ?venta=<id>', () => {
    it('abre el detalle de esa venta al llegar con el enlace', async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: 'ventas-historial', component: VentasHistorialComponent }]),
          { provide: ComprobanteService, useValue: api },
          { provide: AlertService, useValue: { error: vi.fn(), toast: vi.fn() } },
        ],
      }).compileComponents();
      const harness = await RouterTestingHarness.create();
      const instancia = await harness.navigateByUrl('/ventas-historial?venta=33', VentasHistorialComponent);
      harness.detectChanges();
      expect(instancia.idVenta).toBe(33);
      expect(api.documentosDeVenta).toHaveBeenCalledWith(33);
      expect((harness.routeNativeElement as HTMLElement).querySelector('[role="dialog"]')).not.toBeNull();
    });

    it('un enlace con un id inválido avisa y no abre nada', async () => {
      const aviso = vi.fn();
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: 'ventas-historial', component: VentasHistorialComponent }]),
          { provide: ComprobanteService, useValue: api },
          { provide: AlertService, useValue: { error: vi.fn(), toast: aviso } },
        ],
      }).compileComponents();
      const harness = await RouterTestingHarness.create();
      const instancia = await harness.navigateByUrl('/ventas-historial?venta=abc', VentasHistorialComponent);
      harness.detectChanges();
      expect(instancia.idVenta).toBeNull();
      expect(aviso).toHaveBeenCalledWith(expect.objectContaining({ title: 'Enlace no válido' }));
      expect(api.documentosDeVenta).not.toHaveBeenCalled();
    });
  });

  describe('exportar a CSV', () => {
    it('exporta la página con BOM, comillas escapadas y sin fórmulas ejecutables', async () => {
      let contenido: Blob | null = null;
      vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
        contenido = blob as Blob;
        return 'blob:csv';
      });
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      api.historialVentas.mockImplementation(() =>
        pagina([{ ...FILA_FACTURA, cliente_denominacion: '=HYPERLINK("http://x")' }, FILA_SIN_COMPROBANTE]),
      );
      await montar();
      component.exportarCsv();
      const blob = contenido as unknown as Blob;
      // Blob.text() quita el BOM al decodificar: se comprueba en los bytes.
      expect(Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
      const lineas = (await blob.text()).split('\r\n');
      expect(lineas[0]).toContain('"Venta","Fecha"');
      expect(lineas.length).toBe(3);
      expect(lineas[1]).toContain('"\'=HYPERLINK(""http://x"")"');
      expect(lineas[1]).toContain('"118.00"');
      expect(lineas[1]).toContain('"F001-00000012"');
    });
  });
});

describe('rangoDe', () => {
  it('calcula los atajos con días de Lima', () => {
    expect(rangoDe('hoy', '2026-10-25')).toEqual({ desde: '2026-10-25', hasta: '2026-10-25' });
    expect(rangoDe('ayer', '2026-10-01')).toEqual({ desde: '2026-09-30', hasta: '2026-09-30' });
    expect(rangoDe('7dias', '2026-10-25')).toEqual({ desde: '2026-10-19', hasta: '2026-10-25' });
    expect(rangoDe('mes', '2026-10-25')).toEqual({ desde: '2026-10-01', hasta: '2026-10-25' });
  });

  it('hoyEnLima usa la fecha de Lima, no la del navegador', () => {
    // 02:00 UTC del 26 todavía es 25 en Lima (UTC-5).
    expect(hoyEnLima(new Date('2026-10-26T02:00:00Z'))).toBe('2026-10-25');
    expect(hoyEnLima(new Date('2026-10-26T06:00:00Z'))).toBe('2026-10-26');
  });
});
