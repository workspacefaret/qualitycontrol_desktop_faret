// Anfitrión de pruebas del entorno aislado: sirve el front real y entrega cada mensaje al MessageRouter real.
// Uso: dotnet run --project tools/e2e_aislado -- <carpeta de exportaciones>
// Solo 127.0.0.1, solo la configuración de %LOCALAPPDATA%\QCC_Aislado (se valida que todos los destinos sean locales).
using System.Net;
using System.Text;
using System.Text.Json;
using QualityControlCenter.Backend.Services;
using QualityControlCenter.Backend.Services.FaretApi;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Backend.Services.PlanificacionApi;
using QualityControlCenter.Backend.Services.SapRecepcionApi;
using QualityControlCenter.Modules.Auth;
using QualityControlCenter.Services;

const string Origen = "http://127.0.0.1:5299";
if (args.Length != 1) { Console.Error.WriteLine("Falta la carpeta de exportaciones."); return 1; }
var exportaciones = Directory.CreateDirectory(args[0]).FullName;

Environment.SetEnvironmentVariable("QCC_AISLADO", "1");
Environment.SetEnvironmentVariable("QCC_CONFIG", Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "QCC_Aislado", "config.json"));
EntornoAislado.Validar();

var www = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "src", "UI", "www"));
if (!File.Exists(Path.Combine(www, "index.html"))) { Console.Error.WriteLine("Ejecutar desde la raíz del repositorio."); return 1; }

// Misma composición que Program.cs del escritorio.
var session = new CurrentUserSessionService();
var innpack = new InnpackApiClient(InnpackApiSettings.Load());
var faret = new FaretApiClient(FaretApiSettings.Load());
var mejora = new FaretApiClient(FaretApiSettings.Load("MejoraContinuaFaretApi"));
var calidad = new FaretApiClient(FaretApiSettings.Load("CalidadFaretApi"));
var fps = new FpsApiClient(FpsApiSettings.Load());
var router = new MessageRouter(
    new DbService(DbSettings.Load()), new AuthHandler(new AuthService(innpack, session)), session, innpack, faret, mejora, calidad,
    new FpsLiberacionesApiService(fps), new FpsMaterialesApiService(fps), new PlanificacionApiClient(innpack),
    new SapRecepcionApiClient(SapRecepcionApiSettings.Load()), new FpsRegistroProduccionApiService(fps), new PermisosService(),
    new FpsSesionesApiService(fps), new FpsTrazabilidadApiService(fps));
MessageRouter.DirectorioExportacionPruebas = exportaciones;

const string Puente = """
<script>(function(){let cb=null;Object.defineProperty(window,'external',{configurable:true,value:{
sendMessage:m=>fetch('/bridge',{method:'POST',headers:{'X-Qcc-E2e':'1'},body:m}).then(r=>r.text()).then(t=>cb&&cb(t)),
receiveMessage:f=>{cb=f}}});window.__errores=[];addEventListener('error',e=>__errores.push(String(e.message)));
addEventListener('unhandledrejection',e=>__errores.push(String(e.reason)));})();</script>
""";

var servidor = new HttpListener();
servidor.Prefixes.Add(Origen + "/");
servidor.Start();
Console.WriteLine($"Anfitrión de pruebas en {Origen} (exportaciones: {exportaciones})");
var turno = new SemaphoreSlim(1, 1);

while (true)
{
    var contexto = await servidor.GetContextAsync();
    _ = Task.Run(async () =>
    {
        var (pedido, respuesta) = (contexto.Request, contexto.Response);
        try
        {
            if (pedido.UserHostName != "127.0.0.1:5299") { respuesta.StatusCode = 403; return; }
            if (pedido.HttpMethod == "POST" && pedido.Url!.AbsolutePath == "/bridge")
            {
                // La cabecera propia obliga a preflight desde otro origen: otra página no puede usar el puente.
                if (pedido.Headers["X-Qcc-E2e"] != "1" || pedido.Headers["Origin"] != Origen) { respuesta.StatusCode = 403; return; }
                using var lector = new StreamReader(pedido.InputStream, Encoding.UTF8);
                using var mensaje = JsonDocument.Parse(await lector.ReadToEndAsync());
                string resultado;
                await turno.WaitAsync();
                try { resultado = await router.Handle(mensaje.RootElement.GetProperty("payload").GetRawText()); }
                finally { turno.Release(); }
                await Escribir(respuesta, "application/json", JsonSerializer.SerializeToUtf8Bytes(new { id = mensaje.RootElement.GetProperty("id").GetInt32(), data = JsonSerializer.Deserialize<JsonElement>(resultado) }));
                return;
            }
            var relativa = Uri.UnescapeDataString(pedido.Url!.AbsolutePath.TrimStart('/'));
            var ruta = Path.GetFullPath(Path.Combine(www, relativa.Length == 0 ? "index.html" : relativa));
            if (pedido.HttpMethod != "GET" || !ruta.StartsWith(www + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(ruta)) { respuesta.StatusCode = 404; return; }
            var contenido = await File.ReadAllBytesAsync(ruta);
            if (Path.GetFileName(ruta) == "index.html")
                contenido = Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(contenido).Replace("<head>", "<head>" + Puente));
            await Escribir(respuesta, Path.GetExtension(ruta) switch
            {
                ".html" => "text/html; charset=utf-8", ".js" => "text/javascript; charset=utf-8", ".css" => "text/css; charset=utf-8",
                ".png" => "image/png", ".jpg" or ".jpeg" => "image/jpeg", ".svg" => "image/svg+xml", _ => "application/octet-stream"
            }, contenido);
        }
        catch (Exception ex) { Console.Error.WriteLine("Anfitrión: " + ex.GetType().Name + " " + ex.Message); respuesta.StatusCode = 500; }
        finally { respuesta.Close(); }
    });
}

static async Task Escribir(HttpListenerResponse respuesta, string tipo, byte[] cuerpo)
{
    respuesta.ContentType = tipo;
    respuesta.Headers["Cache-Control"] = "no-store";
    await respuesta.OutputStream.WriteAsync(cuerpo);
}
