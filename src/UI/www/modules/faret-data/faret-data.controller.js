window.FaretDataController = class FaretDataController {

    init() {
        console.log("FaretDataController iniciado");

        this._page = 1;
        this._pageSize = 50;
        this._totalCount = 0;

        document.getElementById("fd-refresh-btn")
            ?.addEventListener("click", () => this._loadAll());

        document.getElementById("fd-filtrar-btn")
            ?.addEventListener("click", () => { this._page = 1; this._loadAll(); });

        document.getElementById("fd-limpiar-btn")
            ?.addEventListener("click", () => this._limpiarFiltros());

        document.getElementById("fd-anterior-btn")
            ?.addEventListener("click", () => this._irPagina(this._page - 1));

        document.getElementById("fd-siguiente-btn")
            ?.addEventListener("click", () => this._irPagina(this._page + 1));

        this._loadAll();
    }

    destroy() {
        console.log("FaretDataController destruido");
    }

    _getFiltros() {
        return {
            cliente: document.getElementById("fd-filtro-cliente")?.value.trim() || "",
            tipoPnc: document.getElementById("fd-filtro-tipo-pnc")?.value.trim() || "",
            nivel: document.getElementById("fd-filtro-nivel")?.value || "",
            fechaDesde: document.getElementById("fd-filtro-fecha-desde")?.value || "",
            fechaHasta: document.getElementById("fd-filtro-fecha-hasta")?.value || "",
        };
    }

    _limpiarFiltros() {
        document.getElementById("fd-filtro-cliente").value = "";
        document.getElementById("fd-filtro-tipo-pnc").value = "";
        document.getElementById("fd-filtro-nivel").value = "";
        document.getElementById("fd-filtro-fecha-desde").value = "";
        document.getElementById("fd-filtro-fecha-hasta").value = "";
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
                action: "faret.data.resumen",
                ...this._getFiltros(),
            });

            if (!res.ok) return;
            this._renderResumen(res.data);
        } catch {
            // El error de la lista ya se muestra en _loadLista(); el resumen falla en silencio.
        }
    }

    _renderResumen(data) {
        document.getElementById("fd-total-registros").textContent = data.totalRegistros ?? 0;
        document.getElementById("fd-clientes-unicos").textContent = data.clientesUnicos ?? 0;
        document.getElementById("fd-registros-criticos").textContent = data.registrosCriticos ?? 0;
        document.getElementById("fd-ultima-importacion").textContent = data.ultimaImportacion
            ? new Date(data.ultimaImportacion).toLocaleString("es-CL")
            : "-";
    }

    async _loadLista() {
        const loadingEl = document.getElementById("fd-loading");
        const errorEl = document.getElementById("fd-error");
        const tbody = document.getElementById("fd-tbody");

        loadingEl.style.display = "block";
        errorEl.style.display = "none";

        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.data.list",
                page: this._page,
                pageSize: this._pageSize,
                ...this._getFiltros(),
            });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al cargar los registros";
                errorEl.style.display = "block";
                tbody.innerHTML = `<tr><td colspan="15" class="faret-empty">Sin datos</td></tr>`;
                return;
            }

            this._totalCount = res.data.totalCount ?? 0;
            this._page = res.data.page ?? this._page;
            this._renderTabla(Array.isArray(res.data.items) ? res.data.items : []);
            this._renderPaginacion();
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
            tbody.innerHTML = `<tr><td colspan="15" class="faret-empty">Sin datos</td></tr>`;
        } finally {
            loadingEl.style.display = "none";
        }
    }

    _renderTabla(items) {
        const tbody = document.getElementById("fd-tbody");

        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="15" class="faret-empty">Sin registros</td></tr>`;
            return;
        }

        tbody.innerHTML = items.map(r => `
            <tr>
                <td>${r.id ?? "-"}</td>
                <td>${r.fechaIngreso ? new Date(r.fechaIngreso).toLocaleDateString("es-CL") : "-"}</td>
                <td>${r.npNv ?? "-"}</td>
                <td>${r.cliente ?? "-"}</td>
                <td>${r.codigo ?? "-"}</td>
                <td>${r.producto ?? "-"}</td>
                <td>${r.tipoPnc ?? "-"}</td>
                <td>${r.categoriaDefecto ?? "-"}</td>
                <td>${r.nivel ?? "-"}</td>
                <td>${r.tipoFalla ?? "-"}</td>
                <td>${r.cantRequerida ?? "-"}</td>
                <td>${r.cantRechazada ?? "-"}</td>
                <td>${r.cantRecuperada ?? "-"}</td>
                <td>${r.pctRecuperacion ?? "-"}</td>
                <td>${r.observacion ?? "-"}</td>
            </tr>
        `).join("");
    }

    _renderPaginacion() {
        const totalPaginas = Math.max(1, Math.ceil(this._totalCount / this._pageSize));
        document.getElementById("fd-pagina-info").textContent = `Página ${this._page} de ${totalPaginas}`;
        document.getElementById("fd-anterior-btn").disabled = this._page <= 1;
        document.getElementById("fd-siguiente-btn").disabled = this._page >= totalPaginas;
    }
};
