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

  const puntoVenta = { porCodigoBarras: vi.fn(), resolverCodigo: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [RecepcionComponent],
      providers: [
        { provide: RecepcionService, useValue: api },
        { provide: GestionService, useValue: { getAlmacenesAdmin: vi.fn(() => of([{ id_almacen: 1, nombre: 'Principal' }])) } },
        { provide: PuntoVentaService, useValue: puntoVenta },
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

  describe('escaneo con el lector', () => {
    const enter = () => ({ key: 'Enter', preventDefault: vi.fn() }) as unknown as KeyboardEvent;
    const escanear = (texto: string) => {
      component.textoProducto = texto;
      component.alPresionarProducto(enter());
    };
    const cemento = { id_producto: 1, nombre: 'CEMENTO', sku: 'CEM-01', codigo_barras: '7501234567890' };
    const clavo = { id_producto: 2, nombre: 'CLAVO', sku: 'CLA-2', codigo_barras: '7509999999999' };
    const titulos = () => alerta.toast.mock.calls.map((c: any[]) => c[0].title);

    it('dos escaneos seguidos con el primero esperando al servidor entran ambos, en orden, y el campo queda libre', () => {
      const primero = new Subject<any>();
      puntoVenta.resolverCodigo.mockImplementation((codigo: string) =>
        codigo === cemento.codigo_barras ? primero : of({ estado: 'ok', producto: clavo }),
      );

      escanear(cemento.codigo_barras);
      expect(component.textoProducto).toBe('');
      expect(component.escaneando).toBe(true);
      escanear(clavo.codigo_barras);
      expect(component.textoProducto).toBe('');
      // El segundo espera su turno: aún no se pidió al servicio.
      expect(puntoVenta.resolverCodigo).toHaveBeenCalledTimes(1);

      primero.next({ estado: 'ok', producto: cemento });
      primero.complete();

      expect(puntoVenta.resolverCodigo.mock.calls.map((c: any[]) => c[0])).toEqual([
        cemento.codigo_barras,
        clavo.codigo_barras,
      ]);
      // La recepción pone la línea nueva arriba: el último escaneado queda primero.
      expect(component.lineas.map((l) => l.nombre)).toEqual(['CLAVO', 'CEMENTO']);
      expect(component.escaneando).toBe(false);
    });

    it('pasa el almacén de la recepción y suma al repetir con «ahora N» y el multiplicador', () => {
      component.idAlmacen = 1;
      puntoVenta.resolverCodigo.mockReturnValue(of({ estado: 'ok', producto: cemento }));

      escanear(cemento.codigo_barras);
      escanear(`4*${cemento.codigo_barras}`);

      expect(puntoVenta.resolverCodigo).toHaveBeenCalledWith(cemento.codigo_barras, 1);
      expect(component.lineas).toHaveLength(1);
      expect(component.lineas[0].cantidad_ok).toBe(5);
      expect(titulos()).toEqual(['CEMENTO', 'CEMENTO · ahora 5']);
    });

    it('un producto inactivo avisa con el mensaje del servidor y no agrega; el siguiente escaneo sigue', () => {
      puntoVenta.resolverCodigo
        .mockReturnValueOnce(of({ estado: 'inactivo', mensaje: 'El producto "TUBO" existe pero está inactivo' }))
        .mockReturnValueOnce(of({ estado: 'ok', producto: clavo }));

      escanear('555666777');
      expect(component.lineas).toHaveLength(0);
      expect(titulos()).toEqual(['El producto "TUBO" existe pero está inactivo']);

      escanear(clavo.codigo_barras);
      expect(component.lineas.map((l) => l.nombre)).toEqual(['CLAVO']);
    });

    it('distingue «no existe» de un fallo de red', () => {
      puntoVenta.resolverCodigo
        .mockReturnValueOnce(of({ estado: 'no_existe' }))
        .mockReturnValueOnce(of({ estado: 'error', mensaje: 'Sin conexión con el servidor' }));

      escanear('000111222');
      escanear('333444555');

      expect(component.lineas).toHaveLength(0);
      const [noExiste, red] = titulos();
      expect(noExiste).toBe('No hay producto con el código 000111222');
      expect(red).toContain('No se pudo verificar el código 333444555');
      expect(red).toContain('Sin conexión con el servidor');
    });

    it('un nombre escrito no llama al servicio, avisa y conserva el texto', () => {
      escanear('cemento sol');

      expect(puntoVenta.resolverCodigo).not.toHaveBeenCalled();
      expect(puntoVenta.porCodigoBarras).not.toHaveBeenCalled();
      expect(titulos()).toEqual(['Escriba o escanee un código']);
      expect(component.textoProducto).toBe('cemento sol');
      expect(component.lineas).toHaveLength(0);
    });
  });
});
