// fps-api LOCAL para el entorno aislado. No modifica fps-api: prepara el proceso y carga su server.js.
//   node tools/entorno_aislado/fps-local.js ficticios        datos de prueba, sin ninguna base de datos
//   node tools/entorno_aislado/fps-local.js reales           SQL real SOLO si el login no puede escribir
// Requiere PORT y API_KEY. En "reales" además SQL_SERVER, SQL_DATABASE, SQL_USER y SQL_PASSWORD (los entrega
// iniciar.ps1). Escucha únicamente en 127.0.0.1.
const path = require("path")
const { problemasSoloLectura } = require("./solo-lectura")

const modo = process.argv[2]
const fps = path.resolve(__dirname, "../../../fps-api/fps-api")
const salir = m => { console.error("[fps-local] " + m); process.exit(1) }

if (modo !== "ficticios" && modo !== "reales") salir("Uso: node fps-local.js ficticios|reales")
for (const v of ["PORT", "API_KEY"]) if (!process.env[v]) salir(`Falta la variable ${v}`)
// dotenv no pisa lo ya definido: se fija todo antes de cargar el servidor para que su .env no aporte conexiones.
if (modo === "reales") {
    for (const v of ["SQL_SERVER", "SQL_DATABASE", "SQL_USER", "SQL_PASSWORD"]) if (!process.env[v]) salir(`Falta la variable ${v}`)
    process.env.SQL_ENCRYPT ||= "false"
    process.env.SQL_TRUST_CERT ||= "true"
} else {
    for (const v of ["SQL_SERVER", "SQL_DATABASE", "SQL_USER", "SQL_PASSWORD"]) process.env[v] = "sin-conexion"
}
process.env.API_KEY_NP_CONTEXTO ||= process.env.API_KEY

const express = require(path.join(fps, "node_modules", "express"))
const escuchar = express.application.listen
express.application.listen = function (puerto, ...resto) {
    return escuchar.call(this, puerto, "127.0.0.1", ...resto)
}

const rutaDb = require.resolve(path.join(fps, "src/config/db"))
const cargarServidor = () => require(path.join(fps, "src/server"))

async function main() {
    if (modo === "ficticios") {
        const { crearPool } = require("../calidad_np_tests/datos_ficticios")
        const pool = crearPool()
        const sql = require(path.join(fps, "node_modules", "mssql"))
        require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { sql, getPool: async () => pool } }
        console.log("[fps-local] DATOS FICTICIOS (NP 9999): sin conexión a bases de datos")
    } else {
        const { getPool } = require(rutaDb)
        const problemas = await problemasSoloLectura(await getPool())
        if (problemas.length) salir("El login SQL NO es de solo lectura; no se inicia:\n- " + problemas.join("\n- "))
        console.log("[fps-local] DATOS REALES con login verificado de solo lectura (local y por CONEXIONSAP)")
    }
    cargarServidor()
}

main().catch(e => salir(e.message))
