import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timeout?: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private subject = new Subject<Toast>();
  toasts$ = this.subject.asObservable();
  private idCounter = 1;

  toast(message: string, type: Toast['type'] = 'info', timeout = 4000) {
    const t: Toast = { id: this.idCounter++, type, message, timeout };
    this.subject.next(t);
    return t.id;
  }

  success(message: string, timeout = 4000) { this.toast(message, 'success', timeout); }
  error(message: string, timeout = 6000) { this.toast(message, 'error', timeout); }
  info(message: string, timeout = 4000) { this.toast(message, 'info', timeout); }
  warn(message: string, timeout = 5000) { this.toast(message, 'warning', timeout); }
}
