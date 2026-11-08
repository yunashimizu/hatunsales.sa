import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { EstadoPedido, Pedido } from '../../models/tienda.models';
import { PedidoService } from '../../service/pedido.service';
import { PedidoDetalleComponent } from './pedido-detalle.component';

function pedido(estado: EstadoPedido, extra: Partial<Pedido> = {}): Pedido {
  return {
    id_pedido: 57,
    codigo: 'PED-20261021-0057',
    estado,
    subtotal: 42.37,
    igv: 7.63,
    descuento: 0,
    costo_envio: 0,
    total: 50,
    metodo_pago: 'Transferencia bancaria',
    cantidad_items: 5,
    items: [],
    historial: [{ estado: 'pendiente', fecha: '2026-10-21T20:00:00Z' }],
    creado_en: '2026-10-21T20:00:00Z',
    ...extra,
  };
}

describe('PedidoDetalleComponent', () => {
  const servicio = { descargarComprobante: vi.fn() };

  async function montar(estado: EstadoPedido, extra: Partial<Pedido> = {}): Promise<ComponentFixture<PedidoDetalleComponent>> {
    await TestBed.configureTestingModule({
      imports: [PedidoDetalleComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '57' })) } },
        { provide: PedidoService, useValue: { detalle: () => of(pedido(estado, extra)), indicePaso: () => 0, cancelar: vi.fn(), descargarComprobante: servicio.descargarComprobante } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PedidoDetalleComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function texto(fixture: ComponentFixture<PedidoDetalleComponent>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('un pedido pagado no se cancela en línea: indica cómo pedir la devolución (E11)', async () => {
    const fixture = await montar('pagado');

    expect(fixture.componentInstance.puedeCancelar).toBe(false);
    expect(texto(fixture)).not.toContain('Cancelar pedido');
    expect(texto(fixture)).toContain('Tu pago ya fue confirmado');
  });

  it('un pedido pendiente se puede cancelar y avisa que el pago está por validarse (E01)', async () => {
    const fixture = await montar('pendiente');

    expect(fixture.componentInstance.puedeCancelar).toBe(true);
    expect(texto(fixture)).toContain('Cancelar pedido');
    expect(texto(fixture)).toContain('Estamos validando tu pago');
  });

  describe('descarga del comprobante (S5)', () => {
    const conComprobante = { tipo_comprobante: 'boleta', comprobante: { estado: 'aceptado' as const, id_comprobante: 41, numero_formateado: 'B001-123', tipo: 'boleta' as const, puede_descargar: true } };
    const boton = (f: ComponentFixture<PedidoDetalleComponent>) =>
      (f.nativeElement as HTMLElement).querySelector('[data-prueba="descarga-comprobante"] button') as HTMLButtonElement | null;

    beforeEach(() => servicio.descargarComprobante.mockReset());

    it('con comprobante descargable ofrece «Descargar boleta» y baja el PDF del pedido', async () => {
      servicio.descargarComprobante.mockReturnValue(of(new Blob(['pdf'], { type: 'application/pdf' })));
      const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      const fixture = await montar('pagado', conComprobante);

      expect(boton(fixture)?.textContent).toContain('Descargar boleta');
      boton(fixture)!.click();

      expect(servicio.descargarComprobante).toHaveBeenCalledWith(57);
      expect(clic).toHaveBeenCalled();
      clic.mockRestore();
    });

    it('una factura dice «Descargar factura»', async () => {
      const fixture = await montar('pagado', { ...conComprobante, tipo_comprobante: 'factura', comprobante: { ...conComprobante.comprobante, tipo: 'factura' } });
      expect(boton(fixture)?.textContent).toContain('Descargar factura');
    });

    it('sin comprobante (o no descargable) no hay botón', async () => {
      expect(boton(await montar('pagado'))).toBeNull();
      TestBed.resetTestingModule();
      const f = await montar('pagado', { comprobante: { estado: 'rechazado', puede_descargar: false } });
      expect(boton(f)).toBeNull();
    });

    it('si la descarga falla avisa con un texto llano y no deja el botón bloqueado', async () => {
      servicio.descargarComprobante.mockReturnValue(throwError(() => new Error('500')));
      const fixture = await montar('pagado', conComprobante);
      const toast = vi.spyOn(fixture.componentInstance['alerta'], 'toast').mockImplementation(() => undefined as never);

      boton(fixture)!.click();

      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', title: expect.stringContaining('No pudimos descargar') }));
      expect(fixture.componentInstance.descargandoComprobante).toBe(false);
    });
  });
});
