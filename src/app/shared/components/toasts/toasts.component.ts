import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { NotificationService, Toast } from '../../services/notification.service';

const TITULOS: Record<Toast['type'], string> = {
  success: 'Listo',
  error: 'Error',
  warning: 'Atención',
  info: 'Aviso',
};

const ICONOS: Record<Toast['type'], string> = {
  success: 'bi-check-circle-fill',
  error: 'bi-x-circle-fill',
  warning: 'bi-exclamation-triangle-fill',
  info: 'bi-info-circle-fill',
};

/**
 * Avisos apilados arriba a la derecha. Las clases llevan prefijo `nt-`:
 * Bootstrap define `.toast` y la oculta con `.toast:not(.show)`, así que con
 * el nombre genérico los avisos no se veían.
 */
@Component({
  selector: 'app-toasts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="nt-pila" aria-live="polite">
      <div *ngFor="let t of toasts; trackBy: trackToast"
           class="nt-aviso"
           [ngClass]="'nt-aviso--' + t.type"
           [style.--nt-dur]="(t.timeout && t.timeout > 0 ? t.timeout : 0) + 'ms'"
           [attr.role]="t.type === 'error' ? 'alert' : 'status'">
        <span class="nt-aviso__icono" aria-hidden="true"><i class="bi" [ngClass]="iconoDe(t.type)"></i></span>
        <div class="nt-aviso__cuerpo">
          <span class="nt-aviso__titulo">{{ tituloDe(t.type) }}</span>
          <span class="nt-aviso__texto">{{ t.message }}</span>
        </div>
        <button type="button" class="nt-aviso__cerrar" (click)="dismiss(t.id)" aria-label="Cerrar aviso">
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
        <span class="nt-aviso__progreso" *ngIf="t.timeout && t.timeout > 0" aria-hidden="true"></span>
      </div>
    </div>
  `,
  styles: [`
    .nt-pila {
      position: fixed; top: 76px; right: 20px; z-index: 2100;
      display: flex; flex-direction: column; gap: 10px;
      width: min(400px, calc(100vw - 32px));
      pointer-events: none;
    }
    .nt-aviso {
      --nt-color: #0284c7; --nt-fondo: #f0f9ff;
      position: relative; overflow: hidden;
      display: flex; align-items: flex-start; gap: 12px;
      padding: 12px 12px 13px 14px;
      background: rgba(255, 255, 255, 0.97);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      color: #0f172a;
      font-family: 'Inter', 'Segoe UI', Roboto, sans-serif;
      font-size: 13.5px; line-height: 1.45;
      border: 1px solid #e4e8f0; border-radius: 14px;
      box-shadow: 0 18px 44px -12px rgba(15, 23, 42, 0.26), 0 4px 12px -4px rgba(15, 23, 42, 0.10);
      pointer-events: auto;
      animation: nt-entrar 260ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .nt-aviso--success { --nt-color: #059669; --nt-fondo: #ecfdf5; }
    .nt-aviso--error   { --nt-color: #dc2626; --nt-fondo: #fef2f2; }
    .nt-aviso--warning { --nt-color: #d97706; --nt-fondo: #fffbeb; }
    .nt-aviso--info    { --nt-color: #0284c7; --nt-fondo: #f0f9ff; }
    .nt-aviso__icono {
      display: grid; place-items: center; flex-shrink: 0;
      width: 34px; height: 34px; border-radius: 10px;
      background: var(--nt-fondo); color: var(--nt-color); font-size: 16px;
    }
    .nt-aviso__cuerpo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; padding-top: 1px; }
    .nt-aviso__titulo { font-size: 12.5px; font-weight: 700; color: var(--nt-color); letter-spacing: 0.01em; }
    .nt-aviso__texto { color: #1e293b; overflow-wrap: anywhere; }
    .nt-aviso__cerrar {
      flex-shrink: 0; display: grid; place-items: center;
      width: 28px; height: 28px; margin: -2px -2px 0 0;
      border: 0; border-radius: 8px; background: transparent;
      color: #94a3b8; font-size: 12px; cursor: pointer;
      transition: background 150ms, color 150ms;
    }
    .nt-aviso__cerrar:hover { background: #f1f4f9; color: #0f172a; }
    .nt-aviso__cerrar:focus-visible { outline: 2px solid #4f46e5; outline-offset: 1px; }
    .nt-aviso__progreso {
      position: absolute; left: 0; bottom: 0; height: 3px; width: 100%;
      background: var(--nt-color); opacity: 0.55; transform-origin: left;
      animation: nt-progreso var(--nt-dur, 4000ms) linear forwards;
    }
    .nt-aviso:hover .nt-aviso__progreso { animation-play-state: paused; }
    @keyframes nt-entrar {
      from { opacity: 0; transform: translateY(-10px) scale(0.98); }
      to   { opacity: 1; transform: none; }
    }
    @keyframes nt-progreso { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    @media (max-width: 640px) {
      .nt-pila { top: 12px; right: 12px; left: 12px; width: auto; }
    }
    @media (prefers-reduced-motion: reduce) {
      .nt-aviso { animation: none; }
      .nt-aviso__progreso { animation: none; display: none; }
    }
  `]
})
export class ToastsComponent implements OnDestroy {
  toasts: Toast[] = [];
  private readonly sub: Subscription;
  private readonly cdr = inject(ChangeDetectorRef);

  constructor(ns: NotificationService) {
    this.sub = ns.toasts$.subscribe((t) => {
      this.toasts = [...this.toasts, t];
      this.cdr.markForCheck();
      if (t.timeout && t.timeout > 0) {
        setTimeout(() => this.dismiss(t.id), t.timeout);
      }
    });
  }

  iconoDe(tipo: Toast['type']): string {
    return ICONOS[tipo] ?? ICONOS.info;
  }

  tituloDe(tipo: Toast['type']): string {
    return TITULOS[tipo] ?? TITULOS.info;
  }

  trackToast(_i: number, t: Toast): number {
    return t.id;
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
