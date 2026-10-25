import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Ubigeo, UbigeoService } from '../../../../service/ubigeo.service';
import { UbigeoBuscadorComponent, UbigeoElegido } from './ubigeo-buscador.component';

const LURIN: Ubigeo = { codigo: '150119', departamento: 'LIMA', provincia: 'LIMA', distrito: 'LURIN', texto: 'LURIN - LIMA - LIMA' };

describe('UbigeoBuscadorComponent', () => {
  let fixture: ComponentFixture<UbigeoBuscadorComponent>;
  let componente: UbigeoBuscadorComponent;
  const api = { buscar: vi.fn(), obtener: vi.fn() };
  let cambios: UbigeoElegido[];

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [UbigeoBuscadorComponent],
      providers: [{ provide: UbigeoService, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(UbigeoBuscadorComponent);
    componente = fixture.componentInstance;
    fixture.componentRef.setInput('idCampo', 'u');
    fixture.detectChanges();
    cambios = [];
    componente.cambio.subscribe((c) => cambios.push(c));
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it('busca tras la pausa al escribir (desde 3 letras) y avisa el distrito elegido', () => {
    api.buscar.mockReturnValue(of([LURIN]));
    componente.alEscribir('lu');
    vi.advanceTimersByTime(400);
    expect(api.buscar).not.toHaveBeenCalled();

    componente.alEscribir('luri');
    vi.advanceTimersByTime(299);
    expect(api.buscar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(api.buscar).toHaveBeenCalledWith('luri', 3);

    fixture.detectChanges();
    const opcion = fixture.nativeElement.querySelector('[role="option"]') as HTMLElement;
    expect(opcion.textContent).toContain('LURIN');
    opcion.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(cambios).toEqual([{ codigo: '150119', texto: '150119 - LURIN - LIMA - LIMA' }]);
    expect(componente.consulta).toBe('150119 - LURIN - LIMA - LIMA');
  });

  it('editar el texto después de elegir descarta el código y un fallo de búsqueda se ve bajo el campo', () => {
    fixture.componentRef.setInput('codigo', '150119');
    fixture.componentRef.setInput('texto', '150119 - LURIN - LIMA - LIMA');
    fixture.detectChanges();
    expect(componente.consulta).toBe('150119 - LURIN - LIMA - LIMA');

    api.buscar.mockReturnValue(throwError(() => ({ status: 500, error: { message: 'El catálogo no responde' } })));
    componente.alEscribir('150119 - LURI');
    expect(cambios).toEqual([{ codigo: null, texto: null }]);
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    const ayuda = fixture.nativeElement.querySelector('#u-ayuda') as HTMLElement;
    expect(ayuda.getAttribute('role')).toBe('alert');
    expect(ayuda.textContent).toContain('El catálogo no responde');
  });

  it('un código guardado sin nombre se completa con el catálogo', () => {
    api.obtener.mockReturnValue(of(LURIN));
    fixture.componentRef.setInput('codigo', '150119');
    fixture.detectChanges();
    expect(api.obtener).toHaveBeenCalledWith('150119');
    expect(componente.consulta).toBe('150119 - LURIN - LIMA - LIMA');
  });
});
