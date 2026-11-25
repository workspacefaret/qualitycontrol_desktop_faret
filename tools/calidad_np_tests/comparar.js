// Compara las respuestas reales de fps-api con las cifras obtenidas por SQL de solo lectura (25-11-2026) y genera,
// con el código real de www, el balance y el informe V05 de cada NP. No consulta ninguna API ni base.
//   node tools/calidad_np_tests/comparar.js [carpeta con np_<n>.json]
// Las cifras SQL son una foto: una NP con despachos posteriores puede diferir legítimamente.
// Regla vigente de despachado: guías (incl. sobre factura de reserva) + facturas directas - devoluciones - reingresos por NC.
// Contra la API de producción (reglas antiguas) pueden diferir las NP con factura de reserva o nota de crédito.
const fs = require("fs")
const path = require("path")
const vm = require("vm")
const www = path.resolve(__dirname, "../../src/UI/www")
const dir = process.argv[2] || "C:\\Installers\\Auditoria_1.8.40\\respuestas"

// Por código de producto (SAP): [solicitado, despachado neto, liberado a PT (QCS)]. null = sin línea base.
const SQL = {
    3951: { "4498011500300": [4815000, 3091584, 3091584], "4498011500292": [1790000, 1264650, 1264650] },
    4007: { "4596011040929": [140000, 140000, 140000], "4596012050883": [140000, 140000, 140000], "4596011040930": [100000, 102000, 102000], "4596012050884": [100000, 102000, 102000] },
    4070: { "4142007713067": [350000, 338320, 338320] },
    4128: { "4516011000005": [40000, 42508, 42508], "4416011000019": [15000, 16400, 16400] },
    4171: { "4723011500152": [273000, 279000, 279000] }
}

const ctx = vm.createContext({ window: {}, document: { getElementById: () => ({ value: "", style: {} }) }, sessionStorage: { getItem: () => "auditoria" }, console })
for (const f of ["shared/calidad-np-base.js", "modules/trazabilidad/trazabilidad.controller.js"]) {
    vm.runInContext(fs.readFileSync(path.join(www, f), "utf8"), ctx, { filename: f })
    ctx.CalidadNp = ctx.window.CalidadNp
}
if (!fs.existsSync(dir)) { console.log("No existe la carpeta de respuestas:", dir); process.exit(2) }

let ok = 0, dif = 0
const salida = []
for (const archivo of fs.readdirSync(dir).filter(f => /^np_\d+\.json$/.test(f)).sort()) {
    const np = Number(archivo.match(/\d+/)[0])
    const json = JSON.parse(fs.readFileSync(path.join(dir, archivo), "utf8").replace(/^﻿/, ""))
    const d = json.data || json
    salida.push(`\n== NP ${np}  fuentes: ${Object.entries(d.fuentes || {}).map(([k, v]) => `${k}=${v.estado || v.ok}`).join(" ")}`)
    for (const [codigo, base] of Object.entries(SQL[np] || {})) {
        const its = (d.items || []).filter(i => String(i.itemCode) === codigo)
        const suma = campo => (its.length && its.every(i => i[campo] !== null && i[campo] !== undefined) ? its.reduce((a, i) => a + Number(i[campo]), 0) : null)
        const api = [suma("solicitado"), suma("despachado"), suma("liberadoPt")]
        ;["solicitado", "despachado", "liberado PT"].forEach((nombre, k) => {
            const igual = api[k] !== null && Math.abs(api[k] - base[k]) < 0.001
            igual ? ok++ : dif++
            salida.push(`  ${igual ? "OK " : "DIF"} ${codigo} ${nombre}: SQL=${base[k]} API=${api[k]}`)
        })
    }
    const carga = { np: String(np), data: d, factores: [], consultadoEn: new Date() }
    for (const item of [...new Set((d.items || []).map(i => i.item))]) {
        const b = ctx.window.CalidadNp.balance({ carga, item, mermas: [] })
        salida.push(`  Balance ítem ${item}: ` + b.filas.map(f => `${f.etapa} ${f.procesado ?? "s/d"}`).join(" | "))
        for (const a of b.advertencias || []) salida.push(`    aviso: ${a}`)
    }
    const t = new ctx.window.TrazabilidadController()
    t._integral = { np: String(np), data: d, calidad: null }
    t._sgi = { factores: [], requisitos: [] }
    const bal = t.modeloV05().bloques.find(x => x.titulo.startsWith("BALANCE DE MASAS"))
    for (const f of bal?.filas || []) salida.push(`  V05 ${f.join(" ; ")}`)
}
salida.push(`\nComparación SQL vs API: ${ok} coinciden, ${dif} difieren`)
console.log(salida.join("\n"))
fs.writeFileSync(path.join(dir, "comparacion.txt"), salida.join("\n"), "utf8")
process.exit(dif ? 1 : 0)
