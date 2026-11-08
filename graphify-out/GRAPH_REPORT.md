# Graph Report - ferreteria  (2026-11-08)

## Corpus Check
- 357 files · ~362,028 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 94 file(s) not represented in the graph (top: .css 82, .scss 7, (none) 3)

## Summary
- 4877 nodes · 12640 edges · 174 communities (111 shown, 63 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 494 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `01640456`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- VentasComponent
- CotizacionesComponent
- tienda.models.ts
- alert.service.ts
- @angular/core
- auth-shell.component.ts
- mensajeDeError
- aviso-login.util.ts
- VentasHistorialComponent
- hoja-comprobante.model.ts
- GuiaFormularioComponent
- ProductosComponent
- nota-credito-asistente.component.ts
- documentos.models.ts
- productos.component.ts
- guias-remision.component.ts
- CajaSesionComponent
- GuiasRemisionComponent
- errores-http.util.ts
- activacion-produccion.component.ts
- NotificationService
- contacto.component.ts
- RecepcionComponent
- comprobante-detalle.component.ts
- fiscal.models.ts
- FacturacionSunatComponent
- CarritoComponent
- ✅ CHECKLIST DE IMPLEMENTACIÓN
- rxjs
- ComprobanteDetalleComponent
- ReporteMercadoComponent
- SelectorUnidadComponent
- 🚀 STORE PREMIUM COMPLETADO - RESUMEN EJECUTIVO
- error.interceptor.ts
- imagen-cliente.util.ts
- CajaArqueoComponent
- VentasSinComprobanteComponent
- NumeroDirective
- CuentasPorCobrarComponent
- ProductoRapidoComponent
- GestionService
- opcionesHttp
- PedidoDetalleComponent
- ClientesComponent
- @angular/router
- ProductoDetalleComponent
- guia-remision.service.ts
- inicio-graficos.util.ts
- DocComponent
- guia-formulario.component.ts
- EtiquetasProductoComponent
- ReportesComponent
- UsuariosComponent
- PuntoVentaService
- EnviosSunatComponent
- package.json
- RolesComponent
- CheckoutComponent
- HeaderComponent
- Componentes Creados
- CategoriasComponent
- roles.constants.ts
- guias-remision.component.spec.ts
- app.config.ts
- dependencies
- InventarioComponent
- PaletaComandosComponent
- LotesSunatComponent
- AlertService
- CatalogoComponent
- CartService
- avisos-panel.service.ts
- MarcasComponent
- pages/perfil/perfil.component.ts
- notification.service.ts
- FiltrosComponent
- AlmacenComponent
- fiscal-estado.service.ts
- ReporteProductosComponent
- .cargar
- UbigeoBuscadorComponent
- GuiaRemisionService
- reportes.service.ts
- schematics
- dashboard.component.ts
- reportes.component.ts
- ProductosSinCodigoComponent
- HeroBannerComponent
- importe-en-letras.util.ts
- AvisosPanelService
- ArqueoCajaPaginaComponent
- PedidosComponent
- HeaderComponent
- AuthService
- options
- app.config.server.ts
- errorOperativo
- ProveedoresComponent
- SidebarComponent
- VisorImagenComponent
- Paginado
- ResumenDiarioConfigComponent
- Pedido
- rango-fechas.util.ts
- ReporteTiposComponent
- SonidoCajaService
- server.ts
- admin/template/header/header.component.ts
- devDependencies
- paleta-comandos.component.ts
- DashboardComponent
- ObservadorFalso
- FavoritosComponent
- 🎨 GUÍA VISUAL DEL STORE PREMIUM
- ProductoAdminService
- ayuda-atajos.component.ts
- CarritoPanelComponent
- ActualizacionAppService
- development
- EstadoPedido
- AdminConfiguracionComponent
- ConectividadService
- scripts
- Ferreteria
- caja-arqueo.component.ts
- RolesAdminService
- CajaArqueoService
- TemplateComponent
- caja-sesion.component.ts
- TemaService
- sidebar.component.ts
- angular.json
- build
- LlaveAlertasSunatComponent
- ColaEscaneos
- recepcion.component.ts
- arqueo-caja-pagina.component.ts
- ubigeo.service.ts
- ui/index.ts
- production
- ferreteria
- urlWhatsappCliente
- cobranza.util.ts
- ProductoService
- sonido-caja.service.spec.ts
- .diasPara
- vercel.json
- overrides
- .descargarSire
- lotes-sunat.component.ts
- login-request.model.ts
- general-constants.ts
- stock-sucursales.component.ts
- EstadoCuentaComponent
- template-routing.module.ts
- .cargar
- .cerrarFechas
- calcularDelta
- notificaciones.component.ts
- BarraProgresoComponent
- filtrarInstantaneo
- .exportarCsv
- pedidos.component.spec.ts
- rangoValido
- facturacion-sunat.component.spec.ts
- DensidadService
- ngsw-config.json
- pedido-detalle.component.spec.ts
- PRESETS

## God Nodes (most connected - your core abstractions)
1. `@angular/core` - 260 edges
2. `mensajeDeError()` - 198 edges
3. `opcionesHttp()` - 190 edges
4. `@angular/common` - 186 edges
5. `VentasComponent` - 158 edges
6. `AlertService` - 131 edges
7. `rxjs` - 122 edges
8. `CotizacionesComponent` - 122 edges
9. `@angular/router` - 118 edges
10. `ProductosComponent` - 95 edges

## Surprising Connections (you probably didn't know these)
- `ArqueoCajaPaginaComponent` --references--> `CajaArqueoComponent`  [EXTRACTED]
  src/app/admin/mantenimiento/component/caja-sesion/arqueo-caja-pagina.component.ts → src/app/admin/mantenimiento/component/caja-sesion/caja-arqueo.component.ts
- `ArqueoCajaPaginaComponent` --references--> `ResumenSucursalesCaja`  [EXTRACTED]
  src/app/admin/mantenimiento/component/caja-sesion/arqueo-caja-pagina.component.ts → src/app/admin/models/caja-arqueo.models.ts
- `ArqueoCajaPaginaComponent` --references--> `TurnoCajaListado`  [EXTRACTED]
  src/app/admin/mantenimiento/component/caja-sesion/arqueo-caja-pagina.component.ts → src/app/admin/models/caja-arqueo.models.ts
- `ArqueoCajaPaginaComponent` --references--> `CajaDisponible`  [EXTRACTED]
  src/app/admin/mantenimiento/component/caja-sesion/arqueo-caja-pagina.component.ts → src/app/admin/service/caja-sesion.service.ts
- `CajaArqueoComponent` --references--> `ArqueoEsperado`  [EXTRACTED]
  src/app/admin/mantenimiento/component/caja-sesion/caja-arqueo.component.ts → src/app/admin/models/caja-arqueo.models.ts

## Import Cycles
- None detected.

## Communities (174 total, 63 thin omitted)

### Community 1 - "CotizacionesComponent"
Cohesion: 0.04
Nodes (8): CotizacionesComponent, errorLocal(), numeroOpcional(), redondear2(), soloDigitos(), Cotizacion, CotizacionService, CrearCotizacionPayload

### Community 2 - "tienda.models.ts"
Cohesion: 0.08
Nodes (26): ConfiguracionPasarela, CrearPedidoPayload, CuponValidado, Especificacion, EstadoComprobantePedido, FiltrosDisponibles, PagarPedidoPayload, PedidoComprobante (+18 more)

### Community 3 - "alert.service.ts"
Cohesion: 0.07
Nodes (28): @angular/forms, COPIAS_MAXIMAS, COPIAS_MINIMAS, FiltroEstado, routes, ATRIBUTOS_PERMITIDOS, CLAVES_TRANSPORTE, ETIQUETAS_PELIGROSAS (+20 more)

### Community 4 - "@angular/core"
Cohesion: 0.05
Nodes (26): @angular/common, @angular/core, ProductoCotizadoReporte, ProductoVendidoReporte, ICONOS, PorTipoReporte, RangoReporteVentas, cuerpo (+18 more)

### Community 5 - "auth-shell.component.ts"
Cohesion: 0.09
Nodes (10): lottie-web, AdminModule, AdminRoutingModule, routes, TemplateModule, AuthShellComponent, CARGAR_LOTTIE, PRECARGAR_PANEL (+2 more)

### Community 6 - "mensajeDeError"
Cohesion: 0.07
Nodes (4): ImagenProducto, esAccionDestructiva(), mensajeDeError(), partirEnLotes()

### Community 7 - "aviso-login.util.ts"
Cohesion: 0.24
Nodes (15): authGuard(), almacen(), AvisoLogin, borrar(), escribir(), esMotivo(), esRedireccionSegura(), guardarAvisoLogin() (+7 more)

### Community 8 - "VentasHistorialComponent"
Cohesion: 0.06
Nodes (13): AccionDetalle, enteroPositivo(), FilaHistorial, hoyEnLima(), rangoDe(), FILA_ANULADA, FILA_FACTURA, FILA_SIN_COMPROBANTE (+5 more)

### Community 9 - "hoja-comprobante.model.ts"
Cohesion: 0.06
Nodes (53): HojaComprobanteComponent, LOGO_OFICIAL_SRC, ROTULOS_PDF, ambienteDe(), AVISO_BETA_HOJA, cantidad(), capitalizar(), COLUMNAS_TABLA (+45 more)

### Community 10 - "GuiaFormularioComponent"
Cohesion: 0.05
Nodes (9): bloque(), conTresDecimales(), GuiaFormularioComponent, milesimas(), pasoDeCampo(), sumarDiasFecha(), ExcesoCantidadGuia, GuardarGuiaRemision (+1 more)

### Community 11 - "ProductosComponent"
Cohesion: 0.06
Nodes (3): ProductosComponent, StockPorAlmacen, ProductoFormulario

### Community 12 - "nota-credito-asistente.component.ts"
Cohesion: 0.06
Nodes (17): RUTA_DOCUMENTOS, centesimas(), conDosDecimales(), estimarDevolucion(), EXPLICACION_MOTIVO, MOTIVOS_QUE_BAJAN_DEUDA, NOMBRE_FORMA, NotaCreditoAsistenteComponent (+9 more)

### Community 13 - "documentos.models.ts"
Cohesion: 0.06
Nodes (30): FiltroDocumentos, AccionDocumento, AccionSunat, AmbienteFiscal, CatalogoMotivosNota, ComprobanteDeVenta, ContextoNotaCredito, CorreoHistorial (+22 more)

### Community 14 - "productos.component.ts"
Cohesion: 0.05
Nodes (62): COLUMNAS_EMPRESAS, COLUMNAS_PERSONAS, Pestania, DefinicionTramo, AntiguedadServidor, CAMPO_TRAMO, COLUMNAS_ORDEN, ResumenTramo (+54 more)

### Community 15 - "guias-remision.component.ts"
Cohesion: 0.07
Nodes (32): DescargaGuia, GuiaDetalleComponent, NOMBRE_DOCUMENTO, enviada(), pendiente(), enteroPositivo(), FiltroPantalla, FILTROS_ESTADO (+24 more)

### Community 16 - "CajaSesionComponent"
Cohesion: 0.08
Nodes (4): CajaSesionComponent, DenominacionSol, LineaConteo, CajaDisponible

### Community 17 - "GuiasRemisionComponent"
Cohesion: 0.12
Nodes (3): GuiasRemisionComponent, GuiaRemisionResumen, OperacionGuia

### Community 18 - "errores-http.util.ts"
Cohesion: 0.07
Nodes (42): claveAvisoDe(), codigoPorEstado(), CODIGOS_ERROR, CODIGOS_FRONT, CODIGOS_GLOBALES, CODIGOS_TRANSPORTE, CuerpoErrorApi, describirError() (+34 more)

### Community 19 - "activacion-produccion.component.ts"
Cohesion: 0.07
Nodes (17): CambiosConfiguracionFiscal, ConfirmacionesActivacion, ItemChecklistFiscal, SeriesSunat, ActivacionProduccionComponent, CONFIRMACIONES_SOL, Correlativo, correlativosDe() (+9 more)

### Community 20 - "NotificationService"
Cohesion: 0.11
Nodes (3): NotificationService, recortarTexto(), crear()

### Community 21 - "contacto.component.ts"
Cohesion: 0.07
Nodes (23): CategoriasGridComponent, ICONOS, TONOS, WhatsappFlotanteComponent, EMPRESA_TIENDA, urlMailto(), urlMapaAbrir(), urlMapaEmbed() (+15 more)

### Community 23 - "comprobante-detalle.component.ts"
Cohesion: 0.07
Nodes (44): ESTADO_GUIA, TEXTO_ANULACION, TEXTO_CORREO, FilaDocumento, FILTRO_VACIO, Pestana, aunPuedeResumirse(), chipAmbiente (+36 more)

### Community 24 - "fiscal.models.ts"
Cohesion: 0.09
Nodes (37): AlertasFiscalesApi, AuditoriaFiscal, BloqueoEmision, CertificadoFiscal, ChecklistFiscal, ConfigGre, EmisorBeta, EmisorSunat (+29 more)

### Community 25 - "FacturacionSunatComponent"
Cohesion: 0.08
Nodes (5): ConfiguracionSunat, EstadoFiscalGlobal, DestinoFiscal, FacturacionSunatComponent, lecturaSegura()

### Community 27 - "✅ CHECKLIST DE IMPLEMENTACIÓN"
Cohesion: 0.05
Nodes (39): 1. Instalar dependencias, 1. Servicios, 2. Compilar TypeScript, 2. Componentes Principales, 3. Componentes Actualizados, 3. Ejecutar dev server, 4. Índices y Barrels, 5. Documentación (+31 more)

### Community 28 - "rxjs"
Cohesion: 0.05
Nodes (41): rxjs, CuentaDeposito, DOCUMENTOS, LineaCot, OrigenSugerencias, ResultadoBusqueda, CUENTA_BCP, pintar() (+33 more)

### Community 29 - "ComprobanteDetalleComponent"
Cohesion: 0.08
Nodes (6): ComprobanteDetalleComponent, correoPlausible(), archivosDescargables(), AnulacionComprobante, ComprobanteDetalle, SolicitudAnularComprobante

### Community 30 - "ReporteMercadoComponent"
Cohesion: 0.06
Nodes (8): fechaCorta(), horaTexto(), ReporteMercadoComponent, soles(), EstancadosReporte, MapaCalorReporte, RentabilidadReporte, ReportesService

### Community 31 - "SelectorUnidadComponent"
Cohesion: 0.10
Nodes (7): claveUnidad(), ResolucionUnidad, UNIDAD_POR_DEFECTO, UnidadAmigable, UnidadMedidaService, GrupoOpciones, SelectorUnidadComponent

### Community 32 - "🚀 STORE PREMIUM COMPLETADO - RESUMEN EJECUTIVO"
Cohesion: 0.06
Nodes (35): 10. **HomeComponent Rediseñado** 🏠, 1. **AlertService** 🔔, 1. Verificar que todo está importado, 2. **HeroBannerComponent** 🎬, 2. Ver en navegador, 3. **CategoriasGridComponent** 🏷️, 3. Probar funcionalidades, 4. Código de prueba descuento (+27 more)

### Community 33 - "error.interceptor.ts"
Cohesion: 0.15
Nodes (24): AVISO_GLOBAL, REINTENTOS, aplicarPolitica(), cantidadDeReintentos(), debeReintentar(), errorInterceptor(), esperaDeReintento(), ESPERAS_REINTENTO_MS (+16 more)

### Community 34 - "imagen-cliente.util.ts"
Cohesion: 0.09
Nodes (24): aBlob(), ArchivoImagen, BitmapLike, CALIDAD_JPEG, CanvasLike, comprimirImagen(), Contexto2DLike, extensionDe() (+16 more)

### Community 36 - "VentasSinComprobanteComponent"
Cohesion: 0.08
Nodes (7): consultaNoPublicada(), soloDigitos(), VentasSinComprobanteComponent, VentaSinComprobante, codigoDeError(), esErrorDeRed(), esEstadoDeRed()

### Community 37 - "NumeroDirective"
Cohesion: 0.05
Nodes (39): aTipo(), ErrorValidacionNumero, NumeroDirective, primerNumeroInvalido(), AnfitrionComponent, VacioNumero, buscarSeparadorDecimal(), CANTIDAD_MAXIMA (+31 more)

### Community 39 - "ProductoRapidoComponent"
Cohesion: 0.05
Nodes (42): EscaneoPendiente, aNumero(), armarComentario(), avisoPrecioBajoCosto(), buscarDuplicadoExacto(), CampoAltaRapida, cantidadSeLleva(), coincideConTexto() (+34 more)

### Community 41 - "opcionesHttp"
Cohesion: 0.09
Nodes (3): AmbienteFiscal, opcionesHttp(), FiscalAdminService

### Community 44 - "@angular/router"
Cohesion: 0.05
Nodes (15): @angular/router, EstrellasComponent, ProductoCardComponent, BannerTienda, MarcaTienda, ProductoDetalle, ProductoTienda, HomeComponent (+7 more)

### Community 46 - "guia-remision.service.ts"
Cohesion: 0.07
Nodes (26): ErrorGuia, Paginado, AccionesGuia, ConductorGuia, ConductorGuiaCuerpo, DestinatarioGuia, DestinatarioGuiaCuerpo, DocumentoRelacionadoGuia (+18 more)

### Community 47 - "inicio-graficos.util.ts"
Cohesion: 0.08
Nodes (36): VentaPorHora, VentasPorHora, SesionCaja, ReporteVentasResumen, ResultadoPeriodo, construirTopProductos(), agruparPorHora(), BarraDia (+28 more)

### Community 49 - "guia-formulario.component.ts"
Cohesion: 0.10
Nodes (21): aVentaEncontrada(), AVISO_DIAS_INICIO_TRASLADO, DESTINATARIO_PROPIO_POR_DEFECTO, DestinoRuc, FormularioGuia, formularioVacio(), ItemFormulario, MAXIMO_DIAS_INICIO_TRASLADO (+13 more)

### Community 50 - "EtiquetasProductoComponent"
Cohesion: 0.10
Nodes (13): EtiquetasProductoComponent, ProductoEtiqueta, AnfitrionComponent, codificarEan13(), esEan13Valido(), OpcionesSvgEan13, PARIDAD_PRIMER_DIGITO, VALIDOS (+5 more)

### Community 54 - "EnviosSunatComponent"
Cohesion: 0.15
Nodes (3): EnvioSunat, EnviosSunatComponent, partesNombre()

### Community 55 - "package.json"
Cohesion: 0.08
Nodes (25): name, packageManager, private, version, @angular/build, @angular/cdk, @angular/cli, @angular/compiler (+17 more)

### Community 56 - "RolesComponent"
Cohesion: 0.13
Nodes (3): RolesComponent, RolAdmin, RolesAdminCrudService

### Community 57 - "CheckoutComponent"
Cohesion: 0.07
Nodes (3): MetodoEnvio, MetodoPago, CheckoutComponent

### Community 59 - "Componentes Creados"
Cohesion: 0.08
Nodes (24): 1️⃣ AlertService (Notificaciones Globales), 2️⃣ HeroBannerComponent, 3️⃣ CategoriasGridComponent, 4️⃣ ProductoCardComponent, 5️⃣ FiltrosComponent, 6️⃣ CarritoModalComponent, 7️⃣ CartService, 8️⃣ HeaderComponent (Actualizado) (+16 more)

### Community 61 - "roles.constants.ts"
Cohesion: 0.10
Nodes (19): ALIAS_ROL, esRolCliente(), esRolConsulta(), esRolStaff(), normalizarRol(), puedeEditarCatalogo(), ROL_IDS, rolCanonicoPorId() (+11 more)

### Community 62 - "guias-remision.component.spec.ts"
Cohesion: 0.09
Nodes (12): CATALOGOS, guiaGuardada(), operacion(), ESPERAS_CONSULTA_MS, abrirDetalle(), ACCIONES, crear(), FormularioFalso (+4 more)

### Community 63 - "app.config.ts"
Cohesion: 0.16
Nodes (13): crear(), alCrearTransicion(), alFallarNavegacion(), omitirTransicion(), rutaSinConsulta(), routes, authInterceptor(), leerToken() (+5 more)

### Community 64 - "dependencies"
Cohesion: 0.08
Nodes (24): dependencies, @angular/cdk, @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/platform-browser, @angular/platform-server (+16 more)

### Community 65 - "InventarioComponent"
Cohesion: 0.05
Nodes (5): InventarioComponent, StockComponent, Almacen, FilaInventario, FiltroInventario

### Community 67 - "LotesSunatComponent"
Cohesion: 0.14
Nodes (3): fechaYmdCorta(), LoteSunat, LotesSunatComponent

### Community 68 - "AlertService"
Cohesion: 0.10
Nodes (7): AlertService, copiarNodosSeguros(), sanearHtml(), textoBoton(), decodificarEntidadesHtml(), escapeHtmlAlerta(), htmlATextoPlano()

### Community 69 - "CatalogoComponent"
Cohesion: 0.07
Nodes (5): ChipFiltro, FiltrosActivosComponent, ConsultaCatalogo, Pagina, CatalogoComponent

### Community 71 - "avisos-panel.service.ts"
Cohesion: 0.04
Nodes (32): MovimientoInventario, FiltroTurnosCaja, ListadoTurnosCaja, CLAVE_AVISOS_VISTOS, FuenteRemota, ORDEN_TONO, Resultados, ROLES_CAJA (+24 more)

### Community 73 - "pages/perfil/perfil.component.ts"
Cohesion: 0.09
Nodes (6): DireccionEnvio, DireccionPayload, DIRECCION_VACIA, PerfilComponent, Seccion, CuentaTiendaService

### Community 74 - "notification.service.ts"
Cohesion: 0.07
Nodes (23): ICONOS, rutaSinConsulta(), TemaAvisos, temaDeUrl(), ToastsComponent, AccionAviso, Aviso, COBERTURA_GLOBAL (+15 more)

### Community 77 - "fiscal-estado.service.ts"
Cohesion: 0.09
Nodes (10): HISTORICA, VENTA_EMPRESA, VENTA_PERSONA, EstadoFiscalApi, cacheCorto(), estadoFiscal(), FiscalEstadoService, numero() (+2 more)

### Community 81 - "GuiaRemisionService"
Cohesion: 0.12
Nodes (3): GuiaRemisionService, opcionesSunat(), parametros()

### Community 82 - "reportes.service.ts"
Cohesion: 0.10
Nodes (14): DetalleVentaReporte, FilaRentabilidadCategoria, RAIZ_REPORTES, TopProductoReporte, Fase, cargaGlobalInterceptor(), conReintentos(), conTiempoLimite() (+6 more)

### Community 83 - "schematics"
Cohesion: 0.12
Nodes (17): schematics, type, type, typeSeparator, typeSeparator, typeSeparator, typeSeparator, typeSeparator (+9 more)

### Community 84 - "dashboard.component.ts"
Cohesion: 0.11
Nodes (34): PeriodoReporte, RangoReporte, TooltipVista, Acceso, CobroMedio, construirAccesos(), construirActividad(), construirCobros() (+26 more)

### Community 85 - "reportes.component.ts"
Cohesion: 0.09
Nodes (22): ESQUEMA_URL, ModoPanel, MOTIVOS, RangoYmd, DatosPrevio, ESQUEMA_URL, FilaTipo, MESES_SIRE (+14 more)

### Community 86 - "ProductosSinCodigoComponent"
Cohesion: 0.10
Nodes (11): ResultadoAsignacionCodigoSunat, buscarClases(), CatalogoSunat25, ClaseCatalogo25, leerCatalogo25(), normalizarBusqueda(), raiz(), RUTA_CATALOGO_25 (+3 more)

### Community 88 - "importe-en-letras.util.ts"
Cohesion: 0.23
Nodes (12): apocopar(), CENTENAS, centenasALetras(), DECENAS, decenasALetras(), enteroALetras(), grupoALetras(), hastaMillonALetras() (+4 more)

### Community 89 - "AvisosPanelService"
Cohesion: 0.10
Nodes (7): AvisoPanel, AvisosPanelService, guardarVistos(), horaEnLima(), numero(), plural(), NotificacionesComponent

### Community 90 - "ArqueoCajaPaginaComponent"
Cohesion: 0.09
Nodes (4): aMilisegundos(), ArqueoCajaPaginaComponent, hoyEnLima(), normalizarTotales()

### Community 92 - "HeaderComponent"
Cohesion: 0.11
Nodes (3): HeaderComponent, paginaDe(), Densidad

### Community 93 - "AuthService"
Cohesion: 0.05
Nodes (17): AuthModule, AuthRoutingModule, routes, LoginComponent, AuthShellPrueba, GoogleSignInPrueba, loginRequest, loginResponse (+9 more)

### Community 94 - "options"
Cohesion: 0.13
Nodes (15): options, allowedCommonJsDependencies, assets, browser, inlineStyleLanguage, outputMode, polyfills, scripts (+7 more)

### Community 95 - "app.config.server.ts"
Cohesion: 0.19
Nodes (8): @angular/platform-browser, @angular/ssr, zone.js, App, appConfig, config, serverConfig, serverRoutes

### Community 96 - "errorOperativo"
Cohesion: 0.13
Nodes (17): nombrePdfResumen(), nombreDescarga(), ESQUEMA_URL, FILTRO_HISTORIAL_VACIO, FiltroHistorial, RangoRapido, TIPO_BOLETA, TIPO_FACTURA (+9 more)

### Community 98 - "SidebarComponent"
Cohesion: 0.14
Nodes (4): ResumenPedidosWeb, EntradaAtencion, SidebarComponent, SesionUsuario

### Community 100 - "Paginado"
Cohesion: 0.14
Nodes (9): ComprobanteFila, Paginado, ResumenInventario, ResumenSucursalesCaja, ResumenVencidas, ayerDe(), ResultadoBase, construirSucursales() (+1 more)

### Community 101 - "ResumenDiarioConfigComponent"
Cohesion: 0.11
Nodes (5): ConfigResumenDiario, ResumenDiarioService, diaLegible(), ResumenDiarioConfigComponent, separarCorreos()

### Community 103 - "rango-fechas.util.ts"
Cohesion: 0.24
Nodes (15): armar(), aYmd(), diasEnRango(), etiquetaRango(), fechaCortaYmd(), hoyEnLima(), msDe(), partes() (+7 more)

### Community 106 - "server.ts"
Cohesion: 0.17
Nodes (8): express, browserDir, csr, index, angularApp, app, browserDistFolder, reqHandler

### Community 107 - "admin/template/header/header.component.ts"
Cohesion: 0.13
Nodes (9): ChipFiscal, PaginaPanel, PAGINAS, ROLES_ESTADO_FISCAL, COLOR_BARRA_PANEL, rutaSinConsulta(), BotonTemaComponent, ModoTema (+1 more)

### Community 108 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, @angular/build, @angular/cli, @angular/compiler-cli, jsdom, prettier, tailwindcss, @types/express (+3 more)

### Community 109 - "paleta-comandos.component.ts"
Cohesion: 0.14
Nodes (9): Comando, ComandoVisible, GrupoVisible, normalizar(), PALABRAS, puntaje(), abrir(), PaletaComandosService (+1 more)

### Community 110 - "DashboardComponent"
Cohesion: 0.06
Nodes (4): DashboardComponent, guardar(), IdTarjeta, PeriodoInicio

### Community 113 - "🎨 GUÍA VISUAL DEL STORE PREMIUM"
Cohesion: 0.18
Nodes (10): 🎭 ANIMACIONES, 🛒 CARRITO MODAL (Deslizable desde derecha), 💻 DESKTOP (1200px+), Estructura Visual, 🔍 FILTROS SIDEBAR, 🎨 GUÍA VISUAL DEL STORE PREMIUM, 📱 MOBILE (375px), 🎨 PALETA DE COLORES (+2 more)

### Community 115 - "ayuda-atajos.component.ts"
Cohesion: 0.14
Nodes (5): Atajo, AyudaAtajosComponent, GrupoAtajos, AyudaAtajosService, esCampoDeEscritura()

### Community 117 - "ActualizacionAppService"
Cohesion: 0.18
Nodes (4): @angular/service-worker, ActualizacionAppService, EventoInstalacion, REVISION_VERSION_MS

### Community 118 - "development"
Cohesion: 0.22
Nodes (9): serve, development, buildTarget, extractLicenses, optimization, sourceMap, builder, configurations (+1 more)

### Community 122 - "ConectividadService"
Cohesion: 0.23
Nodes (6): fechaCorta(), FooterComponent, FECHA_VERSION, VERSION, Contexto, ConectividadService

### Community 124 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, ng, postbuild, serve:ssr:ferreteria, start, test, watch

### Community 125 - "Ferreteria"
Cohesion: 0.25
Nodes (7): Additional Resources, Building, Code scaffolding, Development server, Ferreteria, Running end-to-end tests, Running unit tests

### Community 126 - "caja-arqueo.component.ts"
Cohesion: 0.23
Nodes (9): arqueoGuardado, ArqueoEsperado, ArqueoResumen, MetodoEsperado, MontoPorMetodo, MovimientoCaja, RegistrarArqueo, ResumenSucursalCaja (+1 more)

### Community 130 - "caja-sesion.component.ts"
Cohesion: 0.28
Nodes (11): cantidadEfectiva(), cantidadValida(), DENOMINACIONES_SOL, hayConteo(), lineasConteoVacias(), MAX_CANTIDAD_DENOMINACION, subtotalCentimos(), TipoDenominacionSol (+3 more)

### Community 132 - "sidebar.component.ts"
Cohesion: 0.18
Nodes (7): BarraInferiorComponent, ENTRADAS, ItemMenu, ROLES_PEDIDOS_MENU, SECCIONES_MENU, SeccionMenu, PaginaVacia

### Community 133 - "angular.json"
Cohesion: 0.29
Nodes (6): cli, packageManager, newProjectRoot, projects, $schema, version

### Community 134 - "build"
Cohesion: 0.29
Nodes (7): build, test, builder, configurations, defaultConfiguration, architect, builder

### Community 135 - "LlaveAlertasSunatComponent"
Cohesion: 0.13
Nodes (3): LlaveAlertasSunatComponent, URL_ALERTAS, URL_RECIFRAR

### Community 137 - "recepcion.component.ts"
Cohesion: 0.31
Nodes (6): EscaneoRecepcion, LineaRecepcion, extraerMultiplicador(), LARGO_MAXIMO_CODIGO, normalizarCodigo(), pareceCodigoExacto()

### Community 138 - "arqueo-caja-pagina.component.ts"
Cohesion: 0.20
Nodes (7): FiltrosArqueo, SignoDiferencia, montar(), RESUMEN, turno(), TarjetaSucursal, TurnoCajaListado

### Community 139 - "ubigeo.service.ts"
Cohesion: 0.23
Nodes (8): EstadoBusqueda, LURIN, UbigeoElegido, claveBusqueda(), Guardado, MINIMO_CARACTERES_UBIGEO, Ubigeo, UbigeoService

### Community 140 - "ui/index.ts"
Cohesion: 0.06
Nodes (18): MagneticDirective, acotar(), alEntrarEnPantalla(), crearObservador(), easeOutExpo(), esperando, movimientoPermitido(), punteroFino() (+10 more)

### Community 141 - "production"
Cohesion: 0.33
Nodes (6): production, budgets, buildTarget, optimization, outputHashing, serviceWorker

### Community 142 - "ferreteria"
Cohesion: 0.40
Nodes (5): prefix, projectType, root, sourceRoot, ferreteria

### Community 143 - "urlWhatsappCliente"
Cohesion: 0.38
Nodes (3): normalizarTelefonoPe(), telefonoValidoPe(), urlWhatsappCliente()

### Community 144 - "cobranza.util.ts"
Cohesion: 0.21
Nodes (8): claveDeudor(), DatosRecordatorio, fechaCorta(), hoyLima(), soles(), textoRecordatorio(), TonoTramo, TRAMOS

### Community 149 - "vercel.json"
Cohesion: 0.50
Nodes (3): headers, rewrites, $schema

### Community 150 - "overrides"
Cohesion: 0.67
Nodes (3): lru-cache, overrides, jsdom

### Community 152 - "lotes-sunat.component.ts"
Cohesion: 0.22
Nodes (5): CLASES_ESTADO, nombreDescarga(), NOMBRES_ARCHIVO, QueHacerSunatComponent, AnfitrionComponent

### Community 155 - "stock-sucursales.component.ts"
Cohesion: 0.24
Nodes (3): StockSucursal, NivelStockComponent, StockSucursalesComponent

### Community 157 - "template-routing.module.ts"
Cohesion: 0.22
Nodes (4): MantenimientoModule, MantenimientoRoutingModule, routes, TemplateRoutingModule

### Community 160 - "calcularDelta"
Cohesion: 0.48
Nodes (3): calcularDelta(), DeltaReporte, formatoPorcentaje()

### Community 164 - "filtrarInstantaneo"
Cohesion: 0.43
Nodes (3): aMinusculas(), BusquedaPendiente, filtrarInstantaneo()

### Community 168 - "facturacion-sunat.component.spec.ts"
Cohesion: 0.40
Nodes (3): paginaVacia, responderBeta(), responderConfiguracion()

### Community 170 - "ngsw-config.json"
Cohesion: 0.40
Nodes (4): assetGroups, index, navigationUrls, $schema

## Knowledge Gaps
- **608 isolated node(s):** `$schema`, `version`, `packageManager`, `newProjectRoot`, `projectType` (+603 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1664 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **63 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@angular/core` connect `@angular/core` to `caja-sesion.component.ts`, `alert.service.ts`, `sidebar.component.ts`, `auth-shell.component.ts`, `TemaService`, `LlaveAlertasSunatComponent`, `VentasHistorialComponent`, `hoja-comprobante.model.ts`, `arqueo-caja-pagina.component.ts`, `ubigeo.service.ts`, `nota-credito-asistente.component.ts`, `documentos.models.ts`, `productos.component.ts`, `guias-remision.component.ts`, `recepcion.component.ts`, `ui/index.ts`, `tienda.models.ts`, `activacion-produccion.component.ts`, `sonido-caja.service.spec.ts`, `contacto.component.ts`, `comprobante-detalle.component.ts`, `fiscal.models.ts`, `lotes-sunat.component.ts`, `stock-sucursales.component.ts`, `rxjs`, `template-routing.module.ts`, `SelectorUnidadComponent`, `error.interceptor.ts`, `notificaciones.component.ts`, `aviso-login.util.ts`, `NumeroDirective`, `pedidos.component.spec.ts`, `ProductoRapidoComponent`, `facturacion-sunat.component.spec.ts`, `pedido-detalle.component.spec.ts`, `@angular/router`, `guia-remision.service.ts`, `guia-formulario.component.ts`, `EtiquetasProductoComponent`, `UsuariosComponent`, `package.json`, `roles.constants.ts`, `guias-remision.component.spec.ts`, `app.config.ts`, `AlertService`, `CatalogoComponent`, `avisos-panel.service.ts`, `pages/perfil/perfil.component.ts`, `notification.service.ts`, `fiscal-estado.service.ts`, `reportes.service.ts`, `dashboard.component.ts`, `reportes.component.ts`, `ProductosSinCodigoComponent`, `AvisosPanelService`, `AuthService`, `app.config.server.ts`, `errorOperativo`, `admin/template/header/header.component.ts`, `paleta-comandos.component.ts`, `ayuda-atajos.component.ts`, `ActualizacionAppService`, `ConectividadService`, `caja-arqueo.component.ts`?**
  _High betweenness centrality (0.164) - this node is a cross-community bridge._
- **What connects `$schema`, `version`, `packageManager` to the rest of the system?**
  _608 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `VentasComponent` be split into smaller, more focused modules?**
  _Cohesion score 0.02966887417218543 - nodes in this community are weakly interconnected._
- **Why does `mensajeDeError()` connect `mensajeDeError` to `VentasComponent`, `CotizacionesComponent`, `caja-sesion.component.ts`, `alert.service.ts`, `tienda.models.ts`, `LlaveAlertasSunatComponent`, `VentasHistorialComponent`, `recepcion.component.ts`, `arqueo-caja-pagina.component.ts`, `GuiaFormularioComponent`, `nota-credito-asistente.component.ts`, `ubigeo.service.ts`, `productos.component.ts`, `guias-remision.component.ts`, `GuiasRemisionComponent`, `errores-http.util.ts`, `activacion-produccion.component.ts`, `RecepcionComponent`, `comprobante-detalle.component.ts`, `fiscal.models.ts`, `FacturacionSunatComponent`, `lotes-sunat.component.ts`, `EstadoCuentaComponent`, `rxjs`, `ComprobanteDetalleComponent`, `ReporteMercadoComponent`, `.cargarStockEdicion`, `CajaArqueoComponent`, `VentasSinComprobanteComponent`, `ProductoRapidoComponent`, `PedidoDetalleComponent`, `ClientesComponent`, `.actualizarTelefonoFicha`, `DocComponent`, `guia-formulario.component.ts`, `EnviosSunatComponent`, `RolesComponent`, `CheckoutComponent`, `InventarioComponent`, `LotesSunatComponent`, `AlertService`, `CartService`, `MarcasComponent`, `pages/perfil/perfil.component.ts`, `AlmacenComponent`, `fiscal-estado.service.ts`, `.cargar`, `UbigeoBuscadorComponent`, `reportes.component.ts`, `ProductosSinCodigoComponent`, `ArqueoCajaPaginaComponent`, `PedidosComponent`, `AuthService`, `errorOperativo`, `ProveedoresComponent`, `ResumenDiarioConfigComponent`, `Pedido`, `AdminConfiguracionComponent`, `.error`, `caja-arqueo.component.ts`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Should `CotizacionesComponent` be split into smaller, more focused modules?**
  _Cohesion score 0.03557422969187675 - nodes in this community are weakly interconnected._
- **Why does `@angular/common` connect `@angular/core` to `caja-sesion.component.ts`, `alert.service.ts`, `sidebar.component.ts`, `auth-shell.component.ts`, `tienda.models.ts`, `LlaveAlertasSunatComponent`, `recepcion.component.ts`, `arqueo-caja-pagina.component.ts`, `ubigeo.service.ts`, `nota-credito-asistente.component.ts`, `documentos.models.ts`, `productos.component.ts`, `guias-remision.component.ts`, `ui/index.ts`, `errores-http.util.ts`, `activacion-produccion.component.ts`, `contacto.component.ts`, `comprobante-detalle.component.ts`, `fiscal.models.ts`, `lotes-sunat.component.ts`, `stock-sucursales.component.ts`, `rxjs`, `template-routing.module.ts`, `SelectorUnidadComponent`, `error.interceptor.ts`, `ProductoRapidoComponent`, `facturacion-sunat.component.spec.ts`, `pedido-detalle.component.spec.ts`, `@angular/router`, `guia-remision.service.ts`, `guia-formulario.component.ts`, `package.json`, `roles.constants.ts`, `app.config.ts`, `AlertService`, `CatalogoComponent`, `avisos-panel.service.ts`, `pages/perfil/perfil.component.ts`, `notification.service.ts`, `fiscal-estado.service.ts`, `reportes.service.ts`, `dashboard.component.ts`, `reportes.component.ts`, `ProductosSinCodigoComponent`, `AuthService`, `errorOperativo`, `admin/template/header/header.component.ts`, `paleta-comandos.component.ts`, `ayuda-atajos.component.ts`, `ActualizacionAppService`, `ConectividadService`, `caja-arqueo.component.ts`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Should `tienda.models.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07535460992907801 - nodes in this community are weakly interconnected._