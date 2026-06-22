if (!window.LaboratorioController) {
    class LaboratorioController {
        constructor() {
            this.data = null
            this.loading = false
            this._clickHandler = null
            this.charts = []
        }

        async init() {
            console.log("INIT LABORATORIO")
            this.bindEvents()
            this.initDatePickers()
            await this.cargarDatos()
        }

        initDatePickers() {
            if (!window.flatpickr) return

            flatpickr("#laboratorioFechaDesde", {
                dateFormat: "Y-m-d",
                altInput: true,
                altFormat: "d-m-Y",
                allowInput: true
            })

            flatpickr("#laboratorioFechaHasta", {
                dateFormat: "Y-m-d",
                altInput: true,
                altFormat: "d-m-Y",
                allowInput: true
            })
        }

        bindEvents() {
            if (this._clickHandler) return

            this._clickHandler = (e) => {
                if (e.target.id === "btnActualizarLaboratorio") {
                    this.cargarDatos()
                    return
                }

                if (e.target.id === "btnFiltrarLaboratorio") {
                    this.cargarDatos()
                    return
                }

                if (e.target.id === "btnLimpiarLaboratorio") {
                    this.limpiarFiltros()
                    this.cargarDatos()
                    return
                }

                if (e.target.id === "btnExportarLaboratorio") {
                    window.ExcelExporter.exportTable({
                        tableSelector: "#tablaLaboratorio",
                        fileName: `qcc_laboratorio_${Date.now()}.xlsx`,
                        sheetName: "Laboratorio",
                        title: "QCC - Laboratorio"
                    })
                    return
                }

                if (e.target.classList.contains("btn-ver-imagen-laboratorio")) {
                    const url = e.target.dataset.url || ""
                    this.mostrarImagenLaboratorio(url)
                    return
                }

                if (e.target.id === "btnCerrarImagenLaboratorio") {
                    this.cerrarImagenLaboratorio()
                    return
                }

                if (e.target.id === "modalImagenLaboratorio") {
                    this.cerrarImagenLaboratorio()
                    return
                }
            }

            document.addEventListener("click", this._clickHandler)

            document.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    const idsFiltros = [
                        "laboratorioFechaDesde",
                        "laboratorioFechaHasta",
                        "laboratorioEnsayo",
                        "laboratorioMaterial"
                    ]

                    if (idsFiltros.includes(e.target.id)) {
                        e.preventDefault()
                        this.cargarDatos()
                    }
                }

                if (e.key === "Escape") {
                    this.cerrarImagenLaboratorio()
                }
            })
        }

        async cargarDatos() {
            if (this.loading) return

            this.loading = true
            this.renderLoading()

            try {
                const res = await window.PhotinoBridge.send({
                    action: "laboratorio.obtenerResumen",
                    data: {
                        fechaDesde: this.getVal("laboratorioFechaDesde"),
                        fechaHasta: this.getVal("laboratorioFechaHasta"),
                        ensayo: this.getVal("laboratorioEnsayo"),
                        material: this.getVal("laboratorioMaterial")
                    }
                })

                if (!res || res.ok === false) {
                    throw new Error(res?.error || "Error cargando laboratorio")
                }

                this.data = res.data || {}

                this.renderKpis()
                this.renderFiltros()
                this.renderCharts()
                this.renderTabla()
            } catch (err) {
                console.error("LABORATORIO ERROR:", err)
                this.renderError(err.message)
            } finally {
                this.loading = false
            }
        }

        renderKpis() {
            this.setText("labEnsayosHoy", this.numero(this.data?.ensayosHoy))
            this.setText("labEnsayosPeriodo", this.numero(this.data?.ensayosPeriodo))
            this.setText("labTiposEnsayo", this.numero(this.data?.tiposEnsayo))
            this.setText("labMaterialesAnalizados", this.numero(this.data?.materialesAnalizados))
        }

        renderFiltros() {
            const ensayoActual = this.getVal("laboratorioEnsayo")
            const materialActual = this.getVal("laboratorioMaterial")

            const cboEnsayo = document.getElementById("laboratorioEnsayo")
            const cboMaterial = document.getElementById("laboratorioMaterial")

            if (cboEnsayo) {
                cboEnsayo.innerHTML =
                    `<option value="">Todos los ensayos</option>` +
                    (this.data?.ensayos || []).map(x =>
                        `<option value="${x.id}">${this.escape(x.nombre)}</option>`
                    ).join("")

                cboEnsayo.value = ensayoActual
            }

            if (cboMaterial) {
                cboMaterial.innerHTML =
                    `<option value="">Todos los materiales</option>` +
                    (this.data?.materiales || []).map(x =>
                        `<option value="${x.id}">${this.escape(x.nombre)}</option>`
                    ).join("")

                cboMaterial.value = materialActual
            }
        }

        renderCharts() {
            this.destroyCharts()

            const registros = this.data?.registros || []

            this.chartBar(
                "chartLaboratorioEnsayosTipo",
                this.agruparPorCampo(registros, "ensayo"),
                "Ensayos"
            )

            this.chartBar(
                "chartLaboratorioMateriales",
                this.agruparPorCampo(registros, "material"),
                "Materiales"
            )
        }

        agruparPorCampo(rows, campo) {
            const map = {}

            rows.forEach(r => {
                const key = r[campo] || "-"
                map[key] = (map[key] || 0) + 1
            })

            return Object.keys(map)
                .map(nombre => ({
                    nombre,
                    total: map[nombre]
                }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 10)
        }

        chartBar(canvasId, rows, label) {
            const ctx = document.getElementById(canvasId)
            if (!ctx) return

            const chart = new Chart(ctx, {
                type: "bar",
                data: {
                    labels: rows.map(x => x.nombre),
                    datasets: [{
                        label,
                        data: rows.map(x => x.total),
                        backgroundColor: [
                            "#2563eb",
                            "#16a34a",
                            "#f97316",
                            "#dc2626",
                            "#7c3aed",
                            "#0891b2",
                            "#eab308",
                            "#ec4899"
                        ],
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        },
                        x: {
                            ticks: {
                                font: { size: 10 }
                            }
                        }
                    }
                }
            })

            this.charts.push(chart)
        }

        renderTabla() {
            const tbody = document.getElementById("tbodyLaboratorio")
            if (!tbody) return

            const rows = this.data?.registros || []

            if (!rows.length) {
                tbody.innerHTML = `
            <tr>
              <td colspan="13">Sin ensayos disponibles</td>
            </tr>
          `
                return
            }

            tbody.innerHTML = rows.map(r => `
          <tr>
            <td>${this.numero(r.id)}</td>
            <td>${this.numero(r.registroId)}</td>
            <td>${this.escape(r.fechaRegistro)}</td>
            <td>${this.escape(r.horaRegistro)}</td>
            <td>${this.escape(r.ensayo || "-")}</td>
            <td>${this.escape(r.material || "-")}</td>
            <td>${this.renderValor(r.valor)}</td>
            <td>${this.escape(r.np || "-")}</td>
            <td>${this.escape(r.turno || "-")}</td>
            <td>${this.escape(r.usuario || "-")}</td>
            <td>${this.escape(r.proceso || "-")}</td>
            <td>${this.escape(r.observacion || "-")}</td>
            <td>
              ${r.imagenUrl && r.imagenUrl.trim() !== ""
                    ? `
                  <button
                    class="btn-secondary btn-ver-imagen-laboratorio"
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

        renderValor(valor) {
            const value = String(valor || "").trim()

            if (!value) return "-"

            return `
          <span class="lab-badge lab-badge-ok">
            ${this.escape(value)}
          </span>
        `
        }

        renderLoading() {
            const tbody = document.getElementById("tbodyLaboratorio")
            if (!tbody) return

            tbody.innerHTML = `
          <tr>
            <td colspan="13">Cargando ensayos...</td>
          </tr>
        `
        }

        renderError(message) {
            const tbody = document.getElementById("tbodyLaboratorio")
            if (!tbody) return

            tbody.innerHTML = `
          <tr>
            <td colspan="13">Error: ${this.escape(message)}</td>
          </tr>
        `
        }

        limpiarFiltros() {
            [
                "laboratorioFechaDesde",
                "laboratorioFechaHasta",
                "laboratorioEnsayo",
                "laboratorioMaterial"
            ].forEach(id => {
                const el = document.getElementById(id)
                if (el) el.value = ""
                if (el && el._flatpickr) el._flatpickr.clear()
            })
        }

        mostrarImagenLaboratorio(url) {
            const imagenUrl = this.normalizarImagenUrl(url)

            if (!imagenUrl) {
                alert("No hay imagen disponible para este registro.")
                return
            }

            this.cerrarImagenLaboratorio()

            const modal = document.createElement("div")
            modal.id = "modalImagenLaboratorio"
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
                id="btnCerrarImagenLaboratorio"
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

        cerrarImagenLaboratorio() {
            const modal = document.getElementById("modalImagenLaboratorio")
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

        setText(id, value) {
            const el = document.getElementById(id)
            if (el) el.textContent = value
        }

        numero(value) {
            return Number(value || 0).toLocaleString("es-CL", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            })
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

        destroyCharts() {
            this.charts.forEach(chart => {
                try {
                    chart.destroy()
                } catch (_) { }
            })

            this.charts = []
        }

        destroy() {
            console.log("DESTROY LABORATORIO")

            if (this._clickHandler) {
                document.removeEventListener("click", this._clickHandler)
            }

            this._clickHandler = null
            this.loading = false
            this.destroyCharts()
        }
    }

    window.LaboratorioController = LaboratorioController
}
