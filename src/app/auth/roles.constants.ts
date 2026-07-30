/** IDs de rol alineados con la BD HatunSales. */
export const ROL_IDS = {
  ADMIN: 1,
  USUARIO: 2,
  VENDEDOR: 3,
  CAJA: 4,
  CLIENTE: 5,
} as const;

/** Entran al panel admin. */
export const STAFF_ROL_IDS: number[] = [ROL_IDS.ADMIN, ROL_IDS.VENDEDOR, ROL_IDS.CAJA];

export const STAFF_ROL_NOMBRES = ['admin', 'superadmin', 'vendedor', 'caja'];

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
  cliente: 'cliente',
  usuario: 'cliente',
};

export function normalizarRol(nombreRol?: string | null): string {
  const clave = (nombreRol ?? '').trim().toLowerCase();
  return ALIAS_ROL[clave] ?? clave;
}

export function esRolStaff(idRol?: number | null, nombreRol?: string | null): boolean {
  if (idRol != null && STAFF_ROL_IDS.includes(Number(idRol))) return true;
  return STAFF_ROL_NOMBRES.includes(normalizarRol(nombreRol));
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
  // Por ID por si el nombre viene raro pero el id es staff y la ruta pide staff
  if (idRol != null && STAFF_ROL_IDS.includes(Number(idRol))) {
    const porId =
      Number(idRol) === ROL_IDS.ADMIN
        ? 'admin'
        : Number(idRol) === ROL_IDS.VENDEDOR
          ? 'vendedor'
          : Number(idRol) === ROL_IDS.CAJA
            ? 'caja'
            : '';
    return !!porId && permitidos.includes(porId);
  }
  return false;
}
