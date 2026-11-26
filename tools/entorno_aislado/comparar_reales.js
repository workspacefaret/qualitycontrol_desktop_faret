// Compara la fps-api LOCAL del entorno aislado con las cifras de origen (referencia_np.json) y mide tiempos.
// Solo hace GET: a 127.0.0.1 o, con --produccion, a la única dirección admitida en consulta-fps.js. Uso:
//   node tools/entorno_aislado/comparar_reales.js              las 8 NP de la referencia
//   node tools/entorno_aislado/comparar_reales.js --np 4007    una NP (sin referencia solo muestra lo recibido)
//   node tools/entorno_aislado/comparar_reales.js --produccion   validación PARCIAL contra la fps-api desplegada (solo
//     GET, una consulta por NP con pausa). Requiere autorización de TI. Pide URL y clave; no se guardan ni se imprimen.
//     Con la CA corporativa: node --use-system-ca ... (nunca desactivar la verificación TLS).
// El detalle queda en %LOCALAPPDATA%\QCC_Aislado\comparacion_<fecha>.json (fuera del repositorio).
const fs = require("fs")
const path = require("path")
const vm = require("vm")
const readline = require("readline")
const c = require("./comun")
const { URL_PRODUCCION, urlProduccion, exigirTlsVerificado, opcionesConsulta } = require("./consulta-fps")

const referencia = require("./referencia_np.json").np
const args = process.argv.slice(2)
const produccion = args.includes("--produccion")
const nps = args.includes("--np") ? [args[args.indexOf("--np") + 1]] : Object.keys(referencia)
// Un argumento mal escrito no debe cambiar en silencio lo que se consulta.
const sobrantes = args.filter((a, i) => a !== "--produccion" && a !== "--np" && args[i - 1] !== "--np")
if (sobrantes.length || !nps.every(n => /^\d{1,9}$/.test(String(n)))) {
    console.error("Uso: node comparar_reales.js [--produccion] [--np <número>]")
    process.exit(1)
}
// La versión desplegada el 24-11 calcula estas cifras con consultas anteriores a la corrección del 25-11.
const CALCULO_ANTERIOR = ["Despachado neto NP", "Despachado según el balance de la pantalla", "Documentos sin ítem asignado"]

let base = c.urlFps()
let clave = null

function preguntar(texto, oculto) {
    return new Promise(r => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
        rl.question(texto, v => { rl.close(); if (oculto) process.stdout.write("\n"); r(v.trim()) })
        if (oculto) rl._writeToOutput = s => { if (s.includes(texto)) process.stdout.write(texto) }
    })
}

async function preparar() {
    if (!produccion) {
        // La clave es la local generada por preparar.js para este entorno; no se imprime.
        clave = JSON.parse(fs.readFileSync(path.join(c.RUTAS.datos, "config.json"), "utf8")).FpsApi.ApiKey
        return
    }
    exigirTlsVerificado(process.env)
    // La URL se valida antes de pedir la clave.
    base = urlProduccion(await preguntar(`URL base de fps-api de producción (${URL_PRODUCCION}): `))
    clave = await preguntar("Clave de la API (no se muestra): ", true)
    if (!clave) throw new Error("Falta la clave")
}

// Mismo código de balance que usa la pantalla.
const www = path.resolve(__dirname, "../../src/UI/www")
const ctx = vm.createContext({ window: {}, document: {}, sessionStorage: { getItem: () => "" }, console })
vm.runInContext(fs.readFileSync(path.join(www, "shared/calidad-np-base.js"), "utf8"), ctx)
const C = ctx.window.CalidadNp

async function consultar(np) {
    const inicio = Date.now()
    const r = await fetch(`${base}/trazabilidad/np?np=${encodeURIComponent(np)}`, opcionesConsulta(clave))
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
    await preparar()
    const informe = { generado: new Date().toISOString(), origen: produccion ? "fps-api de producción (versión anterior)" : "entorno aislado", resultados: [] }
    const inicio = Date.now()
    for (const np of nps) {
        // Producción: una NP a la vez, con pausa, y se detiene ante el primer error del servidor o fuente caída.
        if (produccion && informe.resultados.length) await new Promise(r => setTimeout(r, 5000))
        const primera = await consultar(np)
        if (!primera.cuerpo?.ok) {
            console.log(`\nNP ${np}: HTTP ${primera.http} ${primera.cuerpo?.message || "sin respuesta válida"} (${primera.ms} ms)`)
            informe.resultados.push({ np, http: primera.http, ms: primera.ms, error: primera.cuerpo?.message || null })
            if (produccion) { console.log("Se detiene la validación contra producción: avisar a TI."); break }
            continue
        }
        const segunda = produccion ? null : await consultar(np)
        const d = primera.cuerpo.data
        const fuentes = Object.entries(d.fuentes || {}).filter(([, f]) => !f.ok).map(([n, f]) => `${n} (${f.error})`)
        const filas = d.fuentes ? comparar(np, d) : []
        if (produccion) for (const f of filas) if (CALCULO_ANTERIOR.includes(f.dato)) f.resultado = "NO VALIDABLE"
        const noValidables = filas.filter(f => f.resultado === "NO VALIDABLE")
        const difieren = filas.filter(f => f.resultado === "DIFIERE")
        const nd = filas.filter(f => f.resultado === "NO DISPONIBLE")
        console.log(`\nNP ${np}: ${filas.filter(f => f.resultado === "COINCIDE").length} coinciden, ${difieren.length} difieren, ${nd.length} no disponibles · ${primera.ms} ms${segunda ? ` (repetida ${segunda.ms} ms)` : ""}`)
        if (fuentes.length) console.log("  Fuentes caídas: " + fuentes.join(", "))
        for (const f of [...difieren, ...nd, ...noValidables])console.log(`  ${f.resultado}: ${f.dato} · origen ${f.origen ?? "-"} · aplicación ${f.aplicacion ?? "-"}`)
        if (!referencia[np]) for (const f of filas) console.log(`  ${f.dato}: ${f.aplicacion ?? "No disponible"}`)
        informe.resultados.push({ np, ms: primera.ms, msRepetida: segunda?.ms ?? null, fuentesCaidas: fuentes, filas })
        if (produccion && fuentes.length) { console.log("Se detiene la validación contra producción: hay fuentes caídas, avisar a TI."); break }
    }
    fs.mkdirSync(c.RUTAS.datos, { recursive: true })
    informe.segundosTotales = Math.round((Date.now() - inicio) / 100) / 10
    const salida = path.join(c.RUTAS.datos, `comparacion_${informe.generado.replace(/[-:]/g, "").slice(0, 15)}.json`)
    fs.writeFileSync(salida, JSON.stringify(informe, null, 1))
    console.log(`\nTiempo técnico total: ${informe.segundosTotales} s · detalle: ${salida}`)
})().catch(e => {
    // e.cause trae el motivo de red o certificado (no incluye la clave).
    console.error("No se pudo comparar: " + e.message + (e.cause ? ` (${e.cause.code || e.cause.message})` : ""))
    process.exit(1)
})
