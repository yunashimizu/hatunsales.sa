import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotificationService } from '../../services/notification.service';
import { ToastsComponent } from './toasts.component';

describe('ToastsComponent', () => {
  let avisos: NotificationService;
  let el: HTMLElement;
  let fixture: ComponentFixture<ToastsComponent>;

  beforeEach(async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    await TestBed.configureTestingModule({ imports: [ToastsComponent], providers: [provideRouter([])] }).compileComponents();
    avisos = TestBed.inject(NotificationService);
    fixture = TestBed.createComponent(ToastsComponent);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('tocar el cuerpo del aviso lo cierra', () => {
    avisos.error('Algo falló', { mensaje: 'Detalle del error' });
    expect(avisos.avisos()).toHaveLength(1);
    fixture.detectChanges();

    (el.querySelector('.nt-aviso__texto') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(avisos.avisos()).toHaveLength(0);
  });

  it('un botón dentro del aviso hace lo suyo y no lo cierra por el toque', () => {
    const accion = vi.fn();
    avisos.error('Sin conexión', { cerrable: true, accion: { etiqueta: 'Reintentar', alHacer: accion, cerrarAlHacer: false } });
    fixture.detectChanges();
    const li = el.querySelector('.nt-aviso') as HTMLElement | null;
    expect(li).not.toBeNull();
    const boton = li!.querySelector('.nt-aviso__accion') as HTMLElement;

    boton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(accion).toHaveBeenCalledTimes(1);
    expect(avisos.avisos()).toHaveLength(1);
  });
});
