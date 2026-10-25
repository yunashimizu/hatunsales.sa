import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { reiniciarObservacion } from './movimiento.util';
import { RevealDirective } from './reveal.directive';

@Component({
  selector: 'app-anfitrion-revelado',
  standalone: true,
  imports: [RevealDirective],
  template: `
    <div id="a" hsReveal="lista" [hsRevealRetraso]="120"></div>
    <div id="b" hsReveal></div>
  `,
})
class AnfitrionRevelado {}

type Entrada = { target: Element; isIntersecting: boolean; boundingClientRect: { bottom: number } };

describe('RevealDirective', () => {
  let aviso: ((entradas: Entrada[]) => void) | null = null;
  const observados: Element[] = [];

  class ObservadorFalso {
    constructor(cb: (entradas: Entrada[]) => void) {
      aviso = cb;
    }
    observe(el: Element): void {
      observados.push(el);
    }
    unobserve(): void {}
    disconnect(): void {}
  }

  function crear(): ComponentFixture<AnfitrionRevelado> {
    const fixture = TestBed.createComponent(AnfitrionRevelado);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    observados.length = 0;
    reiniciarObservacion();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marca el elemento como pendiente y lo revela al entrar en pantalla', () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: false, media: consulta }));
    vi.stubGlobal('IntersectionObserver', ObservadorFalso);
    const fixture = crear();
    const a = fixture.nativeElement.querySelector('#a') as HTMLElement;

    expect(a.getAttribute('data-rev')).toBe('');
    expect(a.getAttribute('data-rev-tipo')).toBe('lista');
    expect(a.style.getPropertyValue('--rev-retraso')).toBe('120ms');

    aviso?.([{ target: a, isIntersecting: true, boundingClientRect: { bottom: 300 } }]);
    expect(a.getAttribute('data-rev')).toBe('visto');
  });

  it('lo que ya quedó por encima de la ventana también se da por visto', () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: false, media: consulta }));
    vi.stubGlobal('IntersectionObserver', ObservadorFalso);
    const fixture = crear();
    const b = fixture.nativeElement.querySelector('#b') as HTMLElement;

    aviso?.([{ target: b, isIntersecting: false, boundingClientRect: { bottom: -40 } }]);
    expect(b.getAttribute('data-rev')).toBe('visto');
  });

  it('con movimiento reducido no oculta nada: el contenido se ve desde el primer momento', () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: consulta.includes('reduce'), media: consulta }));
    vi.stubGlobal('IntersectionObserver', ObservadorFalso);
    const fixture = crear();
    const a = fixture.nativeElement.querySelector('#a') as HTMLElement;

    expect(a.hasAttribute('data-rev')).toBe(false);
  });

  it('sin IntersectionObserver lo muestra de inmediato', () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: false, media: consulta }));
    vi.stubGlobal('IntersectionObserver', undefined);
    const fixture = crear();
    const a = fixture.nativeElement.querySelector('#a') as HTMLElement;

    expect(a.getAttribute('data-rev')).toBe('visto');
  });
});
