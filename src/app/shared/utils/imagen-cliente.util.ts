/**
 * Preparación de fotos de producto en el navegador, antes de subirlas.
 *
 * Por qué existe: el backend solo admite JPEG, PNG, WebP, AVIF y GIF de hasta 5 MB, y si
 * una foto de un lote falla se rechaza todo el lote. Una foto de celular suele pesar más
 * de 5 MB y el iPhone entrega HEIC. Aquí se avisa por archivo (con su nombre) y se reduce
 * lo que pesa de más, sin pedirle nada al usuario.
 *
 * Es puro: no usa Angular y el acceso al canvas se inyecta (en jest/vitest no hay canvas
 * real). Solo para fotos de producto: comprimir cambia el archivo original.
 */

export const TIPOS_IMAGEN_PERMITIDOS: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
];

/** Tope del backend por archivo. */
export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;
/** Tope de lo que se acepta antes de comprimir (evita decodificar archivos enormes). */
export const MAX_BYTES_ORIGINAL = 30 * 1024 * 1024;
/** A partir de este peso se comprime. */
export const UMBRAL_COMPRESION_BYTES = 1.5 * 1024 * 1024;
export const LADO_MAXIMO_PX = 1600;
export const CALIDAD_JPEG = 0.85;
/** Máximo de archivos por petición del backend. */
export const MAX_ARCHIVOS_POR_LOTE = 10;

const TIPO_POR_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
};

/** Lo mínimo que se necesita de un File (facilita probarlo). */
export type ArchivoImagen = Pick<File, 'name' | 'type' | 'size'>;

export interface ResultadoValidacion {
  valido: boolean;
  /** Mensaje listo para mostrar, con el nombre del archivo. */
  mensaje?: string;
}

function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  return punto >= 0 ? nombre.slice(punto + 1).toLowerCase() : '';
}

/** Tipo MIME efectivo: el del navegador o, si viene vacío, el que indica la extensión. */
export function tipoDeImagen(archivo: ArchivoImagen): string {
  const tipo = (archivo.type || '').toLowerCase();
  return tipo || TIPO_POR_EXTENSION[extensionDe(archivo.name)] || '';
}

/**
 * Valida el formato del archivo (y que no esté vacío ni sea desmesurado). El límite de 5 MB
 * NO se exige aquí: una foto grande se comprime primero (ver prepararImagen).
 */
export function validarImagen(archivo: ArchivoImagen): ResultadoValidacion {
  const nombre = archivo.name || 'archivo';
  const tipo = tipoDeImagen(archivo);

  if (!TIPOS_IMAGEN_PERMITIDOS.includes(tipo)) {
    const ext = extensionDe(nombre);
    const esHeic = tipo === 'image/heic' || tipo === 'image/heif' || ext === 'heic' || ext === 'heif';
    return {
      valido: false,
      mensaje: esHeic
        ? `${nombre}: formato HEIC no admitido, use JPG o PNG`
        : `${nombre}: formato no admitido, use JPG o PNG`,
    };
  }
  if (archivo.size <= 0) {
    return { valido: false, mensaje: `${nombre}: el archivo está vacío` };
  }
  if (archivo.size > MAX_BYTES_ORIGINAL) {
    return { valido: false, mensaje: `${nombre}: pesa más de 30 MB, elija una foto más liviana` };
  }
  return { valido: true };
}

// ── Compresión ─────────────────────────────────────────────────

/** Contexto 2D mínimo que se usa para dibujar. */
export interface Contexto2DLike {
  fillStyle: unknown;
  fillRect(x: number, y: number, ancho: number, alto: number): void;
  drawImage(imagen: unknown, x: number, y: number, ancho: number, alto: number): void;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(tipo: '2d'): Contexto2DLike | null;
  toBlob(callback: (blob: Blob | null) => void, tipo?: string, calidad?: number): void;
}

export interface BitmapLike {
  width: number;
  height: number;
  close?(): void;
}

/** Acceso al navegador, inyectable para probar sin canvas. */
export interface MotorImagen {
  crearBitmap?: (blob: Blob) => Promise<BitmapLike>;
  crearCanvas?: (ancho: number, alto: number) => CanvasLike | null;
}

export type MotivoSinComprimir = 'liviana' | 'gif' | 'sin_canvas' | 'sin_mejora' | 'error';

export interface ResultadoCompresion {
  archivo: File;
  comprimido: boolean;
  /** Por qué se devolvió el archivo original (solo si comprimido = false). */
  motivo?: MotivoSinComprimir;
}

/** Motor real del navegador; null en cada pieza que no exista (SSR, jsdom). */
export function motorDelNavegador(): MotorImagen {
  const g = globalThis as any;
  return {
    crearBitmap: typeof g.createImageBitmap === 'function'
      ? (blob) => g.createImageBitmap(blob)
      : undefined,
    crearCanvas: typeof g.document?.createElement === 'function'
      ? (ancho, alto) => {
          const canvas = g.document.createElement('canvas');
          if (!canvas || typeof canvas.getContext !== 'function') return null;
          canvas.width = ancho;
          canvas.height = alto;
          return canvas as CanvasLike;
        }
      : undefined,
  };
}

function nombreJpeg(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  return `${punto > 0 ? nombre.slice(0, punto) : nombre}.jpg`;
}

function aBlob(canvas: CanvasLike): Promise<Blob | null> {
  return new Promise((resolver) => canvas.toBlob((blob) => resolver(blob), 'image/jpeg', CALIDAD_JPEG));
}

/**
 * Reduce la foto a JPEG (lado mayor 1600 px, calidad 0.85) si pesa más de 1,5 MB.
 * Nunca falla: si no se puede (sin canvas, GIF animado, error al decodificar, o el
 * resultado no es más liviano) devuelve el archivo original con `comprimido: false`
 * y el motivo.
 */
export async function comprimirImagen(
  archivo: File,
  motor: MotorImagen = motorDelNavegador(),
): Promise<ResultadoCompresion> {
  const original = (motivo: MotivoSinComprimir): ResultadoCompresion => ({ archivo, comprimido: false, motivo });

  if (archivo.size <= UMBRAL_COMPRESION_BYTES) return original('liviana');
  // Un GIF puede estar animado: pasarlo a JPEG lo dejaría quieto.
  if (tipoDeImagen(archivo) === 'image/gif') return original('gif');
  if (!motor.crearBitmap || !motor.crearCanvas) return original('sin_canvas');

  let bitmap: BitmapLike | null = null;
  try {
    bitmap = await motor.crearBitmap(archivo);
    const lado = Math.max(bitmap.width, bitmap.height);
    if (!lado) return original('error');
    const escala = Math.min(1, LADO_MAXIMO_PX / lado);
    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = motor.crearCanvas(ancho, alto);
    const contexto = canvas?.getContext('2d');
    if (!canvas || !contexto) return original('sin_canvas');

    // JPEG no tiene transparencia: un PNG con fondo transparente saldría negro.
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, ancho, alto);
    contexto.drawImage(bitmap, 0, 0, ancho, alto);

    const blob = await aBlob(canvas);
    if (!blob || blob.size <= 0) return original('error');
    if (blob.size >= archivo.size) return original('sin_mejora');

    return {
      archivo: new File([blob], nombreJpeg(archivo.name), { type: 'image/jpeg', lastModified: archivo.lastModified }),
      comprimido: true,
    };
  } catch {
    return original('error');
  } finally {
    bitmap?.close?.();
  }
}

// ── Todo junto ─────────────────────────────────────────────────

export interface ResultadoPreparacion {
  /** Archivo listo para subir (puede ser el original o el comprimido). */
  archivo?: File;
  /** Mensaje listo para mostrar, con el nombre del archivo original. */
  error?: string;
  comprimido?: boolean;
}

/** Valida, comprime si hace falta y comprueba que quede dentro de los 5 MB del backend. */
export async function prepararImagen(
  archivo: File,
  motor?: MotorImagen,
): Promise<ResultadoPreparacion> {
  const validacion = validarImagen(archivo);
  if (!validacion.valido) return { error: validacion.mensaje };

  const resultado = await comprimirImagen(archivo, motor);
  if (resultado.archivo.size > MAX_BYTES_IMAGEN) {
    const nombre = archivo.name || 'archivo';
    return {
      error: resultado.motivo === 'gif'
        ? `${nombre}: el GIF supera 5 MB, elija uno más liviano`
        : resultado.comprimido
          ? `${nombre}: supera 5 MB incluso reducida, elija una foto más liviana`
          : `${nombre}: supera 5 MB, elija una foto más liviana`,
    };
  }
  return { archivo: resultado.archivo, comprimido: resultado.comprimido };
}

/** Parte una lista en trozos de `tamano` (el backend admite hasta 10 archivos por petición). */
export function partirEnLotes<T>(lista: readonly T[], tamano: number = MAX_ARCHIVOS_POR_LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
}
