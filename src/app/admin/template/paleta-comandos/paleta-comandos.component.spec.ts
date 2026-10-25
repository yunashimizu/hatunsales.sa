import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/service/auth.service';
import { PaletaComandosComponent } from './paleta-comandos.component';
import { PaletaComandosService } from './paleta-comandos.service';

describe('PaletaComandosComponent', () => {
  let fixture: ComponentFixture<PaletaComandosComponent>;
  let paleta: PaletaComandosService;
  let router: Router;
  let permitido: (roles: string[]) => boolean;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const etiquetas = (): string[] => Array.from(el().querySelectorAll('.pc__etiqueta')).map((n) => (n.textContent ?? '').trim());

  async function abrir(): Promise<void> {
    paleta.abrir();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function escribir(texto: string): void {
    const campo = el().querySelector('input') as HTMLInputElement;
    campo.value = texto;
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function tecla(key: string, opciones: KeyboardEventInit = {}): void {
    const caja = el().querySelector('.pc') as HTMLElement;
    caja.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opciones }));
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    permitido = () => true;
    TestBed.configureTestingModule({
      imports: [PaletaComandosComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { puedeVer: (roles: string[]) => permitido(roles) } },
      ],
    });
    fixture = TestBed.createComponent(PaletaComandosComponent);
    paleta = TestBed.inject(PaletaComandosService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  it('no pinta nada mientras está cerrada', () => {
    fixture.detectChanges();
    expect(el().querySelector('.pc')).toBeNull();
  });

  it('al abrir lista acciones y pantallas, con «Historial de ventas» bajo «Ventas»', async () => {
    await abrir();
    const t = etiquetas();
    expect(t).toContain('Nueva venta');
    expect(t).toContain('Dashboard');
    expect(t.indexOf('Historial de ventas')).toBe(t.indexOf('Ventas') + 1);
    expect(el().querySelector('input')?.getAttribute('role')).toBe('combobox');
  });

  it('filtra por nombre y por sinónimos sin distinguir tildes', async () => {
    await abrir();
    escribir('caja');
    expect(etiquetas()[0]).toBe('Caja');

    escribir('anteriores');
    expect(etiquetas()).toContain('Historial de ventas');

    escribir('configuracion');
    expect(etiquetas()[0]).toBe('Configuración');

    escribir('zzzz-no-existe');
    expect(el().querySelector('.pc__vacio')).not.toBeNull();
  });

  it('solo muestra las pantallas a las que el rol tiene acceso', async () => {
    permitido = (roles) => roles.includes('caja');
    await abrir();
    const t = etiquetas();
    expect(t).toContain('Caja');
    expect(t).not.toContain('Usuarios');
    expect(t).not.toContain('Facturación SUNAT');
  });

  it('las flechas mueven la selección y Enter navega y recuerda la pantalla', async () => {
    await abrir();
    escribir('stock');
    tecla('Enter');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/mantenimiento/stock');
    expect(JSON.parse(localStorage.getItem('hs.panel.recientes') ?? '[]')).toContain('/dashboard/mantenimiento/stock');
    expect(paleta.abierta()).toBe(false);

    await abrir();
    expect(etiquetas()[0]).toBe('Stock'); // «Recientes» va primero
  });

  it('Esc la cierra y Ctrl+K la abre y la cierra', async () => {
    await abrir();
    tecla('Escape');
    expect(paleta.abierta()).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    expect(paleta.abierta()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', metaKey: true, bubbles: true }));
    expect(paleta.abierta()).toBe(false);
  });
});
