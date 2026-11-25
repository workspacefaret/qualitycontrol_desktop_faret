// Rutas y utilidades del entorno aislado. La configuración generada queda FUERA de los repositorios.
const path = require("path")
const { execFileSync } = require("child_process")

const PROYECTOS = path.resolve(__dirname, "../../..")
const RUTAS = {
    escritorio: path.resolve(__dirname, "../.."),
    api: path.join(PROYECTOS, "qualitycontrolinnpack_sqlserver_port", "QualityControlInnpack.Api"),
    sap: path.join(PROYECTOS, "apisapfaret", "apifaret"),
    esquema: path.join(PROYECTOS, "calidad_sqlserver_migration", "sqlserver", "calidad_sqlserver_schema.sql"),
    datos: path.join(process.env.LOCALAPPDATA || "", "QCC_Aislado")
}
const BASE = "calidad_db_aislado"
const INSTANCIA = "MSSQLLocalDB"
const CADENA = `Server=(localdb)\\${INSTANCIA};Database=${BASE};Integrated Security=true;TrustServerCertificate=true`
const PUERTOS = { innpack: 5291, sap: 5292, fps: 5293, cerrado: 1 }
// El escritorio y la API piden rutas relativas a este prefijo, igual que en la configuración real.
const urlFps = () => `http://127.0.0.1:${PUERTOS.fps}/api/produccion`
// Credenciales de usuarios que solo existen en la base LocalDB de pruebas.
const CLAVE_PRUEBA = "Aislado-Pruebas-2026"
const HASH_PRUEBA = "$2a$11$16xP0OA.ayPl7ncSPgpdReUJYJKhuni1WtOeCAXAMdGcDgskRldMC"

// sqlcmd no resuelve "(localdb)\x": se usa el canal con nombre que informa sqllocaldb. Solo puede ser local.
function canalLocalDb() {
    execFileSync("sqllocaldb", ["start", INSTANCIA])
    const canal = execFileSync("sqllocaldb", ["info", INSTANCIA]).toString().match(/np:\\\\\.\\pipe\\\S+/)
    if (!canal) throw new Error("No se obtuvo el canal de LocalDB")
    return canal[0]
}

module.exports = { RUTAS, BASE, CADENA, PUERTOS, CLAVE_PRUEBA, HASH_PRUEBA, canalLocalDb, urlFps }
