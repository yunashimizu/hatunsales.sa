import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

import { RecepcionComponent } from './recepcion.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { PuntoVentaService } from '../../../service/punto-venta.service';
import { RecepcionService } from '../../../service/recepcion.service';
import { GestionService } from '../../service/gestion.service';

/**
 * Recepción: un doble clic en "Visto bueno" no manda dos peticiones, y un reintento de
 * "Confirmar recepción" reutiliza la misma clave de idempotencia (el servidor no duplica).
 */
describe('RecepcionComponent · revisiones y confirmación sin duplicados', () => {
  let component: RecepcionComponent;
  const api = {
    listarProveedores: vi.fn(() => of([])),
    listarRecepciones: vi.fn(() => of([])),
    observaciones: vi.fn(() => of([])),
    aprobar: vi.fn(),
    rechazar: vi.fn(),
    confirmar: vi.fn(),
    subirFoto: vi.fn(() => of({})),
  };
  const alerta = {
    confirm: vi.fn(async () => ({ isConfirmed: true })),
    toast: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(async () => undefined),
    loading: vi.fn(),
    close: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [RecepcionComponent],
      providers: [
        { provide: RecepcionService, useValue: api },
        { provide: GestionService, useValue: { getAlmacenesAdmin: vi.fn(() => of([{ id_almacen: 1, nombre: 'Principal' }])) } },
        { provide: PuntoVentaService, useValue: { porCodigoBarras: vi.fn() } },
        { provide: NotificationService, useValue: { error: vi.fn() } },
        { provide: AlertService, useValue: alerta },
      ],
    })
      .overrideComponent(RecepcionComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(RecepcionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const obs = { id_observacion: 9, cantidad: 5, producto: 'Clavo 2"', estado: 'pendiente' };

  it('un doble clic en "Visto bueno" pide una sola confirmación y manda una sola petición', async () => {
    const enCurso = new Subject<unknown>();
    api.aprobar.mockReturnValue(enCurso);

    await Promise.all([component.aprobar(obs), component.aprobar(obs)]);

    expect(alerta.confirm).toHaveBeenCalledTimes(1);
    expect(api.aprobar).toHaveBeenCalledTimes(1);
    expect(component.revisandoObs).toBe(9);

    // Mientras dure, tampoco se puede rechazar.
    await component.rechazar(obs);
    expect(api.rechazar).not.toHaveBeenCalled();

    enCurso.next({});
    enCurso.complete();
    expect(component.revisandoObs).toBeNull();
  });

  it('si la revisión falla (otro usuario ya la revisó) libera los botones y recarga la lista', async () => {
    api.aprobar.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Esta observación ya fue revisada (rechazado).' } })),
    );

    await component.aprobar(obs);

    expect(component.revisandoObs).toBeNull();
    expect(alerta.error).toHaveBeenCalledTimes(1);
    expect(api.observaciones).toHaveBeenCalledTimes(2);
  });

  it('cancelar el diálogo deja volver a revisar', async () => {
    alerta.confirm.mockResolvedValueOnce({ isConfirmed: false });
    await component.rechazar(obs);
    expect(component.revisandoObs).toBeNull();
    expect(api.rechazar).not.toHaveBeenCalled();
  });

  function llenarFormulario() {
    component.idProveedor = 2;
    component.idAlmacen = 1;
    component.nroGuia = 'G-100';
    component.lineas = [
      {
        id_producto: 3,
        nombre: 'Clavo 2"',
        sku: 'CLA-2',
        codigo_barras: '',
        cantidad_ok: 10,
        cantidad_observada: 0,
        motivo_observacion: '',
        precio_compra: null,
      },
    ];
  }

  it('reintentar la misma confirmación tras un corte reutiliza la clave; cambiar el formulario usa otra', async () => {
    llenarFormulario();
    api.confirmar.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' })));

    await component.confirmar();
    await component.confirmar();
    const [primera, segunda] = api.confirmar.mock.calls.map((c: any[]) => c[0].clave_idempotencia);
    expect(primera).toEqual(expect.any(String));
    expect(segunda).toBe(primera);
    expect(alerta.error.mock.calls[0][0].message).toContain('no se duplicará');

    component.nroGuia = 'G-101';
    await component.confirmar();
    expect(api.confirmar.mock.calls[2][0].clave_idempotencia).not.toBe(primera);
  });

  it('un error de validación avisa que no se registró nada y, tras un éxito, la próxima recepción lleva clave nueva', async () => {
    llenarFormulario();
    api.confirmar.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Producto 3 no encontrado' } })),
    );
    await component.confirmar();
    expect(alerta.error.mock.calls[0][0].message).toContain('No se registró la recepción ni se movió el stock');

    api.confirmar.mockReturnValueOnce(of({ id_recepcion: 77, observaciones: [], stock_fallido: [], mensaje: 'Recepción confirmada.' }));
    await component.confirmar();
    const claveExitosa = api.confirmar.mock.calls[1][0].clave_idempotencia;
    expect(alerta.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Recepción registrada' }));

    llenarFormulario();
    api.confirmar.mockReturnValueOnce(of({ id_recepcion: 78, observaciones: [], stock_fallido: [], mensaje: 'ok' }));
    await component.confirmar();
    expect(api.confirmar.mock.calls[2][0].clave_idempotencia).not.toBe(claveExitosa);
  });

  it('si el servidor indica que ya estaba registrada, lo dice', async () => {
    llenarFormulario();
    api.confirmar.mockReturnValueOnce(
      of({ id_recepcion: 77, observaciones: [], stock_fallido: [], repetida: true, mensaje: 'Esta recepción ya estaba registrada (#77)' }),
    );

    await component.confirmar();

    expect(alerta.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Recepción ya registrada' }));
  });
});
