/**
 * «hace 3 min», «hace 2 h», «ayer»… para mostrar cuánto hace que pasó algo.
 * Texto en español llano; si la fecha no es válida devuelve '' (quien lo muestra se oculta).
 * `ahora` se puede pasar para probarlo o para recalcular con un reloj propio.
 */
export function tiempoRelativo(
  fecha: Date | string | number | null | undefined,
  ahora: Date = new Date(),
): string {
  if (fecha === null || fecha === undefined || fecha === '') return '';
  const momento = fecha instanceof Date ? fecha : new Date(fecha);
  const t = momento.getTime();
  if (Number.isNaN(t)) return '';

  const segundos = Math.floor((ahora.getTime() - t) / 1000);
  // Un reloj adelantado unos segundos no debe decir «dentro de…»: se trata como «ahora».
  if (segundos < 45) return 'hace unos segundos';

  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${Math.max(1, minutos)} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;

  const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((inicioDia(ahora) - inicioDia(momento)) / 86_400_000);
  if (dias <= 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;

  try {
    return momento.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }).replace(/\./g, '');
  } catch {
    return momento.toLocaleDateString();
  }
}
