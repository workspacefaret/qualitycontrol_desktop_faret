if (!window.TrazabilidadController) {
  // Datos de una fuente caída o inexistente: nunca se muestran como cero.
  const ND = "No disponible"
  const SI = "SIN INFORMACIÓN"

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
    { clave: "pegado", titulo: "PEGADO", balance: "Pegado", re: /pegad/i,
      columnas: ["FECHA", "MÁQUINA", "OPERADOR", "CAJAS", "ADHESIVOS", "PLIEGOS PROCESADOS", "CANTIDAD DE UNIDADES"], pesos: [2, 3, 3, 2, 3, 3, 3] },
    { clave: "termoformado", titulo: "TERMOFORMADO", balance: "Termoformado", re: /termof/i,
      columnas: ["FECHA", "MÁQUINA", "OPERADOR", "PRODUCIDO (REGISTRADO FPS)"], pesos: [2, 4, 5, 4] },
  ]

  class TrazabilidadController {
    constructor() {
      this._clickHandler = null
      this._keyHandler = null
      this._consultaId = 0
    }

    async init() {
      console.log("INIT TRAZABILIDAD")
      this.bindEvents()
    }

    bindEvents() {
      if (this._clickHandler) return

      this._clickHandler = (e) => {
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

        this._ultimaConsulta = { np, procesos, paletizado }

        this.renderResumen(procesos)
        this.renderProcesos(procesos)
        this.renderPaletizado(paletizado)
      } catch (err) {
        console.error("Error consultando trazabilidad:", err)
        estadoEl.textContent = "Planificación FARET: " + (err.message || "Error consultando la NP")
        estadoEl.style.display = "block"
        this._ultimaConsulta = { np, procesos: [], paletizado: [] }
        this.renderResumen([])
        this.renderProcesos([])
        this.renderPaletizado([])
      }
      if (id === this._consultaId) resultadoEl.style.display = "block"
      await integral
    }

    renderResumen(procesos) {
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

      if (!procesos || procesos.length === 0) {
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

      if (!paletizado || paletizado.length === 0) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center;">Sin registros de paletizado para este NP</td></tr>'
        return
      }

      body.innerHTML = paletizado.map(p => `
        <tr>
          <td>${p.idPalet || "-"}</td>
          <td>${p.fecha ? new Date(p.fecha).toLocaleString("es-CL") : "-"}</td>
          <td>${p.planta || "-"}</td>
          <td>${p.taller || "-"}</td>
          <td>${p.tipo || "-"}</td>
          <td>${p.cantidad ?? "-"}</td>
          <td>${p.descripcion || "-"}</td>
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

      const { np, procesos, paletizado } = consulta

      const planificados = procesos.filter(p => p.est === "Planificada").length
      const pendientes = procesos.filter(p => p.est === "No Planificado").length

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
              : [["Sin procesos encontrados en Planificación FARET para este NP", "", "", "", "", "", "", ""]],
          },
          {
            titulo: "Terminaciones y Paletizado",
            columnas: ["Código Paletizado", "Fecha", "Planta", "Taller", "Tipo", "Cantidad", "Descripción"],
            filas: paletizado.length
              ? paletizado.map(p => [
                  p.idPalet || "-",
                  p.fecha ? new Date(p.fecha).toLocaleString("es-CL") : "-",
                  p.planta || "-",
                  p.taller || "-",
                  p.tipo || "-",
                  p.cantidad ?? "-",
                  p.descripcion || "-",
                ])
              : [["Sin registros de paletizado para este NP", "", "", "", "", "", ""]],
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
      for (const [b, c] of [["trzItemsBody", 13], ["trzFpsBody", 16], ["trzConsumosBody", 12], ["trzLiberacionesBody", 11], ["trzDespachosBody", 10], ["trzCalidadBody", 10]]) {
        this.filasVacias(b, c, "Consultando...")
      }
      document.getElementById("trzOrdenes").textContent = ""

      const [fps, calidad] = await Promise.all([
        window.PhotinoBridge.send({ action: "trazabilidad.integral", data: { np } })
          .catch(err => ({ ok: false, error: err?.message })),
        this.consultarCalidad(np)
      ])
      if (id !== this._consultaId) return // llegó otra consulta mientras tanto

      const data = fps && fps.ok !== false ? fps.data : null
      this._integral = { np, data, error: data ? null : (fps?.error || "No se pudo consultar FPS/SAP"), calidad, consultadoEn: new Date() }

      this.renderFuentes()
      this.renderItems()
      this.renderFps()
      this.renderConsumos()
      this.renderLiberaciones()
      this.renderDespachos()
      this.renderCalidad()
      // Fase 1b: factor y documentos SGI (propios de QCC; si la API aún no los expone se muestra el aviso).
      this.cargarPanelSgi(np, id)
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
          const items = (res.data?.items || []).filter(exacto)
          return { estado: "OK", items, total: res.data?.total ?? items.length }
        } catch (err) {
          return { estado: "ERROR", items: [], error: err?.message }
        }
      }
      const [registros, productoTerminado] = await Promise.all([
        pedir("registros-control", "registrosControl.obtenerRegistros", { page: 1, limit: 500, np }),
        pedir("producto-terminado", "productoTerminado.list", { empresa: "INNPACK", np, page: 1, limit: 200 })
      ])
      return { registros, productoTerminado }
    }

    estadoFuente(nombre, f) {
      if (f && f.ok) return `<span style="color:#15803d;">● ${this.esc(nombre)}: disponible</span>`
      const motivo = { TIEMPO_AGOTADO: "tiempo agotado", REQUIERE_FPS: "requiere FPS", DEMASIADAS_OT: "demasiadas OT", SIN_PERMISO: "sin permiso" }[f?.error] || "no disponible"
      return `<span style="color:#b91c1c;">● ${this.esc(nombre)}: ${this.esc(motivo)}</span>`
    }

    renderFuentes() {
      const { data, error, calidad } = this._integral
      const el = document.getElementById("trzFuentes")
      const cal = c => ({ ok: c.estado === "OK", error: c.estado === "SIN_PERMISO" ? "SIN_PERMISO" : null })
      const partes = []
      if (!data) {
        partes.push(`<span style="color:#b91c1c;">● FPS / SAP: ${this.esc(error)}</span>`)
      } else {
        const f = data.fuentes || {}
        partes.push(this.estadoFuente("FPS (órdenes y corridas)", f.fps))
        partes.push(this.estadoFuente("SAP nota de venta", f.sapNotaVenta))
        partes.push(this.estadoFuente("SAP despachos", f.sapDespachos))
        partes.push(this.estadoFuente("SAP consumos", f.sapConsumos))
        partes.push(this.estadoFuente("Liberaciones QCS", f.liberaciones))
      }
      partes.push(this.estadoFuente("Registros de control", cal(calidad.registros)))
      partes.push(this.estadoFuente("Producto terminado", cal(calidad.productoTerminado)))
      el.innerHTML = partes.join(" &nbsp; ")
    }

    observacionesItem(i) {
      const obs = []
      if (i.lineaCompartida) obs.push(`La NV repite ítem ${i.item} y código en las líneas ${i.lineasNv.join(", ")}: las liberaciones no se pueden separar entre ellas.`)
      if (i.foliosSinCerrar) obs.push(`${i.foliosSinCerrar} folio(s) de liberación sin cerrar (no suman).`)
      if (i.facturadoDeGuia) obs.push(`Facturado sobre guías: ${this.num(i.facturadoDeGuia)} (no suma al despachado).`)
      if (i.notasCredito) obs.push(`Notas de crédito: ${this.num(i.notasCredito)}.`)
      if (i.liberadoPt === 0 && i.despachado > 0) obs.push("Hay despachos sin liberación QCS asociada a este ítem/código.")
      return obs
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

    renderItems() {
      const d = this._integral.data
      if (!d || !d.items) return this.filasVacias("trzItemsBody", 13, d ? "Nota de venta SAP no disponible" : ND)
      if (d.items.length === 0) return this.filasVacias("trzItemsBody", 13, `No existe la NV ${this._integral.np} en SAP INNPACK`)
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

    renderFps() {
      const d = this._integral.data
      if (!d || !d.procesos) return this.filasVacias("trzFpsBody", 16, ND)
      const ordenes = d.ordenes || []
      document.getElementById("trzOrdenes").textContent = ordenes.length
        ? ordenes.map(o => `OT ${o.OrdenTrabajo} (NV FARET ${this.txt(o.NotaVentaFaret)}, ingreso ${this.txt(o.FechaIngreso)}, cliente ${this.txt(o.Cliente)})`).join(" · ")
          + (d.sesionesTruncadas ? " · Atención: corridas truncadas por límite de consulta." : "")
        : "FPS no tiene órdenes de trabajo para esta NP."
      if (d.procesos.length === 0) return this.filasVacias("trzFpsBody", 16, "Sin procesos FPS")
      document.getElementById("trzFpsBody").innerHTML = d.procesos.filter(p => !p.idProcesoDuplicado).map(p => `
        <tr>
          <td>${this.esc(p.OrdenTrabajo)}</td>
          <td>${this.esc(p.NombreCarpeta)}</td>
          <td>${this.esc(p.NombreProceso)}</td>
          <td>${this.esc([p.NrPl, p.ItemCode].filter(Boolean).join(" / ") || "-")}</td>
          <td>${this.num(p.CantidadTotal)}</td>
          <td>${this.num(p.producido)}</td>
          <td>${this.num(p.setup)}</td>
          <td>${this.num(p.palletVerde)}</td>
          <td>${this.num(p.palletAzul)}</td>
          <td>${this.num(p.palletRojo)}</td>
          <td>${p.sesiones}${p.sesionesExcluidas ? ` (${p.sesionesExcluidas} anuladas)` : ""}</td>
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
        return this.filasVacias("trzConsumosBody", 12, e === "DEMASIADAS_OT" ? "La NP tiene demasiadas OT para consultar consumos" : ND)
      }
      if (d.consumos.length === 0) return this.filasVacias("trzConsumosBody", 12, "SAP no tiene salidas de material registradas para las OT de esta NP (no equivale a consumo cero)")
      document.getElementById("trzConsumosBody").innerHTML = d.consumos.map(c => {
        const lotes = c.lotes.length ? c.lotes : [null]
        return lotes.map((l, k) => `
          <tr>
            <td>${k ? "" : this.esc(c.base)}</td>
            <td>${k ? "" : this.esc(c.fecha)}</td>
            <td>${k ? "" : this.esc(c.docNum)}</td>
            <td>${k ? "" : this.esc(this.txt(c.ordenTrabajo))}</td>
            <td>${k ? "" : this.esc(c.itemCode)}</td>
            <td>${k ? "" : this.esc(c.descripcion)}</td>
            <td>${k ? "" : this.num(c.cantidad)}</td>
            <td>${k ? "" : this.esc(this.txt(c.unidad))}</td>
            <td>${l ? `<a href="#" data-trz-lote="${this.esc(l.lote)}" onclick="return false;">${this.esc(l.lote)}</a>` : "Sin lote"}</td>
            <td>${l ? this.num(l.cantidad) : "-"}</td>
            <td>${l ? this.esc([l.origenTipo, l.origenDocNum, l.origenFecha].filter(Boolean).join(" ") || ND) : "-"}</td>
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
      if (!d || !d.liberaciones) return this.filasVacias("trzLiberacionesBody", 11, ND)
      if (d.liberaciones.length === 0) return this.filasVacias("trzLiberacionesBody", 11, "Sin folios de liberación para esta NP")
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
          <td>${this.estadoFolio(l)}${sinAsignar.has(l.Folio) ? " · sin línea NV asociada" : ""}</td>
        </tr>`).join("")
    }

    tipoDocumento(d) {
      if (d.Tipo === "GUIA") return "Guía de despacho"
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

    observacionDocumento(d) {
      if (d.LineaNv === null || d.LineaNv === undefined) return "Sin línea NV asociada (no suma)"
      if (d.Tipo === "FACTURA" && d.Origen !== "DIRECTA") return "Facturación de una guía: no suma al despachado"
      if (d.Tipo === "NOTA_CREDITO") return "Informativa: no mueve producto"
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
          <td>${x.TieneAdjunto ? "Sí" : "No"}</td>
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

    renderCalidad() {
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

    async buscarLote() {
      const lote = document.getElementById("trzLote")?.value?.trim()
      if (!lote) {
        alert("Ingresa un lote")
        return
      }
      const id = ++this._consultaId
      const cont = document.getElementById("trzLoteResultado")
      document.getElementById("trzResultado").style.display = "none"
      document.getElementById("trzEstadoConexion").style.display = "none"
      cont.style.display = "block"
      document.getElementById("trzLoteTitulo").textContent = `Lote ${lote}`
      document.getElementById("trzLoteAviso").textContent = "Consultando SAP y FPS..."
      this.filasVacias("trzLotesBody", 10, "Consultando...")
      this.filasVacias("trzLoteConsumosBody", 9, "Consultando...")
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
          "Pallet verde", "Pallet azul", "Pallet rojo", "Estado FPS", "En curso"],
        (d.sesiones || []).map(s => [String(s.RecordKey), String(s.IdProceso), s.Maquina, s.Operador, s.SetupStartDate, s.ProductionStartDate,
          Number(s.EnCurso) === 1 ? "Estimado (corrida abierta)" : s.ProductionEndDate, this.xl(s.SetupQuantity), this.xl(s.ProductionQuantity),
          this.xl(s.PlGreenQuantity), this.xl(s.PlBlueQuantity), this.xl(s.PlRedQuantity), Number(s.Status) === 1 ? "Válida" : "Anulada (no suma)",
          Number(s.EnCurso) === 1 ? "Sí" : "No"]))

      // Una fila por lote: la cantidad de la línea va solo en la primera fila de cada línea (no se duplica al sumar).
      const consumos = []
      for (const c of d.consumos || []) {
        const lotes = c.lotes.length ? c.lotes : [null]
        lotes.forEach((l, k) => consumos.push([c.base, c.fecha, c.docNum, c.linea, c.ordenTrabajo, c.itemCode, c.descripcion,
          k ? "" : this.xl(c.cantidad), c.unidad, c.bodega, l ? l.lote : "Sin lote", l ? this.xl(l.cantidad) : "", l ? l.serieFabricante : "",
          l ? l.loteProveedor : "", l ? (l.origenTipo || ND) : "", l ? l.origenDocNum : "", l ? l.origenFecha : "", l ? l.origenNombre : "",
          `SAP ${c.base} OIGE ${c.docNum} línea ${c.linea}`]))
      }
      this.hoja(wb, "Consumos", d.consumos ? `Materiales consumidos (SAP, salidas con U_NumOT de las OT de la NP ${t.np})` : `Consumos: ${ND}`,
        ["Empresa SAP", "Fecha", "Doc. salida", "Línea", "OT", "Código", "Material", "Cant. línea (confirmado)", "Unidad", "Bodega", "Lote",
          "Cant. lote (confirmado)", "Serie fabricante", "Lote proveedor", "Origen del lote", "Doc. origen", "Fecha origen", "Proveedor", "Referencia origen"],
        consumos)

      this.hoja(wb, "Liberaciones", d.liberaciones ? `Liberaciones QCS de la NP ${t.np}` : `Liberaciones: ${ND}`,
        ["Folio", "Ítem", "Código", "Fecha", "Cantidad", "Bodega origen", "Bodega destino", "Máquina", "Operador", "Inspector", "Estado", "Referencia origen"],
        (d.liberaciones || []).map(l => [l.Folio, l.Item, l.ItemCode, l.Fecha, this.xl(l.Cantidad), l.BodegaOrigen, l.BodegaDestino, l.Maquina,
          l.Operador, l.Inspector, this.estadoFolio(l), `Faret_Control_Calidad CCMaster folio ${l.Folio}`]))

      this.hoja(wb, "Despachos", d.documentos ? `Despachos y facturación SAP INNPACK de la NP ${t.np}` : `Despachos: ${ND}`,
        ["Tipo", "N° SAP", "Folio", "Fecha", "Línea NV", "Ítem NV", "Código", "Cantidad", "Pallets (declarado)", "Respaldo PDF", "Observación", "Referencia origen"],
        (d.documentos || []).map(x => [this.tipoDocumento(x), x.DocNum, x.FolioNum, x.DocDate, this.xl(x.LineaNv), this.itemDeLinea(x.LineaNv) || "-",
          x.ItemCode, x.Cantidad, x.Pallets, x.TieneAdjunto ? "Sí" : "No", this.observacionDocumento(x),
          `SAP INNPACK ${{ GUIA: "ODLN", FACTURA: "OINV", DEVOLUCION: "ORDN", NOTA_CREDITO: "ORIN" }[x.Tipo] || x.Tipo} ${x.DocNum} línea ${x.LineNum}`]))

      this.hoja(wb, "Calidad", `Controles de Calidad QCC de la NP ${t.np}`,
        ["Origen", "Id QCC", "Fecha", "Proceso", "Máquina", "Código producto", "Resultado / estado", "Validación", "Merma declarada", "Inspector / usuario"],
        this.filasCalidad().map(r => [r.origen, r.id, r.fecha, r.proceso, r.maquina, r.codigo, r.resultado, r.validacion, r.merma, r.usuario]))

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
      this.renderDocumentos()
    }

    // Dato que ya existe en un sistema (solo informativo, sale de la consulta integral ya cargada).
    datoEnSistema(fuente) {
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
        const estado = v ? (v.estado === "DISPONIBLE" ? `<span style="color:#15803d;">● Disponible</span>` : `<span style="color:#64748b;">● No aplica</span>`) : `<span style="color:#b45309;">● Pendiente</span>`
        const arch = v && v.estado === "DISPONIBLE" ? `${this.esc(v.nombreArchivo)} <span class="subtitle">v${v.version}</span>` : (v ? this.esc(v.observacion || "") : "-")
        const btn = (acc, txt, extra = "", editar = false) => `<button class="btn-secondary" style="padding:2px 8px;" data-trzdoc="${acc}" data-req="${r.id}" ${extra} ${editar ? "data-requiere-editar" : ""}>${txt}</button>`
        const acciones = []
        if (v && v.estado === "DISPONIBLE") {
          acciones.push(btn("ver", "Ver", `data-id="${v.id}"`))
          if (edit) acciones.push(btn("subir", "Nueva versión", "", true), btn("anular", "Anular", `data-id="${v.id}"`, true))
        } else if (v) {
          if (edit) acciones.push(btn("subir", "Adjuntar", "", true), btn("anular", "Quitar marca", `data-id="${v.id}"`, true))
        } else if (edit) {
          acciones.push(btn("subir", "Adjuntar", "", true), btn("noaplica", "No aplica", "", true))
        }
        if (r.totalVersiones > 1) acciones.push(btn("hist", `Historial (${r.totalVersiones})`))
        filas.push(`<tr>
          <td title="${this.esc(r.codigo)}">${this.esc(r.nombre)}</td><td>${estado}</td><td>${this.esc(this.datoEnSistema(r.fuenteSistema))}</td>
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
          campo("Archivo (PDF, Word o imagen, máx. 10 MB)", `<input type="file" id="trzDocArchivo" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp">`)
          + campo("Fecha del documento (opcional)", `<input type="date" id="trzDocFecha">`)
          + campo("Lote (opcional)", `<input type="text" id="trzDocLote" maxlength="60">`)
          + campo("Observación (opcional)", `<input type="text" id="trzDocObs" maxlength="500">`)
          + `<div class="subtitle">Si ya existe un documento para este requisito, se guarda como versión nueva y el anterior queda en el historial.</div>`,
          "Guardar", async ov => {
            const f = ov.querySelector("#trzDocArchivo").files[0]
            if (!f) return "Selecciona un archivo"
            if (f.size > 10 * 1024 * 1024) return "El archivo supera 10 MB"
            const res = await this.llamarSgi("trazabilidad.documentos.subir", {
              np, requisitoId: req, estado: "DISPONIBLE", nombreArchivo: f.name, contenidoBase64: await this.leerArchivoBase64(f),
              fechaDocumento: ov.querySelector("#trzDocFecha").value || null, lote: ov.querySelector("#trzDocLote").value.trim() || null,
              observacion: ov.querySelector("#trzDocObs").value.trim() || null
            })
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
        const filas = (r.data || []).map(v => `<tr><td>${v.version}</td><td>${this.esc(v.estado === "NO_APLICA" ? "No aplica" : v.nombreArchivo)}</td><td>${this.fechaCorta(v.fechaDocumento)}</td>
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

    async descargarZip() {
      const r = await this.llamarSgi("trazabilidad.documentos.zip", { np: this._sgi.np })
      if (!r.ok) return alert(r.error)
      alert(`ZIP guardado en Descargas (${r.data.incluidos} documento(s) incluido(s), ${r.data.faltantes} faltante(s) listados en FALTANTES.txt).\n${r.data.ruta}`)
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
        folia: c => [fecha(c.s), dato(c.s.Maquina), dato(c.s.Operador), dato(c.p.NrPl), SI, n(c.s.ProductionQuantity)],
        corrugado: c => [fecha(c.s), dato(c.s.Maquina), dato(c.s.Operador), dato(c.p.NrPl), n(c.s.ProductionQuantity)],
        emplacado: c => [fecha(c.s), dato(c.s.Maquina), dato(c.s.Operador), dato(c.p.NrPl), n(c.s.ProductionQuantity)],
        troquelado: c => [fecha(c.s), dato(c.s.Maquina), dato(c.s.Operador), dato(c.p.NrPl), SI, n(c.s.ProductionQuantity), unidadesFila(c.s)],
        pegado: (c, i) => [fecha(c.s), dato(c.s.Maquina), dato(c.s.Operador), SI, i ? "" : nombresMat(/adhesiv|pva|almid|cola/i), n(c.s.ProductionQuantity), unidadesFila(c.s)],
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
      bloques.push({
        titulo: "GUÍA TÉCNICA",
        texto: `Guía técnica, perfil y molde: ${SI} (no se exponen en FPS ni SAP).\nRuta registrada en FPS: ${ruta || SI}.\nFactor unidades por pliego: ${factor ? n(factor) + " (confirmado)" : "NO CONFIRMADO"}.`,
      })
      bloques.push({ titulo: "PROCESOS" })
      for (const def of PROCESOS_V05) {
        const r = this.corridasV05(def.clave)
        resultados[def.clave] = r
        bloques.push({ titulo: def.titulo, columnas: def.columnas, pesos: def.pesos, filas: r.filas.map(filasProceso[def.clave]), vacio: r.motivo })
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
      bloques.push({
        titulo: "DESPACHO DE PRODUCTO", columnas: ["ITEM", "PRODUCTO", "CÓDIGO", "UNIDADES DESPACHADAS"], pesos: [2, 10, 5, 4],
        filas: desp.map(x => {
          const nv = (d.notaVenta || []).find(l => Number(l.LineNum) === Number(x.LineaNv))
          return [dato(nv?.Item), `${dato(itemDe(nv?.Item)?.descripcion)} — ${this.tipoDocumento(x)} N° ${x.DocNum} (${this.fechaCorta(x.DocDate)})`, dato(x.ItemCode), n(x.Cantidad)]
        }),
        vacio: d?.documentos ? "SIN DESPACHOS REGISTRADOS en SAP para esta NP" : `${SI} (despachos SAP no disponibles)`,
        nota: devs.length ? `Devoluciones registradas: ${devs.length} documento(s) por ${n(devs.reduce((a, x) => a + (Number(x.Cantidad) || 0), 0))} unidades (restan al despachado).` : "",
      })

      // Balance de masas: una fila por proceso de la ruta real + Calidad + Despacho.
      const sumar = campo => (items.length && items.every(i => i[campo] !== null && i[campo] !== undefined) ? items.reduce((a, i) => a + Number(i[campo]), 0) : null)
      const bal = []
      for (const def of PROCESOS_V05) {
        const r = resultados[def.clave]
        if (!r.enRuta) continue
        const completo = r.filas.length > 0 && r.filas.every(c => c.s.ProductionQuantity !== null && c.s.ProductionQuantity !== undefined)
        const pliegos = completo ? r.filas.reduce((a, c) => a + Number(c.s.ProductionQuantity), 0) : null
        bal.push({ area: def.balance, pliegos, unidades: unidadesV05(pliegos), proceso: true })
      }
      for (const [area, campo] of [["Calidad", "liberadoPt"], ["Despacho", "despachado"]]) {
        const unidades = sumar(campo)
        bal.push({ area, unidades, pliegos: unidades !== null && factor ? unidades / factor : null })
      }
      const celda = (v, r, esPliego) => {
        if (v !== null) return n(v)
        if (r.proceso) return esPliego || factor ? "REGISTRO NO DISPONIBLE" : sinFactor
        return esPliego && factor === null ? sinFactor : SI
      }
      const dif = (a, b) => (a === null || b === null ? "NO CALCULABLE" : n(a - b))
      const filasBal = bal.map((r, i) => [String(i + 1), r.area, celda(r.pliegos, r, true), i ? dif(bal[i - 1].pliegos, r.pliegos) : "-", celda(r.unidades, r, false), i ? dif(bal[i - 1].unidades, r.unidades) : "-"])
      const f = d?.fuentes || {}
      const fuentesOk = !!d && ["fps", "sapNotaVenta", "sapDespachos", "sapConsumos", "liberaciones"].every(k => f[k]?.ok)
      const motivos = []
      if (!fuentesOk) motivos.push("alguna fuente (FPS, SAP o liberaciones QCS) no está disponible")
      if (factor === null) motivos.push("el factor unidades/pliego no está confirmado o la NP tiene más de un ítem")
      if ((d?.procesos || []).some(p => p.enCurso)) motivos.push("hay corridas FPS en curso")
      if (bal.some(r => r.pliegos === null || r.unidades === null)) motivos.push("hay cantidades sin registro")
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
        titulo: "ANEXO — MATERIALES Y LOTES CONSUMIDOS (SAP, por OT de la NP)", columnas: ["Material", "Cantidad", "Unidad", "Lotes"], pesos: [9, 3, 2, 8],
        filas: (consumos || []).map(c => [dato(c.descripcion), n(c.cantidad), dato(c.unidad), (c.lotes || []).map(l => l.lote).join(", ") || "SIN LOTE"]),
        vacio: consumos ? "Sin consumos registrados en SAP para las OT de esta NP" : `${SI} (consumos SAP no disponibles)`,
      })

      const advertencias = []
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
      const val = id => (document.getElementById(id)?.value || "").trim() || SI
      return {
        np: t.np, codigo: "REG-SGI-TDP-V05", titulo: "TRAZABILIDAD DE PRODUCTOS", fechaVersion: "Diciembre 2023", logo: window.RegSgiLogo || "",
        emision: new Date().toLocaleDateString("es-CL"), horaInicio: val("trzHoraInicio"), horaTermino: val("trzHoraTermino"),
        realizadoPor: dato(sessionStorage.getItem("nombreUsuario") || sessionStorage.getItem("codigoUsuario")), cargo: val("trzCargo"),
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
        <tfoot><tr><td><table class="pie"><tr><td>Fecha de emisión documento: ${e(m.emision)}</td><td>Hora de Inicio: ${e(m.horaInicio)}</td><td>Hora de Término: ${e(m.horaTermino)}</td>
          <td>Realizado por: ${e(m.realizadoPor)}</td><td>Cargo: ${e(m.cargo)}</td></tr></table></td></tr></tfoot>
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
      console.log("DESTROY TRAZABILIDAD")

      if (this._clickHandler) {
        document.removeEventListener("click", this._clickHandler)
        this._clickHandler = null
      }
      if (this._keyHandler) {
        document.removeEventListener("keydown", this._keyHandler)
        this._keyHandler = null
      }
    }
  }

  window.TrazabilidadController = TrazabilidadController
}
