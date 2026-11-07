import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../../auth/service/auth.service';
import { SECCIONES_MENU } from '../sidebar/sidebar.component';
import { BarraInferiorComponent } from './barra-inferior.component';

describe('BarraInferiorComponent', () => {
  let fixture: ComponentFixture<BarraInferiorComponent>;

  /** Crea la barra para un usuario con ese rol (la comprobación usa los roles de cada ítem del menú). */
  async function crear(rol: string) {
    await TestBed.configureTestingModule({
      imports: [BarraInferiorComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { puedeVer: (roles: string[]) => roles.includes(rol) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BarraInferiorComponent);
    fixture.detectChanges();
  }

  const etiquetas = () =>
    Array.from(fixture.nativeElement.querySelectorAll('.bn__item span') as NodeListOf<HTMLElement>).map((s) => s.textContent?.trim());

  it('un administrador ve las 5 entradas: Inicio, Vender, Documentos, Caja y Menú', async () => {
    await crear('admin');
    expect(etiquetas()).toEqual(['Inicio', 'Vender', 'Documentos', 'Caja', 'Menú']);
  });

  it('si el rol no puede ver Caja, la barra queda con 4 entradas', async () => {
    const caja = SECCIONES_MENU.flatMap((s) => s.items).find((i) => i.ruta === '/dashboard/mantenimiento/caja-sesion')!;
    const original = caja.roles;
    caja.roles = ['admin'];
    try {
      await crear('vendedor');
      expect(etiquetas()).toEqual(['Inicio', 'Vender', 'Documentos', 'Menú']);
    } finally {
      caja.roles = original;
    }
  });

  it('un rol de solo consulta ve Inicio y Menú', async () => {
    await crear('consulta');
    expect(etiquetas()).toEqual(['Inicio', 'Menú']);
  });

  it('«Menú» emite el evento para abrir el cajón', async () => {
    await crear('admin');
    let emitido = 0;
    fixture.componentInstance.menu.subscribe(() => emitido++);
    (fixture.nativeElement.querySelector('.bn__item--menu') as HTMLButtonElement).click();
    expect(emitido).toBe(1);
  });
});
