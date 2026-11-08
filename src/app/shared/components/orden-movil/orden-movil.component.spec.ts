import { TestBed } from '@angular/core/testing';

import { OrdenMovilComponent } from './orden-movil.component';

describe('OrdenMovilComponent', () => {
  function montar(estado = { clave: null as string | null, dir: 'asc' as 'asc' | 'desc' }) {
    const fixture = TestBed.createComponent(OrdenMovilComponent);
    fixture.componentInstance.columnas = [
      { clave: 'nombre', titulo: 'Producto', tipo: 'texto' },
      { clave: 'precio', titulo: 'Precio', tipo: 'numero' },
    ];
    fixture.componentInstance.estado = estado;
    fixture.componentInstance.idCampo = 'orden-prueba';
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => TestBed.configureTestingModule({ imports: [OrdenMovilComponent] }));

  it('ofrece «Como llegan» y las dos direcciones de cada columna, con el estado actual elegido', () => {
    const f = montar({ clave: 'precio', dir: 'desc' });
    const opciones = Array.from<HTMLOptionElement>(f.nativeElement.querySelectorAll('option'));
    expect(opciones.map((o) => o.textContent!.trim())).toEqual([
      'Como llegan', 'Producto: A → Z', 'Producto: Z → A', 'Precio: menor a mayor', 'Precio: mayor a menor',
    ]);
    expect(opciones.find((o) => o.selected)!.value).toBe('precio:desc');
    expect(f.nativeElement.querySelector('label').getAttribute('for')).toBe('orden-prueba');
  });

  it('emite el orden elegido y «Como llegan» lo quita', () => {
    const f = montar();
    const emitidos: unknown[] = [];
    f.componentInstance.estadoChange.subscribe((e) => emitidos.push(e));
    const select: HTMLSelectElement = f.nativeElement.querySelector('select');
    select.value = 'nombre:asc';
    select.dispatchEvent(new Event('change'));
    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(emitidos).toEqual([{ clave: 'nombre', dir: 'asc' }, { clave: null, dir: 'asc' }]);
  });
});
