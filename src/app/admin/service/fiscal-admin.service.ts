import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { urlConstants } from '../../constants/urlConstants';
import { conTiempoLimite } from '../../interceptors/contexto-http';
import {
  AlertasFiscalesApi,
  AmbienteFiscal,
  AuditoriaFiscal,
  CambiosConfiguracionFiscal,
  CertificadoFiscal,
  ConfiguracionSunat,
  EmisorBeta,
  EstadoFiscalApi,
  ResultadoRecifrado,
  EstadoPosBetaFiscal,
  FiltroEnvios,
  FiltroLotes,
  LoteSunat,
  PaginaLotes,
  ResultadoLote,
  ResultadoResumen,
  TipoArchivoLote,
  PaginaEnvios,
  ResultadoEnvio,
  ResultadoPruebaCredenciales,
  ResultadoPruebaFiscal,
  ResultadoReanudacion,
  TipoArchivoEnvio,
  TipoCpePrueba,
} from '../models/fiscal.models';
import { opcionesHttp } from './api-base.service';

@Injectable({ providedIn: 'root' })
export class FiscalAdminService {
  constructor(private readonly http: HttpClient) {}

  configuracion() {
    return this.http.get<ConfiguracionSunat>(urlConstants.fiscal.configuracion, opcionesHttp());
  }

  /** Semáforo completo del servidor (incluye la llave de seguridad). */
  estadoCompleto() {
    return this.http.get<EstadoFiscalApi>(urlConstants.fiscal.estado, opcionesHttp());
  }

  /** Correo de los avisos diarios. La URL se arma desde la del estado: `urlConstants` no se toca en esta tanda. */
  alertas() {
    return this.http.get<AlertasFiscalesApi>(this.urlFiscal('alertas'), opcionesHttp());
  }

  guardarAlertas(correo: string) {
    return this.http.put<AlertasFiscalesApi>(this.urlFiscal('alertas'), { correo }, opcionesHttp());
  }

  /** Vuelve a cifrar con la llave vigente la clave SOL, las credenciales de la guía y los certificados (solo admin). */
  recifrarSecretos() {
    return this.http.post<ResultadoRecifrado>(this.urlFiscal('secretos/recifrar'), {}, opcionesHttp());
  }

  private urlFiscal(ruta: string): string {
    return urlConstants.fiscal.estado.replace(/estado$/, ruta);
  }

  guardar(body: CambiosConfiguracionFiscal) {
    return this.http.put<ConfiguracionSunat>(
      urlConstants.fiscal.configuracion,
      body,
      opcionesHttp(),
    );
  }

  subirCertificado(archivo: File, clave: string, ambiente: AmbienteFiscal, otroEmisorBeta = false) {
    const body = new FormData();
    body.append('archivo', archivo);
    body.append('clave', clave);
    body.append('ambiente', ambiente);
    if (ambiente === 'beta' && otroEmisorBeta) body.append('forzar', 'true');
    return this.http.post<CertificadoFiscal>(urlConstants.fiscal.certificado, body, opcionesHttp());
  }

  eliminarCertificado(ambiente: AmbienteFiscal) {
    return this.http.delete(urlConstants.fiscal.certificado, {
      ...opcionesHttp(),
      params: { ambiente },
    });
  }

  certificadoPublico(ambiente: AmbienteFiscal) {
    return this.http.get(urlConstants.fiscal.certificadoPublico, {
      ...opcionesHttp(),
      params: { ambiente, formato: 'cer' },
      responseType: 'blob',
    });
  }

  generarAutofirmado() {
    return this.http.post<CertificadoFiscal>(
      urlConstants.fiscal.certificadoAutofirmado,
      {},
      opcionesHttp(),
    );
  }

  guardarSol(usuario: string, clave: string) {
    return this.http.post(
      urlConstants.fiscal.sol,
      { usuario, ...(clave ? { clave } : {}) },
      opcionesHttp(),
    );
  }

  guardarGre(clientId: string, clientSecret: string) {
    return this.http.post(
      urlConstants.fiscal.gre,
      { client_id: clientId, client_secret: clientSecret },
      opcionesHttp(),
    );
  }

  eliminarCredenciales(tipo: 'sol' | 'gre') {
    return this.http.delete(urlConstants.fiscal[tipo], opcionesHttp());
  }

  /** Con `'todos'` el servidor manda 4 documentos en serie (hasta 4 × 30 s): el límite de espera sube a 150 s. */
  probar(ambiente: AmbienteFiscal, documento: 'cpe' | 'gre', tipoCpe?: TipoCpePrueba) {
    return this.http.post<ResultadoPruebaFiscal>(
      urlConstants.fiscal.probarConexion,
      {
        ambiente,
        documento,
        ...(ambiente === 'beta' && documento === 'cpe' && tipoCpe ? { tipo_cpe: tipoCpe } : {}),
      },
      {
        ...opcionesHttp(),
        ...(ambiente === 'beta' && documento === 'cpe' && tipoCpe === 'todos' ? { context: conTiempoLimite(150_000) } : {}),
      },
    );
  }

  /** Consulta el estado del usuario SOL de producción sin emitir ni numerar nada (D1.4). */
  probarCredencialesProduccion() {
    return this.http.post<ResultadoPruebaCredenciales>(
      urlConstants.fiscal.probarCredencialesProduccion,
      {},
      opcionesHttp(),
    );
  }

  /** Limpia el interruptor de emisión del ambiente vigente (tras corregir la causa que indicó SUNAT). */
  reanudarEmision() {
    return this.http.post<ResultadoReanudacion>(
      urlConstants.fiscal.reanudarEmision,
      {},
      opcionesHttp(),
    );
  }

  emisorBeta() {
    return this.http.get<{ emisor: EmisorBeta; ruc_certificado_beta: string | null }>(
      urlConstants.fiscal.emisorBeta,
      opcionesHttp(),
    );
  }

  guardarEmisorBeta(emisor: EmisorBeta) {
    return this.http.put(urlConstants.fiscal.emisorBeta, emisor, opcionesHttp());
  }

  estadoPosBeta() {
    return this.http.get<EstadoPosBetaFiscal>(urlConstants.fiscal.posBeta, opcionesHttp());
  }

  cambiarEstadoPosBeta(activo: boolean) {
    return this.http.put<EstadoPosBetaFiscal>(
      urlConstants.fiscal.posBeta,
      { activo },
      opcionesHttp(),
    );
  }

  /** Envíos de factura, boleta y notas (BETA y producción); los filtros vacíos no se mandan. */
  envios(filtro: FiltroEnvios) {
    const params: Record<string, string | number> = {};
    for (const [clave, valor] of Object.entries(filtro)) {
      if (valor !== undefined && valor !== null && valor !== '') params[clave] = valor;
    }
    return this.http.get<PaginaEnvios>(urlConstants.fiscal.envios, { ...opcionesHttp(), params });
  }

  archivoEnvio(id: number, tipo: TipoArchivoEnvio) {
    return this.http.get(urlConstants.fiscal.archivoEnvio(id, tipo), {
      ...opcionesHttp(),
      responseType: 'blob',
    });
  }

  /**
   * Reenvío seguro del MISMO ZIP (en facturas de producción consulta antes si SUNAT ya lo tiene). Con `forzar`
   * («Reintentar ahora», solo administrador) también reintenta un envío que quedó en «Requiere revisión».
   */
  reintentarEnvio(id: number, forzar = false) {
    return this.http.post<ResultadoEnvio>(
      urlConstants.fiscal.reintentarEnvio(id),
      forzar ? { forzar: true } : {},
      opcionesHttp(),
    );
  }

  /** getStatusCdr: solo producción y facturas o sus notas (series F); no reenvía nada. */
  recuperarCdr(id: number) {
    return this.http.post<ResultadoEnvio>(urlConstants.fiscal.recuperarCdr(id), {}, opcionesHttp());
  }

  /** Marca como aceptado un envío incierto que el administrador verificó en SOL (queda auditado con la nota). */
  confirmarAceptado(id: number, nota: string) {
    return this.http.post<ResultadoEnvio>(
      urlConstants.fiscal.confirmarAceptado(id),
      { nota },
      opcionesHttp(),
    );
  }

  /** Bajas (RA) y resúmenes (RC) de anulación enviados a SUNAT; los filtros vacíos no se mandan. */
  lotes(filtro: FiltroLotes) {
    const params: Record<string, string | number> = {};
    for (const [clave, valor] of Object.entries(filtro)) {
      if (valor !== undefined && valor !== null && valor !== '') params[clave] = valor;
    }
    return this.http.get<PaginaLotes>(urlConstants.fiscal.lotes, { ...opcionesHttp(), params });
  }

  lote(id: number) {
    return this.http.get<LoteSunat>(urlConstants.fiscal.lote(id), opcionesHttp());
  }

  archivoLote(id: number, tipo: TipoArchivoLote) {
    return this.http.get(urlConstants.fiscal.archivoLote(id, tipo), {
      ...opcionesHttp(),
      responseType: 'blob',
    });
  }

  /** Reenvía el lote o consulta su ticket, según su estado. */
  reintentarLote(id: number) {
    return this.http.post<ResultadoLote>(urlConstants.fiscal.reintentarLote(id), {}, opcionesHttp());
  }

  /**
   * «Liberar» (solo administrador): suelta un lote cuyo ticket SUNAT no resolvió en 7 días; sus comprobantes
   * vuelven a su estado anterior. Queda en la bitácora con el usuario.
   */
  liberarLote(id: number) {
    return this.http.post<ResultadoLote>(`${urlConstants.fiscal.lotes}/${id}/liberar`, {}, opcionesHttp());
  }

  /**
   * «Enviar resumen del día» (solo administrador): informa a SUNAT, en un resumen diario, las boletas de una fecha de
   * emisión que esperan su resumen (sin fecha, las de hoy). Queda en la bitácora con el usuario.
   */
  enviarResumenDiario(fecha?: string) {
    return this.http.post<ResultadoResumen>(`${urlConstants.fiscal.lotes}/resumen`, fecha ? { fecha } : {}, opcionesHttp());
  }

  auditoria(antesDe?: number) {
    return this.http.get<{ registros: AuditoriaFiscal[]; siguiente: number | null }>(
      urlConstants.fiscal.auditoria,
      {
        ...opcionesHttp(),
        params: { limite: 20, ...(antesDe ? { antes_de: antesDe } : {}) },
      },
    );
  }
}
