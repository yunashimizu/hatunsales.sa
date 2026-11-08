import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { EventosPanelService } from '../../service/eventos-panel.service';
import { PedidoAdminService } from '../../service/pedido-admin.service';
import { Pedido } from '../../../store/models/tienda.models';
import { SECCIONES_MENU, SidebarComponent } from './sidebar.component';

@Component({ template: '' })
class PaginaVacia {}

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('«Pedidos web» está en el grupo Hoy y su badge suma pendientes y pagados', () => {
    const hoy = SECCIONES_MENU.find((x) => x.titulo === 'Hoy')!;
    const item = hoy.items.find((i) => i.ruta === '/dashboard/mantenimiento/pedidos')!;
    expect(item).toBeTruthy();
    expect(item.badgeKey).toBe('pedidos_web');
    expect(item.roles).toEqual(expect.arrayContaining(['admin', 'vendedor', 'caja']));
    expect(item.roles).not.toContain('consulta');

    fixture.detectChanges();
    expect(component.badgeDe(item)).toBe(0);

    const p = (estado: string) => ({ estado }) as Pedido;
    TestBed.inject(PedidoAdminService).publicarDesde([p('pendiente'), p('pagado'), p('pagado'), p('entregado')]);
    expect(component.badgeDe(item)).toBe(3);
    expect(component.tonoBadge(item)).toBe('aviso');
    expect(component.tituloBadge(item)).toContain('1 por cobrar');
    expect(component.tituloBadge(item)).toContain('2 pagados');
  });

  it('marca con aria-current="page" solo el enlace de la pantalla actual', async () => {
    const router = TestBed.inject(Router);
    router.resetConfig([{ path: '**', component: PaginaVacia }]);
    await router.navigateByUrl('/dashboard/mantenimiento/productos');
    fixture.detectChanges();
    await new Promise<void>((resolver) => setTimeout(resolver, 0)); // RouterLinkActive se actualiza en un microtask
    fixture.detectChanges();

    const actuales = Array.from(fixture.nativeElement.querySelectorAll('a[aria-current="page"]')) as HTMLAnchorElement[];
    expect(actuales.length).toBe(1);
    expect(actuales[0].getAttribute('href')).toBe('/dashboard/mantenimiento/productos');
  });

  it('un pedido que cambia o una venta cobrada renuevan el número de «Pedidos web» al instante', () => {
    const leer = vi.spyOn(component as unknown as { cargarBadgePedidos(): void }, 'cargarBadgePedidos').mockImplementation(() => undefined);
    const invalidar = vi.spyOn(TestBed.inject(PedidoAdminService), 'invalidarResumen');
    fixture.detectChanges(); // ngOnInit: empieza a escuchar
    leer.mockClear();
    const bus = TestBed.inject(EventosPanelService);

    bus.emitir({ tipo: 'pedido-cambio' });
    expect(leer).toHaveBeenCalledTimes(1);
    bus.emitir({ tipo: 'venta-registrada' });
    expect(leer).toHaveBeenCalledTimes(2);
    expect(invalidar).toHaveBeenCalledTimes(2);

    // Lo que no afecta a los pedidos no hace nada.
    bus.emitir({ tipo: 'caja-cambio' });
    bus.emitir({ tipo: 'stock-cambio' });
    bus.emitir({ tipo: 'comprobante-actualizado' });
    expect(leer).toHaveBeenCalledTimes(2);
  });
});
