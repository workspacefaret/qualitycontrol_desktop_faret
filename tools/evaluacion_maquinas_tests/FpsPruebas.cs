using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using QualityControlCenter.Backend.Services.FaretApi;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Modules.EvaluacionMaquinas;
using QualityControlCenter.Services;

// Pruebas de la integración FPS para Pallet/Papel. Datos 100% SINTÉTICOS; servidor HTTP local simulado.
public static class FpsPruebas
{
    private static int Puerto() { var l = new TcpListener(IPAddress.Loopback, 0); l.Start(); var p = ((IPEndPoint)l.LocalEndpoint).Port; l.Stop(); return p; }

    private static SesionFps S(int maq, string op, string ini, string? fin) =>
        new(maq, op, DateTime.Parse(ini), fin is null ? null : DateTime.Parse(fin));

    private static ResultadoAtribucion Cl(string maquina, string fecha, string hora, params SesionFps[] ses) =>
        PalletAtribucionFps.Clasificar(new RegistroPallet(1, maquina, fecha, hora), PalletAtribucionFps.AgruparPorMaquina(ses));

    public delegate void Comprobar(string nombre, bool ok, string detalle = "");

    public static async Task Run(Comprobar check)
    {
        // ── Equivalencias ──
        var ver = PalletMaquinaEquivalencias.Todas.Where(e => e.Verificada).ToList();
        var pen = PalletMaquinaEquivalencias.Todas.Where(e => !e.Verificada).ToList();
        check("Equivalencias: 22 verificadas y 9 pendientes documentadas", ver.Count == 22 && pen.Count == 9 && pen.All(e => !string.IsNullOrWhiteSpace(e.Nota)), $"{ver.Count}/{pen.Count}");
        check("Equivalencias: las verificadas tienen nombre idéntico al de FPS", ver.All(e => PalletMaquinaEquivalencias.Normalizar(e.NombrePallet) == PalletMaquinaEquivalencias.Normalizar(e.NombreFps)));
        check("Equivalencias: las pendientes tienen nombre distinto (ninguna se cuela como verificada)", pen.All(e => PalletMaquinaEquivalencias.Normalizar(e.NombrePallet) != PalletMaquinaEquivalencias.Normalizar(e.NombreFps)));
        check("Equivalencias: sin aplatz_id repetido entre las verificadas", ver.Select(e => e.AplatzId).Distinct().Count() == ver.Count);
        check("Equivalencias: ' diana  3 ' → 15 (solo espacios/mayúsculas)", PalletMaquinaEquivalencias.ResolverVerificada(" diana  3 ") == 15);
        check("Equivalencias: pendiente (SIRYUS), desconocida y vacía → null", PalletMaquinaEquivalencias.ResolverVerificada("SIRYUS") == null
            && PalletMaquinaEquivalencias.ResolverVerificada("MAQUINA NUEVA") == null && PalletMaquinaEquivalencias.ResolverVerificada("") == null && PalletMaquinaEquivalencias.ResolverVerificada(null) == null);
        check("Equivalencias: parecido NO basta ('DIANA 33', 'DIANA PRO')", PalletMaquinaEquivalencias.ResolverVerificada("DIANA 33") == null && PalletMaquinaEquivalencias.ResolverVerificada("DIANA PRO") == null);

        // ── Clasificador ──
        var u = Cl("DIANA 3", "2026-01-05", "10:00:00", S(15, "A", "2026-01-05 06:00", "2026-01-05 14:00"));
        check("Clasif.: sesión única compatible → Confiable con su operador", u.Clase == ClaseAtribucion.Confiable && u.IdOperador == "A" && u.Motivo == "sesion_unica_compatible", u.ToString());
        var misma = Cl("DIANA 3", "2026-01-05", "10:00:00", S(15, "A", "2026-01-05 06:00", "2026-01-05 14:00"), S(15, "A", "2026-01-05 09:00", "2026-01-05 12:00"));
        check("Clasif.: sesiones solapadas del MISMO operador → Confiable", misma.Clase == ClaseAtribucion.Confiable && misma.IdOperador == "A", misma.ToString());
        var dos = Cl("DIANA 3", "2026-01-05", "10:00:00", S(15, "A", "2026-01-05 06:00", "2026-01-05 14:00"), S(15, "B", "2026-01-05 08:00", "2026-01-05 12:00"));
        check("Clasif.: dos operadores a la vez → Probable, SIN operador atribuido", dos.Clase == ClaseAtribucion.Probable && dos.IdOperador == null && dos.Motivo == "varios_operadores_simultaneos", dos.ToString());
        var larga = Cl("DIANA 3", "2026-01-12", "10:00:00", S(15, "D", "2026-01-10 00:00", "2026-01-14 00:00"));
        check("Clasif.: solo sesión prolongada (> 16 h) → Probable, sin operador", larga.Clase == ClaseAtribucion.Probable && larga.IdOperador == null && larga.Motivo == "solo_sesion_prolongada", larga.ToString());
        var cortaLarga = Cl("DIANA 3", "2026-01-12", "10:00:00", S(15, "A", "2026-01-12 06:00", "2026-01-12 14:00"), S(15, "D", "2026-01-10 00:00", "2026-01-14 00:00"));
        check("Clasif.: corta + larga solapadas → Probable (no atribuye)", cortaLarga.Clase == ClaseAtribucion.Probable && cortaLarga.IdOperador == null, cortaLarga.ToString());
        var turno = Cl("DIANA 3", "2026-01-05", "13:50:00", S(15, "A", "2026-01-05 06:00", "2026-01-05 14:00"), S(15, "B", "2026-01-05 14:10", "2026-01-05 22:00"));
        check("Clasif.: cambio de turno a ≤ 30 min → Probable, sin operador", turno.Clase == ClaseAtribucion.Probable && turno.Motivo == "cambio_de_operador_cercano" && turno.IdOperador == null, turno.ToString());
        var lejos = Cl("DIANA 3", "2026-01-05", "10:00:00", S(15, "A", "2026-01-05 06:00", "2026-01-05 14:00"), S(15, "B", "2026-01-05 14:10", "2026-01-05 22:00"));
        check("Clasif.: otro operador a > 30 min del cambio → Confiable", lejos.Clase == ClaseAtribucion.Confiable && lejos.IdOperador == "A", lejos.ToString());
        var abierta = Cl("DIANA 3", "2026-01-05", "10:00:00", S(15, "A", "2026-01-05 06:00", null));
        check("Clasif.: sesión sin término reciente → Probable (incompleta), sin operador", abierta.Clase == ClaseAtribucion.Probable && abierta.Motivo == "sesion_sin_termino" && abierta.IdOperador == null, abierta.ToString());
        var abiertaVieja = Cl("DIANA 3", "2026-01-07", "10:00:00", S(15, "A", "2026-01-05 06:00", null));
        check("Clasif.: sesión sin término de > 16 h no cubre la hora → no atribuye", abiertaVieja.Clase != ClaseAtribucion.Confiable && abiertaVieja.IdOperador == null, abiertaVieja.ToString());
        var cerca = Cl("DIANA 3", "2026-01-05", "15:00:00", S(15, "A", "2026-01-05 06:00", "2026-01-05 14:00"));
        check("Clasif.: sesión terminada ≤ 2 h antes → Probable (sesion_cercana_fuera_de_ventana)", cerca.Clase == ClaseAtribucion.Probable && cerca.Motivo == "sesion_cercana_fuera_de_ventana" && cerca.IdOperador == null, cerca.ToString());
        var lejana = Cl("DIANA 3", "2026-01-05", "20:00:00", S(15, "A", "2026-01-05 06:00", "2026-01-05 14:00"));
        check("Clasif.: sin sesión a esa hora → Sin identificación", lejana.Clase == ClaseAtribucion.SinIdentificacion && lejana.Motivo == "sin_sesion_en_la_hora", lejana.ToString());
        check("Clasif.: sin máquina → Sin", Cl("", "2026-01-05", "10:00:00").Motivo == "sin_maquina");
        check("Clasif.: sin fecha/hora válida → Sin", Cl("DIANA 3", "", "10:00:00").Motivo == "sin_fecha_hora" && Cl("DIANA 3", "fecha-mala", "x").Clase == ClaseAtribucion.SinIdentificacion);
        var pend = Cl("SIRYUS", "2026-01-05", "10:00:00", S(86, "A", "2026-01-05 06:00", "2026-01-05 14:00"));
        check("Clasif.: máquina con equivalencia PENDIENTE no atribuye aunque exista sesión", pend.Clase == ClaseAtribucion.SinIdentificacion && pend.Motivo == "maquina_sin_equivalencia_verificada" && pend.IdOperador == null, pend.ToString());
        var sinSes = Cl("DIANA 3", "2026-01-05", "10:00:00", S(17, "A", "2026-01-05 06:00", "2026-01-05 14:00"));
        check("Clasif.: sesiones de OTRA máquina no cuentan", sinSes.Clase == ClaseAtribucion.SinIdentificacion && sinSes.Motivo == "maquina_sin_sesiones_fps", sinSes.ToString());
        var dias = new[] { S(15, "A", "2026-01-05 06:00", "2026-01-05 14:00"), S(15, "B", "2026-01-06 06:00", "2026-01-06 14:00") };
        check("Clasif.: operadores distintos en días distintos → cada inspección su operador",
            Cl("DIANA 3", "2026-01-05", "08:00:00", dias).IdOperador == "A" && Cl("DIANA 3", "2026-01-06", "08:00:00", dias).IdOperador == "B");
        var iso = Cl("DIANA 3", "2026-01-05T00:00:00.000Z", "1970-01-01T10:30:00.000Z", S(15, "A", "2026-01-05 06:00", "2026-01-05 14:00"));
        check("Clasif.: acepta fecha/hora en formato ISO (como la API calidad)", iso.Clase == ClaseAtribucion.Confiable, iso.ToString());
        // Efecto de haber quitado el filtro por ProductionEndDate en el endpoint: llegan sesiones que terminaron ANTES del período.
        // Nunca deben cambiar una atribución cuando están lejos, y solo pueden volverla más conservadora cuando están cerca.
        var base1 = new[] { S(15, "A", "2026-01-05 06:00", "2026-01-05 14:00") };
        var conViejas = base1.Concat(new[] { S(15, "Z", "2026-01-01 06:00", "2026-01-01 14:00"), S(15, "Y", "2025-12-20 06:00", "2025-12-20 14:00") }).ToArray();
        var rBase = Cl("DIANA 3", "2026-01-05", "10:00:00", base1);
        var rViejas = Cl("DIANA 3", "2026-01-05", "10:00:00", conViejas);
        check("Sesiones que terminaron antes del período (sin filtro de término) no alteran la atribución", rBase.Clase == rViejas.Clase && rBase.IdOperador == rViejas.IdOperador && rViejas.IdOperador == "A", rViejas.ToString());
        var rCerca = Cl("DIANA 3", "2026-01-05", "06:10:00", S(15, "A", "2026-01-05 06:00", "2026-01-05 14:00"), S(15, "Z", "2026-01-04 22:00", "2026-01-05 05:50"));
        check("Una sesión previa que terminó a ≤ 30 min solo vuelve la atribución más conservadora (Probable)", rCerca.Clase == ClaseAtribucion.Probable && rCerca.IdOperador == null, rCerca.ToString());
        var rAbierta = Cl("DIANA 3", "2026-01-05", "10:00:00", S(15, "A", "2026-01-05 06:00", null), S(15, "B", "2026-01-05 05:00", "2026-01-05 05:50"));
        check("Sesión Online (fin desconocido) nunca produce 'Confiable'", rAbierta.Clase != ClaseAtribucion.Confiable && rAbierta.IdOperador == null, rAbierta.ToString());
        check("Privacidad: el modelo de sesión no guarda nombres de operadores", typeof(SesionFps).GetProperties().All(p => !p.Name.Contains("Nombre") && p.Name != "Operador"));
        var cob = PalletAtribucionFps.Contar(new[] { u, dos, lejana, larga });
        check("Cobertura: conteos y porcentajes", cob.Total == 4 && cob.Confiable == 1 && cob.Probable == 2 && cob.Sin == 1 && cob.PctConfiable == 25 && cob.PctProbable == 50 && cob.PctSin == 25);
        check("Cobertura vacía sin división por cero", PalletAtribucionFps.Contar(Array.Empty<ResultadoAtribucion>()).PctConfiable == 0);

        // ── Servicio FPS con servidor simulado ──
        var puerto = Puerto();
        var listener = new HttpListener();
        listener.Prefixes.Add($"http://127.0.0.1:{puerto}/");
        listener.Start();
        var pedidosFps = new List<string>();
        var clavesRecibidas = new List<string?>();
        string modoFps = "ok";
        string? cuerpoFijo = null;
        var servidor = Task.Run(async () =>
        {
            while (listener.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = await listener.GetContextAsync(); } catch { break; }
                var path = ctx.Request.Url!.AbsolutePath;
                var q = System.Web.HttpUtility.ParseQueryString(ctx.Request.Url.Query);
                string cuerpo; int status = 200;
                if (path.EndsWith("/sesiones-maquina"))
                {
                    pedidosFps.Add(ctx.Request.Url.Query);
                    clavesRecibidas.Add(ctx.Request.Headers["x-api-key"]);
                    if (modoFps == "404") { status = 404; cuerpo = "<pre>Cannot GET /api/produccion/sesiones-maquina</pre>"; }
                    else if (modoFps == "500") { status = 500; cuerpo = "{\"ok\":false}"; }
                    else if (cuerpoFijo != null) cuerpo = cuerpoFijo;
                    else
                    {
                        // 2 páginas: la 1.ª con cursor, la 2.ª final; repite un RecordKey en la 2.ª (debe descartarse)
                        var despues = q["despues"];
                        cuerpo = despues == null
                            ? "{\"ok\":true,\"data\":{\"sesiones\":[{\"RecordKey\":\"1\",\"IdMaquina\":15,\"IdOperador\":7,\"Operador\":\"NOMBRE SECRETO\",\"ProductionStartDate\":\"2026-01-05 06:00:00\",\"ProductionEndDate\":\"2026-01-05 14:00:00\"}],\"siguiente\":\"2026-01-05T06:00:00.000|1\"}}"
                            : "{\"ok\":true,\"data\":{\"sesiones\":[{\"RecordKey\":\"1\",\"IdMaquina\":15,\"IdOperador\":7,\"ProductionStartDate\":\"2026-01-05 06:00:00\",\"ProductionEndDate\":\"2026-01-05 14:00:00\"},"
                              + "{\"RecordKey\":\"2\",\"IdMaquina\":15,\"IdOperador\":8,\"ProductionStartDate\":\"2026-01-06 06:00:00\",\"ProductionEndDate\":null},"
                              + "{\"RecordKey\":\"3\",\"IdMaquina\":17,\"IdOperador\":9,\"ProductionStartDate\":\"2026-01-07 10:00:00\",\"ProductionEndDate\":\"2026-01-07 08:00:00\"},"
                              + "{\"RecordKey\":\"4\",\"IdMaquina\":17,\"IdOperador\":null,\"ProductionStartDate\":\"2026-01-07 10:00:00\",\"ProductionEndDate\":null},"
                              + "{\"RecordKey\":\"5\",\"IdMaquina\":15,\"IdOperador\":11,\"ProductionStartDate\":\"2026-01-20 08:00:00\",\"ProductionEndDate\":\"2026-01-20 20:00:00\",\"Online\":1}],\"siguiente\":null}}";
                    }
                }
                else if (path.EndsWith("/calidad-faret-pallet/registros"))
                {
                    var page = int.Parse(q["page"] ?? "1");
                    var items = page == 1
                        ? new[]
                        {
                            Pal(1, "DIANA 3", "2026-01-05", "10:00:00"),   // Confiable (op 7)
                            Pal(2, "DIANA 3", "2026-01-06", "07:00:00"),   // sesión sin término → Probable
                            Pal(3, "SIRYUS", "2026-01-05", "10:00:00"),    // equivalencia pendiente → Sin
                            Pal(4, "", "2026-01-05", "10:00:00"),          // sin máquina → Sin
                            Pal(5, "DIANA 3", "2025-12-01", "10:00:00"),   // fuera del período pedido → excluida
                        }
                        : Array.Empty<string>();
                    cuerpo = "{\"ok\":true,\"data\":{\"items\":[" + string.Join(",", items) + "],\"totalCount\":5,\"page\":" + page + ",\"pageSize\":200}}";
                }
                else
                {
                    cuerpo = "{\"ok\":true,\"data\":{\"items\":[],\"totalCount\":0,\"page\":1,\"pageSize\":200}}";
                }
                var bytes = Encoding.UTF8.GetBytes(cuerpo);
                ctx.Response.StatusCode = status; ctx.Response.ContentType = "application/json";
                await ctx.Response.OutputStream.WriteAsync(bytes); ctx.Response.Close();
            }
        });

        var fps = new FpsSesionesApiService(new FpsApiClient(new FpsApiSettings { BaseUrl = $"http://127.0.0.1:{puerto}/fps", UseApi = true, ApiKey = "clave-sintetica" }));
        var (est, ses, err) = await fps.ObtenerPorMaquinaAsync(new[] { 15, 17 }, new DateTime(2026, 1, 1), new DateTime(2026, 1, 31));
        check("Servicio FPS: pagina por cursor y descarta RecordKey repetido", est == "OK" && pedidosFps.Count == 2 && ses.Count == 4, $"{est} pedidos={pedidosFps.Count} ses={ses.Count} {err}");
        check("Servicio FPS: la 2.ª página envía el cursor 'despues'", pedidosFps.Count == 2 && !pedidosFps[0].Contains("despues=") && pedidosFps[1].Contains("despues=2026-01-05T06%3A00%3A00.000%7C1"), string.Join(" ; ", pedidosFps));
        check("Servicio FPS: envía x-api-key y los filtros esperados (maquina, desde, hasta, limite)", clavesRecibidas.All(k => k == "clave-sintetica")
            && pedidosFps[0].Contains("maquina=15,17") && pedidosFps[0].Contains("desde=2026-01-01") && pedidosFps[0].Contains("hasta=2026-01-31") && pedidosFps[0].Contains($"limite={FpsSesionesApiService.FilasPorPagina}"), pedidosFps[0]);
        check("Servicio FPS: término anterior al inicio → sesión incompleta (fin null); sin operador → descartada",
            ses.Any(s => s.IdMaquina == 17 && s.IdOperador == "9" && s.Fin == null) && !ses.Any(s => s.IdOperador == ""), string.Join(",", ses.Select(s => s.IdOperador)));

        check("Servicio FPS: sesión Online=1 → fin desconocido (ETA recalculada, no es un término real)", ses.Any(s => s.IdOperador == "11" && s.Fin == null) && ses.Any(s => s.IdOperador == "7" && s.Fin != null));
        pedidosFps.Clear();
        await fps.ObtenerPorMaquinaAsync(Enumerable.Range(1, 31), new DateTime(2026, 1, 1), new DateTime(2026, 1, 31));
        var maquinasPorPedido = pedidosFps.Select(p => System.Web.HttpUtility.ParseQueryString(p)["maquina"]!.Split(',').Length).ToList();
        check("Servicio FPS: 31 máquinas → lotes de máximo 30", maquinasPorPedido.All(n => n <= 30) && maquinasPorPedido.Any(n => n == 30) && maquinasPorPedido.Sum() >= 31, string.Join(",", maquinasPorPedido));
        pedidosFps.Clear();
        cuerpoFijo = "{\"ok\":true,\"data\":{\"sesiones\":[],\"siguiente\":null}}";
        await fps.ObtenerPorMaquinaAsync(new[] { 15 }, new DateTime(2026, 1, 1), new DateTime(2026, 4, 10)); // 100 días
        var ventanas = pedidosFps.Select(p => { var q = System.Web.HttpUtility.ParseQueryString(p); return (DateTime.Parse(q["hasta"]!) - DateTime.Parse(q["desde"]!)).TotalDays + 1; }).ToList();
        check("Servicio FPS: 100 días → ventanas de máximo 92 días", pedidosFps.Count == 2 && ventanas.All(d => d <= 92), string.Join(",", ventanas));
        cuerpoFijo = null;
        modoFps = "404";
        var r404 = await fps.ObtenerPorMaquinaAsync(new[] { 15 }, new DateTime(2026, 1, 1), new DateTime(2026, 1, 31));
        check("Servicio FPS: 404 → NO_DESPLEGADO", r404.estado == "NO_DESPLEGADO", r404.estado);
        modoFps = "500";
        var r500 = await fps.ObtenerPorMaquinaAsync(new[] { 15 }, new DateTime(2026, 1, 1), new DateTime(2026, 1, 31));
        check("Servicio FPS: error → ERROR y nunca datos parciales utilizables", r500.estado == "ERROR" && r500.error != null);
        modoFps = "ok";
        var rr = await fps.ObtenerPorMaquinaAsync(new[] { 15 }, new DateTime(2026, 2, 1), new DateTime(2026, 1, 1));
        check("Servicio FPS: rango invertido rechazado sin consultar", rr.estado == "ERROR");
        check("Servicio FPS: respuesta no JSON → error controlado", !FpsSesionesApiService.TryParsePaginaMaquina("no json", new(), new(), out _, out var e1) && e1.Length > 0
            && !FpsSesionesApiService.TryParsePaginaMaquina("{\"ok\":true,\"data\":{}}", new(), new(), out _, out _));

        // ── Handler: auditoría de cobertura (desactivada por defecto, solo ADMIN_TI, sin nombres) ──
        var cliente = new FaretApiClient(new FaretApiSettings { BaseUrl = $"http://127.0.0.1:{puerto}/api", UseApi = true });
        cliente.SetToken("token-sintetico");
        var h = new FaretEvaluacionMaquinasHandler(cliente, verNombres: true, fps);
        var payload = new Dictionary<string, object>
        {
            ["desde"] = JsonSerializer.SerializeToElement("2026-01-01"),
            ["hasta"] = JsonSerializer.SerializeToElement("2026-01-31"),
        };
        var cfg = Path.Combine(AppContext.BaseDirectory, "config.json");
        var respaldo = File.Exists(cfg) ? File.ReadAllText(cfg) : null;
        try
        {
            if (respaldo != null) File.Delete(cfg);
            FaretEvaluacionMaquinasHandler.InvalidarCache();
            var off = JsonDocument.Parse(await h.Handle("faret.evaluacionMaquinas.coberturaFps", payload)).RootElement;
            check("Cobertura: desactivada por defecto (sin config) → error y NO consulta FPS", !off.GetProperty("ok").GetBoolean() && off.GetProperty("error").GetString()!.Contains("desactivada"));

            File.WriteAllText(cfg, "{\"EvaluacionMaquinas\":{\"CoberturaFpsHabilitada\":true}}");
            pedidosFps.Clear();
            FaretEvaluacionMaquinasHandler.InvalidarCache();
            var txt = await h.Handle("faret.evaluacionMaquinas.coberturaFps", payload);
            var on = JsonDocument.Parse(txt).RootElement;
            var d = on.GetProperty("data");
            var g = d.GetProperty("global");
            check("Cobertura: con el flag, 4 inspecciones del período (1 fuera de rango excluida)", on.GetProperty("ok").GetBoolean() && d.GetProperty("inspeccionesPallet").GetInt32() == 4, txt);
            check("Cobertura: 1 confiable, 1 probable, 2 sin identificación", g.GetProperty("confiable").GetInt32() == 1 && g.GetProperty("probable").GetInt32() == 1 && g.GetProperty("sin").GetInt32() == 2, g.ToString());
            check("Cobertura: lista las 9 equivalencias pendientes", d.GetProperty("equivalenciasPendientes").GetArrayLength() == 9);
            check("Cobertura: solo consulta FPS por máquinas con equivalencia verificada (15)", pedidosFps.All(p => p.Contains("maquina=15") && !p.Contains("86")), string.Join(";", pedidosFps));
            check("Privacidad: la respuesta no contiene nombres ni identificadores de operadores", !txt.Contains("NOMBRE SECRETO") && !txt.Contains("IdOperador") && !txt.Contains("\"7\""));
            check("Cobertura: motivos y desgloses por máquina y mes presentes", d.GetProperty("motivos").GetArrayLength() >= 3 && d.GetProperty("porMaquina").GetArrayLength() >= 2 && d.GetProperty("porMes").GetArrayLength() == 1);

            var malo = new Dictionary<string, object> { ["desde"] = JsonSerializer.SerializeToElement("2026-01-01"), ["hasta"] = JsonSerializer.SerializeToElement("2028-01-01") };
            check("Cobertura: período > 366 días rechazado", !JsonDocument.Parse(await h.Handle("faret.evaluacionMaquinas.coberturaFps", malo)).RootElement.GetProperty("ok").GetBoolean());
            var sinFps = new FaretEvaluacionMaquinasHandler(cliente, true, null);
            check("Cobertura: sin FPS configurado → error", !JsonDocument.Parse(await sinFps.Handle("faret.evaluacionMaquinas.coberturaFps", payload)).RootElement.GetProperty("ok").GetBoolean());
        }
        finally
        {
            if (File.Exists(cfg)) File.Delete(cfg);
            if (respaldo != null) File.WriteAllText(cfg, respaldo);
            listener.Stop();
        }

        // ── Permisos de la nueva acción ──
        var pe = new PermisosService();
        const string Acc = "faret.evaluacionMaquinas.coberturaFps";
        pe.Establecer("FARET", "CALIDAD", new() { ["faret-evaluacion-maquinas"] = "EDITAR" });
        check("Permisos: coberturaFps rechazada para un usuario con EDITAR que no es ADMIN_TI", pe.ValidarAccion(Acc, "faret-evaluacion-maquinas") != null);
        pe.Establecer("FARET", "ADMIN_TI", new());
        check("Permisos: coberturaFps permitida para ADMIN_TI", pe.ValidarAccion(Acc, "faret-evaluacion-maquinas") == null);
        pe.Establecer("INNPACK", "ADMIN_TI", new());
        check("Permisos: coberturaFps rechazada en empresa INNPACK", pe.ValidarAccion(Acc, "faret-evaluacion-maquinas") != null);
        check("Permisos: coberturaFps es lectura (no la bloquea VER)", PermisosService.EsLectura(Acc));
    }

    private static string Pal(int id, string maquina, string fecha, string hora) =>
        $"{{\"id\":{id},\"maquina\":\"{maquina}\",\"operador\":\"Inspectora Uno\",\"operadorOtro\":null,\"areaControl\":\"PAPEL\",\"fechaRegistro\":\"{fecha}T00:00:00.000Z\",\"horaRegistro\":\"1970-01-01T{hora}.000Z\",\"totalNoCumple\":0}}";
}
