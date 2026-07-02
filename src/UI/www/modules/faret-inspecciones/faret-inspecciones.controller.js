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

        this._loadAll();
    }

    destroy() {
        console.log("FaretInspeccionesController destruido");
    }

    _getFiltros() {
        return {
            fechaDesde: document.getElementById("fi-filtro-fecha-desde")?.value || "",
            fechaHasta: document.getElementById("fi-filtro-fecha-hasta")?.value || "",
            area: document.getElementById("fi-filtro-area")?.value.trim() || "",
            inspector: document.getElementById("fi-filtro-inspector")?.value.trim() || "",
            estado: document.getElementById("fi-filtro-estado")?.value || "",
            cliente: document.getElementById("fi-filtro-cliente")?.value.trim() || "",
        };
    }

    _limpiarFiltros() {
        document.getElementById("fi-filtro-fecha-desde").value = "";
        document.getElementById("fi-filtro-fecha-hasta").value = "";
        document.getElementById("fi-filtro-area").value = "";
        document.getElementById("fi-filtro-inspector").value = "";
        document.getElementById("fi-filtro-estado").value = "";
        document.getElementById("fi-filtro-cliente").value = "";
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

    // La API de Inspecciones todavía no existe (la app Flutter FARET que enviará estos
    // registros está en desarrollo): cualquier error se trata como "sin datos todavía",
    // nunca como una falla visible ni con datos inventados.
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
        document.getElementById("fi-kpi-semana").textContent = data?.inspeccionesSemana ?? 0;
        document.getElementById("fi-kpi-pendientes").textContent = data?.pendientesRevision ?? 0;
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

    _renderTabla(items) {
        const tbody = document.getElementById("fi-tbody");

        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="11">${this._emptyStateHtml()}</td></tr>`;
            return;
        }

        tbody.innerHTML = items.map(i => `
            <tr>
                <td>${i.fecha ? new Date(i.fecha).toLocaleDateString("es-CL") : "-"}</td>
                <td>${i.inspector ?? "-"}</td>
                <td>${i.cliente ?? "-"}</td>
                <td>${i.nv ?? "-"}</td>
                <td>${i.proceso ?? "-"}</td>
                <td>${i.area ?? "-"}</td>
                <td>${i.maquina ?? "-"}</td>
                <td>${i.resultado ?? "-"}</td>
                <td>${i.estado ?? "-"}</td>
                <td>${i.cantidadDefectos ?? "-"}</td>
                <td><button class="btn-ghost" disabled title="Próximamente">Ver</button></td>
            </tr>
        `).join("");
    }

    _emptyStateHtml() {
        return `
            <div class="fi-empty-state">
                <div class="fi-empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 15h3M8 18h5"/></svg>
                </div>
                <div class="fi-empty-state-title">No existen inspecciones disponibles</div>
                <div class="fi-empty-state-subtitle">Las inspecciones enviadas desde la aplicación móvil FARET aparecerán aquí.</div>
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
};
