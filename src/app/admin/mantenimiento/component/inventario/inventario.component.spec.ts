import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { InventarioComponent } from './inventario.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { InventarioAdminService } from '../../../service/inventario-admin.service';
import { ProductoImagenService } from '../../../service/producto-imagen.service';

/**
 * Inventario se pagina en el servidor: sus filtros viajan en la URL (enlace compartible, F5) y el
 * CSV es solo el de la página que se ve.
 */
describe('InventarioComponent · URL y CSV', () => {
  const fila = (i: number) => ({
    id_inventario: i, id_producto: i, producto: `Producto ${i}`, sku: `SKU-${i}`, codigo_barras: '', unidad_medida: 'NIU',
    categoria: 'Ferretería', id_almacen: 1, almacen: 'Principal', sucursal: 'Lurín', stock: i, stock_minimo: 2,
    precio_compra: 1, precio_venta: 2, valorizado: i, estado: 'ok', imagen_url: '',
  });
  const servicio = {
    listar: vi.fn((filtro: any) => of({ datos: [fila(1), fila(2), fila(3)], total: 120, pagina: filtro.pagina ?? 1, por_pagina: 50 })),
    resumen: vi.fn(() => of({ productos: 120, sin_stock: 1, bajo_stock: 2, valorizado: 0, unidades: 0 })),
    almacenes: vi.fn(() => of([{ id_almacen: 1, nombre: 'Principal', sucursal: 'Lurín' }])),
  };
  const alerta = { toast: vi.fn(), error: vi.fn(), confirm: vi.fn() };
  let router: Router;

  async function montar(url = '/inventario') {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [InventarioComponent],
      providers: [
        provideRouter([{ path: 'inventario', component: InventarioComponent }]),
        { provide: InventarioAdminService, useValue: servicio },
        { provide: ProductoImagenService, useValue: {} },
        { provide: AlertService, useValue: alerta },
      ],
    })
      .overrideComponent(InventarioComponent, { set: { template: '' } })
      .compileComponents();
    router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    const fixture = TestBed.createComponent(InventarioComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('entra con los filtros de la URL ya aplicados en la primera carga', async () => {
    const c = await montar('/inventario?q=clavo&almacen=1&alertas=1&pagina=3');
    expect(servicio.listar).toHaveBeenCalledTimes(1);
    expect(servicio.listar).toHaveBeenCalledWith(expect.objectContaining({
      texto: 'clavo', id_almacen: 1, solo_alertas: true, pagina: 3,
    }));
    expect(c.filtro.texto).toBe('clavo');
  });

  it('al cambiar de página o de filtros los deja en la URL, y la ruta limpia los quita', async () => {
    const c = await montar();
    c.irA(2);
    await vi.waitFor(() => expect(router.url).toContain('pagina=2'));

    c.alternarAlertas();
    await vi.waitFor(() => expect(router.url).toContain('alertas=1'));
    expect(router.url).not.toContain('pagina='); // alternar alertas vuelve a la página 1

    servicio.listar.mockClear();
    await router.navigateByUrl('/inventario');
    await vi.waitFor(() => expect(servicio.listar).toHaveBeenCalledTimes(1));
    expect(c.filtro.solo_alertas).toBe(false);
    expect(servicio.listar).toHaveBeenCalledWith(expect.objectContaining({ solo_alertas: false, pagina: 1 }));
  });

  it('el CSV es el de la página actual y lo dice en el nombre y en el aviso', async () => {
    const c = await montar('/inventario?pagina=2');
    let blob: Blob | null = null;
    let nombre = '';
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b as Blob; return 'blob:x'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { nombre = this.download; });

    c.exportarCsv();

    expect(nombre).toMatch(/^inventario-pagina-2-\d{4}-\d{2}-\d{2}\.csv$/);
    expect((await blob!.text()).split('\r\n').filter(Boolean)).toHaveLength(4);
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'CSV descargado: 3 filas', message: 'Es la página que se ve.' }));
    vi.restoreAllMocks();
  });
});
