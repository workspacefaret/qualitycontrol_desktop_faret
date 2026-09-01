if (!window.MuestraLaboratorioController) {
  class MuestraLaboratorioController {
    constructor() {
      this._clickHandler = null
      this._changeHandler = null
      this._muestraActualId = null
      this._corrigiendoEnsayoId = null
      this.deepLinkEstado = null
    }

    async init() {
      console.log("INIT MUESTRA LABORATORIO")
      this.consumirDeepLink()
      this.bindEvents()
      await this.cargarLista()
      await this.cargarIndicadores()
    }

    // Si "Gestionar" de una alerta en Inicio dejó un filtro de estado pendiente para este
    // módulo, lo toma y lo borra de inmediato (mismo mecanismo que registros-control).
    consumirDeepLink() {
      const raw = sessionStorage.getItem("qccDeepLinkId")
      if (!raw) return

      try {
        const info = JSON.parse(raw)
        if (info?.modulo === "muestra-laboratorio" && info.estadoFiltro) {
          this.deepLinkEstado = info.estadoFiltro
        }
      } catch { /* ignorar */ }

      sessionStorage.removeItem("qccDeepLinkId")
    }

    quitarDeepLink() {
      this.deepLinkEstado = null
      this.cargarLista()
    }

    renderDeepLinkBanner(total) {
      const banner = document.getElementById("mlbDeepLinkBanner")
      if (!banner) return

      if (!this.deepLinkEstado) {
        banner.style.display = "none"
        banner.innerHTML = ""
        return
      }

      banner.style.display = "block"
      banner.innerHTML = `
        <div class="card" style="
          border-left:4px solid #3b82f6;
          background:#eff6ff;
          margin-bottom:16px;
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
        ">
          <span>Mostrando ${total} muestra(s) pendiente(s) desde una alerta de Inicio.</span>
          <button class="btn-secondary" id="mlbBtnVerTodosDeepLink">Ver todas</button>
        </div>
      `
    }

    bindEvents() {
      if (this._clickHandler) return

      this._clickHandler = (e) => {
        const id = e.target.id

        if (id === "mlbBtnEspecificaciones") return this.abrirEspecificaciones()
        if (id === "mlbEspecCerrar") return this.cerrarModal("mlbModalEspecificaciones")
        if (id === "mlbEspecLimpiar") return this.limpiarFormEspecificacion()
        if (id === "mlbEspecGuardar") return this.guardarEspecificacion()
        if (e.target.classList?.contains("mlb-espec-editar-btn")) {
          return this.editarEspecificacion(JSON.parse(e.target.dataset.espec))
        }
        if (e.target.classList?.contains("mlb-espec-toggle-btn")) {
          return this.toggleEspecificacion(parseInt(e.target.dataset.id, 10), e.target.dataset.activo === "true")
        }

        if (id === "mlbBtnNuevaMuestra") return this.abrirNuevaMuestra()
        if (id === "mlbNmCancelar") return this.cerrarModal("mlbModalNuevaMuestra")
        if (id === "mlbNmGuardar") return this.guardarNuevaMuestra()

        if (id === "mlbBtnFiltrar") return this.cargarLista()
        if (id === "mlbBtnVerTodosDeepLink") return this.quitarDeepLink()

        if (e.target.classList?.contains("mlb-ver-btn")) {
          return this.abrirDetalle(parseInt(e.target.dataset.id, 10))
        }
        if (id === "mlbDetCerrar") return this.cerrarModal("mlbModalDetalle")
        if (id === "mlbBtnInforme") return this.generarInforme()
        if (id === "mlbBtnCrearNc") return this.crearNoConformidad()

        if (id === "mlbBtnNuevoHumedad") return this.abrirModal("mlbModalHumedad")
        if (id === "mlbHumCancelar") return this.cerrarModal("mlbModalHumedad")
        if (id === "mlbHumGuardar") return this.guardarHumedad()

        if (id === "mlbBtnNuevoGramaje") return this.abrirModal("mlbModalGramaje")
        if (id === "mlbGraCancelar") return this.cerrarModal("mlbModalGramaje")
        if (id === "mlbGraGuardar") return this.guardarGramaje()

        if (id === "mlbBtnNuevoCobb") return this.abrirModal("mlbModalCobb")
        if (id === "mlbCobbCancelar") return this.cerrarModal("mlbModalCobb")
        if (id === "mlbCobbGuardar") return this.guardarCobb()

        if (id === "mlbBtnNuevoEspesor") return this.abrirModal("mlbModalEspesor")
        if (id === "mlbEspCancelar") return this.cerrarModal("mlbModalEspesor")
        if (id === "mlbEspGuardar") return this.guardarEspesor()

        if (id === "mlbBtnNuevoRct") return this.abrirModal("mlbModalRct")
        if (id === "mlbRctCancelar") return this.cerrarModal("mlbModalRct")
        if (id === "mlbRctGuardar") return this.guardarRct()

        if (id === "mlbBtnNuevoFct") return this.abrirModal("mlbModalFct")
        if (id === "mlbFctCancelar") return this.cerrarModal("mlbModalFct")
        if (id === "mlbFctGuardar") return this.guardarFct()

        if (id === "mlbBtnNuevoEct") return this.abrirModal("mlbModalEct")
        if (id === "mlbEctCancelar") return this.cerrarModal("mlbModalEct")
        if (id === "mlbEctGuardar") return this.guardarEct()

        if (id === "mlbBtnNuevoBctMedido") return this.abrirModalBctMedido()
        if (id === "mlbBctMedCancelar") return this.cerrarModal("mlbModalBctMedido")
        if (id === "mlbBctMedGuardar") return this.guardarBctMedido()

        if (id === "mlbBtnNuevoBctTeorico") return this.abrirModalBctTeorico()
        if (id === "mlbBctTeoCancelar") return this.cerrarModal("mlbModalBctTeorico")
        if (id === "mlbBctTeoGuardar") return this.guardarBctTeorico()

        if (id === "mlbBtnNuevoViscosidad") return this.abrirModal("mlbModalViscosidad")
        if (id === "mlbViscCancelar") return this.cerrarModal("mlbModalViscosidad")
        if (id === "mlbViscGuardar") return this.guardarViscosidad()

        if (id === "mlbBtnNuevoPh") return this.abrirModal("mlbModalPh")
        if (id === "mlbPhCancelar") return this.cerrarModal("mlbModalPh")
        if (id === "mlbPhGuardar") return this.guardarPh()

        if (id === "mlbBtnNuevoSolidos") return this.abrirModal("mlbModalSolidos")
        if (id === "mlbSolCancelar") return this.cerrarModal("mlbModalSolidos")
        if (id === "mlbSolGuardar") return this.guardarSolidos()

        if (id === "mlbBtnNuevoLugol") return this.abrirModal("mlbModalLugol")
        if (id === "mlbLugolCancelar") return this.cerrarModal("mlbModalLugol")
        if (id === "mlbLugolGuardar") return this.guardarLugol()

        if (e.target.classList?.contains("mlb-anular-btn")) {
          return this.anularEnsayo(parseInt(e.target.dataset.id, 10))
        }
        if (e.target.classList?.contains("mlb-corregir-btn")) {
          return this.corregirEnsayo(parseInt(e.target.dataset.id, 10))
        }
      }
      document.addEventListener("click", this._clickHandler)

      this._changeHandler = (e) => {
        if (e.target.id === "mlbHumMetodoEquipo") this.actualizarCamposHumedad()
        if (e.target.id === "mlbBctMedCajas") this.renderBctMedCajas()
      }
      document.addEventListener("change", this._changeHandler)
    }

    abrirModal(id) {
      document.getElementById(id).style.display = "flex"
    }
    cerrarModal(id) {
      document.getElementById(id).style.display = "none"
      this._limpiarCorreccion()
    }

    // =====================================================================
    // LISTA
    // =====================================================================
    async cargarLista() {
      const body = document.getElementById("mlbMuestrasBody")
      body.innerHTML = '<tr><td colspan="11" style="text-align:center;">Cargando...</td></tr>'

      try {
        const estado = this.deepLinkEstado || document.getElementById("mlbFiltroEstado")?.value || ""
        const np = document.getElementById("mlbFiltroNp")?.value?.trim() || ""

        const res = await window.PhotinoBridge.send({
          action: "muestraLab.list",
          data: { estado, np }
        })

        if (!res || res.ok === false) throw new Error(res?.error || "Error cargando muestras")

        const items = res.data || []
        this.renderDeepLinkBanner(items.length)

        if (items.length === 0) {
          body.innerHTML = '<tr><td colspan="11" style="text-align:center;">Sin muestras registradas</td></tr>'
          return
        }

        body.innerHTML = items.map(m => `
          <tr>
            <td>${m.id}</td>
            <td>${m.fechaIngreso || "-"}</td>
            <td>${m.origen || "-"}</td>
            <td>${m.tipoMuestra || "-"}</td>
            <td>${m.np || "-"}</td>
            <td>${m.cliente || "-"}</td>
            <td>${m.codigoProducto || "-"}</td>
            <td>${m.totalEnsayos}</td>
            <td>${m.estado || "-"}</td>
            <td>${m.evaluacion || "-"}</td>
            <td><button class="btn-secondary mlb-ver-btn" data-id="${m.id}">Ver</button></td>
          </tr>
        `).join("")
      } catch (err) {
        console.error(err)
        body.innerHTML = `<tr><td colspan="11" style="text-align:center;">${err.message}</td></tr>`
      }
    }

    // =====================================================================
    // ESPECIFICACIONES
    // =====================================================================
    async abrirEspecificaciones() {
      this.limpiarFormEspecificacion()
      await this.cargarEspecificaciones()
      this.abrirModal("mlbModalEspecificaciones")
    }

    async cargarEspecificaciones() {
      const body = document.getElementById("mlbEspecBody")
      body.innerHTML = '<tr><td colspan="8" style="text-align:center;">Cargando...</td></tr>'

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.especificacion.list", data: {} })
        if (!res || res.ok === false) throw new Error(res?.error || "Error cargando especificaciones")

        const items = res.data || []
        if (items.length === 0) {
          body.innerHTML = '<tr><td colspan="8" style="text-align:center;">Sin especificaciones cargadas</td></tr>'
          return
        }

        body.innerHTML = items.map(s => `
          <tr>
            <td>${s.tipoMuestra}</td>
            <td>${s.tipoEnsayo}</td>
            <td>${s.codigoProducto || "(todos)"}</td>
            <td>${s.limiteMin ?? "-"}</td>
            <td>${s.limiteMax ?? "-"}</td>
            <td>${s.unidad || "-"}</td>
            <td>${s.activo ? "Sí" : "No"}</td>
            <td>
              <button class="btn-secondary mlb-espec-editar-btn" data-espec='${JSON.stringify(s).replace(/'/g, "&apos;")}'>Editar</button>
              <button class="btn-secondary mlb-espec-toggle-btn" data-id="${s.id}" data-activo="${s.activo}">${s.activo ? "Desactivar" : "Activar"}</button>
            </td>
          </tr>
        `).join("")
      } catch (err) {
        body.innerHTML = `<tr><td colspan="8" style="text-align:center;">${err.message}</td></tr>`
      }
    }

    limpiarFormEspecificacion() {
      document.getElementById("mlbEspecId").value = ""
      document.getElementById("mlbEspecTipoMuestra").value = "Papel"
      document.getElementById("mlbEspecTipoEnsayo").value = "HUMEDAD"
      document.getElementById("mlbEspecCodigo").value = ""
      document.getElementById("mlbEspecMin").value = ""
      document.getElementById("mlbEspecMax").value = ""
      document.getElementById("mlbEspecUnidad").value = ""
      document.getElementById("mlbEspecFormTitulo").textContent = "Nueva especificación"
    }

    editarEspecificacion(s) {
      document.getElementById("mlbEspecId").value = s.id
      document.getElementById("mlbEspecTipoMuestra").value = s.tipoMuestra
      document.getElementById("mlbEspecTipoEnsayo").value = s.tipoEnsayo
      document.getElementById("mlbEspecCodigo").value = s.codigoProducto || ""
      document.getElementById("mlbEspecMin").value = s.limiteMin ?? ""
      document.getElementById("mlbEspecMax").value = s.limiteMax ?? ""
      document.getElementById("mlbEspecUnidad").value = s.unidad || ""
      document.getElementById("mlbEspecFormTitulo").textContent = `Editando especificación #${s.id}`
    }

    async guardarEspecificacion() {
      const idVal = document.getElementById("mlbEspecId").value
      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }

      const data = {
        id: idVal ? parseInt(idVal, 10) : null,
        tipoMuestra: document.getElementById("mlbEspecTipoMuestra").value,
        tipoEnsayo: document.getElementById("mlbEspecTipoEnsayo").value,
        codigoProducto: document.getElementById("mlbEspecCodigo").value.trim(),
        limiteMin: num("mlbEspecMin"),
        limiteMax: num("mlbEspecMax"),
        unidad: document.getElementById("mlbEspecUnidad").value.trim()
      }

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.especificacion.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando la especificación")

        this.limpiarFormEspecificacion()
        await this.cargarEspecificaciones()
      } catch (err) {
        alert(err.message)
      }
    }

    async toggleEspecificacion(id, activoActual) {
      try {
        const res = await window.PhotinoBridge.send({
          action: "muestraLab.especificacion.activar",
          data: { id, activo: !activoActual }
        })
        if (!res || res.ok === false) throw new Error(res?.error || "Error actualizando la especificación")

        await this.cargarEspecificaciones()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // NUEVA MUESTRA
    // =====================================================================
    abrirNuevaMuestra() {
      document.getElementById("mlbNmNp").value = ""
      document.getElementById("mlbNmCliente").value = ""
      document.getElementById("mlbNmCodigo").value = ""
      document.getElementById("mlbNmDescripcion").value = ""
      document.getElementById("mlbNmMaquina").value = ""
      document.getElementById("mlbNmTurno").value = ""
      document.getElementById("mlbNmLote").value = ""
      document.getElementById("mlbNmProveedor").value = ""
      document.getElementById("mlbNmObservacion").value = ""
      this.abrirModal("mlbModalNuevaMuestra")
    }

    async guardarNuevaMuestra() {
      const data = {
        origen: document.getElementById("mlbNmOrigen").value,
        tipoMuestra: document.getElementById("mlbNmTipoMuestra").value,
        np: document.getElementById("mlbNmNp").value.trim(),
        cliente: document.getElementById("mlbNmCliente").value.trim(),
        codigoProducto: document.getElementById("mlbNmCodigo").value.trim(),
        descripcion: document.getElementById("mlbNmDescripcion").value.trim(),
        maquina: document.getElementById("mlbNmMaquina").value.trim(),
        turno: document.getElementById("mlbNmTurno").value.trim(),
        lote: document.getElementById("mlbNmLote").value.trim(),
        proveedor: document.getElementById("mlbNmProveedor").value.trim(),
        observacion: document.getElementById("mlbNmObservacion").value.trim()
      }

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.crear", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error creando la muestra")

        this.cerrarModal("mlbModalNuevaMuestra")
        await this.cargarLista()
        await this.cargarIndicadores()
        await this.abrirDetalle(res.data.id)
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // DETALLE
    // =====================================================================
    async abrirDetalle(id) {
      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.detalle", data: { id } })
        if (!res || res.ok === false) throw new Error(res?.error || "Error cargando el detalle")

        this._muestraActualId = id
        this._muestraActualDetalle = res.data
        const m = res.data

        document.getElementById("mlbDetId").textContent = m.id
        document.getElementById("mlbDetResumen").innerHTML = `
          <div><b>${m.origen || "-"}</b>Origen</div>
          <div><b>${m.tipoMuestra || "-"}</b>Tipo de muestra</div>
          <div><b>${m.np || "-"}</b>NP</div>
          <div><b>${m.cliente || "-"}</b>Cliente</div>
          <div><b>${m.codigoProducto || "-"}</b>Código</div>
          <div><b>${m.estado || "-"}</b>Estado</div>
          <div><b>${m.evaluacion || "-"}</b>Evaluación</div>
        `

        document.getElementById("mlbDetNc").innerHTML = this.renderBloqueNc(m)

        this._ensayosActuales = m.ensayos || []
        this.renderEnsayos(this._ensayosActuales)
        this.abrirModal("mlbModalDetalle")
      } catch (err) {
        alert(err.message)
      }
    }

    // Vínculo a No Conformidades: solo aparece cuando la muestra evaluó "No cumple". Si ya tiene
    // una NC vinculada, muestra el código; si no, ofrece crearla (queda gestionada desde el
    // módulo No Conformidades, acá solo se crea y se vincula).
    renderBloqueNc(m) {
      if (m.evaluacion !== "No cumple") return ""

      if (m.ncId) {
        return `<div class="subtitle" style="margin-top:8px;">No Conformidad vinculada: <b>${m.ncCodigo || `#${m.ncId}`}</b> (gestiónala desde el módulo No Conformidades).</div>`
      }

      return `
        <div class="subtitle" style="margin-top:8px; display:flex; align-items:center; gap:10px;">
          <span>Esta muestra no cumple especificación y no tiene una No Conformidad vinculada.</span>
          <button class="btn-secondary" id="mlbBtnCrearNc">Crear No Conformidad</button>
        </div>
      `
    }

    async crearNoConformidad() {
      if (!this._muestraActualId) return
      if (!confirm("¿Crear una No Conformidad vinculada a esta muestra?")) return

      try {
        const res = await window.PhotinoBridge.send({
          action: "muestraLab.nc.crear",
          data: { muestraId: this._muestraActualId }
        })
        if (!res || res.ok === false) throw new Error(res?.error || "Error creando la No Conformidad")

        alert(`No Conformidad creada (${res.data.codigo}). Gestiónala desde el módulo No Conformidades.`)
        await this.abrirDetalle(this._muestraActualId)
      } catch (err) {
        alert(err.message)
      }
    }

    renderEnsayos(ensayos) {
      const body = document.getElementById("mlbEnsayosBody")
      if (!ensayos || ensayos.length === 0) {
        body.innerHTML = '<tr><td colspan="9" style="text-align:center;">Sin ensayos todavía</td></tr>'
        return
      }

      body.innerHTML = ensayos.map(e => {
        const resultado = e.resultadoValor != null ? `${e.resultadoValor} ${e.resultadoUnidad || ""}` : "-"
        const spec = (e.especificacionMin != null || e.especificacionMax != null)
          ? `${e.especificacionMin ?? ""} - ${e.especificacionMax ?? ""} ${e.especificacionUnidad || ""}`
          : "-"
        const puedeAnular = e.estado !== "Anulado"
        const puedeCorregir = e.estado === "Finalizado" && !!this._tipoEnsayoConfig(e.tipoEnsayo)
        const motivoAnulTitle = e.estado === "Anulado" && e.motivoAnulacion ? ` title="${e.motivoAnulacion}"` : ""
        const corrigeBadge = e.ensayoReemplazaId
          ? ` <span title="Corrige al ensayo #${e.ensayoReemplazaId}: ${e.motivoReemplazo || ""}">&#9998;</span>`
          : ""

        return `
          <tr>
            <td>${e.tipoEnsayo}</td>
            <td>${e.metodo || "-"}</td>
            <td>${e.analistaNombre || "-"}</td>
            <td>${e.fecha || "-"}</td>
            <td>${resultado}</td>
            <td>${spec}</td>
            <td>${e.cumplimiento}</td>
            <td${motivoAnulTitle}>${e.estado}${e.observacion ? ` <span title="${e.observacion}">&#9432;</span>` : ""}${corrigeBadge}</td>
            <td>
              ${puedeAnular ? `<button class="btn-secondary mlb-anular-btn" data-id="${e.id}">Anular</button>` : ""}
              ${puedeCorregir ? `<button class="btn-secondary mlb-corregir-btn" data-id="${e.id}">Corregir</button>` : ""}
            </td>
          </tr>
        `
      }).join("")
    }

    // =====================================================================
    // INFORME (impresión/guardar como PDF, mismo mecanismo que No Conformidades)
    // =====================================================================
    generarInforme() {
      const m = this._muestraActualDetalle
      if (!m) return

      const resumen = [
        { label: "Origen", valor: m.origen || "-" },
        { label: "Tipo de muestra", valor: m.tipoMuestra || "-" },
        { label: "NP", valor: m.np || "-" },
        { label: "Cliente", valor: m.cliente || "-" },
        { label: "Código", valor: m.codigoProducto || "-" },
        { label: "Descripción", valor: m.descripcion || "-" },
        { label: "Máquina", valor: m.maquina || "-" },
        { label: "Turno", valor: m.turno || "-" },
        { label: "Lote", valor: m.lote || "-" },
        { label: "Proveedor", valor: m.proveedor || "-" },
        { label: "Fecha ingreso", valor: m.fechaIngreso || "-" },
        { label: "Fecha ensayo", valor: m.fechaEnsayo || "-" },
        { label: "Analista", valor: m.analistaNombre || "-" },
        { label: "Estado", valor: m.estado || "-" },
        { label: "Evaluación", valor: m.evaluacion || "-" }
      ]

      const ensayos = this._ensayosActuales || []
      const filas = ensayos.map(e => {
        const resultado = e.resultadoValor != null ? `${e.resultadoValor} ${e.resultadoUnidad || ""}` : "-"
        const spec = (e.especificacionMin != null || e.especificacionMax != null)
          ? `${e.especificacionMin ?? ""} - ${e.especificacionMax ?? ""} ${e.especificacionUnidad || ""}`
          : "-"
        return [
          e.tipoEnsayo, e.metodo || "-", e.analistaNombre || "-", e.fecha || "-",
          resultado, spec, e.cumplimiento, e.estado, e.observacion || "-"
        ]
      })

      window.PrintExporter.printReport({
        titulo: `Informe de Laboratorio - Muestra #${m.id}`,
        empresa: "INNPACK",
        subtitulo: m.observacion ? `Observación general: ${m.observacion}` : "",
        totalRegistros: ensayos.length,
        resumen,
        tablas: [{
          titulo: "Ensayos",
          columnas: ["Tipo", "Método", "Analista", "Fecha", "Resultado", "Especificación", "Cumplimiento", "Estado", "Observación"],
          filas
        }]
      })
    }

    // =====================================================================
    // EDICIÓN CON AUDITORÍA DE UN ENSAYO FINALIZADO ("Corregir")
    // No edita in-place: reabre el mismo modal de "+ Tipo" precargado con los valores actuales,
    // pide un motivo obligatorio, y al guardar crea un ensayo NUEVO vinculado al original (que
    // queda anulado conservando su fila intacta) — mismo guardarXxx() de siempre, sin duplicar
    // su lógica. Ver MuestraLaboratorioHandler.FinalizarGuardado / Repository.ReemplazarEnsayo.
    // =====================================================================
    _tipoEnsayoConfig(tipo) {
      const map = {
        HUMEDAD: { modalId: "mlbModalHumedad", precargar: e => this._precargarHumedad(e) },
        GRAMAJE: { modalId: "mlbModalGramaje", precargar: e => this._precargarGramaje(e) },
        COBB: { modalId: "mlbModalCobb", precargar: e => this._precargarCobb(e) },
        ESPESOR: { modalId: "mlbModalEspesor", precargar: e => this._precargarEspesor(e) },
        RCT: { modalId: "mlbModalRct", precargar: e => this._precargarResistencia(e, "Rct", true) },
        FCT: { modalId: "mlbModalFct", precargar: e => this._precargarResistencia(e, "Fct", false) },
        ECT: { modalId: "mlbModalEct", precargar: e => this._precargarEct(e) },
        BCT_MEDIDO: { modalId: "mlbModalBctMedido", precargar: e => this._precargarBctMedido(e) },
        BCT_TEORICO: { modalId: "mlbModalBctTeorico", precargar: e => this._precargarBctTeorico(e) },
        VISCOSIDAD: { modalId: "mlbModalViscosidad", precargar: e => this._precargarViscosidad(e) },
        PH: { modalId: "mlbModalPh", precargar: e => this._precargarPh(e) },
        SOLIDOS: { modalId: "mlbModalSolidos", precargar: e => this._precargarSolidos(e) },
        LUGOL: { modalId: "mlbModalLugol", precargar: e => this._precargarLugol(e) },
      }
      return map[tipo]
    }

    corregirEnsayo(ensayoId) {
      const ensayo = (this._ensayosActuales || []).find(e => e.id === ensayoId)
      if (!ensayo) return

      const cfg = this._tipoEnsayoConfig(ensayo.tipoEnsayo)
      if (!cfg) {
        alert("Este tipo de ensayo aún no soporta corrección desde esta pantalla.")
        return
      }

      this._corrigiendoEnsayoId = ensayoId
      cfg.precargar(ensayo)
      this._mostrarMotivoCorreccion(cfg.modalId)
      this.abrirModal(cfg.modalId)
    }

    _mostrarMotivoCorreccion(modalId) {
      let bloque = document.getElementById("mlbMotivoCorreccionBloque")
      if (!bloque) {
        bloque = document.createElement("div")
        bloque.id = "mlbMotivoCorreccionBloque"
        bloque.className = "mlb-form-campo mlb-form-campo-full"
        bloque.innerHTML = '<label>Motivo de la corrección *</label><textarea id="mlbMotivoCorreccionInput" rows="2"></textarea>'
      }
      document.getElementById("mlbMotivoCorreccionInput") // asegura que exista antes de limpiar
      bloque.querySelector("textarea").value = ""

      const modal = document.getElementById(modalId)
      const acciones = modal.querySelector(".mlb-form-acciones")
      acciones.parentNode.insertBefore(bloque, acciones)
    }

    _limpiarCorreccion() {
      this._corrigiendoEnsayoId = null
      const bloque = document.getElementById("mlbMotivoCorreccionBloque")
      if (bloque) bloque.remove()
    }

    // Si se está corrigiendo un ensayo, agrega ensayoOriginalId/motivoReemplazo al payload y
    // valida que el motivo esté completo. Devuelve false (y muestra la alerta) si falta el
    // motivo, para que el guardarXxx() que la llama corte el flujo con un simple `if (!... ) return`.
    _aplicarDatosCorreccion(data) {
      if (!this._corrigiendoEnsayoId) return true

      const motivo = document.getElementById("mlbMotivoCorreccionInput")?.value?.trim()
      if (!motivo) {
        alert("Debes indicar el motivo de la corrección")
        return false
      }

      data.ensayoOriginalId = this._corrigiendoEnsayoId
      data.motivoReemplazo = motivo
      return true
    }

    _precargarHumedad(e) {
      const d = e.detalle || {}
      document.getElementById("mlbHumMetodoEquipo").value = d.metodoEquipo || "Higrometro"
      document.getElementById("mlbHumIzq").value = d.higrometroIzquierdo ?? ""
      document.getElementById("mlbHumCentro").value = d.higrometroCentro ?? ""
      document.getElementById("mlbHumDer").value = d.higrometroDerecho ?? ""
      document.getElementById("mlbHumTermo").value = d.termobalanzaValor ?? ""
      document.getElementById("mlbHum1i").value = d.horno1PesoInicial ?? ""
      document.getElementById("mlbHum1f").value = d.horno1PesoFinal ?? ""
      document.getElementById("mlbHum2i").value = d.horno2PesoInicial ?? ""
      document.getElementById("mlbHum2f").value = d.horno2PesoFinal ?? ""
      document.getElementById("mlbHum3i").value = d.horno3PesoInicial ?? ""
      document.getElementById("mlbHum3f").value = d.horno3PesoFinal ?? ""
      document.getElementById("mlbHumMetodo").value = e.metodo || ""
      document.getElementById("mlbHumObservacion").value = e.observacion || ""
      this.actualizarCamposHumedad()
    }

    _precargarGramaje(e) {
      const d = e.detalle || {}
      document.getElementById("mlbGraTipoMaterial").value = d.tipoMaterial || "Papel"
      document.getElementById("mlbGraModalidad").value = d.modalidad || "ProbetaPeso"
      document.getElementById("mlbGra1").value = d.muestra1 ?? ""
      document.getElementById("mlbGra2").value = d.muestra2 ?? ""
      document.getElementById("mlbGra3").value = d.muestra3 ?? ""
      document.getElementById("mlbGraMetodo").value = e.metodo || ""
      document.getElementById("mlbGraObservacion").value = e.observacion || ""
    }

    _precargarCobb(e) {
      const d = e.detalle || {}
      ;[1, 2, 3].forEach(n => {
        const p = d[`p${n}`] || {}
        document.getElementById(`mlbCobb${n}Bobina`).value = p.bobina || ""
        document.getElementById(`mlbCobb${n}Cara`).value = p.cara || "Externa"
        document.getElementById(`mlbCobb${n}Inicial`).value = p.pesoInicial ?? ""
        document.getElementById(`mlbCobb${n}Final`).value = p.pesoFinal ?? ""
        document.getElementById(`mlbCobb${n}Tiempo`).value = p.tiempo || ""
      })
      document.getElementById("mlbCobbMetodo").value = e.metodo || ""
      document.getElementById("mlbCobbObservacion").value = e.observacion || ""
    }

    _precargarEspesor(e) {
      const d = e.detalle || {}
      document.getElementById("mlbEspTipoMedicion").value = d.tipoMedicion || "Ubicacion"
      document.getElementById("mlbEsp1").value = d.medicion1 ?? ""
      document.getElementById("mlbEsp2").value = d.medicion2 ?? ""
      document.getElementById("mlbEsp3").value = d.medicion3 ?? ""
      document.getElementById("mlbEspMetodo").value = e.metodo || ""
      document.getElementById("mlbEspObservacion").value = e.observacion || ""
    }

    _precargarResistencia(e, prefijoIds, esRct) {
      const d = e.detalle || {}
      if (esRct) document.getElementById("mlbRctComponente").value = d.componente || "Liner"
      ;[1, 2, 3].forEach(n => {
        const p = d[`p${n}`] || {}
        if (esRct) document.getElementById(`mlb${prefijoIds}${n}Bobina`).value = p.bobina || ""
        document.getElementById(`mlb${prefijoIds}${n}Force`).value = p.force ?? ""
        document.getElementById(`mlb${prefijoIds}${n}Strength`).value = p.strength ?? ""
      })
      document.getElementById(`mlb${prefijoIds}StrengthUnidad`).value = d.strengthUnidad || ""
      document.getElementById(`mlb${prefijoIds}Metodo`).value = e.metodo || ""
      document.getElementById(`mlb${prefijoIds}Observacion`).value = e.observacion || ""
    }

    _precargarEct(e) {
      const d = e.detalle || {}
      ;[1, 2, 3, 4, 5].forEach(n => {
        const p = d[`p${n}`] || {}
        document.getElementById(`mlbEct${n}`).value = p.force ?? ""
      })
      document.getElementById("mlbEctMetodo").value = e.metodo || ""
      document.getElementById("mlbEctObservacion").value = e.observacion || ""
    }

    _precargarBctMedido(e) {
      const d = e.detalle || {}
      document.getElementById("mlbBctMedCajas").value = String(d.cajasEnsayadas || 3)
      document.getElementById("mlbBctMedMotivo").value = d.motivoMenos3 || ""
      this.renderBctMedCajas()
      ;[1, 2, 3].forEach(n => {
        const c = d[`c${n}`]
        const largoEl = document.getElementById(`mlbBctMedC${n}Largo`)
        if (!c || !largoEl) return
        largoEl.value = c.largo ?? ""
        document.getElementById(`mlbBctMedC${n}Ancho`).value = c.ancho ?? ""
        document.getElementById(`mlbBctMedC${n}Alto`).value = c.alto ?? ""
        document.getElementById(`mlbBctMedC${n}TipoOnda`).value = c.tipoOnda || ""
        document.getElementById(`mlbBctMedC${n}Gramaje`).value = c.gramajeComplejo ?? ""
        document.getElementById(`mlbBctMedC${n}Espesor`).value = c.espesorComplejo ?? ""
        document.getElementById(`mlbBctMedC${n}Resultado`).value = c.resultadoLbf ?? ""
      })
      document.getElementById("mlbBctMedMetodo").value = e.metodo || ""
      document.getElementById("mlbBctMedObservacion").value = e.observacion || ""
    }

    _precargarBctTeorico(e) {
      const d = e.detalle || {}
      const ects = (this._ensayosActuales || []).filter(x => x.tipoEnsayo === "ECT" && x.estado === "Finalizado")
      const espesores = (this._ensayosActuales || []).filter(x => x.tipoEnsayo === "ESPESOR" && x.estado === "Finalizado")

      const selEct = document.getElementById("mlbBctTeoEct")
      const selEsp = document.getElementById("mlbBctTeoEspesor")
      selEct.innerHTML = ects.map(x => `<option value="${x.id}">Ensayo #${x.id} - ${x.resultadoValor} ${x.resultadoUnidad} (${x.fecha})</option>`).join("")
      selEsp.innerHTML = espesores.map(x => `<option value="${x.id}">Ensayo #${x.id} - ${x.resultadoValor} ${x.resultadoUnidad} (${x.fecha})</option>`).join("")

      if (d.ectEnsayoId) selEct.value = String(d.ectEnsayoId)
      if (d.espesorEnsayoId) selEsp.value = String(d.espesorEnsayoId)
      document.getElementById("mlbBctTeoLargo").value = d.largoMm ?? ""
      document.getElementById("mlbBctTeoAncho").value = d.anchoMm ?? ""
      document.getElementById("mlbBctTeoObservacion").value = e.observacion || ""
    }

    _precargarViscosidad(e) {
      const d = e.detalle || {}
      document.getElementById("mlbViscTipoAdhesivo").value = d.tipoAdhesivo || ""
      document.getElementById("mlbViscTemperatura").value = d.temperatura ?? ""
      document.getElementById("mlbViscEquipo").value = d.equipo || ""
      document.getElementById("mlbViscHusillo").value = d.husillo || ""
      document.getElementById("mlbViscRpm").value = d.velocidadRpm ?? ""
      document.getElementById("mlbViscResultado").value = d.resultadoCp ?? ""
      document.getElementById("mlbViscObservacion").value = e.observacion || ""
    }

    _precargarPh(e) {
      const d = e.detalle || {}
      document.getElementById("mlbPhValor").value = d.valorTexto || ""
      document.getElementById("mlbPhColor").value = d.colorObservado || ""
      document.getElementById("mlbPhObservacion").value = e.observacion || ""
    }

    _precargarSolidos(e) {
      const d = e.detalle || {}
      ;[1, 2, 3].forEach(n => {
        const det = d[`d${n}`] || {}
        document.getElementById(`mlbSol${n}M1`).value = det.m1 ?? ""
        document.getElementById(`mlbSol${n}M2`).value = det.m2 ?? ""
        document.getElementById(`mlbSol${n}M3`).value = det.m3 ?? ""
      })
      document.getElementById("mlbSolObservacion").value = e.observacion || ""
    }

    _precargarLugol(e) {
      const d = e.detalle || {}
      document.getElementById("mlbLugolPunto").value = d.puntoMuestra || ""
      document.getElementById("mlbLugolColoracion").value = d.coloracion || ""
      document.getElementById("mlbLugolResultado").value = d.resultado || "Negativo"
      document.getElementById("mlbLugolInterpretacion").value = d.interpretacion || ""
      document.getElementById("mlbLugolCumplimiento").value = e.cumplimiento || "Sin especificacion"
      document.getElementById("mlbLugolObservacion").value = e.observacion || ""
    }

    // =====================================================================
    // ENSAYO HUMEDAD
    // =====================================================================
    actualizarCamposHumedad() {
      const metodo = document.getElementById("mlbHumMetodoEquipo").value
      document.getElementById("mlbHumHigrometroCampos").style.display = metodo === "Higrometro" ? "flex" : "none"
      document.getElementById("mlbHumTermobalanzaCampos").style.display = metodo === "Termobalanza" ? "flex" : "none"
      document.getElementById("mlbHumHornoCampos").style.display = metodo === "Horno" ? "block" : "none"
    }

    async guardarHumedad() {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }

      const data = {
        muestraId: this._muestraActualId,
        metodoEquipo: document.getElementById("mlbHumMetodoEquipo").value,
        metodo: document.getElementById("mlbHumMetodo").value.trim(),
        observacion: document.getElementById("mlbHumObservacion").value.trim(),
        higrometroIzquierdo: num("mlbHumIzq"),
        higrometroCentro: num("mlbHumCentro"),
        higrometroDerecho: num("mlbHumDer"),
        termobalanzaValor: num("mlbHumTermo"),
        horno1PesoInicial: num("mlbHum1i"),
        horno1PesoFinal: num("mlbHum1f"),
        horno2PesoInicial: num("mlbHum2i"),
        horno2PesoFinal: num("mlbHum2f"),
        horno3PesoInicial: num("mlbHum3i"),
        horno3PesoFinal: num("mlbHum3f")
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.humedad.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando el ensayo de humedad")

        this.cerrarModal("mlbModalHumedad")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // ENSAYO GRAMAJE
    // =====================================================================
    async guardarGramaje() {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }

      const data = {
        muestraId: this._muestraActualId,
        tipoMaterial: document.getElementById("mlbGraTipoMaterial").value,
        modalidad: document.getElementById("mlbGraModalidad").value,
        metodo: document.getElementById("mlbGraMetodo").value.trim(),
        observacion: document.getElementById("mlbGraObservacion").value.trim(),
        muestra1: num("mlbGra1"),
        muestra2: num("mlbGra2"),
        muestra3: num("mlbGra3")
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.gramaje.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando el ensayo de gramaje")

        this.cerrarModal("mlbModalGramaje")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // ENSAYO COBB
    // =====================================================================
    async guardarCobb() {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }
      const txt = (id) => document.getElementById(id).value.trim() || null

      const probeta = (n) => ({
        bobina: txt(`mlbCobb${n}Bobina`),
        cara: document.getElementById(`mlbCobb${n}Cara`).value,
        pesoInicial: num(`mlbCobb${n}Inicial`),
        pesoFinal: num(`mlbCobb${n}Final`),
        tiempo: txt(`mlbCobb${n}Tiempo`)
      })

      const data = {
        muestraId: this._muestraActualId,
        metodo: document.getElementById("mlbCobbMetodo").value.trim(),
        observacion: document.getElementById("mlbCobbObservacion").value.trim(),
        p1: probeta(1),
        p2: probeta(2),
        p3: probeta(3)
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.cobb.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando el ensayo Cobb")

        this.cerrarModal("mlbModalCobb")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // ENSAYO ESPESOR
    // =====================================================================
    async guardarEspesor() {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }

      const data = {
        muestraId: this._muestraActualId,
        tipoMedicion: document.getElementById("mlbEspTipoMedicion").value,
        metodo: document.getElementById("mlbEspMetodo").value.trim(),
        observacion: document.getElementById("mlbEspObservacion").value.trim(),
        medicion1: num("mlbEsp1"),
        medicion2: num("mlbEsp2"),
        medicion3: num("mlbEsp3")
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.espesor.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando el ensayo de espesor")

        this.cerrarModal("mlbModalEspesor")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // ENSAYO RCT / FCT
    // =====================================================================
    async guardarRct() {
      await this._guardarResistencia("rct", "Rct")
    }

    async guardarFct() {
      await this._guardarResistencia("fct", "Fct")
    }

    async _guardarResistencia(accionSufijo, prefijoIds) {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }
      const txt = (id) => document.getElementById(id)?.value?.trim() || null

      const probeta = (n) => ({
        bobina: txt(`mlb${prefijoIds}${n}Bobina`),
        force: num(`mlb${prefijoIds}${n}Force`),
        strength: num(`mlb${prefijoIds}${n}Strength`)
      })

      const data = {
        muestraId: this._muestraActualId,
        metodo: document.getElementById(`mlb${prefijoIds}Metodo`).value.trim(),
        observacion: document.getElementById(`mlb${prefijoIds}Observacion`).value.trim(),
        strengthUnidad: txt(`mlb${prefijoIds}StrengthUnidad`),
        p1: probeta(1),
        p2: probeta(2),
        p3: probeta(3)
      }
      if (prefijoIds === "Rct") {
        data.componente = document.getElementById("mlbRctComponente").value
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: `muestraLab.${accionSufijo}.guardar`, data })
        if (!res || res.ok === false) throw new Error(res?.error || `Error guardando el ensayo ${accionSufijo.toUpperCase()}`)

        this.cerrarModal(`mlbModal${prefijoIds}`)
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // ENSAYO ECT
    // =====================================================================
    async guardarEct() {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }

      const data = {
        muestraId: this._muestraActualId,
        metodo: document.getElementById("mlbEctMetodo").value.trim(),
        observacion: document.getElementById("mlbEctObservacion").value.trim(),
        p1Force: num("mlbEct1"),
        p2Force: num("mlbEct2"),
        p3Force: num("mlbEct3"),
        p4Force: num("mlbEct4"),
        p5Force: num("mlbEct5")
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.ect.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando el ensayo ECT")

        this.cerrarModal("mlbModalEct")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // BCT MEDIDO
    // =====================================================================
    abrirModalBctMedido() {
      document.getElementById("mlbBctMedCajas").value = "3"
      document.getElementById("mlbBctMedMotivo").value = ""
      document.getElementById("mlbBctMedMetodo").value = ""
      document.getElementById("mlbBctMedObservacion").value = ""
      this.renderBctMedCajas()
      this.abrirModal("mlbModalBctMedido")
    }

    renderBctMedCajas() {
      const n = parseInt(document.getElementById("mlbBctMedCajas").value, 10)
      document.getElementById("mlbBctMedMotivoBloque").style.display = n < 3 ? "block" : "none"

      const bloque = document.getElementById("mlbBctMedCajasBloque")
      let html = ""
      for (let i = 1; i <= n; i++) {
        html += `
          <div class="module-title" style="font-size:13px; margin-top:8px;">Caja ${i}</div>
          <div class="mlb-form-row">
            <div class="mlb-form-campo"><label>Largo</label><input type="number" step="0.01" id="mlbBctMedC${i}Largo"></div>
            <div class="mlb-form-campo"><label>Ancho</label><input type="number" step="0.01" id="mlbBctMedC${i}Ancho"></div>
            <div class="mlb-form-campo"><label>Alto</label><input type="number" step="0.01" id="mlbBctMedC${i}Alto"></div>
            <div class="mlb-form-campo"><label>Tipo de onda</label><input type="text" id="mlbBctMedC${i}TipoOnda"></div>
          </div>
          <div class="mlb-form-row">
            <div class="mlb-form-campo"><label>Gramaje complejo</label><input type="number" step="0.01" id="mlbBctMedC${i}Gramaje"></div>
            <div class="mlb-form-campo"><label>Espesor complejo</label><input type="number" step="0.0001" id="mlbBctMedC${i}Espesor"></div>
            <div class="mlb-form-campo"><label>Resultado (lbf)</label><input type="number" step="0.0001" id="mlbBctMedC${i}Resultado"></div>
          </div>
        `
      }
      bloque.innerHTML = html
    }

    async guardarBctMedido() {
      if (!this._muestraActualId) return

      const cajasEnsayadas = parseInt(document.getElementById("mlbBctMedCajas").value, 10)
      const num = (id) => {
        const el = document.getElementById(id)
        if (!el || el.value === "") return null
        return parseFloat(el.value)
      }
      const txt = (id) => document.getElementById(id)?.value?.trim() || null

      const caja = (i) => ({
        largo: num(`mlbBctMedC${i}Largo`),
        ancho: num(`mlbBctMedC${i}Ancho`),
        alto: num(`mlbBctMedC${i}Alto`),
        tipoOnda: txt(`mlbBctMedC${i}TipoOnda`),
        gramajeComplejo: num(`mlbBctMedC${i}Gramaje`),
        espesorComplejo: num(`mlbBctMedC${i}Espesor`),
        resultadoLbf: num(`mlbBctMedC${i}Resultado`)
      })

      const data = {
        muestraId: this._muestraActualId,
        cajasEnsayadas,
        motivoMenos3: document.getElementById("mlbBctMedMotivo").value.trim(),
        metodo: document.getElementById("mlbBctMedMetodo").value.trim(),
        observacion: document.getElementById("mlbBctMedObservacion").value.trim(),
        c1: caja(1),
        c2: cajasEnsayadas >= 2 ? caja(2) : null,
        c3: cajasEnsayadas >= 3 ? caja(3) : null
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.bctMedido.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando BCT Medido")

        this.cerrarModal("mlbModalBctMedido")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // BCT TEORICO (McKee)
    // =====================================================================
    abrirModalBctTeorico() {
      const ects = (this._ensayosActuales || []).filter(e => e.tipoEnsayo === "ECT" && e.estado === "Finalizado")
      const espesores = (this._ensayosActuales || []).filter(e => e.tipoEnsayo === "ESPESOR" && e.estado === "Finalizado")

      const selEct = document.getElementById("mlbBctTeoEct")
      const selEsp = document.getElementById("mlbBctTeoEspesor")

      if (ects.length === 0 || espesores.length === 0) {
        alert("Necesitas al menos un ECT y un Espesor finalizados en esta muestra antes de calcular el BCT teórico.")
        return
      }

      selEct.innerHTML = ects.map(e => `<option value="${e.id}">Ensayo #${e.id} - ${e.resultadoValor} ${e.resultadoUnidad} (${e.fecha})</option>`).join("")
      selEsp.innerHTML = espesores.map(e => `<option value="${e.id}">Ensayo #${e.id} - ${e.resultadoValor} ${e.resultadoUnidad} (${e.fecha})</option>`).join("")

      document.getElementById("mlbBctTeoLargo").value = ""
      document.getElementById("mlbBctTeoAncho").value = ""
      document.getElementById("mlbBctTeoObservacion").value = ""

      this.abrirModal("mlbModalBctTeorico")
    }

    async guardarBctTeorico() {
      if (!this._muestraActualId) return

      const data = {
        muestraId: this._muestraActualId,
        ectEnsayoId: parseInt(document.getElementById("mlbBctTeoEct").value, 10),
        espesorEnsayoId: parseInt(document.getElementById("mlbBctTeoEspesor").value, 10),
        largoMm: parseFloat(document.getElementById("mlbBctTeoLargo").value),
        anchoMm: parseFloat(document.getElementById("mlbBctTeoAncho").value),
        observacion: document.getElementById("mlbBctTeoObservacion").value.trim()
      }

      if (!data.largoMm || !data.anchoMm) {
        alert("Largo y ancho interno son obligatorios")
        return
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.bctTeorico.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error calculando BCT teórico")

        this.cerrarModal("mlbModalBctTeorico")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // VISCOSIDAD
    // =====================================================================
    async guardarViscosidad() {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }

      const data = {
        muestraId: this._muestraActualId,
        observacion: document.getElementById("mlbViscObservacion").value.trim(),
        tipoAdhesivo: document.getElementById("mlbViscTipoAdhesivo").value.trim(),
        temperatura: num("mlbViscTemperatura"),
        equipo: document.getElementById("mlbViscEquipo").value.trim(),
        husillo: document.getElementById("mlbViscHusillo").value.trim(),
        velocidadRpm: num("mlbViscRpm"),
        resultadoCp: num("mlbViscResultado")
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.viscosidad.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando Viscosidad")

        this.cerrarModal("mlbModalViscosidad")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // pH
    // =====================================================================
    async guardarPh() {
      if (!this._muestraActualId) return

      const valorTexto = document.getElementById("mlbPhValor").value.trim()
      if (!valorTexto) {
        alert("Ingresa el valor o rango leído")
        return
      }

      const data = {
        muestraId: this._muestraActualId,
        observacion: document.getElementById("mlbPhObservacion").value.trim(),
        valorTexto,
        colorObservado: document.getElementById("mlbPhColor").value.trim()
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.ph.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando pH")

        this.cerrarModal("mlbModalPh")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // SOLIDOS TOTALES
    // =====================================================================
    async guardarSolidos() {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }
      const det = (n) => ({ m1: num(`mlbSol${n}M1`), m2: num(`mlbSol${n}M2`), m3: num(`mlbSol${n}M3`) })

      const data = {
        muestraId: this._muestraActualId,
        observacion: document.getElementById("mlbSolObservacion").value.trim(),
        d1: det(1),
        d2: det(2),
        d3: det(3)
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.solidos.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando Sólidos totales")

        this.cerrarModal("mlbModalSolidos")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // LUGOL
    // =====================================================================
    async guardarLugol() {
      if (!this._muestraActualId) return

      const data = {
        muestraId: this._muestraActualId,
        observacion: document.getElementById("mlbLugolObservacion").value.trim(),
        puntoMuestra: document.getElementById("mlbLugolPunto").value.trim(),
        coloracion: document.getElementById("mlbLugolColoracion").value.trim(),
        resultado: document.getElementById("mlbLugolResultado").value,
        interpretacion: document.getElementById("mlbLugolInterpretacion").value.trim(),
        cumplimiento: document.getElementById("mlbLugolCumplimiento").value
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.lugol.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando Lugol")

        this.cerrarModal("mlbModalLugol")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // ANULAR ENSAYO
    // =====================================================================
    async anularEnsayo(ensayoId) {
      const motivo = prompt("Motivo de anulación:")
      if (!motivo) return

      try {
        const res = await window.PhotinoBridge.send({
          action: "muestraLab.ensayo.anular",
          data: { ensayoId, motivo }
        })
        if (!res || res.ok === false) throw new Error(res?.error || "Error anulando el ensayo")

        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    destroy() {
      console.log("DESTROY MUESTRA LABORATORIO")
      if (this._clickHandler) {
        document.removeEventListener("click", this._clickHandler)
        this._clickHandler = null
      }
      if (this._changeHandler) {
        document.removeEventListener("change", this._changeHandler)
        this._changeHandler = null
      }
      (this._statsCharts || []).forEach(c => c.destroy())
      this._statsCharts = []
    }

    // =====================================================================
    // INDICADORES (KPIs + gráficos) — reemplaza el resumen del módulo "Laboratorio" (app móvil)
    // eliminado. Fuente propia de este módulo (muestra_laboratorio/muestra_laboratorio_ensayos),
    // histórico completo sin filtros propios por ahora.
    // =====================================================================
    async cargarIndicadores() {
      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.indicadores" })
        if (!res || res.ok === false) throw new Error(res?.error || "Error cargando indicadores")

        const ind = res.data || {}
        document.getElementById("mlbKpiTotalMuestras").textContent = ind.totalMuestras ?? 0
        document.getElementById("mlbKpiPendientes").textContent = ind.muestrasPendientes ?? 0
        document.getElementById("mlbKpiEnsayosFinalizados").textContent = ind.ensayosFinalizados ?? 0
        document.getElementById("mlbKpiPctCumplimiento").textContent =
          ind.pctCumplimiento === null || ind.pctCumplimiento === undefined ? "-" : `${ind.pctCumplimiento}%`

        this._renderChartBarras("mlbChartPorTipoEnsayo", ind.porTipoEnsayo || [], "Ensayos", { scroll: true })
        this._renderChartBarras("mlbChartPorOrigen", ind.porOrigen || [], "Muestras", { scroll: true })
        this._renderChartDoughnut("mlbChartCumplimiento", ind.porCumplimiento || [])
      } catch (err) {
        console.error("Error cargando indicadores de Laboratorio - Muestras:", err)
      }
    }

    // Barra horizontal, mismo patrón ya usado en No Conformidades: todas las categorías reales
    // (sin agrupar en "Otros"), alto dinámico + scroll interno para no romper el layout cuando
    // hay muchas (ej. hasta 13 tipos de ensayo), paleta cíclica para que cualquier cantidad de
    // barras tenga siempre un color real.
    _renderChartBarras(canvasId, rows, label, opts = {}) {
      const ctx = document.getElementById(canvasId)
      if (!ctx) return

      this._statsCharts = this._statsCharts || []
      const existente = this._statsCharts.find(c => c.canvas.id === canvasId)
      if (existente) { existente.destroy(); this._statsCharts = this._statsCharts.filter(c => c !== existente) }

      if (opts.scroll) {
        const alto = Math.max(180, rows.length * 26)
        ctx.style.setProperty("height", `${alto}px`, "important")
      }

      const paleta = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#14b8a6"]

      const chart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: rows.map(r => r.categoria || "-"),
          datasets: [{
            label,
            data: rows.map(r => Number(r.total || 0)),
            backgroundColor: rows.map((_, i) => paleta[i % paleta.length]),
            borderRadius: 8,
          }],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 11 } } } },
        },
      })
      this._statsCharts.push(chart)
    }

    _renderChartDoughnut(canvasId, rows) {
      const ctx = document.getElementById(canvasId)
      if (!ctx) return

      this._statsCharts = this._statsCharts || []
      const existente = this._statsCharts.find(c => c.canvas.id === canvasId)
      if (existente) { existente.destroy(); this._statsCharts = this._statsCharts.filter(c => c !== existente) }

      const colores = { "Cumple": "#22c55e", "No cumple": "#ef4444", "Sin especificacion": "#94a3b8", "Sin especificación": "#94a3b8" }
      const paleta = ["#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#14b8a6"]

      const chart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: rows.map(r => r.categoria || "-"),
          datasets: [{
            data: rows.map(r => Number(r.total || 0)),
            backgroundColor: rows.map((r, i) => colores[r.categoria] || paleta[i % paleta.length]),
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } },
          cutout: "62%",
        },
      })
      this._statsCharts.push(chart)
    }
  }

  window.MuestraLaboratorioController = MuestraLaboratorioController
}
