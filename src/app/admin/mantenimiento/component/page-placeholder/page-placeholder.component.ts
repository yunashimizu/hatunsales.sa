import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-mantenimiento-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './page-placeholder.component.html',
  styleUrl: './page-placeholder.component.css',
})
export class PagePlaceholderComponent {
  title = '';
  subtitle = '';
  icon = '';

  private readonly route!: ActivatedRoute;

  constructor(route: ActivatedRoute) {
    this.route = route;
    const data = this.route.snapshot.data;
    this.title = data['title'] ?? 'Mantenimiento';
    this.subtitle = data['subtitle'] ?? 'Aún no hay contenido dinámico para esta sección. Pronto estará disponible.';
    this.icon = data['icon'] ?? 'fa-cog';
  }
}
