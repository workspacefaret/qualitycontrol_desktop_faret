if (!window.MermasInnpackController) {
    class MermasInnpackController {
        constructor() {
            this.data = null
            this.filtros = null
            this.loading = false
            this._clickHandler = null
        }

        async init() {
            console.log("INIT MERMAS INNPACK")
            this.bindEvents()
            this.initDatePickers()
            await this.cargarFiltros()
            await this.cargarDatos()
        }

        initDatePickers() {
            if (!window.flatpickr) return

            flatpickr("#mermasFechaDesde", {
                dateFormat: "Y-m-d",
                altInput: true,
                altFormat: "d-m-Y",
                allowInput: true
            })

            flatpickr("#mermasFechaHasta", {
                dateFormat: "Y-m-d",
                altInput: true,
                altFormat: "d-m-Y",
                allowInput: true
            })
        }

        bindEvents() {
            if (this._clickHandler) return

            this._clickHandler = (e) => {
                if (e.target.id === "btnActualizarMermas") {
                    this.cargarDatos()
                    return
                }

                if (e.target.id === "btnFiltrarMermas") {
                    this.cargarDatos()
                    return
                }

                if (e.target.id === "btnLimpiarMermas") {
                    this.limpiarFiltros()
                    this.cargarDatos()
                    return
                }

                if (e.target.id === "btnExportarMermas") {
                    this.exportarMermas()
                    return
                }
            }

            document.addEventListener("click", this._clickHandler)

            document.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && this._idsFiltros().includes(e.target.id)) {
                    e.preventDefault()
                    this.cargarDatos()
                }
            })
        }

        _idsFiltros() {
            return [
                "mermasFechaDesde",
                "mermasFechaHasta",
                "mermasMaterial",
                "mermasProceso",
                "mermasMaquina",
                "mermasTurno",
                "mermasBusqueda"
            ]
        }

        _getFiltros(sinLimite) {
            return {
                fechaDesde: this.getVal("mermasFechaDesde"),
                fechaHasta: this.getVal("mermasFechaHasta"),
                materialId: this.getVal("mermasMaterial"),
                procesoId: this.getVal("mermasProceso"),
                maquinaId: this.getVal("mermasMaquina"),
                turno: this.getVal("mermasTurno"),
                busqueda: this.getVal("mermasBusqueda"),
                sinLimite: !!sinLimite
            }
        }

        async cargarFiltros() {
            try {
                const res = await window.PhotinoBridge.send({ action: "mermas.obtenerFiltros" })
                if (!res || res.ok === false) return

                this.filtros = res.data || {}
                this.renderSelects()
            } catch (err) {
                console.error("MERMAS FILTROS ERROR:", err)
            }
        }

        renderSelects() {
            this._renderSelect("mermasMaterial", "Todos los materiales", this.filtros?.materiales)
            this._renderSelect("mermasProceso", "Todos los procesos", this.filtros?.procesos)
            this._renderSelect("mermasMaquina", "Todas las máquinas", this.filtros?.maquinas)
        }

        _renderSelect(id, etiquetaVacia, opciones) {
            const select = document.getElementById(id)
            if (!select) return

            const actual = select.value

            select.innerHTML =
                `<option value="">${etiquetaVacia}</option>` +
                (opciones || []).map(o =>
                    `<option value="${o.id}">${this.escape(o.nombre)}</option>`
                ).join("")

            select.value = actual
        }

        async cargarDatos() {
            if (this.loading) return

            this.loading = true
            this.renderLoading()

            try {
                const res = await window.PhotinoBridge.send({
                    action: "mermas.obtenerResumen",
                    data: this._getFiltros(false)
                })

                if (!res || res.ok === false) {
                    throw new Error(res?.error || "Error cargando mermas")
                }

                this.data = res.data || {}

                this.renderKpis()
                this.renderAgrupados()
                this.renderTabla()
            } catch (err) {
                console.error("MERMAS ERROR:", err)
                this.renderError(err.message)
            } finally {
                this.loading = false
            }
        }

        renderKpis() {
            this.setText("mermasTotalKg", this.numero(this.data?.totalKg))
            this.setText("mermasTotalUnidades", this.numero(this.data?.totalUnidades))
            this.setText("mermasCantidadRegistros", this.numero(this.data?.cantidadRegistros))
            this.setText("mermasMaterialMayor", this.data?.materialMayorMerma || "-")
        }

        renderAgrupados() {
            this._renderAgrupado("tbodyMermasPorMaterial", this.data?.porMaterial)
            this._renderAgrupado("tbodyMermasPorProceso", this.data?.porProceso)
            this._renderAgrupado("tbodyMermasPorMaquina", this.data?.porMaquina)
        }

        _renderAgrupado(tbodyId, filas) {
            const tbody = document.getElementById(tbodyId)
            if (!tbody) return

            const rows = filas || []

            if (!rows.length) {
                tbody.innerHTML = `<tr><td colspan="4">Sin datos</td></tr>`
                return
            }

            tbody.innerHTML = rows.map(r => `
          <tr>
            <td>${this.escape(r.nombre)}</td>
            <td>${this.numero(r.totalKg)}</td>
            <td>${this.numero(r.totalUnidades)}</td>
            <td>${this.numero(r.registros)}</td>
          </tr>
        `).join("")
        }

        renderTabla() {
            const tbody = document.getElementById("tbodyMermas")
            if (!tbody) return

            const rows = this.data?.registros || []

            if (!rows.length) {
                tbody.innerHTML = `<tr><td colspan="13">Sin registros de merma disponibles</td></tr>`
                return
            }

            tbody.innerHTML = rows.map(r => this._filaHtml(r)).join("")
        }

        _filaHtml(r) {
            return `
          <tr>
            <td>${this.escape(r.fecha)}</td>
            <td>${this.escape(r.area)}</td>
            <td>${this.escape(r.proceso)}</td>
            <td>${this.escape(r.maquina)}</td>
            <td>${this.escape(r.usuario)}</td>
            <td>${this.escape(r.np)}</td>
            <td>${this.escape(r.codigoProducto)}</td>
            <td>${this.escape(r.descripcionProducto)}</td>
            <td>${this.escape(r.material)}</td>
            <td>${this.numero(r.cantidad)}</td>
            <td>${this.escape(r.unidad)}</td>
            <td>${this.escape(r.observacion)}</td>
            <td>${this.escape(r.estadoValidacion)}</td>
          </tr>
        `
        }

        renderLoading() {
            const tbody = document.getElementById("tbodyMermas")
            if (tbody) tbody.innerHTML = `<tr><td colspan="13">Cargando mermas...</td></tr>`
        }

        renderError(message) {
            const tbody = document.getElementById("tbodyMermas")
            if (tbody) tbody.innerHTML = `<tr><td colspan="13">Error: ${this.escape(message)}</td></tr>`
        }

        limpiarFiltros() {
            this._idsFiltros().forEach(id => {
                const el = document.getElementById(id)
                if (el) el.value = ""
                if (el && el._flatpickr) el._flatpickr.clear()
            })
        }

        hayFiltrosActivos() {
            return this._idsFiltros().some(id => this.getVal(id).trim() !== "")
        }

        async exportarMermas() {
            if (this.hayFiltrosActivos()) {
                window.ExcelExporter.exportTable({
                    tableSelector: "#tablaMermas",
                    fileName: `qcc_mermas_innpack_${Date.now()}.xlsx`,
                    sheetName: "Mermas",
                    title: "QCC - Mermas Innpack"
                })
                return
            }

            const res = await window.PhotinoBridge.send({
                action: "mermas.obtenerResumen",
                data: this._getFiltros(true)
            })

            if (!res || res.ok === false) {
                alert(res?.error || "Error exportando mermas")
                return
            }

            const registros = res.data?.registros || []
            this.exportarRegistrosMermasDesdeDatos(registros)
        }

        exportarRegistrosMermasDesdeDatos(registros) {
            const tabla = document.createElement("table")
            tabla.id = "tablaMermasExportTemp"
            tabla.style.position = "absolute"
            tabla.style.left = "-99999px"
            tabla.style.top = "0"

            tabla.innerHTML = `
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Área</th>
              <th>Proceso</th>
              <th>Máquina</th>
              <th>Usuario</th>
              <th>NP</th>
              <th>Código producto</th>
              <th>Descripción producto</th>
              <th>Material</th>
              <th>Cantidad</th>
              <th>Unidad</th>
              <th>Observación</th>
              <th>Estado validación</th>
            </tr>
          </thead>
          <tbody>
            ${registros.map(r => this._filaHtml(r)).join("")}
          </tbody>
        `

            document.body.appendChild(tabla)

            window.ExcelExporter.exportTable({
                tableSelector: "#tablaMermasExportTemp",
                fileName: `qcc_mermas_innpack_todos_${Date.now()}.xlsx`,
                sheetName: "Mermas",
                title: "QCC - Mermas Innpack"
            })

            tabla.remove()
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

        destroy() {
            console.log("DESTROY MERMAS INNPACK")

            if (this._clickHandler) {
                document.removeEventListener("click", this._clickHandler)
            }

            this._clickHandler = null
            this.loading = false
        }
    }

    window.MermasInnpackController = MermasInnpackController
}
