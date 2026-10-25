import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER } from 'rxjs';
import { NOMBRE_ARCHIVO } from '../documentos-sunat';
import { AuthService } from '../../../../../auth/service/auth.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { ComprobanteService } from '../../../../service/comprobante.service';
import { FiscalEstadoService } from '../../../../service/fiscal-estado.service';
import { ComprobanteDetalleComponent } from '../comprobante-detalle/comprobante-detalle.component';

describe('tmp2', () => {
  it('compara', async () => {
    await TestBed.configureTestingModule({
      imports: [ComprobanteDetalleComponent],
      providers: [
        provideRouter([]),
        { provide: ComprobanteService, useValue: { detalle: () => NEVER } },
        { provide: AlertService, useValue: {} },
        { provide: AuthService, useValue: { puedeVer: () => true } },
        { provide: FiscalEstadoService, useValue: { estado: signal(null) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ComprobanteDetalleComponent);
    const manual = TestBed.runInInjectionContext(() => new ComprobanteDetalleComponent());
    const fac = String((ComprobanteDetalleComponent as any)['ɵfac']).slice(0, 200);
    console.log('DEPURACION-4', JSON.stringify({ mismaClase: fixture.componentInstance.constructor === ComprobanteDetalleComponent, campo: String((fixture.componentInstance as any).nombresArchivo?.zip), manual: String((manual as any).nombresArchivo?.zip), directo: String(NOMBRE_ARCHIVO?.zip), fac }));
    expect(true).toBe(true);
  });
});
