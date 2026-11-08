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

  describe('guía enviada sin respuesta de SUNAT (consultar y liberar)', () => {
    function enviada(envio: Record<string, unknown> = {}, acciones: Record<string, unknown> = {}): GuiaRemision {
      const base = pendiente();
      return pendiente({
        estado: 'enviado',
        estado_texto: 'Enviada a SUNAT',
        sunat_ticket: 'T-77',
        error_mensaje: null,
        avisos: [],
        acciones: { puede_editar: false, puede_validar: false, puede_emitir: false, puede_consultar: true, puede_anular: false, puede_liberar: false, ...acciones },
        sunat: { ticket: 'T-77', codigo: null, descripcion: null, cadena_qr: null, codigo_hash: 'hash-1' },
        envio: { ...base.envio!, estado: 'TICKET_PENDIENTE', codigo: null, mensaje: null, consultas: 3, liberable: false, liberado: false, ...envio },
      });
    }

    it('«Consultar ahora» pide el resultado a SUNAT; sin «Liberar» mientras la guía no cumpla los 7 días', async () => {
      await crear({ guia: enviada(), puedeEscribir: true, esAdmin: true, modo: { activo: true } });
      const consultas: GuiaRemision[] = [];
      fixture.componentInstance.consultar.subscribe((g) => consultas.push(g));
      expect(texto()).toContain('Use «Consultar ahora» para pedir el resultado si aún no aparece.');
      expect(boton('Liberar')).toBeUndefined();
      boton('Consultar ahora')!.click();
      expect(consultas).toHaveLength(1);
      expect(consultas[0].id_guia).toBe(5);
    });

    it('tras las consultas rápidas explica que el sistema sigue consultando cada 2 horas hasta por 7 días', async () => {
      await crear({ guia: enviada({ consultas: 12 }), puedeEscribir: true, esAdmin: true, modo: { activo: true } });
      expect(texto()).toContain('el sistema la consulta cada 2 horas hasta por 7 días');
      expect(boton('Consultar ahora')).toBeTruthy();
      expect(boton('Liberar')).toBeUndefined();
    });

    it('cumplidos los 7 días el administrador ve «Liberar» y la explicación de qué revisar antes', async () => {
      await crear({
        guia: enviada({ revision_manual: true, liberable: true, consultas: 90 }, { puede_liberar: true }),
        puedeEscribir: true,
        esAdmin: true,
        modo: { activo: true },
      });
      const liberadas: GuiaRemision[] = [];
      fixture.componentInstance.liberar.subscribe((g) => liberadas.push(g));
      expect(texto()).toContain('SUNAT no resolvió el número de seguimiento en 7 días');
      expect(texto()).toContain('SUNAT Operaciones en Línea');
      boton('Liberar')!.click();
      expect(liberadas.map((g) => g.id_guia)).toEqual([5]);
      expect(boton('Consultar ahora')).toBeTruthy();
    });

    it('«Liberar» es solo del administrador: un vendedor consulta pero no libera', async () => {
      await crear({
        guia: enviada({ revision_manual: true, liberable: true }, { puede_liberar: true }),
        puedeEscribir: true,
        esAdmin: false,
        modo: { activo: true },
      });
      expect(boton('Liberar')).toBeUndefined();
      expect(boton('Consultar ahora')).toBeTruthy();
    });

    it('caja solo mira: ni «Consultar ahora» ni «Liberar»', async () => {
      await crear({ guia: enviada({ liberable: true }, { puede_liberar: true }), puedeEscribir: false, esAdmin: false, modo: { activo: true } });
      expect(boton('Consultar ahora')).toBeUndefined();
      expect(boton('Liberar')).toBeUndefined();
    });

    it('mientras se libera bloquea los botones y lo dice', async () => {
      await crear({
        guia: enviada({ revision_manual: true, liberable: true }, { puede_liberar: true }),
        puedeEscribir: true,
        esAdmin: true,
        modo: { activo: true },
        accion: 'liberar',
      });
      expect(boton('Liberando…')?.disabled).toBe(true);
      expect(boton('Consultar ahora')?.disabled).toBe(true);
    });

    it('una guía liberada avisa que se busque en SUNAT antes de reenviarla y deja «Reintentar envío»', async () => {
      const liberada = pendiente({
        error_mensaje: 'La guía T001-00000005 se liberó: SUNAT no respondió el ticket T-77 en 7 días.',
        avisos: ['La guía se liberó tras 7 días sin respuesta de SUNAT: revise en SUNAT Operaciones en Línea si ya figura registrada antes de reenviarla con «Emitir».'],
        envio: { ...pendiente().envio!, estado: 'PENDIENTE_REENVIO', liberado: true, revision_manual: true },
      });
      await crear({ guia: liberada, puedeEscribir: true, esAdmin: true, modo: { activo: true } });
      expect(texto()).toContain('Guía liberada: revise antes de reenviar');
      expect(texto()).toContain('Si ya figura registrada, no la reenvíe');
      expect(boton('Reintentar envío')?.disabled).toBe(false);
      expect(boton('Liberar')).toBeUndefined();
    });
  });
});
