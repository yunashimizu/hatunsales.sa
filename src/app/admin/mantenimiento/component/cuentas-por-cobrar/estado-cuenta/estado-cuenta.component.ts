import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, catchError, expand, map, of, reduce } from 'rxjs';
import { ConfigFiscal, ConfiguracionFiscalService } from '../../../../service/configuracion-fiscal.service';
import { PuntoVentaService } from '../../../../service/punto-venta.service';
import { ReceptorService } from '../../../../service/receptor.service';
import { Receptor } from '../../../../models/admin.models';
import { AlertService } from '../../../../../shared/services/alert.service';
import { urlWhatsappCliente } from '../../../../../shared/utils/whatsapp.util';
import { mensajeDeError } from '../../../../service/api-base.service';
import {
  claveDeudor, diasParaVencer, fechaCorta, hoyLima, primerTelefonoValido, soles,
} from '../cobranza.util';

/** Una cuenta con saldo en la hoja: lo que se cobró, lo que falta y cuántos días lleva vencida. */
export interface FilaEstadoCuenta {
  idCxc: number;
  idVenta: number;
  /** Serie-número del comprobante (null si el servidor no lo trae: entonces se muestra «Venta N.° N»). */
  comprobante: string | null;
  emision: string;
  vencimiento: string;
  importe: number;
  abonado: number;
  saldo: number;
  /** Días de atraso (0 si todavía no vence). */
  atraso: number;
}

/** Páginas de 100 cuentas que se piden como máximo para armar la hoja de un deudor. */
const PAGINAS_MAXIMAS = 10;

function numero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Estado de cuenta de un cliente o una empresa: hoja A4 con lo que debe, lo vencido y los días de atraso.
 * Se imprime o se guarda como PDF desde el navegador (el CSS de impresión del panel quita menú y barras)
 * y se puede mandar por WhatsApp o copiar como texto.
 */
@Component({
  selector: 'app-estado-cuenta',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './estado-cuenta.component.html',
  styleUrl: './estado-cuenta.component.css',
})
export class EstadoCuentaComponent implements OnInit {
  private readonly ruta = inject(ActivatedRoute);
  private readonly pv = inject(PuntoVentaService);
  private readonly receptor = inject(ReceptorService);
  private readonly fiscal = inject(ConfiguracionFiscalService);
  private readonly alerta = inject(AlertService);
  private readonly destruir = inject(DestroyRef);

  protected readonly soles = soles;
  protected readonly fechaCorta = fechaCorta;

  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly cuentas = signal<any[]>([]);
  readonly cliente = signal<Receptor | null>(null);
  readonly emisor = signal<ConfigFiscal['emisor'] | null>(null);
  /** La lista del servidor tenía más cuentas de las que se leyeron. */
  readonly incompleta = signal(false);

  private tipo: 'cliente' | 'empresa' = 'cliente';
  private id = 0;
  private busqueda = '';
  /** Fecha de la hoja (hoy en Lima), fija mientras la pantalla está abierta. */
  protected readonly hoy = hoyLima();
  protected readonly fechaHoja = fechaCorta(
    `${this.hoy.getFullYear()}-${String(this.hoy.getMonth() + 1).padStart(2, '0')}-${String(this.hoy.getDate()).padStart(2, '0')}`,
  );

  readonly filas = computed<FilaEstadoCuenta[]>(() =>
    this.cuentas()
      .filter((c) => c.estado !== 'anulado' && c.estado !== 'pagado' && numero(c.saldo) > 0)
      .map((c) => {
        const d = diasParaVencer(c.fecha_vencimiento, this.hoy);
        const importe = numero(c.monto_total);
        const saldo = numero(c.saldo);
        return {
          idCxc: numero(c.id_cxc),
          idVenta: numero(c.id_venta),
          comprobante: String(c.comprobante ?? '').trim() || null,
          emision: String(c.fecha_emision ?? '').slice(0, 10),
          vencimiento: String(c.fecha_vencimiento ?? '').slice(0, 10),
          importe,
          abonado: Math.max(0, importe - saldo),
          saldo,
          atraso: d !== null && d < 0 ? -d : 0,
        };
      })
      .sort((a, b) => (a.vencimiento < b.vencimiento ? -1 : a.vencimiento > b.vencimiento ? 1 : a.idCxc - b.idCxc)),
  );

  readonly totalAdeudado = computed(() => this.filas().reduce((s, f) => s + f.saldo, 0));
  readonly totalVencido = computed(() => this.filas().filter((f) => f.atraso > 0).reduce((s, f) => s + f.saldo, 0));
  readonly cuentasVencidas = computed(() => this.filas().filter((f) => f.atraso > 0).length);

  /** Nombre y documento: del padrón si cargó; si no, de la propia cuenta. */
  readonly nombre = computed(() => this.cliente()?.denominacion || this.cuentas()[0]?.deudor || this.busqueda || 'Cliente');
  readonly documento = computed(() => this.cliente()?.numero_documento || this.cuentas()[0]?.documento || '');
  readonly etiquetaDocumento = computed(() => (this.tipo === 'empresa' ? 'RUC' : 'DNI'));
  readonly telefono = computed(() => primerTelefonoValido(this.cliente()?.telefono));

  readonly razonEmisor = computed(() => this.emisor()?.razon_social?.trim() || 'HatunSales S.A.C.');

  /** Resumen corto para WhatsApp y para copiar. */
  readonly texto = computed(() => {
    const filas = this.filas();
    const lineas = [
      `Estado de cuenta de ${this.nombre()} al ${this.fechaHoja}`,
      `Total adeudado: ${soles(this.totalAdeudado())}` + (this.totalVencido() > 0 ? ` (vencido: ${soles(this.totalVencido())})` : ''),
      '',
      ...filas.map(
        (f) =>
          `• ${f.comprobante || `Venta N.° ${f.idVenta}`}: saldo ${soles(f.saldo)}, ` +
          (f.atraso > 0 ? `vencida hace ${f.atraso} ${f.atraso === 1 ? 'día' : 'días'} (${fechaCorta(f.vencimiento)})` : `vence el ${fechaCorta(f.vencimiento)}`),
      ),
      '',
      `${this.razonEmisor()}. ¿Nos confirma el pago o coordinamos? Gracias.`,
    ];
    return lineas.join('\n');
  });

  ngOnInit(): void {
    const p = this.ruta.snapshot.paramMap;
    this.tipo = p.get('tipo') === 'empresa' ? 'empresa' : 'cliente';
    this.id = numero(p.get('id'));
    this.busqueda = (this.ruta.snapshot.queryParamMap.get('q') ?? '').trim();
    this.cargar();
    this.fiscal.fiscal().pipe(catchError(() => of(null)), takeUntilDestroyed(this.destruir)).subscribe((f) => {
      if (f?.emisor) this.emisor.set(f.emisor);
    });
    const receptor$: Observable<Receptor | null> = (this.tipo === 'empresa' ? this.receptor.porEmpresa(this.id) : this.receptor.porCliente(this.id)).pipe(
      catchError(() => of(null)),
    );
    receptor$.pipe(takeUntilDestroyed(this.destruir)).subscribe((r) => this.cliente.set(r));
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.leerCuentas().pipe(takeUntilDestroyed(this.destruir)).subscribe({
      next: ({ lista, total }) => {
        const clave = `${this.tipo === 'empresa' ? 'e' : 'c'}:${this.id}`;
        this.cuentas.set(lista.filter((c) => claveDeudor(c) === clave));
        this.incompleta.set(total > lista.length);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  /** Pide las cuentas por páginas hasta tener todas (con tope) y las junta. */
  private leerCuentas(): Observable<{ lista: any[]; total: number }> {
    const pedir = (pagina: number) =>
      this.pv.listarCxc({ texto: this.busqueda || undefined, limite: 100, pagina }).pipe(map((r) => ({ pagina, filas: (r?.data ?? []) as any[], total: numero(r?.total) })));
    return pedir(1).pipe(
      expand((r) => (r.pagina * 100 < r.total && r.pagina < PAGINAS_MAXIMAS && r.filas.length ? pedir(r.pagina + 1) : of())),
      reduce((acc, r) => ({ lista: acc.lista.concat(r.filas), total: r.total }), { lista: [] as any[], total: 0 }),
    );
  }

  imprimir(): void {
    window.print();
  }

  /** Abre WhatsApp con el resumen; no hace falta que el cliente esté en la lista de contactos. */
  enviarWhatsapp(): void {
    const tel = this.telefono();
    const url = tel ? urlWhatsappCliente(tel, this.texto()) : null;
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async copiarTexto(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.texto());
      void this.alerta.toast({ type: 'success', title: 'Texto copiado', message: 'Péguelo en WhatsApp, correo o donde lo necesite.' });
    } catch {
      void this.alerta.toast({ type: 'warning', title: 'No se pudo copiar', message: 'Su navegador no lo permitió. Use «Enviar por WhatsApp» o imprima la hoja.' });
    }
  }

  identificar(_i: number, f: FilaEstadoCuenta): number {
    return f.idCxc;
  }
}
