// Levanta el entorno aislado: fps-api y API INNPACK locales y, salvo --solo-apis, Photino en modo aislado.
//   node tools/entorno_aislado/iniciar.js                 datos ficticios (NP 9999). Sin bases ni credenciales reales.
//   node tools/entorno_aislado/iniciar.js --sap           agrega apisapfaret local en SOLO LECTURA (consulta SAP real)
//   node tools/entorno_aislado/iniciar.js --fps reales    fps-api contra SQL real; exige login de solo lectura
//   node tools/entorno_aislado/iniciar.js --solo-apis     no abre la ventana
// Las escrituras de la aplicación van únicamente a LocalDB. Ejecutar antes: preparar.js
const fs = require("fs")
const path = require("path")
const net = require("net")
const readline = require("readline")
const { spawn, execFileSync } = require("child_process")
const c = require("./comun")

const args = process.argv.slice(2)
const conSap = args.includes("--sap")
const soloApis = args.includes("--solo-apis")
const fpsModo = args.includes("--fps") ? args[args.indexOf("--fps") + 1] : "ficticios"
const url = p => `http://127.0.0.1:${p}`
const hijos = []

function detener() {
    for (const h of hijos.splice(0)) {
        if (h.exitCode !== null) continue
        // Solo el árbol de los procesos que este lanzador creó (por PID).
        try { execFileSync("taskkill", ["/PID", String(h.pid), "/T", "/F"], { stdio: "ignore" }) } catch { }
    }
}
function salir(mensaje, codigo = 1) {
    if (mensaje) console.error(mensaje)
    detener()
    process.exit(codigo)
}

const puertoOcupado = puerto => new Promise(r => {
    const s = net.connect({ host: "127.0.0.1", port: puerto })
    s.once("connect", () => { s.destroy(); r(true) })
    s.once("error", () => r(false))
})

function preguntar(texto, oculto) {
    return new Promise(r => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
        rl.question(texto, v => { rl.close(); if (oculto) process.stdout.write("\n"); r(v) })
        if (oculto) rl._writeToOutput = s => { if (s.includes(texto)) process.stdout.write(texto) }
    })
}

// Variables que pueden traer credenciales o destinos reales. No se heredan: cada proceso recibe solo las que se le
// entregan explícitamente (por ejemplo, el SQL de FPS solo llega a fps-api).
const SENSIBLES = /^(FPS_SQL_|SQL_|MYSQL_|DB_|SAPSERVICELAYER__|DATABASE__|CONNECTIONSTRINGS__|JWT__|API_KEY|SECURITY__|FPSAPI__|PLANIFICACIONAPI__|MYSQLREGISTROPALETIZADO__|MYSQLCONTROLBINS|FARETVERIFICACION__|INNPACKAPI|QCC_)/i

function entornoBase(extra = {}) {
    const limpio = Object.fromEntries(Object.entries(process.env).filter(([k]) => !SENSIBLES.test(k)))
    return { ...limpio, ...extra }
}

// Credenciales de Service Layer que la persona haya definido en su terminal: solo las recibe apisapfaret.
const credencialesSap = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => /^SapServiceLayer__Companies__[A-Z]+__(UserName|Password)$/i.test(k)))

function lanzar(nombre, comando, parametros, env, cwd) {
    const log = path.join(c.RUTAS.datos, `${nombre}.log`)
    const fd = fs.openSync(log, "w")
    const h = spawn(comando, parametros, { cwd, env: entornoBase(env), stdio: ["ignore", fd, fd] })
    h.nombre = nombre
    h.log = log
    hijos.push(h)
    return h
}

async function esperar(h, puerto, segundos) {
    for (let i = 0; i < segundos * 2; i++) {
        if (h.exitCode !== null) salir(`${h.nombre} se detuvo al iniciar. Revisar ${h.log}`)
        if (await puertoOcupado(puerto)) return console.log(`ok  ${h.nombre} en ${url(puerto)}   (log: ${h.log})`)
        await new Promise(r => setTimeout(r, 500))
    }
    salir(`${h.nombre} no respondió en ${segundos} s. Revisar ${h.log}`)
}

module.exports = { entornoBase, credencialesSap }

async function main() {
    const rutaClaves = path.join(c.RUTAS.datos, "claves.json")
    if (!fs.existsSync(rutaClaves)) salir("Falta la configuración: ejecutar primero node tools/entorno_aislado/preparar.js")
    if (!["ficticios", "reales"].includes(fpsModo)) salir("--fps admite ficticios o reales")
    const claves = JSON.parse(fs.readFileSync(rutaClaves, "utf8"))

    // Un puerto ya ocupado podría ser otro proceso: se rechaza para no conectar Photino a algo desconocido.
    const puertos = [c.PUERTOS.innpack, c.PUERTOS.fps, ...(conSap ? [c.PUERTOS.sap] : [])]
    for (const p of puertos) if (await puertoOcupado(p)) salir(`El puerto ${p} ya está en uso: cerrar ese proceso antes de iniciar.`)
    if (await puertoOcupado(c.PUERTOS.cerrado)) salir(`El puerto ${c.PUERTOS.cerrado} debe estar libre (destino inalcanzable a propósito).`)

    const envFps = { PORT: String(c.PUERTOS.fps), API_KEY: claves.fps, API_KEY_NP_CONTEXTO: claves.fps }
    if (fpsModo === "reales") {
        envFps.SQL_SERVER = process.env.FPS_SQL_SERVER || await preguntar("Servidor SQL de FPS: ")
        envFps.SQL_DATABASE = process.env.FPS_SQL_DATABASE || "FPS_PRODUCCION"
        envFps.SQL_USER = process.env.FPS_SQL_USER || await preguntar("Usuario SQL de SOLO LECTURA: ")
        envFps.SQL_PASSWORD = process.env.FPS_SQL_PASSWORD || await preguntar("Clave (no se muestra): ", true)
    }
    c.canalLocalDb()

    const fps = lanzar("fps-api", process.execPath, [path.join(__dirname, "fps-local.js"), fpsModo], envFps, __dirname)
    await esperar(fps, c.PUERTOS.fps, 90)

    const cerrado = url(c.PUERTOS.cerrado)
    const api = lanzar("api-innpack", "dotnet", ["run", "--no-launch-profile"], {
        ASPNETCORE_ENVIRONMENT: "Aislado",
        ASPNETCORE_URLS: url(c.PUERTOS.innpack),
        Database__ConnectionString: c.CADENA,
        Jwt__SecretKey: claves.jwt, Jwt__Issuer: "qcc-aislado", Jwt__Audience: "qcc-aislado",
        MySqlRegistroPaletizado__Host: "127.0.0.1", MySqlRegistroPaletizado__Port: "1",
        MySqlControlBins__Host: "127.0.0.1", MySqlControlBins__Port: "1",
        MySqlControlBinsEscritura__Host: "127.0.0.1", MySqlControlBinsEscritura__Port: "1",
        FpsApi__BaseUrl: c.urlFps(), FpsApi__UseApi: "true", FpsApi__ApiKey: claves.fps,
        PlanificacionApi__BaseUrl: cerrado, PlanificacionApi__UseApi: "false",
        FaretVerificacion__BaseUrl: cerrado
    }, c.RUTAS.api)
    await esperar(api, c.PUERTOS.innpack, 180)

    if (conSap) {
        const sap = lanzar("apisapfaret", "dotnet", ["run", "--no-launch-profile"], {
            ...credencialesSap(),
            ASPNETCORE_ENVIRONMENT: "Development",
            ASPNETCORE_URLS: url(c.PUERTOS.sap),
            SapServiceLayer__SoloLectura: "true",
            SapServiceLayer__SqlQueries__AutoProvision: "false",
            Security__UseHttpsRedirection: "false",
            Security__ApiKeys__QualityControlDesktop__0: claves.sap
        }, c.RUTAS.sap)
        await esperar(sap, c.PUERTOS.sap, 180)
    }

    console.log(`\nFPS: ${fpsModo === "reales" ? "datos reales (solo lectura verificada)" : "datos FICTICIOS, NP 9999"}`)
    console.log(`SAP Service Layer: ${conSap ? "apisapfaret local en SOLO LECTURA" : "desactivado (la app mostrará No disponible)"}`)
    console.log(`Ingresar en INNPACK con prueba.aislado | prueba.ver | prueba.sinacceso   clave: ${c.CLAVE_PRUEBA}\n`)

    if (soloApis) return console.log("APIs activas. Ctrl+C para detenerlas.")
    const app = spawn("dotnet", ["run", "--project", "QualityControlCenter.csproj"], {
        cwd: c.RUTAS.escritorio,
        // WebView2 propio: no comparte con la aplicación normal la sesión recordada (que incluye la clave real).
        env: entornoBase({ QCC_AISLADO: "1", QCC_CONFIG: path.join(c.RUTAS.datos, "config.json"), WEBVIEW2_USER_DATA_FOLDER: path.join(c.RUTAS.datos, "webview2") }),
        // La salida de Photino no se guarda en disco: registra los mensajes de la sesión.
        stdio: ["ignore", "ignore", "inherit"]
    })
    hijos.push(app)
    app.on("exit", codigo => salir("Photino cerrado: se detienen las APIs locales.", codigo || 0))
}

if (require.main === module) {
    process.on("SIGINT", () => salir("\nDetenido.", 0))
    process.on("SIGTERM", () => salir("", 0))
    main().catch(e => salir(e.message))
}
