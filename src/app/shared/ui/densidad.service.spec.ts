import { TestBed } from '@angular/core/testing';
import { DensidadService } from './densidad.service';

describe('DensidadService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-densidad');
  });

  it('arranca cómoda y sin atributo en <html>', () => {
    const densidad = TestBed.inject(DensidadService);
    expect(densidad.densidad()).toBe('comoda');
    expect(densidad.esCompacta()).toBe(false);
    expect(document.documentElement.hasAttribute('data-densidad')).toBe(false);
  });

  it('fijar(«compacta») escribe data-densidad y lo recuerda; «cómoda» lo quita', () => {
    const densidad = TestBed.inject(DensidadService);
    densidad.fijar('compacta');
    expect(densidad.esCompacta()).toBe(true);
    expect(document.documentElement.getAttribute('data-densidad')).toBe('compacta');
    expect(localStorage.getItem('hs.panel.densidad')).toBe('compacta');

    densidad.fijar('comoda');
    expect(document.documentElement.hasAttribute('data-densidad')).toBe(false);
    expect(localStorage.getItem('hs.panel.densidad')).toBeNull();
  });

  it('recupera lo guardado al crearse y descarta valores desconocidos', () => {
    localStorage.setItem('hs.panel.densidad', 'compacta');
    expect(TestBed.inject(DensidadService).densidad()).toBe('compacta');
    expect(document.documentElement.getAttribute('data-densidad')).toBe('compacta');

    TestBed.resetTestingModule();
    localStorage.setItem('hs.panel.densidad', 'enorme');
    expect(TestBed.inject(DensidadService).densidad()).toBe('comoda');
  });
});
