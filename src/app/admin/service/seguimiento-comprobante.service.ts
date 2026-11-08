import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { urlConstants } from '../../constants/urlConstants';
import { peticionSilenciosa } from '../../interceptors/contexto-http';
import { NotificationService } from '../../shared/services/notification.service';
import { opcionesHttp } from './api-base.service';
import { EventosPanelService } from './eventos-panel.service';

/** A los cuántos segundos de empezar el seguimiento se le pregunta a SUNAT (vía el servidor) por el comprobante. */
export const MOMENTOS_SEGUIMIENTO_S: readonly number[] = [2, 4, 7, 10, 15, 20, 30, 45];
/** Cuántos comprobantes se siguen a la vez; los demás esperan su turno. */
export const MAXIMO_SEGUIMIENTOS = 5;

const RUTA_DOCUMENTOS = '/dashboard/mantenimiento/doc';

/** Lo que de `GET comprobante/:id` interesa para saber si SUNAT ya contestó. */
interface EstadoComprobanteSeguido {
  id_comprobante?: number;
  numero_formateado?: string;
  estado?: string;
  estado_sunat?: string | null;
  aceptada_sunat?: boolean;
  sunat_description?: string | null;
  por_resumen?: boolean;
  anulado?: boolean;
}

interface Seguimiento {
  id: number;
  numero: string;
  /** Instante (ms) en que empezó a seguirse. */
  inicio: number;
  /** Posición en `MOMENTOS_SEGUIMIENTO_S` de la próxima consulta. */
  indice: number;
  consultando: boolean;
  /** Última combinación estado/estado SUNAT/aceptada vista (null hasta la primera respuesta). */
  clave: string | null;
  lectura: Subscription | null;
}

/**
 * Sigue un comprobante cuyo envío a SUNAT va en segundo plano (venta cobrada en diferido, nota pendiente…)
 * hasta que SUNAT contesta, y avisa: «F001-45 aceptada por SUNAT» o el motivo si la rechazó. Así el cajero
 * no tiene que abrir Documentos para enterarse.
 *
 * Vive en la raíz: sobrevive a cambiar de pantalla. Un solo temporizador para todos, ids sin repetir, como
 * máximo 5 a la vez y como mucho 8 consultas silenciosas por comprobante (2, 4, 7, 10, 15, 20, 30 y 45 s).
 * En cada cambio avisa al panel con `'comprobante-actualizado'` para que Documentos, la campana y el Inicio
 * se pongan al día.
 */
@Injectable({ providedIn: 'root' })
export class SeguimientoComprobanteService {
  private readonly http = inject(HttpClient);
  private readonly avisos = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly eventos = inject(EventosPanelService);

  private readonly activos = new Map<number, Seguimiento>();
  private readonly cola: { id: number; numero: string }[] = [];
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  /** Cuántos comprobantes se están siguiendo ahora (sin contar los que esperan turno). */
  get enCurso(): number {
    return this.activos.size;
  }

  /** Empieza a seguir un comprobante. Si ya se sigue (o espera turno), no hace nada. */
  seguir(id: number, numero: string): void {
    if (!Number.isSafeInteger(id) || id <= 0) return;
    if (this.activos.has(id) || this.cola.some((c) => c.id === id)) return;
    if (this.activos.size >= MAXIMO_SEGUIMIENTOS) {
      this.cola.push({ id, numero });
      return;
    }
    this.activar(id, numero);
  }

  /** Deja de seguir todo (al salir del panel). */
  detener(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    for (const s of this.activos.values()) s.lectura?.unsubscribe();
    this.activos.clear();
    this.cola.length = 0;
  }

  private activar(id: number, numero: string): void {
    this.activos.set(id, { id, numero, inicio: Date.now(), indice: 0, consultando: false, clave: null, lectura: null });
    this.programar();
  }

  private momento(s: Seguimiento): number {
    return s.inicio + MOMENTOS_SEGUIMIENTO_S[s.indice] * 1000;
  }

  /** Un solo temporizador: despierta en la próxima consulta pendiente de cualquiera. */
  private programar(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    let proximo = Infinity;
    for (const s of this.activos.values()) if (!s.consultando) proximo = Math.min(proximo, this.momento(s));
    if (proximo === Infinity) return;
    this.temporizador = setTimeout(() => this.despertar(), Math.max(0, proximo - Date.now()));
  }

  private despertar(): void {
    this.temporizador = null;
    const ahora = Date.now();
    for (const s of [...this.activos.values()]) {
      if (!s.consultando && this.momento(s) <= ahora) this.consultar(s);
    }
    this.programar();
  }

  private consultar(s: Seguimiento): void {
    s.consultando = true;
    s.lectura = this.http
      .get<EstadoComprobanteSeguido>(urlConstants.comprobante.byId(s.id), { ...opcionesHttp(), context: peticionSilenciosa() })
      .subscribe({
        next: (c) => this.alResponder(s, c),
        // Un tropiezo de red no corta el seguimiento: se vuelve a preguntar en el siguiente momento.
        error: () => this.alResponder(s, null),
      });
  }

  private alResponder(s: Seguimiento, c: EstadoComprobanteSeguido | null): void {
    s.consultando = false;
    s.lectura = null;
    if (this.activos.get(s.id) !== s) return;
    if (c && this.esFinal(s, c)) {
      this.terminar(s);
      return;
    }
    s.indice += 1;
    if (s.indice >= MOMENTOS_SEGUIMIENTO_S.length) {
      this.avisos.info(`${s.numero} sigue en proceso`, {
        mensaje: 'El sistema lo reintenta solo. Revíselo en Documentos si pasa de unos minutos.',
        clave: `seguimiento-${s.id}`,
        accion: this.accionVer(s.id),
      });
      this.terminar(s);
      return;
    }
    this.programar();
  }

  /** ¿SUNAT ya contestó (o no hay nada más que esperar)? Avisa y publica el cambio. */
  private esFinal(s: Seguimiento, c: EstadoComprobanteSeguido): boolean {
    const clave = `${c.estado}|${c.estado_sunat ?? ''}|${c.aceptada_sunat ? 1 : 0}`;
    const cambio = s.clave !== null && s.clave !== clave;
    s.clave = clave;
    const numero = s.numero || c.numero_formateado || `#${s.id}`;

    if (c.aceptada_sunat === true) {
      this.avisos.exito(`${numero} aceptada por SUNAT`, { duracion: 3500, clave: `seguimiento-${s.id}` });
      this.publicar(s, c);
      return true;
    }
    if (c.estado === 'error') {
      this.avisos.advertencia(`${numero}: SUNAT no la aceptó`, {
        mensaje: c.sunat_description || 'Revise el motivo en Documentos y reintente el envío.',
        clave: `seguimiento-${s.id}`,
        accion: this.accionVer(s.id),
      });
      this.publicar(s, c);
      return true;
    }
    if (c.por_resumen === true || c.anulado === true || c.estado === 'anulado') {
      // Va en el resumen diario (ya se explicó al cobrar) o quedó anulado: no hay más que esperar.
      if (cambio) this.publicar(s, c);
      return true;
    }
    if (cambio) this.publicar(s, c);
    return false;
  }

  private publicar(s: Seguimiento, c: EstadoComprobanteSeguido): void {
    this.eventos.emitir({
      tipo: 'comprobante-actualizado',
      datos: {
        id_comprobante: s.id,
        estado: c.estado,
        estado_sunat: c.estado_sunat,
        aceptada_sunat: c.aceptada_sunat,
        sunat_description: c.sunat_description,
      },
    });
  }

  private accionVer(id: number) {
    return {
      etiqueta: 'Ver en Documentos',
      icono: 'bi-file-earmark-text',
      alHacer: () => this.router.navigate([RUTA_DOCUMENTOS], { queryParams: { comprobante: id } }),
    };
  }

  /** Libera su lugar y deja pasar al siguiente de la cola. */
  private terminar(s: Seguimiento): void {
    this.activos.delete(s.id);
    const siguiente = this.cola.shift();
    if (siguiente) this.activar(siguiente.id, siguiente.numero);
    else this.programar();
  }
}
