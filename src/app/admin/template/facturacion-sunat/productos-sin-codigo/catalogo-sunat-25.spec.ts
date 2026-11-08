import { buscarClases, CatalogoSunat25, leerCatalogo25, normalizarBusqueda } from './catalogo-sunat-25';

const CLASES = [
  { codigo: '27111700', nombre: 'Llaves y destornilladores' },
  { codigo: '27111800', nombre: 'Martillos y mazos' },
  { codigo: '27112700', nombre: 'Herramientas eléctricas (taladros, amoladoras, sierras)' },
  { codigo: '31211500', nombre: 'Pinturas' },
  { codigo: '31211900', nombre: 'Brochas, rodillos y accesorios de pintura' },
  { codigo: '40171700', nombre: 'Accesorios de PVC' },
];

describe('catálogo 25 · buscador local', () => {
  it('normaliza tildes, mayúsculas y signos', () => {
    expect(normalizarBusqueda('  ELÉCTRICAS / Pintúra ')).toBe('electricas pintura');
  });

  it('busca por nombre sin importar tildes ni plural', () => {
    expect(buscarClases(CLASES, 'martillo').map((c) => c.codigo)).toEqual(['27111800']);
    expect(buscarClases(CLASES, 'ELECTRICA').map((c) => c.codigo)).toEqual(['27112700']);
    expect(buscarClases(CLASES, 'llave')[0].codigo).toBe('27111700');
  });

  it('todas las palabras deben aparecer, en cualquier orden', () => {
    expect(buscarClases(CLASES, 'accesorios pintura').map((c) => c.codigo)).toEqual(['31211900']);
    expect(buscarClases(CLASES, 'pintura accesorios').map((c) => c.codigo)).toEqual(['31211900']);
    expect(buscarClases(CLASES, 'martillo pintura')).toEqual([]);
  });

  it('los nombres que empiezan con lo escrito van primero', () => {
    expect(buscarClases(CLASES, 'pintura').map((c) => c.codigo)).toEqual(['31211500', '31211900']);
  });

  it('con solo dígitos busca por el comienzo del código', () => {
    expect(buscarClases(CLASES, '2711').map((c) => c.codigo)).toEqual(['27111700', '27111800', '27112700']);
    expect(buscarClases(CLASES, '31211900')).toHaveLength(1);
  });

  it('respeta el límite y no devuelve nada si no se escribió nada', () => {
    expect(buscarClases(CLASES, '2711', 2)).toHaveLength(2);
    expect(buscarClases(CLASES, '   ')).toEqual([]);
  });

  it('leerCatalogo25 descarta filas mal formadas', () => {
    const c = leerCatalogo25({ fuente: 'x', fecha: '2026-11-08', oficial: false, clases: [['27111800', 'Martillos'], ['123', 'corto'], ['27111700'], 'no', ['27111900', '']] });
    expect(c.clases).toEqual([{ codigo: '27111800', nombre: 'Martillos' }]);
    expect(leerCatalogo25(null).clases).toEqual([]);
    expect(c.oficial).toBe(false);
  });

  describe('archivo public/assets/sunat/catalogo-25-ferreteria.json', () => {
    let catalogo: CatalogoSunat25;

    // Se lee el archivo real del disco (el módulo se nombra con una variable para que Angular no lo busque al compilar).
    beforeAll(async () => {
      const modulo = 'node:fs';
      const fs = (await import(/* @vite-ignore */ modulo)) as { readFileSync: (ruta: string, codificacion: string) => string };
      catalogo = leerCatalogo25(JSON.parse(fs.readFileSync('public/assets/sunat/catalogo-25-ferreteria.json', 'utf8')));
    });

    it('trae al menos 150 clases de 8 dígitos sin repetir, de los segmentos pedidos', () => {
      expect(catalogo.clases.length).toBeGreaterThanOrEqual(150);
      const codigos = catalogo.clases.map((c) => c.codigo);
      expect(new Set(codigos).size).toBe(codigos.length);
      const segmentos = new Set(codigos.map((c) => c.slice(0, 2)));
      for (const s of ['23', '24', '27', '30', '31', '39', '40', '46', '47', '52']) expect(segmentos.has(s)).toBe(true);
      expect([...segmentos].every((s) => ['23', '24', '27', '30', '31', '39', '40', '46', '47', '52'].includes(s))).toBe(true);
    });

    it('declara su fuente y su fecha, y no se hace pasar por oficial', () => {
      expect(catalogo.fuente).toMatch(/NO es el anexo oficial/);
      expect(catalogo.fecha).toBe('2026-11-08');
      expect(catalogo.oficial).toBe(false);
    });

    it('encuentra los productos típicos de una ferretería por su nombre', () => {
      for (const palabra of ['martillo', 'taladro', 'pintura', 'cemento', 'tornillo', 'cable', 'casco', 'candado', 'tubería', 'escoba']) {
        expect(buscarClases(catalogo.clases, palabra).length, palabra).toBeGreaterThan(0);
      }
    });
  });
});
