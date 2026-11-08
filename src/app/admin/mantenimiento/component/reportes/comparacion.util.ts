/** Comparación de una cifra del reporte con la del periodo anterior. */

export interface DeltaReporte {
  tipo: 'sube' | 'baja' | 'igual' | 'sin-referencia';
  /** ▲, ▼ o vacío. */
  signo: string;
  /** «8,3 %», «Igual» o «Sin referencia». */
  texto: string;
  /** Cambio en porcentaje (con signo); 0 si no se pudo calcular. */
  porcentaje: number;
}

/** Un decimal por debajo de 100 % («8,3 %») y entero por encima («120 %»), con coma decimal. */
function formatoPorcentaje(valor: number): string {
  const abs = Math.abs(valor);
  const texto = abs < 100 ? abs.toFixed(1) : String(Math.round(abs));
  return `${texto.replace('.', ',')} %`;
}

/**
 * `actual` frente a `previo`. Si el periodo anterior no tuvo nada (0, vacío o negativo) no hay
 * porcentaje que dar: «Sin referencia». Un cambio menor a 0,05 % se muestra como «Igual».
 */
export function calcularDelta(actual: number, previo: number | null | undefined): DeltaReporte {
  if (previo === null || previo === undefined || !Number.isFinite(previo) || !(previo > 0) || !Number.isFinite(actual)) {
    return { tipo: 'sin-referencia', signo: '', texto: 'Sin referencia', porcentaje: 0 };
  }
  const cambio = ((actual - previo) / previo) * 100;
  if (Math.abs(cambio) < 0.05) return { tipo: 'igual', signo: '', texto: 'Igual', porcentaje: 0 };
  return {
    tipo: cambio > 0 ? 'sube' : 'baja',
    signo: cambio > 0 ? '▲' : '▼',
    texto: formatoPorcentaje(cambio),
    porcentaje: Math.round(cambio * 10) / 10,
  };
}
