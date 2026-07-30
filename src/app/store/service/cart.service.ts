import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { urlConstants } from '../../constants/urlConstants';
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

/**
 * Carrito respaldado por el backend. Un visitante sin cuenta se identifica con
 * un token guardado en el navegador; al iniciar sesión ese carrito se fusiona
 * con el del cliente.
 */
@Injectable({ providedIn: 'root' })
export class CartService {

  private readonly http = inject(HttpClient);
  private readonly carrito = new BehaviorSubject<Carrito>(CARRITO_VACIO);
  private readonly panelAbierto = new BehaviorSubject<boolean>(false);
  /** Evita GET repetidos del carrito al montar header/layout. */
  private carritoListo = false;

  readonly carrito$ = this.carrito.asObservable();
  readonly panelAbierto$ = this.panelAbierto.asObservable();

  get actual(): Carrito {
    return this.carrito.value;
  }

  get cantidad(): number {
    return this.carrito.value.cantidad_items;
  }

  // ------------------------------------------------------------------ estado

  cargar(forzar = false): Observable<Carrito> {
    if (this.carritoListo && !forzar) {
      return of(this.carrito.value);
    }

    return this.http
      .get<Carrito>(urlConstants.tienda.carrito, { params: this.paramsInvitado() })
      .pipe(
        catchError(() => of(CARRITO_VACIO)),
        tap((carrito) => {
          this.aplicar(carrito);
          this.carritoListo = true;
        }),
      );
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

  /** Se llama justo después del login para no perder lo que el visitante ya había elegido. */
  fusionarTrasLogin(): Observable<Carrito> {
    const token = this.token;
    if (!token) return this.cargar();

    return this.http
      .post<Carrito>(urlConstants.tienda.carritoFusionar, { token_invitado: token })
      .pipe(
        catchError(() => of(CARRITO_VACIO)),
        tap((carrito) => {
          this.limpiarToken();
          this.aplicar(carrito);
          this.carritoListo = true;
        }),
      );
  }

  /** Tras cerrar sesión el carrito del cliente ya no aplica al visitante. */
  reiniciar(): void {
    this.limpiarToken();
    this.carritoListo = false;
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

  private aplicar(carrito: Carrito): void {
    if (carrito?.token_invitado) this.guardarToken(carrito.token_invitado);
    this.carrito.next(carrito ?? CARRITO_VACIO);
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
