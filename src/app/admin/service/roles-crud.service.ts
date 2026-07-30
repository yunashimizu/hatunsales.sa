import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { opcionesHttp } from './api-base.service';

export interface RolAdmin {
  id_rol: number;
  nombre: string;
  usuarios?: number;
  protegido?: boolean;
}

@Injectable({ providedIn: 'root' })
export class RolesAdminCrudService {
  constructor(private readonly http: HttpClient) {}

  listar(): Observable<RolAdmin[]> {
    return this.http.get<any>(urlConstants.rol, opcionesHttp()).pipe(
      map((r) => (Array.isArray(r) ? r : r?.data ?? [])),
    );
  }

  crear(nombre: string): Observable<RolAdmin> {
    return this.http.post<RolAdmin>(urlConstants.rol, { nombre }, opcionesHttp());
  }

  actualizar(id: number, nombre: string): Observable<RolAdmin> {
    return this.http.put<RolAdmin>(`${urlConstants.rol}${id}`, { nombre }, opcionesHttp());
  }

  eliminar(id: number): Observable<any> {
    return this.http.delete(`${urlConstants.rol}${id}`, opcionesHttp());
  }
}
