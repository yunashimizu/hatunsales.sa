import { ComponentFixture, TestBed } from '@angular/core/testing';

import { dominio } from '../../../../../constants/urlConstants';
import { PreviewComprobante } from '../../../../models/admin.models';
import { ComprobanteDetalle } from '../../../../models/documentos.models';
import { HojaComprobanteComponent } from './hoja-comprobante.component';
import {
  HojaComprobante,
  cantidad,
  esConsumidorFinal,
  fechaDdMmAaaa,
  filasCliente,
  filasTotales,
  hojaDesdeDetalle,
  hojaDesdePreview,
  monto,
  porcentaje,
  unidadLegible,
  unitario,
} from './hoja-comprobante.model';

/**
 * Rótulos que el PDF real imprime y la hoja debe repetir. La MISMA lista vive en el spec de paridad del back:
 * hatunsales/src/util/documentos/comprobante-pdf.paridad.spec.ts. Si alguien cambia un lado y no el otro, falla.
 */
const ROTULOS_PDF = [
  'CANT.',
  'UNIDAD',
  'DESCRIPCIÓN',
  'V. UNIT.',
  'P. UNIT.',
  'DESC.',
  'IMPORTE',
  'IMPORTE TOTAL',
  'Op. exonerada',
  'Op. inafecta',
  'R.U.C. N°',
  'PRUEBA SUNAT BETA - SIN VALIDEZ TRIBUTARIA',
  'Resumen (hash)',
];

function crearPreview(cambios: Partial<PreviewComprobante> = {}): PreviewComprobante {
  return {
    emisor: {
      ruc: '20610206337',
      razon_social: 'HATUNSALES S.A.C.',
      direccion: 'Av. Principal 123',
      ubicacion: 'CUSCO - CUSCO - CUSCO',
      logo_url: '/uploads/logo-hatunsales.png',
      nombre_comercial: 'FERRETERÍA HATUN',
      telefono: '084 123456',
      email: 'ventas@hatun.pe',
    },
    id_tipo: 2,
    tipo_nombre: 'BOLETA DE VENTA ELECTRONICA',
    serie: 'B001',
    numero: 7,
    numero_formateado: 'B001-7',
    fecha_de_emision: '05-11-2026',
    fecha_de_vencimiento: '05-11-2026',
    moneda: { id_moneda: 1, nombre: 'Soles', simbolo: 'S/' },
    receptor: {
      origen: 'base',
      tipo: 'cliente',
      tipo_documento: 1,
      numero_documento: '45678912',
      denominacion: 'JUAN PEREZ',
      direccion: 'Jr. Lima 10',
      email: '',
      telefono: '',
      admite_factura: false,
    },
    items: [{
      codigo: 'CEM-01',
      codigo_producto_sunat: '10000000',
      unidad_de_medida: 'NIU',
      descripcion: 'CEMENTO SOL 42.5 KG',
      cantidad: 2,
      valor_unitario: 8.305,
      precio_unitario: 10,
      descuento: 0,
      subtotal: 16.61,
      igv: 2.99,
      total: 20,
      tipo_de_igv: 1,
    }],
    porcentaje_igv: 18,
    totales: { gravada: 16.95, exonerada: 0, inafecta: 0, descuento: 0, igv: 3.05, total: 20 },
    importe_en_letras: 'VEINTE CON 00/100 SOLES',
    observaciones: '',
    advertencias: [],
    ambiente_fiscal: 'produccion',
    ...cambios,
  };
}

function crearDetalle(cambios: Partial<ComprobanteDetalle> = {}): ComprobanteDetalle {
  return {
    emisor: {
      ruc: '20614736420',
      razon_social: 'EMPRESA DE PRUEBAS BETA',
      nombre_comercial: 'EMPRESA DE PRUEBAS BETA',
      direccion: 'Av. Siempre Viva 123',
      ubicacion: 'LIMA - LIMA - LIMA',
      logo_url: 'https://cdn.ejemplo.pe/logo.png',
      telefono: null,
      email: null,
    },
    id_comprobante: 10,
    id_tipo: 1,
    tipo_nombre: 'FACTURA ELECTRONICA',
    serie: 'FB01',
    numero: 12,
    numero_formateado: 'FB01-00000012',
    fecha_de_emision: '2026-10-20',
    fecha_de_vencimiento: '2026-11-19',
    hora_emision: '10:15:00',
    moneda: { id_moneda: 1, nombre: 'Soles', simbolo: 'S/' },
    receptor: { tipo_documento: 6, numero_documento: '20100000001', denominacion: 'ACME SAC', direccion: 'Jr. Lima 1', email: '' },
    items: [{
      codigo: 'P5', unidad_de_medida: 'ZZ', descripcion: 'Instalación', cantidad: 1, valor_unitario: 84.75,
      precio_unitario: 100, descuento: 0, subtotal: 84.75, igv: 15.25, total: 100, tipo_de_igv: 1,
    }],
    porcentaje_igv: 18,
    totales: { gravada: 84.75, exonerada: 0, inafecta: 0, descuento: 0, igv: 15.25, total: 100 },
    importe_en_letras: 'CIEN CON 00/100 SOLES',
    observaciones: '',
    estado: 'aceptado',
    anulado: false,
    motivo_anulacion: '',
    enlace: '',
    enlace_pdf: '',
    cadena_qr: '20614736420|01|FB01|12|15.25|100.00|2026-10-20|6|20100000001|',
    codigo_hash: 'qnVeDFwT6o4bZ3hBOK1bJ2Zl0QY=',
    sunat_description: '',
    sunat_observaciones: [],
    error_mensaje: '',
    proveedor_fiscal: 'sunat_directo',
    ambiente_fiscal: 'beta',
    estado_sunat: 'ACEPTADO',
    aceptada_sunat: true,
    id_envio_ultimo: 4,
    id_venta: 33,
    forma_pago: 'Contado',
    cuotas: [],
    fecha_limite_envio: null,
    vencido: false,
    envio: null,
    referencia: null,
    notas: [],
    guias: [],
    archivos: [],
    aviso: null,
    puede_reintentar: false,
    puede_recuperar_cdr: false,
    puede_confirmar_manual: false,
    puede_nota_credito: false,
    puede_anular: false,
    ...cambios,
  };
}

describe('hoja-comprobante.model', () => {
  describe('formatos del PDF', () => {
    it('monto, unitario, cantidad y porcentaje siguen las reglas del PDF', () => {
      expect(monto(1234.5)).toBe('1,234.50');
      expect(unitario(8.305)).toBe('8.305');
      expect(unitario(10)).toBe('10.00');
      expect(cantidad(2)).toBe('2');
      expect(cantidad(100)).toBe('100');
      expect(cantidad(2.5)).toBe('2.5');
      expect(porcentaje(18)).toBe('18');
    });

    it('fechaDdMmAaaa acepta dd-mm-aaaa y aaaa-mm-dd y entrega dd/mm/aaaa', () => {
      expect(fechaDdMmAaaa('05-11-2026')).toBe('05/11/2026');
      expect(fechaDdMmAaaa('2026-11-05')).toBe('05/11/2026');
      expect(fechaDdMmAaaa('2026-11-05T10:00:00Z')).toBe('05/11/2026');
      expect(fechaDdMmAaaa('05/11/2026')).toBe('05/11/2026');
      expect(fechaDdMmAaaa('')).toBe('');
      expect(fechaDdMmAaaa(null)).toBe('');
    });

    it('unidadLegible abrevia como el PDF y deja lo desconocido tal cual', () => {
      expect(unidadLegible('NIU')).toBe('UND');
      expect(unidadLegible('zz')).toBe('SERV');
      expect(unidadLegible('KGM')).toBe('KG');
      expect(unidadLegible('XYZ')).toBe('XYZ');
    });
  });

  describe('reglas de cliente', () => {
    it('esConsumidorFinal replica la regla del back', () => {
      expect(esConsumidorFinal('0', '')).toBe(true);
      expect(esConsumidorFinal('', '12345678')).toBe(true);
      expect(esConsumidorFinal('1', '00000000')).toBe(true);
      expect(esConsumidorFinal('1', '-')).toBe(true);
      expect(esConsumidorFinal('1', '45678912')).toBe(false);
      expect(esConsumidorFinal('6', '20100000001')).toBe(false);
    });

    it('«CLIENTES VARIOS» y «Sin documento» para el consumidor final', () => {
      const filas = filasCliente({ tipoDoc: '0', numDoc: '00000000', nombre: '', direccion: '' });
      expect(filas).toEqual([['Cliente', 'CLIENTES VARIOS'], ['Documento', 'Sin documento']]);
    });

    it('con RUC el primer rótulo es «Razón social» y el documento se llama RUC', () => {
      const filas = filasCliente({ tipoDoc: '6', numDoc: '20100000001', nombre: 'ACME SAC', direccion: 'Jr. Lima 1' });
      expect(filas).toEqual([
        ['Razón social', 'ACME SAC'],
        ['RUC', '20100000001'],
        ['Dirección', 'Jr. Lima 1'],
      ]);
    });

    it('con DNI válido el rótulo es DNI', () => {
      const filas = filasCliente({ tipoDoc: '1', numDoc: '45678912', nombre: 'JUAN', direccion: '' });
      expect(filas[1]).toEqual(['DNI', '45678912']);
    });
  });

  describe('hojaDesdePreview', () => {
    it('usa el título del PDF (con tilde), el correlativo de 8 dígitos y fecha dd/mm/aaaa', () => {
      const h = hojaDesdePreview(crearPreview());
      expect(h.tipo).toBe('03');
      expect(h.titulo).toBe('BOLETA DE VENTA ELECTRÓNICA');
      expect(h.serieNumero).toBe('B001-00000007');
      expect(h.fechaEmision).toBe('05/11/2026');
      expect(h.horaEmision).toBeNull();
    });

    it('copia el emisor completo y el logo tal cual llega', () => {
      const h = hojaDesdePreview(crearPreview());
      expect(h.emisor).toMatchObject({
        ruc: '20610206337',
        nombreComercial: 'FERRETERÍA HATUN',
        telefono: '084 123456',
        email: 'ventas@hatun.pe',
        logoUrl: '/uploads/logo-hatunsales.png',
      });
    });

    it('un back anterior (sin nombre comercial, teléfono ni correo) no rompe el adaptador', () => {
      const p = crearPreview();
      p.emisor = { ruc: '1', razon_social: 'X', direccion: '', ubicacion: '', logo_url: '' };
      const h = hojaDesdePreview(p);
      expect(h.emisor.nombreComercial).toBeNull();
      expect(h.emisor.telefono).toBeNull();
      expect(h.emisor.logoUrl).toBeNull();
    });

    it('el vencimiento solo se informa si es crédito', () => {
      expect(hojaDesdePreview(crearPreview({ forma_pago: 'Contado' })).fechaVencimiento).toBeNull();
      expect(hojaDesdePreview(crearPreview()).fechaVencimiento).toBeNull();
      const credito = hojaDesdePreview(crearPreview({ forma_pago: 'Credito', fecha_de_vencimiento: '05-12-2026' }));
      expect(credito.fechaVencimiento).toBe('05/12/2026');
    });

    it('mapea líneas y totales (descuento de la línea y descuentos globales)', () => {
      const p = crearPreview();
      p.items[0].descuento = 0.4;
      p.totales.descuento = 0.4;
      const h = hojaDesdePreview(p);
      expect(h.items[0]).toMatchObject({ unidad: 'NIU', codigo: 'CEM-01', descuento: 0.4, importe: 20, precioUnitario: 10 });
      expect(h.totales).toMatchObject({ gravada: 16.95, descuentos: 0.4, porcentajeIgv: 18, total: 20 });
    });

    it('las opciones controlan crédito y QR', () => {
      const h = hojaDesdePreview(crearPreview(), { mostrarCredito: false, mostrarQr: false, medioPago: 'Efectivo' });
      expect(h.mostrarCredito).toBe(false);
      expect(h.qr).toBeNull();
      expect(h.medioPago).toBe('Efectivo');
      const por_defecto = hojaDesdePreview(crearPreview());
      expect(por_defecto.mostrarCredito).toBe(true);
      expect(por_defecto.qr).toEqual({ modo: 'pendiente', hash: null });
    });

    it('moneda en dólares usa el nombre del PDF', () => {
      const h = hojaDesdePreview(crearPreview({ moneda: { id_moneda: 2, nombre: 'Dólares', simbolo: 'US$' } }));
      expect(h.moneda).toEqual({ simbolo: 'US$', nombre: 'DÓLARES AMERICANOS (USD)' });
    });
  });

  describe('hojaDesdeDetalle', () => {
    it('trae hora, nombre comercial y datos del documento con fecha dd/mm/aaaa', () => {
      const h = hojaDesdeDetalle(crearDetalle());
      expect(h.tipo).toBe('01');
      expect(h.titulo).toBe('FACTURA ELECTRÓNICA');
      expect(h.serieNumero).toBe('FB01-00000012');
      expect(h.fechaEmision).toBe('20/10/2026');
      expect(h.horaEmision).toBe('10:15:00');
      expect(h.ambiente).toBe('beta');
      expect(h.emisor.logoUrl).toBe('https://cdn.ejemplo.pe/logo.png');
    });

    it('por defecto no repite crédito ni QR (el detalle ya los muestra debajo)', () => {
      const h = hojaDesdeDetalle(crearDetalle());
      expect(h.mostrarCredito).toBe(false);
      expect(h.qr).toBeNull();
    });

    it('con mostrarQr: «emitido» si hay firma y «sin-firma» si no', () => {
      expect(hojaDesdeDetalle(crearDetalle(), { mostrarQr: true }).qr)
        .toEqual({ modo: 'emitido', hash: 'qnVeDFwT6o4bZ3hBOK1bJ2Zl0QY=' });
      const sinFirma = crearDetalle({ cadena_qr: null, codigo_hash: null });
      expect(hojaDesdeDetalle(sinFirma, { mostrarQr: true }).qr).toEqual({ modo: 'sin-firma', hash: null });
    });

    it('crédito: vencimiento y cuotas con fecha dd/mm/aaaa', () => {
      const h = hojaDesdeDetalle(crearDetalle({
        forma_pago: 'Credito',
        cuotas: [{ numero: 1, monto: 50, fecha_pago: '2026-11-19' }, { numero: 2, monto: 50, fecha_pago: '2026-12-19' }],
      }), { mostrarCredito: true });
      expect(h.fechaVencimiento).toBe('19/11/2026');
      expect(h.cuotas).toEqual([
        { numero: 1, monto: 50, fechaPago: '19/11/2026' },
        { numero: 2, monto: 50, fechaPago: '19/12/2026' },
      ]);
      expect(h.mostrarCredito).toBe(true);
    });

    it('nota: arma el documento que modifica con el título del PDF', () => {
      const h = hojaDesdeDetalle(crearDetalle({
        id_tipo: 7,
        tipo_nombre: 'NOTA DE CREDITO ELECTRONICA',
        referencia: {
          id_comprobante: 1, tipo: '01', serie: 'F001', numero: 3, numero_formateado: 'F001-00000003',
          motivo: '01', motivo_descripcion: 'Anulación de la operación', sustento: 'Error en el RUC',
        },
      }));
      expect(h.titulo).toBe('NOTA DE CRÉDITO ELECTRÓNICA');
      expect(h.referencia).toEqual({
        documento: 'FACTURA ELECTRÓNICA F001-00000003',
        motivo: '01 - Anulación de la operación',
        sustento: 'Error en el RUC',
      });
    });
  });

  describe('totales', () => {
    it('exonerada e inafecta salen siempre; Descuentos solo si es mayor que 0', () => {
      const h = hojaDesdePreview(crearPreview());
      expect(filasTotales(h).map(([etiqueta]) => etiqueta)).toEqual([
        'Op. gravada', 'Op. exonerada', 'Op. inafecta', 'IGV (18%)',
      ]);
      h.totales.descuentos = 1.5;
      expect(filasTotales(h).map(([etiqueta]) => etiqueta)).toContain('Descuentos');
    });
  });
});

describe('HojaComprobanteComponent', () => {
  let fixture: ComponentFixture<HojaComprobanteComponent>;

  function pintar(datos: HojaComprobante | null): HTMLElement {
    fixture.componentRef.setInput('datos', datos);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const q = (el: HTMLElement, selector: string) => el.querySelector(selector) as HTMLElement | null;
  /** Texto visible con un espacio entre elementos (Angular quita los espacios entre etiquetas). */
  const texto = (el: Element): string => {
    const partes: string[] = [];
    const recorrer = (nodo: Node) => {
      if (nodo.nodeType === Node.TEXT_NODE) {
        const t = (nodo.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (t) partes.push(t);
      } else {
        nodo.childNodes.forEach(recorrer);
      }
    };
    recorrer(el);
    return partes.join(' ');
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HojaComprobanteComponent] }).compileComponents();
    fixture = TestBed.createComponent(HojaComprobanteComponent);
  });

  it('sin datos no pinta nada', () => {
    const el = pintar(null);
    expect(q(el, '.hoja')).toBeNull();
  });

  it('es un documento accesible con su etiqueta', () => {
    const el = pintar(hojaDesdePreview(crearPreview()));
    const hoja = q(el, '.hoja')!;
    expect(hoja.getAttribute('role')).toBe('document');
    expect(hoja.getAttribute('aria-label')).toBe('Vista previa del comprobante');
  });

  describe('logo', () => {
    it('una ruta relativa de la API se prefija con el dominio (urlMedia)', () => {
      const el = pintar(hojaDesdePreview(crearPreview()));
      const img = q(el, 'img.hoja__logo') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe(`${dominio}uploads/logo-hatunsales.png`);
      expect(img.getAttribute('alt')).toBe('HATUNSALES S.A.C.');
    });

    it('una URL absoluta queda igual', () => {
      const el = pintar(hojaDesdeDetalle(crearDetalle()));
      const img = q(el, 'img.hoja__logo') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe('https://cdn.ejemplo.pe/logo.png');
    });

    it('sin logo no hay imagen', () => {
      const p = crearPreview();
      p.emisor.logo_url = '';
      expect(q(pintar(hojaDesdePreview(p)), 'img.hoja__logo')).toBeNull();
    });

    it('si la imagen falla se oculta y el encabezado sigue completo', () => {
      const el = pintar(hojaDesdePreview(crearPreview()));
      const img = q(el, 'img.hoja__logo') as HTMLImageElement;
      img.dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(q(el, 'img.hoja__logo')).toBeNull();
      expect(q(el, '.hoja__razon')!.textContent).toContain('HATUNSALES S.A.C.');
      expect(q(el, '.hoja__recuadro')).not.toBeNull();
    });

    it('si falla el logo configurado intenta el oficial y recién si también falla se oculta', () => {
      const d = crearDetalle(); // logo configurado: https://cdn.ejemplo.pe/logo.png
      const el = pintar(hojaDesdeDetalle(d));
      (q(el, 'img.hoja__logo') as HTMLImageElement).dispatchEvent(new Event('error'));
      fixture.detectChanges();
      const img = q(el, 'img.hoja__logo') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe(`${dominio}uploads/logo-hatunsales.png`);
      img.dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(q(el, 'img.hoja__logo')).toBeNull();
    });

    it('un recálculo con el mismo logo roto no vuelve a pedir el configurado', () => {
      const el = pintar(hojaDesdeDetalle(crearDetalle()));
      (q(el, 'img.hoja__logo') as HTMLImageElement).dispatchEvent(new Event('error'));
      fixture.detectChanges();
      pintar(hojaDesdeDetalle(crearDetalle()));
      expect((q(el, 'img.hoja__logo') as HTMLImageElement).getAttribute('src')).toBe(`${dominio}uploads/logo-hatunsales.png`);
    });

    it('al cambiar a otro logo se vuelve a intentar', () => {
      const el = pintar(hojaDesdePreview(crearPreview()));
      (q(el, 'img.hoja__logo') as HTMLImageElement).dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(q(el, 'img.hoja__logo')).toBeNull();
      const otra = crearPreview();
      otra.emisor.logo_url = 'https://cdn.ejemplo.pe/otro.png';
      pintar(hojaDesdePreview(otra));
      expect((q(el, 'img.hoja__logo') as HTMLImageElement).getAttribute('src')).toBe('https://cdn.ejemplo.pe/otro.png');
    });
  });

  describe('encabezado y recuadro del documento', () => {
    it('banda con RUC, tipo y serie-número', () => {
      const el = pintar(hojaDesdePreview(crearPreview()));
      expect(q(el, '.hoja__ruc')!.textContent!.trim()).toBe('R.U.C. N° 20610206337');
      expect(q(el, '.hoja__tipo')!.textContent!.trim()).toBe('BOLETA DE VENTA ELECTRÓNICA');
      expect(q(el, '.hoja__codigo')!.textContent!.trim()).toBe('B001-00000007');
    });

    it('nombre comercial solo si difiere de la razón social; contacto con Telf. y correo', () => {
      const el = pintar(hojaDesdePreview(crearPreview()));
      expect(q(el, '.hoja__comercial')!.textContent).toContain('FERRETERÍA HATUN');
      expect(texto(el)).toContain('Telf. 084 123456 · ventas@hatun.pe');

      const igual = crearPreview();
      igual.emisor.nombre_comercial = 'HATUNSALES S.A.C.';
      expect(q(pintar(hojaDesdePreview(igual)), '.hoja__comercial')).toBeNull();
    });
  });

  describe('avisos', () => {
    it('banner BETA rojo dentro de la hoja con el texto exacto', () => {
      const el = pintar(hojaDesdePreview(crearPreview({ ambiente_fiscal: 'beta' })));
      expect(q(el, '.hoja__banner--beta')!.textContent!.trim()).toBe('PRUEBA SUNAT BETA - SIN VALIDEZ TRIBUTARIA');
    });

    it('en producción no hay banner BETA', () => {
      expect(q(pintar(hojaDesdePreview(crearPreview())), '.hoja__banner--beta')).toBeNull();
    });

    it('el aviso de estado del detalle sale en ámbar', () => {
      const el = pintar(hojaDesdeDetalle(crearDetalle({ aviso: 'PENDIENTE DE ENVÍO A SUNAT' })));
      expect(q(el, '.hoja__banner--aviso')!.textContent).toContain('PENDIENTE DE ENVÍO A SUNAT');
    });
  });

  describe('cliente y documento', () => {
    it('consumidor final: «CLIENTES VARIOS» y «Sin documento», sin mostrar el número', () => {
      const p = crearPreview();
      p.receptor = { ...p.receptor, tipo_documento: 0, numero_documento: '00000000', denominacion: '', direccion: '' };
      const el = pintar(hojaDesdePreview(p));
      const datos = texto(q(el, '.hoja__datos')!);
      expect(datos).toContain('CLIENTES VARIOS');
      expect(datos).toContain('Sin documento');
      expect(datos).not.toContain('00000000');
    });

    it('fecha dd/mm/aaaa, moneda y forma de pago; sin vencimiento en contado', () => {
      const el = pintar(hojaDesdePreview(crearPreview({ forma_pago: 'Contado' })));
      const datos = texto(q(el, '.hoja__datos')!);
      expect(datos).toContain('Fecha de emisión 05/11/2026');
      expect(datos).toContain('SOLES (PEN)');
      expect(datos).toContain('Forma de pago Contado');
      expect(datos).not.toContain('Fecha de vencimiento');
    });

    it('crédito: muestra la fecha de vencimiento', () => {
      const el = pintar(hojaDesdePreview(crearPreview({ forma_pago: 'Credito', fecha_de_vencimiento: '05-12-2026' })));
      expect(texto(q(el, '.hoja__datos')!)).toContain('Fecha de vencimiento 05/12/2026');
    });

    it('el detalle muestra la hora junto a la fecha', () => {
      const el = pintar(hojaDesdeDetalle(crearDetalle()));
      expect(texto(q(el, '.hoja__datos')!)).toContain('Fecha de emisión 20/10/2026 10:15:00');
    });
  });

  describe('tabla', () => {
    it('las 7 columnas van en el orden del PDF', () => {
      const el = pintar(hojaDesdePreview(crearPreview()));
      const cabeceras = Array.from(el.querySelectorAll('.hoja__tabla thead th')).map((th) => th.textContent!.trim());
      expect(cabeceras).toEqual(['CANT.', 'UNIDAD', 'DESCRIPCIÓN', 'V. UNIT.', 'P. UNIT.', 'DESC.', 'IMPORTE']);
    });

    it('cada celda trae su etiqueta (la hoja angosta las muestra) y los valores abreviados', () => {
      const el = pintar(hojaDesdePreview(crearPreview()));
      const celdas = Array.from(el.querySelectorAll('.hoja__tabla tbody tr:first-child td'));
      expect(celdas.map((c) => c.getAttribute('data-etiqueta'))).toEqual([
        'CANT.', 'UNIDAD', 'DESCRIPCIÓN', 'V. UNIT.', 'P. UNIT.', 'DESC.', 'IMPORTE',
      ]);
      expect(celdas.map((c) => texto(c))).toEqual([
        '2', 'UND', 'CEMENTO SOL 42.5 KG Cód. CEM-01', '8.305', '10.00', '—', '20.00',
      ]);
    });

    it('sin líneas muestra un aviso', () => {
      const p = crearPreview();
      p.items = [];
      expect(texto(pintar(hojaDesdePreview(p)))).toContain('Sin líneas de detalle.');
    });
  });

  describe('totales', () => {
    it('exonerada e inafecta en cero, IGV y banda de importe total', () => {
      const el = pintar(hojaDesdePreview(crearPreview()));
      const totales = texto(q(el, '.hoja__totales')!);
      expect(totales).toContain('Op. gravada S/ 16.95');
      expect(totales).toContain('Op. exonerada S/ 0.00');
      expect(totales).toContain('Op. inafecta S/ 0.00');
      expect(totales).toContain('IGV (18%) S/ 3.05');
      expect(totales).not.toContain('Descuentos');
      expect(q(el, '.hoja__total')!.textContent).toContain('IMPORTE TOTAL');
      expect(q(el, '.hoja__total')!.textContent).toContain('S/ 20.00');
    });

    it('«SON: …» en su caja, sin duplicar el rótulo', () => {
      const el = pintar(hojaDesdePreview(crearPreview()));
      expect(q(el, '.hoja__son')!.textContent!.trim()).toBe('SON: VEINTE CON 00/100 SOLES');
      const conSon = crearPreview({ importe_en_letras: 'SON: VEINTE CON 00/100 SOLES' });
      expect(q(pintar(hojaDesdePreview(conSon)), '.hoja__son')!.textContent!.trim()).toBe('SON: VEINTE CON 00/100 SOLES');
    });

    it('no incluye una fila de recargo de tarjeta (va fuera de la hoja)', () => {
      const p = crearPreview({
        recargo_tarjeta: { porcentaje: 3, base_tarjeta: 20, monto: 0.59, total_sin_recargo: 19.41 },
      });
      expect(texto(pintar(hojaDesdePreview(p)))).not.toContain('recargo');
    });
  });

  describe('crédito', () => {
    it('vista previa a crédito: monto pendiente igual al total y sin tabla de cuotas', () => {
      const el = pintar(hojaDesdePreview(crearPreview({ forma_pago: 'Credito' })));
      const credito = q(el, '.hoja__credito')!;
      expect(credito.textContent).toContain('FORMA DE PAGO: CRÉDITO');
      expect(credito.textContent).toContain('Monto neto pendiente de pago: S/ 20.00');
      expect(credito.querySelector('table')).toBeNull();
    });

    it('con cuotas reales muestra la tabla y el pendiente suma las cuotas', () => {
      const d = crearDetalle({
        forma_pago: 'Credito',
        cuotas: [{ numero: 1, monto: 40, fecha_pago: '2026-11-19' }, { numero: 2, monto: 60, fecha_pago: '2026-12-19' }],
      });
      const el = pintar(hojaDesdeDetalle(d, { mostrarCredito: true }));
      const credito = q(el, '.hoja__credito')!;
      expect(credito.textContent).toContain('S/ 100.00');
      const filas = Array.from(credito.querySelectorAll('tbody tr')).map((tr) => texto(tr));
      expect(filas).toEqual(['Cuota 001 19/11/2026 S/ 40.00', 'Cuota 002 19/12/2026 S/ 60.00']);
    });

    it('contado o mostrarCredito=false: no hay sección', () => {
      expect(q(pintar(hojaDesdePreview(crearPreview({ forma_pago: 'Contado' }))), '.hoja__credito')).toBeNull();
      const d = crearDetalle({ forma_pago: 'Credito' });
      expect(q(pintar(hojaDesdeDetalle(d)), '.hoja__credito')).toBeNull();
    });
  });

  describe('notas', () => {
    it('observaciones y medio de pago, solo si vienen', () => {
      const sin = pintar(hojaDesdePreview(crearPreview()));
      expect(texto(sin)).not.toContain('OBSERVACIONES');
      expect(texto(sin)).not.toContain('MEDIO DE PAGO');

      const el = pintar(hojaDesdePreview(crearPreview({ observaciones: 'Entrega en obra' }), { medioPago: 'Efectivo' }));
      expect(texto(el)).toContain('OBSERVACIONES Entrega en obra');
      expect(texto(el)).toContain('MEDIO DE PAGO Efectivo');
    });
  });

  describe('recuadro del QR (no se genera en el front)', () => {
    it('vista previa: casilla que dice que se genera al emitir, sin hash falso ni imagen', () => {
      const el = pintar(hojaDesdePreview(crearPreview()));
      const qr = q(el, '.hoja__qr')!;
      expect(qr.textContent).toContain('El código QR y el resumen (hash) se generan al emitir');
      expect(qr.textContent).not.toContain('Resumen (hash):');
      expect(qr.querySelector('img, canvas, svg')).toBeNull();
      expect(qr.textContent).toContain('Representación impresa de la Boleta de Venta Electrónica. Consulte su validez en www.sunat.gob.pe');
    });

    it('detalle con firma: muestra el hash real y dice que el QR va en el PDF', () => {
      const el = pintar(hojaDesdeDetalle(crearDetalle(), { mostrarQr: true }));
      const qr = q(el, '.hoja__qr')!;
      expect(qr.textContent).toContain('Resumen (hash): qnVeDFwT6o4bZ3hBOK1bJ2Zl0QY=');
      expect(qr.textContent).toContain('El código QR va impreso en el PDF');
    });

    it('detalle sin firma: avisa que el QR no está disponible', () => {
      const d = crearDetalle({ cadena_qr: null, codigo_hash: null });
      const el = pintar(hojaDesdeDetalle(d, { mostrarQr: true }));
      expect(q(el, '.hoja__qr')!.textContent).toContain('Código QR no disponible: el comprobante aún no tiene firma electrónica.');
    });

    it('por defecto el detalle no repite el QR', () => {
      expect(q(pintar(hojaDesdeDetalle(crearDetalle())), '.hoja__qr')).toBeNull();
    });
  });

  it('el pie lleva el documento y la razón social, sin numerar páginas (la hoja no sabe cuántas tendrá el PDF)', () => {
    const el = pintar(hojaDesdePreview(crearPreview()));
    const pie = texto(q(el, '.hoja__pie')!);
    expect(pie).toContain('BOLETA DE VENTA ELECTRÓNICA B001-00000007 · HATUNSALES S.A.C.');
    expect(pie).not.toContain('Página');
  });

  it('paridad: todos los rótulos que imprime el PDF están en la hoja', () => {
    const d = crearDetalle({
      forma_pago: 'Credito',
      cuotas: [{ numero: 1, monto: 100, fecha_pago: '2026-11-19' }],
    });
    const el = pintar(hojaDesdeDetalle(d, { mostrarCredito: true, mostrarQr: true }));
    const completo = texto(el);
    for (const rotulo of ROTULOS_PDF) {
      expect(completo, `falta el rótulo «${rotulo}»`).toContain(rotulo);
    }
  });
});
