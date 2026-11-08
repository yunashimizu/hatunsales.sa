import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { urlConstants } from '../../../constants/urlConstants';
import { peticionSilenciosa } from '../../../interceptors/contexto-http';

/** Días de Lima (AAAA-MM-DD). */
export interface RangoReporteVentas {
  desde?: string;
  hasta?: string;
}

/** Lo que el servidor dice del Registro de ventas (SIRE) generado: qué entró y qué quedó fuera (cabecera `X-Rvie-Resumen`). */
export interface ResumenRegistroVentasSire {
  periodo: string;
  filas: number;
  anulados: number;
  por_tipo: { factura: number; boleta: number; nota_credito: number; nota_debito: number };
  en_dolares: number;
  omitidos: { pruebas: number; con_error: number; rechazados: number; sin_aceptar: number; anulados_sin_sunat: number };
  aviso: string;
}

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

  /**
   * Deuda por antigüedad calculada en el servidor (`credito/cuentas/antiguedad`, Fase F0): suma TODAS las cuentas con saldo,
   * no solo las que carga la lista. Silenciosa: si el servidor aún no la tiene, la pantalla calcula con las cuentas cargadas.
   */
  getAntiguedadCxc(): Observable<any> {
    return this.http.get<any>(`${urlConstants.credito.cuentas}/antiguedad`, {
      headers: this.getHeaders(),
      withCredentials: true,
      context: peticionSilenciosa(),
    });
  }

  getUsuarios(): Observable<any[]> {
    return this.http.get<any>(urlConstants.usuario.base, { headers: this.getHeaders(), withCredentials: true }).pipe(
      map((response: any) => Array.isArray(response) ? response : response?.data ?? [])
    );
  }

  /**
   * Con `rango` (desde y hasta, AAAA-MM-DD de Lima) el servidor filtra por esas fechas y usa `periodo`
   * solo para agrupar la tendencia. Sin rango, o con uno incompleto, manda solo el periodo como siempre.
   */
  getReportesVentas(
    periodo = 'diario',
    rango?: RangoReporteVentas,
    opciones: { silenciosa?: boolean } = {},
  ): Observable<any> {
    return this.http.get<any>(urlConstants.reportes.ventas, {
      headers: this.getHeaders(),
      withCredentials: true,
      params: this.paramsReporte(periodo, rango),
      ...(opciones.silenciosa ? { context: peticionSilenciosa() } : {}),
    });
  }

  exportReportesVentasExcel(periodo = 'diario', rango?: RangoReporteVentas): Observable<Blob> {
    return this.http.get(urlConstants.reportes.ventasExcel, {
      headers: this.getHeaders(),
      withCredentials: true,
      params: this.paramsReporte(periodo, rango),
      responseType: 'blob',
    });
  }

  exportReportesVentasPdf(periodo = 'diario', rango?: RangoReporteVentas): Observable<Blob> {
    return this.http.get(urlConstants.reportes.ventasPdf, {
      headers: this.getHeaders(),
      withCredentials: true,
      params: this.paramsReporte(periodo, rango),
      responseType: 'blob',
    });
  }

  /**
   * Registro de ventas para el SIRE (RVIE) de un mes (`AAAAMM`): el TXT de importación o el CSV con cabeceras para el contador.
   * Solo administrador. Devuelve la respuesta completa: el nombre del archivo viene en `Content-Disposition` y el resumen
   * (qué entró y qué quedó fuera) en `X-Rvie-Resumen`.
   */
  descargarRegistroVentasSire(periodo: string, formato: 'txt' | 'csv'): Observable<HttpResponse<Blob>> {
    const ruta = formato === 'csv' ? 'rvie.csv' : 'rvie';
    return this.http.get(`${urlConstants.reportes.ventas}/${ruta}`, {
      headers: this.getHeaders(),
      withCredentials: true,
      params: { periodo },
      responseType: 'blob',
      observe: 'response',
    });
  }

  private paramsReporte(periodo: string, rango?: RangoReporteVentas): Record<string, string> {
    return rango?.desde && rango?.hasta
      ? { periodo, fecha_inicio: rango.desde, fecha_fin: rango.hasta }
      : { periodo };
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
