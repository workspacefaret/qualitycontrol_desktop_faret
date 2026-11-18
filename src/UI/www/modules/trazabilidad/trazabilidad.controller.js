if (!window.TrazabilidadController) {
  // Datos de una fuente caída o inexistente: nunca se muestran como cero.
  const ND = "No disponible"

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
      const d = new Date(v)
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

    // ── Informe PDF REG-SGI-TDP (estructura provisional según el requerimiento; plantilla oficial pendiente) ──
    clasificarProceso(p) {
      const t = `${p.NombreCarpeta || ""} ${p.NombreProceso || ""} ${p.Categoria || ""}`
      if (/corte|dimension/i.test(t)) return "corte"
      if (/impres|offset/i.test(t)) return "impresion"
      if (/folia/i.test(t)) return "folia"
      if (/corrug|emplac/i.test(t)) return "corrugado"
      if (/troquel/i.test(t)) return "troquelado"
      if (/pegad|termof/i.test(t)) return "pegado"
      return "otros"
    }

    // Factor unidades/pliego solo si es inequívoco: un único ítem con factor CONFIRMADO.
    factorUnico() {
      const items = this._integral?.data?.items || []
      const conf = (this._sgi?.factores || []).filter(f => f.estado === "CONFIRMADO")
      return items.length === 1 && conf.length === 1 ? Number(conf[0].unidadesPorPliego) : null
    }

    informeTabla(columnas, filas, vacio) {
      if (!filas.length) return `<p class="vacio">${this.esc(vacio)}</p>`
      return `<table><thead><tr>${columnas.map(c => `<th>${this.esc(c)}</th>`).join("")}</tr></thead><tbody>${
        filas.map(f => `<tr>${f.map(c => `<td>${this.esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    }

    seccionProcesos(grupo, factor, vacio) {
      const d = this._integral.data
      const procs = (d.procesos || []).filter(p => !p.idProcesoDuplicado && this.clasificarProceso(p) === grupo)
      if (!procs.length) return `<p class="vacio">${this.esc(vacio)}</p>`
      const ids = new Set(procs.map(p => String(p.IdProceso)))
      const ses = (d.sesiones || []).filter(s => ids.has(String(s.IdProceso)) && Number(s.Status) === 1)
      const conUnid = grupo === "troquelado" || grupo === "pegado"
      const cols = ["Fecha", "Máquina", "Operador", "Proceso", "Producido (registrado FPS)"].concat(conUnid ? ["Unidades equivalentes"] : [])
      const filas = ses.map(s => {
        const pr = procs.find(p => String(p.IdProceso) === String(s.IdProceso))
        const base = [this.fechaCorta(s.ProductionStartDate || s.SetupStartDate), s.Maquina, s.Operador, pr?.NombreProceso, this.num(s.ProductionQuantity)]
        if (conUnid) base.push(factor && s.ProductionQuantity != null ? this.num(Number(s.ProductionQuantity) * factor) : "Factor no confirmado")
        return base
      })
      return this.informeTabla(cols, filas, "Procesos sin corridas registradas en FPS (REGISTRO NO DISPONIBLE)")
    }

    materialesInforme(regex) {
      const d = this._integral.data
      return this.informeTabla(["Material", "Cantidad", "Unidad", "Lotes"],
        (d.consumos || []).filter(c => regex.test(c.descripcion || "")).map(c => [c.descripcion, this.num(c.cantidad), c.unidad, (c.lotes || []).map(l => l.lote).join(", ") || "Sin lote"]),
        d.consumos ? "Sin consumos de estos materiales registrados en SAP" : "Consumos SAP: " + ND)
    }

    construirInforme() {
      const t = this._integral
      const d = t.data || {}
      const items = d.items || []
      const cal = t.calidad ? this.filasCalidad() : []
      const factor = this.factorUnico()
      const advertencias = []
      const f = d.fuentes || {}
      if (!t.data) advertencias.push(`Fuente FPS/SAP no disponible: ${t.error || "sin respuesta"}. Ninguna cantidad de este informe es completa.`)
      else {
        for (const [k, n] of [["fps", "FPS"], ["sapNotaVenta", "SAP nota de venta"], ["sapDespachos", "SAP despachos"], ["sapConsumos", "SAP consumos"], ["liberaciones", "liberaciones QCS"]]) {
          if (!f[k]?.ok) advertencias.push(`Fuente ${n} no disponible${f[k]?.error ? " (" + f[k].error + ")" : ""}.`)
        }
      }
      if (factor === null) advertencias.push("Factor unidades/pliego sin confirmar o ambiguo: no se calculan unidades equivalentes.")
      const reqs = this._sgi?.requisitos
      const faltantes = (reqs || []).filter(r => !r.vigente || (r.vigente.estado !== "DISPONIBLE" && r.vigente.estado !== "NO_APLICA"))
      if (!reqs) advertencias.push("Panel documental SGI no disponible: no se pudo verificar el checklist.")
      else if (faltantes.length) advertencias.push(`${faltantes.length} requisito(s) documental(es) sin documento.`)
      advertencias.push("Balance PROVISIONAL: las cantidades de FPS son declaradas por el operador y no equivalen a inventario confirmado. Una diferencia no es automáticamente merma ni destrucción.")

      const sec = (n, titulo, cuerpo) => `<section><h2>${n}. ${this.esc(titulo)}</h2>${cuerpo}</section>`
      const factoresConf = (this._sgi?.factores || []).filter(x => x.estado === "CONFIRMADO")
      const p = [
        sec("01", "Identificación", this.informeTabla(["NP", "Órdenes FPS", "Ítem", "Código", "Descripción", "Solicitado (SAP)"],
          items.length ? items.map(i => [t.np, (d.ordenes || []).map(o => o.OrdenTrabajo).join(", ") || ND, i.item, i.itemCode, i.descripcion, this.num(i.solicitado)])
            : [[t.np, ND, ND, ND, ND, ND]], "")),
        sec("02", "Guía técnica", `<p class="vacio">Guía técnica, perfil y especificaciones no se exponen en FPS/SAP: REGISTRO NO DISPONIBLE. Ruta real registrada en FPS: ${
          this.esc((d.procesos || []).filter(x => !x.idProcesoDuplicado).map(x => x.NombreProceso).filter(Boolean).join(" → ") || ND)}.</p>` +
          this.informeTabla(["Ítem", "Factor unidades/pliego"], factoresConf.map(x => [x.item, this.num(x.unidadesPorPliego, 4) + " (confirmado)"]), "Factor unidades/pliego sin confirmar")),
        sec("03", "Corte y dimensionado", this.seccionProcesos("corte", factor, "NO APLICA o sin registro en FPS")),
        sec("04", "Impresión", this.seccionProcesos("impresion", factor, "NO APLICA o sin registro en FPS") + this.materialesInforme(/tinta|barniz/i)),
        sec("05", "Folia", this.seccionProcesos("folia", factor, "NO APLICA o sin registro en FPS")),
        sec("06", "Corrugado / Emplacado", this.seccionProcesos("corrugado", factor, "NO APLICA o sin registro en FPS") + this.materialesInforme(/papel|liner|onda|carton|cartul|almid|pva|adhesiv/i)),
        sec("07", "Troquelado", this.seccionProcesos("troquelado", factor, "NO APLICA o sin registro en FPS")),
        sec("08", "Pegado / Termoformado", this.seccionProcesos("pegado", factor, "NO APLICA o sin registro en FPS") +
          ((d.procesos || []).some(x => !x.idProcesoDuplicado && this.clasificarProceso(x) === "otros") ? "<h3>Otros procesos registrados</h3>" + this.seccionProcesos("otros", factor, "") : "")),
        sec("09", "Liberación de calidad", this.informeTabla(["Folio", "Ítem", "Código", "Fecha", "Cantidad", "Destino", "Estado"],
          (d.liberaciones || []).map(l => [l.Folio, l.Item, l.ItemCode, this.fechaCorta(l.Fecha), this.num(l.Cantidad), l.BodegaDestino, this.estadoFolio(l)]),
          d.liberaciones ? "Sin liberaciones registradas" : "Liberaciones: " + ND)),
        sec("10", "Despacho", this.informeTabla(["Tipo", "N° SAP", "Fecha", "Código", "Cantidad"],
          (d.documentos || []).filter(x => x.Tipo === "GUIA" || x.Tipo === "DEVOLUCION" || x.Tipo === "FACTURA").map(x => [this.tipoDocumento(x), x.DocNum, this.fechaCorta(x.DocDate), x.ItemCode, this.num(x.Cantidad)]),
          d.documentos ? "Sin despachos registrados" : "Despachos: " + ND)),
        sec("11", "Balance de materiales (PROVISIONAL)", this.informeTabla(["Ítem", "Solicitado", "Liberado PT", "Cuarentena", "Destrucción", "Despachado", "Devuelto", "Pendiente despacho (estimado)"],
          items.map(i => [i.item, this.num(i.solicitado), this.num(i.liberadoPt), this.num(this.saldo(i, "CUARENTENA")), this.num(this.saldo(i, "DESTRUCCION")), this.num(i.despachado), this.num(i.devuelto), this.num(this.pendienteDespacho(i))]), "Sin ítems") +
          this.informeTabla(["Origen", "Fecha", "Proceso", "Resultado", "Merma declarada"], cal.filter(r => r.merma !== "-").map(r => [r.origen, r.fecha, r.proceso, r.resultado, r.merma]), "Sin mermas declaradas en controles de Calidad") +
          `<p class="vacio">Cantidades sin conciliar: no se asignan a merma ni destrucción sin respaldo documental.</p>`),
        sec("12", "Anexos", this.informeTabla(["Área", "Requisito", "Estado", "Archivo", "Versión", "Fecha"],
          (reqs || []).map(r => [r.area, r.nombre, r.vigente ? r.vigente.estado : "PENDIENTE", r.vigente?.nombreArchivo || "-", r.vigente?.version ?? "-", r.vigente ? this.fechaCorta(r.vigente.fechaDocumento) : "-"]), "Checklist documental no disponible")),
        sec("13", "Documentos faltantes", this.informeTabla(["Área", "Documento", "Motivo de ausencia"],
          faltantes.map(r => [r.area, r.nombre, r.vigente ? (r.vigente.observacion || r.vigente.estado) : "Sin documento adjuntado"]), reqs ? "Sin faltantes" : "No verificable"))
      ]
      return { advertencias, cuerpo: p.join("") }
    }

    generarInformePdf() {
      const html = this.htmlInforme()
      if (!html) return
      const iframe = document.createElement("iframe")
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;"
      document.body.appendChild(iframe)
      iframe.contentDocument.open()
      iframe.contentDocument.write(html)
      iframe.contentDocument.close()
      setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print() }, 300)
      setTimeout(() => iframe.remove(), 120000)
    }

    // Guarda una versión del informe (append-only, la versión la asigna la API) para poder reabrirlo tal como se emitió.
    async guardarInforme() {
      const t = this._integral
      const html = this.htmlInforme()
      if (!html) return
      const r = await window.PhotinoBridge.send({ action: "calidadNp.informes.guardar", data: { np: t.np, formato: "REG-SGI-TDP", html } })
      if (!r?.ok) { alert(r?.error || "No se pudo guardar el informe"); return }
      window.ExcelExporter?.showToast?.(`Informe guardado (versión ${r.data?.version ?? "?"})`)
    }

    htmlInforme() {
      const t = this._integral
      if (!t) { alert("Consulta un NP y espera a que termine la trazabilidad integral"); return null }
      const usuario = sessionStorage.getItem("nombreUsuario") || sessionStorage.getItem("codigoUsuario") || "-"
      const emitido = new Date().toLocaleString("es-CL")
      const { advertencias, cuerpo } = this.construirInforme()
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Trazabilidad NP ${this.esc(t.np)}</title><style>
        body{font-family:Arial,sans-serif;font-size:10px;color:#111;margin:14px}
        h1{font-size:16px;margin:0}h2{font-size:12px;margin:14px 0 4px;border-bottom:1px solid #334155;padding-bottom:2px}h3{font-size:11px;margin:8px 0 2px}
        table{width:100%;border-collapse:collapse;margin:4px 0}th,td{border:1px solid #94a3b8;padding:2px 4px;text-align:left;vertical-align:top}th{background:#e2e8f0}
        .meta{margin:4px 0 8px;color:#334155}.vacio{color:#64748b;font-style:italic;margin:3px 0}
        .adv{border:1px solid #b45309;background:#fef3c7;padding:6px;margin:8px 0}.adv li{margin:1px 0}tr{page-break-inside:avoid}
        </style></head><body>
        <h1>INNPACK — Informe de Trazabilidad NP ${this.esc(t.np)}</h1>
        <div class="meta">Formato REG-SGI-TDP (estructura provisional, versión borrador 0) · Emitido: ${this.esc(emitido)} · Usuario: ${this.esc(usuario)} · Datos consultados: ${this.esc(t.consultadoEn.toLocaleString("es-CL"))}</div>
        <div class="adv"><b>Advertencias de información faltante o provisional</b><ul>${advertencias.map(a => `<li>${this.esc(a)}</li>`).join("")}</ul></div>
        ${cuerpo}</body></html>`
      return html
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
