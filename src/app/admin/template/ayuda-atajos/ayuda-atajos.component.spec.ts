import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AyudaAtajosComponent } from './ayuda-atajos.component';
import { AyudaAtajosService } from './ayuda-atajos.service';

describe('AyudaAtajosComponent', () => {
  let fixture: ComponentFixture<AyudaAtajosComponent>;
  let ayuda: AyudaAtajosService;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const modal = (): HTMLElement | null => el().querySelector('[role="dialog"]');

  async function refrescar(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Tecla enviada al documento, como si el foco estuviera en `destino`. */
  function pulsar(key: string, destino: HTMLElement = document.body, init: KeyboardEventInit = {}): KeyboardEvent {
    const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    destino.dispatchEvent(evento);
    return evento;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AyudaAtajosComponent] });
    fixture = TestBed.createComponent(AyudaAtajosComponent);
    ayuda = TestBed.inject(AyudaAtajosService);
    fixture.detectChanges();
  });

  it('no pinta nada hasta que se abre', () => {
    expect(modal()).toBeNull();
  });

  it('se abre con «?», muestra los tres grupos y pone el foco en el botón de cerrar', async () => {
    pulsar('?');
    await refrescar();
    expect(modal()).not.toBeNull();
    expect(modal()?.getAttribute('aria-modal')).toBe('true');
    expect(el().querySelector('#aya-titulo')?.textContent).toContain('Atajos de teclado');
    const grupos = Array.from(el().querySelectorAll('.aya-grupo__titulo')).map((n) => n.textContent?.trim());
    expect(grupos).toEqual(['Generales', 'Al vender', 'En los listados']);
    expect(el().textContent).toContain('F9');
    expect(document.activeElement).toBe(el().querySelector('button[aria-label="Cerrar la ayuda de atajos"]'));
  });

  it('no se abre con el foco en un campo de escritura', async () => {
    const campo = document.createElement('input');
    const area = document.createElement('textarea');
    const lista = document.createElement('select');
    document.body.append(campo, area, lista);
    for (const destino of [campo, area, lista]) pulsar('?', destino);
    await refrescar();
    expect(modal()).toBeNull();
    campo.remove();
    area.remove();
    lista.remove();
  });

  it('se cierra con Esc y devuelve el foco a donde estaba', async () => {
    const origen = document.createElement('button');
    document.body.append(origen);
    origen.focus();
    ayuda.abrir();
    await refrescar();
    expect(modal()).not.toBeNull();

    modal()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await refrescar();
    expect(modal()).toBeNull();
    expect(document.activeElement).toBe(origen);
    origen.remove();
  });
});
