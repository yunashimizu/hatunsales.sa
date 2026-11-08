import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { NotificationService } from '../services/notification.service';
import { ActualizacionAppService, REVISION_VERSION_MS } from './actualizacion-app.service';

describe('ActualizacionAppService', () => {
  let versiones: Subject<any>;
  let sw: { isEnabled: boolean; versionUpdates: Subject<any>; checkForUpdate: ReturnType<typeof vi.fn>; activateUpdate: ReturnType<typeof vi.fn> };
  let aviso: { info: ReturnType<typeof vi.fn> };

  function crear(conSw = true): ActualizacionAppService {
    versiones = new Subject();
    sw = { isEnabled: true, versionUpdates: versiones, checkForUpdate: vi.fn().mockResolvedValue(true), activateUpdate: vi.fn().mockResolvedValue(true) };
    aviso = { info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: NotificationService, useValue: aviso },
        ...(conSw ? [{ provide: SwUpdate, useValue: sw }] : []),
      ],
    });
    return TestBed.inject(ActualizacionAppService);
  }

  afterEach(() => vi.useRealTimers());

  it('con una versión lista muestra un aviso que no se cierra solo, con el botón «Actualizar»', async () => {
    const servicio = crear();
    servicio.iniciar();
    versiones.next({ type: 'VERSION_DETECTED', version: { hash: 'a' } }); // todavía descargando: no avisa
    expect(aviso.info).not.toHaveBeenCalled();

    versiones.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } });
    expect(aviso.info).toHaveBeenCalledTimes(1);
    const [titulo, opciones] = aviso.info.mock.calls[0];
    expect(titulo).toBe('Hay una versión nueva de HatunSales');
    expect(opciones).toMatchObject({ duracion: 0, clave: 'nueva-version', accion: { etiqueta: 'Actualizar' } });

    const recargar = vi.spyOn(servicio as unknown as { recargar(): void }, 'recargar').mockImplementation(() => undefined);
    await opciones.accion.alHacer();
    expect(sw.activateUpdate).toHaveBeenCalledTimes(1);
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('busca versión nueva cada 30 minutos solo si la pestaña está a la vista', () => {
    vi.useFakeTimers();
    const servicio = crear();
    let estado: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => estado);
    servicio.iniciar();

    vi.advanceTimersByTime(REVISION_VERSION_MS);
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);

    estado = 'hidden';
    vi.advanceTimersByTime(REVISION_VERSION_MS);
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);

    estado = 'visible';
    vi.advanceTimersByTime(REVISION_VERSION_MS);
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it('guarda el evento de instalación, lo ofrece una sola vez y lo oculta al instalar', async () => {
    const servicio = crear(false); // sin service worker (como en desarrollo): instalar sigue funcionando
    servicio.iniciar();
    expect(servicio.instalable()).toBe(false);

    const prompt = vi.fn().mockResolvedValue({ outcome: 'accepted' });
    const evento = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt });
    window.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
    expect(servicio.instalable()).toBe(true);

    await servicio.instalar();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(servicio.instalable()).toBe(false);
    await servicio.instalar(); // ya no hay evento: no hace nada
    expect(prompt).toHaveBeenCalledTimes(1);

    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }));
    expect(servicio.instalable()).toBe(true);
    window.dispatchEvent(new Event('appinstalled'));
    expect(servicio.instalable()).toBe(false);
  });
});
