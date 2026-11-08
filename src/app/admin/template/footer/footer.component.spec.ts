import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FECHA_VERSION, VERSION } from '../../../constants/version';
import { ConectividadService } from '../../../shared/services/conectividad.service';
import { signal } from '@angular/core';
import { FooterComponent, fechaCorta } from './footer.component';

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;
  const enLinea = signal(true);

  beforeEach(async () => {
    enLinea.set(true);
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [{ provide: ConectividadService, useValue: { enLinea } }],
    }).compileComponents();

    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('muestra la versión y la fecha de constants/version.ts', () => {
    fixture.detectChanges();
    const texto = (fixture.nativeElement.querySelector('.footer-version') as HTMLElement).textContent ?? '';
    expect(texto).toContain(`v${VERSION}`);
    expect(texto).toContain(fechaCorta(FECHA_VERSION));
    expect(fechaCorta('2026-11-08')).toMatch(/^8 nov\w* 2026$/);
  });

  it('indica si hay conexión', () => {
    fixture.detectChanges();
    const estado = fixture.nativeElement.querySelector('.footer-estado') as HTMLElement;
    expect(estado.textContent).toContain('Conectado');
    expect(estado.classList).not.toContain('footer-estado--sin');

    enLinea.set(false);
    fixture.detectChanges();
    expect(estado.textContent).toContain('Sin conexión');
    expect(estado.classList).toContain('footer-estado--sin');
  });
});
