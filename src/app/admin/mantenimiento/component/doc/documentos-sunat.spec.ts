import { textoEstadoSunat, tonoEstadoSunat } from '../../../models/documentos.models';
import {
  archivosDescargables,
  aunPuedeResumirse,
  sumarDiasYmd,
  chipAmbiente,
  describirResultadoSunat,
  estadoDeComprobante,
  fechaYmdCorta,
  fechaYmdLegible,
  hoyLimaYmd,
  NOMBRE_ARCHIVO,
  nombreDescarga,
  nombreEstadoEnvio,
  nombreLote,
  plazoVencido,
  textoAccionSunat,
  textoPlazoVencido,
} from './documentos-sunat';

describe('documentos-sunat: la respuesta de SUNAT en palabras', () => {
  it('aceptado con observaciones: lo dice y las lista, sin alarmar', () => {
    const vista = describirResultadoSunat({
      aceptada_sunat: true,
      estado_sunat: 'ACEPTADO_OBS',
      sunat_description: 'La Factura numero F001-12, ha sido aceptada',
      sunat_observaciones: [{ codigo: '4252', descripcion: 'El dato ingresado como atributo @listName es incorrecto.' }],
      ambiente_fiscal: 'produccion',
    });
    expect(vista.tono).toBe('exito');
    expect(vista.titulo).toBe('Aceptado por SUNAT con observaciones');
    expect(vista.observaciones).toHaveLength(1);
    expect(vista.siguiente).toContain('no invalidan');
    expect(vista.beta).toBe(false);
  });

  it('rechazado: muestra el motivo de SUNAT y que el número ya no se reutiliza', () => {
    const vista = describirResultadoSunat({
      aceptada_sunat: false,
      estado: 'error',
      estado_sunat: 'RECHAZADO',
      error: '2800 - El dato ingresado en el tipo de documento de identidad del receptor no es válido',
      sunat_responsecode: '2800',
      ambiente_fiscal: 'beta',
    });
    expect(vista.tono).toBe('peligro');
    expect(vista.titulo).toBe('Rechazado por SUNAT');
    expect(vista.detalle).toContain('2800');
    expect(vista.siguiente).toContain('emita un documento nuevo');
    expect(vista.beta).toBe(true);
    // El código ya viene en el mensaje: no se repite.
    expect(vista.codigo).toBeNull();
  });

  it('el código de SUNAT acompaña a lo no aceptado cuando el mensaje no lo trae (nunca a un aceptado)', () => {
    expect(
      describirResultadoSunat({ estado: 'error', estado_sunat: 'RECHAZADO', error: 'El RUC del receptor no existe', sunat_responsecode: '2017' })
        .codigo,
    ).toBe('2017');
    expect(describirResultadoSunat({ estado: 'error', estado_sunat: 'ERROR_CONFIG', sunat_responsecode: '0102' }).codigo).toBe('0102');
    expect(
      describirResultadoSunat({ aceptada_sunat: true, estado_sunat: 'ACEPTADO_OBS', sunat_responsecode: '4252' }).codigo,
    ).toBeNull();
    expect(describirResultadoSunat({ aceptada_sunat: true, estado_sunat: 'ACEPTADO', sunat_responsecode: '0' }).codigo).toBeNull();
  });

  it('en proceso: con RECUPERAR_CDR pide no reenviar; sin respuesta, reintentar es seguro', () => {
    const recuperar = describirResultadoSunat({ estado: 'pendiente', estado_sunat: 'PENDIENTE_REENVIO', accion_sunat: 'RECUPERAR_CDR' });
    expect(recuperar.tono).toBe('aviso');
    expect(recuperar.siguiente).toContain('no lo reenvíe');

    const sinRespuesta = describirResultadoSunat({ estado: 'pendiente', estado_sunat: 'ENVIANDO', error: 'Tiempo de espera agotado' });
    expect(sinRespuesta.titulo).toContain('En proceso');
    expect(sinRespuesta.siguiente).toContain('mismo XML');

    const configuracion = describirResultadoSunat({ estado: 'error', estado_sunat: 'ERROR_CONFIG', error: '0102 Usuario o contraseña incorrectos' });
    expect(configuracion.titulo).toContain('configuración');
    expect(configuracion.siguiente).toContain('Facturación SUNAT');
  });

  it('estado, ambiente, fechas y archivos de un comprobante para la lista y el detalle', () => {
    expect(estadoDeComprobante({ estado: 'aceptado', anulado: false, estado_sunat: 'ACEPTADO' }).texto).toBe('Aceptado por SUNAT');
    expect(estadoDeComprobante({ estado: 'aceptado', anulado: true, estado_sunat: 'ACEPTADO' })).toEqual({ texto: 'Anulado', tono: 'neutro' });
    // Histórico (sistema anterior): sin estado SUNAT propio.
    expect(estadoDeComprobante({ estado: 'error', anulado: false, estado_sunat: null }).tono).toBe('peligro');

    expect(chipAmbiente('sunat_directo', 'beta').texto).toBe('Prueba BETA - sin validez');
    expect(chipAmbiente('sunat_directo', 'produccion').texto).toBe('Producción');
    expect(chipAmbiente('nubefact', null).texto).toBe('Sistema anterior');

    expect(fechaYmdLegible('2026-10-25')).toBe('25/10/2026');
    expect(archivosDescargables(['cdr_xml', 'zip', 'otro', 'xml_firmado'])).toEqual(['xml_firmado', 'zip', 'cdr_xml']);
    expect(nombreDescarga('F001-00000012', 'pdf_ticket')).toBe('F001-00000012-ticket.pdf');
    expect(nombreDescarga('F001/12 x', 'cdr_xml')).toBe('R-F001_12_x.xml');
    expect(NOMBRE_ARCHIVO.cdr_zip).toBe('Constancia de SUNAT (ZIP)');
  });
});

describe('documentos-sunat: plazo de envío vencido (S1)', () => {
  it('fechas del plazo: dd/mm sin correr el día y «hoy» con el calendario de Lima', () => {
    expect(fechaYmdCorta('2026-10-16')).toBe('16/10');
    expect(fechaYmdCorta(null)).toBe('');
    // 02:30 UTC del 17 todavía es 16 en Lima.
    expect(hoyLimaYmd(new Date('2026-10-17T02:30:00Z'))).toBe('2026-10-16');
    expect(hoyLimaYmd(new Date('2026-10-17T05:00:00Z'))).toBe('2026-10-17');
  });

  it('el plazo vence al día siguiente de su último día; sin fecha no se da por vencido', () => {
    const ahora = new Date('2026-10-17T15:00:00Z');
    expect(plazoVencido('2026-10-16', ahora)).toBe(true);
    expect(plazoVencido('2026-10-17', ahora)).toBe(false);
    expect(plazoVencido('2026-10-18', ahora)).toBe(false);
    expect(plazoVencido(null, ahora)).toBe(false);
    expect(plazoVencido('', ahora)).toBe(false);
  });

  it('la boleta vencida dentro de los 7 días se informa en el resumen diario; pasados los 7 días, nota de crédito', () => {
    const dentro = textoPlazoVencido('B001', '2026-10-20', 'RESUMIR');
    expect(dentro).toBe(
      'El plazo de envío individual venció el 20/10/2026. Se informará a SUNAT en el próximo resumen diario (hasta 7 días después de la emisión); también puede pedirlo con «Informar por resumen».',
    );
    // Sin la acción del servidor se deduce de la fecha: la fecha límite es emisión + 5, el resumen vale hasta emisión + 7.
    expect(textoPlazoVencido('B001', '2026-10-20', 'REINTENTAR', true)).toBe(dentro);
    const tarde = textoPlazoVencido('B001', '2026-10-20', 'EMITIR_NUEVO', false);
    expect(tarde).toBe('El plazo de envío individual venció el 20/10/2026 y ya pasaron los 7 días del resumen diario: si el cliente reclama el comprobante, anúlelo con nota de crédito y emita uno nuevo.');
    expect(textoPlazoVencido('B001', '2020-01-01')).toContain('ya pasaron los 7 días del resumen diario');
    expect(textoPlazoVencido('BC01', '2020-01-01')).toContain('anúlelo con nota de crédito');
  });

  it('aunPuedeResumirse: hasta 2 días después de la fecha límite del envío individual (7.º día desde la emisión)', () => {
    const dia = (ymd: string) => new Date(`${ymd}T17:00:00Z`); // 12:00 en Lima
    expect(aunPuedeResumirse('2026-10-20', dia('2026-10-20'))).toBe(true);
    expect(aunPuedeResumirse('2026-10-20', dia('2026-10-22'))).toBe(true);
    expect(aunPuedeResumirse('2026-10-20', dia('2026-10-23'))).toBe(false);
    expect(aunPuedeResumirse(null, dia('2026-10-20'))).toBe(false);
    expect(sumarDiasYmd('2026-10-31', 2)).toBe('2026-11-02');
  });

  it('la boleta que va en el resumen diario lo dice en palabras, sin alarma', () => {
    expect(textoEstadoSunat('POR_RESUMIR')).toBe('Va en el resumen diario');
    expect(tonoEstadoSunat('POR_RESUMIR')).toBe('info');
    const vista = describirResultadoSunat({ estado: 'pendiente', estado_sunat: 'POR_RESUMIR', accion_sunat: 'RESUMIR', sunat_description: 'Boleta registrada; se informa a SUNAT en el resumen diario.', ambiente_fiscal: 'produccion' });
    expect(vista).toMatchObject({ tono: 'info', titulo: 'Va en el resumen diario', detalle: 'Boleta registrada; se informa a SUNAT en el resumen diario.' });
    expect(vista.siguiente).toContain('ya es válida');
    expect(describirResultadoSunat({ estado: 'pendiente', estado_sunat: 'TICKET_PENDIENTE', ambiente_fiscal: 'produccion' }).titulo).toBe('SUNAT lo está procesando');
    expect(textoAccionSunat('RESUMIR')).toContain('resumen diario');
  });

  it('la factura vencida pide un comprobante nuevo, o recuperar la constancia si SUNAT quizá la recibió', () => {
    expect(textoPlazoVencido('F001', '2026-10-20')).toBe('El plazo de envío venció el 20/10/2026: SUNAT ya no lo recibe. Emita un comprobante nuevo.');
    expect(textoPlazoVencido('f001', '2026-10-20', 'RECUPERAR_CDR')).toContain('Use «Recuperar constancia» para saber si SUNAT lo recibió');
  });

  it('las acciones nuevas de lotes y guías tienen su texto', () => {
    expect(textoAccionSunat('LIBERAR')).toContain('liberar');
    expect(textoAccionSunat('LIBERADO')).toContain('nota de crédito');
    expect(textoAccionSunat('INVENTADA')).toBeNull();
  });
});

describe('documentos-sunat: glosario único (SUNAT-4, S10.2)', () => {
  it('los estados del envío se dicen igual en todas las pantallas', () => {
    const esperado: Record<string, string> = {
      PENDIENTE_REENVIO: 'Por reenviar',
      EXCEPCION: 'Requiere revisión',
      TICKET_PENDIENTE: 'SUNAT lo está procesando',
      POR_RESUMIR: 'Va en el resumen diario',
      BAJA_PENDIENTE: 'Baja en proceso',
    };
    for (const [estado, texto] of Object.entries(esperado)) {
      expect(textoEstadoSunat(estado)).toBe(texto);
      expect(nombreEstadoEnvio(estado)).toBe(texto);
      expect(estadoDeComprobante({ estado: 'pendiente', anulado: false, estado_sunat: estado }).texto).toBe(texto);
    }
    // Un estado que el panel no conoce se muestra tal cual en las listas de envíos y lotes.
    expect(nombreEstadoEnvio('NUEVO_ESTADO')).toBe('NUEVO_ESTADO');
    expect(nombreEstadoEnvio(null)).toBe('');
  });

  it('ningún estado, acción ni archivo habla de CDR o de ticket de SUNAT', () => {
    const textos = [
      ...['NO_ENVIADO', 'POR_RESUMIR', 'ENVIANDO', 'PENDIENTE_REENVIO', 'TICKET_PENDIENTE', 'ACEPTADO', 'ACEPTADO_OBS', 'RECHAZADO', 'EXCEPCION', 'ERROR_CONFIG', 'BAJA_PENDIENTE', 'ANULADO'].map((e) => textoEstadoSunat(e)),
      ...['REINTENTAR', 'CORREGIR_Y_REENVIAR', 'EMITIR_NUEVO', 'RECUPERAR_CDR', 'REVISAR_CONFIG', 'CONSULTAR_TICKET', 'LIBERAR', 'LIBERADO', 'RESUMIR'].map((a) => textoAccionSunat(a) ?? ''),
      NOMBRE_ARCHIVO.cdr_xml,
      NOMBRE_ARCHIVO.cdr_zip,
    ].join(' | ');
    expect(textos).not.toMatch(/\bCDR\b/);
    expect(textos).not.toMatch(/ticket/i);
    expect(textoAccionSunat('RECUPERAR_CDR')).toContain('constancia de SUNAT');
    expect(textoAccionSunat('CONSULTAR_TICKET')).toContain('número de seguimiento');
  });

  it('las bajas (RA) y los resúmenes (RC) se nombran por su día y su número, con el técnico aparte', () => {
    expect(nombreLote('RA-20261105-1')).toEqual({ texto: 'Baja del 05/11 (n.º 1)', tecnico: 'RA-20261105-1' });
    expect(nombreLote('RC-20261105-00002')).toEqual({ texto: 'Resumen del 05/11 (n.º 2)', tecnico: 'RC-20261105-00002' });
    expect(nombreLote('RA-20270101-00012').texto).toBe('Baja del 01/01 (n.º 12)');
  });

  it('un identificador que no tiene el formato RA-/RC- (o no hay) se muestra tal cual, sin romper', () => {
    expect(nombreLote('LOTE-ANTIGUO')).toEqual({ texto: 'LOTE-ANTIGUO', tecnico: 'LOTE-ANTIGUO' });
    expect(nombreLote(null)).toEqual({ texto: '', tecnico: '' });
    expect(nombreLote('RX-20261105-1').texto).toBe('RX-20261105-1');
  });
});
