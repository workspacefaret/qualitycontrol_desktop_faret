using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Services;
using QualityControlCenter.Backend.Services.PlanificacionApi;
using QualityControlCenter.Backend.Services.SapRecepcionApi;

namespace QualityControlCenter.Modules.Trazabilidad
{
    // Módulo de solo consulta (INNPACK): NP en Planificación FARET (programa-produccion, vía API,
    // sin auth) + materiales por proceso (fps-api, Tipo='INSUMO' en FPS_PRODUCCION) + paletizado
    // en registro_paletizado (migrado a QualityControlInnpack.Api, ya no MySQL directo desde el
    // desktop). No inserta ni recalcula nada — ver contex.md para el detalle de arquitectura.
    public class TrazabilidadHandler
    {
        private readonly TrazabilidadService _service;
        private readonly FpsTrazabilidadApiService? _fpsTrazabilidad;
        private readonly InnpackTrazabilidadDocumentosApiService _docs;
        private readonly SapRecepcionApiClient? _sap;
        private readonly InnpackApiClient _innpack;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public TrazabilidadHandler(
            InnpackApiClient innpackClient,
            PlanificacionApiClient planificacionClient,
            FpsMaterialesApiService fpsMaterialesClient,
            FpsTrazabilidadApiService? fpsTrazabilidad = null,
            SapRecepcionApiClient? sapClient = null
        )
        {
            _fpsTrazabilidad = fpsTrazabilidad;
            _sap = sapClient;
            _innpack = innpackClient;
            _docs = new InnpackTrazabilidadDocumentosApiService(innpackClient);
            _service = new TrazabilidadService(
                planificacionClient,
                fpsMaterialesClient,
                new InnpackTrazabilidadApiService(innpackClient)
            );
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                if (action == "trazabilidad.consultarNp")
                {
                    var jsonData = GetDataElement(data);
                    var np = GetString(jsonData, "np").Trim();

                    if (string.IsNullOrEmpty(np))
                        return Error("Debes indicar el NP a consultar");

                    var (ok, procesos, paletizado, error) = await _service.ConsultarNpAsync(np);
                    if (!ok)
                        return Error(error ?? "No se pudo consultar Planificación FARET");

                    return Ok(
                        new
                        {
                            np,
                            procesos,
                            paletizado,
                            avisoPlanificacion = error, // aviso no bloqueante (ej. API no configurada)
                        }
                    );
                }

                // Trazabilidad integral (Fase 1a, solo lectura): NP completa o búsqueda inversa por lote,
                // ambas desde fps-api (FPS + SAP + liberaciones QCS). Los registros de Calidad los pide
                // el frontend a sus propias acciones (registrosControl / productoTerminado).
                if (action == "trazabilidad.integral" || action == "trazabilidad.lote")
                {
                    if (_fpsTrazabilidad is null)
                        return Error("La trazabilidad integral no está disponible en esta instalación.");

                    var jsonData = GetDataElement(data);
                    string estado;
                    JsonElement resultado;
                    string? error;
                    if (action == "trazabilidad.integral")
                    {
                        var np = GetString(jsonData, "np").Trim();
                        if (!FpsTrazabilidadApiService.NpValido(np))
                            return Error("Debes indicar un NP numérico válido.");
                        (estado, resultado, error) = await _fpsTrazabilidad.ObtenerNpAsync(np);
                    }
                    else
                    {
                        var lote = GetString(jsonData, "lote").Trim();
                        if (!FpsTrazabilidadApiService.LoteValido(lote))
                            return Error("Lote inválido: hasta 36 caracteres (letras, números, punto, guion, barra o guion bajo).");
                        (estado, resultado, error) = await _fpsTrazabilidad.ObtenerLoteAsync(lote);
                    }

                    if (estado != "OK")
                        return Error(error ?? "No se pudo consultar FPS.");
                    return Ok(resultado);
                }

                // "Ver registro original" de una corrida: la fila tal como está en FPS (fps-api, solo lectura).
                if (action == "trazabilidad.registroOriginal")
                {
                    if (_fpsTrazabilidad is null)
                        return Error("El registro original no está disponible en esta instalación.");
                    var datos = GetDataElement(data);
                    var np = GetString(datos, "np").Trim();
                    var corrida = GetString(datos, "corrida").Trim();
                    if (!FpsTrazabilidadApiService.NpValido(np) || !FpsTrazabilidadApiService.CorridaValida(corrida))
                        return Error("NP o corrida no válida.");
                    var (estado, resultado, error) = await _fpsTrazabilidad.ObtenerCorridaAsync(np, corrida);
                    return estado == "OK" ? Ok(resultado) : Error(error ?? "No se pudo consultar FPS.");
                }

                // Búsqueda de NP por código o cliente (fps-api sobre las notas de venta de SAP INNPACK, solo lectura).
                if (action == "trazabilidad.buscar")
                {
                    if (_fpsTrazabilidad is null)
                        return Error("La búsqueda no está disponible en esta instalación.");
                    var texto = GetString(GetDataElement(data), "texto").Trim();
                    if (texto.Length < 3 || texto.Length > 60)
                        return Error("Escribe entre 3 y 60 caracteres.");
                    var (estadoB, resultadoB, errorB) = await _fpsTrazabilidad.BuscarAsync(texto);
                    return estadoB == "OK" ? Ok(resultadoB) : Error(errorB ?? "No se pudo buscar.");
                }

                // Adjuntos (PDF) de guías/facturas/devoluciones/notas de crédito: apisapfaret → Service Layer, solo lectura.
                if (action == "trazabilidad.noConformidades")
                {
                    var npNc = GetString(GetDataElement(data), "np").Trim();
                    if (!FpsTrazabilidadApiService.NpValido(npNc))
                        return Error("NP no válida.");
                    return await Forward(_innpack.GetAsync($"api/no-conformidades/por-np?np={npNc}"));
                }

                // Despacho de la nota de venta INNPACK calculado por apisapfaret (Service Layer, solo lectura).
                if (action == "trazabilidad.despachoSap")
                {
                    if (_sap is null || !_sap.IsConfigured)
                        return Error("La conexión con SAP no está configurada en este equipo.");
                    if (!TryGetId(GetDataElement(data), "docEntry", out var docEntryNv))
                        return Error("Falta la nota de venta.");
                    var (okSap, cuerpo) = await _sap.GetAsync($"api/documentos/notaventa/{docEntryNv}/despacho?empresa=INNPACK");
                    return TryUnwrapSap(okSap, cuerpo, out var despacho, out var errorSap)
                        && despacho.TryGetProperty("ok", out var fin) && fin.ValueKind == JsonValueKind.True
                        ? Ok(despacho)
                        : Error(errorSap);
                }

                if (action is "trazabilidad.adjuntosSap.list" or "trazabilidad.adjuntosSap.abrir")
                    return await HandleAdjuntosSap(action, GetDataElement(data));

                // Formato oficial REG-SGI-TDP-V05: el frontend manda el modelo ya armado (mismo del PDF); aquí solo se dibuja.
                if (action == "trazabilidad.exportarV05Excel")
                {
                    var modelo = GetDataElement(data);
                    var np = GetString(modelo, "np").Trim();
                    if (!NpRegex.IsMatch(np))
                        return Error("Debes indicar una NP válida (letras, números, punto o guion, hasta 40 caracteres).");
                    var bytes = TrazabilidadV05Excel.Construir(modelo);
                    return Ok(new { fileName = $"REG-SGI-TDP-V05_NP{np}.xlsx", base64 = Convert.ToBase64String(bytes) });
                }

                // Fase 1b: panel documental SGI y factor unidades/pliego (API INNPACK, tablas trazabilidad_*).
                if (
                    action.StartsWith("trazabilidad.documentos.")
                    || action.StartsWith("trazabilidad.factor.")
                    || action == "trazabilidad.auditoria.list"
                )
                    return await HandleDocumentos(action, GetDataElement(data));

                return Error($"Acción no reconocida: {action}");
            }
            catch (Exception ex)
            {
                return Error($"Error interno: {ex.Message}");
            }
        }

        // ── Fase 1b: documentos SGI y factor ─────────────────────────────────────────────────

        private static readonly Regex NpRegex = new(@"^[0-9A-Za-z._-]{1,40}$", RegexOptions.Compiled);
        private static readonly string[] CamposSubida =
        {
            "requisitoId", "estado", "nombreArchivo", "contenidoBase64", "fechaDocumento", "lote", "observacion", "enlace",
        };

        private async Task<string> HandleDocumentos(string action, JsonElement d)
        {
            var np = GetString(d, "np").Trim();
            var necesitaNp = action is not ("trazabilidad.documentos.abrir" or "trazabilidad.documentos.anular"
                or "trazabilidad.factor.confirmar" or "trazabilidad.factor.rechazar");
            if (necesitaNp && !NpRegex.IsMatch(np))
                return Error("Debes indicar una NP válida (letras, números, punto o guion, hasta 40 caracteres).");

            switch (action)
            {
                case "trazabilidad.documentos.list":
                    return await Forward(_docs.ListarAsync(np));
                case "trazabilidad.documentos.historial":
                    if (!TryGetId(d, "requisitoId", out var requisitoId))
                        return Error("Falta el requisito documental.");
                    return await Forward(_docs.HistorialAsync(np, requisitoId));
                case "trazabilidad.documentos.subir":
                {
                    var body = new Dictionary<string, object>();
                    foreach (var campo in CamposSubida)
                        if (d.TryGetProperty(campo, out var v) && v.ValueKind != JsonValueKind.Null)
                            body[campo] = v.Clone();
                    return await Forward(_docs.SubirAsync(np, body));
                }
                case "trazabilidad.documentos.anular":
                    if (!TryGetId(d, "id", out var docId))
                        return Error("Falta el documento.");
                    return await Forward(_docs.AnularAsync(docId, new Dictionary<string, object> { ["motivo"] = GetString(d, "motivo") }));
                case "trazabilidad.documentos.abrir":
                    return await AbrirDocumento(d);
                case "trazabilidad.documentos.zip":
                    return await GuardarZip(np, d.TryGetProperty("sapDocs", out var sapDocs) ? sapDocs : default);
                case "trazabilidad.factor.list":
                    return await Forward(_docs.FactoresAsync(np));
                case "trazabilidad.factor.proponer":
                {
                    var body = new Dictionary<string, object>();
                    foreach (var campo in new[] { "item", "unidadesPorPliego", "origen", "referenciaFps", "observacion" })
                        if (d.TryGetProperty(campo, out var v) && v.ValueKind != JsonValueKind.Null)
                            body[campo] = v.Clone();
                    return await Forward(_docs.ProponerFactorAsync(np, body));
                }
                case "trazabilidad.factor.confirmar":
                    if (!TryGetId(d, "id", out var fId))
                        return Error("Falta el factor.");
                    return await Forward(_docs.ConfirmarFactorAsync(fId));
                case "trazabilidad.factor.rechazar":
                    if (!TryGetId(d, "id", out var fIdR))
                        return Error("Falta el factor.");
                    return await Forward(_docs.RechazarFactorAsync(fIdR, new Dictionary<string, object> { ["motivo"] = GetString(d, "motivo") }));
                case "trazabilidad.auditoria.list":
                    return await Forward(_docs.AuditoriaAsync(np));
                default:
                    return Error($"Acción no reconocida: {action}");
            }
        }

        private static readonly Regex TipoDocumento = new(@"^(guia|factura|devolucion|notacredito|notaventa|recepcion)$");

        // Adjuntos de documentos SAP. Los documentos de venta son siempre de INNPACK (módulo exclusivo). Solo la recepción de
        // compra de un material consumido puede venir de la sociedad FARET, porque la producción INNPACK consume lotes de ambas.
        private async Task<string> HandleAdjuntosSap(string action, JsonElement d)
        {
            if (_sap is null || !_sap.IsConfigured)
                return Error("La conexión con SAP no está configurada en este equipo.");
            var tipo = GetString(d, "tipo");
            if (!TipoDocumento.IsMatch(tipo))
                return Error("Tipo de documento no válido.");
            if (!TryGetId(d, "docEntry", out var docEntry))
                return Error("Falta el documento.");
            var baseRuta = $"api/documentos-adjuntos/{tipo}/{docEntry}";
            var empresa = tipo == "recepcion" && GetString(d, "empresa") == "FARET" ? "FARET" : "INNPACK";

            if (action == "trazabilidad.adjuntosSap.list")
            {
                var (ok, body) = await _sap.GetAsync($"{baseRuta}?empresa={empresa}");
                return TryUnwrapSap(ok, body, out var payload, out var error) ? Ok(payload) : Error(error);
            }

            if (!TryGetId(d, "linea", out var linea, permitirCero: true))
                return Error("Falta el adjunto.");
            var (okF, contenido, errorF) = await _sap.GetBytesAsync($"{baseRuta}/{linea}/archivo?empresa={empresa}");
            if (!okF || contenido is null)
                return Error(errorF ?? "No se pudo obtener el adjunto.");
            var nombre = Path.GetFileName(GetString(d, "nombre"));
            foreach (var c in Path.GetInvalidFileNameChars()) nombre = nombre.Replace(c, '_');
            if (string.IsNullOrWhiteSpace(nombre)) nombre = $"{tipo}_{docEntry}_{linea}.pdf";
            var carpeta = Path.Combine(Path.GetTempPath(), "QCC_Trazabilidad_SAP");
            Directory.CreateDirectory(carpeta);
            var ruta = Path.Combine(carpeta, $"{empresa}_{tipo}{docEntry}_{linea}_{nombre}");
            if (!ArchivosSeguros.SePuedeAbrir(nombre))
                return Error(ArchivosSeguros.MensajeBloqueo);
            await File.WriteAllBytesAsync(ruta, contenido);
            Process.Start(new ProcessStartInfo { FileName = ruta, UseShellExecute = true });
            return Ok(new { nombreArchivo = nombre, bytes = contenido.Length });
        }

        private static bool TryUnwrapSap(bool ok, string body, out JsonElement payload, out string error)
        {
            payload = default;
            error = "SAP no respondió correctamente.";
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (root.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String && !ok)
                    error = m.GetString() ?? error;
                if (!ok) return false;
                payload = root.Clone();
                return true;
            }
            catch (JsonException)
            {
                return false;
            }
        }

        // Escribe el archivo a una carpeta temporal y lo abre con la app del sistema (mismo patrón que
        // Control Documental para formatos no embebibles). El nombre se reduce a nombre de archivo.
        private async Task<string> AbrirDocumento(JsonElement d)
        {
            if (!TryGetId(d, "id", out var id))
                return Error("Falta el documento.");
            var (ok, body) = await _docs.ArchivoAsync(id);
            if (!TryUnwrap(body, out var payload, out var error) || !ok)
                return Error(error);

            var nombre = Path.GetFileName(payload.GetProperty("nombreArchivo").GetString() ?? "documento");
            var contenido = Convert.FromBase64String(payload.GetProperty("contenidoBase64").GetString() ?? "");
            var carpeta = Path.Combine(Path.GetTempPath(), "QCC_Trazabilidad");
            Directory.CreateDirectory(carpeta);
            var ruta = Path.Combine(carpeta, $"{id}_{nombre}");
            if (!ArchivosSeguros.SePuedeAbrir(nombre))
                return Error(ArchivosSeguros.MensajeBloqueo);
            await File.WriteAllBytesAsync(ruta, contenido);
            Process.Start(new ProcessStartInfo { FileName = ruta, UseShellExecute = true });
            return Ok(new { nombreArchivo = nombre });
        }

        // Guarda el ZIP en Descargas (nunca sobrescribe) y lo muestra en el Explorador.
        private async Task<string> GuardarZip(string np, JsonElement sapDocs = default)
        {
            var (ok, body) = await _docs.ZipAsync(np);
            if (!TryUnwrap(body, out var payload, out var error) || !ok)
                return Error(error);

            var nombre = Path.GetFileName(payload.GetProperty("nombreArchivo").GetString() ?? $"Trazabilidad_NP{np}.zip");
            var contenido = Convert.FromBase64String(payload.GetProperty("contenidoBase64").GetString() ?? "");
            var destino = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            if (!Directory.Exists(destino))
                destino = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

            if (DirectorioPruebas != null)
                destino = DirectorioPruebas;

            var ruta = Path.Combine(destino, nombre);
            var baseName = Path.GetFileNameWithoutExtension(nombre);
            for (var n = 2; File.Exists(ruta); n++)
                ruta = Path.Combine(destino, $"{baseName}_{DateTime.Now:yyyyMMdd_HHmmss}_{n}.zip");
            await File.WriteAllBytesAsync(ruta, contenido);
            var anexosSap = await AgregarAnexosSap(ruta, sapDocs);

            if (DirectorioPruebas == null)
                Process.Start(new ProcessStartInfo { FileName = "explorer.exe", Arguments = $"/select,\"{ruta}\"", UseShellExecute = true });

            return Ok(new
            {
                ruta,
                incluidos = payload.GetProperty("incluidos").GetInt32(),
                faltantes = payload.GetProperty("faltantes").GetInt32(),
                sapIncluidos = anexosSap.Incluidos,
                sapFallidos = anexosSap.Fallidos,
            });
        }

        private const int MaxDocumentosSap = 40;
        private const long MaxBytesSap = 150L * 1024 * 1024;

        // Agrega al ZIP (carpeta SAP/) los adjuntos de los documentos de venta SAP INNPACK de la NP y de las recepciones de los
        // lotes consumidos (INNPACK o FARET), con un índice de lo incluido y lo no obtenido. No se clasifican ni se asume que
        // sean certificados.
        // Las consultas a SAP van de a una.
        private async Task<(int Incluidos, int Fallidos)> AgregarAnexosSap(string rutaZip, JsonElement documentos)
        {
            if (documentos.ValueKind != JsonValueKind.Array || documentos.GetArrayLength() == 0)
                return (0, 0);
            var indice = new List<string> { "Adjuntos SAP de documentos de venta (INNPACK) y de recepciones de los lotes consumidos. SAP no los clasifica: revisar su contenido." };
            int incluidos = 0, fallidos = 0, revisados = 0;
            long total = 0;
            var vistos = new HashSet<string>();
            using var zip = System.IO.Compression.ZipFile.Open(rutaZip, System.IO.Compression.ZipArchiveMode.Update);

            foreach (var d in documentos.EnumerateArray())
            {
                if (d.ValueKind != JsonValueKind.Object) continue;
                var tipo = GetString(d, "tipo");
                if (!TipoDocumento.IsMatch(tipo) || !TryGetId(d, "docEntry", out var docEntry))
                    continue;
                // Solo una recepción de compra puede venir de la sociedad FARET (material consumido por INNPACK).
                var empresa = tipo == "recepcion" && GetString(d, "empresa") == "FARET" ? "FARET" : "INNPACK";
                if (!vistos.Add($"{empresa}|{tipo}|{docEntry}"))
                    continue;
                var etiqueta = $"{tipo} {(tipo == "recepcion" ? empresa + " " : "")}{(TryGetId(d, "docNum", out var docNum) ? docNum : docEntry)}";
                if (++revisados > MaxDocumentosSap)
                {
                    indice.Add($"LÍMITE: solo se revisan {MaxDocumentosSap} documentos; faltan los restantes (ábralos desde la pantalla).");
                    fallidos++;
                    break;
                }
                if (_sap is null || !_sap.IsConfigured)
                {
                    indice.Add($"NO INCLUIDO {etiqueta}: la conexión con SAP no está configurada en este equipo.");
                    fallidos++;
                    continue;
                }

                var baseRuta = $"api/documentos-adjuntos/{tipo}/{docEntry}";
                var (ok, body) = await _sap.GetAsync($"{baseRuta}?empresa={empresa}");
                if (!TryUnwrapSap(ok, body, out var lista, out var error) || !lista.TryGetProperty("adjuntos", out var adjuntos) || adjuntos.ValueKind != JsonValueKind.Array)
                {
                    indice.Add($"NO INCLUIDO {etiqueta}: {error}");
                    fallidos++;
                    continue;
                }
                if (adjuntos.GetArrayLength() == 0)
                    indice.Add($"SIN ADJUNTOS {etiqueta}");

                foreach (var a in adjuntos.EnumerateArray())
                {
                    if (!TryGetId(a, "numero", out var linea, permitirCero: true)) continue;
                    var nombre = NombreArchivoSeguro($"{GetString(a, "nombre")}.{GetString(a, "extension")}".TrimEnd('.'), $"adjunto_{linea}");
                    var (okF, contenido, errorF) = await _sap.GetBytesAsync($"{baseRuta}/{linea}/archivo?empresa={empresa}");
                    if (!okF || contenido is null || total + contenido.Length > MaxBytesSap)
                    {
                        indice.Add($"NO INCLUIDO {etiqueta} / {nombre}: {(okF ? "se superó el tamaño máximo del ZIP" : errorF)}");
                        fallidos++;
                        continue;
                    }
                    var entrada = $"SAP/{NombreArchivoSeguro(etiqueta, "documento")}/{linea}_{nombre}";
                    await using (var salida = zip.CreateEntry(entrada).Open())
                        await salida.WriteAsync(contenido);
                    total += contenido.Length;
                    incluidos++;
                    indice.Add($"INCLUIDO {entrada}");
                }
            }

            await using (var escritor = new StreamWriter(zip.CreateEntry("SAP/INDICE_ANEXOS_SAP.txt").Open(), new System.Text.UTF8Encoding(true)))
                foreach (var l in indice)
                    await escritor.WriteLineAsync(l);
            return (incluidos, fallidos);
        }

        // Nombre de archivo sin rutas ni caracteres inválidos (también los separadores de entradas ZIP).
        internal static string NombreArchivoSeguro(string nombre, string porDefecto)
        {
            foreach (var c in Path.GetInvalidFileNameChars().Concat(new[] { '/', '\\', ':' }))
                nombre = nombre.Replace(c, '_');
            nombre = nombre.Trim().Trim('.');
            return string.IsNullOrWhiteSpace(nombre) ? porDefecto : nombre;
        }

        // Solo para pruebas locales: evita abrir el Explorador.
        internal static string? DirectorioPruebas { get; set; }

        private static bool TryGetId(JsonElement obj, string prop, out int id, bool permitirCero = false)
        {
            id = 0;
            if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(prop, out var v))
                return false;
            var minimo = permitirCero ? 0 : 1;
            return v.ValueKind == JsonValueKind.Number
                ? v.TryGetInt32(out id) && id >= minimo
                : v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out id) && id >= minimo;
        }

        private static async Task<string> Forward(Task<(bool ok, string body)> call)
        {
            var (ok, body) = await call;
            if (!TryUnwrap(body, out var payload, out var error) || !ok)
                return Error(error);
            var data = payload.ValueKind == JsonValueKind.Undefined ? null : JsonSerializer.Deserialize<object>(payload.GetRawText());
            return Ok(data);
        }

        // Desenvuelve {success,message,data,errors} de la API INNPACK; si hay error devuelve su mensaje.
        private static bool TryUnwrap(string body, out JsonElement data, out string error)
        {
            data = default;
            error = "Error al comunicarse con la API Innpack";
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (!root.TryGetProperty("success", out var s))
                    return false;
                if (!s.GetBoolean())
                {
                    error = root.TryGetProperty("message", out var m) ? (m.GetString() ?? error) : error;
                    return false;
                }
                if (root.TryGetProperty("data", out var d))
                    data = d.Clone();
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static JsonElement GetDataElement(Dictionary<string, object> data)
        {
            if (data.TryGetValue("data", out var rawData) && rawData is JsonElement jsonData)
                return jsonData;

            return default;
        }

        private static string GetString(JsonElement obj, string prop)
        {
            if (obj.ValueKind != JsonValueKind.Object)
                return "";

            if (!obj.TryGetProperty(prop, out var value))
                return "";

            return value.ValueKind switch
            {
                JsonValueKind.String => value.GetString() ?? "",
                JsonValueKind.Number => value.ToString(),
                _ => "",
            };
        }

        private static string Ok(object? data)
        {
            return JsonSerializer.Serialize(
                new
                {
                    ok = true,
                    data,
                    error = (string?)null,
                },
                _jsonOptions
            );
        }

        private static string Error(string message)
        {
            return JsonSerializer.Serialize(
                new
                {
                    ok = false,
                    data = (object?)null,
                    error = message,
                },
                _jsonOptions
            );
        }
    }
}
