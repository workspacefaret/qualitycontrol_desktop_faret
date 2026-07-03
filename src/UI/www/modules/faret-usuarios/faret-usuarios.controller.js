window.FaretUsuariosController = class FaretUsuariosController {

    init() {
        console.log("FaretUsuariosController iniciado");

        document.getElementById("fu-refresh-btn")
            ?.addEventListener("click", () => this._loadLista());

        document.getElementById("fu-nuevo-btn")
            ?.addEventListener("click", () => this._toggleForm(true));

        document.getElementById("fu-cancelar-btn")
            ?.addEventListener("click", () => this._toggleForm(false));

        document.getElementById("fu-crear-btn")
            ?.addEventListener("click", () => this._crear());

        document.getElementById("fu-exportar-btn")
            ?.addEventListener("click", () => this._exportar());

        this._loadLista();
    }

    destroy() {
        console.log("FaretUsuariosController destruido");
    }

    _toggleForm(mostrar) {
        document.getElementById("fu-form-card").style.display = mostrar ? "block" : "none";
        document.getElementById("fu-form-error").style.display = "none";
        if (mostrar) {
            document.getElementById("fu-form-username").value = "";
            document.getElementById("fu-form-nombre").value = "";
            document.getElementById("fu-form-rol").value = "CONSULTA";
        }
    }

    _showMensaje(texto, ok) {
        const el = document.getElementById("fu-mensaje");
        el.textContent = texto;
        el.style.display = "block";
        el.style.background = ok ? "#ECFDF5" : "#FEF2F2";
        el.style.color = ok ? "#065F46" : "#991B1B";
        el.style.borderLeftColor = ok ? "#10B981" : "#EF4444";
        setTimeout(() => { el.style.display = "none"; }, 4000);
    }

    async _crear() {
        const username = document.getElementById("fu-form-username")?.value.trim();
        const nombre = document.getElementById("fu-form-nombre")?.value.trim();
        const rol = document.getElementById("fu-form-rol")?.value;
        const errorEl = document.getElementById("fu-form-error");
        const crearBtn = document.getElementById("fu-crear-btn");

        errorEl.style.display = "none";

        if (!username || !nombre) {
            errorEl.textContent = "RUT/Usuario y Nombre son obligatorios";
            errorEl.style.display = "block";
            return;
        }

        crearBtn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.usuarios.create",
                username,
                nombre,
                rol,
            });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al crear el usuario";
                errorEl.style.display = "block";
                return;
            }

            this._toggleForm(false);
            this._showMensaje(`Usuario "${nombre}" creado con clave inicial Faret2026`, true);
            this._loadLista();
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            crearBtn.disabled = false;
        }
    }

    async _loadLista() {
        const loadingEl = document.getElementById("fu-loading");
        const errorEl = document.getElementById("fu-error");
        const tbody = document.getElementById("fu-tbody");

        loadingEl.style.display = "block";
        errorEl.style.display = "none";

        try {
            const res = await window.PhotinoBridge.send({ action: "faret.usuarios.list" });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al cargar los usuarios";
                errorEl.style.display = "block";
                tbody.innerHTML = `<tr><td colspan="7" class="faret-empty">Sin datos</td></tr>`;
                return;
            }

            this._renderTabla(Array.isArray(res.data) ? res.data : []);
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
            tbody.innerHTML = `<tr><td colspan="7" class="faret-empty">Sin datos</td></tr>`;
        } finally {
            loadingEl.style.display = "none";
        }
    }

    _renderTabla(usuarios) {
        const tbody = document.getElementById("fu-tbody");

        if (!usuarios.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="faret-empty">Sin usuarios registrados</td></tr>`;
            return;
        }

        tbody.innerHTML = usuarios.map(u => `
            <tr>
                <td>${u.id ?? "-"}</td>
                <td>${u.username ?? u.correo ?? "-"}</td>
                <td>${u.nombre ?? "-"}</td>
                <td>${u.rol ?? "-"}</td>
                <td>${u.activo ? "Activo" : "Inactivo"}</td>
                <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString("es-CL") : "-"}</td>
                <td>
                    <button class="btn-secondary fu-reset-btn" data-id="${u.id}" data-nombre="${u.nombre ?? ""}">Restablecer clave</button>
                    <button class="btn-secondary fu-toggle-btn" data-id="${u.id}" data-activo="${u.activo ? "1" : "0"}" data-nombre="${u.nombre ?? ""}">
                        ${u.activo ? "Desactivar" : "Activar"}
                    </button>
                </td>
            </tr>
        `).join("");

        tbody.querySelectorAll(".fu-reset-btn").forEach(btn =>
            btn.addEventListener("click", () => this._resetPassword(btn.dataset.id, btn.dataset.nombre)));

        tbody.querySelectorAll(".fu-toggle-btn").forEach(btn =>
            btn.addEventListener("click", () => this._toggleActivo(btn.dataset.id, btn.dataset.activo === "1", btn.dataset.nombre)));
    }

    async _resetPassword(id, nombre) {
        const confirmado = window.confirm(`¿Restablecer la contraseña de "${nombre}" a Faret2026?`);
        if (!confirmado) return;

        try {
            const res = await window.PhotinoBridge.send({ action: "faret.usuarios.resetPassword", id: Number(id) });
            if (!res.ok) {
                this._showMensaje(res.error || "Error al restablecer la contraseña", false);
                return;
            }
            this._showMensaje(`Contraseña de "${nombre}" restablecida a Faret2026`, true);
        } catch {
            this._showMensaje("Error de comunicación con el backend", false);
        }
    }

    async _toggleActivo(id, activo, nombre) {
        const accion = activo ? "desactivar" : "activar";
        const confirmado = window.confirm(`¿Seguro que deseas ${accion} a "${nombre}"?`);
        if (!confirmado) return;

        try {
            const action = activo ? "faret.usuarios.desactivar" : "faret.usuarios.activar";
            const res = await window.PhotinoBridge.send({ action, id: Number(id) });
            if (!res.ok) {
                this._showMensaje(res.error || `Error al ${accion} el usuario`, false);
                return;
            }
            this._showMensaje(`Usuario "${nombre}" ${activo ? "desactivado" : "activado"}`, true);
            this._loadLista();
        } catch {
            this._showMensaje("Error de comunicación con el backend", false);
        }
    }

    _exportar() {
        window.ExcelExporter.exportTable({
            tableSelector: "#fu-tabla",
            fileName: `faret_usuarios_${Date.now()}.xlsx`,
            sheetName: "Usuarios",
            title: "QCC Faret - Gestión de Usuarios"
        });
    }
};
