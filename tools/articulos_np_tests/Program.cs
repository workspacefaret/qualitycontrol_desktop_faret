using System.Net;
using System.Net.Sockets;
using System.Text;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Modules.MuestraLaboratorio;
using QualityControlCenter.Services;

// Datos 100% sintéticos. El servidor HTTP es local y simula a fps-api.
int fallos = 0, total = 0;

string Orden(long ot, string? nvFaret, string? nvInnpack, string articulosJson = "[]") =>
    $"{{\"OrdenTrabajo\":{ot},\"NotaVentaFaret\":{nvFaret ?? "null"},\"NotaVentaInnpack\":{nvInnpack ?? "null"},\"CoincideNpFaret\":0,\"CoincideNpInnpack\":1,\"Cliente\":\"C\",\"ArticulosInnpack\":{articulosJson}}}";
string Art(string code, params string[] items) => $"{{\"ItemCode\":\"{code}\",\"Descripcion\":\"D {code}\",\"Items\":[{string.Join(",", items.Select(i => $"\"{i}\""))}]}}";
string Proc(long id, long ot, string item) => $"{{\"IdProceso\":{id},\"OrdenTrabajo\":{ot},\"Item\":\"{item}\",\"ItemCode\":\"ST{id}\"}}";
string Ok(string ordenes, string procesos = "[]", string? error = null) =>
    $"{{\"ok\":true,\"data\":{{\"np\":\"x\",\"ordenes\":[{ordenes}],\"procesos\":[{procesos}],\"registros\":[],\"articulosInnpackError\":{(error == null ? "null" : $"\"{error}\"")}}}}}";

var respuestas = new Dictionary<string, (int status, string body)>
{
    // NV INNPACK con 3 ítems; procesos de los ítems 1, 2 y 9 (este último no está en la NV)
    ["4137"] = (200, Ok(Orden(23132, "23132", "4137", $"[{Art("A1", "1")},{Art("A2", "2")},{Art("A3", "3")}]"),
        procesos: Proc(101, 23132, "1") + "," + Proc(102, 23132, "02") + "," + Proc(109, 23132, "9"))),
    // un artículo repetido en dos ítems: se muestra solo el elegido
    ["4006"] = (200, Ok(Orden(1, null, "4006", $"[{Art("B", "2", "10")}]"), procesos: Proc(210, 1, "10"))),
    // orden solo FARET
    ["23259"] = (200, Ok(Orden(1, "23259", null), procesos: Proc(301, 1, "1"))),
    // NV INNPACK sin líneas en SAP
    ["4200"] = (200, Ok(Orden(1, null, "4200"), procesos: Proc(401, 1, "1"))),
    // SAP caído
    ["4300"] = (200, Ok(Orden(1, null, "4300"), procesos: Proc(501, 1, "1"), error: "SAP_NO_DISPONIBLE")),
    // NP en dos órdenes con NV INNPACK distintas: el proceso decide la orden
    ["777"] = (200, Ok(Orden(10, "777", "4062", $"[{Art("X", "1")}]") + "," + Orden(11, null, "777", $"[{Art("Y", "1")}]"),
        procesos: Proc(601, 10, "1") + "," + Proc(602, 11, "1"))),
    // fps-api anterior (sin ArticulosInnpack ni articulosInnpackError)
    ["4400"] = (200, "{\"ok\":true,\"data\":{\"np\":\"4400\",\"ordenes\":[{\"OrdenTrabajo\":1,\"NotaVentaInnpack\":4400}],\"procesos\":[{\"IdProceso\":701,\"OrdenTrabajo\":1,\"Item\":\"1\"}],\"registros\":[]}}"),
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
        var (status, body) = respuestas.TryGetValue(np, out var r) ? r : (404, "{\"ok\":false,\"message\":\"No se encontró\"}");
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
var (ok1, d1, _) = await servicio.ObtenerRegistrosLaboratorioAsync(4137);
CheckL("parser: artículos y procesos con ítem", ok1 && d1!.Ordenes[0].ArticulosInnpack.Count == 3 && d1.Procesos.Any(p => p.IdProceso == 102 && p.Item == "02"));
CheckL("parser: campos existentes intactos", d1!.Ordenes[0].Cliente == "C" && d1.Ordenes[0].NpInnpack == "4137" && d1.ArticulosInnpackError == "");
var (_, d2, _) = await servicio.ObtenerRegistrosLaboratorioAsync(4400);
CheckL("parser: fps-api anterior sin el campo → no disponible", !d2!.ArticulosInnpackDisponible);
lock (pedidos) pedidos.Clear();
await servicio.ObtenerRegistrosLaboratorioAsync(4137, soloArticulos: true);
lock (pedidos) CheckL("parser: soloArticulos agrega &soloArticulos=1", pedidos.SequenceEqual(new[] { "4137|solo" }), string.Join(";", pedidos));

// ---------------- 2. Resolvedor: solo el ítem elegido ----------------
async Task<List<ArticulosNpResolver.Resultado>> Resolver(params (long np, long idProceso)[] p) =>
    await ArticulosNpResolver.ResolverAsync(p, (np, completo) => servicio.ObtenerRegistrosLaboratorioAsync(np, soloArticulos: !completo));
string Fmt(ArticulosNpResolver.Resultado r) => $"{r.Estado}:{string.Join(",", r.Items.Select(x => $"{x.Item}={x.Articulo}"))}";

lock (pedidos) pedidos.Clear();
var res = await Resolver((4137, 101), (4137, 102), (4137, 109), (4137, 0), (4006, 210), (23259, 301), (4200, 401), (4300, 501),
    (777, 601), (777, 602), (777, 699), (4400, 701), (999, 1), (500, 1));
CheckL("ítem 1 elegido → solo ítem 1", Fmt(res[0]) == "OK:1=A1", Fmt(res[0]));
CheckL("ítem \"02\" elegido → solo ítem 2", Fmt(res[1]) == "OK:2=A2", Fmt(res[1]));
CheckL("ítem que no está en la NV → ITEM_NO_EN_NV, sin artículos", Fmt(res[2]) == "ITEM_NO_EN_NV:", Fmt(res[2]));
CheckL("sin proceso FPS → SIN_ITEM_ELEGIDO", Fmt(res[3]) == "SIN_ITEM_ELEGIDO:", Fmt(res[3]));
CheckL("artículo en dos ítems → solo el par del ítem elegido", Fmt(res[4]) == "OK:10=B", Fmt(res[4]));
CheckL("orden solo FARET → SIN_NV_INNPACK", Fmt(res[5]) == "SIN_NV_INNPACK:", Fmt(res[5]));
CheckL("NV INNPACK sin líneas en SAP → SIN_ARTICULOS", Fmt(res[6]) == "SIN_ARTICULOS:", Fmt(res[6]));
CheckL("SAP caído → SAP_NO_DISPONIBLE", Fmt(res[7]) == "SAP_NO_DISPONIBLE:", Fmt(res[7]));
CheckL("NP con 2 NV INNPACK: proceso de la orden 10 → artículo de su NV", Fmt(res[8]) == "OK:1=X", Fmt(res[8]));
CheckL("NP con 2 NV INNPACK: proceso de la orden 11 → artículo de su NV", Fmt(res[9]) == "OK:1=Y", Fmt(res[9]));
CheckL("proceso que no está en FPS → PROCESO_NO_ENCONTRADO", Fmt(res[10]) == "PROCESO_NO_ENCONTRADO:", Fmt(res[10]));
CheckL("fps-api anterior → NO_DISPONIBLE", Fmt(res[11]) == "NO_DISPONIBLE:", Fmt(res[11]));
CheckL("NP no encontrada en FPS", Fmt(res[12]) == "NP_NO_ENCONTRADA:", Fmt(res[12]));
CheckL("FPS con error 500", Fmt(res[13]) == "FPS_NO_DISPONIBLE:", Fmt(res[13]));
lock (pedidos) CheckL("una sola consulta completa por NP; ninguna para la muestra sin proceso",
    pedidos.Count(p => p == "4137|full") == 1 && pedidos.Count(p => p == "777|full") == 1 && !pedidos.Any(p => p.EndsWith("|solo")), string.Join(";", pedidos));
CheckL("MismoItem: '1' = '01', 'A' = 'a', vacío ≠ vacío",
    ArticulosNpResolver.MismoItem("1", "01") && ArticulosNpResolver.MismoItem("A", "a") && !ArticulosNpResolver.MismoItem("", "") && !ArticulosNpResolver.MismoItem("1", "2"));

// ---------------- 3. Permisos ----------------
CheckL("muestraLab.articulosNp registrada como lectura (usuarios con VER)", PermisosService.EsLectura("muestraLab.articulosNp"));

listener.Stop();
Log(fallos == 0 ? $"\nTODAS PASARON ({total})" : $"\n{fallos} FALLOS de {total}");
return fallos == 0 ? 0 : 1;
