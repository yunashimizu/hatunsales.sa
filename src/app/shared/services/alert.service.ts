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

  success(config: AlertConfig = {}) {
    return Swal.fire({
      icon: 'success',
      title: config.title || 'Éxito',
      html: config.message || '',
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
      html: config.message || '',
      confirmButtonText: config.confirmText || 'Aceptar',
      allowOutsideClick: config.allowOutsideClick ?? false,
      allowEscapeKey: config.allowEscapeKey ?? true,
    });
  }

  warning(config: AlertConfig = {}) {
    return Swal.fire({
      icon: 'warning',
      title: config.title || 'Advertencia',
      html: config.message || '',
      confirmButtonText: config.confirmText || 'Aceptar',
      allowOutsideClick: config.allowOutsideClick ?? false,
      allowEscapeKey: config.allowEscapeKey ?? true,
    });
  }

  info(config: AlertConfig = {}) {
    return Swal.fire({
      icon: 'info',
      title: config.title || 'Información',
      html: config.message || '',
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
      html: config.message || '',
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
      html: config.message,
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
