import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, shareReplay, throwError } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { opcionesHttp } from './api-base.service';

/** Distrito del catálogo INEI (el código que pide la GRE; los de RENIEC son distintos). */
export interface Ubigeo {
  codigo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  /** «LURIN - LIMA - LIMA». */
  texto: string;
}

/** El mismo mínimo que exige GET /ubigeo?q=: con menos el backend responde 400. */
export const MINIMO_CARACTERES_UBIGEO = 3;
/** Al escribir y borrar se repiten búsquedas («lur», «luri», «lur»): se guardan unos minutos. */
const VIGENCIA_MS = 5 * 60_000;
const MAXIMO_EN_CACHE = 60;

interface Guardado<T> {
  expira: number;
  datos: Observable<T>;
}

/** Sin tildes, en minúsculas y con un solo espacio: «Lurín » y «lurin» son la misma búsqueda. */
function claveBusqueda(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Catálogo de ubigeos INEI para los puntos de partida y llegada. El catálogo es estático (el servidor
 * además pide al navegador guardarlo una hora); aquí solo se evita repetir la misma petición seguida.
 */
@Injectable({ providedIn: 'root' })
export class UbigeoService {
  private readonly http = inject(HttpClient);
  private readonly busquedas = new Map<string, Guardado<Ubigeo[]>>();
  private readonly codigos = new Map<string, Guardado<Ubigeo>>();

  /** Hasta 20 distritos por nombre (distrito o provincia) o por el inicio del código. */
  buscar(consulta: string, minimo = MINIMO_CARACTERES_UBIGEO): Observable<Ubigeo[]> {
    const q = String(consulta ?? '').trim();
    if (q.length < Math.max(MINIMO_CARACTERES_UBIGEO, minimo)) return of([]);
    return this.desdeCache(this.busquedas, claveBusqueda(q), () =>
      this.http.get<Ubigeo[]>(urlConstants.ubigeo.buscar, { ...opcionesHttp(), params: new HttpParams().set('q', q) }),
    );
  }

  obtener(codigo: string): Observable<Ubigeo> {
    const limpio = String(codigo ?? '').trim();
    if (!/^\d{6}$/.test(limpio)) {
      return throwError(() => new Error('El ubigeo debe tener 6 dígitos (código INEI del distrito).'));
    }
    return this.desdeCache(this.codigos, limpio, () => this.http.get<Ubigeo>(urlConstants.ubigeo.byCodigo(limpio), opcionesHttp()));
  }

  /** Comparte la respuesta mientras está vigente; un error no se guarda (la siguiente vez se vuelve a pedir). */
  private desdeCache<T>(cache: Map<string, Guardado<T>>, clave: string, pedir: () => Observable<T>): Observable<T> {
    const ahora = Date.now();
    const guardado = cache.get(clave);
    if (guardado && guardado.expira > ahora) return guardado.datos;
    const datos = pedir().pipe(
      catchError((error) => {
        cache.delete(clave);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    cache.delete(clave);
    cache.set(clave, { expira: ahora + VIGENCIA_MS, datos });
    // Map conserva el orden de inserción: la primera clave es la más antigua.
    if (cache.size > MAXIMO_EN_CACHE) cache.delete(cache.keys().next().value as string);
    return datos;
  }
}
