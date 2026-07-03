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

        document.getElementById("fnc-analisis-cerrar-btn")
            ?.addEventListener("click", () => this._cerrarAnalisis());

        document.getElementById("fnc-analisis-guardar-btn")
            ?.addEventListener("click", () => this._guardarAnalisis());

        document.getElementById("fnc-accion-agregar-btn")
            ?.addEventListener("click", () => this._agregarAccion());

        document.getElementById("fnc-exportar-btn")
            ?.addEventListener("click", () => this._exportar());

        this._ncAnalisisId = null;
        this._analisisActual = null;
        this._acciones = [];

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
                <td>${this._badge(i.severidad, this._colorSeveridad(i.severidad))}</td>
                <td>${i.proceso ?? "-"}</td>
                <td>${this._badge(i.estado, this._colorEstado(i.estado))}</td>
                <td>${i.norma ?? "-"}</td>
                <td>${i.fechaCreacion ? new Date(i.fechaCreacion).toLocaleDateString("es-CL") : "-"}</td>
                <td>
                    <button class="btn-ghost fnc-ver-btn" data-id="${i.id}">Ver</button>
                    <button class="btn-secondary fnc-editar-btn" data-id="${i.id}">Editar</button>
                    <button class="btn-primary fnc-analizar-btn" data-id="${i.id}">Analizar</button>
                </td>
            </tr>
        `).join("");

        tbody.querySelectorAll(".fnc-ver-btn").forEach(btn =>
            btn.addEventListener("click", () => this._verDetalle(btn.dataset.id)));

        tbody.querySelectorAll(".fnc-editar-btn").forEach(btn =>
            btn.addEventListener("click", () => this._abrirFormEditar(btn.dataset.id)));

        tbody.querySelectorAll(".fnc-analizar-btn").forEach(btn =>
            btn.addEventListener("click", () => this._abrirAnalisis(btn.dataset.id)));
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

    _usuarioActual() {
        return sessionStorage.getItem("faretNombreUsuario") || "";
    }

    async _abrirAnalisis(id) {
        const item = this._items.find(i => String(i.id) === String(id));
        if (!item) return;

        this._ncAnalisisId = item.id;
        this._analisisActual = null;
        this._acciones = [];

        document.getElementById("fnc-analisis-titulo").textContent =
            `Análisis y Plan de Acción — ${item.codigo ?? ""}`;
        document.getElementById("fnc-analisis-nc-datos").innerHTML = `
            <div><strong>Código:</strong> ${item.codigo ?? "-"}</div>
            <div><strong>Estado:</strong> ${item.estado ?? "-"}</div>
            <div><strong>Título:</strong> ${item.titulo ?? "-"}</div>
            <div><strong>Severidad:</strong> ${item.severidad ?? "-"}</div>
            <div><strong>Proceso / Área:</strong> ${item.proceso ?? "-"}</div>
            <div><strong>Tipo / Origen:</strong> ${item.tipo ?? "-"} / ${item.origen ?? "-"}</div>
        `;

        document.getElementById("fnc-analisis-error").style.display = "none";
        document.getElementById("fnc-analisis-mensaje").style.display = "none";
        document.getElementById("fnc-analisis-contenido").style.display = "none";
        document.getElementById("fnc-analisis-loading").style.display = "block";
        document.getElementById("fnc-analisis-modal").style.display = "flex";

        await this._cargarAnalisis();
        await this._cargarAcciones();

        document.getElementById("fnc-analisis-loading").style.display = "none";
        document.getElementById("fnc-analisis-contenido").style.display = "block";
    }

    _cerrarAnalisis() {
        document.getElementById("fnc-analisis-modal").style.display = "none";
        this._ncAnalisisId = null;
        this._analisisActual = null;
        this._acciones = [];
    }

    async _cargarAnalisis() {
        const errorEl = document.getElementById("fnc-analisis-error");
        errorEl.style.display = "none";

        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.nc.analisis.get",
                id: Number(this._ncAnalisisId),
            });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al cargar el análisis";
                errorEl.style.display = "block";
                this._analisisActual = null;
            } else {
                // res.data === null → la NC aún no tiene análisis (caso normal, no es error)
                this._analisisActual = res.data || null;
            }
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
            this._analisisActual = null;
        }

        this._renderAnalisisForm();
    }

    _renderAnalisisForm() {
        const a = this._analisisActual;

        document.getElementById("fnc-analisis-metodologia").value = a?.metodologia || "CINCO_PORQUES";
        document.getElementById("fnc-analisis-problema").value = a?.problemaDetectado || "";
        document.getElementById("fnc-analisis-porque1").value = a?.porque1 || "";
        document.getElementById("fnc-analisis-porque2").value = a?.porque2 || "";
        document.getElementById("fnc-analisis-porque3").value = a?.porque3 || "";
        document.getElementById("fnc-analisis-porque4").value = a?.porque4 || "";
        document.getElementById("fnc-analisis-porque5").value = a?.porque5 || "";
        document.getElementById("fnc-analisis-causa-raiz").value = a?.causaRaiz || "";
        document.getElementById("fnc-analisis-conclusion").value = a?.conclusion || "";
    }

    async _guardarAnalisis() {
        const errorEl = document.getElementById("fnc-analisis-error");
        const guardarBtn = document.getElementById("fnc-analisis-guardar-btn");
        errorEl.style.display = "none";

        const payload = {
            metodologia: document.getElementById("fnc-analisis-metodologia").value,
            problemaDetectado: document.getElementById("fnc-analisis-problema").value.trim(),
            porque1: document.getElementById("fnc-analisis-porque1").value.trim(),
            porque2: document.getElementById("fnc-analisis-porque2").value.trim(),
            porque3: document.getElementById("fnc-analisis-porque3").value.trim(),
            porque4: document.getElementById("fnc-analisis-porque4").value.trim(),
            porque5: document.getElementById("fnc-analisis-porque5").value.trim(),
            causaRaiz: document.getElementById("fnc-analisis-causa-raiz").value.trim(),
            conclusion: document.getElementById("fnc-analisis-conclusion").value.trim(),
        };

        if (!payload.problemaDetectado) {
            errorEl.textContent = "El problema detectado es obligatorio";
            errorEl.style.display = "block";
            return;
        }

        if (!confirm("¿Guardar el análisis de causa raíz de esta no conformidad?")) return;

        const existeAnalisis = !!this._analisisActual;
        const usuario = this._usuarioActual();

        guardarBtn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.nc.analisis.guardar",
                id: Number(this._ncAnalisisId),
                existeAnalisis,
                ...(existeAnalisis ? { actualizadoPor: usuario } : { creadoPor: usuario }),
                ...payload,
            });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al guardar el análisis";
                errorEl.style.display = "block";
                return;
            }

            await this._cargarAnalisis();
            this._showAnalisisMensaje("Análisis guardado correctamente", true);
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            guardarBtn.disabled = false;
        }
    }

    async _cargarAcciones() {
        const loadingEl = document.getElementById("fnc-acciones-loading");
        loadingEl.style.display = "block";

        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.nc.acciones.list",
                id: Number(this._ncAnalisisId),
            });

            this._acciones = res.ok && Array.isArray(res.data) ? res.data : [];
        } catch {
            this._acciones = [];
        } finally {
            loadingEl.style.display = "none";
        }

        this._renderAcciones();
    }

    _renderAcciones() {
        const tbody = document.getElementById("fnc-acciones-tbody");

        if (!this._acciones.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="faret-empty">Sin acciones correctivas</td></tr>`;
            return;
        }

        const estados = ["PENDIENTE", "EN_PROCESO", "COMPLETADA", "CANCELADA"];

        tbody.innerHTML = this._acciones.map(a => `
            <tr>
                <td>${a.descripcion ?? "-"}</td>
                <td>${a.responsable ?? "-"}</td>
                <td>${a.fechaLimite ? a.fechaLimite.substring(0, 10) : "-"}</td>
                <td>${a.prioridad ?? "-"}</td>
                <td>
                    <select class="fnc-accion-estado-select" data-id="${a.id}">
                        ${estados.map(e => `<option value="${e}" ${e === a.estado ? "selected" : ""}>${e}</option>`).join("")}
                    </select>
                </td>
                <td>${a.integracionTareasEstado ?? "-"}</td>
                <td>
                    <button class="btn-secondary fnc-accion-guardar-estado-btn" data-id="${a.id}">Guardar</button>
                </td>
            </tr>
        `).join("");

        tbody.querySelectorAll(".fnc-accion-guardar-estado-btn").forEach(btn =>
            btn.addEventListener("click", () => this._actualizarEstadoAccion(btn.dataset.id)));
    }

    async _agregarAccion() {
        const errorEl = document.getElementById("fnc-accion-form-error");
        const agregarBtn = document.getElementById("fnc-accion-agregar-btn");
        errorEl.style.display = "none";

        const payload = {
            descripcion: document.getElementById("fnc-accion-descripcion").value.trim(),
            responsable: document.getElementById("fnc-accion-responsable").value.trim(),
            fechaLimite: document.getElementById("fnc-accion-fecha-limite").value,
            prioridad: document.getElementById("fnc-accion-prioridad").value || null,
        };

        if (!payload.descripcion || !payload.responsable || !payload.fechaLimite) {
            errorEl.textContent = "Descripción, responsable y fecha límite son obligatorios";
            errorEl.style.display = "block";
            return;
        }

        if (!confirm("¿Agregar esta acción correctiva a la no conformidad?")) return;

        agregarBtn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.nc.acciones.crear",
                id: Number(this._ncAnalisisId),
                analisisId: this._analisisActual?.id ?? null,
                creadoPor: this._usuarioActual(),
                ...payload,
            });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al agregar la acción";
                errorEl.style.display = "block";
                return;
            }

            document.getElementById("fnc-accion-descripcion").value = "";
            document.getElementById("fnc-accion-responsable").value = "";
            document.getElementById("fnc-accion-fecha-limite").value = "";
            document.getElementById("fnc-accion-prioridad").value = "";

            await this._cargarAcciones();
            this._showAnalisisMensaje("Acción correctiva agregada", true);
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            agregarBtn.disabled = false;
        }
    }

    async _actualizarEstadoAccion(accionId) {
        const accion = this._acciones.find(a => String(a.id) === String(accionId));
        if (!accion) return;

        const select = document.querySelector(`.fnc-accion-estado-select[data-id="${accionId}"]`);
        const nuevoEstado = select ? select.value : accion.estado;

        if (!confirm(`¿Cambiar el estado de la acción a "${nuevoEstado}"?`)) return;

        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.nc.acciones.actualizar",
                accionId: Number(accionId),
                descripcion: accion.descripcion,
                responsable: accion.responsable,
                fechaLimite: accion.fechaLimite ? accion.fechaLimite.substring(0, 10) : "",
                prioridad: accion.prioridad || null,
                estado: nuevoEstado,
                actualizadoPor: this._usuarioActual(),
            });

            if (!res.ok) {
                this._showAnalisisMensaje(res.error || "Error al actualizar la acción", false);
                return;
            }

            await this._cargarAcciones();
            this._showAnalisisMensaje("Acción correctiva actualizada", true);
        } catch {
            this._showAnalisisMensaje("Error de comunicación con el backend", false);
        }
    }

    _showAnalisisMensaje(texto, ok) {
        const el = document.getElementById("fnc-analisis-mensaje");
        el.textContent = texto;
        el.style.display = "block";
        el.style.background = ok ? "#ECFDF5" : "#FEF2F2";
        el.style.color = ok ? "#065F46" : "#991B1B";
        el.style.borderLeftColor = ok ? "#10B981" : "#EF4444";
        setTimeout(() => { el.style.display = "none"; }, 4000);
    }

    // Solo presentación: no cambia el valor real de severidad/estado, únicamente
    // cómo se muestra en la tabla.
    _badge(texto, color) {
        const valor = texto ?? "-";
        return `<span class="fnc-badge" style="background:${color}1F;color:${color};">${valor}</span>`;
    }

    _colorSeveridad(severidad) {
        const s = (severidad || "").toUpperCase();
        if (s === "ALTA") return "#DC2626";
        if (s === "MEDIA") return "#D97706";
        if (s === "BAJA") return "#059669";
        return "#64748B";
    }

    _colorEstado(estado) {
        return (estado || "").toUpperCase().includes("CERR") ? "#059669" : "#2563EB";
    }

    _exportar() {
        window.ExcelExporter.exportTable({
            tableSelector: "#fnc-tabla",
            fileName: `faret_no_conformidades_${Date.now()}.xlsx`,
            sheetName: "No Conformidades",
            title: "QCC Faret - No Conformidades"
        });
    }
};
