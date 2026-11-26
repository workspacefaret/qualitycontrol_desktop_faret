// Comprueba que un login SQL no pueda escribir: en la base de FPS y en las bases SAP a las que llega por CONEXIONSAP.
// Falla cerrado: si una comprobación no responde, cuenta como problema.
const PERMISOS = ["INSERT", "UPDATE", "DELETE", "ALTER", "CONTROL", "EXECUTE", "CREATE TABLE"]
const BASES_SAP = ["INNPACK_PRODUCCION", "FARET_PRODUCCION", "Faret_Control_Calidad"]
const ROLES = ["sysadmin", "serveradmin", "securityadmin", "dbcreator"]
// Usuario remoto inexistente al que se asignan las cuentas qcc_* en los vinculados que no deben usar.
const USUARIO_BLOQUEO = "qcc_bloqueado_sin_login"

const sqlRoles = () => "SELECT SUSER_SNAME() AS login, " + ROLES.map(r => `IS_SRVROLEMEMBER('${r}') AS ${r}`).join(", ")

// Una fila por base y permiso; "tiene" = 1 o NULL (base no evaluable) se informa.
const sqlPermisos = bases => "SELECT d.base, p.permiso, HAS_PERMS_BY_NAME(d.base, 'DATABASE', p.permiso) AS tiene FROM (VALUES "
    + bases.map(b => `(${b})`).join(", ") + ") d(base) CROSS JOIN (VALUES " + PERMISOS.map(p => `('${p}')`).join(", ") + ") p(permiso)"

// Permisos de escritura otorgados tabla por tabla (no aparecen en los permisos de base).
const sqlTablas = prefijo => `SELECT COUNT(*) AS escribibles FROM ${prefijo}sys.tables t JOIN ${prefijo}sys.schemas s ON s.schema_id = t.schema_id `
    + "WHERE " + ["INSERT", "UPDATE", "DELETE"].map(p =>
        `HAS_PERMS_BY_NAME(${prefijo ? `'${prefijo}' + ` : ""}QUOTENAME(s.name) + '.' + QUOTENAME(t.name), 'OBJECT', '${p}') = 1`).join(" OR ")

const remota = consulta => `SELECT * FROM OPENQUERY(CONEXIONSAP, '${consulta.replace(/'/g, "''")}')`

async function problemasSoloLectura(pool) {
    const problemas = []
    const filas = async (nombre, consulta) => {
        try {
            const r = await pool.request().query(consulta)
            if (!r.recordset || !r.recordset.length) throw new Error("sin filas")
            return r.recordset
        } catch (e) {
            problemas.push(`${nombre}: no se pudo comprobar (${e.message})`)
            return []
        }
    }
    const revisarRoles = (lugar, rs) => {
        for (const f of rs) for (const r of ROLES) if (f[r] !== 0) problemas.push(`${lugar}: el login ${f.login} tiene el rol ${r} o no se pudo evaluar`)
    }
    const revisarPermisos = (lugar, rs) => {
        for (const f of rs) if (f.tiene !== 0) problemas.push(`${lugar}: ${f.base} permite ${f.permiso}${f.tiene === null ? " (no evaluable)" : ""}`)
    }
    const revisarTablas = (lugar, rs) => {
        for (const f of rs) if (f.escribibles !== 0) problemas.push(`${lugar}: ${f.escribibles} tabla(s) con INSERT/UPDATE/DELETE`)
    }

    revisarRoles("FPS", await filas("Roles FPS", sqlRoles()))
    revisarPermisos("FPS", await filas("Permisos FPS", sqlPermisos(["DB_NAME()"])))
    revisarTablas("FPS", await filas("Tablas FPS", sqlTablas("")))
    revisarRoles("SAP", await filas("Roles SAP", remota(sqlRoles())))
    revisarPermisos("SAP", await filas("Permisos SAP", remota(sqlPermisos(BASES_SAP.map(b => `'${b}'`)))))
    for (const base of BASES_SAP) revisarTablas(`SAP ${base}`, await filas(`Tablas ${base}`, remota(sqlTablas(`${base}.`))))
    // Ida y vuelta: desde SAP, la identidad remota no puede volver a FPS (solo vale el rechazo del usuario inexistente).
    try {
        await pool.request().query(remota("SELECT * FROM OPENQUERY(CONEXIONFPS, 'SELECT 1 AS x')"))
        problemas.push("Retorno: desde SAP se puede volver a FPS por CONEXIONFPS")
    } catch (e) {
        const texto = [e, ...(e.precedingErrors || [])].map(x => x.message).join(" | ")
        if (!texto.includes(USUARIO_BLOQUEO)) problemas.push(`Retorno: no se pudo confirmar el bloqueo de CONEXIONFPS (${e.message})`)
    }
    return problemas
}

module.exports = { problemasSoloLectura, BASES_SAP, ROLES, PERMISOS }
