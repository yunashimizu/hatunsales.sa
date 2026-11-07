import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PedidoAdminService } from '../../service/pedido-admin.service';
import { Pedido } from '../../../store/models/tienda.models';
import { SECCIONES_MENU, SidebarComponent } from './sidebar.component';

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
});
