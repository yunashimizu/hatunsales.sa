import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, catchError, debounceTime, finalize, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { AlertService } from '../../../../../shared/services/alert.service';
import { NotificationService } from '../../../../../shared/services/notification.service';
import { SonidoCajaService } from '../../../../../shared/services/sonido-caja.service';
import { normalizarCodigo, pareceCodigoExacto } from '../../../../../shared/utils/codigo-barras.util';
import { ColaEscaneos } from '../../../../../shared/utils/cola-escaneos';
import { ProductoVenta } from '../../../../models/admin.models';
import { esErrorDeRed, mensajeDeError } from '../../../../service/api-base.service';
import {
  CatalogosGuia,
  ContextoVentaGuia,
  EstadoGuia,
  GuardarGuiaRemision,
  GuiaRemision,
  GuiaRemisionService,
  ModoGre,
  MotivoTrasladoGuia,
  ObservacionGuia,
  OpcionCatalogoGuia,
  OperacionGuia,
  PuntoGuia,
  ValidacionGuia,
} from '../../../../service/guia-remision.service';
import { PuntoVentaService } from '../../../../service/punto-venta.service';
import { MINIMO_CARACTERES_UBIGEO } from '../../../../service/ubigeo.service';
import { GestionService } from '../../../service/gestion.service';
import { ExcesoCantidadGuia, errorDeGuia, fechaGuia, numeroGuia, textoEstadoGuia } from '../guias-remision.util';
import { UbigeoBuscadorComponent, UbigeoElegido } from '../ubigeo-buscador/ubigeo-buscador.component';

export type PasoGuia = 'origen' | 'transporte' | 'trayecto' | 'bienes' | 'revision';
type Origen = 'venta' | 'sin_venta';
type Operacion = 'guardar' | 'validar' | 'emitir';
type DestinoRuc = 'transportista' | 'destinatario';

interface ItemFormulario {
  id_producto: number;
  codigo: string | null;
  descripcion: string;
  /** Catálogo 03; '' = la unidad del producto (la normaliza el backend). */
  unidad: string;
  unidad_producto: string | null;
  cantidad: number | null;
  incluir: boolean;
  /** Con venta: lo que aún puede llevar esta guía de ese producto; null sin venta. */
  tope: number | null;
  vendida: number | null;
  en_otras_guias: number | null;
}

interface PuntoFormulario {
  ubigeo: string | null;
  ubigeo_texto: string | null;
  direccion: string;
  codigo_establecimiento: string;
}

interface FormularioGuia {
  origen: Origen;
  id_venta: number | null;
  motivo_traslado: string;
  descripcion_motivo: string;
  modalidad_traslado: string;
  fecha_inicio_traslado: string;
  fecha_entrega_transportista: string;
  peso_bruto_total: number | null;
  unidad_peso: string;
  numero_bultos: number | null;
  destinatario: { tipo_documento: string; numero_documento: string; denominacion: string; direccion: string };
  partida: PuntoFormulario;
  llegada: PuntoFormulario;
  transportista: { ruc: string; razon_social: string; registro_mtc: string };
  vehiculo: { placa: string; tarjeta_circulacion: string; marca: string };
  conductor: { tipo_documento: string; numero_documento: string; nombres: string; apellidos: string; licencia: string };
  items: ItemFormulario[];
  observaciones: string;
}

/** Un mensaje del resumen de errores con el paso donde está su campo (para ir a corregirlo). */
interface MensajeFormulario {
  mensaje: string;
  paso: PasoGuia | null;
}

interface VentaEncontrada {
  id_venta: number;
  fecha: string | null;
  total: number;
  cliente: string;
  comprobante: string | null;
}

interface ResultadoBusqueda<T> {
  lista: T[];
  error: string;
}

interface RespuestaRuc {
  nombre?: string | null;
  direccion?: string | null;
  estado?: string | null;
  condicion?: string | null;
}

export const PASOS_GUIA: ReadonlyArray<{ id: PasoGuia; titulo: string }> = [
  { id: 'origen', titulo: 'Origen y motivo' },
  { id: 'transporte', titulo: 'Destinatario y transporte' },
  { id: 'trayecto', titulo: 'Fechas y trayecto' },
  { id: 'bienes', titulo: 'Bienes y peso' },
  { id: 'revision', titulo: 'Revisar y emitir' },
];

/** Campo del formulario (el `campo_formulario` del backend) → paso donde se corrige. */
const PASO_DE_CAMPO: ReadonlyArray<readonly [RegExp, PasoGuia]> = [
  [/^(venta|motivo_traslado|descripcion_motivo|documento_relacionado)$/, 'origen'],
  [/^(destinatario|modalidad_traslado|transportista|vehiculo|conductor)(\.|$)/, 'transporte'],
  [/^(fecha_inicio_traslado|fecha_entrega_transportista|partida|llegada)(\.|$)/, 'trayecto'],
  [/^(items|peso_bruto_total|unidad_peso|numero_bultos|observaciones)(\[|\.|$)/, 'bienes'],
];

export function pasoDeCampo(campo: string): PasoGuia | null {
  return PASO_DE_CAMPO.find(([patron]) => patron.test(campo))?.[1] ?? null;
}

/** Espera tras la última tecla en los buscadores de venta y de producto. */
const ESPERA_BUSQUEDA_MS = 350;
const MINIMO_BUSQUEDA = 2;

/** Cantidades en milésimas (la guía admite 3 decimales): comparaciones exactas, sin coma flotante. */
function milesimas(valor: number): number {
  return Math.round(Number(valor) * 1000);
}

function conTresDecimales(valor: number): boolean {
  return Math.abs(valor * 1000 - Math.round(valor * 1000)) < 1e-6;
}

function texto(valor: unknown): string {
  return valor === null || valor === undefined ? '' : String(valor);
}

/** Bloque del cuerpo sin textos vacíos; undefined si no queda nada (el backend usa entonces sus valores por defecto). */
function bloque<T extends object>(valores: T): Partial<T> | undefined {
  const limpio: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(valores)) {
    const limpioValor = typeof valor === 'string' ? valor.trim() : valor;
    if (limpioValor !== '' && limpioValor !== null && limpioValor !== undefined) limpio[clave] = limpioValor;
  }
  return Object.keys(limpio).length ? (limpio as Partial<T>) : undefined;
}

function puntoDe(p: PuntoGuia | null | undefined): PuntoFormulario {
  return {
    ubigeo: p?.ubigeo ?? null,
    ubigeo_texto: p?.ubigeo_texto ?? null,
    direccion: texto(p?.direccion),
    codigo_establecimiento: texto(p?.codigo_establecimiento),
  };
}

function formularioVacio(hoy: string): FormularioGuia {
  return {
    origen: 'venta',
    id_venta: null,
    motivo_traslado: '01',
    descripcion_motivo: '',
    modalidad_traslado: '',
    fecha_inicio_traslado: hoy,
    fecha_entrega_transportista: '',
    peso_bruto_total: null,
    unidad_peso: 'KGM',
    numero_bultos: null,
    destinatario: { tipo_documento: '', numero_documento: '', denominacion: '', direccion: '' },
    partida: puntoDe(null),
    llegada: puntoDe(null),
    transportista: { ruc: '', razon_social: '', registro_mtc: '' },
    vehiculo: { placa: '', tarjeta_circulacion: '', marca: '' },
    conductor: { tipo_documento: '1', numero_documento: '', nombres: '', apellidos: '', licencia: '' },
    items: [],
    observaciones: '',
  };
}

/** Clave de idempotencia del formulario: repetir el POST (doble clic, red) devuelve la misma guía. */
function claveIdempotencia(): string {
  const aleatorio =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `gre-${aleatorio}`;
}

/** Fila de GET /venta (historial) → lo que muestra el buscador de ventas. */
function aVentaEncontrada(fila: Record<string, unknown>): VentaEncontrada {
  const serie = texto(fila['serie']);
  const numero = texto(fila['numero']);
  return {
    id_venta: Number(fila['id_venta']),
    fecha: typeof fila['fecha'] === 'string' ? fila['fecha'] : null,
    total: Number(fila['total']) || 0,
    cliente: texto(fila['cliente_denominacion'] ?? fila['cliente']) || 'Cliente sin nombre',
    comprobante: serie && numero ? `${serie}-${numero}` : texto(fila['comprobante']) || null,
  };
}

/**
 * Formulario por pasos de la guía de remisión remitente (crear, editar un borrador o corregir una
 * rechazada). «Emitir a SUNAT» la guarda y la envía en el acto; «Guardar borrador» y «Validar sin
 * enviar» no envían nada a SUNAT. El backend vuelve a validar todo: aquí solo se adelantan las
 * reglas evidentes y cada error del servidor se muestra junto a su campo.
 */
@Component({
  selector: 'app-guia-formulario',
  standalone: true,
  imports: [CommonModule, FormsModule, UbigeoBuscadorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './guia-formulario.component.html',
  styleUrl: './guia-formulario.component.css',
})
export class GuiaFormularioComponent implements OnInit {
  /** Guía a editar (borrador o rechazada); null para una nueva. */
  @Input() idGuia: number | null = null;
  /** Venta con la que se abre una guía nueva (?venta=ID). */
  @Input() idVenta: number | null = null;
  @Output() readonly cerrar = new EventEmitter<void>();
  /** La guía quedó guardada (borrador o corrección): la página refresca el listado. */
  @Output() readonly guardada = new EventEmitter<number>();
  /** SUNAT ya respondió (o dio ticket): la página muestra el resultado. */
  @Output() readonly emitida = new EventEmitter<OperacionGuia>();
  /** Un envío que quedó sin respuesta sí llegó a SUNAT: la página abre el detalle de esa guía. */
  @Output() readonly abrir = new EventEmitter<number>();

  readonly pasos = PASOS_GUIA;
  readonly fechaGuia = fechaGuia;

  cargando = true;
  errorCarga = '';
  catalogos: CatalogosGuia | null = null;
  modo: ModoGre | null = null;
  errorModo = '';
  guia: GuiaRemision | null = null;
  contexto: ContextoVentaGuia | null = null;
  f: FormularioGuia = formularioVacio('');
  paso: PasoGuia = 'origen';
  ocupado: Operacion | null = null;

  resumenErrores: MensajeFormulario[] = [];
  erroresCampo: Record<string, string> = {};
  advertencias: string[] = [];
  avisosCarga: string[] = [];
  avisoGuardado = '';
  avisosRuc: Partial<Record<DestinoRuc, string>> = {};
  consultandoRuc: DestinoRuc | null = null;

  busquedaVenta = '';
  ventasEncontradas: VentaEncontrada[] = [];
  buscandoVentas = false;
  errorVentas = '';
  cargandoVenta = false;

  busquedaProducto = '';
  productosEncontrados: ProductoVenta[] = [];
  buscandoProductos = false;
  errorProductos = '';

  /** Id de la guía ya guardada (al crearla o si «Emitir» la dejó como borrador). */
  private idGuardada: number | null = null;
  private estadoGuardado: EstadoGuia | null = null;
  /** Cuerpo de lo último guardado o cargado: si el actual difiere, hay cambios sin guardar. */
  private guardadoComo = '';
  /** Cuerpo que pasó «Validar sin enviar»: el aviso de «válida» solo vale mientras no cambie. */
  private validadoComo: string | null = null;
  /** Posición de cada ítem incluido en el último cuerpo enviado: «items[2]» del backend es el tercero. */
  private indices = new Map<ItemFormulario, number>();
  private readonly clave = claveIdempotencia();
  private readonly ventas$ = new Subject<string>();
  private readonly productos$ = new Subject<string>();

  private readonly api = inject(GuiaRemisionService);
  private readonly ventasApi = inject(PuntoVentaService);
  private readonly gestion = inject(GestionService);
  private readonly alerta = inject(AlertService);
  private readonly avisos = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sonido = inject(SonidoCajaService);

  /** Escaneos del lector en el buscador de bienes: se resuelven de a uno, en orden. */
  private readonly colaEscaneos = new ColaEscaneos<string>((codigo) => this.resolverEscaneo(codigo));

  get titulo(): string {
    if (!this.idGuardada) return 'Nueva guía de remisión';
    if (this.rechazada) return `Corregir la guía ${this.guia?.numero_formateado ?? ''}`.trim();
    return `Borrador #${this.idGuardada}`;
  }

  get subtitulo(): string {
    const indice = this.pasos.findIndex((p) => p.id === this.paso);
    return `Paso ${indice + 1} de ${this.pasos.length} · ${this.pasos[indice]?.titulo ?? ''}`;
  }

  get esPrimerPaso(): boolean {
    return this.paso === this.pasos[0].id;
  }

  get esUltimoPaso(): boolean {
    return this.paso === this.pasos[this.pasos.length - 1].id;
  }

  get rechazada(): boolean {
    return this.estadoGuardado === 'rechazado';
  }

  /** La venta de una guía guardada no cambia (el backend lo rechaza): el origen queda fijo. */
  get origenFijo(): boolean {
    return this.idGuardada !== null;
  }

  /** Motivos según el origen: con venta solo 01; sin venta, 04 y 13. */
  get motivos(): MotivoTrasladoGuia[] {
    const conVenta = this.f.origen === 'venta';
    return (this.catalogos?.motivos ?? []).filter((m) => m.requiere_venta === conVenta);
  }

  get motivoElegido(): MotivoTrasladoGuia | null {
    return this.catalogos?.motivos.find((m) => m.codigo === this.f.motivo_traslado) ?? null;
  }

  get modalidadElegida(): (OpcionCatalogoGuia & { descripcion: string }) | null {
    return this.catalogos?.modalidades.find((m) => m.codigo === this.f.modalidad_traslado) ?? null;
  }

  get minimoUbigeo(): number {
    return this.catalogos?.ubigeo.minimo_caracteres ?? MINIMO_CARACTERES_UBIGEO;
  }

  get itemsIncluidos(): ItemFormulario[] {
    return this.f.items.filter((i) => i.incluir);
  }

  get haySinGuardar(): boolean {
    return !!this.catalogos && this.instantanea() !== this.guardadoComo;
  }

  get validacionVigente(): boolean {
    return this.validadoComo !== null && this.validadoComo === this.instantanea();
  }

  /** Por qué «Emitir a SUNAT» está deshabilitado (se muestra junto al botón); null si se puede. */
  get motivoSinEmitir(): string | null {
    if (this.errorModo) return `No se pudo comprobar si la emisión de guías está activa: ${this.errorModo}`;
    if (!this.modo) return 'Comprobando si la emisión de guías a SUNAT está activa…';
    if (!this.modo.activo) return this.modo.motivo || 'La emisión de guías a SUNAT no está activa.';
    if (!this.idGuardada && this.contexto && !this.contexto.permitido) {
      return this.contexto.motivo_no_permitido || 'La venta no admite más guías.';
    }
    return null;
  }

  get puedeEmitir(): boolean {
    return !this.ocupado && !this.cargando && !this.motivoSinEmitir;
  }

  ngOnInit(): void {
    this.iniciarBuscadores();
    this.cargar();
  }

  cargar(): void {
    this.cargando = true;
    this.errorCarga = '';
    forkJoin({
      catalogos: this.api.catalogos(),
      guia: this.idGuia ? this.api.obtener(this.idGuia) : of(null),
    })
      .pipe(
        switchMap(({ catalogos, guia }) => {
          const idVenta = guia ? guia.id_venta : this.idVenta;
          const contexto$: Observable<ContextoVentaGuia | null> = idVenta ? this.api.contextoVenta(idVenta) : of(null);
          return contexto$.pipe(map((contexto) => ({ catalogos, guia, contexto })));
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ catalogos, guia, contexto }) => {
          this.catalogos = catalogos;
          this.iniciar(guia, contexto);
        },
        error: (e) => {
          this.errorCarga = mensajeDeError(
            e,
            this.idGuia ? 'No se pudo cargar la guía para editarla' : 'No se pudo preparar el formulario de la guía',
          );
        },
      });
    this.cargarModo();
  }

  cargarModo(forzar = false): void {
    this.errorModo = '';
    this.api
      .modo(forzar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (modo) => {
          this.modo = modo;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.modo = null;
          this.errorModo = mensajeDeError(e, 'No se pudo consultar el modo de emisión de la guía');
          this.cdr.markForCheck();
        },
      });
  }

  // ── Pasos y errores por campo ──────────────────────────────────────────────

  irA(paso: PasoGuia): void {
    this.paso = paso;
  }

  siguiente(): void {
    const i = this.pasos.findIndex((p) => p.id === this.paso);
    if (i < this.pasos.length - 1) this.paso = this.pasos[i + 1].id;
  }

  anterior(): void {
    const i = this.pasos.findIndex((p) => p.id === this.paso);
    if (i > 0) this.paso = this.pasos[i - 1].id;
  }

  nombrePaso(paso: PasoGuia): string {
    return this.pasos.find((p) => p.id === paso)?.titulo ?? '';
  }

  erroresDePaso(paso: PasoGuia): number {
    return this.resumenErrores.filter((e) => e.paso === paso).length;
  }

  error(campo: string): string | null {
    return this.erroresCampo[campo] ?? null;
  }

  errorItem(item: ItemFormulario, campo: 'cantidad' | 'descripcion' | 'unidad'): string | null {
    const indice = this.indices.get(item);
    if (indice === undefined) return null;
    const propio = this.erroresCampo[`items[${indice}].${campo}`];
    return propio ?? (campo === 'cantidad' ? (this.erroresCampo[`items[${indice}]`] ?? null) : null);
  }

  // ── Origen, venta y productos ──────────────────────────────────────────────

  cambiarOrigen(origen: Origen): void {
    if (this.origenFijo || this.f.origen === origen) return;
    this.f = {
      ...this.f,
      origen,
      id_venta: null,
      motivo_traslado: origen === 'venta' ? '01' : '',
      destinatario: { tipo_documento: '', numero_documento: '', denominacion: '', direccion: '' },
      items: [],
    };
    this.contexto = null;
    this.avisosCarga = [];
    this.limpiarMensajes();
  }

  buscarVenta(valor: string): void {
    this.busquedaVenta = valor ?? '';
    this.ventas$.next(this.busquedaVenta);
  }

  elegirVenta(idVenta: number): void {
    if (this.cargandoVenta) return;
    this.cargandoVenta = true;
    this.errorVentas = '';
    this.api
      .contextoVenta(idVenta)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargandoVenta = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (contexto) => {
          this.contexto = contexto;
          this.desdeVenta(contexto);
          this.avisosCarga = [...contexto.avisos];
          this.busquedaVenta = '';
          this.ventasEncontradas = [];
          this.limpiarMensajes();
        },
        error: (e) => {
          this.errorVentas = mensajeDeError(e, 'No se pudo cargar la venta para la guía');
        },
      });
  }

  /** Vuelve al buscador de ventas (solo en una guía nueva). */
  cambiarVenta(): void {
    if (this.origenFijo) return;
    this.contexto = null;
    this.f = { ...this.f, id_venta: null, items: [] };
    this.avisosCarga = [];
  }

  buscarProducto(valor: string): void {
    this.busquedaProducto = valor ?? '';
    this.productos$.next(this.busquedaProducto);
  }

  /**
   * Enter en el buscador de bienes (lector USB o teclado). Nunca envía el formulario. Si el texto
   * parece un código se resuelve exacto (local → servidor); si es un nombre y la búsqueda dejó un
   * único resultado, se agrega; en otro caso no hace nada.
   */
  alEnterBuscarProducto(evento: Event): void {
    evento.preventDefault();
    const texto = normalizarCodigo(this.busquedaProducto);
    if (!texto) return;

    if (pareceCodigoExacto(texto)) {
      // Se vacía el campo en el acto para que el siguiente escaneo no se concatene.
      this.busquedaProducto = '';
      this.productosEncontrados = [];
      this.productos$.next('');
      this.colaEscaneos.encolar(texto);
      this.cdr.markForCheck();
      return;
    }

    if (this.productosEncontrados.length === 1) this.agregarProducto(this.productosEncontrados[0]);
  }

  /** Resuelve un código de la cola. Nunca falla: cada resultado avisa por separado. */
  private resolverEscaneo(codigo: string): Observable<unknown> {
    return this.ventasApi.resolverCodigo(codigo).pipe(
      takeUntilDestroyed(this.destroyRef),
      tap((r) => {
        if (r.estado === 'ok' && r.producto) {
          const antes = this.f.items.length;
          this.agregarProducto(r.producto);
          if (this.f.items.length > antes) this.sonido.ok();
          else this.sonido.aviso(); // ya estaba: agregarProducto avisó
        } else if (r.estado === 'no_existe') {
          this.sonido.error();
          this.avisos.advertencia(`No hay producto con el código ${codigo}`);
        } else if (r.estado === 'inactivo') {
          this.sonido.error();
          this.avisos.advertencia(r.mensaje || `El producto con el código ${codigo} está inactivo`);
        } else {
          this.sonido.error();
          this.avisos.error(`No se pudo verificar el código ${codigo}`, { mensaje: r.mensaje });
        }
        this.cdr.markForCheck();
      }),
    );
  }

  agregarProducto(producto: ProductoVenta): void {
    const id = Number(producto.id_producto);
    if (this.f.items.some((i) => i.id_producto === id)) {
      this.avisos.advertencia('Ese producto ya está en la guía', { mensaje: 'Ajuste su cantidad en la lista de bienes.' });
      return;
    }
    this.f.items = [
      ...this.f.items,
      {
        id_producto: id,
        codigo: producto.sku || producto.codigo_barras || null,
        descripcion: producto.nombre ?? '',
        unidad: '',
        unidad_producto: producto.unidad_medida || null,
        cantidad: 1,
        incluir: true,
        tope: null,
        vendida: null,
        en_otras_guias: null,
      },
    ];
    this.busquedaProducto = '';
    this.productosEncontrados = [];
    this.productos$.next('');
  }

  quitarItem(item: ItemFormulario): void {
    this.f.items = this.f.items.filter((i) => i !== item);
  }

  alElegirUbigeo(punto: 'partida' | 'llegada', elegido: UbigeoElegido): void {
    this.f[punto] = { ...this.f[punto], ubigeo: elegido.codigo, ubigeo_texto: elegido.texto };
  }

  /** Completa la razón social (y la dirección del destinatario) con la consulta RUC del sistema. */
  consultarRuc(destino: DestinoRuc): void {
    if (this.consultandoRuc) return;
    const campo = destino === 'transportista' ? 'transportista.ruc' : 'destinatario.numero_documento';
    const ruc = (destino === 'transportista' ? this.f.transportista.ruc : this.f.destinatario.numero_documento).trim();
    this.avisosRuc = { ...this.avisosRuc, [destino]: undefined };
    if (!/^\d{11}$/.test(ruc)) {
      this.erroresCampo = { ...this.erroresCampo, [campo]: 'Escriba los 11 dígitos del RUC para buscarlo.' };
      return;
    }
    this.consultandoRuc = destino;
    this.gestion
      .getSunatRuc(ruc)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.consultandoRuc = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (respuesta: RespuestaRuc | null) => this.aplicarRuc(destino, campo, respuesta),
        error: (e) => {
          this.erroresCampo = {
            ...this.erroresCampo,
            [campo]: mensajeDeError(e, 'No se pudo consultar el RUC: escriba la razón social a mano'),
          };
        },
      });
  }

  // ── Acciones ───────────────────────────────────────────────────────────────

  guardarBorrador(): void {
    if (this.ocupado || !this.revisar(false)) return;
    this.ocupado = 'guardar';
    this.guardar()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.terminar()),
      )
      .subscribe({
        next: (guia) => {
          this.avisos.exito(this.rechazada ? 'Correcciones guardadas' : 'Borrador de guía guardado', {
            mensaje: this.rechazada
              ? 'Cuando esté lista, use «Emitir a SUNAT» para reenviarla con el mismo número.'
              : 'Aún no se envió a SUNAT.',
          });
          this.advertencias = guia.avisos ?? [];
        },
        error: (e) => this.alFallar(e, 'No se pudo guardar la guía'),
      });
  }

  validarSinEnviar(): void {
    if (this.ocupado || !this.revisar(true)) return;
    this.ocupado = 'validar';
    this.guardar()
      .pipe(
        switchMap((guia) => this.api.validar(guia.id_guia)),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.terminar()),
      )
      .subscribe({
        next: (validacion) => this.mostrarValidacion(validacion),
        error: (e) => this.alFallar(e, 'No se pudo validar la guía'),
      });
  }

  async emitirASunat(): Promise<void> {
    if (!this.puedeEmitir || !this.revisar(true)) return;
    const numero = this.guia?.numero_formateado;
    const tituloReenvio = numero ? `¿Reenviar la guía ${numero} a SUNAT?` : '¿Reenviar la guía a SUNAT?';
    const confirmado = await this.alerta.confirmar({
      title: this.rechazada ? tituloReenvio : '¿Emitir la guía a SUNAT?',
      message: this.rechazada
        ? 'Se guardan las correcciones y se reenvía con el mismo número.'
        : 'Se guarda, se le asigna el número de la serie y se envía a SUNAT ahora mismo. Una guía aceptada no se puede anular desde el sistema (la baja se hace en SUNAT).',
      confirmText: this.rechazada ? 'Reenviar a SUNAT' : 'Emitir a SUNAT',
      cancelText: 'Revisar otra vez',
    });
    if (!confirmado || this.destroyRef.destroyed || this.ocupado) return;
    this.ocupado = 'emitir';
    const cuerpo = this.cuerpoParaEnviar();
    const envio$: Observable<OperacionGuia> = this.idGuardada
      ? this.api.actualizar(this.idGuardada, cuerpo).pipe(
          tap((guia) => this.alGuardar(guia)),
          switchMap((guia) => this.api.emitir(guia.id_guia)),
        )
      : this.api.crearYEmitir({ ...cuerpo, clave_idempotencia: this.clave });
    envio$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.terminar()),
      )
      .subscribe({
        next: (operacion) => {
          this.guardadoComo = this.instantanea();
          this.emitida.emit(operacion);
        },
        error: (e) => this.alFallar(e, 'No se pudo emitir la guía a SUNAT'),
      });
  }

  async solicitarCierre(): Promise<void> {
    if (this.ocupado) return;
    if (this.haySinGuardar) {
      const cerrar = await this.alerta.confirmar({
        title: '¿Cerrar sin guardar?',
        message: 'Los cambios de esta guía que no guardó se perderán.',
        confirmText: 'Cerrar sin guardar',
        cancelText: 'Seguir editando',
        type: 'warning',
      });
      if (!cerrar || this.destroyRef.destroyed) return;
    }
    this.cerrar.emit();
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  private iniciar(guia: GuiaRemision | null, contexto: ContextoVentaGuia | null): void {
    this.f = formularioVacio(this.catalogos?.hoy ?? '');
    this.contexto = contexto;
    if (guia) {
      this.guia = guia;
      this.idGuardada = guia.id_guia;
      this.estadoGuardado = guia.estado;
      this.desdeGuia(guia, contexto);
    } else if (contexto) {
      this.desdeVenta(contexto);
    }
    this.avisosCarga = Array.from(new Set([...(contexto?.avisos ?? []), ...(guia?.avisos ?? [])]));
    this.guardadoComo = this.instantanea();
    // El listado pudo quedar viejo: otra persona (o la tarea de tickets) ya la envió.
    if (guia && !guia.acciones.puede_editar) {
      this.errorCarga = `La guía ${numeroGuia(guia)} ya no se puede editar (${textoEstadoGuia(guia)}): ciérrela y ábrala desde el listado para ver su estado.`;
    }
  }

  /** Precarga desde la venta: destinatario, partida, llegada y los productos con lo que aún les falta de guía. */
  private desdeVenta(c: ContextoVentaGuia): void {
    this.f = {
      ...this.f,
      origen: 'venta',
      id_venta: c.venta.id_venta,
      motivo_traslado: '01',
      destinatario: {
        tipo_documento: texto(c.destinatario.tipo_documento),
        numero_documento: texto(c.destinatario.numero_documento),
        denominacion: texto(c.destinatario.denominacion),
        direccion: texto(c.destinatario.direccion),
      },
      partida: puntoDe(c.partida),
      llegada: puntoDe(c.llegada),
      items: c.items.map((i) => ({
        id_producto: i.id_producto,
        codigo: i.codigo,
        descripcion: i.descripcion,
        unidad: '',
        unidad_producto: i.unidad,
        cantidad: i.cantidad_pendiente > 0 ? i.cantidad_pendiente : null,
        incluir: i.cantidad_pendiente > 0,
        tope: i.cantidad_pendiente,
        vendida: i.cantidad_vendida,
        en_otras_guias: i.cantidad_en_guias,
      })),
    };
  }

  private desdeGuia(g: GuiaRemision, c: ContextoVentaGuia | null): void {
    const f = this.f;
    f.origen = g.id_venta ? 'venta' : 'sin_venta';
    f.id_venta = g.id_venta;
    f.motivo_traslado = texto(g.motivo_traslado);
    f.descripcion_motivo = texto(g.descripcion_motivo);
    f.modalidad_traslado = texto(g.modalidad_traslado);
    f.fecha_inicio_traslado = g.fecha_inicio_traslado || f.fecha_inicio_traslado;
    f.fecha_entrega_transportista = texto(g.fecha_entrega_transportista);
    f.peso_bruto_total = g.peso_bruto_total;
    f.unidad_peso = g.unidad_peso || 'KGM';
    f.numero_bultos = g.numero_bultos;
    f.destinatario = {
      tipo_documento: texto(g.destinatario.tipo_documento),
      numero_documento: texto(g.destinatario.numero_documento),
      denominacion: texto(g.destinatario.denominacion),
      direccion: texto(g.destinatario.direccion),
    };
    f.partida = puntoDe(g.partida);
    f.llegada = puntoDe(g.llegada);
    f.transportista = {
      ruc: texto(g.transportista?.ruc),
      razon_social: texto(g.transportista?.razon_social),
      registro_mtc: texto(g.transportista?.registro_mtc),
    };
    f.vehiculo = {
      placa: texto(g.vehiculo?.placa),
      tarjeta_circulacion: texto(g.vehiculo?.tarjeta_circulacion),
      marca: texto(g.vehiculo?.marca),
    };
    f.conductor = {
      tipo_documento: g.conductor?.tipo_documento || '1',
      numero_documento: texto(g.conductor?.numero_documento),
      nombres: texto(g.conductor?.nombres),
      apellidos: texto(g.conductor?.apellidos),
      licencia: texto(g.conductor?.licencia),
    };
    f.observaciones = texto(g.observaciones);

    if (!c) {
      f.items = g.items.map((i) => ({
        id_producto: i.id_producto,
        codigo: i.codigo,
        descripcion: i.descripcion,
        unidad: i.unidad,
        unidad_producto: null,
        cantidad: i.cantidad,
        incluir: true,
        tope: null,
        vendida: null,
        en_otras_guias: null,
      }));
      return;
    }
    // Con venta se listan todos los productos vendidos. Un borrador cuenta como guía vigente en
    // `cantidad_en_guias`, así que lo suyo vuelve a su tope; una rechazada ya no cuenta.
    const enEsta = new Map<number, number>();
    for (const i of g.items) enEsta.set(i.id_producto, (enEsta.get(i.id_producto) ?? 0) + milesimas(i.cantidad));
    const cuentaComoVigente = g.estado === 'borrador';
    f.items = c.items.map((v) => {
      const propia = enEsta.get(v.id_producto);
      const devuelta = cuentaComoVigente ? (propia ?? 0) : 0;
      return {
        id_producto: v.id_producto,
        codigo: v.codigo,
        descripcion: g.items.find((i) => i.id_producto === v.id_producto)?.descripcion ?? v.descripcion,
        unidad: '',
        unidad_producto: v.unidad,
        cantidad: propia !== undefined ? propia / 1000 : null,
        incluir: propia !== undefined,
        tope: (milesimas(v.cantidad_pendiente) + devuelta) / 1000,
        vendida: v.cantidad_vendida,
        en_otras_guias: Math.max(0, milesimas(v.cantidad_en_guias) - devuelta) / 1000,
      };
    });
  }

  private iniciarBuscadores(): void {
    this.ventas$
      .pipe(
        debounceTime(ESPERA_BUSQUEDA_MS),
        switchMap((q): Observable<ResultadoBusqueda<VentaEncontrada> | null> => {
          const termino = q.trim();
          if (termino.length < MINIMO_BUSQUEDA) return of(null);
          this.buscandoVentas = true;
          this.cdr.markForCheck();
          return this.ventasApi.listar({ texto: termino, por_pagina: 8 }).pipe(
            map((r) => ({ lista: (r?.datos ?? []).map(aVentaEncontrada), error: '' })),
            // El fallo queda a la vista bajo el buscador (role="alert"); escribir otra vez reintenta.
            catchError((e) => of({ lista: [], error: mensajeDeError(e, 'No se pudieron buscar las ventas') })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((r) => {
        this.buscandoVentas = false;
        this.ventasEncontradas = r?.lista ?? [];
        this.errorVentas = r?.error ?? '';
        this.cdr.markForCheck();
      });

    this.productos$
      .pipe(
        debounceTime(ESPERA_BUSQUEDA_MS),
        switchMap((q): Observable<ResultadoBusqueda<ProductoVenta> | null> => {
          const termino = q.trim();
          if (termino.length < MINIMO_BUSQUEDA) return of(null);
          this.buscandoProductos = true;
          this.cdr.markForCheck();
          return this.ventasApi.buscarProductos(termino, 12).pipe(
            map((lista) => ({ lista: lista ?? [], error: '' })),
            catchError((e) => of({ lista: [], error: mensajeDeError(e, 'No se pudieron buscar los productos') })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((r) => {
        this.buscandoProductos = false;
        this.productosEncontrados = r?.lista ?? [];
        this.errorProductos = r?.error ?? '';
        this.cdr.markForCheck();
      });
  }

  private aplicarRuc(destino: DestinoRuc, campo: string, respuesta: RespuestaRuc | null): void {
    const nombre = texto(respuesta?.nombre).trim();
    if (!nombre) {
      this.erroresCampo = { ...this.erroresCampo, [campo]: 'La consulta no devolvió la razón social de ese RUC: escríbala a mano.' };
      return;
    }
    if (destino === 'transportista') {
      this.f.transportista.razon_social = nombre;
    } else {
      this.f.destinatario.denominacion = nombre;
      if (!this.f.destinatario.direccion.trim() && respuesta?.direccion) this.f.destinatario.direccion = respuesta.direccion;
    }
    const { [campo]: _resuelto, ...resto } = this.erroresCampo;
    this.erroresCampo = resto;
    const estado = texto(respuesta?.estado).trim();
    const condicion = texto(respuesta?.condicion).trim();
    if ((estado && !/^activo$/i.test(estado)) || (condicion && !/^habido$/i.test(condicion))) {
      this.avisosRuc = {
        ...this.avisosRuc,
        [destino]: `SUNAT informa este RUC como ${[estado, condicion].filter(Boolean).join(' / ')}: verifíquelo antes de emitir.`,
      };
    }
  }

  /** Reglas evidentes antes de llamar al backend. `completo` = también las de emitir y validar (fecha). */
  private revisar(completo: boolean): boolean {
    const f = this.f;
    const errores: Array<[string, string]> = [];
    if (f.origen === 'venta' && !f.id_venta) errores.push(['venta', 'Elija la venta que sustenta el traslado.']);
    if (this.contexto?.venta.estado === 'anulada') {
      errores.push(['venta', this.contexto.motivo_no_permitido || `La venta ${this.contexto.venta.id_venta} está anulada: no admite guías.`]);
    } else if (!this.idGuardada && this.contexto && !this.contexto.permitido) {
      errores.push(['venta', this.contexto.motivo_no_permitido || 'La venta no admite más guías.']);
    }
    if (!f.motivo_traslado) errores.push(['motivo_traslado', 'Elija el motivo del traslado.']);
    if (f.motivo_traslado === '13' && !f.descripcion_motivo.trim()) {
      errores.push(['descripcion_motivo', 'Describa el motivo del traslado (obligatorio con «Otros»).']);
    }
    if (!f.modalidad_traslado) errores.push(['modalidad_traslado', 'Elija si el traslado es en transporte público o privado.']);
    if (f.modalidad_traslado === '01' && f.transportista.ruc.trim() && !/^\d{11}$/.test(f.transportista.ruc.trim())) {
      errores.push(['transportista.ruc', 'El RUC del transportista tiene 11 dígitos.']);
    }
    if (f.motivo_traslado === '04') {
      for (const punto of ['partida', 'llegada'] as const) {
        const codigo = f[punto].codigo_establecimiento.trim();
        if (codigo && !/^\d{4}$/.test(codigo)) {
          errores.push([`${punto}.codigo_establecimiento`, 'El código de establecimiento tiene 4 dígitos (0000 = domicilio fiscal).']);
        }
      }
    }
    if (f.peso_bruto_total !== null && (f.peso_bruto_total < 0 || !conTresDecimales(f.peso_bruto_total))) {
      errores.push(['peso_bruto_total', 'El peso bruto es un número de 0 o más, con hasta 3 decimales.']);
    }
    if (f.numero_bultos !== null && (!Number.isInteger(f.numero_bultos) || f.numero_bultos < 1)) {
      errores.push(['numero_bultos', 'El número de bultos es un entero de 1 o más (o déjelo vacío).']);
    }
    const hoy = this.catalogos?.hoy ?? '';
    if (completo && hoy && f.fecha_inicio_traslado && f.fecha_inicio_traslado < hoy) {
      errores.push(['fecha_inicio_traslado', `El inicio del traslado no puede ser anterior a hoy (${fechaGuia(hoy)}).`]);
    }
    const incluidos = this.prepararIndices();
    if (!incluidos.length) errores.push(['items', 'Agregue al menos un bien a trasladar.']);
    incluidos.forEach((item, i) => {
      const etiqueta = `Ítem ${i + 1} (${item.descripcion.trim() || 'sin descripción'})`;
      const cantidad = item.cantidad;
      if (cantidad === null || !(cantidad > 0)) {
        errores.push([`items[${i}].cantidad`, `${etiqueta}: indique una cantidad mayor que 0.`]);
      } else if (!conTresDecimales(cantidad)) {
        errores.push([`items[${i}].cantidad`, `${etiqueta}: use hasta 3 decimales.`]);
      } else if (item.tope !== null && milesimas(cantidad) > milesimas(item.tope)) {
        errores.push([`items[${i}].cantidad`, `${etiqueta}: supera lo pendiente de la venta (${item.tope}).`]);
      }
      if (!item.descripcion.trim()) errores.push([`items[${i}].descripcion`, `${etiqueta}: escriba la descripción del bien.`]);
    });
    this.validadoComo = null;
    this.avisoGuardado = '';
    this.aplicarObservaciones(
      errores.map(([campo, mensaje]) => ({ campo, campo_formulario: campo, nivel: 'error', mensaje })),
      [],
      [],
    );
    if (errores.length) this.irAlPrimerError();
    return errores.length === 0;
  }

  /** Ítems incluidos en el orden en que viajan (el backend los numera así en sus errores). */
  private prepararIndices(): ItemFormulario[] {
    const incluidos = this.itemsIncluidos;
    this.indices = new Map(incluidos.map((item, i) => [item, i]));
    return incluidos;
  }

  private cuerpoParaEnviar(): GuardarGuiaRemision {
    return this.construirCuerpo(this.prepararIndices());
  }

  /** Lo que se compara para saber si hay cambios sin guardar (sin tocar los índices de los errores). */
  private instantanea(): string {
    return JSON.stringify(this.construirCuerpo(this.itemsIncluidos));
  }

  private construirCuerpo(incluidos: ItemFormulario[]): GuardarGuiaRemision {
    const f = this.f;
    const motivo = f.motivo_traslado;
    const publico = f.modalidad_traslado === '01';
    const privado = f.modalidad_traslado === '02';
    const punto = (p: PuntoFormulario) =>
      bloque({ ubigeo: p.ubigeo ?? '', direccion: p.direccion, codigo_establecimiento: motivo === '04' ? p.codigo_establecimiento : '' });
    // El tipo de documento del conductor trae un valor por defecto: sin otro dato no hay conductor que enviar.
    const hayConductor = [f.conductor.numero_documento, f.conductor.nombres, f.conductor.apellidos, f.conductor.licencia].some((v) => v.trim());
    return {
      id_venta: f.origen === 'venta' && f.id_venta ? f.id_venta : undefined,
      motivo_traslado: motivo,
      descripcion_motivo: motivo === '13' ? f.descripcion_motivo.trim() || undefined : undefined,
      modalidad_traslado: f.modalidad_traslado,
      fecha_inicio_traslado: f.fecha_inicio_traslado || undefined,
      fecha_entrega_transportista: publico ? f.fecha_entrega_transportista || undefined : undefined,
      peso_bruto_total: f.peso_bruto_total ?? undefined,
      unidad_peso: f.unidad_peso || undefined,
      numero_bultos: f.numero_bultos ?? undefined,
      // Con el motivo 04 el destinatario es el propio emisor: lo pone el backend.
      destinatario: motivo === '04' ? undefined : bloque(f.destinatario),
      // Una partida vacía toma la configurada en Facturación SUNAT.
      partida: punto(f.partida),
      llegada: punto(f.llegada),
      transportista: publico ? bloque(f.transportista) : undefined,
      vehiculo: privado ? bloque(f.vehiculo) : undefined,
      conductor: privado && hayConductor ? bloque(f.conductor) : undefined,
      items: incluidos.map((i) => ({
        id_producto: i.id_producto,
        cantidad: Number(i.cantidad),
        descripcion: i.descripcion.trim() || undefined,
        // Con venta la unidad es la del producto vendido (la pone el backend).
        unidad: f.origen === 'sin_venta' && i.unidad ? i.unidad : undefined,
      })),
      observaciones: f.observaciones.trim() || undefined,
    };
  }

  /** POST (la primera vez, con la clave de idempotencia) o PUT; el formulario queda apuntando a la guía guardada. */
  private guardar(): Observable<GuiaRemision> {
    const cuerpo = this.cuerpoParaEnviar();
    const peticion$ = this.idGuardada
      ? this.api.actualizar(this.idGuardada, cuerpo)
      : this.api.crear({ ...cuerpo, clave_idempotencia: this.clave });
    return peticion$.pipe(tap((guia) => this.alGuardar(guia)));
  }

  private alGuardar(guia: GuiaRemision): void {
    this.guia = guia;
    this.idGuardada = guia.id_guia;
    this.estadoGuardado = guia.estado;
    // Una partida vacía la completó el backend con la configurada: se muestra la que quedó.
    if (!this.f.partida.ubigeo && !this.f.partida.direccion.trim()) this.f.partida = puntoDe(guia.partida);
    this.guardadoComo = this.instantanea();
    this.guardada.emit(guia.id_guia);
  }

  private terminar(): void {
    this.ocupado = null;
    this.cdr.markForCheck();
  }

  private mostrarValidacion(v: ValidacionGuia): void {
    this.aplicarObservaciones(v.por_campo ?? [], v.errores ?? [], v.advertencias ?? []);
    if (v.valido) {
      this.validadoComo = this.instantanea();
    } else {
      this.irAlPrimerError();
    }
  }

  /** Errores del backend: los de datos (400 y topes 409) junto a su campo; el resto en un modal. */
  private alFallar(error: unknown, porDefecto: string): void {
    const info = errorDeGuia(error, porDefecto);
    if (info.id_guia && !this.idGuardada) {
      // «Emitir» creó la guía antes de fallar: queda como borrador y lo que sigue la actualiza.
      this.idGuardada = info.id_guia;
      this.estadoGuardado = 'borrador';
      this.guardadoComo = this.instantanea();
      this.guardada.emit(info.id_guia);
      this.avisoGuardado = `La guía quedó guardada como borrador #${info.id_guia}: corrija lo indicado y vuelva a emitirla.`;
    }
    if (!this.idGuardada && esErrorDeRed(error)) {
      this.recuperarTrasCorte();
      void this.alerta.errorHttp(error, porDefecto);
      return;
    }
    if (info.estado === 503) this.cargarModo(true);
    if (info.por_campo.length || info.errores.length) {
      this.aplicarObservaciones(info.por_campo, info.errores, info.advertencias);
      this.irAlPrimerError();
      return;
    }
    if (info.detalle.length) {
      this.aplicarExcesos(info.detalle, info.mensaje);
      return;
    }
    if (info.estado === 400) {
      this.aplicarObservaciones([], info.mensajes.length ? info.mensajes : [info.mensaje], []);
      return;
    }
    void this.alerta.errorHttp(error, porDefecto);
  }

  /**
   * Sin respuesta del servidor (red o tiempo agotado) no se sabe si la guía se creó, ni si llegó a
   * enviarse. La misma clave de idempotencia la devuelve si existe (o la crea como borrador): así nunca
   * hay dos guías y nadie reenvía a ciegas.
   */
  private recuperarTrasCorte(): void {
    this.avisoGuardado = 'No llegó la respuesta del servidor: comprobando si la guía quedó guardada…';
    this.api
      .crear({ ...this.cuerpoParaEnviar(), clave_idempotencia: this.clave })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (guia) => {
          if (!guia.acciones.puede_editar) {
            this.abrir.emit(guia.id_guia);
            return;
          }
          this.alGuardar(guia);
          this.avisoGuardado = `La guía quedó guardada como borrador #${guia.id_guia}: puede volver a emitirla, no se duplicará.`;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.avisoGuardado = `No se pudo comprobar si la guía quedó guardada (${mensajeDeError(e, 'sin conexión con el servidor')}): revise el listado de guías antes de volver a emitir.`;
          this.cdr.markForCheck();
        },
      });
  }

  /** 409 de tope: otra guía de la venta se adelantó; se marca cada línea con lo que de verdad queda. */
  private aplicarExcesos(detalle: ExcesoCantidadGuia[], mensaje: string): void {
    const observaciones: ObservacionGuia[] = [];
    for (const d of detalle) {
      const item = this.f.items.find((i) => i.incluir && i.id_producto === d.id_producto);
      const indice = item ? this.indices.get(item) : undefined;
      if (!item || indice === undefined) continue;
      item.tope = d.cantidad_pendiente;
      observaciones.push({
        campo: `items[${indice}].cantidad`,
        campo_formulario: `items[${indice}].cantidad`,
        nivel: 'error',
        mensaje: `${d.descripcion || item.descripcion}: de la venta solo queda pendiente ${d.cantidad_pendiente}.`,
      });
    }
    this.aplicarObservaciones(observaciones, observaciones.length ? [] : [mensaje], []);
    this.irA('bienes');
  }

  private aplicarObservaciones(observaciones: ObservacionGuia[], sueltos: string[], advertencias: string[]): void {
    const campos: Record<string, string> = {};
    const resumen: MensajeFormulario[] = [];
    for (const o of observaciones) {
      if (o.nivel !== 'error') continue;
      const campo = o.campo_formulario || '';
      if (campo && !campos[campo]) campos[campo] = o.mensaje;
      resumen.push({ mensaje: o.mensaje, paso: campo ? pasoDeCampo(campo) : null });
    }
    for (const mensaje of sueltos) {
      if (!resumen.some((r) => r.mensaje === mensaje)) resumen.push({ mensaje, paso: null });
    }
    const avisosCampo = observaciones.filter((o) => o.nivel === 'advertencia').map((o) => o.mensaje);
    this.erroresCampo = campos;
    this.resumenErrores = resumen;
    this.advertencias = Array.from(new Set([...advertencias, ...avisosCampo]));
  }

  private irAlPrimerError(): void {
    const paso = this.resumenErrores.find((e) => e.paso)?.paso;
    if (paso) this.paso = paso;
  }

  private limpiarMensajes(): void {
    this.resumenErrores = [];
    this.erroresCampo = {};
    this.advertencias = [];
    this.validadoComo = null;
  }
}
