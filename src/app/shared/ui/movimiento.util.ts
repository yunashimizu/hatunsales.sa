/**
 * Ayudas del sistema de movimiento expresivo (directivas y componentes de shared/ui).
 * Todo es seguro en servidor: sin `window` devuelven «no hay movimiento».
 */

/** true si el usuario no pidió movimiento reducido (solo navegador). */
export function movimientoPermitido(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Ratón o trackpad con hover: los efectos que siguen al cursor solo viven ahí. */
export function punteroFino(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/** Limita `valor` al rango [min, max]. */
export function acotar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

/** Curva de salida suave (easeOutExpo) para animaciones de cifras. */
export function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * Observa elementos hasta que entran en pantalla y avisa una sola vez por elemento.
 * Un único IntersectionObserver para toda la aplicación (barato con cientos de
 * elementos). Se crea la primera vez que se pide y fuera de la zona de Angular,
 * así sus avisos no disparan detección de cambios por sí solos.
 */
const esperando = new WeakMap<Element, () => void>();
let observador: IntersectionObserver | null = null;

function crearObservador(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  return new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        // También se da por visto lo que quedó por encima de la ventana (scroll restaurado).
        if (!entrada.isIntersecting && entrada.boundingClientRect.bottom >= 0) continue;
        const aviso = esperando.get(entrada.target);
        if (!aviso) continue;
        esperando.delete(entrada.target);
        observador?.unobserve(entrada.target);
        aviso();
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
}

/** Devuelve false si no hay IntersectionObserver (quien llama debe mostrar el contenido ya). */
export function alEntrarEnPantalla(elemento: Element, aviso: () => void): boolean {
  observador ??= crearObservador();
  if (!observador) return false;
  esperando.set(elemento, aviso);
  observador.observe(elemento);
  return true;
}

export function dejarDeObservar(elemento: Element): void {
  esperando.delete(elemento);
  observador?.unobserve(elemento);
}

/** Solo para pruebas: olvida el observador compartido para poder simular otro entorno. */
export function reiniciarObservacion(): void {
  observador?.disconnect();
  observador = null;
}
