import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { AlertService } from '../../../shared/services/alert.service';
import {
  EMPRESA_TIENDA,
  urlMapaAbrir,
  urlMapaEmbed,
  urlMailto,
  urlTelefono,
  urlWhatsapp,
} from '../../config/empresa-tienda.config';

@Component({
  selector: 'app-contacto',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './contacto.component.html',
  styleUrl: './contacto.component.css',
})
export class ContactoComponent {
  private readonly alerta = inject(AlertService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly empresa = EMPRESA_TIENDA;
  readonly mapaEmbed: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(urlMapaEmbed());
  readonly mapaAbrir = urlMapaAbrir();
  readonly telHref = urlTelefono();
  readonly mailHref = urlMailto();
  readonly waHref = urlWhatsapp('Hola HatunSales, quisiera más información.');

  async copiar(texto: string, etiqueta: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.alerta.toast({ type: 'success', title: `${etiqueta} copiado`, timer: 1800 });
    } catch {
      this.alerta.toast({ type: 'info', title: texto, timer: 3200 });
    }
  }
}
