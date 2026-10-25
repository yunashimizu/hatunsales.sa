import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { urlConstants } from '../../constants/urlConstants';
import {
  AmbienteFiscal,
  AuditoriaFiscal,
  CambiosConfiguracionFiscal,
  CertificadoFiscal,
  ConfiguracionSunat,
  EmisorBeta,
  EstadoPosBetaFiscal,
  FiltroEnvios,
  PaginaEnvios,
  ResultadoEnvio,
  ResultadoPruebaCredenciales,
  ResultadoPruebaFiscal,
  ResultadoReanudacion,
  TipoArchivoEnvio,
} from '../models/fiscal.models';
import { opcionesHttp } from './api-base.service';

@Injectable({ providedIn: 'root' })
export class FiscalAdminService {
  constructor(private readonly http: HttpClient) {}

  configuracion() {
    return this.http.get<ConfiguracionSunat>(urlConstants.fiscal.configuracion, opcionesHttp());
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

  probar(ambiente: AmbienteFiscal, documento: 'cpe' | 'gre', tipoCpe?: '01' | '03') {
    return this.http.post<ResultadoPruebaFiscal>(
      urlConstants.fiscal.probarConexion,
      {
        ambiente,
        documento,
        ...(ambiente === 'beta' && documento === 'cpe' && tipoCpe ? { tipo_cpe: tipoCpe } : {}),
      },
      opcionesHttp(),
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

  /** Reenvío seguro del MISMO ZIP (en facturas de producción consulta antes si SUNAT ya lo tiene). */
  reintentarEnvio(id: number) {
    return this.http.post<ResultadoEnvio>(
      urlConstants.fiscal.reintentarEnvio(id),
      {},
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
