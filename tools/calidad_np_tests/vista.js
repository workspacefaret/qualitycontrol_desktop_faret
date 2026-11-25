// Vista aislada de las cuatro pantallas de Calidad NP con el front real (vistas, controladores y CSS) y un puente
// simulado. La respuesta de trazabilidad.integral la produce el servicio REAL de fps-api sobre un pool simulado:
// no se conecta a ninguna API ni base de datos y no escribe nada fuera de la carpeta de salida.
//   node tools/calidad_np_tests/vista.js <carpetaSalida> [antigua|falla]
//   antigua = respuesta del servicio fps-api respaldado antes de la auditoría (equivale a producción: sin campos nuevos)
//   falla   = SAP despachos y consumos caídos, y error en la lista de mermas y en la consulta de cierre
// Genera <carpetaSalida>/<modulo>.html (abrir en Edge). Los DATOS SON FICTICIOS: sirve para revisar pantallas.
const fs = require("fs")
const path = require("path")
const { pathToFileURL } = require("url")

const salida = process.argv[2]
const caso = process.argv[3] || ""
if (!salida) { console.error("Uso: node tools/calidad_np_tests/vista.js <carpetaSalida>"); process.exit(2) }
const www = path.resolve(__dirname, "../../src/UI/www")
const fps = path.resolve(__dirname, "../../../fps-api/fps-api")
const reqFps = m => require(path.join(fps, "node_modules", m))

const { crearPool } = require("./datos_ficticios")
const pool = crearPool({ falla: caso === "falla" })
const dbPath = require.resolve(path.join(fps, "src/config/db"))
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: reqFps("mssql"), getPool: async () => pool } }
let servicio
if (caso === "antigua") {
    // El respaldo se compila con la ruta del servicio vigente para que sus require relativos resuelvan igual.
    const Module = require("module")
    const ruta = path.join(fps, "src/services/trazabilidad.service.js")
    const m = new Module(ruta, module)
    m.filename = ruta
    m.paths = Module._nodeModulePaths(path.dirname(ruta))
    m._compile(fs.readFileSync(path.join(fps, "respaldo_pre_auditoria_20261125/trazabilidad.service.js"), "utf8"), ruta)
    servicio = m.exports
} else servicio = require(path.join(fps, "src/services/trazabilidad.service"))

const HOY = "2026-11-25T10:00:00"
const mermas = [{ id: 1, np: "9999", item: 1, proceso: "Troquelado", fecha: "2026-09-04", turno: "B", maquina: "IBERICA 2", corrida: "102", defecto: "Falta de corte", cantidad: 120, cantidadInicial: 120, unidad: "PLIEGOS", metodo: "CONTADA", estado: "REGISTRADA", comprometidoDestruccion: 0, creadoPor: "analista", fechaCreacion: HOY, tieneEvidencia: 0 },
    { id: 2, np: "9999", item: 1, proceso: "Pegado", fecha: "2026-09-09", defecto: "Despegado", cantidad: 800, cantidadInicial: 900, unidad: "UNIDADES", metodo: "ESTIMADA", estado: "VALIDADA", comprometidoDestruccion: 500, creadoPor: "analista", fechaCreacion: HOY, tieneEvidencia: 0 }]
const certificados = [{ id: 3, correlativo: "CD-2026-00001", np: "9999", item: 1, cliente: "CLIENTE DE PRUEBA LTDA.", producto: "ESTUCHE DE PRUEBA", cantidadDestruir: 500, motivo: "RECHAZO_INTERNO", categoria: "CALIDAD", estado: "EMITIDO", ejecutada: true, cantidadEjecutada: 480, unidad: "UNIDADES", evidencias: 1, documentoEmitido: 1, creadoPor: "analista", fechaCreacion: HOY, fechaEmision: HOY }]
const archivos = [{ id: 1, tipo: "DOCUMENTO_EMITIDO", nombreArchivo: "certificado_3_emitido.html", sha256: "a".repeat(64), subidoPor: "jefatura", fechaSubida: HOY }, { id: 2, tipo: "EVIDENCIA", nombreArchivo: "pallet.jpg", descripcion: "Pallet rechazado", subidoPor: "analista", fechaSubida: HOY, anulado: false }]
const doc = (id, codigo, vigente) => ({ id, codigo, nombre: "Documento " + codigo, area: "COMERCIAL", totalVersiones: 1, vigente })

const MODULOS = {
    trazabilidad: { controlador: "TrazabilidadController", np: "trzNp", boton: "btnTrzConsultar" },
    "balance-mermas": { controlador: "BalanceMermasController", np: "bmNp", boton: "btnBmConsultar" },
    "cierre-np": { controlador: "CierreNpController", np: "cnNp", boton: "btnCnConsultar" },
    "certificados-destruccion": { controlador: "CertificadosDestruccionController", np: "cdNp", boton: null }
}

;(async () => {
    const integral = await servicio.obtenerTrazabilidadNp(9999, pool)
    const fix = {
        "trazabilidad.integral": integral,
        "trazabilidad.factor.list": { np: "9999", puedeConfirmar: false, factores: [{ id: 1, item: 1, unidadesPorPliego: 8, estado: "CONFIRMADO", origen: "MANUAL", propuestoPor: "analista", fechaPropuesta: HOY }] },
        "trazabilidad.consultarNp": { np: "9999", procesos: [], paletizado: caso === "falla" ? null : [] },
        "trazabilidad.documentos.list": { requisitos: [doc(1, "A", { id: 11, version: 1, estado: "DISPONIBLE", nombreArchivo: "nv.pdf", subidoPor: "ana", fechaSubida: HOY }), doc(2, "B", { id: 12, version: 1, estado: "EN_REVISION", enlace: "https://intranet.local/doc/1", subidoPor: "ana", fechaSubida: HOY }), doc(3, "C", { id: 13, version: 1, estado: "NO_DIGITALIZADO", observacion: "Archivador 3", subidoPor: "ana", fechaSubida: HOY }), doc(4, "D", null)] },
        "registrosControl.obtenerRegistros": { items: [{ id: 50, np: "9999", fecha: "04-09-2026", proceso: "Troquelado", maquina: "IBERICA 2", bobinaLote: "L-100; L-200", bobinaCodigo: "MP1; MP2", bobinaDescripcion: "Cartulina; Cartulina", bobinaObservacion: "; " }], total: 1 },
        "productoTerminado.list": { items: [], total: 0 },
        "calidadNp.certificados.get": { certificado: { ...certificados[0], fechaEjecucion: HOY }, detalle: [], aprobaciones: [], archivos },
        "trazabilidad.noConformidades": { items: [] },
        "trazabilidad.pallets": { items: [] },
        "calidadNp.mermas.list": mermas,
        "calidadNp.certificados.list": certificados,
        "calidadNp.certificados.flujo": [{ cargo: "Jefatura de Calidad", orden: 1, definicion: "PROVISIONAL" }],
        "calidadNp.cierre.get": { vigente: null, historial: [], baseJustificacion: { mermas: [{ item: 1, proceso: "Pegado", metodo: "ESTIMADA", unidad: "UNIDADES", cantidad: 800, registros: 1 }, { item: 1, proceso: "Troquelado", metodo: "CONTADA", unidad: "PLIEGOS", cantidad: 120, registros: 1 }], certificados: [{ id: 3, correlativo: "CD-2026-00001", estado: "EMITIDO", ejecutada: true, cantidadEjecutada: 480, cantidadDestruir: 500, cantidadConMerma: 400, cantidadSinMerma: 100 }] }, areas: [{ id: 1, cierreId: 1, version: 1, area: "Bodega", estado: "OBSERVADO", observacion: "Falta contar un pallet", usuario: "analista", fecha: HOY }] },
        "calidadNp.resumen": {}
    }
    if (caso === "falla") { delete fix["calidadNp.mermas.list"]; delete fix["calidadNp.cierre.get"] }
    fs.mkdirSync(salida, { recursive: true })
    const index = fs.readFileSync(path.join(www, "index.html"), "utf8")
    const css = [...index.matchAll(/<link rel="stylesheet" href="((?!http)[^"]+)">/g)].map(m => m[1])
    for (const [modulo, m] of Object.entries(MODULOS)) {
        const vista = fs.readFileSync(path.join(www, "modules", modulo, `${modulo}.view.html`), "utf8")
        const scripts = ["https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js", "core/excel-exporter.js", "shared/utils.js", "shared/calidad-np-base.js", "shared/np-dashboard.js", "shared/reg-sgi-logo.js", `modules/${modulo}/${modulo}.controller.js`]
        const html = `<!doctype html><html><head><meta charset="utf-8"><base href="${pathToFileURL(www).href}/">
${css.map(h => `<link rel="stylesheet" href="${h}">`).join("\n")}
<style>body{display:block;overflow:auto;height:auto}#app{padding:16px;height:auto;overflow:visible;background:var(--bg-app,#f1f5f9)}body{background:#f1f5f9}.aviso{background:#fef3c7;padding:6px 16px;font:12px sans-serif}#errores{white-space:pre-wrap;color:#b91c1c;font:12px monospace;padding:0 16px}</style>
</head><body><div class="aviso">VISTA AISLADA — datos ficticios (NP 9999). No hay conexión con APIs ni bases de datos.</div><pre id="errores"></pre><div id="app">${vista}</div>
<script>
const anotar = t => { document.getElementById("errores").textContent += "ERROR-VISTA " + t + "\\n" }
window.onerror = (m, s, l) => anotar(m + " " + s + ":" + l)
window.onunhandledrejection = e => anotar("promesa: " + (e.reason && e.reason.stack || e.reason))
const consola = console.error; console.error = (...a) => { anotar(a.join(" ")); consola(...a) }
const FIX = ${JSON.stringify(fix).replace(/</g, "\\u003c")}
// excel.guardar: en vez de escribir en disco, el archivo queda en la página para extraerlo y abrirlo (#excel).
const capturar = d => { const t = document.createElement("textarea"); t.className = "xlsx"; t.dataset.nombre = d.fileName; t.textContent = d.base64; document.body.appendChild(t); return { ok: true } }
window.PhotinoBridge = { send: async ({ action, data }) => action === "excel.guardar" ? capturar(data) : action in FIX ? { ok: true, success: true, data: structuredClone(FIX[action]) } : { ok: false, error: "Sin datos en la vista aislada (" + action + ")" } }
sessionStorage.setItem("nombreUsuario", "Usuario de prueba")
</script>
${scripts.map(s => `<script src="${s}"></script>`).join("\n")}
<script>
const c = new window.${m.controlador}(); window.vistaControlador = c
Promise.resolve(c.init && c.init()).then(() => setTimeout(() => {
  const np = document.getElementById("${m.np}"); if (np) np.value = "9999"
  const boton = ${m.boton ? `document.getElementById("${m.boton}")` : "null"}
  if (boton) { if (c.vista) c.vista(true); boton.click() }
  // Acciones para revisar ventanas e informes: <modulo>.html#proceso | #informe | #detalle | #pdf | #formulario | #excel
  const enPagina = html => { document.open(); document.write(html); document.close() }
  const pestana = n => [...document.querySelectorAll("button, [role=tab]")].filter(b => /^(Resumen|Producción y turnos|Materiales|Calidad|Despachos e inventario)$/.test(b.textContent.trim()))[n].click()
  const acciones = {
    tab1: () => pestana(1), tab2: () => pestana(2), tab3: () => pestana(3), tab4: () => pestana(4),
    excel: () => document.querySelectorAll("#btnTrzExcel,#btnBmExcelBalance,#btnBmExcelMermas,#btnCnExcel,#btnCdExcel").forEach(b => b.click()),
    proceso: () => c.verProceso(2), informe: () => enPagina(c.htmlInforme()), detalle: () => c.verDetalle("Troquelado"),
    pdf: () => { window.CalidadNp.imprimirHtml = enPagina; c.pdfBalance() },
    cert: () => c.accion("ver", 3),
    formulario: () => c.formulario(null).then(() => { document.getElementById("cdfNp").value = "9999"; document.getElementById("cdfCargar").click() })
  }
  const accion = acciones[location.hash.slice(1)]
  if (accion) setTimeout(accion, 1500)
}, 100))
</script></body></html>`
        fs.writeFileSync(path.join(salida, `${modulo}.html`), html, "utf8")
    }
    console.log(`Vistas generadas en ${path.resolve(salida)}: ${Object.keys(MODULOS).join(", ")}`)
    console.log(`items=${JSON.stringify(integral.items.map(i => ({ item: i.item, despachado: i.despachado })))}`)
})().catch(e => { console.error(e); process.exit(1) })
