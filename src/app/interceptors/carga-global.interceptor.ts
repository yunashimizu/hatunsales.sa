import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { defer, finalize } from 'rxjs';
import { CargaGlobalService } from '../shared/services/carga-global.service';
import { SILENCIOSA } from './contexto-http';

/**
 * Avisa a la barra de progreso del panel de las peticiones de primer plano.
 * Las silenciosas (sondeos, contadores, precargas) no la encienden.
 * Va al final de la cadena: no cambia la petición ni la respuesta.
 */
export const cargaGlobalInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SILENCIOSA)) return next(req);
  const carga = inject(CargaGlobalService);
  return defer(() => {
    const clave = carga.iniciar();
    return next(req).pipe(finalize(() => carga.terminar(clave)));
  });
};
