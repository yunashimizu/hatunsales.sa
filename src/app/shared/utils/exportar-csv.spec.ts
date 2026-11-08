import { construirCsv, exportarCsv, fechaCsv, nombreArchivoCsv } from './exportar-csv';

interface Fila { nombre: string; precio: number | null; nota?: string }

const columnas = [
  { titulo: 'Producto', valor: (f: Fila) => f.nombre },
  { titulo: 'Precio', valor: (f: Fila) => f.precio },
  { titulo: 'Nota', valor: (f: Fila) => f.nota },
];

describe('construirCsv', () => {
  it('pone el texto entre comillas, los números con punto y deja vacío lo que no hay', () => {
    const csv = construirCsv(columnas, [{ nombre: 'Clavo 2"', precio: 12.5 }, { nombre: 'Cinta', precio: null }]);
    expect(csv.split('\r\n')).toEqual([
      '"Producto","Precio","Nota"',
      '"Clavo 2""",12.5,',
      '"Cinta",,',
      '',
    ]);
  });

  it('respeta comas, saltos de línea y tildes dentro del texto', () => {
    const csv = construirCsv(columnas, [{ nombre: 'Martillo, 16 oz', precio: 30, nota: 'línea 1\nlínea 2' }]);
    expect(csv).toContain('"Martillo, 16 oz",30,"línea 1\nlínea 2"');
  });

  it('neutraliza lo que Excel tomaría por una fórmula, pero no los números escritos como texto', () => {
    const csv = construirCsv(columnas, [
      { nombre: '=SUMA(A1:A2)', precio: 1, nota: '-5.50' },
      { nombre: '@cliente', precio: 2, nota: '+51999' },
    ]);
    expect(csv).toContain(`"'=SUMA(A1:A2)",1,"-5.50"`);
    expect(csv).toContain(`"'@cliente",2,"+51999"`);
  });
});

describe('fechaCsv y nombre del archivo', () => {
  it('formatea «yyyy-mm-dd hh:mm» en hora local y vacía lo inválido', () => {
    expect(fechaCsv(new Date(2026, 10, 8, 9, 5))).toBe('2026-11-08 09:05');
    expect(fechaCsv('2026-11-08T14:30:00')).toBe('2026-11-08 14:30');
    expect(fechaCsv('no es fecha')).toBe('');
    expect(fechaCsv(null)).toBe('');
  });

  it('añade la fecha y la extensión', () => {
    const ahora = new Date(2026, 10, 8, 12, 0);
    expect(nombreArchivoCsv('productos', ahora)).toBe('productos-2026-11-08.csv');
    expect(nombreArchivoCsv('inventario-pagina-2.csv', ahora)).toBe('inventario-pagina-2-2026-11-08.csv');
  });
});

describe('exportarCsv', () => {
  it('descarga un archivo con BOM UTF-8 y devuelve cuántas filas exportó', async () => {
    let blob: Blob | null = null;
    let nombre = '';
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b as Blob; return 'blob:prueba'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      nombre = this.download;
    });

    const total = exportarCsv('clientes', columnas, [{ nombre: 'Ñandú', precio: 1 }, { nombre: 'Ana', precio: 2 }]);

    expect(total).toBe(2);
    expect(nombre).toMatch(/^clientes-\d{4}-\d{2}-\d{2}\.csv$/);
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(await blob!.text()).toContain('"Ñandú"');
    vi.restoreAllMocks();
  });
});
