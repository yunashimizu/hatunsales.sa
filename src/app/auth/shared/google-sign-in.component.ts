import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../service/auth.service';

declare global {
  interface Window {
    google?: any;
  }
}

@Component({
  selector: 'app-google-sign-in',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      class="w-full inline-flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm transition-all hover:scale-[1.01] hover:bg-slate-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
      [disabled]="cargando || !listo"
      (click)="iniciar()"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"/>
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.1 4 9.3 8.5 6.3 14.7z"/>
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.2 39.5 16 44 24 44z"/>
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l.0.0 6.2 5.2C39.1 36.9 44 32 44 24c0-1.3-.1-2.5-.4-3.5z"/>
      </svg>
      <span>{{ cargando ? 'Conectando…' : etiqueta }}</span>
    </button>
    <div #gisHost class="hidden" aria-hidden="true"></div>
  `,
})
export class GoogleSignInComponent implements AfterViewInit, OnDestroy {
  @Input() etiqueta = 'Continuar con Google';
  @Input() cargando = false;
  @Output() credential = new EventEmitter<string>();
  @Output() fallo = new EventEmitter<string>();

  @ViewChild('gisHost') gisHost?: ElementRef<HTMLDivElement>;

  listo = false;
  private clientId: string | null = null;
  private scriptId = 'google-gis-sdk';

  constructor(private readonly auth: AuthService) {}

  ngAfterViewInit(): void {
    this.auth.googleConfig().subscribe({
      next: (cfg) => {
        this.clientId = cfg.clientId;
        if (!cfg.habilitado || !cfg.clientId) {
          this.listo = false;
          return;
        }
        this.cargarSdk().then(() => this.inicializar()).catch(() => {
          this.listo = false;
          this.fallo.emit('No se pudo cargar Google Sign-In');
        });
      },
      error: () => {
        this.listo = false;
        this.fallo.emit('Google no está disponible ahora');
      },
    });
  }

  ngOnDestroy(): void {}

  iniciar(): void {
    if (!this.listo || !window.google?.accounts?.id) {
      this.fallo.emit(
        'Google no está configurado. Agrega GOOGLE_CLIENT_ID en el backend (Railway).',
      );
      return;
    }
    // Dispara el flujo One Tap / prompt; si el navegador lo bloquea, usamos el botón GIS oculto.
    window.google.accounts.id.prompt((notificacion: any) => {
      if (notificacion?.isNotDisplayed?.() || notificacion?.isSkippedMoment?.()) {
        const btn = this.gisHost?.nativeElement?.querySelector('div[role="button"]') as HTMLElement | null;
        btn?.click();
      }
    });
  }

  private inicializar(): void {
    if (!this.clientId || !window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: this.clientId,
      callback: (respuesta: { credential: string }) => {
        if (respuesta?.credential) this.credential.emit(respuesta.credential);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    if (this.gisHost?.nativeElement) {
      this.gisHost.nativeElement.innerHTML = '';
      window.google.accounts.id.renderButton(this.gisHost.nativeElement, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
        shape: 'pill',
      });
    }

    this.listo = true;
  }

  private cargarSdk(): Promise<void> {
    if (window.google?.accounts?.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existente = document.getElementById(this.scriptId) as HTMLScriptElement | null;
      if (existente) {
        existente.addEventListener('load', () => resolve());
        existente.addEventListener('error', () => reject());
        if (window.google?.accounts?.id) resolve();
        return;
      }
      const script = document.createElement('script');
      script.id = this.scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject();
      document.head.appendChild(script);
    });
  }
}
