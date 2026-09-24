import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService, SesionUsuario } from '../../../auth/service/auth.service';
import { esRolStaff, ROL_IDS } from '../../../auth/roles.constants';
import {
  ConfigFiscal,
  ConfiguracionFiscalService,
} from '../../service/configuracion-fiscal.service';
import { AlertService } from '../../../shared/services/alert.service';
import { mensajeDeError } from '../../service/api-base.service';

@Component({
  selector: 'app-admin-configuracion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './configuracion.component.html',
  styleUrl: './configuracion.component.css',
})
export class AdminConfiguracionComponent implements OnInit {
  sesion: SesionUsuario = {
    idUsuario: 0,
    nombre: '',
    email: '',
    rolId: 0,
    rolNombre: '',
    permisos: [],
    iniciales: '?',
  };

  fiscal: ConfigFiscal | null = null;
  cargandoFiscal = false;
  guardandoFiscal = false;
  formEmisor = {
    ruc: '',
    razon_social: '',
    direccion: '',
    ubicacion: '',
    logo_url: '',
    telefono: '',
    email: '',
    web: '',
  };
  formProforma = { condiciones: '' };
  formSeries = { serie_boleta: 'BBB1', serie_factura: 'FFF1' };

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly auth: AuthService,
    private readonly fiscalApi: ConfiguracionFiscalService,
    private readonly alerta: AlertService,
  ) {}

  ngOnInit(): void {
    this.refrescar();
    this.auth.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.refrescar());
    if (this.esAdminPuro) this.cargarFiscal();
  }

  get etiquetaRol(): string {
    return this.auth.etiquetaRol(this.sesion.rolNombre);
  }

  get destinoAcceso(): string {
    return esRolStaff(this.sesion.rolId, this.sesion.rolNombre) ? 'Panel' : 'Store';
  }

  get esAdminPuro(): boolean {
    const rol = this.sesion.rolNombre.toLowerCase();
    return this.sesion.rolId === ROL_IDS.ADMIN || rol === 'admin' || rol === 'superadmin';
  }

  cargarFiscal(): void {
    this.cargandoFiscal = true;
    this.cdr.markForCheck();
    this.fiscalApi.fiscal().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (f) => {
        this.fiscal = f;
        this.formEmisor = {
          ruc: f.emisor.ruc || '',
          razon_social: f.emisor.razon_social || '',
          direccion: f.emisor.direccion || '',
          ubicacion: f.emisor.ubicacion || '',
          logo_url: f.emisor.logo_url || '',
          telefono: f.emisor.telefono || '',
          email: f.emisor.email || '',
          web: f.emisor.web || '',
        };
        this.formProforma = { condiciones: f.proforma?.condiciones || '' };
        this.formSeries = {
          serie_boleta: f.series.serie_boleta || 'BBB1',
          serie_factura: f.series.serie_factura || 'FFF1',
        };
        this.cargandoFiscal = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cargandoFiscal = false;
        this.cdr.markForCheck();
        this.alerta.toast({
          type: 'warning',
          title: mensajeDeError(e, 'No se pudo cargar config fiscal'),
        });
      },
    });
  }

  guardarFiscal(): void {
    if (!this.esAdminPuro) return;
    this.guardandoFiscal = true;
    this.cdr.markForCheck();
    this.fiscalApi
      .guardarFiscal({
        emisor: this.formEmisor,
        proforma: this.formProforma,
        series: this.formSeries,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (f) => {
          this.fiscal = f;
          this.guardandoFiscal = false;
          this.cdr.markForCheck();
          this.alerta.toast({
            type: 'success',
            title: 'Configuración guardada (series, emisor y proforma)',
          });
        },
        error: (e) => {
          this.guardandoFiscal = false;
          this.cdr.markForCheck();
          this.alerta.error({
            title: 'No se pudo guardar',
            message: mensajeDeError(e),
          });
        },
      });
  }

  private refrescar(): void {
    this.sesion = this.auth.getSesion();
    this.cdr.markForCheck();
  }
}
