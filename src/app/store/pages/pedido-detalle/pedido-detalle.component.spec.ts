import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EstadoPedido, Pedido } from '../../models/tienda.models';
import { PedidoService } from '../../service/pedido.service';
import { PedidoDetalleComponent } from './pedido-detalle.component';

function pedido(estado: EstadoPedido): Pedido {
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
  };
}

describe('PedidoDetalleComponent', () => {
  async function montar(estado: EstadoPedido): Promise<ComponentFixture<PedidoDetalleComponent>> {
    await TestBed.configureTestingModule({
      imports: [PedidoDetalleComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '57' })) } },
        { provide: PedidoService, useValue: { detalle: () => of(pedido(estado)), indicePaso: () => 0, cancelar: vi.fn() } },
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
});
