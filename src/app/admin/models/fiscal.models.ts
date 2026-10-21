export type AmbienteFiscal = 'beta' | 'produccion';
export type ProveedorFiscal = 'nubefact' | 'sunat_directo';
export type TipoArchivoBeta = 'xml_original' | 'xml_firmado' | 'zip' | 'cdr_xml' | 'cdr_zip';
export type EmisorBeta = EmisorSunat & { ruc: string };
export interface EnvioBeta {
  id_envio: number;
  tipo_documento: string;
  nombre_archivo: string;
  estado: string;
  codigo_sunat: string | null;
  mensaje_sunat: string | null;
  accion_sunat: string | null;
  creado_en: string;
  archivos: TipoArchivoBeta[];
}
export interface EstadoPosBetaFiscal {
  habilitado: boolean;
  activo: boolean;
  ambiente: AmbienteFiscal;
  listo: boolean;
  ruc_emisor_beta: string;
  ruc_certificado_beta: string | null;
  advertencia: string;
}
export interface SeriesSunat {
  factura: string;
  boleta: string;
  nc_factura: string;
  nc_boleta: string;
  nd_factura: string;
  nd_boleta: string;
  gre_remitente: string;
}

export interface EmisorSunat {
  razon_social: string;
  nombre_comercial: string;
  direccion: string;
  ubigeo: string;
  distrito: string;
  provincia: string;
  departamento: string;
  codigo_establecimiento: string;
}

export interface OperacionFiscal {
  proveedor?: ProveedorFiscal;
  ambiente: AmbienteFiscal;
  boletas_modo: 'individual' | 'resumen';
  envio_en_linea: boolean;
  tareas_activas: boolean;
  aplicar_reglas_2027: 'auto' | 'true' | 'false';
  codigo_producto_defecto: string;
  series: SeriesSunat;
  confirmo_no_ose: boolean;
}

export interface ConfigGre {
  activa: boolean;
  correlativo_inicial: number;
  partida: { ubigeo: string; direccion: string; codigo_establecimiento: string };
}

export interface CertificadoFiscal {
  id: number;
  ambiente: AmbienteFiscal;
  titular: string | null;
  ruc: string | null;
  nombre_archivo: string | null;
  vigente_hasta: string;
  dias_para_vencer: number;
  vencido: boolean;
  autofirmado: boolean;
  advertencias: string[];
}

export interface ChecklistFiscal {
  titulo: string;
  listo: boolean;
  items: {
    codigo: string;
    titulo: string;
    ok: boolean;
    detalle: string | null;
    accion: string | null;
  }[];
}

export interface ConfiguracionSunat extends Omit<
  OperacionFiscal,
  'confirmo_no_ose' | 'codigo_producto_defecto'
> {
  codigo_producto_defecto: string | null;
  proveedor_efectivo: ProveedorFiscal;
  emisor: EmisorSunat & { ruc: string };
  sol: { usuario: string | null; tiene_clave: boolean };
  gre: ConfigGre & {
    partida: ConfigGre['partida'] & {
      heredada_del_emisor: Record<keyof ConfigGre['partida'], boolean>;
    };
    credenciales: { tiene_credenciales: boolean; client_id_mascara: string | null };
  };
  certificado: Record<AmbienteFiscal, CertificadoFiscal | null>;
  confirmacion_no_ose: { nombre: string | null; fecha: string } | null;
  aviso_legal_ose: { titulo: string; texto: string; confirmacion: string; normas: string[] };
  estado: {
    esquema: { listo: boolean; mensaje: string | null; faltantes: string[] };
    cifrado_disponible: boolean;
    cifrado_problema: string | null;
    listo_para_produccion: boolean;
    gre_lista_para_produccion: boolean;
    advertencias: string[];
    checklist: { cpe: ChecklistFiscal; gre: ChecklistFiscal };
    pruebas_beta: { listo: boolean; faltantes: string[] };
  };
}

export interface ResultadoPruebaFiscal {
  ok: boolean;
  ambiente: AmbienteFiscal;
  documento: 'cpe' | 'gre';
  tiempo_ms: number;
  envio_disponible: boolean;
  pasos: {
    paso: string;
    ok: boolean | null;
    detalle: string;
    codigo?: string;
    envio_id?: number;
    archivos?: TipoArchivoBeta[];
  }[];
}

export interface AuditoriaFiscal {
  id_auditoria: number;
  creado_en: string;
  id_usuario: number | null;
  accion: string;
  entidad: string | null;
  detalle: Record<string, unknown> | null;
}
