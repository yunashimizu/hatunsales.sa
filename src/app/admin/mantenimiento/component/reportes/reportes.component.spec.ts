import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ReportesComponent } from './reportes.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { GestionService } from '../../service/gestion.service';

/**
 * Reporte de ventas: las fechas son días de Lima y el total es NETO (las notas de crédito
 * restan). El backend manda el día del comprobante como 'AAAA-MM-DD' y el periodo como
 * instantes; ninguno debe correrse un día en la pantalla.
 */
describe('ReportesComponent', () => {
  const respuesta = {
    periodo: 'diario',
    fecha_inicio: '2026-10-21T05:00:00.000Z',
    fecha_fin: '2026-10-22T04:59:59.999Z',
    cantidad_comprobantes: 1,
    total_vendido: 70,
    ticket_promedio: 70,
    notas_credito: { cantidad: 1, total: 30 },
    detalle: [
      { id_comprobante: 1, fecha: '2026-10-21', numero_formateado: 'F001-00000001', cliente: 'ACME', estado: 'emitido', total_vendido: 100, tipo_documento: 'venta' },
      { id_comprobante: 2, fecha: '2026-10-21', numero_formateado: 'FC01-00000001', cliente: 'ACME', estado: 'emitido', total_vendido: -30, tipo_documento: 'nota_credito' },
    ],
    estadisticas: {
      venta_maxima: 100, venta_minima: 100, emitidos: 2, anulados: 0, con_error: 0, dias_con_venta: 1,
      serie: [], top_clientes: [], plan: 'Cierre del día',
    },
  };

  async function montar() {
    await TestBed.configureTestingModule({
      imports: [ReportesComponent],
      providers: [
        { provide: GestionService, useValue: { getReportesVentas: vi.fn(() => of(respuesta)) } },
        { provide: AlertService, useValue: { error: vi.fn(), toast: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ReportesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('muestra el día AAAA-MM-DD tal cual y el periodo en días de Lima', async () => {
    const { componentInstance: c } = await montar();

    expect(c.fechaCorta('2026-10-21')).toBe('21/10/2026');
    expect(c.fechaCorta('2026-10-21T05:00:00.000Z')).toBe('21/10/2026');
    expect(c.fechaCorta('2026-10-22T04:59:59.999Z')).toBe('21/10/2026');
  });

  it('explica que el total es neto y marca la nota de crédito en el detalle', async () => {
    const fixture = await montar();
    const texto: string = fixture.nativeElement.textContent;

    expect(fixture.componentInstance.notasCredito).toEqual({ cantidad: 1, total: 30 });
    expect(texto).toContain('1 nota de crédito');
    expect(texto).toContain('Nota de crédito');
    expect(texto).toContain('21/10/2026');
    expect(texto).not.toContain('20/10/2026');
  });
});
