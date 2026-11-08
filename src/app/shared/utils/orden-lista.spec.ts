import {
  alternarOrden, ariaSort, guardarOrden, iconoOrden, leerOrdenGuardado, ordenarLista, SIN_ORDEN,
} from './orden-lista';

describe('ordenarLista', () => {
  interface Fila { nombre: string | null; precio: number | null; fecha?: string }
  const filas: Fila[] = [
    { nombre: 'tornillo 10', precio: 3, fecha: '2026-11-02T10:00:00' },
    { nombre: 'Ácido', precio: null, fecha: '2026-10-30T09:00:00' },
    { nombre: 'tornillo 2', precio: 12.5, fecha: '2026-11-08T08:00:00' },
    { nombre: null, precio: 1, fecha: undefined },
    { nombre: 'Zinc', precio: 3 },
  ];

  it('ordena texto sin distinguir mayúsculas ni tildes y con números naturales', () => {
    const asc = ordenarLista(filas, 'nombre', 'asc').map((f) => f.nombre);
    expect(asc).toEqual(['Ácido', 'tornillo 2', 'tornillo 10', 'Zinc', null]);
  });

  it('ordena números por valor y deja los vacíos al final en ambos sentidos', () => {
    expect(ordenarLista(filas, 'precio', 'asc').map((f) => f.precio)).toEqual([1, 3, 3, 12.5, null]);
    expect(ordenarLista(filas, 'precio', 'desc').map((f) => f.precio)).toEqual([12.5, 3, 3, 1, null]);
  });

  it('acepta una función y ordena fechas ISO', () => {
    const desc = ordenarLista(filas, (f) => f.fecha, 'desc').map((f) => f.fecha);
    expect(desc).toEqual(['2026-11-08T08:00:00', '2026-11-02T10:00:00', '2026-10-30T09:00:00', undefined, undefined]);
  });

  it('es estable (lo que empata conserva su orden) y no cambia la lista original', () => {
    const copia = [...filas];
    const resultado = ordenarLista(filas, 'precio', 'asc');
    expect(resultado.filter((f) => f.precio === 3).map((f) => f.nombre)).toEqual(['tornillo 10', 'Zinc']);
    expect(filas).toEqual(copia);
    expect(resultado).not.toBe(filas);
  });
});

describe('alternarOrden y estado de la cabecera', () => {
  it('misma columna: ascendente → descendente → sin orden; otra columna empieza ascendente', () => {
    const a = alternarOrden(SIN_ORDEN, 'precio');
    expect(a).toEqual({ clave: 'precio', dir: 'asc' });
    const b = alternarOrden(a, 'precio');
    expect(b).toEqual({ clave: 'precio', dir: 'desc' });
    expect(alternarOrden(b, 'precio').clave).toBeNull();
    expect(alternarOrden(b, 'nombre')).toEqual({ clave: 'nombre', dir: 'asc' });
  });

  it('da el aria-sort y el icono de cada cabecera', () => {
    const estado = { clave: 'precio', dir: 'desc' as const };
    expect(ariaSort(estado, 'precio')).toBe('descending');
    expect(ariaSort(estado, 'nombre')).toBe('none');
    expect(ariaSort({ clave: 'precio', dir: 'asc' }, 'precio')).toBe('ascending');
    expect(iconoOrden(estado, 'precio')).toBe('bi-sort-down');
    expect(iconoOrden({ clave: 'precio', dir: 'asc' }, 'precio')).toBe('bi-sort-up');
    expect(iconoOrden(estado, 'nombre')).toBe('bi-arrow-down-up');
  });
});

describe('orden guardado por pantalla', () => {
  beforeEach(() => sessionStorage.clear());

  it('se guarda y se lee en la misma pestaña; sin orden borra la clave', () => {
    guardarOrden('prueba', { clave: 'nombre', dir: 'desc' });
    expect(sessionStorage.getItem('hs.orden.prueba')).toContain('nombre');
    expect(leerOrdenGuardado('prueba')).toEqual({ clave: 'nombre', dir: 'desc' });
    guardarOrden('prueba', SIN_ORDEN);
    expect(sessionStorage.getItem('hs.orden.prueba')).toBeNull();
  });

  it('ignora datos dañados o de columnas que ya no existen', () => {
    sessionStorage.setItem('hs.orden.prueba', '{no es json');
    expect(leerOrdenGuardado('prueba')).toEqual(SIN_ORDEN);
    guardarOrden('prueba', { clave: 'vieja', dir: 'asc' });
    expect(leerOrdenGuardado('prueba', ['nombre', 'precio'])).toEqual(SIN_ORDEN);
  });
});
