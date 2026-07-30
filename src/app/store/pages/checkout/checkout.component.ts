import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, firstValueFrom, forkJoin, takeUntil } from 'rxjs';
import { CartService } from '../../service/cart.service';
import { CatalogoService } from '../../service/catalogo.service';
import { CheckoutService } from '../../service/checkout.service';
import { CuentaTiendaService } from '../../service/cuenta.service';
import { PasarelaService } from '../../service/pasarela.service';
import { AlertService } from '../../../shared/services/alert.service';
import {
  Carrito,
  CarritoItem,
  ConfiguracionPasarela,
  CuponValidado,
  DireccionEnvio,
  DireccionPayload,
  MetodoEnvio,
  MetodoPago,
  Pedido,
} from '../../models/tienda.models';

interface Paso {
  numero: number;
  titulo: string;
  icono: string;
}

/**
 * Clave del intento de compra. Vive en sessionStorage para sobrevivir a una
 * recarga: si el cliente pierde la conexión y vuelve a intentar, el backend
 * reconoce la clave y devuelve el pedido que ya había creado en lugar de
 * generar uno nuevo.
 */
const CLAVE_INTENTO = 'tienda_intento_compra';

const DIRECCION_VACIA: DireccionPayload = {
  alias: 'Casa',
  destinatario: '',
  telefono: '',
  departamento: '',
  provincia: '',
  distrito: '',
  direccion: '',
  referencia: '',
  codigo_postal: '',
  es_predeterminada: true,
};

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css',
})
export class CheckoutComponent implements OnInit, OnDestroy {

  private readonly cart = inject(CartService);
  private readonly catalogo = inject(CatalogoService);
  private readonly checkout = inject(CheckoutService);
  private readonly cuenta = inject(CuentaTiendaService);
  private readonly pasarelaService = inject(PasarelaService);
  private readonly alerta = inject(AlertService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly destruir$ = new Subject<void>();

  readonly pasos: Paso[] = [
    { numero: 1, titulo: 'Tus datos',    icono: 'bi-person' },
    { numero: 2, titulo: 'Dirección',    icono: 'bi-geo-alt' },
    { numero: 3, titulo: 'Envío',        icono: 'bi-truck' },
    { numero: 4, titulo: 'Pago',         icono: 'bi-credit-card' },
    { numero: 5, titulo: 'Confirmación', icono: 'bi-check-circle' },
  ];

  paso = 1;
  carrito: Carrito = { id_carrito: 0, items: [], cantidad_items: 0, subtotal: 0, igv: 0, total: 0 };
  direcciones: DireccionEnvio[] = [];
  metodosEnvio: MetodoEnvio[] = [];
  metodosPago: MetodoPago[] = [];

  datos = { nombre: '', email: '', telefono: '', tipo_comprobante: 'boleta' as 'boleta' | 'factura', documento: '', razon_social: '' };
  nuevaDireccion: DireccionPayload = { ...DIRECCION_VACIA };
  mostrarFormularioDireccion = false;

  idDireccion?: number;
  idMetodoEnvio?: number;
  idMetodoPago?: number;
  notas = '';

  cupon?: CuponValidado;
  pasarela: ConfiguracionPasarela = { proveedor: 'simulada', llave_publica: '', moneda: 'PEN', requiere_token: false };
  cargando = true;
  procesando = false;
  guardandoDireccion = false;

  ngOnInit(): void {
    if (!this.autenticado) {
      void this.pedirLogin();
      return;
    }

    const codigoCupon = this.ruta.snapshot.queryParamMap.get('cupon');
    this.leerSesion();

    this.cart.carrito$.pipe(takeUntil(this.destruir$)).subscribe((carrito) => (this.carrito = carrito));

      forkJoin({
        carrito: this.cart.cargar(),
        direcciones: this.cuenta.listarDirecciones(),
        envios: this.checkout.metodosEnvio(),
        pagos: this.checkout.metodosPago(),
        pasarela: this.checkout.pasarela(),
      })
        .pipe(takeUntil(this.destruir$))
        .subscribe(({ carrito, direcciones, envios, pagos, pasarela }) => {
          this.direcciones = direcciones;
          this.metodosEnvio = envios;
          this.metodosPago = pagos;
          this.pasarela = pasarela;
          void this.pasarelaService.preparar(pasarela);
        this.idDireccion = direcciones.find((d) => d.es_predeterminada)?.id_direccion ?? direcciones[0]?.id_direccion;
        this.idMetodoEnvio = envios[0]?.id_metodo_envio;
        this.idMetodoPago = pagos[0]?.id_metodo;
        this.mostrarFormularioDireccion = direcciones.length === 0;
        this.cargando = false;

        if (carrito.items.length === 0) this.avisarCarritoVacio();
        if (codigoCupon) this.revalidarCupon(codigoCupon);
      });
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  get autenticado(): boolean {
    return typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('token');
  }

  get envioSeleccionado(): MetodoEnvio | undefined {
    return this.metodosEnvio.find((m) => m.id_metodo_envio === this.idMetodoEnvio);
  }

  get pagoSeleccionado(): MetodoPago | undefined {
    return this.metodosPago.find((m) => m.id_metodo === this.idMetodoPago);
  }

  get direccionSeleccionada(): DireccionEnvio | undefined {
    return this.direcciones.find((d) => d.id_direccion === this.idDireccion);
  }

  get costoEnvio(): number {
    return this.envioSeleccionado?.costo ?? 0;
  }

  get descuento(): number {
    return this.cupon?.descuento ?? 0;
  }

  get total(): number {
    return Math.max(0, this.carrito.total - this.descuento + this.costoEnvio);
  }

  get requiereDireccion(): boolean {
    return (this.envioSeleccionado?.costo ?? 0) > 0 || !this.esRecojoEnTienda;
  }

  get esRecojoEnTienda(): boolean {
    return (this.envioSeleccionado?.nombre ?? '').toLowerCase().includes('recojo');
  }

  imagen(item: CarritoItem): string {
    return this.catalogo.urlImagen(item.imagen);
  }

  textoDireccion(d: DireccionEnvio): string {
    return [d.direccion, d.distrito, d.provincia, d.departamento].filter(Boolean).join(', ');
  }

  entregaEstimada(metodo: MetodoEnvio): string {
    if (metodo.dias_min === 0 && metodo.dias_max <= 1) return 'Hoy o mañana';
    if (metodo.dias_min === metodo.dias_max) return `${metodo.dias_min} días hábiles`;
    return `${metodo.dias_min} a ${metodo.dias_max} días hábiles`;
  }

  iconoPago(metodo: MetodoPago): string {
    const iconos: Record<string, string> = {
      tarjeta: 'bi-credit-card-2-front',
      billetera: 'bi-phone',
      transferencia: 'bi-bank',
      efectivo: 'bi-cash-coin',
      pasarela: 'bi-globe',
    };
    return iconos[metodo.tipo] ?? 'bi-wallet2';
  }

  // ------------------------------------------------------------------ pasos

  puedeAvanzar(): boolean {
    switch (this.paso) {
      case 1: return !!this.datos.nombre.trim() && this.documentoValido();
      case 2: return this.esRecojoEnTienda || !!this.idDireccion;
      case 3: return !!this.idMetodoEnvio;
      case 4: return !!this.idMetodoPago;
      default: return true;
    }
  }

  siguiente(): void {
    if (!this.puedeAvanzar()) {
      this.alerta.toast({ type: 'warning', title: this.mensajeValidacion() });
      return;
    }

    // El paso de dirección se salta cuando el cliente recoge en tienda.
    if (this.paso === 2 && this.esRecojoEnTienda) {
      this.paso = 3;
    } else {
      this.paso = Math.min(5, this.paso + 1);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  anterior(): void {
    this.paso = Math.max(1, this.paso - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  irAPaso(numero: number): void {
    if (numero < this.paso) this.paso = numero;
  }

  // ------------------------------------------------------------ direcciones

  guardarDireccion(): void {
    if (!this.nuevaDireccion.direccion.trim()) {
      this.alerta.toast({ type: 'warning', title: 'Escribe la dirección de entrega' });
      return;
    }

    this.guardandoDireccion = true;
    this.cuenta.crearDireccion(this.nuevaDireccion).subscribe({
      next: (creada) => {
        this.guardandoDireccion = false;
        this.direcciones = [creada, ...this.direcciones];
        this.idDireccion = creada.id_direccion;
        this.mostrarFormularioDireccion = false;
        this.nuevaDireccion = { ...DIRECCION_VACIA };
        this.alerta.toast({ type: 'success', title: 'Dirección guardada' });
      },
      error: (err) => {
        this.guardandoDireccion = false;
        this.alerta.error({
          title: 'No pudimos guardar la dirección',
          message: err?.error?.message ?? 'Revisa los datos e inténtalo nuevamente.',
        });
      },
    });
  }

  // -------------------------------------------------------------- confirmar

  /** El método elegido es de tipo tarjeta (UI del panel). */
  get eligeTarjeta(): boolean {
    return this.pagoSeleccionado?.tipo === 'tarjeta';
  }

  /** true cuando el método elegido se cobra con tarjeta por la pasarela. */
  get pagaConTarjeta(): boolean {
    return this.pasarela.requiere_token && this.eligeTarjeta;
  }

  /** Culqi (u otra) lista: requiere token + llave pública. */
  get pasarelaLista(): boolean {
    return !!this.pasarela.requiere_token && !!this.pasarela.llave_publica?.trim();
  }

  elegirPago(metodo: MetodoPago): void {
    this.idMetodoPago = metodo.id_metodo;
    if (metodo.tipo === 'tarjeta' && !this.pasarelaLista) {
      this.alerta.toast({
        type: 'warning',
        title: 'Tarjeta no configurada',
        message: 'Puedes usar otro método de pago o activar Culqi en el servidor.',
        timer: 3800,
      });
    }
  }

  async confirmarPedido(): Promise<void> {
    if (this.procesando) return;

    if (this.carrito.items.length === 0) {
      this.avisarCarritoVacio();
      return;
    }

    this.procesando = true;
    this.alerta.loading('Registrando tu pedido…');

    // La misma clave para todos los reintentos de este intento de compra.
    const clave = this.claveIntento();

    try {
      const pedido = await firstValueFrom(
        this.checkout.crearPedido(
          {
            id_direccion: this.esRecojoEnTienda ? undefined : this.idDireccion,
            id_metodo_envio: this.idMetodoEnvio,
            id_metodo_pago: this.idMetodoPago,
            cupon: this.cupon?.codigo,
            tipo_comprobante: this.datos.tipo_comprobante,
            documento_receptor: this.datos.documento || undefined,
            nombre_receptor: this.datos.tipo_comprobante === 'factura' ? this.datos.razon_social : this.datos.nombre,
            notas: this.notas || undefined,
          },
          clave,
        ),
      );

      await this.cobrar(pedido, clave);
      this.finalizar(pedido);
    } catch (err: any) {
      this.procesando = false;
      this.alerta.close();
      this.alerta.error({
        title: 'No pudimos completar tu compra',
        message: err?.error?.message ?? 'Ocurrió un problema al procesar el pedido. Inténtalo nuevamente.',
      });
    }
  }

  /**
   * Cobra el pedido recién creado. Si el pago falla, el pedido queda pendiente
   * y el cliente puede reintentar desde el detalle sin volver a armar el carrito.
   */
  private async cobrar(pedido: Pedido, clave: string): Promise<void> {
    if (pedido.estado !== 'pendiente') return;

    let token: string | null = null;

    if (this.pagaConTarjeta) {
      if (!this.pasarelaLista) {
        throw {
          error: {
            message:
              'El pago con tarjeta no está configurado. Elige otro método o activa Culqi en el servidor.',
          },
        };
      }
      this.alerta.close();
      this.alerta.toast({
        type: 'info',
        title: 'Ventana de pago',
        message: 'Completa los datos de tu tarjeta en Culqi.',
        timer: 2800,
      });
      token = await this.pasarelaService.pedirToken(this.pasarela, this.total, `Pedido ${pedido.codigo}`);

      if (!token) {
        throw { error: { message: 'No completaste el pago con tarjeta. Tu pedido quedó pendiente de pago.' } };
      }

      this.alerta.loading('Confirmando tu pago…');
    }

    await firstValueFrom(
      this.checkout.pagar(
        pedido.id_pedido,
        {
          id_metodo: this.idMetodoPago,
          token_pasarela: token ?? undefined,
          email: this.datos.email || undefined,
        },
        `${clave}-pago`,
      ),
    );
  }

  private finalizar(pedido: Pedido): void {
    this.procesando = false;
    this.alerta.close();
    this.limpiarClaveIntento();
    this.cart.cargar().subscribe();

    this.alerta
      .success({
        title: '¡Pedido confirmado!',
        message: `Tu número de pedido es <strong>${pedido.codigo}</strong>. Te enviaremos las novedades por correo.`,
        confirmText: 'Ver mi pedido',
      })
      .then(() => this.router.navigate(['/store/pedidos', pedido.id_pedido]));
  }

  // --------------------------------------------------------------- privados

  private documentoValido(): boolean {
    const documento = this.datos.documento.trim();
    if (this.datos.tipo_comprobante === 'factura') {
      return documento.length === 11 && !!this.datos.razon_social.trim();
    }
    return documento.length === 0 || documento.length === 8;
  }

  private mensajeValidacion(): string {
    switch (this.paso) {
      case 1:
        if (!this.datos.nombre.trim()) return 'Escribe tu nombre completo';
        if (this.datos.tipo_comprobante === 'factura') return 'Para factura necesitamos un RUC de 11 dígitos y la razón social';
        return 'El DNI debe tener 8 dígitos';
      case 2: return 'Elige o registra una dirección de entrega';
      case 3: return 'Elige un método de envío';
      case 4: return 'Elige un método de pago';
      default: return 'Completa la información';
    }
  }

  private revalidarCupon(codigo: string): void {
    this.checkout.validarCupon(codigo, this.carrito.total).subscribe({
      next: (cupon) => (this.cupon = cupon),
      error: () => (this.cupon = undefined),
    });
  }

  /** Genera la clave del intento una sola vez y la reutiliza en los reintentos. */
  private claveIntento(): string {
    const guardada = sessionStorage.getItem(CLAVE_INTENTO);
    if (guardada) return guardada;

    const nueva =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    sessionStorage.setItem(CLAVE_INTENTO, nueva);
    return nueva;
  }

  private limpiarClaveIntento(): void {
    sessionStorage.removeItem(CLAVE_INTENTO);
  }

  private leerSesion(): void {
    this.datos.nombre = sessionStorage.getItem('nombre') ?? '';
    this.datos.email = sessionStorage.getItem('email') ?? '';
  }

  private avisarCarritoVacio(): void {
    this.alerta
      .warning({ title: 'Tu carrito está vacío', message: 'Agrega productos antes de finalizar la compra.' })
      .then(() => this.router.navigate(['/store/catalogo']));
  }

  private async pedirLogin(): Promise<void> {
    const resultado = await this.alerta.confirm({
      title: 'Inicia sesión para continuar',
      message: 'Necesitamos tu cuenta para registrar el pedido y hacerle seguimiento.',
      confirmText: 'Iniciar sesión',
      cancelText: 'Volver al carrito',
    });

    this.router.navigate([resultado.isConfirmed ? '/auth' : '/store/carrito']);
  }
}
