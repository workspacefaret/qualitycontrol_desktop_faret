using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Repositories.MuestraLaboratorio;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.MuestraLaboratorio
{
    // Modulo nuevo "Muestra Laboratorio": esqueleto Muestra -> Ensayo -> Detalle + primeros 3
    // ensayos (Humedad, Gramaje, Cobb). Nombre de accion "muestraLab" (no "laboratorio") a
    // proposito: ya existe Modules/Laboratorio (visor de ensayos de la app movil, prefijo de
    // accion "laboratorio") - un prefijo que empezara igual chocaria con ese branch en
    // MessageRouter. Solo INNPACK.
    public class MuestraLaboratorioHandler
    {
        private readonly MuestraLaboratorioRepository _repository;
        private readonly CurrentUserSessionService _session;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public MuestraLaboratorioHandler(DbService db, CurrentUserSessionService session)
        {
            _repository = new MuestraLaboratorioRepository(db);
            _session = session;
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                var jsonData = GetDataElement(data);

                if (action == "muestraLab.crear")
                {
                    var request = new CrearMuestraRequest
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
                    };

                    if (string.IsNullOrWhiteSpace(request.Origen) || string.IsNullOrWhiteSpace(request.TipoMuestra))
                        return Error("Origen y Tipo de muestra son obligatorios");

                    var usuario = _session.GetCurrentUser();
                    var id = await _repository.CrearMuestra(request, usuario?.Id, usuario?.NombreCompleto);
                    return Ok(new { id });
                }

                if (action == "muestraLab.list")
                {
                    var estado = GetString(jsonData, "estado");
                    var tipoMuestra = GetString(jsonData, "tipoMuestra");
                    var np = GetString(jsonData, "np");
                    var items = await _repository.Listar(
                        string.IsNullOrWhiteSpace(estado) ? null : estado,
                        string.IsNullOrWhiteSpace(tipoMuestra) ? null : tipoMuestra,
                        string.IsNullOrWhiteSpace(np) ? null : np
                    );
                    return Ok(items);
                }

                if (action == "muestraLab.detalle")
                {
                    var id = GetInt(jsonData, "id") ?? 0;
                    var detalle = await _repository.ObtenerDetalle(id);
                    if (detalle == null)
                        return Error("Muestra no encontrada");
                    return Ok(detalle);
                }

                if (action == "muestraLab.humedad.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new HumedadGuardarRequest
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
                    };

                    if (request.MuestraId <= 0)
                        return Error("Falta indicar la muestra");
                    if (string.IsNullOrWhiteSpace(request.MetodoEquipo))
                        return Error("Debes indicar el metodo de equipo (Higrometro/Termobalanza/Horno)");

                    var ensayoId = await _repository.GuardarHumedad(request);
                    return await FinalizarGuardado(ensayoId, jsonData);
                }

                if (action == "muestraLab.gramaje.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new GramajeGuardarRequest
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
                    };

                    if (request.MuestraId <= 0)
                        return Error("Falta indicar la muestra");
                    if (string.IsNullOrWhiteSpace(request.Modalidad))
                        return Error("Debes indicar la modalidad (ProbetaPeso/Directo)");

                    var ensayoId = await _repository.GuardarGramaje(request);
                    return await FinalizarGuardado(ensayoId, jsonData);
                }

                if (action == "muestraLab.cobb.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new CobbGuardarRequest
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        P1 = GetProbeta(jsonData, "p1"),
                        P2 = GetProbeta(jsonData, "p2"),
                        P3 = GetProbeta(jsonData, "p3"),
                    };

                    if (request.MuestraId <= 0)
                        return Error("Falta indicar la muestra");

                    var ensayoId = await _repository.GuardarCobb(request);
                    return await FinalizarGuardado(ensayoId, jsonData);
                }

                if (action == "muestraLab.espesor.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new EspesorGuardarRequest
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
                    };

                    if (request.MuestraId <= 0)
                        return Error("Falta indicar la muestra");
                    if (string.IsNullOrWhiteSpace(request.TipoMedicion))
                        return Error("Debes indicar el tipo de medición (Ubicacion/Muestra)");

                    var ensayoId = await _repository.GuardarEspesor(request);
                    return await FinalizarGuardado(ensayoId, jsonData);
                }

                if (action == "muestraLab.rct.guardar" || action == "muestraLab.fct.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var tipoEnsayo = action == "muestraLab.rct.guardar" ? "RCT" : "FCT";

                    var request = new ResistenciaGuardarRequest
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        Componente = tipoEnsayo == "RCT" ? GetString(jsonData, "componente") : null,
                        StrengthUnidad = GetString(jsonData, "strengthUnidad"),
                        P1 = GetResistenciaProbeta(jsonData, "p1"),
                        P2 = GetResistenciaProbeta(jsonData, "p2"),
                        P3 = GetResistenciaProbeta(jsonData, "p3"),
                    };

                    if (request.MuestraId <= 0)
                        return Error("Falta indicar la muestra");
                    if (tipoEnsayo == "RCT" && string.IsNullOrWhiteSpace(request.Componente))
                        return Error("Debes indicar el componente (Liner/Onda) para RCT");

                    var ensayoId = await _repository.GuardarResistencia(tipoEnsayo, request);
                    return await FinalizarGuardado(ensayoId, jsonData);
                }

                if (action == "muestraLab.ect.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new EctGuardarRequest
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
                    };

                    if (request.MuestraId <= 0)
                        return Error("Falta indicar la muestra");

                    var ensayoId = await _repository.GuardarEct(request);
                    return await FinalizarGuardado(ensayoId, jsonData);
                }

                if (action == "muestraLab.bctMedido.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var cajasEnsayadas = GetInt(jsonData, "cajasEnsayadas") ?? 0;
                    var motivo = GetString(jsonData, "motivoMenos3");

                    if (cajasEnsayadas < 1 || cajasEnsayadas > 3)
                        return Error("Cajas ensayadas debe ser 1, 2 o 3");
                    if (cajasEnsayadas < 3 && string.IsNullOrWhiteSpace(motivo))
                        return Error("Debes indicar el motivo por ensayar menos de 3 cajas");

                    var request = new BctMedidoGuardarRequest
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        CajasEnsayadas = cajasEnsayadas,
                        MotivoMenos3 = motivo,
                        C1 = GetBctCaja(jsonData, "c1"),
                        C2 = cajasEnsayadas >= 2 ? GetBctCaja(jsonData, "c2") : null,
                        C3 = cajasEnsayadas >= 3 ? GetBctCaja(jsonData, "c3") : null,
                    };

                    if (request.MuestraId <= 0)
                        return Error("Falta indicar la muestra");

                    var ensayoId = await _repository.GuardarBctMedido(request);
                    return await FinalizarGuardado(ensayoId, jsonData);
                }

                if (action == "muestraLab.bctTeorico.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new BctTeoricoGuardarRequest
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
                    };

                    if (request.MuestraId <= 0)
                        return Error("Falta indicar la muestra");
                    if (request.EctEnsayoId <= 0 || request.EspesorEnsayoId <= 0)
                        return Error("Debes seleccionar un ECT y un Espesor ya finalizados de esta muestra");

                    var ensayoId = await _repository.GuardarBctTeorico(request);
                    return await FinalizarGuardado(ensayoId, jsonData);
                }

                if (action == "muestraLab.viscosidad.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new ViscosidadGuardarRequest
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
                    };

                    if (request.MuestraId <= 0)
                        return Error("Falta indicar la muestra");

                    var ensayoId = await _repository.GuardarViscosidad(request);
                    return await FinalizarGuardado(ensayoId, jsonData);
                }

                if (action == "muestraLab.ph.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new PhGuardarRequest
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        ValorTexto = GetString(jsonData, "valorTexto"),
                        ColorObservado = GetString(jsonData, "colorObservado"),
                    };

                    if (request.MuestraId <= 0)
                        return Error("Falta indicar la muestra");
                    if (string.IsNullOrWhiteSpace(request.ValorTexto))
                        return Error("Falta el valor o rango leído en la tira");

                    var ensayoId = await _repository.GuardarPh(request);
                    return await FinalizarGuardado(ensayoId, jsonData);
                }

                if (action == "muestraLab.solidos.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new SolidosGuardarRequest
                    {
                        MuestraId = GetInt(jsonData, "muestraId") ?? 0,
                        Metodo = GetString(jsonData, "metodo"),
                        AnalistaUsuarioId = usuario?.Id,
                        AnalistaNombre = usuario?.NombreCompleto,
                        Observacion = GetString(jsonData, "observacion"),
                        D1 = GetSolidosDeterminacion(jsonData, "d1"),
                        D2 = GetSolidosDeterminacion(jsonData, "d2"),
                        D3 = GetSolidosDeterminacion(jsonData, "d3"),
                    };

                    if (request.MuestraId <= 0)
                        return Error("Falta indicar la muestra");

                    var ensayoId = await _repository.GuardarSolidos(request);
                    return await FinalizarGuardado(ensayoId, jsonData);
                }

                if (action == "muestraLab.lugol.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var request = new LugolGuardarRequest
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
                        Cumplimiento = string.IsNullOrWhiteSpace(GetString(jsonData, "cumplimiento"))
                            ? "Sin especificacion"
                            : GetString(jsonData, "cumplimiento"),
                    };

                    if (request.MuestraId <= 0)
                        return Error("Falta indicar la muestra");
                    if (string.IsNullOrWhiteSpace(request.Resultado))
                        return Error("Falta el resultado (Positivo/Negativo/No concluyente)");

                    var ensayoId = await _repository.GuardarLugol(request);
                    return await FinalizarGuardado(ensayoId, jsonData);
                }

                if (action == "muestraLab.especificacion.list")
                {
                    var items = await _repository.ListarEspecificaciones();
                    return Ok(items);
                }

                if (action == "muestraLab.especificacion.guardar")
                {
                    var request = new GuardarEspecificacionRequest
                    {
                        Id = GetInt(jsonData, "id"),
                        TipoMuestra = GetString(jsonData, "tipoMuestra"),
                        TipoEnsayo = GetString(jsonData, "tipoEnsayo"),
                        CodigoProducto = GetString(jsonData, "codigoProducto"),
                        LimiteMin = GetDecimal(jsonData, "limiteMin"),
                        LimiteMax = GetDecimal(jsonData, "limiteMax"),
                        Unidad = GetString(jsonData, "unidad"),
                    };

                    if (string.IsNullOrWhiteSpace(request.TipoMuestra) || string.IsNullOrWhiteSpace(request.TipoEnsayo))
                        return Error("Tipo de muestra y tipo de ensayo son obligatorios");
                    if (request.LimiteMin == null && request.LimiteMax == null)
                        return Error("Debes indicar al menos un límite (mínimo o máximo)");

                    var id = await _repository.GuardarEspecificacion(request);
                    return Ok(new { id });
                }

                if (action == "muestraLab.especificacion.activar")
                {
                    var id = GetInt(jsonData, "id") ?? 0;
                    var activo = jsonData.ValueKind == JsonValueKind.Object
                        && jsonData.TryGetProperty("activo", out var activoEl)
                        && activoEl.ValueKind == JsonValueKind.True;

                    if (id <= 0)
                        return Error("Falta indicar la especificación");

                    await _repository.CambiarActivoEspecificacion(id, activo);
                    return Ok(new { activo });
                }

                if (action == "muestraLab.ensayo.anular")
                {
                    var ensayoId = GetInt(jsonData, "ensayoId") ?? 0;
                    var motivo = GetString(jsonData, "motivo");
                    if (ensayoId <= 0 || string.IsNullOrWhiteSpace(motivo))
                        return Error("Falta el ensayo o el motivo de anulacion");

                    await _repository.AnularEnsayo(ensayoId, motivo);
                    return Ok(new { anulado = true });
                }

                if (action == "muestraLab.nc.crear")
                {
                    var muestraId = GetInt(jsonData, "muestraId") ?? 0;
                    if (muestraId <= 0)
                        return Error("Falta indicar la muestra");

                    var usuario = _session.GetCurrentUser();
                    try
                    {
                        var (ncId, codigo) = await _repository.CrearNoConformidad(muestraId, usuario?.NombreCompleto);
                        return Ok(new { ncId, codigo });
                    }
                    catch (InvalidOperationException ex)
                    {
                        return Error(ex.Message);
                    }
                }

                if (action == "muestraLab.indicadores")
                {
                    var indicadores = await _repository.ObtenerIndicadores();
                    return Ok(indicadores);
                }

                return Error($"Accion no reconocida: {action}");
            }
            catch (Exception ex)
            {
                return Error($"Error interno: {ex.Message}");
            }
        }

        // Cierre comun de cualquier "<tipo>.guardar": si jsonData trae ensayoOriginalId (edicion
        // con auditoria de un ensayo Finalizado), vincula el ensayo recien creado como su
        // correccion y anula el original - ver ReemplazarEnsayo. Sin ese campo, comportamiento
        // identico al de siempre (solo Ok con el ensayoId nuevo).
        private async Task<string> FinalizarGuardado(int ensayoId, JsonElement jsonData)
        {
            var ensayoOriginalId = GetInt(jsonData, "ensayoOriginalId");
            if (ensayoOriginalId.HasValue && ensayoOriginalId.Value > 0)
            {
                var motivo = GetString(jsonData, "motivoReemplazo");
                if (string.IsNullOrWhiteSpace(motivo))
                    return Error("Debes indicar el motivo de la corrección");

                var ok = await _repository.ReemplazarEnsayo(ensayoOriginalId.Value, ensayoId, motivo);
                if (!ok)
                    return Error("El ensayo original no existe o no está Finalizado");
            }

            return Ok(new { ensayoId });
        }

        private static CobbProbetaRequest? GetProbeta(JsonElement parent, string prop)
        {
            if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(prop, out var obj))
                return null;
            if (obj.ValueKind != JsonValueKind.Object)
                return null;

            return new CobbProbetaRequest
            {
                Bobina = GetString(obj, "bobina"),
                Cara = GetString(obj, "cara"),
                PesoInicial = GetDecimal(obj, "pesoInicial"),
                PesoFinal = GetDecimal(obj, "pesoFinal"),
                Tiempo = GetString(obj, "tiempo"),
            };
        }

        private static ResistenciaProbetaRequest? GetResistenciaProbeta(JsonElement parent, string prop)
        {
            if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(prop, out var obj))
                return null;
            if (obj.ValueKind != JsonValueKind.Object)
                return null;

            return new ResistenciaProbetaRequest
            {
                Bobina = GetString(obj, "bobina"),
                Force = GetDecimal(obj, "force"),
                Strength = GetDecimal(obj, "strength"),
            };
        }

        private static BctCajaRequest? GetBctCaja(JsonElement parent, string prop)
        {
            if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(prop, out var obj))
                return null;
            if (obj.ValueKind != JsonValueKind.Object)
                return null;

            return new BctCajaRequest
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

        private static SolidosDeterminacionRequest? GetSolidosDeterminacion(JsonElement parent, string prop)
        {
            if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(prop, out var obj))
                return null;
            if (obj.ValueKind != JsonValueKind.Object)
                return null;

            return new SolidosDeterminacionRequest
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
