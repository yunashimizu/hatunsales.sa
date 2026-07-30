import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConstants } from '../../../constants/urlConstants';

@Injectable({ providedIn: 'root' })
export class RolesAdminService {
  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('token') ?? '';
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  listarRoles(): Observable<any[]> {
    return this.http.get<any[]>(urlConstants.admin.roles, { headers: this.getHeaders(), withCredentials: true });
  }

  listarUsuarios(): Observable<any[]> {
    return this.http.get<any[]>(urlConstants.admin.rolesUsuarios, { headers: this.getHeaders(), withCredentials: true });
  }

  crearUsuario(payload: any): Observable<any> {
    return this.http.post<any>(urlConstants.admin.crearUsuarioAdmin, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  cambiarRol(id: number, idRol: number): Observable<any> {
    return this.http.put<any>(urlConstants.admin.cambiarRolAdmin(id), { id_rol: idRol }, { headers: this.getHeaders(), withCredentials: true });
  }
}
