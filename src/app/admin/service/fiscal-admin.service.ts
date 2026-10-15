import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { urlConstants } from '../../constants/urlConstants';
import {
  AmbienteFiscal,
  AuditoriaFiscal,
  CertificadoFiscal,
  ConfigGre,
  ConfiguracionSunat,
  EmisorSunat,
  EmisorBeta,
  EnvioBeta,
  TipoArchivoBeta,
  OperacionFiscal,
  ResultadoPruebaFiscal,
} from '../models/fiscal.models';
import { opcionesHttp } from './api-base.service';

@Injectable({ providedIn: 'root' })
export class FiscalAdminService {
  constructor(private readonly http: HttpClient) {}

  configuracion() {
    return this.http.get<ConfiguracionSunat>(urlConstants.fiscal.configuracion, opcionesHttp());
  }

  guardar(body: Partial<OperacionFiscal> & { emisor?: EmisorSunat; gre?: ConfigGre }) {
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

  emisorBeta() {
    return this.http.get<{ emisor: EmisorBeta; ruc_certificado_beta: string | null }>(
      urlConstants.fiscal.emisorBeta,
      opcionesHttp(),
    );
  }

  guardarEmisorBeta(emisor: EmisorBeta) {
    return this.http.put(urlConstants.fiscal.emisorBeta, emisor, opcionesHttp());
  }

  enviosBeta() {
    return this.http.get<{ items: EnvioBeta[] }>(urlConstants.fiscal.enviosBeta, opcionesHttp());
  }

  archivoBeta(id: number, tipo: TipoArchivoBeta) {
    return this.http.get(urlConstants.fiscal.archivoBeta(id, tipo), {
      ...opcionesHttp(),
      responseType: 'blob',
    });
  }

  reintentarBeta(id: number) {
    return this.http.post<{ aceptado: boolean; mensaje: string }>(
      urlConstants.fiscal.reintentarBeta(id),
      {},
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
