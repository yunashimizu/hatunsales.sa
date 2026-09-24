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

  /** Tema alineado con la paleta del panel (indigo, sin gradientes). Se inyecta una sola vez y solo en navegador. */
  private configureTheme() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('hs-alert-theme')) return;

    const style = document.createElement('style');
    style.id = 'hs-alert-theme';
    style.textContent = `
      .swal2-popup {
        border-radius: 14px !important;
        padding: 1.5rem 1.5rem 1.35rem !important;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18) !important;
      }
      .swal2-title {
        font-size: 1.15rem !important;
        font-weight: 600 !important;
        letter-spacing: -0.01em;
        color: #0f172a !important;
      }
      .swal2-html-container {
        font-size: 0.93rem !important;
        line-height: 1.55 !important;
        color: #475569 !important;
      }
      .swal2-html-container small {
        display: block;
        margin-top: 0.5rem;
        color: #64748b;
      }
      .swal2-actions { gap: 0.5rem; }
      .swal2-confirm,
      .swal2-cancel {
        border-radius: 8px !important;
        font-weight: 600 !important;
        font-size: 0.9rem !important;
        padding: 0.6rem 1.2rem !important;
        box-shadow: none !important;
      }
      .swal2-confirm { background: #4f46e5 !important; }
      .swal2-confirm:hover { background: #4338ca !important; }
      .swal2-confirm:focus-visible { box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.25) !important; }
      .swal2-cancel {
        background: #ffffff !important;
        color: #334155 !important;
        border: 1px solid #cbd5e1 !important;
      }
      .swal2-cancel:hover { background: #f1f5f9 !important; }
      .swal2-toast {
        border-radius: 10px !important;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14) !important;
      }
      .swal2-timer-progress-bar { background: rgba(79, 70, 229, 0.35) !important; }
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
