if (!window.RegistrosControlController) {
  class RegistrosControlController {
    constructor() {
      this.data = []
      this.page = 1
      this.limit = 20
      this.pages = 1
      this.total = 0
      this.loading = false
      this._clickHandler = null
      this.deepLinkId = null
    }

    async init() {
      console.log("INIT REGISTROS CONTROL")
      this.consumirDeepLink()
      this.bindEvents()
      this.initDatePickers()
      await this.cargarDatos()
    }

    // Si "Gestionar" de una alerta en Inicio dejó un id pendiente para este módulo, lo toma y
    // lo borra de inmediato (evita que quede "pegado" si el usuario navega de nuevo más tarde).
    consumirDeepLink() {
      const raw = sessionStorage.getItem("qccDeepLinkId")
      if (!raw) return

      try {
        const info = JSON.parse(raw)
        if (info?.modulo === "registros-control" && info.id) {
          this.deepLinkId = Number(info.id)
        }
      } catch { /* ignorar */ }

      sessionStorage.removeItem("qccDeepLinkId")
    }

    quitarDeepLink() {
      this.deepLinkId = null
      this.page = 1
      this.cargarDatos()
    }

    renderDeepLinkBanner() {
      const banner = document.getElementById("registrosControlDeepLinkBanner")
      if (!banner) return

      if (!this.deepLinkId) {
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
          <span>Mostrando el registro #${this.deepLinkId} desde una alerta de Inicio.</span>
          <button class="btn-secondary" id="btnVerTodosRegistrosControl">Ver todos</button>
        </div>
      `
    }

    initDatePickers() {
      if (!window.flatpickr) return

      flatpickr("#fechaDesdeRegistros", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d-m-Y",
        allowInput: true
      })

      flatpickr("#fechaHastaRegistros", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d-m-Y",
        allowInput: true
      })
    }

    bindEvents() {
      if (this._clickHandler) return

      this._clickHandler = (e) => {
        if (e.target.id === "btnVerTodosRegistrosControl") {
          this.quitarDeepLink()
          return
        }

        if (e.target.id === "btnBuscarRegistros") {
          this.page = 1
          this.cargarDatos()
          return
        }

        if (e.target.id === "btnExportarRegistrosControl") {
          this.exportarRegistrosControl()
          return
        }

        if (e.target.id === "btnImprimirRegistrosControl") {
          this.imprimirRegistrosControl()
          return
        }

        if (e.target.id === "btnLimpiarRegistros") {
          this.limpiarFiltros()
          this.page = 1
          this.cargarDatos()
          return
        }

        if (e.target.classList.contains("btn-validar-registro-control")) {
          const id = Number(e.target.dataset.id)

          window.PhotinoBridge.send({
            action: "registrosControl.validarRegistro",
            id
          }).then(() => {
            this.cargarDatos()
          })

          return
        }

        if (e.target.classList.contains("btn-rechazar-registro-control")) {
          const id = Number(e.target.dataset.id)

          window.PhotinoBridge.send({
            action: "registrosControl.rechazarRegistro",
            id
          }).then(() => {
            this.cargarDatos()
          })

          return
        }

        if (e.target.classList.contains("btn-eliminar-registro-control")) {
          const id = Number(e.target.dataset.id)

          if (!confirm("¿Eliminar este registro? Esta acción no se puede deshacer desde la pantalla.")) {
            return
          }

          window.PhotinoBridge.send({
            action: "registrosControl.eliminarRegistro",
            id
          }).then(() => {
            this.cargarDatos()
          })

          return
        }

        if (e.target.classList.contains("btn-ver-imagen-registro-control")) {
          const url = e.target.dataset.url || ""
          this.mostrarImagenRegistroControl(url)
          return
        }

        if (e.target.id === "btnCerrarImagenRegistroControl") {
          this.cerrarImagenRegistroControl()
          return
        }

        if (e.target.id === "modalImagenRegistroControl") {
          this.cerrarImagenRegistroControl()
          return
        }

        if (e.target.dataset.registrosPage) {
          this.page = Number(e.target.dataset.registrosPage)
          this.cargarDatos()
          return
        }
      }

      document.addEventListener("click", this._clickHandler)
      document.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const idsFiltros = [
            "fechaDesdeRegistros",
            "fechaHastaRegistros",
            "filtroNpRegistros",
            "filtroIdRegistros",
            "filtroTurnoRegistros",
            "filtroEstadoRegistros"
          ]

          if (idsFiltros.includes(e.target.id)) {
            e.preventDefault()
            this.page = 1
            this.cargarDatos()
          }
        }

        if (e.key === "Escape") {
          this.cerrarImagenRegistroControl()
        }
      })
    }

    // Envuelve el pedido con un tope de tiempo: si por cualquier motivo la respuesta nunca llega
    // (bridge Photino sin resolver), la promesa igual se resuelve con un error en vez de dejar
    // `loading` pegado en true para siempre, que era lo que obligaba a reiniciar toda la app para
    // poder volver a filtrar.
    enviarConTimeout(payload, ms = 20000) {
      return Promise.race([
        window.PhotinoBridge.send(payload),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Tiempo de espera agotado. Intenta nuevamente.")), ms)
        )
      ])
    }

    idFiltroActivo() {
      if (this.deepLinkId) return this.deepLinkId
      const valor = this.getVal("filtroIdRegistros").trim()
      return valor !== "" ? valor : null
    }

    async cargarDatos() {
      if (this.loading) return

      this.loading = true
      this.renderLoading()

      const btnBuscar = document.getElementById("btnBuscarRegistros")
      if (btnBuscar) btnBuscar.disabled = true

      try {
        const idFiltro = this.idFiltroActivo()

        const payload = {
          page: this.page,
          limit: this.limit,
          fechaDesde: this.getVal("fechaDesdeRegistros"),
          fechaHasta: this.getVal("fechaHastaRegistros"),
          np: this.getVal("filtroNpRegistros"),
          turno: this.getVal("filtroTurnoRegistros"),
          estado: this.getVal("filtroEstadoRegistros"),
          ...(idFiltro ? { id: idFiltro } : {})
        }

        const res = await this.enviarConTimeout({
          action: "registrosControl.obtenerRegistros",
          data: payload
        })

        if (!res || res.ok === false) {
          throw new Error(res?.error || "Error cargando registros de control")
        }

        this.data = res.data.items || []
        this.total = res.data.total || 0
        this.pages = res.data.pages || 1
        this.page = res.data.page || 1

        this.renderDeepLinkBanner()
        this.render()
        this.renderPaginacion()
        this.renderKpis()
      } catch (err) {
        console.error("REGISTROS CONTROL ERROR:", err)
        this.renderError(err.message)
      } finally {
        this.loading = false
        if (btnBuscar) btnBuscar.disabled = false
      }
    }

    render() {
      const tbody = document.getElementById("tbodyRegistrosControl")
      if (!tbody) return

      if (!this.data.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="17">Sin registros para los filtros seleccionados</td>
          </tr>
        `
        return
      }

      tbody.innerHTML = this.data.map(r => `
        <tr>
          <td>${r.id}</td>
          <td>${this.escape(r.fechaRegistro)}</td>
          <td>${this.escape(r.horaRegistro)}</td>
          <td>${this.escape(r.usuario)}</td>
          <td>${this.escape(r.proceso)}</td>
          <td>${this.escape(r.maquina)}</td>
          <td>${this.escape(r.formulario || "-")}</td>
          <td>${this.escape(r.np || "-")}</td>
          <td>${this.escape(r.turno)}</td>
          <td>${this.renderEstado(r.estado)}</td>
          <td>${this.escape(r.observacion || "-")}</td>
          <td>${this.escape(r.cantidadMerma || "-")}</td>
          <td>${this.escape(r.tipoMerma || "-")}</td>
          <td>${this.escape(r.tipoDefecto || "-")}</td>

          <td>
            ${this.renderEstadoValidacion(r.estadoValidacion)}
          </td>

          <td>
            <button
              class="btn-primary btn-validar-registro-control"
              data-id="${r.id}">
              Validar
            </button>

            <button
              class="btn-secondary btn-rechazar-registro-control"
              data-id="${r.id}">
              Rechazar
            </button>

            <button
              class="btn-danger btn-eliminar-registro-control"
              data-id="${r.id}">
              Eliminar
            </button>
          </td>

          <td>
            ${r.imagenUrl && r.imagenUrl.trim() !== ""
          ? `
                <button
                  class="btn-secondary btn-ver-imagen-registro-control"
                  data-url="${this.escape(r.imagenUrl)}">
                  Ver Imagen
                </button>
              `
          : "-"
        }
          </td>
        </tr>
      `).join("")
    }

    renderEstado(estado) {
      const value = this.traducirEstado(estado)
      return `<span style="font-weight:600;">${this.escape(value)}</span>`
    }

    traducirEstado(estado) {
      const mapa = {
        "Aprobado": "Conforme",
        "Rechazado": "No conforme"
      }

      return mapa[estado] || estado || "-"
    }

    renderEstadoValidacion(estado) {
      const value = estado || "PENDIENTE"

      let color = "#f59e0b"

      if (value === "VALIDADO") color = "#16a34a"
      if (value === "RECHAZADO") color = "#dc2626"

      return `
        <span style="
          font-weight:700;
          color:${color};
        ">
          ${this.escape(value)}
        </span>
      `
    }

    renderLoading() {
      const tbody = document.getElementById("tbodyRegistrosControl")
      if (!tbody) return

      tbody.innerHTML = `
        <tr>
          <td colspan="17">Cargando registros...</td>
        </tr>
      `
    }

    renderError(message) {
      const tbody = document.getElementById("tbodyRegistrosControl")
      if (!tbody) return

      tbody.innerHTML = `
        <tr>
          <td colspan="17">Error: ${this.escape(message)}</td>
        </tr>
      `
    }

    renderKpis() {
      const total = document.getElementById("kpiTotalRegistros")
      const pagina = document.getElementById("kpiPaginaActual")
      const visibles = document.getElementById("kpiVisibles")

      if (total) total.textContent = this.total
      if (pagina) pagina.textContent = this.page
      if (visibles) visibles.textContent = this.data.length
    }

    renderPaginacion() {
      const container = document.getElementById("paginacionRegistrosControl")
      if (!container) return

      let html = ""
      const rango = 2
      const inicio = Math.max(1, this.page - rango)
      const fin = Math.min(this.pages, this.page + rango)

      if (this.page > 1) {
        html += `<button data-registros-page="${this.page - 1}">←</button>`
      }

      if (inicio > 1) {
        html += `<button data-registros-page="1">1</button>`
        if (inicio > 2) html += `<button disabled>...</button>`
      }

      for (let i = inicio; i <= fin; i++) {
        html += `
          <button
            data-registros-page="${i}"
            class="${i === this.page ? "active" : ""}">
            ${i}
          </button>
        `
      }

      if (fin < this.pages) {
        if (fin < this.pages - 1) html += `<button disabled>...</button>`
        html += `<button data-registros-page="${this.pages}">${this.pages}</button>`
      }

      if (this.page < this.pages) {
        html += `<button data-registros-page="${this.page + 1}">→</button>`
      }

      container.innerHTML = html
    }

    limpiarFiltros() {
      [
        "fechaDesdeRegistros",
        "fechaHastaRegistros",
        "filtroNpRegistros",
        "filtroIdRegistros",
        "filtroTurnoRegistros",
        "filtroEstadoRegistros"
      ].forEach(id => {
        const el = document.getElementById(id)
        if (el) el.value = ""
        if (el && el._flatpickr) el._flatpickr.clear()
      })
    }

    mostrarImagenRegistroControl(url) {
      const imagenUrl = this.normalizarImagenUrl(url)

      if (!imagenUrl) {
        alert("No hay imagen disponible para este registro.")
        return
      }

      this.cerrarImagenRegistroControl()

      const modal = document.createElement("div")
      modal.id = "modalImagenRegistroControl"
      modal.style.position = "fixed"
      modal.style.left = "0"
      modal.style.top = "0"
      modal.style.width = "100%"
      modal.style.height = "100%"
      modal.style.background = "rgba(15, 23, 42, 0.75)"
      modal.style.zIndex = "9999"
      modal.style.display = "flex"
      modal.style.alignItems = "center"
      modal.style.justifyContent = "center"
      modal.style.padding = "24px"

      modal.innerHTML = `
        <div style="
          background:#ffffff;
          border-radius:12px;
          max-width:90%;
          max-height:90%;
          padding:16px;
          box-shadow:0 20px 60px rgba(0,0,0,0.35);
          position:relative;
        ">
          <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:12px;
            margin-bottom:12px;
          ">
            <strong>Imagen del registro</strong>

            <button
              id="btnCerrarImagenRegistroControl"
              class="btn-secondary"
              type="button">
              Cerrar
            </button>
          </div>

          <img
            src="${this.escape(imagenUrl)}"
            alt="Imagen del registro"
            style="
              display:block;
              max-width:100%;
              max-height:75vh;
              object-fit:contain;
              border-radius:8px;
            "
          />
        </div>
      `

      document.body.appendChild(modal)
    }

    cerrarImagenRegistroControl() {
      const modal = document.getElementById("modalImagenRegistroControl")
      if (modal) modal.remove()
    }

    normalizarImagenUrl(url) {
      const value = String(url || "").trim()

      if (!value) return ""

      if (value.startsWith("http://") || value.startsWith("https://")) {
        return value
      }

      if (value.startsWith("/")) {
        return `https://api.faret.cl/calidad${value}`
      }

      return `https://api.faret.cl/calidad/${value}`
    }
    hayFiltrosActivos() {
      return [
        "fechaDesdeRegistros",
        "fechaHastaRegistros",
        "filtroNpRegistros",
        "filtroIdRegistros",
        "filtroTurnoRegistros",
        "filtroEstadoRegistros"
      ].some(id => this.getVal(id).trim() !== "")
    }

    async exportarRegistrosControl() {
      const idFiltro = this.idFiltroActivo()

      const res = await window.PhotinoBridge.send({
        action: "registrosControl.obtenerRegistros",
        data: {
          page: 1,
          limit: this.total || 999999,
          fechaDesde: this.getVal("fechaDesdeRegistros"),
          fechaHasta: this.getVal("fechaHastaRegistros"),
          np: this.getVal("filtroNpRegistros"),
          turno: this.getVal("filtroTurnoRegistros"),
          estado: this.getVal("filtroEstadoRegistros"),
          ...(idFiltro ? { id: idFiltro } : {})
        }
      })

      if (!res || res.ok === false) {
        alert(res?.error || "Error exportando registros")
        return
      }

      const items = res.data?.items || []

      const tabla = this.construirTablaTemp(items)

      window.ExcelExporter.exportTable({
        tableSelector: "#tablaRegistrosControlExportTemp",
        fileName: `qcc_registros_control_todos_${Date.now()}.xlsx`,
        sheetName: "Registros Control",
        title: "QCC - Registros de Control"
      })

      tabla.remove()
    }

    async imprimirRegistrosControl() {
      const idFiltro = this.idFiltroActivo()

      const res = await window.PhotinoBridge.send({
        action: "registrosControl.obtenerRegistros",
        data: {
          page: 1,
          limit: this.total || 999999,
          fechaDesde: this.getVal("fechaDesdeRegistros"),
          fechaHasta: this.getVal("fechaHastaRegistros"),
          np: this.getVal("filtroNpRegistros"),
          turno: this.getVal("filtroTurnoRegistros"),
          estado: this.getVal("filtroEstadoRegistros"),
          ...(idFiltro ? { id: idFiltro } : {})
        }
      })

      if (!res || res.ok === false) {
        alert(res?.error || "Error al imprimir registros")
        return
      }

      const items = res.data?.items || []
      const tabla = this.construirTablaTemp(items)

      window.PrintExporter.printTable({
        tableSelector: "#tablaRegistrosControlExportTemp",
        titulo: "Registros de Control",
        empresa: "INNPACK",
        subtitulo: this.resumenFiltrosTexto(),
        totalRegistros: items.length
      })

      tabla.remove()
    }

    resumenFiltrosTexto() {
      const partes = []

      const desde = this.getVal("fechaDesdeRegistros")
      const hasta = this.getVal("fechaHastaRegistros")
      const np = this.getVal("filtroNpRegistros")
      const id = this.getVal("filtroIdRegistros")
      const turnoSel = document.getElementById("filtroTurnoRegistros")
      const estado = this.getVal("filtroEstadoRegistros")

      if (this.deepLinkId) partes.push(`ID: ${this.deepLinkId}`)
      if (id) partes.push(`ID: ${id}`)
      if (np) partes.push(`NP: ${np}`)
      if (turnoSel?.value) partes.push(`Turno: ${turnoSel.options[turnoSel.selectedIndex].text}`)
      if (estado) partes.push(`Estado: ${estado}`)
      if (desde) partes.push(`Fecha desde: ${desde}`)
      if (hasta) partes.push(`Fecha hasta: ${hasta}`)

      return partes.length ? partes.join(" · ") : "Sin filtros — histórico completo"
    }

    construirTablaTemp(items) {
      const tabla = document.createElement("table")
      tabla.id = "tablaRegistrosControlExportTemp"
      tabla.style.position = "absolute"
      tabla.style.left = "-99999px"
      tabla.style.top = "0"

      tabla.innerHTML = `
        <thead>
          <tr>
            <th>ID</th>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Usuario</th>
            <th>Proceso</th>
            <th>Máquina</th>
            <th>Formulario</th>
            <th>NP</th>
            <th>Turno</th>
            <th>Estado</th>
            <th>Observación</th>
            <th>Cantidad Merma</th>
            <th>Detalle Merma</th>
            <th>Tipo Defecto</th>
            <th>Estado Validación</th>
            <th>Imagen</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td>${this.escape(r.id)}</td>
              <td>${this.escape(r.fechaRegistro)}</td>
              <td>${this.escape(r.horaRegistro)}</td>
              <td>${this.escape(r.usuario)}</td>
              <td>${this.escape(r.proceso)}</td>
              <td>${this.escape(r.maquina)}</td>
              <td>${this.escape(r.formulario || "-")}</td>
              <td>${this.escape(r.np || "-")}</td>
              <td>${this.escape(r.turno || "-")}</td>
              <td>${this.escape(this.traducirEstado(r.estado))}</td>
              <td>${this.escape(r.observacion || "-")}</td>
              <td>${this.escape(r.cantidadMerma || "-")}</td>
              <td>${this.escape(r.tipoMerma || "-")}</td>
              <td>${this.escape(r.tipoDefecto || "-")}</td>
              <td>${this.escape(r.estadoValidacion || "PENDIENTE")}</td>
              <td>${this.escape(r.imagenUrl || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      `

      document.body.appendChild(tabla)
      return tabla
    }

    getVal(id) {
      return document.getElementById(id)?.value || ""
    }

    escape(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;")
    }

    destroy() {
      console.log("DESTROY REGISTROS CONTROL")

      if (this._clickHandler) {
        document.removeEventListener("click", this._clickHandler)
      }

      this._clickHandler = null
      this.loading = false
    }
  }

  window.RegistrosControlController = RegistrosControlController
}
