// Compara la fps-api LOCAL del entorno aislado con las cifras de origen (referencia_np.json) y mide tiempos.
// Solo hace GET a 127.0.0.1. Uso, con el entorno levantado:
//   node tools/entorno_aislado/comparar_reales.js              las 8 NP de la referencia
//   node tools/entorno_aislado/comparar_reales.js --np 4007    una NP (sin referencia solo muestra lo recibido)
// El detalle queda en %LOCALAPPDATA%\QCC_Aislado\comparacion_<fecha>.json (fuera del repositorio).
const fs = require("fs")
const path = require("path")
const vm = require("vm")
const c = require("./comun")

const referencia = require("./referencia_np.json").np
const args = process.argv.slice(2)
const nps = args[0] === "--np" ? [args[1]] : Object.keys(referencia)

// La clave es la local generada por preparar.js para este entorno; no se imprime.
const config = JSON.parse(fs.readFileSync(path.join(c.RUTAS.datos, "config.json"), "utf8"))
const clave = config.FpsApi.ApiKey

// Mismo código de balance que usa la pantalla.
const www = path.resolve(__dirname, "../../src/UI/www")
const ctx = vm.createContext({ window: {}, document: {}, sessionStorage: { getItem: () => "" }, console })
vm.runInContext(fs.readFileSync(path.join(www, "shared/calidad-np-base.js"), "utf8"), ctx)
const C = ctx.window.CalidadNp

async function consultar(np) {
    const inicio = Date.now()
    const r = await fetch(`${c.urlFps()}/trazabilidad/np?np=${encodeURIComponent(np)}`, { headers: { "x-api-key": clave }, signal: AbortSignal.timeout(120000) })
    const cuerpo = await r.json().catch(() => null)
    return { ms: Date.now() - inicio, http: r.status, cuerpo }
}

const suma = xs => xs.reduce((a, x) => a + (Number(x) || 0), 0)

function comparar(np, d) {
    const filas = []
    const ref = referencia[np]
    // null = la fuente no entregó el dato: se informa, nunca se compara como cero.
    const agregar = (dato, esperado, obtenido) => filas.push({
        dato, origen: esperado, aplicacion: obtenido,
        resultado: obtenido === null || obtenido === undefined ? "NO DISPONIBLE" : esperado === undefined ? "SIN REFERENCIA" : Number(esperado) === Number(obtenido) ? "COINCIDE" : "DIFIERE"
    })
    const items = d.items
    const numeros = ref ? Object.keys(ref.solicitado) : (items || []).map(i => String(i.item))
    for (const n of numeros) {
        const its = items ? items.filter(i => String(i.item) === n) : null
        agregar(`Ítem ${n} solicitado`, ref?.solicitado[n], its?.length ? suma(its.map(i => i.solicitado)) : null)
        agregar(`Ítem ${n} liberado PT`, ref?.liberadoPt[n], its?.length && its.every(i => i.liberadoPt !== null) ? suma(its.map(i => i.liberadoPt)) : null)
    }
    if (ref) agregar("Ítems sin referencia", 0, items ? items.filter(i => !(String(i.item) in ref.solicitado)).length : null)
    const conDespacho = items && items.every(i => i.despachado !== null)
    agregar("Despachado neto NP", ref?.despachado, conDespacho ? suma(items.map(i => i.despachado)) : null)
    agregar("Documentos sin ítem asignado", ref ? 0 : undefined, d.sinAsignar ? d.sinAsignar.documentos.length : null)
    agregar("Cuarentena QCS", ref?.cuarentena, items && items.every(i => i.saldoBodegas) ? suma(items.map(i => i.saldoBodegas.CUARENTENA)) : null)
    const validas = d.sesiones ? d.sesiones.filter(s => Number(s.Status) === 1) : null
    agregar("Procesos FPS", ref?.procesos, d.procesos ? new Set(d.procesos.map(p => String(p.IdProceso))).size : null)
    agregar("Corridas FPS", ref?.sesiones, d.sesiones ? d.sesiones.length : null)
    agregar("Corridas válidas", ref?.sesionesValidas, validas ? validas.length : null)
    agregar("Producido en corridas válidas (suma de procesos, no es producto terminado)", ref?.producido, validas ? suma(validas.map(s => s.ProductionQuantity)) : null)
    agregar("Corridas repetidas", ref ? 0 : undefined, d.sesiones ? d.sesiones.length - new Set(d.sesiones.map(s => String(s.RecordKey))).size : null)
    // Pantalla: la fila Despacho del balance de cada ítem debe sumar lo mismo que la referencia.
    const carga = { np: String(np), data: d, factores: [], consultadoEn: new Date() }
    const balances = (items || []).map(i => C.balance({ carga, item: i.item, mermas: [] }))
    const despachos = balances.map(b => b.filas.find(f => f.etapa === "Despacho")?.salidaConforme)
    agregar("Despachado según el balance de la pantalla", ref?.despachado, items && despachos.every(v => v !== null && v !== undefined) ? suma(despachos) : null)
    return filas
}

;(async () => {
    const informe = { generado: new Date().toISOString(), resultados: [] }
    const inicio = Date.now()
    for (const np of nps) {
        const primera = await consultar(np)
        if (!primera.cuerpo?.ok) {
            console.log(`\nNP ${np}: HTTP ${primera.http} ${primera.cuerpo?.message || "sin respuesta válida"} (${primera.ms} ms)`)
            informe.resultados.push({ np, http: primera.http, ms: primera.ms, error: primera.cuerpo?.message || null })
            continue
        }
        const segunda = await consultar(np)
        const d = primera.cuerpo.data
        const fuentes = Object.entries(d.fuentes || {}).filter(([, f]) => !f.ok).map(([n, f]) => `${n} (${f.error})`)
        const filas = d.fuentes ? comparar(np, d) : []
        const difieren = filas.filter(f => f.resultado === "DIFIERE")
        const nd = filas.filter(f => f.resultado === "NO DISPONIBLE")
        console.log(`\nNP ${np}: ${filas.filter(f => f.resultado === "COINCIDE").length} coinciden, ${difieren.length} difieren, ${nd.length} no disponibles · ${primera.ms} ms (repetida ${segunda.ms} ms)`)
        if (fuentes.length) console.log("  Fuentes caídas: " + fuentes.join(", "))
        for (const f of [...difieren, ...nd]) console.log(`  ${f.resultado}: ${f.dato} · origen ${f.origen ?? "-"} · aplicación ${f.aplicacion ?? "-"}`)
        if (!referencia[np]) for (const f of filas) console.log(`  ${f.dato}: ${f.aplicacion ?? "No disponible"}`)
        informe.resultados.push({ np, ms: primera.ms, msRepetida: segunda.ms, fuentesCaidas: fuentes, filas })
    }
    informe.segundosTotales = Math.round((Date.now() - inicio) / 100) / 10
    const salida = path.join(c.RUTAS.datos, `comparacion_${informe.generado.replace(/[-:]/g, "").slice(0, 15)}.json`)
    fs.writeFileSync(salida, JSON.stringify(informe, null, 1))
    console.log(`\nTiempo técnico total: ${informe.segundosTotales} s · detalle: ${salida}`)
})().catch(e => { console.error("No se pudo comparar: " + e.message); process.exit(1) })
