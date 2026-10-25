import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, NgZone, PLATFORM_ID, inject, signal } from '@angular/core';
import { Observable, Subscription, finalize, map } from 'rxjs';
import { AuthService } from '../../auth/service/auth.service';
import { urlConstants } from '../../constants/urlConstants';
import { peticionSilenciosa } from '../../interceptors/contexto-http';
import { EstadoFiscalApi, EstadoFiscalGlobal } from '../models/fiscal.models';
import { cacheCorto, mensajeDeError, opcionesHttp } from './api-base.service';

/** El servidor cachea el estado 10 s: la cabecera, el panel fiscal y el POS comparten la misma lectura. */
const CACHE_MS = 10_000;
/** Al volver a la pestaña solo se vuelve a pedir si la última lectura tiene más de esto. */
const VIGENCIA_MS = 30_000;
/** Espera antes de reintentar una lectura fallida (mientras tanto el chip queda oculto). */
const REINTENTO_MS = 60_000;

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Resume GET /fiscal/estado; tolera campos ausentes (servidor anterior o lectura parcial). */
export function resumirEstadoFiscal(api: EstadoFiscalApi): EstadoFiscalGlobal {
  const emision = api.emision ?? null;
  const inactiva = emision !== null && !emision.activa;
  return {
    ambiente: api.ambiente === 'produccion' ? 'produccion' : 'beta',
    emision_activa: emision ? emision.activa === true : null,
    codigo: inactiva ? (emision.codigo ?? null) : null,
    motivo: inactiva ? (emision.motivo ?? null) : null,
    bloqueo: api.bloqueo ?? null,
    cola: api.cola ? { pendientes: numero(api.cola.pendientes), inciertos: numero(api.cola.inciertos) } : null,
    plazos: api.plazos ? { vencen_hoy: numero(api.plazos.vencen_hoy), vencidos: numero(api.plazos.vencidos) } : null,
    certificado: {
      cargado: api.certificado?.cargado === true,
      dias_para_vencer: api.certificado?.dias_para_vencer ?? null,
      vencido: api.certificado?.vencido === true,
      autofirmado: api.certificado?.autofirmado ?? null,
    },
    tareas: api.tareas ?? null,
    semaforo: api.semaforo ?? 'amarillo',
    evaluado_en: api.evaluado_en ?? '',
  };
}

/**
 * Estado global de la facturación electrónica (GET /fiscal/estado) para la cabecera, el panel fiscal y
 * el POS. Una sola lectura compartida con caché corta; se renueva al volver a la pestaña y cuando el
 * panel lo pide tras una acción. Si la lectura falla, `estado` queda en null (quien lo muestra se oculta)
 * y se reintenta sola cada minuto. Sin sesión no hace ninguna petición.
 */
@Injectable({ providedIn: 'root' })
export class FiscalEstadoService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly zona = inject(NgZone);
  private readonly documento = inject(DOCUMENT);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly estadoActual = signal<EstadoFiscalGlobal | null>(null);
  private readonly errorActual = signal<string | null>(null);
  private readonly cargandoActual = signal(false);

  /** Último estado leído; null mientras no se haya leído, si la última lectura falló o sin sesión. */
  readonly estado = this.estadoActual.asReadonly();
  /** Mensaje (en español) del último fallo de lectura; null si la última lectura fue correcta. */
  readonly error = this.errorActual.asReadonly();
  readonly cargando = this.cargandoActual.asReadonly();

  private compartido = cacheCorto<EstadoFiscalApi>(CACHE_MS);
  private lectura: Subscription | null = null;
  private reintento: ReturnType<typeof setTimeout> | null = null;
  private leidoEn = 0;
  private siguiendo = false;
  private readonly alCambiarVisibilidad = () => {
    if (this.documento.visibilityState !== 'visible') return;
    if (this.errorActual() || Date.now() - this.leidoEn > VIGENCIA_MS) this.zona.run(() => this.refrescar());
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detener());
  }

  /**
   * Empieza a seguir el estado (idempotente): lo lee si no hay uno vigente, lo renueva al volver a la
   * pestaña y reintenta cada minuto mientras falle.
   */
  iniciar(): void {
    if (!this.navegador) return;
    if (!this.siguiendo) {
      this.siguiendo = true;
      this.zona.runOutsideAngular(() =>
        this.documento.addEventListener('visibilitychange', this.alCambiarVisibilidad),
      );
    }
    if (!this.estadoActual() || Date.now() - this.leidoEn > VIGENCIA_MS) this.refrescar();
  }

  /** Lee el estado ahora. `forzar` ignora la caché y la lectura en curso (después de una acción del panel). */
  refrescar(forzar = false): void {
    if (!this.navegador) return;
    if (!this.auth.isLoggedIn()) {
      this.olvidar();
      return;
    }
    if (this.lectura && !this.lectura.closed) {
      if (!forzar) return;
      this.lectura.unsubscribe();
    }
    if (forzar) this.compartido = cacheCorto<EstadoFiscalApi>(CACHE_MS);
    this.cancelarReintento();
    this.cargandoActual.set(true);
    this.lectura = this.compartido(() => this.pedir())
      .pipe(
        map(resumirEstadoFiscal),
        finalize(() => this.cargandoActual.set(false)),
      )
      .subscribe({
        next: (estado) => {
          this.estadoActual.set(estado);
          this.errorActual.set(null);
          this.leidoEn = Date.now();
        },
        error: (e) => {
          this.estadoActual.set(null);
          this.errorActual.set(
            mensajeDeError(e, 'No se pudo consultar el estado de la facturación electrónica'),
          );
          // 401/403 no se arreglan reintentando: la sesión venció o el rol no puede verlo.
          if (e?.status !== 401 && e?.status !== 403) this.programarReintento();
        },
      });
  }

  /** Deja de seguir y olvida el estado (al cerrar sesión). */
  detener(): void {
    if (this.siguiendo && this.navegador) {
      this.documento.removeEventListener('visibilitychange', this.alCambiarVisibilidad);
    }
    this.siguiendo = false;
    this.olvidar();
  }

  private pedir(): Observable<EstadoFiscalApi> {
    // Lectura de fondo: sin avisos globales ni reintentos del interceptor (el error se muestra donde se usa).
    return this.http.get<EstadoFiscalApi>(urlConstants.fiscal.estado, {
      ...opcionesHttp(),
      context: peticionSilenciosa(),
    });
  }

  private olvidar(): void {
    this.cancelarReintento();
    this.lectura?.unsubscribe();
    this.lectura = null;
    this.compartido = cacheCorto<EstadoFiscalApi>(CACHE_MS);
    this.leidoEn = 0;
    this.estadoActual.set(null);
    this.errorActual.set(null);
  }

  private programarReintento(): void {
    if (!this.siguiendo || this.reintento) return;
    this.zona.runOutsideAngular(() => {
      this.reintento = setTimeout(() => {
        this.reintento = null;
        this.zona.run(() => this.refrescar());
      }, REINTENTO_MS);
    });
  }

  private cancelarReintento(): void {
    if (this.reintento) clearTimeout(this.reintento);
    this.reintento = null;
  }
}
