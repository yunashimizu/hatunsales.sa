import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';

@Injectable({ providedIn: 'root' })
export class ProductoService {
  constructor(private http: HttpClient) {}

  getProductos(): Observable<any[]> {
    const token = sessionStorage.getItem('token') ?? '';
    const headers = new HttpHeaders(
      token ? { Authorization: `Bearer ${token}` } : {}
    );

    return this.http.get<any>(urlConstants.producto.base, {
      headers,
      withCredentials: true,
    }).pipe(
      map((response: any) => {
        if (Array.isArray(response)) return response;
        if (response && Array.isArray(response.data)) return response.data;
        return [];
      })
    );
  }
}
