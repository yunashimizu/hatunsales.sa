import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { EstadoCuentaComponent } from './estado-cuenta.component';
import { ConfiguracionFiscalService } from '../../../../service/configuracion-fiscal.service';
import { PuntoVentaService } from '../../../../service/punto-venta.service';
import { ReceptorService } from '../../../../service/receptor.service';
import { AlertService } from '../../../../../shared/services/alert.service';

/** Hoja de estado de cuenta: solo lo que tiene saldo, con vencido, días y los textos para enviar. */
describe('EstadoCuentaComponent', () => {
  const fecha = (dias: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const cuenta = (id: number, dias: number, saldo: number, extra: Record<string, unknown> = {}) => ({
    id_cxc: id, id_venta: 700 + id, id_cliente: 9, id_empresa: null, deudor: 'MARÍA QUISPE', documento: '40111222',
    monto_total: 500, saldo, estado: dias < 0 ? 'vencido' : 'pendiente', fecha_emision: fecha(-30), fecha_vencimiento: fecha(dias), ...extra,
  });
  const datos = [
    cuenta(1, -12, 180),                        // vencida
    cuenta(2, 7, 120, { estado: 'parcial' }),   // vigente
    cuenta(3, -30, 0, { estado: 'pagado' }),    // pagada: no sale
    cuenta(4, -3, 90, { id_cliente: 55 }),      // de otro cliente: no sale
  ];
  const pv = { listarCxc: vi.fn() };
  const receptor = { porCliente: vi.fn(), porEmpresa: vi.fn() };
  const alerta = { toast: vi.fn() };

  async function montar(opciones: { telefono?: string; falla?: boolean } = {}) {
    vi.clearAllMocks();
    pv.listarCxc.mockReturnValue(opciones.falla ? throwError(() => new Error('sin red')) : of({ data: datos, total: datos.length }));
    receptor.porCliente.mockReturnValue(of({
      tipo: 'cliente', id_cliente: 9, numero_documento: '40111222', denominacion: 'MARÍA QUISPE', direccion: 'Jr. Cusco 120',
      telefono: opciones.telefono ?? '987654321', email: '', tipo_documento: 1, origen: 'base', admite_factura: false,
    }));
    await TestBed.configureTestingModule({
      imports: [EstadoCuentaComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ tipo: 'cliente', id: '9' }), queryParamMap: convertToParamMap({ q: 'MARÍA' }) } } },
        { provide: PuntoVentaService, useValue: pv },
        { provide: ReceptorService, useValue: receptor },
        { provide: ConfiguracionFiscalService, useValue: { fiscal: () => of({ emisor: { ruc: '20610206337', razon_social: 'HATUNSALES S.A.C.', direccion: 'Av. Principal 123', telefono: '084 123456', email: 'ventas@hatun.pe' } }) } },
        { provide: AlertService, useValue: alerta },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EstadoCuentaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('lista solo las cuentas con saldo de ese cliente y suma lo adeudado y lo vencido', async () => {
    const fixture = await montar();
    const c = fixture.componentInstance;
    expect(c.filas().map((f) => f.idCxc)).toEqual([1, 2]);
    expect(c.totalAdeudado()).toBe(300);
    expect(c.totalVencido()).toBe(180);
    expect(c.filas()[0]).toMatchObject({ atraso: 12, abonado: 320 });
    expect(c.filas()[1].atraso).toBe(0);
    expect(pv.listarCxc).toHaveBeenCalledWith(expect.objectContaining({ texto: 'MARÍA', limite: 100, pagina: 1 }));
  });

  it('la hoja muestra emisor, cliente, días de atraso, total adeudado y «Generado por HatunSales»', async () => {
    const fixture = await montar();
    const texto = (fixture.nativeElement as HTMLElement).querySelector('.ec-hoja')!.textContent!.replace(/\s+/g, ' ');
    expect(texto).toContain('HATUNSALES S.A.C.');
    expect(texto).toContain('R.U.C. N° 20610206337');
    expect(texto).toContain('MARÍA QUISPE');
    expect(texto).toContain('DNI');
    expect(texto).toContain('12 días vencida');
    expect(texto).toContain('Al día');
    expect(texto).toContain('S/ 300.00');
    expect(texto).toContain('Total vencido (1)');
    expect(texto).toContain('Generado por HatunSales');
    expect(texto).not.toContain('Venta N.° 703');
  });

  it('el resumen para WhatsApp y para copiar lista el total y cada comprobante', async () => {
    const fixture = await montar();
    const c = fixture.componentInstance;
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    expect(c.texto()).toContain('Total adeudado: S/ 300.00 (vencido: S/ 180.00)');
    expect(c.texto()).toContain('Venta N.° 701: saldo S/ 180.00, vencida hace 12 días');
    expect(c.texto()).toContain('Venta N.° 702: saldo S/ 120.00, vence el');

    c.enviarWhatsapp();
    expect(abrir).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/51987654321?text='), '_blank', 'noopener,noreferrer');
    abrir.mockRestore();

    const escribir = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escribir }, configurable: true });
    await c.copiarTexto();
    expect(escribir).toHaveBeenCalledWith(c.texto());
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Texto copiado' }));
  });

  it('sin teléfono válido no se ofrece WhatsApp; imprimir llama al navegador', async () => {
    const fixture = await montar({ telefono: '12' });
    const raiz: HTMLElement = fixture.nativeElement;
    const wa = raiz.querySelector<HTMLButtonElement>('#ec-whatsapp')!;
    expect(wa.disabled).toBe(true);
    expect(wa.title).toContain('no tiene un teléfono válido');

    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    raiz.querySelector<HTMLButtonElement>('#ec-imprimir')!.click();
    expect(imprimir).toHaveBeenCalledTimes(1);
    imprimir.mockRestore();
  });

  it('si no se pudo leer la lista avisa con un botón para reintentar', async () => {
    const fixture = await montar({ falla: true });
    const raiz: HTMLElement = fixture.nativeElement;
    expect(raiz.querySelector('.adm-vacio--error')!.textContent).toContain('No se pudo cargar el estado de cuenta');
    expect(raiz.querySelector('.ec-hoja')).toBeNull();
  });
});
