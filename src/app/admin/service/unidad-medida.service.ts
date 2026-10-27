import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, map, of, shareReplay, tap } from 'rxjs';

import { urlConstants } from '../../constants/urlConstants';
import { opcionesHttp } from './api-base.service';

/** Copia de la interfaz del backend (hatunsales/src/sunat/catalogos/unidades-amigables.ts). */
export interface UnidadAmigable {
  /** Código del catálogo 03 de SUNAT: lo único que viaja al XML. */
  codigo: string;
  nombre: string;
  abreviatura: string;
  grupo: string;
  frecuente: boolean;
  visible: boolean;
}

/** Respuesta de GET /producto/unidades (solo llegan las unidades visibles). */
export interface CatalogoUnidades {
  grupos: string[];
  unidades: UnidadAmigable[];
  /** Sinónimo normalizado (mayúsculas, sin tildes ni puntos) → código del catálogo. */
  alias: Record<string, string>;
}

/**
 * Códigos que el backend sigue aceptando pero no manda en la lista (hatunsales,
 * `UNIDADES_OCULTAS`). Sirven para no dejar en blanco un producto que ya los usa.
 */
export const CODIGOS_UNIDAD_OCULTOS: readonly string[] = [
  'MIL', 'UM', 'DZP', 'STN', 'LTN', 'GLI', 'MGM', 'MMK', 'MMQ', 'CMQ', 'KWH', 'MWH', 'YDK', 'FTQ', 'FTK',
];

export const UNIDAD_POR_DEFECTO = 'NIU';

const unidad = (codigo: string, nombre: string, abreviatura: string, grupo: string): UnidadAmigable => ({
  codigo, nombre, abreviatura, grupo, frecuente: true, visible: true,
});

/** Lista mínima para que el formulario nunca quede vacío si el servidor no responde. */
export const CATALOGO_RESPALDO: CatalogoUnidades = {
  grupos: ['Conteo', 'Longitud', 'Peso', 'Volumen y líquidos', 'Envases y empaques', 'Servicios y alquiler'],
  unidades: [
    unidad('NIU', 'Unidad', 'und', 'Conteo'),
    unidad('C62', 'Pieza', 'pza', 'Conteo'),
    unidad('KGM', 'Kilogramo', 'kg', 'Peso'),
    unidad('MTR', 'Metro', 'm', 'Longitud'),
    unidad('LTR', 'Litro', 'l', 'Volumen y líquidos'),
    unidad('GLL', 'Galón', 'gl', 'Volumen y líquidos'),
    unidad('BG', 'Bolsa', 'bls', 'Envases y empaques'),
    unidad('BX', 'Caja', 'cja', 'Envases y empaques'),
    unidad('PK', 'Paquete', 'paq', 'Envases y empaques'),
    unidad('ZZ', 'Servicio', 'serv', 'Servicios y alquiler'),
  ],
  alias: {
    UND: 'NIU', UNIDAD: 'NIU', UNIDADES: 'NIU', KG: 'KGM', KILO: 'KGM', M: 'MTR', MT: 'MTR', METRO: 'MTR',
    L: 'LTR', LT: 'LTR', LITRO: 'LTR', GL: 'GLL', GALON: 'GLL', CAJA: 'BX', PAQUETE: 'PK', BOLSA: 'BG',
    PZA: 'C62', PIEZA: 'C62', SERVICIO: 'ZZ',
  },
};

export type EstadoUnidad =
  /** Es un código de la lista. */
  | 'ok'
  /** Era un sinónimo (UND, kg, Plancha): se reemplaza por su código. */
  | 'corregida'
  /** Código válido en SUNAT pero oculto del selector (MIL, UM…). */
  | 'oculta'
  /** No es nada conocido: hay que elegir otra. */
  | 'invalida'
  /** El catálogo del servidor aún no llegó: no se puede afirmar nada. */
  | 'pendiente';

export interface ResolucionUnidad {
  estado: EstadoUnidad;
  /** Código resultante (o el texto original si es inválida o pendiente). */
  codigo: string;
  /** Texto con el que llegó, sin espacios en los bordes. */
  original: string;
  unidad?: UnidadAmigable;
}

/** Misma normalización que `normalizarUnidad` del backend. */
export function claveUnidad(valor: string | null | undefined): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Catálogo de unidades de medida (nombres en español) que viene de GET /producto/unidades.
 * `mapa` se llena de forma síncrona al llegar la respuesta (antes tiene la lista de respaldo)
 * para que pipes y validaciones no tengan que esperar un Observable.
 */
@Injectable({ providedIn: 'root' })
export class UnidadMedidaService {
  private readonly http = inject(HttpClient);

  /** Código → unidad. Arranca con la lista de respaldo. */
  readonly mapa = new Map<string, UnidadAmigable>();
  grupos: string[] = [];
  alias: Record<string, string> = {};
  /** true solo cuando respondió el servidor (con el respaldo no se puede declarar inválido nada). */
  cargado = false;

  private carga$?: Observable<CatalogoUnidades>;

  readonly unidades$: Observable<UnidadAmigable[]> = defer(() => this.cargar()).pipe(map((c) => c.unidades));
  readonly grupos$: Observable<string[]> = defer(() => this.cargar()).pipe(map((c) => c.grupos));

  constructor() {
    this.aplicar(CATALOGO_RESPALDO, false);
  }

  /** Una sola petición por sesión; si falla se queda con la lista de respaldo. */
  cargar(): Observable<CatalogoUnidades> {
    if (!this.carga$) {
      this.carga$ = this.http.get<CatalogoUnidades>(urlConstants.producto.unidades, opcionesHttp()).pipe(
        map((c) => {
          if (!Array.isArray(c?.unidades) || !c.unidades.length) throw new Error('catálogo vacío');
          return { grupos: c.grupos ?? [], unidades: c.unidades, alias: c.alias ?? {} };
        }),
        tap((c) => this.aplicar(c, true)),
        catchError(() => {
          this.aplicar(CATALOGO_RESPALDO, false);
          return of(CATALOGO_RESPALDO);
        }),
        shareReplay(1),
      );
    }
    return this.carga$;
  }

  /** Qué hacer con el valor que trae un producto (ver `EstadoUnidad`). */
  resolver(valor: string | null | undefined): ResolucionUnidad {
    const original = String(valor ?? '').trim();
    if (!original) {
      return { estado: 'ok', codigo: UNIDAD_POR_DEFECTO, original, unidad: this.mapa.get(UNIDAD_POR_DEFECTO) };
    }
    const exacta = this.mapa.get(original);
    if (exacta) return { estado: 'ok', codigo: exacta.codigo, original, unidad: exacta };

    const clave = claveUnidad(original);
    const porCodigo = this.mapa.get(clave);
    if (porCodigo) return { estado: 'corregida', codigo: porCodigo.codigo, original, unidad: porCodigo };
    if (CODIGOS_UNIDAD_OCULTOS.includes(clave)) {
      return { estado: clave === original ? 'oculta' : 'corregida', codigo: clave, original };
    }
    const destino = this.alias[clave];
    if (destino) {
      const unidadDestino = this.mapa.get(destino);
      if (unidadDestino) return { estado: 'corregida', codigo: destino, original, unidad: unidadDestino };
      if (CODIGOS_UNIDAD_OCULTOS.includes(destino)) return { estado: 'corregida', codigo: destino, original };
    }
    return { estado: this.cargado ? 'invalida' : 'pendiente', codigo: original, original };
  }

  /** «Kilogramo (kg)». */
  etiqueta(u: UnidadAmigable): string {
    return `${u.nombre} (${u.abreviatura})`;
  }

  private aplicar(c: CatalogoUnidades, delServidor: boolean): void {
    this.mapa.clear();
    for (const u of c.unidades) this.mapa.set(u.codigo, u);
    this.grupos = c.grupos;
    this.alias = c.alias;
    this.cargado = delServidor;
  }
}
