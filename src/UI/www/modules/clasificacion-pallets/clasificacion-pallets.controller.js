// Clasificación de Pallets (solo INNPACK). Consume api/pallets de la API `calidad` a través de las acciones clasificacionPallets.*.
// Las clasificaciones son eventos inmutables: aquí solo se consultan y, con permiso, se ANULAN (lógicamente, con motivo).
// Los colores AZUL/ROJO/VERDE siempre se muestran junto a su texto.
if (!window.ClasificacionPalletsController) {
  window.ClasificacionPalletsController = class ClasificacionPalletsController {
    static COLORES = {
      AZUL: { clase: "cp-azul", nombre: "Azul", sig: "en revisión", hex: "#2563eb" },
      ROJO: { clase: "cp-rojo", nombre: "Rojo", sig: "rechazo", hex: "#dc2626" },
      VERDE: { clase: "cp-verde", nombre: "Verde", sig: "conforme", hex: "#16a34a" },
    }
    static LIMITE = 25
    static LIMITE_EXPORT = 200
    static MAX_PAGINAS_EXPORT = 200

    constructor() {
      this.filtros = {
        vista: "vigentes", // vigentes | eventos
        periodo: 30, // días; 0 = todo
        desde: "",
        hasta: "",
        color: "",
        procesoId: "",
        maquinaId: "",
        buscar: "",
        defectoId: "",
        defectoNombre: "",
        incluirAnuladas: false,
      }
      this.pagina = 1
      this.total = 0
      this.items = []
      this.charts = {}
      this._seq = 0
      this._root = null
      this._onClick = null
      this._onKey = null
      this._onError = null
      this._debounce = null
      this._drawerSeq = 0
      this._itemsPorId = new Map()
      this._globalVacio = false // true = la API confirmó que no existe ninguna clasificación (sin filtros)
    }

    /* ─────────────── ciclo de vida ─────────────── */

    async init() {
      this._root = document.querySelector(".clasificacion-pallets-module")
      if (!this._root) return

      this.bindEventos()
      this.initFechas()
      this.aplicarPeriodo(this.filtros.periodo, false)
      this.sincronizarControles()

      await this.cargarOpcionesFiltro() // rellena Proceso/Máquina y detecta "aún no hay registros" antes de pintar
      await this.cargar()
    }

    destroy() {
      clearTimeout(this._debounce)
      if (this._onClick) this._root?.removeEventListener("click", this._onClick)
      if (this._onError) this._root?.querySelector("#cpTbody")?.removeEventListener("error", this._onError, true)
      if (this._onKey) document.removeEventListener("keydown", this._onKey)
      this._onClick = this._onError = this._onKey = null
      this._seq++ // descarta respuestas en vuelo
      this._drawerSeq++
      Object.values(this.charts).forEach(c => c?.destroy())
      this.charts = {}
      document.getElementById("cpLightbox")?.remove()
    }

    /* ─────────────── utilidades ─────────────── */

    // La API solo acepta anular a ADMIN, ADMIN_TI y CALIDAD (permiso "borrar"): se oculta el botón al resto para no ofrecer
    // una acción que será rechazada. Es solo presentación; la validación real sigue siendo la del servidor.
    puedeAnular() {
        const rol = (sessionStorage.getItem("rolUsuario") || "").toLowerCase();
        return ["admin", "admin_ti", "calidad"].includes(rol);
    }

    esc(v) {
      return String(v ?? "")
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;").replaceAll("'", "&#039;")
    }

    $(id) { return this._root?.querySelector("#" + id) }

    num(v) { return Number(v || 0).toLocaleString("es-CL") }

    pct(n, total) { return total > 0 ? `${(Math.round((n / total) * 1000) / 10).toLocaleString("es-CL")}%` : "0%" }

    // "2026-11-23T10:30:00" → "23-11-2026 10:30" (sin pasar por Date: la hora ya es local de planta).
    fecha(valor, conHora = true) {
      const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
      if (!m) return "—"
      return conHora && m[4] ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}` : `${m[3]}-${m[2]}-${m[1]}`
    }

    badge(color) {
      const c = ClasificacionPalletsController.COLORES[color]
      return c ? `<span class="cp-badge ${c.clase}">${c.nombre}</span>` : `<span class="cp-estado">${this.esc(color)}</span>`
    }

    async llamar(action, data = {}) {
      try {
        const res = await window.PhotinoBridge.send({ action, data })
        if (!res || res.ok === false) return { ok: false, error: res?.error || "No se pudo completar la consulta" }
        return { ok: true, data: res.data }
      } catch (err) {
        return { ok: false, error: err?.message || "Error de comunicación" }
      }
    }

    // Filtros → payload del backend. El texto de búsqueda se interpreta: N-N = pallet, otra cosa = NP.
    params() {
      const f = this.filtros
      const p = { vista: f.vista }
      if (f.desde) p.desde = f.desde
      if (f.hasta) p.hasta = f.hasta
      if (f.color) p.color = f.color
      if (f.procesoId) p.procesoId = Number(f.procesoId)
      if (f.maquinaId) p.maquinaId = Number(f.maquinaId)
      if (f.defectoId) p.defectoId = Number(f.defectoId)
      const q = f.buscar.trim()
      if (q) { if (/^\d+-\d+$/.test(q)) p.palletCodigo = q; else p.np = q }
      if (f.vista === "eventos" && f.incluirAnuladas) p.incluirAnuladas = true
      return p
    }

    /* ─────────────── eventos ─────────────── */

    bindEventos() {
      this._onClick = e => {
        const t = e.target.closest("[data-cp-vista],[data-cp-periodo],[data-cp-color],[data-cp-pag],[data-cp-fila],[data-cp-foto],[data-cp-quitar],[data-cp-anular],[data-cp-anular-ok],[data-cp-anular-no],[data-cp-cerrar],[data-cp-accion],#cpBtnActualizar,#cpBtnExportar,#cpBtnLimpiar,#cpOverlay")
        if (!t) return
        if (t.dataset.cpVista) return this.cambiarVista(t.dataset.cpVista)
        if (t.dataset.cpPeriodo !== undefined) return this.cambiarPeriodo(Number(t.dataset.cpPeriodo))
        if (t.dataset.cpColor !== undefined) { this.filtros.color = t.dataset.cpColor; return this.aplicarFiltros() }
        if (t.dataset.cpPag) { this.pagina = Number(t.dataset.cpPag); return this.cargarTabla() }
        if (t.dataset.cpFoto) { e.stopPropagation(); return this.verFoto(t.dataset.cpFoto) }
        if (t.dataset.cpQuitar === "defecto") { this.filtros.defectoId = ""; this.filtros.defectoNombre = ""; return this.aplicarFiltros() }
        if (t.dataset.cpAnular) return this.abrirFormAnular(Number(t.dataset.cpAnular))
        if (t.dataset.cpAnularNo !== undefined) return this.cerrarFormAnular()
        if (t.dataset.cpAnularOk) return this.confirmarAnular(Number(t.dataset.cpAnularOk))
        if (t.dataset.cpAccion === "limpiar") return this.limpiar()
        if (t.dataset.cpAccion === "todo") return this.cambiarPeriodo(0)
        if (t.dataset.cpAccion === "reintentar") return this.cargar()
        if (t.dataset.cpFila) return this.abrirDetalle(Number(t.dataset.cpFila))
        if (t.dataset.cpCerrar !== undefined || t.id === "cpOverlay") return this.cerrarDetalle()
        if (t.id === "cpBtnActualizar") { this.cargarOpcionesFiltro(); return this.cargar() }
        if (t.id === "cpBtnExportar") return this.exportar()
        if (t.id === "cpBtnLimpiar") return this.limpiar()
      }
      this._root.addEventListener("click", this._onClick)

      // Foto que no carga (URL firmada vencida o archivo ausente): se reemplaza por el marcador "sin foto".
      this._onError = e => {
        if (e.target.tagName !== "IMG") return
        e.target.replaceWith(this.marcadorSinFoto("Foto no disponible (actualiza para renovar el enlace)"))
      }
      this.$("cpTbody").addEventListener("error", this._onError, true)

      this._onKey = e => {
        if (e.key === "Escape") { if (document.getElementById("cpLightbox")) this.cerrarFoto(); else this.cerrarDetalle() }
        else if (e.key === "Enter" && e.target.matches?.("tr[data-cp-fila]")) this.abrirDetalle(Number(e.target.dataset.cpFila))
      }
      document.addEventListener("keydown", this._onKey)

      this.$("cpProceso").addEventListener("change", e => { this.filtros.procesoId = e.target.value; this.aplicarFiltros() })
      this.$("cpMaquina").addEventListener("change", e => { this.filtros.maquinaId = e.target.value; this.aplicarFiltros() })
      this.$("cpAnuladas").addEventListener("change", e => { this.filtros.incluirAnuladas = e.target.checked; this.aplicarFiltros() })
      const buscar = this.$("cpBuscar")
      buscar.addEventListener("input", () => {
        clearTimeout(this._debounce)
        this._debounce = setTimeout(() => { this.filtros.buscar = buscar.value; this.aplicarFiltros() }, 450)
      })
      buscar.addEventListener("keydown", e => {
        if (e.key === "Enter") { clearTimeout(this._debounce); this.filtros.buscar = buscar.value; this.aplicarFiltros() }
      })
    }

    initFechas() {
      if (!window.flatpickr) return
      const cfg = campo => ({
        dateFormat: "Y-m-d", altInput: true, altFormat: "d-m-Y", allowInput: true,
        onChange: (_sel, str) => {
          this.filtros[campo] = str || ""
          this.filtros.periodo = null // fechas manuales: ningún atajo de período queda activo
          this.aplicarFiltros()
        },
      })
      flatpickr(this.$("cpDesde"), cfg("desde"))
      flatpickr(this.$("cpHasta"), cfg("hasta"))
    }

    cambiarVista(vista) {
      this.filtros.vista = vista === "eventos" ? "eventos" : "vigentes"
      if (this.filtros.vista === "vigentes") this.filtros.incluirAnuladas = false
      this.aplicarFiltros()
    }

    cambiarPeriodo(dias) {
      this.aplicarPeriodo(dias, true)
      this.aplicarFiltros()
    }

    // Atajo de período: fija "desde" (hoy − N días) y deja "hasta" abierto.
    aplicarPeriodo(dias, tocarCampos) {
      this.filtros.periodo = dias
      this.filtros.desde = dias ? window.DateUtils.sumarDias(window.DateUtils.hoyISO(), -dias) : ""
      this.filtros.hasta = ""
      if (tocarCampos !== false) this.sincronizarFechas()
    }

    sincronizarFechas() {
      const set = (id, v) => {
        const el = this.$(id)
        if (!el) return
        if (el._flatpickr) { v ? el._flatpickr.setDate(v, false) : el._flatpickr.clear(false) } else el.value = v
      }
      set("cpDesde", this.filtros.desde)
      set("cpHasta", this.filtros.hasta)
    }

    // Refleja el estado de `filtros` en los controles (chips, segmento, combos, checkbox).
    sincronizarControles() {
      const f = this.filtros
      this._root.querySelectorAll("[data-cp-vista]").forEach(b => b.classList.toggle("active", b.dataset.cpVista === f.vista))
      this._root.querySelectorAll("[data-cp-periodo]").forEach(b => b.classList.toggle("active", f.periodo !== null && Number(b.dataset.cpPeriodo) === f.periodo))
      this._root.querySelectorAll("[data-cp-color]").forEach(b => b.classList.toggle("active", b.dataset.cpColor === f.color))
      this.$("cpProceso").value = f.procesoId
      this.$("cpMaquina").value = f.maquinaId
      const chk = this.$("cpAnuladas")
      chk.checked = f.incluirAnuladas
      chk.disabled = f.vista !== "eventos"
      this.$("cpAnuladasWrap").classList.toggle("off", f.vista !== "eventos")

      const activos = this.$("cpActivos")
      activos.hidden = !f.defectoId
      activos.innerHTML = f.defectoId
        ? `<span class="cp-tag">Defecto: ${this.esc(f.defectoNombre || f.defectoId)}<button type="button" data-cp-quitar="defecto" title="Quitar filtro" aria-label="Quitar filtro de defecto">×</button></span>`
        : ""
    }

    limpiar() {
      Object.assign(this.filtros, { color: "", procesoId: "", maquinaId: "", buscar: "", defectoId: "", defectoNombre: "", incluirAnuladas: false })
      this.$("cpBuscar").value = ""
      this.aplicarPeriodo(30, true)
      this.aplicarFiltros()
    }

    aplicarFiltros() {
      this.pagina = 1
      this.sincronizarControles()
      return this.cargar()
    }

    /* ─────────────── carga de datos ─────────────── */

    // Combos Proceso/Máquina: todo el universo (sin filtros), una sola consulta de resumen.
    async cargarOpcionesFiltro() {
      const r = await this.llamar("clasificacionPallets.resumen", { vista: "eventos" })
      if (!r.ok || !this._root) return
      this._globalVacio = Number(r.data?.totales?.total || 0) === 0
      const llenar = (id, items) => {
        const sel = this.$(id)
        if (!sel) return
        const actual = sel.value
        const base = sel.options[0].outerHTML
        sel.innerHTML = base + [...(items || [])]
          .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"))
          .map(i => `<option value="${this.esc(i.id)}">${this.esc(i.nombre)}</option>`).join("")
        sel.value = actual
      }
      llenar("cpProceso", r.data?.porProceso)
      llenar("cpMaquina", r.data?.porMaquina)
    }

    async cargar() {
      const seq = ++this._seq
      this._root.classList.add("cp-cargando")
      this.mostrarError("")
      this.pintarEsqueletoTabla()

      const p = this.params()
      const [resumen, defectos, lista] = await Promise.all([
        this.llamar("clasificacionPallets.resumen", p),
        this.llamar("clasificacionPallets.defectos", p),
        this.llamar("clasificacionPallets.list", { ...p, pagina: this.pagina, limite: ClasificacionPalletsController.LIMITE }),
      ])
      if (seq !== this._seq) return // llegó tarde: ya hay una consulta más nueva
      this._root.classList.remove("cp-cargando")

      const falla = [resumen, defectos, lista].find(r => !r.ok)
      if (falla) this.mostrarError(`No se pudo cargar la información: ${falla.error}`, true)

      this.pintarKpisYGraficos(resumen.ok ? resumen.data : null, defectos.ok ? defectos.data : null)
      this.pintarTabla(lista.ok ? lista.data : null, lista.ok ? null : lista.error)
      this.$("cpActualizado").textContent = `Actualizado ${new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`

      if (resumen.ok) this.cargarAntiguedadAzul(seq, resumen.data?.totales)
    }

    // Solo cambia de página: no vuelve a pedir resumen ni defectos.
    async cargarTabla() {
      const seq = ++this._seq
      this.pintarEsqueletoTabla()
      const lista = await this.llamar("clasificacionPallets.list", { ...this.params(), pagina: this.pagina, limite: ClasificacionPalletsController.LIMITE })
      if (seq !== this._seq) return
      this.pintarTabla(lista.ok ? lista.data : null, lista.ok ? null : lista.error)
      this.$("cpTabla")?.scrollIntoView({ block: "nearest" })
    }

    // Antigüedad del AZUL pendiente más viejo: solo en vista "vigentes" y si caben en una página de 200 (si no, sería inexacto).
    async cargarAntiguedadAzul(seq, totales) {
      const azul = Number(totales?.azul || 0)
      const sub = this.$("cpKAzulSub")
      if (!sub || this.filtros.vista !== "vigentes" || azul === 0 || azul > 200) return
      const r = await this.llamar("clasificacionPallets.list", { ...this.params(), color: "AZUL", pagina: 1, limite: 200 })
      if (seq !== this._seq || !r.ok) return
      const fechas = (r.data?.items || []).map(i => String(i.clasificadoEn || "").slice(0, 10)).filter(Boolean).sort()
      if (!fechas.length) return
      const [a, m, d] = fechas[0].split("-").map(Number)
      const hoy = window.DateUtils.hoyISO().split("-").map(Number)
      const dias = Math.round((Date.UTC(hoy[0], hoy[1] - 1, hoy[2]) - Date.UTC(a, m - 1, d)) / 86400000)
      sub.textContent = `${this.pct(azul, Number(totales.total))} del total · más antiguo: ${dias} ${dias === 1 ? "día" : "días"}`
    }

    mostrarError(texto, reintentar = false) {
      const el = this.$("cpError")
      el.hidden = !texto
      el.innerHTML = texto ? `<span>${this.esc(texto)}</span>${reintentar ? '<button class="btn-secondary" type="button" data-cp-accion="reintentar">Reintentar</button>' : ""}` : ""
    }

    /* ─────────────── KPIs y gráficos ─────────────── */

    pintarKpisYGraficos(resumen, defectos) {
      const t = resumen?.totales
      const total = Number(t?.total || 0)
      const set = (id, v) => { const el = this.$(id); if (el) el.textContent = v }

      set("cpKTotal", resumen ? this.num(total) : "—")
      set("cpKTotalSub", resumen ? (this.filtros.vista === "vigentes" ? "con clasificación vigente" : "eventos de clasificación") : "")
      set("cpKVerde", resumen ? this.num(t.verde) : "—")
      set("cpKVerdeSub", resumen ? `${this.pct(t.verde, total)} del total` : "")
      set("cpKAzul", resumen ? this.num(t.azul) : "—")
      set("cpKAzulSub", resumen ? `${this.pct(t.azul, total)} del total` : "")
      set("cpKRojo", resumen ? this.num(t.rojo) : "—")
      set("cpKRojoSub", resumen ? `${this.pct(t.rojo, total)} del total` : "")

      const pareto = this.armarPareto(defectos)
      set("cpKDefecto", pareto.length ? pareto[0].nombre : (defectos ? "Sin defectos" : "—"))
      set("cpKDefectoSub", pareto.length ? `${this.num(pareto[0].cantidad)} ${pareto[0].cantidad === 1 ? "pallet" : "pallets"}` : "")

      // Un gráfico sin datos explica por qué: no disponible (la consulta falló), sin registros en absoluto o sin coincidencias.
      const mensaje = falla => falla ? "No disponible" : this._globalVacio ? "Aún no hay clasificaciones registradas" : "Sin datos para los filtros seleccionados"
      const msgResumen = mensaje(!resumen)
      this.graficoTendencia(resumen?.porDia, msgResumen)
      this.graficoBarrasApiladas("cpGProceso", resumen?.porProceso, "procesoId", msgResumen)
      this.graficoBarrasApiladas("cpGMaquina", [...(resumen?.porMaquina || [])].sort((a, b) => b.total - a.total).slice(0, 10), "maquinaId", msgResumen)
      this.graficoPareto(pareto, !defectos ? "No disponible" : this._globalVacio ? msgResumen : "Sin defectos registrados para los filtros seleccionados")
    }

    armarPareto(defectos) {
      const acum = new Map()
      for (const d of defectos?.porDefecto || []) {
        const x = acum.get(d.defectoId) || { id: d.defectoId, nombre: d.nombre, cantidad: 0 }
        x.cantidad += Number(d.cantidad || 0)
        acum.set(d.defectoId, x)
      }
      return [...acum.values()].sort((a, b) => b.cantidad - a.cantidad)
    }

    // Prepara el canvas de un gráfico: destruye el anterior y marca el estado vacío si no hay datos.
    prepararCanvas(id, hayDatos, msg) {
      this.charts[id]?.destroy()
      delete this.charts[id]
      const cont = this.$(id)
      cont.classList.toggle("sin-datos", !hayDatos)
      cont.querySelector(".cp-vacio").textContent = msg
      return hayDatos ? cont.querySelector("canvas") : null
    }

    seriesColor(datos) {
      const C = ClasificacionPalletsController.COLORES
      return [
        { label: `${C.AZUL.nombre} (${C.AZUL.sig})`, data: datos.map(d => Number(d.azul || 0)), backgroundColor: C.AZUL.hex, borderRadius: 3 },
        { label: `${C.ROJO.nombre} (${C.ROJO.sig})`, data: datos.map(d => Number(d.rojo || 0)), backgroundColor: C.ROJO.hex, borderRadius: 3 },
        { label: `${C.VERDE.nombre} (${C.VERDE.sig})`, data: datos.map(d => Number(d.verde || 0)), backgroundColor: C.VERDE.hex, borderRadius: 3 },
      ]
    }

    opcionesBase(extra = {}) {
      return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } } },
        ...extra,
      }
    }

    graficoTendencia(porDia, msg) {
      const datos = [...(porDia || [])].sort((a, b) => String(a.dia).localeCompare(String(b.dia)))
      const canvas = this.prepararCanvas("cpGTendencia", datos.length > 0, msg)
      if (!canvas) return
      this.charts.cpGTendencia = new Chart(canvas, {
        type: "bar",
        data: { labels: datos.map(d => this.fecha(d.dia, false).slice(0, 5)), datasets: this.seriesColor(datos) },
        options: this.opcionesBase({
          scales: { x: { stacked: true, ticks: { maxTicksLimit: 12, font: { size: 11 } }, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
        }),
      })
    }

    // Barras horizontales apiladas por color; clic en una barra aplica ese proceso/máquina como filtro.
    graficoBarrasApiladas(id, items, campoFiltro, msg) {
      const datos = (items || []).filter(i => Number(i.total) > 0)
      const canvas = this.prepararCanvas(id, datos.length > 0, msg)
      if (!canvas) return
      const cont = this.$(id)
      cont.style.height = `${Math.max(250, datos.length * 30 + 90)}px`
      this.charts[id] = new Chart(canvas, {
        type: "bar",
        data: { labels: datos.map(d => d.nombre || "—"), datasets: this.seriesColor(datos) },
        options: this.opcionesBase({
          indexAxis: "y",
          scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true, ticks: { autoSkip: false, font: { size: 11 } }, grid: { display: false } } },
          onHover: (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default" },
          onClick: (_e, els) => {
            if (!els.length) return
            this.filtros[campoFiltro] = String(datos[els[0].index].id)
            this.aplicarFiltros()
          },
        }),
      })
    }

    graficoPareto(pareto, msg) {
      const top = pareto.slice(0, 8)
      const canvas = this.prepararCanvas("cpGDefectos", top.length > 0, msg)
      if (!canvas) return
      const totalDef = pareto.reduce((s, d) => s + d.cantidad, 0)
      let acum = 0
      const linea = top.map(d => { acum += d.cantidad; return Math.round((acum / totalDef) * 1000) / 10 })
      this.charts.cpGDefectos = new Chart(canvas, {
        data: {
          labels: top.map(d => (d.nombre.length > 22 ? d.nombre.slice(0, 21) + "…" : d.nombre)),
          datasets: [
            { type: "bar", label: "Pallets con el defecto", data: top.map(d => d.cantidad), backgroundColor: "#475569", borderRadius: 4, yAxisID: "y" },
            { type: "line", label: "% acumulado", data: linea, borderColor: "#d97706", backgroundColor: "#d97706", pointRadius: 3, tension: 0.2, yAxisID: "y1" },
          ],
        },
        options: this.opcionesBase({
          scales: {
            x: { ticks: { font: { size: 10 }, maxRotation: 40, minRotation: 0 }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { precision: 0 } },
            y1: { position: "right", min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { callback: v => `${v}%` } },
          },
          onHover: (e, els) => { e.native.target.style.cursor = els.some(x => x.datasetIndex === 0) ? "pointer" : "default" },
          onClick: (_e, els) => {
            const el = els.find(x => x.datasetIndex === 0)
            if (!el) return
            const d = top[el.index]
            this.filtros.defectoId = String(d.id)
            this.filtros.defectoNombre = d.nombre
            this.aplicarFiltros()
          },
        }),
      })
    }

    /* ─────────────── tabla ─────────────── */

    marcadorSinFoto(titulo = "Sin fotografía") {
      const d = document.createElement("div")
      d.className = "cp-nofoto"
      d.title = titulo
      d.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/><path d="M3 3l18 18"/></svg>'
      return d
    }

    pintarEsqueletoTabla() {
      const fila = `<tr class="cp-skeleton">${"<td><span></span></td>".repeat(9)}</tr>`
      this.$("cpTbody").innerHTML = fila.repeat(5)
    }

    pintarTabla(data, error) {
      const tbody = this.$("cpTbody")
      this.items = data?.items || []
      this.total = Number(data?.total || 0)
      this._itemsPorId = new Map(this.items.map(i => [i.id, i]))
      this.$("cpTablaTitulo").textContent = this.filtros.vista === "vigentes" ? "Clasificaciones vigentes" : "Todos los eventos de clasificación"
      this.$("cpTablaSub").textContent = error ? "" : `${this.num(this.total)} ${this.total === 1 ? "registro" : "registros"}`

      if (error) {
        tbody.innerHTML = `<tr class="cp-estado-fila"><td colspan="9"><strong>No se pudo cargar el listado</strong>${this.esc(error)}<br><button class="btn-secondary" type="button" data-cp-accion="reintentar">Reintentar</button></td></tr>`
        this.$("cpPaginacion").innerHTML = ""
        return
      }

      if (!this.items.length) {
        tbody.innerHTML = !this._globalVacio
          ? `<tr class="cp-estado-fila"><td colspan="9"><strong>Sin resultados para los filtros actuales</strong>Prueba ampliar el período o quitar algún filtro.<br><button class="btn-secondary" type="button" data-cp-accion="limpiar">Limpiar filtros</button> ${this.filtros.periodo !== 0 ? '<button class="btn-secondary" type="button" data-cp-accion="todo">Ver todo el historial</button>' : ""}</td></tr>`
          : `<tr class="cp-estado-fila"><td colspan="9"><strong>Aún no hay clasificaciones registradas</strong>Aparecerán aquí cuando los inspectores clasifiquen pallets desde la app móvil.</td></tr>`
        this.$("cpPaginacion").innerHTML = ""
        return
      }

      tbody.innerHTML = this.items.map(i => this.filaHtml(i)).join("")
      this.pintarPaginacion()
    }

    filaHtml(i) {
      const insp = i.inspeccion || {}
      const fps = i.fps || {}
      const np = insp.np || fps.npInnpack || ""
      const proceso = insp.proceso || fps.proceso || ""
      const maquina = insp.maquina || fps.maquina || ""
      const defectos = i.defectos || []
      const estado = i.anulado ? '<span class="cp-estado anulada">Anulada</span>' : i.vigente ? '<span class="cp-estado vigente">Vigente</span>' : '<span class="cp-estado">Histórica</span>'
      const foto = i.fotoUrl
        ? `<img class="cp-thumb" loading="lazy" alt="Foto del pallet ${this.esc(i.palletCodigo)}" src="${this.esc(i.fotoUrl)}" data-cp-foto="${this.esc(i.fotoUrl)}">`
        : this.marcadorSinFoto().outerHTML
      return `<tr class="cp-fila ${i.anulado ? "cp-anulada" : ""}" data-cp-fila="${i.id}" tabindex="0">
        <td>${foto}</td>
        <td><span class="cp-pallet">${this.esc(i.palletCodigo)}</span></td>
        <td>${this.badge(i.color)}</td>
        <td class="cp-wrap"><strong>${this.esc(np || "—")}</strong><div class="cp-sub">${this.esc(fps.producto || "")}</div></td>
        <td class="cp-wrap">${this.esc(proceso || "—")}<div class="cp-sub">${this.esc(maquina)}</div></td>
        <td>${this.esc(insp.inspector || "—")}</td>
        <td>${this.fecha(i.clasificadoEn)}</td>
        <td class="cp-wrap">${defectos.slice(0, 2).map(d => `<span class="cp-defecto">${this.esc(d.nombre)}</span>`).join("")}${defectos.length > 2 ? `<span class="cp-defecto">+${defectos.length - 2}</span>` : ""}${defectos.length ? "" : '<span class="cp-sub">—</span>'}</td>
        <td class="cp-td-estado">${estado}</td>
      </tr>`
    }

    pintarPaginacion() {
      const pag = this.$("cpPaginacion")
      const paginas = Math.max(1, Math.ceil(this.total / ClasificacionPalletsController.LIMITE))
      if (paginas <= 1) { pag.innerHTML = ""; return }
      const p = this.pagina
      const nums = new Set([1, paginas, p - 2, p - 1, p, p + 1, p + 2].filter(n => n >= 1 && n <= paginas))
      let html = `<button type="button" ${p === 1 ? "disabled" : ""} data-cp-pag="${p - 1}">‹</button>`
      let previo = 0
      for (const n of [...nums].sort((a, b) => a - b)) {
        if (n - previo > 1) html += "<span>…</span>"
        html += `<button type="button" class="${n === p ? "active" : ""}" data-cp-pag="${n}">${n}</button>`
        previo = n
      }
      html += `<button type="button" ${p === paginas ? "disabled" : ""} data-cp-pag="${p + 1}">›</button>`
      pag.innerHTML = html
    }

    /* ─────────────── detalle (panel lateral) ─────────────── */

    async abrirDetalle(id) {
      const seq = ++this._drawerSeq
      const drawer = this.$("cpDrawer")
      this.$("cpOverlay").hidden = false
      drawer.classList.add("abierto")
      drawer.setAttribute("aria-hidden", "false")
      const previo = this._itemsPorId.get(id)
      drawer.innerHTML = this.drawerCabecera(previo?.palletCodigo || "Cargando…", previo?.color) + '<div class="cp-d-body"><div class="cp-d-sinfoto">Cargando detalle…</div></div>'
      drawer.querySelector(".cp-d-cerrar")?.focus()

      // El detalle se pide siempre de nuevo: las fotos llegan con una URL firmada que vence a los ~10 min.
      const r = await this.llamar("clasificacionPallets.detalle", { id })
      if (seq !== this._drawerSeq) return
      if (!r.ok) {
        drawer.innerHTML = this.drawerCabecera("Detalle no disponible") + `<div class="cp-d-body"><div class="cp-banner cp-banner-error">${this.esc(r.error)}</div></div>`
        return
      }
      this.pintarDetalle(r.data)
    }

    cerrarDetalle() {
      this._drawerSeq++
      const drawer = this.$("cpDrawer")
      if (!drawer) return
      drawer.classList.remove("abierto")
      drawer.setAttribute("aria-hidden", "true")
      this.$("cpOverlay").hidden = true
    }

    drawerCabecera(titulo, color) {
      return `<div class="cp-d-head"><div><div class="cp-d-titulo">${this.esc(titulo)}</div><div style="margin-top:6px">${color ? this.badge(color) : ""}</div></div><button class="cp-d-cerrar" type="button" data-cp-cerrar aria-label="Cerrar panel">×</button></div>`
    }

    pintarDetalle(d) {
      const i = d
      const insp = i.inspeccion || {}
      const fps = i.fps || {}
      const hist = [...(i.historial || [])].sort((a, b) => a.id - b.id)
      const dato = (k, v) => `<div><div class="k">${k}</div><div class="v">${this.esc(v || "—")}</div></div>`
      const defectos = (i.defectos || []).map(x => `<span class="cp-defecto">${this.esc(x.nombre)}${x.criticidad ? ` · ${this.esc(x.criticidad)}` : ""}</span>`).join("")
      const etiqueta = i.nEtiqueta && fps.totalEtiquetas ? `${i.nEtiqueta} de ${fps.totalEtiquetas}` : i.nEtiqueta || ""

      const hero = i.fotoUrl
        ? `<img class="cp-d-hero" alt="Foto del pallet ${this.esc(i.palletCodigo)}" src="${this.esc(i.fotoUrl)}" data-cp-foto="${this.esc(i.fotoUrl)}">`
        : '<div class="cp-d-sinfoto">Sin fotografía en esta clasificación</div>'

      const timeline = hist.map(h => {
        const c = ClasificacionPalletsController.COLORES[h.color]
        const estado = h.anulado ? '<span class="cp-estado anulada">Anulada</span>' : h.vigente ? '<span class="cp-estado vigente">Vigente</span>' : '<span class="cp-estado">Histórica</span>'
        const foto = h.fotoUrl ? `<img class="cp-tl-foto" loading="lazy" alt="Foto de la clasificación ${h.id}" src="${this.esc(h.fotoUrl)}" data-cp-foto="${this.esc(h.fotoUrl)}">` : ""
        return `<li class="cp-tl-item ${c?.clase || ""} ${h.id === i.id ? "cp-actual" : ""}" data-cp-item="${h.id}">
          <div class="cp-tl-card">
            <div class="cp-tl-top">${this.badge(h.color)}${estado}</div>
            <div>${this.fecha(h.clasificadoEn)} · ${this.esc(h.inspeccion?.inspector || "—")}</div>
            ${h.observacion ? `<div>${this.esc(h.observacion)}</div>` : ""}
            ${(h.defectos || []).length ? `<div>${h.defectos.map(x => `<span class="cp-defecto">${this.esc(x.nombre)}</span>`).join("")}</div>` : ""}
            ${foto}
            ${h.anulado ? `<div class="cp-sub">Anulada ${this.fecha(h.anuladoEn)} por ${this.esc(h.anuladoPor || "—")}: «${this.esc(h.motivoAnulacion || "sin motivo")}»</div>` : (this.puedeAnular() ? `<button type="button" class="cp-link" data-requiere-editar data-cp-anular="${h.id}">Anular esta clasificación</button>` : "")}
            <div class="cp-anular-slot"></div>
          </div>
        </li>`
      }).join("")

      this.$("cpDrawer").innerHTML = `${this.drawerCabecera(i.palletCodigo, i.color)}
        <div class="cp-d-body">
          ${hero}
          <div class="cp-d-sec"><h4>Producto y trazabilidad</h4>
            <div class="cp-d-grid">
              ${dato("NP", insp.np || fps.npInnpack)}${dato("Orden de fabricación", fps.ordenFabricacion)}
              ${dato("Producto", fps.producto)}${dato("Código producto", fps.codigoProducto)}
              ${dato("Cliente", fps.cliente)}${dato("Cantidad (un.)", fps.cantidadUnidades != null ? this.num(fps.cantidadUnidades) : "")}
              ${dato("Proceso", insp.proceso || fps.proceso)}${dato("Máquina", insp.maquina || fps.maquina)}
              ${dato("Inspector", insp.inspector)}${dato("Turno", insp.turno)}
              ${dato("Clasificado", this.fecha(i.clasificadoEn))}${dato("Fecha de tarja", this.fecha(fps.fechaTarja))}
              ${dato("Etiqueta", etiqueta)}${dato("Operador (FPS)", fps.operador)}
            </div>
            ${fps.verificado === false ? '<div class="cp-aviso" style="margin-top:10px">FPS no estaba disponible al clasificar: los datos del producto son los que envió la app y no están verificados.</div>' : ""}
          </div>
          ${defectos ? `<div class="cp-d-sec"><h4>Defectos</h4>${defectos}</div>` : ""}
          ${i.observacion ? `<div class="cp-d-sec"><h4>Observación</h4><div class="cp-d-obs">${this.esc(i.observacion)}</div></div>` : ""}
          <div class="cp-d-sec"><h4>Historial del pallet (${hist.length})</h4><ul class="cp-timeline">${timeline || '<li class="cp-sub">Sin historial</li>'}</ul></div>
        </div>`
    }

    abrirFormAnular(id) {
      this.cerrarFormAnular()
      const slot = this.$("cpDrawer").querySelector(`[data-cp-item="${id}"] .cp-anular-slot`)
      if (!slot) return
      slot.innerHTML = `<div class="cp-anular-form">
          <div class="cp-sub">La clasificación no se borra: queda marcada como anulada. Si anulas la vigente, el pallet vuelve a su clasificación anterior (si existe).</div>
          <textarea maxlength="250" placeholder="Motivo de la anulación (obligatorio)" aria-label="Motivo de la anulación"></textarea>
          <div class="cp-err" role="alert"></div>
          <div class="cp-anular-acciones">
            <button type="button" class="btn-secondary" data-cp-anular-no>Cancelar</button>
            <button type="button" class="cp-btn-peligro" data-cp-anular-ok="${id}">Confirmar anulación</button>
          </div>
        </div>`
      slot.querySelector("textarea").focus()
    }

    cerrarFormAnular() {
      this.$("cpDrawer")?.querySelectorAll(".cp-anular-slot").forEach(s => { s.innerHTML = "" })
    }

    async confirmarAnular(id) {
      const slot = this.$("cpDrawer").querySelector(`[data-cp-item="${id}"] .cp-anular-slot`)
      const motivo = slot.querySelector("textarea").value.trim()
      const err = slot.querySelector(".cp-err")
      if (!motivo) { err.textContent = "Debes indicar el motivo de la anulación."; return }
      const btn = slot.querySelector("[data-cp-anular-ok]")
      btn.disabled = true
      btn.textContent = "Anulando…"
      const r = await this.llamar("clasificacionPallets.anular", { id, motivo })
      if (!r.ok) { err.textContent = r.error; btn.disabled = false; btn.textContent = "Confirmar anulación"; return }
      window.ToastExito?.mostrar("Clasificación anulada")
      const seq = ++this._drawerSeq
      const det = await this.llamar("clasificacionPallets.detalle", { id })
      if (seq === this._drawerSeq && det.ok) this.pintarDetalle(det.data)
      this.cargar()
    }

    /* ─────────────── foto ampliada ─────────────── */

    verFoto(url) {
      this.cerrarFoto()
      const lb = document.createElement("div")
      lb.id = "cpLightbox"
      lb.className = "cp-lightbox"
      lb.setAttribute("role", "dialog")
      lb.setAttribute("aria-label", "Fotografía ampliada")
      lb.innerHTML = `<img alt="Fotografía ampliada" src="${this.esc(url)}">`
      lb.addEventListener("click", () => this.cerrarFoto())
      lb.querySelector("img").addEventListener("error", () => { lb.querySelector("img").replaceWith(Object.assign(document.createElement("div"), { textContent: "La foto no está disponible. Cierra y actualiza para renovar el enlace.", style: "color:#fff;font-size:14px" })) })
      document.body.appendChild(lb)
    }

    cerrarFoto() { document.getElementById("cpLightbox")?.remove() }

    /* ─────────────── exportación ─────────────── */

    descripcionFiltros() {
      const f = this.filtros
      const partes = [f.vista === "vigentes" ? "Vigentes" : "Todos los eventos"]
      if (f.desde || f.hasta) partes.push(`${f.desde ? this.fecha(f.desde, false) : "inicio"} a ${f.hasta ? this.fecha(f.hasta, false) : "hoy"}`)
      if (f.color) partes.push(ClasificacionPalletsController.COLORES[f.color].nombre)
      if (f.procesoId) partes.push(`Proceso: ${this.$("cpProceso").selectedOptions[0]?.text}`)
      if (f.maquinaId) partes.push(`Máquina: ${this.$("cpMaquina").selectedOptions[0]?.text}`)
      if (f.defectoNombre) partes.push(`Defecto: ${f.defectoNombre}`)
      if (f.buscar.trim()) partes.push(`Búsqueda: ${f.buscar.trim()}`)
      return partes.join(" · ")
    }

    async exportar() {
      const btn = this.$("cpBtnExportar")
      btn.disabled = true
      const textoOriginal = btn.textContent
      btn.textContent = "Exportando…"
      try {
        // Todas las páginas que cumplen los filtros actuales (no solo la visible).
        const filas = []
        let pagina = 1
        const limite = ClasificacionPalletsController.LIMITE_EXPORT
        for (; pagina <= ClasificacionPalletsController.MAX_PAGINAS_EXPORT; pagina++) {
          const r = await this.llamar("clasificacionPallets.list", { ...this.params(), pagina, limite })
          if (!r.ok) throw new Error(r.error)
          filas.push(...(r.data?.items || []))
          if (filas.length >= Number(r.data?.total || 0) || !(r.data?.items || []).length) break
        }
        if (!filas.length) { this.mostrarError("No hay datos para exportar con los filtros actuales."); return }

        const cab = ["ID", "Pallet", "Clasificación", "Estado", "Fecha clasificación", "NP", "Orden fabricación", "Cliente", "Código producto", "Producto", "Proceso", "Máquina", "Inspector", "Turno", "Defectos", "Observación", "Con foto", "Anulada el", "Anulada por", "Motivo anulación"]
        const linea = i => {
          const insp = i.inspeccion || {}, fps = i.fps || {}
          return [
            i.id, i.palletCodigo, (ClasificacionPalletsController.COLORES[i.color]?.nombre || i.color), i.anulado ? "Anulada" : i.vigente ? "Vigente" : "Histórica",
            this.fecha(i.clasificadoEn), insp.np || fps.npInnpack || "", fps.ordenFabricacion || "", fps.cliente || "", fps.codigoProducto || "", fps.producto || "",
            insp.proceso || fps.proceso || "", insp.maquina || fps.maquina || "", insp.inspector || "", insp.turno || "",
            (i.defectos || []).map(d => d.nombre).join(", "), i.observacion || "", i.fotoUrl ? "Sí" : "No",
            i.anulado ? this.fecha(i.anuladoEn) : "", i.anulado ? (i.anuladoPor || "") : "", i.anulado ? (i.motivoAnulacion || "") : "",
          ]
        }
        const tabla = document.createElement("table")
        tabla.id = "cpExportTemp"
        tabla.style.cssText = "position:absolute;left:-99999px;top:0"
        tabla.innerHTML = `<thead><tr>${cab.map(c => `<th>${this.esc(c)}</th>`).join("")}</tr></thead><tbody>${filas.map(f => `<tr>${linea(f).map(c => `<td>${this.esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>`
        document.body.appendChild(tabla)
        try {
          window.ExcelExporter.exportTable({
            tableSelector: "#cpExportTemp",
            fileName: `qcc_clasificacion_pallets_${Date.now()}.xlsx`,
            sheetName: "Clasificación de Pallets",
            title: `QCC - Clasificación de Pallets · ${this.descripcionFiltros()}`,
          })
        } finally { tabla.remove() }
      } catch (err) {
        this.mostrarError(`No se pudo exportar: ${err.message}`)
      } finally {
        btn.disabled = false
        btn.textContent = textoOriginal
      }
    }
  }
}
