import { Pipe, PipeTransform } from '@angular/core';

/** Formatos de presentación: «corta» 25 oct 2026 · «cortaHora» 25 oct 2026, 17:02 · «larga» 25 de octubre de 2026, 17:02 · «diaMes» 25 oct, 17:02. */
export type EstiloFecha = 'corta' | 'cortaHora' | 'larga' | 'diaMes';

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Fechas en español para las pantallas de pedidos.
 *
 * El `date` de Angular usa el idioma por defecto del proyecto (inglés: «19 de October de 2026»)
 * porque no hay locale registrado. Este pipe solo presenta la fecha (hora local del navegador);
 * no toca ningún dato. Si algún día se registra `es` como LOCALE_ID, se puede volver a `date`.
 */
@Pipe({ name: 'fechaEs', standalone: true })
export class FechaEsPipe implements PipeTransform {
  transform(valor: string | number | Date | null | undefined, estilo: EstiloFecha = 'corta'): string {
    if (valor === null || valor === undefined || valor === '') return '';

    // «2026-10-21» (sin hora) es una fecha de calendario: se lee como local, no como UTC.
    const soloDia = typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
    const fecha = valor instanceof Date
      ? valor
      : soloDia
        ? new Date(Number(valor.slice(0, 4)), Number(valor.slice(5, 7)) - 1, Number(valor.slice(8, 10)))
        : new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '';

    const dia = String(fecha.getDate()).padStart(2, '0');
    const hora = `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
    const mes = MESES_CORTOS[fecha.getMonth()];

    switch (estilo) {
      case 'larga':
        return `${fecha.getDate()} de ${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}, ${hora}`;
      case 'cortaHora':
        return `${dia} ${mes} ${fecha.getFullYear()}, ${hora}`;
      case 'diaMes':
        return `${dia} ${mes}, ${hora}`;
      default:
        return `${dia} ${mes} ${fecha.getFullYear()}`;
    }
  }
}
