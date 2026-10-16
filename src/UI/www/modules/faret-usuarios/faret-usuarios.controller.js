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

        this._filasFijas = window.TableUtils.init(
            document.getElementById("fu-tabla"),
            document.getElementById("fu-filas-fijadas")
        );

        this._loadLista();
    }

    destroy() {
        window.PermisosMatriz?.cerrar();
        console.log("FaretUsuariosController destruido");
    }

    _toggleForm(mostrar) {
        document.getElementById("fu-form-card").style.display = mostrar ? "block" : "none";
        document.getElementById("fu-form-error").style.display = "none";
        if (mostrar) {
            document.getElementById("fu-form-username").value = "";
            document.getElementById("fu-form-nombre").value = "";
            document.getElementById("fu-form-rol").value = "CONSULTA";
            const pass = document.getElementById("fu-form-password");
            if (pass) pass.value = "";
        }
    }

    // Política de contraseñas (campos camelCase de la API qualitycontrol Faret).
    _estadoClave(u) {
        if (u.passwordSinVencimiento) {
            return `<span title="Cuenta exenta de vencimiento">Sin vencimiento</span>`;
        }
        if (u.debeCambiarPassword) {
            return `<span style="color:#B45309; font-weight:600;" title="Clave temporal, nunca cambiada o vencida: deberá definir una nueva al ingresar">Debe cambiarla</span>`;
        }
        if (u.passwordVenceEl) {
            return `Vence ${window.DateUtils.formatear(u.passwordVenceEl)}`;
        }
        return "-";
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
        const password = document.getElementById("fu-form-password")?.value || "";
        const errorEl = document.getElementById("fu-form-error");
        const crearBtn = document.getElementById("fu-crear-btn");

        errorEl.style.display = "none";

        if (!username || !nombre) {
            errorEl.textContent = "RUT/Usuario y Nombre son obligatorios";
            errorEl.style.display = "block";
            return;
        }

        if (password.length < 8) {
            errorEl.textContent = "La clave temporal debe tener al menos 8 caracteres";
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
                password,
            });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al crear el usuario";
                errorEl.style.display = "block";
                return;
            }

            this._toggleForm(false);
            this._showMensaje(`Usuario "${nombre}" creado: deberá cambiar la clave temporal en su primer ingreso`, true);
            this._loadLista();
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            crearBtn.disabled = false;
        }
    }

    async _loadLista() {
        const contenedor = document.getElementById("fu-tabla")?.closest(".table-container");
        await window.TableUtils.preservarScroll(contenedor, () => this._loadListaInterna());
    }

    async _loadListaInterna() {
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
                tbody.innerHTML = `<tr><td colspan="8" class="faret-empty">Sin datos</td></tr>`;
                return;
            }

            this._renderTabla(Array.isArray(res.data) ? res.data : []);
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
            tbody.innerHTML = `<tr><td colspan="8" class="faret-empty">Sin datos</td></tr>`;
        } finally {
            loadingEl.style.display = "none";
        }
    }

    _renderTabla(usuarios) {
        const tbody = document.getElementById("fu-tbody");

        if (!usuarios.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="faret-empty">Sin usuarios registrados</td></tr>`;
            this._filasFijas?.refrescar();
            return;
        }

        tbody.innerHTML = usuarios.map(u => `
            <tr data-id="${u.id}">
                <td>${u.id ?? "-"}</td>
                <td>${u.username ?? u.correo ?? "-"}</td>
                <td>${u.nombre ?? "-"}</td>
                <td>
                    <select class="fu-rol-select" data-id="${u.id}" data-rol-actual="${u.rol ?? ""}">
                        ${["ADMIN_TI", "ADMIN", "CALIDAD", "INSPECTOR", "CONSULTA"].map(r =>
                            `<option value="${r}" ${u.rol === r ? "selected" : ""}>${r}</option>`
                        ).join("")}
                    </select>
                </td>
                <td>${u.activo ? "Activo" : "Inactivo"}</td>
                <td>${this._estadoClave(u)}</td>
                <td>${window.DateUtils.formatear(u.createdAt)}</td>
                <td>
                    <button class="btn-secondary fu-reset-btn" data-id="${u.id}" data-nombre="${u.nombre ?? ""}">Restablecer clave</button>
                    <button class="btn-secondary fu-permisos-btn" data-id="${u.id}" data-nombre="${u.nombre ?? ""}" data-rol="${u.rol ?? ""}">Permisos</button>
                    <button class="btn-secondary fu-toggle-btn" data-id="${u.id}" data-activo="${u.activo ? "1" : "0"}" data-nombre="${u.nombre ?? ""}">
                        ${u.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button class="btn-secondary fu-eliminar-btn" title="Eliminar definitivamente" data-id="${u.id}" data-nombre="${u.nombre ?? ""}" data-codigo="${u.username ?? u.correo ?? ""}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#B91C1C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg></button>
                </td>
            </tr>
        `).join("");

        this._filasFijas?.refrescar();

        tbody.querySelectorAll(".fu-rol-select").forEach(sel =>
            sel.addEventListener("change", () => this._cambiarRol(sel)));

        tbody.querySelectorAll(".fu-reset-btn").forEach(btn =>
            btn.addEventListener("click", () => this._resetPassword(btn.dataset.id, btn.dataset.nombre)));

        tbody.querySelectorAll(".fu-eliminar-btn").forEach(btn =>
            btn.addEventListener("click", () => this._eliminarDefinitivo(btn.dataset.id, btn.dataset.codigo, btn.dataset.nombre)));

        tbody.querySelectorAll(".fu-permisos-btn").forEach(btn =>
            btn.addEventListener("click", () => this._abrirPermisos(btn.dataset.id, btn.dataset.nombre, btn.dataset.rol)));

        tbody.querySelectorAll(".fu-toggle-btn").forEach(btn =>
            btn.addEventListener("click", () => this._toggleActivo(btn.dataset.id, btn.dataset.activo === "1", btn.dataset.nombre)));
    }

    async _cambiarRol(selectEl) {
        const id = selectEl.dataset.id;
        const nuevoRol = selectEl.value;
        const rolAnterior = selectEl.dataset.rolActual;

        if (nuevoRol === rolAnterior) return;

        const confirmado = window.confirm(`¿Cambiar el rol a "${nuevoRol}"?`);
        if (!confirmado) {
            selectEl.value = rolAnterior;
            return;
        }

        selectEl.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.usuarios.cambiarRol",
                id: Number(id),
                rol: nuevoRol,
            });

            if (!res.ok) {
                this._showMensaje(res.error || "Error al cambiar el rol", false);
                selectEl.value = rolAnterior;
                return;
            }

            selectEl.dataset.rolActual = nuevoRol;
            const permisosBtn = selectEl.closest("tr")?.querySelector(".fu-permisos-btn");
            if (permisosBtn) permisosBtn.dataset.rol = nuevoRol;
            this._showMensaje(`Rol actualizado a "${nuevoRol}"`, true);
        } catch {
            this._showMensaje("Error de comunicación con el backend", false);
            selectEl.value = rolAnterior;
        } finally {
            selectEl.disabled = false;
        }
    }

    // Clave temporal escrita por el ADMIN_TI (antes era siempre "Faret2026"): el usuario deberá
    // definir la suya en el próximo ingreso (política de contraseñas).
    async _resetPassword(id, nombre) {
        const temporal = window.prompt(`Clave temporal para "${nombre}" (mínimo 8 caracteres):`);
        if (temporal === null) return;

        const password = temporal.trim();
        if (password.length < 8) {
            this._showMensaje("La clave temporal debe tener al menos 8 caracteres", false);
            return;
        }

        const confirmado = window.confirm(`¿Restablecer la contraseña de "${nombre}"? Deberá cambiarla en su próximo ingreso.`);
        if (!confirmado) return;

        try {
            const res = await window.PhotinoBridge.send({ action: "faret.usuarios.resetPassword", id: Number(id), password });
            if (!res.ok) {
                this._showMensaje(res.error || "Error al restablecer la contraseña", false);
                return;
            }
            this._showMensaje(`Contraseña temporal asignada a "${nombre}": deberá cambiarla al ingresar`, true);
            this._loadLista();
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

    // Borrado físico: la API solo lo permite si el usuario no tiene historial (si lo tiene, avisa
    // que hay que desactivarlo). Doble confirmación: aviso + escribir el RUT/usuario.
    async _eliminarDefinitivo(id, codigo, nombre) {
        const confirmado = window.confirm(
            `¿Eliminar DEFINITIVAMENTE a "${nombre}"?\n\n` +
            "Esta acción no se puede deshacer. Solo es posible si el usuario no tiene registros asociados; " +
            "si los tiene, desactívalo."
        );
        if (!confirmado) return;

        const escrito = window.prompt(`Para confirmar, escribe el RUT / usuario: ${codigo}`);
        if (escrito === null) return;
        if (escrito.trim() !== codigo) {
            this._showMensaje("El RUT / usuario no coincide: no se eliminó el usuario", false);
            return;
        }

        try {
            const res = await window.PhotinoBridge.send({ action: "faret.usuarios.eliminarDefinitivo", id: Number(id) });
            if (!res.ok) {
                this._showMensaje(res.error || "Error al eliminar el usuario", false);
                return;
            }
            this._showMensaje(`Usuario "${nombre}" eliminado definitivamente`, true);
            this._loadLista();
        } catch {
            this._showMensaje("Error de comunicación con el backend", false);
        }
    }

    _abrirPermisos(id, nombre, rol) {
        const usuarioId = Number(id);

        window.PermisosMatriz.abrir({
            nombre,
            rol,
            empresa: "FARET",
            cargar: () => window.PhotinoBridge.send({ action: "faret.usuarios.permisos.get", id: usuarioId, rol }),
            guardar: permisos => window.PhotinoBridge.send({ action: "faret.usuarios.permisos.guardar", id: usuarioId, permisos }),
            restablecer: () => window.PhotinoBridge.send({ action: "faret.usuarios.permisos.restablecer", id: usuarioId }),
        });
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
