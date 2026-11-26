if (!window.TrazabilidadController) {
  // Datos de una fuente caída o inexistente: nunca se muestran como cero.
  const ND = "No disponible"
  const SI = "SIN INFORMACIÓN"
  const ESTADO_DOC = { PENDIENTE: ["#b45309", "Pendiente"], DISPONIBLE: ["#15803d", "Disponible"], EN_REVISION: ["#b45309", "En revisión"], NO_DIGITALIZADO: ["#c2410c", "No digitalizado"], NO_APLICA: ["#64748b", "No aplica"] }

  // Procesos del formato REG-SGI-TDP-V05, en el orden del documento. `balance` = nombre en la tabla de balance.
  const PROCESOS_V05 = [
    { clave: "corte", titulo: "CORTE Y DIMENSIONADO", balance: "Corte", re: /corte|dimension/i,
      columnas: ["Fecha", "Operador", "Máquina", "Pliegos Solicitados", "Tipo sustrato", "Medida", "Pliegos Cortado", "Lotes"], pesos: [2, 3, 3, 2, 4, 2, 2, 4] },
    { clave: "impresion", titulo: "IMPRESIÓN OFFSET", balance: "Impresión Offset", re: /impres|offset/i,
      columnas: ["FECHA", "IMPRESIÓN", "MÁQUINA", "OPERADOR", "TINTAS", "BARNIZ", "PLIEGOS"], pesos: [2, 2, 2, 3, 7, 4, 2] },
    { clave: "folia", titulo: "FOLIA", balance: "Folia", re: /folia/i,
      columnas: ["FECHA", "MÁQUINA", "OPERADOR", "N° PLIEGO", "N° PERFIL", "PLIEGOS PROCESADOS"], pesos: [2, 3, 3, 2, 3, 3] },
    { clave: "corrugado", titulo: "CORRUGADO", balance: "Corrugado", re: /corrug/i,
      columnas: ["FECHA", "MÁQUINA", "OPERADOR", "N° PLIEGO", "PLIEGOS PROCESADOS"], pesos: [2, 4, 5, 2, 3] },
    { clave: "emplacado", titulo: "EMPLACADO", balance: "Emplacado", re: /emplac/i,
      columnas: ["FECHA", "MÁQUINA", "OPERADOR", "N° PLIEGO", "PLIEGOS PROCESADOS"], pesos: [2, 4, 5, 2, 3] },
    { clave: "troquelado", titulo: "TROQUELADO", balance: "Troquelado", re: /troquel/i,
      columnas: ["FECHA", "MÁQUINA", "OPERADOR", "N° PLIEGO", "N° PERFIL", "PLIEGOS PROCESADOS", "CANTIDAD DE UNIDADES"], pesos: [2, 3, 4, 2, 2, 3, 3] },
    { clave: "pegado", titulo: "PEGADO", balance: "Pegado", enUnidades: true, re: /pegad/i,
      columnas: ["FECHA", "MÁQUINA", "OPERADOR", "CAJAS", "ADHESIVOS", "PLIEGOS PROCESADOS", "CANTIDAD DE UNIDADES"], pesos: [2, 3, 3, 2, 3, 3, 3] },
    { clave: "termoformado", titulo: "TERMOFORMADO", balance: "Termoformado", enUnidades: true, re: /termof/i,
      columnas: ["FECHA", "MÁQUINA", "OPERADOR", "PRODUCIDO (REGISTRADO FPS)"], pesos: [2, 4, 5, 4] },
  ]

  class TrazabilidadController {
    constructor() {
      this._clickHandler = null
      this._keyHandler = null
      this._inputHandler = null
      this._consultaId = 0
      this._tab = "resumen"
    }

    // ── Panel de inicio: buscador, últimas NP consultadas y estado de las fuentes de la ÚLTIMA consulta (no se simulan métricas globales) ──
    montarPanel() {
      this._panel = window.NpDash.montar(document.getElementById("trzDash"), {
        p: "trz",
        buscar: { placeholder: "Consultar la trazabilidad de una NP (Ej: 22443)", boton: "Consultar", onBuscar: np => { document.getElementById("trzNp").value = np; this.consultar() } },
        extra: `<div class="npd-charts">
          <div class="card npd-panel"><div class="npd-h">Últimas NP consultadas</div><div class="npd-hs">Se guardan solo en este equipo</div><div id="trzRec" class="npd-lista"></div></div>
          <div class="card npd-panel"><div class="npd-h">Estado de las fuentes</div><div class="npd-hs" id="trzSrcSub"></div><div id="trzSrc" class="npd-fuentes"></div></div>
        </div>
        <div class="card npd-panel"><div class="npd-h">Qué muestra la trazabilidad</div>
          <ul class="npd-info">
            <li>Procesos y corridas registrados en FPS por el operador, con su máquina, fecha y cantidad declarada.</li>
            <li>Liberaciones de Calidad (solo folios cerrados a productos terminados) y despachos de SAP, sin repartir cantidades entre líneas.</li>
            <li>Balance de masas provisional: una diferencia entre procesos <b>no</b> se clasifica sola como merma ni destrucción.</li>
            <li>Informe oficial REG-SGI-TDP-V05 en PDF y Excel, con las horas reales de inicio y término.</li>
          </ul>
          <div style="margin-top:10px;"><button class="btn-secondary" type="button" data-trz-ir-lote>Buscar por lote de material (SAP)</button></div>
        </div>`,
      })
      this.renderPanel()
    }

    leerLocal(clave) {
      try { return JSON.parse(localStorage.getItem(clave) || "null") } catch (e) { return null }
    }

    guardarReciente(np, data) {
      try {
        const lista = (this.leerLocal("qcc_trz_recientes") || []).filter(x => x.np !== np)
        lista.unshift({ np, fecha: new Date().toISOString() })
        localStorage.setItem("qcc_trz_recientes", JSON.stringify(lista.slice(0, 8)))
        const f = data?.fuentes
        const ok = x => (x ? !!x.ok : null)
        localStorage.setItem("qcc_trz_fuentes", JSON.stringify({
          np, fecha: new Date().toISOString(),
          fps: f ? ok(f.fps) : false,
          sap: f ? ok(f.sapNotaVenta) && ok(f.sapDespachos) && ok(f.sapConsumos) : false,
          qcs: f ? ok(f.liberaciones) : false,
        }))
      } catch (e) { /* sin almacenamiento local: el panel simplemente no recuerda */ }
    }

    renderPanel() {
      const rec = document.getElementById("trzRec")
      if (!rec) return
      const lista = this.leerLocal("qcc_trz_recientes") || []
      rec.innerHTML = lista.length
        ? lista.map(x => `<button type="button" class="npd-chip" data-trz-np="${this.esc(x.np)}" title="${this.esc(new Date(x.fecha).toLocaleString("es-CL"))}">NP ${this.esc(x.np)}</button>`).join("")
        : `<span class="subtitle">Aún no has consultado ninguna NP. Escribe una arriba para hacer la primera consulta.</span>`
      const f = this.leerLocal("qcc_trz_fuentes")
      const punto = v => (v === null || v === undefined ? "" : v ? "ok" : "bad")
      const txt = v => (v === null || v === undefined ? "Sin comprobar" : v ? "Disponible" : "No disponible")
      document.getElementById("trzSrcSub").textContent = f ? `Comprobado en la consulta de la NP ${f.np} (${new Date(f.fecha).toLocaleString("es-CL")})` : "Se comprueba cada vez que consultas una NP"
      document.getElementById("trzSrc").innerHTML = [["FPS", f?.fps], ["SAP", f?.sap], ["Calidad (QCS)", f?.qcs]]
        .map(([n, v]) => `<div class="npd-fuente"><span class="npd-punto ${punto(v)}"></span><div><b>${n}</b><div class="subtitle">${txt(v)}</div></div></div>`).join("")
    }

    vista(detalle) {
      document.getElementById("trzDash").style.display = detalle ? "none" : ""
      document.getElementById("trzVista").style.display = detalle ? "" : "none"
      document.getElementById("btnTrzPanel").style.display = detalle ? "" : "none"
      if (!detalle) this.renderPanel()
    }

    async init() {
      console.log("INIT TRAZABILIDAD")
      this.bindEvents()
      this.montarPanel()
      const ctx = window.CalidadNp?.tomarContexto?.("trazabilidad")
      if (ctx) await this.abrirContexto(ctx)
    }

    // Llegada desde otro módulo con la NP, el ítem y la pestaña ya elegidos.
    async abrirContexto(ctx) {
      this._tab = ctx.tab || "resumen"
      this._itemPedido = ctx.item ?? null
      document.getElementById("trzNp").value = ctx.np
      await this.consultar()
    }

    // NP e ítem elegidos en la ficha, para continuar en otro módulo.
    contextoNp() {
      const items = this._integral?.data?.items || []
      const k = Number(document.getElementById("trzFichaItem")?.value || 0)
      return { np: this._integral?.data ? this._integral.np : null, item: items[k]?.item ?? null }
    }

    bindEvents() {
      if (this._clickHandler) return

      this._clickHandler = (e) => {
        if (e.target.id === "btnTrzPanel") this.vista(false)
        if (e.target.closest?.("[data-trz-ir-lote]")) { this.vista(true); document.getElementById("trzLote")?.focus() }
        if (e.target.id === "btnTrzConsultar") {
          this.consultar()
        }
        if (e.target.id === "btnTrzImprimir") {
          this.imprimirReporte()
        }
        if (e.target.id === "btnTrzBuscarLote") {
          this.buscarLote()
        }
        if (e.target.id === "btnTrzPdf") {
          this.generarInformePdf()
        }
        if (e.target.id === "btnTrzGuardarInforme") {
          this.guardarInforme()
        }
        if (e.target.id === "btnTrzExcel") {
          this.exportarExcelNp()
        }
        if (e.target.id === "btnTrzExcelV05") {
          this.exportarExcelV05()
        }
        if (e.target.id === "btnTrzLoteExcel") {
          this.exportarExcelLote()
        }
        const tab = e.target.closest?.("[data-trz-ir]")
        if (tab) this.activarTab(tab.getAttribute("data-trz-ir"))
        if (e.target.id === "btnTrzBuscarTexto") this.buscarTexto()
        if (e.target.id === "btnTrzLimpiar") this.limpiarConsulta()
        if (e.target.id === "btnTrzVersiones") this.verVersiones()
        const abrirNp = e.target.closest?.("[data-trz-abrir-np]")
        if (abrirNp) { document.getElementById("trzNp").value = abrirNp.dataset.trzAbrirNp; document.getElementById("btnTrzConsultar").click() }
        const informe = e.target.closest?.("[data-trz-informe]")
        if (informe) this.abrirVersion(Number(informe.dataset.trzInforme))
        const proc = e.target.closest?.("[data-trz-proceso]")
        if (proc) this.verProceso(proc.dataset.trzProceso)
        const corrida = e.target.closest?.("[data-trz-corrida]")
        if (corrida) this.verRegistroOriginal(corrida.dataset.trzCorrida)
        const adj = e.target.closest?.("[data-trz-adjunto]")
        if (adj) this.abrirAdjuntosSap(adj)
        const lote = e.target.closest?.("[data-trz-lote]")
        if (lote) {
          document.getElementById("trzLote").value = lote.getAttribute("data-trz-lote")
          this.buscarLote()
        }
        if (e.target.id === "btnTrzZip") this.descargarZip()
        if (e.target.id === "btnTrzAuditoria") this.verAuditoria()
        const bd = e.target.closest?.("[data-trzdoc]")
        if (bd) this.accionDoc(bd)
        const bf = e.target.closest?.("[data-trzfac]")
        if (bf) this.accionFactor(bf)
        const np = e.target.closest?.("[data-trz-np]")
        if (np) {
          document.getElementById("trzNp").value = np.getAttribute("data-trz-np")
          this.consultar()
        }
      }
      document.addEventListener("click", this._clickHandler)

      this._keyHandler = (e) => {
        if (e.key === "Enter" && document.activeElement?.id === "trzNp") {
          this.consultar()
        }
        if (e.key === "Enter" && document.activeElement?.id === "trzLote") {
          this.buscarLote()
        }
      }
      document.addEventListener("keydown", this._keyHandler)
    }

    async consultar() {
      const np = document.getElementById("trzNp")?.value?.trim()
      if (!np) {
        alert("Ingresa un NP")
        return
      }

      this.vista(true)
      const id = ++this._consultaId
      const estadoEl = document.getElementById("trzEstadoConexion")
      const resultadoEl = document.getElementById("trzResultado")
      estadoEl.style.display = "none"
      resultadoEl.style.display = "none"
      document.getElementById("trzLoteResultado").style.display = "none"
      this._integral = null

      // La trazabilidad integral corre en paralelo y no bloquea la de Planificación (ni al revés).
      const integral = this.consultarIntegral(np, id)

      try {
        const res = await window.PhotinoBridge.send({
          action: "trazabilidad.consultarNp",
          data: { np }
        })

        if (!res || res.ok === false) {
          throw new Error(res?.error || "Error consultando la NP")
        }

        const { procesos, paletizado, avisoPlanificacion } = res.data

        if (avisoPlanificacion) {
          estadoEl.textContent = avisoPlanificacion
          estadoEl.style.display = "block"
        }

        const sinPlanificacion = !!avisoPlanificacion && !procesos?.length
        this._ultimaConsulta = { np, procesos, paletizado, sinPlanificacion }

        this.renderResumen(sinPlanificacion ? null : procesos)
        this.renderProcesos(sinPlanificacion ? null : procesos)
        this.renderPaletizado(paletizado)
      } catch (err) {
        console.error("Error consultando trazabilidad:", err)
        estadoEl.textContent = "Planificación FARET: " + (err.message || "Error consultando la NP")
        estadoEl.style.display = "block"
        this._ultimaConsulta = { np, procesos: [], paletizado: null, sinPlanificacion: true }
        this.renderResumen(null)
        this.renderProcesos(null)
        this.renderPaletizado(null)
      }
      if (id === this._consultaId) resultadoEl.style.display = "block"
      await integral
    }

    // procesos = null: Planificación no respondió (no equivale a cero procesos).
    renderResumen(procesos) {
      if (!procesos) {
        for (const id of ["trzCliente", "trzProducto", "trzCantidad", "trzPlanificados", "trzPendientes"])
          document.getElementById(id).textContent = "No disponible"
        return
      }
      const cliente = procesos[0]?.cli || "-"
      const producto = procesos[0]?.itemName || "-"
      const cantidad = procesos[0]?.cant ?? "-"
      const planificados = procesos.filter(p => p.est === "Planificada").length
      const pendientes = procesos.filter(p => p.est === "No Planificado").length

      document.getElementById("trzCliente").textContent = cliente
      document.getElementById("trzProducto").textContent = producto
      document.getElementById("trzCantidad").textContent = cantidad
      document.getElementById("trzPlanificados").textContent = planificados
      document.getElementById("trzPendientes").textContent = pendientes
    }

    renderProcesos(procesos) {
      const body = document.getElementById("trzProcesosBody")

      if (!procesos) {
        body.innerHTML = '<tr><td colspan="8" style="text-align:center;">Planificación FARET no disponible: no se pudo consultar (no equivale a sin procesos)</td></tr>'
        return
      }
      if (procesos.length === 0) {
        body.innerHTML = '<tr><td colspan="8" style="text-align:center;">Sin procesos encontrados en Planificación FARET para este NP</td></tr>'
        return
      }

      body.innerHTML = procesos.map(p => `
        <tr>
          <td>${p.proc || "-"}</td>
          <td>${p.sec || "-"}</td>
          <td>${p.rec || "-"}</td>
          <td>${p.cant ?? "-"}</td>
          <td>${p.cantProd ?? "-"}</td>
          <td>${p.est || "-"}</td>
          <td>${p.ent || "-"}</td>
          <td>${this.renderMateriales(p.materiales)}</td>
        </tr>
      `).join("")
    }

    renderMateriales(materiales) {
      if (!materiales || materiales.length === 0) return "-"
      return materiales.map(m => `${m.itemName || m.itemCode}`).join("<br>")
    }

    renderPaletizado(paletizado) {
      const body = document.getElementById("trzPaletizadoBody")

      if (!paletizado) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center;">Paletizado no disponible: no se pudo consultar (no equivale a sin registros)</td></tr>'
        return
      }
      if (paletizado.length === 0) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center;">Sin registros de paletizado para este NP</td></tr>'
        return
      }

      body.innerHTML = paletizado.map(p => `
        <tr>
          <td>${this.esc(p.idPalet || "-")}</td>
          <td>${p.fecha ? new Date(p.fecha).toLocaleString("es-CL") : "-"}</td>
          <td>${this.esc(p.planta || "-")}</td>
          <td>${this.esc(p.taller || "-")}</td>
          <td>${this.esc(p.tipo || "-")}</td>
          <td>${this.esc(p.cantidad ?? "-")}</td>
          <td>${this.esc(p.descripcion || "-")}</td>
        </tr>
      `).join("")
    }

    // Reutiliza PrintExporter.printReport (mismo mecanismo ya usado en Laboratorio/No
    // Conformidades: iframe oculto + diálogo de impresión del navegador, sin librería de PDF).
    // Trae exactamente los mismos datos ya cargados en pantalla, sin volver a consultar nada.
    imprimirReporte() {
      const consulta = this._ultimaConsulta
      if (!consulta) {
        alert("Consulta un NP primero")
        return
      }

      const { np, procesos, paletizado, sinPlanificacion } = consulta

      const planificados = sinPlanificacion ? "No disponible" : procesos.filter(p => p.est === "Planificada").length
      const pendientes = sinPlanificacion ? "No disponible" : procesos.filter(p => p.est === "No Planificado").length

      window.PrintExporter.printReport({
        empresa: "INNPACK",
        titulo: `Trazabilidad NP ${np}`,
        totalRegistros: procesos.length,
        resumen: [
          { label: "Cliente", valor: procesos[0]?.cli || "-" },
          { label: "Producto", valor: procesos[0]?.itemName || "-" },
          { label: "Cantidad NP", valor: procesos[0]?.cant ?? "-" },
          { label: "Procesos planificados", valor: planificados },
          { label: "Procesos pendientes", valor: pendientes },
        ],
        tablas: [
          {
            titulo: "Trazabilidad de Planificación (procesos)",
            columnas: ["Proceso", "Sección", "Máquina", "Cantidad", "Cant. Producida", "Estado", "Fecha Entrega", "Materiales"],
            filas: procesos.length
              ? procesos.map(p => [
                  p.proc || "-",
                  p.sec || "-",
                  p.rec || "-",
                  p.cant ?? "-",
                  p.cantProd ?? "-",
                  p.est || "-",
                  p.ent || "-",
                  this.renderMateriales(p.materiales),
                ])
              : [[sinPlanificacion ? "Planificación FARET no disponible: no se pudo consultar" : "Sin procesos encontrados en Planificación FARET para este NP", "", "", "", "", "", "", ""]],
          },
          {
            titulo: "Terminaciones y Paletizado",
            columnas: ["Código Paletizado", "Fecha", "Planta", "Taller", "Tipo", "Cantidad", "Descripción"],
            filas: paletizado?.length
              ? paletizado.map(p => [
                  p.idPalet || "-",
                  p.fecha ? new Date(p.fecha).toLocaleString("es-CL") : "-",
                  p.planta || "-",
                  p.taller || "-",
                  p.tipo || "-",
                  p.cantidad ?? "-",
                  p.descripcion || "-",
                ])
              : [[paletizado ? "Sin registros de paletizado para este NP" : "Paletizado no disponible: no se pudo consultar", "", "", "", "", "", ""]],
          },
        ],
      })
    }

    // ── Trazabilidad integral (Fase 1a) ──────────────────────────────────────────────────────

    esc(v) {
      return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
    }

    // null/undefined => "No disponible"; nunca se reemplaza por 0.
    num(v, decimales = 0) {
      if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return ND
      return Number(v).toLocaleString("es-CL", { maximumFractionDigits: decimales || 3 })
    }

    txt(v) {
      return v === null || v === undefined || String(v).trim() === "" ? "-" : String(v).trim()
    }

    filasVacias(body, colspan, texto) {
      document.getElementById(body).innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;">${this.esc(texto)}</td></tr>`
    }

    async consultarIntegral(np, id) {
      const fuentesEl = document.getElementById("trzFuentes")
      fuentesEl.textContent = "Consultando FPS, SAP, liberaciones y Calidad..."
      for (const [b, c] of [["trzItemsBody", 13], ["trzFpsBody", 17], ["trzTurnosBody", 4], ["trzConsumosBody", 14], ["trzLiberacionesBody", 13], ["trzDespachosBody", 10], ["trzEntradasBody", 8], ["trzInventarioBody", 6], ["trzControlesBody", 7], ["trzBobinasBody", 8], ["trzNcBody", 10], ["trzMermasBody", 9], ["trzCertBody", 8], ["trzCalidadBody", 10]]) {
        this.filasVacias(b, c, "Consultando...")
      }
      document.getElementById("trzOrdenes").textContent = ""

      const [fps, calidad] = await Promise.all([
        window.PhotinoBridge.send({ action: "trazabilidad.integral", data: { np } })
          .catch(err => ({ ok: false, error: err?.message })),
        this.consultarCalidad(np)
      ])
      if (id !== this._consultaId) return // llegó otra consulta mientras tanto

      let data = fps && fps.ok !== false ? fps.data : null
      let error = data ? null : (fps?.error || "No se pudo consultar FPS/SAP")
      // El número escrito puede ser una OT / NP Faret: toda la pantalla trabaja con la NP INNPACK resuelta.
      const resolucion = data?.resolucion || null
      if (data && data.np === null) {
        error = (resolucion?.avisos || []).join(" ") || "El número no corresponde a una NP INNPACK."
        data = null
      }
      if (data) await window.CalidadNp?.completarDespachoSap?.(data) // solo actúa si fps-api usa la regla anterior
      if (id !== this._consultaId) return
      const npReal = data ? String(data.np) : np
      let calidadReal = calidad
      if (data && npReal !== String(np)) calidadReal = await this.consultarCalidad(npReal)
      if (id !== this._consultaId) return
      this._integral = { np: npReal, npIngresada: np, data, error, resolucion, calidad: calidadReal, consultadoEn: new Date() }
      this.guardarReciente(npReal, data)

      this.renderFuentes()
      this.renderItems()
      this.renderFps()
      this.renderConsumos()
      this.renderLiberaciones()
      this.renderDespachos()
      this.renderCalidad()
      this.renderBobinas()
      this.renderTurnos()
      this.renderControles()
      this.renderEntradas()
      this.renderInventario()
      this.renderKpis()
      this.activarTab(this._tab)
      window.CalidadNp?.barraNp?.(document.getElementById("trzIntegral"), "trazabilidad", () => this.contextoNp())
      this.cargarNc(npReal, id)
      this.cargarPallets(npReal, id)
      this.cargarMermasYCertificados(npReal, id)
      // Fase 1b: factor y documentos SGI (propios de QCC; si la API aún no los expone se muestra el aviso).
      this.cargarPanelSgi(npReal, id)
    }

    // Registros de Calidad de la NP, desde las acciones existentes de sus módulos (sin backend nuevo).
    // Respeta permisos: si el usuario no ve el módulo de origen, no se consulta.
    async consultarCalidad(np) {
      const puede = m => !window.App?.nivelModulo || window.App.nivelModulo(m) !== "SIN_ACCESO"
      const exacto = r => String(r?.np ?? "").trim() === String(np)
      const pedir = async (modulo, action, data) => {
        if (!puede(modulo)) return { estado: "SIN_PERMISO", items: [] }
        try {
          const res = await window.PhotinoBridge.send({ action, data })
          if (!res || res.ok === false) return { estado: "ERROR", items: [], error: res?.error }
          const items = (Array.isArray(res.data) ? res.data : res.data?.items || []).filter(exacto)
          return { estado: "OK", items, total: res.data?.total ?? items.length }
        } catch (err) {
          return { estado: "ERROR", items: [], error: err?.message }
        }
      }
      const [registros, productoTerminado, laboratorio] = await Promise.all([
        pedir("registros-control", "registrosControl.obtenerRegistros", { page: 1, limit: 500, np }),
        pedir("producto-terminado", "productoTerminado.list", { empresa: "INNPACK", np, page: 1, limit: 200 }),
        pedir("muestra-laboratorio", "muestraLab.list", { np })
      ])
      return { registros, productoTerminado, laboratorio }
    }

    // ── Organización visual: pestañas, indicadores superiores y filtro por tabla ──
    activarTab(tab) {
      this._tab = tab
      document.querySelectorAll("#trzTabs .trz-tab").forEach(b => b.classList.toggle("active", b.getAttribute("data-trz-ir") === tab))
      document.querySelectorAll("#trzResultado [data-trz-tab]").forEach(c => { c.style.display = c.getAttribute("data-trz-tab") === tab ? "" : "none" })
      this.montarFiltros()
    }

    // Un cuadro de búsqueda sobre cada tabla del análisis: oculta las filas que no contienen el texto (solo en pantalla).
    montarFiltros() {
      document.querySelectorAll("#trzResultado [data-trz-tab] .table-container").forEach(tc => {
        if (tc.previousElementSibling?.classList?.contains("trz-filtro")) return
        const input = document.createElement("input")
        input.type = "search"
        input.className = "trz-filtro"
        input.placeholder = "Filtrar filas..."
        tc.parentNode.insertBefore(input, tc)
      })
      if (!this._inputHandler) {
        this._inputHandler = e => {
          if (e.target.classList?.contains("trz-filtro")) this.aplicarFiltro(e.target)
        }
        document.addEventListener("input", this._inputHandler)
      }
    }

    aplicarFiltro(input) {
      const q = input.value.trim().toLowerCase()
      input.nextElementSibling?.querySelectorAll("tbody tr").forEach(tr => {
        tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? "" : "none"
      })
    }

    reaplicarFiltros() {
      document.querySelectorAll("#trzResultado .trz-filtro").forEach(i => { if (i.value) this.aplicarFiltro(i) })
    }

    // Suma una cifra por ítem; si algún ítem no la tiene (fuente caída) el total no se inventa: No disponible.
    sumaItems(campo, items) {
      if (!items || !items.length) return null
      let t = 0
      for (const i of items) {
        if (i[campo] === null || i[campo] === undefined) return null
        t += Number(i[campo])
      }
      return t
    }

    renderKpis() {
      const el = document.getElementById("trzKpis")
      const d = this._integral.data
      const kpi = (titulo, valor, sub, tono = "") => `
        <div class="card npd-kpi ${tono}"><div class="npd-kpi-head">${this.esc(titulo)}</div>
          <div class="npd-kpi-val ${valor === ND ? "nd" : ""}">${this.esc(valor)}</div><div class="npd-kpi-sub">${this.esc(sub)}</div></div>`
      if (!d) { el.innerHTML = ""; return }
      const items = d.items
      const n = v => (v === null ? ND : this.num(v))
      const solicitado = items ? this.sumaItems("solicitado", items) : null
      const liberado = items ? this.sumaItems("liberadoPt", items) : null
      const despachado = items ? this.sumaItems("despachado", items) : null
      const anterior = !!window.CalidadNp?.reglaDespachoAnterior(items)
      const pendiente = solicitado !== null && despachado !== null ? solicitado - despachado : null
      // Sin la nota de venta no se puede saber qué entradas son de sus ítems.
      const ingresado = d.entradas && d.items?.length ? d.entradas.ingresadoPorItem.reduce((a, x) => a + x.ingresado, 0) : null
      const nc = this._integral.nc
      const cal = this._integral.calidad
      const controles = cal?.registros?.estado === "OK" && cal.productoTerminado?.estado === "OK"
        ? cal.registros.items.length + cal.productoTerminado.items.length : null
      el.innerHTML = [
        kpi("Solicitado (NV)", n(solicitado), "unidades de la nota de venta"),
        kpi("Ingresado a bodega", n(ingresado), "entradas SAP con esta NP"),
        kpi("Liberado PT", n(liberado), "certificados QCS"),
        kpi("Despachado", n(despachado), anterior ? "NO VALIDADO: el servidor FPS aún usa la regla anterior" : "guías y facturas directas − devoluciones y reingresos por NC", anterior ? "t-bad" : ""),
        kpi("Pendiente despacho", n(pendiente), anterior ? "NO VALIDADO: depende del despachado" : "estimado, no es merma", anterior ? "t-bad" : pendiente > 0 ? "t-warn" : ""),
        kpi("Controles de Calidad", n(controles), "registros de control + producto terminado"),
        kpi("No conformidades", nc && nc.estado === "OK" ? this.num(nc.items.length) : ND, "producto, esta NP", nc && nc.estado === "OK" && nc.items.length ? "t-bad" : "")
      ].join("")
    }

    renderTurnos() {
      const d = this._integral.data
      if (!d || !d.turnos) return this.filasVacias("trzTurnosBody", 4, ND)
      if (d.turnos.length === 0) return this.filasVacias("trzTurnosBody", 4, "Sin corridas válidas en FPS")
      document.getElementById("trzTurnosBody").innerHTML = d.turnos.map(t => `
        <tr><td>${this.esc(t.turno)}</td><td>${this.num(t.sesiones)}</td>
          <td>${this.esc(t.maquinas.join(", ") || "-")}</td><td>${this.esc(t.operadores.join(", ") || "-")}</td></tr>`).join("")
    }

    // Observación libre de la OT en FPS donde producción anota la guía técnica; no trae revisión estructurada.
    guiasTecnicas(d) {
      return (d?.ordenes || []).filter(o => String(o.GuiaTecnica || "").trim())
        .map(o => ({ ot: o.OrdenTrabajo, texto: String(o.GuiaTecnica).trim().replace(/\s+/g, " ") }))
    }

    // Respuestas agrupadas por corrida. Una respuesta de relleno se muestra tal cual: QCC no la interpreta como conforme.
    agruparControles(filas) {
      const grupos = new Map()
      for (const f of filas || []) {
        const clave = `${f.RecordKey}|${f.Formulario || ""}`
        if (!grupos.has(clave)) grupos.set(clave, { ...f, respuestas: [] })
        grupos.get(clave).respuestas.push(f)
      }
      return [...grupos.values()]
    }

    renderControles() {
      const d = this._integral.data
      const nota = document.getElementById("trzControlesNota")
      if (!d || !d.controlesProceso) { nota.textContent = ""; return this.filasVacias("trzControlesBody", 7, ND) }
      const grupos = this.agruparControles(d.controlesProceso)
      nota.textContent = `FPS desde ${d.controlesDesde}: ${grupos.length} corrida(s) con formulario respondido. Una corrida sin formulario no aparece y no prueba incumplimiento.`
        + (d.controlesTruncados ? " Atención: respuestas truncadas por límite de consulta." : "")
      if (!grupos.length) return this.filasVacias("trzControlesBody", 7, "Sin formularios respondidos en FPS para las corridas de esta NP")
      document.getElementById("trzControlesBody").innerHTML = grupos.map(g => `
        <tr><td>${this.esc(this.txt(g.Fecha))}</td><td>${this.esc(g.OrdenTrabajo)}</td><td>${this.esc(this.txt(g.NombreProceso))}</td><td>${this.esc(this.txt(g.Maquina))}</td>
          <td>${this.num(g.respuestas.length)}</td><td>${this.num(g.respuestas.filter(r => /^\s*no\s*$/i.test(r.Respuesta || "")).length)}</td>
          <td><details><summary>Ver respuestas</summary>${g.respuestas.map(r => `<div>${this.esc(this.txt(r.Pregunta))}: <b>${this.esc(this.txt(r.Respuesta))}</b></div>`).join("")}</details></td></tr>`).join("")
    }

    // Ingresos por compra y marcas de lote que no coinciden: se muestran como evidencia, no cambian ninguna cifra.
    notasInventario(x) {
      const notas = (x.recepciones || []).map(r => `Recepción de compra ${r.docNum}: ${this.num(r.cantidad)} (${this.txt(r.proveedor)})`)
        .concat((x.entradasConOtraNp || []).map(o => `REVISAR: ${this.num(o.cantidad)} producidas para esta NP están en lotes marcados con la NP ${o.npDelLote} (no se suman)`))
      return notas.length ? `<details><summary>${this.num(notas.length)} observación(es) de lotes</summary>${notas.map(n => `<div style="font-size:12px;">${this.esc(n)}</div>`).join("")}</details>` : ""
    }

    renderInventario() {
      const d = this._integral.data
      if (!d || !d.inventarioPt) return this.filasVacias("trzInventarioBody", 6, ND)
      if (!d.inventarioPt.length) return this.filasVacias("trzInventarioBody", 6, "SAP no tiene lotes de esta NP: existencia sin registro (no equivale a cero)")
      document.getElementById("trzInventarioBody").innerHTML = d.inventarioPt.map(x => `
        <tr><td>${this.esc(x.itemCode)}</td><td>${this.num(x.lotes)}${x.lotesSinMarcaNp ? `<br><small>${this.num(x.lotesSinMarcaNp)} sin NP marcada en SAP: vinculado por su entrada de producción</small>` : ""}${this.notasInventario(x)}</td><td>${x.saldo === null ? "Sin lotes de esta NP" : this.num(x.saldo)}</td>
          <td>${this.esc(Object.entries(x.bodegas).map(([b, c]) => `${b}: ${this.num(c)}`).join(" · ") || "Sin saldo")}</td>
          <td>${x.salidaVentaLotes === null || x.salidaVentaLotes === undefined ? "Sin movimientos" : this.num(x.salidaVentaLotes)}</td>
          <td style="font-size:12px;">${x.vinculoNv ? "Ítem de la NV" : "Ítem NO está en la NV"}</td></tr>`).join("")
    }

    renderEntradas() {
      const d = this._integral.data
      if (!d || !d.entradas) return this.filasVacias("trzEntradasBody", 8, ND)
      if (d.entradas.lineas.length === 0) return this.filasVacias("trzEntradasBody", 8, "Sin entradas ni traslados de producción con esta NP en SAP")
      document.getElementById("trzEntradasBody").innerHTML = d.entradas.lineas.map(l => `
        <tr><td>${l.tipo === "ENTRADA" ? "Entrada de producción" : "Traslado entre bodegas"}</td><td>${this.esc(l.docNum)}</td><td>${this.esc(l.fecha)}</td>
          <td>${this.esc(l.itemCode)}</td><td>${this.esc(l.descripcion)}</td><td>${this.num(l.cantidad)}</td><td>${this.esc(l.bodega)}</td>
          <td style="font-size:12px;">${l.vinculoNv ? "Ítem de la NV" : "Ítem NO está en la NV (no suma)"}${l.tipo === "TRASLADO" ? " · no suma a lo producido" : ""}</td></tr>`).join("")
    }

    // No conformidades de producto de la NP (API INNPACK). Llega después de la pantalla principal: no la bloquea.
    async cargarNc(np, id) {
      this.filasVacias("trzNcBody", 10, "Consultando...")
      let nc
      try {
        const res = await window.PhotinoBridge.send({ action: "trazabilidad.noConformidades", data: { np } })
        nc = !res || res.ok === false ? { estado: "ERROR", items: [] } : { estado: "OK", items: res.data?.items || [] }
      } catch {
        nc = { estado: "ERROR", items: [] }
      }
      if (id !== this._consultaId) return
      this._integral.nc = nc
      this.refrescarDocumentos(np)
      if (nc.estado !== "OK") this.filasVacias("trzNcBody", 10, ND)
      else if (nc.items.length === 0) this.filasVacias("trzNcBody", 10, "Sin no conformidades de producto para esta NP")
      else document.getElementById("trzNcBody").innerHTML = nc.items.map(x => `
        <tr><td>${this.esc(x.id)}</td><td>${this.esc(this.txt(x.fechaIngreso))}</td><td>${this.esc(this.txt(x.npNv))}</td><td>${this.esc(this.txt(x.cliente))}</td>
          <td>${this.esc(this.txt(x.producto))}</td><td>${this.esc(this.txt(x.tipoPnc))}</td><td>${this.esc(this.txt(x.nivel))}</td>
          <td>${this.num(x.cantRechazada)}</td><td>${this.esc(this.txt(x.categoriaDefecto))}</td><td>${this.esc(this.txt(x.estadoGestion))}</td></tr>`).join("")
      this.renderKpis()
      this.reaplicarFiltros()
    }

    // Clasificaciones vigentes de la NP. Solo coincidencia exacta: el filtro del servidor también compara NP FARET y OT.
    async cargarPallets(np, id) {
      this.filasVacias("trzPalletsBody", 10, "Consultando...")
      let r
      try {
        const res = await window.PhotinoBridge.send({ action: "trazabilidad.pallets", data: { np } })
        r = !res || res.ok === false ? { estado: "ERROR", items: [] } : { estado: "OK", items: res.data?.items || [], total: res.data?.total }
      } catch {
        r = { estado: "ERROR", items: [] }
      }
      if (id !== this._consultaId) return
      r.items = this.palletsDeNp(r.items, np)
      r.truncado = r.total > 200
      this._integral.pallets = r
      const nota = document.getElementById("trzPalletsNota")
      nota.textContent = "Registro desde la app de inspección (disponible desde el 23-11-2026). Un pallet sin clasificación no está aprobado ni rechazado."
        + (r.truncado ? " Se muestran solo las 200 clasificaciones más recientes." : "")
      if (r.estado !== "OK") this.filasVacias("trzPalletsBody", 10, ND)
      else if (!r.items.length) this.filasVacias("trzPalletsBody", 10, "Sin pallets clasificados para esta NP")
      else document.getElementById("trzPalletsBody").innerHTML = r.items.map(x => `
        <tr><td>${this.esc(this.txt(x.palletCodigo))}${x.nEtiqueta ? ` (N° ${this.esc(x.nEtiqueta)})` : ""}${x.fps?.verificado ? "" : " · sin verificación FPS"}</td>
          <td>${this.esc(this.txt(x.fps?.ordenFabricacion))}</td><td>${this.esc(this.txt(x.fps?.codigoProducto))}</td><td>${this.esc(this.txt(x.color))}</td>
          <td>${this.esc((x.defectos || []).map(d => d.nombre).join(", ") || "-")}</td><td>${this.esc(this.txt(x.inspeccion?.proceso))}</td>
          <td>${this.esc(this.txt(x.fps?.maquina || x.inspeccion?.maquina))}</td><td>${this.esc(this.txt(x.fps?.operador))}</td>
          <td>${this.esc(this.txt(x.inspeccion?.inspector))}</td><td>${this.esc(this.txt(x.clasificadoEn))}</td></tr>`).join("")
      this.reaplicarFiltros()
    }

    palletsDeNp(items, np) {
      return (items || []).filter(x => x.fps?.npInnpack ? String(x.fps.npInnpack) === String(np) : String(x.inspeccion?.np ?? "").trim() === String(np))
    }

    adhesivos(l) {
      return (l.adhesivos || []).map(a => [a.tipo, a.lote].filter(Boolean).join(" · ")).join(" | ")
    }

    adhesivosHtml(l) {
      return (l.adhesivos || []).map(a => `${this.esc(a.tipo || "")}${a.lote ? ` · <a href="#" data-trz-lote="${this.esc(a.lote)}" onclick="return false;" title="Busca este número como lote en SAP (no busca otros folios QCS con el mismo adhesivo)">${this.esc(a.lote)}</a>` : ""}`).join(" | ") || "Sin adhesivo registrado"
    }

    // Bobinas escaneadas en los controles de la NP, cruzadas por número exacto con los lotes consumidos según SAP.
    // La API concatena lote, código, descripción y observación en el mismo orden; si un texto trae ";" y los largos no
    // calzan, la fila se muestra sin separar en vez de emparejar mal.
    filasBobinas() {
      const registros = this._integral?.calidad?.registros?.items || []
      const consumos = this._integral?.data?.consumos
      const norma = v => String(v ?? "").trim().toUpperCase()
      const partes = v => String(v ?? "").split("; ")
      const filas = []
      for (const r of registros) {
        if (!norma(r.bobinaLote)) continue
        let lotes = partes(r.bobinaLote)
        let cols = [r.bobinaCodigo, r.bobinaDescripcion, r.bobinaObservacion].map(partes)
        const separable = cols.every(c => c.length === lotes.length)
        if (!separable) { lotes = [r.bobinaLote]; cols = [r.bobinaCodigo, r.bobinaDescripcion, r.bobinaObservacion].map(v => [v]) }
        lotes.forEach((lote, k) => {
          let cruce = "Consumos SAP no disponibles"
          if (consumos) {
            const usados = consumos.filter(c => (c.lotes || []).some(l => [l.lote, l.serieFabricante, l.loteProveedor].some(x => norma(x) && norma(x) === norma(lote))))
            cruce = usados.length ? `Coincide con salida SAP ${[...new Set(usados.map(c => `${c.base} ${c.docNum}`))].join(", ")}` : "Sin coincidencia exacta en los consumos SAP"
          }
          if (!separable) cruce = "No se puede separar el registro: revisar en Registros de control"
          filas.push({ registro: r.id, fecha: r.fecha, proceso: r.proceso, maquina: r.maquina, lote: norma(lote) ? lote : "-", codigo: cols[0][k] || "-", descripcion: cols[1][k] || "-", observacion: cols[2][k] || "-", cruce, separable })
        })
      }
      return filas
    }

    renderBobinas() {
      const estado = this._integral?.calidad?.registros?.estado
      if (estado === "SIN_PERMISO") return this.filasVacias("trzBobinasBody", 8, "Sin permiso sobre Registros de control")
      if (estado !== "OK") return this.filasVacias("trzBobinasBody", 8, ND)
      const filas = this.filasBobinas()
      if (!filas.length) return this.filasVacias("trzBobinasBody", 8, "Los controles de esta NP no tienen bobinas registradas")
      document.getElementById("trzBobinasBody").innerHTML = filas.map(f => `
        <tr><td>${this.esc(f.registro)}</td><td>${this.esc(this.txt(f.fecha))}</td><td>${this.esc(this.txt(f.proceso))}</td>
          <td>${f.separable && f.lote !== "-" ? `<a href="#" data-trz-lote="${this.esc(f.lote)}" onclick="return false;">${this.esc(f.lote)}</a>` : this.esc(f.lote)}</td>
          <td>${this.esc(f.codigo)}</td><td>${this.esc(f.descripcion)}</td><td>${this.esc(f.observacion)}</td><td>${this.esc(f.cruce)}</td></tr>`).join("")
    }

    // Mermas y certificados de destrucción registrados en QCC para la NP. Lecturas de sus propios módulos y solo si el
    // usuario puede verlos. null = no consultado o falló (nunca se interpreta como "no hay").
    async cargarMermasYCertificados(np, id) {
      const puede = m => !window.App?.nivelModulo || window.App.nivelModulo(m) !== "SIN_ACCESO"
      const pedir = async (modulo, action) => {
        if (!puede(modulo)) return { estado: "SIN_PERMISO", items: null }
        try {
          const res = await window.PhotinoBridge.send({ action, data: { np } })
          return !res || res.ok === false || !Array.isArray(res.data) ? { estado: "ERROR", items: null } : { estado: "OK", items: res.data }
        } catch {
          return { estado: "ERROR", items: null }
        }
      }
      this.filasVacias("trzMermasBody", 9, "Consultando...")
      this.filasVacias("trzCertBody", 8, "Consultando...")
      const [mermas, certificados] = await Promise.all([pedir("balance-mermas", "calidadNp.mermas.list"), pedir("certificados-destruccion", "calidadNp.certificados.list")])
      if (id !== this._consultaId) return
      // La lista de certificados se filtra otra vez por NP: nunca se muestra uno de otra NP.
      if (certificados.items) certificados.items = certificados.items.filter(c => String(c.np) === String(np))
      this._integral.mermas = mermas
      this._integral.certificados = certificados
      this.refrescarDocumentos(np)
      const motivo = r => (r.estado === "SIN_PERMISO" ? "Sin permiso sobre el módulo de origen" : ND)
      if (!mermas.items) this.filasVacias("trzMermasBody", 9, motivo(mermas))
      else if (!mermas.items.length) this.filasVacias("trzMermasBody", 9, "Sin mermas registradas en QCC para esta NP")
      else document.getElementById("trzMermasBody").innerHTML = mermas.items.map(m => `
        <tr><td>${this.esc(this.fechaCorta(m.fecha))}</td><td>${this.esc(this.txt(m.item))}</td><td>${this.esc(this.txt(m.proceso))}</td><td>${this.esc(this.txt(m.defecto))}</td>
          <td>${this.num(m.cantidad)} ${this.esc(this.txt(m.unidad).toLowerCase())}</td><td>${this.esc(this.txt(m.metodo))}</td><td>${this.esc(this.txt(m.estado))}</td>
          <td>${this.num(m.comprometidoDestruccion)}</td><td>${this.esc(this.txt(m.creadoPor))}</td></tr>`).join("")
      if (!certificados.items) this.filasVacias("trzCertBody", 8, motivo(certificados))
      else if (!certificados.items.length) this.filasVacias("trzCertBody", 8, "Sin certificados de destrucción para esta NP")
      else document.getElementById("trzCertBody").innerHTML = certificados.items.map(c => `
        <tr><td>${this.esc(c.correlativo || `Borrador #${c.id}`)}</td><td>${this.esc(this.txt(c.item))}</td><td>${this.num(c.cantidadDestruir)}</td>
          <td>${this.esc(this.txt(c.motivo))}</td><td>${this.esc(this.txt(c.estado))}</td><td>${this.esc(this.ejecucionCert(c))}</td>
          <td>${this.esc(this.txt(c.creadoPor))}</td><td>${this.esc(this.fechaCorta(c.fechaEmision || c.fechaCreacion))}</td></tr>`).join("")
      this.reaplicarFiltros()
    }

    ejecucionCert(c) {
      if (!c.ejecutada) return "No confirmada"
      return c.cantidadEjecutada === null || c.cantidadEjecutada === undefined ? "Confirmada (cantidad no registrada)" : `Confirmada: ${this.num(c.cantidadEjecutada)}`
    }

    // Secciones 11 (mermas), calidad, 12 (anexos) y 13 (faltantes) del informe, con lo registrado en QCC.
    bloquesCierreInforme(dato, n) {
      const t = this._integral
      const noDisp = r => (r?.estado === "SIN_PERMISO" ? "NO INCLUIDO: el usuario no tiene permiso sobre el módulo de origen" : "REGISTRO NO DISPONIBLE (no se pudo consultar)")
      const fecha = v => (v ? this.fechaCorta(v) : dato(v))
      const mermas = t.mermas?.items ? t.mermas.items.filter(m => m.estado !== "ANULADA") : null
      const certs = t.certificados?.items ? t.certificados.items.filter(c => c.estado !== "ANULADO" && c.estado !== "RECHAZADO") : null
      const nc = t.nc?.estado === "OK" ? t.nc.items : null
      const reqs = this._sgi?.requisitos || null
      const bloques = []
      bloques.push({
        titulo: "MERMAS REGISTRADAS", columnas: ["FECHA", "ÍTEM", "PROCESO", "DEFECTO", "CANTIDAD", "UNIDAD", "CERTEZA", "ESTADO"], pesos: [3, 2, 4, 5, 3, 2, 3, 3],
        filas: (mermas || []).map(m => [fecha(m.fecha), dato(m.item), dato(m.proceso), dato(m.defecto), n(m.cantidad), dato(m.unidad), dato(m.metodo), dato(m.estado)]),
        vacio: mermas ? "Sin mermas registradas en QCC para esta NP (no equivale a merma cero)" : noDisp(t.mermas),
        nota: "Las mermas anuladas no se listan. Las diferencias del balance no se convierten en merma.",
      })
      bloques.push({
        titulo: "CALIDAD — NO CONFORMIDADES DE LA NP", columnas: ["N°", "FECHA", "DEFECTO", "NIVEL", "CANT. RECHAZADA", "ESTADO", "CAUSA RAÍZ REGISTRADA"], pesos: [2, 3, 5, 2, 3, 3, 8],
        filas: (nc || []).map(x => [dato(x.id), fecha(x.fechaIngreso), dato(x.categoriaDefecto), dato(x.nivel), n(x.cantRechazada), dato(x.estadoGestion), dato(x.causaRaiz)]),
        vacio: nc ? "Sin no conformidades de producto para esta NP" : "REGISTRO NO DISPONIBLE (no conformidades no consultadas)",
      })
      const lab = t.calidad?.laboratorio
      const muestras = lab?.estado === "OK" ? lab.items.filter(m => String(m.estado).toUpperCase() !== "ANULADO") : null
      bloques.push({
        titulo: "CALIDAD — MUESTRAS DE LABORATORIO", columnas: ["MUESTRA", "FECHA", "TIPO", "CÓDIGO", "ENSAYOS", "ESTADO", "EVALUACIÓN"], pesos: [2, 3, 5, 5, 2, 4, 4],
        filas: (muestras || []).map(m => [dato(m.id), fecha(m.fechaIngreso), dato(m.tipoMuestra), dato(m.codigoProducto), n(m.totalEnsayos), dato(m.estado), dato(m.evaluacion)]),
        vacio: muestras ? "Sin muestras de laboratorio registradas con esta NP" : noDisp(lab),
        nota: "Las muestras anuladas no se listan. El informe de cada ensayo se obtiene en Laboratorio.",
      })
      bloques.push({
        titulo: "CERTIFICADOS DE DESTRUCCIÓN", columnas: ["CERTIFICADO", "ÍTEM", "CANTIDAD", "MOTIVO", "ESTADO", "EJECUCIÓN FÍSICA"], pesos: [4, 2, 3, 6, 4, 4],
        filas: (certs || []).map(c => [dato(c.correlativo || `Borrador #${c.id}`), dato(c.item), n(c.cantidadDestruir), dato(c.motivo), dato(c.estado), this.ejecucionCert(c).toUpperCase()]),
        vacio: certs ? "Sin certificados de destrucción vigentes para esta NP" : noDisp(t.certificados),
        nota: "Emitir un certificado no acredita la destrucción física ni modifica el inventario SAP.",
      })
      const conRespaldo = (reqs || []).filter(r => r.vigente?.estado === "DISPONIBLE" || r.vigente?.estado === "EN_REVISION")
      const anexos = conRespaldo.map(r => [dato(r.area), dato(r.nombre), r.vigente.nombreArchivo ? `${r.vigente.nombreArchivo} (v${r.vigente.version})` : dato(r.vigente.enlace),
        (r.vigente.estado === "EN_REVISION" ? "Documento del checklist EN REVISIÓN" : "Documento del checklist") + (r.vigente.nombreArchivo ? "" : " (solo enlace)")])
      for (const c of certs || []) if (c.correlativo) anexos.push(["Calidad", "Certificado de destrucción", dato(c.correlativo), `Certificado relacionado (${c.estado})`])
      const folios = (t.data?.liberaciones || []).length
      if (folios) anexos.push(["Calidad", "Folios de liberación QCS", `${folios} folio(s)`, "Registro en el sistema de origen"])
      const registros = (t.calidad?.registros?.items?.length || 0) + (t.calidad?.productoTerminado?.items?.length || 0)
      if (registros) anexos.push(["Calidad", "Registros de control y producto terminado QCC", `${registros} registro(s)`, "Registros y evidencias en QCC"])
      bloques.push({
        titulo: "12. ANEXOS", columnas: ["ÁREA", "DOCUMENTO / REGISTRO", "ARCHIVO O REFERENCIA", "TIPO"], pesos: [4, 8, 8, 5],
        filas: anexos, vacio: reqs ? "Sin anexos cargados para esta NP" : "REGISTRO NO DISPONIBLE (checklist documental no consultado)",
        nota: "\"Descargar anexos\" incluye los archivos cargados en el checklist. También agrega, en la carpeta SAP, los adjuntos de la nota de venta, de los documentos de venta con adjunto y de las recepciones de los lotes consumidos, con un índice de lo no obtenido. SAP no clasifica esos adjuntos.",
      })
      const faltantes = (reqs || []).filter(r => !r.vigente || (r.vigente.estado !== "DISPONIBLE" && r.vigente.estado !== "NO_APLICA"))
      const noAplica = (reqs || []).filter(r => r.vigente?.estado === "NO_APLICA")
      bloques.push({
        titulo: "13. DOCUMENTOS FALTANTES", columnas: ["DOCUMENTO", "ÁREA RESPONSABLE", "MOTIVO DE AUSENCIA"], pesos: [9, 5, 10],
        filas: faltantes.map(r => [dato(r.nombre), dato(r.area), this.motivoFaltante(r)])
          .concat(noAplica.map(r => [dato(r.nombre), dato(r.area), `No aplica: ${dato(r.vigente.observacion)}`])),
        vacio: reqs ? "Sin documentos faltantes en el checklist" : "REGISTRO NO DISPONIBLE (checklist documental no consultado)",
      })
      return bloques
    }

    motivoFaltante(r) {
      if (r.vigente?.estado === "EN_REVISION") return "En revisión: aún no está disponible"
      if (r.vigente?.estado === "NO_DIGITALIZADO") return `Existe sin digitalizar: ${r.vigente.observacion || "sin ubicación indicada"}`
      return "Sin documento cargado en QCC" + (r.fuenteSistema ? ". Puede existir información en el sistema de origen; no reemplaza al documento" : "")
    }

    // Abre los PDF que SAP tiene adjuntos al documento (Service Layer vía apisapfaret). Solo lectura.
    async abrirAdjuntosSap(btn) {
      const tipo = btn.getAttribute("data-tipo")
      const docEntry = Number(btn.getAttribute("data-doc"))
      const empresa = btn.getAttribute("data-empresa") || undefined
      const original = btn.textContent
      btn.disabled = true
      btn.textContent = "Abriendo..."
      try {
        const lista = await window.PhotinoBridge.send({ action: "trazabilidad.adjuntosSap.list", data: { tipo, docEntry, empresa } })
        if (!lista || lista.ok === false) throw new Error(lista?.error || "No se pudo consultar SAP")
        const adjuntos = lista.data?.adjuntos || []
        if (adjuntos.length === 0) { window.ExcelExporter?.showToast?.("SAP no tiene archivos adjuntos para este documento"); return }
        for (const a of adjuntos) {
          const r = await window.PhotinoBridge.send({
            action: "trazabilidad.adjuntosSap.abrir",
            data: { tipo, docEntry, empresa, linea: a.numero, nombre: [a.nombre, a.extension].filter(Boolean).join(".") }
          })
          if (!r || r.ok === false) throw new Error(r?.error || "No se pudo abrir el archivo")
        }
      } catch (err) {
        window.ExcelExporter?.showToast?.(err?.message || "No se pudo abrir el adjunto")
      } finally {
        btn.disabled = false
        btn.textContent = original
      }
    }

    estadoFuente(nombre, f) {
      if (f && f.ok && f.estado === "SIN_DATOS") return `<span style="color:#a16207;">● ${this.esc(nombre)}: sin registros</span>`
      if (f && f.ok) return `<span style="color:#15803d;">● ${this.esc(nombre)}: disponible</span>`
      const motivo = { TIEMPO_AGOTADO: "tiempo agotado", REQUIERE_FPS: "requiere FPS", DEMASIADAS_OT: "demasiadas OT", SIN_PERMISO: "sin permiso" }[f?.error] || "no disponible"
      return `<span style="color:#b91c1c;">● ${this.esc(nombre)}: ${this.esc(motivo)}</span>`
    }

    // "No encontrada" solo si FPS y la nota de venta SAP respondieron y ninguno tiene registros. Con una fuente caída no
    // se puede afirmar: se avisa la caída y la hora de la consulta (los datos son en vivo, no hay copia sincronizada).
    avisoConsulta({ data, resolucion, consultadoEn }) {
      if (!data && resolucion?.np === null) return null // respondió: el número no es una NP; su mensaje ya se muestra
      const caida = !data || Object.values(data.fuentes || {}).some(f => f && f.ok === false && f.error !== "REQUIERE_FPS" && f.error !== "DEMASIADAS_OT")
      if (caida) return `FUENTE TEMPORALMENTE NO DISPONIBLE (consulta del ${consultadoEn.toLocaleString("es-CL")}). Lo que falta no equivale a cero.`
      const sinDatos = f => f?.ok === true && f.estado === "SIN_DATOS"
      return sinDatos(data.fuentes?.fps) && sinDatos(data.fuentes?.sapNotaVenta) && !data.notaVentaAnulada
        ? "NP NO ENCONTRADA: FPS y la nota de venta SAP respondieron y no tienen registros con este número." : null
    }

    renderFuentes() {
      const { data, error, calidad } = this._integral
      const el = document.getElementById("trzFuentes")
      const cal = c => ({ ok: c.estado === "OK", error: c.estado === "SIN_PERMISO" ? "SIN_PERMISO" : null })
      const partes = []
      const aviso = this._integral.resolucion?.avisos?.[0]
      if (aviso) partes.push(`<span style="color:#1d4ed8;">ℹ ${this.esc(aviso)}</span><br>`)
      if (data?.resolucion?.ots?.length > 1) partes.push(`<span style="color:#1d4ed8;">ℹ La NP tiene ${data.resolucion.ots.length} órdenes de trabajo en FPS (${data.resolucion.ots.join(", ")}).</span><br>`)
      const alerta = this.avisoConsulta(this._integral)
      if (alerta) partes.push(`<strong style="color:#b91c1c;">${this.esc(alerta)}</strong><br>`)
      if (!data) {
        partes.push(`<span style="color:#b91c1c;">● FPS / SAP: ${this.esc(error)}</span>`)
      } else {
        const f = data.fuentes || {}
        partes.push(this.estadoFuente("FPS (órdenes y corridas)", f.fps))
        partes.push(this.estadoFuente("SAP nota de venta", f.sapNotaVenta))
        partes.push(this.estadoFuente("SAP despachos", f.sapDespachos))
        if (data.despachoOrigen === "SERVICE_LAYER") partes.push(`<span style="color:#1d4ed8;">ℹ Despacho calculado desde SAP por Service Layer</span>`)
        else if (data.despachoSapError) partes.push(`<span style="color:#92400e;">ℹ No se pudo calcular el despacho por Service Layer: ${this.esc(data.despachoSapError)}</span>`)
        partes.push(this.estadoFuente("SAP consumos", f.sapConsumos))
        partes.push(this.estadoFuente("Liberaciones QCS", f.liberaciones))
        const nv = (data.notaVenta || []).find(l => l.Cancelada !== "Y")
        if (nv?.DocEntry) partes.push(`<button class="btn-secondary" style="padding:2px 8px;" data-trz-adjunto data-tipo="notaventa" data-doc="${this.esc(nv.DocEntry)}">Ver nota de venta original</button>`)
      }
      partes.push(this.estadoFuente("Registros de control", cal(calidad.registros)))
      partes.push(this.estadoFuente("Producto terminado", cal(calidad.productoTerminado)))
      partes.push(this.estadoFuente("Laboratorio", cal(calidad.laboratorio)))
      el.innerHTML = partes.join(" &nbsp; ")
    }

    observacionesItem(i) {
      const obs = []
      if (i.lineaCompartida) obs.push(`La NV repite ítem ${i.item} y código en las líneas ${i.lineasNv.join(", ")}: las liberaciones no se pueden separar entre ellas.`)
      // QCS identifica la liberación solo por número de ítem y código: con el código repetido puede quedar en otro ítem.
      const mismos = (this._integral?.data?.items || []).filter(x => x !== i && x.itemCode === i.itemCode)
      if (mismos.length) obs.push(`El código ${i.itemCode} se repite en el ítem ${mismos.map(x => x.item).join(", ")}: verifica la atribución de liberaciones por la suma del código.`)
      if (i.foliosSinCerrar) obs.push(`${i.foliosSinCerrar} folio(s) de liberación sin cerrar (no suman).`)
      if (i.facturadoDeGuia) obs.push(`Facturado sobre guías: ${this.num(i.facturadoDeGuia)} (no suma al despachado).`)
      if (i.notasCredito) obs.push(`Notas de crédito: ${this.num(i.notasCredito)}.` + (i.reingresoNc ? ` ${this.num(i.reingresoNc)} reingresaron stock en SAP y se descuentan del despachado (no acredita devolución física).` : ""))
      if (i.facturadoReserva) obs.push(`Factura de reserva por ${this.num(i.facturadoReserva)}: no es despacho; cuentan las guías emitidas sobre ella.`)
      const cruce = this.cruceLotes(i)
      if (cruce) obs.push(cruce)
      if (i.liberadoPt === 0 && i.despachado > 0) obs.push("Hay despachos sin liberación QCS asociada a este ítem/código.")
      return obs
    }

    // Control cruzado independiente: salida neta de los lotes SAP marcados con la NP frente al despachado por documentos.
    // Se compara por código (los lotes no distinguen líneas). Una diferencia se informa; no cambia ninguna cifra.
    cruceLotes(i) {
      const d = this._integral?.data
      const inv = (d?.inventarioPt || []).find(x => x.itemCode === i.itemCode)
      if (!inv || inv.salidaVentaLotes === null || inv.salidaVentaLotes === undefined) return null
      const mismos = d.items.filter(x => x.itemCode === i.itemCode)
      if (mismos.some(x => x.despachado === null || x.despachado === undefined)) return null
      const docs = mismos.reduce((a, x) => a + x.despachado, 0)
      if (Math.abs(docs - inv.salidaVentaLotes) < 0.001) return null
      return `REVISAR: por documentos de la NV se despacharon ${this.num(docs)} del código ${i.itemCode}, pero de los lotes de esta NP salieron ${this.num(inv.salidaVentaLotes)} (puede haber líneas sin vínculo con la NV o lotes de otra NP).`
    }

    // Saldo por bodega (QCS). null = liberaciones no disponibles; 0 = sin movimiento en esa bodega.
    saldo(i, bodega) {
      if (i.saldoBodegas === null || i.saldoBodegas === undefined) return null
      return i.saldoBodegas[bodega] ?? 0
    }

    pendienteDespacho(i) {
      if (i.despachado === null || i.despachado === undefined) return null
      return i.solicitado - i.despachado
    }

    // Ficha de un solo ítem. Lo que FPS registra por OT se rotula "de la NP": no se atribuye a un ítem.
    fichaItem(indice) {
      const d = this._integral?.data
      const i = d?.items?.[indice]
      if (!i) return null
      const lineas = new Set((i.lineasNv || []).map(Number))
      const nv = (d.notaVenta || []).find(l => l.Cancelada !== "Y" && lineas.has(Number(l.LineNum))) || null
      const ordenes = d.ordenes || []
      const unir = valores => [...new Set(valores.filter(v => v !== null && v !== undefined && String(v).trim() !== ""))].join(", ") || ND
      const factor = window.CalidadNp?.factorConfirmado?.({ factores: String(this._sgi?.np) === String(this._integral.np) ? this._sgi.factores : null }, i.item) ?? null
      const inicios = (d.sesiones || []).filter(s => Number(s.Status) === 1).map(s => String(s.ProductionStartDate || s.SetupStartDate || "")).filter(Boolean).sort()
      const guias = this.guiasTecnicas(d)
      return [
        ["NP", this._integral.np], ["Ítem", this.txt(i.item)], ["Código", this.txt(i.itemCode)], ["Descripción", this.txt(i.descripcion)],
        ["Cliente", this.txt(nv?.CardName)], ["Nota de venta SAP", nv ? `${nv.DocNum} del ${this.fechaCorta(nv.DocDate)}` : ND],
        ["Estado de la nota de venta", nv ? (nv.DocStatus === "O" ? "Abierta" : nv.DocStatus === "C" ? "Cerrada" : this.txt(nv.DocStatus)) : ND],
        ["Entrega comprometida", nv?.DocDueDate ? this.fechaCorta(nv.DocDueDate) : ND], ["Líneas de la NV", unir(i.lineasNv || [])],
        ["Cantidad solicitada", `${this.num(i.solicitado)} ${i.unidad || ""}`.trim()], ["Liberado PT (QCS)", this.num(i.liberadoPt)], ["Despachado (SAP)", this.num(i.despachado)],
        ["Pendiente de despacho (estimado)", this.num(this.pendienteDespacho(i))], ["Unidades por pliego", factor ? `${this.num(factor)} (confirmado)` : "Sin factor confirmado"],
        ["OT de la NP", unir(ordenes.map(o => o.OrdenTrabajo))], ["NV FARET de la NP", unir(ordenes.map(o => o.NotaVentaFaret))],
        ["Estado de la OT en FPS", unir(ordenes.filter(o => String(o.EstadoOt ?? "").trim()).map(o => `${o.OrdenTrabajo}: ${String(o.EstadoOt).trim()}`))],
        ["Fabricación de la NP (FPS)", inicios.length ? `${this.fechaCorta(inicios[0])} a ${this.fechaCorta(inicios[inicios.length - 1])}` : ND],
        ["Guía técnica de la NP (texto libre FPS)", unir(guias.map(g => g.texto))], ["Perfil (maestro SAP vigente)", this.textoPerfil(i)], ["Revisión de guía y molde", "No disponible: sin fuente vinculada"]
      ]
    }

    renderFicha() {
      const sel = document.getElementById("trzFichaItem")
      const caja = document.getElementById("trzFicha")
      if (!sel || !caja) return
      const items = this._integral?.data?.items || []
      const clave = `${this._integral?.np}|${items.map(i => i.clave ?? `${i.item}|${i.itemCode}`).join(",")}`
      if (sel.dataset.clave !== clave) {
        sel.dataset.clave = clave
        sel.innerHTML = items.map((i, n) => `<option value="${n}">Ítem ${this.esc(this.txt(i.item))} — ${this.esc(i.itemCode)} ${this.esc(i.descripcion)}</option>`).join("")
        sel.onchange = () => this.renderFicha()
      }
      if (items.length && this._itemPedido !== null && this._itemPedido !== undefined) {
        const k = items.findIndex(i => String(i.item) === String(this._itemPedido))
        if (k >= 0) sel.value = String(k)
        this._itemPedido = null
      }
      const pares = this.fichaItem(Number(sel.value || 0))
      caja.innerHTML = pares
        ? pares.map(([k, v]) => `<div><div class="subtitle">${this.esc(k)}</div><div>${this.esc(v)}</div></div>`).join("")
        : `<div class="subtitle">${ND}</div>`
    }

    renderItems() {
      const d = this._integral.data
      this.renderFicha()
      if (!d || !d.items) return this.filasVacias("trzItemsBody", 13, d ? "Nota de venta SAP no disponible" : ND)
      if (d.items.length === 0) return this.filasVacias("trzItemsBody", 13, d.notaVentaAnulada ? `La nota de venta ${this._integral.np} está ANULADA en SAP: no tiene cantidades vigentes` : `No existe la NV ${this._integral.np} en SAP INNPACK`)
      const filas = d.items.map(i => `
        <tr>
          <td>${this.esc(this.txt(i.item))}</td>
          <td>${this.esc(i.itemCode)}</td>
          <td>${this.esc(i.descripcion)}</td>
          <td>${this.esc((i.lineasNv || []).join(", "))}</td>
          <td>${this.num(i.solicitado)}</td>
          <td>${this.num(i.liberadoPt)}</td>
          <td>${this.num(this.saldo(i, "CUARENTENA"))}</td>
          <td>${this.num(this.saldo(i, "DESTRUCCION"))}</td>
          <td>${this.num(i.despachado)}</td>
          <td>${this.num(i.devuelto)}</td>
          <td>${this.num(this.pendienteDespacho(i))}</td>
          <td>${this.num(i.foliosSinCerrar)}</td>
          <td style="font-size:12px;">${this.observacionesItem(i).map(o => this.esc(o)).join("<br>") || "-"}</td>
        </tr>`)
      const sa = d.sinAsignar || {}
      const n = (sa.documentos?.length || 0) + (sa.liberaciones?.length || 0)
      if (n) {
        filas.push(`<tr><td colspan="13" style="font-size:12px;color:#92400e;">${n} registro(s) no se pudieron asociar a una línea de la NV (se listan en Despachos / Liberaciones como "sin asignar"); no se reparten entre ítems.</td></tr>`)
      }
      document.getElementById("trzItemsBody").innerHTML = filas.join("")
    }

    // Etiquetas de las corridas válidas del proceso; null si la API no las entrega.
    etiquetasProceso(idProceso) {
      const ses = (this._integral?.data?.sesiones || []).filter(x => String(x.IdProceso) === String(idProceso) && Number(x.Status) === 1)
      if (ses.some(x => x.Etiquetas === null || x.Etiquetas === undefined)) return null
      return ses.reduce((a, x) => a + x.Etiquetas, 0)
    }

    async buscarTexto() {
      const caja = document.getElementById("trzBusqueda")
      const texto = document.getElementById("trzTexto").value.trim()
      caja.style.display = ""
      if (texto.length < 3) { caja.textContent = "Escribe al menos 3 caracteres."; return }
      caja.textContent = "Buscando..."
      const seq = (this._busqueda = (this._busqueda || 0) + 1)
      let r
      try { r = await window.PhotinoBridge.send({ action: "trazabilidad.buscar", data: { texto } }) } catch { r = null }
      if (seq !== this._busqueda) return
      if (!r || r.ok === false) { caja.textContent = `Búsqueda no disponible: ${r?.error || "sin respuesta"} (no significa que no existan NP).`; return }
      const lista = r.data?.resultados || []
      if (!lista.length) { caja.textContent = `Sin notas de venta vigentes en SAP INNPACK para ese ${r.data?.criterio === "CODIGO" ? "código" : "cliente"}.`; return }
      caja.innerHTML = `${r.data.truncado ? `<div class="subtitle">Se muestran las ${lista.length} más recientes: acota la búsqueda.</div>` : ""}
        <div class="table-container" style="max-height:280px;overflow:auto;"><table class="table"><thead><tr><th>NP</th><th>Fecha NV</th><th>Cliente</th><th>Producto</th><th>Códigos</th><th></th></tr></thead><tbody>${lista.map(x => `
        <tr><td>${this.esc(x.np)}</td><td>${this.esc(this.txt(x.fechaNv))}</td><td>${this.esc(this.txt(x.cliente))}</td><td>${this.esc(this.txt(x.producto))}</td>
          <td>${this.esc(x.codigo)}${x.codigos > 1 ? ` y ${x.codigos - 1} más` : ""}</td><td><button class="btn-secondary" style="padding:2px 8px;" data-trz-abrir-np="${this.esc(x.np)}">Ver trazabilidad</button></td></tr>`).join("")}</tbody></table></div>`
    }

    // Vuelve al estado inicial: descarta la consulta en curso para que una respuesta tardía no repinte la pantalla.
    limpiarConsulta() {
      this._consultaId++
      this._busqueda = (this._busqueda || 0) + 1
      this._integral = null
      this._ultimaConsulta = null
      this._sgi = null
      for (const id of ["trzNp", "trzLote", "trzTexto"]) { const x = document.getElementById(id); if (x) x.value = "" }
      for (const id of ["trzBusqueda", "trzResultado", "trzEstadoConexion"]) { const x = document.getElementById(id); if (x) x.style.display = "none" }
    }

    async verVersiones() {
      const np = this._integral?.np
      if (!np) { alert("Consulta una NP primero"); return }
      const r = await window.CalidadNp.send("calidadNp.informes.list", { np })
      if (!r.ok) { alert(r.error || "No se pudo consultar el historial"); return }
      this._versiones = r.data || []
      const filas = this._versiones.map(v => `<tr><td>${this.esc(v.version)}</td><td>${this.esc(v.formato)}</td><td>${this.esc(v.generadoPor)}</td><td>${this.esc(window.CalidadNp.fechaHora(v.fecha))}</td><td><button class="btn-secondary" style="padding:2px 8px;" data-trz-informe="${this.esc(v.id)}">Abrir</button></td></tr>`).join("")
      window.CalidadNp.modal("trzVersionesModal", `Informes guardados de la NP ${np}`, `<p class="subtitle">Cada versión se abre tal como se guardó; no se recalcula con datos actuales.</p>
        <table class="table"><thead><tr><th>Versión</th><th>Formato</th><th>Generado por</th><th>Fecha</th><th></th></tr></thead><tbody>${filas || `<tr><td colspan="5">Sin versiones guardadas</td></tr>`}</tbody></table>`, "", null, 760)
    }

    async abrirVersion(id) {
      const r = await window.CalidadNp.send("calidadNp.informes.get", { id })
      if (!r.ok || !r.data?.html) { alert(r.error || "No se pudo abrir la versión"); return }
      if (String(r.data.np) !== String(this._integral?.np)) { alert("La versión pertenece a otra NP."); return }
      const v = (this._versiones || []).find(x => String(x.id) === String(id))
      window.CalidadNp.imprimirHtml(this.conVersion(r.data.html, v || r.data))
    }

    // El número lo asigna la API al guardar, así que se imprime al reabrir. El HTML almacenado no se modifica.
    conVersion(html, v) {
      if (v?.version === undefined || v.version === null) return html
      const quien = v.generadoPor ? `, guardada por ${v.generadoPor}` : ""
      const cuando = v.fecha ? ` el ${window.CalidadNp.fechaHora(v.fecha)}` : ""
      const marca = `<div style="font:bold 10px Arial,sans-serif;text-align:right;margin-bottom:3px">${this.esc(`Versión guardada N° ${v.version}${quien}${cuando}`)}</div>`
      return html.replace(/<body[^>]*>/i, m => m + marca)
    }

    // Registros que forman un proceso de FPS: corridas, controles de esas corridas y mermas de la etapa.
    detalleProceso(idProceso) {
      const d = this._integral?.data
      const p = (d?.procesos || []).find(x => String(x.IdProceso) === String(idProceso) && !x.idProcesoDuplicado)
      if (!p) return null
      const corridas = (d.sesiones || []).filter(s => String(s.IdProceso) === String(idProceso))
      const claves = new Set(corridas.map(s => String(s.RecordKey)))
      const controles = d.controlesProceso ? this.agruparControles(d.controlesProceso.filter(c => claves.has(String(c.RecordKey)))) : null
      const C = window.CalidadNp
      const etapa = C?.etapaDe(`${p.NombreCarpeta || ""} ${p.NombreProceso || ""} ${p.Categoria || ""}`) || null
      const mermas = this._integral.mermas?.items ? this._integral.mermas.items.filter(m => m.estado !== "ANULADA" && etapa && C.etapaDe(m.proceso) === etapa) : null
      // Defectos de inspección de la NP en la misma etapa. Sin la fuente no hay lista (nunca "sin defectos").
      const inspeccion = this._integral.calidad?.registros
      const defectos = inspeccion?.estado === "OK" && etapa && etapa !== "Otro"
        ? inspeccion.items.filter(r => r.tipoDefecto && C.etapaDe(r.proceso) === etapa) : null
      return { proceso: p, corridas, controles, etapa, mermas, defectos }
    }

    verProceso(idProceso) {
      const x = this.detalleProceso(idProceso)
      if (!x) return
      const tabla = (cols, filas, vacio) => `<div class="table-container"><table class="table"><thead><tr>${cols.map(c => `<th>${this.esc(c)}</th>`).join("")}</tr></thead><tbody>${filas === null ? `<tr><td colspan="${cols.length}">${ND}</td></tr>` : !filas.length ? `<tr><td colspan="${cols.length}">${vacio}</td></tr>` : filas.map(f => `<tr>${f.map(v => `<td>${this.esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      const corridas = x.corridas.map(s => [this.txt(s.ProductionStartDate || s.SetupStartDate), this.txt(s.ProductionEndDate), this.txt(s.TurnoEstimado), this.txt(s.Maquina), this.txt(s.Operador),
        this.num(s.ProductionQuantity), this.num(s.SetupQuantity), this.num(s.Etiquetas), s.RecordKey, Number(s.Status) === 1 ? "Válida" : "Anulada (no suma)"])
      const controles = x.controles && x.controles.map(g => [this.txt(g.Fecha), g.RecordKey, this.txt(g.Formulario), g.respuestas.length, g.respuestas.map(r => `${r.Pregunta}: ${r.Respuesta}`).join(" · ")])
      const mermas = x.mermas && x.mermas.map(m => [this.fechaCorta(m.fecha), this.txt(m.defecto), `${this.num(m.cantidad)} ${String(m.unidad || "").toLowerCase()}`, this.txt(m.metodo), this.txt(m.estado)])
      const defectos = x.defectos && x.defectos.map(r => [this.txt(r.fechaRegistro), r.id, this.txt(r.maquina), this.txt(r.codigoProducto), r.tipoDefecto, this.txt(r.estadoValidacion)])
      const originales = x.corridas.map(s => `<button type="button" class="btn-secondary" style="padding:1px 6px;margin:0 4px 4px 0;" data-trz-corrida="${this.esc(s.RecordKey)}">Ver registro original ${this.esc(s.RecordKey)}</button>`).join("")
      window.CalidadNp.modal("trzProcesoModal", `${x.proceso.NombreProceso || "Proceso"} · OT ${x.proceso.OrdenTrabajo}`, `
        <p class="subtitle">Registro de origen en FPS: proceso ${this.esc(x.proceso.IdProceso)}. El turno es estimado por la hora de inicio; la cantidad es la declarada por el operador.</p>
        <b>Corridas</b>${tabla(["Inicio", "Término", "Turno (est.)", "Máquina", "Operador", "Producido", "Puesta a punto", "Etiquetas", "Corrida", "Estado"], corridas, "Sin corridas")}
        <div style="margin:6px 0;">${originales}</div><div id="trzRegistroOriginal"></div>
        <b>Defectos registrados en inspección para esta etapa (no ligados a una corrida concreta)</b>${tabla(["Fecha", "Registro", "Máquina", "Código", "Defecto", "Validación"], defectos, "Sin registros de control con defecto en la etapa")}
        <b>Controles de proceso y limpieza de estas corridas</b>${tabla(["Fecha", "Corrida", "Formulario", "Respuestas", "Detalle"], controles, "FPS no tiene formularios para estas corridas")}
        <b>Mermas registradas en la etapa ${this.esc(x.etapa || "")} (no ligadas a una corrida concreta)</b>${tabla(["Fecha", "Defecto", "Cantidad", "Certeza", "Estado"], mermas, "Sin mermas registradas")}`, "", null, 1100)
    }

    async verRegistroOriginal(corrida) {
      const el = document.getElementById("trzRegistroOriginal")
      if (!el) return
      const consulta = (this._pedidoCorrida = {})
      el.textContent = "Consultando FPS..."
      let res
      try {
        res = await window.PhotinoBridge.send({ action: "trazabilidad.registroOriginal", data: { np: this._integral.np, corrida: String(corrida) } })
      } catch (err) {
        res = { ok: false, error: err?.message }
      }
      if (consulta !== this._pedidoCorrida) return
      el.innerHTML = this.htmlRegistroOriginal(res, corrida)
    }

    htmlRegistroOriginal(res, corrida) {
      if (!res || res.ok === false) return `<p class="subtitle" style="color:#b91c1c;">Registro original de la corrida ${this.esc(corrida)}: ${this.esc(res?.error || ND)}</p>`
      if (!res.data?.campos) return `<p class="subtitle">FPS no encontró la corrida ${this.esc(corrida)} en esta NP.</p>`
      return `<div class="card" style="padding:8px 12px;margin-bottom:10px;"><b>Registro original · ${this.esc(res.data.sistema)} ${this.esc(res.data.tabla)} · corrida ${this.esc(res.data.corrida)}</b>
        <p class="subtitle">Valores tal como están guardados en FPS, sin conversiones.</p>
        <div class="table-container" style="max-height:260px;overflow:auto;"><table class="table" style="min-width:0;"><thead><tr><th>Campo en FPS</th><th>Valor</th></tr></thead><tbody>${res.data.campos.map(c => `<tr><td>${this.esc(c.campo)}</td><td>${c.valor === null ? "<i>vacío</i>" : this.esc(c.valor)}</td></tr>`).join("")}</tbody></table></div></div>`
    }

    renderFps() {
      const d = this._integral.data
      if (!d || !d.procesos) return this.filasVacias("trzFpsBody", 17, ND)
      const ordenes = d.ordenes || []
      document.getElementById("trzOrdenes").textContent = ordenes.length
        ? ordenes.map(o => `OT ${o.OrdenTrabajo} (NV FARET ${this.txt(o.NotaVentaFaret)}, ingreso ${this.txt(o.FechaIngreso)}, cliente ${this.txt(o.Cliente)})`).join(" · ")
          + (d.sesionesTruncadas ? " · Atención: corridas truncadas por límite de consulta." : "")
          + this.guiasTecnicas(d).map(g => ` · Guía técnica OT ${g.ot} (texto registrado en FPS): ${g.texto}`).join("")
        : "FPS no tiene órdenes de trabajo para esta NP."
      if (d.procesos.length === 0) return this.filasVacias("trzFpsBody", 17, "Sin procesos FPS")
      document.getElementById("trzFpsBody").innerHTML = d.procesos.filter(p => !p.idProcesoDuplicado).map(p => `
        <tr>
          <td>${this.esc(p.OrdenTrabajo)}</td>
          <td>${this.esc(p.NombreCarpeta)}</td>
          <td>${this.esc(p.NombreProceso)} <button class="btn-secondary" style="padding:1px 6px;" data-trz-proceso="${this.esc(p.IdProceso)}">Ver detalle</button></td>
          <td>${this.esc([p.NrPl, p.ItemCode].filter(Boolean).join(" / ") || "-")}</td>
          <td>${this.num(p.CantidadTotal)}</td>
          <td>${this.num(p.producido)}</td>
          <td>${this.num(p.setup)}</td>
          <td>${this.num(p.palletVerde)}</td>
          <td>${this.num(p.palletAzul)}</td>
          <td>${this.num(p.palletRojo)}</td>
          <td>${p.sesiones}${p.sesionesExcluidas ? ` (${p.sesionesExcluidas} anuladas)` : ""}</td>
          <td>${this.num(this.etiquetasProceso(p.IdProceso))}</td>
          <td>${this.esc(p.maquinas.join(", ") || "-")}</td>
          <td>${this.esc(p.operadores.join(", ") || "-")}</td>
          <td>${this.esc(this.txt(p.desde))}</td>
          <td>${this.esc(this.txt(p.hasta))}</td>
          <td>${p.enCurso ? "En curso" : (p.sesiones ? "Registrado" : "Sin corridas")}${p.valoresNoNumericos ? " · pallets con texto no numérico" : ""}</td>
        </tr>`).join("")
    }

    renderConsumos() {
      const d = this._integral.data
      if (!d || !d.consumos) {
        const e = d?.fuentes?.sapConsumos?.error
        return this.filasVacias("trzConsumosBody", 14, e === "DEMASIADAS_OT" ? "La NP tiene demasiadas OT para consultar consumos" : ND)
      }
      if (d.consumos.length === 0) return this.filasVacias("trzConsumosBody", 14, "SAP no tiene salidas de material registradas para las OT de esta NP (no equivale a consumo cero)")
      document.getElementById("trzConsumosBody").innerHTML = d.consumos.map(c => {
        const lotes = c.lotes.length ? c.lotes : [null]
        return lotes.map((l, k) => `
          <tr>
            <td>${k ? "" : this.esc(c.base)}</td>
            <td>${k ? "" : this.esc(c.fecha)}</td>
            <td>${k ? "" : this.esc(c.docNum)}</td>
            <td>${k ? "" : this.esc(this.txt(c.ordenTrabajo))}</td>
            <td>${k ? "" : this.esc(c.itemCode)}</td>
            <td>${k ? "" : this.esc(c.descripcion) + (c.categoria ? `<div style="font-size:11px;color:#6b7280;">${this.esc(c.categoria)}</div>` : "")}</td>
            <td>${k ? "" : this.num(c.cantidad)}</td>
            <td>${k ? "" : this.num(c.devuelto)}</td>
            <td>${k ? "" : this.num(c.neto)}</td>
            <td>${k ? "" : this.esc(this.txt(c.unidad))}</td>
            <td>${l ? `<a href="#" data-trz-lote="${this.esc(l.lote)}" onclick="return false;">${this.esc(l.lote)}</a>` : "Sin lote"}${l?.estado && l.estado !== "Liberado" ? `<div style="font-size:11px;color:#b91c1c;">Hoy en SAP: ${this.esc(l.estado)}</div>` : ""}</td>
            <td>${l ? this.num(l.cantidad) : "-"}</td>
            <td>${l ? this.esc([l.origenTipo, l.origenDocNum, l.origenFecha].filter(Boolean).join(" ") || ND) : "-"}${l?.recepcionDocEntry ? ` <button class="btn-secondary" style="padding:2px 8px;" title="Archivos que SAP tiene adjuntos a la recepción. No están clasificados: no se asume que sean certificados del proveedor." data-trz-adjunto data-tipo="recepcion" data-empresa="${this.esc(c.base)}" data-doc="${this.esc(l.recepcionDocEntry)}">Ver adjuntos</button>` : ""}${l && l.origenCantidad !== null && l.origenCantidad !== undefined ? `<div style="font-size:11px;color:#6b7280;">Ingresó del lote: ${this.num(l.origenCantidad)} ${this.esc(c.unidad || "")}</div>` : ""}</td>
            <td>${l ? this.esc(this.txt(l.origenNombre)) : "-"}</td>
          </tr>`).join("")
      }).join("")
    }

    estadoFolio(l) {
      if (!l.BodegaDestino || l.Cantidad === null || l.Cantidad === undefined || !l.Fecha) return "Incompleto (no suma)"
      return "Cerrado"
    }

    renderLiberaciones() {
      const d = this._integral.data
      if (!d || !d.liberaciones) return this.filasVacias("trzLiberacionesBody", 13, ND)
      if (d.liberaciones.length === 0) return this.filasVacias("trzLiberacionesBody", 13, "Sin folios de liberación para esta NP")
      const sinAsignar = new Set((d.sinAsignar?.liberaciones || []).map(l => l.Folio))
      document.getElementById("trzLiberacionesBody").innerHTML = d.liberaciones.map(l => `
        <tr>
          <td>${this.esc(l.Folio)}</td>
          <td>${this.esc(this.txt(l.Item))}</td>
          <td>${this.esc(l.ItemCode)}</td>
          <td>${this.esc(this.txt(l.Fecha))}</td>
          <td>${l.Cantidad === null || l.Cantidad === undefined ? "-" : this.num(l.Cantidad)}</td>
          <td>${this.esc(this.txt(l.BodegaOrigen))}</td>
          <td>${this.esc(this.txt(l.BodegaDestino))}</td>
          <td>${this.esc(this.txt(l.Maquina))}</td>
          <td>${this.esc(this.txt(l.Operador))}</td>
          <td>${this.esc(this.txt(l.Inspector))}</td>
          <td>${l.adhesivos ? this.adhesivosHtml(l) : this.esc(ND)}</td>
          <td>${this.esc([l.Bultos, l.Embalaje].filter(Boolean).join(" ") || "-")}</td>
          <td>${this.estadoFolio(l)}${sinAsignar.has(l.Folio) ? " · sin línea NV asociada" : ""}</td>
        </tr>`).join("")
    }

    tipoDocumento(d) {
      if (d.Tipo === "GUIA") return "Guía de despacho"
      if (d.Tipo === "FACTURA" && d.Origen === "RESERVA") return "Factura de reserva"
      if (d.Tipo === "FACTURA") return d.Origen === "DIRECTA" ? "Factura (despacho directo)" : "Factura de guía"
      if (d.Tipo === "DEVOLUCION") return "Devolución"
      if (d.Tipo === "NOTA_CREDITO") return "Nota de crédito"
      return d.Tipo
    }

    itemDeLinea(linea) {
      const nv = this._integral.data?.notaVenta || []
      const l = nv.find(x => Number(x.LineNum) === Number(linea))
      return l ? `${this.txt(l.Item)} (línea ${linea})` : null
    }

    tipoAdjunto(tipo) {
      return { GUIA: "guia", FACTURA: "factura", DEVOLUCION: "devolucion", NOTA_CREDITO: "notacredito" }[tipo] || ""
    }

    observacionDocumento(d) {
      if (d.LineaNv === null || d.LineaNv === undefined) return "Sin línea NV asociada (no suma)"
      if (d.Tipo === "FACTURA" && d.Origen === "RESERVA") return "Reserva: no mueve inventario; suman sus guías"
      if (d.Tipo === "FACTURA" && d.Origen !== "DIRECTA") return "Facturación de una guía: no suma al despachado"
      if (d.Tipo === "NOTA_CREDITO") return Number(d.RepusoStock) === 1 ? "Reingresó stock en SAP: resta al despachado (no acredita devolución física)" : "Sin movimiento de inventario: no resta"
      if (d.Tipo === "DEVOLUCION") return "Resta al despachado"
      return "Suma al despachado"
    }

    renderDespachos() {
      const d = this._integral.data
      if (!d || !d.documentos) return this.filasVacias("trzDespachosBody", 10, ND)
      if (d.documentos.length === 0) return this.filasVacias("trzDespachosBody", 10, "Sin guías ni facturas para esta NP")
      document.getElementById("trzDespachosBody").innerHTML = d.documentos.map(x => `
        <tr>
          <td>${this.esc(this.tipoDocumento(x))}</td>
          <td>${this.esc(x.DocNum)}</td>
          <td>${this.esc(this.txt(x.FolioNum))}</td>
          <td>${this.esc(this.txt(x.DocDate))}</td>
          <td>${this.esc(this.itemDeLinea(x.LineaNv) || "-")}</td>
          <td>${this.esc(x.ItemCode)}</td>
          <td>${this.num(x.Cantidad)}</td>
          <td>${this.esc(this.txt(x.Pallets))}</td>
          <td>${x.TieneAdjunto ? `<button class="btn-secondary" data-trz-adjunto data-tipo="${this.esc(this.tipoAdjunto(x.Tipo))}" data-doc="${this.esc(x.DocEntry)}">Ver PDF</button>` : "No"}</td>
          <td>${this.esc(this.observacionDocumento(x))}</td>
        </tr>`).join("")
    }

    filasCalidad() {
      const { registros, productoTerminado } = this._integral.calidad
      const filas = []
      for (const r of registros.items) {
        filas.push({
          origen: "Registro de control", id: r.id, fecha: [r.fechaRegistro, r.horaRegistro].filter(Boolean).join(" "),
          proceso: r.proceso, maquina: r.maquina, codigo: r.codigoProducto, resultado: r.estado,
          validacion: r.estadoValidacion, merma: r.cantidadMerma === null || r.cantidadMerma === undefined || r.cantidadMerma === ""
            ? "-" : `${this.num(r.cantidadMerma)}${r.tipoMerma ? " (" + r.tipoMerma + ")" : ""}`,
          usuario: r.usuario
        })
      }
      for (const r of productoTerminado.items) {
        filas.push({
          origen: "Producto terminado", id: r.id, fecha: [r.fechaRegistro, r.horaRegistro].filter(Boolean).join(" "),
          proceso: r.proceso, maquina: r.maquina, codigo: r.codigoProducto, resultado: r.resultado,
          validacion: "-", merma: "-", usuario: r.inspector
        })
      }
      return filas
    }

    // El listado de Laboratorio entrega como máximo 300 muestras: si llega al tope se avisa.
    renderLaboratorio() {
      const lab = this._integral.calidad.laboratorio
      if (lab.estado === "SIN_PERMISO") return this.filasVacias("trzLabBody", 9, "Sin permiso para ver Laboratorio")
      if (lab.estado !== "OK") return this.filasVacias("trzLabBody", 9, ND)
      if (!lab.items.length) return this.filasVacias("trzLabBody", 9, "Sin muestras de laboratorio registradas con esta NP")
      const html = lab.items.map(m => `<tr>${[m.id, m.fechaIngreso, m.tipoMuestra, m.origen, m.codigoProducto, m.descripcion, m.totalEnsayos, m.estado, m.evaluacion]
        .map(v => `<td>${this.esc(this.txt(v))}</td>`).join("")}</tr>`)
      if (lab.items.length >= 300) html.push(`<tr><td colspan="9" style="font-size:12px;color:#92400e;">Se muestran las 300 muestras más recientes. Revisa el resto en Laboratorio.</td></tr>`)
      document.getElementById("trzLabBody").innerHTML = html.join("")
    }

    renderCalidad() {
      this.renderLaboratorio()
      const { registros, productoTerminado } = this._integral.calidad
      const filas = this.filasCalidad()
      const avisos = []
      for (const [nombre, c] of [["Registros de control", registros], ["Producto terminado", productoTerminado]]) {
        if (c.estado === "SIN_PERMISO") avisos.push(`${nombre}: sin permiso para verlo`)
        else if (c.estado === "ERROR") avisos.push(`${nombre}: ${ND}`)
      }
      if (registros.estado === "OK" && registros.total > 500) avisos.push(`Registros de control: se muestran los primeros 500 de ${registros.total}`)
      const html = filas.map(f => `
        <tr>
          <td>${this.esc(f.origen)}</td><td>${this.esc(f.id)}</td><td>${this.esc(this.txt(f.fecha))}</td>
          <td>${this.esc(this.txt(f.proceso))}</td><td>${this.esc(this.txt(f.maquina))}</td><td>${this.esc(this.txt(f.codigo))}</td>
          <td>${this.esc(this.txt(f.resultado))}</td><td>${this.esc(this.txt(f.validacion))}</td><td>${this.esc(f.merma)}</td>
          <td>${this.esc(this.txt(f.usuario))}</td>
        </tr>`)
      if (avisos.length) html.push(`<tr><td colspan="10" style="font-size:12px;color:#92400e;">${avisos.map(a => this.esc(a)).join(" · ")}</td></tr>`)
      if (!filas.length && !avisos.length) return this.filasVacias("trzCalidadBody", 10, "Sin controles de Calidad registrados para esta NP")
      document.getElementById("trzCalidadBody").innerHTML = html.join("")
    }

    // ── Búsqueda por lote ───────────────────────────────────────────────────────────────────

    // null o ausente = no se pudo consultar (o la API aún no lo entrega): nunca se muestra como "sin despachos".
    renderVentasLote(d) {
      if (!Array.isArray(d.ventas)) return this.filasVacias("trzLoteVentasBody", 7, ND)
      if (!d.ventas.length) return this.filasVacias("trzLoteVentasBody", 7, "SAP no registra guías, facturas con salida, devoluciones ni notas de crédito que muevan este lote")
      const html = d.ventas.map(v => `<tr><td>${this.esc(v.base)}</td><td>${this.esc(this.txt(v.fecha))}</td><td>${this.esc(v.tipo)} ${this.esc(v.docNum)}</td>
        <td>${this.esc(v.itemCode)}</td><td>${this.esc(this.txt(v.cliente))}</td><td>${v.movimiento === "SALIDA" ? "Salida" : "Reingreso"}</td><td>${this.num(v.cantidad)}</td></tr>`)
      if (d.ventasTruncadas) html.push(`<tr><td colspan="7" style="font-size:12px;color:#92400e;">Resultado truncado por límite de consulta.</td></tr>`)
      document.getElementById("trzLoteVentasBody").innerHTML = html.join("")
    }

    // lote → OT (salida SAP) → pallet cuya OT verificó FPS al clasificarlo. No demuestra que el pallet contenga el lote.
    // Un pallet verificado de otra OT de la misma NP queda fuera; sin verificación FPS solo se sabe que es de la NP.
    relacionarPalletsLote(consumos, respuestas) {
      const norma = v => { const s = String(v ?? "").trim(); return /^\d+$/.test(s) ? String(Number(s)) : s }
      const filas = [], vistos = new Set()
      let otrasOt = 0
      for (const r of respuestas) {
        const ots = new Set(consumos.filter(c => String(c.npInnpack) === String(r.np)).map(c => norma(c.ordenTrabajo)))
        for (const p of this.palletsDeNp(r.items, r.np)) {
          const clave = p.id ?? `${p.palletCodigo}|${p.clasificadoEn}`
          if (vistos.has(clave)) continue
          vistos.add(clave)
          const ot = p.fps?.verificado ? norma(p.fps.ordenFabricacion) : ""
          if (ot && !ots.has(ot)) { otrasOt++; continue }
          filas.push({ np: r.np, ot: ot || null, relacion: ot ? "Misma OT que consumió el lote" : "Solo misma NP (OT del pallet sin verificar)", pallet: p })
        }
      }
      return { filas, otrasOt }
    }

    // El filtro de la API compara también NP FARET y OT: palletsDeNp deja solo la NP INNPACK exacta.
    async cargarPalletsLote(consulta) {
      const MAX_NP_PALLETS = 10
      this.filasVacias("trzLotePalletsBody", 7, "Consultando...")
      const nps = [...new Set(consulta.data.consumos.filter(c => c.npInnpack).map(c => String(c.npInnpack)))]
      const respuestas = []
      const fallidas = []
      let truncado = false
      for (const np of nps.slice(0, MAX_NP_PALLETS)) {
        let res = null
        try {
          res = await window.PhotinoBridge.send({ action: "trazabilidad.pallets", data: { np } })
        } catch {
          res = null
        }
        if (consulta !== this._lote) return // llegó otra búsqueda
        if (!res || res.ok === false) { fallidas.push(np); continue }
        if (Number(res.data?.total) > 200) truncado = true
        respuestas.push({ np, items: res.data?.items || [] })
      }
      const r = this.relacionarPalletsLote(consulta.data.consumos, respuestas)
      const avisos = [
        fallidas.length ? `Pallets no disponibles o sin permiso para la(s) NP ${fallidas.join(", ")}.` : "",
        nps.length > MAX_NP_PALLETS ? `Se consultaron ${MAX_NP_PALLETS} de ${nps.length} NP.` : "",
        truncado ? "Resultado truncado a las 200 clasificaciones más recientes por NP." : "",
        r.otrasOt ? `${r.otrasOt} pallet(s) de otras OT de esas NP no se muestran.` : "",
        consulta.data.consumos.some(c => !c.npInnpack) ? "Hay salidas sin NP INNPACK reconocida: sus pallets no se pueden buscar." : ""
      ].filter(Boolean)
      consulta.pallets = { ...r, avisos, completo: !fallidas.length && !truncado && nps.length <= MAX_NP_PALLETS }
      document.getElementById("trzLotePalletsNota").textContent =
        ["Pallets clasificados en la app (desde el 23-11-2026) de las OT que consumieron el lote. La relación es por orden: no demuestra que cada pallet contenga este lote.", ...avisos].join(" ")
      if (!r.filas.length) {
        return this.filasVacias("trzLotePalletsBody", 7, !nps.length ? "No hay una NP INNPACK reconocida para buscar pallets"
          : consulta.pallets.completo ? "No hay pallets clasificados relacionados" : ND)
      }
      document.getElementById("trzLotePalletsBody").innerHTML = r.filas.map(f => `<tr><td>${this.esc(this.txt(f.pallet.palletCodigo))}${f.pallet.nEtiqueta ? ` (N° ${this.esc(f.pallet.nEtiqueta)})` : ""}</td>
        <td><a href="#" data-trz-np="${this.esc(f.np)}" onclick="return false;">${this.esc(f.np)}</a></td><td>${this.esc(this.txt(f.ot))}</td><td>${this.esc(f.relacion)}</td>
        <td>${this.esc(this.txt(f.pallet.color))}</td><td>${this.esc(this.txt(f.pallet.fps?.codigoProducto))}</td><td>${this.esc(this.txt(f.pallet.clasificadoEn))}</td></tr>`).join("")
    }

    async buscarLote() {
      const lote = document.getElementById("trzLote")?.value?.trim()
      if (!lote) {
        alert("Ingresa un lote")
        return
      }
      this.vista(true)
      const id = ++this._consultaId
      const cont = document.getElementById("trzLoteResultado")
      document.getElementById("trzResultado").style.display = "none"
      document.getElementById("trzEstadoConexion").style.display = "none"
      cont.style.display = "block"
      document.getElementById("trzLoteTitulo").textContent = `Lote ${lote}`
      document.getElementById("trzLoteAviso").textContent = "Consultando SAP y FPS..."
      this.filasVacias("trzLotesBody", 10, "Consultando...")
      this.filasVacias("trzLoteConsumosBody", 9, "Consultando...")
      this.filasVacias("trzLoteVentasBody", 7, "Consultando...")
      this.filasVacias("trzLotePalletsBody", 7, "Consultando...")
      document.getElementById("trzLotePalletsNota").textContent = ""
      this._lote = null

      let res
      try {
        res = await window.PhotinoBridge.send({ action: "trazabilidad.lote", data: { lote } })
      } catch (err) {
        res = { ok: false, error: err?.message }
      }
      if (id !== this._consultaId) return
      if (!res || res.ok === false) {
        document.getElementById("trzLoteAviso").textContent = res?.error || "No se pudo consultar el lote"
        this.filasVacias("trzLotesBody", 10, ND)
        this.filasVacias("trzLoteConsumosBody", 9, ND)
        this.filasVacias("trzLoteVentasBody", 7, ND)
        this.filasVacias("trzLotePalletsBody", 7, ND)
        return
      }
      const d = res.data
      this._lote = { lote, data: d, consultadoEn: new Date() }
      const avisos = []
      if (!d.lotes.length) avisos.push("SAP (FARET e INNPACK) no tiene un lote con ese número interno ni con esa serie de fabricante.")
      if (!d.fpsDisponible) avisos.push("FPS no disponible: no se pudo asociar las OT a su NP.")
      if (d.truncado) avisos.push("Resultado truncado por límite de consulta.")
      document.getElementById("trzLoteAviso").textContent = avisos.join(" ") ||
        "Busca el lote interno de SAP y la serie del fabricante. Haga clic en una NP para ver su trazabilidad completa."

      document.getElementById("trzLotesBody").innerHTML = d.lotes.length ? d.lotes.map(l => `
        <tr>
          <td>${this.esc(l.base)}</td><td>${this.esc(l.itemCode)}</td><td>${this.esc(l.itemName)}</td><td>${this.esc(l.lote)}</td>
          <td>${this.esc(this.txt(l.serieFabricante))}</td><td>${this.esc(this.txt(l.loteProveedor))}</td><td>${this.esc(this.txt(l.ingreso))}</td>
          <td>${this.esc(l.origen ? l.origen.tipo : ND)}</td>
          <td>${this.esc(l.origen ? `${l.origen.docNum} (${this.txt(l.origen.fecha)})` : "-")}</td>
          <td>${this.esc(l.origen ? this.txt(l.origen.nombre) : "-")}</td>
        </tr>`).join("") : `<tr><td colspan="10" style="text-align:center;">Lote no encontrado</td></tr>`

      this.renderVentasLote(d)
      this.cargarPalletsLote(this._lote)

      if (!d.consumos.length) {
        this.filasVacias("trzLoteConsumosBody", 9, "SAP no registra salidas a producción de este lote")
        return
      }
      document.getElementById("trzLoteConsumosBody").innerHTML = d.consumos.map(c => `
        <tr>
          <td>${this.esc(c.base)}</td><td>${this.esc(this.txt(c.fecha))}</td><td>${this.esc(c.docNum)}</td>
          <td>${this.esc(this.txt(c.ordenTrabajo))}${c.ordenTrabajo && !c.otReconocida ? " (OT no reconocida en FPS)" : ""}</td>
          <td>${this.num(c.cantidad)}</td>
          <td>${c.npInnpack ? `<a href="#" data-trz-np="${this.esc(c.npInnpack)}" onclick="return false;">${this.esc(c.npInnpack)}</a>` : "-"}</td>
          <td>${this.esc(this.txt(c.npFaret))}</td><td>${this.esc(this.txt(c.cliente))}</td>
          <td style="font-size:12px;">${this.esc(c.productos.map(p => `${this.txt(p.nrPl)}: ${p.itemCode} ${this.txt(p.itemName)}`).join(" | ") || "-")}</td>
        </tr>`).join("")
    }

    // ── Excel (varias hojas, con estado del dato y referencia al registro de origen) ───────────

    xl(v) {
      return v === null || v === undefined ? ND : v
    }

    hoja(wb, nombre, titulo, encabezados, filas) {
      const aoa = [[titulo], [], encabezados, ...(filas.length ? filas : [["Sin datos"]])]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws["!cols"] = encabezados.map((h, i) => ({
        wch: Math.min(Math.max(String(h).length, ...aoa.slice(2).map(r => String(r[i] ?? "").length)) + 2, 50)
      }))
      for (let c = 0; c < encabezados.length; c++) {
        const ref = XLSX.utils.encode_cell({ r: 2, c })
        if (ws[ref]) ws[ref].s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "111827" } } }
      }
      if (ws.A1) ws.A1.s = { font: { bold: true, sz: 14 } }
      XLSX.utils.book_append_sheet(wb, ws, nombre)
    }

    guardarLibro(wb, fileName) {
      const base64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" })
      window.PhotinoBridge.send({ action: "excel.guardar", data: { fileName, base64 } })
        .then(res => window.ExcelExporter?.showToast?.(res?.ok ? "Archivo exportado correctamente" : "Error exportando archivo"))
        .catch(() => window.ExcelExporter?.showToast?.("Error exportando archivo"))
    }

    fechaArchivo(d) {
      const p = n => String(n).padStart(2, "0")
      return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
    }

    exportarExcelNp() {
      const t = this._integral
      if (!t) {
        alert("Consulta un NP y espera a que termine la trazabilidad integral")
        return
      }
      if (typeof XLSX === "undefined") {
        alert("La librería de Excel no está disponible")
        return
      }
      const d = t.data || {}
      const f = d.fuentes || {}
      const est = x => (x && x.ok ? "Disponible" : `No disponible${x?.error ? " (" + x.error + ")" : ""}`)
      const wb = XLSX.utils.book_new()
      const generado = t.consultadoEn.toLocaleString("es-CL")

      this.hoja(wb, "Resumen", `Trazabilidad integral NP ${t.np} (INNPACK) — generado ${generado}`, ["Concepto", "Valor"], [
        ["NP", t.np],
        ["Órdenes de trabajo FPS", (d.ordenes || []).map(o => o.OrdenTrabajo).join(", ") || ND],
        ["Fuente FPS (órdenes y corridas)", t.data ? est(f.fps) : t.error],
        ["Fuente SAP nota de venta", t.data ? est(f.sapNotaVenta) : t.error],
        ["Fuente SAP despachos", t.data ? est(f.sapDespachos) : t.error],
        ["Fuente SAP consumos", t.data ? est(f.sapConsumos) : t.error],
        ["Fuente liberaciones QCS", t.data ? est(f.liberaciones) : t.error],
        ["Registros de control", t.calidad.registros.estado],
        ["Producto terminado", t.calidad.productoTerminado.estado],
        ["Laboratorio", t.calidad.laboratorio.estado],
        ["Confirmado", "Dato registrado en el sistema de origen (SAP, FPS, QCS o QCC)."],
        ["Registrado en FPS", "Cantidad declarada por el operador en FPS; no es una cantidad confirmada por inventario."],
        ["Estimado", "Cálculo de QCC sobre datos confirmados. Nunca es definitivo."],
        ["No disponible", "La fuente no respondió o no tiene el dato. No equivale a cero."],
        ["Nota", "Una diferencia entre cantidades no es automáticamente merma. Este balance no es definitivo."]
      ])

      this.hoja(wb, "Items", `Ítems de la NP ${t.np}`,
        ["Ítem", "Código", "Descripción", "Líneas NV (SAP)", "Solicitado (confirmado SAP)", "Liberado PT (confirmado QCS)", "Cuarentena (saldo QCS)",
          "Destrucción (saldo QCS)", "Despachado (confirmado SAP)", "Devuelto (confirmado SAP)", "Pendiente despacho (estimado)",
          "Folios sin cerrar", "Observaciones", "Referencia origen"],
        (d.items || []).map(i => [i.item, i.itemCode, i.descripcion, (i.lineasNv || []).join(", "), i.solicitado, this.xl(i.liberadoPt),
          this.xl(this.saldo(i, "CUARENTENA")), this.xl(this.saldo(i, "DESTRUCCION")), this.xl(i.despachado), this.xl(i.devuelto),
          this.xl(this.pendienteDespacho(i)), this.xl(i.foliosSinCerrar), this.observacionesItem(i).join(" "),
          `SAP INNPACK ORDR ${t.np} / RDR1 líneas ${(i.lineasNv || []).join(", ")}`]))

      this.hoja(wb, "Procesos FPS", `Procesos FPS de la NP ${t.np} (cantidades registradas en FPS, no confirmadas)`,
        ["OT", "Id proceso FPS", "Carpeta", "Proceso", "Categoría", "Pliego / ítem", "Código", "Cant. OT", "Producido (registrado)", "Setup (registrado)",
          "Pallet verde", "Pallet azul", "Pallet rojo", "Corridas", "Corridas anuladas", "Máquinas", "Operadores", "Desde", "Hasta", "Estado"],
        (d.procesos || []).filter(p => !p.idProcesoDuplicado).map(p => [p.OrdenTrabajo, String(p.IdProceso), p.NombreCarpeta, p.NombreProceso, p.Categoria,
          p.NrPl, p.ItemCode, this.xl(p.CantidadTotal), this.xl(p.producido), this.xl(p.setup), this.xl(p.palletVerde), this.xl(p.palletAzul),
          this.xl(p.palletRojo), p.sesiones, p.sesionesExcluidas, p.maquinas.join(", "), p.operadores.join(", "), p.desde, p.hasta,
          p.enCurso ? "En curso" : (p.sesiones ? "Registrado" : "Sin corridas")]))

      this.hoja(wb, "Corridas FPS", `Corridas FPS (una fila por registro de WorkOrderRecords)`,
        ["RecordKey FPS", "Id proceso FPS", "Máquina", "Operador", "Inicio setup", "Inicio producción", "Fin producción", "Setup", "Producido",
          "Pallet verde", "Pallet azul", "Pallet rojo", "Etiquetas FPS", "Estado FPS", "En curso"],
        (d.sesiones || []).map(s => [String(s.RecordKey), String(s.IdProceso), s.Maquina, s.Operador, s.SetupStartDate, s.ProductionStartDate,
          Number(s.EnCurso) === 1 ? "Estimado (corrida abierta)" : s.ProductionEndDate, this.xl(s.SetupQuantity), this.xl(s.ProductionQuantity),
          this.xl(s.PlGreenQuantity), this.xl(s.PlBlueQuantity), this.xl(s.PlRedQuantity), this.xl(s.Etiquetas), Number(s.Status) === 1 ? "Válida" : "Anulada (no suma)",
          Number(s.EnCurso) === 1 ? "Sí" : "No"]))

      // Una fila por lote: la cantidad de la línea va solo en la primera fila de cada línea (no se duplica al sumar).
      const consumos = []
      for (const c of d.consumos || []) {
        const lotes = c.lotes.length ? c.lotes : [null]
        lotes.forEach((l, k) => consumos.push([c.base, c.fecha, c.docNum, c.linea, c.ordenTrabajo, c.itemCode, c.descripcion, c.categoria,
          k ? "" : this.xl(c.cantidad), k ? "" : this.xl(c.devuelto), k ? "" : this.xl(c.neto), c.unidad, c.bodega, l ? l.lote : "Sin lote", l ? this.xl(l.cantidad) : "", l ? l.serieFabricante : "",
          l ? l.loteProveedor : "", l ? (l.origenTipo || ND) : "", l ? l.origenDocNum : "", l ? l.origenFecha : "", l ? l.origenNombre : "",
          l ? this.xl(l.origenCantidad) : "", l ? (l.estado || ND) : "",
          `SAP ${c.base} OIGE ${c.docNum} línea ${c.linea}`]))
      }
      this.hoja(wb, "Consumos", d.consumos ? `Materiales consumidos (SAP, salidas con U_NumOT de las OT de la NP ${t.np})` : `Consumos: ${ND}`,
        ["Empresa SAP", "Fecha", "Doc. salida", "Línea", "OT", "Código", "Material", "Categoría (grupo SAP)", "Cant. línea (confirmado)", "Devuelto a bodega", "Consumo neto", "Unidad", "Bodega", "Lote",
          "Cant. lote (confirmado)", "Serie fabricante", "Lote proveedor", "Origen del lote", "Doc. origen", "Fecha origen", "Proveedor", "Cant. ingresada del lote", "Estado actual del lote en SAP", "Referencia origen"],
        consumos)

      this.hoja(wb, "Liberaciones", d.liberaciones ? `Liberaciones QCS de la NP ${t.np}` : `Liberaciones: ${ND}`,
        ["Folio", "Ítem", "Código", "Fecha", "Cantidad", "Bodega origen", "Bodega destino", "Máquina", "Operador", "Inspector", "Adhesivos (QCS)", "Embalaje", "Bultos", "Estado", "Referencia origen"],
        (d.liberaciones || []).map(l => [l.Folio, l.Item, l.ItemCode, l.Fecha, this.xl(l.Cantidad), l.BodegaOrigen, l.BodegaDestino, l.Maquina,
          // adhesivos del folio (no se pueden atribuir a una corrida FPS)
          l.Operador, l.Inspector, this.adhesivos(l), l.Embalaje, this.xl(l.Bultos), this.estadoFolio(l), `Faret_Control_Calidad CCMaster folio ${l.Folio}`]))

      this.hoja(wb, "Despachos", d.documentos ? `Despachos y facturación SAP INNPACK de la NP ${t.np}` : `Despachos: ${ND}`,
        ["Tipo", "N° SAP", "Folio", "Fecha", "Línea NV", "Ítem NV", "Código", "Cantidad", "Pallets (declarado)", "Respaldo PDF", "Observación", "Referencia origen"],
        (d.documentos || []).map(x => [this.tipoDocumento(x), x.DocNum, x.FolioNum, x.DocDate, this.xl(x.LineaNv), this.itemDeLinea(x.LineaNv) || "-",
          x.ItemCode, x.Cantidad, x.Pallets, x.TieneAdjunto ? "Sí" : "No", this.observacionDocumento(x),
          `SAP INNPACK ${{ GUIA: "ODLN", FACTURA: "OINV", DEVOLUCION: "ORDN", NOTA_CREDITO: "ORIN" }[x.Tipo] || x.Tipo} ${x.DocNum} línea ${x.LineNum}`]))

      this.hoja(wb, "Calidad", `Controles de Calidad QCC de la NP ${t.np}`,
        ["Origen", "Id QCC", "Fecha", "Proceso", "Máquina", "Código producto", "Resultado / estado", "Validación", "Merma declarada", "Inspector / usuario"],
        this.filasCalidad().map(r => [r.origen, r.id, r.fecha, r.proceso, r.maquina, r.codigo, r.resultado, r.validacion, r.merma, r.usuario]))

      const paletizado = this._ultimaConsulta?.np === t.npIngresada ? this._ultimaConsulta.paletizado : null
      this.hoja(wb, "Paletizado", paletizado ? `Registros de paletizado de la NP ${t.npIngresada}` : `Paletizado: ${ND}`,
        ["Código paletizado", "Fecha", "Planta", "Taller", "Tipo", "Cantidad", "Descripción"],
        (paletizado || []).map(p => [p.idPalet, p.fecha, p.planta, p.taller, p.tipo, this.xl(p.cantidad), p.descripcion]))
      const registros = t.calidad?.registros
      this.hoja(wb, "Bobinas", registros?.estado === "OK" ? `Bobinas registradas en los controles de la NP ${t.np}` : `Bobinas: ${registros?.estado === "SIN_PERMISO" ? "sin permiso sobre Registros de control" : ND}`,
        ["Registro de control", "Fecha", "Proceso", "Máquina", "Lote de bobina", "Código", "Descripción", "Observación", "Cruce con consumos SAP"],
        this.filasBobinas().map(f => [f.registro, f.fecha, f.proceso, f.maquina, f.lote, f.codigo, f.descripcion, f.observacion, f.cruce]))

      this.guardarLibro(wb, `Trazabilidad_NP_${t.np}_${this.fechaArchivo(t.consultadoEn)}.xlsx`)
    }

    exportarExcelLote() {
      const t = this._lote
      if (!t) {
        alert("Busca un lote primero")
        return
      }
      if (typeof XLSX === "undefined") {
        alert("La librería de Excel no está disponible")
        return
      }
      const wb = XLSX.utils.book_new()
      this.hoja(wb, "Lote", `Lote ${t.lote} — generado ${t.consultadoEn.toLocaleString("es-CL")}`,
        ["Empresa SAP", "Código", "Material", "Lote", "Serie fabricante", "Lote proveedor", "Ingreso", "Origen", "Doc. origen", "Fecha origen", "Proveedor"],
        t.data.lotes.map(l => [l.base, l.itemCode, l.itemName, l.lote, l.serieFabricante, l.loteProveedor, l.ingreso,
          l.origen ? l.origen.tipo : ND, l.origen ? l.origen.docNum : "", l.origen ? l.origen.fecha : "", l.origen ? l.origen.nombre : ""]))
      this.hoja(wb, "Consumos", `Órdenes donde se consumió el lote ${t.lote}${t.data.fpsDisponible ? "" : " (FPS no disponible: NP sin asociar)"}`,
        ["Empresa SAP", "Fecha", "Doc. salida", "OT", "OT reconocida en FPS", "Cantidad (confirmado)", "NP INNPACK", "NV FARET", "Cliente", "Productos de la OT", "Referencia origen"],
        t.data.consumos.map(c => [c.base, c.fecha, c.docNum, c.ordenTrabajo, c.otReconocida ? "Sí" : "No", this.xl(c.cantidad), c.npInnpack, c.npFaret,
          c.cliente, c.productos.map(p => `${p.nrPl}: ${p.itemCode} ${p.itemName || ""}`).join(" | "), `SAP ${c.base} OIGE ${c.docNum}`]))
      const pl = t.pallets
      this.hoja(wb, "Pallets de las OT", pl ? ["Relación por orden: no demuestra que el pallet contenga el lote.", ...pl.avisos].join(" ") : "Pallets: la consulta no había terminado al exportar",
        ["Pallet", "NP", "OT del pallet", "Relación", "Color", "Código producto", "Clasificado"],
        (pl?.filas || []).map(f => [f.pallet.palletCodigo, f.np, this.xl(f.ot), f.relacion, f.pallet.color, this.xl(f.pallet.fps?.codigoProducto), f.pallet.clasificadoEn]))
      this.hoja(wb, "Despachos del lote", Array.isArray(t.data.ventas) ? `Documentos de venta que movieron el lote ${t.lote}` : `Despachos del lote: ${ND}`,
        ["Empresa SAP", "Fecha", "Documento", "Número", "Código", "Cliente", "Movimiento", "Cantidad (confirmado)"],
        (t.data.ventas || []).map(v => [v.base, v.fecha, v.tipo, v.docNum, v.itemCode, v.cliente, v.movimiento === "SALIDA" ? "Salida" : "Reingreso", this.xl(v.cantidad)]))
      this.guardarLibro(wb, `Trazabilidad_Lote_${t.lote.replace(/[^A-Za-z0-9._-]/g, "_")}_${this.fechaArchivo(t.consultadoEn)}.xlsx`)
    }

    // ── Fase 1b: factor unidades por pliego + documentos SGI (se guardan en QCC vía API INNPACK) ──

    async llamarSgi(action, data) {
      try {
        const r = await window.PhotinoBridge.send({ action, data })
        return r && r.ok !== false ? { ok: true, data: r.data } : { ok: false, error: r?.error || "No se pudo completar la operación" }
      } catch (err) {
        return { ok: false, error: err?.message || "No se pudo completar la operación" }
      }
    }

    puedeEditar() {
      return !window.App?.nivelModulo || window.App.nivelModulo("trazabilidad") === "EDITAR"
    }

    fechaCorta(v) {
      if (!v) return "-"
      // "2026-10-30" (sin hora) se interpreta como UTC y en Chile mostraría el día anterior: se arma como fecha local.
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v))
      const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v)
      return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("es-CL")
    }

    async cargarPanelSgi(np, id) {
      this._sgi = { np, requisitos: null, factores: null, puedeConfirmar: false, errorDocs: null, errorFactores: null }
      this.filasVacias("trzDocsBody", 8, "Consultando...")
      this.filasVacias("trzFactorBody", 6, "Consultando...")
      const [docs, fac] = await Promise.all([this.llamarSgi("trazabilidad.documentos.list", { np }), this.llamarSgi("trazabilidad.factor.list", { np })])
      if (id !== this._consultaId) return
      if (docs.ok) this._sgi.requisitos = docs.data?.requisitos || []
      else this._sgi.errorDocs = docs.error
      if (fac.ok) { this._sgi.factores = fac.data?.factores || []; this._sgi.puedeConfirmar = !!fac.data?.puedeConfirmar }
      else this._sgi.errorFactores = fac.error
      this.renderFactores()
      if (this._integral) this.renderFicha()
      this.renderDocumentos()
    }

    // Dato que ya existe en un sistema (solo informativo, sale de la consulta integral ya cargada).
    // Antecedente automático por requisito: datos que la consulta ya trae. Es informativo y no marca el documento como disponible.
    // Devuelve null si el requisito no tiene una fuente propia (se usa la del catálogo).
    antecedente(codigo) {
      const i = this._integral
      if (!i) return null
      const d = i.data
      const lista = (r, texto) => (!r ? "Consultando..." : r.estado === "SIN_PERMISO" ? "Sin permiso sobre el módulo de origen" : !r.items ? ND : r.estado === "ERROR" ? ND : texto(r.items))
      if (codigo === "ADQ-CERT" || codigo === "BOD-REC") {
        if (!d?.consumos) return ND
        const lotes = d.consumos.flatMap(c => c.lotes || [])
        const conOrigen = lotes.filter(l => l.origenDocNum).length
        return lotes.length ? `${lotes.length} lote(s) de material consumido, ${conOrigen} con documento de origen en SAP (ver Materiales; sus adjuntos no están clasificados)` : "SAP no registra lotes consumidos para esta NP"
      }
      if (codigo === "TIN-LOTE") {
        if (!d?.consumos) return ND
        const lotes = [...new Set(d.consumos.filter(c => /tinta/i.test(c.categoria || "")).flatMap(c => (c.lotes || []).map(l => l.lote)))]
        return lotes.length ? `${lotes.length} lote(s) de tinta consumidos según SAP: ${lotes.slice(0, 8).join(", ")}${lotes.length > 8 ? "…" : ""}` : "SAP no registra salidas con lote en una categoría de tintas (no equivale a que no se usaron)"
      }
      if (codigo === "CAL-DEST") return lista(i.certificados, x => `${x.length} certificado(s) de destrucción en QCC`)
      if (codigo === "CAL-RECH") return lista(i.nc, x => `${x.length} no conformidad(es) de producto en QCC (ver Calidad)`)
      if (codigo === "CAL-ETIQ") {
        const ses = (d?.sesiones || []).filter(x => Number(x.Status) === 1)
        if (!d?.sesiones || ses.some(x => x.Etiquetas === null || x.Etiquetas === undefined)) return ND
        return `${ses.reduce((a, x) => a + Number(x.Etiquetas), 0)} etiqueta(s) en las corridas de FPS`
      }
      return null
    }

    // ── Inspección de camión: el formulario no registra la NP, así que la persona la elige apoyada en las fechas ──

    puedeElegirInspeccion(codigo) {
      return (codigo === "LOG-CAM" || codigo === "BOD-CAM") && (!window.App?.nivelModulo || window.App.nivelModulo("formularios") !== "SIN_ACCESO")
    }

    // Rango sugerido: fechas de las guías (logística) o de ingreso de los lotes consumidos (bodega). Vacío si no hay.
    rangoInspeccion(codigo) {
      const d = this._integral?.data
      const crudas = codigo === "BOD-CAM"
        ? (d?.consumos || []).flatMap(c => c.lotes || []).map(l => l.origenFecha)
        : (d?.documentos || []).filter(x => x.Tipo === "GUIA").map(x => x.DocDate)
      const fechas = crudas.map(f => String(f || "").slice(0, 10)).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort()
      return { desde: fechas[0] || "", hasta: fechas[fechas.length - 1] || "" }
    }

    observacionInspeccion(i) {
      const fecha = this.fechaCorta(i.creadoEn ?? i.fechaInspeccion)
      return `Asociación MANUAL (no determinada por el sistema): inspección vehicular #${i.id}, patente ${i.patente || "-"}, ${fecha}, ítems que no cumplen: ${i.totalNoCumple ?? "-"}, conductor ${i.conductor || "-"}`.slice(0, 500)
    }

    elegirInspeccion(requisitoId, codigo) {
      const np = this._sgi.np
      const rango = this.rangoInspeccion(codigo)
      let lista = []
      this.modalSgi(`Elegir inspección de camión — ${this.reqNombre(requisitoId)}`, `
        <p class="subtitle">Las inspecciones no registran NP ni guía: tú indicas cuál corresponde a la NP ${this.esc(np)} y quedará anotado que la asociaste manualmente.</p>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px;">
          <div class="form-group" style="margin:0;"><label>Desde</label><input type="date" id="trzInsDesde" value="${rango.desde}"></div>
          <div class="form-group" style="margin:0;"><label>Hasta</label><input type="date" id="trzInsHasta" value="${rango.hasta}"></div>
          <button type="button" class="btn-secondary" id="trzInsBuscar">Buscar</button>
        </div>
        <div id="trzInsLista" class="subtitle" style="max-height:300px;overflow:auto;"></div>`,
      "Asociar inspección", async ov => {
        const marcada = ov.querySelector('input[name="trzIns"]:checked')
        if (!marcada) return "Elige una inspección de la lista"
        const i = lista[Number(marcada.value)]
        const res = await this.llamarSgi("trazabilidad.documentos.subir", {
          np, requisitoId, estado: "DISPONIBLE", enlace: i.pdfUrl, observacion: this.observacionInspeccion(i),
          fechaDocumento: String(i.creadoEn ?? i.fechaInspeccion ?? "").slice(0, 10) || null
        })
        if (!res.ok) return res.error
        await this.refrescarSgi()
      })
      const ov = document.getElementById("trzSgiModal")
      const caja = ov.querySelector("#trzInsLista")
      const buscar = async () => {
        const desde = ov.querySelector("#trzInsDesde").value
        const hasta = ov.querySelector("#trzInsHasta").value
        lista = []
        if (!desde || !hasta) { caja.textContent = "Indica las fechas Desde y Hasta."; return }
        caja.textContent = "Buscando..."
        const res = await this.llamarSgi("formularios.list", { tipo: "inspeccionesVehiculares", fechaDesde: desde, fechaHasta: hasta })
        if (!res.ok) { caja.textContent = `No se pudo consultar Formularios: ${res.error || "sin respuesta"} (no significa que no existan inspecciones).`; return }
        lista = res.data || []
        const filas = lista.map((i, k) => `
          <tr><td><input type="radio" name="trzIns" value="${k}" ${i.pdfUrl ? "" : "disabled"}></td><td>${this.esc(this.fechaCorta(i.creadoEn ?? i.fechaInspeccion))}</td>
            <td>${this.esc(this.txt(i.patente))}</td><td>${this.esc(this.txt(i.conductor))}</td><td>${this.esc(this.txt(i.responsable))}</td>
            <td>${this.esc(this.txt(i.totalNoCumple))}${i.pdfUrl ? "" : " · sin PDF, no se puede asociar"}</td></tr>`).join("")
        caja.innerHTML = lista.length
          ? `<table class="table" style="min-width:0;"><thead><tr><th></th><th>Fecha</th><th>Patente</th><th>Conductor</th><th>Responsable</th><th>No cumple</th></tr></thead><tbody>${filas}</tbody></table>`
          : "No hay inspecciones registradas en esas fechas."
      }
      ov.querySelector("#trzInsBuscar").onclick = buscar
      if (rango.desde) buscar()
    }

    datoEnSistema(fuente, codigo) {
      const propio = this.antecedente(codigo)
      if (propio !== null) return propio
      if (!fuente) return "-"
      const d = this._integral?.data
      const cal = this._integral?.calidad
      const cuenta = (n, txt) => (n === null || n === undefined ? ND : `${n} ${txt}`)
      switch (fuente) {
        case "NV": return d?.items ? cuenta(d.items.length, "ítem(s) en SAP") : ND
        case "FPS": return d?.procesos ? cuenta(d.procesos.filter(p => !p.idProcesoDuplicado).length, "proceso(s) en FPS") : ND
        case "LIBERACIONES": return d?.liberaciones ? cuenta(d.liberaciones.length, "folio(s) en QCS (ver Certificados de Liberación)") : ND
        case "DESPACHOS": return d?.documentos ? cuenta(d.documentos.length, "documento(s) en SAP") : ND
        case "CALIDAD": return cal ? cuenta((cal.registros?.items?.length || 0) + (cal.productoTerminado?.items?.length || 0), "registro(s) en QCC") : ND
        default: return "-"
      }
    }

    // NC y certificados llegan después que el checklist: se repinta para mostrar su antecedente.
    refrescarDocumentos(np) {
      if (this._sgi?.requisitos && String(this._sgi.np) === String(np)) this.renderDocumentos()
    }

    renderDocumentos() {
      const s = this._sgi
      if (s.errorDocs) return this.filasVacias("trzDocsBody", 8, `Panel documental no disponible: ${s.errorDocs}`)
      const edit = this.puedeEditar()
      const filas = []
      let area = null
      for (const r of s.requisitos) {
        if (r.area !== area) {
          area = r.area
          filas.push(`<tr><td colspan="8" style="background:rgba(100,116,139,.12);font-weight:700;">${this.esc(area)}</td></tr>`)
        }
        const v = r.vigente
        const [color, rotulo] = ESTADO_DOC[v?.estado] || ESTADO_DOC.PENDIENTE
        const estado = `<span style="color:${color};">● ${rotulo}</span>`
        const conRespaldo = v?.estado === "DISPONIBLE" || v?.estado === "EN_REVISION"
        const enlace = v?.enlace ? `<div class="subtitle" style="user-select:all;word-break:break-all;">Enlace: ${this.esc(v.enlace)}</div>` : ""
        const nota = v?.observacion ? `<div class="subtitle">${this.esc(v.observacion)}</div>` : ""
        const arch = !v ? "-" : conRespaldo ? `${v.nombreArchivo ? this.esc(v.nombreArchivo) : "Solo enlace"} <span class="subtitle">v${v.version}</span>${enlace}${nota}` : this.esc(v.observacion || "")
        const btn = (acc, txt, extra = "", editar = false) => `<button class="btn-secondary" style="padding:2px 8px;" data-trzdoc="${acc}" data-req="${r.id}" ${extra} ${editar ? "data-requiere-editar" : ""}>${txt}</button>`
        const acciones = []
        if (conRespaldo) {
          if (v.nombreArchivo) acciones.push(btn("ver", "Ver", `data-id="${v.id}"`))
          if (edit) acciones.push(btn("subir", "Nueva versión", "", true), btn("anular", "Anular", `data-id="${v.id}"`, true))
        } else if (v) {
          if (edit) acciones.push(btn("subir", "Adjuntar", "", true), btn("anular", "Quitar marca", `data-id="${v.id}"`, true))
        } else if (edit) {
          acciones.push(btn("subir", "Adjuntar", "", true), btn("nodigital", "No digitalizado", "", true), btn("noaplica", "No aplica", "", true))
        }
        if (edit && this.puedeElegirInspeccion(r.codigo)) acciones.push(btn("inspeccion", "Elegir inspección", "", true))
        if (r.totalVersiones > 1) acciones.push(btn("hist", `Historial (${r.totalVersiones})`))
        filas.push(`<tr>
          <td title="${this.esc(r.codigo)}">${this.esc(r.nombre)}</td><td>${estado}</td><td>${this.esc(this.datoEnSistema(r.fuenteSistema, r.codigo))}</td>
          <td>${arch}</td><td>${v ? this.fechaCorta(v.fechaDocumento) : "-"}</td><td>${this.esc(this.txt(v?.lote))}</td>
          <td>${v ? this.esc(v.subidoPor) + `<div class="subtitle">${this.fechaCorta(v.fechaSubida)}</div>` : "-"}</td>
          <td style="white-space:nowrap;">${acciones.join(" ")}</td></tr>`)
      }
      document.getElementById("trzDocsBody").innerHTML = filas.join("") || `<tr><td colspan="8" style="text-align:center;">Sin requisitos configurados</td></tr>`
    }

    renderFactores() {
      const s = this._sgi
      if (s.errorFactores) return this.filasVacias("trzFactorBody", 6, `Factor no disponible: ${s.errorFactores}`)
      const edit = this.puedeEditar()
      const items = new Map()
      for (const i of this._integral?.data?.items || []) items.set(Number(i.item), { item: Number(i.item), codigo: i.itemCode, descripcion: i.descripcion })
      for (const f of s.factores) if (!items.has(f.item)) items.set(f.item, { item: f.item, codigo: "", descripcion: "" })
      const lista = [...items.values()].sort((a, b) => a.item - b.item)
      if (!lista.length) return this.filasVacias("trzFactorBody", 6, "Sin ítems para esta NP (SAP no disponible o NP sin nota de venta)")
      document.getElementById("trzFactorBody").innerHTML = lista.map(i => {
        const conf = s.factores.find(f => f.item === i.item && f.estado === "CONFIRMADO")
        const pend = s.factores.find(f => f.item === i.item && f.estado === "PROPUESTO")
        const confTxt = conf ? `<b>${this.num(conf.unidadesPorPliego, 4)}</b> <span class="subtitle">confirmado por ${this.esc(conf.confirmadoPor)} el ${this.fechaCorta(conf.fechaConfirmacion)}</span>` : `<span style="color:#b45309;">Sin confirmar</span>`
        const pendTxt = pend ? `${this.num(pend.unidadesPorPliego, 4)} <span class="subtitle">propuesto por ${this.esc(pend.propuestoPor)} el ${this.fechaCorta(pend.fechaPropuesta)}${pend.observacion ? " — " + this.esc(pend.observacion) : ""}</span>` : "-"
        const acc = []
        if (edit) acc.push(`<button class="btn-secondary" style="padding:2px 8px;" data-trzfac="proponer" data-item="${i.item}" data-requiere-editar>${conf || pend ? "Proponer cambio" : "Proponer factor"}</button>`)
        if (pend && s.puedeConfirmar && edit) acc.push(`<button class="btn-primary" style="padding:2px 8px;" data-trzfac="confirmar" data-id="${pend.id}" data-requiere-editar>Confirmar</button>`, `<button class="btn-secondary" style="padding:2px 8px;" data-trzfac="rechazar" data-id="${pend.id}" data-requiere-editar>Rechazar</button>`)
        return `<tr><td>${i.item}</td><td>${this.esc(this.txt(i.codigo))}</td><td>${this.esc(this.txt(i.descripcion))}</td><td>${confTxt}</td><td>${pendTxt}</td><td style="white-space:nowrap;">${acc.join(" ")}</td></tr>`
      }).join("")
    }

    // Modal mínimo reutilizable (sin librerías): cuerpo HTML + botón de aceptar con validación propia.
    modalSgi(titulo, cuerpo, textoOk, alAceptar) {
      this.cerrarModalSgi()
      const ov = document.createElement("div")
      ov.id = "trzSgiModal"
      ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;"
      ov.innerHTML = `<div class="card" style="min-width:420px;max-width:760px;max-height:85vh;overflow:auto;">
        <div class="module-title" style="font-size:16px;margin-bottom:12px;">${this.esc(titulo)}</div>${cuerpo}
        <div id="trzSgiErr" style="color:#b91c1c;margin-top:8px;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
          <button class="btn-secondary" id="trzSgiCancel">${alAceptar ? "Cancelar" : "Cerrar"}</button>
          ${alAceptar ? `<button class="btn-primary" id="trzSgiOk">${this.esc(textoOk)}</button>` : ""}</div></div>`
      document.body.appendChild(ov)
      ov.querySelector("#trzSgiCancel").onclick = () => this.cerrarModalSgi()
      const ok = ov.querySelector("#trzSgiOk")
      if (ok) ok.onclick = async () => {
        const err = ov.querySelector("#trzSgiErr")
        err.textContent = ""
        ok.disabled = true
        try { const msg = await alAceptar(ov); if (msg) err.textContent = msg; else this.cerrarModalSgi() }
        finally { ok.disabled = false }
      }
    }

    cerrarModalSgi() { document.getElementById("trzSgiModal")?.remove() }

    leerArchivoBase64(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result).split(",")[1] || "")
        r.onerror = () => reject(new Error("No se pudo leer el archivo"))
        r.readAsDataURL(file)
      })
    }

    async refrescarSgi() { await this.cargarPanelSgi(this._sgi.np, this._consultaId) }

    reqNombre(id) { return this._sgi.requisitos.find(r => r.id === Number(id))?.nombre || "" }

    async accionDoc(b) {
      const acc = b.getAttribute("data-trzdoc"), req = Number(b.getAttribute("data-req")), id = Number(b.getAttribute("data-id"))
      const np = this._sgi.np
      const campo = (lab, html) => `<div class="form-group" style="margin-bottom:8px;"><label>${lab}</label>${html}</div>`
      if (acc === "ver") {
        const r = await this.llamarSgi("trazabilidad.documentos.abrir", { id })
        if (!r.ok) alert(r.error)
      } else if (acc === "subir") {
        this.modalSgi(`Adjuntar documento — ${this.reqNombre(req)}`,
          campo("Estado", `<select id="trzDocEstado"><option value="DISPONIBLE">Disponible</option><option value="EN_REVISION">En revisión</option></select>`)
          + campo("Archivo (PDF, Word o imagen, máx. 10 MB)", `<input type="file" id="trzDocArchivo" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp">`)
          + campo("O enlace (https://… o carpeta de red \\\\servidor\\…) si no se adjunta el archivo", `<input type="text" id="trzDocEnlace" maxlength="1000">`)
          + campo("Fecha del documento (opcional)", `<input type="date" id="trzDocFecha">`)
          + campo("Lote (opcional)", `<input type="text" id="trzDocLote" maxlength="60">`)
          + campo("Observación (opcional)", `<input type="text" id="trzDocObs" maxlength="500">`)
          + `<div class="subtitle">Si ya existe un documento para este requisito, se guarda como versión nueva y el anterior queda en el historial.</div>`,
          "Guardar", async ov => {
            const f = ov.querySelector("#trzDocArchivo").files[0]
            const enlace = ov.querySelector("#trzDocEnlace").value.trim()
            if (!f && !enlace) return "Selecciona un archivo o indica su enlace"
            if (f && f.size > 10 * 1024 * 1024) return "El archivo supera 10 MB"
            const res = await this.llamarSgi("trazabilidad.documentos.subir", {
              np, requisitoId: req, estado: ov.querySelector("#trzDocEstado").value, enlace: enlace || null,
              ...(f ? { nombreArchivo: f.name, contenidoBase64: await this.leerArchivoBase64(f) } : {}),
              fechaDocumento: ov.querySelector("#trzDocFecha").value || null, lote: ov.querySelector("#trzDocLote").value.trim() || null,
              observacion: ov.querySelector("#trzDocObs").value.trim() || null
            })
            if (!res.ok) return res.error
            await this.refrescarSgi()
          })
      } else if (acc === "inspeccion") {
        this.elegirInspeccion(req, this._sgi.requisitos.find(r => r.id === req)?.codigo)
      } else if (acc === "nodigital") {
        this.modalSgi(`Marcar "No digitalizado" — ${this.reqNombre(req)}`, campo("Dónde está el documento (obligatorio)", `<input type="text" id="trzDocMotivo" maxlength="500">`), "Guardar", async ov => {
          const donde = ov.querySelector("#trzDocMotivo").value.trim()
          if (!donde) return "Indica dónde está el documento"
          const res = await this.llamarSgi("trazabilidad.documentos.subir", { np, requisitoId: req, estado: "NO_DIGITALIZADO", observacion: donde })
          if (!res.ok) return res.error
          await this.refrescarSgi()
        })
      } else if (acc === "noaplica") {
        this.modalSgi(`Marcar "No aplica" — ${this.reqNombre(req)}`, campo("Motivo (obligatorio)", `<input type="text" id="trzDocMotivo" maxlength="500">`), "Guardar", async ov => {
          const motivo = ov.querySelector("#trzDocMotivo").value.trim()
          if (!motivo) return "El motivo es obligatorio"
          const res = await this.llamarSgi("trazabilidad.documentos.subir", { np, requisitoId: req, estado: "NO_APLICA", observacion: motivo })
          if (!res.ok) return res.error
          await this.refrescarSgi()
        })
      } else if (acc === "anular") {
        this.modalSgi(`Anular — ${this.reqNombre(req)}`, campo("Motivo de la anulación (obligatorio)", `<input type="text" id="trzDocMotivo" maxlength="500">`)
          + `<div class="subtitle">El archivo no se borra: queda en el historial y la versión anterior vuelve a ser la vigente.</div>`, "Anular", async ov => {
          const motivo = ov.querySelector("#trzDocMotivo").value.trim()
          if (!motivo) return "El motivo es obligatorio"
          const res = await this.llamarSgi("trazabilidad.documentos.anular", { id, motivo })
          if (!res.ok) return res.error
          await this.refrescarSgi()
        })
      } else if (acc === "hist") {
        const r = await this.llamarSgi("trazabilidad.documentos.historial", { np, requisitoId: req })
        if (!r.ok) return alert(r.error)
        const filas = (r.data || []).map(v => `<tr><td>${v.version}</td><td>${this.esc((ESTADO_DOC[v.estado] || [0, v.estado])[1])}${v.nombreArchivo ? " · " + this.esc(v.nombreArchivo) : ""}${v.enlace ? `<div class="subtitle" style="word-break:break-all;">${this.esc(v.enlace)}</div>` : ""}${!v.nombreArchivo && v.observacion ? `<div class="subtitle">${this.esc(v.observacion)}</div>` : ""}</td><td>${this.fechaCorta(v.fechaDocumento)}</td>
          <td>${this.esc(v.subidoPor)}<div class="subtitle">${this.fechaCorta(v.fechaSubida)}</div></td>
          <td>${v.anulado ? `<span style="color:#b91c1c;">Anulado por ${this.esc(v.anuladoPor)} (${this.fechaCorta(v.fechaAnulacion)}): ${this.esc(v.motivoAnulacion)}</span>` : "Vigente o reemplazado"}</td></tr>`).join("")
        this.modalSgi(`Historial — ${this.reqNombre(req)}`, `<div class="table-container"><table class="table"><thead><tr><th>Versión</th><th>Archivo</th><th>Fecha doc.</th><th>Cargado por</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></div>`, "", null)
      }
    }

    async accionFactor(b) {
      const acc = b.getAttribute("data-trzfac"), item = Number(b.getAttribute("data-item")), id = Number(b.getAttribute("data-id"))
      const np = this._sgi.np
      const campo = (lab, html) => `<div class="form-group" style="margin-bottom:8px;"><label>${lab}</label>${html}</div>`
      if (acc === "proponer") {
        this.modalSgi(`Proponer factor — NP ${np}, ítem ${item}`,
          campo("Unidades por pliego (mayor que 0, hasta 4 decimales)", `<input type="number" id="trzFacValor" min="0.0001" step="0.0001">`)
          + campo("Observación / fuente del dato (opcional)", `<input type="text" id="trzFacObs" maxlength="500" placeholder="Ej: guía técnica rev. 3">`)
          + `<div class="subtitle">Queda como propuesta: no se usará en cálculos hasta que un usuario autorizado la confirme.</div>`, "Proponer", async ov => {
          const v = Number(ov.querySelector("#trzFacValor").value)
          if (!(v > 0)) return "Ingresa un valor mayor que 0"
          const res = await this.llamarSgi("trazabilidad.factor.proponer", { np, item, unidadesPorPliego: v, origen: "MANUAL", observacion: ov.querySelector("#trzFacObs").value.trim() || null })
          if (!res.ok) return res.error
          await this.refrescarSgi()
        })
      } else if (acc === "confirmar") {
        if (!confirm("¿Confirmar este factor? Desde ahora se usará en los cálculos de esta NP e ítem.")) return
        const res = await this.llamarSgi("trazabilidad.factor.confirmar", { id })
        if (!res.ok) return alert(res.error)
        await this.refrescarSgi()
      } else if (acc === "rechazar") {
        this.modalSgi("Rechazar propuesta", campo("Motivo (obligatorio)", `<input type="text" id="trzFacMotivo" maxlength="500">`), "Rechazar", async ov => {
          const motivo = ov.querySelector("#trzFacMotivo").value.trim()
          if (!motivo) return "El motivo es obligatorio"
          const res = await this.llamarSgi("trazabilidad.factor.rechazar", { id, motivo })
          if (!res.ok) return res.error
          await this.refrescarSgi()
        })
      }
    }

    // Documentos de venta de la NP cuyos adjuntos van al ZIP: la nota de venta y los que SAP marca con adjunto.
    // Solo si la consulta integral corresponde a la misma NP del panel documental.
    documentosSapConAdjunto() {
      const d = this._integral?.data
      if (!d || String(this._integral.np) !== String(this._sgi?.np)) return []
      const docs = new Map()
      const nv = (d.notaVenta || []).find(l => l.Cancelada !== "Y" && l.DocEntry)
      if (nv) docs.set(`notaventa|${nv.DocEntry}`, { tipo: "notaventa", docEntry: nv.DocEntry, docNum: nv.DocNum })
      for (const x of d.documentos || []) {
        const tipo = this.tipoAdjunto(x.Tipo)
        if (x.TieneAdjunto && tipo) docs.set(`${tipo}|${x.DocEntry}`, { tipo, docEntry: x.DocEntry, docNum: x.DocNum })
      }
      // Recepciones de los lotes consumidos (al final: si se llega al límite del ZIP, primero entran los de venta).
      for (const c of d.consumos || []) {
        for (const l of c.lotes || []) {
          if (l.recepcionDocEntry) docs.set(`recepcion|${c.base}|${l.recepcionDocEntry}`, { tipo: "recepcion", empresa: c.base, docEntry: l.recepcionDocEntry, docNum: l.origenDocNum })
        }
      }
      return [...docs.values()]
    }

    async descargarZip() {
      // Con adjuntos SAP puede tardar: se avisa en el botón y se evita generar dos veces.
      const boton = document.getElementById("btnTrzZip")
      if (boton?.disabled) return
      if (boton) { boton.disabled = true; boton.textContent = "Generando ZIP…" }
      let r
      try {
        const sapDocs = this.documentosSapConAdjunto()
        r = await this.llamarSgi("trazabilidad.documentos.zip", { np: this._sgi.np, sapDocs })
      } finally {
        if (boton) { boton.disabled = false; boton.textContent = "Descargar ZIP" }
      }
      if (!r.ok) return alert(r.error)
      alert(`ZIP guardado en Descargas (${r.data.incluidos} documento(s) incluido(s), ${r.data.faltantes} faltante(s) listados en FALTANTES.txt).\nAdjuntos SAP: ${r.data.sapIncluidos ?? 0} incluido(s)${r.data.sapFallidos ? `, ${r.data.sapFallidos} NO incluido(s): revisa SAP/INDICE_ANEXOS_SAP.txt` : ""}.\n${r.data.ruta}`)
    }

    async verAuditoria() {
      const r = await this.llamarSgi("trazabilidad.auditoria.list", { np: this._sgi.np })
      if (!r.ok) return alert(r.error)
      const filas = (r.data || []).map(a => `<tr><td>${new Date(a.fechaHora).toLocaleString("es-CL")}</td><td>${this.esc(a.usuario)}</td><td>${this.esc(a.accion)}</td>
        <td>${this.esc(this.txt(a.valorAnterior))}</td><td>${this.esc(this.txt(a.valorNuevo))}</td><td>${this.esc(this.txt(a.justificacion))}</td></tr>`).join("")
      this.modalSgi(`Auditoría — NP ${this._sgi.np}`, `<div class="table-container"><table class="table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Antes</th><th>Después</th><th>Justificación</th></tr></thead>
        <tbody>${filas || `<tr><td colspan="6" style="text-align:center;">Sin movimientos</td></tr>`}</tbody></table></div>`, "", null)
    }

    // ── Informe oficial REG-SGI-TDP-V05 (formato entregado por Calidad) ──────────────────────────────
    // Un solo modelo (modeloV05) alimenta el PDF (htmlV05) y el Excel (backend, trazabilidad.exportarV05Excel).
    // Solo muestra datos ya consultados: lo que falta se rotula (SIN INFORMACIÓN / NO CONFIRMADO / NO APLICA), nunca 0.

    // Clave del proceso FPS: primero por su nombre, y solo si no calza, por carpeta/categoría.
    claveProceso(p) {
      for (const texto of [p.NombreProceso || "", `${p.NombreCarpeta || ""} ${p.NombreProceso || ""} ${p.Categoria || ""}`]) {
        const def = PROCESOS_V05.find(x => x.re.test(texto))
        if (def) return def.clave
      }
      return null
    }

    // Factor unidades/pliego solo si es inequívoco: un único ítem con factor CONFIRMADO.
    // Perfil del artículo en el maestro SAP: es el vigente hoy, no una versión histórica de la fabricación.
    textoPerfil(item) {
      const p = item?.perfil
      return !p ? ND : p.codigo ? `${p.codigo} (${p.origen})` : p.origen
    }

    // N° de perfil para las filas por corrida: solo si todos los ítems comparten uno (FPS no separa corridas por ítem).
    perfilUnico() {
      const items = this._integral?.data?.items || []
      const codigos = [...new Set(items.map(i => i.perfil?.codigo || null))]
      return codigos.length === 1 ? codigos[0] : null
    }

    factorUnico() {
      const items = this._integral?.data?.items || []
      const conf = (this._sgi?.factores || []).filter(f => f.estado === "CONFIRMADO")
      return items.length === 1 && conf.length === 1 ? Number(conf[0].unidadesPorPliego) : null
    }

    // Corridas válidas (no anuladas) de un proceso, o el motivo por el que no hay filas que mostrar.
    corridasV05(clave) {
      const d = this._integral.data
      if (!d) return { motivo: `${SI} (FPS no disponible)`, filas: [] }
      const procs = (d.procesos || []).filter(p => !p.idProcesoDuplicado && this.claveProceso(p) === clave)
      if (!procs.length) {
        return { motivo: d.procesos?.length ? "NO APLICA (el proceso no figura en la ruta registrada en FPS)" : `${SI} (FPS no tiene procesos para esta NP)`, filas: [] }
      }
      const porId = new Map(procs.map(p => [String(p.IdProceso), p]))
      const filas = (d.sesiones || [])
        .filter(s => porId.has(String(s.IdProceso)) && Number(s.Status) === 1)
        .map(s => ({ s, p: porId.get(String(s.IdProceso)), f: new Date(s.ProductionStartDate || s.SetupStartDate) }))
        .sort((a, b) => a.f - b.f)
      if (!filas.length) return { motivo: "REGISTRO NO DISPONIBLE (el proceso figura en FPS pero no tiene corridas registradas)", filas: [], enRuta: true }
      return { filas, enRuta: true }
    }

    modeloV05() {
      const t = this._integral
      if (!t) { alert("Consulta un NP y espera a que termine la trazabilidad integral"); return null }
      const d = t.data
      const items = d?.items || []
      const factor = this.factorUnico()
      const n = v => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? SI : Number(v).toLocaleString("es-CL", { maximumFractionDigits: 3 }))
      const dato = v => (v === null || v === undefined || String(v).trim() === "" ? SI : String(v).trim())
      const fecha = s => this.fechaCorta(s.ProductionStartDate || s.SetupStartDate)
      const consumos = d?.consumos
      // Materiales y lotes de SAP por OT de la NP (no se ligan a una corrida concreta por fecha).
      const materiales = re => (consumos || []).filter(c => re.test(c.descripcion || ""))
      const nombresMat = re => [...new Set(materiales(re).map(c => c.descripcion))].join("\n") || SI
      const lotesMat = re => [...new Set(materiales(re).flatMap(c => (c.lotes || []).map(l => l.lote)))].join(", ") || SI
      const unidadesV05 = pliegos => (pliegos === null ? null : factor ? pliegos * factor : null)
      const sinFactor = "FACTOR NO CONFIRMADO"
      const unidadesFila = s => (s.ProductionQuantity === null || s.ProductionQuantity === undefined ? SI : factor ? n(Number(s.ProductionQuantity) * factor) : sinFactor)

      const filasProceso = {
        corte: (c, i) => [fecha(c.s), dato(c.s.Operador), dato(c.s.Maquina), n(c.p.CantidadTotal), SI, SI, n(c.s.ProductionQuantity), i ? "" : lotesMat(/cartul|pliego|sustrato/i)],
        impresion: (c, i) => [fecha(c.s), c.p.NrPl ? `PLIEGO ${c.p.NrPl}` : SI, dato(c.s.Maquina), dato(c.s.Operador), i ? "" : nombresMat(/tinta/i), i ? "" : nombresMat(/barniz/i), n(c.s.ProductionQuantity)],
        folia: c => [fecha(c.s), dato(c.s.Maquina), dato(c.s.Operador), dato(c.p.NrPl), dato(this.perfilUnico()), n(c.s.ProductionQuantity)],
        corrugado: c => [fecha(c.s), dato(c.s.Maquina), dato(c.s.Operador), dato(c.p.NrPl), n(c.s.ProductionQuantity)],
        emplacado: c => [fecha(c.s), dato(c.s.Maquina), dato(c.s.Operador), dato(c.p.NrPl), n(c.s.ProductionQuantity)],
        troquelado: c => [fecha(c.s), dato(c.s.Maquina), dato(c.s.Operador), dato(c.p.NrPl), dato(this.perfilUnico()), n(c.s.ProductionQuantity), unidadesFila(c.s)],
        pegado: (c, i) => [fecha(c.s), dato(c.s.Maquina), dato(c.s.Operador), SI, i ? "" : nombresMat(/adhesiv|pva|almid|cola/i), "NO APLICA (FPS registra unidades)", n(c.s.ProductionQuantity)],
        termoformado: c => [fecha(c.s), dato(c.s.Maquina), dato(c.s.Operador), n(c.s.ProductionQuantity)],
      }

      const resultados = {}
      const bloques = []
      const itemDe = i => items.find(x => String(x.item) === String(i))
      bloques.push({
        titulo: "DESCRIPCIÓN DE PRODUCTOS", columnas: ["ITEM", "CÓDIGO", "DESCRIPCIÓN PRODUCTO", "UNIDADES"], pesos: [2, 5, 13, 4],
        filas: items.map(i => [dato(i.item), dato(i.itemCode), dato(i.descripcion), n(i.solicitado)]),
        vacio: d ? `${SI} (la nota de venta no existe o no está disponible en SAP)` : `${SI} (FPS/SAP no disponible)`,
      })
      const ruta = (d?.procesos || []).filter(p => !p.idProcesoDuplicado).map(p => p.NombreProceso).filter(Boolean).join(" → ")
      const guias = this.guiasTecnicas(d).map(g => `OT ${g.ot}: ${g.texto}`).join("\n")
      bloques.push({
        titulo: "GUÍA TÉCNICA",
        texto: `Guía técnica (texto registrado en FPS):\n${guias || SI}\nPerfil (maestro SAP vigente): ${items.filter(i => i.perfil).map(i => `ítem ${dato(i.item)}: ${this.textoPerfil(i)}`).join("; ") || SI}.\nRevisión de guía y molde estructurados: ${SI}.\nRuta registrada en FPS: ${ruta || SI}.\nFactor unidades por pliego: ${factor ? n(factor) + " (confirmado)" : "NO CONFIRMADO"}.`,
      })
      bloques.push({ titulo: "PROCESOS" })
      for (const def of PROCESOS_V05) {
        const r = this.corridasV05(def.clave)
        resultados[def.clave] = r
        const adh = def.clave === "pegado" ? [...new Set((d?.liberaciones || []).map(l => this.adhesivos(l)).filter(Boolean))] : []
        bloques.push({ titulo: def.titulo, columnas: def.columnas, pesos: def.pesos, filas: r.filas.map(filasProceso[def.clave]), vacio: r.motivo,
          nota: adh.length ? `Adhesivos registrados en los folios de liberación QCS de la NP (no atribuibles a una corrida): ${adh.join("; ")}.` : "" })
      }

      // Liberación (QCS): solo folios cerrados con destino Productos Terminados, los que suman al liberado.
      const lib = (d?.liberaciones || []).filter(l => /productos?\s+terminados?/i.test(l.BodegaDestino || "") && this.estadoFolio(l) === "Cerrado")
      const libOtros = (d?.liberaciones || []).length - lib.length
      bloques.push({
        titulo: "LIBERACIÓN DE CONTROL DE CALIDAD", columnas: ["ITEM", "PRODUCTO", "CÓDIGO", "UNIDADES LIBERADAS"], pesos: [2, 10, 5, 4],
        filas: lib.map(l => [dato(l.Item), dato(itemDe(l.Item)?.descripcion), dato(l.ItemCode), n(l.Cantidad)]),
        vacio: d?.liberaciones ? "SIN LIBERACIONES REGISTRADAS en QCS para esta NP" : `${SI} (liberaciones QCS no disponibles)`,
        nota: libOtros > 0 ? `No incluidos: ${libOtros} folio(s) a cuarentena, destrucción o incompletos (ver Trazabilidad integral).` : "",
      })

      // Despacho (SAP): guías y facturas directas asociadas a una línea de la NV (las que suman al despachado).
      const desp = (d?.documentos || []).filter(x => (x.Tipo === "GUIA" || (x.Tipo === "FACTURA" && x.Origen === "DIRECTA")) && x.LineaNv !== null && x.LineaNv !== undefined)
      const devs = (d?.documentos || []).filter(x => x.Tipo === "DEVOLUCION")
      const ncs = (d?.documentos || []).filter(x => x.Tipo === "NOTA_CREDITO" && Number(x.RepusoStock) === 1)
      const sumaDocs = l => l.reduce((a, x) => a + (Number(x.Cantidad) || 0), 0)
      bloques.push({
        titulo: "DESPACHO DE PRODUCTO", columnas: ["ITEM", "PRODUCTO", "CÓDIGO", "UNIDADES DESPACHADAS"], pesos: [2, 10, 5, 4],
        filas: desp.map(x => {
          const nv = (d.notaVenta || []).find(l => Number(l.LineNum) === Number(x.LineaNv))
          return [dato(nv?.Item), `${dato(itemDe(nv?.Item)?.descripcion)} — ${this.tipoDocumento(x)} N° ${x.DocNum} (${this.fechaCorta(x.DocDate)})`, dato(x.ItemCode), n(x.Cantidad)]
        }),
        vacio: d?.documentos ? "SIN DESPACHOS REGISTRADOS en SAP para esta NP" : `${SI} (despachos SAP no disponibles)`,
        nota: [devs.length ? `Devoluciones registradas: ${devs.length} línea(s) por ${n(sumaDocs(devs))} unidades (restan al despachado).` : "",
          ncs.length ? `Notas de crédito con reingreso de stock en SAP: ${ncs.length} línea(s) por ${n(sumaDocs(ncs))} unidades (restan al despachado; no acreditan devolución física).` : ""].filter(Boolean).join(" "),
      })

      // Balance de masas: una fila por proceso de la ruta real + Calidad + Despacho.
      const sumar = campo => (items.length && items.every(i => i[campo] !== null && i[campo] !== undefined) ? items.reduce((a, i) => a + Number(i[campo]), 0) : null)
      const bal = []
      for (const def of PROCESOS_V05) {
        const r = resultados[def.clave]
        if (!r.enRuta) continue
        const completo = r.filas.length > 0 && r.filas.every(c => c.s.ProductionQuantity !== null && c.s.ProductionQuantity !== undefined)
        const suma = completo ? r.filas.reduce((a, c) => a + Number(c.s.ProductionQuantity), 0) : null
        const pliegos = def.enUnidades ? null : suma
        // Varios procesos o pliegos FPS en una etapa: la suma se informa, pero no se convierte ni se compara.
        const compuesta = new Set(r.filas.map(c => String(c.p.IdProceso))).size > 1
        const unidades = def.enUnidades ? suma : compuesta ? null : unidadesV05(pliegos)
        bal.push({ area: def.balance, pliegos, unidades, proceso: true, enUnidades: !!def.enUnidades, compuesta })
      }
      for (const [area, campo] of [["Calidad", "liberadoPt"], ["Despacho", "despachado"]]) {
        const unidades = sumar(campo)
        bal.push({ area, unidades, pliegos: unidades !== null && factor ? unidades / factor : null })
      }
      const celda = (v, r, esPliego) => {
        if (v !== null) return n(v)
        if (r.enUnidades && esPliego) return "NO APLICA (unidades)"
        if (r.compuesta && !esPliego) return "NO CALCULABLE"
        if (r.proceso) return esPliego || factor ? "REGISTRO NO DISPONIBLE" : sinFactor
        return esPliego && factor === null ? sinFactor : SI
      }
      const dif = (a, b) => (a === null || b === null ? "NO CALCULABLE" : n(a - b))
      // Con varios ítems FPS no separa los procesos: ninguna diferencia que parta de un proceso es atribuible (igual que en Balance).
      const multiItem = items.length > 1
      const comparable = (a, b, campo) => (a.compuesta || b.compuesta || (multiItem && a.proceso) ? "NO CALCULABLE" : dif(a[campo], b[campo]))
      const filasBal = bal.map((r, i) => [String(i + 1), r.compuesta ? `${r.area} (suma de varios procesos/pliegos)` : r.area, celda(r.pliegos, r, true), i ? comparable(bal[i - 1], r, "pliegos") : "-", celda(r.unidades, r, false), i ? comparable(bal[i - 1], r, "unidades") : "-"])
      const f = d?.fuentes || {}
      const fuentesOk = !!d && ["fps", "sapNotaVenta", "sapDespachos", "sapConsumos", "liberaciones"].every(k => f[k]?.ok)
      const motivos = []
      if (!fuentesOk) motivos.push("alguna fuente (FPS, SAP o liberaciones QCS) no está disponible")
      if (factor === null) motivos.push("el factor unidades/pliego no está confirmado o la NP tiene más de un ítem")
      if ((d?.procesos || []).some(p => p.enCurso)) motivos.push("hay corridas FPS en curso")
      if (bal.some(r => (r.pliegos === null && !r.enUnidades) || r.unidades === null)) motivos.push("hay cantidades sin registro")
      if (bal.some(r => r.compuesta)) motivos.push("hay etapas que reúnen varios procesos o pliegos de FPS")
      if (multiItem) motivos.push("la NP tiene varios ítems y FPS no separa los procesos: no se calculan diferencias de producción")
      if (items.some(i => i.foliosSinCerrar)) motivos.push("hay folios de liberación sin cerrar")
      const merma = t.calidad ? this.filasCalidad().filter(r => r.merma !== "-").length : 0
      bloques.push({
        titulo: motivos.length ? "BALANCE DE MASAS — PROVISIONAL" : "BALANCE DE MASAS",
        columnas: ["Procesos", "Áreas", "Cantidad de Pliegos Entrada", "Diferencia Pliegos", "Cantidad Unidades", "Diferencia unidades"], pesos: [2, 5, 4, 4, 4, 4],
        filas: filasBal, vacio: `${SI} (sin procesos en la ruta FPS)`,
        nota: "Cantidad = pliegos registrados en FPS por el operador (no es inventario confirmado). Diferencia = cantidad del proceso anterior − cantidad del proceso; es una diferencia por conciliar: no se clasifica como merma ni destrucción."
          + (motivos.length ? `\nPROVISIONAL porque: ${motivos.join("; ")}.` : "")
          + (merma ? `\nControles de Calidad con merma declarada: ${merma} registro(s) (ver Balance y Mermas).` : ""),
      })

      // Anexo: materiales y lotes consumidos (SAP). No forma parte del Word original; respalda la columna "Lotes".
      bloques.push({
        titulo: "ANEXO — MATERIALES Y LOTES CONSUMIDOS (SAP, por OT de la NP)", columnas: ["Material", "Salida", "Devuelto", "Consumo neto", "Unidad", "Lotes de la salida"], pesos: [8, 3, 3, 3, 2, 7],
        filas: (consumos || []).map(c => [dato(c.descripcion), n(c.cantidad), n(c.devuelto), n(c.neto), dato(c.unidad), (c.lotes || []).map(l => l.lote).join(", ") || "SIN LOTE"]),
        vacio: consumos ? "Sin consumos registrados en SAP para las OT de esta NP" : `${SI} (consumos SAP no disponibles)`,
      })

      bloques.push(...this.bloquesCierreInforme(dato, n))

      const advertencias = []
      if (window.CalidadNp?.reglaDespachoAnterior(d?.items)) advertencias.push(window.CalidadNp.AVISO_REGLA_ANTERIOR)
      if (!d) advertencias.push(`Fuente FPS/SAP no disponible: ${t.error || "sin respuesta"}. Ninguna cantidad de este informe es completa.`)
      else {
        for (const [k, nombre] of [["fps", "FPS"], ["sapNotaVenta", "SAP nota de venta"], ["sapDespachos", "SAP despachos"], ["sapConsumos", "SAP consumos"], ["liberaciones", "liberaciones QCS"]]) {
          if (!f[k]?.ok) advertencias.push(`Fuente ${nombre} no disponible${f[k]?.error ? " (" + f[k].error + ")" : ""}.`)
        }
      }
      const faltantes = (this._sgi?.requisitos || []).filter(r => !r.vigente || (r.vigente.estado !== "DISPONIBLE" && r.vigente.estado !== "NO_APLICA"))
      if (!this._sgi?.requisitos) advertencias.push("Checklist documental SGI no disponible: no se pudo verificar.")
      else if (faltantes.length) advertencias.push(`Documentos SGI pendientes: ${faltantes.length} de ${this._sgi.requisitos.length} (ver panel documental de la NP).`)
      if (advertencias.length) bloques.push({ titulo: "ADVERTENCIAS DE INFORMACIÓN FALTANTE", texto: advertencias.map(a => "• " + a).join("\n") })

      const inicios = (d?.sesiones || []).filter(s => Number(s.Status) === 1).map(s => new Date(s.ProductionStartDate || s.SetupStartDate)).filter(x => !Number.isNaN(x.getTime())).sort((a, b) => a - b)
      return {
        np: t.np, codigo: "REG-SGI-TDP-V05", titulo: "TRAZABILIDAD DE PRODUCTOS", fechaVersion: "Diciembre 2023", logo: window.RegSgiLogo || "",
        emision: new Date().toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        realizadoPor: dato(sessionStorage.getItem("nombreUsuario") || sessionStorage.getItem("codigoUsuario")),
        cabecera: [
          ["CLIENTE", dato(d?.ordenes?.[0]?.Cliente || this._ultimaConsulta?.procesos?.[0]?.cli)],
          ["NV", t.np],
          ["TIPO PRODUCTO", SI],
          ["FECHA FABRICACIÓN (primera corrida válida en FPS)", inicios.length ? inicios[0].toLocaleDateString("es-CL") : SI],
        ],
        bloques,
      }
    }

    // PDF fiel al Word: carta horizontal; encabezado y pie oficiales se repiten en cada página (thead/tfoot).
    htmlV05(m) {
      const e = v => this.esc(v).replace(/\n/g, "<br>")
      const tabla = b => {
        const nota = b.nota ? `<div class="nota">${e(b.nota)}</div>` : ""
        if (!b.columnas) return `<div class="bt">${e(b.titulo)}</div>` + (b.texto ? `<div class="tx">${e(b.texto)}</div>` : "") + nota
        const total = b.pesos.reduce((a, x) => a + x, 0)
        const col = b.pesos.map(x => `<col style="width:${(x / total * 100).toFixed(2)}%">`).join("")
        const cuerpo = b.filas.length ? b.filas.map(f => `<tr>${f.map(c => `<td>${e(c)}</td>`).join("")}</tr>`).join("")
          : `<tr><td colspan="${b.columnas.length}" class="c">${e(b.vacio)}</td></tr>`
        return `<table class="t"><colgroup>${col}</colgroup><thead><tr><th colspan="${b.columnas.length}" class="bt">${e(b.titulo)}</th></tr><tr>${b.columnas.map(c => `<th>${e(c)}</th>`).join("")}</tr></thead><tbody>${cuerpo}</tbody></table>` + nota
      }
      const cab = `<table class="t cab"><colgroup><col style="width:30%"><col></colgroup>${m.cabecera.map(([k, v]) => `<tr><th>${e(k)}</th><td>${e(v)}</td></tr>`).join("")}</table>`
      return `<!doctype html><html><head><meta charset="utf-8"><title>REG-SGI-TDP-V05 NP ${this.esc(m.np)}</title><style>
        @page{size:letter landscape;margin:10mm 12mm 8mm 12mm}
        *{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:9.5px;color:#000;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        table.doc{width:100%;border-collapse:collapse}table.doc>thead>tr>td,table.doc>tfoot>tr>td,table.doc>tbody>tr>td{padding:0;border:0}
        .enc{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:6px}.enc td{border:1px solid #000;padding:3px 6px;vertical-align:middle}
        .enc img{width:74px;height:56px;display:block;margin:auto}.enc .ti{font-size:17px;font-weight:bold;text-align:center}.enc .cd{text-align:center;font-weight:bold}
        .pie{width:100%;border-collapse:collapse;margin-top:4px}.pie td{border:1px solid #000;padding:3px 6px;font-size:9px}
        table.t{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 4px}.t th,.t td{border:1px solid #000;padding:2px 4px;vertical-align:top;overflow-wrap:anywhere}
        .t th{background:#f2f2f2;text-align:center}.t th.bt{background:#d9d9d9;font-size:10.5px}.t .c{text-align:center}.cab th{text-align:left;background:#f2f2f2}
        tr{break-inside:avoid;page-break-inside:avoid}thead{display:table-header-group}
        .bt{background:#d9d9d9;border:1px solid #000;font-weight:bold;text-align:center;padding:2px 4px;margin-top:8px;font-size:10.5px}
        .tx{border:1px solid #000;border-top:0;padding:3px 6px;margin-bottom:4px}.nota{font-style:italic;font-size:8.5px;margin:0 0 6px;border:1px solid #000;padding:2px 6px}
        </style></head><body>
        <table class="doc"><thead><tr><td>
          <table class="enc"><colgroup><col style="width:12%"><col style="width:68%"><col style="width:20%"></colgroup>
            <tr><td rowspan="2">${m.logo ? `<img src="${m.logo}" alt="">` : ""}</td><td rowspan="2" class="ti">${e(m.titulo)}</td><td class="cd">${e(m.codigo)}</td></tr>
            <tr><td class="cd">${e(m.fechaVersion)}</td></tr></table>
        </td></tr></thead>
        <tfoot><tr><td><table class="pie"><tr><td>Fecha de emisión documento: ${e(m.emision)}</td><td>Hora de Inicio: ________</td><td>Hora de Término: ________</td>
          <td>Realizado por: ${e(m.realizadoPor)}</td><td>Cargo: ________________</td></tr></table></td></tr></tfoot>
        <tbody><tr><td>${cab}${m.bloques.map(tabla).join("")}</td></tr></tbody></table></body></html>`
    }

    generarInformePdf() {
      const html = this.htmlInforme()
      if (html) window.CalidadNp.imprimirHtml(html)
    }

    // Guarda una versión del informe (append-only, la versión la asigna la API) para poder reabrirlo tal como se emitió.
    async guardarInforme() {
      const html = this.htmlInforme()
      if (!html) return
      const r = await window.PhotinoBridge.send({ action: "calidadNp.informes.guardar", data: { np: this._integral.np, formato: "REG-SGI-TDP", html } })
      if (!r?.ok) { alert(r?.error || "No se pudo guardar el informe"); return }
      window.ExcelExporter?.showToast?.(`Informe guardado (versión ${r.data?.version ?? "?"})`)
    }

    htmlInforme() {
      const m = this.modeloV05()
      return m ? this.htmlV05(m) : null
    }

    async exportarExcelV05() {
      const m = this.modeloV05()
      if (!m) return
      const r = await window.PhotinoBridge.send({ action: "trazabilidad.exportarV05Excel", data: m })
      if (!r?.ok) { alert(r?.error || "No se pudo generar el Excel REG-SGI-TDP-V05"); return }
      const g = await window.PhotinoBridge.send({ action: "excel.guardar", data: { fileName: r.data.fileName, base64: r.data.base64 } })
      window.ExcelExporter?.showToast?.(g?.ok === false ? "Error exportando archivo" : "Archivo exportado correctamente")
    }

    destroy() {
      for (const id of ["trzVersionesModal", "trzProcesoModal"]) document.getElementById(id)?.remove?.()
      console.log("DESTROY TRAZABILIDAD")

      if (this._clickHandler) {
        document.removeEventListener("click", this._clickHandler)
        this._clickHandler = null
      }
      if (this._keyHandler) {
        document.removeEventListener("keydown", this._keyHandler)
        this._keyHandler = null
      }
      if (this._inputHandler) {
        document.removeEventListener("input", this._inputHandler)
        this._inputHandler = null
      }
    }
  }

  window.TrazabilidadController = TrazabilidadController
}
