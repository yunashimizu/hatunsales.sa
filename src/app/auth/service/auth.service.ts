import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, Subject } from 'rxjs';
import { loginResponse } from '../models/login-response.model';
import { UsuarioLoginResponse } from '../models/usuario-login-response.model';
import { RolResponse } from '../models/role-responde';
import { loginRequest } from '../models/login-request';
import { urlConstants } from '../../constants/urlConstants';
import {
  esRolCliente,
  esRolConsulta,
  esRolStaff,
  puedeEditarCatalogo,
  rolPermitido,
} from '../roles.constants';

export interface SesionUsuario {
  idUsuario: number;
  nombre: string;
  email: string;
  rolId: number;
  rolNombre: string;
  permisos: string[];
  iniciales: string;
}

export interface ActualizarPerfilPayload {
  nombre?: string;
  email?: string;
  password_actual?: string;
  password_nueva?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {

  private dataSubject = new Subject<loginResponse>();
  data$ = this.dataSubject.asObservable();

  private userData: loginResponse = {
    success: false,
    mensaje: '',
    token: '',
    tokenExpira: '',
    usuario: new UsuarioLoginResponse(),
    rol: new RolResponse(),
    permisos: [],
  };

  constructor(private http: HttpClient) {
    const stored = sessionStorage.getItem('userData');
    if (stored) {
      try {
        this.userData = JSON.parse(stored);
        this.dataSubject.next(this.userData);
      } catch {
        sessionStorage.removeItem('userData');
      }
    }
  }

  private getAuthHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('token') ?? '';
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  login(request: loginRequest): Observable<loginResponse> {
    return this.http.post<any>(urlConstants.authRoutes.login, request).pipe(
      map((response) => this.normalizeLoginResponse(response)),
    );
  }

  register(payload: {
    nombre?: string;
    nombres?: string;
    apellidos?: string;
    email: string;
    password: string;
    telefono?: string;
  }): Observable<any> {
    return this.http.post<any>(urlConstants.authRoutes.register, payload);
  }

  googleConfig(): Observable<{ clientId: string | null; habilitado: boolean }> {
    return this.http.get<{ clientId: string | null; habilitado: boolean }>(
      urlConstants.authRoutes.googleConfig,
    );
  }

  loginConGoogle(credential: string): Observable<loginResponse> {
    return this.http
      .post<any>(urlConstants.authRoutes.google, { credential })
      .pipe(map((response) => this.normalizeLoginResponse(response)));
  }

  getPerfil(): Observable<any> {
    return this.http.get<any>(urlConstants.authRoutes.perfil, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
    });
  }

  actualizarPerfil(payload: ActualizarPerfilPayload): Observable<loginResponse> {
    return this.http.put<any>(urlConstants.authRoutes.perfil, payload, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
    }).pipe(map((response) => this.normalizeLoginResponse(response)));
  }

  getUsuarios(): Observable<any> {
    return this.http.get<any>(urlConstants.usuario.base, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
    });
  }

  normalizeLoginResponse(response: any): loginResponse {
    const roleName = typeof response?.rol === 'string'
      ? response.rol
      : response?.rol?.nombre ?? response?.rolNombre ?? 'cliente';

    return {
      success: true,
      mensaje: response?.mensaje ?? 'Inicio de sesión correcto',
      token: response.access_token ?? response.token ?? '',
      tokenExpira: response.expires_in ?? response.tokenExpira ?? '',
      usuario: {
        idUsuario: response.id_usuario ?? response.usuario?.idUsuario ?? 0,
        nombre: response.nombre ?? response.usuario?.nombre ?? '',
        email: response.email ?? response.usuario?.email ?? '',
      } as UsuarioLoginResponse,
      rol: {
        idRol: response.rol?.idRol ?? response.rol?.id_rol ?? 0,
        nombre: roleName,
      } as RolResponse,
      permisos: (response.permisos ?? []).map((permiso: string | { nombre: string }) => ({
        idPermiso: 0,
        nombre: typeof permiso === 'string' ? permiso : permiso.nombre,
      })),
    };
  }

  sendData(data: loginResponse): void {
    this.userData = data;
    this.dataSubject.next(this.userData);

    sessionStorage.setItem('userData', JSON.stringify(data));
    sessionStorage.setItem('token', data.token);
    sessionStorage.setItem('idUsuario', String(data.usuario.idUsuario ?? 0));
    sessionStorage.setItem('nombre', data.usuario.nombre ?? '');
    sessionStorage.setItem('email', data.usuario.email ?? '');
    sessionStorage.setItem('rolId', String(data.rol.idRol ?? 0));
    sessionStorage.setItem('rolNombre', data.rol.nombre ?? '');
    // Alias usado por pantallas de tienda.
    sessionStorage.setItem('rol', data.rol.nombre ?? '');
    sessionStorage.setItem(
      'permisos',
      JSON.stringify((data.permisos ?? []).map((p) => p.nombre)),
    );
  }

  getUserDataSync(): loginResponse {
    return this.userData;
  }

  /** Vista lista para header, sidebar y perfil. */
  getSesion(): SesionUsuario {
    const data = this.userData;
    const nombre = data.usuario?.nombre
      || sessionStorage.getItem('nombre')
      || '';
    const email = data.usuario?.email
      || sessionStorage.getItem('email')
      || '';
    const rolNombre = data.rol?.nombre
      || sessionStorage.getItem('rolNombre')
      || sessionStorage.getItem('rol')
      || '';
    const permisos: string[] = data.permisos?.length
      ? data.permisos.map((p) => p.nombre)
      : JSON.parse(sessionStorage.getItem('permisos') || '[]');

    return {
      idUsuario: Number(data.usuario?.idUsuario || sessionStorage.getItem('idUsuario') || 0),
      nombre,
      email,
      rolId: Number(data.rol?.idRol || sessionStorage.getItem('rolId') || 0),
      rolNombre,
      permisos,
      iniciales: this.inicialesDe(nombre),
    };
  }

  inicialesDe(nombre: string): string {
    return (nombre || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0].toUpperCase())
      .join('') || '?';
  }

  etiquetaRol(rol?: string): string {
    const mapa: Record<string, string> = {
      admin: 'Administrador',
      superadmin: 'Superadmin',
      vendedor: 'Vendedor',
      caja: 'Caja',
      consulta: 'Consulta',
      demo: 'Consulta',
      visor: 'Consulta',
      cliente: 'Cliente',
    };
    const clave = (rol ?? '').toLowerCase();
    return mapa[clave] || (rol ? rol.charAt(0).toUpperCase() + rol.slice(1) : 'Usuario');
  }

  isLoggedIn(): boolean {
    return !!sessionStorage.getItem('token');
  }

  isAdmin(): boolean {
    const rolId = Number(sessionStorage.getItem('rolId'));
    const rolNombre = sessionStorage.getItem('rolNombre') ?? sessionStorage.getItem('rol') ?? '';
    return esRolStaff(rolId, rolNombre);
  }

  isCliente(): boolean {
    const rolId = Number(sessionStorage.getItem('rolId'));
    const rolNombre = sessionStorage.getItem('rolNombre') ?? sessionStorage.getItem('rol') ?? '';
    if (esRolCliente(rolId, rolNombre)) return true;
    // Sin rol staff reconocible y con sesión → tratar como tienda (no panel).
    return this.isLoggedIn() && !esRolStaff(rolId, rolNombre);
  }

  /** Rol consulta / demo: ve catálogo, no edita. */
  esConsulta(): boolean {
    const sesion = this.getSesion();
    return esRolConsulta(sesion.rolId, sesion.rolNombre);
  }

  /** Admin o vendedor pueden mutar catálogo. */
  puedeEditarCatalogo(): boolean {
    const sesion = this.getSesion();
    return puedeEditarCatalogo(sesion.rolId, sesion.rolNombre);
  }

  tienePermiso(permiso: string): boolean {
    const permisos: string[] = JSON.parse(sessionStorage.getItem('permisos') || '[]');
    if (!permisos.length) return this.isAdmin();
    return permisos.includes(permiso);
  }

  /**
   * Visible si el rol está permitido (misma regla que roleGuard / sidebar).
   * Si además hay permisos en sesión y el ítem declara permisos, basta con uno.
   */
  puedeVer(roles: string[], permisosRequeridos: string[] = []): boolean {
    const sesion = this.getSesion();
    if (!rolPermitido(sesion.rolNombre, roles, sesion.rolId)) return false;
    if (!permisosRequeridos.length || !sesion.permisos.length) return true;
    return permisosRequeridos.some((p) => sesion.permisos.includes(p));
  }

  logout(): void {
    sessionStorage.clear();
    this.userData = {
      success: false,
      mensaje: '',
      token: '',
      tokenExpira: '',
      usuario: new UsuarioLoginResponse(),
      rol: new RolResponse(),
      permisos: [],
    };
  }

  /**
   * Ruta tras cerrar sesión.
   * Staff (admin/caja/vendedor) → login. Cliente / sin sesión → tienda.
   * Llamar ANTES de logout() si aún hay sesión, o pasar `eraStaff`.
   */
  rutaTrasCerrarSesion(eraStaff?: boolean): string {
    const staff = eraStaff ?? this.isAdmin();
    return staff ? '/auth' : '/store';
  }
}
