using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace QualityControlCenter.Modules.EvaluacionOperadores
{
    // Funciones puras (sin red ni BD) del módulo Evaluación de Calidad por Operador:
    //  1) privacidad: seudónimos estables (OP-xxxxxx) para quien no tiene permiso de ver nombres;
    //  2) lectura validada del resumen de la auditoría histórica FPS↔Calidad (archivo local generado por
    //     tools/fps_historico/analizar_cruce.py): solo agregados y datos de NC, NUNCA nombres de personas.
    public static class EvaluacionOperadoresAuditoria
    {
        public const string NombreArchivo = "auditoria_fps.json";
        private const long MaxBytes = 2 * 1024 * 1024;
        private const string Sal = "QCC-EVOP-v1|";

        public static string RutaPorDefecto() =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "QualityControlCenter", NombreArchivo);

        // Seudónimo estable: misma persona → mismo código; no reversible sin una lista de nombres candidatos.
        public static string Seudonimo(string operador)
        {
            var clave = EvaluacionOperadoresCalculator.NormalizarClave(operador);
            var hash = SHA256.HashData(Encoding.UTF8.GetBytes(Sal + clave));
            return "OP-" + Convert.ToHexString(hash, 0, 3);
        }

        // Si no se pueden ver nombres, reemplaza SOLO los operadores identificables (ok); vacíos, genéricos y múltiples
        // conservan su texto para que la clasificación y las exclusiones sigan igual.
        public static List<NcFila> AplicarPrivacidad(IEnumerable<NcFila> filas, bool verNombres)
        {
            if (verNombres) return filas.ToList();
            return filas.Select(f => EvaluacionOperadoresCalculator.ClasificarOperador(f.Operador) == "ok"
                ? f with { Operador = Seudonimo(f.Operador!) }
                : f).ToList();
        }

        // Valida y reduce el JSON a campos conocidos. Devuelve false con mensaje si no es utilizable.
        public static bool TryLeer(string json, out object? data, out string error)
        {
            data = null; error = "";
            try
            {
                using var doc = JsonDocument.Parse(json);
                var r = doc.RootElement;
                if (r.ValueKind != JsonValueKind.Object || (Int(r, "version") != 1 && Int(r, "version") != 2)) { error = "Formato de auditoría no reconocido"; return false; }

                object Bloque(JsonElement e, string[] enteros) =>
                    enteros.ToDictionary(k => k, k => (object)Int(e, k));

                var cob = r.TryGetProperty("cobertura", out var c) && c.ValueKind == JsonValueKind.Object
                    ? new
                    {
                        meses = Int(c, "meses"), desde = Txt(c, "desde", 10), hasta = Txt(c, "hasta", 10),
                        sesiones = Int(c, "sesiones"), operadoresMaxMes = Int(c, "operadoresMaxMes"),
                        sinOperador = Int(c, "sinOperador"), operadorGenerico = Int(c, "operadorGenerico"),
                        fechasInvertidas = Int(c, "fechasInvertidas"),
                        filasIgualSesiones = c.TryGetProperty("filasIgualSesiones", out var fi) && fi.ValueKind == JsonValueKind.True,
                    }
                    : null;

                var campos = new[]
                {
                    "nc", "con_np_valido", "np_presente_en_fps", "con_operadores_asociados_al_np", "con_participantes_en_maquina_y_fecha",
                    "con_maquina_coincidente", "fecha_dentro_del_periodo_del_np", "fecha_fuera_del_periodo_del_np",
                    "con_coincidencia_maquina_y_fecha", "con_varios_participantes", "confirmada", "probable", "no_atribuible",
                    "sin_coincidencia_en_fps", "llave_NP", "llave_NV_Innpack", "llave_ambigua_NP_y_NV",
                };
                object? prod = null, inter = null;
                if (r.TryGetProperty("resumen", out var rs) && rs.ValueKind == JsonValueKind.Object)
                {
                    if (rs.TryGetProperty("PRODUCTO", out var p) && p.ValueKind == JsonValueKind.Object) prod = Bloque(p, campos);
                    if (rs.TryGetProperty("INTERNA", out var i) && i.ValueKind == JsonValueKind.Object) inter = Bloque(i, campos);
                }

                var ncs = new List<object>();
                if (r.TryGetProperty("ncProducto", out var arr) && arr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var n in arr.EnumerateArray().Take(500))
                    {
                        var razones = n.TryGetProperty("razones", out var rz) && rz.ValueKind == JsonValueKind.Array
                            ? rz.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Take(20).Select(x => Cortar(x.GetString(), 80)).ToList()
                            : new List<string>();
                        var atrib = Txt(n, "atribucion", 20);
                        if (atrib != "CONFIRMADA" && atrib != "PROBABLE" && atrib != "NO_ATRIBUIBLE") atrib = "NO_ATRIBUIBLE";
                        ncs.Add(new
                        {
                            id = Txt(n, "id", 20), nivelNc = Txt(n, "nivelNc", 12), np = Txt(n, "np", 20), llave = Txt(n, "llave", 10),
                            fechaFabricacion = Txt(n, "fechaFabricacion", 10), maquina = Txt(n, "maquina", 80),
                            sesionesNp = Int(n, "sesionesNp"), operadoresNp = Int(n, "operadoresNp"), periodoNp = Txt(n, "periodoNp", 30),
                            fechaEnPeriodoNp = Txt(n, "fechaEnPeriodoNp", 3),
                            participantesEnMaquinaYFecha = Int(n, "participantesEnMaquinaYFecha"),
                            atribucion = atrib, razones,
                            // Nunca se informan puntos si la atribución no está CONFIRMADA.
                            puntosConfirmados = atrib == "CONFIRMADA" ? Int(n, "puntosConfirmados") : 0,
                        });
                    }
                }

                var detalle = new List<object>();
                if (r.TryGetProperty("ncDetalle", out var det) && det.ValueKind == JsonValueKind.Array)
                {
                    foreach (var n in det.EnumerateArray().Take(500))
                    {
                        var escenario = Math.Clamp(Int(n, "escenario"), 1, 4);
                        var conf = Txt(n, "confianza", 20);
                        if (conf != "ALTA" && conf != "MEDIA" && conf != "BAJA") conf = "SIN_EVIDENCIA";
                        List<string> Lista(string k, int max) => n.TryGetProperty(k, out var a) && a.ValueKind == JsonValueKind.Array
                            ? a.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Take(max).Select(x => Cortar(x.GetString(), 120)).ToList()
                            : new List<string>();
                        List<object> Ops(string k) => !n.TryGetProperty(k, out var a) || a.ValueKind != JsonValueKind.Array
                            ? new List<object>()
                            : a.EnumerateArray().Take(60).Select(o => (object)new
                            {
                                operador = Txt(o, "operador", 12), sesiones = Int(o, "sesiones"), cantidad = Int(o, "cantidad"),
                                desde = Txt(o, "desde", 10), hasta = Txt(o, "hasta", 10),
                                maquinas = o.TryGetProperty("maquinas", out var m) && m.ValueKind == JsonValueKind.Array
                                    ? m.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Take(10).Select(x => Cortar(x.GetString(), 80)).ToList()
                                    : new List<string>(),
                                ots = o.TryGetProperty("ots", out var ot) && ot.ValueKind == JsonValueKind.Array
                                    ? ot.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Take(30).Select(x => Cortar(x.GetString(), 20)).ToList()
                                    : new List<string>(),
                                procesos = o.TryGetProperty("procesos", out var pr) && pr.ValueKind == JsonValueKind.Array
                                    ? pr.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Take(10).Select(x => Cortar(x.GetString(), 40)).ToList()
                                    : new List<string>(),
                                sesionesLargas = Int(o, "sesionesLargas"),
                                estado = EstadoPart(Txt(o, "estado", 12)), motivo = Txt(o, "motivo", 300),
                                sesionesDetalle = o.TryGetProperty("sesionesDetalle", out var sd) && sd.ValueKind == JsonValueKind.Array
                                    ? sd.EnumerateArray().Take(20).Select(z => (object)new
                                    {
                                        ot = Txt(z, "ot", 20), proceso = Txt(z, "proceso", 40), maquina = Txt(z, "maquina", 60),
                                        inicio = Txt(z, "inicio", 16), fin = Txt(z, "fin", 16), prodInicio = Txt(z, "prodInicio", 16),
                                        cantidad = Int(z, "cantidad"), larga = Bool(z, "larga"), cierre = Txt(z, "cierre", 40),
                                        comentario = Bool(z, "comentario"), editadoPorOtro = Bool(z, "editadoPorOtro"),
                                    }).ToList()
                                    : new List<object>(),
                                puntosPropuestos = Dec(o, "puntosPropuestos"),
                            }).ToList();
                        detalle.Add(new
                        {
                            id = Txt(n, "id", 20), nivelNc = Txt(n, "nivelNc", 12), np = Txt(n, "np", 20), llave = Txt(n, "llave", 10),
                            maquinaNc = Txt(n, "maquinaNc", 80), fechaFabricacionNc = Txt(n, "fechaFabricacionNc", 10),
                            fechaRegistroNc = Txt(n, "fechaRegistroNc", 10), diasRegistroTrasFabricacion = Int(n, "diasRegistroTrasFabricacion"),
                            ots = Lista("ots", 30), maquinasDocumento = Lista("maquinasDocumento", 30),
                            sesionesDocumento = Int(n, "sesionesDocumento"), periodoDocumento = Txt(n, "periodoDocumento", 30),
                            operadorDeclaradoNc = Txt(n, "operadorDeclaradoNc", 2),
                            puntosSeveridad = Dec(n, "puntosSeveridad"), escenario, confianza = conf,
                            documentoIdentificado = Bool(n, "documentoIdentificado"), maquinaConfirmada = Bool(n, "maquinaConfirmada"),
                            ventanaFiable = Bool(n, "ventanaFiable"), revisarVigencia = Bool(n, "revisarVigencia"),
                            estadoCalidad = "PENDIENTE_VALIDACION_CALIDAD", // nunca confirmado desde un archivo
                            aliasSugerido = Bool(n, "aliasSugerido"),
                            declarado = n.TryGetProperty("declarado", out var dcl) && dcl.ValueKind == JsonValueKind.Object
                                ? new { estado = EstadoDecl(Txt(dcl, "estado", 20)), operador = Txt(dcl, "operador", 12), exclusivo = dcl.TryGetProperty("exclusivo", out var ex) && ex.ValueKind is JsonValueKind.True or JsonValueKind.False ? (bool?)(ex.ValueKind == JsonValueKind.True) : null }
                                : new { estado = "SIN_DECLARAR", operador = "", exclusivo = (bool?)null },
                            procesoNc = Txt(n, "procesoNc", 40),
                            procesoCoincide = n.TryGetProperty("procesoCoincide", out var pc) && pc.ValueKind is JsonValueKind.True or JsonValueKind.False ? (bool?)(pc.ValueKind == JsonValueKind.True) : null,
                            fechaUsadaParaAcotar = Bool(n, "fechaUsadaParaAcotar"), otsSoloPorNpFaret = Int(n, "otsSoloPorNpFaret"),
                            contradicciones = Lista("contradicciones", 20),
                            apoyoUnicoNombreDeclarado = Bool(n, "apoyoUnicoNombreDeclarado"), productoAcota = Bool(n, "productoAcota"),
                            producto = n.TryGetProperty("producto", out var prd) && prd.ValueKind == JsonValueKind.Object
                                ? new { codigo = Txt(prd, "codigo", 30), estado = EstadoConc(Txt(prd, "estado", 14)), detalle = Txt(prd, "detalle", 300), sesiones = Int(prd, "sesiones"),
                                        operadores = prd.TryGetProperty("operadores", out var po) && po.ValueKind == JsonValueKind.Array ? po.EnumerateArray().Take(20).Select(x => Str(x, 12)).ToList() : new List<string>() }
                                : new { codigo = "", estado = "INSUFICIENTE", detalle = "", sesiones = 0, operadores = new List<string>() },
                            variantesNombre = n.TryGetProperty("variantesNombre", out var vn) && vn.ValueKind == JsonValueKind.Array
                                ? vn.EnumerateArray().Take(10).Select(z => (object)new { operador = Txt(z, "operador", 12), tipo = Txt(z, "tipo", 24) is "VARIANTE_ORTOGRAFICA" ? "VARIANTE_ORTOGRAFICA" : "APELLIDO_COINCIDE",
                                        procesos = z.TryGetProperty("procesos", out var vp) && vp.ValueKind == JsonValueKind.Array ? vp.EnumerateArray().Take(6).Select(x => Str(x, 30)).ToList() : new List<string>() }).ToList()
                                : new List<object>(),
                            alternativaFps = n.TryGetProperty("alternativaFps", out var alt) && alt.ValueKind == JsonValueKind.Object
                                ? new { baseAlt = Txt(alt, "base", 20), nota = Txt(alt, "nota", 300), cuentaEnTotales = false,
                                        operadores = alt.TryGetProperty("operadores", out var ao) && ao.ValueKind == JsonValueKind.Array
                                            ? ao.EnumerateArray().Take(20).Select(z => (object)new { operador = Txt(z, "operador", 12), puntosHipoteticos = Dec(z, "puntosHipoteticos") }).ToList() : new List<object>() }
                                : null,
                            evidenciaAmpliada = n.TryGetProperty("evidenciaAmpliada", out var ea) && ea.ValueKind == JsonValueKind.Object
                                ? new { fechaRegistro = Txt(ea, "fechaRegistro", 10), lectura = Txt(ea, "lectura", 400),
                                        declaradoOperabaAlRegistrar = ea.TryGetProperty("declaradoOperabaAlRegistrar", out var dor) && dor.ValueKind is JsonValueKind.True or JsonValueKind.False ? (bool?)(dor.ValueKind == JsonValueKind.True) : null,
                                        operadoresEnFechaRegistro = ea.TryGetProperty("operadoresEnFechaRegistro", out var oer) && oer.ValueKind == JsonValueKind.Array
                                            ? oer.EnumerateArray().Take(10).Select(z => (object)new { operador = Txt(z, "operador", 12), sesiones = Int(z, "sesiones"),
                                                procesos = z.TryGetProperty("procesos", out var zp) && zp.ValueKind == JsonValueKind.Array ? zp.EnumerateArray().Take(5).Select(x => Str(x, 30)).ToList() : new List<string>() }).ToList() : new List<object>(),
                                        productoEnOtrosDocumentos = ea.TryGetProperty("productoEnOtrosDocumentos", out var poe) && poe.ValueKind == JsonValueKind.Array
                                            ? poe.EnumerateArray().Take(30).Select(z => (object)new { proceso = Txt(z, "proceso", 30), maquina = Txt(z, "maquina", 60), mes = Txt(z, "mes", 7), sesiones = Int(z, "sesiones"),
                                                operadores = z.TryGetProperty("operadores", out var zo) && zo.ValueKind == JsonValueKind.Array ? zo.EnumerateArray().Take(10).Select(x => Str(x, 12)).ToList() : new List<string>() }).ToList() : new List<object>() }
                                : null,
                            maquinaCatalogoSinSesiones = Bool(n, "maquinaCatalogoSinSesiones"),
                            catalogo = n.TryGetProperty("catalogo", out var ctg) && ctg.ValueKind == JsonValueKind.Object
                                ? new { estado = Txt(ctg, "estado", 10) is "EXACTA" or "UNICA" or "AMBIGUA" ? Txt(ctg, "estado", 10) : "NINGUNA", id = Txt(ctg, "id", 8), nombre = Txt(ctg, "nombre", 60), grupo = Txt(ctg, "grupo", 30) }
                                : null,
                            conciliacion = n.TryGetProperty("conciliacion", out var cc) && cc.ValueKind == JsonValueKind.Object
                                ? new { estado = EstadoConc(Txt(cc, "estado", 14)),
                                        dimensiones = cc.TryGetProperty("dimensiones", out var cd) && cd.ValueKind == JsonValueKind.Array
                                            ? cd.EnumerateArray().Take(10).Select(z => (object)new { dimension = Txt(z, "dimension", 14), estado = EstadoConc(Txt(z, "estado", 14)), calidad = Txt(z, "calidad", 120), fps = Txt(z, "fps", 160), detalle = Txt(z, "detalle", 300) }).ToList() : new List<object>() }
                                : null,
                            equivalencia = n.TryGetProperty("equivalencia", out var eqv) && eqv.ValueKind == JsonValueKind.Object
                                ? new { estado = EstadoEq(Txt(eqv, "estado", 12)), nc = Txt(eqv, "nc", 80), fps = Txt(eqv, "fps", 80), detalle = Txt(eqv, "detalle", 300) }
                                : new { estado = "NINGUNA", nc = "", fps = "", detalle = "" },
                            documento = n.TryGetProperty("documento", out var dc) && dc.ValueKind == JsonValueKind.Object
                                ? new { np = Txt(dc, "np", 20), estado = Txt(dc, "estado", 30), ingreso = Txt(dc, "ingreso", 10), entrega = Txt(dc, "entrega", 10), enMaestro = Bool(dc, "enMaestro") }
                                : null,
                            otDetalle = n.TryGetProperty("otDetalle", out var od) && od.ValueKind == JsonValueKind.Array
                                ? od.EnumerateArray().Take(60).Select(z => (object)new
                                {
                                    ot = Txt(z, "ot", 20), proceso = Txt(z, "proceso", 40), sesiones = Int(z, "sesiones"), operadores = Int(z, "operadores"),
                                    cantidad = Int(z, "cantidad"), desde = Txt(z, "desde", 16), hasta = Txt(z, "hasta", 16), sesionesLargas = Int(z, "sesionesLargas"),
                                    maquinas = z.TryGetProperty("maquinas", out var mm) && mm.ValueKind == JsonValueKind.Array
                                        ? mm.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Take(5).Select(x => Cortar(x.GetString(), 60)).ToList()
                                        : new List<string>(),
                                }).ToList()
                                : new List<object>(),
                            razones = Lista("razones", 20), evidenciaFaltante = Lista("evidenciaFaltante", 20),
                            operadores = Ops("operadores"), participantesContexto = Ops("participantesContexto"),
                            puntosAsignados = escenario == 4 ? 0m : Dec(n, "puntosAsignados"),
                        });
                    }
                }
                var indicadores = new List<object>();
                if (r.TryGetProperty("indicadores", out var ind) && ind.ValueKind == JsonValueKind.Array)
                    foreach (var o in ind.EnumerateArray().Take(300))
                        indicadores.Add(new { operador = Txt(o, "operador", 12), participacionNc = Int(o, "participacionNc"),
                                              propuestaPuntos = Dec(o, "propuestaPuntos"), confirmadaPuntos = 0m });
                var equivalencias = new List<object>();
                if (r.TryGetProperty("equivalenciasMaquinas", out var eqm) && eqm.ValueKind == JsonValueKind.Array)
                    foreach (var o in eqm.EnumerateArray().Take(40))
                        equivalencias.Add(new { maquinaCalidad = Txt(o, "maquinaCalidad", 80), estado = Txt(o, "estado", 10) is "EXACTA" or "UNICA" or "AMBIGUA" ? Txt(o, "estado", 10) : "NINGUNA",
                            idFps = Txt(o, "idFps", 8), maquinaFps = Txt(o, "maquinaFps", 60), proceso = Txt(o, "proceso", 30),
                            ncs = o.TryGetProperty("ncs", out var en) && en.ValueKind == JsonValueKind.Array ? en.EnumerateArray().Take(20).Select(x => Str(x, 10)).ToList() : new List<string>(),
                            pendientes = o.TryGetProperty("pendientes", out var ep) && ep.ValueKind == JsonValueKind.Array ? ep.EnumerateArray().Take(10).Select(x => Str(x, 200)).ToList() : new List<string>() });
                var escenarios = r.TryGetProperty("escenarios", out var esc) && esc.ValueKind == JsonValueKind.Object
                    ? new[] { "1", "2", "3", "4" }.ToDictionary(k => k, k => Int(esc, k)) : null;

                data = new
                {
                    generado = Txt(r, "generado", 20),
                    fuente = Txt(r, "fuente", 200),
                    aliasValidadosAplicados = Int(r, "aliasValidadosAplicados"),
                    cobertura = cob,
                    totalNcAnalizadas = r.TryGetProperty("resumen", out var rr) ? Int(rr, "total_nc_analizadas") : 0,
                    ncEliminadasExcluidas = r.TryGetProperty("resumen", out var r2) ? Int(r2, "nc_eliminadas_excluidas") : 0,
                    producto = prod,
                    internas = inter,
                    ncProducto = ncs,
                    version = Int(r, "version"), ncDetalle = detalle, equivalenciasMaquinas = equivalencias, indicadores, escenarios,
                    vigencia = "Snapshot histórico: refleja la fecha de generación, no el tiempo real.",
                };
                return true;
            }
            catch (Exception)
            {
                error = "Archivo de auditoría inválido";
                return false;
            }
        }

        // Lee el archivo local (si existe). "No disponible" no es un error: el módulo sigue funcionando sin él.
        public static (bool disponible, object? data, string error) Cargar(string? ruta = null)
        {
            ruta ??= RutaPorDefecto();
            try
            {
                var fi = new FileInfo(ruta);
                if (!fi.Exists) return (false, null, "");
                if (fi.Length > MaxBytes) return (false, null, "Archivo de auditoría demasiado grande");
                return TryLeer(File.ReadAllText(ruta, Encoding.UTF8), out var d, out var e) ? (true, d, "") : (false, null, e);
            }
            catch (Exception)
            {
                return (false, null, "No se pudo leer el archivo de auditoría");
            }
        }

        private static int Int(JsonElement e, string k)
        {
            if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(k, out var v) || v.ValueKind != JsonValueKind.Number || !v.TryGetInt32(out var n)) return 0;
            return Math.Clamp(n, 0, 10_000_000);
        }

        private static string EstadoPart(string v) => v is "PROPUESTO" or "EXCLUIDO" or "CONTEXTO" ? v : "CONTEXTO";
        private static string EstadoDecl(string v) => v is "CORROBORADO" or "NO_ENCONTRADO" or "FUERA_DE_MAQUINA" or "FUERA_DE_PRODUCTO" or "AMBIGUO" or "DECLARADO" ? v : "SIN_DECLARAR";
        private static string EstadoConc(string v) => v is "CONFIRMADA" or "PROBABLE" or "DISCREPANCIA" ? v : "INSUFICIENTE";
        private static string EstadoEq(string v) => v is "EXACTA" or "VALIDADA" or "SUGERIDA" or "CATALOGO" ? v : "NINGUNA";

        private static decimal Dec(JsonElement e, string k)
        {
            if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(k, out var v) || v.ValueKind != JsonValueKind.Number || !v.TryGetDecimal(out var d)) return 0m;
            return Math.Clamp(d, 0m, 100000m);
        }

        private static bool Bool(JsonElement e, string k) =>
            e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.True;

        private static string Txt(JsonElement e, string k, int max) =>
            e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? Cortar(v.GetString(), max) : "";

        private static string Str(JsonElement e, int max) => e.ValueKind == JsonValueKind.String ? Cortar(e.GetString(), max) : "";

        private static string Cortar(string? s, int max) => (s ?? "").Length <= max ? (s ?? "") : (s ?? "")[..max];
    }
}
