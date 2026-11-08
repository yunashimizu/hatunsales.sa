import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { ProveedoresComponent } from './proveedores.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RecepcionService } from '../../../service/recepcion.service';

/** Proveedores: orden por columna, páginas en el navegador y CSV de la lista (R17d). */
describe('ProveedoresComponent · orden, páginas y CSV', () => {
  const lista = Array.from({ length: 30 }, (_, i) => ({
    id_proveedor: i + 1,
    nombre: `Proveedor ${String(30 - i).padStart(2, '0')}`,
    ruc: i % 5 === 0 ? '' : String(20100000000 + i),
    telefono: '999111222',
    email: `p${i}@mail.pe`,
    direccion: 'Av. Lima 123',
  }));
  const api = { listarProveedores: vi.fn(() => of(lista)) };
  const alerta = { toast: vi.fn(), error: vi.fn(), confirm: vi.fn() };

  async function montar() {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ProveedoresComponent],
      providers: [
        provideRouter([]),
        { provide: RecepcionService, useValue: api },
        { provide: AlertService, useValue: alerta },
        { provide: NotificationService, useValue: { error: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ProveedoresComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  const nombres = (raiz: HTMLElement) =>
    Array.from(raiz.querySelectorAll('tbody tr .adm-tabla__principal')).map((n) => n.textContent!.trim());

  it('ordena por nombre y por RUC (los vacíos siempre al final) y lo anuncia con aria-sort', async () => {
    const fixture = await montar();
    const raiz: HTMLElement = fixture.nativeElement;
    const c = fixture.componentInstance;
    expect(nombres(raiz)[0]).toBe('Proveedor 30');

    raiz.querySelector<HTMLButtonElement>('thead th:first-child button')!.click();
    fixture.detectChanges();
    expect(raiz.querySelector('thead th:first-child')!.getAttribute('aria-sort')).toBe('ascending');
    expect(nombres(raiz)[0]).toBe('Proveedor 01');

    c.ordenar('ruc');
    c.ordenar('ruc');
    expect(c.ariaSort('ruc')).toBe('descending');
    expect(c.proveedoresFiltrados[0].ruc).toBe('20100000029');
    expect(c.proveedoresFiltrados.at(-1)!.ruc).toBe('');
    expect(JSON.parse(sessionStorage.getItem('hs.orden.proveedores')!)).toEqual({ clave: 'ruc', dir: 'desc' });
  });

  it('muestra 25 por página con el pie y la búsqueda vuelve a la primera', async () => {
    const fixture = await montar();
    const raiz: HTMLElement = fixture.nativeElement;
    const c = fixture.componentInstance;
    expect(nombres(raiz)).toHaveLength(25);

    c.irAPagina(2);
    fixture.detectChanges();
    expect(nombres(raiz)).toHaveLength(5);
    expect(raiz.querySelector('.adm-paginacion')!.textContent).toContain('26–30');

    c.filtro = 'Proveedor 1';
    expect(c.pagina).toBe(1);
    expect(c.proveedoresFiltrados).toHaveLength(10);
  });

  it('exporta toda la lista filtrada con BOM y avisa el total', async () => {
    const fixture = await montar();
    const c = fixture.componentInstance;
    let blob: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b as Blob; return 'blob:x'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    c.exportarCsv();

    const bytes = new Uint8Array(await blob!.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect((await blob!.text()).split('\r\n').filter(Boolean)).toHaveLength(31);
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'CSV descargado: 30 filas' }));
    vi.restoreAllMocks();
  });
});
