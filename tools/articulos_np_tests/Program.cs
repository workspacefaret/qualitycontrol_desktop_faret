using System.Net;
using System.Net.Sockets;
using System.Text;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Modules.MuestraLaboratorio;
using QualityControlCenter.Services;

// Datos 100% sintéticos. El servidor HTTP es local y simula a fps-api.
int fallos = 0, total = 0;

// Respuestas simuladas de fps-api por NP (y modo soloArticulos).
string Orden(long ot, string? nvFaret, string? nvInnpack, string articulosJson = "[]") =>
    $"{{\"OrdenTrabajo\":{ot},\"NotaVentaFaret\":{nvFaret ?? "null"},\"NotaVentaInnpack\":{nvInnpack ?? "null"},\"CoincideNpFaret\":0,\"CoincideNpInnpack\":1,\"Cliente\":\"C\",\"ArticulosInnpack\":{articulosJson}}}";
string Art(string code, params string[] items) => $"{{\"ItemCode\":\"{code}\",\"Descripcion\":\"D {code}\",\"Items\":[{string.Join(",", items.Select(i => $"\"{i}\""))}]}}";
string Ok(string ordenes, string procesos = "[]", string? error = null) =>
    $"{{\"ok\":true,\"data\":{{\"np\":\"x\",\"ordenes\":[{ordenes}],\"procesos\":{procesos},\"registros\":[],\"articulosInnpackError\":{(error == null ? "null" : $"\"{error}\"")}}}}}";

var respuestas = new Dictionary<string, (int status, string body)>
{
    // 1 artículo
    ["4124"] = (200, Ok(Orden(1, "23001", "4124", $"[{Art("4820011000001", "1")}]"))),
    // varios artículos; el mismo código repetido entre dos órdenes de la misma NV; B en los ítems 2 y 10
    ["4006"] = (200, Ok(Orden(1, null, "4006", $"[{Art("A", "1")},{Art("B", "10", "2")}]") + "," + Orden(2, null, "4006", $"[{Art("B", "2")},{Art("A", "1")}]"))),
    // artículo sin número de ítem
    ["4500"] = (200, Ok(Orden(1, null, "4500", $"[{Art("S")}]"))),
    // orden solo FARET (sin NV INNPACK)
    ["23259"] = (200, Ok(Orden(1, "23259", null))),
    // NV INNPACK sin líneas en SAP
    ["4200"] = (200, Ok(Orden(1, null, "4200"))),
    // SAP caído
    ["4300"] = (200, Ok(Orden(1, null, "4300"), error: "SAP_NO_DISPONIBLE")),
    // ambigua: la NP aparece en dos órdenes con NV INNPACK distintas
    ["777"] = (200, Ok(Orden(10, "777", "4062", $"[{Art("X", "1")}]") + "," + Orden(11, null, "777", $"[{Art("Y", "1")}]"))),
    ["777|full"] = (200, Ok(Orden(10, "777", "4062", $"[{Art("X", "1")}]") + "," + Orden(11, null, "777", $"[{Art("Y", "1")}]"),
        procesos: "[{\"IdProceso\":501,\"OrdenTrabajo\":10},{\"IdProceso\":502,\"OrdenTrabajo\":11}]")),
    // fps-api anterior (sin ArticulosInnpack ni articulosInnpackError)
    ["4400"] = (200, "{\"ok\":true,\"data\":{\"np\":\"4400\",\"ordenes\":[{\"OrdenTrabajo\":1,\"NotaVentaInnpack\":4400}],\"procesos\":[],\"registros\":[]}}"),
    ["999"] = (404, "{\"ok\":false,\"message\":\"No se encontró la NP 999 en producción (ni como NP Faret ni como NP Innpack).\"}"),
    ["500"] = (500, "{\"ok\":false,\"codigo\":\"FPS_NO_DISPONIBLE\",\"message\":\"No fue posible consultar.\"}"),
};

int Puerto() { var l = new TcpListener(IPAddress.Loopback, 0); l.Start(); var p = ((IPEndPoint)l.LocalEndpoint).Port; l.Stop(); return p; }
var puerto = Puerto();
var listener = new HttpListener();
listener.Prefixes.Add($"http://127.0.0.1:{puerto}/");
listener.Start();
var pedidos = new List<string>();
_ = Task.Run(async () =>
{
    while (listener.IsListening)
    {
        HttpListenerContext ctx;
        try { ctx = await listener.GetContextAsync(); } catch { break; }
        var q = System.Web.HttpUtility.ParseQueryString(ctx.Request.Url!.Query);
        var np = q["np"] ?? "";
        var solo = q["soloArticulos"] == "1";
        lock (pedidos) pedidos.Add($"{np}|{(solo ? "solo" : "full")}");
        var (status, body) = !solo && respuestas.TryGetValue(np + "|full", out var full) ? full
            : respuestas.TryGetValue(np, out var r) ? r : (404, "{\"ok\":false,\"message\":\"No se encontró\"}");
        var bytes = Encoding.UTF8.GetBytes(body);
        ctx.Response.StatusCode = status; ctx.Response.ContentType = "application/json";
        await ctx.Response.OutputStream.WriteAsync(bytes); ctx.Response.Close();
    }
});

var settings = new FpsApiSettings { BaseUrl = $"http://127.0.0.1:{puerto}/api/produccion", UseApi = true };
var servicio = new FpsRegistroProduccionApiService(new FpsApiClient(settings));
Console.SetOut(new StringWriter()); // silencia el log [FpsApi] del cliente
var salida = new StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true };
void Log(string s) => salida.WriteLine(s);
void CheckL(string n, bool ok, string d = "") { total++; if (!ok) fallos++; Log($"{(ok ? "PASS" : "FAIL")}  {n}{(ok ? "" : "  -> " + d)}"); }

// ---------------- 1. Parser (código real) ----------------
var (ok1, d1, _) = await servicio.ObtenerRegistrosLaboratorioAsync(4124);
CheckL("parser: 1 artículo leído de la orden", ok1 && d1!.Ordenes[0].ArticulosInnpack.Count == 1 && d1.Ordenes[0].ArticulosInnpack[0].ItemCode == "4820011000001" && d1.Ordenes[0].ArticulosInnpack[0].Items.SequenceEqual(new[] { "1" }));
CheckL("parser: campos existentes intactos", d1!.Ordenes[0].Cliente == "C" && d1.Ordenes[0].NpInnpack == "4124" && d1.ArticulosInnpackError == "");
var (_, d2, _) = await servicio.ObtenerRegistrosLaboratorioAsync(4400);
CheckL("parser: fps-api anterior sin el campo → lista vacía y marcada no disponible", d2!.Ordenes[0].ArticulosInnpack.Count == 0 && !d2.ArticulosInnpackDisponible);
CheckL("parser: fps-api nuevo → disponible", d1.ArticulosInnpackDisponible);
var (_, d3, _) = await servicio.ObtenerRegistrosLaboratorioAsync(4300);
CheckL("parser: articulosInnpackError de SAP se conserva", d3!.ArticulosInnpackError == "SAP_NO_DISPONIBLE");
lock (pedidos) pedidos.Clear();
await servicio.ObtenerRegistrosLaboratorioAsync(4124, soloArticulos: true);
lock (pedidos) CheckL("parser: soloArticulos agrega &soloArticulos=1", pedidos.SequenceEqual(new[] { "4124|solo" }), string.Join(";", pedidos));

// ---------------- 2. Resolvedor ----------------
async Task<List<ArticulosNpResolver.Resultado>> Resolver(params (long np, long idProceso)[] p) =>
    await ArticulosNpResolver.ResolverAsync(p, (np, completo) => servicio.ObtenerRegistrosLaboratorioAsync(np, soloArticulos: !completo));
string Fmt(ArticulosNpResolver.Resultado r) => $"{r.Estado}:{string.Join(",", r.Articulos)}";

var res = await Resolver((4124, 0), (4006, 0), (23259, 0), (4200, 0), (4300, 0), (777, 0), (999, 0), (500, 0), (4400, 0), (4500, 0));
string Pares(ArticulosNpResolver.Resultado r) => string.Join(",", r.Items.Select(x => $"{x.Item}:{x.Articulo}"));
CheckL("ítem→artículo: un ítem", Pares(res[0]) == "1:4820011000001", Pares(res[0]));
CheckL("ítem→artículo: todos los pares, sin repetir, ordenados por ítem (2 antes que 10)", Pares(res[1]) == "1:A,2:B,10:B", Pares(res[1]));
CheckL("fps-api anterior → NO_DISPONIBLE (no afirma que SAP no tenga datos)", Fmt(res[8]) == "NO_DISPONIBLE:", Fmt(res[8]));
CheckL("artículo sin número de ítem → par con ítem vacío", Pares(res[9]) == ":S" && Fmt(res[9]) == "OK:S", Pares(res[9]));
CheckL("un artículo", Fmt(res[0]) == "OK:4820011000001", Fmt(res[0]));
CheckL("varios artículos, sin duplicados entre líneas/órdenes", Fmt(res[1]) == "OK:A,B", Fmt(res[1]));
CheckL("orden solo FARET: sin artículos (no usa la NV FARET)", Fmt(res[2]) == "SIN_NV_INNPACK:", Fmt(res[2]));
CheckL("NV INNPACK sin líneas en SAP: vacío", Fmt(res[3]) == "SIN_ARTICULOS:", Fmt(res[3]));
CheckL("SAP caído: vacío con motivo", Fmt(res[4]) == "SAP_NO_DISPONIBLE:", Fmt(res[4]));
CheckL("NP con dos NV INNPACK y sin proceso: ambigua, vacío", Fmt(res[5]) == "AMBIGUO:", Fmt(res[5]));
CheckL("NP no encontrada en FPS", Fmt(res[6]) == "NP_NO_ENCONTRADA:", Fmt(res[6]));
CheckL("FPS con error 500", Fmt(res[7]) == "FPS_NO_DISPONIBLE:", Fmt(res[7]));

var amb = await Resolver((777, 501), (777, 502), (777, 999));
CheckL("ambigua + proceso de la orden 10 → artículos de su NV (4062)", Fmt(amb[0]) == "OK:X", Fmt(amb[0]));
CheckL("ambigua + proceso de la orden 11 → artículos de su NV (777)", Fmt(amb[1]) == "OK:Y", Fmt(amb[1]));
CheckL("ambigua + proceso desconocido → vacío", Fmt(amb[2]) == "AMBIGUO:", Fmt(amb[2]));

lock (pedidos) pedidos.Clear();
await Resolver((4124, 0), (4124, 0), (4124, 77), (4006, 0));
lock (pedidos) CheckL("una sola consulta liviana por NP (sin repetir) y sin consulta completa si no hace falta",
    pedidos.Count(p => p == "4124|solo") == 1 && pedidos.Count(p => p == "4006|solo") == 1 && !pedidos.Any(p => p.EndsWith("|full")), string.Join(";", pedidos));

// ---------------- 3. Permisos ----------------
CheckL("muestraLab.articulosNp registrada como lectura (usuarios con VER)", PermisosService.EsLectura("muestraLab.articulosNp"));

listener.Stop();
Log(fallos == 0 ? $"\nTODAS PASARON ({total})" : $"\n{fallos} FALLOS de {total}");
return fallos == 0 ? 0 : 1;
