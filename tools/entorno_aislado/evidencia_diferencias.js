// Guarda el DETALLE (documentos, folios y corridas con fecha) de las NP con diferencias, desde la fps-api de producción.
// Un GET por NP (4123, 4162 y 4190), con pausa. Requiere autorización de TI. No compara ni cambia la referencia.
//   node --use-system-ca tools/entorno_aislado/evidencia_diferencias.js
// Solo conserva los campos listados abajo (sin clientes, operadores ni inspectores). El archivo queda en
// %LOCALAPPDATA%\QCC_Aislado\evidencia_<fecha>.json, fuera del repositorio.
const fs = require("fs")
const path = require("path")
const readline = require("readline")
const c = require("./comun")
const { URL_PRODUCCION, urlProduccion, exigirTlsVerificado, opcionesConsulta } = require("./consulta-fps")

const NPS = ["4123", "4162", "4190"]
const CAMPOS = {
    ordenes: ["OrdenTrabajo", "FechaIngreso"],
    notaVenta: ["DocEntry", "DocNum", "DocDate", "Cancelada", "LineNum", "Item", "ItemCode", "Cantidad"],
    documentos: ["Tipo", "DocEntry", "DocNum", "FolioNum", "DocDate", "LineNum", "BaseType", "BaseEntry", "BaseLine", "ItemCode", "Cantidad", "LineaNv", "Origen"],
    liberaciones: ["Folio", "Item", "ItemCode", "Fecha", "Cantidad", "BodegaOrigen", "BodegaDestino"],
    sesiones: ["RecordKey", "IdProceso", "Status", "EnCurso", "SetupStartDate", "ProductionStartDate", "ProductionEndDate", "ProductionQuantity"],
    items: ["item", "itemCode", "solicitado", "liberadoPt", "saldoBodegas", "foliosLiberacion", "foliosSinCerrar", "despachado", "guias", "facturadoDirecto", "facturadoDeGuia", "devuelto", "notasCredito"]
}
// null = la fuente no entregó el dato; se conserva como null.
const recortar = (filas, campos) => Array.isArray(filas) ? filas.map(f => Object.fromEntries(campos.map(k => [k, f[k] ?? null]))) : null

function preguntar(texto, oculto) {
    return new Promise(r => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
        rl.question(texto, v => { rl.close(); if (oculto) process.stdout.write("\n"); r(v.trim()) })
        if (oculto) rl._writeToOutput = s => { if (s.includes(texto)) process.stdout.write(texto) }
    })
}

;(async () => {
    exigirTlsVerificado(process.env)
    const base = urlProduccion(await preguntar(`URL base de fps-api de producción (${URL_PRODUCCION}): `))
    const clave = await preguntar("Clave de la API (no se muestra): ", true)
    if (!clave) throw new Error("Falta la clave")

    const informe = { generado: new Date().toISOString(), origen: "fps-api de producción (versión anterior)", np: [] }
    fs.mkdirSync(c.RUTAS.datos, { recursive: true })
    const salida = path.join(c.RUTAS.datos, `evidencia_${informe.generado.replace(/[-:]/g, "").slice(0, 15)}.json`)
    for (const np of NPS) {
        if (informe.np.length) await new Promise(r => setTimeout(r, 5000))
        const r = await fetch(`${base}/trazabilidad/np?np=${np}`, opcionesConsulta(clave))
        const cuerpo = await r.json().catch(() => null)
        if (!cuerpo?.ok) throw new Error(`NP ${np}: HTTP ${r.status}. Se detiene: avisar a TI.`)
        const d = cuerpo.data
        const caidas = Object.entries(d.fuentes || {}).filter(([, f]) => !f.ok).map(([n]) => n)
        const registro = { np, fuentesCaidas: caidas, sesionesTruncadas: d.sesionesTruncadas ?? null }
        for (const [nombre, campos] of Object.entries(CAMPOS)) registro[nombre] = recortar(d[nombre], campos)
        registro.documentosSinAsignar = recortar(d.sinAsignar?.documentos, CAMPOS.documentos)
        registro.liberacionesSinAsignar = recortar(d.sinAsignar?.liberaciones, CAMPOS.liberaciones)
        informe.np.push(registro)
        // Se guarda tras cada NP: lo ya consultado no se pierde ni hay que repetirlo.
        fs.writeFileSync(salida, JSON.stringify(informe, null, 1))
        console.log(`NP ${np}: ${registro.documentos?.length ?? "-"} documentos, ${registro.liberaciones?.length ?? "-"} folios, ${registro.sesiones?.length ?? "-"} corridas`)
        if (caidas.length) throw new Error(`NP ${np}: fuentes caídas (${caidas.join(", ")}). Se detiene: avisar a TI.`)
    }
    console.log(`Detalle: ${salida}`)
})().catch(e => {
    console.error("No se pudo capturar: " + e.message + (e.cause ? ` (${e.cause.code || e.cause.message})` : ""))
    process.exit(1)
})
