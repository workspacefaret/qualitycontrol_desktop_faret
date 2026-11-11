// Fase 42 — pruebas del handler REAL (con caché/single-flight/cancelación) contra Data y FPS SIMULADOS locales. Nunca producción.
using System.Diagnostics;
using System.Text.Json;
using QualityControlCenter.Backend.Services.FaretApi;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Modules.EvaluacionOperadores;

var mock = "http://127.0.0.1:39500";
var admin = new HttpClient();
var salida = Console.Out;
Console.SetOut(TextWriter.Null);
void P(string s) => salida.WriteLine(s);
int pass = 0, fail = 0;
void Check(string n, bool ok) { if (ok) pass++; else fail++; P($"  {(ok ? "PASS" : "FAIL")} {n}"); }
async Task Cfg(int latencia, int pnc, string modo = "ok") { await admin.GetStringAsync($"{mock}/__cfg?latency={latencia}&mode={modo}&pnc={pnc}"); await admin.GetStringAsync($"{mock}/__reset"); }
async Task<(int fps, int data, int max, long bytes)> S() { var j = JsonDocument.Parse(await admin.GetStringAsync($"{mock}/__stats")).RootElement; return (j.GetProperty("total").GetInt32(), j.GetProperty("dataTotal").GetInt32(), j.GetProperty("maxInflight").GetInt32(), j.GetProperty("bytes").GetInt64()); }
FaretApiClient Faret() { var c = new FaretApiClient(new FaretApiSettings { BaseUrl = mock, UseApi = true }); c.SetToken("t"); return c; }
FpsSesionesApiService Fps() => new(new FpsApiClient(new FpsApiSettings { BaseUrl = mock, UseApi = true, ApiKey = "x" }));
FaretEvaluacionOperadoresHandler H(FaretUniversoCache c, bool nombres = false) => new(Faret(), Fps(), nombres, c);
Dictionary<string, object> Pl(string json = "{}") => JsonSerializer.Deserialize<Dictionary<string, object>>(json)!;
async Task<JsonElement> Llamar(FaretEvaluacionOperadoresHandler h, string json = "{}") => JsonDocument.Parse(await h.Handle("faret.evaluacionOperadores.resumen", Pl(json))).RootElement.Clone();
string Origen(JsonElement r) => r.GetProperty("data").TryGetProperty("cache", out var c) ? c.GetProperty("origen").GetString()! : "-";
string Estado(JsonElement r) => r.GetProperty("ok").GetBoolean() ? r.GetProperty("data").GetProperty("fps").GetProperty("estado").GetString()! : "ERROR_DATA";
int Filtradas(JsonElement r) => r.GetProperty("data").GetProperty("resultado").GetProperty("totales").GetProperty("filtradas").GetInt32();
var filtros = new[] { "{\"anio\":2026}", "{\"anio\":2026,\"mes\":10}", "{\"maquina\":\"MAQ 3\"}", "{\"turno\":\"A\"}", "{\"turno\":\"B\"}", "{\"area\":\"Pegado\"}", "{\"operador\":\"x\"}", "{\"anio\":2026,\"turno\":\"C\"}", "{}", "{\"mes\":10}" };

P("== 1. Carga inicial + 10 cambios de filtro por tamaño (FPS 100 ms/solicitud). ANTES (Fase 41) cada cambio repetía la carga completa");
foreach (var pnc in new[] { 100, 354, 500, 1000, 2300 })
{
    await Cfg(100, pnc); var cache = new FaretUniversoCache(); var h = H(cache);
    var sw = Stopwatch.StartNew(); var m0 = GC.GetTotalAllocatedBytes(true);
    var r0 = await Llamar(h); sw.Stop(); var s0 = await S();
    var cargaMs = sw.ElapsedMilliseconds;
    sw.Restart(); foreach (var f in filtros) await Llamar(h, f); sw.Stop(); var s1 = await S();
    var antes = (s0.fps + s0.data) * (1 + filtros.Length);
    P($"  PNC={pnc,5}: carga inicial: FPS={s0.fps,3} Data={s0.data} {s0.bytes / 1048576.0,5:F1} MB {cargaMs,5} ms | 10 filtros: +FPS={s1.fps - s0.fps} +Data={s1.data - s0.data} en {sw.ElapsedMilliseconds} ms | solicitudes antes={antes} ahora={s1.fps + s1.data}");
    Check($"{pnc} PNC: estado OK y 0 solicitudes extra al cambiar filtros", Estado(r0) == "OK" && s1.fps == s0.fps && s1.data == s0.data);
}

P("== 2. Volumen sobre el límite (5.000 PNC ≈ 3.226 NP > 1.500): no se consulta FPS");
await Cfg(100, 5000); { var h = H(new FaretUniversoCache()); var r = await Llamar(h); var s = await S();
  Check("estado LIMITE_VOLUMEN", Estado(r) == "LIMITE_VOLUMEN"); P($"     solicitudes a FPS={s.fps} (Data={s.data} páginas); motivo: {r.GetProperty("data").GetProperty("fps").GetProperty("motivo").GetString()![..70]}…");
  Check("0 solicitudes a FPS", s.fps == 0); }

P("== 3. Cambios rápidos con la caché fría (6 solicitudes simultáneas durante la primera carga)");
await Cfg(300, 354); { var cache = new FaretUniversoCache(); var h = H(cache);
  var rs = await Task.WhenAll(Enumerable.Range(0, 6).Select(i => Llamar(H(cache), filtros[i]))); var s = await S();
  P($"     solicitudes FPS={s.fps} Data={s.data} max simultáneas en FPS={s.max} cargas reales iniciadas={cache.Cargas}");
  Check("una sola carga real (5 lotes FPS, 1 página Data)", cache.Cargas == 1 && s.fps == 5 && s.data == 1 && s.max == 1);
  Check("las 6 respuestas OK", rs.All(r => Estado(r) == "OK")); }

P("== 4. Navegación repetida (abrir el módulo 5 veces: handler nuevo cada vez, como hace el router)");
await Cfg(100, 354); { var cache = new FaretUniversoCache(); await Llamar(H(cache)); var s0 = await S();
  for (int i = 0; i < 5; i++) await Llamar(H(cache)); var s1 = await S();
  Check("0 solicitudes extra", s1.fps == s0.fps && s1.data == s0.data && cache.Cargas == 1); }

P("== 5. Resultados identicos a la implementacion anterior (atribucion sin cambios, mismo codigo del motor)");
await Cfg(50, 354);
foreach (var nombres in new[] { false, true })
{
    var cache = new FaretUniversoCache(); var h = H(cache, nombres);
    // referencia: flujo antiguo (Data completa -> FPS -> atribuir -> Construir con filtros)
    var (_, body) = await new FaretImportacionApiService(Faret()).GetPncListAsync(new() { ["page"] = "1", ["pageSize"] = "500" });
    FaretEvaluacionOperadoresParser.TryParsePagina(body, out var filas, out _, out _);
    var (_, datos, _) = await Fps().ObtenerAsync(filas.Select(f => long.TryParse(f.Referencia, out var n) ? n : 0).Where(n => n > 0));
    var res = filas.Select(f => FaretAtribucionFps.Atribuir(new FaretAtribucionFps.PncEntrada(f.Id, f.Referencia, f.Nivel, f.Maquina, f.Area, f.FechaFabricacion, f.Operador), datos)).ToList();
    var igual = 0; var total = 0;
    foreach (var f in filtros.Take(8))
    {
        var j = JsonDocument.Parse(f).RootElement;
        int? anio = j.TryGetProperty("anio", out var a) ? a.GetInt32() : null, mes = j.TryGetProperty("mes", out var m) ? m.GetInt32() : null;
        string? maq = j.TryGetProperty("maquina", out var mq) ? mq.GetString() : null, ar = j.TryGetProperty("area", out var arr) ? arr.GetString() : null, tu = j.TryGetProperty("turno", out var t) ? t.GetString() : null, op = j.TryGetProperty("operador", out var o) ? o.GetString() : null;
        var esperado = JsonSerializer.Serialize(FaretEvaluacionFpsResumen.Construir(res, new FiltrosFps(anio, mes, maq, ar, tu, op), nombres), new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        var r = await Llamar(h, f); total++;
        if (r.GetProperty("data").GetProperty("resultado").GetRawText() == esperado) igual++;
    }
    Check($"verNombres={nombres}: {igual}/{total} resultados con filtros identicos al flujo anterior", igual == total);
    var texto = (await h.Handle("faret.evaluacionOperadores.resumen", Pl()));
    Check($"verNombres={nombres}: nombres FPS {(nombres ? "visibles" : "ocultos")}", texto.Contains("Operador Sintetico") == nombres);
}

P("== 6. FPS lento con tiempo maximo global (3 s; 2 s por solicitud) y sin tormenta de reintentos");
await Cfg(2000, 354); { var cache = new FaretUniversoCache { TiempoMaximoCarga = TimeSpan.FromSeconds(3) }; var h = H(cache);
  var sw = Stopwatch.StartNew(); var r = await Llamar(h); sw.Stop(); var s0 = await S();
  P($"     estado={Estado(r)} tras {sw.ElapsedMilliseconds} ms; solicitudes FPS={s0.fps}");
  Check("TIMEOUT cerca de 3 s (no 10 s)", Estado(r) == "TIMEOUT" && sw.ElapsedMilliseconds < 4500);
  for (int i = 0; i < 6; i++) { var rr = await Llamar(h, filtros[i]); Check("repeticion dentro de la espera: origen ERROR_RECIENTE", Origen(rr) == "ERROR_RECIENTE"); }
  var s1 = await S(); Check("0 solicitudes nuevas a FPS/Data tras el timeout", s1.fps == s0.fps && s1.data == s0.data); }

P("== 7. Cancelacion durante la carga (1 s por solicitud, 5 lotes)");
await Cfg(1000, 354); { var cache = new FaretUniversoCache(); var h = H(cache);
  var tarea = Llamar(h); await Task.Delay(1500);
  var c = JsonDocument.Parse(await H(cache).Handle("faret.evaluacionOperadores.cancelar", Pl())).RootElement;
  var sw = Stopwatch.StartNew(); var r = await tarea; sw.Stop(); var s0 = await S();
  P($"     cancelada={c.GetProperty("data").GetProperty("cancelada").GetBoolean()} estado={Estado(r)} solicitudes FPS enviadas={s0.fps} (de 5) en {sw.ElapsedMilliseconds} ms tras cancelar");
  Check("estado CANCELADO, sin resultado ni cache", Estado(r) == "CANCELADO" && cache.Actual is null);
  Check("se corto la carga (menos de 5 lotes enviados)", s0.fps < 5);
  var sinCarga = JsonDocument.Parse(await H(cache).Handle("faret.evaluacionOperadores.cancelar", Pl())).RootElement;
  Check("cancelar sin carga en curso: cancelada=false", !sinCarga.GetProperty("data").GetProperty("cancelada").GetBoolean());
  await Cfg(50, 354); var r2 = await Llamar(h); Check("tras cancelar, una nueva carga funciona y queda consistente", Estado(r2) == "OK" && Origen(r2) == "NUEVA"); }

P("== 8. Errores HTTP: sin reintentos masivos (reloj simulado)");
foreach (var modo in new[] { "500", "404" })
{
    await Cfg(50, 354, modo); var t = DateTime.UtcNow; var cache = new FaretUniversoCache(); cache.UsarReloj(() => t); var h = H(cache);
    var r = await Llamar(h); var s0 = await S();
    for (int i = 0; i < 6; i++) await Llamar(h, filtros[i]);
    await Llamar(h, "{\"actualizar\":true}"); await Llamar(h, "{\"actualizar\":true}");
    var s1 = await S();
    P($"     modo {modo}: estado={Estado(r)}, solicitudes FPS={s0.fps} -> tras 6 filtros + 2 'Actualizar' seguidos: {s1.fps} (cargas={cache.Cargas})");
    Check($"{modo}: 1 sola solicitud en total", s1.fps == 1 && cache.Cargas == 1);
    await Cfg(50, 354); t = t.AddSeconds(31); var r3 = await Llamar(h, "{\"actualizar\":true}");
    Check($"{modo}: pasada la espera y recuperado FPS, 'Actualizar' carga bien", Estado(r3) == "OK" && cache.Cargas == 2);
}

P("== 9. Actualizacion manual y vigencia");
await Cfg(50, 354); { var t = DateTime.UtcNow; var cache = new FaretUniversoCache(); cache.UsarReloj(() => t); var h = H(cache);
  await Llamar(h); var s0 = await S();
  for (int i = 0; i < 3; i++) { var r = await Llamar(h, "{\"actualizar\":true}"); Check("'Actualizar' repetido dentro de 15 s se sirve de cache", Origen(r) == "CACHE"); }
  Check("0 solicitudes extra por 3 'Actualizar' seguidos", (await S()).fps == s0.fps);
  t = t.AddSeconds(16); var rN = await Llamar(h, "{\"actualizar\":true}"); var s1 = await S();
  Check("pasados 16 s, 'Actualizar' recarga (origen NUEVA, +5 lotes)", Origen(rN) == "NUEVA" && s1.fps == s0.fps + 5);
  t = t.AddMinutes(11); var rV = await Llamar(h); Check("vencida la vigencia (10 min) se recarga sola, nunca se sirve vencida", Origen(rV) == "NUEVA" && cache.Cargas == 3); }

P("== 10. Cambio de usuario/permisos y de sesion: la cache no se comparte");
await Cfg(50, 354); { var cache = new FaretUniversoCache();
  await Llamar(H(cache, false)); await Llamar(H(cache, true)); Check("otro nivel de permiso = carga propia (2 cargas)", cache.Cargas == 2);
  await Llamar(H(cache, false)); Check("volver al nivel anterior no reutiliza datos del otro (3 cargas)", cache.Cargas == 3);
  cache.Invalidar(); var r = await Llamar(H(cache, false)); Check("cambio/cierre de sesion (token) invalida la cache", Origen(r) == "NUEVA" && cache.Cargas == 4); }

P("== 11. Varios usuarios a la vez (cada QCC tiene su propia cache; no se comparte entre equipos)");
await Cfg(100, 354); { var caches = Enumerable.Range(0, 10).Select(_ => new FaretUniversoCache()).ToList();
  await Task.WhenAll(caches.Select(async c => { var h = H(c); await Llamar(h); foreach (var f in filtros) await Llamar(h, f); })); var s = await S();
  var antes = 10 * (1 + filtros.Length) * 5;
  P($"     10 usuarios, cada uno abre el modulo y cambia 10 filtros: solicitudes FPS ahora={s.fps} (antes={antes}), max simultaneas={s.max}");
  Check("10 usuarios = 50 solicitudes (5 por usuario) en vez de 550", s.fps == 50); }

P("== 12. Memoria con el universo cacheado (2.300 PNC, maximo permitido)");
await Cfg(50, 2300); { var m0 = GC.GetTotalMemory(true); var cache = new FaretUniversoCache(); var h = H(cache); await Llamar(h); foreach (var f in filtros) await Llamar(h, f);
  var m1 = GC.GetTotalMemory(true); P($"     retenido por la cache ~ {(m1 - m0) / 1048576.0:F1} MB (sesiones: {cache.Actual!.Sesiones}, PNC: {cache.Actual.Resultados.Count})"); Check("memoria retenida < 150 MB", (m1 - m0) < 150L * 1048576); GC.KeepAlive(cache); }

P($"\nRESULTADO: {pass} PASS, {fail} FAIL");
Environment.Exit(fail == 0 ? 0 : 1);
