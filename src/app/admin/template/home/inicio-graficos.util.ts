import { VentaPorHora, VentasPorHora } from '../../models/admin.models';

/**
 * Cálculos puros del Inicio (sin Angular): geometría de los gráficos, comparaciones y formatos.
 * El componente solo pinta lo que sale de aquí, así se prueba sin montar la pantalla.
 */

// Zona de dibujo de los gráficos (viewBox 640 × 200, igual que la maqueta).
export const G_ANCHO = 640;
export const G_ALTO = 200;
export const G_X0 = 40;
export const G_X1 = 640;
export const G_Y_ARRIBA = 20;
export const G_Y_ABAJO = 170;

export const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

export function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD' en la fecha local del navegador. */
export function claveDia(fecha: Date): string {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/** Entero con separador de miles («1,250»): para el eje y los rótulos sobre las barras. */
export function formatoCorto(valor: number): string {
  return Math.round(valor).toLocaleString('es-PE');
}

/** Importe en soles con separador de miles y dos decimales. */
export function formatoSoles(valor: number): string {
  return `S/ ${valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Paso «redondo» (1, 2, 2.5, 5 × 10ⁿ) que cubre `valor`. */
export function pasoRedondo(valor: number): number {
  if (valor <= 0) return 1;
  const potencia = Math.pow(10, Math.floor(Math.log10(valor)));
  for (const f of [1, 2, 2.5, 5, 10]) {
    if (f * potencia >= valor) return f * potencia;
  }
  return 10 * potencia;
}

export interface MarcaEje {
  y: number;
  texto: string;
}

/** Cuatro marcas del eje vertical (0 y tres niveles) y el valor que llega al tope del gráfico. */
export function marcasEje(maximo: number): { marcas: MarcaEje[]; tope: number } {
  const paso = pasoRedondo(maximo / 3);
  const alto = G_Y_ABAJO - G_Y_ARRIBA;
  return {
    tope: paso * 3,
    marcas: [3, 2, 1, 0].map((nivel) => ({
      y: G_Y_ABAJO - (alto * nivel) / 3,
      texto: formatoCorto(paso * nivel),
    })),
  };
}

/* ────────────────────────────────────────────────────────────── comparaciones */

export interface Delta {
  /** sube / baja: la diferencia es de 1 % o más; igual: menos de 1 %; sin-referencia: no hay con qué comparar. */
  tipo: 'sube' | 'baja' | 'igual' | 'sin-referencia';
  /** Porcentaje entero y sin signo (12 para +12 % o −12 %). */
  porcentaje: number;
}

/** Compara un valor con su referencia. Con referencia 0 (o negativa) no hay porcentaje que dar. */
export function delta(actual: number, referencia: number): Delta {
  if (!(referencia > 0) || !Number.isFinite(actual) || !Number.isFinite(referencia)) {
    return { tipo: 'sin-referencia', porcentaje: 0 };
  }
  const cambio = ((actual - referencia) / referencia) * 100;
  if (Math.abs(cambio) < 1) return { tipo: 'igual', porcentaje: 0 };
  return { tipo: cambio > 0 ? 'sube' : 'baja', porcentaje: Math.round(Math.abs(cambio)) };
}

export interface TotalesComparados {
  total: number;
  ventas: number;
  totalPrevio: number;
  ventasPrevio: number;
}

function sumarHoras(lista: VentaPorHora[] | undefined, hastaHora: number): { total: number; ventas: number } {
  let total = 0;
  let ventas = 0;
  for (const h of Array.isArray(lista) ? lista : []) {
    const hora = Math.trunc(numero(h?.hora));
    if (hora < 0 || hora > hastaHora) continue;
    total += numero(h.total);
    ventas += numero(h.ventas);
  }
  return { total, ventas };
}

/**
 * Suma las horas 0..`hastaHora` del día y del mismo día de la semana anterior.
 * Hoy se compara «a esta hora» (hasta la hora actual); ayer, el día completo (`hastaHora` = 23).
 */
export function totalesHasta(datos: VentasPorHora | null, hastaHora: number): TotalesComparados | null {
  if (!datos || !Array.isArray(datos.horas)) return null;
  const actual = sumarHoras(datos.horas, hastaHora);
  const previo = sumarHoras(datos.comparacion?.horas, hastaHora);
  return { total: actual.total, ventas: actual.ventas, totalPrevio: previo.total, ventasPrevio: previo.ventas };
}

/* ────────────────────────────────────────────────────────────── tooltip */

export interface LineaTooltip {
  rotulo: string;
  valor: string;
  /** actual = barra principal; previo = comparación (gris). */
  tono?: 'actual' | 'previo';
}

export interface DetalleTooltip {
  titulo: string;
  lineas: LineaTooltip[];
}

/* ────────────────────────────────────────────────────────────── ventas por hora */

/** Una hora del gráfico «Ventas por hora»: el día (grafito, oro si es la hora pico) y la semana anterior (gris). */
export interface BarraHora {
  hora: number;
  etiqueta: string;
  /** Centro horizontal de la hora (para el rótulo y el tooltip). */
  xc: number;
  ancho: number;
  xHoy: number;
  yHoy: number;
  altoHoy: number;
  xPrev: number;
  yPrev: number;
  altoPrev: number;
  /** Ancho y posición de la zona que recibe el ratón y el foco (toda la columna). */
  xZona: number;
  anchoZona: number;
  totalHoy: number;
  totalPrev: number;
  ventasHoy: number;
  ventasPrev: number;
  /** Rótulo del valor sobre la barra (solo la hora pico lo muestra). */
  valorCorto: string;
  yValor: number;
  esPico: boolean;
  mostrarEtiqueta: boolean;
  /** Altura (en el viewBox) del punto donde se ancla el tooltip. */
  yTope: number;
  titulo: string;
  tip: DetalleTooltip;
}

export interface GraficoHoras {
  barras: BarraHora[];
  marcas: MarcaEje[];
  totalActual: number;
  totalPrevio: number;
  /** Hora con más ventas del día (−1 si no hubo). */
  pico: number;
  totalPico: number;
}

function agruparPorHora(lista: VentaPorHora[] | undefined): Map<number, { total: number; ventas: number }> {
  const mapa = new Map<number, { total: number; ventas: number }>();
  for (const h of Array.isArray(lista) ? lista : []) {
    const hora = Math.trunc(numero(h?.hora));
    if (hora < 0 || hora > 23) continue;
    const previo = mapa.get(hora) ?? { total: 0, ventas: 0 };
    mapa.set(hora, { total: previo.total + numero(h.total), ventas: previo.ventas + numero(h.ventas) });
  }
  return mapa;
}

/**
 * Barras por hora contra el mismo día de la semana anterior. Eje de 7 a 21 h, ampliado si hay
 * ventas fuera de ese tramo. `nombreActual` es «hoy» o «ayer» (para los títulos); null si no hay datos.
 */
export function construirBarrasHora(datos: VentasPorHora | null, nombreActual: 'hoy' | 'ayer' = 'hoy'): GraficoHoras | null {
  if (!datos || !Array.isArray(datos.horas)) return null;

  const actual = agruparPorHora(datos.horas);
  const prev = agruparPorHora(datos.comparacion?.horas);
  const conVentas = [...actual.entries(), ...prev.entries()].filter(([, v]) => v.total > 0).map(([h]) => h);
  if (!conVentas.length) return null;

  const desde = Math.min(7, ...conVentas);
  const hasta = Math.max(21, ...conVentas);
  const cantidad = hasta - desde + 1;
  const maximo = Math.max(...conVentas.map((h) => Math.max(actual.get(h)?.total ?? 0, prev.get(h)?.total ?? 0)));
  const { marcas, tope } = marcasEje(maximo);
  const alto = G_Y_ABAJO - G_Y_ARRIBA;

  const totalActual = [...actual.values()].reduce((s, v) => s + v.total, 0);
  const totalPrevio = [...prev.values()].reduce((s, v) => s + v.total, 0);
  let pico = -1;
  for (const [h, v] of actual) if (v.total > 0 && (pico < 0 || v.total > (actual.get(pico)?.total ?? 0))) pico = h;

  const hueco = (G_X1 - G_X0) / cantidad;
  const ancho = Math.min(16, hueco * 0.34);
  const cadaDos = cantidad > 16;
  const rotulo = (h: number) => `${dosDigitos(h)}:00`;
  const quien = nombreActual === 'ayer' ? 'Ayer' : 'Hoy';
  const barras = Array.from({ length: cantidad }, (_, i): BarraHora => {
    const hora = desde + i;
    const vHoy = actual.get(hora) ?? { total: 0, ventas: 0 };
    const vPrev = prev.get(hora) ?? { total: 0, ventas: 0 };
    const altoHoy = Math.max(0, (vHoy.total / tope) * alto);
    const altoPrev = Math.max(0, (vPrev.total / tope) * alto);
    const xc = G_X0 + hueco * i + hueco / 2;
    const conteo = (n: number) => `${n} ${n === 1 ? 'venta' : 'ventas'}`;
    return {
      hora,
      etiqueta: `${hora}h`,
      xc,
      ancho,
      xHoy: xc + 1,
      yHoy: G_Y_ABAJO - altoHoy,
      altoHoy,
      xPrev: xc - ancho - 1,
      yPrev: G_Y_ABAJO - altoPrev,
      altoPrev,
      xZona: xc - ancho - 1,
      anchoZona: ancho * 2 + 2,
      totalHoy: vHoy.total,
      totalPrev: vPrev.total,
      ventasHoy: vHoy.ventas,
      ventasPrev: vPrev.ventas,
      valorCorto: formatoCorto(vHoy.total),
      yValor: G_Y_ABAJO - altoHoy - 6,
      esPico: hora === pico,
      mostrarEtiqueta: !cadaDos || i % 2 === 0,
      yTope: G_Y_ABAJO - Math.max(altoHoy, altoPrev),
      titulo: `${rotulo(hora)} a ${dosDigitos(hora)}:59 · ${nombreActual} ${formatoSoles(vHoy.total)} (${conteo(vHoy.ventas)}) · semana pasada ${formatoSoles(vPrev.total)}`,
      tip: {
        titulo: `${rotulo(hora)} – ${dosDigitos(hora)}:59`,
        lineas: [
          { rotulo: quien, valor: `${formatoSoles(vHoy.total)} (${conteo(vHoy.ventas)})`, tono: 'actual' },
          { rotulo: 'Semana pasada', valor: formatoSoles(vPrev.total), tono: 'previo' },
        ],
      },
    };
  });

  return { barras, marcas, totalActual, totalPrevio, pico, totalPico: pico >= 0 ? (actual.get(pico)?.total ?? 0) : 0 };
}

/* ────────────────────────────────────────────────────────────── ventas por día */

/** Una barra por día (semana o mes). */
export interface BarraDia {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  /** Centro horizontal (para rótulos y tooltip). */
  xc: number;
  /** Altura del rótulo del valor sobre la barra. */
  yValor: number;
  valor: number;
  valorCorto: string;
  etiqueta: string;
  titulo: string;
  /** El día destacado (hoy) va en oro. */
  esHoy: boolean;
  mostrarValor: boolean;
  mostrarEtiqueta: boolean;
  xZona: number;
  anchoZona: number;
  yTope: number;
  tip: DetalleTooltip;
}

export interface GraficoDias {
  barras: BarraDia[];
  marcas: MarcaEje[];
  total: number;
  /** Índice del mejor día. */
  mejor: number;
}

export interface DiaVenta {
  fecha: Date;
  total: number;
}

/** Los días de `desde` a `hasta` (ambos incluidos), a las 00:00 locales. */
export function diasEntre(desde: Date, hasta: Date): Date[] {
  const dias: Date[] = [];
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate()).getTime();
  for (let d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()); d.getTime() <= fin; ) {
    dias.push(new Date(d));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return dias;
}

/** Suma el neto de cada fila del reporte en su día (los días sin ventas valen 0). */
export function totalesPorDia(
  dias: Date[],
  filas: { fecha?: string; total_vendido?: number | string }[] | undefined,
): DiaVenta[] {
  const resultado = dias.map((fecha) => ({ clave: claveDia(fecha), fecha, total: 0 }));
  for (const f of filas ?? []) {
    const dia = resultado.find((x) => x.clave === String(f.fecha ?? '').slice(0, 10));
    if (dia) dia.total += numero(f.total_vendido);
  }
  return resultado.map(({ fecha, total }) => ({ fecha, total }));
}

/**
 * Barras por día. Hasta 10 barras llevan su valor y su etiqueta («Lun 3»); con más (el mes),
 * la etiqueta es solo el número, una de cada 5, y el valor solo se escribe en el mejor día.
 * La última barra (hoy) va destacada. Devuelve null si ningún día tuvo ventas.
 */
export function construirBarrasDias(dias: DiaVenta[]): GraficoDias | null {
  if (!dias.length) return null;
  const maximo = Math.max(...dias.map((d) => d.total));
  if (!(maximo > 0)) return null;

  const { marcas, tope } = marcasEje(maximo);
  const alto = G_Y_ABAJO - G_Y_ARRIBA;
  const muchas = dias.length > 10;
  const hueco = (G_X1 - G_X0) / dias.length;
  const ancho = Math.min(44, hueco * 0.55);
  const ultimo = dias.length - 1;
  const mejor = dias.reduce((m, d, i) => (d.total > dias[m].total ? i : m), 0);

  const barras = dias.map((d, i): BarraDia => {
    const altura = Math.max(0, (d.total / tope) * alto);
    const x = G_X0 + hueco * i + (hueco - ancho) / 2;
    const nombre = DIAS_CORTOS[d.fecha.getDay()];
    const numeroDia = d.fecha.getDate();
    const larga = `${DIAS_LARGOS[d.fecha.getDay()]} ${numeroDia}`;
    const mostrarEtiqueta = !muchas || (i % 5 === 0 && ultimo - i >= 3) || i === ultimo;
    return {
      x,
      y: G_Y_ABAJO - altura,
      ancho,
      alto: altura,
      xc: x + ancho / 2,
      yValor: G_Y_ABAJO - altura - 6,
      valor: d.total,
      valorCorto: formatoCorto(d.total),
      etiqueta: muchas ? String(numeroDia) : `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${numeroDia}`,
      titulo: `${larga}: ${formatoSoles(d.total)}`,
      esHoy: i === ultimo,
      mostrarValor: !muchas || i === mejor,
      mostrarEtiqueta,
      xZona: G_X0 + hueco * i,
      anchoZona: hueco,
      yTope: G_Y_ABAJO - altura,
      tip: {
        titulo: larga.charAt(0).toUpperCase() + larga.slice(1),
        lineas: [{ rotulo: i === ultimo ? 'Hoy' : 'Ventas', valor: formatoSoles(d.total), tono: 'actual' }],
      },
    };
  });

  return { barras, marcas, total: dias.reduce((s, d) => s + d.total, 0), mejor };
}
