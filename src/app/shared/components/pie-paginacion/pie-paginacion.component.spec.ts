import { TestBed } from '@angular/core/testing';

import { PiePaginacionComponent } from './pie-paginacion.component';
import { paginar } from '../../utils/paginacion-local';

describe('PiePaginacionComponent', () => {
  const montar = (total: number, pagina: number, porPagina = 25) => {
    const fixture = TestBed.createComponent(PiePaginacionComponent);
    fixture.componentInstance.resultado = paginar(Array.from({ length: total }, (_, i) => i), pagina, porPagina);
    fixture.detectChanges();
    return fixture;
  };
  const botones = (f: ReturnType<typeof montar>) =>
    Array.from<HTMLButtonElement>(f.nativeElement.querySelectorAll('.adm-paginacion__botones button'));

  beforeEach(() => TestBed.configureTestingModule({ imports: [PiePaginacionComponent] }));

  it('no aparece si la lista cabe en 25 filas', () => {
    expect(montar(20, 1).nativeElement.querySelector('nav')).toBeNull();
  });

  it('muestra «1–25 de 60», emite la página y desactiva Anterior en la primera', () => {
    const f = montar(60, 1);
    expect(f.nativeElement.textContent).toContain('1–25');
    expect(f.nativeElement.textContent).toContain('página 1 de 3');
    const [anterior, siguiente] = botones(f);
    expect(anterior.disabled).toBe(true);
    const emitidas: number[] = [];
    f.componentInstance.paginaChange.subscribe((n) => emitidas.push(n));
    siguiente.click();
    expect(emitidas).toEqual([2]);
  });

  it('cambiar «Mostrar» emite el tamaño elegido', () => {
    const f = montar(60, 1);
    const emitidos: number[] = [];
    f.componentInstance.porPaginaChange.subscribe((n) => emitidos.push(n));
    const select: HTMLSelectElement = f.nativeElement.querySelector('select');
    select.value = '50';
    select.dispatchEvent(new Event('change'));
    expect(emitidos).toEqual([50]);
  });
});
