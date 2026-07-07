using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FaretApi;

namespace QualityControlCenter.Modules.Faret
{
    public class FaretHandler
    {
        private readonly FaretApiClient _client;
        private readonly FaretApiClient _mcClient;
        private readonly FaretApiClient _calidadClient;
        private readonly FaretAuthApiService _auth;
        private readonly FaretCatalogosApiService _catalogos;
        private readonly FaretRegistrosControlApiService _registros;
        private readonly FaretImportacionApiService _importacion;
        private readonly FaretUsuariosApiService _usuarios;
        private readonly FaretNoConformidadesApiService _noConformidades;
        private readonly FaretDashboardService _dashboard;
        private readonly FaretInspeccionesApiService _inspecciones;
        private readonly FaretMaquinasApiService _maquinas;

        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public FaretHandler(
            FaretApiClient client,
            FaretApiClient mcClient,
            FaretApiClient calidadClient
        )
        {
            _client = client;
            _mcClient = mcClient;
            _calidadClient = calidadClient;
            _auth = new FaretAuthApiService(client);
            _catalogos = new FaretCatalogosApiService(client);
            _registros = new FaretRegistrosControlApiService(client);
            _importacion = new FaretImportacionApiService(client);
            _usuarios = new FaretUsuariosApiService(client);
            _noConformidades = new FaretNoConformidadesApiService(mcClient);
            _dashboard = new FaretDashboardService(_noConformidades);
            _inspecciones = new FaretInspeccionesApiService(calidadClient);
            _maquinas = new FaretMaquinasApiService(calidadClient);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            if (!_client.IsConfigured)
                return Error("API Faret no configurada. Revise config.json");

            return action switch
            {
                "faret.login" => await HandleLogin(data),
                "faret.logout" => HandleLogout(),
                "faret.health" => await HandleHealth(),
                "faret.catalogos.areas" => await HandleCatalogo(_catalogos.GetAreasAsync),
                "faret.catalogos.inspectores" => await HandleCatalogo(
                    _catalogos.GetInspectoresAsync
                ),
                "faret.catalogos.operadores" => await HandleCatalogo(_catalogos.GetOperadoresAsync),
                "faret.catalogos.maquinas" => await HandleCatalogo(_catalogos.GetMaquinasAsync),
                "faret.catalogos.defectos" => await HandleCatalogo(_catalogos.GetDefectosAsync),
                "faret.registros.list" => await HandleRegistrosList(),
                "faret.registros.get" => await HandleRegistrosGet(data),
                "faret.importacion.validar" => await HandleImportacionValidar(data),
                "faret.importacion.confirmar" => await HandleImportacionConfirmar(data),
                "faret.importacion.list" => await HandleImportacionList(),
                "faret.data.list" => await HandleDataList(data),
                "faret.data.resumen" => await HandleDataResumen(data),
                "faret.usuarios.list" => await HandleUsuariosList(data),
                "faret.usuarios.create" => await HandleUsuariosCreate(data),
                "faret.usuarios.resetPassword" => await HandleUsuariosResetPassword(data),
                "faret.usuarios.activar" => await HandleUsuariosActivar(data),
                "faret.usuarios.desactivar" => await HandleUsuariosDesactivar(data),
                "faret.nc.list" => await HandleNcList(),
                "faret.nc.get" => await HandleNcGet(data),
                "faret.nc.create" => await HandleNcCreate(data),
                "faret.nc.update" => await HandleNcUpdate(data),
                "faret.nc.analisis.get" => await HandleNcAnalisisGet(data),
                "faret.nc.analisis.guardar" => await HandleNcAnalisisGuardar(data),
                "faret.nc.acciones.list" => await HandleNcAccionesList(data),
                "faret.nc.acciones.crear" => await HandleNcAccionesCrear(data),
                "faret.nc.acciones.actualizar" => await HandleNcAccionesActualizar(data),
                "faret.dashboard.resumen" => await HandleDashboardResumen(),
                "faret.inspecciones.list" => await HandleInspeccionesList(data),
                "faret.inspecciones.resumen" => await HandleInspeccionesResumen(data),
                "faret.maquinas.resumen" => await HandleMaquinasResumen(data),
                _ => Error($"Acción Faret no reconocida: {action}"),
            };
        }

        private async Task<string> HandleLogin(Dictionary<string, object> data)
        {
            if (
                !TryGetString(data, "identificador", out var identificador)
                || string.IsNullOrEmpty(identificador)
            )
                return Error("Falta identificador");

            if (!TryGetString(data, "password", out var password) || string.IsNullOrEmpty(password))
                return Error("Falta password");

            var (ok, loginData, error) = await _auth.LoginAsync(identificador, password);
            if (!ok)
                return Error(error ?? "Login fallido");

            return Ok(new { username = loginData!.Username, role = loginData.Role });
        }

        private string HandleLogout()
        {
            _auth.Logout();
            return Ok(new { message = "Sesión Faret cerrada" });
        }

        private async Task<string> HandleHealth()
        {
            var (ok, body) = await _client.GetAsync("api/health");
            if (!ok)
                return Error("API Faret sin conexión");

            return Ok(new { status = "conectado", detalle = body });
        }

        private async Task<string> HandleCatalogo(Func<Task<(bool ok, string body)>> fetch)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            var (ok, body) = await fetch();
            if (!ok)
            {
                string msg = "Error al obtener catálogo";
                try
                {
                    using var errDoc = JsonDocument.Parse(body);
                    if (errDoc.RootElement.TryGetProperty("error", out var e))
                        msg = e.GetString() ?? msg;
                }
                catch { }
                return Error(msg);
            }

            var parsed = JsonSerializer.Deserialize<object>(body);
            return Ok(parsed);
        }

        private async Task<string> HandleRegistrosList()
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            var (ok, body) = await _registros.GetListAsync();
            if (!ok)
            {
                string msg = "Error al obtener registros";
                try
                {
                    using var errDoc = JsonDocument.Parse(body);
                    if (errDoc.RootElement.TryGetProperty("error", out var e))
                        msg = e.GetString() ?? msg;
                }
                catch { }
                return Error(msg);
            }

            var parsed = JsonSerializer.Deserialize<object>(body);
            return Ok(parsed);
        }

        private async Task<string> HandleRegistrosGet(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            if (!TryGetInt(data, "id", out var id))
                return Error("Falta id del registro");

            var (ok, body) = await _registros.GetByIdAsync(id);
            if (!ok)
            {
                string msg = "Error al obtener registro";
                try
                {
                    using var errDoc = JsonDocument.Parse(body);
                    if (errDoc.RootElement.TryGetProperty("error", out var e))
                        msg = e.GetString() ?? msg;
                }
                catch { }
                return Error(msg);
            }

            var parsed = JsonSerializer.Deserialize<object>(body);
            return Ok(parsed);
        }

        private async Task<string> HandleImportacionValidar(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            if (!TryGetString(data, "fileName", out var fileName) || string.IsNullOrEmpty(fileName))
                return Error("Falta fileName");

            if (!TryGetString(data, "base64", out var base64) || string.IsNullOrEmpty(base64))
                return Error("Falta el contenido del archivo (base64)");

            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(base64);
            }
            catch (FormatException)
            {
                return Error("Archivo inválido (base64 corrupto)");
            }

            var (ok, body) = await _importacion.ValidarAsync(fileName, bytes);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleImportacionConfirmar(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            if (!TryGetString(data, "loteId", out var loteId) || string.IsNullOrEmpty(loteId))
                return Error("Falta loteId");

            var (ok, body) = await _importacion.ConfirmarAsync(loteId);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleImportacionList()
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            var (ok, body) = await _importacion.GetListAsync();
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleDataList(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            var filtros = BuildDataFiltros(data);
            if (TryGetInt(data, "page", out var page) && page > 0)
                filtros["page"] = page.ToString();
            if (TryGetInt(data, "pageSize", out var pageSize) && pageSize > 0)
                filtros["pageSize"] = pageSize.ToString();

            var (ok, body) = await _importacion.GetPncListAsync(filtros);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleDataResumen(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            var filtros = BuildDataFiltros(data);

            var (ok, body) = await _importacion.GetPncResumenAsync(filtros);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private static Dictionary<string, string?> BuildDataFiltros(Dictionary<string, object> data)
        {
            var filtros = new Dictionary<string, string?>();

            TryGetString(data, "cliente", out var cliente);
            TryGetString(data, "tipoPnc", out var tipoPnc);
            TryGetString(data, "nivel", out var nivel);
            TryGetString(data, "fechaDesde", out var fechaDesde);
            TryGetString(data, "fechaHasta", out var fechaHasta);

            filtros["cliente"] = cliente;
            filtros["tipoPnc"] = tipoPnc;
            filtros["nivel"] = nivel;
            filtros["fechaDesde"] = fechaDesde;
            filtros["fechaHasta"] = fechaHasta;

            return filtros;
        }

        // API `calidad` (backend Node.js) sin autenticación — a diferencia de `qualitycontrol`,
        // no depende de `HasToken`.
        private async Task<string> HandleInspeccionesList(Dictionary<string, object> data)
        {
            var filtros = BuildInspeccionesFiltros(data);
            if (TryGetInt(data, "page", out var page) && page > 0)
                filtros["page"] = page.ToString();
            if (TryGetInt(data, "pageSize", out var pageSize) && pageSize > 0)
                filtros["pageSize"] = pageSize.ToString();

            var (ok, body) = await _inspecciones.GetListAsync(filtros);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleInspeccionesResumen(Dictionary<string, object> data)
        {
            var filtros = BuildInspeccionesFiltros(data);

            var (ok, body) = await _inspecciones.GetResumenAsync(filtros);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleMaquinasResumen(Dictionary<string, object> data)
        {
            TryGetString(data, "maquina", out var maquina);

            var (ok, body) = await _maquinas.GetResumenAsync(maquina);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private static Dictionary<string, string?> BuildInspeccionesFiltros(
            Dictionary<string, object> data
        )
        {
            var filtros = new Dictionary<string, string?>();

            TryGetString(data, "fechaDesde", out var fechaDesde);
            TryGetString(data, "fechaHasta", out var fechaHasta);
            TryGetString(data, "areaControl", out var areaControl);
            TryGetString(data, "operador", out var operador);
            TryGetString(data, "maquina", out var maquina);
            TryGetString(data, "presentaDefectos", out var presentaDefectos);

            filtros["fechaDesde"] = fechaDesde;
            filtros["fechaHasta"] = fechaHasta;
            filtros["areaControl"] = areaControl;
            filtros["operador"] = operador;
            filtros["maquina"] = maquina;
            filtros["presentaDefectos"] = presentaDefectos;

            return filtros;
        }

        private async Task<string> HandleUsuariosList(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            bool? soloActivos = null;
            if (data.TryGetValue("soloActivos", out var raw))
            {
                if (
                    raw is JsonElement el
                    && el.ValueKind is JsonValueKind.True or JsonValueKind.False
                )
                    soloActivos = el.GetBoolean();
                else if (bool.TryParse(raw?.ToString(), out var parsed))
                    soloActivos = parsed;
            }

            var (ok, body) = await _usuarios.GetListAsync(soloActivos);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleUsuariosCreate(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            if (!TryGetString(data, "nombre", out var nombre) || string.IsNullOrWhiteSpace(nombre))
                return Error("Falta el nombre");

            if (
                !TryGetString(data, "username", out var username)
                || string.IsNullOrWhiteSpace(username)
            )
                return Error("Falta el RUT/usuario");

            if (!TryGetString(data, "rol", out var rol) || string.IsNullOrWhiteSpace(rol))
                return Error("Falta el rol");

            var (ok, body) = await _usuarios.CreateAsync(nombre!, username!, rol!);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleUsuariosResetPassword(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id del usuario");

            var (ok, body) = await _usuarios.ResetPasswordAsync(id);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleUsuariosActivar(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id del usuario");

            var (ok, body) = await _usuarios.ActivarAsync(id);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleUsuariosDesactivar(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id del usuario");

            var (ok, body) = await _usuarios.DesactivarAsync(id);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleNcList()
        {
            if (!_mcClient.IsConfigured)
                return Error("API de Mejora Continua no configurada. Revise config.json");

            var (ok, body) = await _noConformidades.GetListAsync();
            if (!ok)
                return Error(ExtractMcErrorMessage(body));

            return Ok(JsonSerializer.Deserialize<object>(body));
        }

        private async Task<string> HandleNcGet(Dictionary<string, object> data)
        {
            if (!_mcClient.IsConfigured)
                return Error("API de Mejora Continua no configurada. Revise config.json");

            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            var (ok, body) = await _noConformidades.GetByIdAsync(id);
            if (!ok)
                return Error(ExtractMcErrorMessage(body));

            return Ok(JsonSerializer.Deserialize<object>(body));
        }

        private async Task<string> HandleNcCreate(Dictionary<string, object> data)
        {
            if (!_mcClient.IsConfigured)
                return Error("API de Mejora Continua no configurada. Revise config.json");

            if (!TryBuildNcRequest(data, out var request, out var validationError))
                return Error(validationError);

            var (ok, body) = await _noConformidades.CreateAsync(request);
            if (!ok)
                return Error(ExtractMcErrorMessage(body));

            return Ok(JsonSerializer.Deserialize<object>(body));
        }

        private async Task<string> HandleNcUpdate(Dictionary<string, object> data)
        {
            if (!_mcClient.IsConfigured)
                return Error("API de Mejora Continua no configurada. Revise config.json");

            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            if (!TryBuildNcRequest(data, out var request, out var validationError))
                return Error(validationError);

            var (ok, body) = await _noConformidades.UpdateAsync(id, request);
            if (!ok)
                return Error(ExtractMcErrorMessage(body));

            return Ok(JsonSerializer.Deserialize<object>(body));
        }

        private async Task<string> HandleDashboardResumen()
        {
            if (!_mcClient.IsConfigured)
                return Error("API de Mejora Continua no configurada. Revise config.json");

            var (ok, dashboardData, error) = await _dashboard.ObtenerResumenAsync();
            if (!ok)
                return Error(error);

            return Ok(dashboardData);
        }

        private async Task<string> HandleNcAnalisisGet(Dictionary<string, object> data)
        {
            if (!_mcClient.IsConfigured)
                return Error("API de Mejora Continua no configurada. Revise config.json");

            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            var (ok, body) = await _noConformidades.GetAnalisisAsync(id);
            if (!ok)
            {
                var msg = ExtractMcErrorMessage(body);
                // "Sin análisis todavía" no es un error: es el estado inicial normal de una NC.
                if (msg.Contains("aún no tiene un análisis", StringComparison.OrdinalIgnoreCase))
                    return Ok(null);
                return Error(msg);
            }

            return Ok(JsonSerializer.Deserialize<object>(body));
        }

        // Una sola acción de "guardar" crea o actualiza el análisis según lo que ya sabe el
        // frontend (que hizo el GET previo): existeAnalisis=true → PUT, false/ausente → POST.
        private async Task<string> HandleNcAnalisisGuardar(Dictionary<string, object> data)
        {
            if (!_mcClient.IsConfigured)
                return Error("API de Mejora Continua no configurada. Revise config.json");

            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            if (!TryBuildAnalisisRequest(data, out var request, out var validationError))
                return Error(validationError);

            var existeAnalisis = TryGetBool(data, "existeAnalisis", out var existe) && existe;

            var (ok, body) = existeAnalisis
                ? await _noConformidades.ActualizarAnalisisAsync(id, request)
                : await _noConformidades.CrearAnalisisAsync(id, request);

            if (!ok)
                return Error(ExtractMcErrorMessage(body));

            return Ok(JsonSerializer.Deserialize<object>(body));
        }

        private async Task<string> HandleNcAccionesList(Dictionary<string, object> data)
        {
            if (!_mcClient.IsConfigured)
                return Error("API de Mejora Continua no configurada. Revise config.json");

            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            var (ok, body) = await _noConformidades.GetAccionesAsync(id);
            if (!ok)
                return Error(ExtractMcErrorMessage(body));

            return Ok(JsonSerializer.Deserialize<object>(body));
        }

        private async Task<string> HandleNcAccionesCrear(Dictionary<string, object> data)
        {
            if (!_mcClient.IsConfigured)
                return Error("API de Mejora Continua no configurada. Revise config.json");

            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            if (!TryBuildAccionCrearRequest(data, out var request, out var validationError))
                return Error(validationError);

            var (ok, body) = await _noConformidades.CrearAccionAsync(id, request);
            if (!ok)
                return Error(ExtractMcErrorMessage(body));

            return Ok(JsonSerializer.Deserialize<object>(body));
        }

        private async Task<string> HandleNcAccionesActualizar(Dictionary<string, object> data)
        {
            if (!_mcClient.IsConfigured)
                return Error("API de Mejora Continua no configurada. Revise config.json");

            if (!TryGetInt(data, "accionId", out var accionId))
                return Error("Falta el id de la acción correctiva");

            if (!TryBuildAccionActualizarRequest(data, out var request, out var validationError))
                return Error(validationError);

            var (ok, body) = await _noConformidades.ActualizarAccionAsync(accionId, request);
            if (!ok)
                return Error(ExtractMcErrorMessage(body));

            return Ok(JsonSerializer.Deserialize<object>(body));
        }

        private static readonly string[] MetodologiasValidas =
        {
            "CINCO_PORQUES",
            "ISHIKAWA",
            "MIXTA",
        };
        private static readonly string[] EstadosAccionValidos =
        {
            "PENDIENTE",
            "EN_PROCESO",
            "COMPLETADA",
            "CANCELADA",
        };

        private static bool TryBuildAnalisisRequest(
            Dictionary<string, object> data,
            out object request,
            out string error
        )
        {
            request = null!;
            error = "";

            if (
                !TryGetString(data, "metodologia", out var metodologia)
                || string.IsNullOrWhiteSpace(metodologia)
            )
            {
                error = "Falta la metodología";
                return false;
            }
            if (!MetodologiasValidas.Contains(metodologia))
            {
                error =
                    $"Metodología inválida. Valores permitidos: {string.Join(", ", MetodologiasValidas)}";
                return false;
            }
            if (
                !TryGetString(data, "problemaDetectado", out var problemaDetectado)
                || string.IsNullOrWhiteSpace(problemaDetectado)
            )
            {
                error = "Falta el problema detectado";
                return false;
            }

            TryGetString(data, "porque1", out var porque1);
            TryGetString(data, "porque2", out var porque2);
            TryGetString(data, "porque3", out var porque3);
            TryGetString(data, "porque4", out var porque4);
            TryGetString(data, "porque5", out var porque5);
            TryGetString(data, "causaRaiz", out var causaRaiz);
            TryGetString(data, "conclusion", out var conclusion);
            TryGetString(data, "creadoPor", out var creadoPor);
            TryGetString(data, "actualizadoPor", out var actualizadoPor);

            request = new
            {
                metodologia,
                problemaDetectado,
                porque1,
                porque2,
                porque3,
                porque4,
                porque5,
                causaRaiz,
                conclusion,
                creadoPor,
                actualizadoPor,
            };
            return true;
        }

        private static bool TryBuildAccionCrearRequest(
            Dictionary<string, object> data,
            out object request,
            out string error
        )
        {
            request = null!;
            error = "";

            if (
                !TryGetString(data, "descripcion", out var descripcion)
                || string.IsNullOrWhiteSpace(descripcion)
            )
            {
                error = "Falta la descripción de la acción";
                return false;
            }
            if (
                !TryGetString(data, "responsable", out var responsable)
                || string.IsNullOrWhiteSpace(responsable)
            )
            {
                error = "Falta el responsable";
                return false;
            }
            if (
                !TryGetString(data, "fechaLimite", out var fechaLimite)
                || string.IsNullOrWhiteSpace(fechaLimite)
            )
            {
                error = "Falta la fecha límite";
                return false;
            }

            TryGetString(data, "prioridad", out var prioridad);
            TryGetString(data, "creadoPor", out var creadoPor);

            int? analisisId = TryGetInt(data, "analisisId", out var aid) ? aid : null;

            request = new
            {
                analisisId,
                descripcion,
                responsable,
                fechaLimite,
                prioridad,
                creadoPor,
            };
            return true;
        }

        private static bool TryBuildAccionActualizarRequest(
            Dictionary<string, object> data,
            out object request,
            out string error
        )
        {
            request = null!;
            error = "";

            if (
                !TryGetString(data, "descripcion", out var descripcion)
                || string.IsNullOrWhiteSpace(descripcion)
            )
            {
                error = "Falta la descripción de la acción";
                return false;
            }
            if (
                !TryGetString(data, "responsable", out var responsable)
                || string.IsNullOrWhiteSpace(responsable)
            )
            {
                error = "Falta el responsable";
                return false;
            }
            if (
                !TryGetString(data, "fechaLimite", out var fechaLimite)
                || string.IsNullOrWhiteSpace(fechaLimite)
            )
            {
                error = "Falta la fecha límite";
                return false;
            }
            if (!TryGetString(data, "estado", out var estado) || string.IsNullOrWhiteSpace(estado))
            {
                error = "Falta el estado";
                return false;
            }
            if (!EstadosAccionValidos.Contains(estado))
            {
                error =
                    $"Estado inválido. Valores permitidos: {string.Join(", ", EstadosAccionValidos)}";
                return false;
            }

            TryGetString(data, "prioridad", out var prioridad);
            TryGetString(data, "actualizadoPor", out var actualizadoPor);

            request = new
            {
                descripcion,
                responsable,
                fechaLimite,
                prioridad,
                estado,
                actualizadoPor,
            };
            return true;
        }

        // El request de creación/actualización de la API de Mejora Continua no incluye
        // "estado": ese campo solo aparece en las respuestas, no se puede modificar hoy.
        private static bool TryBuildNcRequest(
            Dictionary<string, object> data,
            out object request,
            out string error
        )
        {
            request = null!;
            error = "";

            if (!TryGetString(data, "tipo", out var tipo) || string.IsNullOrWhiteSpace(tipo))
            {
                error = "Falta el tipo";
                return false;
            }
            if (!TryGetString(data, "origen", out var origen) || string.IsNullOrWhiteSpace(origen))
            {
                error = "Falta el origen";
                return false;
            }
            // La API de Mejora Continua no valida "origen" y responde HTTP 500 (no 400) si no es
            // uno de estos dos valores exactos; se valida acá antes de llamar a la API.
            if (origen != "AUDITORIA_INTERNA" && origen != "AUDITORIA_EXTERNA")
            {
                error = "Origen inválido. Valores permitidos: AUDITORIA_INTERNA, AUDITORIA_EXTERNA";
                return false;
            }
            if (!TryGetString(data, "titulo", out var titulo) || string.IsNullOrWhiteSpace(titulo))
            {
                error = "Falta el título";
                return false;
            }
            if (
                !TryGetString(data, "descripcion", out var descripcion)
                || string.IsNullOrWhiteSpace(descripcion)
            )
            {
                error = "Falta la descripción";
                return false;
            }
            if (
                !TryGetString(data, "severidad", out var severidad)
                || string.IsNullOrWhiteSpace(severidad)
            )
            {
                error = "Falta la severidad";
                return false;
            }
            if (
                !TryGetString(data, "proceso", out var proceso)
                || string.IsNullOrWhiteSpace(proceso)
            )
            {
                error = "Falta el proceso";
                return false;
            }
            if (
                !TryGetString(data, "fechaDeteccion", out var fechaDeteccion)
                || string.IsNullOrWhiteSpace(fechaDeteccion)
            )
            {
                error = "Falta la fecha de detección";
                return false;
            }

            TryGetString(data, "norma", out var norma);
            TryGetString(data, "reportadoPor", out var reportadoPor);
            TryGetString(data, "responsable", out var responsable);

            request = new
            {
                tipo,
                origen,
                titulo,
                descripcion,
                severidad,
                proceso,
                norma,
                reportadoPor,
                responsable,
                fechaDeteccion,
            };
            return true;
        }

        // La API de Mejora Continua responde con JSON crudo en éxito y, en error, con
        // ProblemDetails de ASP.NET { title, status, ... }, con { mensaje } (controllers de
        // análisis/acciones) o con { ok, error } cuando el error lo genera el cliente HTTP
        // local (timeout/red/HTTP no-2xx en GET).
        private static string ExtractMcErrorMessage(string body)
        {
            const string fallback = "Error al comunicarse con la API de Mejora Continua";
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (
                    root.TryGetProperty("mensaje", out var msg)
                    && msg.ValueKind == JsonValueKind.String
                )
                    return msg.GetString() ?? fallback;

                if (root.TryGetProperty("error", out var e) && e.ValueKind == JsonValueKind.String)
                    return e.GetString() ?? fallback;

                if (root.TryGetProperty("title", out var t) && t.ValueKind == JsonValueKind.String)
                    return t.GetString() ?? fallback;

                if (root.TryGetProperty("detail", out var d) && d.ValueKind == JsonValueKind.String)
                    return d.GetString() ?? fallback;
            }
            catch { }
            return fallback;
        }

        // La API Faret responde con ApiResponse<T> { success, message, data, errors } o,
        // en errores generados por el cliente HTTP local (timeout/red), { ok, error }.
        private static bool TryUnwrapApiResponse(
            string body,
            out JsonElement data,
            out string error
        )
        {
            data = default;
            error = "Error al comunicarse con la API Faret";
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (root.TryGetProperty("success", out var s))
                {
                    if (!s.GetBoolean())
                    {
                        error = root.TryGetProperty("message", out var m)
                            ? (m.GetString() ?? error)
                            : error;
                        return false;
                    }

                    if (root.TryGetProperty("data", out var d))
                    {
                        data = d.Clone();
                        return true;
                    }
                    return false;
                }

                if (root.TryGetProperty("ok", out var okProp))
                {
                    if (!okProp.GetBoolean())
                    {
                        error = root.TryGetProperty("message", out var m2)
                            ? (m2.GetString() ?? error)
                            : error;
                        return false;
                    }

                    if (root.TryGetProperty("data", out var d2))
                    {
                        data = d2.Clone();
                        return true;
                    }
                    return false;
                }

                if (root.TryGetProperty("error", out var e))
                {
                    error = e.GetString() ?? error;
                    return false;
                }

                return false;
            }
            catch
            {
                return false;
            }
        }

        private static bool TryGetString(
            Dictionary<string, object> data,
            string key,
            out string? value
        )
        {
            value = null;
            if (!data.TryGetValue(key, out var raw))
                return false;
            if (raw is JsonElement el)
            {
                value = el.GetString();
                return true;
            }
            value = raw?.ToString();
            return value != null;
        }

        private static bool TryGetInt(Dictionary<string, object> data, string key, out int value)
        {
            value = 0;
            if (!data.TryGetValue(key, out var raw))
                return false;
            if (raw is JsonElement el && el.TryGetInt32(out value))
                return true;
            return int.TryParse(raw?.ToString(), out value);
        }

        private static bool TryGetBool(Dictionary<string, object> data, string key, out bool value)
        {
            value = false;
            if (!data.TryGetValue(key, out var raw))
                return false;
            if (raw is JsonElement el && el.ValueKind is JsonValueKind.True or JsonValueKind.False)
            {
                value = el.GetBoolean();
                return true;
            }
            return bool.TryParse(raw?.ToString(), out value);
        }

        private string Ok(object? data) =>
            JsonSerializer.Serialize(new { ok = true, data }, _jsonOpts);

        private string Error(string message) =>
            JsonSerializer.Serialize(new { ok = false, error = message }, _jsonOpts);
    }
}
