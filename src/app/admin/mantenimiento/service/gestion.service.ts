import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { urlConstants } from '../../../constants/urlConstants';

@Injectable({ providedIn: 'root' })
export class GestionService {
  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('token') ?? '';
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  getProductos(): Observable<any[]> {
    return this.http.get<any>(urlConstants.producto.base, { headers: this.getHeaders(), withCredentials: true }).pipe(
      map((response: any) => Array.isArray(response) ? response : response?.data ?? [])
    );
  }

  getInventario(): Observable<any[]> {
    return this.http.get<any>(urlConstants.inventario.base, { headers: this.getHeaders(), withCredentials: true }).pipe(
      map((response: any) => Array.isArray(response) ? response : response?.data ?? [])
    );
  }

  getClientes(): Observable<any[]> {
    return this.http.get<any>(urlConstants.cliente.base, { headers: this.getHeaders(), withCredentials: true }).pipe(
      map((response: any) => Array.isArray(response) ? response : response?.data ?? [])
    );
  }

  getUsuarios(): Observable<any[]> {
    return this.http.get<any>(urlConstants.usuario.base, { headers: this.getHeaders(), withCredentials: true }).pipe(
      map((response: any) => Array.isArray(response) ? response : response?.data ?? [])
    );
  }

  getReportesVentas(periodo = 'diario'): Observable<any> {
    return this.http.get<any>(urlConstants.reportes.ventas, {
      headers: this.getHeaders(),
      withCredentials: true,
      params: { periodo },
    });
  }

  exportReportesVentasExcel(periodo = 'diario'): Observable<Blob> {
    return this.http.get(urlConstants.reportes.ventasExcel, {
      headers: this.getHeaders(),
      withCredentials: true,
      params: { periodo },
      responseType: 'blob',
    });
  }

  exportReportesVentasPdf(periodo = 'diario'): Observable<Blob> {
    return this.http.get(urlConstants.reportes.ventasPdf, {
      headers: this.getHeaders(),
      withCredentials: true,
      params: { periodo },
      responseType: 'blob',
    });
  }

  getStockResumen(): Observable<any> {
    return this.http.get<any>(urlConstants.stock.resumenSucursal, { headers: this.getHeaders(), withCredentials: true });
  }

  getSunatDni(dni: string): Observable<any> {
    return this.http.get<any>(urlConstants.sunat.dni(dni), { headers: this.getHeaders(), withCredentials: true });
  }

  getSunatRuc(ruc: string): Observable<any> {
    return this.http.get<any>(urlConstants.sunat.ruc(ruc), { headers: this.getHeaders(), withCredentials: true });
  }

  buscarProductoPorCodigo(codigo: string): Observable<any> {
    return this.http.get<any>(urlConstants.producto.barcodeByCode(codigo), { headers: this.getHeaders(), withCredentials: true });
  }

  crearClienteDesdeDni(dni: string): Observable<any> {
    return this.http.post<any>(urlConstants.cliente.dni(dni), {}, { headers: this.getHeaders(), withCredentials: true });
  }

  crearClienteDesdeRuc(ruc: string): Observable<any> {
    return this.http.post<any>(urlConstants.cliente.ruc(ruc), {}, { headers: this.getHeaders(), withCredentials: true });
  }

  crearComprobante(payload: any): Observable<any> {
    return this.http.post<any>(urlConstants.comprobante.generar, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  getComprobantesPorCliente(idCliente: number): Observable<any[]> {
    return this.http.get<any>(urlConstants.otros.comprobanteCliente(idCliente), { headers: this.getHeaders(), withCredentials: true }).pipe(
      map((response: any) => Array.isArray(response) ? response : response?.data ?? [])
    );
  }

  // Obtener comprobante por id
  getComprobanteById(id: number): Observable<any> {
    return this.http.get<any>(urlConstants.comprobante.byId(id), { headers: this.getHeaders(), withCredentials: true });
  }

  // Descargar PDF del comprobante
  descargarComprobantePdf(id: number): Observable<Blob> {
    return this.http.get(urlConstants.comprobante.pdf(id), { headers: this.getHeaders(), withCredentials: true, responseType: 'blob' });
  }

  crearProforma(payload: any): Observable<any> {
    return this.http.post<any>(urlConstants.proforma.base, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  actualizarInventario(payload: any): Observable<any> {
    return this.http.put<any>(urlConstants.inventario.base, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  transferirStock(payload: any): Observable<any> {
    return this.http.post<any>(urlConstants.stock.transfer, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  getInventarioPorProducto(idProducto: number): Observable<any> {
    return this.http.get<any>(urlConstants.inventario.byProducto(idProducto), { headers: this.getHeaders(), withCredentials: true });
  }

  crearProducto(payload: any): Observable<any> {
    return this.http.post<any>(urlConstants.producto.base, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  // Obtener imágenes de un producto
  getProductoImages(idProducto: number): Observable<any[]> {
    return this.http.get<any>(urlConstants.producto.images(idProducto), { headers: this.getHeaders(), withCredentials: true }).pipe(
      map((response: any) => Array.isArray(response) ? response : response?.data ?? [])
    );
  }

  crearUsuario(payload: any): Observable<any> {
    return this.http.post<any>(urlConstants.usuario.base, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  // Crear empleado por admin (permite enviar id_rol)
  crearEmpleado(payload: any): Observable<any> {
    return this.http.post<any>(urlConstants.admin.crearEmpleado, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  // Obtener roles disponibles
  getRoles(): Observable<any[]> {
    return this.http.get<any>(urlConstants.rol, { headers: this.getHeaders(), withCredentials: true }).pipe(
      map((response: any) => Array.isArray(response) ? response : response?.data ?? [])
    );
  }

  getRolesAdmin(): Observable<any[]> {
    return this.http.get<any[]>(urlConstants.admin.roles, { headers: this.getHeaders(), withCredentials: true });
  }

  getUsuariosAdmin(): Observable<any[]> {
    return this.http.get<any[]>(urlConstants.admin.usuarios, { headers: this.getHeaders(), withCredentials: true });
  }

  /** Fallback legacy por si /admin/usuarios no responde. */
  getUsuariosAdminAlt(): Observable<any[]> {
    return this.http.get<any[]>(urlConstants.admin.rolesUsuarios, { headers: this.getHeaders(), withCredentials: true });
  }

  crearUsuarioAdmin(payload: any): Observable<any> {
    return this.http.post<any>(urlConstants.admin.crearEmpleado, payload, {
      headers: this.getHeaders(),
      withCredentials: true,
    });
  }

  actualizarUsuarioAdmin(payload: any): Observable<any> {
    return this.http.put<any>(urlConstants.admin.actualizarEmpleado, payload, {
      headers: this.getHeaders(),
      withCredentials: true,
    });
  }

  eliminarUsuarioAdmin(idUsuario: number): Observable<any> {
    return this.http.delete<any>(urlConstants.admin.eliminar, {
      headers: this.getHeaders(),
      withCredentials: true,
      body: { id_usuario: idUsuario },
    });
  }

  cambiarRolAdmin(id: number, idRol: number): Observable<any> {
    return this.http.put<any>(urlConstants.admin.cambiarRol, { id_usuario: id, id_rol: idRol }, {
      headers: this.getHeaders(),
      withCredentials: true,
    });
  }

  crearCliente(payload: any): Observable<any> {
    return this.http.post<any>(urlConstants.cliente.base, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  eliminarCliente(id: number): Observable<any> {
    return this.http.delete<any>(urlConstants.cliente.byId(id), {
      headers: this.getHeaders(),
      withCredentials: true,
    });
  }

  // --- Categorías CRUD ---
  getCategorias(): Observable<any[]> {
    return this.http.get<any>(urlConstants.categoria, { headers: this.getHeaders(), withCredentials: true }).pipe(
      map((response: any) => Array.isArray(response) ? response : response?.data ?? [])
    );
  }

  crearCategoria(payload: any): Observable<any> {
    return this.http.post<any>(urlConstants.categoria, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  actualizarCategoria(id: number, payload: any): Observable<any> {
    return this.http.put<any>(`${urlConstants.categoria}/${id}`, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  eliminarCategoria(id: number): Observable<any> {
    return this.http.delete<any>(`${urlConstants.categoria}/${id}`, { headers: this.getHeaders(), withCredentials: true });
  }

  // --- Marcas CRUD ---
  getMarcas(): Observable<any[]> {
    return this.http.get<any>(urlConstants.marca, { headers: this.getHeaders(), withCredentials: true }).pipe(
      map((response: any) => Array.isArray(response) ? response : response?.data ?? []),
    );
  }

  crearMarca(payload: any): Observable<any> {
    return this.http.post<any>(urlConstants.marca, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  actualizarMarca(id: number, payload: any): Observable<any> {
    return this.http.put<any>(`${urlConstants.marca}/${id}`, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  eliminarMarca(id: number): Observable<any> {
    return this.http.delete<any>(`${urlConstants.marca}/${id}`, { headers: this.getHeaders(), withCredentials: true });
  }

  // --- Almacenes CRUD ---
  getAlmacenesAdmin(): Observable<any[]> {
    return this.http.get<any>(urlConstants.almacen, { headers: this.getHeaders(), withCredentials: true }).pipe(
      map((response: any) => Array.isArray(response) ? response : response?.data ?? []),
    );
  }

  getSucursalesAlmacen(): Observable<any[]> {
    return this.http.get<any>(`${urlConstants.almacen}/sucursales`, { headers: this.getHeaders(), withCredentials: true }).pipe(
      map((response: any) => Array.isArray(response) ? response : response?.data ?? []),
    );
  }

  crearAlmacen(payload: any): Observable<any> {
    return this.http.post<any>(urlConstants.almacen, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  actualizarAlmacen(id: number, payload: any): Observable<any> {
    return this.http.put<any>(`${urlConstants.almacen}/${id}`, payload, { headers: this.getHeaders(), withCredentials: true });
  }

  eliminarAlmacen(id: number): Observable<any> {
    return this.http.delete<any>(`${urlConstants.almacen}/${id}`, { headers: this.getHeaders(), withCredentials: true });
  }
}
