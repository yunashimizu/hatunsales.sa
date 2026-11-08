/**
 * Fechas del reporte de ventas. Todo son días de Lima en formato AAAA-MM-DD (como los guarda y
 * los entiende el servidor), calculados sin pasar por la zona horaria del navegador.
 */

export type PresetId =
  | 'hoy' | 'ayer' | 'semana' | 'semana-pasada' | 'mes' | 'mes-pasado' | '30-dias' | 'personalizado';

export interface RangoYmd {
  desde: string;
  hasta: string;
}

export const PRESETS: ReadonlyArray<{ id: PresetId; etiqueta: string }> = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'ayer', etiqueta: 'Ayer' },
  { id: 'semana', etiqueta: 'Esta semana' },
  { id: 'semana-pasada', etiqueta: 'Semana pasada' },
  { id: 'mes', etiqueta: 'Este mes' },
  { id: 'mes-pasado', etiqueta: 'Mes pasado' },
  { id: '30-dias', etiqueta: 'Últimos 30 días' },
  { id: 'personalizado', etiqueta: 'Personalizado' },
];

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DIA = 86_400_000;

function partes(ymd: string): [number, number, number] {
  const m = YMD.exec(ymd);
  if (!m) throw new Error(`Fecha inválida: ${ymd}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function aYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function msDe(ymd: string): number {
  const [a, m, d] = partes(ymd);
  return Date.UTC(a, m - 1, d);
}

function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function armar(anio: number, mes: number, dia: number): string {
  const dd = Math.min(dia, ultimoDiaDelMes(anio, mes));
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function esFechaYmd(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const m = YMD.exec(valor);
  if (!m) return false;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mes >= 1 && mes <= 12 && d >= 1 && d <= ultimoDiaDelMes(a, mes);
}

/** Hoy en Lima; `ahora` se inyecta para poder probarlo. */
export function hoyEnLima(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
}

/** Día de Lima de un instante ISO (el servidor manda el inicio y el fin del periodo como instantes). */
export function ymdDeInstante(instante: string | null | undefined): string | null {
  if (!instante) return null;
  if (esFechaYmd(instante)) return instante;
  const fecha = new Date(instante);
  return Number.isNaN(fecha.getTime()) ? null : hoyEnLima(fecha);
}

export function sumarDias(ymd: string, dias: number): string {
  return aYmd(msDe(ymd) + dias * MS_DIA);
}

/** Cuántos días abarca el rango, contando el primero y el último. */
export function diasEnRango(rango: RangoYmd): number {
  return Math.round((msDe(rango.hasta) - msDe(rango.desde)) / MS_DIA) + 1;
}

export function rangoValido(desde: string, hasta: string): boolean {
  return esFechaYmd(desde) && esFechaYmd(hasta) && desde <= hasta;
}

/** Rango de cada atajo (la semana empieza el lunes). `personalizado` no tiene rango propio. */
export function rangoDePreset(id: PresetId, hoy: string = hoyEnLima()): RangoYmd | null {
  const [a, m] = partes(hoy);
  switch (id) {
    case 'hoy':
      return { desde: hoy, hasta: hoy };
    case 'ayer': {
      const ayer = sumarDias(hoy, -1);
      return { desde: ayer, hasta: ayer };
    }
    case 'semana': {
      const dow = new Date(msDe(hoy)).getUTCDay(); // 0 = domingo
      return { desde: sumarDias(hoy, -((dow + 6) % 7)), hasta: hoy };
    }
    case 'semana-pasada': {
      const lunes = rangoDePreset('semana', hoy)!.desde;
      return { desde: sumarDias(lunes, -7), hasta: sumarDias(lunes, -1) };
    }
    case 'mes':
      return { desde: armar(a, m, 1), hasta: hoy };
    case 'mes-pasado': {
      const anio = m === 1 ? a - 1 : a;
      const mes = m === 1 ? 12 : m - 1;
      return { desde: armar(anio, mes, 1), hasta: armar(anio, mes, 31) };
    }
    case '30-dias':
      return { desde: sumarDias(hoy, -29), hasta: hoy };
    default:
      return null;
  }
}

/** Qué atajo coincide con el rango; si ninguno, «personalizado». */
export function presetDeRango(rango: RangoYmd, hoy: string = hoyEnLima()): PresetId {
  const coincide = PRESETS.find((p) => {
    const r = rangoDePreset(p.id, hoy);
    return r && r.desde === rango.desde && r.hasta === rango.hasta;
  });
  return coincide?.id ?? 'personalizado';
}

/**
 * El rango con el que se compara. Con meses completos o «lo que va del mes/año» se compara con lo
 * mismo del mes o año anterior (1–8 de noviembre contra 1–8 de octubre). En cualquier otro caso es
 * el mismo número de días justo antes (el 16–20 contra el 11–15; ayer contra anteayer).
 */
export function rangoAnterior(rango: RangoYmd): RangoYmd {
  const [a1, m1, d1] = partes(rango.desde);
  const [a2, m2, d2] = partes(rango.hasta);

  if (d1 === 1 && a1 === a2) {
    if (m1 === m2) {
      const anio = m1 === 1 ? a1 - 1 : a1;
      const mes = m1 === 1 ? 12 : m1 - 1;
      return { desde: armar(anio, mes, 1), hasta: armar(anio, mes, d2) };
    }
    if (m1 === 1) {
      return { desde: armar(a1 - 1, 1, 1), hasta: armar(a1 - 1, m2, d2) };
    }
  }

  const dias = diasEnRango(rango);
  const hasta = sumarDias(rango.desde, -1);
  return { desde: sumarDias(hasta, -(dias - 1)), hasta };
}

/**
 * Con rango, el servidor ignora el periodo para filtrar y lo usa solo para agrupar la tendencia:
 * por día (diario, mensual) o por mes (anual). Un día → diario; hasta 92 días → por día; más → por mes.
 */
export function periodoParaRango(rango: RangoYmd): 'diario' | 'mensual' | 'anual' {
  const dias = diasEnRango(rango);
  return dias <= 1 ? 'diario' : dias <= 92 ? 'mensual' : 'anual';
}

/** «08/11» (o «08/11/2026» si se pide el año). */
export function fechaCortaYmd(ymd: string, conAnio = false): string {
  const [a, m, d] = partes(ymd);
  const base = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  return conAnio ? `${base}/${a}` : base;
}

/** «01/10 – 31/10» o, si no es del año en curso, «01/10/2025 – 31/10/2025». */
export function etiquetaRango(rango: RangoYmd, hoy: string = hoyEnLima()): string {
  const conAnio = rango.desde.slice(0, 4) !== hoy.slice(0, 4) || rango.hasta.slice(0, 4) !== hoy.slice(0, 4);
  if (rango.desde === rango.hasta) return fechaCortaYmd(rango.desde, conAnio);
  return `${fechaCortaYmd(rango.desde, conAnio)} – ${fechaCortaYmd(rango.hasta, conAnio)}`;
}
