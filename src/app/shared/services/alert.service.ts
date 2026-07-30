import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

export interface AlertConfig {
  title?: string;
  message?: string;
  type?: 'success' | 'error' | 'warning' | 'info' | 'question';
  confirmText?: string;
  cancelText?: string;
  allowOutsideClick?: boolean;
  allowEscapeKey?: boolean;
  timer?: number;
  /**
   * Si true, `message` se interpreta como HTML (Fase 8).
   * Por defecto se escapa para evitar XSS con mensajes de API / datos de usuario.
   */
  allowHtml?: boolean;
}

/** Escapa texto para uso seguro en HTML (Alert2 / Swal). */
export function escapeHtml(texto: string): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable({
  providedIn: 'root'
})
export class AlertService {

  constructor() {
    this.configureTheme();
  }

  private configureTheme() {
    const style = document.createElement('style');
    style.innerHTML = `
      .swal2-popup {
        border-radius: 16px !important;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15) !important;
        backdrop-filter: blur(10px);
      }
      .swal2-title {
        font-size: 1.5rem !important;
        font-weight: 600 !important;
        color: #1a1a1a !important;
      }
      .swal2-html-container {
        font-size: 1rem !important;
        color: #666 !important;
      }
      .swal2-confirm {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        border-radius: 10px !important;
        font-weight: 600 !important;
        box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4) !important;
      }
      .swal2-confirm:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 12px 32px rgba(102, 126, 234, 0.6) !important;
      }
      .swal2-cancel {
        background: #f0f0f0 !important;
        color: #333 !important;
        border-radius: 10px !important;
        font-weight: 600 !important;
      }
      .swal2-cancel:hover {
        background: #e0e0e0 !important;
      }
    `;
    document.head.appendChild(style);
  }

  /** Cuerpo del diálogo: HTML confiable o texto escapado. */
  private cuerpoMensaje(config: AlertConfig): { html?: string; text?: string } {
    const msg = config.message ?? '';
    if (!msg) return {};
    if (config.allowHtml) return { html: msg };
    return { text: msg };
  }

  success(config: AlertConfig = {}) {
    return Swal.fire({
      icon: 'success',
      title: config.title || 'Éxito',
      ...this.cuerpoMensaje(config),
      confirmButtonText: config.confirmText || 'Aceptar',
      allowOutsideClick: config.allowOutsideClick ?? false,
      allowEscapeKey: config.allowEscapeKey ?? true,
      timer: config.timer || undefined,
      timerProgressBar: true,
    });
  }

  error(config: AlertConfig = {}) {
    return Swal.fire({
      icon: 'error',
      title: config.title || 'Error',
      ...this.cuerpoMensaje(config),
      confirmButtonText: config.confirmText || 'Aceptar',
      allowOutsideClick: config.allowOutsideClick ?? false,
      allowEscapeKey: config.allowEscapeKey ?? true,
    });
  }

  warning(config: AlertConfig = {}) {
    return Swal.fire({
      icon: 'warning',
      title: config.title || 'Advertencia',
      ...this.cuerpoMensaje(config),
      confirmButtonText: config.confirmText || 'Aceptar',
      allowOutsideClick: config.allowOutsideClick ?? false,
      allowEscapeKey: config.allowEscapeKey ?? true,
    });
  }

  info(config: AlertConfig = {}) {
    return Swal.fire({
      icon: 'info',
      title: config.title || 'Información',
      ...this.cuerpoMensaje(config),
      confirmButtonText: config.confirmText || 'Aceptar',
      allowOutsideClick: config.allowOutsideClick ?? false,
      allowEscapeKey: config.allowEscapeKey ?? true,
      timer: config.timer || undefined,
      timerProgressBar: true,
    });
  }

  confirm(config: AlertConfig = {}) {
    return Swal.fire({
      icon: 'question',
      title: config.title || '¿Confirmar?',
      ...this.cuerpoMensaje(config),
      showCancelButton: true,
      confirmButtonText: config.confirmText || 'Sí, confirmar',
      cancelButtonText: config.cancelText || 'Cancelar',
      allowOutsideClick: config.allowOutsideClick ?? false,
      allowEscapeKey: config.allowEscapeKey ?? true,
    });
  }

  toast(config: AlertConfig = {}, position: 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' = 'top-end') {
    return Swal.fire({
      icon: config.type || 'info',
      title: config.title,
      ...this.cuerpoMensaje(config),
      toast: true,
      position,
      showConfirmButton: false,
      timer: config.timer || 3000,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
      }
    });
  }

  loading(title: string = 'Cargando...') {
    return Swal.fire({
      title,
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
  }

  close() {
    Swal.close();
  }
}
