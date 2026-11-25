using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Text.Json;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Backend.Services.PlanificacionApi;
using QualityControlCenter.Backend.Services.SapRecepcionApi;

var fallos = 0;
var total = 0;
void Caso(string nombre, bool ok) { total++; if (!ok) { fallos++; Console.WriteLine("FALLA " + nombre); } }

// ZIP base que entregaría la API INNPACK.
var memoria = new MemoryStream();
using (var z = new ZipArchive(memoria, ZipArchiveMode.Create, true))
using (var w = new StreamWriter(z.CreateEntry("INDICE.txt").Open()))
    w.Write("indice de prueba");
var zipBase = Convert.ToBase64String(memoria.ToArray());

var sonda = new TcpListener(IPAddress.Loopback, 0);
sonda.Start();
var puerto = ((IPEndPoint)sonda.LocalEndpoint).Port;
sonda.Stop();
var url = $"http://127.0.0.1:{puerto}/";
var servidor = new HttpListener();
servidor.Prefixes.Add(url);
servidor.Start();
var pedidos = new List<string>();
var original = Encoding.UTF8.GetBytes("<html><body>certificado emitido</body></html>");
var huellaOriginal = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(original)).ToLowerInvariant();
string conservado = "";
_ = Task.Run(async () =>
{
    while (servidor.IsListening)
    {
        var c = await servidor.GetContextAsync();
        var ruta = c.Request.Url!.AbsolutePath;
        lock (pedidos) pedidos.Add(c.Request.HttpMethod + " " + c.Request.Url.PathAndQuery);
        var estado = 200;
        byte[] cuerpo;
        byte[] Json(object o) => Encoding.UTF8.GetBytes(JsonSerializer.Serialize(o));
        if (ruta.EndsWith("/certificados/7"))
            cuerpo = Json(new { success = true, data = new { certificado = new { id = 7, np = "9999", correlativo = "CD-2026-00007", estado = "EMITIDO", ejecutada = true, cantidadEjecutada = 30, cantidadDestruir = 40, unidad = "UNIDADES", fechaEjecucion = "2026-11-25T00:00:00" }, detalle = Array.Empty<object>(), aprobaciones = Array.Empty<object>() } });
        else if (ruta.EndsWith("/certificados/7/archivos"))
        {
            conservado = await new StreamReader(c.Request.InputStream, Encoding.UTF8).ReadToEndAsync();
            cuerpo = Json(new { success = true, data = new { id = 1 } });
        }
        else if (ruta.EndsWith("/certificados/7/archivos/1") || ruta.EndsWith("/certificados/7/archivos/2"))
            cuerpo = Json(new { success = true, data = new { nombreArchivo = "certificado_7_emitido.html", tipoMime = "text/html", contenidoBase64 = Convert.ToBase64String(original), sha256 = ruta.EndsWith("1") ? huellaOriginal : new string('0', 64) } });
        else if (ruta.EndsWith("/certificados/7/archivos/3"))
            cuerpo = Json(new { success = true, data = new { nombreArchivo = "evidencia.exe", tipoMime = "image/png", contenidoBase64 = Convert.ToBase64String(original), sha256 = huellaOriginal } });
        else if (ruta.EndsWith("/zip"))
            cuerpo = Json(new { success = true, data = new { nombreArchivo = "Trazabilidad_NP9999.zip", contenidoBase64 = zipBase, incluidos = 1, faltantes = 2 } });
        else if (ruta.EndsWith("/guia/1"))
            cuerpo = Json(new { adjuntos = new[] { new { numero = 0, nombre = "../../certificado", extension = "pdf" }, new { numero = 1, nombre = "falla", extension = "pdf" } } });
        else if (ruta.EndsWith("/recepcion/4"))
            cuerpo = Json(new { adjuntos = new[] { new { numero = 0, nombre = "respaldo recepcion", extension = "pdf" } } });
        else if (ruta.EndsWith("/recepcion/4/0/archivo"))
            cuerpo = Encoding.ASCII.GetBytes("%PDF-1.4 " + c.Request.Url.Query);
        else if (ruta.EndsWith("/factura/2"))
            cuerpo = Json(new { adjuntos = Array.Empty<object>() });
        else if (ruta.EndsWith("/guia/1/0/archivo"))
            cuerpo = Encoding.ASCII.GetBytes("%PDF-1.4 ficticio");
        else
        {
            estado = 404;
            cuerpo = Json(new { message = "No encontrado en SAP (prueba)" });
        }
        c.Response.StatusCode = estado;
        await c.Response.OutputStream.WriteAsync(cuerpo);
        c.Response.Close();
    }
});

var asm = typeof(InnpackApiClient).Assembly;
var tipo = asm.GetType("QualityControlCenter.Modules.Trazabilidad.TrazabilidadHandler")
    ?? asm.GetTypes().Single(t => t.Name == "TrazabilidadHandler");
var destino = Directory.CreateTempSubdirectory("qcc_zip_").FullName;
tipo.GetProperty("DirectorioPruebas", BindingFlags.NonPublic | BindingFlags.Static)!.SetValue(null, destino);

// Cuenta de servicio vacía: la prueba no debe leer credenciales de ningún config.json.
var innpack = new InnpackApiClient(new InnpackApiSettings { BaseUrl = url, UseApi = true }, new InnpackApiServiceAccountSettings());
var sap = new SapRecepcionApiClient(new SapRecepcionApiSettings { BaseUrl = url, UseApi = true, ApiKey = "x" });
var handler = Activator.CreateInstance(tipo, innpack, new PlanificacionApiClient(innpack),
    new FpsMaterialesApiService(new FpsApiClient(new FpsApiSettings { BaseUrl = url })), null, sap)!;

async Task<JsonElement> Zip(object sapDocs)
{
    var datos = new Dictionary<string, object> { ["data"] = JsonSerializer.SerializeToElement(new { np = "9999", sapDocs }) };
    var r = await (Task<string>)tipo.GetMethod("Handle")!.Invoke(handler, new object[] { "trazabilidad.documentos.zip", datos })!;
    return JsonDocument.Parse(r).RootElement.Clone();
}

var docs = new object[]
{
    new { tipo = "guia", docEntry = 1, docNum = 15001 }, new { tipo = "guia", docEntry = 1, docNum = 15001 },
    new { tipo = "factura", docEntry = 2, docNum = 26001 }, new { tipo = "devolucion", docEntry = 3, docNum = 139 },
    new { tipo = "recepcion", empresa = "FARET", docEntry = 4, docNum = 801 }, new { tipo = "recepcion", empresa = "INNPACK", docEntry = 4, docNum = 901 },
    new { tipo = "recepcion", empresa = "FARET", docEntry = 4, docNum = 801 }, new { tipo = "guia", empresa = "FARET", docEntry = 1, docNum = 15001 }, new { tipo = "../x", docEntry = 5, docNum = 1 }
};
var res = await Zip(docs);
Console.WriteLine(res.ToString());
var data = res.GetProperty("data");
Caso("resultado", data.GetProperty("sapIncluidos").GetInt32() == 3 && data.GetProperty("sapFallidos").GetInt32() == 2);
var ruta = data.GetProperty("ruta").GetString()!;
using (var z = ZipFile.OpenRead(ruta))
{
    var nombres = z.Entries.Select(e => e.FullName).ToList();
    Console.WriteLine(string.Join("\n", nombres));
    var indice = new StreamReader(z.GetEntry("SAP/INDICE_ANEXOS_SAP.txt")!.Open()).ReadToEnd();
    Console.WriteLine(indice);
    Caso("conserva el ZIP de la API", nombres.Contains("INDICE.txt"));
    Caso("sin rutas peligrosas", nombres.All(n => !n.Split('/').Contains("..") && !n.Contains((char)92) &&!Path.IsPathRooted(n)));
    string Texto(string prefijo) => new StreamReader(z.Entries.Single(e => e.FullName.StartsWith(prefijo)).Open()).ReadToEnd();
    Caso("recepciones: cada sociedad con su propio adjunto", Texto("SAP/recepcion FARET 801/").EndsWith("?empresa=FARET") && Texto("SAP/recepcion INNPACK 901/").EndsWith("?empresa=INNPACK"));
    var pdf = z.Entries.Single(e => e.FullName.StartsWith("SAP/guia"));
    Caso("contenido íntegro", new StreamReader(pdf.Open()).ReadToEnd() == "%PDF-1.4 ficticio" && pdf.FullName.StartsWith("SAP/guia 15001/"));
    Caso("índice: incluido", indice.Contains("INCLUIDO SAP/guia 15001/"));
    Caso("índice: archivo que falló", indice.Contains("NO INCLUIDO guia 15001 / falla.pdf"));
    Caso("índice: sin adjuntos", indice.Contains("SIN ADJUNTOS factura 26001"));
    Caso("índice: documento no encontrado", indice.Contains("NO INCLUIDO devolucion 139: No encontrado en SAP (prueba)"));
}
Caso("duplicado consultado una vez", pedidos.Count(p => p.Contains("/guia/1?")) == 1);
Caso("excluye tipos inválidos", !pedidos.Any(p => p.Contains("/x/")));
Caso("recepción repetida consultada una vez", pedidos.Count(p => p.EndsWith("/recepcion/4?empresa=FARET")) == 1);
Caso("solo GET; los documentos de venta siempre INNPACK", pedidos.All(p => p.StartsWith("GET ")) && pedidos.Where(p => p.Contains("documentos-adjuntos") && !p.Contains("/recepcion/")).All(p => p.EndsWith("?empresa=INNPACK")));
var segundo = await Zip(Array.Empty<object>());
Caso("no sobrescribe", segundo.GetProperty("data").GetProperty("ruta").GetString() != ruta && Directory.GetFiles(destino).Length == 2);

// Documento emitido del certificado: se conserva tal como se imprime y solo se muestra si la huella coincide.
var tipoCn = asm.GetTypes().Single(t => t.Name == "CalidadNpHandler");
var cn = Activator.CreateInstance(tipoCn, innpack)!;
async Task<JsonElement> Cn(string accion, object datos)
{
    var d = new Dictionary<string, object> { ["data"] = JsonSerializer.SerializeToElement(datos) };
    var r = await (Task<string>)tipoCn.GetMethod("Handle")!.Invoke(cn, new object[] { accion, d })!;
    return JsonDocument.Parse(r).RootElement.Clone();
}
var guardado = await Cn("calidadNp.certificados.documento.conservar", new { id = 7 });
Caso("certificado: conservar responde ok", guardado.GetProperty("ok").GetBoolean());
var enviado = JsonDocument.Parse(conservado.Length > 0 ? conservado : "{}").RootElement;
var htmlEnviado = enviado.TryGetProperty("html", out var he) ? he.GetString()! : "";
Caso("certificado: envía el documento V11 con la cantidad destruida", enviado.TryGetProperty("tipo", out var te) && te.GetString() == "DOCUMENTO_EMITIDO" && htmlEnviado.Contains("CD-2026-00007") && htmlEnviado.Contains("30 unidades efectivamente destruidas"));
Caso("certificado: el documento no lleva scripts", !htmlEnviado.Contains("<script", StringComparison.OrdinalIgnoreCase));
var leido = await Cn("calidadNp.certificados.documento.get", new { id = 7, archivoId = 1 });
Caso("certificado: devuelve el original idéntico", leido.GetProperty("ok").GetBoolean() && leido.GetProperty("data").GetProperty("html").GetString() == Encoding.UTF8.GetString(original));
var alterado = await Cn("calidadNp.certificados.documento.get", new { id = 7, archivoId = 2 });
Caso("certificado: huella distinta no se muestra", !alterado.GetProperty("ok").GetBoolean() && alterado.GetProperty("error").GetString()!.Contains("huella"));
var ejecutable = await Cn("calidadNp.certificados.archivo.abrir", new { id = 7, archivoId = 3 });
Caso("certificado: no abre ejecutables", !ejecutable.GetProperty("ok").GetBoolean());

// Permisos: con "solo ver" se puede leer el documento y las evidencias, pero no conservar, subir, anular ni registrar áreas.
var tipoPermisos = asm.GetTypes().Single(t => t.Name == "PermisosService");
var permisos = Activator.CreateInstance(tipoPermisos, nonPublic: true)!;
var soloVer = new Dictionary<string, string> { ["certificados-destruccion"] = "VER", ["cierre-np"] = "VER" };
tipoPermisos.GetMethod("Establecer")!.Invoke(permisos, new object[] { "INNPACK", "CONSULTA", soloVer });
string? Rechazo(string accion, string modulo) => (string?)tipoPermisos.GetMethod("ValidarAccion")!.Invoke(permisos, new object[] { accion, modulo });
Caso("permisos VER: lecturas nuevas permitidas", Rechazo("calidadNp.certificados.documento.get", "certificados-destruccion") == null && Rechazo("calidadNp.certificados.archivo.abrir", "certificados-destruccion") == null);
Caso("permisos VER: escrituras nuevas rechazadas", new[] { "calidadNp.certificados.documento.conservar", "calidadNp.certificados.archivos.agregar", "calidadNp.certificados.archivos.anular" }.All(a => Rechazo(a, "certificados-destruccion") != null) && Rechazo("calidadNp.cierre.area", "cierre-np") != null);
// INNPACK sin acceso a los cuatro módulos: declarar otro módulo de origen no salta el permiso. FARET no cambia.
var ninguno = new[] { "trazabilidad", "balance-mermas", "cierre-np", "certificados-destruccion" }.ToDictionary(m => m, _ => "SIN_ACCESO");
tipoPermisos.GetMethod("Establecer")!.Invoke(permisos, new object[] { "INNPACK", "CONSULTA", ninguno });
Caso("permisos sin acceso: no se salta declarando otro módulo", new[] { "trazabilidad.integral", "trazabilidad.noConformidades", "calidadNp.cierre.get" }.All(a => Rechazo(a, "inicio") != null));
tipoPermisos.GetMethod("Establecer")!.Invoke(permisos, new object[] { "FARET", "ADMIN_TI", new Dictionary<string, string>(ninguno) });
Caso("permisos FARET: trazabilidad sigue igual", Rechazo("trazabilidad.consultarNp", "faret-trazabilidad") == null);

servidor.Stop();
Directory.Delete(destino, true);
Console.WriteLine($"{total - fallos}/{total}");
return fallos == 0 ? 0 : 1;
