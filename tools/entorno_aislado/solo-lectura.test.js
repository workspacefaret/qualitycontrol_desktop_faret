// node --test tools/entorno_aislado/solo-lectura.test.js  (pool simulado)
const test = require("node:test")
const assert = require("node:assert")
const { problemasSoloLectura, BASES_SAP, ROLES, PERMISOS } = require("./solo-lectura")

const roles = extra => [{ login: "qcc_lectura", ...Object.fromEntries(ROLES.map(r => [r, 0])), ...extra }]
const pool = (cambios = {}) => ({
    request: () => ({
        async query(sql) {
            const remoto = sql.includes("OPENQUERY(CONEXIONSAP")
            const clave = (remoto ? "sap" : "fps") + (sql.includes("sys.tables") ? "Tablas" : sql.includes("IS_SRVROLEMEMBER") ? "Roles" : "Permisos")
            if (clave in cambios) {
                if (cambios[clave] instanceof Error) throw cambios[clave]
                return { recordset: cambios[clave] }
            }
            if (clave.endsWith("Tablas")) return { recordset: [{ escribibles: 0 }] }
            if (clave.endsWith("Roles")) return { recordset: roles() }
            const bases = remoto ? BASES_SAP : ["FPS_PRODUCCION"]
            return { recordset: bases.flatMap(base => PERMISOS.map(permiso => ({ base, permiso, tiene: 0 }))) }
        }
    })
})

test("login de solo lectura: sin problemas", async () => assert.deepStrictEqual(await problemasSoloLectura(pool()), []))

for (const [nombre, cambios] of [
    ["sa local", { fpsRoles: roles({ sysadmin: 1 }) }],
    ["sa en el servidor enlazado", { sapRoles: roles({ sysadmin: 1 }) }],
    ["escritura en FPS", { fpsPermisos: [{ base: "FPS_PRODUCCION", permiso: "UPDATE", tiene: 1 }] }],
    ["EXECUTE en SAP", { sapPermisos: [{ base: "INNPACK_PRODUCCION", permiso: "EXECUTE", tiene: 1 }] }],
    ["base no evaluable", { sapPermisos: [{ base: "INNPACK_PRODUCCION", permiso: "INSERT", tiene: null }] }],
    ["permiso por tabla", { sapTablas: [{ escribibles: 2 }] }],
    ["comprobación que falla", { sapRoles: new Error("login failed") }],
    ["comprobación vacía", { fpsRoles: [] }]
]) test(`rechaza: ${nombre}`, async () => assert.ok((await problemasSoloLectura(pool(cambios))).length > 0))

test("las comillas del SQL remoto van escapadas", async () => {
    const vistos = []
    const base = pool()
    await problemasSoloLectura({ request: () => ({ query: s => (vistos.push(s), base.request().query(s)) }) })
    for (const s of vistos.filter(x => x.includes("OPENQUERY"))) {
        const interior = s.slice(s.indexOf(", '") + 3, -2)
        assert.ok(!interior.replace(/''/g, "").includes("'"), s)
        assert.ok(interior.length < 8000, "OPENQUERY admite hasta 8000 caracteres")
    }
})
