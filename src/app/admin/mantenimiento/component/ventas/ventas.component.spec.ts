import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { ReceptorService } from '../../../service/receptor.service';
import { PuntoVentaService } from '../../../service/punto-venta.service';
import { CajaSesionService } from '../../../service/caja-sesion.service';
import { CotizacionService } from '../../../service/cotizacion.service';
import { ConfiguracionFiscalService } from '../../../service/configuracion-fiscal.service';
import { VentasComponent } from './ventas.component';

describe('VentasComponent', () => {
  let fixture: ComponentFixture<VentasComponent>;
  let component: VentasComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VentasComponent],
      providers: [
        provideRouter([]),
        { provide: ReceptorService, useValue: {} },
        { provide: PuntoVentaService, useValue: {
          buscarProductos: () => of([]),
          porCodigoBarras: () => of(null),
          tieneCatalogo: false,
          filtrarLocal: () => [],
          cargarCatalogo: () => of(null),
          preview: () => of(null),
          metodosPago: () => of([]),
          cuentasBancarias: () => of([]),
          pasarelaCaja: () => of(null),
          iniciarYape: () => of(null),
          verificarYape: () => of(null),
          lineaCredito: () => of(null),
          nuevaClaveIdempotencia: () => 'key',
          descontarStockLocal: () => undefined,
          tieneCatalogo: false,
        } },
        { provide: AlertService, useValue: {
          toast: () => undefined,
          confirm: async () => ({ isConfirmed: true }),
          error: async () => undefined,
          warning: () => undefined,
        } },
        { provide: CajaSesionService, useValue: {} },
        { provide: CotizacionService, useValue: {} },
        { provide: ConfiguracionFiscalService, useValue: {} },
        { provide: ActivatedRoute, useValue: { queryParamMap: of({ get: () => null }) } },
        { provide: Router, useValue: {} },
        { provide: AuthService, useValue: { puedeEditarCatalogo: () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VentasComponent);
    component = fixture.componentInstance;
  });

  it('dispara la búsqueda al enfocar cuando ya hay texto escrito', () => {
    component.textoProducto = 'caña de pescar';
    spyOn(component, 'alEscribirProducto');

    component.alEnfocarProducto();

    expect(component.alEscribirProducto).toHaveBeenCalledTimes(0);
    expect(component.textoProducto.trim()).toBe('caña de pescar');
  });

  it('no activa la búsqueda si el campo está vacío al enfocar', () => {
    component.textoProducto = '   ';
    spyOn(component, 'alEscribirProducto');

    component.alEnfocarProducto();

    expect(component.alEscribirProducto).not.toHaveBeenCalled();
  });
});
