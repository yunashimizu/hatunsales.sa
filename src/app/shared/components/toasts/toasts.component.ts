import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { NotificationService, Toast } from '../../services/notification.service';

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
           [attr.role]="t.type === 'error' ? 'alert' : 'status'">
        <i class="bi nt-aviso__icono" [ngClass]="iconoDe(t.type)" aria-hidden="true"></i>
        <span class="nt-aviso__texto">{{ t.message }}</span>
        <button type="button" class="nt-aviso__cerrar" (click)="dismiss(t.id)" aria-label="Cerrar aviso">
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .nt-pila {
      position: fixed; top: 72px; right: 16px; z-index: 2000;
      display: flex; flex-direction: column; gap: 10px;
      width: min(400px, calc(100vw - 32px));
      pointer-events: none;
    }
    .nt-aviso {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 12px 12px 14px;
      background: #fff; color: #0f172a;
      font-size: 13.5px; line-height: 1.45;
      border: 1px solid #e2e8f0; border-left: 4px solid var(--nt-color);
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.14);
      pointer-events: auto;
      animation: nt-entrar 200ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .nt-aviso--success { --nt-color: #059669; }
    .nt-aviso--error   { --nt-color: #dc2626; }
    .nt-aviso--warning { --nt-color: #d97706; }
    .nt-aviso--info    { --nt-color: #0284c7; }
    .nt-aviso__icono { flex-shrink: 0; margin-top: 1px; font-size: 16px; color: var(--nt-color); }
    .nt-aviso__texto { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .nt-aviso__cerrar {
      flex-shrink: 0; display: grid; place-items: center;
      width: 26px; height: 26px; margin: -4px -4px -4px 0;
      border: 0; border-radius: 6px; background: transparent;
      color: #94a3b8; font-size: 12px; cursor: pointer;
    }
    .nt-aviso__cerrar:hover { background: #f1f5f9; color: #0f172a; }
    @keyframes nt-entrar {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: none; }
    }
    @media (prefers-reduced-motion: reduce) { .nt-aviso { animation: none; } }
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
