import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GuiaRemision } from '../../../../service/guia-remision.service';
import { DescargaGuia, GuiaDetalleComponent } from './guia-detalle.component';

function pendiente(cambios: Partial<GuiaRemision> = {}): GuiaRemision {
  return {
    id_guia: 5,
    id_venta: null,
    id_comprobante: null,
    serie: 'T001',
    numero: 5,
    numero_formateado: 'T001-00000005',
    estado: 'pendiente',
    estado_texto: 'Pendiente de envío',
    solo_lectura: false,
    fecha_emision: '2026-10-25',
    fecha_inicio_traslado: '2026-10-25',
    motivo_traslado: '04',
    motivo_traslado_texto: 'Traslado entre establecimientos de la misma empresa',
    modalidad_traslado: '01',
    modalidad_traslado_texto: 'Transporte público',
    destinatario: { tipo_documento: '6', numero_documento: '20610206337', denominacion: 'HATUNSALES S.A.C.', direccion: null },
    llegada: { ubigeo: '040101', ubigeo_texto: '040101 - AREQUIPA - AREQUIPA - AREQUIPA', direccion: 'Calle Sur 4', codigo_establecimiento: '0001' },
    documento_relacionado: null,
    sunat_ticket: null,
    error_mensaje: 'SUNAT rechazó las credenciales API: revise el client_id.',
    creado_en: '2026-10-25T15:00:00.000Z',
    acciones: { puede_editar: false, puede_validar: true, puede_emitir: true, puede_consultar: false, puede_anular: false },
    hora_emision: '10:15:00',
    descripcion_motivo: null,
    fecha_entrega_transportista: null,
    peso_bruto_total: 300,
    unidad_peso: 'KGM',
    numero_bultos: 4,
    partida: { ubigeo: '150119', ubigeo_texto: '150119 - LURIN - LIMA - LIMA', direccion: 'Jr. Almacén 1', codigo_establecimiento: '0000' },
    transportista: { ruc: '20123456789', razon_social: 'TRANSPORTES SAC', registro_mtc: null },
    vehiculo: null,
    conductor: null,
    items: [{ id_item: 1, id_producto: 9, id_venta_detalle: null, codigo: 'TAL-1', descripcion: 'Taladro', unidad: 'NIU', cantidad: 2, orden: 0 }],
    observaciones: null,
    sunat: { ticket: null, codigo: null, descripcion: null, cadena_qr: null, codigo_hash: 'hash-1' },
    envio: {
      id_envio: 40,
      estado: 'ERROR_CONFIG',
      codigo: '401',
      mensaje: 'Credenciales API inválidas',
      intento: 1,
      consultas: 0,
      en_curso: false,
      revision_manual: false,
      proximo_intento_en: null,
      actualizado_en: null,
    },
    archivos: ['xml_firmado', 'zip'],
    anulacion: null,
    avisos: ['No se pudo enviar a SUNAT por la configuración: corríjala en el panel de facturación y vuelva a emitir (se conserva el número).'],
    ...cambios,
  };
}

describe('GuiaDetalleComponent', () => {
  let fixture: ComponentFixture<GuiaDetalleComponent>;

  async function crear(entradas: Record<string, unknown>): Promise<void> {
    await TestBed.configureTestingModule({ imports: [GuiaDetalleComponent], providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(GuiaDetalleComponent);
    for (const [nombre, valor] of Object.entries(entradas)) fixture.componentRef.setInput(nombre, valor);
    fixture.detectChanges();
  }

  const texto = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const boton = (etiqueta: string): HTMLButtonElement | undefined =>
    (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent?.includes(etiqueta));

  it('explica un envío detenido por la configuración y deja «Reintentar envío» deshabilitado con el motivo si la GRE no está activa', async () => {
    await crear({ guia: pendiente(), puedeEscribir: true, modo: { activo: false, motivo: 'La guía electrónica está desactivada en el panel de facturación.' } });
    expect(texto()).toContain('No se pudo enviar por la configuración');
    expect(texto()).toContain('revise el client_id');
    expect(texto()).toContain('se conserva el número');
    const reintentar = boton('Reintentar envío')!;
    expect(reintentar.disabled).toBe(true);
    expect(reintentar.getAttribute('aria-describedby')).toBe('gre-detalle-sin-emitir');
    expect(fixture.nativeElement.querySelector('#gre-detalle-sin-emitir')?.textContent).toContain('desactivada en el panel');
    expect(boton('Validar sin enviar')?.disabled).toBe(false);
    expect(boton('Anular')).toBeUndefined();
  });

  it('sin permiso de escritura solo ofrece las descargas que existen', async () => {
    await crear({ guia: pendiente(), puedeEscribir: false, modo: { activo: true } });
    const descargas: DescargaGuia[] = [];
    fixture.componentInstance.descargar.subscribe((d) => descargas.push(d));
    expect(boton('Reintentar envío')).toBeUndefined();
    expect(boton('Validar sin enviar')).toBeUndefined();
    expect(boton('XML firmado')).toBeTruthy();
    expect(boton('Constancia CDR')).toBeUndefined();
    boton('ZIP enviado')!.click();
    boton('PDF')!.click();
    expect(descargas.map((d) => d.tipo)).toEqual(['zip', 'pdf']);
  });
});
