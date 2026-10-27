import {
  archivosDescargables,
  chipAmbiente,
  describirResultadoSunat,
  estadoDeComprobante,
  fechaYmdLegible,
  nombreDescarga,
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
  });
});
