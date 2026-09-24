import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { opcionesHttp } from './api-base.service';

export type SeriesPos = {
  serie_boleta: string;
  serie_factura: string;
  por_tipo: Record<number, string>;
  editable_en_pos: boolean;
  mensaje?: string;
};

export type ConfigFiscal = {
  emisor: {
    ruc: string;
    razon_social: string;
    direccion: string;
    ubicacion: string;
    logo_url: string;
    /** Contacto que se imprime en la proforma (PDF/Excel) y en el mensaje de WhatsApp. */
    telefono?: string;
    email?: string;
    web?: string;
  };
  /** Condiciones comerciales propias que se añaden a la proforma (una por línea). */
  proforma?: { condiciones: string };
  series: { serie_boleta: string; serie_factura: string };
  estados: {
    nubefact_configurado: boolean;
    whatsapp_cloud: boolean;
    caja_modo: string;
  };
};

@Injectable({ providedIn: 'root' })
export class ConfiguracionFiscalService {
  constructor(private readonly http: HttpClient) {}

  seriesPos(): Observable<SeriesPos> {
    return this.http.get<SeriesPos>(urlConstants.configuracion.series, opcionesHttp());
  }

  fiscal(): Observable<ConfigFiscal> {
    return this.http.get<ConfigFiscal>(urlConstants.configuracion.fiscal, opcionesHttp());
  }

  guardarFiscal(body: {
    emisor?: Partial<ConfigFiscal['emisor']>;
    proforma?: { condiciones: string };
    series?: Partial<ConfigFiscal['series']>;
  }): Observable<ConfigFiscal> {
    return this.http.put<ConfigFiscal>(urlConstants.configuracion.fiscal, body, opcionesHttp());
  }
}
