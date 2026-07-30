import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { NotificationService, Toast } from '../../services/notification.service';

@Component({
  selector: 'app-toasts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="toast-wrapper">
      <div *ngFor="let t of toasts; trackBy: trackToast" class="toast" [ngClass]="t.type">{{ t.message }}</div>
    </div>
  `,
  styles: [`
    .toast-wrapper{position:fixed;right:18px;top:18px;z-index:2000;display:flex;flex-direction:column;gap:8px}
    .toast{padding:10px 14px;border-radius:8px;color:#fff;box-shadow:0 6px 18px rgba(2,6,23,.12)}
    .success{background:#16a34a}
    .error{background:#e11d48}
    .info{background:#06b6d4}
    .warning{background:#f59e0b}
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
