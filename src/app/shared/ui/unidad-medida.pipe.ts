import { ChangeDetectorRef, Pipe, PipeTransform, inject } from '@angular/core';

import { UnidadMedidaService } from '../../admin/service/unidad-medida.service';

/**
 * Código SUNAT → texto legible: {{ 'KGM' | unidadMedida }} → «kg»;
 * {{ 'KGM' | unidadMedida:'nombre' }} → «Kilogramo». Un código desconocido se muestra tal cual.
 *
 * Lee el mapa síncrono del servicio (que arranca con una lista de respaldo). La primera vez
 * pide el catálogo completo y, cuando llega, marca la vista para repintar; por eso no es
 * pura: el resultado depende de un catálogo que se completa después. La búsqueda es un
 * `Map.get`, así que el costo es despreciable.
 */
@Pipe({ name: 'unidadMedida', standalone: true, pure: false })
export class UnidadMedidaPipe implements PipeTransform {
  private readonly unidades = inject(UnidadMedidaService);
  private readonly cdr = inject(ChangeDetectorRef);
  private pedido = false;

  transform(codigo: string | null | undefined, formato: 'abreviatura' | 'nombre' = 'abreviatura'): string {
    if (!this.pedido) {
      this.pedido = true;
      this.unidades.cargar().subscribe(() => this.cdr.markForCheck());
    }
    const texto = String(codigo ?? '').trim();
    if (!texto) return '';
    const unidad = this.unidades.mapa.get(texto);
    if (!unidad) return texto;
    return formato === 'nombre' ? unidad.nombre : unidad.abreviatura;
  }
}
