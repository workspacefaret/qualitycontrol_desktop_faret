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


var proc = Process.GetCurrentProcess();
double Cpu() { proc.Refresh(); return proc.TotalProcessorTime.TotalMilliseconds; }
double Mb(long b) => b / 1048576.0;
int Pnc(int np) => (int)Math.Ceiling(np * 1.55); // el simulador reparte ~1,55 PNC por NP (npNv = 1000 + i/1.55)
int NpDe(int pnc) { var s = new HashSet<int>(); for (int i = 0; i < pnc; i++) s.Add(1000 + (int)Math.Floor(i / 1.55)); return s.Count; }

P("== A. Rendimiento por tamano (NP): carga inicial + 10 filtros; CPU del proceso QCC y memoria");
foreach (var np in new[] { 100, 354, 500, 1000, 1500 })
{
    var pnc = Pnc(np); var npReal = NpDe(pnc);
    await Cfg(100, pnc); var cache = new FaretUniversoCache(); var h = H(cache);
    GC.Collect(); GC.WaitForPendingFinalizers(); GC.Collect(); var mem0 = GC.GetTotalMemory(true); var cpu0 = Cpu();
    var sw = Stopwatch.StartNew(); var r0 = await Llamar(h); sw.Stop(); var s0 = await S(); var cpu1 = Cpu(); var ws = proc.WorkingSet64; var cargaMs = sw.ElapsedMilliseconds;
    var mem1 = GC.GetTotalMemory(true);
    sw.Restart(); foreach (var f in filtros) await Llamar(h, f); sw.Stop(); var s1 = await S(); var cpu2 = Cpu();
    var esperadoFps = (int)Math.Ceiling(npReal / 50.0);
    P($"  NP={npReal,5} (PNC={pnc,5}): carga {cargaMs,5} ms, CPU {cpu1 - cpu0,6:F0} ms, FPS={s0.fps,3} (esperado {esperadoFps}) Data={s0.data}, {Mb(s0.bytes):F1} MB recibidos, retenido {Mb(mem1 - mem0):F0} MB, WS {Mb(ws):F0} MB | 10 filtros: +FPS={s1.fps - s0.fps} +Data={s1.data - s0.data} {sw.ElapsedMilliseconds} ms CPU {cpu2 - cpu1:F0} ms");
    Check($"{npReal} NP: OK, {esperadoFps} lotes FPS, 0 solicitudes extra en 10 filtros", Estado(r0) == "OK" && s0.fps == esperadoFps && s1.fps == s0.fps && s1.data == s0.data);
}

P("== B. Limite exacto: 1.500 NP aceptado, 1.501 NP rechazado sin tocar FPS");
{
    await Cfg(50, 2325); var np1 = NpDe(2325); var r = await Llamar(H(new FaretUniversoCache())); var s = await S();
    Check($"{np1} NP aceptado (FPS={s.fps})", np1 == 1500 && Estado(r) == "OK");
    await Cfg(50, 2327); var np2 = NpDe(2327); var r2 = await Llamar(H(new FaretUniversoCache())); var s2 = await S();
    Check($"{np2} NP rechazado por LIMITE_VOLUMEN con 0 solicitudes a FPS", np2 == 1501 && Estado(r2) == "LIMITE_VOLUMEN" && s2.fps == 0);
    await Cfg(50, 5000); var r3 = await Llamar(H(new FaretUniversoCache())); var s3 = await S();
    Check("5.000 PNC rechazado, 0 solicitudes a FPS", Estado(r3) == "LIMITE_VOLUMEN" && s3.fps == 0);
}

P("== C. Cambio de permiso con una carga en vuelo (A -> B): A queda CANCELADA (no TIMEOUT), B carga, nada de A en cache");
{
    await Cfg(300, 354); var cache = new FaretUniversoCache();
    var ta = Llamar(H(cache, false)); await Task.Delay(400);
    var rb = await Llamar(H(cache, true)); var ra = await ta;
    P($"     A={Estado(ra)} B={Estado(rb)} cargas={cache.Cargas}");
    Check("la carga A termina CANCELADO (no TIMEOUT ni OK)", Estado(ra) == "CANCELADO");
    Check("B (nombres) OK y nombresVisibles=true", Estado(rb) == "OK" && rb.GetProperty("data").GetProperty("nombresVisibles").GetBoolean());
    var rb2 = await Llamar(H(cache, true)); Check("B sirve desde cache", Origen(rb2) == "CACHE");
    var ra2 = await Llamar(H(cache, false)); Check("volver a A no reutiliza nada (carga nueva)", Origen(ra2) == "NUEVA" && !ra2.GetProperty("data").GetProperty("nombresVisibles").GetBoolean());
}

P("== D. Cierre de sesion (Invalidar) con una carga que IGNORA la cancelacion: su resultado no se guarda ni se comparte");
{
    var cache = new FaretUniversoCache(); var u = new FaretUniversoCache.Universo(new(), 1, 1, 1, DateTime.UtcNow);
    var libera = new TaskCompletionSource(); int llamadas = 0;
    async Task<FaretUniversoCache.Carga> Terca(CancellationToken ct) { Interlocked.Increment(ref llamadas); await libera.Task; return new("OK", u, null); }
    var t1 = cache.ObtenerAsync("K", false, Terca); await Task.Delay(100);
    cache.Invalidar();
    var t2 = cache.ObtenerAsync("K", false, Terca);
    await Task.Delay(100); libera.SetResult(); var r1 = await t1; var r2 = await t2;
    P($"     cargas reales={cache.Cargas}, r1={r1.Estado}/{r1.Origen}, r2={r2.Estado}/{r2.Origen}, llamadas al origen={llamadas}");
    Check("la sesion nueva NO se une a la carga de la sesion anterior (2 cargas)", cache.Cargas == 2 && llamadas == 2);
    var r3 = await cache.ObtenerAsync("K", false, Terca); Check("solo la carga vigente queda en cache (CACHE sin nueva carga)", r3.Origen == "CACHE" && cache.Cargas == 2);
    cache.Invalidar(); var r4 = await cache.ObtenerAsync("K", false, Terca); Check("tras Invalidar no se sirve nada guardado", r4.Origen == "NUEVA" && cache.Cargas == 3);
}

P("== E. 20 llamadas simultaneas en frio + Cancelar: todas CANCELADO, sin carga huerfana");
{
    await Cfg(500, 1000); var cache = new FaretUniversoCache();
    var ts = Enumerable.Range(0, 20).Select(_ => Llamar(H(cache))).ToList(); await Task.Delay(700);
    var c = cache.Cancelar(); var rs = await Task.WhenAll(ts); var s = await S();
    P($"     cancelar={c} FPS enviadas={s.fps} cargas={cache.Cargas} en curso={cache.HayCargaEnCurso}");
    Check("las 20 respuestas son CANCELADO", rs.All(r => Estado(r) == "CANCELADO"));
    Check("una sola carga, ya sin actividad", cache.Cargas == 1 && !cache.HayCargaEnCurso && cache.Actual is null);
    await Cfg(0, 1000); var ok = await Llamar(H(cache)); Check("la carga siguiente funciona", Estado(ok) == "OK");
}

P("== F. Fuga de memoria: 60 ciclos (invalidar + recargar 354 PNC); memoria retenida estable");
{
    await Cfg(0, 354); var cache = new FaretUniversoCache(); var h = H(cache);
    long Retenida() { GC.Collect(); GC.WaitForPendingFinalizers(); GC.Collect(); return GC.GetTotalMemory(true); }
    for (int i = 0; i < 10; i++) { cache.Invalidar(); await Llamar(h); }
    var base0 = Retenida();
    for (int i = 0; i < 60; i++) { cache.Invalidar(); await Llamar(h); }
    var fin = Retenida();
    P($"     retenida tras 10 ciclos {Mb(base0):F1} MB; tras 70 ciclos {Mb(fin):F1} MB (delta {Mb(fin - base0):F1} MB)");
    Check("delta < 10 MB tras 60 ciclos mas", fin - base0 < 10 * 1048576);
}

P("== G. 10 usuarios simultaneos (10 caches independientes en un mismo proceso = cota superior), 1.000 PNC cada uno");
{
    await Cfg(100, 1000); GC.Collect(); var cpu0 = Cpu(); var sw = Stopwatch.StartNew();
    var caches = Enumerable.Range(0, 10).Select(_ => new FaretUniversoCache()).ToList();
    var rs = await Task.WhenAll(caches.Select(c => Llamar(H(c)))); sw.Stop(); var s = await S();
    P($"     {sw.ElapsedMilliseconds} ms, CPU {Cpu() - cpu0:F0} ms, FPS={s.fps}, simultaneas max={s.max}, WS {Mb(proc.WorkingSet64):F0} MB");
    Check("10 cargas OK, 13 lotes cada una", rs.All(r => Estado(r) == "OK") && s.fps == 130);
}

P("== H. FPS no disponible: mensajes y sin reintentos");
{
    await Cfg(0, 354, "500"); var c = new FaretUniversoCache(); var r = await Llamar(H(c)); var s = await S();
    var mot = r.GetProperty("data").GetProperty("fps").GetProperty("motivo").GetString();
    P($"     500 -> estado={Estado(r)} solicitudes={s.fps} motivo={mot}");
    Check("FPS 500: 1 solicitud, estado informado y sin cifras", s.fps == 1 && Estado(r) != "OK" && r.GetProperty("data").GetProperty("resultado").ValueKind == JsonValueKind.Null);
    var r2 = await Llamar(H(c)); var s2 = await S(); Check("repetir no reintenta (ERROR_RECIENTE)", s2.fps == 1 && Origen(r2) == "ERROR_RECIENTE");
}

P($"\nRESULTADO: {pass} PASS, {fail} FAIL");
return fail == 0 ? 0 : 1;
