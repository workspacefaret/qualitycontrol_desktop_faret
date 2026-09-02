using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.FaretLaboratorio
{
    // Migrado a QualityControlInnpack.Api — ya no consulta MySQL directo desde el desktop
    // (FaretLaboratorioRepository.cs de este módulo queda sin uso). Réplica de
    // MuestraLaboratorioHandler.cs (INNPACK) para Faret: laboratorio separado (equipo/analistas
    // distintos a INNPACK, decisión explícita del usuario), tablas propias
    // faret_muestra_laboratorio* del lado API, mismos DTOs de ensayo (genéricos, sin nada
    // específico de empresa). El parseo de campos del payload Photino se mantiene igual que antes —
    // solo cambia el paso final de cada acción, que ahora arma un request anónimo y lo reenvía a la
    // API en vez de llamar al repository local. Acción "faretLab" (no "muestraLab") para no chocar
    // con ese módulo INNPACK. Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class FaretLaboratorioHandler
    {
        private readonly InnpackFaretLaboratorioApiService _api;
        private readonly CurrentUserSessionService _session;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public FaretLaboratorioHandler(InnpackApiClient client, CurrentUserSessionService session)
        {
            _api = new InnpackFaretLaboratorioApiService(client);
            _session = session;
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                var jsonData = GetDataElement(data);

                if (action == "faretLab.crear")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new
                    {
                        Origen = GetString(jsonData, "origen"),
                        TipoMuestra = GetString(jsonData, "tipoMuestra"),
                        Np = GetString(jsonData, "np"),
                        Cliente = GetString(jsonData, "cliente"),
                        CodigoProducto = GetString(jsonData, "codigoProducto"),
                        Descripcion = GetString(jsonData, "descripcion"),
                        Maquina = GetString(jsonData, "maquina"),
                        Turno = GetString(jsonData, "turno"),
                        Lote = GetString(jsonData, "lote"),
                        Proveedor = GetString(jsonData, "proveedor"),
                        Observacion = GetString(jsonData, "observacion"),
                        FechaEnsayo = GetString(jsonData, "fechaEnsayo"),
                        UsuarioId = usuario?.Id,
                        UsuarioNombre = usuario?.NombreCompleto,
                    };

                    return await Forward(_api.CrearMuestraAsync(request));
                }

                if (action == "faretLab.list")
                {
                    var estado = GetString(jsonData, "estado");
                    var tipoMuestra = GetString(jsonData, "tipoMuestra");
                    var np = GetString(jsonData, "np");
                    return await Forward(_api.ListAsync(estado, tipoMuestra, np));
                }

                if (action == "faretLab.detalle")
                {
                    var id = GetInt(jsonData, "id") ?? 0;
                    return await Forward(_api.DetalleAsync(id));
                }

                if (action == "faretLab.humedad.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        MetodoEquipo = GetString(jsonData, "metodoEquipo"),
                        HigrometroIzquierdo = GetDecimal(jsonData, "higrometroIzquierdo"),
                        HigrometroCentro = GetDecimal(jsonData, "higrometroCentro"),
                        HigrometroDerecho = GetDecimal(jsonData, "higrometroDerecho"),
                        TermobalanzaValor = GetDecimal(jsonData, "termobalanzaValor"),
                        Horno1PesoInicial = GetDecimal(jsonData, "horno1PesoInicial"),
                        Horno1PesoFinal = GetDecimal(jsonData, "horno1PesoFinal"),
                        Horno2PesoInicial = GetDecimal(jsonData, "horno2PesoInicial"),
                        Horno2PesoFinal = GetDecimal(jsonData, "horno2PesoFinal"),
                        Horno3PesoInicial = GetDecimal(jsonData, "horno3PesoInicial"),
                        Horno3PesoFinal = GetDecimal(jsonData, "horno3PesoFinal"),
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(_api.GuardarHumedadAsync(request));
                }

                if (action == "faretLab.gramaje.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        TipoMaterial = GetString(jsonData, "tipoMaterial"),
                        Modalidad = GetString(jsonData, "modalidad"),
                        Muestra1 = GetDecimal(jsonData, "muestra1"),
                        Muestra2 = GetDecimal(jsonData, "muestra2"),
                        Muestra3 = GetDecimal(jsonData, "muestra3"),
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(_api.GuardarGramajeAsync(request));
                }

                if (action == "faretLab.cobb.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        P1 = GetProbeta(jsonData, "p1"),
                        P2 = GetProbeta(jsonData, "p2"),
                        P3 = GetProbeta(jsonData, "p3"),
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(_api.GuardarCobbAsync(request));
                }

                if (action == "faretLab.espesor.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        TipoMedicion = GetString(jsonData, "tipoMedicion"),
                        Medicion1 = GetDecimal(jsonData, "medicion1"),
                        Medicion2 = GetDecimal(jsonData, "medicion2"),
                        Medicion3 = GetDecimal(jsonData, "medicion3"),
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(_api.GuardarEspesorAsync(request));
                }

                if (action == "faretLab.rct.guardar" || action == "faretLab.fct.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var esRct = action == "faretLab.rct.guardar";

                    var request = new
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        Componente = esRct ? GetString(jsonData, "componente") : null,
                        StrengthUnidad = GetString(jsonData, "strengthUnidad"),
                        P1 = GetResistenciaProbeta(jsonData, "p1"),
                        P2 = GetResistenciaProbeta(jsonData, "p2"),
                        P3 = GetResistenciaProbeta(jsonData, "p3"),
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(esRct ? _api.GuardarRctAsync(request) : _api.GuardarFctAsync(request));
                }

                if (action == "faretLab.ect.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        P1Force = GetDecimal(jsonData, "p1Force"),
                        P2Force = GetDecimal(jsonData, "p2Force"),
                        P3Force = GetDecimal(jsonData, "p3Force"),
                        P4Force = GetDecimal(jsonData, "p4Force"),
                        P5Force = GetDecimal(jsonData, "p5Force"),
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(_api.GuardarEctAsync(request));
                }

                if (action == "faretLab.bctMedido.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var cajasEnsayadas = GetInt(jsonData, "cajasEnsayadas") ?? 0;

                    var request = new
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        CajasEnsayadas = cajasEnsayadas,
                        MotivoMenos3 = GetString(jsonData, "motivoMenos3"),
                        C1 = GetBctCaja(jsonData, "c1"),
                        C2 = cajasEnsayadas >= 2 ? GetBctCaja(jsonData, "c2") : null,
                        C3 = cajasEnsayadas >= 3 ? GetBctCaja(jsonData, "c3") : null,
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(_api.GuardarBctMedidoAsync(request));
                }

                if (action == "faretLab.bctTeorico.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        EctEnsayoId = GetInt(jsonData, "ectEnsayoId") ?? 0,
                        EspesorEnsayoId = GetInt(jsonData, "espesorEnsayoId") ?? 0,
                        LargoMm = GetDecimal(jsonData, "largoMm") ?? 0,
                        AnchoMm = GetDecimal(jsonData, "anchoMm") ?? 0,
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(_api.GuardarBctTeoricoAsync(request));
                }

                if (action == "faretLab.viscosidad.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        TipoAdhesivo = GetString(jsonData, "tipoAdhesivo"),
                        Temperatura = GetDecimal(jsonData, "temperatura"),
                        Equipo = GetString(jsonData, "equipo"),
                        Husillo = GetString(jsonData, "husillo"),
                        VelocidadRpm = GetDecimal(jsonData, "velocidadRpm"),
                        ResultadoCp = GetDecimal(jsonData, "resultadoCp"),
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(_api.GuardarViscosidadAsync(request));
                }

                if (action == "faretLab.ph.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        ValorTexto = GetString(jsonData, "valorTexto"),
                        ColorObservado = GetString(jsonData, "colorObservado"),
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(_api.GuardarPhAsync(request));
                }

                if (action == "faretLab.solidos.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        D1 = GetSolidosDeterminacion(jsonData, "d1"),
                        D2 = GetSolidosDeterminacion(jsonData, "d2"),
                        D3 = GetSolidosDeterminacion(jsonData, "d3"),
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(_api.GuardarSolidosAsync(request));
                }

                if (action == "faretLab.lugol.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var cumplimiento = GetString(jsonData, "cumplimiento");
                    var request = new
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        PuntoMuestra = GetString(jsonData, "puntoMuestra"),
                        Coloracion = GetString(jsonData, "coloracion"),
                        Resultado = GetString(jsonData, "resultado"),
                        Interpretacion = GetString(jsonData, "interpretacion"),
                        Cumplimiento = string.IsNullOrWhiteSpace(cumplimiento) ? "Sin especificacion" : cumplimiento,
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(_api.GuardarLugolAsync(request));
                }

                if (action == "faretLab.especificacion.list")
                    return await Forward(_api.ListarEspecificacionesAsync());

                if (action == "faretLab.especificacion.guardar")
                {
                    var request = new
                    {
                        Id = GetInt(jsonData, "id"),
                        TipoMuestra = GetString(jsonData, "tipoMuestra"),
                        TipoEnsayo = GetString(jsonData, "tipoEnsayo"),
                        CodigoProducto = GetString(jsonData, "codigoProducto"),
                        LimiteMin = GetDecimal(jsonData, "limiteMin"),
                        LimiteMax = GetDecimal(jsonData, "limiteMax"),
                        Unidad = GetString(jsonData, "unidad"),
                    };

                    return await Forward(_api.GuardarEspecificacionAsync(request));
                }

                if (action == "faretLab.especificacion.activar")
                {
                    var id = GetInt(jsonData, "id") ?? 0;
                    var activo = jsonData.ValueKind == JsonValueKind.Object
                        && jsonData.TryGetProperty("activo", out var activoEl)
                        && activoEl.ValueKind == JsonValueKind.True;

                    if (id <= 0)
                        return Error("Falta indicar la especificación");

                    return await Forward(_api.CambiarActivoEspecificacionAsync(id, activo));
                }

                if (action == "faretLab.ensayo.anular")
                {
                    var ensayoId = GetInt(jsonData, "ensayoId") ?? 0;
                    var motivo = GetString(jsonData, "motivo");
                    if (ensayoId <= 0 || string.IsNullOrWhiteSpace(motivo))
                        return Error("Falta el ensayo o el motivo de anulacion");

                    return await Forward(_api.AnularEnsayoAsync(ensayoId, motivo));
                }

                if (action == "faretLab.nc.crear")
                {
                    var muestraId = GetInt(jsonData, "muestraId") ?? 0;
                    if (muestraId <= 0)
                        return Error("Falta indicar la muestra");

                    var usuario = _session.GetCurrentUser();
                    return await Forward(_api.CrearNoConformidadAsync(muestraId, usuario?.NombreCompleto));
                }

                return Error($"Accion no reconocida: {action}");
            }
            catch (Exception ex)
            {
                return Error($"Error interno: {ex.Message}");
            }
        }

        private static object? GetProbeta(JsonElement parent, string prop)
        {
            if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(prop, out var obj))
                return null;
            if (obj.ValueKind != JsonValueKind.Object)
                return null;

            return new
            {
                Bobina = GetString(obj, "bobina"),
                Cara = GetString(obj, "cara"),
                PesoInicial = GetDecimal(obj, "pesoInicial"),
                PesoFinal = GetDecimal(obj, "pesoFinal"),
                Tiempo = GetString(obj, "tiempo"),
            };
        }

        private static object? GetResistenciaProbeta(JsonElement parent, string prop)
        {
            if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(prop, out var obj))
                return null;
            if (obj.ValueKind != JsonValueKind.Object)
                return null;

            return new
            {
                Bobina = GetString(obj, "bobina"),
                Force = GetDecimal(obj, "force"),
                Strength = GetDecimal(obj, "strength"),
            };
        }

        private static object? GetBctCaja(JsonElement parent, string prop)
        {
            if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(prop, out var obj))
                return null;
            if (obj.ValueKind != JsonValueKind.Object)
                return null;

            return new
            {
                Largo = GetDecimal(obj, "largo"),
                Ancho = GetDecimal(obj, "ancho"),
                Alto = GetDecimal(obj, "alto"),
                TipoOnda = GetString(obj, "tipoOnda"),
                GramajeComplejo = GetDecimal(obj, "gramajeComplejo"),
                EspesorComplejo = GetDecimal(obj, "espesorComplejo"),
                ResultadoLbf = GetDecimal(obj, "resultadoLbf"),
            };
        }

        private static object? GetSolidosDeterminacion(JsonElement parent, string prop)
        {
            if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(prop, out var obj))
                return null;
            if (obj.ValueKind != JsonValueKind.Object)
                return null;

            return new
            {
                M1 = GetDecimal(obj, "m1"),
                M2 = GetDecimal(obj, "m2"),
                M3 = GetDecimal(obj, "m3"),
            };
        }

        private static JsonElement GetDataElement(Dictionary<string, object> data)
        {
            if (data.TryGetValue("data", out var rawData) && rawData is JsonElement jsonData)
                return jsonData;

            return default;
        }

        private static string GetString(JsonElement obj, string prop)
        {
            if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(prop, out var value))
                return "";
            return value.ValueKind switch
            {
                JsonValueKind.String => value.GetString() ?? "",
                JsonValueKind.Number => value.ToString(),
                _ => "",
            };
        }

        private static int? GetInt(JsonElement obj, string prop)
        {
            if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(prop, out var value))
                return null;
            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var i))
                return i;
            if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out var parsed))
                return parsed;
            return null;
        }

        private static decimal? GetDecimal(JsonElement obj, string prop)
        {
            if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(prop, out var value))
                return null;
            if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var d))
                return d;
            if (value.ValueKind == JsonValueKind.String && decimal.TryParse(value.GetString(), out var parsed))
                return parsed;
            return null;
        }

        private static async Task<string> Forward(Task<(bool ok, string body)> call)
        {
            var (ok, body) = await call;

            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            var responseData = payload.ValueKind == JsonValueKind.Undefined ? null : JsonSerializer.Deserialize<object>(payload.GetRawText());
            return Ok(responseData);
        }

        // Desenvuelve el shape ApiResponse<T> {success,message,data,errors} de
        // QualityControlInnpack.Api — mismo criterio ya usado en UsuariosHandler.cs/MuestraLaboratorioHandler.cs.
        private static bool TryUnwrapApiResponse(string body, out JsonElement data, out string error)
        {
            data = default;
            error = "Error al comunicarse con la API Innpack";

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (root.TryGetProperty("success", out var s))
                {
                    if (!s.GetBoolean())
                    {
                        error = root.TryGetProperty("message", out var m) ? (m.GetString() ?? error) : error;
                        return false;
                    }

                    if (root.TryGetProperty("data", out var d))
                    {
                        data = d.Clone();
                        return true;
                    }

                    return true;
                }

                return false;
            }
            catch
            {
                return false;
            }
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
