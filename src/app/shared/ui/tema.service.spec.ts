import { TestBed } from '@angular/core/testing';
import { TemaService } from './tema.service';

describe('TemaService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-tema');
    document.documentElement.removeAttribute('data-vt');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('arranca en claro cuando no hay preferencia ni elección guardada', () => {
    const tema = TestBed.inject(TemaService);
    expect(tema.tema()).toBe('claro');
    expect(tema.esOscuro()).toBe(false);
    expect(document.documentElement.getAttribute('data-tema')).toBe('claro');
  });

  it('respeta el tema que ya dejó el script de index.html', () => {
    document.documentElement.setAttribute('data-tema', 'oscuro');
    const tema = TestBed.inject(TemaService);
    expect(tema.tema()).toBe('oscuro');
    expect(tema.esOscuro()).toBe(true);
  });

  it('sin elección guardada sigue la preferencia del sistema', () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({
      matches: consulta.includes('prefers-color-scheme: dark'),
      media: consulta,
      addEventListener: () => undefined,
    }));
    const tema = TestBed.inject(TemaService);
    expect(tema.tema()).toBe('oscuro');
  });

  it('alternar cambia el atributo, la señal y recuerda la elección', () => {
    const tema = TestBed.inject(TemaService);
    tema.alternar();
    expect(tema.tema()).toBe('oscuro');
    expect(document.documentElement.getAttribute('data-tema')).toBe('oscuro');
    expect(localStorage.getItem('hs.tema')).toBe('oscuro');

    tema.alternar();
    expect(tema.tema()).toBe('claro');
    expect(localStorage.getItem('hs.tema')).toBe('claro');
  });

  it('fijar sin persistir (seguimiento del sistema) no guarda nada', () => {
    const tema = TestBed.inject(TemaService);
    tema.fijar('oscuro', false);
    expect(document.documentElement.getAttribute('data-tema')).toBe('oscuro');
    expect(localStorage.getItem('hs.tema')).toBeNull();
  });
});
