import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { NotificationService } from './shared/services/notification.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('se crea', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('monta el router y la pila global de avisos con sus regiones vivas', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const raiz = fixture.nativeElement as HTMLElement;

    expect(raiz.querySelector('router-outlet')).not.toBeNull();
    expect(raiz.querySelector('app-toasts .nt-pila')).not.toBeNull();
    expect(raiz.querySelector('.nt-sr[role="status"][aria-live="polite"]')).not.toBeNull();
    expect(raiz.querySelector('.nt-sr[role="alert"][aria-live="assertive"]')).not.toBeNull();
  });

  it('pinta los avisos del servicio con texto seguro (sin HTML)', async () => {
    const fixture = TestBed.createComponent(App);
    const avisos = TestBed.inject(NotificationService);

    avisos.exito('<img src=x onerror=alert(1)>', { mensaje: 'Producto <b>creado</b>' });
    fixture.detectChanges();
    await fixture.whenStable();

    const aviso = (fixture.nativeElement as HTMLElement).querySelector('.nt-aviso');
    expect(aviso).not.toBeNull();
    expect(aviso?.querySelector('img')).toBeNull();
    expect(aviso?.querySelector('.nt-aviso__titulo')?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(aviso?.querySelector('.nt-aviso__texto')?.textContent).toContain('Producto <b>creado</b>');
  });
});
