import { Component, QueryList, ViewChildren } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule, NgModel } from '@angular/forms';
import { NumeroDirective, primerNumeroInvalido } from './numero.directive';

@Component({
  standalone: true,
  imports: [FormsModule, NumeroDirective],
  template: `
    <input id="cantidad" type="number" appNumero [(ngModel)]="cantidad" #c="appNumero" #m="ngModel" errorId="cantidad-error" />
    <input id="moneda" appNumero="moneda" [(ngModel)]="monto" />
    <input id="revertir" appNumero vacio="revertir" [(ngModel)]="revertir" />
    <input id="cero" appNumero="moneda" vacio="cero" [(ngModel)]="cero" />
    <input id="peso" appNumero="peso" [(ngModel)]="peso" />
    <input id="rango" appNumero min="1" [max]="maximo" ajustarAlRango [(ngModel)]="rango" />
    <input id="minimo" appNumero min="10" [(ngModel)]="minimo" />
    <input id="porcentaje" appNumero="porcentaje" [(ngModel)]="porcentaje" />
    <input id="apagado" appNumero [(ngModel)]="apagado" [disabled]="true" />
  `,
})
class AnfitrionComponent {
  cantidad: number | null = null;
  monto: number | null = null;
  revertir: number | null = 7;
  cero: number | null = 5;
  peso: number | string | null = null;
  rango: number | null = 3;
  maximo = 10;
  minimo: number | null = null;
  porcentaje: number | null = null;
  apagado: number | null = null;
  @ViewChildren(NumeroDirective) campos!: QueryList<NumeroDirective>;
}

describe('NumeroDirective (appNumero)', () => {
  let fixture: ComponentFixture<AnfitrionComponent>;
  let host: AnfitrionComponent;

  const campo = (id: string) => (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`#${id}`)!;
  const directiva = (id: string) => host.campos.find((d) => (d as unknown as { el: HTMLElement }).el.id === id)!;

  function escribir(id: string, texto: string): void {
    const el = campo(id);
    el.value = texto;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function enfocar(id: string): void {
    campo(id).dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
  }

  function salir(id: string): void {
    campo(id).dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
  }

  function tecla(id: string, key: string): KeyboardEvent {
    const evento = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
    campo(id).dispatchEvent(evento);
    fixture.detectChanges();
    return evento;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AnfitrionComponent] }).compileComponents();
    fixture = TestBed.createComponent(AnfitrionComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('convierte el campo en texto con teclado numérico y sin autocompletar', () => {
    const el = campo('cantidad');
    expect(el.type).toBe('text');
    expect(el.getAttribute('inputmode')).toBe('numeric');
    expect(el.getAttribute('autocomplete')).toBe('off');
    expect(el.getAttribute('maxlength')).toBe('24');
    expect(campo('moneda').getAttribute('inputmode')).toBe('decimal');
  });

  it('«10.000» llega al modelo como 10000 y al salir se muestra «10,000»', () => {
    enfocar('cantidad');
    escribir('cantidad', '10.000');
    expect(host.cantidad).toBe(10000);
    expect(campo('cantidad').value).toBe('10.000'); // no se pisa mientras se escribe
    salir('cantidad');
    expect(campo('cantidad').value).toBe('10,000');
  });

  it('entiende «10,000», «1\'000,000» y «1 000 000»', () => {
    escribir('cantidad', '10,000');
    expect(host.cantidad).toBe(10000);
    escribir('cantidad', "1'000,000");
    expect(host.cantidad).toBe(1000000);
    escribir('cantidad', '1 000 000');
    expect(host.cantidad).toBe(1000000);
  });

  it('moneda: «S/ 1,200.50» → 1200.5 y se muestra «1,200.50»', () => {
    enfocar('moneda');
    escribir('moneda', 'S/ 1,200.50');
    expect(host.monto).toBe(1200.5);
    salir('moneda');
    expect(campo('moneda').value).toBe('1,200.50');
  });

  it('cantidad «1,5»: no emite, queda inválido y lo explica', async () => {
    host.cantidad = 4;
    fixture.detectChanges();
    await fixture.whenStable(); // ngModel escribe el valor en una microtarea
    escribir('cantidad', '1,5');
    const d = directiva('cantidad');
    expect(host.cantidad).toBe(4);
    expect(d.invalido()).toBe(true);
    expect(d.motivo()).toBe('Solo números enteros (sin decimales)');
    const el = campo('cantidad');
    expect(el.classList.contains('num-invalido')).toBe(true);
    expect(el.getAttribute('aria-invalid')).toBe('true');
    expect(el.getAttribute('title')).toBe('Solo números enteros (sin decimales)');
    expect(el.getAttribute('aria-describedby')).toBe('cantidad-error');
  });

  it('el control de formulario queda inválido con el motivo (para form.invalid)', () => {
    const modelo = fixture.debugElement.children[0].injector.get(NgModel);
    escribir('cantidad', 'abc');
    expect(modelo.control.errors?.['numero']).toEqual({ error: 'formato', motivo: 'Escribe solo números. Ej.: 10,000' });
    escribir('cantidad', '12');
    expect(modelo.control.errors).toBeNull();
    const el = campo('cantidad');
    expect(el.classList.contains('num-invalido')).toBe(false);
    expect(el.hasAttribute('aria-invalid')).toBe(false);
    expect(el.hasAttribute('aria-describedby')).toBe(false);
  });

  it('vacio="revertir" vuelve al último valor al salir vacío', async () => {
    expect(campo('revertir').value).toBe('7');
    enfocar('revertir');
    escribir('revertir', '');
    expect(host.revertir).toBe(7);
    salir('revertir');
    expect(campo('revertir').value).toBe('7');
    expect(host.revertir).toBe(7);
  });

  it('vacio="cero" pone 0 al salir vacío y muestra los céntimos', () => {
    enfocar('cero');
    escribir('cero', '');
    salir('cero');
    expect(host.cero).toBe(0);
    expect(campo('cero').value).toBe('0.00');
  });

  it('por defecto (vacio="nulo") vaciar el campo deja null', () => {
    escribir('cantidad', '5');
    escribir('cantidad', '');
    expect(host.cantidad).toBeNull();
  });

  it('writeValue con un NUMERIC «5.000» de la BD es 5 (no 5000)', async () => {
    host.peso = '5.000';
    fixture.detectChanges();
    await fixture.whenStable();
    expect(campo('peso').value).toBe('5');
    host.peso = 1500.25;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(campo('peso').value).toBe('1,500.25');
  });

  it('al enfocar quita los miles para editar sin cambiar el significado', () => {
    host.cantidad = 12345;
    fixture.detectChanges();
    return fixture.whenStable().then(() => {
      expect(campo('cantidad').value).toBe('12,345');
      enfocar('cantidad');
      expect(campo('cantidad').value).toBe('12345');
    });
  });

  it('ajustarAlRango recorta al salir en vez de marcar error', () => {
    enfocar('rango');
    escribir('rango', '99');
    expect(directiva('rango').invalido()).toBe(false);
    expect(host.rango).toBe(3); // fuera de rango no llega al modelo mientras se escribe
    salir('rango');
    expect(host.rango).toBe(10);
    expect(campo('rango').value).toBe('10');
  });

  it('el mínimo se avisa al salir, no mientras se escribe', () => {
    enfocar('minimo');
    escribir('minimo', '1');
    expect(directiva('minimo').invalido()).toBe(false);
    salir('minimo');
    expect(directiva('minimo').invalido()).toBe(true);
    expect(directiva('minimo').motivo()).toBe('Mínimo 10');
    escribir('minimo', '15');
    expect(directiva('minimo').invalido()).toBe(false);
    expect(host.minimo).toBe(15);
  });

  it('el máximo se avisa al instante (un código de barras no entra como cantidad)', () => {
    escribir('cantidad', '7751234567890');
    expect(directiva('cantidad').invalido()).toBe(true);
    expect(directiva('cantidad').motivo()).toBe('Máximo 100,000,000');
    expect(host.cantidad).toBeNull();
  });

  it('↑/↓ suman o restan el paso dentro del rango', () => {
    escribir('cantidad', '5');
    const evento = tecla('cantidad', 'ArrowUp');
    expect(evento.defaultPrevented).toBe(true);
    expect(host.cantidad).toBe(6);
    tecla('cantidad', 'ArrowDown');
    tecla('cantidad', 'ArrowDown');
    expect(host.cantidad).toBe(4);
    escribir('cantidad', '0');
    tecla('cantidad', 'ArrowDown');
    expect(host.cantidad).toBe(0); // no baja del mínimo
  });

  it('Enter confirma como al salir', () => {
    enfocar('minimo');
    escribir('minimo', '3');
    tecla('minimo', 'Enter');
    expect(directiva('minimo').motivo()).toBe('Mínimo 10');
  });

  it('bloquea letras al teclear pero deja pegar', () => {
    const letra = new InputEvent('beforeinput', { inputType: 'insertText', data: 'a', cancelable: true });
    campo('cantidad').dispatchEvent(letra);
    expect(letra.defaultPrevented).toBe(true);

    const menos = new InputEvent('beforeinput', { inputType: 'insertText', data: '-', cancelable: true });
    campo('cantidad').dispatchEvent(menos);
    expect(menos.defaultPrevented).toBe(true); // min = 0

    const cifra = new InputEvent('beforeinput', { inputType: 'insertText', data: '7', cancelable: true });
    campo('cantidad').dispatchEvent(cifra);
    expect(cifra.defaultPrevented).toBe(false);

    const pegar = new InputEvent('beforeinput', { inputType: 'insertFromPaste', data: 'S/ 1,200.50', cancelable: true });
    campo('moneda').dispatchEvent(pegar);
    expect(pegar.defaultPrevented).toBe(false);
  });

  it('porcentaje: máximo 100 y sin ceros de relleno', () => {
    escribir('porcentaje', '18,5');
    expect(host.porcentaje).toBe(18.5);
    salir('porcentaje');
    expect(campo('porcentaje').value).toBe('18.5');
    escribir('porcentaje', '120');
    expect(directiva('porcentaje').motivo()).toBe('Máximo 100%');
  });

  it('primerNumeroInvalido confirma los campos, salta los deshabilitados y devuelve el primero con error', () => {
    expect(primerNumeroInvalido(host.campos)).toBeNull();
    escribir('minimo', '2'); // mínimo pendiente: se confirma al revisar
    escribir('moneda', '1.2.3');
    const malo = primerNumeroInvalido(host.campos);
    expect(malo).toBe(directiva('moneda'));
    expect(directiva('minimo').motivo()).toBe('Mínimo 10');
    expect(primerNumeroInvalido(null)).toBeNull();
  });

  it('respeta el estado deshabilitado del formulario', async () => {
    await fixture.whenStable();
    expect(campo('apagado').disabled).toBe(true);
    expect(directiva('apagado').estaDeshabilitado).toBe(true);
  });
});
