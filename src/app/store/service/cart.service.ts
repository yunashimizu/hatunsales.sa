import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { urlConstants } from '../../constants/urlConstants';
import { sinAvisoGlobal } from '../../interceptors/contexto-http';
import { AlertService } from '../../shared/services/alert.service';
import { mensajeDeError, yaNotificado } from '../../shared/utils/errores-http.util';
import { Carrito } from '../models/tienda.models';

const CLAVE_TOKEN_INVITADO = 'tienda_token_invitado';

const CARRITO_VACIO: Carrito = {
  id_carrito: 0,
  items: [],
  cantidad_items: 0,
  subtotal: 0,
  igv: 0,
  total: 0,
};

/** De quién es el carrito en pantalla: al iniciar o cerrar sesión hay que volver a pedirlo. */
type Identidad = 'cliente' | 'invitado';

/**
 * Carrito respaldado por el backend. Un visitante sin cuenta se identifica con
 * un token guardado en el navegador; al iniciar sesión ese carrito se fusiona
 * con el del cliente.
 */
@Injectable({ providedIn: 'root' })
export class CartService {

  private readonly http = inject(HttpClient);
  private readonly alerta = inject(AlertService);
  private readonly carrito = new BehaviorSubject<Carrito>(CARRITO_VACIO);
  private readonly panelAbierto = new BehaviorSubject<boolean>(false);
  /** Identidad con la que se cargó el carrito; evita GET repetidos al montar header/layout. */
  private cargadoComo: Identidad | null = null;

  readonly carrito$ = this.carrito.asObservable();
  readonly panelAbierto$ = this.panelAbierto.asObservable();

  get actual(): Carrito {
    return this.carrito.value;
  }

  get cantidad(): number {
    return this.carrito.value.cantidad_items;
  }

  // ------------------------------------------------------------------ estado

  /**
   * Trae el carrito una vez por identidad (`forzar` lo vuelve a pedir):
   * - un visitante sin token todavía no tiene carrito: se muestra vacío sin ir
   *   al servidor (el carrito nace al agregar el primer producto);
   * - recién iniciada la sesión con un carrito de invitado en el navegador, se
   *   fusiona con el del cliente.
   */
  cargar(forzar = false): Observable<Carrito> {
    const identidad = this.identidad;
    if (!forzar && this.cargadoComo === identidad) return of(this.carrito.value);

    if (identidad === 'cliente' && this.token) return this.fusionarTrasLogin();

    if (identidad === 'invitado' && !this.token) {
      this.aplicar(CARRITO_VACIO);
      this.cargadoComo = identidad;
      return of(CARRITO_VACIO);
    }

    return this.pedirCarrito(identidad);
  }

  agregar(idProducto: number, cantidad = 1): Observable<Carrito> {
    return this.http
      .post<Carrito>(urlConstants.tienda.carritoItems, {
        id_producto: idProducto,
        cantidad,
        token_invitado: this.token ?? undefined,
      })
      .pipe(tap((carrito) => this.aplicar(carrito)));
  }

  /**
   * Actualiza el carrito en pantalla al instante (badge/panel) mientras llega el API.
   * Si el POST falla, llamar `cargar(true)` para revertir.
   */
  aplicarAgregarOptimistico(
    producto: { id_producto: number; nombre: string; imagen: string | null; marca?: string; precio_final: number; stock: number },
    cantidad = 1,
  ): void {
    const actual = this.carrito.value;
    const items = [...(actual.items ?? [])];
    const idx = items.findIndex((i) => i.id_producto === producto.id_producto);

    if (idx >= 0) {
      const prev = items[idx];
      const nuevaCantidad = prev.cantidad + cantidad;
      items[idx] = {
        ...prev,
        cantidad: nuevaCantidad,
        subtotal: Math.round((nuevaCantidad * prev.precio_unitario + Number.EPSILON) * 100) / 100,
      };
    } else {
      const precio = Number(producto.precio_final) || 0;
      items.push({
        id_item: -Date.now(),
        id_producto: producto.id_producto,
        nombre: producto.nombre,
        imagen: producto.imagen,
        marca: producto.marca,
        cantidad,
        precio_unitario: precio,
        subtotal: Math.round((precio * cantidad + Number.EPSILON) * 100) / 100,
        stock_disponible: producto.stock,
        excede_stock: false,
      });
    }

    const cantidad_items = items.reduce((s, i) => s + i.cantidad, 0);
    const subtotal = Math.round((items.reduce((s, i) => s + i.subtotal, 0) + Number.EPSILON) * 100) / 100;

    this.carrito.next({
      ...actual,
      items,
      cantidad_items,
      subtotal,
      igv: actual.igv,
      total: subtotal,
    });
  }

  cambiarCantidad(idItem: number, cantidad: number): Observable<Carrito> {
    return this.http
      .put<Carrito>(urlConstants.tienda.carritoItem(idItem), {
        cantidad,
        token_invitado: this.token ?? undefined,
      })
      .pipe(tap((carrito) => this.aplicar(carrito)));
  }

  quitar(idItem: number): Observable<Carrito> {
    return this.http
      .delete<Carrito>(urlConstants.tienda.carritoItem(idItem), { params: this.paramsInvitado() })
      .pipe(tap((carrito) => this.aplicar(carrito)));
  }

  vaciar(): Observable<Carrito> {
    return this.http
      .delete<Carrito>(urlConstants.tienda.carrito, { params: this.paramsInvitado() })
      .pipe(tap((carrito) => this.aplicar(carrito)));
  }

  /**
   * Pasa al carrito del cliente lo que eligió como invitado. El token de invitado
   * se borra solo cuando la fusión se confirmó: si falla (red, servidor), se
   * conserva para reintentar, se avisa y se muestra el carrito del cliente. Antes
   * se borraba igual y el cliente perdía lo elegido sin enterarse.
   */
  fusionarTrasLogin(): Observable<Carrito> {
    const token = this.token;
    if (!token || this.identidad !== 'cliente') return this.cargar(true);

    return this.http
      .post<Carrito>(urlConstants.tienda.carritoFusionar, { token_invitado: token }, { context: sinAvisoGlobal() })
      .pipe(
        tap((carrito) => {
          this.limpiarToken();
          this.aplicar(carrito);
          this.cargadoComo = 'cliente';
        }),
        catchError(() => {
          this.alerta.toast({
            type: 'warning',
            title: 'No pudimos traer tu carrito anterior',
            message: 'Lo que elegiste antes de iniciar sesión sigue guardado. Recarga la página en unos segundos.',
            timer: 5000,
          });
          return this.pedirCarrito('cliente');
        }),
      );
  }

  /** Tras cerrar sesión el carrito del cliente ya no aplica al visitante. */
  reiniciar(): void {
    this.limpiarToken();
    this.cargadoComo = null;
    this.carrito.next(CARRITO_VACIO);
  }

  // ------------------------------------------------------------------- panel

  abrirPanel(): void {
    this.panelAbierto.next(true);
  }

  cerrarPanel(): void {
    this.panelAbierto.next(false);
  }

  alternarPanel(): void {
    this.panelAbierto.next(!this.panelAbierto.value);
  }

  // ---------------------------------------------------------------- privados

  /**
   * GET del carrito. Si falla, se avisa (salvo que el interceptor ya lo hiciera)
   * y se mantiene lo que había en pantalla sin marcarlo como cargado, para
   * reintentar en la próxima visita.
   */
  private pedirCarrito(identidad: Identidad): Observable<Carrito> {
    return this.http
      .get<Carrito>(urlConstants.tienda.carrito, { params: this.paramsInvitado() })
      .pipe(
        tap((carrito) => {
          // Un token que ya no corresponde a ningún carrito no sirve para nada.
          if (identidad === 'invitado' && !carrito?.id_carrito) this.limpiarToken();
          this.aplicar(carrito);
          this.cargadoComo = identidad;
        }),
        catchError((error) => {
          if (!yaNotificado(error)) {
            this.alerta.toast({ type: 'error', title: mensajeDeError(error, 'No pudimos cargar tu carrito') });
          }
          return of(this.carrito.value);
        }),
      );
  }

  private aplicar(carrito: Carrito): void {
    if (carrito?.token_invitado) this.guardarToken(carrito.token_invitado);
    this.carrito.next(carrito ?? CARRITO_VACIO);
  }

  private get identidad(): Identidad {
    return typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('token') ? 'cliente' : 'invitado';
  }

  private get token(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(CLAVE_TOKEN_INVITADO);
  }

  private guardarToken(token: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CLAVE_TOKEN_INVITADO, token);
  }

  private limpiarToken(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(CLAVE_TOKEN_INVITADO);
  }

  private paramsInvitado(): HttpParams {
    const token = this.token;
    return token ? new HttpParams().set('token_invitado', token) : new HttpParams();
  }
}
