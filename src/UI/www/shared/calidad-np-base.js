// Calidad NP (solo INNPACK): utilidades compartidas por Balance y Mermas, Cierre de NP y Certificados de destrucción.
// Las reglas de negocio (estados, saldos, correlativos, auditoría) viven en la API; aquí solo hay formato, carga de la NP
// y el cálculo PROVISIONAL del balance a partir de lo registrado en FPS/SAP/QCS/QCC (nunca se presenta como definitivo).
window.CalidadNp = (function () {
    const ND = "No disponible"
    const ETAPAS = ["Corte", "Impresión", "Folia", "Corrugado", "Emplacado", "Troquelado", "Pegado", "Termoformado", "Paletizado", "Calidad", "Despacho", "Otro"]
    // Etapas cuya cantidad FPS está en pliegos (hasta el troquelado) o en unidades (después).
    const BASE_PLIEGOS = new Set(["Corte", "Impresión", "Folia", "Corrugado", "Emplacado", "Troquelado"])
    const BASE_UNIDADES = new Set(["Pegado", "Termoformado", "Paletizado"])

    const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
    const num = (v, dec = 3) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? ND : Number(v).toLocaleString("es-CL", { maximumFractionDigits: dec }))
    const txt = v => (v === null || v === undefined || String(v).trim() === "" ? "-" : String(v).trim())
    const fecha = v => {
        if (!v) return "-"
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v))
        if (m) return `${m[3]}-${m[2]}-${m[1]}` // fecha pura: sin conversión de zona horaria
        const d = new Date(v)
        return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toLocaleDateString("es-CL")
    }
    const fechaHora = v => {
        if (!v) return "-"
        const d = new Date(v)
        return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("es-CL")
    }

    async function send(action, data) {
        try {
            const res = await window.PhotinoBridge.send({ action, data })
            return res && res.ok !== false ? { ok: true, data: res.data } : { ok: false, error: res?.error || "Error desconocido" }
        } catch (err) {
            return { ok: false, error: err?.message || String(err) }
        }
    }

    const nivel = m => (window.App?.nivelModulo ? window.App.nivelModulo(m) : "EDITAR")
    const puedeEditar = m => nivel(m) === "EDITAR"

    function etapaDe(texto) {
        const t = String(texto || "")
        if (/corte|dimension/i.test(t)) return "Corte"
        if (/impres|offset/i.test(t)) return "Impresión"
        if (/folia/i.test(t)) return "Folia"
        if (/emplac/i.test(t)) return "Emplacado"
        if (/corrug/i.test(t)) return "Corrugado"
        if (/troquel/i.test(t)) return "Troquelado"
        if (/pegad/i.test(t)) return "Pegado"
        if (/termof/i.test(t)) return "Termoformado"
        if (/paletiz|conteo/i.test(t)) return "Paletizado"
        if (/calidad|liberaci/i.test(t)) return "Calidad"
        if (/despach/i.test(t)) return "Despacho"
        return "Otro"
    }

    // Registros de Calidad de la NP desde las acciones existentes (respeta permisos de esos módulos).
    async function calidadDeNp(np) {
        const exacto = r => String(r?.np ?? "").trim() === String(np)
        const pedir = async (modulo, action, data) => {
            if (nivel(modulo) === "SIN_ACCESO") return { estado: "SIN_PERMISO", items: [] }
            const r = await send(action, data)
            return r.ok ? { estado: "OK", items: (r.data?.items || []).filter(exacto) } : { estado: "ERROR", items: [], error: r.error }
        }
        const [registros, productoTerminado] = await Promise.all([
            pedir("registros-control", "registrosControl.obtenerRegistros", { page: 1, limit: 500, np }),
            pedir("producto-terminado", "productoTerminado.list", { empresa: "INNPACK", np, page: 1, limit: 200 })
        ])
        return { registros, productoTerminado }
    }

    // Consulta integral (FPS/SAP/QCS) + factores confirmados. Una fuente caída llega como null, nunca como 0.
    async function cargarNp(np) {
        let [integral, factores] = await Promise.all([send("trazabilidad.integral", { np }), send("trazabilidad.factor.list", { np })])
        let data = integral.ok ? integral.data : null
        let error = integral.ok ? null : integral.error
        // El número escrito puede ser una OT / NP Faret: todo el módulo trabaja con la NP INNPACK resuelta.
        const resolucion = data?.resolucion || null
        if (data && data.np === null) {
            error = (resolucion?.avisos || []).join(" ") || "El número no corresponde a una NP INNPACK."
            data = null
        }
        const npReal = data ? String(data.np) : String(np)
        if (npReal !== String(np)) factores = await send("trazabilidad.factor.list", { np: npReal })
        return {
            np: npReal,
            npIngresada: String(np),
            resolucion,
            error,
            data,
            factores: factores.ok ? (factores.data?.factores || []) : [],
            factoresError: factores.ok ? null : factores.error,
            consultadoEn: new Date()
        }
    }

    // Mismo número de ítem con códigos distintos: mermas, cierre, certificado y factor se guardan solo por número,
    // así que no se pueden atribuir a uno de ellos.
    const itemAmbiguo = (carga, item) => (carga?.data?.items || []).filter(i => Number(i.item) === Number(item)).length > 1

    // Factor unidades/pliego CONFIRMADO del ítem (un propuesto nunca se usa en cálculos).
    function factorConfirmado(carga, item) {
        const f = (carga?.factores || []).find(x => Number(x.item) === Number(item) && x.estado === "CONFIRMADO")
        return f ? Number(f.unidadesPorPliego) : null
    }

    function saldoBodega(i, bodega) {
        if (!i || i.saldoBodegas === null || i.saldoBodegas === undefined) return null
        return i.saldoBodegas[bodega] ?? 0
    }

    // Convierte una cantidad a la base de la etapa; null si hace falta el factor y no está confirmado.
    function aBase(cant, unidad, base, factor) {
        if (base === null || unidad === base) return Number(cant)
        if (!factor) return null
        return unidad === "PLIEGOS" ? Number(cant) * factor : Number(cant) / factor
    }

    // Balance PROVISIONAL por etapa. Entrada = salida de la etapa anterior (FPS no registra entradas).
    // Una diferencia queda como "por conciliar": nunca se asigna sola a merma, destrucción ni error.
    // La fps-api corregida siempre envía reingresoNc (null si SAP no responde). Si no viene, el despachado es el de la
    // regla anterior y no se puede rotular como la regla corregida.
    const AVISO_REGLA_ANTERIOR = "El servidor FPS aún no tiene la corrección de despachos: el despachado y el pendiente pueden estar mal (facturas de reserva y notas de crédito). No usar como cifra validada."
    const reglaDespachoAnterior = items => (items || []).some(i => i.reingresoNc === undefined)

    function balance({ carga, item, mermas }) {
        const advertencias = []
        const d = carga?.data
        if (!d) return { filas: [], advertencias: [`Fuente FPS/SAP no disponible: ${carga?.error || "sin respuesta"}.`], provisional: true }
        const items = d.items || []
        const sinSeleccion = item === null || item === undefined || item === ""
        const ambiguo = !sinSeleccion && itemAmbiguo(carga, item)
        const it = ambiguo ? null : sinSeleccion ? (items.length === 1 ? items[0] : null) : (items.find(i => Number(i.item) === Number(item)) || null)
        const multi = items.length > 1
        const factor = it ? factorConfirmado(carga, it.item) : null
        if (ambiguo) advertencias.push(`El ítem ${item} tiene más de un código de producto en la nota de venta: no se calculan Calidad, Despacho ni conversiones para no mezclarlos.`)
        if (multi) advertencias.push(`NP con ${items.length} ítems: FPS no separa los procesos por ítem. Se muestran para toda la NP y no se calcula entrada ni diferencia de producción; Calidad y Despacho sí se calculan por ítem.`)
        if (!factor) advertencias.push("Factor unidades/pliego del ítem sin confirmar: no se calculan unidades equivalentes ni conversiones.")
        advertencias.push("Balance PROVISIONAL: las cantidades de FPS las declara el operador; material retenido en proceso, reproceso y saldo en proceso no tienen fuente y no se informan.")

        const procs = (d.procesos || []).filter(p => !p.idProcesoDuplicado)
        const ses = (d.sesiones || []).filter(s => Number(s.Status) === 1)
        const sinItem = m => m.item === null || m.item === undefined
        const activas = (mermas || []).filter(m => m.estado !== "ANULADA")
        const mermasAct = activas.filter(m => (sinItem(m) ? !multi : !it || Number(m.item) === Number(it.item)))
        const sinAsignar = multi ? activas.filter(sinItem).length : 0
        if (sinAsignar) advertencias.push(`${sinAsignar} merma(s) sin ítem en una NP con varios ítems: no se suman a ninguno.`)
        let sinConvertir = 0
        const mermaEtapa = (etapa, base) => {
            let conf = 0, est = 0
            const otras = { conf: {}, est: {} } // mermas en otra unidad: se muestran, no se suman ni se convierten
            for (const m of mermasAct.filter(x => etapaDe(x.proceso) === etapa)) {
                const v = aBase(m.cantidad, m.unidad, base, factor)
                if (v === null) {
                    sinConvertir++
                    const grupo = otras[m.metodo === "ESTIMADA" ? "est" : "conf"]
                    const unidad = String(m.unidad).toLowerCase()
                    grupo[unidad] = (grupo[unidad] || 0) + Number(m.cantidad)
                    continue
                }
                if (m.metodo === "ESTIMADA") est += v; else conf += v
            }
            const texto = g => Object.entries(g).map(([u, c]) => `${num(c)} ${u}`).join(" + ") || null
            return { conf, est, confOtras: texto(otras.conf), estOtras: texto(otras.est) }
        }

        const filas = []
        let prev = null // { base, salida }
        for (const etapa of ETAPAS.filter(e => !["Calidad", "Despacho"].includes(e))) {
            const ps = procs.filter(p => etapaDe(`${p.NombreCarpeta || ""} ${p.NombreProceso || ""} ${p.Categoria || ""}`) === etapa)
            const mermasSolas = mermasAct.some(m => etapaDe(m.proceso) === etapa)
            if (!ps.length && !mermasSolas) continue
            const base = BASE_PLIEGOS.has(etapa) ? "PLIEGOS" : BASE_UNIDADES.has(etapa) ? "UNIDADES" : null
            const ids = new Set(ps.map(p => String(p.IdProceso)))
            const s = ses.filter(x => ids.has(String(x.IdProceso)))
            const procesado = s.length ? s.reduce((a, x) => a + Number(x.ProductionQuantity || 0), 0) : null
            const m = mermaEtapa(etapa, base)
            let entrada = null
            if (!multi && prev && base) entrada = prev.base === base ? prev.salida : aBase(prev.salida, prev.base, base, factor)
            const compuesta = new Set(s.map(x => String(x.IdProceso))).size > 1
            if (compuesta) {
                entrada = null
                advertencias.push(`${etapa}: la cifra suma ${new Set(s.map(x => String(x.IdProceso))).size} procesos o pliegos distintos de FPS; no se compara con la etapa anterior ni se convierte a unidades.`)
            }
            const equiv = etapa === "Troquelado" && !multi && !compuesta && factor && procesado !== null ? procesado * factor : null
            // Con una merma sin convertir la diferencia quedaría mal calculada: no se informa.
            const dif = entrada === null || procesado === null || m.confOtras || m.estOtras ? null : entrada - procesado - m.conf - m.est
            const fechas = ps.map(p => p.desde).filter(Boolean).sort()
            const hasta = ps.map(p => p.hasta).filter(Boolean).sort().pop()
            filas.push({
                etapa, base, fechaDesde: fechas[0] || null, fechaHasta: hasta || null,
                maquinas: [...new Set(ps.flatMap(p => p.maquinas || []))].join(", "),
                entrada, procesado, equivalentes: equiv, salidaConforme: procesado, mermaConfirmada: m.conf, mermaEstimada: m.est,
                mermaConfirmadaSinConvertir: m.confOtras, mermaEstimadaSinConvertir: m.estOtras,
                retenido: null, reproceso: null, diferencia: dif,
                // Registros que forman la fila (para el detalle verificable).
                corridas: s, mermasEtapa: mermasAct.filter(x => etapaDe(x.proceso) === etapa),
                estado: !ps.length ? "Solo mermas registradas (sin corridas FPS)" : s.length ? (ps.some(p => p.enCurso) ? "Registrado en FPS (corrida abierta: estimado)" : "Registrado en FPS") : "REGISTRO NO DISPONIBLE (sin corridas)"
            })
            // Una etapa compuesta o sin corridas corta la cadena: no se compara la siguiente contra una etapa más antigua.
            if (compuesta || (ps.length && procesado === null)) prev = null
            else if (procesado !== null && base) prev = { base, salida: procesado }
            if (etapa === "Troquelado" && equiv !== null) prev = { base: "UNIDADES", salida: equiv }
        }

        if (it) {
            const entradaCal = prev && prev.base === "UNIDADES" ? prev.salida : null
            const cuarentena = saldoBodega(it, "CUARENTENA")
            const destruccion = saldoBodega(it, "DESTRUCCION")
            const liberado = it.liberadoPt
            const m = mermaEtapa("Calidad", "UNIDADES")
            const salidas = liberado === null || liberado === undefined ? null : liberado + (cuarentena || 0) + (destruccion || 0)
            filas.push({
                etapa: "Calidad", base: "UNIDADES", fechaDesde: null, fechaHasta: null, maquinas: "", entrada: multi ? null : entradaCal, procesado: null, equivalentes: null,
                salidaConforme: liberado, mermaConfirmada: m.conf, mermaEstimada: m.est, retenido: cuarentena, reproceso: null,
                mermaConfirmadaSinConvertir: m.confOtras, mermaEstimadaSinConvertir: m.estOtras,
                destruccionQcs: destruccion,
                diferencia: multi || entradaCal === null || salidas === null || m.confOtras || m.estOtras ? null : entradaCal - salidas - m.conf - m.est,
                estado: liberado === null || liberado === undefined ? "Liberaciones QCS no disponibles" : "Confirmado (QCS: liberado, cuarentena y destrucción)"
            })
            // La API ya entrega el despachado neto de devoluciones y reingresos: no se vuelven a restar.
            const neto = it.despachado ?? null
            filas.push({
                etapa: "Despacho", base: "UNIDADES", fechaDesde: null, fechaHasta: null, maquinas: "", entrada: liberado ?? null, procesado: null, equivalentes: null,
                salidaConforme: neto, mermaConfirmada: 0, mermaEstimada: 0, retenido: null, reproceso: null,
                diferencia: liberado === null || liberado === undefined || neto === null ? null : liberado - neto,
                diferenciaEsPendienteDespacho: true,
                estado: neto === null ? "Despachos SAP no disponibles" : reglaDespachoAnterior([it]) ? "NO VALIDADO (regla de despacho anterior)" : "Confirmado (SAP: guías + facturas directas − devoluciones − reingresos por nota de crédito)"
            })
        }
        if (it && reglaDespachoAnterior([it])) advertencias.unshift(AVISO_REGLA_ANTERIOR)
        if (sinConvertir) advertencias.push(`${sinConvertir} merma(s) en otra unidad no se pudieron convertir (falta factor confirmado) y no entran al cálculo.`)
        // mermas = null: la consulta falló. No se informa 0 ni se calculan las diferencias que dependen de ellas.
        if (mermas === null) {
            for (const f of filas) {
                f.mermaConfirmada = f.mermaEstimada = null
                f.mermasEtapa = null
                if (!f.diferenciaEsPendienteDespacho) f.diferencia = null
            }
            advertencias.unshift("Mermas no disponibles (no se pudieron consultar): no equivale a merma cero y no se calculan las diferencias de proceso.")
        }
        return { filas, advertencias, provisional: true, item: it?.item ?? null }
    }

    // ── Excel y modal (mismos patrones que Trazabilidad) ─────────────────────────────────────

    function hoja(wb, nombre, titulo, encabezados, filas) {
        const aoa = [[titulo], [], encabezados, ...(filas.length ? filas : [["Sin datos"]])]
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        ws["!cols"] = encabezados.map((h, i) => ({ wch: Math.min(Math.max(String(h).length, ...aoa.slice(2).map(r => String(r[i] ?? "").length)) + 2, 50) }))
        for (let c = 0; c < encabezados.length; c++) {
            const ref = XLSX.utils.encode_cell({ r: 2, c })
            if (ws[ref]) ws[ref].s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "111827" } } }
        }
        if (ws.A1) ws.A1.s = { font: { bold: true, sz: 14 } }
        XLSX.utils.book_append_sheet(wb, ws, nombre)
    }

    function guardarLibro(wb, fileName) {
        if (typeof XLSX === "undefined") { alert("La librería de Excel no está disponible"); return }
        const base64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" })
        window.PhotinoBridge.send({ action: "excel.guardar", data: { fileName, base64 } })
            .then(res => window.ExcelExporter?.showToast?.(res?.ok ? "Archivo exportado correctamente" : "Error exportando archivo"))
            .catch(() => window.ExcelExporter?.showToast?.("Error exportando archivo"))
    }

    function stamp(d = new Date()) {
        const p = n => String(n).padStart(2, "0")
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
    }

    // Modal mínimo: cuerpo HTML + aceptar con validación propia (devuelve un mensaje de error o nada).
    function modal(id, titulo, cuerpo, textoOk, alAceptar, ancho = 760) {
        document.getElementById(id)?.remove()
        const ov = document.createElement("div")
        ov.id = id
        ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;"
        ov.innerHTML = `<div class="card" style="min-width:420px;width:${ancho}px;max-width:95vw;max-height:88vh;overflow:auto;">
            <div class="module-title" style="font-size:16px;margin-bottom:12px;">${esc(titulo)}</div>${cuerpo}
            <div class="cnp-err" style="color:#b91c1c;margin-top:8px;"></div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
              <button class="btn-secondary cnp-cancel">${alAceptar ? "Cancelar" : "Cerrar"}</button>
              ${alAceptar ? `<button class="btn-primary cnp-ok">${esc(textoOk)}</button>` : ""}</div></div>`
        document.body.appendChild(ov)
        // .table trae min-width 1400px y no corta texto (pensado para página completa): en la ventana ocultaría las acciones.
        ov.querySelectorAll(".table").forEach(t => { t.style.minWidth = "0" })
        ov.querySelectorAll(".table th, .table td").forEach(x => { x.style.whiteSpace = "normal"; x.style.padding = "6px 8px" })
        ov.querySelector(".cnp-cancel").onclick = () => ov.remove()
        const ok = ov.querySelector(".cnp-ok")
        if (ok) ok.onclick = async () => {
            const err = ov.querySelector(".cnp-err")
            err.textContent = ""
            ok.disabled = true
            try { const msg = await alAceptar(ov); if (msg) err.textContent = msg; else ov.remove() } finally { ok.disabled = false }
        }
        return ov
    }

    function leerArchivoBase64(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader()
            r.onload = () => resolve(String(r.result).split(",")[1] || "")
            r.onerror = () => reject(new Error("No se pudo leer el archivo"))
            r.readAsDataURL(file)
        })
    }

    // Impresión/PDF de un documento HTML completo (el usuario elige "Guardar como PDF"): mismo mecanismo iframe del proyecto.
    // Imprime/guarda como PDF un documento HTML completo; espera a que carguen las imágenes (logos) antes de abrir el diálogo.
    async function imprimirHtml(html) {
        const iframe = document.createElement("iframe")
        // Sin "allow-scripts": el HTML (también el de informes guardados en la base) nunca ejecuta código en la aplicación.
        iframe.setAttribute("sandbox", "allow-same-origin allow-modals")
        iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;"
        document.body.appendChild(iframe)
        const doc = iframe.contentDocument
        doc.open()
        doc.write(html)
        doc.close()
        setTimeout(() => iframe.remove(), 120000)
        await Promise.all(Array.from(doc.querySelectorAll("img")).map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r }))))
        setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print() }, 300)
    }

    // Producto ingresado a bodega por SAP para el ítem (entradas de producción con esta NP y código de la NV). null = fuente no disponible.
    function ingresadoItem(carga, it) {
        const e = carga?.data?.entradas
        if (!e || !it) return null
        return e.ingresadoPorItem.filter(x => String(x.itemCode) === String(it.itemCode)).reduce((a, x) => a + x.ingresado, 0)
    }

    // Identificación inequívoca de la línea en SAP para guardar junto a mermas, cierres y certificados.
    function itemSap(carga, it) {
        if (!it) return {}
        const lineas = (it.lineasNv || []).map(Number)
        const nv = (carga?.data?.notaVenta || []).find(l => String(l.ItemCode) === String(it.itemCode) && lineas.includes(Number(l.LineNum)))
        return { itemCode: it.itemCode || null, nvDocEntry: nv?.DocEntry ?? null, nvLineas: lineas.length ? lineas.join(",") : null }
    }

    // Inventario SAP actual de los lotes de la NP para el código del ítem. null = fuente caída o sin lotes (nunca 0).
    function inventarioItem(carga, it) {
        const x = (carga?.data?.inventarioPt || []).find(p => String(p.itemCode) === String(it?.itemCode))
        if (!x) return null
        return {
            stock: x.saldo ?? null, bodegas: x.bodegas || {},
            recibidoCompra: x.recepciones?.length ? x.recepciones.reduce((a, r) => a + Number(r.cantidad || 0), 0) : null,
            otraNp: x.entradasConOtraNp || []
        }
    }

    // Evidencia de los datos usados al cerrar una NP (se guarda con el cierre; la API le calcula la huella SHA-256).
    function evidenciaItem(carga, it, extra) {
        if (!it) return null
        return {
            consultadoEn: (carga?.consultadoEn || new Date()).toISOString(),
            np: carga?.np, item: it.item, itemCode: it.itemCode,
            solicitado: it.solicitado, liberadoPt: it.liberadoPt, despachado: it.despachado, devuelto: it.devuelto,
            foliosLiberacion: it.foliosLiberacion, documentosDespacho: it.documentosDespacho,
            ingresadoBodega: ingresadoItem(carga, it),
            stockSap: inventarioItem(carga, it)?.stock ?? null,
            ultimaLiberacion: it.ultimaLiberacion ?? null, ultimoDespacho: it.ultimoDespacho ?? null,
            ...extra
        }
    }

    // Mermas y certificados registrados en QCC, tal como los entrega cierre.get (baseJustificacion).
    function registrosQcc(base) {
        if (!base) return null
        const mermas = {}, certificados = {}
        for (const m of base.mermas || []) mermas[`${m.proceso} (${String(m.metodo).toLowerCase()}, ${String(m.unidad).toLowerCase()})`] = Number(m.cantidad)
        for (const c of base.certificados || []) certificados[c.correlativo || `#${c.id}`] = `${c.estado}, ${num(c.cantidadDestruir)} a destruir, ${c.ejecutada ? `ejecutada ${num(c.cantidadEjecutada)}` : "sin ejecutar"}`
        return { mermas, certificados }
    }

    // Compara la evidencia de un cierre con los datos actuales de SAP/QCS y QCC: lista lo que cambió después del cierre.
    // Devuelve null si no hay evidencia (cierres anteriores a esta función) o si las fuentes no están disponibles.
    function movimientosPosteriores(evidenciaJson, it, carga, base) {
        if (!evidenciaJson || !it) return null
        let ev
        try { ev = JSON.parse(evidenciaJson) } catch { return null }
        const cambios = []
        const dif = (campo, rotulo) => {
            const antes = ev[campo], ahora = it[campo]
            if (antes === null || antes === undefined || ahora === null || ahora === undefined) return
            if (Number(antes) !== Number(ahora)) cambios.push(`${rotulo}: ${num(antes)} → ${num(ahora)}`)
        }
        it = { ...it, ingresadoBodega: ingresadoItem(carga, it), stockSap: inventarioItem(carga, it)?.stock ?? null }
        dif("liberadoPt", "Liberado")
        dif("ingresadoBodega", "Ingresado a bodega")
        dif("despachado", "Despachado")
        dif("stockSap", "Inventario SAP de los lotes de la NP")
        dif("foliosLiberacion", "Folios de liberación")
        dif("documentosDespacho", "Documentos de despacho")
        const nueva = (campo, rotulo) => { if (ev[campo] && it[campo] && it[campo] > ev[campo]) cambios.push(`${rotulo} posterior al cierre: ${it[campo]}`) }
        nueva("ultimaLiberacion", "Liberación")
        nueva("ultimoDespacho", "Despacho")
        const ahora = registrosQcc(base)
        if (ev.registrosQcc && ahora) {
            const comparar = (antes, hoy, rotulo, texto) => {
                for (const k of new Set([...Object.keys(antes), ...Object.keys(hoy)]))
                    if (antes[k] !== hoy[k]) cambios.push(`${rotulo} ${k}: ${k in antes ? texto(antes[k]) : "no existía"} → ${k in hoy ? texto(hoy[k]) : "ya no está"}`)
            }
            comparar(ev.registrosQcc.mermas, ahora.mermas, "Merma", num)
            comparar(ev.registrosQcc.certificados, ahora.certificados, "Certificado", x => x)
        }
        return cambios
    }

    function usuarioActual() {
        return sessionStorage.getItem("nombreUsuario") || sessionStorage.getItem("codigoUsuario") || "-"
    }

    // Fecha de hoy en hora local (toISOString entrega la fecha UTC y de noche adelanta un día).
    const hoyLocal = (ahora = new Date()) => new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

    // Totales separados por unidad: pliegos y unidades nunca se suman entre sí.
    const sumaPorUnidad = (filas, unidadDe, cantidadDe) => {
        const t = {}
        for (const f of filas) { const u = String(unidadDe(f) || "SIN UNIDAD").toLowerCase(); t[u] = (t[u] || 0) + Number(cantidadDe(f)) }
        return Object.entries(t).map(([u, v]) => `${num(v)} ${u}`).join(" · ") || "0"
    }

    return { AVISO_REGLA_ANTERIOR, reglaDespachoAnterior, ND, ETAPAS, itemAmbiguo, itemSap, inventarioItem, hoyLocal, sumaPorUnidad, esc, num, txt, fecha, fechaHora, send, nivel, puedeEditar, etapaDe, calidadDeNp, cargarNp, evidenciaItem, registrosQcc, ingresadoItem, movimientosPosteriores, factorConfirmado, saldoBodega, balance, hoja, guardarLibro, stamp, modal, leerArchivoBase64, imprimirHtml, usuarioActual }
})()
