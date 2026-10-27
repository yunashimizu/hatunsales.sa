import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ResultadoComprobante } from '../../../../models/documentos.models';
import { ResultadoSunatComponent } from './resultado-sunat.component';

describe('ResultadoSunatComponent', () => {
  let fixture: ComponentFixture<ResultadoSunatComponent>;

  function mostrar(resultado: ResultadoComprobante, titular: string | null = null): HTMLElement {
    fixture = TestBed.createComponent(ResultadoSunatComponent);
    fixture.componentRef.setInput('resultado', resultado);
    fixture.componentRef.setInput('titular', titular);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ResultadoSunatComponent] }).compileComponents();
  });

  it('rechazado: título, motivo, código de SUNAT, qué hacer y la marca BETA, como alerta', () => {
    const vista = mostrar({
      numero_formateado: 'BB01-00000009',
      estado: 'error',
      estado_sunat: 'RECHAZADO',
      error: 'El RUC del receptor no existe',
      sunat_responsecode: '2017',
      ambiente_fiscal: 'beta',
    });
    expect(vista.querySelector('[role="alert"]')).not.toBeNull();
    expect(vista.textContent).toContain('Rechazado por SUNAT');
    expect(vista.textContent).toContain('BB01-00000009');
    expect(vista.textContent).toContain('El RUC del receptor no existe');
    expect(vista.querySelector('.rs__codigo')?.textContent).toContain('2017');
    expect(vista.textContent).toContain('emita un documento nuevo');
    expect(vista.textContent).toContain('Prueba SUNAT BETA - sin validez tributaria');
  });

  it('el titular del backend va primero y no se repite el mensaje que ya contiene', () => {
    const vista = mostrar(
      { estado: 'emitido', estado_sunat: 'ACEPTADO', aceptada_sunat: true, sunat_description: 'La Nota de Credito numero FC01-4, ha sido aceptada' },
      'SUNAT aceptó la nota FC01-00000004 (La Nota de Credito numero FC01-4, ha sido aceptada).',
    );
    const textos = Array.from(vista.querySelectorAll('.rs__texto')).map((p) => p.textContent?.trim());
    expect(textos[0]).toContain('SUNAT aceptó la nota FC01-00000004');
    expect(textos.filter((t) => t?.includes('ha sido aceptada')).length).toBe(1);
    expect(vista.querySelector('[role="status"]')).not.toBeNull();
    expect(vista.querySelector('.rs__codigo')).toBeNull();
  });
});
