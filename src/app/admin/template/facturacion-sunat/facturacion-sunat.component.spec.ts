import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { urlConstants } from '../../../constants/urlConstants';
import { AlertService } from '../../../shared/services/alert.service';
import { CertificadoFiscal, ConfiguracionSunat, EstadoFiscalApi } from '../../models/fiscal.models';
import { FiscalEstadoService } from '../../service/fiscal-estado.service';
import { FacturacionSunatComponent } from './facturacion-sunat.component';

function configuracionPrueba(): ConfiguracionSunat {
  return {
    proveedor: 'nubefact',
    proveedor_efectivo: 'nubefact',
    ambiente: 'beta',
    boletas_modo: 'individual',
    resumen_hora: '23:30',
    envio_diferido: false,
    tareas_activas: true,
    aplicar_reglas_2027: 'auto',
    codigo_producto_defecto: null,
    series: {
      factura: 'F001',
      boleta: 'B001',
      nc_factura: 'FC01',
      nc_boleta: 'BC01',
      nd_factura: 'FD01',
      nd_boleta: 'BD01',
      gre_remitente: 'T001',
    },
    emisor: {
      ruc: '20123456789',
      razon_social: 'Empresa de pruebas',
      nombre_comercial: '',
      direccion: 'Dirección de prueba',
      ubigeo: '150101',
      distrito: 'Lima',
      provincia: 'Lima',
      departamento: 'Lima',
      codigo_establecimiento: '0000',
    },
    sol: { usuario: 'USUARIO1', tiene_clave: true },
    gre: {
      activa: false,
      correlativo_inicial: 1,
      partida: {
        ubigeo: '150101',
        direccion: 'Dirección de prueba',
        codigo_establecimiento: '0000',
        heredada_del_emisor: { ubigeo: true, direccion: true, codigo_establecimiento: true },
      },
      credenciales: { tiene_credenciales: false, client_id_mascara: null },
    },
    certificado: { beta: null, produccion: null },
    confirmacion_no_ose: null,
    aviso_legal_ose: {
      titulo: 'Condición de la empresa',
      texto: 'Texto recibido del servidor.',
      confirmacion: 'Confirmación recibida del servidor.',
      normas: [],
    },
    correlativo_inicial: { F001: 1, B001: 1, FC01: 1, BC01: 1, FD01: 1, BD01: 1 },
    correlativo_inicial_revisado: false,
    cert_ruc_confirmado: false,
    confirmaciones: {
      emisor_electronico_sol: false,
      certificado_en_sol: false,
      usuario_sol_secundario: false,
      ruc_habido: false,
    },
    emision_bloqueada: { beta: null, produccion: null },
    estado: {
      esquema: { listo: true, mensaje: null, faltantes: [] },
      cifrado_disponible: true,
      cifrado_problema: null,
      listo_para_produccion: false,
      gre_lista_para_produccion: false,
      advertencias: [],
      checklist: {
        cpe: {
          titulo: 'Comprobantes',
          listo: false,
          items: [
            {
              codigo: 'certificado_produccion',
              titulo: 'Certificado de producción',
              ok: false,
              detalle: 'Certificado pendiente',
              accion: 'Cargar certificado',
            },
          ],
        },
        gre: { titulo: 'Guías', listo: false, items: [] },
      },
      pruebas_beta: { listo: false, faltantes: ['certificado_beta'] },
    },
  };
}

const paginaVacia = { datos: [], total: 0, pagina: 1, por_pagina: 20 };

describe('FacturacionSunatComponent', () => {
  let fixture: ComponentFixture<FacturacionSunatComponent>;
  let component: FacturacionSunatComponent;
  let http: HttpTestingController;
  const alerta = {
    toast: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    confirm: vi.fn(async () => ({ isConfirmed: true })),
    confirmar: vi.fn(async () => true),
    confirmarPeligro: vi.fn(async () => true),
    pedirTexto: vi.fn(async (): Promise<string | null> => null),
  };

  function responderConfiguracion(config = configuracionPrueba()): void {
    http.expectOne(urlConstants.fiscal.configuracion).flush(config);
    http
      .expectOne((r) => r.url === urlConstants.fiscal.auditoria)
      .flush({ registros: [], siguiente: null });
    responderBeta(config);
    fixture.detectChanges();
    // La lista de envíos se crea con la primera configuración y consulta una sola vez.
    for (const peticion of http.match((r) => r.url === urlConstants.fiscal.envios)) peticion.flush(paginaVacia);
    // Y la de bajas y resúmenes (RA/RC), debajo de los envíos.
    for (const peticion of http.match((r) => r.url === urlConstants.fiscal.lotes)) peticion.flush(paginaVacia);
    // Igual la tarjeta de productos sin código SUNAT (Configuración).
    for (const peticion of http.match((r) => r.url === urlConstants.producto.sinCodigoSunat)) {
      peticion.flush({ total: 0, datos: [] });
    }
  }

  function responderBeta(config = configuracionPrueba()): void {
    http
      .expectOne(urlConstants.fiscal.emisorBeta)
      .flush({ emisor: config.emisor, ruc_certificado_beta: config.certificado.beta?.ruc ?? null });
    http.expectOne(urlConstants.fiscal.posBeta).flush({
      habilitado: false,
      activo: false,
      ambiente: config.ambiente,
      listo: config.estado.esquema.listo,
      ruc_emisor_beta: config.emisor.ruc,
      ruc_certificado_beta: config.certificado.beta?.ruc ?? null,
      advertencia: 'Emisión comercial de prueba SUNAT BETA.',
    });
  }

  /** Al abrir «Configuración» nace la tarjeta «Llave y alertas» y pide el estado y el correo de avisos. */
  function responderLlaveYAlertas(): void {
    for (const p of http.match((r) => r.url === urlConstants.fiscal.estado)) {
      p.flush({ llave: { anterior_definida: false, secretos_con_llave_anterior: 0 } });
    }
    for (const p of http.match((r) => r.url === urlConstants.fiscal.estado.replace(/estado$/, 'alertas'))) {
      p.flush({ correo: null, correo_efectivo: 'ventas@hatunsales.pe', origen: 'emisor' });
    }
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [FacturacionSunatComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AlertService, useValue: alerta },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FacturacionSunatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    sessionStorage.removeItem('token');
    http.verify();
  });

  it('muestra el certificado pendiente y solo consulta al abrir la pantalla', () => {
    responderConfiguracion();
    expect(component.puedeProbar).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Certificado pendiente de cargar');
    expect(fixture.nativeElement.textContent).toContain('Texto recibido del servidor.');
    expect(fixture.nativeElement.textContent).not.toContain('[object Object]');
    expect(fixture.nativeElement.textContent).not.toMatch(/nubefact/i);
    component.probar();
    http.expectNone((r) => r.method !== 'GET');
  });

  it('conserva los borradores de otras secciones y omite la clave SOL vacía', () => {
    responderConfiguracion();
    component.operacion.series.factura = 'F999';
    component.sol.clave = '';
    component.guardarSol();
    const peticion = http.expectOne(urlConstants.fiscal.sol);
    expect(peticion.request.body).toEqual({ usuario: 'USUARIO1' });
    peticion.flush({ usuario: 'USUARIO1', tiene_clave: true });
    responderConfiguracion();
    expect(component.operacion.series.factura).toBe('F999');
    expect(component.sol.clave).toBe('');
  });

  it('la tarjeta «Llave y alertas» solo se crea al abrir Configuración', () => {
    responderConfiguracion();
    expect(fixture.nativeElement.querySelector('app-llave-alertas-sunat')).toBeNull();
    http.expectNone((r) => r.url === urlConstants.fiscal.estado.replace(/estado$/, 'alertas'));

    component.seccion = 'configuracion';
    fixture.componentInstance['cdr'].markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-llave-alertas-sunat')).not.toBeNull();
    responderLlaveYAlertas();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Llave y alertas');
    expect(fixture.nativeElement.textContent).not.toMatch(/nubefact/i);
  });

  it('el formulario de operación ya no cambia el ambiente ni las confirmaciones', () => {
    responderConfiguracion();
    component.guardarOperacion();
    const peticion = http.expectOne(urlConstants.fiscal.configuracion);
    expect(peticion.request.method).toBe('PUT');
    expect(Object.keys(peticion.request.body).sort()).toEqual(
      ['aplicar_reglas_2027', 'boletas_modo', 'codigo_producto_defecto', 'envio_diferido', 'resumen_hora', 'series'].sort(),
    );
    peticion.flush(configuracionPrueba());
    responderConfiguracion();
  });

  describe('boletas por resumen diario y el interruptor único de envío (S2 y S3)', () => {
    it('un solo interruptor «enviar a SUNAT al cobrar»: encendido es envio_diferido apagado, y ya no se manda envio_en_linea', async () => {
      responderConfiguracion();
      expect(component.enviarAlCobrar).toBe(true);
      component.enviarAlCobrar = false;
      expect(component.operacion.envio_diferido).toBe(true);

      await component.guardarOperacion();

      const peticion = http.expectOne(urlConstants.fiscal.configuracion);
      expect(peticion.request.body).toMatchObject({ envio_diferido: true, boletas_modo: 'individual', resumen_hora: '23:30' });
      expect(peticion.request.body).not.toHaveProperty('envio_en_linea');
      peticion.flush({ ...configuracionPrueba(), envio_diferido: true });
      responderConfiguracion({ ...configuracionPrueba(), envio_diferido: true });
      expect(component.enviarAlCobrar).toBe(false);
    });

    it('con «Resumen diario» aparece la hora y el texto verdadero; con «Envío individual», no', () => {
      responderConfiguracion();
      component.seccion = 'configuracion';
      fixture.detectChanges();
      responderLlaveYAlertas();
      const raiz = fixture.nativeElement as HTMLElement;
      expect(raiz.querySelector('#fiscal-resumen-hora')).toBeNull();
      expect(raiz.querySelector('#fiscal-boletas-ayuda')?.textContent).toContain('cada boleta va a SUNAT al cobrar');

      component.operacion.boletas_modo = 'resumen';
      component.operacion.resumen_hora = '22:15';
      fixture.componentInstance['cdr'].markForCheck();
      fixture.detectChanges();
      expect((raiz.querySelector('#fiscal-resumen-hora') as HTMLInputElement | null)).not.toBeNull();
      expect(raiz.querySelector('#fiscal-boletas-ayuda')?.textContent).toContain('se informan juntas a las 22:15');
      expect(raiz.textContent).toContain('el cliente recibe su boleta igual');
      expect(raiz.textContent).not.toMatch(/nubefact/i);
    });

    it('cambiar a resumen diario pide confirmación (si se cancela no se guarda nada) y guarda la hora', async () => {
      responderConfiguracion();
      component.operacion.boletas_modo = 'resumen';
      component.operacion.resumen_hora = '21:30';
      alerta.confirmar.mockResolvedValueOnce(false);

      await component.guardarOperacion();

      expect(alerta.confirmar).toHaveBeenCalledWith(
        expect.objectContaining({ title: '¿Informar las boletas por resumen diario?', message: expect.stringContaining('21:30') }),
      );
      http.expectNone(urlConstants.fiscal.configuracion);

      await component.guardarOperacion();
      const peticion = http.expectOne(urlConstants.fiscal.configuracion);
      expect(peticion.request.body).toMatchObject({ boletas_modo: 'resumen', resumen_hora: '21:30' });
      peticion.flush({ ...configuracionPrueba(), boletas_modo: 'resumen', resumen_hora: '21:30' });
      responderConfiguracion({ ...configuracionPrueba(), boletas_modo: 'resumen', resumen_hora: '21:30' });
      expect(component.operacion.resumen_hora).toBe('21:30');
    });

    it('guardar sin cambiar el modo de boletas no pregunta nada', async () => {
      responderConfiguracion();
      alerta.confirmar.mockClear();
      await component.guardarOperacion();
      expect(alerta.confirmar).not.toHaveBeenCalled();
      http.expectOne(urlConstants.fiscal.configuracion).flush(configuracionPrueba());
      responderConfiguracion();
    });
  });

  it('envía el certificado como multipart y borra el archivo y su clave tras guardar', () => {
    responderConfiguracion();
    const archivo = new File(['certificado-de-prueba'], 'certificado.pfx');
    component.archivo = archivo;
    component.claveCertificado = 'clave-de-prueba';
    component.ambienteCertificado = 'produccion';
    component.otroEmisorBeta = true;
    component.subirCertificado();
    const peticion = http.expectOne(urlConstants.fiscal.certificado);
    expect(peticion.request.body).toBeInstanceOf(FormData);
    expect(peticion.request.body.get('archivo')).toBe(archivo);
    expect(peticion.request.body.get('clave')).toBe('clave-de-prueba');
    expect(peticion.request.body.get('ambiente')).toBe('produccion');
    expect(peticion.request.body.get('forzar')).toBeNull();
    expect(peticion.request.headers.has('Content-Type')).toBe(false);
    peticion.flush({ id: 1 });
    responderConfiguracion();
    expect(component.claveCertificado).toBe('');
    expect(component.archivo).toBeNull();
  });

  describe('reemplazar un certificado que ya está cargado', () => {
    const cargado = { ambiente: 'produccion', titular: 'HATUNSALES SAC', vigente_hasta: '2027-06-30T00:00:00.000Z', vencido: false, dias_para_vencer: 200 } as unknown as CertificadoFiscal;

    it('pide confirmación de peligro con lo que cambia; si se cancela no sube nada', async () => {
      responderConfiguracion({ ...configuracionPrueba(), certificado: { beta: null, produccion: cargado } });
      component.archivo = new File(['nuevo'], 'nuevo.pfx');
      component.claveCertificado = 'clave';
      component.ambienteCertificado = 'produccion';
      alerta.confirmarPeligro.mockResolvedValueOnce(false);

      await component.subirCertificado();

      expect(alerta.confirmarPeligro).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '¿Reemplazar el certificado de producción?',
          message: expect.stringContaining('Reemplazará el certificado actual de producción'),
          confirmText: 'Sí, reemplazar',
        }),
      );
      http.expectNone(urlConstants.fiscal.certificado);
      expect(component.archivo).not.toBeNull();
    });

    it('confirmado, sube el certificado nuevo como siempre', async () => {
      responderConfiguracion({ ...configuracionPrueba(), certificado: { beta: null, produccion: cargado } });
      component.archivo = new File(['nuevo'], 'nuevo.pfx');
      component.claveCertificado = 'clave';
      component.ambienteCertificado = 'produccion';

      await component.subirCertificado();

      const peticion = http.expectOne(urlConstants.fiscal.certificado);
      expect(peticion.request.body.get('ambiente')).toBe('produccion');
      peticion.flush({ id: 2 });
      responderConfiguracion();
    });

    it('si el ambiente elegido no tiene certificado (aunque el otro sí), sube sin preguntar', async () => {
      responderConfiguracion({ ...configuracionPrueba(), certificado: { beta: null, produccion: cargado } });
      component.archivo = new File(['nuevo'], 'beta.pfx');
      component.ambienteCertificado = 'beta';

      await component.subirCertificado();

      expect(alerta.confirmarPeligro).not.toHaveBeenCalled();
      http.expectOne(urlConstants.fiscal.certificado).flush({ id: 3 });
      responderConfiguracion();
    });

    it('la bitácora traduce TODAS las acciones nuevas (constancia, nota de crédito, guías, resumen, pedido web, alertas, llaves)', () => {
      responderConfiguracion();
      const esperado: Record<string, string> = {
        FISCAL_CDR_RECUPERADO: 'Constancia de SUNAT pedida',
        FISCAL_NC_EMITIDA: 'Nota de crédito emitida',
        FISCAL_GRE_EMITIDA: 'Guía de remisión emitida',
        FISCAL_GRE_ANULADA: 'Guía de remisión anulada',
        FISCAL_RESUMEN_SOLICITADO: 'Resumen diario de boletas enviado a SUNAT',
        FISCAL_PEDIDO_WEB_EMITIDO: 'Comprobante de un pedido de la tienda',
        FISCAL_ALERTA_ENVIADA: 'Aviso enviado por correo',
        FISCAL_SECRETOS_RECIFRADOS: 'Claves y certificados re-cifrados con la llave vigente',
        ENVIO_DESCARTADO_POR_ANULACION: 'Envío descartado al anular la venta',
      };
      for (const [codigo, texto] of Object.entries(esperado)) expect(component.nombreAccion(codigo)).toBe(texto);
      // Una acción que el panel no conoce se muestra tal cual (nunca queda vacía).
      expect(component.nombreAccion('FISCAL_FUTURA')).toBe('FISCAL_FUTURA');
      expect(component.nombreAccion('PROVEEDOR_CAMBIADO')).toBe('Emisión electrónica activada o apagada');
    });

    it('en la tabla de la bitácora se lee el nombre y el código técnico queda solo en el title', () => {
      responderConfiguracion();
      component.auditoria = [
        { id_auditoria: 1, creado_en: '2026-11-08T15:00:00.000Z', id_usuario: 3, accion: 'FISCAL_NC_EMITIDA', entidad: 'comprobantes', detalle: null },
      ] as typeof component.auditoria;
      component.seccion = 'bitacora';
      fixture.detectChanges();
      const celda = fixture.nativeElement.querySelector('td[data-etiqueta="Acción"]') as HTMLElement;
      expect(celda.textContent?.trim()).toBe('Nota de crédito emitida');
      expect(celda.querySelector('.adm-tabla__principal')?.getAttribute('title')).toBe('FISCAL_NC_EMITIDA');
      expect(celda.textContent).not.toContain('FISCAL_NC_EMITIDA');
      expect(fixture.nativeElement.querySelector('.adm-tabla__mono')).toBeNull();
    });

    it('«Apagar la emisión electrónica» es el nombre del apagado; la palabra del proveedor histórico no se ve en la pantalla', () => {
      responderConfiguracion();
      expect(component.nombreAccion('PROVEEDOR_CAMBIADO')).not.toMatch(/desactiv/i);
      expect(fixture.nativeElement.textContent).not.toMatch(/nubefact/i);
    });

    it('la bitácora nombra en palabras las acciones nuevas de reintento y liberación', () => {
      responderConfiguracion();
      expect(component.nombreAccion('FISCAL_REINTENTO_MANUAL')).toBe('Envío reintentado a mano');
      expect(component.nombreAccion('FISCAL_LOTE_LIBERADO')).toContain('liberado');
      expect(component.nombreAccion('FISCAL_GRE_LIBERADA')).toContain('Guía de remisión liberada');
      expect(component.nombreAccion('FISCAL_BAJA_SOLICITADA')).toContain('Baja');
    });
  });

  it('propone subir el certificado al ambiente vigente (producción si se trabaja en producción)', () => {
    responderConfiguracion({ ...configuracionPrueba(), ambiente: 'produccion' });
    expect(component.ambienteCertificado).toBe('produccion');
  });

  it('avisa en la tarjeta cuando el certificado guardado ya no abre con la llave del servidor', () => {
    responderConfiguracion();
    const base = { ambiente: 'beta', vencido: false, dias_para_vencer: 200, autofirmado: false } as CertificadoFiscal;
    expect(component.alertasCertificado({ ...base, legible: false }).map((a) => a.titulo)).toEqual([
      'No se puede leer con la llave actual del servidor',
    ]);
    expect(component.alertasCertificado({ ...base, legible: true })).toEqual([]);
    expect(component.alertasCertificado(base)).toEqual([]);
  });

  it('rechaza archivos que exceden el límite antes de hacer una petición', () => {
    responderConfiguracion();
    const input = {
      files: [new File([new Uint8Array(200 * 1024 + 1)], 'grande.pfx')],
      value: 'grande.pfx',
    };
    component.seleccionarArchivo({ target: input } as unknown as Event);
    expect(component.archivo).toBeNull();
    expect(input.value).toBe('');
    component.subirCertificado();
    http.expectNone(urlConstants.fiscal.certificado);
  });

  it('mantiene la herencia del punto de partida al guardar guías', () => {
    responderConfiguracion();
    component.guardarGre();
    const peticion = http.expectOne(urlConstants.fiscal.configuracion);
    expect(peticion.request.body).toEqual({
      gre: {
        activa: false,
        correlativo_inicial: 1,
        partida: { ubigeo: '', direccion: '', codigo_establecimiento: '' },
      },
    });
    peticion.flush(configuracionPrueba());
    responderConfiguracion();
  });

  it('guarda lo que pide la activación y muestra las advertencias del servidor', () => {
    responderConfiguracion();
    component.guardarCambios({
      cambios: { ambiente: 'produccion', proveedor: 'sunat_directo' },
      mensaje: 'Emisión de producción activada',
    });
    const peticion = http.expectOne(urlConstants.fiscal.configuracion);
    expect(peticion.request.body).toEqual({ ambiente: 'produccion', proveedor: 'sunat_directo' });
    peticion.flush({
      ...configuracionPrueba(),
      advertencias: ['Desde ahora las ventas se emiten directo a SUNAT (producción).'],
    });
    expect(alerta.warning).toHaveBeenCalledWith({
      title: 'Emisión de producción activada',
      message: 'Desde ahora las ventas se emiten directo a SUNAT (producción).',
    });
    responderConfiguracion();
  });

  it('pide confirmación para apagar las tareas programadas y vuelve atrás si se cancela', async () => {
    responderConfiguracion();
    const interruptor = document.createElement('input');
    interruptor.type = 'checkbox';
    interruptor.checked = false;
    alerta.confirmar.mockResolvedValueOnce(false);
    await component.cambiarTareas(interruptor);
    expect(interruptor.checked).toBe(true);
    http.expectNone((r) => r.method === 'PUT');

    interruptor.checked = false;
    await component.cambiarTareas(interruptor);
    const peticion = http.expectOne(urlConstants.fiscal.configuracion);
    expect(peticion.request.body).toEqual({ tareas_activas: false });
    peticion.flush({ ...configuracionPrueba(), tareas_activas: false });
    responderConfiguracion({ ...configuracionPrueba(), tareas_activas: false });
  });

  it('reanuda la emisión detenida tras confirmar y vuelve a leer el estado', async () => {
    responderConfiguracion();
    sessionStorage.setItem('token', 'token-de-prueba');
    const estado = TestBed.inject(FiscalEstadoService);
    const estadoConBloqueo: EstadoFiscalApi = {
      proveedor: 'nubefact',
      proveedor_efectivo: 'nubefact',
      ambiente: 'beta',
      semaforo: 'rojo',
      listo: false,
      faltantes: [],
      advertencias: [],
      certificado: { cargado: true, ambiente: 'beta', dias_para_vencer: 10, vencido: false, autofirmado: true, alerta: null },
      emision: { activa: false, ambiente: 'beta', codigo: 'FISCAL_EMISION_BLOQUEADA', motivo: 'La emisión está detenida.' },
      bloqueo: { codigo: '0102', motivo: 'SUNAT no reconoce el usuario o la clave SOL.', fecha: '2026-10-22T14:00:00.000Z' },
      cola: { pendientes: 1, inciertos: 0 },
      plazos: { vencen_hoy: 0, vencidos: 0 },
      tareas: { activas: true, ultima_ejecucion: null },
      evaluado_en: '2026-10-22T15:00:00.000Z',
    };
    estado.refrescar(true);
    http.expectOne(urlConstants.fiscal.estado).flush(estadoConBloqueo);
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('SUNAT detuvo la emisión (código 0102)');
    expect(texto).toContain('vence en 10 día(s)');
    const boton = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
      (b) => b.textContent?.includes('Reanudar emisión'),
    );
    expect(boton).toBeTruthy();

    await component.reanudarEmision();
    expect(alerta.confirmar).toHaveBeenCalled();
    http
      .expectOne((r) => r.url === urlConstants.fiscal.reanudarEmision && r.method === 'POST')
      .flush({ ambiente: 'beta', reanudada: true, bloqueo_anterior: estadoConBloqueo.bloqueo });
    expect(alerta.toast).toHaveBeenCalledWith({ type: 'success', title: 'Emisión reanudada' });
    http.expectOne(urlConstants.fiscal.estado).flush({ ...estadoConBloqueo, bloqueo: null });
    responderConfiguracion();
    expect(fixture.nativeElement.textContent).not.toContain('SUNAT detuvo la emisión');
  });

  it('distingue las comprobaciones locales de un envío todavía no disponible', () => {
    const config = configuracionPrueba();
    config.certificado.beta = {
      id: 1,
      ambiente: 'beta',
      titular: 'Prueba',
      ruc: config.emisor.ruc,
      nombre_archivo: null,
      vigente_hasta: '2030-01-01',
      dias_para_vencer: 100,
      vencido: false,
      autofirmado: true,
      advertencias: [],
    };
    responderConfiguracion(config);
    component.probar();
    const peticion = http.expectOne(urlConstants.fiscal.probarConexion);
    expect(peticion.request.body).toEqual({ ambiente: 'beta', documento: 'cpe', tipo_cpe: '01' });
    peticion.flush({
      ok: true,
      ambiente: 'beta',
      documento: 'cpe',
      tiempo_ms: 10,
      envio_disponible: false,
      pasos: [{ paso: 'envio', ok: null, detalle: 'Módulo pendiente' }],
    });
    http
      .expectOne((r) => r.url === urlConstants.fiscal.auditoria)
      .flush({ registros: [], siguiente: null });
    responderBeta(config);
    http.expectOne((r) => r.url === urlConstants.fiscal.envios).flush(paginaVacia);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Resultado de comprobaciones locales');
    expect(fixture.nativeElement.textContent).toContain('Sin ejecutar');
  });

  it('impide guardar valores por defecto si el servidor aún no tiene el módulo', () => {
    http
      .expectOne(urlConstants.fiscal.configuracion)
      .flush({ message: 'Not Found' }, { status: 404, statusText: 'Not Found' });
    component.guardarEmisor();
    expect(component.config).toBeNull();
    expect(component.errorCarga).toContain('aún no está disponible');
    http.expectNone((r) => r.method !== 'GET');
  });

  it('guarda el emisor de pruebas por su endpoint separado', () => {
    responderConfiguracion();
    component.emisorBeta!.razon_social = 'Empresa separada de pruebas';
    component.guardarEmisorBeta();
    const peticion = http.expectOne(urlConstants.fiscal.emisorBeta);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body.razon_social).toBe('Empresa separada de pruebas');
    http.expectNone((r) => r.url === urlConstants.fiscal.configuracion && r.method === 'PUT');
    peticion.flush({});
    responderConfiguracion();
  });

  it('muestra el emisor BETA aunque falle la lectura de la emisión de prueba del POS', () => {
    http.expectOne(urlConstants.fiscal.configuracion).flush(configuracionPrueba());
    http.expectOne((r) => r.url === urlConstants.fiscal.auditoria).flush({ registros: [], siguiente: null });
    http
      .expectOne(urlConstants.fiscal.emisorBeta)
      .flush({ emisor: configuracionPrueba().emisor, ruc_certificado_beta: null });
    http
      .expectOne(urlConstants.fiscal.posBeta)
      .flush({ message: 'Internal server error' }, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();
    for (const peticion of http.match((r) => r.url === urlConstants.fiscal.envios)) peticion.flush(paginaVacia);
    // Y la de bajas y resúmenes (RA/RC), debajo de los envíos.
    for (const peticion of http.match((r) => r.url === urlConstants.fiscal.lotes)) peticion.flush(paginaVacia);
    for (const peticion of http.match((r) => r.url === urlConstants.producto.sinCodigoSunat)) {
      peticion.flush({ total: 0, datos: [] });
    }
    expect(component.emisorBeta?.razon_social).toBe('Empresa de pruebas');
    expect(component.estadoPosBeta).toBeNull();
    expect(component.errorPosBeta).toContain('No se pudo leer el estado de la emisión de prueba del POS');
    const avisos = Array.from(fixture.nativeElement.querySelectorAll('[role="alert"]') as NodeListOf<HTMLElement>);
    expect(avisos.some((a) => a.textContent?.includes('emisión de prueba del POS'))).toBe(true);
  });

  it('no habilita el envío usando solamente un RUC editado sin guardar', () => {
    const config = configuracionPrueba();
    config.certificado.beta = {
      id: 1,
      ambiente: 'beta',
      titular: 'Otra empresa',
      ruc: '20610206337',
      nombre_archivo: null,
      vigente_hasta: '2030-01-01',
      dias_para_vencer: 100,
      vencido: false,
      autofirmado: false,
      advertencias: [],
    };
    responderConfiguracion(config);
    component.emisorBeta!.ruc = '20610206337';
    expect(component.puedeProbar).toBe(false);
    component.probar();
    http.expectNone(urlConstants.fiscal.probarConexion);
  });
});
