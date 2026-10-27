import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { urlConstants } from '../../constants/urlConstants';
import { UnidadMedidaPipe } from './unidad-medida.pipe';

@Component({
  standalone: true,
  imports: [UnidadMedidaPipe],
  template: `
    <span id="abrev">{{ codigo | unidadMedida }}</span>
    <span id="nombre">{{ codigo | unidadMedida:'nombre' }}</span>
  `,
})
class AnfitrionComponent {
  codigo: string | null | undefined = 'KGM';
}

describe('UnidadMedidaPipe', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AnfitrionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const pintar = (codigo: string | null | undefined) => {
    const fixture = TestBed.createComponent(AnfitrionComponent);
    fixture.componentInstance.codigo = codigo;
    fixture.detectChanges();
    const texto = (id: string) => (fixture.nativeElement.querySelector('#' + id) as HTMLElement).textContent;
    return { fixture, texto };
  };

  it('devuelve la abreviatura y, con «nombre», el nombre', () => {
    const { texto } = pintar('KGM');
    expect(texto('abrev')).toBe('kg');
    expect(texto('nombre')).toBe('Kilogramo');
    http.expectOne(urlConstants.producto.unidades).flush({ grupos: [], unidades: [], alias: {} });
  });

  it('un código desconocido se muestra tal cual', () => {
    const { texto } = pintar('XYZ');
    expect(texto('abrev')).toBe('XYZ');
    expect(texto('nombre')).toBe('XYZ');
    http.expectOne(urlConstants.producto.unidades).flush({ grupos: [], unidades: [], alias: {} });
  });

  it('vacío o nulo devuelve texto vacío', () => {
    const { texto } = pintar(null);
    expect(texto('abrev')).toBe('');
    http.expectOne(urlConstants.producto.unidades).flush({ grupos: [], unidades: [], alias: {} });
  });

  it('cuando llega el catálogo del servidor repinta con los códigos nuevos', () => {
    const { fixture, texto } = pintar('SA');
    expect(texto('abrev')).toBe('SA');
    http.expectOne(urlConstants.producto.unidades).flush({
      grupos: ['Construcción y materiales'],
      unidades: [{ codigo: 'SA', nombre: 'Saco', abreviatura: 'sco', grupo: 'Construcción y materiales', frecuente: true, visible: true }],
      alias: {},
    });
    fixture.detectChanges();
    expect(texto('abrev')).toBe('sco');
    expect(texto('nombre')).toBe('Saco');
  });
});
