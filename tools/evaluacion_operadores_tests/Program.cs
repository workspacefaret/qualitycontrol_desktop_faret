using System.Text.Json;
using QualityControlCenter.Backend.Services.FaretApi;
using QualityControlCenter.Modules.EvaluacionOperadores;
using QualityControlCenter.Services;

// Datos sintéticos: ningún dato real.
int fallos = 0, total = 0;
void Check(string nombre, bool ok, string detalle = "")
{
    total++;
    if (!ok) fallos++;
    Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {nombre}{(ok ? "" : "  -> " + detalle)}");
}

JsonElement J(object o) => JsonSerializer.SerializeToElement(o, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
JsonElement Calc(IEnumerable<NcFila> f, int? a = null, int? m = null, string? mq = null, string? op = null) =>
    J(EvaluacionOperadoresCalculator.Calcular(f, new EvaluacionFiltros(a, m, mq, op)));

NcFila F(int id, string? nivel, string? op, string? mq, string? fecha, bool el = false) => new(id, nivel, op, mq, fecha, el);

// ---- Niveles y ponderaciones
Check("Nivel Crítico/Mayor/Menor (con acento y espacios)",
    EvaluacionOperadoresCalculator.ClasificarNivel(" Crítico ") == "CRITICO" &&
    EvaluacionOperadoresCalculator.ClasificarNivel("mayor") == "MAYOR" &&
    EvaluacionOperadoresCalculator.ClasificarNivel("MENOR") == "MENOR");
Check("Nivel vacío / desconocido",
    EvaluacionOperadoresCalculator.ClasificarNivel(null) == "SIN_NIVEL" && EvaluacionOperadoresCalculator.ClasificarNivel("ALTA") == "NIVEL_OTRO");
Check("Ponderaciones 10/5/1",
    EvaluacionOperadoresCalculator.Puntos("CRITICO") == 10 && EvaluacionOperadoresCalculator.Puntos("MAYOR") == 5 &&
    EvaluacionOperadoresCalculator.Puntos("MENOR") == 1 && EvaluacionOperadoresCalculator.Puntos("SIN_NIVEL") == 0);

// ---- Operadores
Check("Operador ok / vacío / genérico / múltiple",
    EvaluacionOperadoresCalculator.ClasificarOperador("Ana Pérez") == "ok" &&
    EvaluacionOperadoresCalculator.ClasificarOperador("  ") == "vacio" &&
    EvaluacionOperadoresCalculator.ClasificarOperador("N/A") == "generico" &&
    EvaluacionOperadoresCalculator.ClasificarOperador("Ana / Luis") == "multiple" &&
    EvaluacionOperadoresCalculator.ClasificarOperador("Ana y Luis") == "multiple");

// ---- Escenario base
var baseFilas = new List<NcFila>
{
    F(1, "Crítico", "Ana Perez", "M1", "2026-03-10"),
    F(2, "Mayor", "ana  perez", "M1", "2026-03-20"),       // misma persona, distinta escritura
    F(3, "Menor", "Luis Soto", "M2", "2026-04-02"),
    F(4, "Menor", "", "M2", "2026-04-05"),                 // sin operador
    F(5, "Mayor", "Luis Soto", null, "2026-04-09"),        // sin máquina (sigue evaluable)
    F(6, "Mayor", "Ana Perez", "M1", null),                // sin fecha
    F(7, "ALTA", "Luis Soto", "M2", "2026-04-11"),         // nivel sin clasificar
    F(8, "Crítico", "Ana Perez", "M1", "2026-03-15", el: true), // eliminada: ignorar
    F(9, "Menor", "Ana / Luis", "M1", "2026-04-20"),       // operadores múltiples
};
var r = Calc(baseFilas);
if (args.Contains("--dump-auditoria")) { var i1 = Array.IndexOf(args, "--dump-auditoria"); var okA = EvaluacionOperadoresAuditoria.Cargar(args[i1 + 1]); File.WriteAllText(args[i1 + 2], JsonSerializer.Serialize(new { ok = true, data = new { disponible = okA.disponible, auditoria = okA.data } }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase })); return 0; }
if (args.Contains("--dump")) { var i0 = Array.IndexOf(args, "--dump"); string? A(int k) => args.Length > i0 + k && args[i0 + k] != "-" ? args[i0 + k] : null; var rr = Calc(baseFilas, A(2) is { } a1 ? int.Parse(a1) : null, A(3) is { } m1 ? int.Parse(m1) : null, A(4), A(5)); File.WriteAllText(args[i0 + 1], JsonSerializer.Serialize(new { ok = true, data = rr })); return 0; }
var t = r.GetProperty("totales");
Check("Eliminadas no cuentan (universo=8)", r.GetProperty("universoTotal").GetInt32() == 8);
Check("Registradas=8, evaluables=4, excluidas=4", t.GetProperty("registradas").GetInt32() == 8 && t.GetProperty("evaluables").GetInt32() == 4 && t.GetProperty("excluidas").GetInt32() == 4,
    t.ToString());
Check("Puntos = 10+5+1+5 = 21", t.GetProperty("puntos").GetInt32() == 21, t.GetProperty("puntos").ToString());
Check("Niveles evaluables 1/2/1", t.GetProperty("criticas").GetInt32() == 1 && t.GetProperty("mayores").GetInt32() == 2 && t.GetProperty("menores").GetInt32() == 1);
Check("Sin operador identificable = 2 (vacío + múltiple)", t.GetProperty("sinOperadorIdentificable").GetInt32() == 2);
Check("Sin máquina = 1, sin fecha = 1, sin nivel = 1",
    t.GetProperty("sinMaquina").GetInt32() == 1 && t.GetProperty("sinFechaFabricacion").GetInt32() == 1 && t.GetProperty("sinNivelClasificado").GetInt32() == 1);
Check("Puntos excluidos = 1 (menor sin op) + 5 (sin fecha) + 1 (múltiple) = 7", t.GetProperty("puntosExcluidos").GetInt32() == 7, t.GetProperty("puntosExcluidos").ToString());
var ops = r.GetProperty("porOperador");
Check("Variantes de escritura se agrupan (2 operadores)", ops.GetArrayLength() == 2);
Check("Orden alfabético (no por puntos)", ops[0].GetProperty("operador").GetString() == "Ana Perez");
Check("Datos insuficientes (<30)", r.GetProperty("datosInsuficientes").GetBoolean());
var codigos = r.GetProperty("advertencias").EnumerateArray().Select(a => a.GetProperty("codigo").GetString()).ToHashSet();
Check("Advertencias esperadas", new[] { "operador_no_identificado", "maquina_no_identificada", "sin_fecha_fabricacion", "nivel_sin_clasificar", "atribucion_no_confirmada", "datos_insuficientes" }.All(codigos.Contains));

// ---- Filtros combinados y período por fecha de fabricación
var rMar = Calc(baseFilas, 2026, 3);
Check("Filtro año+mes=marzo: 2 registradas, 15 puntos", rMar.GetProperty("totales").GetProperty("registradas").GetInt32() == 2 && rMar.GetProperty("totales").GetProperty("puntos").GetInt32() == 15);
Check("Con período activo, sin fecha se informa aparte", rMar.GetProperty("advertencias").EnumerateArray().Any(a => a.GetProperty("codigo").GetString() == "sin_fecha_fuera_del_periodo"));
var rOp = Calc(baseFilas, null, null, null, "luis soto");
Check("Filtro operador (insensible a mayúsculas): 3 registradas, 2 evaluables", rOp.GetProperty("totales").GetProperty("registradas").GetInt32() == 3 && rOp.GetProperty("totales").GetProperty("evaluables").GetInt32() == 2);
var rCombo = Calc(baseFilas, 2026, 4, "M2", "Luis Soto");
Check("Filtros combinados año+mes+máquina+operador: 2 registradas, 1 evaluable", rCombo.GetProperty("totales").GetProperty("registradas").GetInt32() == 2 && rCombo.GetProperty("totales").GetProperty("evaluables").GetInt32() == 1);
Check("Evolución mensual ignora el filtro de mes", Calc(baseFilas, 2026, 3).GetProperty("porMes").GetArrayLength() == 2);
Check("Filtro sin coincidencias → 0 registradas (no error)", Calc(baseFilas, 2030, null).GetProperty("totales").GetProperty("registradas").GetInt32() == 0);
Check("Opciones de filtro: años/máquinas/operadores",
    r.GetProperty("opciones").GetProperty("anios")[0].GetInt32() == 2026 && r.GetProperty("opciones").GetProperty("maquinas").GetArrayLength() == 2 && r.GetProperty("opciones").GetProperty("operadores").GetArrayLength() == 2);
Check("Lista vacía → universo 0", Calc(new List<NcFila>()).GetProperty("universoTotal").GetInt32() == 0);

// ---- Suficiencia de datos
var muchas = Enumerable.Range(1, 40).Select(i => F(i, "Menor", "Op" + (i % 4), "M1", "2026-05-0" + (1 + i % 9))).ToList();
Check("≥30 evaluables → datos suficientes", !Calc(muchas).GetProperty("datosInsuficientes").GetBoolean());

// ---- Parser de la respuesta de la API
var body = "{\"success\":true,\"data\":{\"items\":[{\"id\":1,\"nivel\":\"Mayor\",\"operador\":\"X\",\"maquina\":\"M\",\"fechaFabricacion\":\"2026-03-01T00:00:00\",\"eliminado\":false,\"otro\":\"ignorado\"}]}}";
Check("Parser OK", EvaluacionOperadoresParser.TryParseFilas(body, out var filas, out _) && filas.Count == 1 && filas[0].Nivel == "Mayor");
Check("Parser: fecha ISO con hora", EvaluacionOperadoresCalculator.TryParseFecha("2026-03-01T00:00:00", out var d) && d.Month == 3);
Check("Parser: error de API", !EvaluacionOperadoresParser.TryParseFilas("{\"success\":false,\"message\":\"Sesión expirada\"}", out _, out var err) && err == "Sesión expirada");
Check("Parser: listado truncado (total > items) se rechaza", !EvaluacionOperadoresParser.TryParseFilas("{\"success\":true,\"data\":{\"total\":5,\"items\":[{\"id\":1}]}}", out _, out var errT) && errT.Contains("incompleto"));
Check("Parser: total coincide → OK", EvaluacionOperadoresParser.TryParseFilas("{\"success\":true,\"data\":{\"total\":1,\"items\":[{\"id\":1}]}}", out var fOk, out _) && fOk.Count == 1);
Check("Parser: JSON inválido", !EvaluacionOperadoresParser.TryParseFilas("no es json", out _, out _));

// ---- Autorización (PermisosService real)
var p = new PermisosService();
const string Acc = "evaluacionOperadores.resumen";
Check("Sin sesión → rechazada", p.ValidarAccion(Acc, "evaluacion-operadores") != null);
p.Establecer("INNPACK", "CALIDAD", new());
Check("INNPACK sin permiso (por defecto) → SIN_ACCESO", p.NivelEfectivo("evaluacion-operadores") == "SIN_ACCESO");
Check("Sin permiso: rechazada con su módulo", p.ValidarAccion(Acc, "evaluacion-operadores") != null);
Check("Sin permiso: rechazada aunque venga con _modulo de otro módulo", p.ValidarAccion(Acc, "inicio") != null);
Check("Sin permiso: no figura en el menú (nivel)", p.NivelesEfectivos()["evaluacion-operadores"] == "SIN_ACCESO");
p.Establecer("INNPACK", "CALIDAD", new() { ["evaluacion-operadores"] = "VER" });
Check("Con VER: lectura permitida", p.ValidarAccion(Acc, "evaluacion-operadores") == null);
Check("Con VER: menú visible", p.NivelesEfectivos()["evaluacion-operadores"] == "VER");
Check("Con VER: cualquier escritura del módulo rechazada", p.ValidarAccion("evaluacionOperadores.guardar", "evaluacion-operadores") != null);
p.Establecer("INNPACK", "CALIDAD", new() { ["evaluacion-operadores"] = "EDITAR" });
Check("Con EDITAR: igualmente sin escrituras (sin prefijos de escritura)", p.ValidarAccion("evaluacionOperadores.guardar", "evaluacion-operadores") != null);
p.Establecer("INNPACK", "ADMIN_TI", new());
Check("ADMIN_TI: acceso", p.ValidarAccion(Acc, "evaluacion-operadores") == null);
p.Establecer("FARET", "ADMIN_TI", new());
Check("Empresa FARET: acción rechazada (solo INNPACK)", p.ValidarAccion(Acc, "evaluacion-operadores") != null);
Check("Empresa FARET: módulo ausente del menú", !p.NivelesEfectivos().ContainsKey("evaluacion-operadores"));
Check("EsLectura(evaluacionOperadores.resumen)", PermisosService.EsLectura(Acc));

// ---- Fase 29: matriz de acceso del piloto (default-deny, sin ampliar roles)
foreach (var rolP in new[] { "ADMIN", "CALIDAD", "INSPECTOR", "CONSULTA", "OPERADOR", "SUPERVISOR", "", "admin_ti_falso" })
{
    p.Establecer("INNPACK", rolP, new());
    Check($"Piloto: rol '{rolP}' sin permiso personalizado → SIN_ACCESO", p.NivelEfectivo("evaluacion-operadores") == "SIN_ACCESO");
    Check($"Piloto: rol '{rolP}' sin permiso → acción rechazada", p.ValidarAccion(Acc, "evaluacion-operadores") != null);
    Check($"Piloto: rol '{rolP}' sin permiso → auditoría rechazada", p.ValidarAccion("evaluacionOperadores.auditoria.resumen", "evaluacion-operadores") != null);
}
p.Establecer("INNPACK", "CALIDAD", new() { ["evaluacion-operadores"] = "SIN_ACCESO" });
Check("Piloto: permiso personalizado SIN_ACCESO → rechazada", p.ValidarAccion(Acc, "evaluacion-operadores") != null);
p.Establecer("INNPACK", "CALIDAD", new() { ["evaluacion-operadores"] = "CUALQUIER_COSA" });
Check("Piloto: nivel personalizado inválido no concede acceso", p.ValidarAccion(Acc, "evaluacion-operadores") != null);
p.Establecer("INNPACK", "CALIDAD", new() { ["otro-modulo"] = "EDITAR" });
Check("Piloto: EDITAR en otro módulo no concede este", p.ValidarAccion(Acc, "evaluacion-operadores") != null);
p.Establecer("INNPACK", "CALIDAD", new() { ["evaluacion-operadores"] = "VER" });
Check("Piloto: usuario con VER no tiene nivel EDITAR (sin nombres reales)", p.NivelEfectivo("evaluacion-operadores") == "VER");
p.Limpiar();
Check("Piloto: tras cerrar sesión (Limpiar) → rechazada", p.ValidarAccion(Acc, "evaluacion-operadores") != null);
Check("Piloto: tras cerrar sesión → sin niveles", p.NivelesEfectivos().Count == 0);

// ---- Privacidad: seudónimos para quien no puede ver nombres
{
    var filasP = new List<NcFila>
    {
        F(1, "Mayor", "Ana Perez", "M1", "2026-03-10"),
        F(2, "Menor", "ANA  PEREZ", "M1", "2026-03-11"),
        F(3, "Menor", "", "M1", "2026-03-12"),
        F(4, "Menor", "Ana / Luis", "M1", "2026-03-13"),
        F(5, "Menor", "N/A", "M1", "2026-03-14"),
    };
    var ocultas = EvaluacionOperadoresAuditoria.AplicarPrivacidad(filasP, false);
    Check("Privacidad: mismo nombre (otra escritura) → mismo seudónimo",
        ocultas[0].Operador == ocultas[1].Operador && ocultas[0].Operador!.StartsWith("OP-") && ocultas[0].Operador!.Length == 9);
    Check("Privacidad: el nombre real no aparece", !ocultas.Any(f => (f.Operador ?? "").Contains("Perez", StringComparison.OrdinalIgnoreCase)));
    Check("Privacidad: vacío/múltiple/genérico conservan su clasificación",
        EvaluacionOperadoresCalculator.ClasificarOperador(ocultas[2].Operador) == "vacio" &&
        EvaluacionOperadoresCalculator.ClasificarOperador(ocultas[3].Operador) == "multiple" &&
        EvaluacionOperadoresCalculator.ClasificarOperador(ocultas[4].Operador) == "generico");
    Check("Privacidad: con permiso de nombres se conservan", EvaluacionOperadoresAuditoria.AplicarPrivacidad(filasP, true)[0].Operador == "Ana Perez");
    var calcOculto = Calc(ocultas);
    var nombresSalida = string.Join("|", calcOculto.GetProperty("porOperador").EnumerateArray().Select(x => x.GetProperty("operador").GetString()));
    Check("Privacidad: la salida del cálculo solo trae seudónimos",
        !nombresSalida.Contains("Perez", StringComparison.OrdinalIgnoreCase) && nombresSalida.StartsWith("OP-"));
    var seud = EvaluacionOperadoresAuditoria.Seudonimo("Ana Perez");
    Check("Privacidad: el filtro por operador funciona con el seudónimo mostrado", Calc(ocultas, op: seud).GetProperty("totales").GetProperty("registradas").GetInt32() == 2);
}

// ---- Auditoría histórica (resumen local agregado)
{
    const string snap = """
    {"version":1,"generado":"2026-11-10 16:00","fuente":"x","aliasValidadosAplicados":0,
     "cobertura":{"meses":35,"desde":"2024-01-02","hasta":"2026-11-10","sesiones":71224,"operadoresMaxMes":84,"sinOperador":0,"operadorGenerico":0,"fechasInvertidas":8,"filasIgualSesiones":true},
     "resumen":{"total_nc_analizadas":191,"nc_eliminadas_excluidas":11,
       "PRODUCTO":{"nc":7,"np_presente_en_fps":7,"confirmada":0,"probable":4,"no_atribuible":3},
       "INTERNA":{"nc":184,"np_presente_en_fps":164,"confirmada":0}},
     "ncProducto":[
       {"id":"7","nivelNc":"MAYOR","np":"3813","llave":"NV","fechaFabricacion":"2026-06-03","maquina":"M1","sesionesNp":38,"operadoresNp":11,"periodoNp":"a..b","fechaEnPeriodoNp":"SI","participantesEnMaquinaYFecha":1,"atribucion":"PROBABLE","razones":["varios_participantes"],"puntosConfirmados":5,"operadorNombre":"Ana Perez"},
       {"id":"8","nivelNc":"MENOR","np":"1","llave":"NP","atribucion":"INVENTADA","razones":[],"puntosConfirmados":9}]}
    """;
    var ok = EvaluacionOperadoresAuditoria.TryLeer(snap, out var dAud, out _);
    var jAud = J(dAud!);
    Check("Auditoría: se lee y valida", ok && jAud.GetProperty("producto").GetProperty("nc").GetInt32() == 7 && jAud.GetProperty("cobertura").GetProperty("meses").GetInt32() == 35);
    var txtAud = jAud.GetRawText();
    Check("Auditoría: campos no esperados (nombres) se descartan", !txtAud.Contains("Perez") && !txtAud.Contains("operadorNombre"));
    var ncs = jAud.GetProperty("ncProducto").EnumerateArray().ToList();
    Check("Auditoría: sin atribución CONFIRMADA nunca hay puntos", ncs.All(n => n.GetProperty("puntosConfirmados").GetInt32() == 0));
    Check("Auditoría: atribución desconocida → NO_ATRIBUIBLE", ncs[1].GetProperty("atribucion").GetString() == "NO_ATRIBUIBLE");
    Check("Auditoría: versión distinta se rechaza", !EvaluacionOperadoresAuditoria.TryLeer("{\"version\":3}", out _, out var e2) && e2.Length > 0);
    Check("Auditoría: JSON inválido se rechaza", !EvaluacionOperadoresAuditoria.TryLeer("no json", out _, out _));
    var (disp, _, errAus) = EvaluacionOperadoresAuditoria.Cargar(Path.Combine(Path.GetTempPath(), "no_existe_" + Guid.NewGuid().ToString("N") + ".json"));
    Check("Auditoría: archivo ausente no es error (disponible=false)", !disp && errAus == "");
    var tmp = Path.Combine(Path.GetTempPath(), "evop_aud_" + Guid.NewGuid().ToString("N") + ".json");
    File.WriteAllText(tmp, snap);
    var (disp2, _, err2) = EvaluacionOperadoresAuditoria.Cargar(tmp);
    File.Delete(tmp);
    Check("Auditoría: archivo presente → disponible", disp2 && err2 == "");
    p = new PermisosService();
    p.Establecer("INNPACK", "CALIDAD", new() { ["evaluacion-operadores"] = "VER" });
    Check("Auditoría: acción es lectura permitida con VER", p.ValidarAccion("evaluacionOperadores.auditoria.resumen", "evaluacion-operadores") == null);
    p.Establecer("INNPACK", "CALIDAD", new());
    Check("Auditoría: sin permiso del módulo, rechazada", p.ValidarAccion("evaluacionOperadores.auditoria.resumen", "evaluacion-operadores") != null);
}

// ---- Auditoría v2: trazabilidad y responsabilidad propuesta
{
    const string snap2 = """
    {"version":2,"generado":"2026-11-10 17:00","escenarios":{"1":1,"2":0,"3":1,"4":1},
     "ncDetalle":[
      {"id":"11","nivelNc":"MENOR","np":"3687","llave":"NV","maquinaNc":"Diana VIII","fechaFabricacionNc":"2026-03-31","fechaRegistroNc":"2026-06-22",
       "diasRegistroTrasFabricacion":83,"ots":["1"],"escenario":1,"confianza":"MEDIA","maquinaConfirmada":true,"estadoCalidad":"CONFIRMADA",
       "operadores":[{"operador":"OP-AAAAAA","sesiones":5,"puntosPropuestos":1.0,"nombre":"Ana Perez"}],"puntosAsignados":1.0,"razones":["x"],"evidenciaFaltante":["y"]},
      {"id":"12","escenario":4,"confianza":"ALTA","puntosAsignados":3.5,"operadores":[]},
      {"id":"13","escenario":3,"confianza":"BAJA","puntosSeveridad":5,"operadores":[{"operador":"OP-1","puntosPropuestos":1.67},{"operador":"OP-2","puntosPropuestos":1.67},{"operador":"OP-3","puntosPropuestos":1.66}],"puntosAsignados":5.0}],
     "indicadores":[{"operador":"OP-AAAAAA","participacionNc":3,"propuestaPuntos":1.0,"confirmadaPuntos":9}]}
    """;
    var ok2 = EvaluacionOperadoresAuditoria.TryLeer(snap2, out var d2, out _);
    var j2 = J(d2!);
    var det = j2.GetProperty("ncDetalle").EnumerateArray().ToList();
    Check("Auditoría v2: se lee con detalle por NC", ok2 && det.Count == 3 && det[0].GetProperty("diasRegistroTrasFabricacion").GetInt32() == 83);
    Check("Auditoría v2: nunca CONFIRMADA desde el archivo", det.All(n => n.GetProperty("estadoCalidad").GetString() == "PENDIENTE_VALIDACION_CALIDAD"));
    Check("Auditoría v2: escenario 4 no lleva puntos aunque el archivo los traiga", det[1].GetProperty("puntosAsignados").GetDecimal() == 0m);
    Check("Auditoría v2: reparto 5 entre 3 conserva el total", det[2].GetProperty("operadores").EnumerateArray().Sum(o => o.GetProperty("puntosPropuestos").GetDecimal()) == 5.00m);
    Check("Auditoría v2: confirmada siempre 0", j2.GetProperty("indicadores").EnumerateArray().All(i => i.GetProperty("confirmadaPuntos").GetDecimal() == 0m));
    Check("Auditoría v2: sin nombres", !j2.GetRawText().Contains("Perez"));
}

// ---- Auditoría v2 (fase 25): OT, sesiones y documento
{
    const string snap3 = """
    {"version":2,"generado":"x","escenarios":{"1":1},
     "ncDetalle":[{"id":"7","escenario":3,"confianza":"BAJA","aliasSugerido":true,"puntosAsignados":5.0,
       "documento":{"np":"22194","estado":"Produccion","ingreso":"2026-04-14","entrega":"2026-05-04","enMaestro":true,"cliente":"SECRETO"},
       "otDetalle":[{"ot":"12219410130","proceso":"TERMOFORMADO","sesiones":21,"operadores":3,"cantidad":268300,"desde":"2026-05-19 07:00","hasta":"2026-11-05 10:00","sesionesLargas":2,"maquinas":["DISCOVER CILINDRICA (SFM)"]}],
       "operadores":[{"operador":"OP-1","sesiones":2,"puntosPropuestos":5.0,"ots":["12219410130"],"procesos":["TERMOFORMADO"],"sesionesLargas":1,
          "sesionesDetalle":[{"ot":"12219410130","proceso":"TERMOFORMADO","maquina":"M","inicio":"2026-05-19 07:00","fin":"2026-05-20 07:00","cantidad":10,"larga":true,"editadoPorOtro":true,"comentario":true,"nombre":"Ana Perez"}]}]}]}
    """;
    var okF = EvaluacionOperadoresAuditoria.TryLeer(snap3, out var dF, out _);
    var jF = J(dF!);
    var nF = jF.GetProperty("ncDetalle").EnumerateArray().First();
    Check("Fase 25: documento, OT y alias sugerido se leen", okF && nF.GetProperty("aliasSugerido").GetBoolean() && nF.GetProperty("documento").GetProperty("enMaestro").GetBoolean() && nF.GetProperty("otDetalle").GetArrayLength() == 1);
    var o1 = nF.GetProperty("operadores").EnumerateArray().First();
    Check("Fase 25: detalle de sesiones con banderas", o1.GetProperty("sesionesDetalle").EnumerateArray().First().GetProperty("larga").GetBoolean() && o1.GetProperty("sesionesDetalle").EnumerateArray().First().GetProperty("editadoPorOtro").GetBoolean() && o1.GetProperty("sesionesLargas").GetInt32() == 1);
    Check("Fase 25: campos no previstos (cliente, nombre) se descartan", !jF.GetRawText().Contains("SECRETO") && !jF.GetRawText().Contains("Perez"));
}

// ---- Auditoría v2 (fase 26): equivalencia, contradicciones y motivo por participante
{
    const string snap4 = """
    {"version":2,"generado":"x",
     "ncDetalle":[{"id":"7","escenario":3,"confianza":"BAJA","puntosAsignados":5.0,"contradicciones":["La fecha no coincide"],"fechaUsadaParaAcotar":false,
       "equivalencia":{"estado":"INVENTADA","nc":"Discover","fps":"DISCOVER CILINDRICA","detalle":"d"},
       "operadores":[{"operador":"OP-1","estado":"PROPUESTO","motivo":"Operó la misma máquina","puntosPropuestos":5.0}],
       "participantesContexto":[{"operador":"OP-2","estado":"EXCLUIDO","motivo":"Solo operó otra máquina"},{"operador":"OP-3","estado":"X","motivo":"m"}]},
      {"id":"8","escenario":4,"equivalencia":{"estado":"SUGERIDA","nc":"a","fps":"b","detalle":"c"}}]}
    """;
    var ok5 = EvaluacionOperadoresAuditoria.TryLeer(snap4, out var d5, out _);
    var j5 = J(d5!);
    var n5 = j5.GetProperty("ncDetalle").EnumerateArray().ToList();
    Check("Fase 26: estado de equivalencia desconocido → NINGUNA", ok5 && n5[0].GetProperty("equivalencia").GetProperty("estado").GetString() == "NINGUNA" && n5[1].GetProperty("equivalencia").GetProperty("estado").GetString() == "SUGERIDA");
    Check("Fase 26: contradicciones y motivos por participante", n5[0].GetProperty("contradicciones").GetArrayLength() == 1 && n5[0].GetProperty("participantesContexto").EnumerateArray().First().GetProperty("estado").GetString() == "EXCLUIDO");
    Check("Fase 26: estado de participante desconocido → CONTEXTO", n5[0].GetProperty("participantesContexto").EnumerateArray().Last().GetProperty("estado").GetString() == "CONTEXTO");
    Check("Fase 26: las fechas de la NC no acotan (flag leído)", !n5[0].GetProperty("fechaUsadaParaAcotar").GetBoolean());
}

// ---- Auditoría v2 (fase 26b): operador declarado y proceso
{
    const string snap5 = """
    {"version":2,"generado":"x","ncDetalle":[
      {"id":"6","escenario":1,"declarado":{"estado":"CORROBORADO","operador":"OP-AB12CD","nombre":"Cesar Sepulveda"},"procesoNc":"Termoformado","procesoCoincide":true},
      {"id":"11","escenario":4,"declarado":{"estado":"INVENTADO","operador":"OP-1"},"procesoNc":"Pegado","procesoCoincide":false},
      {"id":"15","escenario":4}]}
    """;
    var ok6 = EvaluacionOperadoresAuditoria.TryLeer(snap5, out var d6, out _);
    var j6 = J(d6!);
    var n6 = j6.GetProperty("ncDetalle").EnumerateArray().ToList();
    Check("Fase 26b: operador declarado corroborado y proceso se leen", ok6 && n6[0].GetProperty("declarado").GetProperty("estado").GetString() == "CORROBORADO" && n6[0].GetProperty("procesoCoincide").GetBoolean());
    Check("Fase 26b: estado desconocido → SIN_DECLARAR; sin comparación de proceso → null", n6[1].GetProperty("declarado").GetProperty("estado").GetString() == "SIN_DECLARAR" && !n6[1].GetProperty("procesoCoincide").GetBoolean() && n6[2].GetProperty("procesoCoincide").ValueKind == System.Text.Json.JsonValueKind.Null);
    Check("Fase 26b: el nombre del operador declarado nunca sale", !j6.GetRawText().Contains("Sepulveda"));
}

// ---- Auditoría v2 (fase 27): conciliación Calidad <-> FPS
{
    const string snap6 = """
    {"version":2,"generado":"x","ncDetalle":[
      {"id":"12","escenario":4,"declarado":{"estado":"FUERA_DE_PRODUCTO","operador":"OP-AB12CD","exclusivo":false},
       "producto":{"codigo":"4484004519344","estado":"CONFIRMADA","detalle":"ok","sesiones":5,"operadores":["OP-E3A681","Perez Juan Nombre Largo Sospechoso"]},
       "variantesNombre":[{"operador":"OP-755E1B","tipo":"INVENTADO","procesos":["CORRUGADO"]}],
       "alternativaFps":{"base":"producto","nota":"n","cuentaEnTotales":true,"operadores":[{"operador":"OP-E3A681","puntosHipoteticos":1.0}]},
       "conciliacion":{"estado":"DISCREPANCIA","dimensiones":[{"dimension":"operador","estado":"RARO","calidad":"Declarado OP-AB12CD","fps":"OP-E3A681","detalle":"d"}]},
       "apoyoUnicoNombreDeclarado":true},
      {"id":"15","escenario":4}]}
    """;
    var ok7 = EvaluacionOperadoresAuditoria.TryLeer(snap6, out var d7, out _);
    var n7 = J(d7!).GetProperty("ncDetalle").EnumerateArray().ToList();
    Check("Fase 27: producto, conciliación y alternativa se leen", ok7 && n7[0].GetProperty("producto").GetProperty("estado").GetString() == "CONFIRMADA" && n7[0].GetProperty("conciliacion").GetProperty("estado").GetString() == "DISCREPANCIA");
    Check("Fase 27: estado de dimensión desconocido → INSUFICIENTE", n7[0].GetProperty("conciliacion").GetProperty("dimensiones")[0].GetProperty("estado").GetString() == "INSUFICIENTE");
    Check("Fase 27: la alternativa FPS nunca cuenta en totales", !n7[0].GetProperty("alternativaFps").GetProperty("cuentaEnTotales").GetBoolean());
    Check("Fase 27: tipo de variante desconocido → APELLIDO_COINCIDE y estado FUERA_DE_PRODUCTO se conserva", n7[0].GetProperty("variantesNombre")[0].GetProperty("tipo").GetString() == "APELLIDO_COINCIDE" && n7[0].GetProperty("declarado").GetProperty("estado").GetString() == "FUERA_DE_PRODUCTO");
    Check("Fase 27: NC sin conciliación → null y producto vacío", n7[1].GetProperty("conciliacion").ValueKind == System.Text.Json.JsonValueKind.Null && n7[1].GetProperty("producto").GetProperty("estado").GetString() == "INSUFICIENTE");
    Check("Fase 27: textos largos se recortan (sin nombres completos)", n7[0].GetProperty("producto").GetProperty("operadores")[1].GetString()!.Length <= 12);
}

// ---- Auditoría v2 (fase 27b): evidencia ampliada
{
    const string snap7 = """
    {"version":2,"generado":"x","ncDetalle":[
      {"id":"11","escenario":4,"evidenciaAmpliada":{"fechaRegistro":"2026-06-22","lectura":"Hipótesis no verificada","declaradoOperabaAlRegistrar":true,
        "operadoresEnFechaRegistro":[{"operador":"OP-2AAA25","sesiones":3,"procesos":["PEGADO"]}],
        "productoEnOtrosDocumentos":[{"proceso":"PEGADO","maquina":"DIANA 8 (SFM)","mes":"2025-09","sesiones":7,"operadores":["OP-1","Nombre Completo Sospechoso Largo"]}]}},
      {"id":"12","escenario":4}]}
    """;
    var ok8 = EvaluacionOperadoresAuditoria.TryLeer(snap7, out var d8, out _);
    var n8 = J(d8!).GetProperty("ncDetalle").EnumerateArray().ToList();
    var ea8 = n8[0].GetProperty("evidenciaAmpliada");
    Check("Fase 27b: evidencia ampliada se lee", ok8 && ea8.GetProperty("declaradoOperabaAlRegistrar").GetBoolean() && ea8.GetProperty("operadoresEnFechaRegistro").GetArrayLength() == 1);
    Check("Fase 27b: nombres largos se recortan y NC sin evidencia → null", ea8.GetProperty("productoEnOtrosDocumentos")[0].GetProperty("operadores")[1].GetString()!.Length <= 12 && n8[1].GetProperty("evidenciaAmpliada").ValueKind == System.Text.Json.JsonValueKind.Null);
}

// ---- Auditoría v2 (fase 28): catálogo de máquinas
{
    const string snap8 = """
    {"version":2,"generado":"x","equivalenciasMaquinas":[
       {"maquinaCalidad":"Diana VIII","estado":"EXACTA","idFps":"65","maquinaFps":"DIANA 8 (SFM)","proceso":"PEGADO","ncs":["11","15"],"pendientes":["NC 15: sin sesiones"]},
       {"maquinaCalidad":"X","estado":"INVENTADO","ncs":[]}],
     "ncDetalle":[{"id":"15","escenario":4,"maquinaCatalogoSinSesiones":true,"catalogo":{"estado":"EXACTA","id":"65","nombre":"DIANA 8 (SFM)","grupo":"PEGADO"},
        "equivalencia":{"estado":"CATALOGO","nc":"Diana VIII","fps":"DIANA 8 (SFM)","detalle":"d"}},
       {"id":"16","escenario":4,"equivalencia":{"estado":"OTRO"}}]}
    """;
    var ok9 = EvaluacionOperadoresAuditoria.TryLeer(snap8, out var d9, out _);
    var j9 = J(d9!);
    var q9 = j9.GetProperty("equivalenciasMaquinas").EnumerateArray().ToList();
    var nn9 = j9.GetProperty("ncDetalle").EnumerateArray().ToList();
    Check("Fase 28: equivalencias del catálogo se leen", ok9 && q9[0].GetProperty("idFps").GetString() == "65" && q9[0].GetProperty("pendientes").GetArrayLength() == 1);
    Check("Fase 28: estado de catálogo desconocido → NINGUNA", q9[1].GetProperty("estado").GetString() == "NINGUNA");
    Check("Fase 28: estado CATALOGO de equivalencia se conserva; otro → NINGUNA", nn9[0].GetProperty("equivalencia").GetProperty("estado").GetString() == "CATALOGO" && nn9[1].GetProperty("equivalencia").GetProperty("estado").GetString() == "NINGUNA");
    Check("Fase 28: máquina confirmada sin sesiones no genera puntos", nn9[0].GetProperty("maquinaCatalogoSinSesiones").GetBoolean() && nn9[0].GetProperty("puntosAsignados").GetDecimal() == 0m);
}

// ==== Fase 31: Faret (datos sintéticos; el bloque con datos reales es opcional y no se versiona) ====
{
    // ---- Parser de Data Faret (GET api/importaciones/pnc)
    var pagina = """
    {"success":true,"message":"ok","data":{"totalCount":3,"items":[
      {"id":10,"nivel":"Crítico","operador":"Juan Soto","maquina":"Heidelberg 1","area":"Impresión","fechaFabricacion":"2026-10-05T00:00:00","npNv":"NV 1234","cliente":"X"},
      {"id":11,"nivel":"Mayor","operador":"juan  soto","maquina":"Heidelberg 1","area":"Impresión","fechaFabricacion":"2026-10-20","npNv":"NV 1235"},
      {"id":12,"nivel":"Menor","operador":"","maquina":null,"area":"Pegado","fechaFabricacion":null,"npNv":"NV 1236"}]}}
    """;
    var okP = FaretEvaluacionOperadoresParser.TryParsePagina(pagina, out var filasF, out var totF, out _);
    Check("Faret parser: 3 filas, totalCount 3", okP && filasF.Count == 3 && totF == 3);
    Check("Faret parser: proyecta área y NP/NV, nunca eliminado", filasF[0].Area == "Impresión" && filasF[0].Referencia == "NV 1234" && filasF.All(f => !f.Eliminado));
    Check("Faret parser: success=false → error con mensaje de la API",
        !FaretEvaluacionOperadoresParser.TryParsePagina("""{"success":false,"message":"Token expirado"}""", out _, out _, out var errF) && errF == "Token expirado");
    Check("Faret parser: 401 sin cuerpo JSON → false", !FaretEvaluacionOperadoresParser.TryParsePagina("", out _, out _, out _));
    Check("Faret parser: sin items → false", !FaretEvaluacionOperadoresParser.TryParsePagina("""{"success":true,"data":{}}""", out _, out _, out _));

    var rF = J(EvaluacionOperadoresCalculator.Calcular(filasF, new EvaluacionFiltros(null, null, null, null)));
    Check("Faret cálculo: 2 evaluables (operador agrupado), 15 puntos", rF.GetProperty("totales").GetProperty("evaluables").GetInt32() == 2 && rF.GetProperty("totales").GetProperty("puntos").GetInt32() == 15);
    Check("Faret cálculo: opciones de área", rF.GetProperty("opciones").GetProperty("areas").GetArrayLength() == 2);
    Check("Faret cálculo: sin operador elegido no se envía detalle", rF.GetProperty("detalle").ValueKind == JsonValueKind.Null);
    var rArea = J(EvaluacionOperadoresCalculator.Calcular(filasF, new EvaluacionFiltros(null, null, null, null, "pegado")));
    Check("Faret cálculo: filtro de área (insensible a mayúsculas) → 1 registrada, 0 evaluables", rArea.GetProperty("totales").GetProperty("registradas").GetInt32() == 1 && rArea.GetProperty("totales").GetProperty("evaluables").GetInt32() == 0);
    var rDet = J(EvaluacionOperadoresCalculator.Calcular(filasF, new EvaluacionFiltros(2026, 10, null, "JUAN SOTO")));
    var det = rDet.GetProperty("detalle");
    Check("Faret cálculo: detalle trazable con operador elegido (2 registros, NP/NV e id)", det.GetArrayLength() == 2 && det[0].GetProperty("referencia").GetString() == "NV 1235" && det[0].GetProperty("id").GetInt32() == 11);
    var privF = EvaluacionOperadoresAuditoria.AplicarPrivacidad(filasF, false);
    Check("Faret privacidad: con VER el operador sale seudonimizado y el área se conserva", privF[0].Operador!.StartsWith("OP-") && privF[0].Area == "Impresión");
    Check("INNPACK sin área: NcFila de 6 campos sigue funcionando (compatibilidad)", Calc(new[] { F(1, "Crítico", "Ana", "M1", "2026-01-01") }).GetProperty("totales").GetProperty("puntos").GetInt32() == 10);

    // ---- Permisos del módulo Faret
    var pf = new PermisosService();
    const string AccF = "faret.evaluacionOperadores.resumen";
    Check("Faret: sin sesión → rechazada", pf.ValidarAccion(AccF, "faret-evaluacion-operadores") != null);
    foreach (var rolF in new[] { "ADMIN", "CALIDAD", "INSPECTOR", "CONSULTA" })
    {
        pf.Establecer("FARET", rolF, new());
        Check($"Faret: rol {rolF} sin permiso → SIN_ACCESO y acción rechazada",
            pf.NivelEfectivo("faret-evaluacion-operadores") == "SIN_ACCESO" && pf.ValidarAccion(AccF, "faret-evaluacion-operadores") != null);
    }
    pf.Establecer("FARET", "CALIDAD", new());
    Check("Faret: sin permiso, aunque venga con _modulo de otro módulo → rechazada", pf.ValidarAccion(AccF, "faret-nc") != null);
    pf.Establecer("FARET", "CALIDAD", new() { ["faret-evaluacion-operadores"] = "VER" });
    Check("Faret: VER → lectura permitida", pf.ValidarAccion(AccF, "faret-evaluacion-operadores") == null);
    Check("Faret: VER → escritura rechazada", pf.ValidarAccion("faret.evaluacionOperadores.guardar", "faret-evaluacion-operadores") != null);
    // Fase 32: CONSULTA con VER individual accede solo a este módulo, sin permisos extra.
    pf.Establecer("FARET", "CONSULTA", new() { ["faret-evaluacion-operadores"] = "VER" });
    var nivCons = pf.NivelesEfectivos();
    Check("Faret: CONSULTA + VER → permisos.mios entrega VER (el menú lo muestra)",
        nivCons.TryGetValue("faret-evaluacion-operadores", out var nvc) && nvc == "VER");
    Check("Faret: CONSULTA + VER → lectura permitida en backend", pf.ValidarAccion(AccF, "faret-evaluacion-operadores") == null);
    Check("Faret: CONSULTA + VER → sin nombres (no es EDITAR)", pf.NivelEfectivo("faret-evaluacion-operadores") != "EDITAR");
    Check("Faret: CONSULTA + VER → no gana acceso a Data ni Carga Masiva",
        pf.NivelEfectivo("faret-data") == "SIN_ACCESO" && pf.NivelEfectivo("faret-importacion") == "SIN_ACCESO");
    pf.Establecer("FARET", "CONSULTA", new());
    var nivCons2 = pf.NivelesEfectivos();
    Check("Faret: CONSULTA sin permiso → permisos.mios entrega SIN_ACCESO",
        !nivCons2.TryGetValue("faret-evaluacion-operadores", out var nvc2) || nvc2 == "SIN_ACCESO");
    pf.Establecer("FARET", "CALIDAD", new() { ["faret-evaluacion-operadores"] = "EDITAR" });
    Check("Faret: EDITAR → sin escrituras (módulo sin prefijos)", pf.ValidarAccion("faret.evaluacionOperadores.guardar", "faret-evaluacion-operadores") != null);
    pf.Establecer("FARET", "CALIDAD", new() { ["faret-evaluacion-operadores"] = "OTRO" });
    Check("Faret: nivel desconocido → SIN_ACCESO", pf.NivelEfectivo("faret-evaluacion-operadores") == "SIN_ACCESO");
    pf.Establecer("FARET", "ADMIN_TI", new());
    Check("Faret: ADMIN_TI → EDITAR (ve nombres)", pf.NivelEfectivo("faret-evaluacion-operadores") == "EDITAR" && pf.ValidarAccion(AccF, "faret-evaluacion-operadores") == null);
    pf.Establecer("INNPACK", "ADMIN_TI", new());
    Check("Faret: sesión INNPACK (ADMIN_TI) → acción Faret rechazada", pf.ValidarAccion(AccF, "faret-evaluacion-operadores") != null);
    Check("INNPACK: el módulo INNPACK sigue accesible para ADMIN_TI", pf.ValidarAccion("evaluacionOperadores.resumen", "evaluacion-operadores") == null);
    pf.Establecer("FARET", "ADMIN", new());
    Check("Faret: el resto de módulos no cambia (ADMIN ve faret-nc)", pf.NivelEfectivo("faret-nc") == "EDITAR");

    // ---- Dashboard Faret: definición de "abierta" y críticas
    const string ncsDash = """
    [{"id":1,"codigo":"NC-1","severidad":"ALTA","estado":"ABIERTA","estadoGestion":"CERRADA","sistemaOrigen":"DATA_FARET","origenId":"100","proceso":"Rechazo Cliente","fechaCreacion":"2026-11-11T08:00:00","fechaDeteccion":"2026-11-11T00:00:00"},
     {"id":2,"codigo":"NC-2","severidad":"MEDIA","estado":"ABIERTA","estadoGestion":"PENDIENTE","sistemaOrigen":"DATA_FARET","origenId":"101","proceso":"Cuarentena","fechaCreacion":"0001-01-01T00:00:00","fechaDeteccion":"2026-11-11T00:00:00"},
     {"id":3,"codigo":"NC-3","severidad":"ALTA","estado":"ABIERTA","estadoGestion":"EN_PROCESO","sistemaOrigen":"DATA_FARET","origenId":"999","proceso":"Reclamo","fechaCreacion":"2026-10-01T08:00:00","fechaDeteccion":"2026-10-01T00:00:00"},
     {"id":4,"codigo":"NC-4","severidad":"ALTA","estado":"ABIERTA","estadoGestion":"PENDIENTE","sistemaOrigen":null,"origenId":null,"proceso":"Manual","fechaCreacion":"2026-10-02T08:00:00","fechaDeteccion":"2026-10-02T00:00:00"}]
    """;
    const string dataDash = """
    [{"id":100,"nivel":"Crítico","tipoPnc":"Rechazo Cliente","npNv":"NV 1","cliente":"C1","fechaIngreso":"2026-11-11T00:00:00"},
     {"id":101,"nivel":"Crítico","tipoPnc":"Cuarentena","npNv":"NV 2","cliente":"C2","fechaIngreso":"2026-11-11T00:00:00"},
     {"id":102,"nivel":"Crítico","tipoPnc":"Rechazo Cliente","npNv":"NV 3","cliente":"C3","fechaIngreso":"2026-11-10T00:00:00"},
     {"id":103,"nivel":"Menor","tipoPnc":"Reclamo","npNv":"NV 4","cliente":"C4","fechaIngreso":"2026-11-10T00:00:00"}]
    """;
    var hoyD = new DateTime(2026, 11, 11);
    var dsh = FaretDashboardService.CalcularParaPruebas(ncsDash, dataDash, "[]", hoyD);
    Check("Dashboard: NC vinculada a registro eliminado (origenId 999) se excluye", dsh.Kpis.NcVinculadasAEliminados == 1);
    Check("Dashboard: NC abiertas = gestión no cerrada (NC-2 + NC-4 manual) = 2; la columna legacy 'estado' se ignora", dsh.Kpis.NcAbiertas == 2 && dsh.Kpis.NcCerradas == 1);
    Check("Dashboard: PNC sin gestión = 2 (102, 103)", dsh.Kpis.PncSinGestion == 2);
    Check("Dashboard: pendientes de cierre = 2 + 2 = 4", dsh.Kpis.PncPendientesCierre == 4);
    Check("Dashboard: críticas sin cerrar = 101 (en gestión) + NC-4 (manual ALTA) + 102 (sin gestión) = 3; la 100 cerrada no cuenta",
        dsh.Kpis.CriticasAbiertas == 3 && dsh.Kpis.CriticasEnGestion == 2 && dsh.Kpis.CriticasSinGestion == 1, $"{dsh.Kpis.CriticasAbiertas}/{dsh.Kpis.CriticasEnGestion}/{dsh.Kpis.CriticasSinGestion}");
    Check("Dashboard: detalle de críticas trazable (3 filas)", dsh.CriticasAbiertasDetalle.Count == 3 && dsh.CriticasAbiertasDetalle.Any(c => c.DataId == 102 && c.EstadoGestion == "SIN_GESTION"));
    Check("Dashboard: NC sin fecha_creacion (0001-01-01) se fecha con fecha_deteccion → 2 registradas hoy", dsh.Kpis.NcRegistradasHoy == 2 && dsh.Kpis.NcSinFechaCreacion == 1, $"{dsh.Kpis.NcRegistradasHoy}");
    Check("Dashboard: tendencia de hoy incluye la NC sin fecha_creacion", dsh.TendenciaNc30Dias[^1].Total == 2);
    Check("Dashboard: últimas NC muestran estado de gestión, no el legacy", dsh.UltimasNc.All(u => u.Estado != "ABIERTA"));

    var sinData = FaretDashboardService.CalcularParaPruebas(ncsDash, null, "[]", hoyD);
    Check("Dashboard sin Data: indicadores de Data en null (nunca 0) y DataDisponible=false",
        !sinData.Kpis.DataDisponible && sinData.Kpis.PncSinGestion == null && sinData.Kpis.CriticasAbiertas == null && sinData.Kpis.PncPendientesCierre == null);
    Check("Dashboard sin Data: no se excluyen NC (no se puede comprobar eliminados) y se avisa", sinData.Kpis.NcAbiertas == 3 && sinData.Alertas.Any(a => a.Mensaje.Contains("no disponible")));

    // ---- Opcional: NC reales de Mejora Continua (archivo fuera del repo, ruta por variable de entorno).
    var rutaReal = Environment.GetEnvironmentVariable("FASE31_NC_JSON");
    if (!string.IsNullOrEmpty(rutaReal) && File.Exists(rutaReal))
    {
        var reales = File.ReadAllText(rutaReal);
        var dr = FaretDashboardService.CalcularParaPruebas(reales, null, "[]", DateTime.Today);
        var n = JsonDocument.Parse(reales).RootElement.GetArrayLength();
        Console.WriteLine($"   [real] NC={n} abiertas={dr.Kpis.NcAbiertas} cerradas={dr.Kpis.NcCerradas} sinFechaCreacion={dr.Kpis.NcSinFechaCreacion}");
        Check("Real: NC abiertas + cerradas = total de NC de la API", dr.Kpis.NcAbiertas + dr.Kpis.NcCerradas == n);
    }
}


// ======================================================== Fase 34: atribución técnica con sesiones FPS (sintético)
{
    DateTime D(string s) => DateTime.Parse(s, System.Globalization.CultureInfo.InvariantCulture);
    FaretAtribucionFps.SesionFps S(long rk, long ot, long? maq, string? maqNom, long? op, string? opNom, string ini, string fin, decimal cant = 100, string cat = "CORRUGADO", string? desc = null) =>
        new(rk, rk * 10, ot, cat, "Proceso " + cat, 2, maq, maqNom, desc, op, opNom, D(ini), D(fin), cant);
    var fps = new FaretAtribucionFps.DatosFps();
    fps.Ordenes.Add(new(1001, 1001, null));          // NP Faret 1001
    fps.Ordenes.Add(new(2002, 2002, null));          // NP Faret 2002
    fps.Ordenes.Add(new(3003, 3003, null));          // NP Faret 3003
    fps.Ordenes.Add(new(9999, null, 4004));          // NV Innpack 4004 -> OT 9999
    fps.Ordenes.Add(new(5005, 5005, null));          // 5005 como NP Faret...
    fps.Ordenes.Add(new(6006, null, 5005));          // ...y como NV Innpack en otra OT -> documento ambiguo
    fps.Ordenes.Add(new(7007, 7007, null));          // sin sesiones
    fps.Sesiones.Add(S(1, 1001, 11, "BOB. 104-2", 501, "JUAN PEREZ SOTO", "2026-10-05 08:00:00", "2026-10-05 12:00:00", desc: "BOBST 104-2"));
    fps.Sesiones.Add(S(2, 1001, 12, "DIANA 3", 502, "MARIA ROJAS LAGOS", "2026-10-06 08:00:00", "2026-10-06 10:00:00", cat: "PEGADO"));
    fps.Sesiones.Add(S(3, 2002, 11, "BOB. 104-2", 501, "JUAN PEREZ SOTO", "2026-10-07 08:00:00", "2026-10-07 12:00:00"));
    fps.Sesiones.Add(S(4, 2002, 11, "BOB. 104-2", 503, "PEDRO DIAZ MUNOZ", "2026-10-07 10:00:00", "2026-10-07 14:00:00"));
    fps.Sesiones.Add(S(5, 3003, 13, "IBE.144-2", 501, "JUAN PEREZ SOTO", "2026-10-08 08:00:00", "2026-10-08 14:00:00"));
    fps.Sesiones.Add(S(6, 3003, 13, "IBE.144-2", 504, "ANA SOTO VERA", "2026-10-08 16:00:00", "2026-10-08 22:00:00"));
    fps.Sesiones.Add(S(7, 9999, 14, "PRO - 3", 505, "LUIS CARO PINO", "2026-10-09 09:00:00", "2026-10-09 11:00:00"));
    fps.Sesiones.Add(S(8, 9999, 14, "PRO - 3", 506, "OTRA PERSONA X", "2026-10-09 09:30:00", "2026-10-09 09:30:00", cant: 0));
    fps.Sesiones.Add(S(9, 5005, 11, "BOB. 104-2", 501, "JUAN PEREZ SOTO", "2026-10-10 08:00:00", "2026-10-10 09:00:00"));
    fps.Sesiones.Add(S(10, 6006, 11, "BOB. 104-2", 502, "MARIA ROJAS LAGOS", "2026-10-10 08:00:00", "2026-10-10 09:00:00"));

    FaretAtribucionFps.Resultado A(long id, string np, string? maq, string? fecha, string? decl = null, string? area = null, string nivel = "Crítico") =>
        FaretAtribucionFps.Atribuir(new(id, np, nivel, maq, area, fecha, decl), fps);

    var r1 = A(1, "1001", "Bobst 104-2", "2026-10-05", "Juan Perez");
    Check("FPS: documento + máquina (descripción FPS BOBST 104-2) + día con 1 persona -> CONFIRMADA_TECNICA",
        r1.Estado == FaretAtribucionFps.Confirmada && r1.EstadoMaquina == "EXACTA" && r1.Operadores.Count == 1 && r1.Operadores[0].id == 501, r1.Estado + " " + r1.EstadoMaquina + " " + string.Join("|", r1.Motivos));
    Check("FPS: confirmada recibe puntos provisionales (Crítico=10) e identidad por UserKey", r1.PuntosProvisionales == 10);
    Check("FPS: nombre declarado contenido en el de FPS -> COINCIDE (solo comparación)", r1.Declarado == "COINCIDE", r1.Declarado);
    var r1b = A(2, "1001", "BOB. 104-2", "2026-10-05", "Carlos Vega");
    Check("FPS: declarado distinto no cambia el estado técnico (CONFIRMADA, declarado NO_COINCIDE)",
        r1b.Estado == FaretAtribucionFps.Confirmada && r1b.Declarado == "NO_COINCIDE" && r1b.EstadoMaquina == "EXACTA", $"{r1b.Estado} {r1b.Declarado} {r1b.EstadoMaquina}");
    var r2 = A(3, "2002", "BOB. 104-2", "2026-10-07");
    Check("FPS: dos personas simultáneas -> AMBIGUA, sin puntos, ambas listadas",
        r2.Estado == FaretAtribucionFps.Ambigua && r2.Simultaneas && r2.PuntosProvisionales == 0 && r2.Operadores.Count == 2);
    var r3 = A(4, "3003", "Iberica 144-2", "2026-10-08");
    Check("FPS: máquina por equivalencia (Iberica 144-2 / IBE.144-2); dos personas en turnos distintos -> AMBIGUA con cambio de turno",
        r3.Estado == FaretAtribucionFps.Ambigua && r3.EstadoMaquina == "EQUIVALENTE" && !r3.Simultaneas && r3.CambioTurno && r3.PuntosProvisionales == 0, $"{r3.Estado} sim={r3.Simultaneas} turno={r3.CambioTurno} maq={r3.EstadoMaquina}");
    var r4 = A(5, "4004", "PRO - 3", "2026-10-09");
    Check("FPS: NV Innpack -> OT distinta; marca de 0 min/0 unidades de otra persona se ignora -> CONFIRMADA",
        r4.Estado == FaretAtribucionFps.Confirmada && r4.Documento == "NV_INNPACK" && r4.Ots.SequenceEqual(new long[] { 9999 }) && r4.Operadores.Count == 1, $"{r4.Estado} {r4.Documento} {r4.Operadores.Count}");
    var r5 = A(6, "1001", "BOB. 104-2", "2026-10-20");
    Check("FPS: la máquina no tiene sesiones el día de fabricación -> DISCREPANCIA con contexto", r5.Estado == FaretAtribucionFps.Discrepancia && r5.EstadoFecha == "FUERA" && r5.Contexto.Count > 0 && r5.Operadores.Count == 0);
    var r6 = A(7, "1001", "Martin 2", "2026-10-05");
    Check("FPS: máquina registrada que no aparece en el documento -> DISCREPANCIA", r6.Estado == FaretAtribucionFps.Discrepancia && r6.EstadoMaquina == "NO_EN_DOCUMENTO", r6.EstadoMaquina);
    var r7 = A(8, "1001", "BOB. 104-2", null);
    Check("FPS: sin fecha de fabricación y 1 persona en la máquina -> PROBABLE, sin puntos", r7.Estado == FaretAtribucionFps.Probable && r7.PuntosProvisionales == 0);
    var r8 = A(9, "8888", "BOB. 104-2", "2026-10-05");
    Check("FPS: NP inexistente en FPS -> SIN_ATRIBUCION", r8.Estado == FaretAtribucionFps.SinAtribucion && r8.Documento == "NO_ENCONTRADO");
    var r9 = A(10, "NV-ABC", "BOB. 104-2", "2026-10-05");
    Check("FPS: NP/NV no numérica -> SIN_ATRIBUCION (NO_NUMERICO)", r9.Estado == FaretAtribucionFps.SinAtribucion && r9.Documento == "NO_NUMERICO");
    var r10 = A(11, "5005", "BOB. 104-2", "2026-10-10");
    Check("FPS: número como NP Faret y NV Innpack en OT distintas -> AMBIGUA (no se elige documento)", r10.Estado == FaretAtribucionFps.Ambigua && r10.Documento == "AMBIGUO" && r10.Operadores.Count == 0);
    var r11 = A(12, "7007", "BOB. 104-2", "2026-10-05");
    Check("FPS: orden sin sesiones -> SIN_ATRIBUCION", r11.Estado == FaretAtribucionFps.SinAtribucion);
    var r12 = A(13, "1001", null, "2026-10-06", area: "Pegado");
    Check("FPS: sin máquina, proceso por área (Pegado / PEGADO) con 1 persona -> PROBABLE (no confirmada)", r12.Estado == FaretAtribucionFps.Probable && r12.Operadores.Count == 1 && r12.Operadores[0].id == 502, r12.Estado);
    var r13 = A(14, "1001", null, "2026-10-06", area: "Bodega");
    Check("FPS: sin máquina ni proceso coincidente, 2 personas en el documento -> AMBIGUA sin atribuir", r13.Estado == FaretAtribucionFps.Ambigua && r13.Operadores.Count == 0);
    var rNm = A(20, "1001", "DESPACHO", "2026-10-06", area: "Pegado");
    Check("FPS: valor de Data que no es máquina (DESPACHO) no es discrepancia: se evalúa por proceso/área", rNm.EstadoMaquina == "NO_ES_MAQUINA" && rNm.Estado == FaretAtribucionFps.Probable, rNm.EstadoMaquina + " " + rNm.Estado);
    var rNum = A(21, "1001", "104-2", "2026-10-05");
    Check("FPS: máquina solo con número (104-2) calza con BOB. 104-2 si es única -> EQUIVALENTE", rNum.EstadoMaquina == "EQUIVALENTE" && rNum.Estado == FaretAtribucionFps.Confirmada, rNum.EstadoMaquina);
    fps.Sesiones.Add(S(11, 1001, 15, "EXPERFOLD", 507, "RAUL SOTO", "2026-10-05 08:00:00", "2026-10-05 12:00:00", cat: "PEGADO"));
    var rTipeo = A(22, "1001", "EXPERTFOLD", "2026-10-05");
    Check("FPS: error de tipeo de 1 letra (EXPERTFOLD / EXPERFOLD) calza solo si es único", rTipeo.EstadoMaquina == "EQUIVALENTE" && rTipeo.MaquinaFps == "EXPERFOLD", rTipeo.EstadoMaquina);
    var rNoTipeo = A(23, "1001", "EXPERTFOLX9", "2026-10-05");
    Check("FPS: nombre muy distinto no calza por tipeo -> NO_EN_DOCUMENTO", rNoTipeo.EstadoMaquina == "NO_EN_DOCUMENTO", rNoTipeo.EstadoMaquina);
    Check("FPS: declarado 'TALLER X' -> EXTERNO; iniciales -> NO_COMPARABLE",
        FaretAtribucionFps.CompararDeclarado("TALLER ROJAS", new[] { "JUAN PEREZ" }) == "EXTERNO" && FaretAtribucionFps.CompararDeclarado("J.P.", new[] { "JUAN PEREZ" }) == "NO_COMPARABLE");
    Check("FPS: turno estimado por hora de inicio (A 7-15, B 15-23, C 23-7)",
        FaretAtribucionFps.Turno(D("2026-01-01 07:00")) == "A" && FaretAtribucionFps.Turno(D("2026-01-01 15:00")) == "B" && FaretAtribucionFps.Turno(D("2026-01-01 02:00")) == "C");

    var bodyFps = "{\"ok\":true,\"data\":{\"nps\":[1],\"ordenes\":[{\"OrdenTrabajo\":1,\"NotaVentaFaret\":\"1\",\"NotaVentaInnpack\":null}],\"sesiones\":[{\"RecordKey\":\"10\",\"IdProceso\":5,\"OrdenTrabajo\":1,\"Categoria\":\"PEGADO\",\"NombreProceso\":\"P\",\"Status\":2,\"IdMaquina\":3,\"Maquina\":\"M\",\"MaquinaDescripcion\":\"MD\",\"IdOperador\":\"77\",\"Operador\":\"X Y\",\"SetupStartDate\":null,\"ProductionStartDate\":\"2026-10-05 08:00:00\",\"ProductionEndDate\":\"2026-10-05 09:00:00\",\"ProductionQuantity\":\"12.5\"}]}}";
    var dp = new FaretAtribucionFps.DatosFps();
    Check("FPS: parser acepta BIGINT como string y fechas 'yyyy-MM-dd HH:mm:ss'",
        FaretAtribucionFps.TryParseRespuesta(bodyFps, dp, out _) && dp.Sesiones[0].IdOperador == 77 && dp.Sesiones[0].RecordKey == 10 && dp.Sesiones[0].Cantidad == 12.5m && dp.Sesiones[0].Inicio == D("2026-10-05 08:00:00") && dp.Ordenes[0].NotaVentaFaret == 1);
    Check("FPS: parser rechaza ok:false con su mensaje", !FaretAtribucionFps.TryParseRespuesta("{\"ok\":false,\"message\":\"FPS no disponible\"}", new FaretAtribucionFps.DatosFps(), out var em) && em == "FPS no disponible");

    var todos = new List<FaretAtribucionFps.Resultado> { r1, r1b, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13 };
    var sinF = new FiltrosFps(null, null, null, null, null, null);
    var ver = J(FaretEvaluacionFpsResumen.Construir(todos, sinF, false));
    var txtVer = ver.GetRawText();
    Check("Resumen VER: sin nombres reales de FPS ni nombre declarado", !txtVer.Contains("JUAN PEREZ") && !txtVer.Contains("Carlos Vega") && txtVer.Contains("OP-"));
    Check("Resumen VER: claves de operador también seudónimas (no expone UserKey)", ver.GetProperty("operadores").EnumerateArray().All(o => o.GetProperty("clave").GetString()!.StartsWith("OP-")));
    var edi = J(FaretEvaluacionFpsResumen.Construir(todos, sinF, true));
    Check("Resumen EDITAR: nombres visibles", edi.GetRawText().Contains("JUAN PEREZ SOTO"));
    var est = edi.GetProperty("totales").GetProperty("porEstado");
    Check("Resumen: conteo por estado suma el universo (5 estados, nunca mezclados)",
        FaretAtribucionFps.Estados.Sum(e => est.GetProperty(e).GetInt32()) == todos.Count && est.GetProperty("CONFIRMADA_TECNICA").GetInt32() == 3, est.GetRawText());
    var juan = edi.GetProperty("operadores").EnumerateArray().First(o => o.GetProperty("clave").GetString() == "501");
    Check("Resumen: puntos provisionales solo de confirmadas con 1 persona (Juan: 2 confirmadas = 20; 2 ambiguas sin puntos)",
        juan.GetProperty("confirmadas").GetInt32() == 2 && juan.GetProperty("puntosProvisionales").GetInt32() == 20 && juan.GetProperty("ambiguas").GetInt32() == 2, juan.GetRawText());
    var nombres = edi.GetProperty("operadores").EnumerateArray().Select(o => o.GetProperty("nombre").GetString()).ToList();
    Check("Resumen: operadores en orden alfabético (sin ranking)", nombres.SequenceEqual(nombres.OrderBy(x => x)));
    var fOp = J(FaretEvaluacionFpsResumen.Construir(todos, new FiltrosFps(null, null, null, null, null, "501"), true));
    Check("Filtro operador: solo PNC donde participa (5: 2 confirmadas, 2 ambiguas, 1 probable)", fOp.GetProperty("pnc").EnumerateArray().All(p => p.GetProperty("operadores").EnumerateArray().Any(o => o.GetProperty("clave").GetString() == "501")) && fOp.GetProperty("pnc").GetArrayLength() == 5, fOp.GetProperty("pnc").GetArrayLength().ToString());
    var fTurno = J(FaretEvaluacionFpsResumen.Construir(todos, new FiltrosFps(null, null, null, null, "B", null), true));
    Check("Filtro turno B: solo la PNC con sesión de tarde", fTurno.GetProperty("pnc").GetArrayLength() == 1 && fTurno.GetProperty("pnc")[0].GetProperty("id").GetInt64() == 4);
    var fMes = J(FaretEvaluacionFpsResumen.Construir(todos, new FiltrosFps(2026, 11, null, null, null, null), true));
    Check("Filtro mes sin datos -> 0 filtradas, universo intacto", fMes.GetProperty("totales").GetProperty("filtradas").GetInt32() == 0 && fMes.GetProperty("totales").GetProperty("registradas").GetInt32() == todos.Count);
    Check("Resumen: responsabilidad siempre PENDIENTE_CALIDAD", edi.GetProperty("pnc").EnumerateArray().All(p => p.GetProperty("responsabilidad").GetString() == "PENDIENTE_CALIDAD"));
    Check("Resumen VER: con nivel VER no se envía el operador declarado", ver.GetProperty("pnc").EnumerateArray().All(p => p.GetProperty("operadorDeclarado").ValueKind == JsonValueKind.Null));
}

Console.WriteLine($"\n{total - fallos}/{total} pruebas OK");
return fallos == 0 ? 0 : 1;
