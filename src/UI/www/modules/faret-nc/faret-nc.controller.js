window.FaretNcController = class FaretNcController {

    init() {
        console.log("FaretNcController iniciado");

        this._items = [];
        this._editingId = null;

        document.getElementById("fnc-refresh-btn")
            ?.addEventListener("click", () => this._loadLista());

        document.getElementById("fnc-nuevo-btn")
            ?.addEventListener("click", () => this._abrirFormNuevo());

        document.getElementById("fnc-cancelar-btn")
            ?.addEventListener("click", () => this._cerrarForm());

        document.getElementById("fnc-guardar-btn")
            ?.addEventListener("click", () => this._guardar());

        document.getElementById("fnc-filtrar-btn")
            ?.addEventListener("click", () => this._renderTabla());

        document.getElementById("fnc-limpiar-btn")
            ?.addEventListener("click", () => this._limpiarFiltros());

        document.getElementById("fnc-detalle-cerrar-btn")
            ?.addEventListener("click", () => this._cerrarDetalle());

        this._loadLista();
    }

    destroy() {
        console.log("FaretNcController destruido");
    }

    _getFiltros() {
        return {
            estado: document.getElementById("fnc-filtro-estado")?.value || "",
            proceso: document.getElementById("fnc-filtro-proceso")?.value.trim().toLowerCase() || "",
            fechaDesde: document.getElementById("fnc-filtro-fecha-desde")?.value || "",
            fechaHasta: document.getElementById("fnc-filtro-fecha-hasta")?.value || "",
        };
    }

    _limpiarFiltros() {
        document.getElementById("fnc-filtro-estado").value = "";
        document.getElementById("fnc-filtro-proceso").value = "";
        document.getElementById("fnc-filtro-fecha-desde").value = "";
        document.getElementById("fnc-filtro-fecha-hasta").value = "";
        this._renderTabla();
    }

    async _loadLista() {
        const loadingEl = document.getElementById("fnc-loading");
        const errorEl = document.getElementById("fnc-error");
        const tbody = document.getElementById("fnc-tbody");

        loadingEl.style.display = "block";
        errorEl.style.display = "none";

        try {
            const res = await window.PhotinoBridge.send({ action: "faret.nc.list" });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al cargar las no conformidades";
                errorEl.style.display = "block";
                tbody.innerHTML = `<tr><td colspan="10" class="faret-empty">Sin datos</td></tr>`;
                return;
            }

            this._items = Array.isArray(res.data) ? res.data : [];
            this._actualizarFiltroEstado();
            this._renderTabla();
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
            tbody.innerHTML = `<tr><td colspan="10" class="faret-empty">Sin datos</td></tr>`;
        } finally {
            loadingEl.style.display = "none";
        }
    }

    _actualizarFiltroEstado() {
        const select = document.getElementById("fnc-filtro-estado");
        const actual = select.value;
        const estados = [...new Set(this._items.map(i => i.estado).filter(Boolean))];

        select.innerHTML = `<option value="">Todos</option>` +
            estados.map(e => `<option value="${e}">${e}</option>`).join("");

        if (estados.includes(actual)) select.value = actual;
    }

    _filtrarItems() {
        const f = this._getFiltros();

        return this._items.filter(i => {
            if (f.estado && i.estado !== f.estado) return false;
            if (f.proceso && !(i.proceso || "").toLowerCase().includes(f.proceso)) return false;

            if (i.fechaCreacion) {
                const fecha = i.fechaCreacion.substring(0, 10);
                if (f.fechaDesde && fecha < f.fechaDesde) return false;
                if (f.fechaHasta && fecha > f.fechaHasta) return false;
            }

            return true;
        });
    }

    _renderTabla() {
        const items = this._filtrarItems();
        this._renderResumen(items);

        const tbody = document.getElementById("fnc-tbody");

        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="10" class="faret-empty">Sin no conformidades registradas</td></tr>`;
            return;
        }

        tbody.innerHTML = items.map(i => `
            <tr>
                <td>${i.codigo ?? "-"}</td>
                <td>${i.titulo ?? "-"}</td>
                <td>${i.tipo ?? "-"}</td>
                <td>${i.origen ?? "-"}</td>
                <td>${i.severidad ?? "-"}</td>
                <td>${i.proceso ?? "-"}</td>
                <td>${i.estado ?? "-"}</td>
                <td>${i.norma ?? "-"}</td>
                <td>${i.fechaCreacion ? new Date(i.fechaCreacion).toLocaleDateString("es-CL") : "-"}</td>
                <td>
                    <button class="btn-secondary fnc-ver-btn" data-id="${i.id}">Ver</button>
                    <button class="btn-secondary fnc-editar-btn" data-id="${i.id}">Editar</button>
                </td>
            </tr>
        `).join("");

        tbody.querySelectorAll(".fnc-ver-btn").forEach(btn =>
            btn.addEventListener("click", () => this._verDetalle(btn.dataset.id)));

        tbody.querySelectorAll(".fnc-editar-btn").forEach(btn =>
            btn.addEventListener("click", () => this._abrirFormEditar(btn.dataset.id)));
    }

    _renderResumen(items) {
        const esCerrada = estado => (estado || "").toUpperCase().includes("CERR");
        const esCritica = severidad => ["ALTA", "CRITICA", "CRÍTICA"].includes((severidad || "").toUpperCase());

        document.getElementById("fnc-total").textContent = items.length;
        document.getElementById("fnc-cerradas").textContent = items.filter(i => esCerrada(i.estado)).length;
        document.getElementById("fnc-abiertas").textContent = items.filter(i => !esCerrada(i.estado)).length;
        document.getElementById("fnc-criticas").textContent = items.filter(i => esCritica(i.severidad)).length;
    }

    async _verDetalle(id) {
        const modal = document.getElementById("fnc-detalle-modal");
        const body = document.getElementById("fnc-detalle-body");

        body.innerHTML = "Cargando...";
        modal.style.display = "flex";

        try {
            const res = await window.PhotinoBridge.send({ action: "faret.nc.get", id: Number(id) });

            if (!res.ok) {
                body.innerHTML = `<div class="faret-error">${res.error || "Error al obtener el detalle"}</div>`;
                return;
            }

            const nc = res.data;
            body.innerHTML = `
                <div class="fnc-detalle-grid">
                    <div><strong>Código:</strong> ${nc.codigo ?? "-"}</div>
                    <div><strong>Estado:</strong> ${nc.estado ?? "-"}</div>
                    <div><strong>Tipo:</strong> ${nc.tipo ?? "-"}</div>
                    <div><strong>Origen:</strong> ${nc.origen ?? "-"}</div>
                    <div><strong>Severidad:</strong> ${nc.severidad ?? "-"}</div>
                    <div><strong>Proceso / Área:</strong> ${nc.proceso ?? "-"}</div>
                    <div><strong>Norma:</strong> ${nc.norma ?? "-"}</div>
                    <div><strong>Fecha creación:</strong> ${nc.fechaCreacion ? new Date(nc.fechaCreacion).toLocaleString("es-CL") : "-"}</div>
                </div>
                <div class="fnc-detalle-titulo"><strong>Título:</strong> ${nc.titulo ?? "-"}</div>
                <div class="fnc-detalle-descripcion"><strong>Descripción:</strong><br>${nc.descripcion ?? "-"}</div>
            `;
        } catch {
            body.innerHTML = `<div class="faret-error">Error de comunicación con el backend</div>`;
        }
    }

    _cerrarDetalle() {
        document.getElementById("fnc-detalle-modal").style.display = "none";
    }

    _abrirFormNuevo() {
        this._editingId = null;
        document.getElementById("fnc-form-titulo").textContent = "Nueva No Conformidad";
        document.getElementById("fnc-form-tipo").value = "INTERNA";
        document.getElementById("fnc-form-origen").value = "AUDITORIA_INTERNA";
        document.getElementById("fnc-form-titulo-input").value = "";
        document.getElementById("fnc-form-severidad").value = "ALTA";
        document.getElementById("fnc-form-proceso").value = "";
        document.getElementById("fnc-form-norma").value = "";
        document.getElementById("fnc-form-fecha").value = "";
        document.getElementById("fnc-form-reportado").value = "";
        document.getElementById("fnc-form-responsable").value = "";
        document.getElementById("fnc-form-estado-campo").style.display = "none";
        document.getElementById("fnc-form-nota-estado").style.display = "none";
        document.getElementById("fnc-form-error").style.display = "none";
        document.getElementById("fnc-form-card").style.display = "block";
    }

    _abrirFormEditar(id) {
        const item = this._items.find(i => String(i.id) === String(id));
        if (!item) return;

        this._editingId = item.id;
        document.getElementById("fnc-form-titulo").textContent = `Editar No Conformidad ${item.codigo ?? ""}`;
        document.getElementById("fnc-form-tipo").value = item.tipo ?? "INTERNA";
        document.getElementById("fnc-form-origen").value = item.origen ?? "AUDITORIA_INTERNA";
        document.getElementById("fnc-form-titulo-input").value = item.titulo ?? "";
        document.getElementById("fnc-form-severidad").value = item.severidad ?? "ALTA";
        document.getElementById("fnc-form-proceso").value = item.proceso ?? "";
        document.getElementById("fnc-form-norma").value = item.norma ?? "";
        document.getElementById("fnc-form-fecha").value = item.fechaCreacion ? item.fechaCreacion.substring(0, 10) : "";
        document.getElementById("fnc-form-descripcion").value = item.descripcion ?? "";
        // La API no devuelve "reportadoPor" ni "responsable" al listar/consultar, solo al crear.
        document.getElementById("fnc-form-reportado").value = "";
        document.getElementById("fnc-form-responsable").value = "";
        document.getElementById("fnc-form-estado").value = item.estado ?? "-";
        document.getElementById("fnc-form-estado-campo").style.display = "flex";
        document.getElementById("fnc-form-nota-estado").style.display = "block";
        document.getElementById("fnc-form-error").style.display = "none";
        document.getElementById("fnc-form-card").style.display = "block";
    }

    _cerrarForm() {
        document.getElementById("fnc-form-card").style.display = "none";
        this._editingId = null;
    }

    _showMensaje(texto, ok) {
        const el = document.getElementById("fnc-mensaje");
        el.textContent = texto;
        el.style.display = "block";
        el.style.background = ok ? "#ECFDF5" : "#FEF2F2";
        el.style.color = ok ? "#065F46" : "#991B1B";
        el.style.borderLeftColor = ok ? "#10B981" : "#EF4444";
        setTimeout(() => { el.style.display = "none"; }, 4000);
    }

    async _guardar() {
        const errorEl = document.getElementById("fnc-form-error");
        const guardarBtn = document.getElementById("fnc-guardar-btn");
        errorEl.style.display = "none";

        const payload = {
            tipo: document.getElementById("fnc-form-tipo").value,
            origen: document.getElementById("fnc-form-origen").value.trim(),
            titulo: document.getElementById("fnc-form-titulo-input").value.trim(),
            descripcion: document.getElementById("fnc-form-descripcion").value.trim(),
            severidad: document.getElementById("fnc-form-severidad").value,
            proceso: document.getElementById("fnc-form-proceso").value.trim(),
            norma: document.getElementById("fnc-form-norma").value.trim(),
            reportadoPor: document.getElementById("fnc-form-reportado").value.trim(),
            responsable: document.getElementById("fnc-form-responsable").value.trim(),
            fechaDeteccion: document.getElementById("fnc-form-fecha").value,
        };

        if (!payload.origen || !payload.titulo || !payload.descripcion || !payload.proceso || !payload.fechaDeteccion) {
            errorEl.textContent = "Origen, título, descripción, proceso/área y fecha de detección son obligatorios";
            errorEl.style.display = "block";
            return;
        }

        guardarBtn.disabled = true;
        try {
            const action = this._editingId ? "faret.nc.update" : "faret.nc.create";
            const res = await window.PhotinoBridge.send({
                action,
                ...(this._editingId ? { id: this._editingId } : {}),
                ...payload,
            });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al guardar la no conformidad";
                errorEl.style.display = "block";
                return;
            }

            this._cerrarForm();
            this._showMensaje(this._editingId ? "No conformidad actualizada" : "No conformidad creada", true);
            this._loadLista();
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            guardarBtn.disabled = false;
        }
    }
};
