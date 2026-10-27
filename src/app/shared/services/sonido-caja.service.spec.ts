import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SonidoCajaService } from './sonido-caja.service';

describe('SonidoCajaService', () => {
  const globalAny = globalThis as unknown as { AudioContext?: unknown };
  const original = globalAny.AudioContext;
  let frecuencias: number[];
  let resume: ReturnType<typeof vi.fn>;
  let estado: string;
  let instancias: number;

  function instalarAudioContext(): void {
    frecuencias = [];
    instancias = 0;
    estado = 'suspended';
    resume = vi.fn(() => Promise.resolve());
    globalAny.AudioContext = vi.fn(function (this: Record<string, unknown>) {
      instancias++;
      Object.defineProperty(this, 'state', { get: () => estado });
      this['currentTime'] = 0;
      this['destination'] = {};
      this['resume'] = resume;
      this['createGain'] = () => ({ gain: { value: 0 }, connect: vi.fn() });
      this['createOscillator'] = () => {
        const osc: Record<string, unknown> = { type: '', connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
        let f = 0;
        osc['frequency'] = {
          get value() { return f; },
          set value(v: number) { f = v; frecuencias.push(v); },
        };
        return osc;
      };
    });
  }

  function crear(): SonidoCajaService {
    TestBed.resetTestingModule();
    return TestBed.inject(SonidoCajaService);
  }

  beforeEach(() => {
    localStorage.clear();
    instalarAudioContext();
  });

  afterEach(() => {
    globalAny.AudioContext = original;
    localStorage.clear();
  });

  it('ok, error y aviso crean osciladores con frecuencias distintas', () => {
    const s = crear();
    s.ok();
    const ok = [...frecuencias];
    frecuencias.length = 0;
    s.error();
    const error = [...frecuencias];
    frecuencias.length = 0;
    s.aviso();
    const aviso = [...frecuencias];

    expect(ok.length).toBe(1);
    expect(error.length).toBe(2);
    expect(aviso.length).toBe(1);
    expect(new Set([ok[0], error[0], aviso[0]]).size).toBe(3);
    expect(ok[0]).toBeGreaterThan(aviso[0]);
    expect(aviso[0]).toBeGreaterThan(Math.max(...error));
  });

  it('con activo=false no suena ni crea el contexto', () => {
    const s = crear();
    s.establecerActivo(false);
    s.ok();
    s.error();
    s.aviso();
    expect(frecuencias).toEqual([]);
    expect(instancias).toBe(0);
  });

  it('sin AudioContext no lanza', () => {
    globalAny.AudioContext = undefined;
    delete globalAny.AudioContext;
    const s = crear();
    expect(() => { s.ok(); s.error(); s.aviso(); }).not.toThrow();
  });

  it('si AudioContext falla al crearse no lanza', () => {
    globalAny.AudioContext = vi.fn(function () { throw new Error('bloqueado'); });
    const s = crear();
    expect(() => s.ok()).not.toThrow();
  });

  it('el interruptor persiste en localStorage y se recupera al recrear el servicio', () => {
    const s = crear();
    expect(s.activo()).toBe(true);
    s.alternar();
    expect(s.activo()).toBe(false);
    expect(localStorage.getItem('sonido_caja_activo')).toBe('0');

    expect(crear().activo()).toBe(false);

    const otra = crear();
    otra.alternar();
    expect(localStorage.getItem('sonido_caja_activo')).toBe('1');
    expect(crear().activo()).toBe(true);
  });

  it('si localStorage lanza, sigue funcionando', () => {
    const lectura = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x'); });
    const escritura = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
    try {
      const s = crear();
      expect(s.activo()).toBe(true);
      expect(() => s.alternar()).not.toThrow();
      expect(s.activo()).toBe(false);
    } finally {
      lectura.mockRestore();
      escritura.mockRestore();
    }
  });

  it('reanuda el audio en el primer gesto, una sola vez', () => {
    // Las instancias de los tests anteriores dejaron su escucha de primer gesto en `document`: se consume.
    document.dispatchEvent(new Event('keydown'));
    instalarAudioContext();
    crear();
    document.dispatchEvent(new Event('pointerdown'));
    expect(resume).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('keydown'));
    document.dispatchEvent(new Event('pointerdown'));
    expect(resume).toHaveBeenCalledTimes(1);
  });
});
