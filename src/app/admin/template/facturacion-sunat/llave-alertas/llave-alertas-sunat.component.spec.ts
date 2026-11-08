import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { urlConstants } from '../../../../constants/urlConstants';
import { AlertService } from '../../../../shared/services/alert.service';
import { ResultadoRecifrado } from '../../../models/fiscal.models';
import { LlaveAlertasSunatComponent } from './llave-alertas-sunat.component';

const URL_ALERTAS = urlConstants.fiscal.estado.replace(/estado$/, 'alertas');
const URL_RECIFRAR = urlConstants.fiscal.estado.replace(/estado$/, 'secretos/recifrar');

describe('LlaveAlertasSunatComponent (tarjeta «Llave y alertas»)', () => {
  let fixture: ComponentFixture<LlaveAlertasSunatComponent>;
  let component: LlaveAlertasSunatComponent;
  let http: HttpTestingController;
  const alerta = { toast: vi.fn(), error: vi.fn(async () => ({}) as unknown), confirmar: vi.fn(async () => true) };

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const q = <T extends HTMLElement>(sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel) as T | null;

  function iniciar(llave = { anterior_definida: false, secretos_con_llave_anterior: 0 }, alertas = { correo: null as string | null, correo_efectivo: 'ventas@hatunsales.pe' as string | null, origen: 'emisor' as const }) {
    fixture.detectChanges();
    http.expectOne(urlConstants.fiscal.estado).flush({ llave });
    http.expectOne(URL_ALERTAS).flush(alertas);
    fixture.detectChanges();
  }

  const RESULTADO: ResultadoRecifrado = {
    revisados: 2, recifrados: 2, ya_vigentes: 0, ilegibles: 0, puede_quitar_llave_anterior: true,
    detalle: [
      { secreto: 'Clave SOL', estado: 'recifrado' },
      { secreto: 'Certificado digital de producción', estado: 'recifrado' },
      { secreto: 'Certificado digital de BETA', estado: 'falta' },
    ],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [LlaveAlertasSunatComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AlertService, useValue: alerta }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LlaveAlertasSunatComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => http.verify());

  it('sin rotación dice que todo está con la llave vigente y recuerda guardar una copia fuera del servidor', () => {
    iniciar();
    expect(q('[data-prueba="sin-rotacion"]')?.textContent).toContain('No hay una rotación de llave en curso');
    expect(q('[data-prueba="rotacion"]')).toBeNull();
    expect(texto()).toContain('copia de la llave fuera del servidor');
    expect(texto()).not.toMatch(/nubefact/i);
  });

  it('con rotación en curso cuenta cuántos secretos faltan y pide no quitar la llave anterior todavía', () => {
    iniciar({ anterior_definida: true, secretos_con_llave_anterior: 2 });
    const aviso = q('[data-prueba="rotacion"]')!.textContent!;
    expect(aviso).toContain('2');
    expect(aviso).toContain('secretos todavía dependen');
    expect(aviso).toContain('No la quite del servidor');
  });

  it('con rotación y 0 pendientes dice que ya se puede quitar', () => {
    iniciar({ anterior_definida: true, secretos_con_llave_anterior: 0 });
    expect(q('[data-prueba="rotacion"]')!.textContent).toContain('puede quitarla del servidor');
  });

  it('«Re-cifrar ahora» pide confirmación; si se cancela no llama al servidor', async () => {
    iniciar({ anterior_definida: true, secretos_con_llave_anterior: 1 });
    alerta.confirmar.mockResolvedValueOnce(false);
    await component.recifrar();
    expect(alerta.confirmar).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Re-cifrar los secretos ahora?' }));
    http.expectNone(URL_RECIFRAR);
  });

  it('confirmado, re-cifra, muestra el resultado por secreto y avisa al panel', async () => {
    iniciar({ anterior_definida: true, secretos_con_llave_anterior: 2 });
    const cambios: void[] = [];
    component.cambio.subscribe(() => cambios.push(undefined));

    const accion = component.recifrar();
    await Promise.resolve();
    await Promise.resolve();
    const peticion = http.expectOne(URL_RECIFRAR);
    expect(peticion.request.method).toBe('POST');
    peticion.flush(RESULTADO);
    await accion;
    fixture.detectChanges();

    const resultado = q('[data-prueba="resultado-recifrado"]')!.textContent!;
    expect(resultado).toContain('2');
    expect(resultado).toContain('Clave SOL');
    expect(resultado).toContain('Re-cifrado con la llave vigente');
    expect(resultado).toContain('No hay nada guardado');
    expect(resultado).toContain('Ya puede quitar la llave anterior');
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Re-cifrados: 2' }));
    expect(cambios.length).toBe(1);
    expect(component.recifrando).toBe(false);
  });

  it('si algún secreto no se pudo abrir lo advierte y no dice que se pueda quitar la llave anterior', async () => {
    iniciar({ anterior_definida: true, secretos_con_llave_anterior: 1 });
    const accion = component.recifrar();
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne(URL_RECIFRAR).flush({
      revisados: 2, recifrados: 0, ya_vigentes: 1, ilegibles: 1, puede_quitar_llave_anterior: false,
      detalle: [{ secreto: 'Clave SOL', estado: 'ilegible' }, { secreto: 'Certificado digital de producción', estado: 'al_dia' }],
    } satisfies ResultadoRecifrado);
    await accion;
    fixture.detectChanges();
    const resultado = q('[data-prueba="resultado-recifrado"]')!.textContent!;
    expect(resultado).toContain('1 sin poder abrirse');
    expect(resultado).toContain('vuelva a cargarlo');
    expect(resultado).not.toContain('Ya puede quitar la llave anterior');
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
  });

  it('guarda el correo de avisos y muestra a dónde llegan; vaciarlo vuelve al del emisor', () => {
    iniciar();
    expect(texto()).toContain('Sin un correo propio, los avisos llegan al del emisor (ventas@hatunsales.pe)');

    component.correo = 'contador@empresa.pe';
    component['cdr'].markForCheck();
    fixture.detectChanges();
    component.guardarCorreo();
    const put = http.expectOne(URL_ALERTAS);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ correo: 'contador@empresa.pe' });
    put.flush({ correo: 'contador@empresa.pe', correo_efectivo: 'contador@empresa.pe', origen: 'configurado' });
    fixture.detectChanges();
    expect(texto()).toContain('Los avisos llegan a contador@empresa.pe');
    expect(alerta.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Correo de avisos guardado' }));
  });

  it('un correo mal escrito no se envía y el botón queda desactivado', () => {
    iniciar();
    component.correo = 'no-es-correo';
    component['cdr'].markForCheck();
    fixture.detectChanges();
    expect(component.correoValido).toBe(false);
    expect(q<HTMLButtonElement>('[data-prueba="guardar-correo"]')!.disabled).toBe(true);
    expect(texto()).toContain('Escriba un correo válido');
    component.guardarCorreo();
    http.expectNone((r) => r.method === 'PUT');
  });

  it('si no se puede cargar muestra el error con «Reintentar»', () => {
    fixture.detectChanges();
    // Al fallar la primera lectura, la otra se cancela (se pide todo junto).
    http.expectOne(urlConstants.fiscal.estado).flush({ message: 'caído' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(q('[role="alert"]')).not.toBeNull();
    (q<HTMLButtonElement>('[role="alert"] button')!).click();
    http.expectOne(urlConstants.fiscal.estado).flush({ llave: { anterior_definida: false, secretos_con_llave_anterior: 0 } });
    // La lectura de avisos de la primera vuelta quedó cancelada: se responde solo la vigente.
    const vigentes = http.match(URL_ALERTAS).filter((r) => !r.cancelled);
    expect(vigentes).toHaveLength(1);
    vigentes[0].flush({ correo: null, correo_efectivo: null, origen: 'ninguno' });
    fixture.detectChanges();
    expect(texto()).toContain('Todavía no hay un correo para los avisos');
  });
});
