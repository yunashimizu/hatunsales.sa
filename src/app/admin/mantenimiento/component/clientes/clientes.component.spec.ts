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
