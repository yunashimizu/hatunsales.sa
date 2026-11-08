import { ActivatedRoute, Params, Router } from '@angular/router';

/**
 * Filtros de un listado guardados en la URL: sobreviven a F5 y se pueden compartir por enlace.
 * Mismo criterio que Documentos: sin historial nuevo (`replaceUrl`) y sin tocar otros parámetros
 * (`queryParamsHandling: 'merge'`).
 */

export type DefinicionFiltro =
  | { tipo: 'texto' }
  | { tipo: 'numero'; defecto?: number; min?: number }
  | { tipo: 'opcion'; opciones: readonly string[]; defecto?: string }
  | { tipo: 'bandera' };

/** Nombre del parámetro en la URL → cómo se lee. */
export type EsquemaFiltros = Record<string, DefinicionFiltro>;

export type ValorFiltro = string | number | boolean | null | undefined;
export type ValoresFiltros = Record<string, ValorFiltro>;

/** Lee los filtros de la URL ya limpios: lo inválido o ausente cae al valor por defecto. */
export function leerFiltros(route: ActivatedRoute, esquema: EsquemaFiltros): Record<string, string | number | boolean | null> {
  return leerDesdeParametros(route.snapshot.queryParamMap, esquema);
}

export function leerDesdeParametros(
  params: { get(nombre: string): string | null },
  esquema: EsquemaFiltros,
): Record<string, string | number | boolean | null> {
  const salida: Record<string, string | number | boolean | null> = {};
  for (const [nombre, def] of Object.entries(esquema)) {
    const crudo = params.get(nombre);
    switch (def.tipo) {
      case 'texto':
        salida[nombre] = (crudo ?? '').trim();
        break;
      case 'numero': {
        const n = crudo === null || crudo.trim() === '' ? NaN : Number(crudo);
        const valido = Number.isFinite(n) && n >= (def.min ?? Number.NEGATIVE_INFINITY);
        salida[nombre] = valido ? n : (def.defecto ?? null);
        break;
      }
      case 'opcion':
        salida[nombre] = crudo !== null && def.opciones.includes(crudo) ? crudo : (def.defecto ?? '');
        break;
      case 'bandera':
        salida[nombre] = crudo === '1' || crudo === 'true';
        break;
    }
  }
  return salida;
}

/** Valores → parámetros de la URL; `null` quita el parámetro (vacío, falso o igual al valor por defecto). */
export function aParametros(valores: ValoresFiltros, esquema?: EsquemaFiltros): Params {
  const salida: Params = {};
  for (const [nombre, valor] of Object.entries(valores)) {
    const def = esquema?.[nombre];
    const porDefecto = def && (def.tipo === 'numero' || def.tipo === 'opcion') ? def.defecto : undefined;
    let texto: string | null;
    if (valor === null || valor === undefined || valor === false) texto = null;
    else if (typeof valor === 'number') texto = Number.isFinite(valor) ? String(valor) : null;
    else if (valor === true) texto = '1';
    else texto = valor.trim() === '' ? null : valor.trim();
    if (texto !== null && porDefecto !== undefined && texto === String(porDefecto)) texto = null;
    salida[nombre] = texto;
  }
  return salida;
}

export function escribirFiltros(
  router: Router,
  route: ActivatedRoute,
  valores: ValoresFiltros,
  esquema?: EsquemaFiltros,
): Promise<boolean> {
  return router.navigate([], {
    relativeTo: route,
    queryParams: aParametros(valores, esquema),
    queryParamsHandling: 'merge',
    replaceUrl: true,
  });
}

/**
 * Escribe los filtros en la URL con retardo para lo que se teclea (300 ms) y de inmediato para
 * lo demás. Sirve además para no confundir un cambio propio con uno que llega desde fuera:
 * mientras `ocupado` es verdadero, lo que emite la ruta es el eco de nuestra propia escritura.
 */
export class EscritorFiltrosUrl {
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private pendiente: ValoresFiltros | null = null;
  private enCurso = 0;

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly esquema?: EsquemaFiltros,
    private readonly retardoMs = 300,
  ) {}

  get ocupado(): boolean {
    return this.temporizador !== null || this.enCurso > 0;
  }

  escribir(valores: ValoresFiltros, opciones: { retardar?: boolean } = {}): void {
    this.cancelar();
    if (!opciones.retardar) {
      this.enviar(valores);
      return;
    }
    this.pendiente = valores;
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      const ultimos = this.pendiente;
      this.pendiente = null;
      if (ultimos) this.enviar(ultimos);
    }, this.retardoMs);
  }

  /** Descarta lo que esté esperando (al destruir la pantalla). */
  cancelar(): void {
    if (this.temporizador !== null) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.pendiente = null;
  }

  private enviar(valores: ValoresFiltros): void {
    this.enCurso++;
    void escribirFiltros(this.router, this.route, valores, this.esquema)
      .catch(() => false)
      .finally(() => { this.enCurso--; });
  }
}
