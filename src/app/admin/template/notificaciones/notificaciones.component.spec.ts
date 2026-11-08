import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AvisoPanel, AvisosPanelService } from '../../service/avisos-panel.service';
import { NotificacionesComponent } from './notificaciones.component';

const aviso = (cambios: Partial<AvisoPanel>): AvisoPanel => ({
  clave: 'x',
  tono: 'aviso',
  icono: 'bi-box-seam',
  texto: 'Texto',
  valor: 1,
  ...cambios,
});

describe('NotificacionesComponent', () => {
  const items = signal<AvisoPanel[]>([]);
  const noVistos = signal(0);
  const sinLectura = signal(false);
  const refrescar = vi.fn();
  const marcarVistos = vi.fn();
  let fixture: ComponentFixture<NotificacionesComponent>;
  let componente: NotificacionesComponent;

  const el = (): HTMLElement => fixture.nativeElement;
  const boton = (): HTMLButtonElement => el().querySelector('.nt-boton') as HTMLButtonElement;
  const panel = (): HTMLElement | null => el().querySelector('.nt-panel');

  beforeEach(async () => {
    vi.useFakeTimers();
    items.set([]);
    noVistos.set(0);
    sinLectura.set(false);
    refrescar.mockClear();
    marcarVistos.mockClear();
    await TestBed.configureTestingModule({
      imports: [NotificacionesComponent],
      providers: [
        provideRouter([]),
        {
          provide: AvisosPanelService,
          useValue: {
            items,
            noVistos,
            sinLectura,
            hayPeligro: () => items().some((a) => a.tono === 'peligro'),
            actualizadoEn: () => new Date(),
            cargando: () => false,
            refrescar,
            marcarVistos,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NotificacionesComponent);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('muestra el contador de avisos sin ver («9+» desde diez), en rojo si hay uno grave', () => {
    expect(el().querySelector('.nt-contador')).toBeNull();
    expect(boton().getAttribute('aria-label')).toBe('Avisos: nada nuevo');

    noVistos.set(3);
    items.set([aviso({ clave: 'a' })]);
    fixture.detectChanges();
    expect(el().querySelector('.nt-contador')?.textContent?.trim()).toBe('3');
    expect(el().querySelector('.nt-contador--peligro')).toBeNull();
    expect(boton().getAttribute('aria-label')).toBe('Avisos: 3 sin ver');

    noVistos.set(12);
    items.set([aviso({ clave: 'a', tono: 'peligro' })]);
    fixture.detectChanges();
    expect(el().querySelector('.nt-contador')?.textContent?.trim()).toBe('9+');
    expect(el().querySelector('.nt-contador--peligro')).not.toBeNull();
  });

  it('al abrir lee de nuevo, lista los avisos con su acción y los da por vistos a los 1,5 s; vacío dice «Todo en orden»', () => {
    items.set([
      aviso({ clave: 'cpe-error', tono: 'peligro', texto: '2 comprobantes con error', detalle: 'Revísalos', ruta: '/dashboard/mantenimiento/doc', accion: 'Revisar' }),
      aviso({ clave: 'caja-cerrada', tono: 'info', texto: 'No has abierto caja' }),
    ]);
    noVistos.set(2);
    fixture.detectChanges();
    expect(panel()).toBeNull();

    boton().click();
    fixture.detectChanges();
    expect(boton().getAttribute('aria-expanded')).toBe('true');
    expect(refrescar).toHaveBeenCalledTimes(1);
    expect(panel()).not.toBeNull();
    const filas = el().querySelectorAll('.nt-fila');
    expect(filas.length).toBe(2);
    expect(filas[0].textContent).toContain('2 comprobantes con error');
    expect(filas[0].querySelector('a.nt-accion')?.getAttribute('href')).toBe('/dashboard/mantenimiento/doc');
    expect(filas[1].querySelector('a')).toBeNull();

    expect(marcarVistos).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(marcarVistos).toHaveBeenCalledTimes(1);

    items.set([]);
    fixture.detectChanges();
    expect(el().querySelector('.nt-vacio')?.textContent).toContain('Todo en orden');
    sinLectura.set(true);
    fixture.detectChanges();
    expect(el().querySelector('.nt-vacio')?.textContent).toContain('No se pudo revisar');
  });

  it('Esc cierra el panel y devuelve el foco al botón; abrir avisa a la barra y un clic fuera también cierra', () => {
    const alAbrir = vi.fn();
    componente.alAbrir.subscribe(alAbrir);
    document.body.appendChild(fixture.nativeElement);

    boton().click();
    fixture.detectChanges();
    expect(alAbrir).toHaveBeenCalledTimes(1);
    expect(panel()).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(boton());

    // Si se cierra antes de 1,5 s, no se marca nada como visto
    marcarVistos.mockClear();
    boton().click();
    fixture.detectChanges();
    document.body.click();
    fixture.detectChanges();
    expect(panel()).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(marcarVistos).not.toHaveBeenCalled();
    fixture.nativeElement.remove();
  });
});
