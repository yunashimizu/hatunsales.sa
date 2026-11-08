import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ResultadoComprobante } from '../../../../models/documentos.models';
import { ResultadoSunatComponent } from './resultado-sunat.component';

describe('ResultadoSunatComponent', () => {
  let fixture: ComponentFixture<ResultadoSunatComponent>;

  function mostrar(resultado: ResultadoComprobante, titular: string | null = null): HTMLElement {
    fixture = TestBed.createComponent(ResultadoSunatComponent);
    fixture.componentRef.setInput('resultado', resultado);
    fixture.componentRef.setInput('titular', titular);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ResultadoSunatComponent] }).compileComponents();
  });

  it('rechazado: título, motivo, código de SUNAT, qué hacer y la marca BETA, como alerta', () => {
    const vista = mostrar({
      numero_formateado: 'BB01-00000009',
      estado: 'error',
      estado_sunat: 'RECHAZADO',
      error: 'El RUC del receptor no existe',
      sunat_responsecode: '2017',
      ambiente_fiscal: 'beta',
    });
    expect(vista.querySelector('[role="alert"]')).not.toBeNull();
    expect(vista.textContent).toContain('Rechazado por SUNAT');
    expect(vista.textContent).toContain('BB01-00000009');
    expect(vista.textContent).toContain('El RUC del receptor no existe');
    expect(vista.querySelector('.rs__codigo')?.textContent).toContain('2017');
    expect(vista.textContent).toContain('emita un documento nuevo');
    expect(vista.textContent).toContain('Prueba SUNAT BETA - sin validez tributaria');
  });

  it('el titular del backend va primero y no se repite el mensaje que ya contiene', () => {
    const vista = mostrar(
      { estado: 'emitido', estado_sunat: 'ACEPTADO', aceptada_sunat: true, sunat_description: 'La Nota de Credito numero FC01-4, ha sido aceptada' },
      'SUNAT aceptó la nota FC01-00000004 (La Nota de Credito numero FC01-4, ha sido aceptada).',
    );
    const textos = Array.from(vista.querySelectorAll('.rs__texto')).map((p) => p.textContent?.trim());
    expect(textos[0]).toContain('SUNAT aceptó la nota FC01-00000004');
    expect(textos.filter((t) => t?.includes('ha sido aceptada')).length).toBe(1);
    expect(vista.querySelector('[role="status"]')).not.toBeNull();
    expect(vista.querySelector('.rs__codigo')).toBeNull();
  });
  it('aceptado con observaciones: lista cada observación con su código y explica que no invalidan el comprobante', () => {
    const vista = mostrar({
      numero_formateado: 'F001-00000012',
      estado: 'emitido',
      estado_sunat: 'ACEPTADO_OBS',
      aceptada_sunat: true,
      sunat_description: 'La Factura numero F001-12, ha sido aceptada',
      sunat_observaciones: [{ codigo: '4287', descripcion: 'El código de producto SUNAT no es válido' }],
    });
    expect(vista.textContent).toContain('Aceptado por SUNAT con observaciones');
    expect(vista.querySelector('.rs__observaciones li')?.textContent).toContain('4287');
    expect(vista.querySelector('.rs__observaciones li')?.textContent).toContain('El código de producto SUNAT no es válido');
    expect(vista.querySelector('.rs__siguiente')?.textContent).toContain('no invalidan el comprobante');
    expect(vista.querySelector('[role="status"]')).not.toBeNull();
    expect(vista.querySelector('.rs__codigo')).toBeNull();
  });

  it('«SUNAT lo está procesando» y «Va en el resumen diario» usan el glosario (sin ticket ni CDR)', () => {
    const procesando = mostrar({ estado: 'pendiente', estado_sunat: 'TICKET_PENDIENTE' });
    expect(procesando.textContent).toContain('SUNAT lo está procesando');
    expect(procesando.textContent).not.toMatch(/ticket|CDR/i);
    expect(procesando.querySelector('.adm-aviso--aviso')).not.toBeNull();

    const resumen = mostrar({ estado: 'emitido', estado_sunat: 'POR_RESUMIR' });
    expect(resumen.textContent).toContain('Va en el resumen diario');
    expect(resumen.querySelector('.adm-aviso--info')).not.toBeNull();
  });

  it('requiere revisión: en rojo, con el mensaje y qué verificar en SUNAT Operaciones en Línea', () => {
    const vista = mostrar({ estado: 'pendiente', estado_sunat: 'EXCEPCION', error: 'SUNAT no respondió en 6 intentos' });
    expect(vista.querySelector('[role="alert"]')).not.toBeNull();
    expect(vista.textContent).toContain('Requiere revisión');
    expect(vista.textContent).toContain('SUNAT no respondió en 6 intentos');
    expect(vista.textContent).toContain('SUNAT Operaciones en Línea');
  });

  it('en proceso por recibir la constancia: dice «constancia de SUNAT», no CDR, y que no se reenvíe', () => {
    const vista = mostrar({ estado: 'pendiente', estado_sunat: 'PENDIENTE_REENVIO', accion_sunat: 'RECUPERAR_CDR' });
    expect(vista.textContent).toContain('constancia de SUNAT');
    expect(vista.textContent).toContain('no lo reenvíe');
    expect(vista.textContent).not.toMatch(/\bCDR\b/);
  });

  it('error de configuración: lo manda a un administrador y lo marca como alerta; sin número no pinta el punto medio', () => {
    const vista = mostrar({ estado: 'pendiente', estado_sunat: 'ERROR_CONFIG', error: 'Falta el certificado' });
    expect(vista.querySelector('[role="alert"]')).not.toBeNull();
    expect(vista.textContent).toContain('No se envió: error de configuración');
    expect(vista.textContent).toContain('Un administrador debe revisar');
    expect(vista.querySelector('.rs__numero')).toBeNull();
  });

  it('un rechazo sin código útil no pinta la línea del código; con código distinto de 0 sí', () => {
    const sin = mostrar({ estado: 'error', estado_sunat: 'RECHAZADO', error: 'RUC inválido', sunat_responsecode: '0' });
    expect(sin.querySelector('.rs__codigo')).toBeNull();
    const con = mostrar({ estado: 'error', estado_sunat: 'RECHAZADO', error: 'RUC inválido', sunat_responsecode: '2017' });
    expect(con.querySelector('.rs__codigo')?.textContent).toContain('2017');
  });
});
