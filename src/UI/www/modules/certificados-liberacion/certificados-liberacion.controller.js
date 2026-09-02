if (!window.CertificadosLiberacionController) {
    class CertificadosLiberacionController {
        constructor() {
            this.items = []
            this.loading = false
            this.descargando = false
            this._clickHandler = null
        }

        async init() {
            console.log("INIT CERTIFICADOS LIBERACION")
            this.bindEvents()
            await this.buscar()
        }

        destroy() {
            if (this._clickHandler) {
                document.removeEventListener("click", this._clickHandler)
                this._clickHandler = null
            }
        }

        bindEvents() {
            if (!this._clickHandler) {
                this._clickHandler = (e) => {
                    if (e.target.id === "clBtnBuscar") {
                        this.buscar()
                    }

                    if (e.target.id === "clBtnLimpiar") {
                        this.limpiarFiltros()
                    }

                    if (e.target.classList.contains("cl-descargar-btn")) {
                        const folio = e.target.getAttribute("data-folio")
                        const accion = e.target.getAttribute("data-accion")
                        if (folio && accion) this.descargarPdf(Number(folio), accion, e.target)
                    }
                }

                document.addEventListener("click", this._clickHandler)
            }
        }

        limpiarFiltros() {
            this.setVal("clFiltroFolio", "")
            this.setVal("clFiltroNp", "")
            this.setVal("clFiltroCliente", "")
            this.setVal("clFiltroOperador", "")
            this.setVal("clFiltroEmpresa", "")
            this.setVal("clFiltroFechaDesde", "")
            this.setVal("clFiltroFechaHasta", "")
            this.buscar()
        }

        async buscar() {
            if (this.loading) return

            this.loading = true
            this.renderLoading()

            try {
                const filtros = {
                    folio: this.getVal("clFiltroFolio"),
                    np: this.getVal("clFiltroNp"),
                    cliente: this.getVal("clFiltroCliente"),
                    operador: this.getVal("clFiltroOperador"),
                    empresa: this.getVal("clFiltroEmpresa"),
                    fechaDesde: this.getVal("clFiltroFechaDesde"),
                    fechaHasta: this.getVal("clFiltroFechaHasta")
                }

                const hayFiltros = Object.values(filtros).some((v) => v)

                const res = await window.PhotinoBridge.send({
                    action: "certificadosLiberacion.buscar",
                    data: filtros
                })

                if (!res || res.ok === false) {
                    throw new Error(res?.error || "Error buscando certificados de liberación")
                }

                this.items = res.data || []
                this.renderTitulo(hayFiltros)
                this.renderTabla()
            } catch (err) {
                console.error("CERTIFICADOS LIBERACION ERROR:", err)
                this.renderError(err.message)
            } finally {
                this.loading = false
            }
        }

        async descargarPdf(folio, accion, btn) {
            if (this.descargando) return
            this.descargando = true

            const textoOriginal = btn.textContent
            btn.textContent = "Descargando..."
            btn.disabled = true

            try {
                const res = await window.PhotinoBridge.send({
                    action: accion,
                    data: { folio }
                })

                if (!res || res.ok === false) {
                    throw new Error(res?.error || "No fue posible descargar el certificado")
                }
            } catch (err) {
                console.error("CERTIFICADOS LIBERACION DESCARGA ERROR:", err)
                alert(err.message)
            } finally {
                btn.textContent = textoOriginal
                btn.disabled = false
                this.descargando = false
            }
        }

        renderTitulo(hayFiltros) {
            const el = document.getElementById("clResultadosTitulo")
            if (!el) return
            el.textContent = hayFiltros
                ? `Certificados encontrados (${this.items.length})`
                : "Certificados (últimos 200 sin filtros)"
        }

        renderTabla() {
            const tbody = document.getElementById("clTbody")
            if (!tbody) return

            if (this.items.length === 0) {
                tbody.innerHTML = `<tr><td colspan="14">Sin resultados</td></tr>`
                return
            }

            tbody.innerHTML = this.items.map((item) => this.renderFila(item)).join("")
        }

        renderFila(item) {
            const fecha = window.DateUtils ? window.DateUtils.formatear(item.fechaLiberacion) : (item.fechaLiberacion || "-")

            const accionCalidad = `<button class="btn-secondary cl-descargar-btn" data-folio="${item.folio}" data-accion="certificadosLiberacion.calidadPdf.descargar">Descargar</button>`

            return `
                <tr>
                    <td>${item.folio ?? "-"}</td>
                    <td>${this.esc(item.empresa)}</td>
                    <td>${this.esc(item.np)}</td>
                    <td>${this.esc(item.cliente)}</td>
                    <td>${this.esc(item.item)}</td>
                    <td>${this.esc(item.codigoArticulo)}</td>
                    <td>${this.esc(item.descripcionArticulo)}</td>
                    <td>${item.cantidadBase ?? "-"}</td>
                    <td>${item.cantidadLiberacion ?? "-"}</td>
                    <td>${this.esc(item.operador)}</td>
                    <td>${this.esc(item.inspector)}</td>
                    <td>${fecha}</td>
                    <td>${this.esc(item.bodegaDestino)}</td>
                    <td>${accionCalidad}</td>
                </tr>
            `
        }

        renderLoading() {
            const tbody = document.getElementById("clTbody")
            if (tbody) tbody.innerHTML = `<tr><td colspan="14">Cargando...</td></tr>`
        }

        renderError(mensaje) {
            const tbody = document.getElementById("clTbody")
            if (tbody) tbody.innerHTML = `<tr><td colspan="14">Error: ${this.esc(mensaje)}</td></tr>`
        }

        esc(valor) {
            if (valor === null || valor === undefined) return "-"
            const div = document.createElement("div")
            div.textContent = String(valor)
            return div.innerHTML || "-"
        }

        getVal(id) {
            const el = document.getElementById(id)
            return el ? el.value.trim() : ""
        }

        setVal(id, valor) {
            const el = document.getElementById(id)
            if (el) el.value = valor
        }
    }

    window.CertificadosLiberacionController = CertificadosLiberacionController
}
