// Prepara el entorno aislado: base LocalDB calidad_db_aislado (esquema + migraciones + propuesta), usuarios de prueba
// y configuración con claves aleatorias en %LOCALAPPDATA%\QCC_Aislado. No se conecta a ningún servidor.
//   node tools/entorno_aislado/preparar.js            crea la base si no existe y regenera la configuración
//   node tools/entorno_aislado/preparar.js --recrear  borra SOLO calidad_db_aislado (LocalDB) y la crea de nuevo
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const { execFileSync } = require("child_process")
const c = require("./comun")

const MIGRACIONES = [
    "2026_09_ensayo_bobinas_multiples", "2026_09_gramaje_tamano_probeta", "2026_09_humedad_origen_muestra",
    "2026_09_laboratorio_registro_produccion", "2026_09_muestra_anular_y_prueba_solicitada",
    "2026_09_muestra_laboratorio_adjuntos", "2026_09_muestra_maestro_metodos", "2026_09_nc_internas",
    "2026_09_producto_terminado_fecha_auditoria", "2026_09_registro_produccion_agrupado_y_etapas",
    "2026_09_talleres_externos_precio", "2026_09_usuario_modulo_permiso", "2026_10_usuarios_politica_password",
    "2026_10_nc_internas_catalogos_definitivos", "2026_11_muestra_laboratorio_muestras_determinaciones",
    "2026_11_muestra_laboratorio_ensayos_auditoria_anulacion", "2026_11_alertas_atendidas",
    "2026_11_control_documental_validaciones", "2026_11_control_documental_codigo_unico_activos",
    "2026_11_trazabilidad_documentos_factor", "2026_11_calidad_np_mermas_cierre_destruccion",
    "2026_11_calidad_np_mermas_cierre_destruccion_evidencia", "2026_12_calidad_np_cumplimiento_PROPUESTA"
]
// Estas exigen un respaldo reciente: se hace uno real de la base desechable en vez de apagar la guarda.
const CON_RESPALDO = ["2026_11_alertas_atendidas", "2026_11_control_documental_validaciones", "2026_12_calidad_np_cumplimiento_PROPUESTA"]
const MODULOS = ["trazabilidad", "balance-mermas", "cierre-np", "certificados-destruccion"]

const canal = c.canalLocalDb()
const sqlcmd = (sql, base = c.BASE) =>
    execFileSync("sqlcmd", ["-S", canal, "-d", base], { input: sql + "\nGO\n", maxBuffer: 20e6 }).toString()
// Mensajes de error de SQL Server ("Msg N, Level L") con nivel 11 o mayor, con su texto.
const errores = salida => {
    const lineas = salida.split(/\r?\n/)
    return lineas.flatMap((l, i) => {
        const m = l.match(/^Msg (\d+), Level (\d+)/)
        return m && +m[2] > 10 ? [`Msg ${m[1]}: ${lineas[i + 1] || ""}`] : []
    })
}

const existe = () => /\bSI\b/.test(sqlcmd(`SET NOCOUNT ON; IF DB_ID('${c.BASE}') IS NOT NULL SELECT 'SI'`, "master"))
if (process.argv.includes("--recrear") && existe())
    sqlcmd(`ALTER DATABASE ${c.BASE} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${c.BASE}`, "master")

if (!existe()) {
    sqlcmd(`CREATE DATABASE ${c.BASE} COLLATE Latin1_General_100_CI_AI_SC`, "master")
    const problemas = []
    const aplicar = (nombre, sql) => {
        // Varias migraciones vienen en simulacro (@DryRun = 1 hace ROLLBACK sin error): aquí se aplican de verdad.
        const preparado = sql.replace(/^﻿/, "")
            .replace(/^\s*USE\s+\[?calidad_db\]?\s*;?\s*$/gim, "")
            .replace(/(DECLARE\s+@DryRun\s+BIT\s*=\s*)1/i, "$10")
        const e = errores(sqlcmd(preparado))
        console.log(`${e.length ? "AVISO" : "ok   "} ${nombre}${e.length ? ` (${e.length} mensajes)` : ""}`)
        if (e.length) problemas.push({ nombre, errores: e })
    }
    aplicar("esquema base", fs.readFileSync(c.RUTAS.esquema, "utf8"))
    // Los scripts otorgan permisos al usuario SQL de la API: existe sin login, solo para que el GRANT aplique.
    aplicar("preparación", "CREATE USER qcc_innpack_api_sql WITHOUT LOGIN;\nGO\nALTER TABLE dbo.usuarios DROP CONSTRAINT CK_usuarios_rol;")
    fs.mkdirSync(c.RUTAS.datos, { recursive: true })
    const respaldo = path.join(c.RUTAS.datos, c.BASE + ".bak")
    for (const m of MIGRACIONES) {
        if (CON_RESPALDO.includes(m)) aplicar("respaldo previo", `BACKUP DATABASE ${c.BASE} TO DISK = N'${respaldo.replace(/'/g, "''")}' WITH COPY_ONLY, CHECKSUM, INIT;`)
        aplicar(m, fs.readFileSync(path.join(c.RUTAS.api, "Sql", m + ".sql"), "utf8"))
    }

    const usuario = (codigo, rol) =>
        `INSERT INTO dbo.usuarios (codigo_usuario, nombre_completo, password_hash, rol, activo, password_sin_vencimiento) VALUES (N'${codigo}', N'Usuario de prueba (${rol})', N'${c.HASH_PRUEBA}', N'${rol}', 1, 1);`
    const permisos = (codigo, nivel) => MODULOS.map(m =>
        `INSERT INTO dbo.usuario_modulo_permiso (usuario_id, modulo, nivel, modificado_por) SELECT id, N'${m}', N'${nivel}', N'preparar.js' FROM dbo.usuarios WHERE codigo_usuario = N'${codigo}';`).join("\n")
    aplicar("usuarios de prueba", [usuario("prueba.aislado", "admin_ti"), usuario("prueba.ver", "operador"), usuario("prueba.sinacceso", "operador"),
        permisos("prueba.ver", "VER"), permisos("prueba.sinacceso", "SIN_ACCESO")].join("\n"))

    const faltan = sqlcmd(`SET NOCOUNT ON; SELECT 'FALTA ' + v.o FROM (VALUES
        ('usuarios.password_sin_vencimiento'), ('np_merma.item_code'), ('cert_destruccion.cantidad_ejecutada'),
        ('trazabilidad_documento.enlace'), ('cert_destruccion_archivo.sha256'), ('np_cierre_area.estado'),
        ('usuario_modulo_permiso.nivel')) v(o)
        WHERE COL_LENGTH(PARSENAME(v.o, 2), PARSENAME(v.o, 1)) IS NULL`).match(/FALTA \S+/g) || []
    const total = sqlcmd("SET NOCOUNT ON; SELECT 'TOTAL=' + CAST(COUNT(*) AS VARCHAR) FROM dbo.usuarios WHERE codigo_usuario LIKE 'prueba.%'").match(/TOTAL=(\d+)/)
    if (!total || total[1] !== "3") faltan.push("usuarios de prueba")
    console.log(faltan.length ? `ERROR verificación: ${faltan.join(", ")}` : "ok    verificación de columnas y usuarios de prueba")
    if (faltan.length) process.exitCode = 1
    fs.writeFileSync(path.join(c.RUTAS.datos, "preparacion.json"), JSON.stringify(problemas, null, 2))
} else console.log(`La base ${c.BASE} ya existe (usa --recrear para rehacerla).`)

const clave = () => crypto.randomBytes(24).toString("hex")
const claves = { fps: clave(), sap: clave(), jwt: clave() + clave() }
const url = p => `http://127.0.0.1:${p}`
fs.mkdirSync(c.RUTAS.datos, { recursive: true })
fs.writeFileSync(path.join(c.RUTAS.datos, "claves.json"), JSON.stringify(claves))
// Config del escritorio: solo lo local. Las APIs de FARET quedan sin configurar a propósito.
fs.writeFileSync(path.join(c.RUTAS.datos, "config.json"), JSON.stringify({
    QualityControlInnpackApi: { BaseUrl: url(c.PUERTOS.innpack), UseApi: true },
    FpsApi: { BaseUrl: c.urlFps(), UseApi: true, ApiKey: claves.fps },
    SapRecepcionApi: { BaseUrl: url(c.PUERTOS.sap), UseApi: true, ApiKey: claves.sap }
}, null, 2))
console.log(`\nConfiguración en ${c.RUTAS.datos}\nUsuarios de prueba (solo LocalDB): prueba.aislado | prueba.ver | prueba.sinacceso   clave: ${c.CLAVE_PRUEBA}`)
