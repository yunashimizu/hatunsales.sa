import { ComprobanteDetalle } from '../../../../models/documentos.models';
import { PagoDetalle, PreviewComprobante } from '../../../../models/admin.models';

/**
 * Modelo de vista de la hoja del comprobante y sus adaptadores.
 *
 * La hoja HTML copia la estructura del PDF real (hatunsales/src/util/documentos/comprobante-pdf.ts:
 * `dibujarA4`, `filasCliente`, `filasDocumento`, `filasTotales`, `UNIDADES`, `leyenda`, `esConsumidorFinal`).
 * Si cambian los rótulos o las reglas allá, hay que cambiarlos aquí: el spec de la hoja repite la lista
 * de rótulos del spec de paridad del back (comprobante-pdf.paridad.spec.ts).
 *
 * Todo lo de este archivo es puro (sin Angular ni red).
 */

// ── Modelo ────────────────────────────────────────────────────────

/** Catálogo 01 de SUNAT. */
export type TipoHoja = '01' | '03' | '07' | '08';

export interface HojaEmisor {
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  direccion: string;
  ubicacion: string;
  telefono: string | null;
  email: string | null;
  /** Tal como llega de la API (la hoja la resuelve con `urlMedia`). */
  logoUrl: string | null;
}

export interface HojaCliente {
  /** Catálogo 06: '0' sin documento, '1' DNI, '4' carné de extranjería, '6' RUC, '7' pasaporte. */
  tipoDoc: string;
  numDoc: string;
  nombre: string;
  direccion: string;
  /** Correo del cliente (fila CORREO); vacío si no hay. */
  email?: string;
}

export interface HojaReferencia {
  /** «FACTURA ELECTRÓNICA F001-00000012». */
  documento: string;
  motivo: string;
  sustento: string;
}

export interface HojaItem {
  codigo: string;
  /** Código del catálogo 03 (NIU, ZZ…): la hoja lo abrevia como el PDF. */
  unidad: string;
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  precioUnitario: number;
  descuento: number;
  importe: number;
}

export interface HojaTotales {
  gravada: number;
  exonerada: number;
  inafecta: number;
  descuentos: number;
  igv: number;
  porcentajeIgv: number;
  total: number;
}

export interface HojaCuota {
  numero: number;
  monto: number;
  /** dd/mm/aaaa */
  fechaPago: string;
}

/**
 * Recuadro del QR: la hoja no genera QR (no hay librería en el front).
 * - `pendiente`: vista previa; el QR y el hash se generan al emitir.
 * - `emitido`: hay firma; se muestra el hash y se indica que el QR va impreso en el PDF.
 * - `sin-firma`: comprobante guardado pero sin firma electrónica.
 */
export interface HojaQr {
  modo: 'pendiente' | 'emitido' | 'sin-firma';
  hash: string | null;
}

export interface HojaComprobante {
  /** Texto para lectores de pantalla (aria-label del documento). */
  etiqueta: string;
  emisor: HojaEmisor;
  tipo: TipoHoja | null;
  /** «BOLETA DE VENTA ELECTRÓNICA» (con tilde, como el PDF). */
  titulo: string;
  /** «F001-00000123» */
  serieNumero: string;
  /** dd/mm/aaaa */
  fechaEmision: string;
  /** HH:mm:ss; en la vista previa no existe y no se inventa. */
  horaEmision: string | null;
  /** dd/mm/aaaa; solo se informa si es crédito. */
  fechaVencimiento: string | null;
  moneda: { simbolo: string; nombre: string };
  cliente: HojaCliente;
  referencia: HojaReferencia | null;
  items: HojaItem[];
  totales: HojaTotales;
  importeEnLetras: string;
  formaPago: 'Contado' | 'Credito' | null;
  cuotas: HojaCuota[];
  medioPago: string | null;
  observaciones: string | null;
  /** «T001-00000045»: guía de remisión relacionada (fila GUÍA DE REMISIÓN). */
  guiaRemision: string | null;
  /** Fila ATENDIDO POR. */
  atendidoPor: string | null;
  /** Fila SUCURSAL. */
  sucursal: string | null;
  /** Solo si SUNAT lo aceptó; `fecha` = dd/mm/aaaa hh:mm de la constancia si se conoce. */
  aceptado: { fecha: string | null } | null;
  ambiente: 'beta' | 'produccion' | null;
  /** Aviso de estado (ámbar), p. ej. «PENDIENTE DE ENVÍO A SUNAT». */
  aviso: string | null;
  /** Dibuja la sección «FORMA DE PAGO: CRÉDITO» (en el detalle ya existe fuera de la hoja). */
  mostrarCredito: boolean;
  /** null = no dibuja el recuadro del QR. */
  qr: HojaQr | null;
}

export interface OpcionesHojaPreview {
  /** Nombres de los medios de pago elegidos (informativo). */
  medioPago?: string | null;
  /** Por defecto true. */
  mostrarCredito?: boolean;
  /** Por defecto true. */
  mostrarQr?: boolean;
}

export interface OpcionesHojaDetalle {
  /** Por defecto false: el detalle ya muestra las cuotas debajo de la hoja. */
  mostrarCredito?: boolean;
  /** Por defecto false: el detalle ya muestra el hash y el QR debajo de la hoja. */
  mostrarQr?: boolean;
}

// ── Constantes copiadas literalmente del PDF ──────────────────────

/** Texto de la marca de las pruebas en BETA (AVISO_BETA_PDF del PDF). */
export const AVISO_BETA_HOJA = 'PRUEBA SUNAT BETA - SIN VALIDEZ TRIBUTARIA';

/** Pie común de los documentos (MENSAJE_PIE_DOCUMENTO del back). */
export const MENSAJE_PIE_HOJA = 'Gracias por su preferencia';

/** Línea del estado aceptado (TEXTO_ACEPTADO_SUNAT del PDF). */
export const TEXTO_ACEPTADO_HOJA = 'Aceptado por SUNAT';

export const TITULOS: Record<TipoHoja, string> = {
  '01': 'FACTURA ELECTRÓNICA',
  '03': 'BOLETA DE VENTA ELECTRÓNICA',
  '07': 'NOTA DE CRÉDITO ELECTRÓNICA',
  '08': 'NOTA DE DÉBITO ELECTRÓNICA',
};

const NOMBRES_LEYENDA: Record<TipoHoja, string> = {
  '01': 'Factura Electrónica',
  '03': 'Boleta de Venta Electrónica',
  '07': 'Nota de Crédito Electrónica',
  '08': 'Nota de Débito Electrónica',
};

/** Catálogo 06 en palabras. */
export const TIPOS_DOCUMENTO: Record<string, string> = {
  '0': 'Doc. trib. no dom.',
  '1': 'DNI',
  '4': 'Carné de extranjería',
  '6': 'RUC',
  '7': 'Pasaporte',
  A: 'Cédula diplomática',
  B: 'Doc. país de residencia',
};

/** Catálogo 03 (unidades) en abreviaturas legibles; los demás códigos se imprimen tal cual. */
export const UNIDADES: Record<string, string> = {
  NIU: 'UND',
  ZZ: 'SERV',
  KGM: 'KG',
  GRM: 'G',
  MTR: 'M',
  MTK: 'M2',
  MTQ: 'M3',
  LTR: 'L',
  GLL: 'GAL',
  BX: 'CAJA',
  PK: 'PAQ',
  SET: 'JGO',
  PR: 'PAR',
  DZN: 'DOC',
  CEN: 'CIENTO',
  MIL: 'MILLAR',
  RO: 'ROLLO',
  BG: 'BOLSA',
  TNE: 'T',
};

const MONEDAS = {
  PEN: { simbolo: 'S/', nombre: 'SOLES (PEN)' },
  USD: { simbolo: 'US$', nombre: 'DÓLARES AMERICANOS (USD)' },
} as const;

/** Rótulos de la tabla, en el orden del PDF (`columnasTabla`). */
export const COLUMNAS_TABLA = [
  'CANT.',
  'UNIDAD',
  'DESCRIPCIÓN',
  'V. UNIT.',
  'P. UNIT.',
  'DESC.',
  'IMPORTE',
] as const;

// ── Formatos (mismas reglas que el PDF) ───────────────────────────

/** Texto plano: espacios colapsados y recortados. */
export function limpiar(valor: unknown): string {
  return String(valor ?? '').replace(/\s+/g, ' ').trim();
}

/** Redondeo decimal sin el error binario de toFixed (1.005 -> 1.01). */
export function redondear(valor: number, decimales: number): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  const exacto = Number(`${Math.round(Number(`${Math.abs(n)}e${decimales}`))}e-${decimales}`);
  return Number.isFinite(exacto)
    ? exacto * Math.sign(n)
    : Math.round(n * 10 ** decimales) / 10 ** decimales;
}

function conMiles(valor: number, decimales: number): string {
  const n = redondear(valor, decimales);
  const [entero, fraccion] = Math.abs(n).toFixed(decimales).split('.');
  const signo = n < 0 ? '-' : '';
  return `${signo}${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraccion ? `.${fraccion}` : ''}`;
}

export function monto(valor: number): string {
  return conMiles(valor, 2);
}

/** Valores unitarios: entre 2 y 4 decimales. */
export function unitario(valor: number): string {
  return conMiles(valor, 4)
    .replace(/(\.\d\d\d?)0+$/, '$1')
    .replace(/(\.\d\d)0$/, '$1');
}

export function cantidad(valor: number): string {
  return conMiles(valor, 3).replace(/\.?0+$/, '');
}

export function porcentaje(valor: number): string {
  return conMiles(valor, 2).replace(/\.?0+$/, '');
}

/**
 * Fechas de la API (dd-mm-aaaa o aaaa-mm-dd, con hora opcional) a dd/mm/aaaa.
 * Lo que ya viene como dd/mm/aaaa, o no se reconoce, queda igual.
 */
export function fechaDdMmAaaa(valor: string | null | undefined): string {
  const texto = limpiar(valor);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(texto);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const local = /^(\d{2})-(\d{2})-(\d{4})(?:$|[T\s])/.exec(texto);
  if (local) return `${local[1]}/${local[2]}/${local[3]}`;
  return texto;
}

/** Unidad del catálogo 03 abreviada como en el PDF; lo desconocido se imprime tal cual. */
export function unidadLegible(codigo: string | null | undefined): string {
  const limpio = limpiar(codigo).toUpperCase();
  return UNIDADES[limpio] ?? limpio;
}

/** Misma regla que `esConsumidorFinal` del back (sunat.catalogos.ts). */
export function esConsumidorFinal(
  tipoDoc: string | number | null | undefined,
  numDoc: string | null | undefined,
): boolean {
  const tipo = String(tipoDoc ?? '').trim();
  const numero = String(numDoc ?? '').trim();
  if (tipo === '' || tipo === '0') return true;
  return numero === '' || numero === '-' || /^0+$/.test(numero);
}

/** «SON: …»: antepone el rótulo si el texto no lo trae. */
export function conSon(letras: string | null | undefined): string {
  const texto = limpiar(letras);
  if (!texto) return '';
  return /^SON\b/i.test(texto) ? texto : `SON: ${texto}`;
}

/** «1 ítem» / «7 ítems» (`textoCantidadItems` del PDF). */
export function textoCantidadItems(cantidadItems: number): string {
  const n = Math.max(0, Math.trunc(Number(cantidadItems) || 0));
  return `${n} ${n === 1 ? 'ítem' : 'ítems'}`;
}

/** Medio de pago con montos, recibido y vuelto (`describirMedioPago` del PDF). */
export function describirMedioPago(pagos: PagoDetalle[] | null | undefined, simbolo = 'S/'): string {
  const validos = (pagos ?? []).filter((p) => limpiar(p?.metodo));
  if (!validos.length) return '';
  const partes = validos.map((p) =>
    Number(p.monto) > 0 ? `${limpiar(p.metodo)} ${simbolo} ${monto(Number(p.monto))}` : limpiar(p.metodo),
  );
  const recibido = validos.reduce((s, p) => s + (Number(p.monto_recibido) || 0), 0);
  const vuelto = validos.reduce((s, p) => s + (Number(p.vuelto) || 0), 0);
  if (recibido > 0) partes.push(`Recibido ${simbolo} ${monto(recibido)}`);
  if (vuelto > 0) partes.push(`Vuelto ${simbolo} ${monto(vuelto)}`);
  return partes.join(' · ');
}

/** Instante ISO a «dd/mm/aaaa hh:mm» en hora de Lima ('' si no se puede leer). */
export function fechaHoraLima(valor: string | null | undefined): string {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  const p: Record<string, string> = {};
  for (const parte of new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)) p[parte.type] = parte.value;
  return `${p['day']}/${p['month']}/${p['year']} ${p['hour'] === '24' ? '00' : p['hour']}:${p['minute']}`;
}

/** Párrafos de un texto libre: respeta los saltos de línea que escribió el usuario. */
export function parrafos(valor: string | null | undefined): string[] {
  return String(valor ?? '')
    .split(/\r?\n/)
    .map((linea) => limpiar(linea))
    .filter(Boolean);
}

/** «F001-00000123»: correlativo con 8 dígitos, igual que el XML, el QR y el PDF. */
export function formatearSerieNumero(serie: string, numero: number | string): string {
  const n = Number(numero);
  const correlativo =
    Number.isInteger(n) && n >= 0 ? String(n).padStart(8, '0') : String(numero ?? '');
  return `${limpiar(serie)}-${correlativo}`;
}

/** Leyenda impresa al pie del recuadro del QR (`leyenda` del PDF). */
export function leyendaHoja(tipo: TipoHoja | null, titulo: string): string {
  const nombre = tipo ? NOMBRES_LEYENDA[tipo] : capitalizar(titulo);
  return `Representación impresa de la ${nombre}. Consulte su validez en www.sunat.gob.pe`;
}

function capitalizar(texto: string): string {
  const minusculas = limpiar(texto).toLowerCase();
  return minusculas.replace(/(^|\s)(\p{L})/gu, (_t, espacio: string, letra: string) => espacio + letra.toUpperCase());
}

// ── Filas (mismas reglas que el PDF) ──────────────────────────────

export type FilaHoja = [etiqueta: string, valor: string];

/** `filasCliente` del PDF. */
export function filasCliente(c: HojaCliente): FilaHoja[] {
  const tipo = limpiar(c.tipoDoc);
  const numero = limpiar(c.numDoc);
  const filas: FilaHoja[] = [
    [tipo === '6' ? 'Razón social' : 'Cliente', limpiar(c.nombre) || 'CLIENTES VARIOS'],
  ];
  if (esConsumidorFinal(tipo, numero)) filas.push(['Documento', 'Sin documento']);
  else filas.push([TIPOS_DOCUMENTO[tipo] ?? 'Documento', numero]);
  if (limpiar(c.direccion)) filas.push(['Dirección', limpiar(c.direccion)]);
  if (limpiar(c.email)) filas.push(['Correo', limpiar(c.email)]);
  return filas;
}

/** `filasDocumento` del PDF (la hora va en su propia fila, como en el PDF). */
export function filasDocumento(h: HojaComprobante): FilaHoja[] {
  const filas: FilaHoja[] = [['Fecha de emisión', limpiar(h.fechaEmision)]];
  if (limpiar(h.horaEmision)) filas.push(['Hora', limpiar(h.horaEmision)]);
  if (limpiar(h.fechaVencimiento)) filas.push(['Fecha de vencimiento', limpiar(h.fechaVencimiento)]);
  filas.push(['Moneda', h.moneda.nombre]);
  if (h.formaPago) filas.push(['Forma de pago', h.formaPago === 'Credito' ? 'Crédito' : 'Contado']);
  if (limpiar(h.guiaRemision)) filas.push(['Guía de remisión', limpiar(h.guiaRemision)]);
  if (limpiar(h.atendidoPor)) filas.push(['Atendido por', limpiar(h.atendidoPor)]);
  if (limpiar(h.sucursal)) filas.push(['Sucursal', limpiar(h.sucursal)]);
  return filas;
}

/** `filasTotales` del PDF: exonerada e inafecta siempre; Descuentos solo si > 0. */
export function filasTotales(h: HojaComprobante): FilaHoja[] {
  const t = h.totales;
  const s = h.moneda.simbolo;
  const filas: FilaHoja[] = [
    ['Op. gravada', `${s} ${monto(t.gravada)}`],
    ['Op. exonerada', `${s} ${monto(t.exonerada)}`],
    ['Op. inafecta', `${s} ${monto(t.inafecta)}`],
  ];
  if (Number(t.descuentos) > 0) filas.push(['Descuentos', `${s} ${monto(t.descuentos)}`]);
  filas.push([`IGV (${porcentaje(t.porcentajeIgv)}%)`, `${s} ${monto(t.igv)}`]);
  return filas;
}

/** `pendienteCredito` del PDF: la suma de las cuotas o, si no hay, el total. */
export function pendienteCredito(h: HojaComprobante): number {
  if (!h.cuotas.length) return Number(h.totales.total) || 0;
  return redondear(
    h.cuotas.reduce((suma, c) => suma + (Number(c.monto) || 0), 0),
    2,
  );
}

// ── Vista lista para pintar ───────────────────────────────────────

export interface VistaItem {
  cantidad: string;
  unidad: string;
  descripcion: string;
  codigo: string;
  valorUnitario: string;
  precioUnitario: string;
  /** Vacío si la línea no tiene descuento. */
  descuento: string;
  importe: string;
}

export interface VistaHoja {
  h: HojaComprobante;
  /** Nombre comercial solo si difiere de la razón social. */
  nombreComercial: string;
  /** «Telf. … · correo» */
  contacto: string;
  filasCliente: FilaHoja[];
  filasDocumento: FilaHoja[];
  filasReferencia: FilaHoja[];
  items: VistaItem[];
  filasTotales: FilaHoja[];
  total: string;
  son: string;
  pendiente: string;
  cuotas: { numero: string; fechaPago: string; monto: string }[];
  mostrarCredito: boolean;
  medioPago: string[];
  observaciones: string[];
  leyenda: string;
  pie: string;
  /** «7 ítems» bajo la tabla ('' sin líneas). */
  cantidadItems: string;
  /** «Aceptado por SUNAT · 08/11/2026 14:36» o ''. */
  aceptado: string;
  mensajePie: string;
}

export function construirVista(h: HojaComprobante): VistaHoja {
  const s = h.moneda.simbolo;
  const razon = limpiar(h.emisor.razonSocial);
  const comercial = limpiar(h.emisor.nombreComercial);
  return {
    h,
    nombreComercial: comercial && comercial !== razon ? comercial : '',
    contacto: [limpiar(h.emisor.telefono) && `Telf. ${limpiar(h.emisor.telefono)}`, limpiar(h.emisor.email)]
      .filter(Boolean)
      .join('  ·  '),
    filasCliente: filasCliente(h.cliente),
    filasDocumento: filasDocumento(h),
    filasReferencia: h.referencia
      ? [
          ['Documento que modifica', h.referencia.documento],
          ['Motivo', h.referencia.motivo || '—'],
          ['Sustento', h.referencia.sustento],
        ].filter(([etiqueta, valor]) => etiqueta !== 'Sustento' || limpiar(valor)) as FilaHoja[]
      : [],
    items: h.items.map((i) => ({
      cantidad: cantidad(i.cantidad),
      unidad: unidadLegible(i.unidad),
      descripcion: limpiar(i.descripcion) || '—',
      codigo: limpiar(i.codigo),
      valorUnitario: unitario(i.valorUnitario),
      precioUnitario: unitario(i.precioUnitario),
      descuento: Number(i.descuento) ? monto(i.descuento) : '',
      importe: monto(i.importe),
    })),
    filasTotales: filasTotales(h),
    total: `${s} ${monto(h.totales.total)}`,
    son: conSon(h.importeEnLetras),
    pendiente: `${s} ${monto(pendienteCredito(h))}`,
    cuotas: h.cuotas.map((c) => ({
      numero: `Cuota ${String(c.numero).padStart(3, '0')}`,
      fechaPago: limpiar(c.fechaPago),
      monto: `${s} ${monto(c.monto)}`,
    })),
    mostrarCredito: h.mostrarCredito && h.formaPago === 'Credito',
    medioPago: parrafos(h.medioPago),
    observaciones: parrafos(h.observaciones),
    leyenda: leyendaHoja(h.tipo, h.titulo),
    pie: `${h.titulo} ${h.serieNumero} · ${razon}`,
    cantidadItems: h.items.length ? textoCantidadItems(h.items.length) : '',
    aceptado: h.aceptado
      ? (limpiar(h.aceptado.fecha) ? `${TEXTO_ACEPTADO_HOJA} · ${limpiar(h.aceptado.fecha)}` : TEXTO_ACEPTADO_HOJA)
      : '',
    mensajePie: MENSAJE_PIE_HOJA,
  };
}

// ── Adaptadores ───────────────────────────────────────────────────

const TIPO_POR_ID: Record<number, TipoHoja> = { 1: '01', 2: '03', 7: '07', 8: '08' };

/** El back manda `FACTURA ELECTRONICA` sin tilde: se devuelve el título del PDF. */
function tituloDe(idTipo: number | null | undefined, tipoNombre: string): { tipo: TipoHoja | null; titulo: string } {
  const tipo = TIPO_POR_ID[Number(idTipo)] ?? tipoPorNombre(tipoNombre);
  if (tipo) return { tipo, titulo: TITULOS[tipo] };
  return { tipo: null, titulo: limpiar(tipoNombre).toUpperCase() };
}

function tipoPorNombre(nombre: string): TipoHoja | null {
  const n = limpiar(nombre)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (n.startsWith('NOTA DE CREDITO')) return '07';
  if (n.startsWith('NOTA DE DEBITO')) return '08';
  if (n.startsWith('FACTURA')) return '01';
  if (n.startsWith('BOLETA')) return '03';
  return null;
}

function monedaDe(moneda: { nombre: string; simbolo: string }): { simbolo: string; nombre: string } {
  const simbolo = limpiar(moneda?.simbolo);
  const nombre = limpiar(moneda?.nombre).toUpperCase();
  if (simbolo === 'S/' || nombre.startsWith('SOL') || nombre === 'PEN') return { ...MONEDAS.PEN };
  if (simbolo === 'US$' || simbolo === '$' || nombre.startsWith('D') || nombre === 'USD') return { ...MONEDAS.USD };
  return { simbolo: simbolo || 'S/', nombre: limpiar(moneda?.nombre) };
}

function ambienteDe(valor: string | null | undefined): 'beta' | 'produccion' | null {
  return valor === 'beta' || valor === 'produccion' ? valor : null;
}

function textoONulo(valor: string | null | undefined): string | null {
  return limpiar(valor) || null;
}

/** Vista previa del POS (`PreviewComprobante`) a la hoja. */
export function hojaDesdePreview(
  p: PreviewComprobante,
  opciones: OpcionesHojaPreview = {},
): HojaComprobante {
  const { tipo, titulo } = tituloDe(p.id_tipo, p.tipo_nombre);
  const credito = p.forma_pago === 'Credito';
  const nota = p.nota;
  return {
    etiqueta: 'Vista previa del comprobante',
    emisor: {
      ruc: limpiar(p.emisor?.ruc),
      razonSocial: limpiar(p.emisor?.razon_social),
      nombreComercial: textoONulo(p.emisor?.nombre_comercial),
      direccion: limpiar(p.emisor?.direccion),
      ubicacion: limpiar(p.emisor?.ubicacion),
      telefono: textoONulo(p.emisor?.telefono),
      email: textoONulo(p.emisor?.email),
      logoUrl: textoONulo(p.emisor?.logo_url),
    },
    tipo,
    titulo,
    serieNumero: p.serie && p.numero != null
      ? formatearSerieNumero(p.serie, p.numero)
      : limpiar(p.numero_formateado),
    fechaEmision: fechaDdMmAaaa(p.fecha_de_emision),
    horaEmision: null,
    fechaVencimiento: credito ? textoONulo(fechaDdMmAaaa(p.fecha_de_vencimiento)) : null,
    moneda: monedaDe(p.moneda),
    cliente: {
      tipoDoc: String(p.receptor?.tipo_documento ?? ''),
      numDoc: limpiar(p.receptor?.numero_documento),
      nombre: limpiar(p.receptor?.denominacion),
      direccion: limpiar(p.receptor?.direccion),
      email: limpiar(p.receptor?.email),
    },
    referencia: nota
      ? { documento: limpiar(nota.documento_modificado), motivo: limpiar(nota.motivo_texto), sustento: '' }
      : null,
    items: (p.items ?? []).map((i) => ({
      codigo: limpiar(i.codigo),
      unidad: i.unidad_de_medida,
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad),
      valorUnitario: Number(i.valor_unitario),
      precioUnitario: Number(i.precio_unitario),
      descuento: Number(i.descuento) || 0,
      importe: Number(i.total),
    })),
    totales: {
      gravada: Number(p.totales?.gravada) || 0,
      exonerada: Number(p.totales?.exonerada) || 0,
      inafecta: Number(p.totales?.inafecta) || 0,
      descuentos: Number(p.totales?.descuento) || 0,
      igv: Number(p.totales?.igv) || 0,
      porcentajeIgv: Number(p.porcentaje_igv) || 0,
      total: Number(p.totales?.total) || 0,
    },
    importeEnLetras: limpiar(p.importe_en_letras),
    formaPago: p.forma_pago ?? null,
    cuotas: [],
    medioPago: textoONulo(opciones.medioPago) ?? textoONulo(describirMedioPago(p.pagos_detalle, monedaDe(p.moneda).simbolo)),
    observaciones: textoONulo(p.observaciones),
    guiaRemision: null,
    atendidoPor: textoONulo(p.atendido_por),
    sucursal: null,
    aceptado: null,
    ambiente: ambienteDe(p.ambiente_fiscal),
    aviso: null,
    mostrarCredito: opciones.mostrarCredito ?? true,
    qr: opciones.mostrarQr === false ? null : { modo: 'pendiente', hash: null },
  };
}

/** Guía relacionada que imprime el PDF (`guiaImpresa` del back): la primera no anulada ni rechazada. */
function guiaImpresa(guias: ComprobanteDetalle['guias'] | null | undefined): string | null {
  const guia = (guias ?? []).find(
    (g) => limpiar(g.numero_formateado) && !/anulad|rechazad|baja/i.test(String(g.estado ?? '')),
  );
  return guia ? limpiar(guia.numero_formateado) : null;
}

/** Detalle del comprobante emitido (`ComprobanteDetalle`) a la hoja. */
export function hojaDesdeDetalle(
  d: ComprobanteDetalle,
  opciones: OpcionesHojaDetalle = {},
): HojaComprobante {
  const { tipo, titulo } = tituloDe(d.id_tipo, d.tipo_nombre);
  const credito = d.forma_pago === 'Credito';
  const ref = d.referencia;
  const hash = textoONulo(d.codigo_hash);
  const firmado = !!(hash || limpiar(d.cadena_qr));
  return {
    etiqueta: 'Comprobante electrónico',
    emisor: {
      ruc: limpiar(d.emisor?.ruc),
      razonSocial: limpiar(d.emisor?.razon_social),
      nombreComercial: textoONulo(d.emisor?.nombre_comercial),
      direccion: limpiar(d.emisor?.direccion),
      ubicacion: limpiar(d.emisor?.ubicacion),
      telefono: textoONulo(d.emisor?.telefono),
      email: textoONulo(d.emisor?.email),
      logoUrl: textoONulo(d.emisor?.logo_url),
    },
    tipo,
    titulo,
    serieNumero: d.serie && d.numero != null
      ? formatearSerieNumero(d.serie, d.numero)
      : limpiar(d.numero_formateado),
    fechaEmision: fechaDdMmAaaa(d.fecha_de_emision),
    horaEmision: textoONulo(d.hora_emision),
    fechaVencimiento: credito ? textoONulo(fechaDdMmAaaa(d.fecha_de_vencimiento)) : null,
    moneda: monedaDe(d.moneda),
    cliente: {
      tipoDoc: String(d.receptor?.tipo_documento ?? ''),
      numDoc: limpiar(d.receptor?.numero_documento),
      nombre: limpiar(d.receptor?.denominacion),
      direccion: limpiar(d.receptor?.direccion),
      email: limpiar(d.receptor?.email),
    },
    referencia: ref
      ? {
          documento: [
            ref.tipo === '01' ? TITULOS['01'] : ref.tipo === '03' ? TITULOS['03'] : `Documento ${limpiar(ref.tipo)}`,
            limpiar(ref.numero_formateado) || formatearSerieNumero(ref.serie, ref.numero),
          ].join(' '),
          motivo: [limpiar(ref.motivo), limpiar(ref.motivo_descripcion)].filter(Boolean).join(' - '),
          sustento: limpiar(ref.sustento),
        }
      : null,
    items: (d.items ?? []).map((i) => ({
      codigo: limpiar(i.codigo),
      unidad: i.unidad_de_medida,
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad),
      valorUnitario: Number(i.valor_unitario),
      precioUnitario: Number(i.precio_unitario),
      descuento: Number(i.descuento) || 0,
      importe: Number(i.total),
    })),
    totales: {
      gravada: Number(d.totales?.gravada) || 0,
      exonerada: Number(d.totales?.exonerada) || 0,
      inafecta: Number(d.totales?.inafecta) || 0,
      descuentos: Number(d.totales?.descuento) || 0,
      igv: Number(d.totales?.igv) || 0,
      porcentajeIgv: Number(d.porcentaje_igv) || 0,
      total: Number(d.totales?.total) || 0,
    },
    importeEnLetras: limpiar(d.importe_en_letras),
    formaPago: d.forma_pago ?? null,
    cuotas: credito
      ? (d.cuotas ?? []).map((c) => ({
          numero: c.numero,
          monto: Number(c.monto) || 0,
          fechaPago: fechaDdMmAaaa(c.fecha_pago),
        }))
      : [],
    medioPago: textoONulo(describirMedioPago(d.pagos_detalle, monedaDe(d.moneda).simbolo)),
    observaciones: textoONulo(d.observaciones),
    guiaRemision: guiaImpresa(d.guias),
    atendidoPor: textoONulo(d.atendido_por),
    sucursal: textoONulo(d.sucursal),
    aceptado: d.aceptada_sunat && !d.anulado ? { fecha: textoONulo(fechaHoraLima(d.aceptado_en)) } : null,
    ambiente: ambienteDe(d.ambiente_fiscal),
    aviso: textoONulo(d.aviso),
    mostrarCredito: opciones.mostrarCredito ?? false,
    qr: opciones.mostrarQr
      ? { modo: firmado ? 'emitido' : 'sin-firma', hash }
      : null,
  };
}
