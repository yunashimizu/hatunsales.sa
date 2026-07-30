/** IDs de rol alineados con la BD HatunSales. */
export const ROL_IDS = {
  ADMIN: 1,
  /** Solo lectura catálogo/stock en el panel. */
  CONSULTA: 2,
  /** @deprecated Alias histórico del id 2; usar CONSULTA. */
  USUARIO: 2,
  VENDEDOR: 3,
  CAJA: 4,
  CLIENTE: 5,
} as const;

/** Entran al panel admin. */
export const STAFF_ROL_IDS: number[] = [
  ROL_IDS.ADMIN,
  ROL_IDS.CONSULTA,
  ROL_IDS.VENDEDOR,
  ROL_IDS.CAJA,
];

export const STAFF_ROL_NOMBRES = ['admin', 'superadmin', 'consulta', 'vendedor', 'caja'];

/** Alias de BD / UI → rol canónico. */
const ALIAS_ROL: Record<string, string> = {
  administrador: 'admin',
  administradora: 'admin',
  admin: 'admin',
  superadmin: 'admin',
  vendedor: 'vendedor',
  vendedora: 'vendedor',
  empleado: 'vendedor',
  empleados: 'vendedor',
  trabajador: 'vendedor',
  trabajadores: 'vendedor',
  caja: 'caja',
  cajero: 'caja',
  cajeroa: 'caja',
  consulta: 'consulta',
  demo: 'consulta',
  visor: 'consulta',
  /** Nombre viejo del rol id 2 (migrado a consulta). */
  usuario: 'consulta',
  cliente: 'cliente',
};

export function normalizarRol(nombreRol?: string | null): string {
  const clave = (nombreRol ?? '').trim().toLowerCase();
  return ALIAS_ROL[clave] ?? clave;
}

export function esRolStaff(idRol?: number | null, nombreRol?: string | null): boolean {
  if (idRol != null && STAFF_ROL_IDS.includes(Number(idRol))) return true;
  return STAFF_ROL_NOMBRES.includes(normalizarRol(nombreRol));
}

export function esRolCliente(idRol?: number | null, nombreRol?: string | null): boolean {
  if (idRol != null && Number(idRol) === ROL_IDS.CLIENTE) return true;
  return normalizarRol(nombreRol) === 'cliente';
}

export function esRolConsulta(idRol?: number | null, nombreRol?: string | null): boolean {
  if (idRol != null && Number(idRol) === ROL_IDS.CONSULTA) return true;
  return normalizarRol(nombreRol) === 'consulta';
}

/** ¿Puede crear/editar/borrar catálogo? (no consulta). */
export function puedeEditarCatalogo(idRol?: number | null, nombreRol?: string | null): boolean {
  const rol = normalizarRol(nombreRol);
  if (rol === 'admin' || rol === 'vendedor') return true;
  if (idRol != null) {
    const id = Number(idRol);
    return id === ROL_IDS.ADMIN || id === ROL_IDS.VENDEDOR;
  }
  return false;
}

function rolCanonicoPorId(idRol: number): string {
  if (idRol === ROL_IDS.ADMIN) return 'admin';
  if (idRol === ROL_IDS.CONSULTA) return 'consulta';
  if (idRol === ROL_IDS.VENDEDOR) return 'vendedor';
  if (idRol === ROL_IDS.CAJA) return 'caja';
  if (idRol === ROL_IDS.CLIENTE) return 'cliente';
  return '';
}

/** ¿El rol del usuario está en la lista permitida de la ruta? */
export function rolPermitido(
  nombreRol: string | null | undefined,
  rolesPermitidos: string[],
  idRol?: number | null,
): boolean {
  if (!rolesPermitidos.length) return true;
  const actual = normalizarRol(nombreRol);
  const permitidos = rolesPermitidos.map(normalizarRol);
  if (permitidos.includes(actual)) return true;
  if (idRol != null && STAFF_ROL_IDS.includes(Number(idRol))) {
    const porId = rolCanonicoPorId(Number(idRol));
    return !!porId && permitidos.includes(porId);
  }
  return false;
}
