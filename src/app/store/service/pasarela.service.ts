import { Injectable } from '@angular/core';
import { EMPRESA_TIENDA } from '../config/empresa-tienda.config';
import { ConfiguracionPasarela } from '../models/tienda.models';

declare const window: any;

/**
 * Puente con el SDK de la pasarela en el navegador.
 *
 * El backend dice qué proveedor está activo y con qué llave pública; aquí solo
 * se carga su script y se pide el token de la tarjeta. Cambiar de proveedor no
 * requiere tocar los componentes: basta con las variables de entorno del
 * backend y, si hiciera falta, agregar el caso en `cargarSdk`.
 *
 * La tarjeta nunca pasa por nuestro servidor: el SDK la envía directo a la
 * pasarela y nos devuelve un token de un solo uso.
 */
@Injectable({ providedIn: 'root' })
export class PasarelaService {

  private cargando?: Promise<boolean>;

  /** Descarga el SDK del proveedor la primera vez que se necesita. */
  async preparar(config: ConfiguracionPasarela): Promise<boolean> {
    if (!config.requiere_token || !config.llave_publica) return false;
    if (!this.cargando) this.cargando = this.cargarSdk(config);
    return this.cargando;
  }

  /**
   * Abre el formulario de la pasarela y devuelve el token de la tarjeta.
   * Devuelve null si el cliente cierra la ventana o el SDK no está disponible.
   */
  async pedirToken(config: ConfiguracionPasarela, monto: number, descripcion: string): Promise<string | null> {
    const listo = await this.preparar(config);
    if (!listo) return null;

    if (config.proveedor === 'culqi') return this.tokenCulqi(monto, descripcion);
    return null;
  }

  // ------------------------------------------------------------------ Culqi

  private cargarSdk(config: ConfiguracionPasarela): Promise<boolean> {
    if (config.proveedor !== 'culqi') return Promise.resolve(false);

    return new Promise((resolver) => {
      if (window.Culqi) {
        window.Culqi.publicKey = config.llave_publica;
        resolver(true);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://checkout.culqi.com/js/v4';
      script.async = true;
      script.onload = () => {
        window.Culqi.publicKey = config.llave_publica;
        resolver(true);
      };
      script.onerror = () => resolver(false);
      document.head.appendChild(script);
    });
  }

  private tokenCulqi(monto: number, descripcion: string): Promise<string | null> {
    return new Promise((resolver) => {
      const culqi = window.Culqi;
      if (!culqi) {
        resolver(null);
        return;
      }

      culqi.settings({
        title: EMPRESA_TIENDA.nombreCorto,
        currency: 'PEN',
        amount: Math.round(monto * 100),
        description: descripcion,
      });

      // Culqi avisa por esta función global cuando termina el formulario.
      window.culqi = () => {
        if (culqi.token?.id) {
          const token = culqi.token.id;
          culqi.close();
          resolver(token);
        } else if (culqi.order?.id) {
          culqi.close();
          resolver(culqi.order.id);
        } else {
          resolver(null);
        }
      };

      culqi.open();
    });
  }
}
