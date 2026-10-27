import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { urlConstants } from '../../../constants/urlConstants';
import { SelectorUnidadComponent } from './selector-unidad.component';

const u = (codigo: string, nombre: string, abreviatura: string, grupo: string, frecuente = false) =>
  ({ codigo, nombre, abreviatura, grupo, frecuente, visible: true });

const CATALOGO = {
  grupos: ['Conteo', 'Peso', 'Construcción y materiales'],
  unidades: [
    u('NIU', 'Unidad', 'und', 'Conteo', true),
    u('KGM', 'Kilogramo', 'kg', 'Peso', true),
    u('GRM', 'Gramo', 'g', 'Peso'),
    u('SA', 'Saco', 'sco', 'Construcción y materiales', true),
  ],
  alias: { UND: 'NIU', KG: 'KGM', SACOS: 'SA' },
};

@Component({
  standalone: true,
  imports: [FormsModule, SelectorUnidadComponent],
  template: `<app-selector-unidad idCampo="f-unidad" [(ngModel)]="unidad" name="unidad"></app-selector-unidad>`,
})
class AnfitrionComponent {
  unidad: string | null = 'NIU';
}

describe('SelectorUnidadComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<AnfitrionComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AnfitrionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Monta el anfitrión con un valor inicial y responde el catálogo. */
  async function montar(inicial: string | null) {
    fixture = TestBed.createComponent(AnfitrionComponent);
    fixture.componentInstance.unidad = inicial;
    fixture.detectChanges();
    http.expectOne(urlConstants.producto.unidades).flush(CATALOGO);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const select = () => fixture.nativeElement.querySelector('select') as HTMLSelectElement;
  const host = () => fixture.nativeElement.querySelector('app-selector-unidad') as HTMLElement;
  const textoAyuda = () => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');

  it('muestra «Frecuentes» arriba, un grupo por cada uno y opciones «Nombre (abrev)»', async () => {
    await montar('KGM');
    const grupos = Array.from(select().querySelectorAll('optgroup')).map((g) => g.label);
    expect(grupos).toEqual(['Frecuentes', 'Conteo', 'Peso', 'Construcción y materiales']);
    const opciones = Array.from(select().options).map((o) => o.textContent?.trim());
    expect(opciones).toContain('Kilogramo (kg)');
    expect(opciones).toContain('Saco (sco)');
    expect(select().value).toBe('KGM');
    expect(textoAyuda()).toContain('Código SUNAT: KGM');
    expect(host().classList).not.toContain('ng-invalid');
  });

  it('un valor legado con alias se corrige, avisa y actualiza el modelo', async () => {
    await montar('UND');
    expect(fixture.componentInstance.unidad).toBe('NIU');
    expect(select().value).toBe('NIU');
    expect(textoAyuda()).toContain('Se corrigió a Unidad (und)');
    expect(host().classList).not.toContain('ng-invalid');
  });

  it('un código válido pero oculto (MIL) queda como opción en «Otros»', async () => {
    await montar('MIL');
    const otros = Array.from(select().querySelectorAll('optgroup')).find((g) => g.label === 'Otros');
    expect(otros).toBeTruthy();
    expect(select().value).toBe('MIL');
    expect(fixture.componentInstance.unidad).toBe('MIL');
    expect(host().classList).not.toContain('ng-invalid');
  });

  it('un valor desconocido muestra «no válida, elija una» y deja el control inválido', async () => {
    await montar('Plancha X');
    expect(select().options[0].textContent).toContain('“Plancha X” — no válida, elija una');
    expect(select().value).toBe('Plancha X');
    expect(host().classList).toContain('ng-invalid');
    expect(fixture.componentInstance.unidad).toBe('Plancha X');
  });

  it('elegir otra unidad emite el código y vuelve válido el control', async () => {
    await montar('Plancha X');
    select().value = 'SA';
    select().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.unidad).toBe('SA');
    expect(host().classList).not.toContain('ng-invalid');
    expect(textoAyuda()).not.toContain('no válida');
  });

  it('vacío o nulo se muestra como NIU y no queda inválido', async () => {
    await montar(null);
    expect(select().value).toBe('NIU');
    expect(host().classList).not.toContain('ng-invalid');
    expect(textoAyuda()).toContain('Código SUNAT: NIU');
  });
});
