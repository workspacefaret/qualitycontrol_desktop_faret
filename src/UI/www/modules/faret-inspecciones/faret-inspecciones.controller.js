window.FaretInspeccionesController = class FaretInspeccionesController {

    init() {
        console.log("FaretInspeccionesController iniciado");

        this._page = 1;
        this._pageSize = 50;
        this._totalCount = 0;
        this._items = [];
        this._sortCampo = null;
        this._sortAsc = true;

        document.getElementById("fi-refresh-btn")
            ?.addEventListener("click", () => this._loadAll());

        document.getElementById("fi-filtrar-btn")
            ?.addEventListener("click", () => { this._page = 1; this._loadAll(); });

        document.getElementById("fi-limpiar-btn")
            ?.addEventListener("click", () => this._limpiarFiltros());

        document.getElementById("fi-anterior-btn")
            ?.addEventListener("click", () => this._irPagina(this._page - 1));

        document.getElementById("fi-siguiente-btn")
            ?.addEventListener("click", () => this._irPagina(this._page + 1));

        document.querySelectorAll(".fi-th-ordenable").forEach(th =>
            th.addEventListener("click", () => this._ordenarPor(th.dataset.campo)));

        document.getElementById("fi-exportar-btn")
            ?.addEventListener("click", () => this._exportar());

        this._loadAll();
    }

    destroy() {
        console.log("FaretInspeccionesController destruido");
    }

    _getFiltros() {
        return {
            fechaDesde: document.getElementById("fi-filtro-fecha-desde")?.value || "",
            fechaHasta: document.getElementById("fi-filtro-fecha-hasta")?.value || "",
            areaControl: document.getElementById("fi-filtro-area")?.value || "",
            operador: document.getElementById("fi-filtro-operador")?.value.trim() || "",
            maquina: document.getElementById("fi-filtro-maquina")?.value.trim() || "",
            presentaDefectos: document.getElementById("fi-filtro-defectos")?.value || "",
        };
    }

    _limpiarFiltros() {
        document.getElementById("fi-filtro-fecha-desde").value = "";
        document.getElementById("fi-filtro-fecha-hasta").value = "";
        document.getElementById("fi-filtro-area").value = "";
        document.getElementById("fi-filtro-operador").value = "";
        document.getElementById("fi-filtro-maquina").value = "";
        document.getElementById("fi-filtro-defectos").value = "";
        this._page = 1;
        this._loadAll();
    }

    _irPagina(pagina) {
        if (pagina < 1) return;
        this._page = pagina;
        this._loadLista();
    }

    async _loadAll() {
        await Promise.all([this._loadResumen(), this._loadLista()]);
    }

    async _loadResumen() {
        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.inspecciones.resumen",
                ...this._getFiltros(),
            });

            this._renderResumen(res.ok ? res.data : null);
        } catch {
            this._renderResumen(null);
        }
    }

    _renderResumen(data) {
        document.getElementById("fi-kpi-hoy").textContent = data?.inspeccionesHoy ?? 0;
        document.getElementById("fi-kpi-periodo").textContent = data?.inspeccionesPeriodo ?? 0;
        document.getElementById("fi-kpi-con-defectos").textContent = data?.conDefectos ?? 0;
        document.getElementById("fi-kpi-sin-defectos").textContent = data?.sinDefectos ?? 0;
    }

    async _loadLista() {
        const loadingEl = document.getElementById("fi-loading");
        const errorEl = document.getElementById("fi-error");

        loadingEl.style.display = "block";
        errorEl.style.display = "none";

        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.inspecciones.list",
                page: this._page,
                pageSize: this._pageSize,
                ...this._getFiltros(),
            });

            if (!res.ok) {
                this._aplicarListaVacia();
                return;
            }

            this._totalCount = res.data.totalCount ?? 0;
            this._page = res.data.page ?? this._page;
            this._items = Array.isArray(res.data.items) ? res.data.items : [];
            this._sortCampo = null;
            this._renderTabla(this._items);
            this._renderPaginacion();
        } catch {
            this._aplicarListaVacia();
        } finally {
            loadingEl.style.display = "none";
        }
    }

    _aplicarListaVacia() {
        this._totalCount = 0;
        this._items = [];
        this._renderTabla([]);
        this._renderPaginacion();
    }

    _ordenarPor(campo) {
        if (!campo || !this._items.length) return;

        this._sortAsc = this._sortCampo === campo ? !this._sortAsc : true;
        this._sortCampo = campo;

        const ordenados = [...this._items].sort((a, b) => {
            const valorA = a[campo] ?? "";
            const valorB = b[campo] ?? "";
            if (valorA < valorB) return this._sortAsc ? -1 : 1;
            if (valorA > valorB) return this._sortAsc ? 1 : -1;
            return 0;
        });

        this._renderTabla(ordenados);
        this._actualizarIconosOrden();
    }

    _actualizarIconosOrden() {
        document.querySelectorAll(".fi-th-ordenable").forEach(th => {
            const activo = th.dataset.campo === this._sortCampo;
            th.classList.toggle("fi-th-activo", activo);
            const icono = th.querySelector(".fi-sort-icon");
            if (icono) icono.textContent = activo ? (this._sortAsc ? "↑" : "↓") : "↕";
        });
    }

    _formatoFecha(fecha) {
        return fecha ? new Date(fecha).toLocaleDateString("es-CL") : "-";
    }

    _defectosBadge(presentaDefectos) {
        return presentaDefectos
            ? `<span style="color:#B91C1C;font-weight:600;">Sí</span>`
            : `<span style="color:#059669;font-weight:600;">No</span>`;
    }

    _renderTabla(items) {
        const tbody = document.getElementById("fi-tbody");

        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="10">${this._emptyStateHtml()}</td></tr>`;
            return;
        }

        tbody.innerHTML = items.map(i => `
            <tr>
                <td>${this._formatoFecha(i.fechaRegistro)}</td>
                <td>${i.horaRegistro ?? "-"}</td>
                <td>${i.nvFaret ?? "-"}</td>
                <td>${i.areaControl ?? "-"}</td>
                <td>${i.operador === "Otros" ? (i.operadorOtro || "Otros") : (i.operador ?? "-")}</td>
                <td>${i.maquina ?? "-"}</td>
                <td>${this._defectosBadge(i.presentaDefectos)}</td>
                <td>${i.defectos ?? "-"}</td>
                <td>${i.accionCorrectiva ?? "-"}</td>
                <td>${i.cantidadAdjuntos ?? 0}</td>
            </tr>
        `).join("");
    }

    _emptyStateHtml() {
        return `
            <div class="fi-empty-state">
                <div class="fi-empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 15h3M8 18h5"/></svg>
                </div>
                <div class="fi-empty-state-title">No hay inspecciones para los filtros aplicados</div>
                <div class="fi-empty-state-subtitle">Las inspecciones enviadas desde la aplicación móvil FARET (formulario Calidad/Producción) aparecerán aquí.</div>
            </div>
        `;
    }

    _renderPaginacion() {
        const totalPaginas = Math.max(1, Math.ceil(this._totalCount / this._pageSize));
        document.getElementById("fi-pagina-info").textContent = `Página ${this._page} de ${totalPaginas}`;
        document.getElementById("fi-anterior-btn").disabled = this._page <= 1;
        document.getElementById("fi-siguiente-btn").disabled =
            this._page >= totalPaginas || this._totalCount === 0;
    }

    _hayFiltrosActivos() {
        const f = this._getFiltros();
        return Object.values(f).some(v => String(v || "").trim() !== "");
    }

    async _exportar() {
        if (this._hayFiltrosActivos()) {
            window.ExcelExporter.exportTable({
                tableSelector: "#fi-tabla",
                fileName: `faret_inspecciones_${Date.now()}.xlsx`,
                sheetName: "Inspecciones",
                title: "QCC Faret - Inspecciones"
            });
            return;
        }

        const items = await this._traerTodosLosRegistros();
        this._exportarRegistrosDesdeDatos(items);
    }

    async _traerTodosLosRegistros() {
        const pageSize = 500;
        let page = 1;
        let total = Infinity;
        const items = [];

        while (items.length < total && page <= 200) {
            const res = await window.PhotinoBridge.send({
                action: "faret.inspecciones.list",
                page,
                pageSize,
                ...this._getFiltros(),
            });

            if (!res.ok) break;

            const lote = Array.isArray(res.data.items) ? res.data.items : [];
            if (!lote.length) break;

            items.push(...lote);
            total = res.data.totalCount ?? items.length;
            page++;
        }

        return items;
    }

    _exportarRegistrosDesdeDatos(items) {
        const tabla = document.createElement("table");
        tabla.id = "fi-tabla-export-temp";
        tabla.style.position = "absolute";
        tabla.style.left = "-99999px";
        tabla.style.top = "0";

        tabla.innerHTML = `
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Hora</th>
                    <th>NV Faret</th>
                    <th>Área de control</th>
                    <th>Operador</th>
                    <th>Máquina</th>
                    <th>¿Defectos?</th>
                    <th>Defectos</th>
                    <th>Acción correctiva</th>
                    <th>Adjuntos</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(i => `
                    <tr>
                        <td>${this._formatoFecha(i.fechaRegistro)}</td>
                        <td>${i.horaRegistro ?? "-"}</td>
                        <td>${i.nvFaret ?? "-"}</td>
                        <td>${i.areaControl ?? "-"}</td>
                        <td>${i.operador === "Otros" ? (i.operadorOtro || "Otros") : (i.operador ?? "-")}</td>
                        <td>${i.maquina ?? "-"}</td>
                        <td>${i.presentaDefectos ? "Sí" : "No"}</td>
                        <td>${i.defectos ?? "-"}</td>
                        <td>${i.accionCorrectiva ?? "-"}</td>
                        <td>${i.cantidadAdjuntos ?? 0}</td>
                    </tr>
                `).join("")}
            </tbody>
        `;

        document.body.appendChild(tabla);

        window.ExcelExporter.exportTable({
            tableSelector: "#fi-tabla-export-temp",
            fileName: `faret_inspecciones_todos_${Date.now()}.xlsx`,
            sheetName: "Inspecciones",
            title: "QCC Faret - Inspecciones"
        });

        tabla.remove();
    }
};
