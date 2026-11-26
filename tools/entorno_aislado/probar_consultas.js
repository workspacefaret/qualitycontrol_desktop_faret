// Ejecuta TODAS las rutas activas de la fps-api LOCAL (entorno aislado), es decir, sus consultas reales con la cuenta
// de solo lectura. Solo llama a 127.0.0.1. Imprime estado, cantidad de filas y tiempo; nunca datos.
//   node tools/entorno_aislado/probar_consultas.js [NP]      (por defecto 4007)
const fs = require("fs")
const path = require("path")
const c = require("./comun")

const np = process.argv[2] || "4007"
if (!/^\d{1,9}$/.test(np)) { console.error("NP no válida"); process.exit(1) }
// Clave local generada por preparar.js para este entorno; no se imprime.
const clave = JSON.parse(fs.readFileSync(path.join(c.RUTAS.datos, "config.json"), "utf8")).FpsApi.ApiKey

let fallas = 0, omitidas = 0
async function probar(nombre, ruta, cuerpo) {
    const inicio = Date.now()
    let http = 0, json = null
    try {
        const r = await fetch(`${c.urlFps()}${ruta}`, {
            method: cuerpo ? "POST" : "GET", body: cuerpo ? JSON.stringify(cuerpo) : undefined,
            headers: { "x-api-key": clave, ...(cuerpo ? { "content-type": "application/json" } : {}) }, signal: AbortSignal.timeout(120000)
        })
        http = r.status
        json = await r.json().catch(() => null)
    } catch (e) { json = { message: e.message } }
    const ok = http === 200 && json?.ok === true
    const d = json?.data
    const filas = Array.isArray(d) ? `${d.length} filas` : ""
    // 404 con respuesta de la API: la consulta se ejecutó y no hay dato para ese caso.
    const sinDato = http === 404 && json?.ok === false
    if (!ok && !sinDato) fallas++
    console.log(`${ok ? "OK      " : sinDato ? "SIN DATO" : "FALLA   "} ${nombre.padEnd(34)} HTTP ${http} ${String(Date.now() - inicio).padStart(6)} ms ${ok ? filas : json?.message || ""}`)
    return ok ? json : null
}
function omitir(nombre, motivo) { omitidas++; console.log(`OMITIDA  ${nombre.padEnd(34)} ${motivo}`) }
const dia = f => f.toISOString().slice(0, 10)

;(async () => {
    await probar("conexión", "/test-db")

    const traza = (await probar("trazabilidad/np", `/trazabilidad/np?np=${np}`))?.data
    for (const [nombre, f] of Object.entries(traza?.fuentes || {})) {
        if (!f.ok) fallas++
        console.log(`${f.ok ? "OK      " : "FALLA   "}   fuente ${nombre.padEnd(27)} ${f.ok ? `${f.registros} registros` : f.error}`)
    }
    if (!traza?.fuentes) { fallas++; console.log("FALLA    la NP no devolvió fuentes: probar con otra NP") }

    const sesion = traza?.sesiones?.[0]
    const proceso = traza?.procesos?.[0]
    const ot = traza?.ordenes?.[0]?.OrdenTrabajo
    const lote = (traza?.consumos || []).flatMap(x => x.lotes || []).map(l => l.lote).find(l => /^[A-Za-z0-9][A-Za-z0-9._/-]{0,35}$/.test(String(l)))

    await probar("trazabilidad/buscar", `/trazabilidad/buscar?texto=${encodeURIComponent("SPA")}`)
    if (lote) await probar("trazabilidad/lote", `/trazabilidad/lote?lote=${encodeURIComponent(lote)}`); else omitir("trazabilidad/lote", "la NP no trae lotes")
    if (sesion) await probar("trazabilidad/corrida", `/trazabilidad/corrida?np=${np}&corrida=${encodeURIComponent(sesion.RecordKey)}`); else omitir("trazabilidad/corrida", "sin corridas")

    await probar("procesos-por-np", `/procesos-por-np/${np}`)
    if (ot) await probar("procesos-por-ot", `/procesos-por-ot/${ot}`); else omitir("procesos-por-ot", "sin OT")
    if (proceso) {
        await probar("registros-por-proceso", `/registros-por-proceso/${proceso.IdProceso}`)
        await probar("materiales-por-proceso", `/materiales-por-proceso?ids=${proceso.IdProceso}`)
    } else { omitir("registros-por-proceso", "sin procesos"); omitir("materiales-por-proceso", "sin procesos") }
    await probar("comparacion-desgaje", "/comparacion-desgaje", { nps: [np] })
    await probar("pilas-dimensionado", `/pilas-dimensionado?np=${np}`)
    await probar("laboratorio/registros", `/laboratorio/registros?np=${np}`)
    await probar("laboratorio/registros (artículos)", `/laboratorio/registros?np=${np}&soloArticulos=1`)
    await probar("sesiones-documentos", `/sesiones-documentos?np=${np}`)

    const maquina = sesion?.IdMaquina
    const fecha = String(sesion?.ProductionStartDate || sesion?.SetupStartDate || "").slice(0, 10)
    if (maquina && fecha) await probar("sesiones-maquina", `/sesiones-maquina?maquina=${maquina}&desde=${fecha}&hasta=${fecha}`); else omitir("sesiones-maquina", "sin máquina o fecha")
    // np-contexto solo consulta la base con NP de 5 dígitos.
    const npCinco = (traza?.ordenes || []).flatMap(o => [o.NotaVentaFaret, o.OrdenTrabajo]).map(String).find(v => /^\d{5}$/.test(v))
    if (maquina && npCinco) await probar("np-contexto", `/np-contexto?np=${npCinco}&maquina=${maquina}`); else omitir("np-contexto", "sin NP de 5 dígitos o máquina")

    await probar("liberaciones/inspectores", `/liberaciones/inspectores?nps=${np}`)
    const certificados = (await probar("liberaciones/certificados", `/liberaciones/certificados?np=${np}`))?.data || []
    const cert = certificados[0]
    if (cert) {
        const q = new URLSearchParams({ np: cert.Np, item: cert.Item, codigo: cert.CodigoArticulo, empresa: cert.Empresa })
        await probar("liberaciones", `/liberaciones?${q}`)
        await probar("certificado PDF", `/liberaciones/certificados/${cert.Folio}/pdf`)
        await probar("certificado de Calidad", `/liberaciones/certificados/${cert.Folio}/calidad`)
    } else for (const n of ["liberaciones", "certificado PDF", "certificado de Calidad"]) omitir(n, "la NP no tiene certificados")
    const hoy = new Date()
    await probar("liberaciones/despachos (7 días)", `/liberaciones/despachos?fechaDesde=${dia(new Date(hoy - 7 * 86400000))}&fechaHasta=${dia(hoy)}`)

    console.log(`\n${fallas} fallas, ${omitidas} omitidas. El error SQL de una falla está en ${path.join(c.RUTAS.datos, "fps-api.log")}`)
    process.exit(fallas ? 1 : 0)
})().catch(e => { console.error("No se pudo probar: " + e.message); process.exit(1) })
