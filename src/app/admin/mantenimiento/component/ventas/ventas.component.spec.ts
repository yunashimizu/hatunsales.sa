import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { AuthService } from '../../../../auth/service/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { SonidoCajaService } from '../../../../shared/services/sonido-caja.service';
import { ReceptorService } from '../../../service/receptor.service';
import { PuntoVentaService } from '../../../service/punto-venta.service';
import { CajaSesionService } from '../../../service/caja-sesion.service';
import { CotizacionService } from '../../../service/cotizacion.service';
import { ConfiguracionFiscalService } from '../../../service/configuracion-fiscal.service';
import { SolicitudVenta } from '../../../service/punto-venta.service';
import { PreviewComprobante } from '../../../models/admin.models';
import { VentasComponent } from './ventas.component';

describe('VentasComponent', () => {
  let fixture: ComponentFixture<VentasComponent>;
  let component: VentasComponent;
  let previewServicio: ReturnType<typeof vi.fn>;
  let puntoVentaMock: Record<string, any>;
  let sonidoMock: { ok: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; aviso: ReturnType<typeof vi.fn>; activo: () => boolean; alternar: ReturnType<typeof vi.fn> };

  function crearPreview(descuento: number): PreviewComprobante {
    return {
      emisor: { ruc: '20610206337', razon_social: 'EMISOR', direccion: '', ubicacion: '', logo_url: '' },
      id_tipo: 2,
      tipo_nombre: 'BOLETA',
      serie: 'BB01',
      numero: 1,
      numero_formateado: 'BB01-1',
      fecha_de_emision: '19-10-2026',
      fecha_de_vencimiento: '19-10-2026',
      moneda: { id_moneda: 1, nombre: 'Soles', simbolo: 'S/' },
      receptor: {
        origen: 'generico',
        tipo: 'cliente',
        tipo_documento: 0,
        numero_documento: '00000000',
        denominacion: 'CLIENTES VARIOS',
        direccion: '',
        email: '',
        telefono: '',
        admite_factura: false,
      },
      items: [{
        id_producto: 1,
        codigo: 'CEM',
        codigo_producto_sunat: '10000000',
        unidad_de_medida: 'NIU',
        descripcion: 'CEMENTO',
        cantidad: 2,
        valor_unitario: 8.305,
        precio_unitario: 10,
        descuento,
        subtotal: 16.61,
        igv: 2.99,
        total: 19.6,
        tipo_de_igv: 1,
      }],
      porcentaje_igv: 18,
      totales: { gravada: 16.61, exonerada: 0, inafecta: 0, descuento, igv: 2.99, total: 19.6 },
      importe_en_letras: 'DIECINUEVE CON 60/100 SOLES',
      observaciones: '',
      advertencias: [],
    };
  }

  /** 2 cementos a S/ 10 con S/ 0.20 c/u (19.60) + recargo del 3 % por tarjeta (0.59) como línea de servicio. */
  function crearPreviewConRecargo(): PreviewComprobante {
    const base = crearPreview(0.4);
    return {
      ...base,
      items: [
        ...base.items,
        {
          codigo: 'RECARGO-TARJETA',
          codigo_producto_sunat: '10000000',
          unidad_de_medida: 'ZZ',
          descripcion: 'RECARGO POR PAGO CON TARJETA (3%)',
          cantidad: 1,
          valor_unitario: 0.5,
          precio_unitario: 0.59,
          descuento: 0,
          subtotal: 0.5,
          igv: 0.09,
          total: 0.59,
          tipo_de_igv: 1,
        },
      ],
      totales: { gravada: 17.11, exonerada: 0, inafecta: 0, descuento: 0.4, igv: 3.08, total: 20.19 },
      recargo_tarjeta: { porcentaje: 3, base_tarjeta: 19.6, monto: 0.59, total_sin_recargo: 19.6 },
    };
  }

  beforeEach(async () => {
    previewServicio = vi.fn((solicitud: SolicitudVenta) =>
      of(crearPreview(Number(solicitud.items[0]?.descuento ?? 0) * 2)),
    );
    puntoVentaMock = {
      buscarProductos: vi.fn(() => of([])),
      porCodigoBarras: vi.fn(),
      tieneCatalogo: false,
      filtrarLocal: () => [],
      cargarCatalogo: () => of(null),
      preview: previewServicio,
      metodosPago: () => of([]),
      cuentasBancarias: () => of([]),
      pasarelaCaja: () => of(null),
      iniciarYape: () => of(null),
      verificarYape: () => of(null),
      lineaCredito: vi.fn(() => of(null)),
      nuevaClaveIdempotencia: () => 'key',
      descontarStockLocal: () => undefined,
      registrar: vi.fn(() => of({
        id_venta: 1,
        fecha: '2026-10-20',
        origen: 'mostrador',
        cliente_denominacion: 'CLIENTES VARIOS',
        subtotal: 17.11,
        igv: 3.08,
        total: 20.19,
        recargo_tarjeta: 0.59,
      })),
    };
    sonidoMock = { ok: vi.fn(), error: vi.fn(), aviso: vi.fn(), activo: () => true, alternar: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [VentasComponent],
      providers: [
        provideRouter([]),
        { provide: SonidoCajaService, useValue: sonidoMock },
        { provide: ReceptorService, useValue: {} },
        { provide: PuntoVentaService, useValue: puntoVentaMock },
        { provide: AlertService, useValue: {
          toast: () => undefined,
          confirm: async () => ({ isConfirmed: true }),
          error: async () => undefined,
          warning: () => undefined,
        } },
        { provide: CajaSesionService, useValue: {} },
        { provide: CotizacionService, useValue: {} },
        { provide: ConfiguracionFiscalService, useValue: {} },
        { provide: ActivatedRoute, useValue: { queryParamMap: of({ get: () => null }) } },
        { provide: Router, useValue: {} },
        { provide: AuthService, useValue: { puedeEditarCatalogo: () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VentasComponent);
    component = fixture.componentInstance;
  });

  it('dispara la búsqueda al enfocar cuando ya hay texto escrito', () => {
    component.textoProducto = 'caña de pescar';
    const escribir = vi.spyOn(component, 'alEscribirProducto');
    // buscarProducto$ es privado: se espía la emisión directa que hace alEnfocarProducto
    const buscar = vi.spyOn((component as any).buscarProducto$, 'next');

    component.alEnfocarProducto();

    expect(escribir).not.toHaveBeenCalled();
    expect(buscar).toHaveBeenCalledWith('caña de pescar');
    expect(component.textoProducto.trim()).toBe('caña de pescar');
  });

  it('no activa la búsqueda si el campo está vacío al enfocar', () => {
    component.textoProducto = '   ';
    const escribir = vi.spyOn(component, 'alEscribirProducto');
    const buscar = vi.spyOn((component as any).buscarProducto$, 'next');

    component.alEnfocarProducto();

    expect(escribir).not.toHaveBeenCalled();
    expect(buscar).not.toHaveBeenCalled();
  });

  it('muestra el preview vigente con descuento por unidad y bloquea el cobro durante el recálculo', async () => {
    component.lineas = [{
      id_producto: 1,
      descripcion: 'CEMENTO',
      sku: 'CEM',
      unidad_medida: 'NIU',
      cantidad: 2,
      precio_unitario: 10,
      descuento: 0.2,
      stock_disponible: 10,
    }];
    component.metodosPago = [{ id_metodo: 1, nombre: 'Efectivo', tipo: 'efectivo' }];
    component.lineasPago[0].id_metodo = 1;
    component.lineasPago[0].monto = 19.6;
    component.preview = crearPreview(0.4);

    expect(component.total).toBe(19.6);
    expect(component.puedeEmitir).toBe(true);

    (component as any).escucharRecalculo();
    component.pedirRecalculoPublico();

    // La vista previa anterior no desaparece mientras se recalcula (se atenúa) y el total
    // sigue a la vista con la estimación local; lo que se bloquea es el cobro.
    expect(component.preview).not.toBeNull();
    expect(component.calculandoPreview).toBe(true);
    expect(component.total).toBe(19.6);
    expect(component.puedeEmitir).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 260));

    expect(previewServicio).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ cantidad: 2, descuento: 0.2 })],
    }));
    expect(component.preview?.items[0].descuento).toBe(0.4);
    expect(component.total).toBe(19.6);
    expect(component.calculandoPreview).toBe(false);
    expect(component.puedeEmitir).toBe(true);
  });

  it('muestra el error del preview y no permite emitir con un cálculo fallido', async () => {
    component.lineas = [{
      id_producto: 1,
      descripcion: 'CEMENTO',
      sku: 'CEM',
      unidad_medida: 'NIU',
      cantidad: 2,
      precio_unitario: 10,
      descuento: 0.2,
      stock_disponible: 10,
    }];
    component.metodosPago = [{ id_metodo: 1, nombre: 'Efectivo', tipo: 'efectivo' }];
    component.lineasPago[0].id_metodo = 1;
    component.lineasPago[0].monto = 19.6;
    component.preview = crearPreview(0.4);
    previewServicio.mockReturnValue(
      throwError(() => ({ error: { message: 'No se pudo validar el comprobante' } })),
    );

    (component as any).escucharRecalculo();
    component.pedirRecalculoPublico();
    await new Promise((resolve) => setTimeout(resolve, 260));

    expect(component.preview).toBeNull();
    expect(component.errorPreview).toBe('No se pudo validar el comprobante');
    expect(component.calculandoPreview).toBe(false);
    expect(component.puedeEmitir).toBe(false);

    const alerta = TestBed.inject(AlertService);
    const mostrarError = vi.spyOn(alerta, 'error');
    component.cobrar();

    expect(mostrarError).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Comprobante inválido',
      message: 'No se pudo validar el comprobante',
    }));
  });

  it('no convierte un fallo de búsqueda de productos en un resultado vacío', () => {
    component.textoProducto = 'cemento';
    puntoVentaMock['buscarProductos'].mockReturnValue(
      throwError(() => ({ error: { message: 'Servidor no disponible' }, status: 503 })),
    );

    (component as any).resolverBusquedaPorNombre('cemento');

    expect(component.errorBusquedaProducto).toBe('Servidor no disponible');
    expect(component.busquedaFallida).toBeNull();
    expect(component.sugerenciasProducto).toEqual([]);
  });

  it('el botón de reintento repite la misma búsqueda de producto', async () => {
    puntoVentaMock['buscarProductos']
      .mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Servidor no disponible' }, status: 503 })),
      )
      .mockReturnValueOnce(of([]));
    component.textoProducto = 'cemento';
    (component as any).escucharBusquedaProducto();

    component.alEnfocarProducto();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(component.errorBusquedaProducto).toBe('Servidor no disponible');

    component.alEnfocarProducto();
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(puntoVentaMock['buscarProductos']).toHaveBeenCalledTimes(2);
    expect(component.errorBusquedaProducto).toBe('');
  });

  it('no interpreta una falla de consulta de crédito como crédito inactivo', () => {
    puntoVentaMock['lineaCredito'].mockReturnValue(
      throwError(() => ({ error: { message: 'No se pudo consultar el crédito' }, status: 503 })),
    );
    component.receptor = {
      origen: 'base',
      tipo: 'cliente',
      id_cliente: 8,
      tipo_documento: 1,
      numero_documento: '12345678',
      denominacion: 'Cliente',
      direccion: '',
      email: '',
      telefono: '',
      admite_factura: false,
    };
    component.metodosPago = [{ id_metodo: 9, nombre: 'Crédito', tipo: 'credito' }];
    component.lineasPago[0].id_metodo = 9;
    component.lineasPago[0].monto = 10;

    component.cargarLineaCredito();

    expect(component.lineaCredito).toBeNull();
    expect(component.errorLineaCredito).toBe('No se pudo consultar el crédito');
    expect((component as any).validarCreditoAntesDeCobrar()).toContain('No se pudo verificar el crédito');
  });

  describe('descuentos por unidad y recargo por tarjeta, en vivo', () => {
    const EFECTIVO = 1;
    const TARJETA = 2;

    function pago(idMetodo: number | null, monto: number | null) {
      return {
        id_metodo: idMetodo,
        monto,
        referencia: '',
        monto_recibido: null as number | null,
        id_cuenta_bancaria: null as number | null,
        voucher_pos: '',
        validacion: '',
        referencia_externa: '',
        yape_orden_id: '',
        yape_estado: '',
      };
    }

    /** Cemento a S/ 10 c/u: el descuento por unidad y la cantidad son los que escribe el cajero. */
    function cargarCarrito(descuento: number | null, cantidad = 2, precio = 10) {
      component.lineas = [{
        id_producto: 1,
        descripcion: 'CEMENTO',
        sku: 'CEM',
        unidad_medida: 'NIU',
        cantidad,
        precio_unitario: precio,
        descuento,
        stock_disponible: 10,
      }];
    }

    beforeEach(() => {
      component.metodosPago = [
        { id_metodo: EFECTIVO, nombre: 'Efectivo', tipo: 'efectivo' },
        { id_metodo: TARJETA, nombre: 'Tarjeta', tipo: 'tarjeta' },
      ];
      component.lineasPago = [pago(EFECTIVO, null)];
    });

    it('el descuento se aplica por unidad y se ve al instante: cantidad × descuento, sin esperar al servidor', () => {
      cargarCarrito(0);
      component.preview = crearPreview(0);

      component.cambiarDescuento(component.lineas[0], 0.5);

      const linea = component.lineas[0];
      expect(component.descuentoUnitarioEfectivo(linea)).toBe(0.5);
      expect(component.descuentoTotalLinea(linea)).toBe(1);
      expect(component.subtotalLinea(linea)).toBe(19);
      expect(component.descuentoCarrito).toBe(1);
      // El servidor aún no respondió: el total ya refleja el cambio y la vista previa vieja sigue ahí.
      expect(component.total).toBe(19);
      expect(component.calculandoPreview).toBe(true);
      expect(component.preview).not.toBeNull();
    });

    it('admite descuentos con decimales y los multiplica por la cantidad', () => {
      cargarCarrito(0.2, 3, 12.5);
      expect(component.descuentoTotalLinea(component.lineas[0])).toBe(0.6);
      expect(component.subtotalLinea(component.lineas[0])).toBe(36.9);

      cargarCarrito(0.35, 7, 4.9);
      expect(component.descuentoTotalLinea(component.lineas[0])).toBe(2.45);
      expect(component.subtotalLinea(component.lineas[0])).toBe(31.85);
    });

    it('envía al servidor el descuento por unidad ya acotado al precio', () => {
      cargarCarrito(15, 2, 10);
      const linea = component.lineas[0];

      expect(component.descuentoExcede(linea)).toBe(true);
      expect(component.descuentoUnitarioEfectivo(linea)).toBe(10);
      expect(component.subtotalLinea(linea)).toBe(0);
      expect((component as any).armarSolicitud(false).items[0]).toMatchObject({ cantidad: 2, descuento: 10 });
    });

    it('correo al cliente: sin correo registrado viaja el escrito en el POS; con uno registrado, el del cliente manda', () => {
      cargarCarrito(0);
      component.enviarPorCorreo = true;
      component.correoCliente = ' caja@cliente.pe ';
      let solicitud = (component as any).armarSolicitud(false);
      expect(solicitud).toMatchObject({ enviar_cliente: true, correo_cliente: 'caja@cliente.pe' });

      component.receptor = { numero_documento: '00000000', email: 'registrado@cliente.pe' } as any;
      expect(component.correoRegistrado).toBe('registrado@cliente.pe');
      solicitud = (component as any).armarSolicitud(false);
      expect(solicitud.enviar_cliente).toBe(true);
      expect(solicitud.correo_cliente).toBeUndefined();
    });

    it('correo al cliente: sin comprobante electrónico no se envía nada y un correo mal escrito bloquea el cobro', () => {
      cargarCarrito(0);
      component.preview = crearPreview(0);
      component.lineasPago = [pago(EFECTIVO, null)];
      component.enviarPorCorreo = true;
      component.emitirComprobante = false;
      let solicitud = (component as any).armarSolicitud(false);
      expect(solicitud.enviar_cliente).toBe(false);
      expect(solicitud.correo_cliente).toBeUndefined();

      component.emitirComprobante = true;
      component.correoCliente = 'sin-arroba';
      expect(component.correoClienteValido).toBe(false);
      expect(component.puedeEmitir).toBe(false);
      component.correoCliente = '';
      expect(component.puedeEmitir).toBe(true);
      solicitud = (component as any).armarSolicitud(false);
      expect(solicitud.correo_cliente).toBeUndefined();
    });

    it('un descuento vacío o negativo cuenta como cero', () => {
      cargarCarrito(null);
      expect(component.descuentoTotalLinea(component.lineas[0])).toBe(0);
      component.cambiarDescuento(component.lineas[0], -3);
      expect(component.lineas[0].descuento).toBe(0);
    });

    it('con tarjeta estima el 3 % en el momento; con efectivo no hay recargo', () => {
      cargarCarrito(0.2);
      component.recargoTarjetaPct = 3;

      expect(component.recargoEstimado).toBe(0);
      expect(component.total).toBe(19.6);

      component.lineasPago = [pago(TARJETA, null)];
      expect(component.recargoEstimado).toBe(0.59);
      expect(component.total).toBe(20.19);
    });

    it('en pago mixto el recargo es solo sobre lo que queda para la tarjeta', () => {
      cargarCarrito(0.2);
      component.recargoTarjetaPct = 3;
      component.lineasPago = [pago(EFECTIVO, 10), pago(TARJETA, null)];

      expect(component.recargoEstimado).toBe(0.29);
      expect(component.total).toBe(19.89);
      // La tarjeta pasa lo que falta: 9.60 + 3 % = 9.89.
      expect(component.montoACobrarTarjeta(1)).toBe(9.89);
    });

    it('sin porcentaje del servidor no hay recargo ni recálculos al cambiar el pago', () => {
      cargarCarrito(0.2);
      component.recargoTarjetaPct = 0;
      component.lineasPago = [pago(TARJETA, null)];
      const recalcular = vi.spyOn(component as any, 'pedirRecalculo');

      component.alCambiarPago();

      expect(component.recargoEstimado).toBe(0);
      expect(recalcular).not.toHaveBeenCalled();
    });

    it('pide el cálculo solo cuando la tarjeta interviene en el cambio de pago', () => {
      cargarCarrito(0.2);
      component.recargoTarjetaPct = 3;
      const recalcular = vi.spyOn(component as any, 'pedirRecalculo');

      component.alCambiarPago(); // efectivo → efectivo
      expect(recalcular).not.toHaveBeenCalled();

      component.lineasPago = [pago(TARJETA, null)];
      component.alCambiarPago(); // pasó a tarjeta
      expect(recalcular).toHaveBeenCalledTimes(1);
    });

    it('manda los medios de pago al calcular y muestra el recargo del servidor cuando llega', async () => {
      previewServicio.mockImplementation(() => of(crearPreviewConRecargo()));
      cargarCarrito(0.2);
      component.recargoTarjetaPct = 3;
      component.lineasPago = [pago(TARJETA, null)];
      (component as any).escucharRecalculo();

      component.alCambiarPago();
      expect(component.calculandoPreview).toBe(true);
      expect(component.total).toBe(20.19); // estimación inmediata

      await new Promise((resolve) => setTimeout(resolve, 260));

      expect(previewServicio).toHaveBeenCalledWith(expect.objectContaining({
        pagos: [{ id_metodo: TARJETA, monto: 0 }],
      }));
      expect(component.calculandoPreview).toBe(false);
      expect(component.preview?.recargo_tarjeta?.monto).toBe(0.59);
      expect(component.recargoMostrado).toBe(0.59);
      expect(component.recargoPctMostrado).toBe(3);
      expect(component.total).toBe(20.19);
      expect(component.preview?.items.at(-1)).toMatchObject({ unidad_de_medida: 'ZZ', total: 0.59 });
    });

    it('un solo medio sin monto cobra todo: habilita el cobro y registra el total con recargo', async () => {
      cargarCarrito(0.2);
      component.recargoTarjetaPct = 3;
      component.lineasPago = [pago(TARJETA, null)];
      component.lineasPago[0].voucher_pos = 'V-123';
      component.preview = crearPreviewConRecargo();

      expect(component.pagoUnicoSinMonto).toBe(true);
      expect(component.puedeEmitir).toBe(true);

      component.cobrar();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(puntoVentaMock['registrar']).toHaveBeenCalledWith(expect.objectContaining({
        pagos: [expect.objectContaining({ id_metodo: TARJETA, monto: 20.19, voucher_pos: 'V-123' })],
      }));
      expect(component.ultimaVenta?.recargo_tarjeta).toBe(0.59);
    });

    it('con el cálculo del servidor desactualizado no deja cobrar aunque haya un medio elegido', () => {
      cargarCarrito(0.2);
      component.lineasPago = [pago(EFECTIVO, null)];
      component.preview = crearPreview(0.4);
      expect(component.puedeEmitir).toBe(true);

      component.calculandoPreview = true;
      expect(component.puedeEmitir).toBe(false);
    });

    it('con varios medios exige que los pagos cubran el total (con recargo)', () => {
      cargarCarrito(0.2);
      component.recargoTarjetaPct = 3;
      component.lineasPago = [pago(EFECTIVO, 10), pago(TARJETA, 9.6)];
      component.preview = { ...crearPreviewConRecargo(), totales: { ...crearPreviewConRecargo().totales, total: 19.89 } };

      // Falta el recargo en la tarjeta: 10 + 9.60 = 19.60 < 19.89.
      expect(component.pagoUnicoSinMonto).toBe(false);
      expect(component.pagoCubierto).toBe(false);
      expect(component.puedeEmitir).toBe(false);

      component.lineasPago = [pago(EFECTIVO, 10), pago(TARJETA, 9.89)];
      expect(component.pagoCubierto).toBe(true);
      expect(component.puedeEmitir).toBe(true);
    });

    it('si se cancela la confirmación, el «todo en este medio» se deshace y no queda un monto viejo', async () => {
      cargarCarrito(0.2);
      component.recargoTarjetaPct = 3;
      component.lineasPago = [pago(TARJETA, null)];
      component.lineasPago[0].voucher_pos = 'V-1';
      component.preview = crearPreviewConRecargo();
      vi.spyOn(TestBed.inject(AlertService), 'confirm').mockResolvedValue({ isConfirmed: false } as never);

      component.cobrar();
      expect(component.lineasPago[0].monto).toBe(20.19); // mientras se confirma
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(component.lineasPago[0].monto).toBeNull();
      expect(puntoVentaMock['registrar']).not.toHaveBeenCalled();
      // Si ahora paga en efectivo, se cobra el total sin recargo y no el monto de la tarjeta.
      component.lineasPago[0].id_metodo = EFECTIVO;
      expect(component.pagoUnicoSinMonto).toBe(true);
    });

    it('si el registro falla, el monto autocompletado también se deshace y el cobro puede reintentarse', async () => {
      cargarCarrito(0.2);
      component.lineasPago = [pago(EFECTIVO, null)];
      component.preview = crearPreview(0.4);
      puntoVentaMock['registrar'].mockReturnValue(
        throwError(() => ({ error: { message: 'No hay stock suficiente' }, status: 400 })),
      );

      component.cobrar();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(component.emitiendo).toBe(false);
      expect(component.lineasPago[0].monto).toBeNull();
      expect(component.puedeEmitir).toBe(true);
    });

    it('un monto escrito por el cajero no se toca al cancelar', async () => {
      cargarCarrito(0.2);
      component.lineasPago = [pago(EFECTIVO, 19.6)];
      component.preview = crearPreview(0.4);
      vi.spyOn(TestBed.inject(AlertService), 'confirm').mockResolvedValue({ isConfirmed: false } as never);

      component.cobrar();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(component.lineasPago[0].monto).toBe(19.6);
    });
  });

  it('descarta una búsqueda con retraso cuando el buscador ya se vació (escáner + Enter)', async () => {
    puntoVentaMock['tieneCatalogo'] = true;
    puntoVentaMock['filtrarLocal'] = () => [{
      id_producto: 1, nombre: 'CEMENTO', sku: 'CEM', codigo_barras: '1', unidad_medida: 'NIU',
      precio_venta: 10, descuento: 0, precio_final: 10, stock_disponible: 5, imagen_url: '',
    }];
    (component as any).escucharBusquedaProducto();
    component.textoProducto = '';

    (component as any).buscarProducto$.next('cemento');
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(component.sugerenciasProducto).toEqual([]);
  });

  describe('lector de código: cola de escaneos', () => {
    const producto = (id: number, nombre: string) => ({
      id_producto: id, nombre, sku: `SKU-${id}`, codigo_barras: String(id).repeat(6), unidad_medida: 'NIU',
      precio_venta: 10, descuento: 0, precio_final: 10, stock_disponible: 5, imagen_url: '',
    });
    const ENTER = () => new KeyboardEvent('keydown', { key: 'Enter' });
    function escanear(codigo: string): void {
      component.textoProducto = codigo;
      component.alPresionarEnProducto(ENTER());
    }

    beforeEach(() => {
      puntoVentaMock['porCodigoLocal'] = vi.fn(() => null);
      component.idAlmacen = 1;
      (component as any).editaCatalogo = true;
      component.cargandoContextoPos = false;
    });

    it('dos códigos seguidos que no están en el catálogo entran los dos, en orden y de a uno', () => {
      const respuestas = [new Subject<any>(), new Subject<any>()];
      puntoVentaMock['porCodigoBarras'].mockImplementation((codigo: string) => respuestas[codigo === '111111' ? 0 : 1]);

      escanear('111111');
      expect(component.textoProducto).toBe('');
      escanear('222222');
      expect(component.textoProducto).toBe('');

      expect(puntoVentaMock['porCodigoBarras']).toHaveBeenCalledTimes(1);
      expect(component.puedeEmitir).toBe(false);

      respuestas[0].next(producto(1, 'CEMENTO'));
      respuestas[0].complete();
      expect(puntoVentaMock['porCodigoBarras']).toHaveBeenCalledTimes(2);
      expect(puntoVentaMock['porCodigoBarras']).toHaveBeenLastCalledWith('222222', 1);

      respuestas[1].next(producto(2, 'ARENA'));
      respuestas[1].complete();

      expect(component.lineas.map((l) => l.descripcion)).toEqual(['CEMENTO', 'ARENA']);
      expect(component.textoProducto).toBe('');
      expect((component as any).escaneandoCodigo).toBe(false);
    });

    it('la respuesta tardía no borra el principio del siguiente escaneo', () => {
      const r = new Subject<any>();
      puntoVentaMock['porCodigoBarras'].mockReturnValue(r);

      escanear('111111');
      component.textoProducto = '2222'; // el lector sigue escribiendo el segundo código
      r.next(producto(1, 'CEMENTO'));
      r.complete();

      expect(component.textoProducto).toBe('2222');
      expect(component.lineas).toHaveLength(1);
    });

    it('si el primero da 404 el segundo igual entra y cada uno avisa por separado', () => {
      const toast = vi.spyOn(TestBed.inject(AlertService), 'toast');
      puntoVentaMock['porCodigoBarras'].mockImplementation((codigo: string) =>
        codigo === '111111'
          ? throwError(() => ({ status: 404 }))
          : of(producto(2, 'ARENA')));

      escanear('111111');
      escanear('222222');

      expect(component.lineas.map((l) => l.descripcion)).toEqual(['ARENA']);
      const titulos = toast.mock.calls.map(([t]) => (t as { title: string }).title);
      expect(titulos).toContain('No hay producto con el código 111111');
      expect(titulos).toContain('ARENA');
    });

    it('un 404 con el campo libre deja el campo vacío y ofrece crear el producto con ese código', () => {
      puntoVentaMock['porCodigoBarras'].mockReturnValue(throwError(() => ({ status: 404 })));

      escanear('999999');

      expect(component.textoProducto).toBe('');
      expect(component.busquedaFallida).toMatchObject({ texto: '999999', esCodigo: true, desdeLector: true });
      expect(component.mostrarTarjetaSinResultados).toBe(true);
    });

    it('un 409 PRODUCTO_INACTIVO muestra el mensaje del servidor, no ofrece crear ni reintentar y no detiene al siguiente', () => {
      const toast = vi.spyOn(TestBed.inject(AlertService), 'toast');
      const mensaje = 'El producto "CLAVO" existe pero está inactivo';
      puntoVentaMock['porCodigoBarras'].mockImplementation((codigo: string) =>
        codigo === '111111'
          ? throwError(() => ({ status: 409, error: { codigo: 'PRODUCTO_INACTIVO', id_producto: 5, message: mensaje } }))
          : of(producto(2, 'ARENA')));

      escanear('111111');
      escanear('222222');

      expect(component.lineas.map((l) => l.descripcion)).toEqual(['ARENA']);
      const titulos = toast.mock.calls.map(([t]) => (t as { title: string }).title);
      expect(titulos).toContain(mensaje);
      expect(component.busquedaFallida).toBeNull();
      expect(component.mostrarTarjetaSinResultados).toBe(false);
      expect(component.errorBusquedaProducto).toBe('');
      expect(component.textoProducto).toBe('');
    });

    it('un corte de red no ofrece crear, no detiene al siguiente y «Reintentar» repite el código', () => {
      let caido = true;
      puntoVentaMock['porCodigoBarras'].mockImplementation((codigo: string) =>
        codigo === '111111' && caido ? throwError(() => ({ status: 0 })) : of(producto(Number(codigo[0]), `P${codigo[0]}`)));

      escanear('111111');
      escanear('222222');

      expect(component.lineas.map((l) => l.descripcion)).toEqual(['P2']);
      expect(component.errorBusquedaProducto).toContain('111111');
      expect(component.busquedaFallida).toBeNull();

      caido = false;
      component.reintentarBusquedaProducto();

      expect(component.lineas.map((l) => l.descripcion)).toEqual(['P2', 'P1']);
      expect(component.errorBusquedaProducto).toBe('');
    });

    it('un producto en el catálogo en memoria entra al instante y vacía el campo', () => {
      puntoVentaMock['porCodigoLocal'] = vi.fn(() => producto(1, 'CEMENTO'));

      escanear('111111\r\n');

      expect(puntoVentaMock['porCodigoLocal']).toHaveBeenCalledWith('111111');
      expect(puntoVentaMock['porCodigoBarras']).not.toHaveBeenCalled();
      expect(component.lineas).toHaveLength(1);
      expect(component.textoProducto).toBe('');
    });

    it('«5*CODIGO» agrega cantidad 5 una sola vez y consulta solo el código', () => {
      puntoVentaMock['porCodigoBarras'].mockReturnValue(of(producto(1, 'CEMENTO')));

      escanear('5*111111');

      expect(puntoVentaMock['porCodigoBarras']).toHaveBeenCalledTimes(1);
      expect(puntoVentaMock['porCodigoBarras']).toHaveBeenCalledWith('111111', 1);
      expect(component.lineas).toHaveLength(1);
      expect(component.lineas[0].cantidad).toBe(5);
      expect(component.textoProducto).toBe('');
    });

    it('«3*CODIGO» sobre una línea existente suma 3 (catálogo en memoria) y «2x4» no multiplica', () => {
      puntoVentaMock['porCodigoLocal'] = vi.fn(() => producto(1, 'CEMENTO'));

      escanear('111111');
      escanear('3*111111');

      expect(component.lineas).toHaveLength(1);
      expect(component.lineas[0].cantidad).toBe(4);

      puntoVentaMock['porCodigoLocal'].mockClear();
      escanear('2x4');
      expect(puntoVentaMock['porCodigoLocal']).not.toHaveBeenCalled();
    });

    it('un escaneo exitoso suena ok() y el toast lleva solo el nombre la primera vez', () => {
      const toast = vi.spyOn(TestBed.inject(AlertService), 'toast');
      puntoVentaMock['porCodigoBarras'].mockReturnValue(of(producto(1, 'CEMENTO SOL')));

      escanear('111111');

      expect(sonidoMock.ok).toHaveBeenCalledTimes(1);
      expect(sonidoMock.error).not.toHaveBeenCalled();
      expect(sonidoMock.aviso).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'CEMENTO SOL' }));
    });

    it('un 404, un 409 y un corte de red suenan error() y no ok()', () => {
      puntoVentaMock['porCodigoBarras']
        .mockReturnValueOnce(throwError(() => ({ status: 404 })))
        .mockReturnValueOnce(throwError(() => ({ status: 409, error: { message: 'inactivo' } })))
        .mockReturnValueOnce(throwError(() => ({ status: 0 })));

      escanear('111111');
      escanear('222222');
      escanear('333333');

      expect(sonidoMock.error).toHaveBeenCalledTimes(3);
      expect(sonidoMock.ok).not.toHaveBeenCalled();
    });

    it('al repetir el mismo producto el toast dice «ahora N»', () => {
      const toast = vi.spyOn(TestBed.inject(AlertService), 'toast');
      puntoVentaMock['porCodigoLocal'] = vi.fn(() => producto(1, 'CEMENTO SOL'));

      escanear('111111');
      escanear('111111');
      escanear('111111');

      const titulos = toast.mock.calls.map(([t]) => (t as { title: string }).title);
      expect(titulos).toEqual(['CEMENTO SOL', 'CEMENTO SOL · ahora 2', 'CEMENTO SOL · ahora 3']);
      expect(sonidoMock.ok).toHaveBeenCalledTimes(3);
    });

    it('si la línea queda por encima del stock suena aviso() en lugar de ok()', () => {
      puntoVentaMock['porCodigoLocal'] = vi.fn(() => ({ ...producto(1, 'CEMENTO SOL'), stock_disponible: 1 }));

      escanear('111111'); // línea nueva con cantidad 1: sin aviso de stock (comportamiento de siempre)
      escanear('111111'); // 2 > 1

      expect(sonidoMock.ok).toHaveBeenCalledTimes(1);
      expect(sonidoMock.aviso).toHaveBeenCalledTimes(1);
    });

    it('un texto con espacios internos va por la búsqueda de nombre, no por código', () => {
      escanear('cemento sol');

      expect(puntoVentaMock['porCodigoBarras']).not.toHaveBeenCalled();
      expect(puntoVentaMock['porCodigoLocal']).not.toHaveBeenCalled();
      expect((component as any).escaneandoCodigo).toBe(false);
    });
  });
});
