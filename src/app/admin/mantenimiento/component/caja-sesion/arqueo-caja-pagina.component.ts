import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { mensajeDeError } from '../../../service/api-base.service';
import { CajaSesionService } from '../../../service/caja-sesion.service';
import { CajaArqueoComponent } from './caja-arqueo.component';

@Component({
  selector: 'app-arqueo-caja-pagina',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CajaArqueoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './arqueo-caja-pagina.component.html',
  styles: [':host { display: block; }'],
})
export class ArqueoCajaPaginaComponent implements OnInit {
  @ViewChild(CajaArqueoComponent) private arqueo?: CajaArqueoComponent;
  idApertura: number | null = null;
  idConsulta: number | null = null;
  cargando = false;
  error = '';
  private readonly recargar$ = new Subject<void>();
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CajaSesionService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  get ocupado(): boolean {
    return !!(this.arqueo?.guardando || this.arqueo?.guardandoMovimiento);
  }

  ngOnInit(): void {
    combineLatest([this.ruta.queryParamMap, this.recargar$.pipe(startWith(undefined))])
      .pipe(
        switchMap(([params]) => {
          this.cargando = true;
          this.error = '';
          this.idApertura = null;
          const valor = params.get('id_apertura');
          if (valor !== null) {
            const id = Number(valor);
            return of(
              /^\d+$/.test(valor) && Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647
                ? { id, error: '' }
                : { id: null, error: 'Indique un número de turno válido.' },
            );
          }
          return this.api.sesion().pipe(
            map((sesion) => ({ id: sesion.apertura?.id_apertura ?? null, error: '' })),
            catchError((error) =>
              of({
                id: null,
                error: mensajeDeError(error, 'No se pudo consultar su turno actual'),
              }),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((estado) => {
        this.idApertura = estado.id;
        this.idConsulta = estado.id;
        this.error = estado.error;
        this.cargando = false;
        this.cdr.markForCheck();
      });
  }

  actualizar(): void {
    if (!this.ocupado) this.recargar$.next();
  }

  consultar(): void {
    if (this.ocupado || this.cargando) return;
    const id = this.idConsulta;
    if (id === null || !Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
      this.error = 'Indique un número de turno válido.';
      return;
    }
    if (this.ruta.snapshot.queryParamMap.get('id_apertura') === String(id)) this.actualizar();
    else
      void this.router.navigate([], {
        relativeTo: this.ruta,
        queryParams: { id_apertura: id },
        queryParamsHandling: 'merge',
      });
  }

  usarTurnoActual(): void {
    if (this.ocupado || this.cargando) return;
    if (!this.ruta.snapshot.queryParamMap.has('id_apertura')) this.actualizar();
    else
      void this.router.navigate([], {
        relativeTo: this.ruta,
        queryParams: { id_apertura: null },
        queryParamsHandling: 'merge',
      });
  }
}
