import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import { CarritoPanelComponent } from '../../components/carrito-panel/carrito-panel.component';
import { WhatsappFlotanteComponent } from '../../components/whatsapp-flotante/whatsapp-flotante.component';
import { VolverArribaComponent } from '../../../shared/ui/volver-arriba.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, CarritoPanelComponent, WhatsappFlotanteComponent, VolverArribaComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
})
export class LayoutComponent {}
