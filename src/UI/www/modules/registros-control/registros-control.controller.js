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
    }

    async init() {
      console.log("INIT REGISTROS CONTROL")
      this.bindEvents()
      this.initDatePickers()
      await this.cargarDatos()
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
        if (e.target.id === "btnBuscarRegistros") {
          this.page = 1
          this.cargarDatos()
          return
        }

        if (e.target.id === "btnExportarRegistrosControl") {
          this.exportarRegistrosControl()
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

    async cargarDatos() {
      if (this.loading) return

      this.loading = true
      this.renderLoading()

      try {
        const payload = {
          page: this.page,
          limit: this.limit,
          fechaDesde: this.getVal("fechaDesdeRegistros"),
          fechaHasta: this.getVal("fechaHastaRegistros"),
          np: this.getVal("filtroNpRegistros"),
          turno: this.getVal("filtroTurnoRegistros"),
          estado: this.getVal("filtroEstadoRegistros")
        }

        const res = await window.PhotinoBridge.send({
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

        this.render()
        this.renderPaginacion()
        this.renderKpis()
      } catch (err) {
        console.error("REGISTROS CONTROL ERROR:", err)
        this.renderError(err.message)
      } finally {
        this.loading = false
      }
    }

    render() {
      const tbody = document.getElementById("tbodyRegistrosControl")
      if (!tbody) return

      if (!this.data.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="14">Sin registros para los filtros seleccionados</td>
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
      const value = estado || "-"
      return `<span style="font-weight:600;">${this.escape(value)}</span>`
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
          <td colspan="14">Cargando registros...</td>
        </tr>
      `
    }

    renderError(message) {
      const tbody = document.getElementById("tbodyRegistrosControl")
      if (!tbody) return

      tbody.innerHTML = `
        <tr>
          <td colspan="14">Error: ${this.escape(message)}</td>
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
        "filtroTurnoRegistros",
        "filtroEstadoRegistros"
      ].some(id => this.getVal(id).trim() !== "")
    }

    async exportarRegistrosControl() {
      if (this.hayFiltrosActivos()) {
        window.ExcelExporter.exportTable({
          tableSelector: "#tablaRegistrosControl",
          fileName: `qcc_registros_control_${Date.now()}.xlsx`,
          sheetName: "Registros Control",
          title: "QCC - Registros de Control"
        })
        return
      }

      const res = await window.PhotinoBridge.send({
        action: "registrosControl.obtenerRegistros",
        data: {
          page: 1,
          limit: this.total || 999999,
          fechaDesde: "",
          fechaHasta: "",
          np: "",
          turno: "",
          estado: ""
        }
      })

      if (!res || res.ok === false) {
        alert(res?.error || "Error exportando registros")
        return
      }

      const items = res.data?.items || []

      this.exportarRegistrosDesdeDatos(items)
    }

    exportarRegistrosDesdeDatos(items) {
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
              <td>${this.escape(r.estado || "-")}</td>
              <td>${this.escape(r.observacion || "-")}</td>
              <td>${this.escape(r.estadoValidacion || "PENDIENTE")}</td>
              <td>${this.escape(r.imagenUrl || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      `

      document.body.appendChild(tabla)

      window.ExcelExporter.exportTable({
        tableSelector: "#tablaRegistrosControlExportTemp",
        fileName: `qcc_registros_control_todos_${Date.now()}.xlsx`,
        sheetName: "Registros Control",
        title: "QCC - Registros de Control"
      })

      tabla.remove()
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
