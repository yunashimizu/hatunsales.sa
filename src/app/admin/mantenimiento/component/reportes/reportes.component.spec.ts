import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ReportesComponent, mesesParaSire } from './reportes.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { GestionService } from '../../service/gestion.service';
import { AuthService } from '../../../../auth/service/auth.service';
import { ReportesService } from '../../../service/reportes.service';
import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { hoyEnLima, rangoDePreset } from './rango-fechas.util';

/**
 * Reporte de ventas: las fechas son días de Lima y el total es NETO (las notas de crédito
 * restan). El backend manda el día del comprobante como 'AAAA-MM-DD' y el periodo como
 * instantes; ninguno debe correrse un día en la pantalla.
 */
describe('ReportesComponent', () => {
  const respuesta = {
    periodo: 'diario',
    fecha_inicio: '2026-10-21T05:00:00.000Z',
    fecha_fin: '2026-10-22T04:59:59.999Z',
    cantidad_comprobantes: 1,
    total_vendido: 70,
    ticket_promedio: 70,
    notas_credito: { cantidad: 1, total: 30 },
    detalle: [
      { id_comprobante: 1, fecha: '2026-10-21', numero_formateado: 'F001-00000001', cliente: 'ACME', estado: 'emitido', total_vendido: 100, tipo_documento: 'venta' },
      { id_comprobante: 2, fecha: '2026-10-21', numero_formateado: 'FC01-00000001', cliente: 'ACME', estado: 'emitido', total_vendido: -30, tipo_documento: 'nota_credito' },
    ],
    estadisticas: {
      venta_maxima: 100, venta_minima: 100, emitidos: 2, anulados: 0, con_error: 0, dias_con_venta: 1,
      serie: [], top_clientes: [], plan: 'Cierre del día',
    },
  };

  const previa = { ...respuesta, total_vendido: 50, cantidad_comprobantes: 2, ticket_promedio: 25 };
  const getReportesVentas = vi.fn((_periodo: string, rango?: { desde?: string; hasta?: string }) =>
    of(rango && rango.desde === '2026-10-20' ? previa : respuesta));
  const alerta = { error: vi.fn(), toast: vi.fn() };
  let esAdmin = true;
  const auth = { puedeVer: vi.fn((roles: string[]) => esAdmin && roles.includes('admin')) };
  const descargarRegistroVentasSire = vi.fn();

  // Análisis de mercado (Fase F): el servidor ya calculó todo; aquí solo se comprueba lo que se dibuja.
  const filaRent = (producto: string, ingreso: number, sinIgv: number, costo: number, extra: Record<string, unknown> = {}) => ({
    id_producto: ingreso, codigo: `C${ingreso}`, producto, categoria: 'Herramientas', cantidad: 4, ingreso, ingreso_sin_igv: sinIgv, costo,
    margen: sinIgv - costo, margen_pct: Math.round(((sinIgv - costo) / sinIgv) * 10000) / 100, ultima_venta: '2026-10-19', sin_costo: false, ...extra,
  });
  const rentabilidad = {
    fecha_inicio: '2026-10-21', fecha_fin: '2026-10-21',
    productos: [filaRent('Martillo', 236, 200, 150), filaRent('Cinta', 80, 80, 0, { sin_costo: true, categoria: 'Ferretería' }), filaRent('Taladro', 590, 500, 520)],
    categorias: [{ categoria: 'Herramientas', productos: 2, cantidad: 8, ingreso: 826, ingreso_sin_igv: 700, costo: 670, margen: 30, margen_pct: 4.29 }],
    totales: { productos: 3, cantidad: 12, ingreso: 906, ingreso_sin_igv: 780, costo: 670, margen: 110, margen_pct: 14.1 },
    recortado: false, nota_costo: 'Margen = venta sin IGV − costo. El costo es la cantidad vendida por el precio de compra actual de cada producto.',
  };
  const estancados = {
    dias: 30, total_productos: 2, valorizado_total: 530, recortado: false,
    productos: [
      { id_producto: 1, codigo: 'T1', producto: 'Taladro percutor', categoria: 'Herramientas', stock: 4, precio_compra: 125, valorizado: 500, ultima_venta: '2026-08-31', dias_sin_venta: 69 },
      { id_producto: 2, codigo: '', producto: 'Cinta métrica', categoria: 'Ferretería', stock: 10, precio_compra: 3, valorizado: 30, ultima_venta: null, dias_sin_venta: null },
    ],
  };
  const celdasMapa = Array.from({ length: 7 * 24 }, (_, i) => ({ dia: Math.floor(i / 24), hora: i % 24, total: 0, ventas: 0 }));
  const poner = (dia: number, hora: number, total: number, ventas: number) => Object.assign(celdasMapa[dia * 24 + hora], { total, ventas });
  poner(4, 16, 300, 3); poner(4, 17, 200, 2); poner(1, 10, 100, 1);
  const mapaCalor = { desde: '2026-09-28', hasta: '2026-10-25', semanas: 4, celdas: celdasMapa, mejor: { dia: 4, hora_inicio: 16, hora_fin: 18, total: 500 } };
  const apiReportes = {
    rentabilidad: vi.fn((_r: unknown) => of(rentabilidad)),
    estancados: vi.fn((_d: number) => of(estancados)),
    mapaCalor: vi.fn((_s?: number) => of(mapaCalor)),
  };

  async function montar(url = '/reportes', admin = true) {
    esAdmin = admin;
    vi.clearAllMocks();
    getReportesVentas.mockImplementation((_periodo, rango) => of(rango && rango.desde === '2026-10-20' ? previa : respuesta));
    await TestBed.configureTestingModule({
      imports: [ReportesComponent],
      providers: [
        provideRouter([{ path: 'reportes', component: ReportesComponent }]),
        {
          provide: GestionService,
          useValue: { getReportesVentas, exportReportesVentasExcel: vi.fn(), exportReportesVentasPdf: vi.fn(), descargarRegistroVentasSire },
        },
        { provide: ReportesService, useValue: apiReportes },
        { provide: AlertService, useValue: alerta },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(ReportesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('muestra el día AAAA-MM-DD tal cual y el periodo en días de Lima', async () => {
    const { componentInstance: c } = await montar();

    expect(c.fechaCorta('2026-10-21')).toBe('21/10/2026');
    expect(c.fechaCorta('2026-10-21T05:00:00.000Z')).toBe('21/10/2026');
    expect(c.fechaCorta('2026-10-22T04:59:59.999Z')).toBe('21/10/2026');
  });

  it('explica que el total es neto y marca la nota de crédito en el detalle', async () => {
    const fixture = await montar();
    const texto: string = fixture.nativeElement.textContent;

    expect(fixture.componentInstance.notasCredito).toEqual({ cantidad: 1, total: 30 });
    expect(texto).toContain('1 nota de crédito');
    expect(texto).toContain('Nota de crédito');
    expect(texto).toContain('21/10/2026');
    expect(texto).not.toContain('20/10/2026');
  });

  describe('fechas, comparación, tipos y CSV (R17e)', () => {
    it('un atajo manda el rango al servidor, deselecciona el periodo y deja el rango en la URL', async () => {
      const fixture = await montar();
      const c = fixture.componentInstance;
      getReportesVentas.mockClear();

      c.elegirPreset('mes-pasado');
      fixture.detectChanges();

      const esperado = rangoDePreset('mes-pasado', hoyEnLima())!;
      expect(getReportesVentas).toHaveBeenCalledWith('mensual', esperado);
      expect(c.rango).toEqual(esperado);
      expect(c.presetActivo).toBe('mes-pasado');
      expect(c.etiquetaActiva).toBe('Mes pasado');
      const marcados = fixture.nativeElement.querySelectorAll('.rep-seg[aria-pressed="true"]');
      expect(marcados).toHaveLength(0);
      await vi.waitFor(() => expect(TestBed.inject(Router).url).toContain(`desde=${esperado.desde}&hasta=${esperado.hasta}`));

      c.elegirPeriodo('anual');
      expect(c.rango).toBeNull();
      expect(getReportesVentas).toHaveBeenCalledWith('anual', undefined);
    });

    it('el rango personalizado se valida y, si está bien, se consulta; con la URL abre ya con ese rango', async () => {
      const fixture = await montar();
      const c = fixture.componentInstance;
      getReportesVentas.mockClear();

      c.fechaDesde = '2026-10-10';
      c.fechaHasta = '2026-10-01';
      c.aplicarPersonalizado();
      expect(c.errorFechas).toContain('no puede ser posterior');
      expect(getReportesVentas).not.toHaveBeenCalled();

      c.fechaHasta = '2026-10-20';
      c.aplicarPersonalizado();
      expect(getReportesVentas).toHaveBeenCalledWith('mensual', { desde: '2026-10-10', hasta: '2026-10-20' });
      expect(c.presetActivo).toBe('personalizado');
      expect(c.etiquetaActiva).toBe('Fechas elegidas');

      TestBed.resetTestingModule();
      getReportesVentas.mockClear();
      const desdeUrl = await montar('/reportes?desde=2026-09-01&hasta=2026-09-30');
      expect(desdeUrl.componentInstance.rango).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
      expect(getReportesVentas.mock.calls[0]).toEqual(['mensual', { desde: '2026-09-01', hasta: '2026-09-30' }]);
    });

    it('compara con el periodo anterior y muestra los cambios; sin referencia si antes no hubo ventas', async () => {
      const fixture = await montar();
      const c = fixture.componentInstance;

      // El periodo anterior del 21/10 es el 20/10 (se pide con las fechas que devolvió el servidor).
      expect(getReportesVentas).toHaveBeenCalledWith('diario', { desde: '2026-10-20', hasta: '2026-10-20' }, { silenciosa: true });
      expect(c.deltaTotal).toMatchObject({ tipo: 'sube', texto: '40,0 %' });
      expect(c.deltaComprobantes).toMatchObject({ tipo: 'baja', texto: '50,0 %' });
      expect(c.deltaTicket).toMatchObject({ tipo: 'sube', texto: '180,0 %'.replace(',0', '') });
      const texto: string = fixture.nativeElement.textContent;
      expect(texto).toContain('▲');
      expect(texto).toContain('vs. periodo anterior (20/10)'); // sin año: es del año en curso

      getReportesVentas.mockImplementation((_p, rango) => of(rango && rango.desde === '2026-10-20' ? { ...previa, total_vendido: 0 } : respuesta));
      c.cargar();
      expect(c.deltaTotal).toMatchObject({ tipo: 'sin-referencia', texto: 'Sin referencia' });
    });

    it('muestra el reparto por tipo con la barra apilada y la línea de notas', async () => {
      getReportesVentas.mockClear();
      const conTipos = {
        ...respuesta,
        notas_debito: { cantidad: 1, total: 12.5 },
        por_tipo: [
          { id_tipo: 1, tipo: 'Facturas', cantidad: 2, total: 300 },
          { id_tipo: 2, tipo: 'Boletas', cantidad: 5, total: 100 },
          { id_tipo: 7, tipo: 'Notas de crédito', cantidad: 1, total: -30 },
        ],
      };
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ReportesComponent],
        providers: [
          provideRouter([]),
          { provide: GestionService, useValue: { getReportesVentas: vi.fn(() => of(conTipos)) } },
          { provide: AlertService, useValue: alerta },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(ReportesComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const tarjeta: HTMLElement = fixture.nativeElement.querySelector('.rep-tipos');
      expect(tarjeta.querySelectorAll('tbody tr')).toHaveLength(2); // las notas no son filas: van en su línea
      expect(tarjeta.textContent).toContain('75 %');
      expect(tarjeta.textContent).toContain('25 %');
      expect(tarjeta.querySelector('.rep-tipos__barra')!.getAttribute('aria-label')).toBe('Reparto de lo vendido: Facturas 75 %, Boletas 25 %');
      expect(tarjeta.querySelectorAll('.rep-tipos__tramo')).toHaveLength(2);
      expect(tarjeta.textContent).toMatch(/Notas de crédito:\s*1\s*\(−S\/\s*30\.00\)/);
      expect(tarjeta.textContent).toMatch(/Notas de débito:\s*1\s*\(\+S\/\s*12\.50\)/);
    });

    it('descarga el detalle en CSV con el tipo de cada comprobante', async () => {
      const fixture = await montar();
      let blob: Blob | null = null;
      let nombre = '';
      vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b as Blob; return 'blob:x'; });
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { nombre = this.download; });

      fixture.nativeElement.querySelector('#rep-csv').click();

      const lineas = (await blob!.text()).split('\r\n').filter(Boolean);
      expect(nombre).toMatch(/^ventas_diario-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(lineas[0]).toBe('"Fecha","Tipo","Comprobante","Cliente","Documento","Estado","Total"');
      expect(lineas[1]).toBe('"2026-10-21","Comprobante","F001-00000001","ACME","","emitido",100');
      expect(lineas[2]).toBe('"2026-10-21","Nota de crédito","FC01-00000001","ACME","","emitido",-30');
      expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'CSV descargado: 2 filas' }));
      vi.restoreAllMocks();
    });
  });
  describe('registro de ventas para el SIRE (SUNAT-4)', () => {
    const resumen = {
      periodo: '202610', filas: 3, anulados: 1,
      por_tipo: { factura: 2, boleta: 0, nota_credito: 1, nota_debito: 0 }, en_dolares: 1,
      omitidos: { pruebas: 2, con_error: 0, rechazados: 0, sin_aceptar: 1, anulados_sin_sunat: 0 },
      aviso: 'Estructura basada en PLE 14.1; el contador debe validar el primer archivo contra la propuesta SIRE.',
    };
    const respuestaSire = (nombre: string, cuerpo = 'a|b\r\n', cabeceraResumen: string | null = encodeURIComponent(JSON.stringify(resumen))) =>
      new HttpResponse<Blob>({
        body: new Blob([cuerpo]),
        headers: new HttpHeaders({
          'Content-Disposition': `attachment; filename="${nombre}"`,
          ...(cabeceraResumen ? { 'X-Rvie-Resumen': cabeceraResumen } : {}),
        }),
      });

    beforeEach(() => {
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:x');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('los últimos 12 meses de Lima, del actual hacia atrás, cruzando el año', () => {
      const meses = mesesParaSire('2026-02-15');
      expect(meses).toHaveLength(12);
      expect(meses[0]).toEqual({ valor: '202602', etiqueta: 'Febrero 2026' });
      expect(meses[1]).toEqual({ valor: '202601', etiqueta: 'Enero 2026' });
      expect(meses[2]).toEqual({ valor: '202512', etiqueta: 'Diciembre 2025' });
      expect(meses[11]).toEqual({ valor: '202503', etiqueta: 'Marzo 2025' });
    });

    it('el administrador ve «Registro de ventas (SIRE)»; el vendedor o el cajero, no', async () => {
      const admin = await montar();
      expect(admin.nativeElement.querySelector('#rep-sire-boton')?.textContent).toContain('Registro de ventas (SIRE)');
      expect(auth.puedeVer).toHaveBeenCalledWith(['admin']);
      TestBed.resetTestingModule();
      const otro = await montar('/reportes', false);
      expect(otro.nativeElement.querySelector('#rep-sire-boton')).toBeNull();
      // Aunque llamen al método a mano, no descarga.
      otro.componentInstance.mesSire = '202610';
      otro.componentInstance.descargarSire('txt');
      expect(descargarRegistroVentasSire).not.toHaveBeenCalled();
    });

    it('al abrir propone el mes anterior, lista 12 meses, explica el aviso al contador y se cierra con Escape', async () => {
      const fixture = await montar();
      fixture.nativeElement.querySelector('#rep-sire-boton').click();
      fixture.detectChanges();
      const panel = fixture.nativeElement.querySelector('#rep-sire-panel') as HTMLElement;
      expect(panel).toBeTruthy();
      expect(panel.querySelectorAll('select option').length).toBe(12);
      const c = fixture.componentInstance;
      expect(c.mesSire).toBe(c.mesesSire[1].valor);
      expect(panel.textContent).toContain('Estructura basada en PLE 14.1; el contador debe validar el primer archivo contra la propuesta SIRE.');
      expect(panel.textContent).toContain('Compare el archivo con la propuesta de SUNAT antes de aceptarla');
      expect(panel.textContent).toContain('TXT para el SIRE');
      expect(panel.textContent).toContain('CSV para el contador');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('#rep-sire-panel')).toBeNull();
    });

    it('«TXT para el SIRE» pide el mes elegido, descarga con el nombre del servidor y cuenta qué quedó fuera', async () => {
      descargarRegistroVentasSire.mockReturnValue(of(respuestaSire('LE20610206337202610001404000211'+'12.txt')));
      const fixture = await montar();
      let nombre = '';
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { nombre = this.download; });
      fixture.nativeElement.querySelector('#rep-sire-boton').click();
      fixture.detectChanges();
      fixture.componentInstance.mesSire = '202610';

      fixture.nativeElement.querySelector('#rep-sire-txt').click();
      fixture.detectChanges();

      expect(descargarRegistroVentasSire).toHaveBeenCalledWith('202610', 'txt');
      expect(nombre).toBe('LE20610206337202610001404000211'+'12.txt');
      const texto = fixture.nativeElement.querySelector('.rep-sire__resumen').textContent as string;
      expect(texto).toContain('3 comprobantes en el archivo');
      expect(texto).toContain('1 dado de baja, en cero');
      expect(texto).toContain('1 comprobante todavía sin aceptar por SUNAT');
      expect(texto).toContain('2 de prueba (BETA)');
      expect(texto).toContain('1 en dólares');
      expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Registro de ventas (TXT) descargado', message: '3 comprobantes.' }));
    });

    it('«CSV para el contador» pide el CSV; un mes sin ventas se dice en palabras; sin cabeceras del servidor usa un nombre propio', async () => {
      const vacio = { ...resumen, filas: 0, anulados: 0, en_dolares: 0, omitidos: { ...resumen.omitidos, pruebas: 0, sin_aceptar: 0 } };
      descargarRegistroVentasSire.mockReturnValue(of(new HttpResponse<Blob>({ body: new Blob(['x']), headers: new HttpHeaders({ 'X-Rvie-Resumen': encodeURIComponent(JSON.stringify(vacio)) }) })));
      const fixture = await montar();
      let nombre = '';
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { nombre = this.download; });
      fixture.nativeElement.querySelector('#rep-sire-boton').click();
      fixture.detectChanges();
      fixture.componentInstance.mesSire = '202609';

      fixture.nativeElement.querySelector('#rep-sire-csv').click();
      fixture.detectChanges();

      expect(descargarRegistroVentasSire).toHaveBeenCalledWith('202609', 'csv');
      expect(nombre).toBe('registro-ventas-sire-202609.csv');
      expect(fixture.nativeElement.querySelector('.rep-sire__resumen').textContent).toContain('El mes no tiene ventas aceptadas por SUNAT');
      expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ message: 'El mes no tiene ventas aceptadas por SUNAT.' }));
    });

    it('una cabecera de resumen dañada no impide la descarga; un error del servidor se muestra y el botón vuelve', async () => {
      descargarRegistroVentasSire.mockReturnValueOnce(of(respuestaSire('LE1.txt', 'a', '%%%no-es-json')));
      const fixture = await montar();
      const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      fixture.nativeElement.querySelector('#rep-sire-boton').click();
      fixture.detectChanges();
      fixture.nativeElement.querySelector('#rep-sire-txt').click();
      fixture.detectChanges();
      expect(clic).toHaveBeenCalledTimes(1);
      expect(fixture.componentInstance.resumenSire).toBeNull();

      descargarRegistroVentasSire.mockReturnValueOnce(throwError(() => ({ status: 400, error: { message: 'Periodo inválido' } })));
      fixture.nativeElement.querySelector('#rep-sire-txt').click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(alerta.error).toHaveBeenCalled();
      expect(fixture.componentInstance.descargandoSire).toBeNull();
    });
  });
  describe('análisis de mercado: rentabilidad, estancados y mapa de calor (Fase F)', () => {
    const pestana = (fixture: { nativeElement: HTMLElement }, id: string) =>
      fixture.nativeElement.querySelector<HTMLButtonElement>(`#rm-tab-${id}`)!;
    const filas = (fixture: { nativeElement: HTMLElement }) =>
      Array.from(fixture.nativeElement.querySelectorAll('.rm-tabla[aria-label="Rentabilidad por producto"] tbody tr .adm-tabla__principal')).map((n) => n.textContent!.trim());

    it('el administrador ve la rentabilidad del mismo rango del reporte, con margen, totales y categorías', async () => {
      const fixture = await montar();

      expect(apiReportes.rentabilidad).toHaveBeenCalledWith({ fecha_inicio: '2026-10-21', fecha_fin: '2026-10-21' });
      const texto: string = fixture.nativeElement.querySelector('app-reporte-mercado').textContent;
      expect(texto).toContain('Martillo');
      expect(texto).toContain('Margen = venta sin IGV − costo (precio de compra registrado en el producto). Si tus precios de compra incluyen IGV, el margen real es algo mayor.');
      expect(texto).toContain('Venta sin IGV');
      expect(texto).toContain('Total cobrado');
      expect(texto).toContain('S/ 50.00');
      expect(texto).toContain('25.0 %');
      expect(texto).toContain('Por categoría');
      expect(texto).toContain('S/ 110.00');
      expect(texto).toContain('sin costo');
      expect(texto).toContain('1 producto no tiene precio de compra');
      expect(pestana(fixture, 'rentabilidad').getAttribute('aria-selected')).toBe('true');
      // El mapa de calor no se pide hasta que se abre su pestaña.
      expect(apiReportes.mapaCalor).not.toHaveBeenCalled();
    });

    it('ordena por margen con aria-sort y el CSV sale en ese orden, marcando los productos sin precio de compra', async () => {
      const fixture = await montar();
      const raiz: HTMLElement = fixture.nativeElement;
      expect(filas(fixture)).toEqual(['Martillo', 'Cinta', 'Taladro']);

      const botonMargen = raiz.querySelectorAll<HTMLButtonElement>('.rm-tabla[aria-label="Rentabilidad por producto"] thead .adm-tabla__orden')[4];
      botonMargen.click();
      fixture.detectChanges();
      expect(botonMargen.closest('th')!.getAttribute('aria-sort')).toBe('ascending');
      expect(filas(fixture)).toEqual(['Taladro', 'Martillo', 'Cinta']);
      botonMargen.click();
      fixture.detectChanges();
      expect(filas(fixture)).toEqual(['Cinta', 'Martillo', 'Taladro']);

      let blob: Blob | null = null;
      let nombre = '';
      vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b as Blob; return 'blob:x'; });
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { nombre = this.download; });
      raiz.querySelector<HTMLButtonElement>('#rm-csv-rent')!.click();
      const lineas = (await blob!.text()).replace('\uFEFF', '').split('\r\n').filter(Boolean);
      expect(lineas[0]).toBe('"Producto","Código","Categoría","Vendido","Venta sin IGV","Total cobrado (con IGV)","Costo","Margen S/","Margen %","Última venta","Sin precio de compra"');
      expect(lineas[1]).toContain('"Cinta"');
      expect(lineas[1]).toContain('"sí"');
      expect(lineas[2]).toContain('"Martillo"');
      expect(lineas).toHaveLength(4);
      expect(nombre).toBe(`rentabilidad_2026-10-21_a_2026-10-21-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}.csv`);
      vi.restoreAllMocks();
    });

    it('la tabla trae «Venta sin IGV» antes del costo, el margen sobre esa base y «Total cobrado» al final', async () => {
      const fixture = await montar();
      const raiz: HTMLElement = fixture.nativeElement;
      const cabeceras = Array.from(raiz.querySelectorAll('.rm-tabla[aria-label="Rentabilidad por producto"] thead th')).map((t) => t.textContent!.trim());
      expect(cabeceras).toEqual(['Producto', 'Vendido', 'Venta sin IGV', 'Costo', 'Margen S/', 'Margen %', 'Última venta', 'Total cobrado']);
      const celdas = Array.from(raiz.querySelectorAll('.rm-tabla[aria-label="Rentabilidad por producto"] tbody tr:first-child td')).map((t) => t.textContent!.trim());
      expect(celdas[2]).toBe('S/ 200.00');
      expect(celdas[4]).toBe('S/ 50.00');
      expect(celdas[7]).toBe('S/ 236.00');
    });

    it('un vendedor no ve costos: solo el mapa de calor, y no pide rentabilidad ni estancados', async () => {
      const fixture = await montar('/reportes', false);

      expect(apiReportes.rentabilidad).not.toHaveBeenCalled();
      expect(apiReportes.estancados).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelectorAll('[role="tab"]')).toHaveLength(1);
      expect(pestana(fixture, 'calor').getAttribute('aria-selected')).toBe('true');
      expect(apiReportes.mapaCalor).toHaveBeenCalledWith(4);
      expect(fixture.nativeElement.querySelector('app-reporte-mercado').textContent).toContain('Mejor franja: jueves 16–18 h');
    });

    it('stock estancado: pide 30 días, cambia a 60, muestra «nunca se vendió» y exporta', async () => {
      const fixture = await montar();
      const raiz: HTMLElement = fixture.nativeElement;
      pestana(fixture, 'estancados').click();
      fixture.detectChanges();

      expect(apiReportes.estancados).toHaveBeenCalledWith(30);
      const texto = raiz.querySelector('#rm-panel-estancados')!.textContent!;
      expect(texto).toContain('2 productos parados hace 30 días o más');
      expect(texto).toContain('S/ 530.00');
      expect(texto).toContain('Taladro percutor');
      expect(texto).toContain('hace 69 días');
      expect(texto).toContain('Nunca se vendió');

      const segmentos = Array.from(raiz.querySelectorAll<HTMLButtonElement>('#rm-panel-estancados .adm-segmento'));
      expect(segmentos.map((b) => b.textContent!.trim())).toEqual(['30 días', '60 días', '90 días']);
      segmentos[1].click();
      fixture.detectChanges();
      expect(apiReportes.estancados).toHaveBeenLastCalledWith(60);

      let blob: Blob | null = null;
      vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b as Blob; return 'blob:x'; });
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      raiz.querySelector<HTMLButtonElement>('#rm-csv-est')!.click();
      expect((await blob!.text())).toContain('"nunca"');
      vi.restoreAllMocks();
    });

    it('mapa de calor: rejilla de 7 × 24, mejor franja resaltada, etiquetas accesibles y flechas del teclado', async () => {
      const fixture = await montar();
      const raiz: HTMLElement = fixture.nativeElement;
      pestana(fixture, 'calor').click();
      fixture.detectChanges();

      expect(apiReportes.mapaCalor).toHaveBeenCalledWith(4);
      expect(raiz.querySelectorAll('.rm-celda')).toHaveLength(168);
      expect(raiz.querySelector('#rm-panel-calor')!.textContent).toContain('Mejor franja: jueves 16–18 h');
      // jueves es la cuarta fila (lunes primero), a las 16 y 17 h.
      const jueves16 = raiz.querySelector<HTMLButtonElement>('.rm-celda[data-f="3"][data-h="16"]')!;
      expect(jueves16.getAttribute('aria-label')).toBe('jueves de 16:00 a 17:00: S/ 300.00, 3 ventas');
      expect(jueves16.classList.contains('rm-celda--mejor')).toBe(true);
      expect(raiz.querySelector('.rm-celda[data-f="3"][data-h="17"]')!.classList.contains('rm-celda--mejor')).toBe(true);
      expect(raiz.querySelector('.rm-celda[data-f="3"][data-h="18"]')!.classList.contains('rm-celda--mejor')).toBe(false);
      expect(raiz.querySelector('.rm-celda[data-f="0"][data-h="3"]')!.getAttribute('aria-label')).toContain('sin ventas');
      // La celda más fuerte tiene intensidad 1; la de 100 soles, menos.
      expect(jueves16.style.getPropertyValue('--i')).toBe('1');
      expect(Number(raiz.querySelector<HTMLElement>('.rm-celda[data-f="0"][data-h="10"]')!.style.getPropertyValue('--i'))).toBeLessThan(0.6);

      // El foco empieza en la mejor franja (una sola parada de Tab) y las flechas lo mueven.
      expect(raiz.querySelectorAll('.rm-celda[tabindex="0"]')).toHaveLength(1);
      expect(jueves16.getAttribute('tabindex')).toBe('0');
      jueves16.focus();
      jueves16.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      fixture.detectChanges();
      expect(document.activeElement).toBe(raiz.querySelector('.rm-celda[data-f="3"][data-h="17"]'));
      expect(raiz.querySelector('.adm-tooltip-grafico')!.textContent).toContain('Jueves 17:00–18:00');
    });

    it('si una consulta falla se avisa con «Reintentar», y otro rango del reporte vuelve a pedir la rentabilidad', async () => {
      apiReportes.rentabilidad.mockReturnValueOnce(throwError(() => ({ status: 500, error: { message: 'Error interno' } })));
      const fixture = await montar();
      const raiz: HTMLElement = fixture.nativeElement;
      const aviso = raiz.querySelector('#rm-panel-rentabilidad [role="alert"]') as HTMLElement;
      expect(aviso).not.toBeNull();

      apiReportes.rentabilidad.mockClear();
      aviso.querySelector('button')!.click();
      fixture.detectChanges();
      expect(apiReportes.rentabilidad).toHaveBeenCalledTimes(1);
      expect(raiz.querySelector('#rm-panel-rentabilidad [role="alert"]')).toBeNull();

      fixture.componentInstance.elegirPreset('mes-pasado');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const esperado = rangoDePreset('mes-pasado', hoyEnLima())!;
      // El mock devuelve siempre la misma respuesta del 21/10, así que el rango nuevo no cambia el input; se comprueba el rango pedido.
      expect(getReportesVentas).toHaveBeenCalledWith('mensual', esperado);
    });
  });
});
