/**
 * Manda un PDF a la impresora sin abrir otra pestaña: lo carga en un marco oculto y llama a print().
 * Devuelve false si el navegador no lo permite (quien llama decide el plan B).
 */
export function imprimirPdf(pdf: Blob, doc: Document = document): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    doc.querySelectorAll('iframe[data-hs-imprimir]').forEach((previo) => previo.remove());

    const url = URL.createObjectURL(pdf);
    const marco = doc.createElement('iframe');
    marco.setAttribute('data-hs-imprimir', '1');
    marco.setAttribute('aria-hidden', 'true');
    marco.setAttribute('tabindex', '-1');
    marco.style.cssText =
      'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';

    let terminado = false;
    let esperaCarga: ReturnType<typeof setTimeout> | undefined;

    const limpiar = (): void => {
      marco.remove();
      URL.revokeObjectURL(url);
    };
    const cerrar = (ok: boolean): void => {
      if (terminado) return;
      terminado = true;
      if (esperaCarga) clearTimeout(esperaCarga);
      if (ok) setTimeout(limpiar, 60_000);
      else limpiar();
      resolve(ok);
    };

    esperaCarga = setTimeout(() => cerrar(false), 8_000);

    marco.addEventListener('load', () => {
      if (terminado) return;
      if (esperaCarga) clearTimeout(esperaCarga);
      setTimeout(() => {
        if (terminado) return;
        try {
          const ventana = marco.contentWindow;
          if (!ventana) {
            cerrar(false);
            return;
          }
          ventana.focus();
          ventana.print();
          cerrar(true);
        } catch {
          cerrar(false);
        }
      }, 300);
    });

    marco.src = url;
    (doc.body ?? doc.documentElement).appendChild(marco);
  });
}
