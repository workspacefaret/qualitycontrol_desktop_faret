if (!window.CierreNpController) {
  const C = window.CalidadNp
  const ND = C.ND
  const CONCILIACION = { CONCILIADO: "Conciliado", PENDIENTE: "Diferencia pendiente", NO_CALCULABLE: "No calculable" }
  const ESTADO_AREA = { PENDIENTE: "Pendiente", CONFORME: "Conforme", OBSERVADO: "Observado", NO_APLICA: "No aplica" }

  class CierreNpController {
    constructor() {
      this._click = null
      this._input = null
      this._carga = null
      this._base = null
      this._lineas = []
      this._dash = null
      this._seq = 0
    }

    async init() {
      this.bind()
      this.montarResumen()
    }

    // ── Dashboard de inicio: estado vigente (última versión) de cada NP con cierre guardado. Una NP sin cierre guardado no aparece:
    // nunca se asume que está cerrada ni abierta. ──
    montarResumen() {
      const D = window.NpDash
      const rotulo = f => (f.estado === "CERRADO"
        ? (f.conciliacion === "CONCILIADO" ? "Cerrada y conciliada" : "Cerrada con diferencia")
        : f.conciliacion === "CONCILIADO" ? "Borrador conciliado" : f.conciliacion === "PENDIENTE" ? "Borrador con saldo" : "Borrador no calculable")
      this._dash = D.montar(this.$("cnDash"), {
        p: "cn",
        periodo: true,
        buscar: { placeholder: "Abrir el cierre de una NP (Ej: 4007)", boton: "Consultar NP", onBuscar: np => { this.vista(true); this.$("cnNp").value = np; this.consultar() } },
        kpis: [
          { label: "NP cerradas", icono: "ok", tono: "ok" },
          { label: "NP abiertas con saldo", icono: "caja", tono: "warn" },
          { label: "Pendientes de conciliación", icono: "alerta", tono: "warn" },
          { label: "Diferencias justificadas", icono: "sello" },
        ],
        charts: [
          { titulo: "Distribución por estado", sub: "Estado vigente de las NP con cierre guardado (no depende del período)" },
          { titulo: "Cierres por mes", sub: "NP cerradas, según la fecha de su cierre vigente" },
        ],
        tabla: { titulo: "NP pendientes de revisión", sub: "Borradores o cierres con diferencia, sin importar el período (los más antiguos primero)", cols: ["NP", "Ítem", "Solicitada", "Fabricada", "Pendiente", "Conciliación", "Estado", ""], vacio: "No hay NP pendientes de revisión" },
        cargar: per => C.send("calidadNp.resumen", per),
        render: (d, h) => {
          const c = d.cierre || {}
          const est = c.porEstado || []
          const n = fn => est.filter(fn).reduce((a, f) => a + Number(f.nps || 0), 0)
          h.kpi(0, n(f => f.estado === "CERRADO"), "Cierre confirmado en el sistema")
          h.kpi(1, n(f => f.estado === "BORRADOR" && f.conciliacion === "PENDIENTE"), "Borradores con diferencia sin justificar")
          h.kpi(2, n(f => f.conciliacion !== "CONCILIADO"), "Incluye no calculables")
          h.kpi(3, est.reduce((a, f) => a + Number(f.justificadas || 0), 0), "Cerradas con la diferencia explicada")
          const grupos = {}
          est.forEach(f => { grupos[rotulo(f)] = (grupos[rotulo(f)] || 0) + Number(f.nps || 0) })
          const labels = Object.keys(grupos)
          const color = l => (l === "Cerrada y conciliada" ? D.COL.verde : l === "Cerrada con diferencia" ? D.COL.ambar : l === "Borrador con saldo" ? D.COL.rojo : l === "Borrador conciliado" ? D.COL.celeste : D.COL.gris)
          h.grafico(0, "doughnut", labels, [{ label: "NP", data: labels.map(l => grupos[l]), colores: labels.map(color) }], "Aún no hay cierres guardados")
          const meses = c.porMes || []
          h.grafico(1, "bar", meses.map(m => D.mesTxt(m.mes)), [{ label: "Cierres", data: meses.map(m => Number(m.cierres)), color: D.COL.verde }])
          h.filas((c.atencion || []).map(x => `<tr><td><b>${C.esc(x.np)}</b></td><td>${C.esc(C.txt(x.item))}</td><td>${D.num(x.cantidadSolicitada)}</td><td>${D.num(x.cantidadFabricada)}</td><td>${D.num(x.diferenciaPendiente)}</td><td>${C.esc(CONCILIACION[x.conciliacion] || x.conciliacion)}</td><td><span class="npd-badge ${x.estado === "CERRADO" ? "warn" : ""}">${x.estado === "CERRADO" ? "Cerrada" : "Borrador"}</span></td><td><button class="btn-secondary" style="padding:2px 8px;" data-npd-np="${C.esc(x.np)}">Abrir NP</button></td></tr>`))
        },
      })
    }

    vista(detalle) {
      this.$("cnDash").style.display = detalle ? "none" : ""
      this.$("cnVista").style.display = detalle ? "" : "none"
      this.$("btnCnResumen").style.display = detalle ? "" : "none"
      if (!detalle) this._dash?.recargar()
    }

    $(id) { return document.getElementById(id) }

    bind() {
      if (this._click) return
      this._click = e => {
        const id = e.target.id
        if (id === "btnCnConsultar") this.consultar()
        else if (id === "btnCnLimpiar") this.limpiar()
        else if (id === "btnCnResumen") { this.limpiar(); this.vista(false) }
        else if (id === "btnCnSugeridas") { this.sugeridas(); this.renderTodo() }
        else if (id === "btnCnAgregar") this.agregarLinea()
        else if (id === "btnCnArea") this.guardarArea()
        else if (id === "btnCnGuardar") this.guardar("BORRADOR")
        else if (id === "btnCnCerrar") this.guardar("CERRADO")
        else if (id === "btnCnPdf") this.pdf()
        else if (id === "btnCnExcel") this.excel()
        const cert = e.target.closest?.("[data-cn-cert]")
        if (cert) this.agregarCertificado(cert.dataset.cnCert)
        const ver = e.target.closest?.("[data-cn-version]")
        if (ver) this.verVersion(ver.dataset.cnVersion)
        const del = e.target.closest?.("[data-cn-del]")
        if (del) { this._lineas.splice(Number(del.dataset.cnDel), 1); this.renderTodo() }
      }
      this._input = e => {
        const t = e.target
        if (t.dataset?.cnCampo) {
          const l = this._lineas[Number(t.dataset.idx)]
          if (l) l[t.dataset.cnCampo] = t.dataset.cnCampo === "cantidad" ? Number(t.value) : t.value
          if (t.dataset.cnCampo === "cantidad") this.renderTotales()
        }
        if (t.id === "cnOrigen") { this.actualizarOrigen(); this.renderTodo() }
        if (t.id === "cnManualCant") this.renderTodo(false)
        if (t.id === "cnItem") this.cargarCierre()
      }
      document.addEventListener("click", this._click)
      document.addEventListener("change", this._input)
      document.addEventListener("input", this._input)
      this.$("cnNp")?.addEventListener("keydown", e => { if (e.key === "Enter") this.consultar() })
    }

    limpiar() {
      this.$("cnNp").value = ""
      this.$("cnItem").innerHTML = `<option value="">—</option>`
      this.$("cnResultado").style.display = "none"
      this.$("cnEstado").textContent = ""
      this._carga = null
    }

    item() { return this.$("cnItem").value ? Number(this.$("cnItem").value) : null }
    itemObj() { return (this._carga?.data?.items || []).find(i => Number(i.item) === this.item()) || null }

    async consultar() {
      const np = this.$("cnNp").value.trim()
      if (!np) { this.$("cnEstado").textContent = "Indica una NP"; return }
      const id = ++this._seq
      this.$("cnEstado").textContent = "Consultando FPS, SAP y QCS..."
      this.$("cnResultado").style.display = "none"
      const carga = await C.cargarNp(np)
      if (id !== this._seq) return
      this._carga = carga
      const items = carga.data?.items || []
      this.$("cnItem").innerHTML = items.length
        ? items.map(i => `<option value="${i.item}">${C.esc(i.item)} — ${C.esc(i.itemCode || "")} ${C.esc(i.descripcion || "")}</option>`).join("")
        : `<option value="">${carga.data ? "Sin ítems" : "SAP no disponible"}</option>`
      this.$("cnEstado").textContent = carga.data ? `NP ${np} consultada ${carga.consultadoEn.toLocaleString("es-CL")}` : `Fuente FPS/SAP no disponible: ${carga.error || "sin respuesta"}. No se puede calcular el cierre.`
      if (!carga.data || !items.length) return
      await this.cargarCierre()
    }

    // Cantidad fabricada según el origen elegido (null = pendiente de confirmación, nunca 0).
    fabricadaSegun(origen) {
      const it = this.itemObj()
      if (origen === "QCS") return it && it.foliosLiberacion > 0 && it.liberadoPt !== null && it.liberadoPt !== undefined ? it.liberadoPt : null
      if (origen === "FPS") {
        // FPS no separa procesos por ítem: en una NP con varios ítems esa cifra es de toda la NP.
        if ((this._carga?.data?.items || []).length !== 1) return null
        const b = C.balance({ carga: this._carga, item: this.item(), mermas: [] })
        const f = [...b.filas].reverse().find(x => x.base === "UNIDADES" && x.procesado !== null && x.etapa !== "Calidad" && x.etapa !== "Despacho")
        return f ? f.procesado : null
      }
      if (origen !== "MANUAL") return null
      const v = this.$("cnManualCant").value
      return v === "" ? null : Number(v)
    }

    async cargarCierre() {
      const it = this.itemObj()
      if (!it) return
      const seq = ++this._seq
      const r = await C.send("calidadNp.cierre.get", { np: this._carga.np, item: it.item })
      if (seq !== this._seq) return
      this.$("cnManualCant").value = ""
      this.$("cnManualResp").value = ""
      this._avisosSug = []
      this._cierre = r.ok ? r.data : { vigente: null, historial: [], baseJustificacion: { mermas: [], certificados: [] } }
      this._errorCierre = r.ok ? null : r.error
      const v = this._cierre.vigente
      if (v) {
        this.$("cnOrigen").value = v.origenFabricada
        if (v.origenFabricada === "MANUAL") { this.$("cnManualCant").value = v.cantidadFabricada ?? ""; this.$("cnManualResp").value = v.responsableFabricada || "" }
        this.$("cnObs").value = v.observaciones || ""
        try { this._lineas = JSON.parse(v.justificacionesJson || "[]") } catch { this._lineas = [] }
      } else {
        // El origen de lo fabricado lo elige la persona: liberado, fabricado y despachado no son equivalentes.
        this.$("cnOrigen").value = ""
        this.$("cnObs").value = ""
        this._lineas = []
        this.sugeridas()
      }
      this.actualizarOrigen()
      this.$("cnResultado").style.display = ""
      this.renderTodo()
    }

    actualizarOrigen() {
      const man = this.$("cnOrigen").value === "MANUAL"
      this.$("cnManualBox").style.display = man ? "" : "none"
      this.$("cnManualRespBox").style.display = man ? "" : "none"
    }

    // Propone líneas desde mermas registradas (activas) y bodegas de rechazo de QCS. Todo en unidades.
    sugeridas() {
      const it = this.itemObj()
      const factor = it ? C.factorConfirmado(this._carga, it.item) : null
      const lineas = []
      const avisos = []
      const multi = (this._carga?.data?.items || []).length > 1
      if (this._errorCierre) avisos.push("No se pudieron leer las mermas ni los certificados registrados: no se propuso ninguna línea desde ellos (no equivale a que no existan).")
      for (const m of this._cierre?.baseJustificacion?.mermas || []) {
        if (multi && m.item === undefined) { avisos.push(`Merma de ${m.proceso} (${C.num(Number(m.cantidad))}): el servidor no indica a qué ítem pertenece (API sin actualizar); no se sumó.`); continue }
        if (multi && m.item === null) { avisos.push(`Merma de ${m.proceso} (${C.num(Number(m.cantidad))}) sin ítem en una NP con varios ítems: no se sumó.`); continue }
        let cant = Number(m.cantidad)
        if (m.unidad === "PLIEGOS") {
          if (!factor) { avisos.push(`Merma de ${m.proceso} en pliegos (${C.num(cant)}) sin factor confirmado: no se sumó; agrégala manualmente si corresponde.`); continue }
          cant *= factor
        }
        const origen = `MERMA:${m.proceso}|${m.metodo}|${m.unidad}`
        const previa = lineas.find(l => l.origen === origen) // la API separa por ítem: una sola línea por origen
        if (previa) previa.cantidad += cant
        else lineas.push({ concepto: `Merma ${m.proceso} (${m.metodo === "ESTIMADA" ? "estimada" : m.metodo === "MEDIDA" ? "medida" : "contada"})`, cantidad: cant, certeza: m.metodo === "ESTIMADA" ? "ESTIMADA" : "CONFIRMADA", origen })
      }
      const cuar = it ? C.saldoBodega(it, "CUARENTENA") : null
      const destr = it ? C.saldoBodega(it, "DESTRUCCION") : null
      if (cuar) avisos.push(`Hay ${C.num(cuar)} unidades en cuarentena (QCS): es material retenido, no una pérdida, y no se sumó.`)
      if (destr) lineas.push({ concepto: "Rechazos de Calidad: destruidas según bodega Destrucción (QCS)", cantidad: destr, certeza: "CONFIRMADA", origen: "QCS:DESTRUCCION" })
      this._lineas = lineas
      this._avisosSug = avisos
    }

    // Cifras separadas del ítem. null = fuente no disponible (nunca 0).
    etapas() {
      const it = this.itemObj()
      if (!it) return []
      const saldos = it.saldoBodegas ? Object.entries(it.saldoBodegas).filter(([, v]) => v) : null
      const sinFolios = !it.foliosLiberacion
      return [
        ["Solicitado", it.solicitado ?? null, "Nota de venta SAP"],
        ["Fabricado según origen elegido", this.fabricadaSegun(this.$("cnOrigen").value), "Depende del origen seleccionado; liberado no es lo mismo que fabricado"],
        ["Liberado a Productos Terminados", sinFolios ? null : it.liberadoPt ?? null, "Folios de liberación QCS"],
        ["Ingresado a bodega", C.ingresadoItem(this._carga, it), "Entradas SAP con la NP (por código de producto)"],
        ["Despachado neto", it.despachado ?? null, C.reglaDespachoAnterior([it]) ? "NO VALIDADO. " + C.AVISO_REGLA_ANTERIOR : "SAP: guías y facturas directas, menos devoluciones y reingresos por nota de crédito"],
        ["Liberado menos despachado", sinFolios || it.liberadoPt === null || it.liberadoPt === undefined || it.despachado === null || it.despachado === undefined ? null : it.liberadoPt - it.despachado, "Diferencia entre dos fuentes: no es merma ni inventario"],
        ...this.etapasInventario(it),
        ...(saldos === null ? [["Saldo por bodega (QCS)", null, "Liberaciones QCS no disponibles"]] : saldos.map(([b, v]) => [`Saldo QCS en ${b}`, v, "Según movimientos de folios QCS; no es el inventario SAP actual"]))
      ]
    }

    // Inventario SAP de los lotes de la NP: es el stock de hoy, no el que había al cerrar.
    etapasInventario(it) {
      const x = C.inventarioItem(this._carga, it)
      const bodegas = x ? Object.entries(x.bodegas).map(([b, v]) => `${b}: ${C.num(v)}`).join(" · ") : ""
      const otra = x?.otraNp.length ? ` REVISAR: ${C.num(x.otraNp.reduce((a, o) => a + Number(o.cantidad || 0), 0))} unidades de entradas de esta NP están en lotes marcados ${x.otraNp.map(o => o.npDelLote).join(", ")}.` : ""
      const filas = [["Inventario SAP actual (lotes de la NP, por código)", x?.stock ?? null,
        (!this._carga?.data?.inventarioPt ? "Fuente SAP no disponible" : !x || x.stock === null ? "SAP no tiene lotes de esta NP para el código (no equivale a stock cero)" : `Stock de hoy${bodegas ? ` en ${bodegas}` : ""}`) + otra]]
      if (x?.recibidoCompra !== null && x?.recibidoCompra !== undefined) filas.push(["Recibido por compra en esos lotes", x.recibidoCompra, "Entradas de compra SAP (por ejemplo desde FARET); no es producción propia"])
      return filas
    }

    renderAreas() {
      const el = this.$("cnAreasBody")
      if (!el) return
      const v = this._cierre?.vigente
      const areas = this._cierre?.areas
      this.$("cnAreaForm").style.display = v && C.puedeEditar("cierre-np") ? "" : "none"
      if (!areas) { el.innerHTML = `<tr><td colspan="6">${this._errorCierre ? ND : "El servidor no entrega estados por área (API sin actualizar)"}</td></tr>`; return }
      el.innerHTML = areas.length ? [...areas].reverse().map(a => `<tr><td>${C.esc(a.area)}</td><td>${C.esc(ESTADO_AREA[a.estado] || a.estado)}</td><td>${C.esc(C.txt(a.observacion))}</td><td>${C.esc(a.usuario)}</td><td>${C.fechaHora(a.fecha)}</td><td>${C.esc(a.version)}${v && a.version !== v.version ? " (anterior)" : ""}</td></tr>`).join("")
        : `<tr><td colspan="6" style="text-align:center;">${v ? "Sin estados por área registrados" : "Guarda el cierre antes de registrar áreas"}</td></tr>`
    }

    async guardarArea() {
      const v = this._cierre?.vigente
      if (!v) return
      const area = this.$("cnArea").value.trim()
      if (!area) { alert("Indica el área"); return }
      const r = await C.send("calidadNp.cierre.area", { np: this._carga.np, item: this.itemObj().item, cierreId: v.id, area, estado: this.$("cnAreaEstado").value, observacion: this.$("cnAreaObs").value.trim() })
      if (!r.ok) { alert(r.error); return }
      this.$("cnAreaObs").value = ""
      // Solo se refrescan las áreas: no se pierde lo escrito en la justificación.
      const nuevo = await C.send("calidadNp.cierre.get", { np: this._carga.np, item: this.itemObj().item })
      if (nuevo.ok) this._cierre.areas = nuevo.data.areas
      this.renderAreas()
    }

    renderEtapas() {
      const el = this.$("cnEtapasBody")
      if (!el) return
      const it = this.itemObj()
      el.innerHTML = this.etapas().map(([c, v, q]) => `<tr><td>${C.esc(c)}</td><td>${v === null ? ND : C.num(v)}</td><td class="subtitle">${C.esc(q)}</td></tr>`).join("")
      const docs = this.$("cnDocumentos")
      if (!docs || !it) return
      const d = this._carga?.data
      const lib = d?.liberaciones && d.liberaciones.filter(l => String(l.Item) === String(it.item) && String(l.ItemCode) === String(it.itemCode))
      const lineas = new Set((d?.notaVenta || []).filter(l => String(l.Item) === String(it.item)).map(l => Number(l.LineNum)))
      const desp = d?.documentos && d.documentos.filter(x => x.LineaNv !== null && x.LineaNv !== undefined && lineas.has(Number(x.LineaNv)))
      const lista = (titulo, filas, vacio) => `<div class="subtitle" style="margin-top:6px;">${titulo}</div>` + (filas === null || filas === undefined ? `<div>${ND}</div>` : !filas.length ? `<div>${vacio}</div>` : `<ul style="margin:2px 0 0 18px;">${filas.map(f => `<li>${f}</li>`).join("")}</ul>`)
      docs.innerHTML = lista("Folios de liberación QCS", lib && lib.map(l => `Folio ${C.esc(l.Folio)} · ${C.esc(C.txt(l.Fecha))} · ${C.num(l.Cantidad)} → ${C.esc(C.txt(l.BodegaDestino))}`), "Sin folios para el ítem")
        + lista("Documentos SAP de la línea", desp && desp.map(x => `${C.esc({ GUIA: "Guía", FACTURA: "Factura", DEVOLUCION: "Devolución", NOTA_CREDITO: "Nota de crédito" }[x.Tipo] || x.Tipo)}${x.Reserva === "Y" ? " de reserva" : ""} ${C.esc(x.DocNum)} · ${C.esc(C.txt(x.DocDate))} · ${C.num(Number(x.Cantidad))}`), "Sin documentos para el ítem")
    }

    textoEjecucion(x) {
      if (!x.ejecutada) return "No confirmada"
      return x.cantidadEjecutada === null || x.cantidadEjecutada === undefined ? "Sí (cantidad no registrada)" : `Sí: ${C.num(x.cantidadEjecutada)}`
    }

    // Un certificado solo se suma como justificación si la destrucción está confirmada y solo por la parte que no se
    // registró antes como merma. La emisión por sí sola no acredita destrucción física.
    certificadoSumable(x) {
      // Nunca más que lo efectivamente destruido.
      const cant = Math.min(Number(x?.cantidadSinMerma) || 0, x?.cantidadEjecutada === null || x?.cantidadEjecutada === undefined ? Infinity : Number(x.cantidadEjecutada))
      if (!x?.ejecutada || cant <= 0 || this._lineas.some(l => l.origen === `CERT:${x.id}`)) return 0
      return cant
    }

    agregarCertificado(id) {
      const x = (this._cierre?.baseJustificacion?.certificados || []).find(c => String(c.id) === String(id))
      const cant = this.certificadoSumable(x)
      if (!cant) return
      if (this._lineas.some(l => l.origen === "QCS:DESTRUCCION") && !confirm("La justificación ya incluye la bodega Destrucción de QCS. Si es el mismo material de este certificado, se contaría dos veces. ¿Agregar de todos modos?")) return
      this._lineas.push({ concepto: `Destrucción confirmada según certificado ${x.correlativo || "#" + x.id} (sin merma registrada)`, cantidad: cant, certeza: "CONFIRMADA", origen: `CERT:${x.id}` })
      this.renderTodo()
    }

    // Versión guardada del historial, tal como quedó registrada (no se recalcula).
    verVersion(id) {
      const v = (this._cierre?.historial || []).find(x => String(x.id) === String(id))
      if (!v) return
      let lineas = null
      try { lineas = v.justificacionesJson === undefined ? null : JSON.parse(v.justificacionesJson || "[]") } catch { lineas = null }
      const filas = lineas === null ? `<tr><td colspan="4">${ND}</td></tr>` : !lineas.length ? `<tr><td colspan="4">Sin líneas de justificación</td></tr>`
        : lineas.map(l => `<tr><td>${C.esc(l.concepto)}</td><td>${C.num(Number(l.cantidad))}</td><td>${C.esc(l.certeza)}</td><td>${C.esc(C.txt(l.origen))}</td></tr>`).join("")
      C.modal("cnVersion", `Cierre versión ${v.version} (${v.estado})`, `<p>Guardado por <b>${C.esc(v.creadoPor)}</b> el ${C.fechaHora(v.fecha)}. Solicitada ${C.num(v.cantidadSolicitada)} · fabricada ${C.num(v.cantidadFabricada)} (${C.esc(v.origenFabricada)}${v.responsableFabricada ? ", " + C.esc(v.responsableFabricada) : ""}) · pendiente ${v.diferenciaPendiente === null ? ND : C.num(v.diferenciaPendiente)}.</p>
        <table class="table"><thead><tr><th>Concepto</th><th>Cantidad</th><th>Certeza</th><th>Origen</th></tr></thead><tbody>${filas}</tbody></table>
        <p><b>Observaciones:</b> ${C.esc(v.observaciones === undefined ? ND : v.observaciones || "-")}</p>`, "", null, 820)
    }

    agregarLinea() {
      this._lineas.push({ concepto: "Otras diferencias", cantidad: 0, certeza: "ESTIMADA", origen: "" })
      this.renderTodo()
    }

    calculo() {
      const it = this.itemObj()
      const origen = this.$("cnOrigen").value
      const solicitada = it ? it.solicitado : null
      const fabricada = this.fabricadaSegun(origen)
      const justificado = this._lineas.reduce((a, l) => a + (Number(l.cantidad) || 0), 0)
      const dif = !solicitada || fabricada === null ? null : solicitada - fabricada
      const pendiente = dif === null ? null : (dif <= 0 ? 0 : dif - justificado)
      const cumpl = dif === null || !solicitada ? null : (fabricada / solicitada) * 100
      return { origen, solicitada, fabricada, justificado, dif, pendiente, cumpl }
    }

    // Un cierre no congela la NP: SAP y QCS pueden registrar movimientos después. Se compara con la evidencia guardada.
    renderMovimientos(it) {
      const el = this.$("cnMovimientos")
      if (!el) return
      const v = this._cierre?.vigente
      if (!v || v.estado !== "CERRADO") { el.style.display = "none"; return }
      const base = this._errorCierre ? null : this._cierre?.baseJustificacion
      const cambios = C.movimientosPosteriores(v.evidenciaJson, it, this._carga, base)
      // "Sin movimientos" solo puede afirmar lo que de verdad se comparó.
      let conQcc = false
      try { conQcc = !!base && !!JSON.parse(v.evidenciaJson).registrosQcc } catch { conQcc = false }
      const hash = v.evidenciaSha256 ? ` · huella ${C.esc(String(v.evidenciaSha256).trim().slice(0, 12))}…` : ""
      if (cambios === null) {
        el.style.cssText = "display:block;margin:6px 0;padding:8px 12px;border-radius:8px;background:#f1f5f9;color:#475569;font-size:12px;"
        el.innerHTML = v.evidenciaJson ? "No se pudo comparar con la evidencia del cierre." : "Este cierre no guardó evidencia de los datos usados (anterior a esta función): no se pueden detectar movimientos posteriores."
      } else if (cambios.length) {
        el.style.cssText = "display:block;margin:6px 0;padding:8px 12px;border-radius:8px;background:#fef3c7;color:#92400e;font-size:12px;"
        el.innerHTML = `<b>Movimientos posteriores al cierre (versión ${C.esc(v.version)})</b>${hash}<br>${cambios.map(x => C.esc(x)).join("<br>")}`
      } else {
        el.style.cssText = "display:block;margin:6px 0;padding:8px 12px;border-radius:8px;background:#dcfce7;color:#166534;font-size:12px;"
        el.innerHTML = `Sin movimientos posteriores al cierre (versión ${C.esc(v.version)})${hash}${conQcc ? "" : "<br>Solo se compararon SAP y QCS: las mermas y certificados de QCC no se pudieron comparar con este cierre."}`
      }
    }

    renderTodo(conLineas = true) {
      const it = this.itemObj()
      const o = this._carga?.data?.ordenes?.[0]
      this.$("cnDatos").innerHTML = `Cliente: <b>${C.esc(C.txt(o?.Cliente))}</b> · NP: <b>${C.esc(this._carga.np)}</b> · Producto: <b>${C.esc(C.txt(it?.descripcion))}</b> (${C.esc(C.txt(it?.itemCode))})${this._errorCierre ? ` · <span style="color:#b91c1c;">Cierres previos no disponibles: ${C.esc(this._errorCierre)}</span>` : ""}`
      this.renderMovimientos(it)
      this.renderEtapas()
      const c = this.calculo()
      this.$("cnSolicitada").textContent = C.num(c.solicitada)
      this.$("cnFabricada").textContent = c.fabricada === null ? "PENDIENTE DE CONFIRMACIÓN" : C.num(c.fabricada)
      this.$("cnFabricadaNota").textContent = c.origen === "QCS" ? "liberada conforme (QCS), no es lo mismo que fabricada" : c.origen === "FPS" ? "FPS, última etapa en unidades (declarada; solo NP de un ítem)" : c.origen === "MANUAL" ? "ingreso manual" : "selecciona el origen"
      this.$("cnDiferencia").textContent = c.dif === null ? ND : C.num(c.dif)
      this.$("cnDiferenciaNota").textContent = c.dif === null ? "" : c.dif > 0 ? "unidades faltantes" : c.dif === 0 ? "producción completa" : "excedente de producción"
      this.$("cnCumplimiento").textContent = c.cumpl === null ? (c.solicitada === 0 ? "Solicitada = 0: no calculable" : ND) : `${c.cumpl.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`
      if (conLineas) this.renderLineas()
      this.renderTotales()
      const certs = this._cierre?.baseJustificacion?.certificados || []
      this.renderAreas()
      this.$("cnCertBody").innerHTML = certs.length ? certs.map(x => `<tr><td>${C.esc(x.correlativo || "#" + x.id)}</td><td>${C.esc(x.estado)}</td><td>${C.num(x.cantidadDestruir)}</td><td>${C.num(x.cantidadConMerma)}</td><td>${this.textoEjecucion(x)}</td><td>${this.certificadoSumable(x) ? `<button class="btn-secondary" style="padding:2px 8px;" data-cn-cert="${C.esc(x.id)}" data-requiere-editar>Agregar a la justificación</button>` : ""}</td></tr>`).join("") : `<tr><td colspan="6" style="text-align:center;">${this._errorCierre ? ND : "Sin certificados aprobados o emitidos"}</td></tr>`
      const h = this._cierre?.historial || []
      this.$("cnHistBody").innerHTML = h.length ? h.map(x => `<tr><td>${x.version}</td><td>${C.esc(x.estado)}</td><td>${C.esc(CONCILIACION[x.estadoConciliacion] || x.estadoConciliacion)}</td><td>${C.num(x.cantidadFabricada)}</td><td>${x.diferenciaPendiente === null ? ND : C.num(x.diferenciaPendiente)}</td><td>${C.esc(x.origenFabricada)}</td><td>${C.esc(x.creadoPor)}</td><td>${C.fechaHora(x.fecha)}</td><td><button class="btn-secondary" style="padding:2px 8px;" data-cn-version="${C.esc(x.id)}">Ver versión</button></td></tr>`).join("") : `<tr><td colspan="9" style="text-align:center;">${this._errorCierre ? ND : "Sin cierres guardados"}</td></tr>`
    }

    renderLineas() {
      const sel = (v, k) => `<select data-cn-campo="certeza" data-idx="${k}"><option value="CONFIRMADA"${v === "CONFIRMADA" ? " selected" : ""}>Confirmada</option><option value="ESTIMADA"${v === "ESTIMADA" ? " selected" : ""}>Estimada</option></select>`
      this.$("cnJustBody").innerHTML = this._lineas.length ? this._lineas.map((l, k) => `<tr>
        <td><input type="text" data-cn-campo="concepto" data-idx="${k}" value="${C.esc(l.concepto)}" style="width:100%"></td>
        <td><input type="number" min="0" step="any" data-cn-campo="cantidad" data-idx="${k}" value="${Number(l.cantidad) || 0}" style="width:130px"></td>
        <td>${sel(l.certeza, k)}</td><td class="subtitle">${C.esc(C.txt(l.origen))}</td>
        <td><button class="btn-secondary" style="padding:2px 8px;" data-cn-del="${k}" data-requiere-editar>Quitar</button></td></tr>`).join("")
        : `<tr><td colspan="5" style="text-align:center;">Sin líneas: la diferencia queda sin justificar</td></tr>`
      // Solo vista: la justificación y las observaciones se leen, no se editan.
      const soloVista = !C.puedeEditar("cierre-np")
      this.$("cnObs").readOnly = soloVista
      if (soloVista) this.$("cnJustBody").querySelectorAll("input,select").forEach(x => { x.disabled = true })
    }

    renderTotales() {
      const c = this.calculo()
      const conf = this._lineas.filter(l => l.certeza === "CONFIRMADA").reduce((a, l) => a + (Number(l.cantidad) || 0), 0)
      const est = this._lineas.filter(l => l.certeza !== "CONFIRMADA").reduce((a, l) => a + (Number(l.cantidad) || 0), 0)
      const pend = c.pendiente === null ? `<b>No calculable</b> (falta la cantidad solicitada o la fabricada)` : c.pendiente === 0 ? `<b style="color:#15803d;">Conciliado</b>` : `<b style="color:#b45309;">Diferencia pendiente: ${C.num(c.pendiente)}</b>${c.pendiente < 0 ? " (justificado de más: revisa duplicados)" : ""}`
      this.$("cnTotales").innerHTML = `Total justificado: <b>${C.num(c.justificado)}</b> (confirmado ${C.num(conf)} · estimado ${C.num(est)}) — ${pend}`
      this.$("cnAvisos").innerHTML = (this._avisosSug || []).map(a => `⚠ ${C.esc(a)}`).join("<br>")
    }

    async guardar(estado) {
      const it = this.itemObj()
      if (!it) return
      const c = this.calculo()
      const origen = c.origen
      if (!origen) { alert("Selecciona el origen de la cantidad fabricada."); return }
      if (C.itemAmbiguo(this._carga, it.item)) { alert("El ítem tiene más de un código de producto: el cierre no se puede guardar sin mezclarlos."); return }
      const body = {
        cantidadSolicitada: c.solicitada, cantidadFabricada: c.fabricada, origenFabricada: origen,
        responsableFabricada: origen === "MANUAL" ? this.$("cnManualResp").value.trim() : "", observaciones: this.$("cnObs").value.trim(), estado,
        justificaciones: this._lineas.map(l => ({ concepto: l.concepto, cantidad: Number(l.cantidad) || 0, certeza: l.certeza, origen: l.origen || "" })),
        np: this._carga.np, item: it.item,
        evidencia: C.evidenciaItem(this._carga, it, { fabricada: c.fabricada, origenFabricada: origen, registrosQcc: C.registrosQcc(this._errorCierre ? null : this._cierre?.baseJustificacion) }),
        ...C.itemSap(this._carga, it), unidad: "UNIDADES"
      }
      if (estado === "CERRADO" && !confirm("¿Registrar el cierre interno de esta NP? Queda como una versión nueva en el historial (no se borra ni sobrescribe).")) return
      const r = await C.send("calidadNp.cierre.guardar", body)
      if (!r.ok) { alert(r.error); return }
      window.ExcelExporter?.showToast?.(estado === "CERRADO" ? "Cierre registrado" : "Borrador guardado")
      await this.cargarCierre()
    }

    excel() {
      if (!this._carga) return
      const c = this.calculo()
      const it = this.itemObj()
      const wb = XLSX.utils.book_new()
      C.hoja(wb, "Cierre", `Cierre de NP ${this._carga.np} ítem ${it?.item} — ${C.fechaHora(new Date())}`, ["Concepto", "Valor"], [
        ["Fecha y hora de emisión", new Date().toLocaleString("es-CL")], ["NP", this._carga.np], ["Ítem", it?.item], ["Cliente", C.txt(this._carga.data?.ordenes?.[0]?.Cliente)], ["Producto", C.txt(it?.descripcion)],
        ["Cantidad solicitada", c.solicitada ?? ND], ["Cantidad fabricada", c.fabricada ?? "PENDIENTE DE CONFIRMACIÓN"], ["Origen de la cantidad fabricada", c.origen],
        ["Diferencia", c.dif ?? ND], ["Cumplimiento %", c.cumpl === null ? ND : Number(c.cumpl.toFixed(2))], ["Total justificado", c.justificado], ["Diferencia pendiente", c.pendiente ?? ND],
        ["Observaciones", this.$("cnObs").value || "-"], ["Responsable", C.usuarioActual()]])
      C.hoja(wb, "Justificación", "Detalle de pérdidas justificadas", ["Concepto", "Cantidad (unidades)", "Certeza", "Origen"], this._lineas.map(l => [l.concepto, Number(l.cantidad) || 0, l.certeza, C.txt(l.origen)]))
      C.hoja(wb, "Etapas", "Producción, liberación, inventario y despacho del ítem", ["Concepto", "Cantidad (unidades)", "Qué significa"], this.etapas().map(([a, v, q]) => [a, v ?? ND, q]))
      C.hoja(wb, "Certificados", "Certificados de destrucción relacionados", ["Certificado", "Estado", "Cant. a destruir", "Contada como merma", "Ejecutada", "Cant. efectivamente destruida"],
        (this._cierre?.baseJustificacion?.certificados || []).map(x => [x.correlativo || `#${x.id}`, x.estado, x.cantidadDestruir, x.cantidadConMerma, x.ejecutada ? "Sí" : "No", x.ejecutada ? x.cantidadEjecutada ?? ND : "-"]))
      C.hoja(wb, "Áreas", "Estado del cierre por área (informativo; historial completo)", ["Área", "Estado", "Observación", "Usuario", "Fecha", "Versión del cierre"],
        (this._cierre?.areas || []).map(a => [a.area, ESTADO_AREA[a.estado] || a.estado, C.txt(a.observacion), a.usuario, C.fechaHora(a.fecha), a.version]))
      C.hoja(wb, "Historial", "Versiones guardadas del cierre", ["Versión", "Estado", "Conciliación", "Solicitada", "Fabricada", "Pendiente", "Origen", "Usuario", "Fecha", "Huella de evidencia"],
        (this._cierre?.historial || []).map(x => [x.version, x.estado, CONCILIACION[x.estadoConciliacion] || x.estadoConciliacion, x.cantidadSolicitada ?? ND, x.cantidadFabricada ?? ND, x.diferenciaPendiente ?? ND, x.origenFabricada, x.creadoPor, C.fechaHora(x.fecha), C.txt(x.evidenciaSha256)]))
      C.guardarLibro(wb, `Cierre_NP_${this._carga.np}_${C.stamp()}.xlsx`)
    }

    pdf() {
      if (!this._carga) return
      const c = this.calculo()
      const it = this.itemObj()
      const e = C.esc
      const filas = this._lineas.map(l => `<tr><td>${e(l.concepto)}</td><td style="text-align:right">${C.num(l.cantidad)}</td><td>${l.certeza === "CONFIRMADA" ? "Confirmada" : "Estimada"}</td><td>${e(C.txt(l.origen))}</td></tr>`).join("") || `<tr><td colspan="4">Sin líneas de justificación</td></tr>`
      const certs = (this._cierre?.baseJustificacion?.certificados || []).map(x => `<tr><td>${e(x.correlativo || "#" + x.id)}</td><td>${e(x.estado)}</td><td style="text-align:right">${C.num(x.cantidadDestruir)}</td><td>${this.textoEjecucion(x)}</td></tr>`).join("") || `<tr><td colspan="4">${this._errorCierre ? ND : "Sin certificados aprobados o emitidos"}</td></tr>`
      const estado = c.pendiente === null ? "NO CALCULABLE" : c.pendiente === 0 ? "CONCILIADO" : `DIFERENCIA PENDIENTE: ${C.num(c.pendiente)}`
      C.imprimirHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Cierre NP ${e(this._carga.np)}</title><style>
        body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#111}h1{font-size:17px;margin:0}h2{font-size:12px;margin:14px 0 4px;border-bottom:1px solid #334155}
        table{width:100%;border-collapse:collapse;margin:4px 0}th,td{border:1px solid #94a3b8;padding:3px 5px;text-align:left}th{background:#e2e8f0}.k td:first-child{width:35%;font-weight:700;background:#f1f5f9}
        </style></head><body><h1>INNPACK — Informe de cierre interno de NP ${e(this._carga.np)}</h1>
        <p>Cierre interno de Calidad (previo a certificados de destrucción) · Emitido: ${e(new Date().toLocaleString("es-CL"))} · Responsable: ${e(C.usuarioActual())}</p>
        <table class="k"><tr><td>NP / Ítem</td><td>${e(this._carga.np)} / ${e(it?.item)}</td></tr><tr><td>Cliente</td><td>${e(C.txt(this._carga.data?.ordenes?.[0]?.Cliente))}</td></tr>
        <tr><td>Producto</td><td>${e(C.txt(it?.descripcion))} (${e(C.txt(it?.itemCode))})</td></tr>
        <tr><td>Cantidad solicitada</td><td>${C.num(c.solicitada)}</td></tr><tr><td>Cantidad fabricada</td><td>${c.fabricada === null ? "PENDIENTE DE CONFIRMACIÓN" : C.num(c.fabricada)} (${e(c.origen)})</td></tr>
        <tr><td>Diferencia</td><td>${c.dif === null ? ND : C.num(c.dif)}</td></tr><tr><td>Cumplimiento</td><td>${c.cumpl === null ? ND : c.cumpl.toLocaleString("es-CL", { maximumFractionDigits: 1 }) + "%"}</td></tr>
        <tr><td>Estado de conciliación</td><td>${estado}</td></tr></table>
        <h2>Detalle de pérdidas</h2><table><thead><tr><th>Concepto</th><th>Cantidad (unid.)</th><th>Certeza</th><th>Origen</th></tr></thead><tbody>${filas}</tbody></table>
        <h2>Certificados relacionados</h2><table><thead><tr><th>Certificado</th><th>Estado</th><th>Cant.</th><th>Destrucción ejecutada</th></tr></thead><tbody>${certs}</tbody></table>
        <h2>Producción, liberación, inventario y despacho</h2><table><thead><tr><th>Concepto</th><th>Cantidad (unid.)</th><th>Qué significa</th></tr></thead><tbody>${this.etapas().map(([a, v, q]) => `<tr><td>${e(a)}</td><td style="text-align:right">${v === null ? ND : C.num(v)}</td><td>${e(q)}</td></tr>`).join("")}</tbody></table>
        <h2>Estado por área (informativo)</h2><table><thead><tr><th>Área</th><th>Estado</th><th>Observación</th><th>Usuario</th><th>Fecha</th><th>Versión</th></tr></thead><tbody>${(this._cierre?.areas || []).map(a => `<tr><td>${e(a.area)}</td><td>${e(ESTADO_AREA[a.estado] || a.estado)}</td><td>${e(C.txt(a.observacion))}</td><td>${e(a.usuario)}</td><td>${e(C.fechaHora(a.fecha))}</td><td>${e(a.version)}</td></tr>`).join("") || `<tr><td colspan="6">Sin estados por área registrados</td></tr>`}</tbody></table>
        <h2>Observaciones</h2><p>${e(this.$("cnObs").value || "-")}</p></body></html>`)
    }

    destroy() {
      document.getElementById("cnVersion")?.remove()
      if (this._click) document.removeEventListener("click", this._click)
      if (this._input) { document.removeEventListener("change", this._input); document.removeEventListener("input", this._input) }
      this._click = null
      this._input = null
      this._dash?.destruir()
      document.getElementById("cnModal")?.remove()
    }
  }

  window.CierreNpController = CierreNpController
}
