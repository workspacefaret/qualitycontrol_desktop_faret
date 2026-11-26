// node --test tools/entorno_aislado/consulta-fps.test.js
// Todo local: servidores simulados en 127.0.0.1 y datos vacíos. No consulta producción.
const test = require("node:test")
const assert = require("node:assert")
const fs = require("fs")
const os = require("os")
const path = require("path")
const http = require("http")
const { spawn } = require("child_process")
const { URL_PRODUCCION, urlProduccion, exigirTlsVerificado, opcionesConsulta } = require("./consulta-fps")
const c = require("./comun")

for (const texto of [URL_PRODUCCION, URL_PRODUCCION + "/", `  ${URL_PRODUCCION}  `]) {
    test(`admite: "${texto}"`, () => assert.strictEqual(urlProduccion(texto), URL_PRODUCCION))
}

for (const [motivo, texto] of [
    ["sin la subruta de IIS", "https://api.faret.cl/api/produccion"],
    ["HTTP sin cifrar", "http://api.faret.cl/fps/api/produccion"],
    ["servidor directo por HTTP", "http://SRV-API:3002/api/produccion"],
    ["otro host", "https://ejemplo.com/fps/api/produccion"],
    ["host parecido", "https://api.faret.cl.ejemplo.com/fps/api/produccion"],
    ["usuario@host", "https://api.faret.cl@ejemplo.com/fps/api/produccion"],
    ["credenciales en la URL", "https://u:p@api.faret.cl/fps/api/produccion"],
    ["puerto distinto", "https://api.faret.cl:8443/fps/api/produccion"],
    ["otra aplicación IIS", "https://api.faret.cl/calidad/api/produccion"],
    ["subruta adicional", "https://api.faret.cl/x/fps/api/produccion"],
    ["ruta con ..", "https://api.faret.cl/calidad/../fps/api/produccion"],
    ["ruta codificada", "https://api.faret.cl/%66ps/api/produccion"],
    ["barra invertida", "https://api.faret.cl\\fps\\api\\produccion"],
    ["consulta añadida", URL_PRODUCCION + "?x=1"],
    ["fragmento", URL_PRODUCCION + "#x"],
    ["endpoint completo", URL_PRODUCCION + "/trazabilidad/np"],
    ["salto de línea interno", "https://api.faret.cl/fps\n/api/produccion"],
    ["vacía", ""],
    ["nula", null]
]) test(`rechaza: ${motivo}`, () => assert.throws(() => urlProduccion(texto), /URL no admitida/))

test("coincide con la subruta que arma el escritorio", () => assert.strictEqual(
    `${URL_PRODUCCION}/trazabilidad/np?np=4007`, "https://api.faret.cl/fps/api/produccion/trazabilidad/np?np=4007"))

test("no admite la verificación TLS desactivada", () => {
    assert.throws(() => exigirTlsVerificado({ NODE_TLS_REJECT_UNAUTHORIZED: "0" }), /TLS/)
    assert.doesNotThrow(() => exigirTlsVerificado({}))
})

const escuchar = (puerto, atender) => new Promise((ok, mal) => {
    const s = http.createServer(atender)
    s.once("error", mal)
    s.listen(puerto, "127.0.0.1", () => ok(s))
})

test("no sigue redirecciones: la clave no llega a otro destino", async () => {
    let recibidas = 0
    const otro = await escuchar(0, (_, res) => { recibidas++; res.end("{}") })
    const origen = await escuchar(0, (_, res) => { res.writeHead(302, { location: `http://127.0.0.1:${otro.address().port}/robo` }); res.end() })
    try {
        await assert.rejects(fetch(`http://127.0.0.1:${origen.address().port}/`, opcionesConsulta("clave-ficticia", 5000)))
        assert.strictEqual(recibidas, 0)
    } finally { otro.close(); origen.close() }
})

// Ejecuta el comparador real en modo local contra un servidor simulado y registra todo lo que envía.
async function ejecutarComparador(args, responder) {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "qcc-comparador-"))
    const datos = path.join(carpeta, "QCC_Aislado")
    fs.mkdirSync(datos)
    fs.writeFileSync(path.join(datos, "config.json"), JSON.stringify({ FpsApi: { ApiKey: "clave-ficticia" } }))
    const vistas = []
    const servidor = await escuchar(c.PUERTOS.fps, (req, res) => {
        let cuerpo = ""
        req.on("data", t => { cuerpo += t })
        req.on("end", () => { vistas.push({ metodo: req.method, url: req.url, cuerpo }); responder(res) })
    })
    try {
        const codigo = await new Promise(r => spawn(process.execPath, [path.join(__dirname, "comparar_reales.js"), ...args],
            { env: { ...process.env, LOCALAPPDATA: carpeta }, stdio: "ignore" }).on("exit", r))
        return { codigo, vistas }
    } finally {
        servidor.close()
        fs.rmSync(carpeta, { recursive: true, force: true })
    }
}
const vacio = res => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, data: { fuentes: null } })) }

test("el comparador solo hace GET sin cuerpo a trazabilidad/np (8 NP)", async () => {
    const { codigo, vistas } = await ejecutarComparador([], vacio)
    assert.strictEqual(codigo, 0)
    assert.strictEqual(vistas.length, 16)
    for (const v of vistas) {
        assert.strictEqual(v.metodo, "GET")
        assert.strictEqual(v.cuerpo, "")
        assert.match(v.url, /^\/api\/produccion\/trazabilidad\/np\?np=\d+$/)
    }
})

test("--np 4007 consulta solo esa NP", async () => {
    const { vistas } = await ejecutarComparador(["--np", "4007"], vacio)
    assert.deepStrictEqual([...new Set(vistas.map(v => v.url))], ["/api/produccion/trazabilidad/np?np=4007"])
})

for (const args of [["--produccio"], ["--np"], ["--np", "4007;x"]]) {
    test(`argumentos no válidos (${args.join(" ")}): no consulta nada`, async () => {
        const { codigo, vistas } = await ejecutarComparador(args, vacio)
        assert.strictEqual(codigo, 1)
        assert.strictEqual(vistas.length, 0)
    })
}

test("el comparador tiene una sola llamada de red y usa las opciones de consulta", () => {
    const codigo = fs.readFileSync(path.join(__dirname, "comparar_reales.js"), "utf8")
    assert.strictEqual(codigo.match(/\bfetch\(/g).length, 1)
    assert.match(codigo, /fetch\(`\$\{base\}\/trazabilidad\/np\?np=\$\{encodeURIComponent\(np\)\}`, opcionesConsulta\(clave\)\)/)
    assert.doesNotMatch(codigo, /require\("(http|https|net|dns|child_process)"\)|POST|PUT|PATCH|DELETE/)
})
