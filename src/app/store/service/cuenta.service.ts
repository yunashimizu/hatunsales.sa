import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { urlConstants } from '../../constants/urlConstants';
import { DireccionEnvio, DireccionPayload, ProductoTienda } from '../models/tienda.models';

@Injectable({ providedIn: 'root' })
export class CuentaTiendaService {

  private readonly http = inject(HttpClient);

  /** Ids de favoritos en memoria para pintar el corazón sin pedir al servidor en cada tarjeta. */
  private readonly favoritos = new BehaviorSubject<Set<number>>(new Set());
  readonly favoritos$ = this.favoritos.asObservable();

  // ------------------------------------------------------------ direcciones

  listarDirecciones(): Observable<DireccionEnvio[]> {
    return this.http.get<DireccionEnvio[]>(urlConstants.tienda.direcciones).pipe(catchError(() => of([])));
  }

  crearDireccion(payload: DireccionPayload): Observable<DireccionEnvio> {
    return this.http.post<DireccionEnvio>(urlConstants.tienda.direcciones, payload);
  }

  actualizarDireccion(id: number, payload: DireccionPayload): Observable<DireccionEnvio> {
    return this.http.put<DireccionEnvio>(urlConstants.tienda.direccionById(id), payload);
  }

  eliminarDireccion(id: number): Observable<{ eliminado: boolean }> {
    return this.http.delete<{ eliminado: boolean }>(urlConstants.tienda.direccionById(id));
  }

  // -------------------------------------------------------------- favoritos

  listarFavoritos(): Observable<ProductoTienda[]> {
    return this.http.get<ProductoTienda[]>(urlConstants.tienda.favoritos).pipe(catchError(() => of([])));
  }

  sincronizarFavoritos(): Observable<number[]> {
    return this.http.get<number[]>(urlConstants.tienda.favoritosIds).pipe(
      catchError(() => of<number[]>([])),
      tap((ids) => this.favoritos.next(new Set(ids))),
    );
  }

  alternarFavorito(idProducto: number): Observable<{ id_producto: number; favorito: boolean }> {
    return this.http
      .post<{ id_producto: number; favorito: boolean }>(urlConstants.tienda.favoritoToggle(idProducto), {})
      .pipe(
        tap(({ favorito }) => {
          const actuales = new Set(this.favoritos.value);
          favorito ? actuales.add(idProducto) : actuales.delete(idProducto);
          this.favoritos.next(actuales);
        }),
      );
  }

  esFavorito(idProducto: number): boolean {
    return this.favoritos.value.has(idProducto);
  }

  limpiarFavoritos(): void {
    this.favoritos.next(new Set());
  }

  // ----------------------------------------------------------------- reseñas

  guardarResena(idProducto: number, calificacion: number, titulo?: string, comentario?: string) {
    return this.http.post(urlConstants.tienda.resena(idProducto), { calificacion, titulo, comentario });
  }
}
