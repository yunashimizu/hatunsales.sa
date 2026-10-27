import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { urlConstants } from '../../constants/urlConstants';
import { UnidadMedidaService } from './unidad-medida.service';

describe('UnidadMedidaService', () => {
  let http: HttpTestingController;
  let servicio: UnidadMedidaService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    servicio = TestBed.inject(UnidadMedidaService);
  });

  afterEach(() => http.verify());

  const cargarCatalogo = () => {
    servicio.cargar().subscribe();
    http.expectOne(urlConstants.producto.unidades).flush({
      grupos: ['Conteo', 'Peso'],
      unidades: [
        { codigo: 'NIU', nombre: 'Unidad', abreviatura: 'und', grupo: 'Conteo', frecuente: true, visible: true },
        { codigo: 'MLL', nombre: 'Millar', abreviatura: 'mll', grupo: 'Conteo', frecuente: true, visible: true },
        { codigo: 'KGM', nombre: 'Kilogramo', abreviatura: 'kg', grupo: 'Peso', frecuente: true, visible: true },
      ],
      alias: { UND: 'NIU', KG: 'KGM', MILLAR: 'MLL' },
    });
  };

  it('pide el catálogo una sola vez y llena el mapa síncrono', () => {
    cargarCatalogo();
    servicio.cargar().subscribe();
    expect(servicio.cargado).toBe(true);
    expect(servicio.mapa.get('MLL')?.nombre).toBe('Millar');
    expect(servicio.grupos).toEqual(['Conteo', 'Peso']);
  });

  it('si el servidor falla queda la lista de respaldo y nada se declara inválido', () => {
    servicio.cargar().subscribe();
    http.expectOne(urlConstants.producto.unidades).flush('error', { status: 500, statusText: 'Error' });
    expect(servicio.cargado).toBe(false);
    expect(servicio.mapa.get('NIU')?.abreviatura).toBe('und');
    expect(servicio.resolver('XYZ').estado).toBe('pendiente');
  });

  it('resolver: código de la lista, alias, oculto, inválido y vacío', () => {
    cargarCatalogo();
    expect(servicio.resolver('KGM')).toEqual(expect.objectContaining({ estado: 'ok', codigo: 'KGM' }));
    expect(servicio.resolver('UND')).toEqual(expect.objectContaining({ estado: 'corregida', codigo: 'NIU' }));
    expect(servicio.resolver('kg')).toEqual(expect.objectContaining({ estado: 'corregida', codigo: 'KGM' }));
    expect(servicio.resolver('Millar')).toEqual(expect.objectContaining({ estado: 'corregida', codigo: 'MLL' }));
    expect(servicio.resolver('MIL')).toEqual(expect.objectContaining({ estado: 'oculta', codigo: 'MIL' }));
    expect(servicio.resolver('Plancha X')).toEqual(expect.objectContaining({ estado: 'invalida', original: 'Plancha X' }));
    expect(servicio.resolver('')).toEqual(expect.objectContaining({ estado: 'ok', codigo: 'NIU' }));
    expect(servicio.resolver(null).codigo).toBe('NIU');
  });
});
