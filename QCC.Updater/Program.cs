using System.Security.Principal;

namespace QCC.Updater;

// Etapa 1-3 del updater con elevación única (ver contex.md / diseño aprobado): este binario
// todavía NO ejecuta ningún instalador. Determina el contexto de seguridad (normal/administrador/
// SYSTEM), valida el paquete pendiente, y si corre como SYSTEM lo promueve a la carpeta
// protegida Staging con revalidación completa de la copia. Nunca decide su comportamiento por un
// argumento de línea de comandos, precisamente para no abrir una superficie de "decile qué hacer
// por parámetro" — todo depende de la identidad real del proceso, verificada por el SO.
internal class Program
{
    private static readonly string LogDir = @"C:\ProgramData\QualityControlCenter\Logs\Updater";

    // Pending: carpeta NO privilegiada, entrada del flujo — la escribe QualityControlCenter.exe
    // corriendo como usuario normal (o cualquiera con acceso al ProgramData local). Nunca se
    // asume confiable por sí sola; todo lo que sale de acá se revalida.
    // Nombre corregido en Etapa 3 (antes se llamaba "StagingDir" en Etapa 1-2, cuando todavía no
    // existía la distinción Pending/Staging): la RUTA no cambió, solo el identificador, para no
    // confundirla con el Staging protegido nuevo de abajo.
    private static readonly string PendingDir = @"C:\ProgramData\QualityControlCenter\Updater\Pending";
    private static readonly string PendingManifestPath = Path.Combine(PendingDir, "manifest.json");

    // Staging: carpeta protegida nueva de Etapa 3. Solo SYSTEM puede escribir ahí (ACL aplicado
    // por StagingPromoter en cada corrida elevada) — ver StagingPromoter.AplicarAclStaging.
    private static readonly string StagingDir = @"C:\ProgramData\QualityControlCenter\Updater\Staging";

    // Results: carpeta protegida nueva de Etapa 5. SYSTEM escribe (ResultadoStore.Escribir), el
    // relanzador no elevado solo lee (ResultadoStore.Leer) — ACL distinto de Staging: Usuarios
    // SÍ tiene lectura acá (ver ResultadoStore.AplicarAclResults). Nunca se tocó Staging para
    // esto.
    private static readonly string ResultsDir = @"C:\ProgramData\QualityControlCenter\Updater\Results";

    // Ruta fija de instalación productiva (ver CLAUDE.md) — el relanzador SIEMPRE abre QCC desde
    // acá, nunca desde una ruta derivada de Staging, del manifiesto ni de ningún argumento.
    private const string RutaQccInstalada = @"C:\Program Files\Quality Control Center\QualityControlCenter.exe";

    private static int Main(string[] args)
    {
        var contexto = ResolverContexto();

        // Etapa 5: modo relanzador — completamente aparte del flujo de validar/promover/
        // instalar. Se activa SOLO por este argumento explícito; a diferencia de "soy SYSTEM"
        // (que nunca se decide por argumento, siempre por identidad verificada del SO), aceptar
        // el RunId acá es seguro porque este modo nunca privilegia nada — en el peor caso, un
        // RunId equivocado hace que el relanzador espere un resultado que nunca llega y termine
        // reabriendo QCC de todas formas tras el timeout.
        if (args.Length >= 2 && args[0] == "--relanzar")
        {
            var runId = args[1];

            void LogRelanzador(string linea)
            {
                Console.WriteLine(linea);
                EscribirLog(linea, $"relanzador-{DateTime.Now:yyyyMMdd}.log");
            }

            var resultado = Relanzador.Ejecutar(runId, contexto.EsSystem, ResultsDir, RutaQccInstalada, LogRelanzador);
            return resultado.Relanzo ? 0 : 1;
        }

        var lineaContexto =
            $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] QCC.Updater iniciado — "
            + $"Usuario={contexto.NombreUsuario} SID={contexto.Sid} "
            + $"EsSystem={contexto.EsSystem} EsAdministrador={contexto.EsAdministrador} "
            + $"Modo={contexto.Modo}";

        Console.WriteLine(lineaContexto);
        EscribirLog(lineaContexto);

        // Etapa 2: valida el paquete pendiente (si hay alguno) y lo informa. Nótese que esto
        // corre sin importar el contexto (normal/administrador/SYSTEM) porque validar (leer +
        // hashear) no tiene efectos secundarios ni requiere privilegios.
        var validacion = PackageValidator.Validar(PendingDir, PendingManifestPath);

        var lineaValidacion = validacion.Aceptado
            ? $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Paquete pendiente VALIDADO — "
                + $"versión={validacion.Version} ruta={validacion.RutaValidada} "
                + "(todavía NO se ejecuta nada en esta etapa)"
            : $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Paquete pendiente RECHAZADO — motivo: {validacion.Motivo}";

        Console.WriteLine(lineaValidacion);
        EscribirLog(lineaValidacion);

        // Etapa 3: la frontera Pending → Staging. Esta condición queda explícita ACÁ, en el punto
        // de entrada, a propósito — no escondida dentro de StagingPromoter — para que sea
        // trivial auditar que solo SYSTEM promueve. Un administrador manual (elevado pero no
        // SYSTEM) o un usuario normal solo llegan hasta la validación de arriba.
        if (validacion.Aceptado)
        {
            if (contexto.EsSystem)
            {
                void Log(string linea)
                {
                    Console.WriteLine(linea);
                    EscribirLog(linea);
                }

                var promocion = StagingPromoter.Promover(PendingDir, PendingManifestPath, StagingDir, Log);

                var lineaPromocion = promocion.Promovido
                    ? $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] PROMOCIÓN a staging OK — "
                        + $"destino={promocion.RutaFinal} sha256Final={promocion.Sha256Final}"
                    : $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] PROMOCIÓN a staging RECHAZADA — motivo: {promocion.Motivo}";

                Console.WriteLine(lineaPromocion);
                EscribirLog(lineaPromocion);

                // Etapa 4: instalar SOLO si la promoción de esta misma corrida fue exitosa. Nunca
                // se instala desde Pending, nunca desde una ruta UNC, nunca por un argumento —
                // InstallerRunner solo conoce StagingDir (fijo) y vuelve a validar todo desde
                // cero antes de ejecutar. Deliberadamente NO se relanza QualityControlCenter.exe
                // acá bajo ningún resultado — eso queda para la etapa del relanzador no elevado.
                if (promocion.Promovido)
                {
                    // Leído acá (antes de instalar) en vez de después, solo para poder pasarlo a
                    // InstallerRunner y que el log de Inno (/LOG, ver contex.md Paso 59) quede
                    // nombrado con el mismo RunId que ResultadoStore usa más abajo — el valor no
                    // cambió de lugar, sigue siendo el mismo campo del mismo manifest ya validado.
                    var runId = validacion.Manifest?.RunId;

                    var inicioInstalacion = DateTime.UtcNow;
                    var instalacion = InstallerRunner.Instalar(StagingDir, Log, runId);
                    var finInstalacion = DateTime.UtcNow;

                    var lineaInstalacion = instalacion.Exitoso
                        ? $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] INSTALACIÓN OK — "
                            + $"exitCode={instalacion.ExitCode} duración={instalacion.Duracion?.TotalSeconds:0.0}s "
                            + "(QualityControlCenter.exe NO se relanza acá — eso lo hace el relanzador no elevado)"
                        : $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] INSTALACIÓN FALLIDA — "
                            + $"motivo={instalacion.Motivo} exitCode={(instalacion.ExitCode?.ToString() ?? "(n/a)")} "
                            + $"duración={(instalacion.Duracion?.TotalSeconds.ToString("0.0") ?? "(n/a)")}s "
                            + "(staging NO se borra, queda para diagnóstico)";

                    Console.WriteLine(lineaInstalacion);
                    EscribirLog(lineaInstalacion);

                    // Etapa 5: el resultado se escribe SOLO si el manifiesto traía un RunId — si
                    // no lo trae (manifest más viejo, o sin ese campo), no hay forma de que el
                    // relanzador lo encuentre y no tiene sentido intentarlo. El RunId no es una
                    // barrera de seguridad, así que esto nunca bloquea ni invalida la
                    // instalación ya hecha — solo afecta si el relanzador podrá leer el
                    // resultado o terminará reabriendo QCC tras un timeout sin confirmación.
                    // (runId ya se leyó más arriba, antes de instalar, para pasárselo a
                    // InstallerRunner — mismo valor, mismo manifest.)
                    if (!string.IsNullOrWhiteSpace(runId))
                    {
                        var resultado = new UpdateResultado
                        {
                            RunId = runId,
                            Version = validacion.Version ?? "",
                            Success = instalacion.Exitoso,
                            ExitCode = instalacion.ExitCode,
                            Motivo = instalacion.Exitoso ? null : instalacion.Motivo,
                            StartedAt = inicioInstalacion.ToString("O"),
                            FinishedAt = finInstalacion.ToString("O"),
                        };
                        ResultadoStore.Escribir(ResultsDir, resultado, Log);
                    }
                    else
                    {
                        var lineaSinRunId =
                            $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] No se escribe resultado: el manifiesto no traía RunId "
                            + "(el relanzador, si lo hay, terminará reabriendo QCC tras timeout sin confirmación).";
                        Console.WriteLine(lineaSinRunId);
                        EscribirLog(lineaSinRunId);
                    }
                }
            }
            else
            {
                var lineaNoPromueve =
                    $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Paquete válido pero NO promovido a staging "
                    + $"(contexto={contexto.Modo}; se requiere SYSTEM).";

                Console.WriteLine(lineaNoPromueve);
                EscribirLog(lineaNoPromueve);
            }
        }

        return 0;
    }

    private static ContextoEjecucion ResolverContexto()
    {
        using var identidad = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identidad);

        var esAdministrador = principal.IsInRole(WindowsBuiltInRole.Administrator);
        var esSystem = identidad.User?.IsWellKnown(WellKnownSidType.LocalSystemSid) ?? false;

        // Se distingue "SYSTEM" de "administrador genérico" a propósito: el diseño aprobado solo
        // reconoce a SYSTEM (invocado vía la Scheduled Task) como el contexto elevado legítimo en
        // producción. Un administrador corriendo esto manualmente con "Ejecutar como
        // administrador" es un caso real (útil para probar en esta misma etapa) pero distinto —
        // en etapas posteriores esto importará para decidir si se procede o no.
        string modo = esSystem
            ? "ELEVADO (SYSTEM) — contexto esperado cuando lo invoca la tarea programada"
            : esAdministrador
                ? "ELEVADO (administrador, NO SYSTEM) — válido para pruebas manuales, no es el contexto de producción"
                : "NORMAL (usuario estándar, sin privilegios)";

        return new ContextoEjecucion(
            identidad.Name,
            identidad.User?.Value ?? "(desconocido)",
            esSystem,
            esAdministrador,
            modo
        );
    }

    // El log es diagnóstico en esta etapa, no crítico: si falla, no debe tumbar el proceso ni
    // ocultar la salida por consola.
    //
    // Etapa 3: encoding UTF-8 explícito (antes usaba el overload sin encoding, que escribe UTF-8
    // sin BOM — PowerShell 5.1 lo mostraba mal, "â€”"/"estÃ¡ndar", por interpretarlo como ANSI al
    // no encontrar BOM). Con BOM explícito el mismo archivo se lee bien.
    //
    // Etapa 5: se agregó el parámetro nombreArchivo (con el mismo valor de siempre como default,
    // updater-{fecha}.log) para que el relanzador pueda escribir en un archivo PROPIO
    // (relanzador-{fecha}.log) en vez de en el que ya escribió SYSTEM — un usuario normal no
    // puede anexar líneas a un archivo que SYSTEM ya creó (confirmado: NTFS no hereda permiso de
    // escritura sobre un archivo existente solo por poder crear archivos nuevos en la carpeta),
    // así que compartir el mismo archivo entre ambos procesos fallaría en silencio para el
    // relanzador. No se amplió el ACL de LogDir para esto — decisión explícita del usuario.
    private static void EscribirLog(string linea, string? nombreArchivo = null)
    {
        try
        {
            Directory.CreateDirectory(LogDir);
            var archivo = Path.Combine(LogDir, nombreArchivo ?? $"updater-{DateTime.Now:yyyyMMdd}.log");
            File.AppendAllText(archivo, linea + Environment.NewLine, new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
            Console.WriteLine($"(log escrito en {archivo})");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"(no se pudo escribir el log: {ex.Message})");
        }
    }
}

internal record ContextoEjecucion(
    string NombreUsuario,
    string Sid,
    bool EsSystem,
    bool EsAdministrador,
    string Modo
);
