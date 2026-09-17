using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Backend.Services.PlanificacionApi;
using QualityControlCenter.Backend.Services.SapRecepcionApi;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.MuestraLaboratorio
{
    // Migrado a QualityControlInnpack.Api — ya no consulta MySQL directo desde el desktop
    // (MuestraLaboratorioRepository.cs de este módulo queda sin uso). El parseo de campos del
    // payload Photino (GetString/GetInt/GetDecimal/GetProbeta/etc.) se mantiene igual que antes —
    // solo cambia el paso final de cada accion, que ahora arma un request anonimo y lo reenvia a
    // la API en vez de llamar al repository local. Nombre de accion "muestraLab" (no "laboratorio")
    // a proposito: ya existe Modules/Laboratorio (visor de ensayos de la app movil), un concepto
    // distinto. Solo INNPACK. Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class MuestraLaboratorioHandler
    {
        private readonly InnpackMuestraLaboratorioApiService _api;
        private readonly CurrentUserSessionService _session;
        private readonly PlanificacionApiClient _planificacion;
        private readonly FpsRegistroProduccionApiService _fpsRegistroProduccion;
        private readonly FpsMaterialesApiService _fpsMateriales;
        private readonly SapRecepcionApiClient _sapRecepcion;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public MuestraLaboratorioHandler(
            InnpackApiClient client,
            CurrentUserSessionService session,
            PlanificacionApiClient planificacion,
            FpsRegistroProduccionApiService fpsRegistroProduccion,
            SapRecepcionApiClient sapRecepcion,
            FpsMaterialesApiService fpsMateriales
        )
        {
            _api = new InnpackMuestraLaboratorioApiService(client);
            _session = session;
            _planificacion = planificacion;
            _fpsRegistroProduccion = fpsRegistroProduccion;
            _sapRecepcion = sapRecepcion;
            _fpsMateriales = fpsMateriales;
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                var jsonData = GetDataElement(data);

                if (action == "muestraLab.crear")
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
                        // Snapshot de FPS (REG-LAB-04): se completa solo si el analista usó
                        // "Consultar NP"/"Consultar registro de producción" antes de guardar.
                        RegistroProduccionRecordKey = GetLong(jsonData, "registroProduccionRecordKey"),
                        IdProcesoFps = GetLong(jsonData, "idProcesoFps"),
                        ProcesoTextoFps = GetString(jsonData, "procesoTextoFps"),
                        OperadorTexto = GetString(jsonData, "operadorTexto"),
                        FechaProduccionFps = GetString(jsonData, "fechaProduccionFps"),
                        FechaConsultaFps = GetString(jsonData, "fechaConsultaFps"),
                        MaquinaId = GetInt(jsonData, "maquinaId"),
                        TipoOndaId = GetInt(jsonData, "tipoOndaId"),
                        // Punto 24 del REG-LAB-04: campos propios de "Prueba solicitada".
                        Solicitante = GetString(jsonData, "solicitante"),
                        MotivoSolicitud = GetString(jsonData, "motivoSolicitud"),
                        EtapaOrigen = GetString(jsonData, "etapaOrigen"),
                        EnsayosRequeridos = GetString(jsonData, "ensayosRequeridos"),
                        // Punto 19 del REG-LAB-04: Control de Monotapa.
                        PesoOndaExtendida = GetDecimal(jsonData, "pesoOndaExtendida"),
                        PesoRecorte10x10 = GetDecimal(jsonData, "pesoRecorte10x10"),
                        LongitudOndaExtendida = GetDecimal(jsonData, "longitudOndaExtendida"),
                        AlturaOnda = GetDecimal(jsonData, "alturaOnda"),
                        // Punto 20 del REG-LAB-04: Control de Emplacado.
                        MonotapaRelacionadaId = GetInt(jsonData, "monotapaRelacionadaId"),
                        PliegoRelacionado = GetString(jsonData, "pliegoRelacionado"),
                    };

                    return await Forward(_api.CrearMuestraAsync(request));
                }

                // Puntos 1/8/9/10/38 del REG-LAB-04: vista agrupada por NP + N.º de registro de
                // producción (no es una tabla nueva — agrupa por columnas que ya existían).
                if (action == "muestraLab.registroProduccion.list")
                {
                    var np = GetString(jsonData, "np");
                    if (string.IsNullOrWhiteSpace(np))
                        return Error("Falta indicar la NP");

                    var lote = GetString(jsonData, "lote");
                    return await Forward(_api.ObtenerControlesPorRegistroProduccionAsync(np, string.IsNullOrWhiteSpace(lote) ? null : lote));
                }

                // Punto 2/34 del REG-LAB-04: anular el registro completo (distinto de anular un
                // ensayo puntual, que ya existía).
                if (action == "muestraLab.anular")
                {
                    var muestraId = GetInt(jsonData, "id") ?? 0;
                    var motivo = GetString(jsonData, "motivo");
                    if (muestraId <= 0 || string.IsNullOrWhiteSpace(motivo))
                        return Error("Falta la muestra o el motivo de anulación");

                    var usuario = _session.GetCurrentUser();
                    var request = new { Motivo = motivo, UsuarioNombre = usuario?.NombreCompleto };
                    return await Forward(_api.AnularMuestraAsync(muestraId, request));
                }

                // Botón "Eliminar" del listado: borrado lógico (columna `eliminado`), distinto de
                // Anular (que conserva el registro visible con estado "Anulado" e historial).
                if (action == "muestraLab.eliminar")
                {
                    var muestraId = GetInt(jsonData, "id") ?? 0;
                    if (muestraId <= 0)
                        return Error("Falta la muestra a eliminar");

                    return await Forward(_api.EliminarMuestraAsync(muestraId));
                }

                // Punto 5 del REG-LAB-04: materiales/insumos de FPS (ZZZMateriasPrimasOT, Tipo
                // INSUMO) usados en el proceso de esta producción — mismo servicio ya usado por
                // Trazabilidad, reutilizado acá sin cambios.
                if (action == "muestraLab.materialesFps")
                {
                    var idProceso = GetLong(jsonData, "idProceso") ?? 0;
                    if (idProceso <= 0)
                        return Error("Falta el idProceso (FPS) de la muestra");

                    if (!_fpsMateriales.IsConfigured)
                        return Error("FPS no está configurado en este equipo.");

                    var (ok, materiales, error) = await _fpsMateriales.ObtenerMaterialesPorProcesosAsync(new[] { idProceso });
                    if (!ok)
                        return Error(error ?? "No fue posible consultar los materiales en FPS.");

                    return Ok(materiales);
                }

                // Punto 12 del REG-LAB-04: antecedente histórico de una bobina muestreada (Punto 11).
                if (action == "muestraLab.bobinaHistorial")
                {
                    var numeroBobina = GetString(jsonData, "numeroBobina");
                    if (string.IsNullOrWhiteSpace(numeroBobina))
                        return Error("Falta el número de bobina");

                    var excluirMuestraId = GetInt(jsonData, "excluirMuestraId") ?? 0;
                    return await Forward(_api.BuscarHistorialBobinaAsync(numeroBobina, excluirMuestraId));
                }

                // Consulta NP en Planificación FARET (misma vista-planificacion que ya usa
                // Trazabilidad) para autocompletar Cliente/Código/Descripción/Proceso. No persiste
                // nada — el snapshot se guarda recién cuando el analista guarda la muestra.
                if (action == "muestraLab.consultarNp")
                {
                    var np = GetString(jsonData, "np");
                    if (string.IsNullOrWhiteSpace(np))
                        return Error("Falta indicar la NP");

                    if (!_planificacion.IsConfigured)
                        return Error("Planificación FARET no está configurada en este equipo.");

                    var (ok, body) = await _planificacion.GetAsync("api/plan/vista-planificacion");
                    if (!ok)
                        return Error(ExtraerMensajePlanificacion(body));

                    try
                    {
                        using var doc = JsonDocument.Parse(body);
                        if (doc.RootElement.ValueKind != JsonValueKind.Array)
                            return Error("Respuesta inesperada de Planificación FARET.");

                        var resultados = new List<object>();
                        foreach (var row in doc.RootElement.EnumerateArray())
                        {
                            var rowNp = GetString(row, "np");
                            var rowNvInn = GetString(row, "nvInn");
                            if (rowNp != np && rowNvInn != np)
                                continue;

                            resultados.Add(new
                            {
                                IdProceso = GetLongFromRow(row, "id"),
                                Cliente = GetString(row, "cli"),
                                CodigoProducto = GetString(row, "item"),
                                Descripcion = GetString(row, "itemName"),
                                Proceso = GetString(row, "proc"),
                            });
                        }

                        if (resultados.Count == 0)
                            return Error($"No se encontró la NP {np} en Planificación FARET.");

                        return Ok(resultados);
                    }
                    catch (Exception ex)
                    {
                        return Error($"Respuesta inválida de Planificación FARET: {ex.Message}");
                    }
                }

                // Consulta las sesiones reales de WorkOrderRecords para un proceso puntual
                // (ver FpsRegistroProduccionApiService) — el analista elige cuál RecordKey
                // corresponde al control que está registrando.
                if (action == "muestraLab.consultarRegistroProduccion")
                {
                    var idProceso = GetLong(jsonData, "idProceso") ?? 0;
                    if (idProceso <= 0)
                        return Error("Falta indicar el proceso (selecciona primero la NP)");

                    if (!_fpsRegistroProduccion.IsConfigured)
                        return Error("FPS no está configurado en este equipo.");

                    var (ok, registros, error) = await _fpsRegistroProduccion.ObtenerPorProcesoAsync(idProceso);
                    if (!ok)
                        return Error(error ?? "No fue posible consultar FPS.");

                    return Ok(registros);
                }

                // Resuelve un número de bobina/lote contra SAP (apisapfaret, mismo endpoint que ya
                // usa la app móvil Flutter para el escaneo de bobinas en Registros de Control).
                if (action == "muestraLab.resolverBobina")
                {
                    var lote = GetString(jsonData, "lote");
                    if (string.IsNullOrWhiteSpace(lote))
                        return Error("Falta indicar el lote/bobina");

                    if (!_sapRecepcion.IsConfigured)
                        return Error("SAP (apisapfaret) no está configurado en este equipo.");

                    var (ok, body) = await _sapRecepcion.GetAsync($"api/lotes/{Uri.EscapeDataString(lote)}");
                    if (!ok)
                        return Error(ExtraerMensajePlanificacion(body));

                    try
                    {
                        using var doc = JsonDocument.Parse(body);
                        var root = doc.RootElement;
                        if (!root.TryGetProperty("data", out var dataProp) || dataProp.ValueKind != JsonValueKind.Array || dataProp.GetArrayLength() == 0)
                            return Error($"No se encontró el lote {lote} en SAP.");

                        var primero = dataProp[0];
                        return Ok(new
                        {
                            Empresa = GetString(primero, "empresa"),
                            ItemCode = GetString(primero, "itemCode"),
                            ItemName = GetString(primero, "itemName"),
                            Unidad = GetString(primero, "unidad"),
                            Stock = GetString(primero, "stock"),
                            Ubicacion = GetString(primero, "ubicacion"),
                        });
                    }
                    catch (Exception ex)
                    {
                        return Error($"Respuesta inválida de SAP: {ex.Message}");
                    }
                }

                if (action == "muestraLab.list")
                {
                    var estado = GetString(jsonData, "estado");
                    var tipoMuestra = GetString(jsonData, "tipoMuestra");
                    var np = GetString(jsonData, "np");
                    return await Forward(_api.ListAsync(
                        estado, tipoMuestra, np,
                        fechaDesde: GetString(jsonData, "fechaDesde"),
                        fechaHasta: GetString(jsonData, "fechaHasta"),
                        cliente: GetString(jsonData, "cliente"),
                        codigoProducto: GetString(jsonData, "codigoProducto"),
                        descripcion: GetString(jsonData, "descripcion"),
                        origen: GetString(jsonData, "origen"),
                        maquinaId: GetInt(jsonData, "maquinaId"),
                        analistaNombre: GetString(jsonData, "analistaNombre"),
                        bobina: GetString(jsonData, "bobina")
                    ));
                }

                if (action == "muestraLab.detalle")
                {
                    var id = GetInt(jsonData, "id") ?? 0;
                    return await Forward(_api.DetalleAsync(id));
                }

                if (action == "muestraLab.catalogos")
                    return await Forward(_api.CatalogosAsync());

                // Punto 7 del REG-LAB-04: corrige la fecha efectiva de un registro ya creado, sin
                // tocar fecha_ingreso (creación) — deja auditoría (quién/cuándo) del lado API.
                if (action == "muestraLab.actualizarFechaEnsayo")
                {
                    var id = GetInt(jsonData, "id") ?? 0;
                    if (id <= 0)
                        return Error("Falta indicar la muestra");

                    var usuario = _session.GetCurrentUser();
                    var request = new
                    {
                        FechaEnsayo = GetString(jsonData, "fechaEnsayo"),
                        UsuarioNombre = usuario?.NombreCompleto,
                    };

                    return await Forward(_api.ActualizarFechaEnsayoAsync(id, request));
                }

                // Punto 3 del REG-LAB-04: adjuntar archivo(s)/fotografía(s) al registro completo
                // de la muestra (no por ensayo). Mismo patrón que ControlDocumentalHandler.
                if (action == "muestraLab.adjunto.subir")
                {
                    var muestraId = GetInt(jsonData, "muestraId") ?? 0;
                    if (muestraId <= 0)
                        return Error("Falta indicar la muestra");

                    var usuario = _session.GetCurrentUser();
                    var request = new
                    {
                        NombreArchivo = GetString(jsonData, "nombreArchivo"),
                        ContenidoBase64 = GetString(jsonData, "contenidoBase64"),
                        SubidoPor = usuario?.NombreCompleto,
                    };

                    return await Forward(_api.SubirAdjuntoAsync(muestraId, request));
                }

                // Imágenes/PDF: reenvía el base64 al frontend para previsualizar embebido
                // (WebView2 renderiza PDF nativo vía data: URI). Word u otros no previsualizables:
                // se escriben a una carpeta temporal y se abren con la app del sistema — mismo
                // patrón que ControlDocumentalHandler.HandleAdjuntoAbrir.
                if (action == "muestraLab.adjunto.abrir")
                {
                    var adjuntoId = GetInt(jsonData, "adjuntoId") ?? 0;
                    if (adjuntoId <= 0)
                        return Error("Falta indicar el adjunto");

                    var (ok, body) = await _api.ObtenerAdjuntoAsync(adjuntoId);
                    if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                        return Error(error);

                    var nombreArchivo = payload.GetProperty("nombreArchivo").GetString() ?? "";
                    var tipoMime = payload.GetProperty("tipoMime").GetString() ?? "";
                    var contenidoBase64 = payload.GetProperty("contenidoBase64").GetString() ?? "";

                    if (tipoMime.StartsWith("image/") || tipoMime == "application/pdf")
                        return Ok(new { previsualizable = true, nombreArchivo, tipoMime, contenidoBase64 });

                    var contenido = Convert.FromBase64String(contenidoBase64);
                    var carpetaTemp = Path.Combine(Path.GetTempPath(), "QCC_MuestraLaboratorio");
                    Directory.CreateDirectory(carpetaTemp);
                    var rutaArchivo = Path.Combine(carpetaTemp, $"{adjuntoId}_{nombreArchivo}");
                    await File.WriteAllBytesAsync(rutaArchivo, contenido);

                    Process.Start(new ProcessStartInfo { FileName = rutaArchivo, UseShellExecute = true });

                    return Ok(new { previsualizable = false, nombreArchivo });
                }

                if (action == "muestraLab.adjunto.eliminar")
                {
                    var adjuntoId = GetInt(jsonData, "adjuntoId") ?? 0;
                    if (adjuntoId <= 0)
                        return Error("Falta indicar el adjunto");

                    return await Forward(_api.EliminarAdjuntoAsync(adjuntoId));
                }

                if (action == "muestraLab.humedad.guardar")
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
                        BobinaOnda = GetString(jsonData, "bobinaOnda"),
                        BobinaLiner = GetString(jsonData, "bobinaLiner"),
                        BobinaCartulina = GetString(jsonData, "bobinaCartulina"),
                        Bobinas = GetBobinas(jsonData, "bobinas"),
                        OrigenMuestra = GetString(jsonData, "origenMuestra"),
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(_api.GuardarHumedadAsync(request));
                }

                if (action == "muestraLab.gramaje.guardar")
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
                        TamanoProbeta = GetString(jsonData, "tamanoProbeta"),
                        Muestra1 = GetDecimal(jsonData, "muestra1"),
                        Muestra2 = GetDecimal(jsonData, "muestra2"),
                        Muestra3 = GetDecimal(jsonData, "muestra3"),
                        BobinaOnda = GetString(jsonData, "bobinaOnda"),
                        BobinaLiner = GetString(jsonData, "bobinaLiner"),
                        BobinaCartulina = GetString(jsonData, "bobinaCartulina"),
                        Bobinas = GetBobinas(jsonData, "bobinas"),
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(_api.GuardarGramajeAsync(request));
                }

                if (action == "muestraLab.cobb.guardar")
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

                if (action == "muestraLab.espesor.guardar")
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
                        BobinaOnda = GetString(jsonData, "bobinaOnda"),
                        BobinaLiner = GetString(jsonData, "bobinaLiner"),
                        BobinaCartulina = GetString(jsonData, "bobinaCartulina"),
                        Bobinas = GetBobinas(jsonData, "bobinas"),
                        EnsayoOriginalId = GetInt(jsonData, "ensayoOriginalId"),
                        MotivoReemplazo = GetString(jsonData, "motivoReemplazo"),
                    };

                    return await Forward(_api.GuardarEspesorAsync(request));
                }

                if (action == "muestraLab.rct.guardar" || action == "muestraLab.fct.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    var esRct = action == "muestraLab.rct.guardar";

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

                if (action == "muestraLab.ect.guardar")
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

                if (action == "muestraLab.bctMedido.guardar")
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

                if (action == "muestraLab.bctTeorico.guardar")
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

                if (action == "muestraLab.viscosidad.guardar")
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

                if (action == "muestraLab.ph.guardar")
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

                if (action == "muestraLab.solidos.guardar")
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

                if (action == "muestraLab.lugol.guardar")
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

                // Punto 32 del REG-LAB-04: administración del maestro de métodos.
                if (action == "muestraLab.metodo.list")
                    return await Forward(_api.ListarMetodosAsync());

                if (action == "muestraLab.metodo.guardar")
                {
                    var usuario = _session.GetCurrentUser();
                    // Variante debe viajar null (no "") cuando no aplica (todo salvo HUMEDAD) —
                    // el lookup del método vigente compara "variante IS NULL" literal en SQL.
                    var variante = GetString(jsonData, "variante");
                    var request = new
                    {
                        Id = GetInt(jsonData, "id"),
                        TipoEnsayo = GetString(jsonData, "tipoEnsayo"),
                        Variante = string.IsNullOrWhiteSpace(variante) ? null : variante,
                        Nombre = GetString(jsonData, "nombre"),
                        Codigo = GetString(jsonData, "codigo"),
                        Version = GetString(jsonData, "version"),
                        Unidad = GetString(jsonData, "unidad"),
                        UsuarioNombre = usuario?.NombreCompleto,
                    };

                    return await Forward(_api.GuardarMetodoAsync(request));
                }

                if (action == "muestraLab.metodo.activar")
                {
                    var id = GetInt(jsonData, "id") ?? 0;
                    var activo = jsonData.ValueKind == JsonValueKind.Object
                        && jsonData.TryGetProperty("activo", out var activoEl)
                        && activoEl.ValueKind == JsonValueKind.True;

                    if (id <= 0)
                        return Error("Falta indicar el método");

                    return await Forward(_api.CambiarActivoMetodoAsync(id, activo));
                }

                if (action == "muestraLab.especificacion.list")
                    return await Forward(_api.ListarEspecificacionesAsync());

                if (action == "muestraLab.especificacion.guardar")
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

                if (action == "muestraLab.especificacion.activar")
                {
                    var id = GetInt(jsonData, "id") ?? 0;
                    var activo = jsonData.ValueKind == JsonValueKind.Object
                        && jsonData.TryGetProperty("activo", out var activoEl)
                        && activoEl.ValueKind == JsonValueKind.True;

                    if (id <= 0)
                        return Error("Falta indicar la especificación");

                    return await Forward(_api.CambiarActivoEspecificacionAsync(id, activo));
                }

                if (action == "muestraLab.ensayo.anular")
                {
                    var ensayoId = GetInt(jsonData, "ensayoId") ?? 0;
                    var motivo = GetString(jsonData, "motivo");
                    if (ensayoId <= 0 || string.IsNullOrWhiteSpace(motivo))
                        return Error("Falta el ensayo o el motivo de anulacion");

                    return await Forward(_api.AnularEnsayoAsync(ensayoId, motivo));
                }

                if (action == "muestraLab.nc.crear")
                {
                    var muestraId = GetInt(jsonData, "muestraId") ?? 0;
                    if (muestraId <= 0)
                        return Error("Falta indicar la muestra");

                    var usuario = _session.GetCurrentUser();
                    return await Forward(_api.CrearNoConformidadAsync(muestraId, usuario?.NombreCompleto));
                }

                if (action == "muestraLab.indicadores")
                    return await Forward(_api.IndicadoresAsync());

                return Error($"Accion no reconocida: {action}");
            }
            catch (Exception ex)
            {
                return Error($"Error interno: {ex.Message}");
            }
        }

        // Punto 11 del REG-LAB-04: lista opcional de 3+ bobinas muestreadas del mismo sustrato,
        // reutilizada por Humedad/Gramaje/Espesor.
        private static List<object>? GetBobinas(JsonElement parent, string prop)
        {
            if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(prop, out var arr))
                return null;
            if (arr.ValueKind != JsonValueKind.Array)
                return null;

            var lista = new List<object>();
            foreach (var item in arr.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                    continue;

                lista.Add(
                    new
                    {
                        NumeroBobina = GetString(item, "numeroBobina"),
                        Lote = GetString(item, "lote"),
                        Posicion = GetString(item, "posicion"),
                        Valor1 = GetDecimal(item, "valor1"),
                        Valor2 = GetDecimal(item, "valor2"),
                        Valor3 = GetDecimal(item, "valor3"),
                        Observacion = GetString(item, "observacion"),
                    }
                );
            }
            return lista;
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

        private static long? GetLong(JsonElement obj, string prop)
        {
            if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(prop, out var value))
                return null;
            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var l))
                return l;
            if (value.ValueKind == JsonValueKind.String && long.TryParse(value.GetString(), out var parsed))
                return parsed;
            return null;
        }

        private static long GetLongFromRow(JsonElement obj, string prop) => GetLong(obj, prop) ?? 0;

        private static string ExtraerMensajePlanificacion(string body)
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String)
                    return m.GetString() ?? body;
            }
            catch
            {
                // body no era JSON — se usa tal cual.
            }
            return body;
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
        // QualityControlInnpack.Api — mismo criterio ya usado en UsuariosHandler.cs/TalleresExternosHandler.cs.
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
