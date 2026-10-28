import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';

import { AlertService } from '../../../../shared/services/alert.service';
import { SonidoCajaService } from '../../../../shared/services/sonido-caja.service';
import { ConfiguracionFiscalService } from '../../../service/configuracion-fiscal.service';
import { CotizacionService } from '../../../service/cotizacion.service';
import { PuntoVentaService } from '../../../service/punto-venta.service';
import { ReceptorService } from '../../../service/receptor.service';
import { ProductoVenta } from '../../../models/admin.models';
import { CotizacionesComponent } from './cotizaciones.component';

const CUENTA_BCP = {
  id_cuenta: 1,
  banco: 'BCP',
  tipo_cuenta: 'corriente',
  numero_cuenta: '19479681930096',
  cci: '00219417196819300969',
  es_yape: false,
};

describe('CotizacionesComponent (vista previa de la proforma)', () => {
  let fixture: ComponentFixture<CotizacionesComponent>;
  let component: CotizacionesComponent;

  /** Monta el componente en modo «nueva» con las cuentas bancarias que devuelva el servicio. */
  async function montar(cuentas$: Observable<any[]> = of([])): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [CotizacionesComponent],
      providers: [
        provideRouter([]),
        { provide: SonidoCajaService, useValue: { ok: vi.fn(), error: vi.fn(), aviso: vi.fn(), activo: () => true, alternar: vi.fn() } },
        { provide: ReceptorService, useValue: {} },
        { provide: AlertService, useValue: { toast: vi.fn(), confirm: vi.fn(), error: vi.fn(), warning: vi.fn() } },
        { provide: CotizacionService, useValue: { listar: () => of([]) } },
        {
          provide: ConfiguracionFiscalService,
          useValue: { fiscal: () => of({ emisor: { ruc: '20610206337', razon_social: 'HATUNSALES S.A.C.', direccion: '', ubicacion: '', logo_url: '' } }) },
        },
        {
          provide: PuntoVentaService,
          useValue: {
            contextoPos: () => of({ almacenes: [{ id_almacen: 1, nombre: 'Almacén Principal' }], almacen_default: 1 }),
            catalogoVacio: false,
            cargarCatalogo: () => of([]),
            cuentasBancarias: () => cuentas$,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CotizacionesComponent);
    component = fixture.componentInstance;
    component.modo = 'nueva';
    fixture.detectChanges();
  }

  /** El componente es OnPush: tras cambiar propiedades a mano hay que avisarle antes de pintar. */
  function pintar(): void {
    (component as any).refrescar();
    fixture.detectChanges();
  }

  function ponerLinea(precioNeto: number, descuento: number, cantidad: number): void {
    component.lineas = [{
      id_producto: 1, descripcion: 'Cemento', sku: '', unidad_medida: 'NIU',
      cantidad, precio_unitario: precioNeto, descuento, stock_disponible: 10,
    }];
    pintar();
  }

  const texto = (selector: string): string =>
    (fixture.nativeElement.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('muestra las cabeceras en el orden de la referencia', async () => {
    await montar();
    ponerLinea(15, 0, 1);
    const cabeceras = Array.from(fixture.nativeElement.querySelectorAll('.cot-ticket__tabla--detalle thead th'))
      .map((th: any) => th.textContent.trim());
    expect(cabeceras).toEqual(['N°', 'Código', 'Unidad', 'P. Unit.', 'Cant.', 'Dto.', 'Descripción', 'Importe']);
    expect(texto('.cot-ticket')).toContain('Estado');
  });

  it('sin descuento la columna Dto. muestra S/ 0.00', async () => {
    await montar();
    ponerLinea(15, 0, 1);
    const celdas = Array.from(fixture.nativeElement.querySelectorAll('.cot-ticket__tabla--detalle tbody td'))
      .map((td: any) => td.textContent.replace(/\s+/g, ' ').trim());
    expect(celdas).toEqual(['1', '—', 'NIU', 'S/ 15.00', '1', 'S/ 0.00', 'Cemento', 'S/ 15.00']);
    expect(texto('.cot-ticket__pie')).not.toContain('Descuento aplicado');
  });

  it('con descuento 1.5 x 2 unidades muestra lista 20.00, dto. 3.00 e importe 37.00', async () => {
    await montar();
    ponerLinea(18.5, 1.5, 2);
    const celdas = Array.from(fixture.nativeElement.querySelectorAll('.cot-ticket__tabla--detalle tbody td'))
      .map((td: any) => td.textContent.replace(/\s+/g, ' ').trim());
    expect(celdas[3]).toBe('S/ 20.00');
    expect(celdas[5]).toBe('S/ 3.00');
    expect(celdas[7]).toBe('S/ 37.00');
    expect(component.descuentoTotal).toBe(3);
    expect(texto('.cot-ticket__totales')).toContain('Descuento aplicado');
  });

  it('el cuadro de totales trae Subtotal, Op. gravada, IGV y TOTAL', async () => {
    await montar();
    ponerLinea(59, 0, 1);
    const totales = texto('.cot-ticket__totales');
    expect(totales).toContain('Subtotal');
    expect(totales).toContain('Op. gravada');
    expect(totales).toContain('IGV (18%)');
    expect(totales).toContain('TOTAL');
    expect(totales).not.toContain('Descuento aplicado');
  });

  it('oculta el bloque de cuentas si el servicio falla', async () => {
    await montar(throwError(() => new Error('sin red')));
    ponerLinea(15, 0, 1);
    expect(fixture.nativeElement.querySelector('.cot-ticket__cuentas')).toBeNull();
  });

  it('muestra el bloque de cuentas cuando hay una cuenta con número', async () => {
    await montar(of([CUENTA_BCP]));
    ponerLinea(15, 0, 1);
    const bloque = texto('.cot-ticket__cuentas');
    expect(bloque).toContain('Cuentas para depósito o transferencia');
    expect(bloque).toContain('BCP');
    expect(bloque).toContain('19479681930096');
    expect(bloque).toContain('00219417196819300969');
  });

  it('unidadesTotales suma las cantidades de las líneas', async () => {
    await montar();
    component.lineas = [
      { id_producto: 1, descripcion: 'A', sku: '', cantidad: 2, precio_unitario: 10, stock_disponible: 0 },
      { id_producto: 2, descripcion: 'B', sku: '', cantidad: 3, precio_unitario: 5, stock_disponible: 0 },
    ];
    expect(component.unidadesTotales).toBe(5);
  });

  it('al agregar del catálogo guarda el precio neto (precio_final) y el descuento unitario', async () => {
    await montar();
    component.agregarProducto({
      id_producto: 7, nombre: 'Cemento', sku: 'CEM', unidad_medida: 'NIU',
      precio_venta: 20, descuento: 1.5, precio_final: 18.5, stock_disponible: 4,
    } as unknown as ProductoVenta);
    const linea = component.lineas[0];
    expect(linea.precio_unitario).toBe(18.5);
    expect(linea.descuento).toBe(1.5);
    expect(component.precioListaLinea(linea)).toBe(20);
  });
});
