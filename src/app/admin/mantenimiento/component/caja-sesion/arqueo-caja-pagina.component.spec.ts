import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../../../auth/service/auth.service';
import { urlConstants } from '../../../../constants/urlConstants';
import { ResumenSucursalesCaja, TurnoCajaListado } from '../../../models/caja-arqueo.models';
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
        { provide: AuthService, useValue: { puedeVer: () => false } },
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

  /** Las consultas del listado no son objeto de estas pruebas: se retiran para poder verificar el resto. */
  const ignorarListados = () =>
    http.match((r) => [urlConstants.caja.disponibles, urlConstants.caja.aperturas, urlConstants.caja.resumenSucursales].includes(r.url));

  it('selecciona el turno actual al entrar desde el menú', () => {
    fixture.detectChanges();
    ignorarListados();
    http.expectOne(urlConstants.caja.sesion).flush({ apertura: { id_apertura: 12 } });
    expect(component.idApertura).toBe(12);
    expect(component.idConsulta).toBe(12);
    expect(component.cargando).toBe(false);
  });

  it('permite consultar por URL una apertura anterior sin exigir un turno abierto', () => {
    parametros.next(convertToParamMap({ id_apertura: '12' }));
    fixture.detectChanges();
    ignorarListados();
    expect(component.idApertura).toBe(12);
    http.expectNone(urlConstants.caja.sesion);
  });

  it('rechaza un identificador inválido sin consultar la API', () => {
    parametros.next(convertToParamMap({ id_apertura: '-3' }));
    fixture.detectChanges();
    ignorarListados();
    expect(component.idApertura).toBeNull();
    expect(component.error).toContain('número de turno válido');
    http.expectNone(() => true);
  });

  it('cancela una consulta anterior para no reemplazar el turno elegido después', () => {
    fixture.detectChanges();
    ignorarListados();
    const anterior = http.expectOne(urlConstants.caja.sesion);
    parametros.next(convertToParamMap({ id_apertura: '25' }));
    expect(anterior.cancelled).toBe(true);
    expect(component.idApertura).toBe(25);
  });
});

function turno(cambios: Partial<TurnoCajaListado> = {}): TurnoCajaListado {
  return {
    id_apertura: 31,
    id_caja: 1,
    caja_nombre: 'Caja 1',
    id_sucursal: 1,
    sucursal_nombre: 'Principal',
    id_usuario: 4,
    usuario_nombre: 'Ana Rojas',
    abierta_en: '2026-11-06T13:00:00.000Z',
    cerrada_en: '2026-11-06T22:00:00.000Z',
    monto_inicial: 100,
    efectivo_esperado: 350,
    efectivo_contado: 340,
    diferencia: -10,
    estado: 'cerrado',
    ...cambios,
  };
}

const RESUMEN: ResumenSucursalesCaja = {
  desde: '2026-11-06',
  hasta: '2026-11-06',
  sucursales: [
    {
      id_sucursal: 1,
      nombre: 'Principal',
      turnos: 2,
      turnos_abiertos: 1,
      efectivo_inicial: 150,
      ventas_total: 900,
      por_metodo: [
        { metodo: 'Efectivo', monto: 500 },
        { metodo: 'Yape', monto: 400 },
      ],
      efectivo_esperado: 650,
      efectivo_contado: 640,
      diferencia: -10,
    },
    {
      id_sucursal: null,
      nombre: 'Sin sucursal',
      turnos: 1,
      turnos_abiertos: 0,
      efectivo_inicial: null,
      ventas_total: 80,
      por_metodo: [],
      efectivo_esperado: 80,
      efectivo_contado: 80,
      diferencia: 0,
    },
  ],
  total: {
    turnos: 3,
    turnos_abiertos: 1,
    efectivo_inicial: 150,
    ventas_total: 980,
    por_metodo: [],
    efectivo_esperado: 730,
    efectivo_contado: 720,
    diferencia: -10,
  },
};

describe('ArqueoCajaPaginaComponent: arqueo por sucursal', () => {
  let fixture: ComponentFixture<ArqueoCajaPaginaComponent>;
  let component: ArqueoCajaPaginaComponent;
  let http: HttpTestingController;
  let esAdmin = true;

  const el = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  const todos = (selector: string) => Array.from(fixture.nativeElement.querySelectorAll(selector)) as HTMLElement[];
  const texto = (nodo: HTMLElement | null = fixture.nativeElement) => nodo?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const consulta = (url: string) => http.expectOne((r) => r.url === url);

  const cajas = {
    items: [
      { id_caja: 1, nombre: 'Caja 1', id_sucursal: 1, sucursal_nombre: 'Principal', ocupada: false },
      { id_caja: 2, nombre: 'Caja 2', id_sucursal: 2, sucursal_nombre: 'Norte', ocupada: true },
    ],
  };

  /** Monta la pantalla y responde cajas, sesión, resumen y turnos. Los dos últimos admiten respuesta propia. */
  async function montar(
    opciones: { resumen?: ResumenSucursalesCaja | 'error'; turnos?: object | 'error' } = {},
  ): Promise<void> {
    fixture = TestBed.createComponent(ArqueoCajaPaginaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    consulta(urlConstants.caja.disponibles).flush(cajas);
    http.expectOne(urlConstants.caja.sesion).flush({ apertura: null });
    const resumen = consulta(urlConstants.caja.resumenSucursales);
    if (opciones.resumen === 'error') resumen.flush({ message: 'Servidor ocupado' }, { status: 503, statusText: 'Service Unavailable' });
    else resumen.flush(opciones.resumen ?? RESUMEN);
    const turnos = consulta(urlConstants.caja.aperturas);
    if (opciones.turnos === 'error') turnos.flush({ message: 'Servidor ocupado' }, { status: 503, statusText: 'Service Unavailable' });
    else turnos.flush(opciones.turnos ?? { items: [turno()], total: 1, pagina: 1, por_pagina: 20 });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function escribir(selector: string, valor: string): Promise<void> {
    const campo = el(selector) as HTMLInputElement;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function elegir(selector: string, indice: number): Promise<void> {
    const campo = el(selector) as HTMLSelectElement;
    campo.selectedIndex = indice;
    campo.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    esAdmin = true;
    await TestBed.configureTestingModule({
      imports: [ArqueoCajaPaginaComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { puedeVer: () => esAdmin } },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: new BehaviorSubject(convertToParamMap({})).asObservable(),
            snapshot: { queryParamMap: convertToParamMap({}) },
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('al entrar consulta el día de hoy con 20 turnos por página', async () => {
    fixture = TestBed.createComponent(ArqueoCajaPaginaComponent);
    fixture.detectChanges();
    consulta(urlConstants.caja.disponibles).flush(cajas);
    http.expectOne(urlConstants.caja.sesion).flush({ apertura: null });
    const resumen = consulta(urlConstants.caja.resumenSucursales);
    const turnos = consulta(urlConstants.caja.aperturas);
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    expect(resumen.request.params.get('desde')).toBe(hoy);
    expect(resumen.request.params.get('hasta')).toBe(hoy);
    expect(turnos.request.params.get('desde')).toBe(hoy);
    expect(turnos.request.params.get('pagina')).toBe('1');
    expect(turnos.request.params.get('por_pagina')).toBe('20');
    expect(turnos.request.params.has('id_sucursal')).toBe(false);
    resumen.flush(RESUMEN);
    turnos.flush({ items: [], total: 0, pagina: 1, por_pagina: 20 });
  });

  it('muestra una tarjeta por sucursal, «Sin sucursal» y la tarjeta de total', async () => {
    await montar();
    const tarjetas = todos('.arq-sucursal');
    expect(tarjetas.map((t) => texto(t.querySelector('h3')))).toEqual(['Principal', 'Sin sucursal', 'Total']);
    const principal = texto(tarjetas[0]);
    expect(principal).toContain('2 turnos');
    expect(principal).toContain('1 abierto');
    expect(principal).toContain('Efectivo inicial S/ 150.00');
    expect(principal).toContain('Ventas S/ 900.00');
    expect(principal).toContain('Efectivo esperado S/ 650.00');
    expect(principal).toContain('Efectivo contado S/ 640.00');
    expect(principal).toContain('Efectivo: S/ 500.00');
    expect(principal).toContain('Yape: S/ 400.00');
    // Sin sucursal no tiene efectivo inicial: «sin dato», no S/ 0.00
    expect(texto(tarjetas[1].querySelector<HTMLElement>('.arq-datos__fila dd'))).toBe('sin dato');
    expect(el('.arq-sucursales')).not.toBeNull();
  });

  it('la diferencia distingue falta, cuadra y sobra con texto y no solo con color', async () => {
    await montar();
    const [principal, sin] = todos('.arq-sucursal');
    const dif = principal.querySelector('.arq-dif') as HTMLElement;
    expect(texto(dif)).toBe('Falta S/ 10.00');
    expect(dif.classList.contains('arq-dif--falta')).toBe(true);
    const cuadra = sin.querySelector('.arq-dif') as HTMLElement;
    expect(texto(cuadra)).toBe('Cuadra');
    expect(cuadra.classList.contains('arq-dif--falta')).toBe(false);
    expect(component.textoDiferencia(12.5)).toBe('Sobra S/ 12.50');
    expect(component.textoDiferencia(0.004)).toBe('Cuadra');
    expect(component.textoDiferencia(null)).toBe('—');
  });

  it('con una sola sucursal no repite el total', async () => {
    await montar({ resumen: { ...RESUMEN, sucursales: [RESUMEN.sucursales[0]] } });
    expect(todos('.arq-sucursal')).toHaveLength(1);
  });

  it('lista los turnos con etiquetas por celda para la vista de tarjetas', async () => {
    await montar();
    const fila = el('tbody tr') as HTMLElement;
    const etiquetas = Array.from(fila.querySelectorAll('td')).map((td) => td.getAttribute('data-etiqueta'));
    expect(etiquetas).toEqual(['Turno', 'Apertura', 'Cierre', 'Inicial', 'Esperado', 'Contado', 'Diferencia', 'Estado', 'Arqueo']);
    expect(texto(fila.querySelector('[data-etiqueta="Turno"]') as HTMLElement)).toContain('#31 · Caja 1');
    expect(texto(fila.querySelector('[data-etiqueta="Turno"]') as HTMLElement)).toContain('Ana Rojas');
    expect(texto(fila.querySelector('[data-etiqueta="Inicial"]') as HTMLElement)).toBe('S/ 100.00');
    expect(texto(fila.querySelector('[data-etiqueta="Diferencia"]') as HTMLElement)).toBe('Falta S/ 10.00');
    expect(texto(fila.querySelector('[data-etiqueta="Estado"]') as HTMLElement)).toBe('Cerrado');
  });

  it('un turno con monto_inicial NULL muestra «sin dato», nunca 0', async () => {
    await montar({
      turnos: {
        items: [turno({ monto_inicial: null, cerrada_en: null, efectivo_contado: null, diferencia: null, estado: 'abierto' })],
        total: 1,
        pagina: 1,
        por_pagina: 20,
      },
    });
    const inicial = el('tbody [data-etiqueta="Inicial"]') as HTMLElement;
    expect(texto(inicial)).toBe('sin dato');
    expect(texto(inicial)).not.toContain('0.00');
    expect(texto(el('tbody [data-etiqueta="Estado"]'))).toBe('Abierto');
    expect(texto(el('tbody [data-etiqueta="Contado"]'))).toBe('—');
  });

  it('pagina el listado: página 2 reutiliza los filtros aplicados', async () => {
    await montar({ turnos: { items: [turno()], total: 45, pagina: 1, por_pagina: 20 } });
    expect(texto(el('.arq-paginacion'))).toContain('45 turnos · página 1 de 3');
    expect((el('#arq-anterior') as HTMLButtonElement).disabled).toBe(true);
    (el('#arq-siguiente') as HTMLButtonElement).click();
    const peticion = consulta(urlConstants.caja.aperturas);
    expect(peticion.request.params.get('pagina')).toBe('2');
    peticion.flush({ items: [turno({ id_apertura: 52 })], total: 45, pagina: 2, por_pagina: 20 });
    fixture.detectChanges();
    expect(texto(el('.arq-paginacion'))).toContain('página 2 de 3');
    expect((el('#arq-anterior') as HTMLButtonElement).disabled).toBe(false);
    expect(texto(el('tbody'))).toContain('#52');
  });

  it('sin más de una página no muestra el paginador', async () => {
    await montar();
    expect(el('.arq-paginacion')).toBeNull();
  });

  it('aplica sucursal, caja y fechas; la caja se limita a la sucursal elegida', async () => {
    await montar();
    await elegir('#arq-sucursal', 2); // Todas, Principal, Norte
    expect(todos('#arq-caja option').map((o) => texto(o))).toEqual(['Todas', 'Caja 2']);
    await elegir('#arq-caja', 1);
    await escribir('#arq-desde', '2026-11-01');
    await escribir('#arq-hasta', '2026-11-05');
    (el('#arq-aplicar') as HTMLButtonElement).click();
    const turnos = consulta(urlConstants.caja.aperturas);
    const resumen = consulta(urlConstants.caja.resumenSucursales);
    expect(turnos.request.params.get('id_sucursal')).toBe('2');
    expect(turnos.request.params.get('id_caja')).toBe('2');
    expect(turnos.request.params.get('desde')).toBe('2026-11-01');
    expect(turnos.request.params.get('hasta')).toBe('2026-11-05');
    expect(turnos.request.params.get('pagina')).toBe('1');
    expect(resumen.request.params.get('desde')).toBe('2026-11-01');
    expect(resumen.request.params.has('id_caja')).toBe(false);
    turnos.flush({ items: [], total: 0, pagina: 1, por_pagina: 20 });
    resumen.flush({ ...RESUMEN, sucursales: RESUMEN.sucursales.map((s) => ({ ...s, id_sucursal: 7 })) });
    fixture.detectChanges();
    // El resumen del servidor no filtra por sucursal: la pantalla muestra solo la elegida (aquí ninguna coincide).
    expect(el('#arq-resumen-vacio')).not.toBeNull();
  });

  it('el filtro de usuario solo existe para el administrador', async () => {
    await montar();
    expect(el('#arq-usuario')).not.toBeNull();
    await escribir('#arq-usuario', '4');
    (el('#arq-aplicar') as HTMLButtonElement).click();
    const turnos = consulta(urlConstants.caja.aperturas);
    expect(turnos.request.params.get('id_usuario')).toBe('4');
    consulta(urlConstants.caja.resumenSucursales).flush(RESUMEN);
    turnos.flush({ items: [], total: 0, pagina: 1, por_pagina: 20 });
  });

  it('un vendedor no ve el filtro de usuario ni lo envía', async () => {
    esAdmin = false;
    await montar();
    expect(el('#arq-usuario')).toBeNull();
    component.filtros.id_usuario = 9;
    component.aplicarFiltros();
    const turnos = consulta(urlConstants.caja.aperturas);
    expect(turnos.request.params.has('id_usuario')).toBe(false);
    consulta(urlConstants.caja.resumenSucursales).flush(RESUMEN);
    turnos.flush({ items: [], total: 0, pagina: 1, por_pagina: 20 });
  });

  it('rechaza un rango invertido o de más de 366 días sin consultar', async () => {
    await montar();
    await escribir('#arq-desde', '2026-11-10');
    await escribir('#arq-hasta', '2026-11-05');
    (el('#arq-aplicar') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectNone((r) => r.url === urlConstants.caja.aperturas);
    expect(texto(el('#arq-error-filtro'))).toContain('no puede ser posterior');
    expect(el('#arq-error-filtro')?.getAttribute('role')).toBe('alert');
    await escribir('#arq-desde', '2025-01-01');
    await escribir('#arq-hasta', '2026-11-05');
    (el('#arq-aplicar') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectNone((r) => r.url === urlConstants.caja.aperturas);
    expect(texto(el('#arq-error-filtro'))).toContain('366 días');
  });

  it('«Hoy y todas» restablece los filtros y vuelve a consultar', async () => {
    await montar();
    component.filtros.id_caja = 1;
    component.aplicarFiltros();
    consulta(urlConstants.caja.resumenSucursales).flush(RESUMEN);
    consulta(urlConstants.caja.aperturas).flush({ items: [], total: 0, pagina: 1, por_pagina: 20 });
    fixture.detectChanges();
    (el('#arq-limpiar') as HTMLButtonElement).click();
    const turnos = consulta(urlConstants.caja.aperturas);
    expect(turnos.request.params.has('id_caja')).toBe(false);
    consulta(urlConstants.caja.resumenSucursales).flush(RESUMEN);
    turnos.flush({ items: [], total: 0, pagina: 1, por_pagina: 20 });
  });

  it('estado vacío: sin turnos explica qué hacer y no dibuja la tabla', async () => {
    await montar({
      resumen: { ...RESUMEN, sucursales: [] },
      turnos: { items: [], total: 0, pagina: 1, por_pagina: 20 },
    });
    expect(el('#arq-turnos-vacio')?.getAttribute('role')).toBe('status');
    expect(texto(el('#arq-turnos-vacio'))).toContain('Ningún turno coincide');
    expect(el('#arq-resumen-vacio')).not.toBeNull();
    expect(el('table')).toBeNull();
    expect(el('.arq-sucursales')).toBeNull();
  });

  it('error del listado: aviso con reintento que vuelve a pedir la misma página', async () => {
    await montar({ turnos: 'error' });
    const aviso = el('#arq-turnos-error') as HTMLElement;
    expect(aviso.getAttribute('role')).toBe('alert');
    expect(texto(aviso)).toContain('Servidor ocupado');
    expect(el('table')).toBeNull();
    (el('#arq-turnos-reintentar') as HTMLButtonElement).click();
    const peticion = consulta(urlConstants.caja.aperturas);
    expect(peticion.request.params.get('pagina')).toBe('1');
    peticion.flush({ items: [turno()], total: 1, pagina: 1, por_pagina: 20 });
    fixture.detectChanges();
    expect(el('#arq-turnos-error')).toBeNull();
    expect(el('tbody tr')).not.toBeNull();
  });

  it('error del resumen: aviso con reintento y el listado sigue disponible', async () => {
    await montar({ resumen: 'error' });
    expect(texto(el('#arq-resumen-error'))).toContain('Servidor ocupado');
    expect(el('tbody tr')).not.toBeNull();
    (el('#arq-resumen-reintentar') as HTMLButtonElement).click();
    consulta(urlConstants.caja.resumenSucursales).flush(RESUMEN);
    fixture.detectChanges();
    expect(el('#arq-resumen-error')).toBeNull();
    expect(todos('.arq-sucursal')).toHaveLength(3);
  });

  it('«Ver arqueo» lleva el número del turno al arqueo detallado', async () => {
    await montar();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (el('.arq-ver') as HTMLButtonElement).click();
    expect(component.idConsulta).toBe(31);
    expect(navegar).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { id_apertura: 31 } }));
  });
  describe('descarga del PDF del resumen', () => {
    let clic: ReturnType<typeof vi.spyOn>;
    let crearUrl: ReturnType<typeof vi.fn>;
    let nombreDescargado = '';

    beforeEach(() => {
      crearUrl = vi.fn(() => 'blob:resumen');
      (URL as unknown as { createObjectURL: unknown }).createObjectURL = crearUrl;
      (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
      nombreDescargado = '';
      clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        nombreDescargado = this.download;
      });
    });

    afterEach(() => clic.mockRestore());

    const pdf = () => http.expectOne((r) => r.url === urlConstants.caja.resumenSucursalesPdf);
    const boton = () => el('#arq-resumen-pdf') as HTMLButtonElement;

    it('ofrece «Descargar PDF» con altura táctil y descarga con el rango, sin id_sucursal si no hay sucursal', async () => {
      await montar();
      expect(texto(boton())).toBe('Descargar PDF');
      boton().click();
      const peticion = pdf();
      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
      expect(peticion.request.method).toBe('GET');
      expect(peticion.request.responseType).toBe('blob');
      expect(peticion.request.params.get('desde')).toBe(hoy);
      expect(peticion.request.params.get('hasta')).toBe(hoy);
      expect(peticion.request.params.has('id_sucursal')).toBe(false);
      peticion.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
      fixture.detectChanges();
      expect(crearUrl).toHaveBeenCalledTimes(1);
      expect(clic).toHaveBeenCalledTimes(1);
      expect(nombreDescargado).toBe(`resumen-sucursales-${hoy}.pdf`);
      expect(texto(boton())).toBe('Descargar PDF');
      expect(boton().disabled).toBe(false);
    });

    it('manda id_sucursal solo con la sucursal ya aplicada en el filtro', async () => {
      await montar();
      await elegir('#arq-sucursal', 1);
      component.aplicarFiltros();
      consulta(urlConstants.caja.resumenSucursales).flush(RESUMEN);
      consulta(urlConstants.caja.aperturas).flush({ items: [], total: 0, pagina: 1, por_pagina: 20 });
      fixture.detectChanges();
      boton().click();
      const peticion = pdf();
      expect(peticion.request.params.get('id_sucursal')).toBe('1');
      peticion.flush(new Blob(['%PDF']));
    });

    it('mientras genera dice «Generando…», deshabilita el botón y no duplica la petición', async () => {
      await montar();
      boton().click();
      fixture.detectChanges();
      expect(texto(boton())).toBe('Generando…');
      expect(boton().disabled).toBe(true);
      component.descargarPdf();
      const peticion = pdf();
      peticion.flush(new Blob(['%PDF']));
      fixture.detectChanges();
      expect(boton().disabled).toBe(false);
    });

    it('si falla muestra el motivo y «Reintentar PDF» vuelve a pedirlo', async () => {
      await montar();
      boton().click();
      pdf().flush(
        new Blob([JSON.stringify({ message: 'No se pudo armar el PDF' })], { type: 'application/json' }),
        { status: 500, statusText: 'Server Error' },
      );
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(texto(el('#arq-resumen-pdf-error'))).toContain('No se pudo armar el PDF');
      });
      expect(clic).not.toHaveBeenCalled();
      expect(texto(boton())).toBe('Reintentar PDF');
      expect(boton().disabled).toBe(false);
      boton().click();
      fixture.detectChanges();
      expect(el('#arq-resumen-pdf-error')).toBeNull();
      pdf().flush(new Blob(['%PDF']));
      fixture.detectChanges();
      expect(clic).toHaveBeenCalledTimes(1);
      expect(texto(boton())).toBe('Descargar PDF');
    });
  });
});
