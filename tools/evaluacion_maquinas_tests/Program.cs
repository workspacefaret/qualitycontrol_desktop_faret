using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using QualityControlCenter.Backend.Services.FaretApi;
using QualityControlCenter.Modules.EvaluacionMaquinas;
using QualityControlCenter.Modules.EvaluacionOperadores;
using QualityControlCenter.Services;

// Datos 100% sintéticos: ningún dato real. El servidor HTTP es local y simulado.
int fallos = 0, total = 0;
void Check(string nombre, bool ok, string detalle = "")
{
    total++;
    if (!ok) fallos++;
    Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {nombre}{(ok ? "" : "  -> " + detalle)}");
}

var jopt = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
JsonElement J(object o) => JsonSerializer.SerializeToElement(o, jopt);

// ---------------- helpers de filas ----------------
// crits: una entrada por defecto; null = defecto sin criticidad (histórico).
InspeccionFila C(int id, string? mq, string? op, string? fecha, string?[]? crits = null, string? area = "CALIDAD", string? inspector = "Ines Q")
{
    crits ??= Array.Empty<string?>();
    return new InspeccionFila(id, "Calidad", true, mq, op, inspector, area, fecha, crits.Length > 0,
        crits.Select(c => new DefectoInsp("d", c)).ToList());
}
InspeccionFila P(int id, string? mq, string? inspector, string? fecha, int noCumple, string? area = "PAPEL") =>
    new(id, "Pallet/Papel", false, mq, null, inspector, area, fecha, noCumple > 0, null, noCumple);

JsonElement Calc(IEnumerable<InspeccionFila> f, int? a = null, int? m = null, string? mq = null, string? op = null, string? area = null, string? origen = null) =>
    J(EvaluacionMaquinasCalculator.Calcular(f, new EvaluacionMaquinasFiltros(a, m, mq, op, area, origen)));
int I(JsonElement e, string p) => e.GetProperty(p).GetInt32();

var baseFilas = new List<InspeccionFila>
{
    C(1, "M1", "Ana Perez", "2026-03-10", new[] { "Critico", "Mayor" }),     // 15 pts
    C(2, "m1 ", "ana  perez", "2026-03-12"),                                   // conforme, misma persona y máquina con otra escritura
    C(3, "M1", "Luis Soto", "2026-03-15", new[] { "Menor" }),                  // 1 pt
    C(4, "M1", "Luis Soto", "2026-03-16", new string?[] { null }),             // defecto sin criticidad → no evaluable
    C(5, "M2", "", "2026-04-02", new[] { "Mayor" }),                           // sin operador, 5 pts
    C(6, "M2", "Ana / Luis", "2026-04-03"),                                    // varios operadores, conforme
    C(7, null, "Ana Perez", "2026-04-04", new[] { "Critico" }),                // sin máquina
    C(8, "M2", "Ana Perez", null),                                             // sin fecha
    P(9, "M2", "Ines Q", "2026-04-05", 0),                                     // pallet conforme
    P(10, "M2", "Ines Q", "2026-04-06", 3),                                    // pallet no conforme
    C(1, "M1", "Ana Perez", "2026-03-10", new[] { "Critico", "Mayor" }),       // duplicado exacto (mismo origen e id)
};

// ---------------- 1. Clasificación y totales ----------------
var r = Calc(baseFilas);
var t = r.GetProperty("totales");
Check("Duplicado (origen, id) se cuenta una vez", I(r, "universoTotal") == 10 && I(t, "inspecciones") == 10);
Check("Conformes y no conformes", I(t, "conformes") == 4 && I(t, "noConformes") == 6, t.ToString());
Check("Evaluables / no evaluables", I(t, "evaluables") == 5 && I(t, "noEvaluables") == 5, t.ToString());
var mot = t.GetProperty("noEvaluablesPorMotivo");
Check("Motivos de no evaluable separados", I(mot, "sinFecha") == 1 && I(mot, "sinMaquina") == 1 && I(mot, "origenSinCriticidad") == 2 && I(mot, "criticidadIncompleta") == 1, mot.ToString());
Check("Puntos 10/5/1 solo de evaluables (21)", I(t, "puntos") == 21 && I(t, "criticas") == 1 && I(t, "mayores") == 2 && I(t, "menores") == 1, t.ToString());
Check("Puntos por inspección evaluable = 21/5 = 4,2", t.GetProperty("puntosPorInspeccion").GetDecimal() == 4.20m);
Check("Defectos registrados y sin criticidad", I(t, "defectosRegistrados") == 6 && I(t, "defectosSinCriticidad") == 1);
Check("Inspecciones sin operador identificable", I(t, "sinOperadorIdentificado") == 4, t.ToString());
Check("Conforme es evaluable con 0 puntos (no es 'no evaluable')", I(Calc(new[] { C(1, "M1", "A", "2026-01-01") }).GetProperty("totales"), "evaluables") == 1);
Check("Defecto sin criticidad NO se convierte en 0 puntos: queda no evaluable",
    I(Calc(new[] { C(1, "M1", "A", "2026-01-01", new string?[] { null }) }).GetProperty("totales"), "evaluables") == 0);
Check("Parcialmente clasificado (uno con y otro sin criticidad) → no evaluable",
    I(Calc(new[] { C(1, "M1", "A", "2026-01-01", new string?[] { "Mayor", null }) }).GetProperty("totales"), "evaluables") == 0);
Check("No conforme sin detalle de defectos → no evaluable",
    I(Calc(new[] { new InspeccionFila(1, "Calidad", true, "M1", "A", "I", "CALIDAD", "2026-01-01", true, new List<DefectoInsp>()) }).GetProperty("totales"), "evaluables") == 0);
Check("0 evaluables → puntos por inspección null (no 0)", Calc(new[] { P(1, "M1", "I", "2026-01-01", 0) }).GetProperty("totales").GetProperty("puntosPorInspeccion").ValueKind == JsonValueKind.Null);
Check("Criticidad en minúscula o sin tilde reconocida", I(Calc(new[] { C(1, "M1", "A", "2026-01-01", new[] { "critico", "MAYOR", "Menor" }) }).GetProperty("totales"), "puntos") == 16);

// ---------------- 2. Origen sin criticidad (Pallet) ----------------
var porOrigen = r.GetProperty("porOrigen").EnumerateArray().ToList();
var pal = porOrigen.First(o => o.GetProperty("origen").GetString() == "Pallet/Papel");
var cal = porOrigen.First(o => o.GetProperty("origen").GetString() == "Calidad");
Check("Pallet: conformes/no conformes contados, sin puntaje ni evaluables",
    !pal.GetProperty("admitePuntos").GetBoolean() && I(pal.GetProperty("resumen"), "conformes") == 1 && I(pal.GetProperty("resumen"), "noConformes") == 1 && I(pal.GetProperty("resumen"), "evaluables") == 0);
Check("Pallet: no registra operador de máquina; Calidad sí", !pal.GetProperty("registraOperador").GetBoolean() && cal.GetProperty("registraOperador").GetBoolean());
Check("Pallet nunca aparece en máquina × operador", r.GetProperty("porMaquinaOperador").EnumerateArray().All(x => !x.GetProperty("origenes").EnumerateArray().Any(o => o.GetString() == "Pallet/Papel")));

// ---------------- 3. Máquina, operador, inspector ----------------
var pm = r.GetProperty("porMaquina").EnumerateArray().ToList();
var m1 = pm.First(x => x.GetProperty("maquina").GetString() == "M1");
var m2 = pm.First(x => x.GetProperty("maquina").GetString() == "M2");
Check("Misma máquina con distinta escritura se agrupa (M1 = 'm1 ')", I(m1.GetProperty("resumen"), "inspecciones") == 4, m1.ToString());
Check("M1: 2 operadores de máquina distintos; 1 inspector", I(m1, "operadores") == 2 && I(m1, "inspectores") == 1);
Check("M2: inspecciones y sin operador identificado", I(m2.GetProperty("resumen"), "inspecciones") == 5 && I(m2, "sinOperadorIdentificado") == 4, m2.ToString());
Check("Sin máquina: grupo propio (null), no se mezcla con otra",
    pm.Any(x => x.GetProperty("maquina").ValueKind == JsonValueKind.Null && I(x.GetProperty("resumen"), "inspecciones") == 1));
var mo = r.GetProperty("porMaquinaOperador").EnumerateArray().ToList();
Check("Máquina × operador: 3 combinaciones (sin vacíos, genéricos, múltiples ni sin máquina)", mo.Count == 3, mo.Count.ToString());
var anaM1 = mo.First(x => x.GetProperty("maquina").GetString() == "M1" && x.GetProperty("operador").GetString() == "Ana Perez");
Check("Ana Perez en M1: 2 inspecciones (misma persona, 2 escrituras), 15 puntos, 7,5 por insp.",
    I(anaM1.GetProperty("resumen"), "inspecciones") == 2 && I(anaM1.GetProperty("resumen"), "puntos") == 15 && anaM1.GetProperty("resumen").GetProperty("puntosPorInspeccion").GetDecimal() == 7.50m, anaM1.ToString());
var luisM1 = mo.First(x => x.GetProperty("operador").GetString() == "Luis Soto");
Check("Luis Soto en M1: 1 evaluable + 1 no evaluable (sin criticidad), 1 punto",
    I(luisM1.GetProperty("resumen"), "evaluables") == 1 && I(luisM1.GetProperty("resumen"), "noEvaluables") == 1 && I(luisM1.GetProperty("resumen"), "puntos") == 1);
Check("El inspector nunca aparece como operador de máquina", !mo.Any(x => x.GetProperty("operador").GetString() == "Ines Q"));
Check("Operadores de opciones sin vacíos/genéricos/inspector", J(EvaluacionMaquinasCalculator.Calcular(baseFilas, new EvaluacionMaquinasFiltros(null, null, null, null))).GetProperty("opciones").GetProperty("operadores").EnumerateArray().Select(x => x.GetString()).OrderBy(x => x).SequenceEqual(new[] { "Ana Perez", "Luis Soto" }));

// ---------------- 4. Filtros ----------------
var rm = Calc(baseFilas, a: 2026, m: 3);
Check("Filtro mes=3: solo inspecciones de marzo", I(rm.GetProperty("totales"), "inspecciones") == 4);
Check("Evolución mensual ignora el filtro de mes (contexto de tendencia)", rm.GetProperty("porMes").GetArrayLength() == 2);
var rmq = Calc(baseFilas, mq: "m1");
Check("Filtro máquina (sin distinguir mayúsculas): 4 inspecciones y detalle trazable", I(rmq.GetProperty("totales"), "inspecciones") == 4 && rmq.GetProperty("detalle").GetArrayLength() == 4);
Check("Sin filtro de máquina no hay detalle por inspección", r.GetProperty("detalle").ValueKind == JsonValueKind.Null);
var det = rmq.GetProperty("detalle").EnumerateArray().First(x => x.GetProperty("id").GetInt32() == 4);
Check("Detalle: no evaluable lleva motivo y puntos null (no 0)", !det.GetProperty("evaluable").GetBoolean() && det.GetProperty("motivoNoEvaluable").GetString() == "criticidad_incompleta" && det.GetProperty("puntos").ValueKind == JsonValueKind.Null);
Check("Detalle: inspector visible aparte del operador", det.GetProperty("inspector").GetString() == "Ines Q" && det.GetProperty("operadorMaquina").GetString() == "Luis Soto");
Check("Filtro operador: solo sus inspecciones", I(Calc(baseFilas, op: "ana perez").GetProperty("totales"), "inspecciones") == 4);
Check("Filtro origen Pallet/Papel: 2 inspecciones, 0 evaluables", I(Calc(baseFilas, origen: "Pallet/Papel").GetProperty("totales"), "inspecciones") == 2 && I(Calc(baseFilas, origen: "Pallet/Papel").GetProperty("totales"), "evaluables") == 0);
Check("Filtro área", I(Calc(baseFilas, area: "papel").GetProperty("totales"), "inspecciones") == 2);
Check("Año sin datos → 0 inspecciones", I(Calc(baseFilas, a: 2020).GetProperty("totales"), "inspecciones") == 0);

// ---------------- 5. Umbral y orden ----------------
Check("29 evaluables → datos insuficientes", Calc(Enumerable.Range(1, 29).Select(i => C(i, "M", "A", "2026-01-05"))).GetProperty("datosInsuficientes").GetBoolean());
Check("30 evaluables → suficientes", !Calc(Enumerable.Range(1, 30).Select(i => C(i, "M", "A", "2026-01-05"))).GetProperty("datosInsuficientes").GetBoolean());
var rUmb = Calc(Enumerable.Range(1, 30).Select(i => C(i, "M", "A", "2026-01-05")).Concat(Enumerable.Range(100, 5).Select(i => C(i, "N", "B", "2026-01-05"))));
Check("El umbral se evalúa por máquina (M suficiente, N insuficiente)",
    !rUmb.GetProperty("porMaquina").EnumerateArray().First(x => x.GetProperty("maquina").GetString() == "M").GetProperty("resumen").GetProperty("datosInsuficientes").GetBoolean()
    && rUmb.GetProperty("porMaquina").EnumerateArray().First(x => x.GetProperty("maquina").GetString() == "N").GetProperty("resumen").GetProperty("datosInsuficientes").GetBoolean());
var orden = Calc(new[] { C(1, "Zeta", "A", "2026-01-01", new[] { "Critico" }), C(2, "Alfa", "B", "2026-01-01"), C(3, "Medio", "C", "2026-01-01") });
Check("Máquinas en orden alfabético (no por puntos): sin ranking",
    orden.GetProperty("porMaquina").EnumerateArray().Select(x => x.GetProperty("maquina").GetString()).SequenceEqual(new[] { "Alfa", "Medio", "Zeta" }));
var nombresProp = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
void Recolectar(JsonElement e)
{
    if (e.ValueKind == JsonValueKind.Object) foreach (var p in e.EnumerateObject()) { nombresProp.Add(p.Name); Recolectar(p.Value); }
    else if (e.ValueKind == JsonValueKind.Array) foreach (var x in e.EnumerateArray()) Recolectar(x);
}
Recolectar(r);
Check("La respuesta no contiene nota, ranking, posición ni puntaje global", !nombresProp.Overlaps(new[] { "ranking", "nota", "notaGlobal", "posicion", "puesto", "score", "porcentaje" }));
Check("Ponderaciones provisionales 10/5/1 y umbral 30", r.GetProperty("ponderaciones").GetProperty("critico").GetInt32() == 10 && r.GetProperty("ponderaciones").GetProperty("mayor").GetInt32() == 5
    && r.GetProperty("ponderaciones").GetProperty("menor").GetInt32() == 1 && I(r, "umbralDatosSuficientes") == 30);
Check("Advertencia: atribución no confirmada siempre presente con operadores", r.GetProperty("advertencias").EnumerateArray().Any(a => a.GetProperty("codigo").GetString() == "atribucion_no_confirmada"));
Check("Universo vacío no falla", I(Calc(new List<InspeccionFila>()), "universoTotal") == 0);

// ---------------- 6. Adaptador (parser) FARET ----------------
string Cuerpo(bool ok, string items, long total = 1) => ok ? $"{{\"ok\":true,\"data\":{{\"items\":{items},\"totalCount\":{total},\"page\":1,\"pageSize\":200}}}}" : "{\"ok\":false,\"message\":\"Error al listar registros\"}";
var itemCal = "[{\"id\":7,\"maquina\":\"Diana 8\",\"operador\":\"Pedro\",\"operadorOtro\":null,\"operadorRegistro\":\"Ines\",\"areaControl\":\"CALIDAD\",\"presentaDefectos\":true,\"fechaRegistro\":\"2026-05-10T00:00:00.000Z\",\"defectosDetalle\":\"[{\\\"idEvento\\\":3,\\\"defecto\\\":\\\"Rayas\\\",\\\"criticidad\\\":\\\"Mayor\\\"},{\\\"defecto\\\":\\\"Antiguo\\\"}]\"}]";
Check("Parser Calidad: campos, operador de máquina ≠ inspector", FaretEvaluacionMaquinasParser.TryParsePagina(Cuerpo(true, itemCal), false, out var fc, out var tot, out _)
    && fc.Count == 1 && fc[0].OperadorMaquina == "Pedro" && fc[0].Inspector == "Ines" && fc[0].Maquina == "Diana 8" && fc[0].Area == "CALIDAD" && fc[0].AdmitePuntos && fc[0].Origen == "Calidad" && tot == 1);
Check("Parser Calidad: defectosDetalle (texto JSON) con criticidad y sin ella", fc[0].Defectos!.Count == 2 && fc[0].Defectos![0].Criticidad == "Mayor" && fc[0].Defectos![1].Criticidad == null);
Check("Parser Calidad: fecha ISO se interpreta como el día", EvaluacionOperadoresCalculator.TryParseFecha(fc[0].Fecha, out var fdt) && fdt.Day == 10 && fdt.Month == 5);
Check("Parser Calidad: 'Otros' toma operadorOtro", FaretEvaluacionMaquinasParser.TryParsePagina(Cuerpo(true, "[{\"id\":1,\"operador\":\"Otros\",\"operadorOtro\":\"Juan Reemplazo\",\"presentaDefectos\":false}]"), false, out var fo, out _, out _) && fo[0].OperadorMaquina == "Juan Reemplazo");
Check("Parser Calidad: presentaDefectos numérico/ausente y detalle nulo", FaretEvaluacionMaquinasParser.TryParsePagina(Cuerpo(true, "[{\"id\":1,\"presentaDefectos\":1},{\"id\":2},{\"id\":3,\"presentaDefectos\":false,\"defectosDetalle\":null}]"), false, out var fn, out _, out _)
    && fn[0].PresentaDefectos && !fn[1].PresentaDefectos && fn[2].Defectos!.Count == 0);
Check("Parser Calidad: detalle ilegible → defecto sin criticidad (no evaluable), no se inventa", FaretEvaluacionMaquinasParser.TryParsePagina(Cuerpo(true, "[{\"id\":1,\"presentaDefectos\":true,\"defectosDetalle\":\"{{roto\"}]"), false, out var fr, out _, out _) && fr[0].Defectos!.Count == 1 && fr[0].Defectos![0].Criticidad == null);
Check("Parser Pallet: 'operador' es el inspector; sin operador de máquina ni criticidad", FaretEvaluacionMaquinasParser.TryParsePagina(Cuerpo(true, "[{\"id\":5,\"maquina\":\"Prensa\",\"operador\":\"Ines\",\"totalNoCumple\":2,\"areaControl\":\"PAPEL\",\"fechaRegistro\":\"2026-05-11T00:00:00.000Z\"}]"), true, out var fp, out _, out _)
    && fp[0].OperadorMaquina == null && fp[0].Inspector == "Ines" && !fp[0].AdmitePuntos && fp[0].PresentaDefectos && fp[0].NoCumple == 2 && fp[0].Origen == "Pallet/Papel");
Check("Parser: respuesta de error", !FaretEvaluacionMaquinasParser.TryParsePagina(Cuerpo(false, "[]"), false, out _, out _, out var perr) && perr.Contains("Error al listar"));
Check("Parser: cuerpo no JSON / sin items", !FaretEvaluacionMaquinasParser.TryParsePagina("no json", false, out _, out _, out _) && !FaretEvaluacionMaquinasParser.TryParsePagina("{\"ok\":true,\"data\":{}}", false, out _, out _, out _));

// ---------------- 7. Autorización (PermisosService real) ----------------
var pe = new PermisosService();
const string Acc = "faret.evaluacionMaquinas.resumen";
Check("Sin sesión → rechazada", pe.ValidarAccion(Acc, "faret-evaluacion-maquinas") != null);
foreach (var rol in new[] { "ADMIN", "CALIDAD", "INSPECTOR", "CONSULTA", "OPERADOR", "" })
{
    pe.Establecer("FARET", rol, new());
    Check($"Rol '{rol}' sin permiso personalizado → SIN_ACCESO y acción rechazada", pe.NivelEfectivo("faret-evaluacion-maquinas") == "SIN_ACCESO" && pe.ValidarAccion(Acc, "faret-evaluacion-maquinas") != null);
}
pe.Establecer("FARET", "CALIDAD", new());
Check("Rechazada aunque venga con el _modulo de otro módulo", pe.ValidarAccion(Acc, "faret") != null);
pe.Establecer("FARET", "CALIDAD", new() { ["faret-evaluacion-maquinas"] = "VER" });
Check("Con VER: lectura permitida y menú visible", pe.ValidarAccion(Acc, "faret-evaluacion-maquinas") == null && pe.NivelesEfectivos()["faret-evaluacion-maquinas"] == "VER");
Check("Con VER: no es EDITAR (nombres ocultos)", pe.NivelEfectivo("faret-evaluacion-maquinas") != "EDITAR");
Check("Con VER: cualquier escritura rechazada", pe.ValidarAccion("faret.evaluacionMaquinas.guardar", "faret-evaluacion-maquinas") != null);
pe.Establecer("FARET", "CALIDAD", new() { ["faret-evaluacion-maquinas"] = "EDITAR" });
Check("Con EDITAR: lectura permitida y sin escrituras (no hay prefijos de escritura)", pe.ValidarAccion(Acc, "faret-evaluacion-maquinas") == null && pe.ValidarAccion("faret.evaluacionMaquinas.guardar", "faret-evaluacion-maquinas") != null);
pe.Establecer("FARET", "ADMIN_TI", new());
Check("ADMIN_TI: acceso", pe.ValidarAccion(Acc, "faret-evaluacion-maquinas") == null);
pe.Establecer("INNPACK", "ADMIN_TI", new());
Check("Empresa INNPACK: acción de Faret rechazada", pe.ValidarAccion(Acc, "faret-evaluacion-maquinas") != null);
Check("Es lectura por sufijo (.resumen)", PermisosService.EsLectura(Acc));
pe.Establecer("FARET", "CALIDAD", new() { ["faret-evaluacion-maquinas"] = "CUALQUIER_COSA" });
Check("Nivel personalizado inválido no concede acceso", pe.ValidarAccion(Acc, "faret-evaluacion-maquinas") != null);
pe.Establecer("FARET", "CALIDAD", new() { ["faret-evaluacion-operadores"] = "EDITAR" });
Check("Permiso del módulo de operadores no concede el de máquinas", pe.ValidarAccion(Acc, "faret-evaluacion-maquinas") != null);
pe.Limpiar();
Check("Tras cerrar sesión → rechazada", pe.ValidarAccion(Acc, "faret-evaluacion-maquinas") != null);

// ---------------- 8. Handler con servidor HTTP local simulado ----------------
int Puerto() { var l = new TcpListener(IPAddress.Loopback, 0); l.Start(); var p = ((IPEndPoint)l.LocalEndpoint).Port; l.Stop(); return p; }
var puerto = Puerto();
var listener = new HttpListener();
listener.Prefixes.Add($"http://127.0.0.1:{puerto}/");
listener.Start();
int pedidos = 0;
string modo = "ok";
const int NCal = 450, NPal = 30;
string FilaCal(int id) =>
    $"{{\"id\":{id},\"maquina\":\"{(id % 2 == 0 ? "MQ-A" : "MQ-B")}\",\"operador\":\"{(id % 2 == 0 ? "Operador Uno" : "Operador Dos")}\",\"operadorOtro\":null,\"operadorRegistro\":\"Inspectora Uno\",\"areaControl\":\"CALIDAD\","
    + $"\"presentaDefectos\":{(id % 3 == 0 ? "true" : "false")},\"fechaRegistro\":\"2026-05-10T00:00:00.000Z\","
    + $"\"defectosDetalle\":{(id % 3 == 0 ? "\"[{\\\"idEvento\\\":1,\\\"defecto\\\":\\\"x\\\",\\\"criticidad\\\":\\\"Mayor\\\"}]\"" : "null")}}}";
string FilaPal(int id) =>
    $"{{\"id\":{id},\"maquina\":\"MQ-A\",\"operador\":\"Inspectora Uno\",\"operadorOtro\":null,\"areaControl\":\"PAPEL\",\"fechaRegistro\":\"2026-05-11T00:00:00.000Z\",\"totalNoCumple\":{(id % 5 == 0 ? 1 : 0)}}}";
var servidor = Task.Run(async () =>
{
    while (listener.IsListening)
    {
        HttpListenerContext ctx;
        try { ctx = await listener.GetContextAsync(); } catch { break; }
        Interlocked.Increment(ref pedidos);
        var path = ctx.Request.Url!.AbsolutePath;
        var q = System.Web.HttpUtility.ParseQueryString(ctx.Request.Url.Query);
        var page = int.Parse(q["page"] ?? "1"); var size = int.Parse(q["pageSize"] ?? "50");
        var esPallet = path.Contains("calidad-faret-pallet");
        int n = esPallet ? NPal : NCal;
        string cuerpo; int status = 200;
        if (modo == "401") { status = 401; cuerpo = ""; }
        else if (modo == "pallet500" && esPallet) { status = 500; cuerpo = "{\"ok\":false,\"message\":\"Error al listar registros\"}"; }
        else
        {
            var ids = Enumerable.Range(1, n).Skip((page - 1) * size).Take(size).ToList();
            var totalDeclarado = modo == "corto" && !esPallet ? 1000 : n;
            cuerpo = $"{{\"ok\":true,\"data\":{{\"items\":[{string.Join(",", ids.Select(i => esPallet ? FilaPal(i) : FilaCal(i)))}],\"totalCount\":{totalDeclarado},\"page\":{page},\"pageSize\":{size}}}}}";
        }
        var bytes = Encoding.UTF8.GetBytes(cuerpo);
        ctx.Response.StatusCode = status; ctx.Response.ContentType = "application/json";
        await ctx.Response.OutputStream.WriteAsync(bytes); ctx.Response.Close();
    }
});

var cliente = new FaretApiClient(new FaretApiSettings { BaseUrl = $"http://127.0.0.1:{puerto}/api", UseApi = true });
Dictionary<string, object> Data(object? anio = null, object? mes = null, string? mq = null, bool actualizar = false)
{
    var d = new Dictionary<string, object>();
    if (anio != null) d["anio"] = J(anio);
    if (mes != null) d["mes"] = J(mes);
    if (mq != null) d["maquina"] = J(mq);
    if (actualizar) d["actualizar"] = J(true);
    return d;
}
JsonElement Resp(string s) => JsonDocument.Parse(s).RootElement.Clone();

var hVer = new FaretEvaluacionMaquinasHandler(cliente, verNombres: false);
var hNom = new FaretEvaluacionMaquinasHandler(cliente, verNombres: true);
FaretEvaluacionMaquinasHandler.InvalidarCache();

var sinToken = Resp(await hVer.Handle("faret.evaluacionMaquinas.resumen", Data()));
Check("Handler sin token → error 'No autenticado'", !sinToken.GetProperty("ok").GetBoolean() && sinToken.GetProperty("error").GetString()!.Contains("No autenticado"));
Check("Handler: acción desconocida → error", !Resp(await hVer.Handle("faret.evaluacionMaquinas.otra", Data())).GetProperty("ok").GetBoolean());
cliente.SetToken("token-sintetico");
Check("Handler: año inválido", !Resp(await hVer.Handle("faret.evaluacionMaquinas.resumen", Data(anio: 1999))).GetProperty("ok").GetBoolean());
Check("Handler: mes inválido", !Resp(await hVer.Handle("faret.evaluacionMaquinas.resumen", Data(mes: 13))).GetProperty("ok").GetBoolean());

pedidos = 0;
var txtVer = await hVer.Handle("faret.evaluacionMaquinas.resumen", Data());
var rv = Resp(txtVer);
Check("Handler: lee TODAS las páginas de ambas fuentes (3 + 1 solicitudes)", rv.GetProperty("ok").GetBoolean() && pedidos == 4, $"pedidos={pedidos}");
var tv = rv.GetProperty("data").GetProperty("resultado").GetProperty("totales");
Check("Handler: 480 inspecciones (450 Calidad + 30 Pallet), 450 evaluables, 30 no evaluables por origen",
    I(tv, "inspecciones") == 480 && I(tv, "evaluables") == 450 && I(tv.GetProperty("noEvaluablesPorMotivo"), "origenSinCriticidad") == 30, tv.ToString());
Check("Handler: puntos = 150 inspecciones no conformes × 5 (Mayor)", I(tv, "puntos") == 750, tv.ToString());
Check("Handler: informa registros por fuente", rv.GetProperty("data").GetProperty("fuentes").EnumerateArray().Select(x => x.GetProperty("registros").GetInt32()).SequenceEqual(new[] { NCal, NPal }));
Check("Handler con VER: ni operadores ni inspector en claro", !txtVer.Contains("Operador Uno") && !txtVer.Contains("Operador Dos") && !txtVer.Contains("Inspectora Uno") && txtVer.Contains("OP-") && !rv.GetProperty("data").GetProperty("nombresVisibles").GetBoolean());
Check("Handler con VER: filtro por operador seudonimizado funciona",
    rv.GetProperty("data").GetProperty("resultado").GetProperty("opciones").GetProperty("operadores").GetArrayLength() == 2);

pedidos = 0;
var rNom = await hNom.Handle("faret.evaluacionMaquinas.resumen", Data(anio: 2026, mes: 5, mq: "MQ-A"));
Check("Handler con EDITAR: nombres visibles; reutiliza el universo en memoria (0 solicitudes nuevas)", pedidos == 0 && rNom.Contains("Operador Uno") && rNom.Contains("Inspectora Uno"), $"pedidos={pedidos}");
var rA = Resp(rNom).GetProperty("data").GetProperty("resultado");
Check("Handler: filtro por máquina MQ-A trae detalle trazable con inspector y operador por separado",
    rA.GetProperty("detalle").ValueKind == JsonValueKind.Array && rA.GetProperty("detalle").EnumerateArray().Any(x => x.GetProperty("inspector").GetString() == "Inspectora Uno" && x.GetProperty("operadorMaquina").ValueKind == JsonValueKind.String));
Check("Handler: en máquina MQ-A el operador de máquina nunca es el inspector",
    rA.GetProperty("porMaquinaOperador").EnumerateArray().All(x => x.GetProperty("operador").GetString() == "Operador Uno"));

pedidos = 0;
await hVer.Handle("faret.evaluacionMaquinas.resumen", Data(actualizar: true));
Check("Handler: 'actualizar' relee la API", pedidos == 4, $"pedidos={pedidos}");
pedidos = 0;
FaretEvaluacionMaquinasHandler.InvalidarCache();
await hVer.Handle("faret.evaluacionMaquinas.resumen", Data());
Check("Handler: InvalidarCache (cambio de sesión) fuerza nueva lectura", pedidos == 4, $"pedidos={pedidos}");

modo = "pallet500"; FaretEvaluacionMaquinasHandler.InvalidarCache();
var rp = Resp(await hVer.Handle("faret.evaluacionMaquinas.resumen", Data()));
Check("Handler: si falla UNA fuente (Pallet) no muestra cifras parciales", !rp.GetProperty("ok").GetBoolean() && rp.GetProperty("error").GetString()!.Contains("Pallet/Papel") && rp.GetProperty("error").GetString()!.Contains("No se muestran cifras"), rp.ToString());
modo = "corto"; FaretEvaluacionMaquinasHandler.InvalidarCache();
var rc = Resp(await hVer.Handle("faret.evaluacionMaquinas.resumen", Data()));
Check("Handler: listado incompleto (menos filas que el total) → error, nunca cálculo parcial", !rc.GetProperty("ok").GetBoolean() && rc.GetProperty("error").GetString()!.Contains("incompleto"), rc.ToString());
modo = "401"; FaretEvaluacionMaquinasHandler.InvalidarCache();
var r401 = Resp(await hVer.Handle("faret.evaluacionMaquinas.resumen", Data()));
Check("Handler: 401 → error y token descartado", !r401.GetProperty("ok").GetBoolean() && !cliente.HasToken, r401.ToString());
modo = "ok";
var sinTokenDeNuevo = Resp(await hVer.Handle("faret.evaluacionMaquinas.resumen", Data()));
Check("Handler: tras perder el token, no responde desde el caché de otra sesión", !sinTokenDeNuevo.GetProperty("ok").GetBoolean());

listener.Stop();

// ---------------- 9. Integración FPS para Pallet/Papel (clasificador, servicio, auditoría de cobertura) ----------------
await FpsPruebas.Run(new FpsPruebas.Comprobar(Check));

// Opcional: `dotnet run -- <ruta.json>` guarda la respuesta del escenario base (sintético) para probar la pantalla con un arnés de navegador.
if (args.Length > 0)
{
    var fx = new { ok = true, data = new { nombresVisibles = false, fuentes = new[] { new { origen = "Calidad", registros = 8 }, new { origen = "Pallet/Papel", registros = 2 } }, cargadoEn = DateTime.UtcNow.ToString("o"), resultado = EvaluacionMaquinasCalculator.Calcular(baseFilas, new EvaluacionMaquinasFiltros(null, null, null, null)) } };
    var fxMq = new { ok = true, data = new { nombresVisibles = false, fuentes = new[] { new { origen = "Calidad", registros = 8 } }, cargadoEn = DateTime.UtcNow.ToString("o"), resultado = EvaluacionMaquinasCalculator.Calcular(baseFilas, new EvaluacionMaquinasFiltros(null, null, "M1", null)) } };
    File.WriteAllText(args[0], JsonSerializer.Serialize(fx, jopt));
    File.WriteAllText(args[0].Replace(".json", "_m1.json"), JsonSerializer.Serialize(fxMq, jopt));
}

Console.WriteLine($"\n{total - fallos}/{total} pruebas OK");
return fallos == 0 ? 0 : 1;
