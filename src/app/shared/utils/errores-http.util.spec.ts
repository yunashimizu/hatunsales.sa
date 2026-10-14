import { HttpErrorResponse } from '@angular/common/http';
import {
  MENSAJE_ARCHIVO_MUY_GRANDE,
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_FUNCION_NO_DISPONIBLE,
  MENSAJE_SERVIDOR_NO_DISPONIBLE,
  MENSAJE_SIN_CONEXION,
  MENSAJE_SIN_PERMISO,
  describirError,
  errorOperativo,
  esCodigoDeDominio,
  esErrorDeRed,
  escapeHtmlAlerta,
  htmlATextoPlano,
  mensajeDeError,
  normalizarCuerpoError,
  normalizarErrorBlob,
  segundosDeEspera,
  yaNotificado,
} from './errores-http.util';

const http = (status: number, error: unknown) => new HttpErrorResponse({ status, error, url: 'https://api/x' });

describe('errores-http.util · normalizarCuerpoError', () => {
  it('une las validaciones de Nest y las traduce', () => {
    const cuerpo = normalizarCuerpoError(400, {
      statusCode: 400,
      message: ['nombre should not be empty', 'precio must be a positive number'],
      error: 'Bad Request',
    });
    expect(cuerpo.message).toBe('El campo «nombre» es obligatorio. El campo «precio» debe ser mayor que cero.');
    expect(cuerpo.mensajes).toHaveLength(2);
    expect(cuerpo.statusCode).toBe(400);
  });

  it('conserva los campos del backend (formato nuevo) y el idPeticion', () => {
    const cuerpo = normalizarCuerpoError(409, {
      statusCode: 409,
      message: 'Ya existe un producto con ese código',
      error: 'Conflict',
      codigo: 'PRODUCTO_DUPLICADO',
      ruta: '/producto',
      idPeticion: 'req-123',
      producto: { id: 5 },
    });
    expect(cuerpo.message).toBe('Ya existe un producto con ese código');
    expect(cuerpo.codigo).toBe('PRODUCTO_DUPLICADO');
    expect(cuerpo.idPeticion).toBe('req-123');
    expect(cuerpo['ruta']).toBe('/producto');
    expect(cuerpo['producto']).toEqual({ id: 5 });
  });

  it('traduce los textos por defecto en inglés', () => {
    expect(normalizarCuerpoError(403, { message: 'Forbidden resource' }).message).toBe(MENSAJE_SIN_PERMISO);
    expect(normalizarCuerpoError(404, { message: 'Cannot GET /reportes/x' }).message).toBe(MENSAJE_FUNCION_NO_DISPONIBLE);
    expect(normalizarCuerpoError(400, { message: 'Bad Request' }).message).toBe(MENSAJE_DATOS_INVALIDOS);
    expect(normalizarCuerpoError(413, { message: 'File too large' }).message).toBe(MENSAJE_ARCHIVO_MUY_GRANDE);
  });

  it('en fallos de transporte reemplaza el HTML o el texto del proxy', () => {
    expect(normalizarCuerpoError(0, null).message).toBe(MENSAJE_SIN_CONEXION);
    expect(normalizarCuerpoError(502, '<html>Bad gateway</html>').message).toBe(MENSAJE_SERVIDOR_NO_DISPONIBLE);
    expect(normalizarCuerpoError(503, { message: 'Application failed to respond' }).codigo).toBe('SERVIDOR_NO_DISPONIBLE');
  });

  it('respeta el mensaje de los códigos de negocio aunque lleguen con 503 o 413', () => {
    const sunat = normalizarCuerpoError(503, {
      statusCode: 503,
      message: 'SUNAT no respondió. El comprobante quedó pendiente de envío.',
      codigo: 'FISCAL_SUNAT_NO_DISPONIBLE',
    });
    expect(sunat.message).toBe('SUNAT no respondió. El comprobante quedó pendiente de envío.');
    expect(sunat.codigo).toBe('FISCAL_SUNAT_NO_DISPONIBLE');

    const certificado = normalizarCuerpoError(413, {
      message: 'El certificado no puede pesar más de 64 KB.',
      codigo: 'FISCAL_CERT_DEMASIADO_GRANDE',
    });
    expect(certificado.message).toBe('El certificado no puede pesar más de 64 KB.');
  });

  it('lee JSON que llegó como texto', () => {
    expect(normalizarCuerpoError(400, '{"message":"Stock insuficiente","codigo":"STOCK_INSUFICIENTE"}').codigo).toBe(
      'STOCK_INSUFICIENTE',
    );
  });
});

describe('errores-http.util · lectura de errores', () => {
  it('mensajeDeError: arreglos unidos, nunca HTML ni "Http failure…"', () => {
    expect(mensajeDeError(http(400, { message: ['a', 'b'] }))).toBe('a. b.');
    expect(mensajeDeError(http(502, '<html><body>502</body></html>'))).toBe(MENSAJE_SERVIDOR_NO_DISPONIBLE);
    expect(mensajeDeError(http(0, new ProgressEvent('error')))).toBe(MENSAJE_SIN_CONEXION);
    expect(mensajeDeError(http(500, { message: 'Internal server error' }), 'No se pudo guardar')).toBe(
      'No se pudo guardar (error interno del servidor)',
    );
    expect(mensajeDeError(new Error('Http failure response for x: 0 Unknown Error'), 'Falló')).toBe('Falló');
    expect(mensajeDeError(null, 'Falló')).toBe('Falló');
  });

  it('esErrorDeRed acepta el error o el status, y descarta los códigos de negocio', () => {
    expect(esErrorDeRed(http(0, null))).toBe(true);
    expect(esErrorDeRed(http(504, null))).toBe(true);
    expect(esErrorDeRed(503)).toBe(true);
    expect(esErrorDeRed(404)).toBe(false);
    expect(esErrorDeRed(http(503, { codigo: 'FISCAL_SUNAT_NO_DISPONIBLE' }))).toBe(false);
    expect(esErrorDeRed(http(400, { codigo: 'TIEMPO_AGOTADO' }))).toBe(true);
    expect(esErrorDeRed(null)).toBe(false);
  });

  it('esCodigoDeDominio distingue los códigos del backend de los del front', () => {
    expect(esCodigoDeDominio('FISCAL_CERT_VENCIDO')).toBe(true);
    expect(esCodigoDeDominio('CAJA_NO_ABIERTA')).toBe(true);
    expect(esCodigoDeDominio('SIN_CONEXION')).toBe(false);
    expect(esCodigoDeDominio('')).toBe(false);
    expect(esCodigoDeDominio(undefined)).toBe(false);
  });

  it('yaNotificado lee la marca del interceptor', () => {
    expect(yaNotificado(http(0, { notificado: true }))).toBe(true);
    expect(yaNotificado(http(0, {}))).toBe(false);
  });

  it('describirError usa el título del código y la pista', () => {
    const d = describirError(
      http(400, { message: 'La contraseña del certificado no es correcta.', codigo: 'FISCAL_CERT_CLAVE_INCORRECTA' }),
      'No se pudo subir el certificado',
    );
    expect(d.titulo).toBe('Contraseña del certificado incorrecta');
    expect(d.mensaje).toBe('La contraseña del certificado no es correcta.');
    expect(d.pista).toContain('no es tu clave SOL');
  });

  it('errorOperativo escapa el mensaje del servidor (se muestra como HTML propio)', () => {
    const op = errorOperativo(http(400, { message: 'El nombre "<img src=x onerror=alert(1)>" ya existe' }), 'No se pudo guardar');
    expect(op.allowHtml).toBe(true);
    expect(op.message).not.toContain('<img');
    expect(op.message).toContain('&lt;img');
  });

  it('un cuerpo que empieza como HTML (página de un proxy) nunca se muestra', () => {
    const op = errorOperativo(http(400, { message: '<img src=x onerror=alert(1)>' }), 'No se pudo guardar');
    expect(op.message).not.toContain('img');
  });

  it('normalizarErrorBlob lee el JSON de un Blob', async () => {
    const blob = new Blob([JSON.stringify({ message: 'No hay PDF' })], { type: 'application/json' });
    const e = await normalizarErrorBlob({ status: 404, error: blob });
    expect(e.error.message).toBe('No hay PDF');
  });

  it('segundosDeEspera entiende segundos y fechas HTTP', () => {
    expect(segundosDeEspera('30')).toBe(30);
    expect(segundosDeEspera(null)).toBeNull();
    expect(segundosDeEspera('mañana')).toBeNull();
    const ahora = Date.parse('2026-10-13T10:00:00Z');
    expect(segundosDeEspera('Tue, 13 Oct 2026 10:00:20 GMT', ahora)).toBe(20);
  });

  it('escapeHtmlAlerta y htmlATextoPlano', () => {
    expect(escapeHtmlAlerta('<b>"x" & \'y\'</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
    expect(htmlATextoPlano('Hola<br>mundo <strong>&amp;</strong>')).toBe('Hola mundo &');
  });
});
