// Regresión de las reglas de cantidades de Calidad NP (solo INNPACK). Ejecuta el código real de www en una VM de Node:
//   node tools/calidad_np_tests/run.js
// Datos inventados con la forma de la respuesta de fps-api; no consulta ninguna API ni base.
const fs = require("fs")
const path = require("path")
const vm = require("vm")
const www = path.resolve(__dirname, "../../src/UI/www")

const elementos = {}
const el = id => (elementos[id] ||= { value: "", innerHTML: "", textContent: "", style: {} })
const ctx = vm.createContext({
    window: {}, document: { getElementById: el }, sessionStorage: { getItem: () => "prueba" }, console, alert: () => {}
})
for (const f of ["shared/calidad-np-base.js", "modules/certificados-destruccion/certificados-destruccion.controller.js", "modules/balance-mermas/balance-mermas.controller.js", "modules/trazabilidad/trazabilidad.controller.js", "modules/cierre-np/cierre-np.controller.js"]) {
    vm.runInContext(fs.readFileSync(path.join(www, f), "utf8"), ctx, { filename: f })
    ctx.CalidadNp = ctx.window.CalidadNp
}
const C = ctx.window.CalidadNp

let ok = 0, fallas = 0
const check = (nombre, cond, detalle) => { if (cond) ok++; else { fallas++; console.log("FALLA:", nombre, detalle === undefined ? "" : JSON.stringify(detalle)) } }

const item = (n, extra = {}) => ({ item: n, itemCode: "COD" + n, descripcion: "P" + n, solicitado: 140000, liberadoPt: 140000, despachado: 140000, devuelto: 0, foliosLiberacion: 3, saldoBodegas: { "PRODUCTOS TERMINADOS": 140000 }, ...extra })
const proc = (id, nombre, nrPl = 1) => ({ IdProceso: id, NombreProceso: nombre, NombreCarpeta: "", Categoria: "", NrPl: nrPl, maquinas: [] })
const ses = (id, cant) => ({ IdProceso: id, Status: 1, ProductionQuantity: cant, ProductionStartDate: "2026-10-01T08:00:00" })
const carga = (items, procesos, sesiones, factor = 4) => ({
    np: "1", factores: factor ? [{ item: 1, estado: "CONFIRMADO", unidadesPorPliego: factor }] : [], consultadoEn: new Date(),
    data: { np: 1, items, procesos, sesiones, documentos: [], liberaciones: [], consumos: [], notaVenta: [], ordenes: [{}], fuentes: { fps: { ok: true }, sapNotaVenta: { ok: true }, sapDespachos: { ok: true }, sapConsumos: { ok: true }, liberaciones: { ok: true } } }
})
const fila = (b, etapa) => b.filas.find(f => f.etapa === etapa)

// Un ítem, un proceso por etapa: la conversión y las diferencias se mantienen.
const simple = carga([item(1)], [proc(1, "EMPLACADO"), proc(2, "TROQUELADO"), proc(3, "PEGADO LATERAL")], [ses(1, 36000), ses(2, 35000), ses(3, 139000)])
let b = C.balance({ carga: simple, item: 1, mermas: [] })
check("simple: troquelado 35.000 x 4", fila(b, "Troquelado").equivalentes === 140000)
check("simple: diferencia emplacado-troquelado", fila(b, "Troquelado").diferencia === 1000)
check("simple: pegado en unidades", fila(b, "Pegado").diferencia === 1000, fila(b, "Pegado"))
check("simple: entrada de Calidad", fila(b, "Calidad").entrada === 139000)

// B3: dos pliegos en la misma etapa no se convierten ni se encadenan.
const dos = carga([item(1)], [proc(1, "TROQUEL", 1), proc(2, "TROQUEL", 2), proc(3, "PEGADO")], [ses(1, 500000), ses(2, 200000), ses(3, 100)])
b = C.balance({ carga: dos, item: 1, mermas: [] })
check("B3: sin equivalentes", fila(b, "Troquelado").equivalentes === null)
check("B3: la etapa siguiente no se compara", fila(b, "Pegado").entrada === null && fila(b, "Pegado").diferencia === null)
check("B3: advierte", b.advertencias.some(a => a.includes("procesos o pliegos distintos")))

// Una etapa de la ruta sin corridas corta la cadena.
b = C.balance({ carga: carga([item(1)], [proc(1, "CORRUGADO"), proc(2, "EMPLACADO"), proc(3, "TROQUELADO")], [ses(1, 100), ses(3, 80)]), item: 1, mermas: [] })
check("etapa sin corridas: no salta a la anterior", fila(b, "Troquelado").entrada === null)

// B2/B7: varios ítems.
const multi = carga([item(1), item(2)], [proc(1, "TROQUELADO")], [ses(1, 1000)])
const sinItem = [{ item: null, estado: "REGISTRADA", proceso: "Troquelado", cantidad: 50, unidad: "PLIEGOS", metodo: "CONTADA" }]
b = C.balance({ carga: multi, item: 1, mermas: sinItem })
check("B2: multi-item sin equivalentes", fila(b, "Troquelado").equivalentes === null)
check("B7: merma sin item no se suma en multi-item", fila(b, "Troquelado").mermaConfirmada === 0)

// B9: mismo número de ítem con dos códigos; y un ítem inexistente no cae en el primero.
const amb = carga([item(1), item(1, { itemCode: "OTRO" })], [], [])
b = C.balance({ carga: amb, item: 1, mermas: [] })
check("B9: ambiguo sin Calidad/Despacho", !fila(b, "Calidad") && !fila(b, "Despacho"))
b = C.balance({ carga: carga([item(1), item(2)], [], []), item: 9, mermas: [] })
check("B9: item inexistente no usa el primero", b.item === null && !fila(b, "Calidad"))

// B1: informe V05 no multiplica las unidades de Pegado/Termoformado por el factor.
const modelo = (c, factor) => {
    const t = new ctx.window.TrazabilidadController()
    t._integral = { np: "1", data: c.data, calidad: null }
    t._sgi = { factores: [{ estado: "CONFIRMADO", unidadesPorPliego: factor }], requisitos: [] }
    return t.modeloV05()
}
let m = modelo(simple, 4)
const bloque = t => m.bloques.find(x => x.titulo.startsWith(t))
const pegado = bloque("PEGADO").filas[0]
check("B1: fila pegado conserva 139.000", pegado[6] === "139.000" && String(pegado[5]).startsWith("NO APLICA"), pegado)
const balPeg = bloque("BALANCE DE MASAS").filas.find(f => f[1] === "Pegado")
check("B1: balance pegado en unidades sin factor", balPeg[4] === "139.000" && String(balPeg[2]).startsWith("NO APLICA"), balPeg)
check("troquelado conserva la conversión", bloque("BALANCE DE MASAS").filas.find(f => f[1] === "Troquelado")[4] === "140.000")
m = modelo(dos, 4)
const balDos = bloque("BALANCE DE MASAS").filas.find(f => f[1].startsWith("Troquelado"))
const balSig = bloque("BALANCE DE MASAS").filas.find(f => f[1] === "Pegado")
check("B3 V05: etapa compuesta no calculable", balDos[4] === "NO CALCULABLE" && balSig[3] === "NO CALCULABLE" && balSig[5] === "NO CALCULABLE", [balDos, balSig])

// Informe con varios ítems: mismas cifras por etapa, sin diferencias de producción (FPS no separa ítems).
m = modelo(multi, 4)
const difs = bloque("BALANCE DE MASAS").filas
const conDif = difs.filter(f => f[1] !== "Despacho").slice(1)
check("V05 multi-item: sin diferencias de produccion", conDif.length > 0 && conDif.every(f => f[3] === "NO CALCULABLE" && f[5] === "NO CALCULABLE"), difs)
check("V05 multi-item: Calidad vs Despacho se mantiene", difs.find(f => f[1] === "Despacho")[5] !== "NO CALCULABLE", difs)

// Servidor FPS sin la corrección (no envía reingresoNc): el despachado se marca como no validado.
const despachoDe = extra => { const r = C.balance({ carga: carga([item(1, extra)], [], []), item: 1, mermas: [] }); return { estado: fila(r, "Despacho").estado, aviso: r.advertencias.includes(C.AVISO_REGLA_ANTERIOR) } }
const viejo = despachoDe({ reingresoNc: undefined }), nuevo = despachoDe({ reingresoNc: 0 }), caido = despachoDe({ reingresoNc: null, despachado: null })
check("fps-api anterior: despacho NO VALIDADO con aviso", viejo.estado.startsWith("NO VALIDADO") && viejo.aviso, viejo)
check("fps-api corregida: sin aviso", nuevo.estado.startsWith("Confirmado") && !nuevo.aviso, nuevo)
check("SAP caido: no disponible, sin aviso de version", caido.estado === "Despachos SAP no disponibles" && !caido.aviso, caido)

// Mermas no consultables: ni cero ni diferencias de proceso.
const sinMer = C.balance({ carga: carga([item(1)], [proc(1, "EMPLACADO"), proc(2, "TROQUELADO")], [ses(1, 36000), ses(2, 35000)]), item: 1, mermas: null })
check("mermas caidas: sin ceros ni diferencias de proceso", sinMer.filas.every(f => f.mermaConfirmada === null && f.mermaEstimada === null && (f.diferenciaEsPendienteDespacho || f.diferencia === null)), sinMer.filas)
check("mermas caidas: aviso visible", sinMer.advertencias[0].startsWith("Mermas no disponibles"), sinMer.advertencias)

// Cierre multi-ítem: se suman las mermas del ítem (una línea por origen), no las sin ítem.
const sug = (mermas, error) => {
    const t = new ctx.window.CierreNpController()
    t._carga = carga([item(1), item(2)], [], [])
    t._lineas = []
    t._errorCierre = error || null
    t._cierre = { baseJustificacion: { mermas, certificados: [] } }
    el("cnItem").value = "1"
    t.sugeridas()
    return { lineas: t._lineas.filter(l => l.origen.startsWith("MERMA")), avisos: t._avisosSug.join(" | ") }
}
const mer = extra => ({ proceso: "Pegado", metodo: "CONTADA", unidad: "UNIDADES", cantidad: 100, ...extra })
let s1 = sug([mer({ item: 1 }), mer({ item: null, cantidad: 7 })])
check("cierre multi: suma la merma del item y no la sin item", s1.lineas.length === 1 && s1.lineas[0].cantidad === 100 && s1.avisos.includes("sin ítem"), s1)
s1 = sug([mer({})])
check("cierre multi con API anterior: lo explica y no suma", s1.lineas.length === 0 && s1.avisos.includes("API sin actualizar"), s1)
s1 = sug([], "sin respuesta")
check("cierre sin respuesta: avisa que no leyo mermas", s1.avisos.includes("No se pudieron leer las mermas"), s1)

// B12: sin ítems no hay totales en cero.
const trz = new ctx.window.TrazabilidadController()
check("B12: sin items = null", trz.sumaItems("solicitado", []) === null)

// B8, B2, B16: cierre.
const cierre = new ctx.window.CierreNpController()
const preparar = (c, n) => { cierre._carga = c; cierre._lineas = []; el("cnItem").value = String(n) }
preparar(carga([item(1, { liberadoPt: 0, foliosLiberacion: 0 })], [], []), 1)
check("B8: sin folios = pendiente, no 0", cierre.fabricadaSegun("QCS") === null)
preparar(simple, 1)
check("B8: con folios usa lo liberado", cierre.fabricadaSegun("QCS") === 140000)
check("B8: sin origen = pendiente", cierre.fabricadaSegun("") === null)
preparar(multi, 1)
check("B2: FPS no aplica en multi-item", cierre.fabricadaSegun("FPS") === null)
preparar(carga([item(1, { solicitado: 0 })], [], []), 1)
el("cnOrigen").value = "QCS"
check("B16: solicitada 0 no concilia", cierre.calculo().pendiente === null)

// B7: cuarentena no es pérdida.
preparar(carga([item(1, { saldoBodegas: { CUARENTENA: 500, DESTRUCCION: 200 } })], [], []), 1)
cierre._cierre = { baseJustificacion: { mermas: [] } }
cierre.sugeridas()
check("B7: solo destrucción como línea", cierre._lineas.length === 1 && cierre._lineas[0].cantidad === 200, cierre._lineas)
check("B7: avisa la cuarentena", cierre._avisosSug.some(a => a.includes("cuarentena")))

// Fuentes nuevas: guía técnica y controles. Con una API anterior (sin los campos) se ve "no disponible", no vacío ni 0.
check("guia: se compacta el texto", trz.guiasTecnicas({ ordenes: [{ OrdenTrabajo: 1, GuiaTecnica: " P007608\n 6 POSES " }, { OrdenTrabajo: 2 }] })[0].texto === "P007608 6 POSES")
check("controles: agrupa por corrida", trz.agruparControles([{ RecordKey: 1 }, { RecordKey: 1 }, { RecordKey: 2 }]).length === 2)
trz._integral = { data: {} }
trz.renderControles(); trz.renderInventario()
check("API anterior: no disponible", /no disponible/i.test(el("trzControlesBody").innerHTML) && /no disponible/i.test(el("trzInventarioBody").innerHTML), el("trzInventarioBody").innerHTML)

check("B6: pliegos y unidades no se suman", C.sumaPorUnidad([{ u: "PLIEGOS", q: 1000 }, { u: "UNIDADES", q: 5 }, { u: "UNIDADES", q: 5 }], f => f.u, f => f.q) === "1.000 pliegos · 10 unidades")
check("B21: fecha local de noche", C.hoyLocal(new Date(2026, 10, 25, 23, 30)) === "2026-11-25")
// P07 y P09: la merma estimada no pasa a confirmada y una brecha no crea líneas de pérdida.
b = C.balance({ carga: simple, item: 1, mermas: [{ item: 1, estado: "REGISTRADA", proceso: "Troquelado", cantidad: 100, unidad: "PLIEGOS", metodo: "ESTIMADA" }] })
check("P07: estimada separada", fila(b, "Troquelado").mermaEstimada === 100 && fila(b, "Troquelado").mermaConfirmada === 0, fila(b, "Troquelado"))
preparar(carga([item(1, { solicitado: 200000, liberadoPt: 188000, despachado: 188000, saldoBodegas: {} })], [], []), 1)
cierre._cierre = { baseJustificacion: { mermas: [] } }
cierre.sugeridas()
check("P09: la brecha no genera pérdidas", cierre._lineas.length === 0, cierre._lineas)

// El despachado de la API ya es neto: el balance no vuelve a restar devoluciones (caso real NP 3951, 4.800).
b = C.balance({ carga: carga([item(1, { liberadoPt: 1269450, despachado: 1264650, devuelto: 4800 })], [], []), item: 1, mermas: [] })
check("devolucion no se resta dos veces", fila(b, "Despacho").salidaConforme === 1264650, fila(b, "Despacho"))
// Control cruzado por lotes: solo avisa cuando no coincide.
trz._integral = { data: { items: [{ itemCode: "A", despachado: 100 }, { itemCode: "A", despachado: 50 }], inventarioPt: [{ itemCode: "A", salidaVentaLotes: 150 }] } }
check("cruce de lotes coincide: sin aviso", trz.cruceLotes(trz._integral.data.items[0]) === null)
trz._integral.data.inventarioPt[0].salidaVentaLotes = 190
check("cruce de lotes difiere: avisa", String(trz.cruceLotes(trz._integral.data.items[0])).startsWith("REVISAR"))

// Pallets: solo NP INNPACK exacta (el filtro del servidor también compara NP FARET y OT).
const pal = [{ fps: { npInnpack: "4000" }, inspeccion: { np: "x" } }, { fps: { npInnpack: "999" }, inspeccion: { np: "4000" } }, { fps: {}, inspeccion: { np: "4000" } }]
check("pallets: excluye otra NP aunque se digitara igual", trz.palletsDeNp(pal, 4000).length === 2, trz.palletsDeNp(pal, 4000))
check("adhesivos: texto tipo y lote", trz.adhesivos({ adhesivos: [{ tipo: "HOT MELT", lote: "1" }, { tipo: "PVA", lote: null }] }) === "HOT MELT · 1 | PVA")

// Informe: secciones 12 y 13, mermas anuladas fuera, certificados anulados fuera y fuentes caídas distintas de "sin registros".
const inf = new ctx.window.TrazabilidadController()
inf._integral = { np: "1", data: { liberaciones: [{}] }, nc: { estado: "ERROR", items: [] }, calidad: null,
    mermas: { estado: "OK", items: [{ estado: "ANULADA", cantidad: 9 }, { estado: "REGISTRADA", cantidad: 3, metodo: "ESTIMADA" }] },
    certificados: { estado: "SIN_PERMISO", items: null } }
inf._sgi = { requisitos: [
    { nombre: "NV", area: "Comercial", vigente: { estado: "DISPONIBLE", nombreArchivo: "nv.pdf", version: 2 } },
    { nombre: "Plagas", area: "Calidad", vigente: null },
    { nombre: "Camión", area: "Logística", vigente: { estado: "NO_APLICA", observacion: "retira cliente" } }] }
const bc = inf.bloquesCierreInforme(v => (v === null || v === undefined || v === "" ? "ND" : String(v)), v => String(v))
const bq = t => bc.find(x => x.titulo.startsWith(t))
check("informe: merma anulada no se lista", bq("MERMAS").filas.length === 1)
check("informe: NC caída no es 'sin NC'", bq("CALIDAD").filas.length === 0 && bq("CALIDAD").vacio.includes("NO DISPONIBLE"))
check("informe: sin permiso se declara", bq("CERTIFICADOS").vacio.includes("permiso"))
check("informe: anexo del checklist", bq("12.").filas.some(f => f[2] === "nv.pdf (v2)"))
check("informe: faltante con área y no aplica con motivo", bq("13.").filas.length === 2 && bq("13.").filas[0][1] === "Calidad" && bq("13.").filas[1][2] === "No aplica: retira cliente")

// Certificados: antecedentes solo de referencia.
const cert = new ctx.window.CertificadosDestruccionController()
const ant = cert.antecedentes({ data: { liberaciones: [{ Folio: 1, Item: 1, BodegaDestino: "CUARENTENA" }, { Folio: 2, Item: 2, BodegaDestino: "DESTRUCCION" }, { Folio: 3, Item: 1, BodegaDestino: "PRODUCTOS TERMINADOS" }] } }, null, "1")
check("antecedentes: solo cuarentena/destrucción del ítem", ant.folios.length === 1 && ant.folios[0].folio === 1, ant)
check("antecedentes: NC no disponible = null", ant.nc === null && cert.antecedentes({ data: null }, [], "1").folios === null)
const campo = { value: "texto propio" }
cert.agregarTexto(campo, "Causa (NC 1)"); cert.agregarTexto(campo, "Causa (NC 1)")
check("causa raíz: no pisa ni repite", campo.value === "texto propio\nCausa (NC 1)", campo.value)

// Cierre: un certificado solo suma si está ejecutado, por la parte sin merma y una sola vez.
cierre._lineas = []
check("cierre: emitido sin ejecución no suma", cierre.certificadoSumable({ id: 1, ejecutada: false, cantidadSinMerma: 50 }) === 0)
check("cierre: ejecutado suma solo lo sin merma", cierre.certificadoSumable({ id: 1, ejecutada: true, cantidadSinMerma: 50, cantidadDestruir: 80 }) === 50)
cierre._lineas = [{ origen: "CERT:1" }]
check("cierre: no suma dos veces", cierre.certificadoSumable({ id: 1, ejecutada: true, cantidadSinMerma: 50 }) === 0)
preparar(carga([item(1, { liberadoPt: 0, foliosLiberacion: 0, despachado: null, saldoBodegas: null })], [], []), 1)
el("cnOrigen").value = ""
const et = Object.fromEntries(cierre.etapas().map(([a, v]) => [a, v]))
check("cierre: sin fuente no es 0", et["Liberado a Productos Terminados"] === null && et["Despachado neto"] === null && et["Saldo por bodega (QCS)"] === null && et["Fabricado según origen elegido"] === null, et)

// Balance: el detalle de una etapa suma exactamente lo que muestra la fila.
const bm = new ctx.window.BalanceMermasController()
bm._carga = simple
bm._balance = C.balance({ carga: simple, item: 1, mermas: [{ id: 7, item: 1, estado: "REGISTRADA", proceso: "Troquelado", cantidad: 10, unidad: "PLIEGOS", metodo: "CONTADA" }] })
const det = bm.detalleEtapa("Troquelado")
check("detalle: corridas = fila", det.filas.length === 1 && fila(bm._balance, "Troquelado").corridas.reduce((a, s) => a + s.ProductionQuantity, 0) === fila(bm._balance, "Troquelado").procesado, det)
check("detalle: merma de la etapa", det.mermas.length === 1 && det.mermas[0].id === 7)
check("detalle: reserva no suma", bm.efectoDocumento({ Tipo: "FACTURA", Origen: "RESERVA" }).startsWith("No suma") && bm.efectoDocumento({ Tipo: "NOTA_CREDITO", RepusoStock: 1 }).startsWith("Resta"))

// Detalle por proceso: solo sus corridas y los controles de esas corridas; fuente caída = null.
const dp = new ctx.window.TrazabilidadController()
dp._integral = { np: "1", mermas: { estado: "ERROR", items: null }, data: { procesos: [proc(1, "TROQUELADO"), proc(2, "PEGADO")],
    sesiones: [{ RecordKey: 10, IdProceso: 1 }, { RecordKey: 11, IdProceso: 2 }], controlesProceso: [{ RecordKey: 10, Formulario: "F" }, { RecordKey: 11, Formulario: "F" }] } }
const x = dp.detalleProceso(1)
check("proceso: solo sus corridas y controles", x.corridas.length === 1 && x.controles.length === 1 && x.controles[0].RecordKey === 10 && x.mermas === null, x)

// ZIP: un documento SAP por tipo+DocEntry, solo con adjunto y solo de la NP del panel.
dp._sgi = { np: "1" }
dp._integral.data = { notaVenta: [{ DocEntry: 5, DocNum: 1 }], documentos: [{ Tipo: "GUIA", DocEntry: 9, DocNum: 90, TieneAdjunto: 1 }, { Tipo: "GUIA", DocEntry: 9, DocNum: 90, TieneAdjunto: 1 }, { Tipo: "FACTURA", DocEntry: 8, TieneAdjunto: 0 }] }
check("zip: documentos SAP sin repetir", dp.documentosSapConAdjunto().map(z => z.tipo).join(",") === "notaventa,guia", dp.documentosSapConAdjunto())
dp._sgi = { np: "2" }
check("zip: otra NP no aporta adjuntos", dp.documentosSapConAdjunto().length === 0)

// Filas con el formato real de la API (camelCase): las tablas e informe no pueden salir vacíos.
bm._certificados = { estado: "OK", items: [{ id: 3, np: "1", item: 1, correlativo: "CD-1", cantidadDestruir: 25, estado: "EMITIDO", ejecutada: false }, { id: 4, np: "1", item: 2, cantidadDestruir: 9 }] }
bm.item = () => 1
const certs = bm.certificadosDelItem()
check("balance: certificados del ítem, sin restar", certs.length === 1 && certs[0][2] === C.num(25) && certs[0][5] === "No confirmada", certs)
bm._certificados = { estado: "ERROR", items: null }
check("balance: certificados no disponibles no es cero", bm.certificadosDelItem() === null && bm.tablaCertificadosHtml().includes(C.ND))
const fuente = ["trazabilidad", "balance-mermas", "cierre-np", "certificados-destruccion"].map(m => require("fs").readFileSync(require("path").join(__dirname, "../../src/UI/www/modules", m, m + ".controller.js"), "utf8")).join("\n")
check("sin accesos snake_case a filas de la API", !/\b[cm]\.(cantidad_destruir|creado_por|comprometido_destruccion|fecha_creacion|fecha_emision)\b/.test(fuente))

// Ficha: solo los datos de las líneas del ítem elegido; NV anulada no aporta cliente.
dp._integral = { np: "1", data: { items: [{ item: 1, itemCode: "A", lineasNv: [0], solicitado: 10 }, { item: 2, itemCode: "B", lineasNv: [1], solicitado: 20 }], sesiones: [], ordenes: [{ OrdenTrabajo: 100 }],
  notaVenta: [{ LineNum: 0, DocNum: 1, CardName: "ANULADO", Cancelada: "Y" }, { LineNum: 0, DocNum: 1, CardName: "CLIENTE UNO", DocStatus: "O" }, { LineNum: 1, DocNum: 1, CardName: "CLIENTE UNO", DocStatus: "C" }] } }
const f2 = Object.fromEntries(dp.fichaItem(1))
check("ficha: ítem elegido sin mezclar", f2["Código"] === "B" && f2["Línea(s) de la NV en SAP (LineNum)"] === "1" && f2["Estado de la nota de venta"] === "Cerrada" && Object.fromEntries(dp.fichaItem(0))["Cliente"] === "CLIENTE UNO", f2)

dp._sgi = { np: "1", factores: [{ item: 2, estado: "CONFIRMADO", unidadesPorPliego: 8 }] }
check("ficha: factor confirmado del panel", Object.fromEntries(dp.fichaItem(1))["Unidades por pliego"] === "8 (confirmado)" && Object.fromEntries(dp.fichaItem(0))["Unidades por pliego"] === "Sin factor confirmado")
dp._sgi.np = "9"
check("ficha: factor de otra NP no se usa", Object.fromEntries(dp.fichaItem(1))["Unidades por pliego"] === "Sin factor confirmado")

// Ítem SAP inequívoco: DocEntry de la línea del mismo código; sin datos no se inventa.
const conNv = { data: { notaVenta: [{ ItemCode: "A", LineNum: 0, DocEntry: 11 }, { ItemCode: "B", LineNum: 2, DocEntry: 11 }], inventarioPt: [{ itemCode: "B", saldo: 0, bodegas: {}, recepciones: [{ cantidad: 5 }, { cantidad: 7 }] }] } }
const sapB = C.itemSap(conNv, { itemCode: "B", lineasNv: [2, 3] })
check("itemSap: código, DocEntry y líneas", sapB.itemCode === "B" && sapB.nvDocEntry === 11 && sapB.nvLineas === "2,3", sapB)
check("itemSap: sin NV queda sin DocEntry", C.itemSap({ data: {} }, { itemCode: "B" }).nvDocEntry === null)
check("inventario: stock cero distinto de no disponible", C.inventarioItem(conNv, { itemCode: "B" }).stock === 0 && C.inventarioItem(conNv, { itemCode: "B" }).recibidoCompra === 12 && C.inventarioItem(conNv, { itemCode: "A" }) === null && C.inventarioItem({ data: {} }, { itemCode: "B" }) === null)
const mov = C.movimientosPosteriores(JSON.stringify({ stockSap: 100 }), { itemCode: "B" }, conNv)
check("cierre: avisa si cambió el inventario SAP", mov.some(x => x.startsWith("Inventario SAP")), mov)

// Certificado como justificación: nunca más que lo efectivamente destruido.
const cn = new ctx.window.CierreNpController()
cn._lineas = []
check("cierre: certificado limitado a lo destruido", cn.certificadoSumable({ id: 1, ejecutada: true, cantidadSinMerma: 40, cantidadEjecutada: 30 }) === 30 && cn.certificadoSumable({ id: 1, ejecutada: true, cantidadSinMerma: 40 }) === 40 && cn.certificadoSumable({ id: 1, ejecutada: false, cantidadSinMerma: 40, cantidadEjecutada: 30 }) === 0)

// Bobinas: emparejado por posición, cruce exacto y filas que no se pueden separar.
const bob = new ctx.window.TrazabilidadController()
bob._integral = { calidad: { registros: { estado: "OK", items: [
  { id: 1, bobinaLote: "L-1; PROV9", bobinaCodigo: "C1; C2", bobinaDescripcion: "D1; D2", bobinaObservacion: "; " },
  { id: 2, bobinaLote: "X", bobinaCodigo: "C", bobinaDescripcion: "papel; kraft", bobinaObservacion: "" },
  { id: 3, bobinaLote: "" }] } }, data: { consumos: [{ base: "FARET", docNum: 70, lotes: [{ lote: "99", loteProveedor: "prov9" }] }] } }
const bobinas = bob.filasBobinas()
check("bobinas: empareja y cruza sin distinguir mayúsculas", bobinas.length === 3 && bobinas[1].codigo === "C2" && bobinas[1].cruce.includes("FARET 70") && bobinas[0].cruce.startsWith("Sin coincidencia"), bobinas)
check("bobinas: texto con ';' no se empareja mal", bobinas[2].separable === false && bobinas[2].lote === "X")
bob._integral.data.consumos = null
check("bobinas: SAP caído no es 'sin coincidencia'", bob.filasBobinas()[0].cruce === "Consumos SAP no disponibles")

// ZIP: recepciones de lotes consumidos, por sociedad, sin repetir.
dp._sgi = { np: "1" }
dp._integral = { np: "1", data: { notaVenta: [], documentos: [], consumos: [{ base: "FARET", lotes: [{ recepcionDocEntry: 4 }, { recepcionDocEntry: 4 }, {}] }, { base: "INNPACK", lotes: [{ recepcionDocEntry: 4 }] }] } }
check("zip: recepciones por sociedad", dp.documentosSapConAdjunto().map(z => z.tipo + z.empresa).join(",") === "recepcionFARET,recepcionINNPACK", dp.documentosSapConAdjunto())

// Faltantes del informe: cada estado explica su motivo.
check("faltantes: motivo según estado", dp.motivoFaltante({ vigente: { estado: "EN_REVISION" } }).startsWith("En revisión") && dp.motivoFaltante({ vigente: { estado: "NO_DIGITALIZADO", observacion: "archivador 3" } }).includes("archivador 3") && dp.motivoFaltante({}).startsWith("Sin documento"))

// Merma en unidades sobre una etapa en pliegos sin factor: se nombra, no se muestra como cero ni se calcula la diferencia.
b = C.balance({ carga: carga([item(1)], [proc(1, "IMPRESION"), proc(2, "TROQUELADO")], [ses(1, 1000), ses(2, 900)], null), item: 1, mermas: [{ item: 1, estado: "VALIDADA", proceso: "Troquelado", cantidad: 450, unidad: "UNIDADES", metodo: "CONTADA" }] })
check("merma sin convertir: se nombra en confirmada", fila(b, "Troquelado").mermaConfirmadaSinConvertir === "450 unidades" && fila(b, "Troquelado").mermaConfirmada === 0, fila(b, "Troquelado"))
check("merma sin convertir: diferencia no calculable", fila(b, "Troquelado").diferencia === null && bm.mermaTexto(0, "450 unidades") === "450 unidades sin convertir", fila(b, "Troquelado"))

// Movimientos posteriores al cierre: también cuentan las mermas y certificados registrados en QCC.
const baseQcc = (q, ej) => ({ mermas: [{ proceso: "Troquelado", metodo: "CONTADA", unidad: "UNIDADES", cantidad: q }], certificados: [{ id: 1, correlativo: "CD-1", estado: "EMITIDO", cantidadDestruir: 400, ejecutada: ej !== null, cantidadEjecutada: ej }] })
const evQcc = JSON.stringify({ registrosQcc: C.registrosQcc(baseQcc(450, null)) })
check("cierre: sin cambios en QCC no avisa", C.movimientosPosteriores(evQcc, item(1), carga([item(1)]), baseQcc(450, null)).length === 0, C.movimientosPosteriores(evQcc, item(1), carga([item(1)]), baseQcc(450, null)))
check("cierre: merma y ejecución posteriores se avisan", C.movimientosPosteriores(evQcc, item(1), carga([item(1)]), baseQcc(475, 350)).length === 2, C.movimientosPosteriores(evQcc, item(1), carga([item(1)]), baseQcc(475, 350)))

// Despachos del lote: sin dato nunca equivale a sin despachos.
const ventas = v => { trz.renderVentasLote(v); return el("trzLoteVentasBody").innerHTML }
check("lote: API sin ventas = no disponible", ventas({}).includes("No disponible") && ventas({ ventas: null }).includes("No disponible"))
check("lote: lista vacía lo dice", ventas({ ventas: [] }).includes("no registra"))
check("lote: fila con cliente y movimiento", /Guía de despacho 15798[^]*CLIENTE X[^]*Salida[^]*3[.]?300/.test(ventas({ ventas: [{ base: "INNPACK", tipo: "Guía de despacho", docNum: 15798, cliente: "CLIENTE X", movimiento: "SALIDA", cantidad: 3300 }] })))
trz._integral = { data: { consumos: [{ base: "FARET", docNum: 1, unidad: "KG", descripcion: "CARTULINA", categoria: "Cartulinas", cantidad: 10, lotes: [{ lote: "L1", cantidad: 10, estado: "Bloqueado", origenCantidad: 565 }] }] } }
trz.renderConsumos()
check("materiales: categoría, estado y cantidad ingresada", ["Cartulinas", "Hoy en SAP: Bloqueado", "Ingresó del lote: 565 KG"].every(x => el("trzConsumosBody").innerHTML.includes(x)), el("trzConsumosBody").innerHTML)
trz._integral.data.consumos[0] = { base: "FARET", docNum: 1, descripcion: "X", cantidad: 1, lotes: [{ lote: "L1", cantidad: 1, estado: "Liberado" }] }
trz.renderConsumos()
check("materiales: sin datos nuevos no inventa nada", !/Hoy en SAP|Ingresó del lote|null|undefined/.test(el("trzConsumosBody").innerHTML), el("trzConsumosBody").innerHTML)

// Aviso de consulta: no encontrada solo con ambas fuentes respondiendo.
const vacio = { ok: true, estado: "SIN_DATOS" }, bien = { ok: true, estado: "OK" }
const aviso = (fuentes, extra = {}) => String(trz.avisoConsulta({ data: { fuentes, ...extra }, consultadoEn: new Date() }))
check("aviso: NP no encontrada", aviso({ fps: vacio, sapNotaVenta: vacio }).startsWith("NP NO ENCONTRADA"))
check("aviso: con fuente caída no se afirma inexistencia", aviso({ fps: vacio, sapNotaVenta: { ok: false, error: "TIEMPO_AGOTADO" } }).startsWith("FUENTE TEMPORALMENTE NO DISPONIBLE"))
check("aviso: sin respuesta", String(trz.avisoConsulta({ data: null, consultadoEn: new Date() })).startsWith("FUENTE TEMPORALMENTE"))
check("aviso: número que no es NP no se informa como caída", trz.avisoConsulta({ data: null, resolucion: { np: null }, consultadoEn: new Date() }) === null)
check("aviso: existe en una fuente o NV anulada", aviso({ fps: bien, sapNotaVenta: vacio }) === "null" && aviso({ fps: vacio, sapNotaVenta: vacio }, { notaVentaAnulada: true }) === "null")

// Defectos de inspección del certificado: coincidencia exacta de NP, sin inventar y con fuentes caídas declaradas.
async function pruebaDefectos() {
    const antes = ctx.window.PhotinoBridge
    const pedidos = []
    ctx.window.PhotinoBridge = {
        send: async ({ action, data }) => {
            pedidos.push(action)
            if (action === "registrosControl.obtenerRegistros") return { ok: true, data: { items: [{ id: 1, np: "500", tipoDefecto: "MANCHA", codigoProducto: "COD1" }, { id: 2, np: "5000", tipoDefecto: "AJENO" }, { id: 3, np: "500", tipoDefecto: "" }, { id: 4, np: "500", tipoDefecto: "OTRO CODIGO", codigoProducto: "COD9" }] } }
            if (action === "productoTerminado.list") return { ok: true, data: { items: [{ id: 7, np: "500", resultado: "NO CONFORME", codigoProducto: "-" }, { id: 8, np: "500", resultado: "CONFORME" }] } }
            if (action === "productoTerminado.detalle") return data.id === 7 ? { ok: true, data: { unidadesNoConformes: 12, hallazgos: [{ defectos: [{ nombre: "ROTURA" }] }, { defectos: [{ nombre: "ROTURA" }] }] } } : { ok: false }
            return { ok: false }
        }
    }
    const insp = await cert.consultarDefectosInspeccion("500")
    const a = cert.antecedentes({ data: { items: [{ item: 1, itemCode: "COD1" }], liberaciones: [] } }, [], "1", insp)
    const nombres = a.inspeccion.items.map(d => d.defecto).join("|")
    check("defectos: NP exacta, código del ítem y sin vacíos", nombres === "MANCHA|ROTURA" && a.inspeccion.otrosCodigos === 1, a.inspeccion)
    check("defectos: solo pide detalle de los No Conforme", pedidos.filter(p => p === "productoTerminado.detalle").length === 1, pedidos)
    check("defectos: conserva el registro de origen", a.inspeccion.items.map(d => d.origen).join("|") === "Registro de control #1|Producto terminado #7")
    check("defectos: sin consulta = no disponible", cert.antecedentes({ data: null }, [], "1").inspeccion === null && cert.htmlDefectosInspeccion(null).includes("No disponible"))
    ctx.window.PhotinoBridge = { send: async () => ({ ok: false, error: "caída" }) }
    const caida = cert.htmlDefectosInspeccion({ ...(await cert.consultarDefectosInspeccion("500")), otrosCodigos: 0 })
    check("defectos: fuente caída no se informa como sin defectos", caida.includes("Registros de control: no disponible") && !caida.includes("no hay registros"), caida)
    ctx.window.PhotinoBridge = antes
}

// Pallets desde un lote: relación por OT verificada; nunca se mezclan otras OT ni otras NP.
const rel = trz.relacionarPalletsLote([{ npInnpack: 500, ordenTrabajo: "09001" }], [{ np: "500", items: [
    { id: 1, palletCodigo: "A", fps: { verificado: true, npInnpack: "500", ordenFabricacion: "9001" } },
    { id: 2, palletCodigo: "B", fps: { verificado: true, npInnpack: "500", ordenFabricacion: "9002" } },
    { id: 3, palletCodigo: "C", fps: { verificado: false }, inspeccion: { np: "500" } },
    { id: 4, palletCodigo: "D", fps: { verificado: true, npInnpack: "501", ordenFabricacion: "9001" } }] }])
check("pallets del lote: solo OT consumidora o sin verificar de la NP", rel.filas.map(f => f.pallet.palletCodigo).join() === "A,C" && rel.otrasOt === 1, rel)
check("pallets del lote: declara la fuerza de la relación", rel.filas[0].relacion.startsWith("Misma OT") && rel.filas[1].relacion.startsWith("Solo misma NP") && rel.filas[1].ot === null)
// Registro original y defectos de la etapa en "Ver detalle".
const original = trz.htmlRegistroOriginal({ ok: true, data: { sistema: "FPS", tabla: "dbo.WorkOrderRecords", corrida: "9", campos: [{ campo: "RecordKey", valor: "9" }, { campo: "Nota", valor: null }, { campo: "X", valor: "<b>" }] } }, "9")
check("registro original: origen, vacíos y texto escapado", ["dbo.WorkOrderRecords", "RecordKey", "<i>vacío</i>", "&lt;b&gt;"].every(x => original.includes(x)), original)
check("registro original: error y corrida inexistente se distinguen", trz.htmlRegistroOriginal({ ok: false, error: "caída" }, "9").includes("caída") && trz.htmlRegistroOriginal({ ok: true, data: { campos: null } }, "9").includes("no encontró"))
trz._integral = { data: { procesos: [{ IdProceso: 1, NombreProceso: "TROQUELADO" }], sesiones: [] }, calidad: { registros: { estado: "OK", items: [{ id: 5, proceso: "TROQUELADO", tipoDefecto: "CORTE" }, { id: 6, proceso: "PEGADO", tipoDefecto: "COLA" }, { id: 7, proceso: "TROQUELADO", tipoDefecto: "" }] } } }
check("detalle de proceso: defectos solo de su etapa", trz.detalleProceso(1).defectos.map(r => r.id).join() === "5", trz.detalleProceso(1).defectos)
trz._integral.calidad.registros.estado = "ERROR"
check("detalle de proceso: fuente caída = no disponible", trz.detalleProceso(1).defectos === null)
// 06.3: la fecha de fabricación sale de las corridas válidas; con varias fechas no se elige sola.
{
    const cdf = new ctx.window.CertificadosDestruccionController()
    const dia = (f, extra = {}) => ({ Status: 1, ProductionStartDate: f + "T08:00:00Z", Maquina: "M1", ...extra })
    const lotes = cdf.lotesProduccion({ sesiones: [dia("2026-10-02"), dia("2026-10-01"), dia("2026-10-02", { Maquina: "M2" }), dia("2026-10-03", { Status: 0 }), { Status: 1, SetupStartDate: "2026-10-04T08:00:00" }] })
    check("lotes: fechas válidas, ordenadas y sin anuladas ni solo puesta a punto", lotes.map(l => l.fecha + ":" + l.corridas).join() === "2026-10-01:1,2026-10-02:2", lotes)
    const campos = {}
    const ov = { querySelector: s => (campos[s] ||= { value: "", style: {} }) }
    cdf._form = {}
    cdf.pintarLotes(ov, { sesiones: [dia("2026-10-01")] })
    check("lotes: una fecha se autocompleta", campos["#cdfFab"].value === "2026-10-01" && campos["#cdfLote"].style.display === "none")
    cdf.pintarLotes(ov, { sesiones: [dia("2026-10-05"), dia("2026-10-06")] })
    check("lotes: varias fechas se eligen y no queda la de la NP anterior", campos["#cdfFab"].value === "" && campos["#cdfLote"].style.display === "" && campos["#cdfLote"].innerHTML.includes("2026-10-06"))
    campos["#cdfFab"].value = "2026-09-30"
    cdf.pintarLotes(ov, { sesiones: [dia("2026-10-01")] })
    check("lotes: no reemplaza lo escrito a mano e informa la de FPS", campos["#cdfFab"].value === "2026-09-30" && campos["#cdfLoteNota"].textContent.startsWith("FPS registra"))
    cdf.pintarLotes(ov, null)
    check("lotes: fuente caída no inventa fecha", campos["#cdfLoteNota"].textContent.startsWith("Producción no disponible"))
}
// Despacho por Service Layer cuando fps-api todavía usa la regla anterior: todo o nada.
async function pruebaDespachoSap() {
    const antiguo = () => {
        const i = item(1, { lineasNv: [0, 1], despachado: 999000 })
        delete i.reingresoNc
        return { np: 4000, items: [i], notaVenta: [{ DocEntry: 77, Cancelada: "N", LineNum: 0, Item: 1 }], documentos: [{ Tipo: "FACTURA" }], sinAsignar: { documentos: [{}], liberaciones: [] }, fuentes: { sapDespachos: { ok: true } } }
    }
    const linea = (lineNum, despachado, extra = {}) => ({ lineNum, itemCode: "COD1", guias: despachado, facturadoDirecto: 0, facturadoDeGuia: 0, facturadoReserva: 5, devuelto: 0, notasCredito: 0, reingresoNc: 0, despachado, ultimoDespacho: "2026-10-0" + (lineNum + 1), ...extra })
    const sap = extra => ({ ok: true, data: [{ docNum: 4000, cancelada: false, lineas: [linea(0, 100), linea(1, 20)], documentos: [{ tipo: "GUIA", docEntry: 1, docNum: 10, lineaNv: 0, cantidad: 100, repusoStock: false, tieneAdjunto: true }], ...extra }] })
    const previo = ctx.window.PhotinoBridge
    const correr = async respuesta => {
        const pedidos = []
        ctx.window.PhotinoBridge = { send: async m => { pedidos.push(m); return respuesta } }
        const data = antiguo()
        await C.completarDespachoSap(data)
        return { data, pedidos }
    }
    let { data, pedidos } = await correr({ ok: true, data: sap() })
    check("despacho SAP: pide la NV y suma sus líneas", pedidos.length === 1 && pedidos[0].action === "trazabilidad.despachoSap" && data.items[0].despachado === 120 && data.items[0].ultimoDespacho === "2026-10-02", data.items[0])
    check("despacho SAP: quita la marca de regla anterior y reemplaza documentos", !C.reglaDespachoAnterior(data.items) && data.documentos[0].Tipo === "GUIA" && data.documentos[0].TieneAdjunto === 1 && data.sinAsignar.documentos.length === 0)
    for (const [nombre, respuesta] of [
        ["endpoint sin desplegar", { ok: false, error: "HTTP 404" }],
        ["otra nota de venta", { ok: true, data: sap({ docNum: 1 }) }],
        ["líneas que no calzan", { ok: true, data: sap({ lineas: [linea(0, 100)] }) }],
        ["otro código en la línea", { ok: true, data: sap({ lineas: [linea(0, 100), linea(1, 20, { itemCode: "X" })] }) }]
    ]) {
        ({ data } = await correr(respuesta))
        check("despacho SAP: " + nombre + " conserva cifra marcada como no validada", data.items[0].despachado === 999000 && C.reglaDespachoAnterior(data.items) && !!data.despachoSapError && data.documentos[0].Tipo === "FACTURA")
    }
    let llamadas = 0
    ctx.window.PhotinoBridge = { send: async () => { llamadas++ } }
    await C.completarDespachoSap({ np: 4000, items: [item(1, { reingresoNc: 0 })], notaVenta: [] })
    check("despacho SAP: con fps-api corregida no consulta", llamadas === 0)
    ctx.window.PhotinoBridge = previo
}
// Navegación entre los cuatro módulos: el contexto viaja una sola vez y respeta los permisos.
async function pruebaNavegacion() {
    const cargados = []
    let niveles = {}
    ctx.window.App = { nivelModulo: m => niveles[m] || "EDITAR", loadModule: m => cargados.push(m) }
    C.irA("balance-mermas", { np: "4007", item: 2 })
    const c1 = C.tomarContexto("balance-mermas")
    check("navegación: entrega NP e ítem al destino", cargados[0] === "balance-mermas" && c1.np === "4007" && c1.item === 2)
    check("navegación: el contexto se usa una sola vez", C.tomarContexto("balance-mermas") === null)
    C.irA("cierre-np", { np: "4007" })
    check("navegación: otro módulo no hereda el contexto", C.tomarContexto("trazabilidad") === null && C.tomarContexto("cierre-np") === null)
    check("navegación: ofrece los otros tres y certificado nuevo", C.destinosNp("trazabilidad").map(d => d.modulo).join() === "balance-mermas,cierre-np,certificados-destruccion,certificados-destruccion")
    niveles = { "balance-mermas": "SIN_ACCESO", "certificados-destruccion": "VER" }
    check("navegación: sin acceso no se ofrece y VER no crea certificados", C.destinosNp("trazabilidad").map(d => d.titulo).join() === "Cierre de NP,Certificados de destrucción")
    const antes = cargados.length
    C.irA("balance-mermas", { np: "4007" })
    check("navegación: sin acceso no navega", cargados.length === antes)

    // Cada controlador consulta solo, sin que la persona vuelva a escribir la NP.
    const bm = new ctx.window.BalanceMermasController()
    const pasos = []
    bm.vista = () => {}; bm.consultar = async () => pasos.push("bm:" + el("bmNp").value + ":" + bm._itemPedido); bm.tab = t => pasos.push("tab:" + t)
    await bm.abrirContexto({ np: "4007", item: 2, tab: "mermas" })
    const cd = new ctx.window.CertificadosDestruccionController()
    niveles = {}
    cd.verLista = () => pasos.push("lista:" + el("cdFiltroNp").value); cd.formulario = async (id, p) => pasos.push(`nuevo:${id}:${p.np}:${p.item}`); cd.accion = async (a, id) => pasos.push(`${a}:${id}`)
    await cd.abrirContexto({ np: "4007", item: 2, nuevo: true })
    await cd.abrirContexto({ np: "4007", certificadoId: 9 })
    niveles = { "certificados-destruccion": "VER" }
    await cd.abrirContexto({ np: "4007", item: 2, nuevo: true })
    check("navegación: balance y certificados se abren con el contexto", pasos.join("|") === "bm:4007:2|tab:mermas|lista:4007|nuevo:null:4007:2|lista:4007|ver:9|lista:4007", pasos)
    delete ctx.window.App
}
// Antecedentes automáticos del checklist: nunca 0 cuando la fuente no respondió.
{
    const t = new ctx.window.TrazabilidadController()
    t._integral = { np: "1", data: { consumos: [{ lotes: [{ origenDocNum: 5 }, {}] }], sesiones: [{ Status: 1, Etiquetas: 3 }, { Status: 1, Etiquetas: 2 }] } }
    check("antecedente: materiales con origen", t.datoEnSistema(null, "BOD-REC").startsWith("2 lote(s) de material consumido, 1 con documento"))
    check("antecedente: etiquetas FPS", t.datoEnSistema(null, "CAL-ETIQ") === "5 etiqueta(s) en las corridas de FPS")
    check("antecedente: pendiente de llegar no es 0", t.datoEnSistema("CALIDAD", "CAL-RECH") === "Consultando...")
    t._integral.nc = { estado: "ERROR", items: [] }
    t._integral.certificados = { estado: "SIN_PERMISO", items: null }
    check("antecedente: fuente caída o sin permiso no es 0", !/^0 /.test(t.datoEnSistema("CALIDAD", "CAL-RECH")) && t.datoEnSistema(null, "CAL-DEST") === "Sin permiso sobre el módulo de origen")
    t._integral.data.sesiones[0].Etiquetas = null
    check("antecedente: etiquetas incompletas no se suman", !/etiqueta/.test(t.datoEnSistema(null, "CAL-ETIQ")))
    check("antecedente: sin fuente propia queda en '-'", t.datoEnSistema(null, "PLA-CERT") === "-")
}
{
    const t = new ctx.window.TrazabilidadController()
    const html = "<html><body><p>informe</p></body></html>"
    const conNumero = t.conVersion(html, { version: 3, generadoPor: "<x>" })
    check("informe reabierto: imprime la versión y escapa el autor", conNumero.includes("Versión guardada N° 3") && !conNumero.includes("<x>") && conNumero.endsWith("<p>informe</p></body></html>"))
    check("informe reabierto: sin número no inventa", t.conVersion(html, {}) === html)
}
{
    vm.runInContext(fs.readFileSync(path.join(www, "modules/cierre-np/cierre-np.controller.js"), "utf8"), ctx, { filename: "cierre-np" })
    const cn = new ctx.window.CierreNpController()
    check("cierre: origen en palabras", cn.origenLegible("MERMA:Pegado|ESTIMADA|UNIDADES") === "Mermas registradas: Pegado (estimada, en unidades)" && cn.origenLegible("CERT:3") === "Certificado de destrucción (registro 3)" && cn.origenLegible("QCS:DESTRUCCION") === "Bodega destruccion de QCS")
}
{
    const t = new ctx.window.TrazabilidadController()
    t._integral = { data: { documentos: [{ Tipo: "GUIA", DocDate: "2026-10-05" }, { Tipo: "FACTURA", DocDate: "2026-01-01" }, { Tipo: "GUIA", DocDate: "2026-10-02T00:00:00" }], consumos: [{ lotes: [{ origenFecha: "2026-09-01" }, {}] }] } }
    check("inspección: rango logístico sale solo de las guías", JSON.stringify(t.rangoInspeccion("LOG-CAM")) === '{"desde":"2026-10-02","hasta":"2026-10-05"}')
    check("inspección: rango de bodega sale de la recepción de lotes", t.rangoInspeccion("BOD-CAM").desde === "2026-09-01")
    t._integral = { data: {} }
    check("inspección: sin fechas no propone rango", t.rangoInspeccion("LOG-CAM").desde === "")
    const obs = t.observacionInspeccion({ id: 12, patente: "AB1234", conductor: "x".repeat(900), totalNoCumple: 0 })
    check("inspección: la observación declara asociación manual y respeta 500", obs.startsWith("Asociación MANUAL") && obs.includes("#12") && obs.length === 500)
    check("inspección: solo en los requisitos de camión", t.puedeElegirInspeccion("BOD-CAM") && !t.puedeElegirInspeccion("PLA-CERT"))
}
{
    const t = new ctx.window.TrazabilidadController()
    t._integral = { np: "1", data: { consumos: [{ categoria: "TINTAS OFFSET", lotes: [{ lote: "T-1" }, { lote: "T-1" }] }, { categoria: "CARTULINAS", lotes: [{ lote: "C-9" }] }] } }
    check("antecedente: solo lotes de categoría tinta, sin repetir", t.datoEnSistema(null, "TIN-LOTE") === "1 lote(s) de tinta consumidos según SAP: T-1")
    t._integral.data = { items: [{ item: 1, itemCode: "COD1", lineasNv: [] }], ordenes: [{ OrdenTrabajo: 10, EstadoOt: "Produccion " }, { OrdenTrabajo: 11 }] }
    const estado = d => t.fichaItem(0).find(f => f[0] === "Estado de la OT en FPS")[1]
    check("ficha: estado de la OT desde FPS", estado() === "10: Produccion", estado())
    t._integral.data.ordenes = [{ OrdenTrabajo: 10 }]
    check("ficha: fps-api sin el campo queda No disponible", estado() === C.ND, estado())
}
pruebaDefectos().then(pruebaDespachoSap).then(pruebaNavegacion).catch(err => { fallas++; console.log("FALLA: defectos", err.message) }).then(() => {
console.log(`\n${ok} OK, ${fallas} fallas`)
process.exit(fallas ? 1 : 0)
})
