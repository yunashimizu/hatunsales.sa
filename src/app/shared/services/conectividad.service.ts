import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, NgZone, PLATFORM_ID, Signal, inject, signal } from '@angular/core';
import { NotificationService } from './notification.service';

/** Si la red vuelve antes de este margen no se molesta con avisos (wifi que parpadea). */
const ESPERA_ANTES_DE_AVISAR_MS = 1_500;

/**
 * Estado de la conexión del navegador con avisos globales:
 * - sin red → aviso persistente "Sin conexión a internet" (clave 'offline');
 * - al volver → lo cierra, avisa "Conexión restablecida" y ejecuta los
 *   reintentos que las pantallas dejaron pendientes.
 *
 * Expone `enLinea` (signal) para que una pantalla pueda, por ejemplo,
 * deshabilitar "Guardar" sin conexión.
 */
@Injectable({ providedIn: 'root' })
export class ConectividadService {
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly avisos = inject(NotificationService);
  private readonly zona = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _enLinea = signal(true);
  readonly enLinea: Signal<boolean> = this._enLinea.asReadonly();

  private iniciado = false;
  private avisoDesconexion: ReturnType<typeof setTimeout> | null = null;
  private avisoMostrado = false;

  /** Idempotente; no hace nada fuera del navegador. */
  iniciar(): void {
    if (!this.navegador || this.iniciado) return;
    this.iniciado = true;

    const alDesconectar = () => this.zona.run(() => this.desconectado());
    const alConectar = () => this.zona.run(() => this.conectado());
    this.zona.runOutsideAngular(() => {
      window.addEventListener('offline', alDesconectar);
      window.addEventListener('online', alConectar);
    });
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('offline', alDesconectar);
      window.removeEventListener('online', alConectar);
      this.cancelarAvisoPendiente();
    });

    if (navigator.onLine === false) this.desconectado();
  }

  private desconectado(): void {
    this._enLinea.set(false);
    if (this.avisoDesconexion !== null || this.avisoMostrado) return;
    this.avisoDesconexion = this.zona.runOutsideAngular(() =>
      setTimeout(() => this.zona.run(() => this.mostrarSinConexion()), ESPERA_ANTES_DE_AVISAR_MS),
    );
  }

  private mostrarSinConexion(): void {
    this.avisoDesconexion = null;
    if (navigator.onLine !== false) return;
    this.avisoMostrado = true;
    this.avisos.cerrarPorClave('online');
    this.avisos.mostrar({
      clave: 'offline',
      tipo: 'advertencia',
      icono: 'bi-wifi-off',
      titulo: 'Sin conexión a internet',
      mensaje: 'Puedes seguir viendo lo que ya cargó, pero los cambios no se guardarán hasta que vuelva la conexión.',
      duracion: 0,
    });
  }

  private conectado(): void {
    this._enLinea.set(true);
    this.cancelarAvisoPendiente();
    if (!this.avisoMostrado) return;
    this.avisoMostrado = false;
    this.avisos.cerrarPorClave('offline');
    this.avisos.exito('Conexión restablecida', { clave: 'online', icono: 'bi-wifi', duracion: 2500 });
    // Las listas que fallaron mientras no había red se recargan solas.
    this.avisos.reintentarPendientes('offline');
    this.avisos.reintentarPendientes('conexion');
    this.avisos.cerrarPorClave('conexion');
  }

  private cancelarAvisoPendiente(): void {
    if (this.avisoDesconexion !== null) clearTimeout(this.avisoDesconexion);
    this.avisoDesconexion = null;
  }
}
