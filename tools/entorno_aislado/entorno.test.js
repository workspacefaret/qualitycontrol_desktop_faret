// Los procesos del entorno aislado no heredan credenciales ni destinos de la terminal. Cargar iniciar.js no levanta nada.
const test = require("node:test")
const assert = require("node:assert")

test("las variables sensibles no se heredan; las de Service Layer se separan para apisapfaret", () => {
    const falsas = { FPS_SQL_PASSWORD: "x1", SQL_PASSWORD: "x2", MYSQL_PASSWORD: "x3", Database__ConnectionString: "x4", Jwt__SecretKey: "x5", QCC_CONFIG: "x6",
        SapServiceLayer__SoloLectura: "false", SapServiceLayer__Companies__INNPACK__Password: "x7", FpsApi__BaseUrl: "x8" }
    const antes = { ...process.env }
    Object.assign(process.env, falsas)
    try {
        const { entornoBase, credencialesSap } = require("./iniciar")
        const e = entornoBase({ PORT: "1" })
        for (const k of Object.keys(falsas)) assert.ok(!(k in e), k)
        assert.strictEqual(e.PORT, "1")
        assert.ok(Object.keys(e).some(k => k.toUpperCase() === "PATH"))
        assert.deepStrictEqual(Object.keys(credencialesSap()), ["SapServiceLayer__Companies__INNPACK__Password"])
    } finally {
        for (const k of Object.keys(falsas)) if (!(k in antes)) delete process.env[k]
    }
})
