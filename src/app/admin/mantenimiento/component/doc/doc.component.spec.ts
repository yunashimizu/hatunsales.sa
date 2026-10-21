import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ComprobanteService } from '../../../service/comprobante.service';
import { DocComponent } from './doc.component';

describe('DocComponent', () => {
  let component: DocComponent;
  let fixture: ComponentFixture<DocComponent>;
  let monitorAtencion: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    monitorAtencion = vi.fn(() => of({ pendientes: 0, errores: 0, total: 0 }));
    await TestBed.configureTestingModule({
      imports: [DocComponent],
      providers: [{
        provide: ComprobanteService,
        useValue: { monitorAtencion },
      }],
    }).compileComponents();

    fixture = TestBed.createComponent(DocComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('preserva los contadores y muestra el error si falla el monitor', () => {
    component.atencion = { pendientes: 2, errores: 1, total: 3 };
    monitorAtencion.mockReturnValue(
      throwError(() => ({ error: { message: 'Servicio no disponible' }, status: 503 })),
    );

    component.cargarMonitor();

    expect(component.atencion).toEqual({ pendientes: 2, errores: 1, total: 3 });
    expect(component.errorMonitor).toBe('Servicio no disponible');
  });

  it('permite recuperar el monitor mediante reintento', () => {
    monitorAtencion
      .mockReturnValueOnce(throwError(() => new Error('fallo temporal')))
      .mockReturnValueOnce(of({ pendientes: 4, errores: 2, total: 6 }));

    component.cargarMonitor();
    expect(component.errorMonitor).toBeTruthy();

    component.cargarMonitor();

    expect(component.atencion).toEqual({ pendientes: 4, errores: 2, total: 6 });
    expect(component.errorMonitor).toBe('');
  });
});
