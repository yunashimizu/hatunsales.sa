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
  /**
   * Confirmación destructiva (eliminar, anular, vaciar…): el botón principal
   * se pinta en rojo. Si no se indica, se deduce del texto del botón.
   */
  danger?: boolean;
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

/** Verbos que identifican una acción irreversible en el botón o el título. */
const VERBOS_DESTRUCTIVOS = /\b(eliminar|borrar|anular|vaciar|quitar|desactivar|descartar|cerrar sesi[oó]n|cancelar (el|este|la|esta)\b)/i;

function esAccionDestructiva(textoBoton: string, titulo?: string): boolean {
  return VERBOS_DESTRUCTIVOS.test(textoBoton) || (!!titulo && /^¿?(eliminar|borrar|anular|vaciar|quitar|desactivar|descartar)\b/i.test(titulo));
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
      .swal2-container { z-index: 2000 !important; padding: 16px; }
      .swal2-container.swal2-backdrop-show { background: rgba(15, 23, 42, 0.5) !important; backdrop-filter: blur(3px); }
      .swal2-popup {
        width: min(30em, calc(100vw - 32px)) !important;
        border-radius: 20px !important;
        padding: 1.6rem 1.5rem 1.4rem !important;
        border: 1px solid #e4e8f0;
        box-shadow: 0 24px 60px -16px rgba(15, 23, 42, 0.32), 0 8px 24px -8px rgba(15, 23, 42, 0.12) !important;
        font-family: 'Inter', 'Segoe UI', Roboto, sans-serif !important;
        color: #0f172a;
      }
      .swal2-title {
        font-family: 'Plus Jakarta Sans', 'Inter', sans-serif !important;
        font-size: 1.2rem !important;
        font-weight: 700 !important;
        letter-spacing: -0.015em;
        color: #0f172a !important;
        padding: 0.4em 0.6em 0 !important;
      }
      .swal2-html-container {
        margin: 0.7em 0.6em 0 !important;
        font-size: 0.92rem !important;
        line-height: 1.55 !important;
        color: #5b6578 !important;
      }
      .swal2-html-container small { display: block; margin-top: 0.5rem; color: #8a94a6; }
      .swal2-html-container strong { color: #0f172a; }

      /* Icono: chip redondeado con tinte del estado, sin anillo */
      .swal2-icon {
        width: 4.6em !important;
        height: 4.6em !important;
        margin: 0.4em auto 0.9em !important;
        border: 0 !important;
        border-radius: 22px !important;
        font-size: 15px !important;
      }
      .swal2-icon .swal2-icon-content { font-size: 2.4em !important; font-weight: 700; }
      .swal2-icon.swal2-success { background: #ecfdf5; color: #059669; }
      .swal2-icon.swal2-success .swal2-success-ring,
      .swal2-icon.swal2-success .swal2-success-fix,
      .swal2-icon.swal2-success .swal2-success-circular-line-left,
      .swal2-icon.swal2-success .swal2-success-circular-line-right { display: none !important; }
      .swal2-icon.swal2-success [class^='swal2-success-line'] { background-color: #059669 !important; height: 0.32em !important; border-radius: 3px; }
      .swal2-icon.swal2-error { background: #fef2f2; color: #dc2626; }
      .swal2-icon.swal2-error [class^='swal2-x-mark-line'] { background-color: #dc2626 !important; height: 0.32em !important; border-radius: 3px; }
      .swal2-icon.swal2-warning { background: #fffbeb; color: #d97706; }
      .swal2-icon.swal2-info { background: #f0f9ff; color: #0284c7; }
      .swal2-icon.swal2-question { background: #eef2ff; color: #4f46e5; }

      .swal2-actions { gap: 0.55rem; margin-top: 1.4em !important; width: 100%; padding: 0 0.6em; }
      .swal2-actions:not(.swal2-loading) .swal2-styled { margin: 0; }
      .swal2-confirm,
      .swal2-cancel,
      .swal2-deny {
        flex: 1 1 auto;
        min-height: 42px;
        border-radius: 10px !important;
        font-weight: 600 !important;
        font-size: 0.92rem !important;
        padding: 0.6rem 1.2rem !important;
        box-shadow: none !important;
        transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease, background 160ms ease !important;
      }
      .swal2-confirm {
        background: linear-gradient(135deg, #6366f1 0%, #4f46e5 60%, #4338ca 100%) !important;
        box-shadow: 0 1px 2px rgba(67, 56, 202, 0.35) !important;
      }
      .swal2-confirm:hover { filter: brightness(1.05); transform: translateY(-1px); box-shadow: 0 8px 18px -6px rgba(79, 70, 229, 0.55) !important; }
      .swal2-confirm:focus-visible { box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.22) !important; }
      /* Acción destructiva (eliminar, anular, vaciar…): botón principal en rojo.
         Un aviso simple con "Aceptar" conserva el color de marca. */
      .swal2-confirm.hs-swal-peligro {
        background: linear-gradient(135deg, #ef4444, #dc2626) !important;
        box-shadow: 0 1px 2px rgba(220, 38, 38, 0.35) !important;
      }
      .swal2-confirm.hs-swal-peligro:hover { box-shadow: 0 8px 18px -6px rgba(220, 38, 38, 0.55) !important; }
      .swal2-confirm.hs-swal-peligro:focus-visible { box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.22) !important; }
      .swal2-cancel,
      .swal2-deny {
        background: #ffffff !important;
        color: #334155 !important;
        border: 1px solid #cfd6e2 !important;
      }
      .swal2-cancel:hover,
      .swal2-deny:hover { background: #f1f4f9 !important; color: #0f172a !important; }
      .swal2-cancel:focus-visible { box-shadow: 0 0 0 4px rgba(15, 23, 42, 0.10) !important; }

      .swal2-input, .swal2-textarea, .swal2-select {
        margin: 1em 0.6em 0 !important;
        border: 1px solid #cfd6e2 !important;
        border-radius: 10px !important;
        font-size: 0.95rem !important;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04) !important;
        color: #0f172a;
      }
      .swal2-input:focus, .swal2-textarea:focus, .swal2-select:focus {
        border-color: #4f46e5 !important;
        box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.14) !important;
      }
      .swal2-input-label { margin: 1em 0.6em 0; font-size: 0.85rem; font-weight: 600; color: #1e293b; }
      .swal2-validation-message {
        margin: 0.8em 0.6em 0 !important;
        border-radius: 10px;
        background: #fef2f2 !important;
        color: #b91c1c !important;
        font-size: 0.85rem;
      }
      .swal2-loader { border-color: #4f46e5 transparent #4f46e5 transparent !important; }

      /* Toasts de SweetAlert (esquina) */
      .swal2-toast {
        border-radius: 14px !important;
        padding: 0.7rem 0.9rem !important;
        border: 1px solid #e4e8f0;
        box-shadow: 0 12px 32px -8px rgba(15, 23, 42, 0.22) !important;
      }
      .swal2-toast .swal2-title { font-size: 0.92rem !important; font-weight: 600 !important; padding: 0 !important; }
      .swal2-toast .swal2-html-container { font-size: 0.85rem !important; margin: 0.2em 0 0 !important; }
      .swal2-toast .swal2-icon { width: 2em !important; height: 2em !important; margin: 0 0.6em 0 0 !important; border-radius: 10px !important; font-size: 16px !important; }
      .swal2-toast .swal2-icon .swal2-icon-content { font-size: 1.3em !important; }
      .swal2-timer-progress-bar { background: rgba(79, 70, 229, 0.4) !important; height: 3px !important; }

      @media (max-width: 640px) {
        .swal2-popup { padding: 1.3rem 1.1rem 1.15rem !important; border-radius: 18px !important; }
        .swal2-actions { flex-direction: column-reverse; }
        .swal2-confirm, .swal2-cancel, .swal2-deny { width: 100%; }
      }
      @media (prefers-reduced-motion: reduce) {
        .swal2-show, .swal2-hide, .swal2-icon { animation: none !important; }
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
    const confirmText = config.confirmText || 'Sí, confirmar';
    const destructiva = config.danger ?? esAccionDestructiva(confirmText, config.title);
    return Swal.fire({
      icon: config.type && config.type !== 'success' ? config.type : 'question',
      title: config.title || '¿Confirmar?',
      ...this.cuerpoMensaje(config),
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: config.cancelText || 'Cancelar',
      allowOutsideClick: config.allowOutsideClick ?? false,
      allowEscapeKey: config.allowEscapeKey ?? true,
      reverseButtons: true,
      customClass: destructiva ? { confirmButton: 'hs-swal-peligro' } : undefined,
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
