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
      this._seq = 0
    }

    async init() {
      this.bind()
    }

    $(id) { return document.getElementById(id) }

    bind() {
      if (this._click) return
      this._click = e => {
        const id = e.target.id
        if (id === "btnBmConsultar") this.consultar()
        else if (id === "btnBmLimpiar") this.limpiar()
        else if (id === "btnBmTabBalance") this.tab("balance")
        else if (id === "btnBmTabMermas") this.tab("mermas")
        else if (id === "btnBmExcelBalance") this.exportarBalance()
        else if (id === "btnBmExcelMermas") this.exportarMermas()
        else if (id === "btnBmNuevaMerma" || id === "btnBmNuevaMerma2") this.modalMerma()
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
      const [carga, mer] = await Promise.all([C.cargarNp(np), C.send("calidadNp.mermas.list", { np })])
      if (id !== this._seq) return
      this._carga = carga
      this._mermas = mer.ok ? mer.data || [] : []
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
      this.$("bmEstado").textContent = avisos.join(" ") || `NP ${np} consultada ${carga.consultadoEn.toLocaleString("es-CL")}`
      this.$("bmResultado").style.display = ""
      this.refrescarItem()
    }

    refrescarItem() {
      this.renderBalance()
      this.renderMermas()
    }

    mermasDelItem() {
      const it = this.item()
      return this._mermas.filter(m => it === null || m.item === null || m.item === undefined || Number(m.item) === it)
    }

    // ── Balance ──────────────────────────────────────────────────────────────

    calcularBalance() {
      return C.balance({ carga: this._carga, item: this.item(), mermas: this._mermas })
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
          <td>${celda(f.equivalentes)}</td><td>${celda(f.salidaConforme)}</td><td>${C.num(f.mermaConfirmada)}</td><td>${C.num(f.mermaEstimada)}</td>
          <td>${celda(f.retenido)}</td><td><span class="subtitle">${ND}</span></td><td>${dif}</td><td>${C.esc(f.estado)}</td>
          <td>${f.etapa !== "Despacho" ? `<button class="btn-secondary" style="padding:2px 8px;" data-bm-registrar="${C.esc(f.etapa)}" data-requiere-editar>Registrar merma</button>` : ""}</td></tr>`
      }).join("") : `<tr><td colspan="14" style="text-align:center;">Sin datos de procesos para esta NP</td></tr>`
    }

    exportarBalance() {
      const b = this._balance
      if (!b) return
      const wb = XLSX.utils.book_new()
      const x = v => (v === null || v === undefined ? ND : v)
      C.hoja(wb, "Balance", `Balance PROVISIONAL NP ${this._carga.np} ítem ${b.item ?? "-"} — ${C.fechaHora(new Date())}`,
        ["Proceso", "Unidad", "Desde", "Hasta", "Máquina", "Entrada (estimada)", "Procesado (FPS)", "Unid. equivalentes", "Salida conforme", "Merma confirmada", "Merma estimada", "Material retenido", "En reproceso", "Diferencia por conciliar", "Estado del registro"],
        b.filas.map(f => [f.etapa, f.base || "-", C.fecha(f.fechaDesde), C.fecha(f.fechaHasta), f.maquinas, x(f.entrada), x(f.procesado), x(f.equivalentes), x(f.salidaConforme), f.mermaConfirmada, f.mermaEstimada, x(f.retenido), ND, x(f.diferencia), f.estado]))
      C.hoja(wb, "Advertencias", "Advertencias del balance", ["Advertencia"], b.advertencias.map(a => [a]))
      C.guardarLibro(wb, `Balance_NP_${this._carga.np}_${C.stamp()}.xlsx`)
    }

    // ── Mermas ───────────────────────────────────────────────────────────────

    renderMermas() {
      const lista = this.mermasDelItem()
      const act = lista.filter(m => m.estado !== "ANULADA")
      const suma = (arr, f) => arr.filter(f).reduce((a, m) => a + Number(m.cantidad), 0)
      const conf = m => m.metodo !== "ESTIMADA"
      const cal = (this._balance?.filas || []).find(f => f.etapa === "Calidad")
      const difTotal = (this._balance?.filas || []).filter(f => !f.diferenciaEsPendienteDespacho && f.diferencia > 0).reduce((a, f) => a + f.diferencia, 0)
      const tarj = (label, valor, nota) => `<div class="kpi-card"><div class="kpi-label">${label}</div><div class="kpi-value">${valor}</div><div class="subtitle">${nota}</div></div>`
      this.$("bmKpis").innerHTML =
        tarj("Merma confirmada", C.num(suma(act, conf)), "contada o medida (según unidad de cada registro)") +
        tarj("Merma estimada", C.num(suma(act, m => !conf(m))), "estimaciones: no son confirmadas") +
        tarj("Cantidad retenida", cal && cal.retenido !== null ? C.num(cal.retenido) : ND, "cuarentena en QCS") +
        tarj("Diferencia no conciliada", this._balance?.filas.length ? C.num(difTotal) : ND, "suma de diferencias positivas del balance (provisional)")
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
        const comp = Number(m.comprometidoDestruccion) > 0 ? `<div class="subtitle">${C.num(m.comprometidoDestruccion)} en certificados de destrucción</div>` : ""
        return `<tr${m.estado === "ANULADA" ? ' style="opacity:.55;"' : ""}><td>${m.id}</td><td>${C.fecha(m.fecha)}</td><td>${C.esc(m.proceso)}</td><td>${C.esc(C.txt(m.maquina))}</td>
          <td>${C.esc(C.txt(m.turno))}</td><td>${C.esc(C.txt(m.defecto))}${m.defectoOrigen ? `<div class="subtitle">vinculado: ${C.esc(m.defectoOrigen)}</div>` : ""}</td>
          <td>${C.num(m.cantidad)}${corr}${comp}</td><td>${C.esc(m.unidad)}${m.pallet ? ` <span class="subtitle">pallet ${C.esc(m.pallet)}</span>` : ""}</td>
          <td>${C.esc(m.metodo)}</td><td>${C.esc(ESTADO_MERMA[m.estado] || m.estado)}${m.motivoAnulacion ? `<div class="subtitle">${C.esc(m.motivoAnulacion)}</div>` : ""}</td>
          <td>${C.esc(m.creadoPor)}<div class="subtitle">${C.fechaHora(m.fechaCreacion)}</div></td><td style="white-space:nowrap;">${acc.join(" ")}</td></tr>`
      }).join("") : `<tr><td colspan="12" style="text-align:center;">Sin mermas registradas para esta NP/ítem</td></tr>`
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
        : `<tr><td colspan="4" style="text-align:center;">Sin mermas</td></tr>`
    }

    exportarMermas() {
      if (!this._carga) return
      const wb = XLSX.utils.book_new()
      C.hoja(wb, "Mermas", `Mermas NP ${this._carga.np} — ${C.fechaHora(new Date())}`,
        ["Id", "Ítem", "Fecha", "Proceso", "Máquina", "Turno", "Corrida", "Defecto", "Inspección vinculada", "Cantidad", "Cantidad inicial", "Unidad", "Pallet", "Método", "Estado", "Motivo anulación", "Registró", "Fecha registro"],
        this._mermas.map(m => [m.id, m.item ?? "-", C.fecha(m.fecha), m.proceso, C.txt(m.maquina), C.txt(m.turno), C.txt(m.corrida), C.txt(m.defecto), C.txt(m.defectoOrigen), m.cantidad, m.cantidadInicial, m.unidad, C.txt(m.pallet), m.metodo, m.estado, C.txt(m.motivoAnulacion), m.creadoPor, C.fechaHora(m.fechaCreacion)]))
      C.guardarLibro(wb, `Mermas_NP_${this._carga.np}_${C.stamp()}.xlsx`)
    }

    // ── Acciones sobre una merma ─────────────────────────────────────────────

    async recargarMermas() {
      const r = await C.send("calidadNp.mermas.list", { np: this._carga.np })
      if (r.ok) this._mermas = r.data || []
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
      const hoy = new Date().toISOString().slice(0, 10)
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
          <div class="form-group"><label>Evidencia (foto, máx. 10 MB)</label><input type="file" id="bmfEvidencia" accept="image/*,.pdf"></div>
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
        const body = {
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
      if (this._click) document.removeEventListener("click", this._click)
      if (this._change) document.removeEventListener("change", this._change)
      this._click = null
      this._change = null
      document.getElementById("bmModal")?.remove()
      document.getElementById("bmModalMerma")?.remove()
      document.getElementById("bmModalVinc")?.remove()
    }
  }

  window.BalanceMermasController = BalanceMermasController
}
