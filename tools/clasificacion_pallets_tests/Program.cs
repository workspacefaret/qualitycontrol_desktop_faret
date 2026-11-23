using System.Net;
using System.Text;
using System.Text.Json;
using QualityControlCenter.Backend.Services.FaretApi;
using QualityControlCenter.Modules.ClasificacionPallets;
using QualityControlCenter.Services;

// Pruebas del módulo Clasificación de Pallets: Handler (rutas, validación, errores), permisos VER/EDITAR y aislamiento INNPACK/FARET.
int ok = 0, fallas = 0;
void Check(string nombre, bool cond, string detalle = "")
{
    if (cond) ok++; else { fallas++; Console.WriteLine($"  FALLA: {nombre} {detalle}"); }
}

// ── servidor simulado de la API `calidad` ──
var cola = new Queue<(int status, string body)>();
var vistas = new List<(string method, string pathQuery, string? auth, string body)>();
var listener = new HttpListener();
var puerto = new Random().Next(40100, 40900);
listener.Prefixes.Add($"http://localhost:{puerto}/");
listener.Start();
_ = Task.Run(async () =>
{
    while (listener.IsListening)
    {
        try
        {
            var ctx = await listener.GetContextAsync();
            var body = await new StreamReader(ctx.Request.InputStream).ReadToEndAsync();
            vistas.Add((ctx.Request.HttpMethod, ctx.Request.Url!.PathAndQuery, ctx.Request.Headers["Authorization"], body));
            var (status, resp) = cola.Count > 0 ? cola.Dequeue() : (200, "{\"ok\":true,\"data\":{}}");
            ctx.Response.StatusCode = status;
            ctx.Response.ContentType = "application/json";
            var bytes = Encoding.UTF8.GetBytes(resp);
            await ctx.Response.OutputStream.WriteAsync(bytes);
            ctx.Response.Close();
        }
        catch { }
    }
});

FaretApiClient NuevoCliente()
{
    var c = new FaretApiClient(new FaretApiSettings { BaseUrl = $"http://localhost:{puerto}/calidad/api", UseApi = true });
    c.SetToken("JWT-INNPACK-PRUEBA");
    return c;
}

Dictionary<string, object> Payload(object data)
{
    var json = JsonSerializer.Serialize(new { action = "x", data });
    return JsonSerializer.Deserialize<Dictionary<string, object>>(json)!; // los valores quedan como JsonElement, igual que en Photino
}

async Task<(string res, (string method, string pathQuery, string? auth, string body)? req)> Llamar(string empresa, string accion, object data, int status = 200, string? body = null)
{
    vistas.Clear();
    cola.Clear();
    if (body != null) cola.Enqueue((status, body));
    var h = new ClasificacionPalletsHandler(NuevoCliente(), empresa);
    var r = await h.Handle(accion, Payload(data));
    return (r, vistas.Count > 0 ? vistas[0] : null);
}
bool EsOk(string r) => JsonDocument.Parse(r).RootElement.GetProperty("ok").GetBoolean();
string Err(string r) => JsonDocument.Parse(r).RootElement.TryGetProperty("error", out var e) ? e.GetString() ?? "" : "";

Console.WriteLine("== Handler: aislamiento de empresa ==");
{
    var (r, req) = await Llamar("FARET", "clasificacionPallets.list", new { });
    Check("FARET rechazado", !EsOk(r) && Err(r).Contains("exclusivo de INNPACK"));
    Check("FARET: no llega a la API", req == null);
    var (r2, req2) = await Llamar("", "clasificacionPallets.list", new { });
    Check("sin empresa rechazado", !EsOk(r2) && req2 == null);
    var (r3, req3) = await Llamar("FARET", "clasificacionPallets.anular", new { id = 1, motivo = "x" });
    Check("FARET no puede anular", !EsOk(r3) && req3 == null);
}

Console.WriteLine("== Handler: list (filtros, validación, límites) ==");
{
    var (r, req) = await Llamar("INNPACK", "clasificacionPallets.list",
        new { desde = "2026-11-01", hasta = "2026-11-23", color = "rojo", procesoId = 3, maquinaId = "9", defectoId = 7, np = "39 57&x=1", vista = "eventos", incluirAnuladas = true, pagina = 2, limite = 500, usuarioId = -4 },
        200, "{\"ok\":true,\"data\":{\"total\":0,\"pagina\":2,\"limite\":200,\"items\":[]}}");
    Check("list ok", EsOk(r));
    var q = req!.Value.pathQuery;
    Check("ruta base", q.StartsWith("/calidad/api/pallets/clasificaciones?"), q);
    Check("fechas", q.Contains("desde=2026-11-01") && q.Contains("hasta=2026-11-23"), q);
    Check("color en mayúsculas", q.Contains("color=ROJO"), q);
    Check("ids numéricos (número y texto)", q.Contains("procesoId=3") && q.Contains("maquinaId=9") && q.Contains("defectoId=7"), q);
    Check("id negativo descartado", !q.Contains("usuarioId"), q);
    Check("np codificado (sin inyección de parámetros)", q.Contains("np=39%2057%26x%3D1") && !q.Contains("&x=1"), q);
    Check("vista eventos + anuladas", q.Contains("vista=eventos") && q.Contains("incluirAnuladas=1"), q);
    Check("pagina/limite acotados", q.Contains("pagina=2") && q.Contains("limite=200"), q);
    Check("JWT de la sesión reenviado", req.Value.auth == "Bearer JWT-INNPACK-PRUEBA", req.Value.auth ?? "null");
    Check("es GET", req.Value.method == "GET");
}
{
    var (_, req) = await Llamar("INNPACK", "clasificacionPallets.list",
        new { desde = "01-11-2026", color = "NEGRO", procesoId = "abc", vista = "otra", pagina = 0, limite = 0, palletCodigo = new string('9', 200) });
    var q = req!.Value.pathQuery;
    Check("fecha inválida descartada", !q.Contains("desde"), q);
    Check("color inválido descartado", !q.Contains("color"), q);
    Check("id no numérico descartado", !q.Contains("procesoId"), q);
    Check("vista desconocida → vigentes", q.Contains("vista=vigentes"), q);
    Check("pagina mínima 1, limite mínimo 1", q.Contains("pagina=1") && q.Contains("limite=1"), q);
    Check("texto largo truncado a 60", q.Contains("palletCodigo=" + new string('9', 60)) && !q.Contains(new string('9', 61)), q);
}
{
    var (_, req) = await Llamar("INNPACK", "clasificacionPallets.list", new { });
    var q = req!.Value.pathQuery;
    Check("valores por defecto: vigentes, pagina 1, limite 50", q.Contains("vista=vigentes") && q.Contains("pagina=1") && q.Contains("limite=50") && !q.Contains("incluirAnuladas"), q);
}

Console.WriteLine("== Handler: resumen / defectos / detalle ==");
{
    var (r, req) = await Llamar("INNPACK", "clasificacionPallets.resumen", new { color = "AZUL", pagina = 3, limite = 10, incluirAnuladas = true, vista = "eventos" },
        200, "{\"ok\":true,\"data\":{\"vista\":\"eventos\",\"totales\":{\"azul\":1,\"rojo\":0,\"verde\":2,\"total\":3}}}");
    var q = req!.Value.pathQuery;
    Check("resumen ruta", q.StartsWith("/calidad/api/pallets/clasificaciones/resumen?"), q);
    Check("resumen sin paginación ni anuladas", !q.Contains("pagina") && !q.Contains("limite") && !q.Contains("incluirAnuladas") && q.Contains("color=AZUL") && q.Contains("vista=eventos"), q);
    Check("resumen devuelve data intacta", EsOk(r) && JsonDocument.Parse(r).RootElement.GetProperty("data").GetProperty("totales").GetProperty("total").GetInt32() == 3);

    var (_, req2) = await Llamar("INNPACK", "clasificacionPallets.defectos", new { vista = "vigentes" });
    Check("defectos ruta", req2!.Value.pathQuery.StartsWith("/calidad/api/pallets/clasificaciones/defectos?"), req2.Value.pathQuery);

    var (_, req3) = await Llamar("INNPACK", "clasificacionPallets.detalle", new { id = "12" });
    Check("detalle ruta (id como texto)", req3!.Value.pathQuery == "/calidad/api/pallets/clasificaciones/12", req3.Value.pathQuery);

    foreach (var malo in new object[] { 0, -1, "abc", "1; DROP", "../x" })
    {
        var (rm, reqm) = await Llamar("INNPACK", "clasificacionPallets.detalle", new { id = malo });
        Check($"detalle id inválido '{malo}'", !EsOk(rm) && reqm == null);
    }
}

Console.WriteLine("== Handler: anular ==");
{
    var (r, req) = await Llamar("INNPACK", "clasificacionPallets.anular", new { id = 5, motivo = "  Pallet mal escaneado  " }, 200, "{\"ok\":true,\"data\":{\"id\":5}}");
    Check("anular ok", EsOk(r));
    Check("anular POST a la ruta correcta", req!.Value.method == "POST" && req.Value.pathQuery == "/calidad/api/pallets/clasificaciones/5/anular", req.Value.pathQuery);
    Check("motivo recortado en el cuerpo", JsonDocument.Parse(req.Value.body).RootElement.GetProperty("motivo").GetString() == "Pallet mal escaneado", req.Value.body);

    var (r1, q1) = await Llamar("INNPACK", "clasificacionPallets.anular", new { id = 5, motivo = "   " });
    Check("motivo vacío rechazado sin llamar a la API", !EsOk(r1) && q1 == null && Err(r1).Contains("motivo"));
    var (r2, q2) = await Llamar("INNPACK", "clasificacionPallets.anular", new { id = 5, motivo = new string('a', 251) });
    Check("motivo > 250 rechazado", !EsOk(r2) && q2 == null);
    var (r3, q3) = await Llamar("INNPACK", "clasificacionPallets.anular", new { id = 0, motivo = "x" });
    Check("id inválido rechazado", !EsOk(r3) && q3 == null);

    var (r4, _) = await Llamar("INNPACK", "clasificacionPallets.anular", new { id = 5, motivo = "x" }, 404, "{\"ok\":false,\"code\":\"NO_ENCONTRADA_O_YA_ANULADA\",\"message\":\"Clasificación no encontrada o ya anulada.\"}");
    Check("404 propaga el mensaje de la API", !EsOk(r4) && Err(r4) == "Clasificación no encontrada o ya anulada.", r4);
    var (r5, _) = await Llamar("INNPACK", "clasificacionPallets.anular", new { id = 5, motivo = "x" }, 403, "{\"ok\":false,\"message\":\"No tienes permiso para anular.\"}");
    Check("403 propaga el mensaje de la API", !EsOk(r5) && Err(r5).Contains("permiso"), r5);
}

Console.WriteLine("== Handler: errores de transporte ==");
{
    var (r1, _) = await Llamar("INNPACK", "clasificacionPallets.list", new { }, 404, "<html>Not Found</html>");
    Check("respuesta no JSON → mensaje claro", !EsOk(r1) && Err(r1).Contains("no tiene habilitada"), r1);
    var (r2, _) = await Llamar("INNPACK", "clasificacionPallets.list", new { }, 500, "{\"ok\":false,\"message\":\"No se pudo completar la consulta.\"}");
    Check("500 propaga mensaje", !EsOk(r2) && Err(r2) == "No se pudo completar la consulta.");
    var (r3, _) = await Llamar("INNPACK", "clasificacionPallets.list", new { }, 401, "{\"ok\":false,\"message\":\"Token inválido\"}");
    Check("401 → error de sesión", !EsOk(r3) && Err(r3).Length > 0, r3);
    var (r4, _) = await Llamar("INNPACK", "clasificacionPallets.reclasificar", new { });
    Check("acción desconocida rechazada", !EsOk(r4) && Err(r4).Contains("no reconocida"));
}

Console.WriteLine("== Permisos: VER / EDITAR / SIN_ACCESO ==");
PermisosService Sesion(string empresa, string rol, string? nivel = null)
{
    var p = new PermisosService();
    p.Establecer(empresa, rol, nivel == null ? new() : new() { ["clasificacion-pallets"] = nivel });
    return p;
}
const string M = "clasificacion-pallets";
string[] lecturas = { "clasificacionPallets.list", "clasificacionPallets.resumen", "clasificacionPallets.defectos", "clasificacionPallets.detalle" };
{
    var ver = Sesion("INNPACK", "calidad", "VER");
    foreach (var a in lecturas) Check($"VER permite {a}", ver.ValidarAccion(a, M) == null);
    Check("VER bloquea anular", ver.ValidarAccion("clasificacionPallets.anular", M) != null);

    var edit = Sesion("INNPACK", "calidad", "EDITAR");
    foreach (var a in lecturas) Check($"EDITAR permite {a}", edit.ValidarAccion(a, M) == null);
    Check("EDITAR permite anular", edit.ValidarAccion("clasificacionPallets.anular", M) == null);

    var sin = Sesion("INNPACK", "calidad", "SIN_ACCESO");
    foreach (var a in lecturas.Append("clasificacionPallets.anular")) Check($"SIN_ACCESO bloquea {a}", sin.ValidarAccion(a, M) != null);

    var porRol = Sesion("INNPACK", "calidad");
    Check("INNPACK sin personalizar: acceso por rol (EDITAR) como el resto de módulos INNPACK", porRol.NivelEfectivo(M) == "EDITAR");

    var ti = Sesion("INNPACK", "ADMIN_TI");
    Check("ADMIN_TI INNPACK: EDITAR siempre", ti.NivelEfectivo(M) == "EDITAR" && ti.ValidarAccion("clasificacionPallets.anular", M) == null);
}

Console.WriteLine("== Permisos: la acción no se salta el permiso usando otro _modulo ==");
{
    var sinAcceso = Sesion("INNPACK", "calidad", "SIN_ACCESO");
    Check("lectura con _modulo ajeno bloqueada si no hay acceso al módulo", sinAcceso.ValidarAccion("clasificacionPallets.list", "producto-terminado") != null);
    Check("lectura con _modulo nulo bloqueada", sinAcceso.ValidarAccion("clasificacionPallets.list", null) != null);
    var ver = Sesion("INNPACK", "calidad", "VER");
    Check("anular con _modulo ajeno bloqueada en VER", ver.ValidarAccion("clasificacionPallets.anular", "producto-terminado") != null);
    var edit = Sesion("INNPACK", "calidad", "EDITAR");
    Check("anular con _modulo ajeno bloqueada (prefijo no pertenece a ese módulo)", edit.ValidarAccion("clasificacionPallets.anular", "producto-terminado") != null);
    Check("anular desde su módulo permitida", edit.ValidarAccion("clasificacionPallets.anular", M) == null);
}

Console.WriteLine("== Aislamiento INNPACK / FARET ==");
{
    foreach (var rol in new[] { "ADMIN", "ADMIN_TI", "CALIDAD", "INSPECTOR", "CONSULTA" })
    {
        var f = Sesion("FARET", rol);
        Check($"FARET/{rol}: nivel SIN_ACCESO", f.NivelEfectivo(M) == "SIN_ACCESO");
        foreach (var a in lecturas.Append("clasificacionPallets.anular"))
        {
            Check($"FARET/{rol}: {a} con _modulo del módulo", f.ValidarAccion(a, M) != null);
            Check($"FARET/{rol}: {a} con _modulo de Faret", f.ValidarAccion(a, "faret-admin-planta") != null && f.ValidarAccion(a, "faret") != null);
        }
        Check($"FARET/{rol}: no figura en sus niveles efectivos", !f.NivelesEfectivos().ContainsKey(M));
    }
    // Un permiso personalizado "EDITAR" mal cargado para Faret tampoco abre el módulo.
    var forzado = Sesion("FARET", "ADMIN", "EDITAR");
    Check("FARET con permiso personalizado forzado sigue bloqueado", forzado.ValidarAccion("clasificacionPallets.list", M) != null && forzado.NivelEfectivo(M) == "SIN_ACCESO");

    var inn = Sesion("INNPACK", "calidad");
    Check("INNPACK lo incluye en sus niveles efectivos", inn.NivelesEfectivos().ContainsKey(M));
    Check("matriz de permisos: solo INNPACK", PermisosService.ModulosPersonalizables("INNPACK").Contains(M) && !PermisosService.ModulosPersonalizables("FARET").Contains(M));

    var sinSesion = new PermisosService();
    Check("sin sesión: rechazada", sinSesion.ValidarAccion("clasificacionPallets.list", M) != null);
}

Console.WriteLine("== Regresión de permisos existentes ==");
{
    var edit = Sesion("INNPACK", "calidad");
    Check("productoTerminado.list sigue permitido", edit.ValidarAccion("productoTerminado.list", "producto-terminado") == null);
    Check("adminPlanta.list sigue bloqueado por rol", edit.ValidarAccion("adminPlanta.list", "admin-planta") != null);
    Check("dashboard.obtenerResumen sigue permitido", edit.ValidarAccion("dashboard.obtenerResumen", "dashboard") == null);
    var f = Sesion("FARET", "ADMIN");
    Check("faret-producto-terminado sigue operando en Faret", f.ValidarAccion("productoTerminado.list", "faret-producto-terminado") == null);
    Check("EsLectura: acciones de otros módulos sin cambios", !PermisosService.EsLectura("productoTerminado.eliminar") && PermisosService.EsLectura("clasificacionPallets.defectos") && !PermisosService.EsLectura("clasificacionPallets.anular"));
}

// Opcional (`dotnet run -- --produccion-solo-lectura`): el Handler real contra la API publicada. SOLO lecturas (GET), sin token,
// sin escribir nada; confirma que las consultas que arma el Handler son aceptadas por la API desplegada y su forma de respuesta.
if (args.Contains("--produccion-solo-lectura"))
{
    Console.WriteLine("== Producción (solo lectura, GET) ==");
    var prod = new FaretApiClient(new FaretApiSettings { BaseUrl = "https://api.faret.cl/calidad/api", UseApi = true });
    var hp = new ClasificacionPalletsHandler(prod, "INNPACK");
    async Task<JsonElement> Leer(string accion, object data)
    {
        var r = await hp.Handle(accion, Payload(data));
        return JsonDocument.Parse(r).RootElement.Clone();
    }
    var f = new { desde = "2026-11-01", color = "ROJO", procesoId = 3, vista = "eventos", incluirAnuladas = true, pagina = 1, limite = 50 };
    var rl = await Leer("clasificacionPallets.list", f);
    Check("PROD list: ok y forma { total, items[] }", rl.GetProperty("ok").GetBoolean() && rl.GetProperty("data").TryGetProperty("items", out _) && rl.GetProperty("data").TryGetProperty("total", out _), rl.ToString());
    var rr = await Leer("clasificacionPallets.resumen", f);
    Check("PROD resumen: ok con totales/porProceso/porMaquina/porDia", rr.GetProperty("ok").GetBoolean() && rr.GetProperty("data").TryGetProperty("totales", out _) && rr.GetProperty("data").TryGetProperty("porDia", out _), rr.ToString());
    var rd = await Leer("clasificacionPallets.defectos", f);
    Check("PROD defectos: ok con porDefecto/sinDefecto", rd.GetProperty("ok").GetBoolean() && rd.GetProperty("data").TryGetProperty("porDefecto", out _), rd.ToString());
    var rn = await Leer("clasificacionPallets.detalle", new { id = 2000000000 });
    Check("PROD detalle inexistente: error legible de la API", !rn.GetProperty("ok").GetBoolean() && rn.GetProperty("error").GetString() == "Clasificación no encontrada.", rn.ToString());
    Console.WriteLine($"   (datos reales hoy: {rl.GetProperty("data").GetProperty("total")} clasificaciones con ese filtro)");
}

listener.Stop();
Console.WriteLine($"\nRESULTADO: {ok} OK, {fallas} FALLAS");
return fallas == 0 ? 0 : 1;
