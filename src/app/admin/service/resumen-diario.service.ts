import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { opcionesHttp } from './api-base.service';

/** Configuración del resumen diario por correo (`reportes/resumen-diario/configuracion`, solo administrador). */
export interface ConfigResumenDiario {
  activo: boolean;
  /** 'HH:MM' en hora de Lima. */
  hora: string;
  /** Correos escritos por la persona. */
  correos: string[];
  /** A quién llega de verdad: los escritos o, si no hay, el correo del emisor. */
  destinatarios: string[];
  /** AAAA-MM-DD del último envío automático correcto. */
  ultimo_envio: string | null;
  /** brevo, resend o archivo (con «archivo» el correo no sale a ninguna bandeja). */
  proveedor: string;
}

export interface ResultadoEnvioResumen {
  enviados: string[];
  fallidos: Array<{ correo: string; motivo: string }>;
  asunto: string;
  proveedor: string;
}

const RAIZ = urlConstants.reportes.ventas.replace(/ventas$/, '') + 'resumen-diario';

@Injectable({ providedIn: 'root' })
export class ResumenDiarioService {
  constructor(private http: HttpClient) {}

  configuracion(): Observable<ConfigResumenDiario> {
    return this.http.get<ConfigResumenDiario>(`${RAIZ}/configuracion`, opcionesHttp());
  }

  guardar(cambios: Partial<Pick<ConfigResumenDiario, 'activo' | 'hora' | 'correos'>>): Observable<ConfigResumenDiario> {
    return this.http.put<ConfigResumenDiario>(`${RAIZ}/configuracion`, cambios, opcionesHttp());
  }

  /** Arma el resumen de hoy y lo envía ya (prueba); no marca el día como enviado. */
  enviarAhora(): Observable<ResultadoEnvioResumen> {
    return this.http.post<ResultadoEnvioResumen>(`${RAIZ}/enviar-ahora`, {}, opcionesHttp());
  }
}
