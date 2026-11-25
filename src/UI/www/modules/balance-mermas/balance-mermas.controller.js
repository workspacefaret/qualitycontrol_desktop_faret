if (!window.BalanceMermasController) {
  const C = window.CalidadNp
  const ND = C.ND
  const ESTADO_MERMA = { REGISTRADA: "Registrada", PENDIENTE_VALIDACION: "Pendiente de validación", VALIDADA: "Validada", CORREGIDA: "Corregida", ANULADA: "Anulada" }

  class BalanceMermasController {
    constructor() {
      this._click = null
      this._change = null
      this._carga = null
      this._mermas = []
      this._calidad = null
      this._dash = null
      this._seq = 0
    }

    async init() {
      this.bind()
      this.montarResumen()
    }

    // ── Dashboard de inicio: cifras agregadas por la API (nunca se descarga el historial al navegador) ──
    montarResumen() {
      const D = window.NpDash
      this._dash = D.montar(this.$("bmDash"), {
        p: "bm",
        periodo: true,
        buscar: { placeholder: "Consultar balance y mermas de una NP (Ej: 4007)", boton: "Consultar NP", onBuscar: np => { this.vista(true); this.$("bmNp").value = np; this.consultar() } },
        kpis: [
          { label: "Mermas registradas", icono: "lista" },
          { label: "Pendientes de validación", icono: "reloj", tono: "warn" },
          { label: "Mermas validadas", icono: "ok", tono: "ok" },
          { label: "Unidades confirmadas", icono: "balanza", tono: "ok" },
          { label: "NP pendientes de conciliación", icono: "alerta", tono: "warn" },
        ],
        charts: [
          { titulo: "Mermas por proceso", sub: "Cantidad registrada, sin anuladas (unidades y pliegos por separado)" },
          { titulo: "Evolución mensual", sub: "Cantidad de merma registrada por mes" },
        ],
        tabla: { titulo: "Mermas que requieren atención", sub: "Pendientes de validación, sin importar el período (las más antiguas primero)", cols: ["NP", "Ítem", "Proceso", "Fecha", "Cantidad", "Método", "Estado", ""], vacio: "No hay mermas pendientes de validación" },
        cargar: per => C.send("calidadNp.resumen", per),
        render: (d, h) => {
          const m = d.mermas || {}
          const est = m.porEstado || []
          const suma = (estados, campo, unidad) => est.filter(f => (!estados || estados.includes(f.estado)) && (!unidad || f.unidad === unidad)).reduce((a, f) => a + Number(f[campo] || 0), 0)
          const vivas = ["REGISTRADA", "PENDIENTE_VALIDACION", "VALIDADA", "CORREGIDA"]
          h.kpi(0, suma(vivas, "registros"), `${D.num(suma(vivas, "cantidad", "UNIDADES"))} un. · ${D.num(suma(vivas, "cantidad", "PLIEGOS"))} pliegos (sin confirmar)`)
          h.kpi(1, suma(["PENDIENTE_VALIDACION"], "registros"), "Esperan validación de Calidad")
          h.kpi(2, suma(["VALIDADA"], "registros"), "Validadas en el período")
          h.kpi(3, suma(["VALIDADA"], "cantidad", "UNIDADES"), `Validadas · más ${D.num(suma(["VALIDADA"], "cantidad", "PLIEGOS"))} pliegos`)
          const c = d.cierre?.porEstado || []
          h.kpi(4, c.filter(f => f.conciliacion !== "CONCILIADO").reduce((a, f) => a + Number(f.nps || 0), 0), "Según el cierre vigente de cada NP")
          const serie = (filas, clave, etiquetas) => ["UNIDADES", "PLIEGOS"].map((un, i) => ({ label: un === "UNIDADES" ? "Unidades" : "Pliegos", color: i ? D.COL.ambar : D.COL.azul, data: etiquetas.map(e => Number(filas.find(f => f[clave] === e && f.unidad === un)?.cantidad || 0)) })).filter(s => s.data.some(v => v > 0))
          const procs = [...new Set((m.porProceso || []).map(f => f.proceso))]
          h.grafico(0, "barh", procs, serie(m.porProceso || [], "proceso", procs))
          const meses = [...new Set((m.porMes || []).map(f => f.mes))]
          h.grafico(1, "bar", meses.map(D.mesTxt), serie(m.porMes || [], "mes", meses))
          h.filas((m.atencion || []).map(x => `<tr><td><b>${C.esc(x.np)}</b></td><td>${C.esc(C.txt(x.item))}</td><td>${C.esc(x.proceso)}</td><td>${C.fecha(x.fecha)}</td><td>${D.num(x.cantidad)} ${x.unidad === "PLIEGOS" ? "pliegos" : "un."}</td><td>${C.esc(x.metodo)}</td><td><span class="npd-badge warn">${C.esc(ESTADO_MERMA[x.estado] || x.estado)}</span></td><td><button class="btn-secondary" style="padding:2px 8px;" data-npd-np="${C.esc(x.np)}">Abrir NP</button></td></tr>`))
        },
      })
    }

    // Alterna entre el resumen y el detalle de una NP.
    vista(detalle) {
      this.$("bmDash").style.display = detalle ? "none" : ""
      this.$("bmVista").style.display = detalle ? "" : "none"
      this.$("btnBmResumen").style.display = detalle ? "" : "none"
      if (!detalle) this._dash?.recargar()
    }

    $(id) { return document.getElementById(id) }

    bind() {
      if (this._click) return
      this._click = e => {
        const id = e.target.id
        if (id === "btnBmConsultar") this.consultar()
        else if (id === "btnBmLimpiar") this.limpiar()
        else if (id === "btnBmResumen") { this.limpiar(); this.vista(false) }
        else if (id === "btnBmTabBalance") this.tab("balance")
        else if (id === "btnBmTabMermas") this.tab("mermas")
        else if (id === "btnBmExcelBalance") this.exportarBalance()
        else if (id === "btnBmPdfBalance") this.pdfBalance()
        else if (id === "btnBmExcelMermas") this.exportarMermas()
        else if (id === "btnBmNuevaMerma" || id === "btnBmNuevaMerma2") this.modalMerma()
        const det = e.target.closest?.("[data-bm-detalle]")
        if (det) this.verDetalle(det.dataset.bmDetalle)
        const fila = e.target.closest?.("[data-bm-merma]")
        if (fila) this.accionMerma(fila.dataset.bmMerma, Number(fila.dataset.id))
        const reg = e.target.closest?.("[data-bm-registrar]")
        if (reg) this.modalMerma({ proceso: reg.dataset.bmRegistrar })
      }
      this._change = e => {
        if (e.target.id === "bmAgrupar") this.renderAcumulado()
        if (e.target.id === "bmItem") this.refrescarItem()
      }
      document.addEventListener("click", this._click)
      document.addEventListener("change", this._change)
      this.$("bmNp")?.addEventListener("keydown", e => { if (e.key === "Enter") this.consultar() })
    }

    limpiar() {
      this.$("bmNp").value = ""
      this.$("bmItem").innerHTML = `<option value="">—</option>`
      this.$("bmResultado").style.display = "none"
      this.$("bmEstado").textContent = ""
      this._carga = null
      this._mermas = []
      this._sinMermas = false
    }

    tab(cual) {
      this.$("bmSecBalance").style.display = cual === "balance" ? "" : "none"
      this.$("bmSecMermas").style.display = cual === "mermas" ? "" : "none"
      this.$("btnBmTabBalance").className = cual === "balance" ? "btn-primary" : "btn-secondary"
      this.$("btnBmTabMermas").className = cual === "mermas" ? "btn-primary" : "btn-secondary"
    }

    item() { return this.$("bmItem").value ? Number(this.$("bmItem").value) : null }

    async consultar() {
      const np = this.$("bmNp").value.trim()
      if (!np) { this.$("bmEstado").textContent = "Indica una NP"; return }
      const id = ++this._seq
      this.$("bmEstado").textContent = "Consultando FPS, SAP, QCS y mermas registradas..."
      this.$("bmResultado").style.display = "none"
      let [carga, mer] = await Promise.all([C.cargarNp(np), C.send("calidadNp.mermas.list", { np })])
      if (carga.np !== String(np)) mer = await C.send("calidadNp.mermas.list", { np: carga.np }) // número escrito = OT / NP Faret
      if (id !== this._seq) return
      this._carga = carga
      this._mermas = mer.ok ? mer.data || [] : []
      this._sinMermas = !mer.ok
      this._certificados = await this.consultarCertificados(carga.np)
      if (id !== this._seq) return
      this._calidad = null
      const items = carga.data?.items || []
      const sel = this.$("bmItem")
      const previo = sel.value
      sel.innerHTML = items.length
        ? items.map(i => `<option value="${i.item}">${C.esc(i.item)} — ${C.esc(i.itemCode || "")} ${C.esc(i.descripcion || "")}</option>`).join("")
        : `<option value="">${items.length === 0 && !carga.data ? "SAP no disponible" : "Sin ítems"}</option>`
      if (previo && [...sel.options].some(o => o.value === previo)) sel.value = previo
      const avisos = []
      if (!carga.data) avisos.push(`Fuente FPS/SAP no disponible: ${carga.error || "sin respuesta"}.`)
      if (!mer.ok) avisos.push(`Mermas: ${mer.error}`)
      if (carga.resolucion?.avisos?.length && carga.data) avisos.push(carga.resolucion.avisos[0])
      this.$("bmEstado").textContent = avisos.join(" ") || `NP ${carga.np} consultada ${carga.consultadoEn.toLocaleString("es-CL")}`
      this.$("bmResultado").style.display = ""
      this.refrescarItem()
    }

    // null = no disponible o sin permiso sobre el módulo de origen (nunca equivale a "sin certificados").
    async consultarCertificados(np) {
      if (window.App?.nivelModulo && window.App.nivelModulo("certificados-destruccion") === "SIN_ACCESO") return { estado: "SIN_PERMISO", items: null }
      const r = await C.send("calidadNp.certificados.list", { np })
      return r.ok && Array.isArray(r.data) ? { estado: "OK", items: r.data.filter(c => String(c.np) === String(np)) } : { estado: "ERROR", items: null }
    }

    // Filas [certificado, ítem, cantidad, motivo, estado, ejecución] del ítem seleccionado (o sin ítem asignado).
    certificadosDelItem() {
      const lista = this._certificados?.items
      if (!lista) return null
      const it = this.item()
      return lista.filter(c => it === null || c.item === null || c.item === undefined || Number(c.item) === it)
        .map(c => [c.correlativo || `Borrador #${c.id}`, C.txt(c.item), C.num(Number(c.cantidadDestruir)), C.txt(c.motivo), C.txt(c.estado), c.ejecutada ? (c.cantidadEjecutada === null || c.cantidadEjecutada === undefined ? "Confirmada (cantidad no registrada)" : `Confirmada: ${C.num(Number(c.cantidadEjecutada))}`) : "No confirmada"])
    }

    motivoSinCertificados() {
      return this._certificados?.estado === "SIN_PERMISO" ? "Sin permiso sobre Certificados de destrucción" : ND
    }

    tablaCertificadosHtml() {
      const filas = this.certificadosDelItem()
      if (filas === null) return `<tr><td colspan="6">${C.esc(this.motivoSinCertificados())}</td></tr>`
      return filas.map(f => `<tr>${f.map(v => `<td>${C.esc(v)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="6">Sin certificados de destrucción para este ítem</td></tr>`
    }

    refrescarItem() {
      this.renderBalance()
      const cert = this.$("bmCertBody")
      if (cert) cert.innerHTML = this.tablaCertificadosHtml()
      this.renderMermas()
    }

    mermasDelItem() {
      const it = this.item()
      return this._mermas.filter(m => it === null || m.item === null || m.item === undefined || Number(m.item) === it)
    }

    // ── Balance ──────────────────────────────────────────────────────────────

    calcularBalance() {
      return C.balance({ carga: this._carga, item: this.item(), mermas: this._sinMermas ? null : this._mermas })
    }

    renderBalance() {
      const b = this.calcularBalance()
      this._balance = b
      this.$("bmAdvertencias").innerHTML = `<b>Advertencias</b><ul style="margin:4px 0 0 18px;">${b.advertencias.map(a => `<li>${C.esc(a)}</li>`).join("")}</ul>`
      const celda = v => (v === null || v === undefined ? `<span class="subtitle">${ND}</span>` : C.num(v))
      this.$("bmBalanceBody").innerHTML = b.filas.length ? b.filas.map(f => {
        const rango = f.fechaDesde ? (f.fechaHasta && f.fechaHasta !== f.fechaDesde ? `${C.fecha(f.fechaDesde)} – ${C.fecha(f.fechaHasta)}` : C.fecha(f.fechaDesde)) : "-"
        const dif = f.diferencia === null || f.diferencia === undefined ? `<span class="subtitle">No calculable</span>`
          : f.diferenciaEsPendienteDespacho ? `${C.num(f.diferencia)} <span class="subtitle">pendiente de despacho (no es merma)</span>`
          : f.diferencia > 0 ? `<b style="color:#b45309;">${C.num(f.diferencia)}</b> <span class="subtitle">POR CONCILIAR</span>`
          : f.diferencia < 0 ? `<b style="color:#b91c1c;">${C.num(f.diferencia)}</b> <span class="subtitle">excede la entrada: revisar</span>` : "0"
        const unidad = f.base ? ` <span class="subtitle">${f.base === "PLIEGOS" ? "pliegos" : "unid."}</span>` : ""
        return `<tr>
          <td><b>${C.esc(f.etapa)}</b>${unidad}</td><td>${rango}</td><td>${C.esc(C.txt(f.maquinas))}</td><td>${celda(f.entrada)}</td><td>${celda(f.procesado)}</td>
          <td>${celda(f.equivalentes)}</td><td>${celda(f.salidaConforme)}</td><td>${C.esc(this.mermaTexto(f.mermaConfirmada, f.mermaConfirmadaSinConvertir))}</td><td>${C.esc(this.mermaTexto(f.mermaEstimada, f.mermaEstimadaSinConvertir))}</td>
          <td>${celda(f.retenido)}</td><td><span class="subtitle">${ND}</span></td><td>${dif}</td><td>${C.esc(f.estado)}</td>
          <td style="white-space:nowrap;"><button class="btn-secondary" style="padding:2px 8px;" data-bm-detalle="${C.esc(f.etapa)}">Ver detalle</button> ${f.etapa !== "Despacho" ? `<button class="btn-secondary" style="padding:2px 8px;" data-bm-registrar="${C.esc(f.etapa)}" data-requiere-editar>Registrar merma</button>` : ""}</td></tr>`
      }).join("") : `<tr><td colspan="14" style="text-align:center;">Sin datos de procesos para esta NP</td></tr>`
    }

    // Una merma en otra unidad (sin factor confirmado) se nombra: la fila no puede decir que es cero.
    mermaTexto(valor, sinConvertir) {
      const C = window.CalidadNp
      if (!sinConvertir) return C.num(valor)
      return `${valor ? C.num(valor) + " + " : ""}${sinConvertir} sin convertir`
    }

    // Registros de origen de una fila del balance. null = la fuente no está disponible.
    detalleEtapa(etapa) {
      const f = (this._balance?.filas || []).find(x => x.etapa === etapa)
      const d = this._carga?.data
      if (!f || !d) return null
      const items = d.items || []
      const it = items.find(i => Number(i.item) === Number(this._balance.item)) || null
      if (etapa === "Calidad") {
        const lib = d.liberaciones && it ? d.liberaciones.filter(l => String(l.Item) === String(it.item) && String(l.ItemCode) === String(it.itemCode)) : null
        return { titulo: "Folios de liberación QCS del ítem", columnas: ["Folio", "Fecha", "Cantidad", "Bodega origen", "Bodega destino", "Inspector"],
          filas: lib && lib.map(l => [l.Folio, C.txt(l.Fecha), C.num(l.Cantidad), C.txt(l.BodegaOrigen), C.txt(l.BodegaDestino), C.txt(l.Inspector)]), mermas: f.mermasEtapa || [] }
      }
      if (etapa === "Despacho") {
        const lineas = new Set((d.notaVenta || []).filter(l => it && String(l.Item) === String(it.item)).map(l => Number(l.LineNum)))
        const docs = d.documentos && it ? d.documentos.filter(x => x.LineaNv !== null && x.LineaNv !== undefined && lineas.has(Number(x.LineaNv))) : null
        return { titulo: "Documentos SAP de las líneas del ítem (no todos suman al despachado)", columnas: ["Tipo", "Número", "Fecha", "Cantidad", "Efecto"],
          filas: docs && docs.map(x => [x.Tipo, x.DocNum, C.txt(x.DocDate), C.num(Number(x.Cantidad)), this.efectoDocumento(x)]), mermas: [] }
      }
      return { titulo: "Corridas válidas de FPS que suman en la etapa", columnas: ["Inicio", "Término", "Máquina", "Operador", "Cantidad (FPS)", "Corrida"],
        filas: (f.corridas || []).map(s => [C.fechaHora(s.ProductionStartDate || s.SetupStartDate), s.ProductionEndDate ? C.fechaHora(s.ProductionEndDate) : "Abierta", C.txt(s.Maquina), C.txt(s.Operador), C.num(s.ProductionQuantity), s.RecordKey]),
        mermas: this._sinMermas ? null : f.mermasEtapa || [] }
    }

    efectoDocumento(x) {
      if (x.Tipo === "GUIA") return "Suma"
      if (x.Tipo === "DEVOLUCION") return "Resta"
      if (x.Tipo === "NOTA_CREDITO") return Number(x.RepusoStock) === 1 ? "Resta (reingresó stock en SAP)" : "No mueve stock"
      return x.Origen === "DIRECTA" ? "Suma" : "No suma (reserva o factura de guía)"
    }

    verDetalle(etapa) {
      const d = this.detalleEtapa(etapa)
      if (!d) return
      const tabla = (cols, filas, vacio) => `<div class="table-container"><table class="table"><thead><tr>${cols.map(c => `<th>${C.esc(c)}</th>`).join("")}</tr></thead><tbody>${filas === null ? `<tr><td colspan="${cols.length}">${ND}</td></tr>` : !filas.length ? `<tr><td colspan="${cols.length}">${vacio}</td></tr>` : filas.map(f => `<tr>${f.map(v => `<td>${C.esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      C.modal("bmDetalle", `Detalle de ${etapa}`, `<p class="subtitle">${C.esc(d.titulo)}</p>${tabla(d.columnas, d.filas, "Sin registros")}
        <p class="subtitle" style="margin-top:8px;">Mermas registradas en la etapa</p>${tabla(["N°", "Fecha", "Defecto", "Cantidad", "Unidad", "Certeza", "Estado"], d.mermas && d.mermas.map(m => [m.id ?? "-", C.fecha(m.fecha), C.txt(m.defecto), C.num(Number(m.cantidad)), m.unidad, m.metodo, m.estado]), "Sin mermas registradas")}`, "", null, 920)
    }

    pdfBalance() {
      const b = this._balance
      if (!b) return
      const e = C.esc
      const v = x => (x === null || x === undefined ? ND : C.num(x))
      const filas = b.filas.map(f => `<tr><td>${e(f.etapa)}</td><td>${f.base ? (f.base === "PLIEGOS" ? "pliegos" : "unid.") : "-"}</td><td>${v(f.entrada)}</td><td>${v(f.procesado)}</td><td>${v(f.salidaConforme)}</td><td>${e(this.mermaTexto(f.mermaConfirmada, f.mermaConfirmadaSinConvertir))}</td><td>${e(this.mermaTexto(f.mermaEstimada, f.mermaEstimadaSinConvertir))}</td><td>${v(f.retenido)}</td><td>${f.diferencia === null || f.diferencia === undefined ? "No calculable" : C.num(f.diferencia) + (f.diferenciaEsPendienteDespacho ? " (pendiente de despacho)" : "")}</td><td>${e(f.estado)}</td></tr>`).join("") || `<tr><td colspan="10">Sin datos de procesos</td></tr>`
      const mermas = this.mermasDelItem().filter(m => m.estado !== "ANULADA").map(m => `<tr><td>${e(C.fecha(m.fecha))}</td><td>${e(m.proceso)}</td><td>${e(C.txt(m.defecto))}</td><td>${C.num(Number(m.cantidad))} ${e(String(m.unidad).toLowerCase())}</td><td>${e(m.metodo)}</td><td>${e(m.estado)}</td></tr>`).join("") || `<tr><td colspan="6">${this._sinMermas ? "Mermas no disponibles: no se pudieron consultar" : "Sin mermas registradas (no equivale a merma cero)"}</td></tr>`
      C.imprimirHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Balance NP ${e(this._carga.np)}</title><style>
        @page{size:landscape}body{font-family:Arial,sans-serif;font-size:10px;margin:14px;color:#111}h1{font-size:16px;margin:0}h2{font-size:12px;margin:12px 0 4px}
        table{width:100%;border-collapse:collapse}th,td{border:1px solid #94a3b8;padding:3px 4px;text-align:left}th{background:#e2e8f0}</style></head><body>
        <h1>INNPACK — BALANCE PROVISIONAL de materiales · NP ${e(this._carga.np)} · ítem ${e(b.item ?? "-")}</h1>
        <p>Emitido: ${e(new Date().toLocaleString("es-CL"))} · ${e(C.usuarioActual())}. Una diferencia por conciliar no es merma ni destrucción.</p>
        <table><thead><tr><th>Etapa</th><th>Unidad</th><th>Entrada (est.)</th><th>Procesado</th><th>Salida conforme</th><th>Merma conf.</th><th>Merma est.</th><th>Retenido</th><th>Diferencia</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table>
        <h2>Mermas registradas</h2><table><thead><tr><th>Fecha</th><th>Proceso</th><th>Defecto</th><th>Cantidad</th><th>Certeza</th><th>Estado</th></tr></thead><tbody>${mermas}</tbody></table>
        <h2>Certificados de destrucción (respaldo, no se restan de las etapas)</h2><table><thead><tr><th>Certificado</th><th>Ítem</th><th>Cantidad</th><th>Motivo</th><th>Estado documental</th><th>Destrucción física</th></tr></thead><tbody>${this.tablaCertificadosHtml()}</tbody></table>
        <h2>Advertencias</h2><ul>${b.advertencias.map(a => `<li>${e(a)}</li>`).join("")}</ul></body></html>`)
    }

    exportarBalance() {
      const b = this._balance
      if (!b) return
      const wb = XLSX.utils.book_new()
      const x = v => (v === null || v === undefined ? ND : v)
      C.hoja(wb, "Balance", `Balance PROVISIONAL NP ${this._carga.np} ítem ${b.item ?? "-"} — ${C.fechaHora(new Date())}`,
        ["Proceso", "Unidad", "Desde", "Hasta", "Máquina", "Entrada (estimada)", "Procesado (FPS)", "Unid. equivalentes", "Salida conforme", "Merma confirmada", "Merma estimada", "Material retenido", "En reproceso", "Diferencia por conciliar", "Estado del registro"],
        b.filas.map(f => [f.etapa, f.base || "-", C.fecha(f.fechaDesde), C.fecha(f.fechaHasta), f.maquinas, x(f.entrada), x(f.procesado), x(f.equivalentes), x(f.salidaConforme), f.mermaConfirmadaSinConvertir ? this.mermaTexto(f.mermaConfirmada, f.mermaConfirmadaSinConvertir) : x(f.mermaConfirmada), f.mermaEstimadaSinConvertir ? this.mermaTexto(f.mermaEstimada, f.mermaEstimadaSinConvertir) : x(f.mermaEstimada), x(f.retenido), ND, x(f.diferencia), f.estado]))
      C.hoja(wb, "Certificados", "Certificados de destrucción (no se restan de las etapas)", ["Certificado", "Ítem", "Cantidad", "Motivo", "Estado documental", "Destrucción física"],
        this.certificadosDelItem() ?? [[this.motivoSinCertificados()]])
      C.hoja(wb, "Advertencias", "Advertencias del balance", ["Advertencia"], b.advertencias.map(a => [a]))
      C.guardarLibro(wb, `Balance_NP_${this._carga.np}_${C.stamp()}.xlsx`)
    }

    // ── Mermas ───────────────────────────────────────────────────────────────

    renderMermas() {
      const lista = this.mermasDelItem()
      const act = lista.filter(m => m.estado !== "ANULADA")
      const suma = (arr, f) => (this._sinMermas ? ND : C.sumaPorUnidad(arr.filter(f), m => m.unidad, m => m.cantidad))
      const conf = m => m.metodo !== "ESTIMADA"
      const cal = (this._balance?.filas || []).find(f => f.etapa === "Calidad")
      const difTotal = C.sumaPorUnidad((this._balance?.filas || []).filter(f => !f.diferenciaEsPendienteDespacho && f.diferencia > 0), f => f.base, f => f.diferencia)
      const tarj = (label, valor, nota) => `<div class="kpi-card"><div class="kpi-label">${label}</div><div class="kpi-value">${valor}</div><div class="subtitle">${nota}</div></div>`
      this.$("bmKpis").innerHTML =
        tarj("Merma confirmada", suma(act, conf), "contada o medida, separada por unidad") +
        tarj("Merma estimada", suma(act, m => !conf(m)), "estimaciones: no son confirmadas") +
        tarj("Cantidad retenida", cal && cal.retenido !== null ? C.num(cal.retenido) : ND, "cuarentena en QCS") +
        tarj("Diferencia no conciliada", this._balance?.filas.length ? difTotal : ND, "suma de diferencias positivas del balance (provisional)")
      this.$("bmMermasBody").innerHTML = lista.length ? lista.map(m => {
        const acc = []
        if (m.estado !== "ANULADA") {
          acc.push(`<button class="btn-secondary" style="padding:2px 8px;" data-bm-merma="corregir" data-id="${m.id}" data-requiere-editar>Corregir</button>`)
          if (m.estado !== "VALIDADA") {
            if (m.estado !== "PENDIENTE_VALIDACION") acc.push(`<button class="btn-secondary" style="padding:2px 8px;" data-bm-merma="pendiente" data-id="${m.id}" data-requiere-editar>Pedir validación</button>`)
            acc.push(`<button class="btn-secondary" style="padding:2px 8px;" data-bm-merma="validar" data-id="${m.id}" data-requiere-editar>Validar</button>`)
          }
          acc.push(`<button class="btn-secondary" style="padding:2px 8px;" data-bm-merma="anular" data-id="${m.id}" data-requiere-editar>Anular</button>`)
        }
        if (m.tieneEvidencia) acc.push(`<button class="btn-secondary" style="padding:2px 8px;" data-bm-merma="evidencia" data-id="${m.id}">Evidencia</button>`)
        const corr = Number(m.cantidadInicial) !== Number(m.cantidad) ? ` <span class="subtitle">(inicial ${C.num(m.cantidadInicial)})</span>` : ""
        const comp = Number(m.comprometidoDestruccion) > 0 ? `<div class="subtitle">${C.num(m.comprometidoDestruccion)} en certificados de destrucción${m.certificados ? ` (${C.esc(m.certificados)})` : ""}${Number(m.destruidoConfirmado) > 0 ? ` · destrucción confirmada ${C.num(m.destruidoConfirmado)}` : ""}</div>` : ""
        return `<tr${m.estado === "ANULADA" ? ' style="opacity:.55;"' : ""}><td>${m.id}</td><td>${C.fecha(m.fecha)}</td><td>${C.esc(m.proceso)}</td><td>${C.esc(C.txt(m.maquina))}</td>
          <td>${C.esc(C.txt(m.turno))}</td><td>${C.esc(C.txt(m.defecto))}${m.defectoOrigen ? `<div class="subtitle">vinculado: ${C.esc(m.defectoOrigen)}</div>` : ""}</td>
          <td>${C.num(m.cantidad)}${corr}${comp}</td><td>${C.esc(m.unidad)}${m.pallet ? ` <span class="subtitle">pallet ${C.esc(m.pallet)}</span>` : ""}</td>
          <td>${C.esc(m.metodo)}</td><td>${C.esc(ESTADO_MERMA[m.estado] || m.estado)}${m.motivoAnulacion ? `<div class="subtitle">${C.esc(m.motivoAnulacion)}</div>` : ""}</td>
          <td>${C.esc(m.creadoPor)}<div class="subtitle">${C.fechaHora(m.fechaCreacion)}</div></td><td style="white-space:nowrap;">${acc.join(" ")}</td></tr>`
      }).join("") : `<tr><td colspan="12" style="text-align:center;">${this._sinMermas ? "Mermas no disponibles: no se pudieron consultar (no equivale a que no existan)" : "Sin mermas registradas para esta NP/ítem"}</td></tr>`
      this.renderAcumulado()
    }

    renderAcumulado() {
      const por = this.$("bmAgrupar").value
      const clave = m => ({ proceso: m.proceso, defecto: m.defecto, fecha: m.fecha, maquina: m.maquina, turno: m.turno }[por] || "")
      const g = new Map()
      for (const m of this.mermasDelItem().filter(x => x.estado !== "ANULADA")) {
        const k = C.txt(clave(m))
        const e = g.get(k) || { conf: {}, est: {}, n: 0 }
        const dest = m.metodo === "ESTIMADA" ? e.est : e.conf
        dest[m.unidad] = (dest[m.unidad] || 0) + Number(m.cantidad)
        e.n++
        g.set(k, e)
      }
      const fmt = o => (Object.keys(o).length ? Object.entries(o).map(([u, v]) => `${C.num(v)} ${u === "PLIEGOS" ? "pliegos" : "unid."}`).join(" + ") : "-")
      this.$("bmAcumBody").innerHTML = g.size
        ? [...g.entries()].sort().map(([k, e]) => `<tr><td>${C.esc(por === "fecha" && k !== "-" ? C.fecha(k) : k)}</td><td>${fmt(e.conf)}</td><td>${fmt(e.est)}</td><td>${e.n}</td></tr>`).join("")
        : `<tr><td colspan="4" style="text-align:center;">${this._sinMermas ? ND : "Sin mermas"}</td></tr>`
    }

    exportarMermas() {
      if (!this._carga) return
      if (this._sinMermas) { alert("Las mermas no se pudieron consultar: no se exporta un archivo vacío."); return }
      const wb = XLSX.utils.book_new()
      C.hoja(wb, "Mermas", `Mermas NP ${this._carga.np} — ${C.fechaHora(new Date())}`,
        ["Id", "Ítem", "Fecha", "Proceso", "Máquina", "Turno", "Corrida", "Defecto", "Inspección vinculada", "Cantidad", "Cantidad inicial", "Unidad", "Pallet", "Método", "Estado", "Motivo anulación", "Registró", "Fecha registro", "Código SAP", "En certificados de destrucción", "Certificados", "Destrucción confirmada"],
        this._mermas.map(m => [m.id, m.item ?? "-", C.fecha(m.fecha), m.proceso, C.txt(m.maquina), C.txt(m.turno), C.txt(m.corrida), C.txt(m.defecto), C.txt(m.defectoOrigen), m.cantidad, m.cantidadInicial, m.unidad, C.txt(m.pallet), m.metodo, m.estado, C.txt(m.motivoAnulacion), m.creadoPor, C.fechaHora(m.fechaCreacion), C.txt(m.itemCode), m.comprometidoDestruccion ?? ND, C.txt(m.certificados), m.destruidoConfirmado ?? ND]))
      C.guardarLibro(wb, `Mermas_NP_${this._carga.np}_${C.stamp()}.xlsx`)
    }

    // ── Acciones sobre una merma ─────────────────────────────────────────────

    async recargarMermas() {
      const r = await C.send("calidadNp.mermas.list", { np: this._carga.np })
      if (r.ok) { this._mermas = r.data || []; this._sinMermas = false }
      this.refrescarItem()
    }

    async accionMerma(accion, id) {
      const m = this._mermas.find(x => x.id === id)
      if (!m) return
      if (accion === "evidencia") {
        const r = await C.send("calidadNp.mermas.evidencia", { id })
        if (!r.ok) alert(r.error)
      } else if (accion === "pendiente" || accion === "validar") {
        const r = await C.send(accion === "validar" ? "calidadNp.mermas.validar" : "calidadNp.mermas.pendienteValidacion", { id })
        if (!r.ok) alert(r.error)
        await this.recargarMermas()
      } else if (accion === "corregir") {
        C.modal("bmModal", `Corregir merma #${id}`,
          `<p class="subtitle">Cantidad actual ${C.num(m.cantidad)} ${C.esc(m.unidad)} (inicial ${C.num(m.cantidadInicial)}). La corrección queda auditada y exige justificación.</p>
           <div class="form-group"><label>Cantidad corregida</label><input type="number" min="0" step="any" id="bmCorrCant" value="${m.cantidad}"></div>
           <div class="form-group"><label>Justificación del cambio *</label><textarea id="bmCorrJust" rows="3" style="width:100%"></textarea></div>`,
          "Guardar corrección", async ov => {
            const cantidad = Number(ov.querySelector("#bmCorrCant").value)
            const justificacion = ov.querySelector("#bmCorrJust").value.trim()
            if (!Number.isFinite(cantidad) || cantidad < 0) return "Indica una cantidad válida"
            if (!justificacion) return "La justificación es obligatoria"
            const r = await C.send("calidadNp.mermas.corregir", { id, cantidad, justificacion })
            if (!r.ok) return r.error
            await this.recargarMermas()
          }, 520)
      } else if (accion === "anular") {
        C.modal("bmModal", `Anular merma #${id}`,
          `<p class="subtitle">El registro se conserva en el historial; no se borra.</p>
           <div class="form-group"><label>Motivo de anulación *</label><textarea id="bmAnuMotivo" rows="3" style="width:100%"></textarea></div>`,
          "Anular merma", async ov => {
            const motivo = ov.querySelector("#bmAnuMotivo").value.trim()
            if (!motivo) return "El motivo es obligatorio"
            const r = await C.send("calidadNp.mermas.anular", { id, motivo })
            if (!r.ok) return r.error
            await this.recargarMermas()
          }, 520)
      }
    }

    // ── Nueva merma ──────────────────────────────────────────────────────────

    async modalMerma(pre = {}) {
      if (!this._carga) return
      const d = this._carga.data
      const items = d?.items || []
      const maquinas = [...new Set((d?.procesos || []).flatMap(p => p.maquinas || []))]
      const corridas = (d?.sesiones || []).filter(s => Number(s.Status) === 1)
      const opt = (v, t, sel) => `<option value="${C.esc(v)}"${sel ? " selected" : ""}>${C.esc(t)}</option>`
      const proc = C.ETAPAS.filter(e => e !== "Despacho")
      const hoy = C.hoyLocal()
      const cuerpo = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>NP</label><input type="text" value="${C.esc(this._carga.np)}" disabled></div>
          <div class="form-group"><label>Ítem</label><select id="bmfItem">${items.length ? items.map(i => opt(i.item, `${i.item} — ${i.itemCode || ""}`, Number(i.item) === this.item())).join("") : opt("", "Sin ítems (SAP no disponible)")}</select></div>
          <div class="form-group"><label>Proceso *</label><select id="bmfProceso">${proc.map(p => opt(p, p, p === pre.proceso)).join("")}</select></div>
          <div class="form-group"><label>Fecha *</label><input type="date" id="bmfFecha" value="${hoy}"></div>
          <div class="form-group"><label>Turno</label><input type="text" id="bmfTurno" list="bmfTurnos" placeholder="Ej: Día"><datalist id="bmfTurnos"><option value="Día"><option value="Tarde"><option value="Noche"></datalist></div>
          <div class="form-group"><label>Máquina</label><input type="text" id="bmfMaquina" list="bmfMaquinas"><datalist id="bmfMaquinas">${maquinas.map(m => `<option value="${C.esc(m)}">`).join("")}</datalist></div>
          <div class="form-group"><label>Corrida (FPS)</label><select id="bmfCorrida"><option value="">—</option>${corridas.map(s => opt(String(s.RecordKey), `${C.fecha(s.ProductionStartDate || s.SetupStartDate)} ${s.Maquina || ""} (${C.num(s.ProductionQuantity)})`)).join("")}</select></div>
          <div class="form-group"><label>Defecto</label><input type="text" id="bmfDefecto" placeholder="Describe o vincula un defecto existente"></div>
          <div class="form-group"><label>Cantidad *</label><input type="number" min="0" step="any" id="bmfCantidad"></div>
          <div class="form-group"><label>Unidad *</label><select id="bmfUnidad">${opt("UNIDADES", "Unidades")}${opt("PLIEGOS", "Pliegos")}</select></div>
          <div class="form-group"><label>Pallet</label><select id="bmfPallet"><option value="">—</option>${opt("ROJO", "Rojo")}${opt("AZUL", "Azul")}${opt("UNIDADES", "Unidades")}</select></div>
          <div class="form-group"><label>Evidencia (foto, máx. 10 MB)</label><input type="file" id="bmfEvidencia" accept=".pdf,.jpg,.jpeg,.png,.webp"></div>
        </div>
        <div class="form-group"><label>Método de cuantificación *</label>
          <label><input type="radio" name="bmfMetodo" value="CONTADA"> Contada</label> &nbsp;
          <label><input type="radio" name="bmfMetodo" value="MEDIDA"> Medida</label> &nbsp;
          <label><input type="radio" name="bmfMetodo" value="ESTIMADA" checked> Estimada</label></div>
        <div class="form-group"><label>Observaciones</label><textarea id="bmfObs" rows="2" style="width:100%"></textarea></div>
        <div style="display:flex;gap:8px;align-items:center;"><button class="btn-secondary" id="bmfVincular" type="button">Vincular defecto existente</button><span id="bmfVinculado" class="subtitle">Sin vincular</span></div>
        <p class="subtitle">La frecuencia de un defecto no es una cantidad: si la inspección solo registra su presencia, ingresa tú la cantidad afectada.</p>`
      let origen = null
      const ov = C.modal("bmModalMerma", "Registro de merma", cuerpo, "Guardar", async o => {
        const metodo = o.querySelector('input[name="bmfMetodo"]:checked')?.value
        const cantidad = o.querySelector("#bmfCantidad").value
        if (cantidad === "" || !Number.isFinite(Number(cantidad)) || Number(cantidad) < 0) return "Indica una cantidad válida (0 o más)"
        if (!o.querySelector("#bmfFecha").value) return "Indica la fecha"
        const itSap = items.filter(i => String(i.item) === o.querySelector("#bmfItem").value)
        const body = {
          ...(itSap.length === 1 ? C.itemSap(this._carga, itSap[0]) : {}),
          np: this._carga.np, item: o.querySelector("#bmfItem").value ? Number(o.querySelector("#bmfItem").value) : null, proceso: o.querySelector("#bmfProceso").value,
          fecha: o.querySelector("#bmfFecha").value, turno: o.querySelector("#bmfTurno").value.trim(), maquina: o.querySelector("#bmfMaquina").value.trim(),
          corrida: o.querySelector("#bmfCorrida").value, defecto: o.querySelector("#bmfDefecto").value.trim(), defectoOrigen: origen || "",
          cantidad: Number(cantidad), unidad: o.querySelector("#bmfUnidad").value, pallet: o.querySelector("#bmfPallet").value, metodo,
          observaciones: o.querySelector("#bmfObs").value.trim()
        }
        const file = o.querySelector("#bmfEvidencia").files[0]
        if (file) {
          if (file.size > 10 * 1024 * 1024) return "La evidencia excede 10 MB"
          body.evidenciaNombre = file.name
          body.evidenciaMime = file.type
          body.evidenciaBase64 = await C.leerArchivoBase64(file)
        }
        const r = await C.send("calidadNp.mermas.crear", body)
        if (!r.ok) return r.error
        await this.recargarMermas()
        this.tab("mermas")
      })
      // La corrida de FPS ya trae su máquina: se copia sin pisar lo que haya escrito el usuario.
      let maquinaCopiada = ""
      ov.querySelector("#bmfCorrida").onchange = e => {
        const campo = ov.querySelector("#bmfMaquina")
        if (campo.value && campo.value !== maquinaCopiada) return
        maquinaCopiada = corridas.find(s => String(s.RecordKey) === e.target.value)?.Maquina || ""
        campo.value = maquinaCopiada
      }
      ov.querySelector("#bmfVincular").onclick = () => this.modalVincular(ov, v => {
        origen = v.origen
        ov.querySelector("#bmfDefecto").value = v.defecto
        if (v.proceso) ov.querySelector("#bmfProceso").value = v.proceso
        if (v.fecha) ov.querySelector("#bmfFecha").value = v.fecha
        if (v.maquina) ov.querySelector("#bmfMaquina").value = v.maquina
        if (v.turno) ov.querySelector("#bmfTurno").value = v.turno
        ov.querySelector("#bmfVinculado").textContent = `Vinculado a ${v.origen}`
      })
    }

    // Lista los registros de inspección de la NP (Calidad) para vincular uno: no se crea un defecto nuevo.
    async modalVincular(padre, alElegir) {
      if (!this._calidad) this._calidad = await C.calidadDeNp(this._carga.np)
      const usados = new Set(this._mermas.filter(m => m.estado !== "ANULADA" && m.defectoOrigen).map(m => m.defectoOrigen))
      const etapa = padre.querySelector("#bmfProceso").value
      const itemSel = (this._carga.data?.items || []).find(i => Number(i.item) === this.item())
      const regs = [
        ...this._calidad.registros.items.map(r => ({ origen: `REGISTRO_CONTROL:${r.id}`, fecha: String(r.fechaRegistro || "").slice(0, 10), proceso: r.proceso, maquina: r.maquina, turno: r.turno, codigo: r.codigoProducto, defecto: r.tipoDefecto || r.observacion || r.estado, estado: r.estado, tipo: "Registro de control" })),
        ...this._calidad.productoTerminado.items.map(r => ({ origen: `PRODUCTO_TERMINADO:${r.id}`, fecha: String(r.fechaRegistro || "").slice(0, 10), proceso: r.proceso, maquina: r.maquina, turno: "", codigo: r.codigoProducto, defecto: r.resultado, estado: r.resultado, tipo: "Producto terminado" }))
      ].filter(r => (!itemSel || !r.codigo || r.codigo === itemSel.itemCode) && (C.etapaDe(r.proceso) === etapa || etapa === "Otro" || C.etapaDe(r.proceso) === "Otro"))
      const estadoLista = this._calidad.registros.estado !== "OK" ? `<p class="subtitle">Registros de control: ${C.esc(this._calidad.registros.estado)} ${C.esc(this._calidad.registros.error || "")}</p>` : ""
      const cuerpo = `${estadoLista}<p class="subtitle">Registros de la NP para el proceso ${C.esc(etapa)}. Los ya vinculados a otra merma no se muestran.</p>
        <div class="table-container"><table class="table"><thead><tr><th></th><th>Origen</th><th>Fecha</th><th>Proceso</th><th>Máquina</th><th>Defecto / estado</th></tr></thead><tbody>
        ${regs.filter(r => !usados.has(r.origen)).map((r, i) => `<tr><td><input type="radio" name="bmvReg" value="${i}"></td><td>${C.esc(r.tipo)} #${C.esc(r.origen.split(":")[1])}</td><td>${C.fecha(r.fecha)}</td><td>${C.esc(C.txt(r.proceso))}</td><td>${C.esc(C.txt(r.maquina))}</td><td>${C.esc(C.txt(r.defecto))}</td></tr>`).join("") || `<tr><td colspan="6" style="text-align:center;">Sin registros disponibles para vincular</td></tr>`}
        </tbody></table></div>`
      const disponibles = regs.filter(r => !usados.has(r.origen))
      C.modal("bmModalVinc", "Vincular defecto existente", cuerpo, "Vincular", async o => {
        const sel = o.querySelector('input[name="bmvReg"]:checked')
        if (!sel) return "Selecciona un registro"
        const r = disponibles[Number(sel.value)]
        alElegir({ origen: r.origen, defecto: r.defecto || "", proceso: C.ETAPAS.includes(C.etapaDe(r.proceso)) && C.etapaDe(r.proceso) !== "Otro" ? C.etapaDe(r.proceso) : null, fecha: r.fecha, maquina: r.maquina, turno: r.turno })
      }, 820)
    }

    destroy() {
      document.getElementById("bmDetalle")?.remove()
      if (this._click) document.removeEventListener("click", this._click)
      if (this._change) document.removeEventListener("change", this._change)
      this._click = null
      this._change = null
      this._dash?.destruir()
      document.getElementById("bmModal")?.remove()
      document.getElementById("bmModalMerma")?.remove()
      document.getElementById("bmModalVinc")?.remove()
    }
  }

  window.BalanceMermasController = BalanceMermasController
}
