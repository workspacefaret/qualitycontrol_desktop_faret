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
        const [integral, factores] = await Promise.all([send("trazabilidad.integral", { np }), send("trazabilidad.factor.list", { np })])
        return {
            np,
            error: integral.ok ? null : integral.error,
            data: integral.ok ? integral.data : null,
            factores: factores.ok ? (factores.data?.factores || []) : [],
            factoresError: factores.ok ? null : factores.error,
            consultadoEn: new Date()
        }
    }

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
    function balance({ carga, item, mermas }) {
        const advertencias = []
        const d = carga?.data
        if (!d) return { filas: [], advertencias: [`Fuente FPS/SAP no disponible: ${carga?.error || "sin respuesta"}.`], provisional: true }
        const items = d.items || []
        const it = items.find(i => Number(i.item) === Number(item)) || items[0] || null
        const multi = items.length > 1
        const factor = it ? factorConfirmado(carga, it.item) : null
        if (multi) advertencias.push(`NP con ${items.length} ítems: FPS no separa los procesos por ítem. Se muestran para toda la NP y no se calcula entrada ni diferencia de producción; Calidad y Despacho sí se calculan por ítem.`)
        if (!factor) advertencias.push("Factor unidades/pliego del ítem sin confirmar: no se calculan unidades equivalentes ni conversiones.")
        advertencias.push("Balance PROVISIONAL: las cantidades de FPS las declara el operador; material retenido en proceso, reproceso y saldo en proceso no tienen fuente y no se informan.")

        const procs = (d.procesos || []).filter(p => !p.idProcesoDuplicado)
        const ses = (d.sesiones || []).filter(s => Number(s.Status) === 1)
        const mermasAct = (mermas || []).filter(m => m.estado !== "ANULADA" && (m.item === null || m.item === undefined || !it || Number(m.item) === Number(it.item)))
        let sinConvertir = 0
        const mermaEtapa = (etapa, base) => {
            let conf = 0, est = 0
            for (const m of mermasAct.filter(x => etapaDe(x.proceso) === etapa)) {
                const v = aBase(m.cantidad, m.unidad, base, factor)
                if (v === null) { sinConvertir++; continue }
                if (m.metodo === "ESTIMADA") est += v; else conf += v
            }
            return { conf, est }
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
            const equiv = etapa === "Troquelado" && factor && procesado !== null ? procesado * factor : null
            const dif = entrada === null || procesado === null ? null : entrada - procesado - m.conf - m.est
            const fechas = ps.map(p => p.desde).filter(Boolean).sort()
            const hasta = ps.map(p => p.hasta).filter(Boolean).sort().pop()
            filas.push({
                etapa, base, fechaDesde: fechas[0] || null, fechaHasta: hasta || null,
                maquinas: [...new Set(ps.flatMap(p => p.maquinas || []))].join(", "),
                entrada, procesado, equivalentes: equiv, salidaConforme: procesado, mermaConfirmada: m.conf, mermaEstimada: m.est,
                retenido: null, reproceso: null, diferencia: dif,
                estado: !ps.length ? "Solo mermas registradas (sin corridas FPS)" : s.length ? (ps.some(p => p.enCurso) ? "Registrado en FPS (corrida abierta: estimado)" : "Registrado en FPS") : "REGISTRO NO DISPONIBLE (sin corridas)"
            })
            if (procesado !== null && base) prev = { base, salida: procesado }
            if (etapa === "Troquelado" && equiv !== null) prev = { base: "UNIDADES", salida: equiv }
        }

        if (it) {
            const ultimaUnid = [...filas].reverse().find(f => f.base === "UNIDADES" && f.procesado !== null)
            const entradaCal = ultimaUnid ? ultimaUnid.procesado : (prev && prev.base === "UNIDADES" ? prev.salida : null)
            const cuarentena = saldoBodega(it, "CUARENTENA")
            const destruccion = saldoBodega(it, "DESTRUCCION")
            const liberado = it.liberadoPt
            const m = mermaEtapa("Calidad", "UNIDADES")
            const salidas = liberado === null || liberado === undefined ? null : liberado + (cuarentena || 0) + (destruccion || 0)
            filas.push({
                etapa: "Calidad", base: "UNIDADES", fechaDesde: null, fechaHasta: null, maquinas: "", entrada: multi ? null : entradaCal, procesado: null, equivalentes: null,
                salidaConforme: liberado, mermaConfirmada: m.conf, mermaEstimada: m.est, retenido: cuarentena, reproceso: null,
                destruccionQcs: destruccion,
                diferencia: multi || entradaCal === null || salidas === null ? null : entradaCal - salidas - m.conf - m.est,
                estado: liberado === null || liberado === undefined ? "Liberaciones QCS no disponibles" : "Confirmado (QCS: liberado, cuarentena y destrucción)"
            })
            const neto = it.despachado === null || it.despachado === undefined ? null : it.despachado - (it.devuelto || 0)
            filas.push({
                etapa: "Despacho", base: "UNIDADES", fechaDesde: null, fechaHasta: null, maquinas: "", entrada: liberado ?? null, procesado: null, equivalentes: null,
                salidaConforme: neto, mermaConfirmada: 0, mermaEstimada: 0, retenido: null, reproceso: null,
                diferencia: liberado === null || liberado === undefined || neto === null ? null : liberado - neto,
                diferenciaEsPendienteDespacho: true,
                estado: neto === null ? "Despachos SAP no disponibles" : "Confirmado (SAP: guías + facturas directas − devoluciones)"
            })
        }
        if (sinConvertir) advertencias.push(`${sinConvertir} merma(s) en otra unidad no se pudieron convertir (falta factor confirmado) y no entran al cálculo.`)
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
    function imprimirHtml(html) {
        const iframe = document.createElement("iframe")
        iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;"
        document.body.appendChild(iframe)
        iframe.contentDocument.open()
        iframe.contentDocument.write(html)
        iframe.contentDocument.close()
        setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print() }, 300)
        setTimeout(() => iframe.remove(), 120000)
    }

    function usuarioActual() {
        return sessionStorage.getItem("nombreUsuario") || sessionStorage.getItem("codigoUsuario") || "-"
    }

    return { ND, ETAPAS, esc, num, txt, fecha, fechaHora, send, nivel, puedeEditar, etapaDe, calidadDeNp, cargarNp, factorConfirmado, saldoBodega, balance, hoja, guardarLibro, stamp, modal, leerArchivoBase64, imprimirHtml, usuarioActual }
})()
