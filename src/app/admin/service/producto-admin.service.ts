import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { OpcionCategoria, OpcionMarca, ProductoAdmin } from '../models/admin.models';
import { opcionesHttp } from './api-base.service';

/** Campos que acepta el backend al crear o editar. */
export interface ProductoFormulario {
  nombre: string;
  descripcion?: string;
  descripcion_corta?: string;
  codigo_barras?: string;
  sku?: string;
  precio_compra?: number;
  precio_venta?: number;
  descuento?: number;
  unidad_medida?: string;
  id_categoria?: number;
  id_marca?: number;
  estado?: boolean;
  destacado?: boolean;
  /** Solo al crear: cantidad inicial en inventario. */
  stock?: number;
}

@Injectable({ providedIn: 'root' })
export class ProductoAdminService {

  constructor(private http: HttpClient) {}

  listar(): Observable<ProductoAdmin[]> {
    return this.http.get<any>(urlConstants.producto.base, opcionesHttp())
      .pipe(map((respuesta) => (Array.isArray(respuesta) ? respuesta : respuesta?.data ?? [])));
  }

  obtener(id: number): Observable<ProductoAdmin> {
    return this.http.get<ProductoAdmin>(urlConstants.producto.byId(id), opcionesHttp());
  }

  crear(datos: ProductoFormulario): Observable<ProductoAdmin> {
    return this.http.post<ProductoAdmin>(urlConstants.producto.base, datos, opcionesHttp());
  }

  actualizar(id: number, datos: ProductoFormulario): Observable<ProductoAdmin> {
    return this.http.put<ProductoAdmin>(urlConstants.producto.byId(id), datos, opcionesHttp());
  }

  eliminar(id: number): Observable<any> {
    return this.http.delete(urlConstants.producto.byId(id), opcionesHttp());
  }

  categorias(): Observable<OpcionCategoria[]> {
    return this.http.get<any>(urlConstants.categoria, opcionesHttp())
      .pipe(map((respuesta) => (Array.isArray(respuesta) ? respuesta : respuesta?.data ?? [])));
  }

  /**
   * Marcas activas desde el CRUD `/marca` (misma tabla que Productos).
   * Si el endpoint aún no está desplegado, cae a `/tienda/marcas`.
   */
  marcas(): Observable<OpcionMarca[]> {
    const mapear = (respuesta: any): OpcionMarca[] => {
      const lista = Array.isArray(respuesta) ? respuesta : respuesta?.data ?? [];
      return lista
        .filter((m: any) => m?.activo !== false)
        .map((m: any) => ({ id_marca: Number(m.id_marca), nombre: String(m.nombre ?? '') }));
    };

    return this.http.get<any>(urlConstants.marca, opcionesHttp()).pipe(
      map(mapear),
      catchError(() =>
        this.http.get<any>(urlConstants.tienda.marcas, opcionesHttp()).pipe(
          map(mapear),
          catchError(() => of([])),
        ),
      ),
    );
  }
}
