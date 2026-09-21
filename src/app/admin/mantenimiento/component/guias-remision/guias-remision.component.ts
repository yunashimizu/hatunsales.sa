import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, catchError, of, takeUntil } from 'rxjs';
import { AlertService } from '../../../../shared/services/alert.service';
import { mensajeDeError } from '../../../service/api-base.service';
import {
  ContextoVentaGuia, CrearGuiaRemision, GuiaRemision, GuiaRemisionService,
} from '../../../service/guia-remision.service';

@Component({
  selector: 'app-guias-remision',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './guias-remision.component.html',
  styleUrl: './guias-remision.component.css',
})
export class GuiasRemisionComponent implements OnInit {
  guias: GuiaRemision[] = [];
  contexto: ContextoVentaGuia | null = null;
  idVenta: number | null = null;
  cargando = false;
  guardando = false;
  error = '';
  formulario = {
    fecha_inicio_traslado: new Date().toISOString().slice(0, 10),
    direccion_origen: '',
    direccion_destino: '',
    origen_ubigeo: '',
    destino_ubigeo: '',
    peso_bruto_total: 0,
    unidad_peso: 'KGM',
    numero_bultos: 1,
    placa_principal: '',
    marca_vehiculo: '',
    conductor_nombre: '',
    conductor_tipo_doc: '1',
    conductor_numero_doc: '',
    conductor_licencia: '',
    observaciones: '',
  };

  private readonly destruir$ = new Subject<void>();
  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private readonly api: GuiaRemisionService,
    private readonly route: ActivatedRoute,
    private readonly alerta: AlertService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    const id = Number(this.route.snapshot.queryParamMap.get('venta') || 0);
    if (id > 0) this.cargarContextoVenta(id);
  }

  cargar(): void {
    this.cargando = true;
    this.api.listar().pipe(
      catchError((error) => {
        this.error = mensajeDeError(error, 'No se pudieron cargar las guias');
        return of([] as GuiaRemision[]);
      }),
      takeUntil(this.destruir$),
    ).subscribe((guias) => {
      this.guias = guias;
      this.cargando = false;
      this.cdr.markForCheck();
    });
  }

  cargarContextoVenta(id: number): void {
    this.idVenta = id;
    this.error = '';
    this.cargando = true;
    this.api.contextoVenta(id).pipe(takeUntil(this.destruir$)).subscribe({
      next: (contexto) => {
        this.contexto = contexto;
        this.formulario.direccion_origen = contexto.origen.direccion;
        this.formulario.origen_ubigeo = contexto.origen.ubigeo;
        this.formulario.direccion_destino = contexto.destinatario.direccion;
        this.formulario.destino_ubigeo = contexto.destinatario.ubigeo;
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.cargando = false;
        this.error = mensajeDeError(error, 'No se pudo cargar la venta para la guia');
        this.cdr.markForCheck();
      },
    });
  }

  guardarBorrador(): void {
    if (!this.contexto || !this.idVenta || this.guardando) return;
    if (!this.formulario.direccion_origen.trim() || !this.formulario.direccion_destino.trim()) {
      this.alerta.toast({ type: 'warning', title: 'Complete las direcciones de origen y destino' });
      return;
    }
    const datos: CrearGuiaRemision = {
      ...this.formulario,
      id_venta: this.idVenta,
      id_comprobante: this.contexto.comprobante?.id_comprobante,
      motivo_traslado_codigo: '01',
      modalidad_traslado: '01',
      peso_bruto_total: Number(this.formulario.peso_bruto_total) || 0,
      numero_bultos: Number(this.formulario.numero_bultos) || undefined,
      clave_idempotencia: `gre-borrador-${this.idVenta}-${Date.now()}`,
    };
    this.guardando = true;
    this.api.crear(datos).pipe(takeUntil(this.destruir$)).subscribe({
      next: () => {
        this.guardando = false;
        this.alerta.toast({ type: 'success', title: 'Borrador de guia guardado' });
        this.cargar();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.guardando = false;
        this.alerta.error({ title: 'No se pudo guardar la guia', message: mensajeDeError(error) });
        this.cdr.markForCheck();
      },
    });
  }

  identificar(_index: number, guia: GuiaRemision): number | undefined {
    return guia.id_guia;
  }

  abrirPdf(guia: GuiaRemision): void {
    if (!guia.id_guia) return;
    this.api.pdf(guia.id_guia).pipe(takeUntil(this.destruir$)).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (error) => this.alerta.error({ title: 'No se pudo generar el PDF', message: mensajeDeError(error) }),
    });
  }
}
