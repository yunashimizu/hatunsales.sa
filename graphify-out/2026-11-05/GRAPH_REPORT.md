# Graph Report - ferreteria  (2026-11-05)

## Corpus Check
- 287 files · ~264,576 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 83 file(s) not represented in the graph (top: .css 75, .scss 4, (none) 3)

## Summary
- 3874 nodes · 9867 edges · 155 communities (86 shown, 69 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 431 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0ac68c16`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- VentasComponent
- CotizacionesComponent
- rxjs
- api-base.service.ts
- @angular/common
- @angular/core
- mensajeDeError
- aviso-login.util.ts
- ventas-historial.component.ts
- hoja-comprobante.model.ts
- GuiaFormularioComponent
- ProductosComponent
- nota-credito-asistente.component.ts
- doc.component.ts
- producto-detalle.component.ts
- guias-remision.component.ts
- AlertService
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
- cotizaciones.component.ts
- ComprobanteDetalleComponent
- pedido-detalle.component.ts
- SelectorUnidadComponent
- 🚀 STORE PREMIUM COMPLETADO - RESUMEN EJECUTIVO
- error.interceptor.ts
- imagen-cliente.util.ts
- caja-arqueo.component.ts
- VentasSinComprobanteComponent
- NumeroDirective
- CuentasPorCobrarComponent
- producto-rapido.component.ts
- GestionService
- opcionesHttp
- PedidoDetalleComponent
- ClientesComponent
- numero.util.ts
- ProductoDetalleComponent
- guia-remision.service.ts
- ProductoRapidoComponent
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
- documentos.models.ts
- guias-remision.component.spec.ts
- app.config.ts
- dependencies
- InventarioComponent
- PaletaComandosComponent
- LotesSunatComponent
- .informativo
- CatalogoComponent
- CartService
- ReceptorService
- MarcasComponent
- PerfilComponent
- ToastsComponent
- FiltrosComponent
- AlmacenComponent
- FiscalEstadoService
- ReporteProductosComponent
- SugerenciaReceptor
- UbigeoBuscadorComponent
- GuiaRemisionService
- notification.service.ts
- schematics
- normalizarCodigo
- aNumero
- ProductosSinCodigoComponent
- HeroBannerComponent
- importe-en-letras.util.ts
- ProductoVenta
- StockComponent
- .ingresarStock
- HeaderComponent
- AuthService
- options
- app.config.server.ts
- errorOperativo
- ProveedoresComponent
- SidebarComponent
- VisorImagenComponent
- InventarioAdminService
- RecepcionService
- RegisterComponent
- FilaInventario
- ReporteTiposComponent
- SonidoCajaService
- server.ts
- GoogleSignInComponent
- devDependencies
- ubigeo.service.ts
- DashboardComponent
- reveal.directive.spec.ts
- FavoritosComponent
- 🎨 GUÍA VISUAL DEL STORE PREMIUM
- ProductoAdminService
- LoginComponent
- numero.directive.ts
- numero.directive.spec.ts
- development
- AdminConfiguracionComponent
- AdminPerfilComponent
- ConectividadService
- scripts
- Ferreteria
- auth-shell.component.spec.ts
- RolesAdminService
- CajaArqueoService
- TemplateComponent
- login-response.model.ts
- TemaService
- ConfiguracionPasarela
- angular.json
- build
- ParallaxPunteroDirective
- ColaEscaneos
- resultado-compra.ts
- CajaSesionService
- UbigeoService
- VolverArribaComponent
- production
- ferreteria
- whatsapp.util.ts
- MovimientoInventario
- GoogleSignInPrueba
- ProductoService
- sonido-caja.service.spec.ts
- MetodoEnvio
- vercel.json
- overrides
- PagePlaceholderComponent
- ContactoComponent
- login-request.model.ts
- general-constants.ts

## God Nodes (most connected - your core abstractions)
1. `@angular/core` - 214 edges
2. `mensajeDeError()` - 178 edges
3. `@angular/common` - 161 edges
4. `opcionesHttp()` - 160 edges
5. `VentasComponent` - 142 edges
6. `CotizacionesComponent` - 122 edges
7. `AlertService` - 119 edges
8. `rxjs` - 101 edges
9. `@angular/router` - 97 edges
10. `AuthService` - 79 edges

## Surprising Connections (you probably didn't know these)
- `EscaneoPendiente` --references--> `ProductoVenta`  [EXTRACTED]
  src/app/admin/mantenimiento/component/cotizaciones/cotizaciones.component.ts → src/app/admin/models/admin.models.ts
- `CotizacionesComponent` --references--> `ProductoVenta`  [EXTRACTED]
  src/app/admin/mantenimiento/component/cotizaciones/cotizaciones.component.ts → src/app/admin/models/admin.models.ts
- `CotizacionesComponent` --references--> `Receptor`  [EXTRACTED]
  src/app/admin/mantenimiento/component/cotizaciones/cotizaciones.component.ts → src/app/admin/models/admin.models.ts
- `CotizacionesComponent` --references--> `SugerenciaReceptor`  [EXTRACTED]
  src/app/admin/mantenimiento/component/cotizaciones/cotizaciones.component.ts → src/app/admin/models/admin.models.ts
- `CotizacionesComponent` --references--> `ConfigFiscal`  [EXTRACTED]
  src/app/admin/mantenimiento/component/cotizaciones/cotizaciones.component.ts → src/app/admin/service/configuracion-fiscal.service.ts

## Import Cycles
- None detected.

## Communities (155 total, 69 thin omitted)

### Community 1 - "CotizacionesComponent"
Cohesion: 0.04
Nodes (7): CotizacionesComponent, errorLocal(), numeroOpcional(), redondear2(), soloDigitos(), Cotizacion, CrearCotizacionPayload

### Community 2 - "rxjs"
Cohesion: 0.05
Nodes (35): rxjs, ChipFiltro, FiltrosActivosComponent, BannerTienda, Carrito, ConsultaCatalogo, CrearPedidoPayload, CuponValidado (+27 more)

### Community 3 - "api-base.service.ts"
Cohesion: 0.06
Nodes (32): @angular/forms, Pestania, ModoPanel, MOTIVOS, EscaneoRecepcion, LineaRecepcion, PeriodoInfo, PeriodoReporte (+24 more)

### Community 4 - "@angular/common"
Cohesion: 0.05
Nodes (24): @angular/common, COPIAS_MAXIMAS, COPIAS_MINIMAS, FORMULARIO_VACIO, FotoPendiente, EstadoFiscalApi, cabecerasAutenticadas(), cacheCorto() (+16 more)

### Community 5 - "@angular/core"
Cohesion: 0.05
Nodes (33): @angular/core, @angular/router, AdminModule, AdminRoutingModule, routes, MantenimientoModule, MantenimientoRoutingModule, FooterComponent (+25 more)

### Community 6 - "mensajeDeError"
Cohesion: 0.08
Nodes (4): ImagenProducto, esAccionDestructiva(), escapeHtmlAlerta(), mensajeDeError()

### Community 7 - "aviso-login.util.ts"
Cohesion: 0.07
Nodes (35): ALIAS_ROL, esRolCliente(), esRolConsulta(), esRolStaff(), normalizarRol(), puedeEditarCatalogo(), ROL_IDS, rolCanonicoPorId() (+27 more)

### Community 8 - "ventas-historial.component.ts"
Cohesion: 0.05
Nodes (22): AccionDetalle, RUTA_DOCUMENTOS, celdaCsv(), enteroPositivo(), FilaHistorial, FILTRO_HISTORIAL_VACIO, FiltroHistorial, hoyEnLima() (+14 more)

### Community 9 - "hoja-comprobante.model.ts"
Cohesion: 0.07
Nodes (51): HojaComprobanteComponent, ROTULOS_PDF, ambienteDe(), AVISO_BETA_HOJA, cantidad(), capitalizar(), COLUMNAS_TABLA, conMiles() (+43 more)

### Community 10 - "GuiaFormularioComponent"
Cohesion: 0.06
Nodes (4): bloque(), GuiaFormularioComponent, ExcesoCantidadGuia, GuardarGuiaRemision

### Community 11 - "ProductosComponent"
Cohesion: 0.06
Nodes (3): ProductosComponent, OpcionCategoria, ProductoAdmin

### Community 12 - "nota-credito-asistente.component.ts"
Cohesion: 0.06
Nodes (17): claseInsignia(), centesimas(), conDosDecimales(), estimarDevolucion(), EXPLICACION_MOTIVO, MOTIVOS_QUE_BAJAN_DEUDA, NOMBRE_FORMA, NotaCreditoAsistenteComponent (+9 more)

### Community 13 - "doc.component.ts"
Cohesion: 0.07
Nodes (30): FilaDocumento, FILTRO_VACIO, FiltroDocumentos, Pestana, HISTORICA, chipAmbiente, RUTA_DOCUMENTOS_VENTA, VENTA_EMPRESA (+22 more)

### Community 14 - "producto-detalle.component.ts"
Cohesion: 0.05
Nodes (11): EstrellasComponent, ProductoCardComponent, ResenaTienda, StockSucursal, ConfianzaProductoComponent, FichaEsqueletoComponent, DatosResena, FormularioResenaComponent (+3 more)

### Community 15 - "guias-remision.component.ts"
Cohesion: 0.08
Nodes (29): DescargaGuia, GuiaDetalleComponent, NOMBRE_DOCUMENTO, enteroPositivo(), FiltroPantalla, FILTROS_ESTADO, filtroVacio(), Manejo (+21 more)

### Community 16 - "AlertService"
Cohesion: 0.06
Nodes (20): sweetalert2, CajaSesionComponent, AperturaCaja, CajaDisponible, ResumenTurnoCaja, SesionCaja, CLASES_ESTADO, NOMBRES_ARCHIVO (+12 more)

### Community 17 - "GuiasRemisionComponent"
Cohesion: 0.11
Nodes (4): GuiasRemisionComponent, AccionGuia, GuiaRemisionResumen, OperacionGuia

### Community 18 - "errores-http.util.ts"
Cohesion: 0.07
Nodes (40): codigoPorEstado(), CODIGOS_ERROR, CODIGOS_FRONT, CODIGOS_GLOBALES, CODIGOS_TRANSPORTE, describirError(), DescripcionError, ENTIDADES (+32 more)

### Community 19 - "activacion-produccion.component.ts"
Cohesion: 0.06
Nodes (18): CambiosConfiguracionFiscal, ConfirmacionesActivacion, ItemChecklistFiscal, ResultadoPruebaCredenciales, SeriesSunat, ActivacionProduccionComponent, CONFIRMACIONES_SOL, Correlativo (+10 more)

### Community 20 - "NotificationService"
Cohesion: 0.10
Nodes (5): vigilarLentitud(), claveAvisoDe(), esPromesa(), NotificationService, recortarTexto()

### Community 21 - "contacto.component.ts"
Cohesion: 0.08
Nodes (22): CategoriasGridComponent, ICONOS, TONOS, WhatsappFlotanteComponent, EMPRESA_TIENDA, urlMailto(), urlMapaAbrir(), urlMapaEmbed() (+14 more)

### Community 23 - "comprobante-detalle.component.ts"
Cohesion: 0.09
Nodes (25): correoPlausible(), ESTADO_GUIA, TEXTO_ANULACION, TEXTO_CORREO, archivosDescargables(), claseAviso(), describirResultadoSunat(), estadoDeComprobante() (+17 more)

### Community 24 - "fiscal.models.ts"
Cohesion: 0.08
Nodes (35): AuditoriaFiscal, BloqueoEmision, CertificadoFiscal, ChecklistFiscal, ConfigGre, EmisorBeta, EmisorSunat, EstadoPosBetaFiscal (+27 more)

### Community 25 - "FacturacionSunatComponent"
Cohesion: 0.08
Nodes (5): ConfiguracionSunat, EstadoFiscalGlobal, DestinoFiscal, advertenciasDe(), FacturacionSunatComponent

### Community 26 - "CarritoComponent"
Cohesion: 0.06
Nodes (3): CarritoPanelComponent, CarritoItem, CarritoComponent

### Community 27 - "✅ CHECKLIST DE IMPLEMENTACIÓN"
Cohesion: 0.05
Nodes (39): 1. Instalar dependencias, 1. Servicios, 2. Compilar TypeScript, 2. Componentes Principales, 3. Componentes Actualizados, 3. Ejecutar dev server, 4. Índices y Barrels, 5. Documentación (+31 more)

### Community 28 - "cotizaciones.component.ts"
Cohesion: 0.08
Nodes (24): CuentaDeposito, DOCUMENTOS, LineaCot, OrigenSugerencias, ResultadoBusqueda, CUENTA_BCP, pintar(), ponerLinea() (+16 more)

### Community 29 - "ComprobanteDetalleComponent"
Cohesion: 0.09
Nodes (4): ComprobanteDetalleComponent, AnulacionComprobante, ComprobanteDetalle, SolicitudAnularComprobante

### Community 30 - "pedido-detalle.component.ts"
Cohesion: 0.08
Nodes (17): SpotlightDirective, Pedido, PedidoItem, montar(), pedido(), EstiloFecha, FechaEsPipe, MESES (+9 more)

### Community 31 - "SelectorUnidadComponent"
Cohesion: 0.08
Nodes (11): CATALOGO_RESPALDO, CatalogoUnidades, claveUnidad(), CODIGOS_UNIDAD_OCULTOS, EstadoUnidad, ResolucionUnidad, UNIDAD_POR_DEFECTO, UnidadAmigable (+3 more)

### Community 32 - "🚀 STORE PREMIUM COMPLETADO - RESUMEN EJECUTIVO"
Cohesion: 0.06
Nodes (35): 10. **HomeComponent Rediseñado** 🏠, 1. **AlertService** 🔔, 1. Verificar que todo está importado, 2. **HeroBannerComponent** 🎬, 2. Ver en navegador, 3. **CategoriasGridComponent** 🏷️, 3. Probar funcionalidades, 4. Código de prueba descuento (+27 more)

### Community 33 - "error.interceptor.ts"
Cohesion: 0.11
Nodes (30): LIMITE_SUNAT_MS, cuerpo, AVISO_GLOBAL, conReintentos(), REINTENTOS, SILENCIOSA, sinAvisoGlobal(), TIEMPO_LIMITE_MS (+22 more)

### Community 34 - "imagen-cliente.util.ts"
Cohesion: 0.10
Nodes (25): aBlob(), ArchivoImagen, BitmapLike, CALIDAD_JPEG, CanvasLike, comprimirImagen(), Contexto2DLike, extensionDe() (+17 more)

### Community 35 - "caja-arqueo.component.ts"
Cohesion: 0.10
Nodes (8): ArqueoCajaPaginaComponent, CajaArqueoComponent, arqueoGuardado, ArqueoEsperado, ArqueoResumen, MetodoEsperado, MovimientoCaja, RegistrarArqueo

### Community 36 - "VentasSinComprobanteComponent"
Cohesion: 0.08
Nodes (7): consultaNoPublicada(), soloDigitos(), VentasSinComprobanteComponent, VentaSinComprobante, codigoDeError(), esErrorDeRed(), esEstadoDeRed()

### Community 39 - "producto-rapido.component.ts"
Cohesion: 0.11
Nodes (25): armarComentario(), buscarDuplicadoExacto(), CampoAltaRapida, cantidadSeLleva(), coincideConTexto(), combinarParecidos(), construirProductoVenta(), EntradaValidacion (+17 more)

### Community 41 - "opcionesHttp"
Cohesion: 0.12
Nodes (3): AmbienteFiscal, opcionesHttp(), FiscalAdminService

### Community 42 - "PedidoDetalleComponent"
Cohesion: 0.08
Nodes (3): EstadoPedido, PedidoDetalleComponent, PedidosComponent

### Community 44 - "numero.util.ts"
Cohesion: 0.13
Nodes (28): buscarSeparadorDecimal(), CANTIDAD_MAXIMA, decimalesValidos(), DESCUENTO_MAXIMO, EJEMPLOS, formatearNumero(), LecturaNumero, leerNumero() (+20 more)

### Community 46 - "guia-remision.service.ts"
Cohesion: 0.07
Nodes (25): ErrorGuia, Paginado, AccionesGuia, ConductorGuia, ConductorGuiaCuerpo, DestinatarioGuia, DestinatarioGuiaCuerpo, DocumentoRelacionadoGuia (+17 more)

### Community 49 - "guia-formulario.component.ts"
Cohesion: 0.10
Nodes (21): aVentaEncontrada(), conTresDecimales(), DestinoRuc, FormularioGuia, formularioVacio(), ItemFormulario, MensajeFormulario, milesimas() (+13 more)

### Community 50 - "EtiquetasProductoComponent"
Cohesion: 0.10
Nodes (13): EtiquetasProductoComponent, ProductoEtiqueta, AnfitrionComponent, codificarEan13(), esEan13Valido(), OpcionesSvgEan13, PARIDAD_PRIMER_DIGITO, VALIDOS (+5 more)

### Community 54 - "EnviosSunatComponent"
Cohesion: 0.17
Nodes (3): EnvioSunat, EnviosSunatComponent, partesNombre()

### Community 55 - "package.json"
Cohesion: 0.08
Nodes (24): name, packageManager, private, version, @angular/build, @angular/cdk, @angular/cli, @angular/compiler (+16 more)

### Community 56 - "RolesComponent"
Cohesion: 0.13
Nodes (3): RolesComponent, RolAdmin, RolesAdminCrudService

### Community 59 - "Componentes Creados"
Cohesion: 0.08
Nodes (24): 1️⃣ AlertService (Notificaciones Globales), 2️⃣ HeroBannerComponent, 3️⃣ CategoriasGridComponent, 4️⃣ ProductoCardComponent, 5️⃣ FiltrosComponent, 6️⃣ CarritoModalComponent, 7️⃣ CartService, 8️⃣ HeaderComponent (Actualizado) (+16 more)

### Community 61 - "documentos.models.ts"
Cohesion: 0.09
Nodes (20): AccionDocumento, AccionSunat, BajaComprobante, ComprobanteDeVenta, CorreoComprobante, EfectoNotaCredito, EnvioComprobante, EstadoAnulacion (+12 more)

### Community 62 - "guias-remision.component.spec.ts"
Cohesion: 0.09
Nodes (10): CATALOGOS, guiaGuardada(), operacion(), ESPERAS_CONSULTA_MS, ACCIONES, FormularioFalso, SIN_ACCIONES, TEXTO (+2 more)

### Community 63 - "app.config.ts"
Cohesion: 0.15
Nodes (13): crear(), crear(), alCrearTransicion(), alFallarNavegacion(), rutaSinConsulta(), routes, authInterceptor(), leerToken() (+5 more)

### Community 64 - "dependencies"
Cohesion: 0.09
Nodes (23): dependencies, @angular/cdk, @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/platform-browser, @angular/platform-server (+15 more)

### Community 66 - "PaletaComandosComponent"
Cohesion: 0.12
Nodes (3): PaletaComandosComponent, abrir(), PaletaComandosService

### Community 67 - "LotesSunatComponent"
Cohesion: 0.14
Nodes (4): LoteSunat, TipoArchivoLote, LotesSunatComponent, nombreDescarga()

### Community 68 - ".informativo"
Cohesion: 0.13
Nodes (5): copiarNodosSeguros(), sanearHtml(), textoBoton(), decodificarEntidadesHtml(), htmlATextoPlano()

### Community 71 - "ReceptorService"
Cohesion: 0.10
Nodes (3): ConfiguracionFiscalService, CotizacionService, ReceptorService

### Community 74 - "ToastsComponent"
Cohesion: 0.16
Nodes (7): ICONOS, rutaSinConsulta(), TemaAvisos, temaDeUrl(), ToastsComponent, Aviso, TipoAviso

### Community 77 - "FiscalEstadoService"
Cohesion: 0.16
Nodes (4): FiscalEstadoService, numero(), resumirEstadoFiscal(), peticionSilenciosa()

### Community 78 - "ReporteProductosComponent"
Cohesion: 0.11
Nodes (3): ProductoCotizadoReporte, ProductoVendidoReporte, ReporteProductosComponent

### Community 81 - "GuiaRemisionService"
Cohesion: 0.12
Nodes (4): GuiaRemisionService, opcionesSunat(), parametros(), conTiempoLimite()

### Community 82 - "notification.service.ts"
Cohesion: 0.12
Nodes (16): AccionAviso, COBERTURA_GLOBAL, DURACION_BASE, ETIQUETA_LECTOR, MotivoPausa, OpcionesAviso, OpcionesErrorHttp, OpcionesSinTipo (+8 more)

### Community 83 - "schematics"
Cohesion: 0.12
Nodes (17): schematics, type, type, typeSeparator, typeSeparator, typeSeparator, typeSeparator, typeSeparator (+9 more)

### Community 84 - "normalizarCodigo"
Cohesion: 0.26
Nodes (4): extraerMultiplicador(), LARGO_MAXIMO_CODIGO, normalizarCodigo(), pareceCodigoExacto()

### Community 85 - "aNumero"
Cohesion: 0.21
Nodes (8): aNumero(), avisoPrecioBajoCosto(), esEnteroPositivo(), formatearMoneda(), ResultadoValidacion, textoCantidades(), validarAltaRapida(), validarCantidades()

### Community 88 - "importe-en-letras.util.ts"
Cohesion: 0.21
Nodes (12): apocopar(), CENTENAS, centenasALetras(), DECENAS, decenasALetras(), enteroALetras(), grupoALetras(), hastaMillonALetras() (+4 more)

### Community 89 - "ProductoVenta"
Cohesion: 0.17
Nodes (5): EscaneoPendiente, ResultadoAltaRapida, ProductoVenta, ResultadoCodigo, escapeHtml()

### Community 94 - "options"
Cohesion: 0.13
Nodes (15): options, allowedCommonJsDependencies, assets, browser, inlineStyleLanguage, outputMode, polyfills, scripts (+7 more)

### Community 95 - "app.config.server.ts"
Cohesion: 0.19
Nodes (8): @angular/platform-browser, @angular/ssr, zone.js, App, appConfig, config, serverConfig, serverRoutes

### Community 96 - "errorOperativo"
Cohesion: 0.34
Nodes (5): nombreDescarga(), FormatoPdfComprobante, descargarArchivo(), errorOperativo(), normalizarErrorBlob()

### Community 104 - "ReporteTiposComponent"
Cohesion: 0.15
Nodes (3): ICONOS, PorTipoReporte, ReporteTiposComponent

### Community 106 - "server.ts"
Cohesion: 0.17
Nodes (8): express, browserDir, csr, index, angularApp, app, browserDistFolder, reqHandler

### Community 108 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, @angular/build, @angular/cli, @angular/compiler-cli, jsdom, prettier, tailwindcss, @types/express (+3 more)

### Community 109 - "ubigeo.service.ts"
Cohesion: 0.29
Nodes (7): EstadoBusqueda, LURIN, UbigeoElegido, Guardado, MINIMO_CARACTERES_UBIGEO, LURIN, Ubigeo

### Community 111 - "reveal.directive.spec.ts"
Cohesion: 0.18
Nodes (4): reiniciarObservacion(), AnfitrionRevelado, Entrada, ObservadorFalso

### Community 113 - "🎨 GUÍA VISUAL DEL STORE PREMIUM"
Cohesion: 0.18
Nodes (10): 🎭 ANIMACIONES, 🛒 CARRITO MODAL (Deslizable desde derecha), 💻 DESKTOP (1200px+), Estructura Visual, 🔍 FILTROS SIDEBAR, 🎨 GUÍA VISUAL DEL STORE PREMIUM, 📱 MOBILE (375px), 🎨 PALETA DE COLORES (+2 more)

### Community 116 - "numero.directive.ts"
Cohesion: 0.27
Nodes (7): aTipo(), ErrorValidacionNumero, VacioNumero, ErrorNumero, esTipoNumero(), resolverReglas(), TipoNumero

### Community 118 - "development"
Cohesion: 0.22
Nodes (9): serve, development, buildTarget, extractLicenses, optimization, sourceMap, builder, configurations (+1 more)

### Community 124 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, ng, postbuild, serve:ssr:ferreteria, start, test, watch

### Community 125 - "Ferreteria"
Cohesion: 0.25
Nodes (7): Additional Resources, Building, Code scaffolding, Development server, Ferreteria, Running end-to-end tests, Running unit tests

### Community 126 - "auth-shell.component.spec.ts"
Cohesion: 0.25
Nodes (3): lottie-web, CARGAR_LOTTIE, AnfitrionPrueba

### Community 130 - "login-response.model.ts"
Cohesion: 0.39
Nodes (3): PermisoResponse, RolResponse, UsuarioLoginResponse

### Community 133 - "angular.json"
Cohesion: 0.29
Nodes (6): cli, packageManager, newProjectRoot, projects, $schema, version

### Community 134 - "build"
Cohesion: 0.29
Nodes (7): build, test, builder, configurations, defaultConfiguration, architect, builder

### Community 141 - "production"
Cohesion: 0.40
Nodes (5): production, budgets, buildTarget, optimization, outputHashing

### Community 142 - "ferreteria"
Cohesion: 0.40
Nodes (5): prefix, projectType, root, sourceRoot, ferreteria

### Community 143 - "whatsapp.util.ts"
Cohesion: 0.60
Nodes (3): normalizarTelefonoPe(), telefonoValidoPe(), urlWhatsappCliente()

### Community 149 - "vercel.json"
Cohesion: 0.50
Nodes (3): headers, rewrites, $schema

### Community 150 - "overrides"
Cohesion: 0.67
Nodes (3): lru-cache, overrides, jsdom

## Knowledge Gaps
- **509 isolated node(s):** `$schema`, `version`, `packageManager`, `newProjectRoot`, `projectType` (+504 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1385 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **69 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@angular/core` connect `@angular/core` to `rxjs`, `api-base.service.ts`, `@angular/common`, `aviso-login.util.ts`, `ventas-historial.component.ts`, `hoja-comprobante.model.ts`, `nota-credito-asistente.component.ts`, `doc.component.ts`, `producto-detalle.component.ts`, `guias-remision.component.ts`, `AlertService`, `activacion-produccion.component.ts`, `sonido-caja.service.spec.ts`, `contacto.component.ts`, `comprobante-detalle.component.ts`, `fiscal.models.ts`, `cotizaciones.component.ts`, `pedido-detalle.component.ts`, `SelectorUnidadComponent`, `error.interceptor.ts`, `caja-arqueo.component.ts`, `producto-rapido.component.ts`, `guia-remision.service.ts`, `guia-formulario.component.ts`, `EtiquetasProductoComponent`, `package.json`, `guias-remision.component.spec.ts`, `app.config.ts`, `PaletaComandosComponent`, `ToastsComponent`, `FiscalEstadoService`, `ReporteProductosComponent`, `notification.service.ts`, `app.config.server.ts`, `VisorImagenComponent`, `ReporteTiposComponent`, `ubigeo.service.ts`, `reveal.directive.spec.ts`, `numero.directive.ts`, `numero.directive.spec.ts`, `auth-shell.component.spec.ts`?**
  _High betweenness centrality (0.177) - this node is a cross-community bridge._
- **What connects `$schema`, `version`, `packageManager` to the rest of the system?**
  _509 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `VentasComponent` be split into smaller, more focused modules?**
  _Cohesion score 0.037528790136837825 - nodes in this community are weakly interconnected._
- **Why does `mensajeDeError()` connect `mensajeDeError` to `VentasComponent`, `CotizacionesComponent`, `rxjs`, `api-base.service.ts`, `@angular/common`, `@angular/core`, `ventas-historial.component.ts`, `GuiaFormularioComponent`, `ProductosComponent`, `nota-credito-asistente.component.ts`, `doc.component.ts`, `guias-remision.component.ts`, `AlertService`, `GuiasRemisionComponent`, `errores-http.util.ts`, `activacion-produccion.component.ts`, `RecepcionComponent`, `comprobante-detalle.component.ts`, `fiscal.models.ts`, `FacturacionSunatComponent`, `cotizaciones.component.ts`, `ComprobanteDetalleComponent`, `pedido-detalle.component.ts`, `caja-arqueo.component.ts`, `VentasSinComprobanteComponent`, `producto-rapido.component.ts`, `PedidoDetalleComponent`, `ClientesComponent`, `DocComponent`, `guia-formulario.component.ts`, `EnviosSunatComponent`, `RolesComponent`, `CheckoutComponent`, `InventarioComponent`, `LotesSunatComponent`, `CartService`, `MarcasComponent`, `PerfilComponent`, `AlmacenComponent`, `FiscalEstadoService`, `SugerenciaReceptor`, `UbigeoBuscadorComponent`, `normalizarCodigo`, `ProductosSinCodigoComponent`, `StockComponent`, `.ingresarStock`, `InventarioAdminService`, `RegisterComponent`, `FilaInventario`, `ubigeo.service.ts`, `LoginComponent`, `AdminConfiguracionComponent`, `.confirmarPedido`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Should `CotizacionesComponent` be split into smaller, more focused modules?**
  _Cohesion score 0.03813882532418002 - nodes in this community are weakly interconnected._
- **Why does `@angular/common` connect `@angular/common` to `rxjs`, `api-base.service.ts`, `@angular/core`, `aviso-login.util.ts`, `ventas-historial.component.ts`, `nota-credito-asistente.component.ts`, `doc.component.ts`, `producto-detalle.component.ts`, `guias-remision.component.ts`, `AlertService`, `errores-http.util.ts`, `activacion-produccion.component.ts`, `contacto.component.ts`, `comprobante-detalle.component.ts`, `fiscal.models.ts`, `cotizaciones.component.ts`, `pedido-detalle.component.ts`, `SelectorUnidadComponent`, `error.interceptor.ts`, `caja-arqueo.component.ts`, `producto-rapido.component.ts`, `guia-remision.service.ts`, `guia-formulario.component.ts`, `package.json`, `app.config.ts`, `ToastsComponent`, `ReporteProductosComponent`, `notification.service.ts`, `VisorImagenComponent`, `ReporteTiposComponent`, `ubigeo.service.ts`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Should `rxjs` be split into smaller, more focused modules?**
  _Cohesion score 0.04798356982823002 - nodes in this community are weakly interconnected._