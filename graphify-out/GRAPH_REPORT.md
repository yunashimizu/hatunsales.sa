# Graph Report - ferreteria  (2026-11-05)

## Corpus Check
- 287 files · ~264,674 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 83 file(s) not represented in the graph (top: .css 75, .scss 4, (none) 3)

## Summary
- 3874 nodes · 9875 edges · 162 communities (86 shown, 76 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 431 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0ac68c16`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- VentasComponent
- CotizacionesComponent
- @angular/router
- api-base.service.ts
- @angular/core
- auth.service.ts
- mensajeDeError
- aviso-login.util.ts
- VentasHistorialComponent
- hoja-comprobante.model.ts
- GuiaFormularioComponent
- ProductosComponent
- nota-credito-asistente.component.ts
- documentos.models.ts
- ProductoCardComponent
- guias-remision.component.ts
- AlertService
- GuiasRemisionComponent
- errores-http.util.ts
- activacion-produccion.component.ts
- NotificationService
- CategoriaTienda
- RecepcionComponent
- comprobante-detalle.component.ts
- fiscal.models.ts
- FacturacionSunatComponent
- CarritoComponent
- ✅ CHECKLIST DE IMPLEMENTACIÓN
- alert.service.ts
- ComprobanteDetalleComponent
- fecha-es.pipe.ts
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
- ProductoTienda
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
- roles.constants.ts
- guias-remision.component.spec.ts
- app.config.ts
- dependencies
- InventarioComponent
- PaletaComandosComponent
- LotesSunatComponent
- escapeHtmlAlerta
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
- admin.models.ts
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
- paleta-comandos.component.ts
- DashboardComponent
- reveal.directive.spec.ts
- FavoritosComponent
- 🎨 GUÍA VISUAL DEL STORE PREMIUM
- ProductoAdminService
- LoginComponent
- CarritoPanelComponent
- contacto.component.ts
- development
- AdminConfiguracionComponent
- AdminPerfilComponent
- ConectividadService
- AuthShellComponent
- scripts
- Ferreteria
- CuentaTiendaService
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
- UnidadMedidaService
- UbigeoService
- admin/template/header/header.component.ts
- production
- ferreteria
- whatsapp.util.ts
- MovimientoInventario
- GoogleSignInPrueba
- ProductoService
- sonido-caja.service.spec.ts
- CotizacionService
- vercel.json
- overrides
- PagePlaceholderComponent
- ContactoComponent
- login-request.model.ts
- general-constants.ts
- FiltrosActivosComponent
- formulario-resena.component.ts
- MetodoPago
- store.module.ts
- Almacen

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

## Communities (162 total, 76 thin omitted)

### Community 0 - "VentasComponent"
Cohesion: 0.03
Nodes (6): VentasComponent, LineaVenta, extraerMultiplicador(), LARGO_MAXIMO_CODIGO, normalizarCodigo(), pareceCodigoExacto()

### Community 1 - "CotizacionesComponent"
Cohesion: 0.04
Nodes (7): CotizacionesComponent, errorLocal(), numeroOpcional(), redondear2(), soloDigitos(), Cotizacion, CrearCotizacionPayload

### Community 2 - "@angular/router"
Cohesion: 0.04
Nodes (51): @angular/router, SpotlightDirective, ICONOS, TONOS, EstrellasComponent, WhatsappFlotanteComponent, EMPRESA_TIENDA, urlMailto() (+43 more)

### Community 3 - "api-base.service.ts"
Cohesion: 0.07
Nodes (29): @angular/forms, Pestania, ModoPanel, MOTIVOS, COPIAS_MAXIMAS, COPIAS_MINIMAS, FORMULARIO_VACIO, FotoPendiente (+21 more)

### Community 4 - "@angular/core"
Cohesion: 0.05
Nodes (32): @angular/common, @angular/core, EstadoBusqueda, LURIN, UbigeoElegido, EstadoFiscalApi, RespuestaEnvioWhatsapp, AsignacionCodigoSunat (+24 more)

### Community 5 - "auth.service.ts"
Cohesion: 0.07
Nodes (15): lottie-web, AdminModule, AdminRoutingModule, routes, TemplateModule, TemplateRoutingModule, AuthModule, AuthRoutingModule (+7 more)

### Community 6 - "mensajeDeError"
Cohesion: 0.08
Nodes (3): ImagenProducto, esAccionDestructiva(), mensajeDeError()

### Community 7 - "aviso-login.util.ts"
Cohesion: 0.17
Nodes (18): authGuard(), roleGuard(), NotFoundComponent, almacen(), AvisoLogin, borrar(), escribir(), esMotivo() (+10 more)

### Community 8 - "VentasHistorialComponent"
Cohesion: 0.08
Nodes (7): celdaCsv(), enteroPositivo(), hoyEnLima(), rangoDe(), sumarDias(), VentasHistorialComponent, VentaHistorialFila

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
Cohesion: 0.07
Nodes (14): centesimas(), conDosDecimales(), estimarDevolucion(), EXPLICACION_MOTIVO, MOTIVOS_QUE_BAJAN_DEUDA, NOMBRE_FORMA, NotaCreditoAsistenteComponent, PasoAsistente (+6 more)

### Community 13 - "documentos.models.ts"
Cohesion: 0.05
Nodes (37): FiltroDocumentos, HISTORICA, ComprobanteFila, Paginado, AccionDocumento, AccionSunat, AmbienteFiscal, CatalogoMotivosNota (+29 more)

### Community 15 - "guias-remision.component.ts"
Cohesion: 0.08
Nodes (29): DescargaGuia, GuiaDetalleComponent, NOMBRE_DOCUMENTO, enteroPositivo(), FiltroPantalla, FILTROS_ESTADO, filtroVacio(), Manejo (+21 more)

### Community 16 - "AlertService"
Cohesion: 0.11
Nodes (9): CajaSesionComponent, AperturaCaja, CajaDisponible, ResumenTurnoCaja, SesionCaja, CLASES_ESTADO, NOMBRES_ARCHIVO, NOMBRES_ESTADO (+1 more)

### Community 17 - "GuiasRemisionComponent"
Cohesion: 0.11
Nodes (4): GuiasRemisionComponent, AccionGuia, GuiaRemisionResumen, OperacionGuia

### Community 18 - "errores-http.util.ts"
Cohesion: 0.07
Nodes (41): claveAvisoDe(), codigoPorEstado(), CODIGOS_ERROR, CODIGOS_FRONT, CODIGOS_GLOBALES, CODIGOS_TRANSPORTE, describirError(), DescripcionError (+33 more)

### Community 19 - "activacion-produccion.component.ts"
Cohesion: 0.06
Nodes (18): CambiosConfiguracionFiscal, ConfirmacionesActivacion, ItemChecklistFiscal, ResultadoPruebaCredenciales, SeriesSunat, ActivacionProduccionComponent, CONFIRMACIONES_SOL, Correlativo (+10 more)

### Community 21 - "CategoriaTienda"
Cohesion: 0.18
Nodes (3): CategoriasGridComponent, CategoriaTienda, FooterComponent

### Community 23 - "comprobante-detalle.component.ts"
Cohesion: 0.06
Nodes (43): AccionDetalle, ESTADO_GUIA, TEXTO_ANULACION, TEXTO_CORREO, FilaDocumento, FILTRO_VACIO, Pestana, archivosDescargables() (+35 more)

### Community 24 - "fiscal.models.ts"
Cohesion: 0.08
Nodes (35): AuditoriaFiscal, BloqueoEmision, CertificadoFiscal, ChecklistFiscal, ConfigGre, EmisorBeta, EmisorSunat, EstadoPosBetaFiscal (+27 more)

### Community 25 - "FacturacionSunatComponent"
Cohesion: 0.08
Nodes (5): ConfiguracionSunat, EstadoFiscalGlobal, DestinoFiscal, advertenciasDe(), FacturacionSunatComponent

### Community 27 - "✅ CHECKLIST DE IMPLEMENTACIÓN"
Cohesion: 0.05
Nodes (39): 1. Instalar dependencias, 1. Servicios, 2. Compilar TypeScript, 2. Componentes Principales, 3. Componentes Actualizados, 3. Ejecutar dev server, 4. Índices y Barrels, 5. Documentación (+31 more)

### Community 28 - "alert.service.ts"
Cohesion: 0.06
Nodes (36): rxjs, sweetalert2, CuentaDeposito, DOCUMENTOS, LineaCot, OrigenSugerencias, ResultadoBusqueda, CUENTA_BCP (+28 more)

### Community 29 - "ComprobanteDetalleComponent"
Cohesion: 0.08
Nodes (5): ComprobanteDetalleComponent, correoPlausible(), AnulacionComprobante, ComprobanteDetalle, SolicitudAnularComprobante

### Community 30 - "fecha-es.pipe.ts"
Cohesion: 0.29
Nodes (4): EstiloFecha, FechaEsPipe, MESES, MESES_CORTOS

### Community 31 - "SelectorUnidadComponent"
Cohesion: 0.15
Nodes (3): UnidadAmigable, GrupoOpciones, SelectorUnidadComponent

### Community 32 - "🚀 STORE PREMIUM COMPLETADO - RESUMEN EJECUTIVO"
Cohesion: 0.06
Nodes (35): 10. **HomeComponent Rediseñado** 🏠, 1. **AlertService** 🔔, 1. Verificar que todo está importado, 2. **HeroBannerComponent** 🎬, 2. Ver en navegador, 3. **CategoriasGridComponent** 🏷️, 3. Probar funcionalidades, 4. Código de prueba descuento (+27 more)

### Community 33 - "error.interceptor.ts"
Cohesion: 0.11
Nodes (30): LIMITE_SUNAT_MS, cuerpo, AVISO_GLOBAL, conReintentos(), REINTENTOS, SILENCIOSA, TIEMPO_LIMITE_MS, aplicarPolitica() (+22 more)

### Community 34 - "imagen-cliente.util.ts"
Cohesion: 0.10
Nodes (25): aBlob(), ArchivoImagen, BitmapLike, CALIDAD_JPEG, CanvasLike, comprimirImagen(), Contexto2DLike, extensionDe() (+17 more)

### Community 35 - "caja-arqueo.component.ts"
Cohesion: 0.10
Nodes (8): ArqueoCajaPaginaComponent, CajaArqueoComponent, arqueoGuardado, ArqueoEsperado, ArqueoResumen, MetodoEsperado, MovimientoCaja, RegistrarArqueo

### Community 36 - "VentasSinComprobanteComponent"
Cohesion: 0.08
Nodes (6): consultaNoPublicada(), soloDigitos(), VentasSinComprobanteComponent, codigoDeError(), esErrorDeRed(), esEstadoDeRed()

### Community 37 - "NumeroDirective"
Cohesion: 0.05
Nodes (39): aTipo(), ErrorValidacionNumero, NumeroDirective, primerNumeroInvalido(), AnfitrionComponent, VacioNumero, buscarSeparadorDecimal(), CANTIDAD_MAXIMA (+31 more)

### Community 39 - "producto-rapido.component.ts"
Cohesion: 0.11
Nodes (25): armarComentario(), buscarDuplicadoExacto(), CampoAltaRapida, cantidadSeLleva(), coincideConTexto(), combinarParecidos(), construirProductoVenta(), EntradaValidacion (+17 more)

### Community 41 - "opcionesHttp"
Cohesion: 0.12
Nodes (3): AmbienteFiscal, opcionesHttp(), FiscalAdminService

### Community 42 - "PedidoDetalleComponent"
Cohesion: 0.08
Nodes (3): EstadoPedido, PedidoDetalleComponent, PedidosComponent

### Community 44 - "ProductoTienda"
Cohesion: 0.10
Nodes (6): MarcaTienda, Pagina, ProductoDetalle, ProductoTienda, HomeComponent, CatalogoService

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

### Community 61 - "roles.constants.ts"
Cohesion: 0.13
Nodes (15): ALIAS_ROL, esRolCliente(), esRolConsulta(), esRolStaff(), normalizarRol(), puedeEditarCatalogo(), ROL_IDS, rolCanonicoPorId() (+7 more)

### Community 62 - "guias-remision.component.spec.ts"
Cohesion: 0.09
Nodes (10): CATALOGOS, guiaGuardada(), operacion(), ESPERAS_CONSULTA_MS, ACCIONES, FormularioFalso, SIN_ACCIONES, TEXTO (+2 more)

### Community 63 - "app.config.ts"
Cohesion: 0.16
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

### Community 68 - "escapeHtmlAlerta"
Cohesion: 0.10
Nodes (6): copiarNodosSeguros(), sanearHtml(), textoBoton(), decodificarEntidadesHtml(), escapeHtmlAlerta(), htmlATextoPlano()

### Community 69 - "CatalogoComponent"
Cohesion: 0.11
Nodes (3): ChipFiltro, ConsultaCatalogo, CatalogoComponent

### Community 71 - "ReceptorService"
Cohesion: 0.12
Nodes (3): CajaSesionService, ConfiguracionFiscalService, ReceptorService

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
Nodes (17): AccionAviso, COBERTURA_GLOBAL, DURACION_BASE, esPromesa(), ETIQUETA_LECTOR, MotivoPausa, OpcionesAviso, OpcionesErrorHttp (+9 more)

### Community 83 - "schematics"
Cohesion: 0.12
Nodes (17): schematics, type, type, typeSeparator, typeSeparator, typeSeparator, typeSeparator, typeSeparator (+9 more)

### Community 84 - "admin.models.ts"
Cohesion: 0.13
Nodes (13): VENTA_EMPRESA, VENTA_PERSONA, FILA_ANULADA, FILA_FACTURA, FILA_SIN_COMPROBANTE, html(), texto(), ComprobanteEmitido (+5 more)

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

### Community 109 - "paleta-comandos.component.ts"
Cohesion: 0.15
Nodes (11): FooterComponent, Comando, ComandoVisible, GrupoVisible, normalizar(), PALABRAS, puntaje(), CUENTA_MENU (+3 more)

### Community 111 - "reveal.directive.spec.ts"
Cohesion: 0.18
Nodes (4): reiniciarObservacion(), AnfitrionRevelado, Entrada, ObservadorFalso

### Community 113 - "🎨 GUÍA VISUAL DEL STORE PREMIUM"
Cohesion: 0.18
Nodes (10): 🎭 ANIMACIONES, 🛒 CARRITO MODAL (Deslizable desde derecha), 💻 DESKTOP (1200px+), Estructura Visual, 🔍 FILTROS SIDEBAR, 🎨 GUÍA VISUAL DEL STORE PREMIUM, 📱 MOBILE (375px), 🎨 PALETA DE COLORES (+2 more)

### Community 117 - "contacto.component.ts"
Cohesion: 0.24
Nodes (11): urlMapaAbrir(), urlMapaEmbed(), ABREVIATURAS, calcularEstadoTienda(), DIAS, EstadoTienda, formatearHora(), leerDias() (+3 more)

### Community 118 - "development"
Cohesion: 0.22
Nodes (9): serve, development, buildTarget, extractLicenses, optimization, sourceMap, builder, configurations (+1 more)

### Community 124 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, ng, postbuild, serve:ssr:ferreteria, start, test, watch

### Community 125 - "Ferreteria"
Cohesion: 0.25
Nodes (7): Additional Resources, Building, Code scaffolding, Development server, Ferreteria, Running end-to-end tests, Running unit tests

### Community 130 - "login-response.model.ts"
Cohesion: 0.39
Nodes (3): PermisoResponse, RolResponse, UsuarioLoginResponse

### Community 133 - "angular.json"
Cohesion: 0.29
Nodes (6): cli, packageManager, newProjectRoot, projects, $schema, version

### Community 134 - "build"
Cohesion: 0.29
Nodes (7): build, test, builder, configurations, defaultConfiguration, architect, builder

### Community 140 - "admin/template/header/header.component.ts"
Cohesion: 0.06
Nodes (19): ChipFiscal, PaginaPanel, PAGINAS, ROLES_ESTADO_FISCAL, BotonTemaComponent, MagneticDirective, acotar(), alEntrarEnPantalla() (+11 more)

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
- **510 isolated node(s):** `$schema`, `version`, `packageManager`, `newProjectRoot`, `projectType` (+505 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1384 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **76 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@angular/core` connect `@angular/core` to `@angular/router`, `api-base.service.ts`, `auth.service.ts`, `aviso-login.util.ts`, `hoja-comprobante.model.ts`, `nota-credito-asistente.component.ts`, `documentos.models.ts`, `admin/template/header/header.component.ts`, `guias-remision.component.ts`, `AlertService`, `activacion-produccion.component.ts`, `sonido-caja.service.spec.ts`, `comprobante-detalle.component.ts`, `fiscal.models.ts`, `alert.service.ts`, `formulario-resena.component.ts`, `fecha-es.pipe.ts`, `store.module.ts`, `error.interceptor.ts`, `caja-arqueo.component.ts`, `NumeroDirective`, `producto-rapido.component.ts`, `guia-remision.service.ts`, `guia-formulario.component.ts`, `EtiquetasProductoComponent`, `package.json`, `roles.constants.ts`, `guias-remision.component.spec.ts`, `app.config.ts`, `PaletaComandosComponent`, `ToastsComponent`, `FiscalEstadoService`, `ReporteProductosComponent`, `notification.service.ts`, `admin.models.ts`, `app.config.server.ts`, `errorOperativo`, `ReporteTiposComponent`, `paleta-comandos.component.ts`, `reveal.directive.spec.ts`, `contacto.component.ts`, `ConectividadService`?**
  _High betweenness centrality (0.177) - this node is a cross-community bridge._
- **What connects `$schema`, `version`, `packageManager` to the rest of the system?**
  _510 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `VentasComponent` be split into smaller, more focused modules?**
  _Cohesion score 0.034451801144652676 - nodes in this community are weakly interconnected._
- **Why does `mensajeDeError()` connect `mensajeDeError` to `VentasComponent`, `CotizacionesComponent`, `@angular/router`, `api-base.service.ts`, `@angular/core`, `auth.service.ts`, `VentasHistorialComponent`, `GuiaFormularioComponent`, `nota-credito-asistente.component.ts`, `guias-remision.component.ts`, `AlertService`, `GuiasRemisionComponent`, `errores-http.util.ts`, `activacion-produccion.component.ts`, `RecepcionComponent`, `comprobante-detalle.component.ts`, `fiscal.models.ts`, `FacturacionSunatComponent`, `alert.service.ts`, `ComprobanteDetalleComponent`, `.listar`, `caja-arqueo.component.ts`, `VentasSinComprobanteComponent`, `producto-rapido.component.ts`, `PedidoDetalleComponent`, `ClientesComponent`, `DocComponent`, `guia-formulario.component.ts`, `EnviosSunatComponent`, `RolesComponent`, `CheckoutComponent`, `InventarioComponent`, `LotesSunatComponent`, `escapeHtmlAlerta`, `CartService`, `MarcasComponent`, `PerfilComponent`, `AlmacenComponent`, `FiscalEstadoService`, `SugerenciaReceptor`, `UbigeoBuscadorComponent`, `ProductosSinCodigoComponent`, `StockComponent`, `.ingresarStock`, `errorOperativo`, `InventarioAdminService`, `RegisterComponent`, `FilaInventario`, `LoginComponent`, `AdminConfiguracionComponent`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **Should `CotizacionesComponent` be split into smaller, more focused modules?**
  _Cohesion score 0.037528604118993135 - nodes in this community are weakly interconnected._
- **Why does `@angular/common` connect `@angular/core` to `@angular/router`, `api-base.service.ts`, `auth.service.ts`, `nota-credito-asistente.component.ts`, `documentos.models.ts`, `admin/template/header/header.component.ts`, `guias-remision.component.ts`, `AlertService`, `errores-http.util.ts`, `activacion-produccion.component.ts`, `comprobante-detalle.component.ts`, `fiscal.models.ts`, `alert.service.ts`, `formulario-resena.component.ts`, `store.module.ts`, `error.interceptor.ts`, `caja-arqueo.component.ts`, `producto-rapido.component.ts`, `guia-remision.service.ts`, `guia-formulario.component.ts`, `package.json`, `roles.constants.ts`, `app.config.ts`, `ToastsComponent`, `ReporteProductosComponent`, `notification.service.ts`, `errorOperativo`, `ReporteTiposComponent`, `paleta-comandos.component.ts`, `contacto.component.ts`, `ConectividadService`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Should `@angular/router` be split into smaller, more focused modules?**
  _Cohesion score 0.04126416219439475 - nodes in this community are weakly interconnected._