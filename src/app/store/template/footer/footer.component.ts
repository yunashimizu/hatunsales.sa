import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { CatalogoService } from '../../service/catalogo.service';
import { CategoriaTienda } from '../../models/tienda.models';
import {
  EMPRESA_TIENDA,
  urlMailto,
  urlTelefono,
  urlWhatsapp,
} from '../../config/empresa-tienda.config';

@Component({
  selector: 'app-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css',
})
export class FooterComponent implements OnInit {

  private readonly catalogo = inject(CatalogoService);
  private readonly cdr = inject(ChangeDetectorRef);

  categorias: CategoriaTienda[] = [];
  readonly anio = new Date().getFullYear();
  readonly empresa = EMPRESA_TIENDA;
  readonly waHref = urlWhatsapp();
  readonly telHref = urlTelefono();
  readonly mailHref = urlMailto();

  ngOnInit(): void {
    this.catalogo.categorias().pipe(take(1)).subscribe((c) => {
      this.categorias = c.slice(0, 6);
      this.cdr.markForCheck();
    });
  }

  trackCat(_i: number, cat: CategoriaTienda): number {
    return cat.id_categoria;
  }
}
