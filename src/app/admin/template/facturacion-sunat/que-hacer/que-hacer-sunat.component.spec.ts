import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QueHacerSunatComponent } from './que-hacer-sunat.component';

@Component({
  standalone: true,
  imports: [QueHacerSunatComponent],
  template: `
    <app-que-hacer-sunat [texto]="texto" [tono]="tono" [titulo]="titulo">
      @if (conBoton) {
        <button type="button" class="adm-btn" (click)="clics = clics + 1">Consultar ahora</button>
      }
    </app-que-hacer-sunat>
  `,
})
class AnfitrionComponent {
  texto = 'SUNAT no respondió. Consúltelo de nuevo.';
  tono: 'peligro' | 'aviso' = 'aviso';
  titulo = '¿Qué hacer?';
  conBoton = true;
  clics = 0;
}

describe('QueHacerSunatComponent', () => {
  let fixture: ComponentFixture<AnfitrionComponent>;
  let anfitrion: AnfitrionComponent;
  const tarjeta = () => fixture.nativeElement.querySelector('.que-hacer') as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AnfitrionComponent] }).compileComponents();
    fixture = TestBed.createComponent(AnfitrionComponent);
    anfitrion = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('muestra el título «¿Qué hacer?», el texto y el botón de la acción al lado', () => {
    expect(tarjeta().textContent).toContain('¿Qué hacer?');
    expect(tarjeta().textContent).toContain('SUNAT no respondió. Consúltelo de nuevo.');
    const boton = tarjeta().querySelector('.que-hacer__acciones button') as HTMLButtonElement;
    expect(boton.textContent).toContain('Consultar ahora');
    boton.click();
    expect(anfitrion.clics).toBe(1);
  });

  it('el tono manda: aviso para lo que espera, peligro para lo que requiere revisión', () => {
    expect(tarjeta().classList).toContain('que-hacer--aviso');
    anfitrion.tono = 'peligro';
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(tarjeta().classList).toContain('que-hacer--peligro');
    expect(tarjeta().classList).not.toContain('que-hacer--aviso');
  });

  it('es un grupo con nombre accesible y su título se puede cambiar', () => {
    expect(tarjeta().getAttribute('role')).toBe('group');
    expect(tarjeta().getAttribute('aria-label')).toBe('¿Qué hacer?');
  });

  it('sin acciones solo queda el texto (el contenedor de botones está vacío)', () => {
    anfitrion.conBoton = false;
    fixture.detectChanges();
    expect(tarjeta().querySelector('.que-hacer__acciones')?.querySelectorAll('button').length).toBe(0);
    expect(tarjeta().textContent).toContain('Consúltelo de nuevo');
  });
});
