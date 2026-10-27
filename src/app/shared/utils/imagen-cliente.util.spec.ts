import {
  CALIDAD_JPEG,
  LADO_MAXIMO_PX,
  MAX_BYTES_IMAGEN,
  MAX_BYTES_ORIGINAL,
  MotorImagen,
  UMBRAL_COMPRESION_BYTES,
  comprimirImagen,
  partirEnLotes,
  prepararImagen,
  validarImagen,
} from './imagen-cliente.util';

const MB = 1024 * 1024;

/** File con el peso indicado sin reservar la memoria real. */
function archivo(nombre: string, tipo: string, bytes: number): File {
  const f = new File(['x'], nombre, { type: tipo });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

/** Motor falso: registra el tamaño del canvas y devuelve un blob real del peso pedido. */
function motorFalso(ancho: number, alto: number, pesoSalida: number) {
  const registro = { canvas: [] as number[][], cerrado: false, calidad: 0, tipo: '' };
  const motor: MotorImagen = {
    crearBitmap: async () => ({ width: ancho, height: alto, close: () => { registro.cerrado = true; } }),
    crearCanvas: (w, h) => {
      registro.canvas.push([w, h]);
      return {
        width: w,
        height: h,
        getContext: () => ({ fillStyle: '', fillRect: () => undefined, drawImage: () => undefined }),
        toBlob: (cb, tipo, calidad) => {
          registro.tipo = tipo ?? '';
          registro.calidad = calidad ?? 0;
          cb(new Blob([new Uint8Array(pesoSalida)]));
        },
      };
    },
  };
  return { motor, registro };
}

describe('validarImagen', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'])('acepta %s', (tipo) => {
    expect(validarImagen(archivo('foto', tipo, 1000))).toEqual({ valido: true });
  });

  it('rechaza HEIC con un mensaje claro y el nombre del archivo', () => {
    const r = validarImagen(archivo('foto.heic', 'image/heic', 1000));
    expect(r.valido).toBe(false);
    expect(r.mensaje).toBe('foto.heic: formato HEIC no admitido, use JPG o PNG');
  });

  it('rechaza HEIC aunque el navegador no informe el tipo (por la extensión)', () => {
    const r = validarImagen(archivo('IMG_1.HEIC', '', 1000));
    expect(r.valido).toBe(false);
    expect(r.mensaje).toContain('HEIC');
  });

  it.each([['dibujo.svg', 'image/svg+xml'], ['mapa.bmp', 'image/bmp'], ['nota.pdf', 'application/pdf']])(
    'rechaza %s',
    (nombre, tipo) => {
      const r = validarImagen(archivo(nombre, tipo, 1000));
      expect(r.valido).toBe(false);
      expect(r.mensaje).toBe(`${nombre}: formato no admitido, use JPG o PNG`);
    },
  );

  it('con tipo vacío acepta por extensión (jpg)', () => {
    expect(validarImagen(archivo('a.JPG', '', 1000)).valido).toBe(true);
  });

  it('rechaza archivos vacíos', () => {
    expect(validarImagen(archivo('a.jpg', 'image/jpeg', 0)).mensaje).toBe('a.jpg: el archivo está vacío');
  });

  it('una foto de 8 MB es válida (se comprimirá); más de 30 MB no', () => {
    expect(validarImagen(archivo('a.jpg', 'image/jpeg', 8 * MB)).valido).toBe(true);
    expect(validarImagen(archivo('a.jpg', 'image/jpeg', MAX_BYTES_ORIGINAL + 1)).valido).toBe(false);
  });
});

describe('comprimirImagen', () => {
  it('no toca una foto liviana', async () => {
    const f = archivo('a.jpg', 'image/jpeg', UMBRAL_COMPRESION_BYTES);
    const { motor, registro } = motorFalso(4000, 3000, 100);
    const r = await comprimirImagen(f, motor);
    expect(r).toEqual({ archivo: f, comprimido: false, motivo: 'liviana' });
    expect(registro.canvas).toEqual([]);
  });

  it('reduce una foto grande: lado mayor 1600 px, JPEG 0.85, nombre .jpg', async () => {
    const f = archivo('IMG_001.png', 'image/png', 8 * MB);
    const { motor, registro } = motorFalso(4000, 3000, 900_000);
    const r = await comprimirImagen(f, motor);
    expect(r.comprimido).toBe(true);
    expect(r.archivo.name).toBe('IMG_001.jpg');
    expect(r.archivo.type).toBe('image/jpeg');
    expect(registro.canvas).toEqual([[LADO_MAXIMO_PX, 1200]]);
    expect(registro.tipo).toBe('image/jpeg');
    expect(registro.calidad).toBe(CALIDAD_JPEG);
    expect(registro.cerrado).toBe(true);
  });

  it('no agranda una imagen cuyo lado ya es menor a 1600 px', async () => {
    const f = archivo('a.jpg', 'image/jpeg', 3 * MB);
    const { motor, registro } = motorFalso(1000, 800, 200_000);
    await comprimirImagen(f, motor);
    expect(registro.canvas).toEqual([[1000, 800]]);
  });

  it('sin canvas o sin createImageBitmap devuelve el original con el motivo', async () => {
    const f = archivo('a.jpg', 'image/jpeg', 8 * MB);
    expect(await comprimirImagen(f, {})).toEqual({ archivo: f, comprimido: false, motivo: 'sin_canvas' });
    const { motor } = motorFalso(10, 10, 1);
    expect((await comprimirImagen(f, { crearBitmap: motor.crearBitmap })).motivo).toBe('sin_canvas');
  });

  it('no convierte un GIF (podría estar animado)', async () => {
    const f = archivo('a.gif', 'image/gif', 8 * MB);
    const { motor } = motorFalso(4000, 3000, 100);
    expect((await comprimirImagen(f, motor)).motivo).toBe('gif');
  });

  it('si el resultado no pesa menos, conserva el original', async () => {
    const f = archivo('a.jpg', 'image/jpeg', 2 * MB);
    const { motor } = motorFalso(1700, 1700, 3 * MB);
    expect(await comprimirImagen(f, motor)).toEqual({ archivo: f, comprimido: false, motivo: 'sin_mejora' });
  });

  it('si decodificar falla, devuelve el original y libera el recurso', async () => {
    const f = archivo('a.jpg', 'image/jpeg', 8 * MB);
    const motor: MotorImagen = {
      crearBitmap: async () => { throw new Error('imagen corrupta'); },
      crearCanvas: () => null,
    };
    expect(await comprimirImagen(f, motor)).toEqual({ archivo: f, comprimido: false, motivo: 'error' });
  });
});

describe('prepararImagen', () => {
  it('rechaza el formato sin intentar comprimir', async () => {
    const r = await prepararImagen(archivo('foto.heic', 'image/heic', 9 * MB), {});
    expect(r.archivo).toBeUndefined();
    expect(r.error).toContain('foto.heic');
  });

  it('una foto de 8 MB queda comprimida y lista para subir', async () => {
    const { motor } = motorFalso(4000, 3000, 900_000);
    const r = await prepararImagen(archivo('a.jpg', 'image/jpeg', 8 * MB), motor);
    expect(r.error).toBeUndefined();
    expect(r.comprimido).toBe(true);
    expect(r.archivo?.size).toBe(900_000);
    expect(r.archivo?.size).toBeLessThanOrEqual(MAX_BYTES_IMAGEN);
  });

  it('si sigue sobre 5 MB tras comprimir, avisa con el nombre del archivo', async () => {
    const { motor } = motorFalso(4000, 3000, 6 * MB);
    const r = await prepararImagen(archivo('a.jpg', 'image/jpeg', 9 * MB), motor);
    expect(r.error).toContain('a.jpg: supera 5 MB');
  });

  it('una foto de 8 MB sin canvas disponible se rechaza con mensaje claro', async () => {
    const r = await prepararImagen(archivo('a.jpg', 'image/jpeg', 8 * MB), {});
    expect(r.error).toBe('a.jpg: supera 5 MB, elija una foto más liviana');
  });

  it('una foto liviana pasa tal cual', async () => {
    const f = archivo('a.jpg', 'image/jpeg', 500_000);
    const r = await prepararImagen(f, {});
    expect(r).toEqual({ archivo: f, comprimido: false });
  });
});

describe('partirEnLotes', () => {
  it('parte en trozos de 10', () => {
    const lotes = partirEnLotes(Array.from({ length: 23 }, (_, i) => i));
    expect(lotes.map((l) => l.length)).toEqual([10, 10, 3]);
    expect(lotes.flat()).toEqual(Array.from({ length: 23 }, (_, i) => i));
  });

  it('lista vacía → sin lotes; exactamente 10 → un lote', () => {
    expect(partirEnLotes([])).toEqual([]);
    expect(partirEnLotes(Array(10).fill(1))).toHaveLength(1);
  });
});
