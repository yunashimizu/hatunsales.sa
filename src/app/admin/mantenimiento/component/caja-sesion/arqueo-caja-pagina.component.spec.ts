import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { urlConstants } from '../../../../constants/urlConstants';
import { ArqueoCajaPaginaComponent } from './arqueo-caja-pagina.component';

describe('ArqueoCajaPaginaComponent: selección de turno', () => {
  let fixture: ComponentFixture<ArqueoCajaPaginaComponent>;
  let component: ArqueoCajaPaginaComponent;
  let http: HttpTestingController;
  let parametros: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    parametros = new BehaviorSubject(convertToParamMap({}));
    await TestBed.configureTestingModule({
      imports: [ArqueoCajaPaginaComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: parametros.asObservable(),
            get snapshot() {
              return { queryParamMap: parametros.value };
            },
          },
        },
      ],
    })
      .overrideComponent(ArqueoCajaPaginaComponent, { set: { template: '' } })
      .compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ArqueoCajaPaginaComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => http.verify());

  it('selecciona el turno actual al entrar desde el menú', () => {
    fixture.detectChanges();
    http.expectOne(urlConstants.caja.sesion).flush({ apertura: { id_apertura: 12 } });
    expect(component.idApertura).toBe(12);
    expect(component.idConsulta).toBe(12);
    expect(component.cargando).toBe(false);
  });

  it('permite consultar por URL una apertura anterior sin exigir un turno abierto', () => {
    parametros.next(convertToParamMap({ id_apertura: '12' }));
    fixture.detectChanges();
    expect(component.idApertura).toBe(12);
    http.expectNone(urlConstants.caja.sesion);
  });

  it('rechaza un identificador inválido sin consultar la API', () => {
    parametros.next(convertToParamMap({ id_apertura: '-3' }));
    fixture.detectChanges();
    expect(component.idApertura).toBeNull();
    expect(component.error).toContain('número de turno válido');
    http.expectNone(() => true);
  });

  it('cancela una consulta anterior para no reemplazar el turno elegido después', () => {
    fixture.detectChanges();
    const anterior = http.expectOne(urlConstants.caja.sesion);
    parametros.next(convertToParamMap({ id_apertura: '25' }));
    expect(anterior.cancelled).toBe(true);
    expect(component.idApertura).toBe(25);
  });
});
