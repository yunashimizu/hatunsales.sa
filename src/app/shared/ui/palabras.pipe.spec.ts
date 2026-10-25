import { PalabrasPipe } from './palabras.pipe';

describe('PalabrasPipe', () => {
  const pipe = new PalabrasPipe();

  it('parte un titular en palabras', () => {
    expect(pipe.transform('Todo lo que necesitas')).toEqual(['Todo', 'lo', 'que', 'necesitas']);
  });

  it('ignora espacios repetidos y bordes', () => {
    expect(pipe.transform('  uno   dos ')).toEqual(['uno', 'dos']);
  });

  it('devuelve una lista vacía con texto nulo o vacío', () => {
    expect(pipe.transform(null)).toEqual([]);
    expect(pipe.transform(undefined)).toEqual([]);
    expect(pipe.transform('')).toEqual([]);
  });
});
