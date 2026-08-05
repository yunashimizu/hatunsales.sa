import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService, SesionUsuario } from '../../../auth/service/auth.service';
import { InventarioAdminService } from '../../service/inventario-admin.service';
import { ComprobanteService } from '../../service/comprobante.service';
import { CajaSesionService } from '../../service/caja-sesion.service';
import { HttpClient } from '@angular/common/http';
import { urlConstants } from '../../../constants/urlConstants';
import { opcionesHttp } from '../../service/api-base.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  sesion: SesionUsuario = {
    idUsuario: 0,
    nombre: '',
    email: '',
    rolId: 0,
    rolNombre: '',
    permisos: [],
    iniciales: '?',
  };

  cargandoKpis = true;
  ventasHoy: number | null = null;
  sinStock: number | null = null;
  bajoStock: number | null = null;
  cpeAtencion: number | null = null;
  cajaAbierta: boolean | null = null;
  cajaNombre = '';
  turnoTotal: number | null = null;
  turnoVentas: number | null = null;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly authService: AuthService,
    private readonly inventario: InventarioAdminService,
    private readonly comprobantes: ComprobanteService,
    private readonly caja: CajaSesionService,
    private readonly http: HttpClient,
  ) {}

  ngOnInit(): void {
    this.sesion = this.authService.getSesion();
    this.authService.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.sesion = this.authService.getSesion();
      this.cdr.markForCheck();
    });
    this.cargarKpis();
  }

  get etiquetaRol(): string {
    return this.authService.etiquetaRol(this.sesion.rolNombre);
  }

  get saludo(): string {
    const hora = new Date().getHours();
    if (hora < 12) return 'Buenos días';
    if (hora < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  private cargarKpis(): void {
    this.cargandoKpis = true;
    this.cdr.markForCheck();

    forkJoin({
      inv: this.inventario.resumen().pipe(catchError(() => of(null))),
      cpe: this.comprobantes.monitorAtencion().pipe(catchError(() => of(null))),
      caja: this.caja.sesion().pipe(catchError(() => of(null))),
      ventas: this.http
        .get<any>(`${urlConstants.reportes.ventas}?periodo=diario`, opcionesHttp())
        .pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ inv, cpe, caja, ventas }) => {
        this.sinStock = inv?.sin_stock ?? null;
        this.bajoStock = inv?.bajo_stock ?? null;
        this.cpeAtencion = cpe?.total ?? null;
        this.cajaAbierta = caja?.abierta ?? null;
        this.cajaNombre = caja?.apertura?.caja_nombre || '';
        const r = (caja as any)?.resumen;
        this.turnoTotal = r?.total ?? null;
        this.turnoVentas = r?.ventas ?? null;
        this.ventasHoy = ventas?.total_vendido != null ? Number(ventas.total_vendido) : null;
        this.cargandoKpis = false;
        this.cdr.markForCheck();
      });
  }
}
