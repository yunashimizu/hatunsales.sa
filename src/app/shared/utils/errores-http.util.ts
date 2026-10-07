import { HttpErrorResponse } from '@angular/common/http';

/**
 * Utilidades de error HTTP compartidas por el panel, la tienda y el login.
 *
 * Sin dependencias de Angular (salvo el tipo HttpErrorResponse) para que el
 * interceptor, el ErrorHandler global y las pantallas usen exactamente las
 * mismas reglas y los mismos textos. No importar servicios desde aquí.
 */

/* ===========================================================================
 * Textos globales
 * ======================================================================== */

export const MENSAJE_SESION_EXPIRADA = 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.';
export const MENSAJE_SIN_CONEXION =
  'No pudimos conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.';
export const MENSAJE_SERVIDOR_NO_DISPONIBLE =
  'El servidor no está respondiendo en este momento. Espera unos segundos e inténtalo de nuevo.';
export const MENSAJE_TIEMPO_AGOTADO =
  'El servidor tardó demasiado en responder. Revisa si la operación se registró antes de repetirla.';
export const MENSAJE_DEMASIADAS_SOLICITUDES =
  'Demasiados intentos seguidos. Espera unos segundos y vuelve a intentarlo.';
export const MENSAJE_SIN_PERMISO = 'No tienes permiso para realizar esta acción.';
export const MENSAJE_ARCHIVO_MUY_GRANDE = 'El archivo es demasiado grande. El máximo permitido es 5 MB.';
export const MENSAJE_FUNCION_NO_DISPONIBLE =
  'Esta función no está disponible en el servidor. Actualiza la página o avisa a sistemas.';
export const MENSAJE_NO_ENCONTRADO = 'No encontramos lo que buscabas.';
export const MENSAJE_DATOS_INVALIDOS = 'Revisa los datos ingresados.';
export const MENSAJE_ERROR_SERVIDOR = 'Ocurrió un error inesperado en el servidor.';

/** Texto por defecto histórico de `mensajeDeError` (se conserva por compatibilidad). */
const POR_DEFECTO_HISTORICO = 'Ocurrió un error inesperado';
const SUFIJO_ERROR_INTERNO = ' (error interno del servidor)';

/* ===========================================================================
 * Códigos
 * ======================================================================== */

/** Códigos que genera el front (el backend envía los suyos en `error.codigo`). */
export const CODIGOS_ERROR = {
  SESION_EXPIRADA: 'SESION_EXPIRADA',
  SIN_CONEXION: 'SIN_CONEXION',
  SERVIDOR_NO_DISPONIBLE: 'SERVIDOR_NO_DISPONIBLE',
  TIEMPO_AGOTADO: 'TIEMPO_AGOTADO',
  DEMASIADAS_SOLICITUDES: 'DEMASIADAS_SOLICITUDES',
  SIN_PERMISO: 'SIN_PERMISO',
  ARCHIVO_MUY_GRANDE: 'ARCHIVO_MUY_GRANDE',
  ERROR_SERVIDOR: 'ERROR_SERVIDOR',
} as const;

/** Errores que avisa la capa global (interceptor / conectividad), no cada pantalla. */
export const CODIGOS_GLOBALES: ReadonlySet<string> = new Set<string>([
  CODIGOS_ERROR.SESION_EXPIRADA,
  CODIGOS_ERROR.SIN_CONEXION,
  CODIGOS_ERROR.SERVIDOR_NO_DISPONIBLE,
  CODIGOS_ERROR.TIEMPO_AGOTADO,
  CODIGOS_ERROR.DEMASIADAS_SOLICITUDES,
]);

/** Códigos de transporte: la petición no llegó o no volvió (no es una regla de negocio). */
const CODIGOS_TRANSPORTE: ReadonlySet<string> = new Set<string>([
  CODIGOS_ERROR.SIN_CONEXION,
  CODIGOS_ERROR.SERVIDOR_NO_DISPONIBLE,
  CODIGOS_ERROR.TIEMPO_AGOTADO,
]);

export const MENSAJES_GLOBALES: readonly string[] = Object.freeze([
  MENSAJE_SESION_EXPIRADA,
  MENSAJE_SIN_CONEXION,
  MENSAJE_SERVIDOR_NO_DISPONIBLE,
  MENSAJE_TIEMPO_AGOTADO,
  MENSAJE_DEMASIADAS_SOLICITUDES,
]);

/**
 * Cuerpo de error ya normalizado por el interceptor.
 * Acepta el formato clásico de NestJS `{statusCode, message: string | string[], error}`
 * y el nuevo `{statusCode, message, error, codigo, idPeticion}`; conserva el resto de campos.
 */
export interface CuerpoErrorApi {
  statusCode?: number;
  /** Siempre texto legible en español (los arreglos de validación van unidos). */
  message: string;
  /** Cada mensaje por separado cuando el backend envía varios (validaciones). */
  mensajes?: string[];
  error?: string;
  codigo?: string;
  idPeticion?: string;
  /** true si la capa global ya informó al usuario: las pantallas no deben repetirlo. */
  notificado?: boolean;
  /** Clave del aviso global que informó del error (p. ej. 'conexion'). */
  claveAviso?: string;
  /** Segundos que pidió esperar el servidor (cabecera Retry-After). */
  reintentarEnSeg?: number;
  [campo: string]: unknown;
}

/* ===========================================================================
 * Títulos y pistas por código
 * ======================================================================== */

const HINTS: Record<string, string> = {
  SESION_EXPIRADA: 'Vuelve a iniciar sesión para continuar donde estabas.',
  CREDITO_INACTIVO: 'Ve a Cuentas por cobrar, busca el cliente/empresa y activa el crédito.',
  CREDITO_INSUFICIENTE: 'Baja el monto a crédito o aumenta el límite en CxC.',
  CREDITO_SIN_CLIENTE: 'Busca DNI/RUC en el POS antes de cobrar a crédito.',
  CREDITO_SIN_PERMISO: 'Inicia sesión como admin o caja.',
  PAGOS_NO_CUADRAN: 'Ajusta los montos de cada medio hasta igualar el total.',
  STOCK_INSUFICIENTE: 'Quita ítems o cambia de almacén.',
  CULQI_NO_CONFIRMADO: 'Verifica el cobro Yape otra vez o usa N° de operación manual.',
  CULQI_NO_CONFIG: 'Culqi aún no está configurado: usa referencia manual.',
  ENTIDAD_NO_ENCONTRADA: 'Créalo primero en Clientes y vuelve a buscar.',
  VENTA_SIN_ITEMS: 'Agrega al menos un producto al carrito.',
  CAJA_YA_ABIERTA_USUARIO: 'Cierra tu caja actual antes de abrir otra.',
  CAJA_OCUPADA: 'Elige otra caja libre o pide que cierren esa.',
  CAJA_APERTURA_NO_ENCONTRADA: 'Abre una caja desde el menú Caja.',
  CAJA_YA_CERRADA: 'Esa apertura ya estaba cerrada.',
  CAJA_CIERRE_NO_PERMITIDO: 'Solo puedes cerrar tu propia apertura (o un admin).',
  CAJA_NO_ABIERTA: 'Ve a Caja y abre tu turno antes de cobrar.',
  CLIENTE_CON_HISTORIAL: 'Conserve el cliente; tiene ventas, crédito u otros vínculos.',
  EMPRESA_CON_HISTORIAL: 'Conserve la empresa; tiene ventas o crédito vinculados.',
  COTIZACION_SIN_ITEMS: 'Agregue productos al carrito de la cotización.',
  COTIZACION_SIN_CLIENTE: 'Busque un cliente/empresa o escriba un nombre.',
  COTIZACION_TELEFONO_INVALIDO: 'Celular Perú: 9 dígitos empezando en 9.',
  COTIZACION_NO_ENCONTRADA: 'Vuelva a la lista e intente de nuevo.',
  COTIZACION_VENCIDA: 'Puede continuar con precios actuales si confirma.',
  COTIZACION_YA_CONVERTIDA: 'Abra la venta asociada o cree una cotización nueva.',
  COTIZACION_ESTADO_INVALIDO: 'Recargue la lista: el estado de la cotización cambió.',
  COTIZACION_CANTIDAD_INVALIDA: 'Use cantidades enteras de 1 o más (sin decimales).',
  COTIZACION_PRODUCTO_SIN_PRECIO: 'Asigne un precio de venta al producto en Productos o quítelo de la cotización.',
  COTIZACION_PRODUCTO_NO_ENCONTRADO: 'Quite el producto de la cotización y vuelva a buscarlo en el catálogo.',
  COTIZACION_DOCUMENTO_ERROR: 'La cotización sí quedó guardada. Reintente la descarga en unos segundos.',
  COTIZACION_ERROR_INTERNO: 'Reintente en unos segundos; si persiste, avise a sistemas.',
  SERIE_INVALIDA: 'La serie debe tener 4 caracteres y empezar con B (boleta) o F (factura).',
  SERIE_NO_CONFIGURADA: 'Configure las series en Configuración (admin).',
  INVENTARIO_STOCK_NEGATIVO: 'No hay suficientes unidades en ese almacén.',
  RECEPCION_SIN_ITEMS: 'Agregue al menos un producto a la recepción.',
  COMPROBANTE_EMISION_FALLIDA: 'La venta pudo quedar registrada; reintente en Documentos.',
  REPORTE_PERIODO_INVALIDO: 'Elija diario, quincenal, mensual o anual.',
  REPORTE_FECHA_INVALIDA: 'Revise el rango de fechas del reporte.',
  REPORTE_EXPORT_FALLIDA: 'Reintente la descarga; si persiste, avise a sistemas.',
  // Generados por el front (interceptor)
  SIN_CONEXION: 'Si otras páginas tampoco cargan, revisa el wifi o el cable de red.',
  SERVIDOR_NO_DISPONIBLE: 'Suele resolverse solo en menos de un minuto.',
  TIEMPO_AGOTADO: 'La conexión puede estar lenta: espera unos segundos antes de reintentar.',
  SIN_PERMISO: 'Si necesitas hacerlo, pide a un administrador que revise los permisos de tu usuario.',
  ARCHIVO_MUY_GRANDE: 'Comprime la imagen o elige un archivo más liviano.',
  ERROR_SERVIDOR: 'Inténtalo de nuevo en unos segundos. Si el problema continúa, avisa a sistemas.',
};

const TITULOS: Record<string, string> = {
  SESION_EXPIRADA: 'Sesión expirada',
  CREDITO_INACTIVO: 'Crédito inactivo',
  CREDITO_INSUFICIENTE: 'Cupo insuficiente',
  CREDITO_SIN_CLIENTE: 'Cliente requerido',
  CREDITO_SIN_PERMISO: 'Sin permiso',
  PAGOS_NO_CUADRAN: 'Pagos incompletos',
  STOCK_INSUFICIENTE: 'Sin stock',
  CULQI_NO_CONFIRMADO: 'Pago no confirmado',
  CULQI_NO_CONFIG: 'Culqi no configurado',
  ENTIDAD_NO_ENCONTRADA: 'No encontrado',
  VENTA_SIN_ITEMS: 'Carrito vacío',
  CAJA_YA_ABIERTA_USUARIO: 'Ya tienes caja abierta',
  CAJA_OCUPADA: 'Caja ocupada',
  CAJA_APERTURA_NO_ENCONTRADA: 'Sin apertura',
  CAJA_YA_CERRADA: 'Ya cerrada',
  CAJA_CIERRE_NO_PERMITIDO: 'Cierre no permitido',
  CAJA_NO_ABIERTA: 'Abre caja primero',
  CLIENTE_CON_HISTORIAL: 'No se puede eliminar',
  EMPRESA_CON_HISTORIAL: 'No se puede eliminar',
  COTIZACION_SIN_ITEMS: 'Sin productos',
  COTIZACION_SIN_CLIENTE: 'Cliente requerido',
  COTIZACION_TELEFONO_INVALIDO: 'Teléfono inválido',
  COTIZACION_NO_ENCONTRADA: 'Cotización no encontrada',
  COTIZACION_VENCIDA: 'Cotización vencida',
  COTIZACION_YA_CONVERTIDA: 'Ya convertida en venta',
  COTIZACION_ESTADO_INVALIDO: 'Estado no permitido',
  COTIZACION_CANTIDAD_INVALIDA: 'Cantidad inválida',
  COTIZACION_PRODUCTO_SIN_PRECIO: 'Producto sin precio',
  COTIZACION_PRODUCTO_NO_ENCONTRADO: 'Producto no encontrado',
  COTIZACION_DOCUMENTO_ERROR: 'No se pudo generar el documento',
  COTIZACION_ERROR_INTERNO: 'Error al procesar la cotización',
  SERIE_INVALIDA: 'Serie inválida',
  SERIE_NO_CONFIGURADA: 'Configure series en Configuración',
  INVENTARIO_STOCK_NEGATIVO: 'Stock insuficiente',
  RECEPCION_SIN_ITEMS: 'Sin productos en recepción',
  COMPROBANTE_EMISION_FALLIDA: 'Error al emitir comprobante',
  REPORTE_PERIODO_INVALIDO: 'Periodo inválido',
  REPORTE_FECHA_INVALIDA: 'Fechas inválidas',
  REPORTE_EXPORT_FALLIDA: 'No se pudo exportar',
  // Generados por el front (interceptor)
  SIN_CONEXION: 'Sin conexión',
  SERVIDOR_NO_DISPONIBLE: 'Servidor no disponible',
  TIEMPO_AGOTADO: 'El servidor no respondió a tiempo',
  SIN_PERMISO: 'Sin permiso',
  ARCHIVO_MUY_GRANDE: 'Archivo demasiado grande',
  DEMASIADAS_SOLICITUDES: 'Demasiados intentos',
};

/** Títulos de modal por código del backend o del interceptor. */
export const TITULOS_ERROR: Readonly<Record<string, string>> = TITULOS;
/** Pista corta ("qué hacer ahora") por código. */
export const HINTS_ERROR: Readonly<Record<string, string>> = HINTS;

/* ===========================================================================
 * Traducción de textos por defecto de NestJS / Express / class-validator
 * ======================================================================== */

const TRADUCCIONES_EXACTAS: Readonly<Record<string, string>> = {
  'forbidden resource': MENSAJE_SIN_PERMISO,
  forbidden: MENSAJE_SIN_PERMISO,
  'not found': MENSAJE_NO_ENCONTRADO,
  'bad request': MENSAJE_DATOS_INVALIDOS,
  'unprocessable entity': MENSAJE_DATOS_INVALIDOS,
  unauthorized: 'No pudimos verificar tu identidad. Vuelve a iniciar sesión.',
  conflict: 'Ya existe un registro con esos datos.',
  'payload too large': MENSAJE_ARCHIVO_MUY_GRANDE,
  'request entity too large': MENSAJE_ARCHIVO_MUY_GRANDE,
  'file too large': MENSAJE_ARCHIVO_MUY_GRANDE,
  'too many requests': MENSAJE_DEMASIADAS_SOLICITUDES,
  'throttlerexception: too many requests': MENSAJE_DEMASIADAS_SOLICITUDES,
  'request timeout': MENSAJE_TIEMPO_AGOTADO,
  'service unavailable': MENSAJE_SERVIDOR_NO_DISPONIBLE,
  'bad gateway': MENSAJE_SERVIDOR_NO_DISPONIBLE,
  'gateway timeout': MENSAJE_SERVIDOR_NO_DISPONIBLE,
  'application failed to respond': MENSAJE_SERVIDOR_NO_DISPONIBLE,
  'method not allowed': MENSAJE_FUNCION_NO_DISPONIBLE,
  'not implemented': 'Esta función aún no está disponible.',
  'unsupported media type': 'El tipo de archivo no es compatible.',
  'unexpected field': 'El archivo se envió en un campo no esperado. Actualiza la página e inténtalo de nuevo.',
  'validation failed (numeric string is expected)': 'El identificador debe ser numérico.',
  'validation failed (uuid is expected)': 'El identificador no es válido.',
};

type Traductor = (m: RegExpMatchArray) => string;

/** Mensajes en inglés de class-validator y de las rutas inexistentes de Nest. */
const PATRONES: ReadonlyArray<readonly [RegExp, Traductor]> = [
  [/^cannot (get|post|put|patch|delete|head|options) \S+$/i, () => MENSAJE_FUNCION_NO_DISPONIBLE],
  [/^property (\S+) should not exist$/i, (m) => `El campo ${campo(m[1])} no está permitido.`],
  [/^(\S+) should not be (empty|null or undefined)$/i, (m) => `El campo ${campo(m[1])} es obligatorio.`],
  [/^(\S+) must be an email$/i, (m) => `El campo ${campo(m[1])} debe ser un correo válido.`],
  [/^(\S+) must be a string$/i, (m) => `El campo ${campo(m[1])} debe ser texto.`],
  [/^(\S+) must be a number( conforming to the specified constraints)?$/i, (m) => `El campo ${campo(m[1])} debe ser un número.`],
  [/^(\S+) must be an integer number$/i, (m) => `El campo ${campo(m[1])} debe ser un número entero.`],
  [/^(\S+) must be a positive number$/i, (m) => `El campo ${campo(m[1])} debe ser mayor que cero.`],
  [/^(\S+) must be a negative number$/i, (m) => `El campo ${campo(m[1])} debe ser menor que cero.`],
  [/^(\S+) must be a boolean value$/i, (m) => `El campo ${campo(m[1])} debe ser sí o no.`],
  [/^(\S+) must be a valid ISO 8601 date string$/i, (m) => `El campo ${campo(m[1])} debe ser una fecha válida.`],
  [/^(\S+) must be a Date instance$/i, (m) => `El campo ${campo(m[1])} debe ser una fecha válida.`],
  [/^(\S+) must be an array$/i, (m) => `El campo ${campo(m[1])} debe ser una lista.`],
  [/^(\S+) must be an object$/i, (m) => `El campo ${campo(m[1])} no tiene el formato correcto.`],
  [/^(\S+) must be a UUID$/i, (m) => `El campo ${campo(m[1])} no es un identificador válido.`],
  [/^(\S+) must be a URL address$/i, (m) => `El campo ${campo(m[1])} debe ser una dirección web válida.`],
  [/^(\S+) must be a valid phone number$/i, (m) => `El campo ${campo(m[1])} debe ser un teléfono válido.`],
  [/^(\S+) must be a number string$/i, (m) => `El campo ${campo(m[1])} debe contener solo números.`],
  [/^(\S+) must match .+ regular expression$/i, (m) => `El campo ${campo(m[1])} no tiene el formato correcto.`],
  [
    /^(\S+) must be longer than or equal to (\d+) characters?$/i,
    (m) => `El campo ${campo(m[1])} debe tener al menos ${m[2]} caracteres.`,
  ],
  [
    /^(\S+) must be shorter than or equal to (\d+) characters?$/i,
    (m) => `El campo ${campo(m[1])} debe tener como máximo ${m[2]} caracteres.`,
  ],
  [/^(\S+) must not be less than (-?[\d.]+)$/i, (m) => `El campo ${campo(m[1])} no puede ser menor que ${m[2]}.`],
  [/^(\S+) must not be greater than (-?[\d.]+)$/i, (m) => `El campo ${campo(m[1])} no puede ser mayor que ${m[2]}.`],
  [
    /^(\S+) must contain at least (\d+) elements?$/i,
    (m) => `El campo ${campo(m[1])} debe tener al menos ${m[2]} elemento(s).`,
  ],
  [
    /^(\S+) must be one of the following values: (.+)$/i,
    (m) => `El campo ${campo(m[1])} debe ser uno de estos valores: ${m[2]}.`,
  ],
  [/^each value in (\S+) must be .+$/i, (m) => `Uno de los valores de ${campo(m[1])} no es válido.`],
];

/** `cliente.numero_documento` → «numero documento». */
function campo(ruta: string | undefined): string {
  const partes = String(ruta ?? '')
    .split('.')
    .filter((p) => p && !/^\d+$/.test(p));
  const nombre = (partes[partes.length - 1] ?? 'dato')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return `«${nombre}»`;
}

/**
 * Traduce los textos por defecto (en inglés) de NestJS, Express, Multer y
 * class-validator. Los mensajes propios del backend (en español) pasan intactos.
 */
export function traducirMensajeServidor(texto: string): string {
  const limpio = String(texto ?? '').trim();
  if (!limpio) return '';
  const exacta = TRADUCCIONES_EXACTAS[limpio.replace(/\.$/, '').toLowerCase()];
  if (exacta) return exacta;
  for (const [patron, traducir] of PATRONES) {
    const m = limpio.match(patron);
    if (m) return traducir(m);
  }
  return limpio;
}

/* ===========================================================================
 * Lectura de errores
 * ======================================================================== */

/** Máximo de caracteres que se muestran de un mensaje del servidor. */
const LARGO_MAXIMO = 400;

/** Mensajes técnicos que nunca deben verse en pantalla. */
const PATRON_TECNICO =
  /^(Http failure|Cannot read propert|Cannot set propert|undefined is not|null is not|[\w$.]+ is not a function|[\w$.]+ is not defined|Unexpected token|Unexpected end of JSON|NG0\d+|ChunkLoadError|Loading chunk|TypeError|SyntaxError|ReferenceError|RangeError|Maximum call stack)/i;

const PATRON_RED_NAVEGADOR = /^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource)/i;

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  if (!valor || typeof valor !== 'object') return false;
  const proto = Object.getPrototypeOf(valor);
  return proto === Object.prototype || proto === null;
}

function esHtml(texto: string): boolean {
  return /^\s*</.test(texto);
}

/** Texto útil para el usuario o '' (descarta HTML de proxies, vacíos y JSON crudo). */
function textoUtil(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  const t = valor.trim();
  if (!t || esHtml(t)) return '';
  return t.length > LARGO_MAXIMO ? `${t.slice(0, LARGO_MAXIMO - 1)}…` : t;
}

/** Interpreta un cuerpo de texto que en realidad es JSON (responseType 'text'). */
function intentarJson(texto: string): Record<string, unknown> | null {
  const t = texto.trim();
  if (!t.startsWith('{')) return null;
  try {
    const valor: unknown = JSON.parse(t);
    return esObjetoPlano(valor) ? valor : null;
  } catch {
    return null;
  }
}

/** Mensajes crudos del cuerpo: `message` (texto o arreglo), `mensaje` o `error`. */
function mensajesCrudos(cuerpo: Record<string, unknown>): string[] {
  const { message, mensaje, error, detail } = cuerpo as {
    message?: unknown;
    mensaje?: unknown;
    error?: unknown;
    detail?: unknown;
  };
  if (Array.isArray(message)) {
    return message.map((m) => textoUtil(typeof m === 'string' ? m : (m as { message?: unknown })?.message)).filter(Boolean);
  }
  for (const candidato of [message, mensaje, detail]) {
    const t = textoUtil(candidato);
    if (t) return [t];
  }
  const e = textoUtil(error);
  return e ? [e] : [];
}

/** Une varias frases sin dobles puntos: ["a.", "b"] → "a. b". */
function unirMensajes(lista: readonly string[]): string {
  if (lista.length <= 1) return lista[0] ?? '';
  return lista.map((m) => m.trim().replace(/[.\s]+$/, '')).join('. ') + '.';
}

function sinDuplicados(lista: readonly string[]): string[] {
  return Array.from(new Set(lista.filter(Boolean)));
}

/** Estado HTTP del error o null si no es un error HTTP. */
export function estadoDeError(error: unknown): number | null {
  const s = (error as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : null;
}

/** Texto genérico (en español) para un estado HTTP sin mensaje del servidor. */
export function mensajePorEstado(estado: number): string {
  if (estado === 0) return MENSAJE_SIN_CONEXION;
  if (estado === 400 || estado === 422) return MENSAJE_DATOS_INVALIDOS;
  if (estado === 401) return 'Tu sesión no es válida. Vuelve a iniciar sesión.';
  if (estado === 403) return MENSAJE_SIN_PERMISO;
  if (estado === 404) return MENSAJE_NO_ENCONTRADO;
  if (estado === 405) return MENSAJE_FUNCION_NO_DISPONIBLE;
  if (estado === 408) return MENSAJE_TIEMPO_AGOTADO;
  if (estado === 409) return 'Ya existe un registro con esos datos o cambió mientras lo editabas.';
  if (estado === 413) return MENSAJE_ARCHIVO_MUY_GRANDE;
  if (estado === 415) return 'El tipo de archivo no es compatible.';
  if (estado === 429) return MENSAJE_DEMASIADAS_SOLICITUDES;
  if (estado === 501) return 'Esta función aún no está disponible.';
  if (estado >= 502 && estado <= 504) return MENSAJE_SERVIDOR_NO_DISPONIBLE;
  if (estado >= 500) return MENSAJE_ERROR_SERVIDOR;
  return 'No se pudo completar la operación.';
}

function codigoPorEstado(estado: number): string {
  if (estado === 0) return CODIGOS_ERROR.SIN_CONEXION;
  if (estado === 403) return CODIGOS_ERROR.SIN_PERMISO;
  if (estado === 408) return CODIGOS_ERROR.TIEMPO_AGOTADO;
  if (estado === 413) return CODIGOS_ERROR.ARCHIVO_MUY_GRANDE;
  if (estado === 429) return CODIGOS_ERROR.DEMASIADAS_SOLICITUDES;
  if (estado >= 502 && estado <= 504) return CODIGOS_ERROR.SERVIDOR_NO_DISPONIBLE;
  if (estado >= 500) return CODIGOS_ERROR.ERROR_SERVIDOR;
  return '';
}

function esInternalServerError(texto: string): boolean {
  return /^internal server error\.?$/i.test(texto.trim());
}

/**
 * Normaliza el cuerpo de un error HTTP (lo usa el interceptor).
 * Resultado: `message` siempre en español y nunca vacío, `mensajes` con cada
 * validación, `codigo` del backend o deducido del estado, y el resto de campos
 * del backend intactos (p. ej. `producto` en un 409).
 */
export function normalizarCuerpoError(estado: number, cuerpo: unknown, metodo = 'GET'): CuerpoErrorApi {
  const objeto: Record<string, unknown> = esObjetoPlano(cuerpo)
    ? { ...cuerpo }
    : typeof cuerpo === 'string'
      ? (intentarJson(cuerpo) ?? (textoUtil(cuerpo) ? { message: textoUtil(cuerpo) } : {}))
      : {};

  const codigoPrevio = typeof objeto['codigo'] === 'string' ? (objeto['codigo'] as string) : '';
  const codigo = codigoPrevio || codigoPorEstado(estado);

  let mensajes = sinDuplicados(mensajesCrudos(objeto).map(traducirMensajeServidor));

  // En fallos de transporte o de límites, el texto del proxy/servidor no le sirve al usuario.
  if (estado === 0) {
    mensajes = [codigo === CODIGOS_ERROR.TIEMPO_AGOTADO ? MENSAJE_TIEMPO_AGOTADO : MENSAJE_SIN_CONEXION];
  } else if (estado >= 502 && estado <= 504) {
    mensajes = [MENSAJE_SERVIDOR_NO_DISPONIBLE];
  } else if (estado === 413) {
    mensajes = [MENSAJE_ARCHIVO_MUY_GRANDE];
  } else if (estado === 429 && !codigoPrevio) {
    mensajes = [MENSAJE_DEMASIADAS_SOLICITUDES];
  } else if (estado >= 500 && mensajes.every(esInternalServerError)) {
    mensajes = [MENSAJE_ERROR_SERVIDOR];
  }
  if (!mensajes.length) mensajes = [mensajePorEstado(estado)];

  const idPeticion = textoUtil(objeto['idPeticion']) || textoUtil(objeto['requestId']) || undefined;

  return {
    ...objeto,
    statusCode: typeof objeto['statusCode'] === 'number' ? (objeto['statusCode'] as number) : estado,
    message: unirMensajes(mensajes),
    mensajes,
    error: typeof objeto['error'] === 'string' ? (objeto['error'] as string) : undefined,
    codigo: codigo || undefined,
    idPeticion,
    metodo: String(metodo || 'GET').toUpperCase(),
  };
}

/**
 * Saca un mensaje legible (en español) de cualquier error.
 *
 * NestJS devuelve `message` como texto o como arreglo cuando falla la
 * validación; ambos casos se unen con '. '. Nunca devuelve HTML de un proxy,
 * "[object Object]" ni textos técnicos como "Http failure response…".
 */
export function mensajeDeError(error: any, porDefecto = POR_DEFECTO_HISTORICO): string {
  if (error == null) return porDefecto;
  if (typeof error === 'string') return textoUtil(error) || porDefecto;

  const estado = estadoDeError(error);
  let cuerpo: unknown = error?.error;
  if (typeof cuerpo === 'string') {
    const json = intentarJson(cuerpo);
    if (json) {
      cuerpo = json;
    } else {
      const texto = textoUtil(cuerpo);
      if (texto) return traducirMensajeServidor(texto);
    }
  }

  if (esObjetoPlano(cuerpo)) {
    const lista = sinDuplicados(mensajesCrudos(cuerpo).map(traducirMensajeServidor));
    if (lista.length) {
      // Nest responde "Internal server error" (sin detalle) ante errores no controlados.
      if (lista.every((m) => esInternalServerError(m) || m === MENSAJE_ERROR_SERVIDOR)) {
        return `${porDefecto}${SUFIJO_ERROR_INTERNO}`;
      }
      return unirMensajes(lista);
    }
  }

  if (estado !== null && (estado === 0 || estado >= 400)) {
    if (estado >= 500 && estado !== 501 && !(estado >= 502 && estado <= 504)) {
      return `${porDefecto}${SUFIJO_ERROR_INTERNO}`;
    }
    return mensajePorEstado(estado);
  }

  const mensaje = textoUtil(error?.message);
  if (mensaje && PATRON_RED_NAVEGADOR.test(mensaje)) return MENSAJE_SIN_CONEXION;
  if (mensaje && !PATRON_TECNICO.test(mensaje)) return mensaje;
  return porDefecto;
}

/**
 * Cuando el request usa `responseType: 'blob'`, Nest manda el JSON de error
 * también como Blob. El interceptor ya lo lee; esto queda para llamadas que
 * construyen el error a mano.
 */
export async function normalizarErrorBlob(error: any): Promise<any> {
  const cuerpo = error?.error;
  if (!(typeof Blob !== 'undefined' && cuerpo instanceof Blob)) {
    return error;
  }
  try {
    const texto = await cuerpo.text();
    if (!texto?.trim()) return error;
    try {
      return { ...error, status: error?.status, error: JSON.parse(texto) };
    } catch {
      return { ...error, status: error?.status, error: { message: texto } };
    }
  } catch {
    return error;
  }
}

/** Código estable enviado por el backend o puesto por el interceptor (`error.error.codigo`). */
export function codigoDeError(error: any): string {
  const c = error?.error?.codigo;
  return typeof c === 'string' ? c : '';
}

/** Identificador de la petición para soporte (`error.error.idPeticion`), si el backend lo envía. */
export function idPeticionDeError(error: unknown): string {
  const id = (error as { error?: { idPeticion?: unknown } } | null)?.error?.idPeticion;
  return typeof id === 'string' ? id : '';
}

/** true si la capa global (interceptor) ya avisó al usuario de este error. */
export function yaNotificado(error: unknown): boolean {
  return (error as { error?: { notificado?: unknown } } | null)?.error?.notificado === true;
}

/** Fallo de red o de disponibilidad: status 0/408/502/503/504 o código de transporte. */
export function esErrorDeRed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ((error as { name?: unknown }).name === 'TimeoutError') return true;
  const codigo = codigoDeError(error);
  if (CODIGOS_TRANSPORTE.has(codigo)) return true;
  const estado = estadoDeError(error);
  if (estado === null) return false;
  return estado === 0 || estado === 408 || (estado >= 502 && estado <= 504);
}

/** Lista de validaciones del cuerpo normalizado (vacía si solo hay un mensaje). */
export function mensajesDeValidacion(error: unknown): string[] {
  const lista = (error as { error?: { mensajes?: unknown } } | null)?.error?.mensajes;
  return Array.isArray(lista) ? lista.filter((m): m is string => typeof m === 'string' && !!m) : [];
}

/* ===========================================================================
 * Descripción lista para mostrar (modal o toast)
 * ======================================================================== */

export interface DescripcionError {
  titulo: string;
  mensaje: string;
  /** Validaciones por separado cuando hay más de una. */
  mensajes: readonly string[];
  pista: string;
  codigo: string;
  estado: number | null;
  idPeticion: string;
  transporte: boolean;
  notificado: boolean;
}

const POR_DEFECTO_GENERICOS = new Set([
  '',
  POR_DEFECTO_HISTORICO.toLowerCase(),
  'ocurrió un error inesperado.',
  'no se pudo completar la operación',
  'no se pudo completar la operación.',
  'no se pudo completar',
]);

function esPorDefectoGenerico(texto: string): boolean {
  return POR_DEFECTO_GENERICOS.has(String(texto ?? '').trim().toLowerCase());
}

function mismoTexto(a: string, b: string): boolean {
  const n = (t: string) => t.trim().replace(/[.\s]+$/, '').toLowerCase();
  return n(a) === n(b);
}

/**
 * Título + mensaje + pista de un error, con las reglas de toda la app:
 * - título: el explícito; si no, el del código de negocio; si no, `porDefecto`
 *   ("No se pudo guardar…"). En fallos de red se conserva `porDefecto`, que dice
 *   qué no se hizo.
 * - mensaje: el del servidor en español (vacío si repite el título).
 */
export function describirError(
  error: unknown,
  porDefecto = 'No se pudo completar la operación',
  tituloExplicito?: string,
): DescripcionError {
  const codigo = codigoDeError(error);
  const transporte = esErrorDeRed(error);
  const generico = esPorDefectoGenerico(porDefecto);
  const tituloCodigo = TITULOS[codigo] ?? '';

  const titulo =
    String(tituloExplicito ?? '').trim() ||
    (tituloCodigo && (!transporte || generico) ? tituloCodigo : '') ||
    (generico ? 'No se pudo completar' : porDefecto);

  let mensaje = mensajeDeError(error, generico ? POR_DEFECTO_HISTORICO : porDefecto);
  // El título ya dice qué falló: no repetirlo en "<porDefecto> (error interno del servidor)".
  if (mensaje.endsWith(SUFIJO_ERROR_INTERNO)) mensaje = MENSAJE_ERROR_SERVIDOR;
  if (mismoTexto(mensaje, titulo)) mensaje = '';

  const lista = mensajesDeValidacion(error);
  return {
    titulo,
    mensaje,
    mensajes: lista.length > 1 ? lista : [],
    pista: HINTS[codigo] ?? '',
    codigo,
    estado: estadoDeError(error),
    idPeticion: idPeticionDeError(error),
    transporte,
    notificado: yaNotificado(error),
  };
}

/**
 * Cuerpo HTML seguro (todo escapado) para un modal de error:
 * mensaje o lista de validaciones, pista y código de soporte.
 */
export function htmlDeDescripcion(d: DescripcionError): string {
  const partes: string[] = [];
  if (d.mensajes.length > 1) {
    partes.push(`<ul class="hs-swal-lista">${d.mensajes.map((m) => `<li>${escapeHtmlAlerta(m)}</li>`).join('')}</ul>`);
  } else if (d.mensaje) {
    partes.push(escapeHtmlAlerta(d.mensaje));
  } else if (!d.pista) {
    partes.push(
      escapeHtmlAlerta(
        d.estado !== null && d.estado >= 500 ? HINTS['ERROR_SERVIDOR'] ?? '' : 'Inténtalo de nuevo en unos segundos.',
      ),
    );
  }
  if (d.pista) partes.push(`<small class="hs-swal-pista">${escapeHtmlAlerta(d.pista)}</small>`);
  if (d.idPeticion) {
    partes.push(`<small class="hs-swal-soporte">Código de soporte: <code>${escapeHtmlAlerta(d.idPeticion)}</code></small>`);
  }
  return partes.join('');
}

/**
 * Para SweetAlert: título + mensaje + pista según el código del backend.
 * Compatible con errores viejos (sin código). El mensaje ya viene escapado:
 * se usa con `allowHtml: true` en AlertService. `notificado` permite a
 * AlertService no repetir un error que la capa global ya avisó.
 */
export function errorOperativo(
  error: any,
  porDefecto = POR_DEFECTO_HISTORICO,
): { title: string; message: string; codigo: string; allowHtml: true; notificado: boolean } {
  const d = describirError(error, porDefecto);
  return {
    codigo: d.codigo,
    title: d.titulo,
    message: htmlDeDescripcion(d),
    allowHtml: true,
    notificado: d.notificado,
  };
}

/* ===========================================================================
 * Texto ↔ HTML
 * ======================================================================== */

/** Escapa texto dinámico antes de insertarlo en HTML de SweetAlert. */
export function escapeHtmlAlerta(texto: string): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ENTIDADES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  nbsp: ' ',
  '#39': "'",
  '#039': "'",
  '#x27': "'",
};

/**
 * Deshace el escape de escapeHtml/escapeHtmlAlerta (una sola pasada). Se usa
 * para mostrar como texto títulos que algunas pantallas aún escapan a mano.
 * El resultado debe ir a textContent/interpolación, nunca a innerHTML.
 */
export function decodificarEntidadesHtml(texto: string): string {
  return String(texto ?? '').replace(/&(amp|lt|gt|quot|nbsp|#39|#039|#x27);/gi, (m, e: string) => ENTIDADES[e.toLowerCase()] ?? m);
}

/** Convierte HTML propio de un aviso (con <br>, <strong>…) en texto plano de una línea. */
export function htmlATextoPlano(html: string): string {
  return decodificarEntidadesHtml(
    String(html ?? '')
      .replace(/<\s*br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Atajo de tipo para quien solo necesita saber si es un HttpErrorResponse. */
export function esErrorHttp(error: unknown): error is HttpErrorResponse {
  return error instanceof HttpErrorResponse;
}
