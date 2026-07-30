import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { ImagenProducto } from '../models/admin.models';
import { cabecerasAutenticadas, opcionesHttp } from './api-base.service';

@Injectable({ providedIn: 'root' })
export class ProductoImagenService {

  constructor(private http: HttpClient) {}

  listar(idProducto: number): Observable<ImagenProducto[]> {
    return this.http.get<ImagenProducto[]>(urlConstants.producto.images(idProducto), opcionesHttp());
  }

  /** Sube varias imágenes en una sola petición. */
  subir(idProducto: number, archivos: File[]): Observable<ImagenProducto[]> {
    const cuerpo = new FormData();
    archivos.forEach((archivo) => cuerpo.append('files', archivo, archivo.name));

    // No se fija Content-Type a propósito: el navegador tiene que agregar el
    // boundary del multipart, y ponerlo a mano lo rompe.
    return this.http.post<ImagenProducto[]>(urlConstants.producto.imagesLote(idProducto), cuerpo, {
      headers: cabecerasAutenticadas(),
      withCredentials: true,
    });
  }

  marcarPrincipal(idProducto: number, idImagen: number): Observable<ImagenProducto[]> {
    return this.http.patch<ImagenProducto[]>(
      urlConstants.producto.imagePrimary(idProducto, idImagen),
      {},
      opcionesHttp(),
    );
  }

  reordenar(idProducto: number, ids: number[]): Observable<ImagenProducto[]> {
    return this.http.put<ImagenProducto[]>(
      urlConstants.producto.imagesOrden(idProducto),
      { ids },
      opcionesHttp(),
    );
  }

  eliminar(idProducto: number, idImagen: number): Observable<ImagenProducto[]> {
    return this.http.delete<ImagenProducto[]>(
      urlConstants.producto.imageDelete(idProducto, idImagen),
      opcionesHttp(),
    );
  }
}
