import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CountUpDirective } from './count-up.directive';

@Component({
  selector: 'app-anfitrion-cuenta',
  standalone: true,
  imports: [CountUpDirective],
  template: `<span id="n" [hsCountUp]="valor" [hsDecimales]="decimales" hsPrefijo="S/ " hsSufijo="+"></span>`,
})
class AnfitrionCuenta {
  valor: number | null | undefined = 1234.5;
  decimales = 2;
}

describe('CountUpDirective', () => {
  function crear(): ComponentFixture<AnfitrionCuenta> {
    const fixture = TestBed.createComponent(AnfitrionCuenta);
    fixture.detectChanges();
    return fixture;
  }

  const texto = (f: ComponentFixture<AnfitrionCuenta>): string =>
    (f.nativeElement.querySelector('#n') as HTMLElement).textContent ?? '';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sin animación (movimiento no disponible) escribe la cifra final con el formato de «number»', () => {
    const fixture = crear();
    expect(texto(fixture)).toBe('S/ 1,234.50+');
  });

  it('con movimiento reducido escribe la cifra final sin esperar', () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: consulta.includes('reduce'), media: consulta }));
    const fixture = crear();
    expect(texto(fixture)).toBe('S/ 1,234.50+');
  });

  it('con valor nulo no toca el elemento (manda el «—» de la plantilla)', () => {
    const fixture = TestBed.createComponent(AnfitrionCuenta);
    fixture.componentInstance.valor = null;
    fixture.detectChanges();
    expect(texto(fixture)).toBe('');
  });

  it('si el valor cambia, muestra la nueva cifra', () => {
    const fixture = crear();
    fixture.componentInstance.valor = 99;
    fixture.componentInstance.decimales = 0;
    fixture.detectChanges();
    expect(texto(fixture)).toBe('S/ 99+');
  });
});
