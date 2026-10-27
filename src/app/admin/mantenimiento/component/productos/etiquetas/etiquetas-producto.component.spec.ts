import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';

import { EtiquetasProductoComponent, ProductoEtiqueta } from './etiquetas-producto.component';

@Component({
  standalone: true,
  imports: [EtiquetasProductoComponent],
  template: `<app-etiquetas-producto [producto]="producto" [copias]="copias" />`,
})
class AnfitrionComponent {
  producto: ProductoEtiqueta = { nombre: 'CEMENTO SOL 42.5 KG', precio_venta: 31.9, codigo_barras: '2000000000015' };
  copias = 3;
}

describe('EtiquetasProductoComponent', () => {
  function montar(producto?: Partial<ProductoEtiqueta>, copias = 3) {
    const fixture = TestBed.createComponent(AnfitrionComponent);
    if (producto) fixture.componentInstance.producto = { ...fixture.componentInstance.producto, ...producto };
    fixture.componentInstance.copias = copias;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return { fixture, el, etiquetas: () => el.querySelectorAll('.eti-etiqueta') };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AnfitrionComponent] }).compileComponents();
  });

  it('dibuja N etiquetas con nombre, precio y el SVG del código', () => {
    const { etiquetas } = montar();
    const lista = etiquetas();
    expect(lista).toHaveLength(3);
    for (const etiqueta of Array.from(lista)) {
      expect(etiqueta.querySelector('.eti-etiqueta__nombre')?.textContent).toContain('CEMENTO SOL 42.5 KG');
      expect(etiqueta.querySelector('.eti-etiqueta__precio')?.textContent).toContain('S/ 31.90');
      const svg = etiqueta.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.querySelectorAll('rect').length).toBeGreaterThan(10);
      expect(etiqueta.textContent).toContain('2000000000015'.slice(7));
    }
  });

  it('acota las copias a 1..100', () => {
    const alto = montar(undefined, 500);
    expect(alto.etiquetas()).toHaveLength(100);
    const bajo = montar(undefined, 0);
    expect(bajo.etiquetas()).toHaveLength(1);
  });

  it('cambiar las copias en el campo redibuja la hoja', async () => {
    const { fixture, el, etiquetas } = montar(undefined, 2);
    await fixture.whenStable();
    expect(etiquetas()).toHaveLength(2);
    const campo = el.querySelector('#eti-copias') as HTMLInputElement;
    campo.value = '5';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(etiquetas()).toHaveLength(5);
    campo.value = '999';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(etiquetas()).toHaveLength(100);
  });

  it('el nombre del producto va como texto, nunca como HTML', () => {
    const { el } = montar({ nombre: '<img src=x onerror=alert(1)>Taladro' });
    expect(el.querySelector('.eti-etiqueta__nombre img')).toBeNull();
    expect(el.querySelector('.eti-etiqueta__nombre')?.textContent).toContain('<img src=x onerror=alert(1)>Taladro');
  });

  it('un código que no es EAN-13 válido muestra el texto y «formato no imprimible», sin etiquetas', () => {
    const { el, etiquetas } = montar({ codigo_barras: 'CEM-01' });
    expect(etiquetas()).toHaveLength(0);
    expect(el.querySelector('svg')).toBeNull();
    const aviso = el.querySelector('.eti-no-imprimible')?.textContent ?? '';
    expect(aviso).toContain('CEM-01');
    expect(aviso).toContain('formato no imprimible');
    expect((el.querySelector('.eti-imprimir') as HTMLButtonElement).disabled).toBe(true);
  });

  it('un EAN-13 con el verificador mal tampoco se imprime', () => {
    const { el, etiquetas } = montar({ codigo_barras: '2000000000014' });
    expect(etiquetas()).toHaveLength(0);
    expect(el.querySelector('.eti-no-imprimible')?.textContent).toContain('formato no imprimible');
  });

  it('sin código avisa que no hay código de barras', () => {
    const { el, etiquetas } = montar({ codigo_barras: '' });
    expect(etiquetas()).toHaveLength(0);
    expect(el.querySelector('.eti-no-imprimible')?.textContent).toContain('Sin código de barras');
  });

  it('Imprimir llama a window.print con la clase de impresión puesta y la quita después', () => {
    const { fixture, el } = montar();
    const raiz = document.documentElement;
    let claseDuranteImpresion = false;
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {
      claseDuranteImpresion = raiz.classList.contains('eti-imprimiendo');
    });
    (el.querySelector('.eti-imprimir') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(imprimir).toHaveBeenCalledTimes(1);
    expect(claseDuranteImpresion).toBe(true);
    expect(raiz.classList.contains('eti-imprimiendo')).toBe(false);
    imprimir.mockRestore();
  });
});
