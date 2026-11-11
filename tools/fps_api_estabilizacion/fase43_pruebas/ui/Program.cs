// Fase 43 — servidor local del arnés de interfaz: sirve el front REAL (src/UI/www) y un puente /bridge que llama al handler REAL
// (con caché) contra Data y FPS simulados (mock_fps.js). Nunca producción. Solo 127.0.0.1.
using System.Net;
using System.Text;
using System.Text.Json;
using QualityControlCenter.Backend.Services.FaretApi;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Modules.EvaluacionOperadores;

var mock = "http://127.0.0.1:39500";
var www = @"C:\Users\dcarrasco\Desktop\Proyectos\qualitycontrol_desktop_faret\src\UI\www";
var aqui = AppContext.BaseDirectory;
var http = new HttpClient();
var faret = new FaretApiClient(new FaretApiSettings { BaseUrl = mock, UseApi = true }); faret.SetToken("t");
var fps = new FpsSesionesApiService(new FpsApiClient(new FpsApiSettings { BaseUrl = mock, UseApi = true, ApiKey = "x" }));
var cache = FaretUniversoCache.Instancia;
int llamadasBridge = 0;
var tipos = new Dictionary<string, string> { [".html"] = "text/html; charset=utf-8", [".js"] = "text/javascript; charset=utf-8", [".css"] = "text/css; charset=utf-8", [".png"] = "image/png", [".svg"] = "image/svg+xml" };

var l = new HttpListener(); l.Prefixes.Add("http://127.0.0.1:39600/"); l.Start();
Console.Error.WriteLine("ui listo");
while (true)
{
    var ctx = await l.GetContextAsync();
    _ = Task.Run(async () =>
    {
        var rq = ctx.Request; var rs = ctx.Response; byte[] body; string ct = "application/json; charset=utf-8"; int code = 200;
        try
        {
            var path = rq.Url!.AbsolutePath; var q = System.Web.HttpUtility.ParseQueryString(rq.Url.Query);
            if (path == "/bridge")
            {
                Interlocked.Increment(ref llamadasBridge);
                using var sr = new StreamReader(rq.InputStream, Encoding.UTF8); var json = await sr.ReadToEndAsync();
                var d = JsonSerializer.Deserialize<Dictionary<string, object>>(json)!;
                var action = ((JsonElement)d["action"]).GetString()!;
                var h = new FaretEvaluacionOperadoresHandler(faret, fps, q["nivel"] == "EDITAR", cache);
                body = Encoding.UTF8.GetBytes(await h.Handle(action, d));
            }
            else if (path == "/mock") { body = Encoding.UTF8.GetBytes(await http.GetStringAsync($"{mock}/__cfg?latency={q["latency"]}&mode={q["mode"]}&pnc={q["pnc"]}")); await http.GetStringAsync($"{mock}/__reset"); llamadasBridge = 0; }
            else if (path == "/stats") { var s = JsonDocument.Parse(await http.GetStringAsync($"{mock}/__stats")).RootElement; body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { fps = s.GetProperty("total").GetInt32(), data = s.GetProperty("dataTotal").GetInt32(), bridge = llamadasBridge, cargas = cache.Cargas })); }
            else if (path == "/invalidar") { cache.Invalidar(); body = Encoding.UTF8.GetBytes("{}"); }
            else if (path == "/cfgcache")
            {
                if (q["timeout"] is { } t) cache.TiempoMaximoCarga = TimeSpan.FromMilliseconds(double.Parse(t));
                if (q["minimo"] is { } m) cache.MinimoEntreCargas = TimeSpan.FromMilliseconds(double.Parse(m));
                body = Encoding.UTF8.GetBytes("{}");
            }
            else
            {
                var rel = path == "/test.html" ? Path.Combine(aqui, "..", "..", "..", "test.html") : Path.Combine(www, path.TrimStart('/').Replace('/', '\\'));
                rel = Path.GetFullPath(rel);
                if (!rel.StartsWith(www, StringComparison.OrdinalIgnoreCase) && !rel.EndsWith("test.html")) { code = 403; body = Array.Empty<byte>(); }
                else if (!File.Exists(rel)) { code = 404; body = Array.Empty<byte>(); }
                else { body = await File.ReadAllBytesAsync(rel); ct = tipos.GetValueOrDefault(Path.GetExtension(rel), "application/octet-stream"); }
            }
        }
        catch (Exception ex) { code = 500; body = Encoding.UTF8.GetBytes(ex.ToString()); }
        rs.StatusCode = code; rs.ContentType = ct; rs.ContentLength64 = body.Length; await rs.OutputStream.WriteAsync(body); rs.Close();
    });
}
