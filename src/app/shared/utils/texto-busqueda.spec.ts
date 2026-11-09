import { contienePalabras, normalizarBusqueda } from './texto-busqueda';

describe('normalizarBusqueda', () => {
  it('quita tildes y eñe', () => {
    expect(normalizarBusqueda('Caña')).toBe('cana');
    expect(normalizarBusqueda('ÁÉÍÓÚ ü')).toBe('aeiou u');
  });

  it('pasa a minúsculas y deja espacios simples', () => {
    expect(normalizarBusqueda('  Caña   Pescar ')).toBe('cana pescar');
    expect(normalizarBusqueda('TUBO\tPVC')).toBe('tubo pvc');
  });

  it('tolera null y undefined', () => {
    expect(normalizarBusqueda(null)).toBe('');
    expect(normalizarBusqueda(undefined)).toBe('');
  });

  it('conserva números y signos', () => {
    expect(normalizarBusqueda('Llave 1/2 - 42.5')).toBe('llave 1/2 - 42.5');
  });
});

describe('contienePalabras', () => {
  it('encuentra las palabras en cualquier orden', () => {
    const pajar = normalizarBusqueda('TUBO PVC 1/2');
    expect(contienePalabras(pajar, normalizarBusqueda('pvc tubo'))).toBe(true);
    expect(contienePalabras(normalizarBusqueda('Caña para pescar'), normalizarBusqueda('cana pescar'))).toBe(true);
  });

  it('falla si falta una palabra', () => {
    expect(contienePalabras('tubo pvc', 'tubo codo')).toBe(false);
  });

  it('consulta vacía = sí', () => {
    expect(contienePalabras('tubo pvc', '')).toBe(true);
  });

  it('respeta números y signos', () => {
    expect(contienePalabras('llave 1/2 42.5', '1/2')).toBe(true);
    expect(contienePalabras('llave 1/2 42.5', '42.5')).toBe(true);
    expect(contienePalabras('llave 3/4 42.5', '1/2')).toBe(false);
  });
});
