import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ClientesComponent } from './clientes.component';
import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { GestionService } from '../../service/gestion.service';
import { ReceptorService } from '../../../service/receptor.service';

/**
 * Eliminar clientes y empresas es solo de admin (la API responde 403 a vendedor y caja).
 * El botón no debe aparecer para quien no puede usarlo.
 */
describe('ClientesComponent · botón Eliminar según el rol', () => {
  const gestion = {
    getClientes: vi.fn(() => of([{ id_cliente: 7, nombre: 'Rosa', nombre_completo: 'Rosa Quispe', dni: 44556677 }])),
    eliminarCliente: vi.fn(() => of({})),
  };
  const receptor = {
    empresas: vi.fn(() => of([{ id_empresa: 3, razon_social: 'ACME S.A.C.', ruc: '20123456789' }])),
    eliminarEmpresa: vi.fn(() => of({})),
  };
  const alerta = { toast: vi.fn(), error: vi.fn(), confirm: vi.fn(async () => ({ isConfirmed: true })) };

  async function montar(rolNombre: string, rolId: number) {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ClientesComponent],
      providers: [
        { provide: GestionService, useValue: gestion },
        { provide: ReceptorService, useValue: receptor },
        { provide: AlertService, useValue: alerta },
        { provide: AuthService, useValue: { getSesion: () => ({ rolNombre, rolId }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ClientesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  /** El componente es OnPush: tras cambiar de pestaña se marca su vista antes de detectar. */
  function verEmpresas(fixture: ComponentFixture<ClientesComponent>) {
    fixture.componentInstance.cambiarPestania('empresas');
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  }

  const botones = (raiz: HTMLElement, prefijo: string) =>
    Array.from(raiz.querySelectorAll<HTMLButtonElement>('button[aria-label]')).filter((b) =>
      (b.getAttribute('aria-label') ?? '').startsWith(prefijo),
    );

  it('vendedor y caja no ven "Eliminar" (ni de personas ni de empresas) pero sí "Editar"', async () => {
    for (const [rol, id] of [['vendedor', 3], ['caja', 4]] as const) {
      TestBed.resetTestingModule();
      const fixture = await montar(rol, id);
      const raiz: HTMLElement = fixture.nativeElement;
      expect(botones(raiz, 'Eliminar a ')).toHaveLength(0);
      expect(botones(raiz, 'Editar a ')).toHaveLength(1);

      verEmpresas(fixture);
      expect(botones(raiz, 'Eliminar ACME')).toHaveLength(0);
      expect(botones(raiz, 'Editar ACME')).toHaveLength(1);
    }
  });

  it('admin ve "Eliminar" en personas y empresas', async () => {
    const fixture = await montar('admin', 1);
    const raiz: HTMLElement = fixture.nativeElement;
    expect(botones(raiz, 'Eliminar a Rosa Quispe')).toHaveLength(1);

    verEmpresas(fixture);
    expect(botones(raiz, 'Eliminar ACME')).toHaveLength(1);
  });

  it('sin rol de admin, eliminar no pide confirmación ni llama a la API', async () => {
    const fixture = await montar('vendedor', 3);

    await fixture.componentInstance.eliminarPersona({ id_cliente: 7 });
    await fixture.componentInstance.eliminarEmpresa({ id_empresa: 3 });

    expect(alerta.confirm).not.toHaveBeenCalled();
    expect(gestion.eliminarCliente).not.toHaveBeenCalled();
    expect(receptor.eliminarEmpresa).not.toHaveBeenCalled();
  });
});

/** Padrón: orden por columna, páginas en el navegador y CSV de la pestaña (R17d). */
describe('ClientesComponent · orden, páginas y CSV', () => {
  const personas = Array.from({ length: 40 }, (_, i) => ({
    id_cliente: i + 1,
    nombre: `Cliente ${String(40 - i).padStart(2, '0')}`,
    nombre_completo: `Cliente ${String(40 - i).padStart(2, '0')}`,
    dni: 40000000 + i,
    email: i % 2 ? `c${i}@correo.pe` : '',
    telefono: i % 3 ? `99900${i}` : '',
  }));
  const gestion = { getClientes: vi.fn(() => of(personas)) };
  const receptor = {
    empresas: vi.fn(() => of([
      { id_empresa: 1, razon_social: 'Zeta S.A.C.', ruc: '20100000002', estado: 'ACTIVO' },
      { id_empresa: 2, razon_social: 'Alfa S.A.C.', ruc: '20100000001', estado: 'BAJA' },
    ])),
  };
  const alerta = { toast: vi.fn(), error: vi.fn(), confirm: vi.fn() };

  async function montar() {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ClientesComponent],
      providers: [
        { provide: GestionService, useValue: gestion },
        { provide: ReceptorService, useValue: receptor },
        { provide: AlertService, useValue: alerta },
        { provide: AuthService, useValue: { getSesion: () => ({ rolNombre: 'admin', rolId: 1 }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ClientesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  const nombres = (raiz: HTMLElement) =>
    Array.from(raiz.querySelectorAll('tbody tr .adm-tabla__principal')).map((n) => n.textContent!.trim());

  it('ordena por la cabecera, marca aria-sort y vuelve a la primera página', async () => {
    const fixture = await montar();
    const raiz: HTMLElement = fixture.nativeElement;
    const c = fixture.componentInstance;
    expect(nombres(raiz)[0]).toBe('Cliente 40'); // tal como llega

    c.irAPagina(2);
    raiz.querySelector<HTMLButtonElement>('thead th:first-child button')!.click();
    fixture.detectChanges();

    expect(c.pagina).toBe(1);
    expect(raiz.querySelector('thead th:first-child')!.getAttribute('aria-sort')).toBe('ascending');
    expect(nombres(raiz)[0]).toBe('Cliente 01');
    expect(JSON.parse(sessionStorage.getItem('hs.orden.clientes-personas')!).clave).toBe('nombre');
  });

  it('muestra 25 filas por página con el pie «1–25 de 40» y pasa a la siguiente', async () => {
    const fixture = await montar();
    const raiz: HTMLElement = fixture.nativeElement;
    expect(nombres(raiz)).toHaveLength(25);
    expect(raiz.querySelector('.adm-paginacion')!.textContent).toContain('1–25');

    Array.from(raiz.querySelectorAll<HTMLButtonElement>('.adm-paginacion__botones button')).pop()!.click();
    fixture.detectChanges();
    expect(nombres(raiz)).toHaveLength(15);
    expect(raiz.querySelector('.adm-paginacion')!.textContent).toContain('26–40');
  });

  it('exporta la pestaña completa (40 personas, no las 25 de la página) y cambia a empresas', async () => {
    const fixture = await montar();
    const c = fixture.componentInstance;
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blobs.push(b as Blob); return 'blob:x'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    c.exportarCsv();
    expect((await blobs[0].text()).split('\r\n').filter(Boolean)).toHaveLength(41);
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'CSV descargado: 40 filas' }));

    c.cambiarPestania('empresas');
    c.ordenar('nombre');
    expect(c.empresasFiltradas.map((e) => e.razon_social)).toEqual(['Alfa S.A.C.', 'Zeta S.A.C.']);
    c.exportarCsv();
    expect(await blobs[1].text()).toContain('"Razón social","Nombre comercial","RUC"');
    vi.restoreAllMocks();
  });
});
