import { normalizarTelefonoPe } from '../../../../shared/utils/whatsapp.util';

/**
 * Cobranza: antigüedad de la deuda, textos de WhatsApp y teléfono del deudor.
 * Todo es puro (sin Angular) para poder probarlo con fechas fijas.
 */

export type Tramo = 'aldia' | 'd1_30' | 'd31_60' | 'd60';
export type TonoTramo = 'neutro' | 'aviso' | 'peligro';

export interface DefinicionTramo {
  clave: Tramo;
  etiqueta: string;
  tono: TonoTramo;
  /** Icono de Bootstrap Icons para la tarjeta. */
  icono: string;
}

/** De la deuda más sana a la más antigua; el tono sigue la urgencia (neutro, aviso, aviso, peligro). */
export const TRAMOS: readonly DefinicionTramo[] = [
  { clave: 'aldia', etiqueta: 'Al día', tono: 'neutro', icono: 'bi-calendar-check' },
  { clave: 'd1_30', etiqueta: '1–30 días', tono: 'aviso', icono: 'bi-calendar-event' },
  { clave: 'd31_60', etiqueta: '31–60 días', tono: 'aviso', icono: 'bi-calendar2-week' },
  { clave: 'd60', etiqueta: 'Más de 60 días', tono: 'peligro', icono: 'bi-calendar-x' },
];

/** Días hasta el vencimiento (negativo = ya venció, 0 = vence hoy). null si la fecha no es AAAA-MM-DD. */
export function diasParaVencer(fechaVencimiento: unknown, hoy: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fechaVencimiento ?? ''));
  if (!m) return null;
  const vence = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((vence.getTime() - base.getTime()) / 86_400_000);
}

/** Tramo según los días de atraso (0 o menos = todavía no vence). */
export function tramoDeAtraso(diasVencida: number): Tramo {
  if (diasVencida <= 0) return 'aldia';
  if (diasVencida <= 30) return 'd1_30';
  if (diasVencida <= 60) return 'd31_60';
  return 'd60';
}

/** «S/ 1,234.50» con separador de miles y dos decimales (independiente del idioma del navegador). */
export function soles(valor: unknown): string {
  const n = Number(valor);
  const v = Number.isFinite(n) ? n : 0;
  const [entero, decimales] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '-' : ''}S/ ${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimales}`;
}

/** «05/11/2026» desde «2026-11-05» (o desde una fecha ISO larga). Vacío si no se entiende. */
export function fechaCorta(fecha: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

export interface DatosRecordatorio {
  nombre: string;
  saldo: unknown;
  idVenta: unknown;
  /** Serie-número del comprobante de la venta (F001-00000012), si el servidor lo trae. */
  comprobante?: string | null;
  /** AAAA-MM-DD */
  fechaVencimiento: unknown;
  /** Días hasta el vencimiento (negativo = vencida). */
  dias: number | null;
  empresa?: string;
}

/** Texto inicial del recordatorio (el usuario puede editarlo antes de abrir WhatsApp). */
export function textoRecordatorio(d: DatosRecordatorio): string {
  const empresa = d.empresa?.trim() || 'HatunSales S.A.C.';
  const fecha = fechaCorta(d.fechaVencimiento);
  const vencida = d.dias !== null && d.dias < 0;
  const cuando = fecha ? (vencida ? ` que venció el ${fecha}` : ` que vence el ${fecha}`) : '';
  const venta = d.comprobante?.trim()
    ? `el comprobante ${d.comprobante.trim()}`
    : d.idVenta ? `la venta N.° ${d.idVenta}` : 'su compra a crédito';
  return (
    `Hola ${d.nombre?.trim() || 'estimado cliente'}, le escribimos de ${empresa.replace(/\.?$/, '.')} ` +
    `Tiene un saldo pendiente de ${soles(d.saldo)} por ${venta}${cuando}. ` +
    `¿Nos confirma el pago o coordinamos? Gracias.`
  );
}

/** Primer teléfono válido de un texto con uno o varios («984 123 456, 084-123456»). */
export function primerTelefonoValido(texto: unknown): string | null {
  for (const parte of String(texto ?? '').split(/[,;/]/)) {
    const normalizado = normalizarTelefonoPe(parte);
    if (normalizado) return normalizado;
  }
  return null;
}

/** Clave del mapa de teléfonos de la lista: una persona (`c:ID`) o una empresa (`e:ID`). */
export function claveDeudor(c: { id_cliente?: unknown; id_empresa?: unknown }): string | null {
  if (c?.id_cliente !== null && c?.id_cliente !== undefined && Number(c.id_cliente) > 0) return `c:${Number(c.id_cliente)}`;
  if (c?.id_empresa !== null && c?.id_empresa !== undefined && Number(c.id_empresa) > 0) return `e:${Number(c.id_empresa)}`;
  return null;
}

/** Hoy en Lima como fecha local sin hora (para contar días igual que el servidor). */
export function hoyLima(ahora: Date = new Date()): Date {
  const ymd = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); // AAAA-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}
