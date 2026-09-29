window.UsuariosController = class UsuariosController {
    init() {
        console.log("👥 UsuariosController iniciado");

        this.tableBody = document.getElementById("usuarios-table-body");
        this.message = document.getElementById("usuarios-message");

        this.formCard = document.getElementById("usuarios-form-card");

        this.btnNuevoUsuario = document.getElementById("btnNuevoUsuario");
        this.btnGuardarUsuario = document.getElementById("btnGuardarUsuario");
        this.btnCancelarUsuario = document.getElementById("btnCancelarUsuario");

        this.inputCodigo = document.getElementById("nuevoCodigoUsuario");
        this.inputNombre = document.getElementById("nuevoNombreCompleto");
        this.inputPassword = document.getElementById("nuevoPassword");

        this.selectRol = document.getElementById("nuevoRol");
        this.selectActivo = document.getElementById("nuevoActivo");

        this.bindEvents();
        this.loadUsuarios();
    }

    bindEvents() {
        if (this.btnNuevoUsuario) {
            this.btnNuevoUsuario.addEventListener("click", () => {
                this.showForm();
            });
        }

        if (this.btnCancelarUsuario) {
            this.btnCancelarUsuario.addEventListener("click", () => {
                this.hideForm();
            });
        }

        if (this.btnGuardarUsuario) {
            this.btnGuardarUsuario.addEventListener("click", async () => {
                await this.createUsuario();
            });
        }

        const btnExportar = document.getElementById("btnExportarUsuarios");

        if (btnExportar) {
            btnExportar.addEventListener("click", () => {
                if (window.__qccExportingExcel === true) {
                    console.warn("⛔ Exportación ya en curso");
                    return;
                }

                window.__qccExportingExcel = true;

                try {
                    window.ExcelExporter.exportTable({
                        tableSelector: "#tablaUsuarios",
                        fileName: `qcc_usuarios_${Date.now()}.xlsx`,
                        sheetName: "Usuarios",
                        title: "QCC - Gestión de Usuarios"
                    });

                    if (window.showToast) {
                        window.showToast("Excel exportado correctamente", "success");
                    }
                } catch (err) {
                    console.error("❌ Error exportando usuarios:", err);

                    if (window.showToast) {
                        window.showToast("Error exportando Excel", "error");
                    }
                } finally {
                    setTimeout(() => {
                        window.__qccExportingExcel = false;
                    }, 1200);
                }
            });
        }
    }

    async loadUsuarios() {
        try {
            const response = await window.PhotinoBridge.send({
                action: "usuarios.list",
                data: {}
            });

            console.log("👥 usuarios.list response:", response);

            if (!response || response.ok !== true) {
                this.showMessage(
                    response?.error || "No se pudieron cargar los usuarios",
                    false
                );

                this.renderEmpty("Error al cargar usuarios");
                return;
            }

            this.renderTable(response.data || []);
        } catch (error) {
            console.error("❌ Error cargando usuarios:", error);

            this.showMessage(
                "Error de conexión al cargar usuarios",
                false
            );

            this.renderEmpty("Error de conexión");
        }
    }

    renderTable(usuarios) {
        if (!this.tableBody) return;

        if (!usuarios || !usuarios.length) {
            this.renderEmpty("No hay usuarios registrados");
            return;
        }

        console.log("USUARIOS DATA:", usuarios);

        this.tableBody.innerHTML = usuarios.map(usuario => `
            <tr>
                <td>${usuario.Id ?? "-"}</td>

                <td>
                    ${this.escapeHtml(usuario.CodigoUsuario || "-")}
                </td>

                <td>
                    ${this.escapeHtml(usuario.NombreCompleto || "-")}
                </td>

                <td>
                    <select class="usuarios-rol-select" data-id="${usuario.Id}" data-rol-actual="${this.escapeHtml(usuario.Rol || "")}">
                        ${["operador", "admin", "admin_ti"].map(r =>
                            `<option value="${r}" ${usuario.Rol === r ? "selected" : ""}>${r}</option>`
                        ).join("")}
                    </select>
                </td>

                <td>
                    ${usuario.Activo ? "Sí" : "No"}
                </td>

                <td>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button
                            class="btn-primary btn-reset-password"
                            data-id="${usuario.Id}"
                            data-nombre="${this.escapeHtml(
                                usuario.NombreCompleto ||
                                usuario.CodigoUsuario ||
                                ""
                            )}"
                        >
                            Resetear clave
                        </button>

                        <button
                            class="btn-secondary btn-permisos-usuario"
                            data-id="${usuario.Id}"
                            data-rol="${this.escapeHtml(usuario.Rol || "")}"
                            data-nombre="${this.escapeHtml(
                                usuario.NombreCompleto ||
                                usuario.CodigoUsuario ||
                                ""
                            )}"
                        >
                            Permisos
                        </button>

                        <button
                            class="btn-secondary btn-activo-usuario"
                            data-id="${usuario.Id}"
                            data-activo="${usuario.Activo ? "1" : "0"}"
                            data-nombre="${this.escapeHtml(
                                usuario.NombreCompleto ||
                                usuario.CodigoUsuario ||
                                ""
                            )}"
                        >
                            ${usuario.Activo ? "Desactivar" : "Activar"}
                        </button>
                        <button
                            class="btn-secondary btn-eliminar-definitivo"
                            title="Eliminar definitivamente"
                            data-id="${usuario.Id}"
                            data-codigo="${this.escapeHtml(usuario.CodigoUsuario || "")}"
                            data-nombre="${this.escapeHtml(
                                usuario.NombreCompleto ||
                                usuario.CodigoUsuario ||
                                ""
                            )}"
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#B91C1C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join("");

        this.bindTableEvents();
    }

    bindTableEvents() {
        const resetButtons =
            this.tableBody.querySelectorAll(".btn-reset-password");

        const activoButtons =
            this.tableBody.querySelectorAll(".btn-activo-usuario");

        const permisosButtons =
            this.tableBody.querySelectorAll(".btn-permisos-usuario");

        const rolSelects =
            this.tableBody.querySelectorAll(".usuarios-rol-select");

        const eliminarButtons =
            this.tableBody.querySelectorAll(".btn-eliminar-definitivo");

        resetButtons.forEach(btn => {
            btn.addEventListener("click", async () => {
                const id = btn.getAttribute("data-id");

                const nombre =
                    btn.getAttribute("data-nombre") || "este usuario";

                await this.resetPassword(id, nombre);
            });
        });

        activoButtons.forEach(btn => {
            btn.addEventListener("click", async () => {
                const id = btn.getAttribute("data-id");
                const activo = btn.getAttribute("data-activo") === "1";

                const nombre =
                    btn.getAttribute("data-nombre") || "este usuario";

                await this.toggleActivo(id, activo, nombre);
            });
        });

        permisosButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                this.abrirPermisos(
                    btn.getAttribute("data-id"),
                    btn.getAttribute("data-nombre") || "este usuario",
                    btn.getAttribute("data-rol") || ""
                );
            });
        });

        eliminarButtons.forEach(btn => {
            btn.addEventListener("click", async () => {
                await this.eliminarDefinitivo(
                    btn.getAttribute("data-id"),
                    btn.getAttribute("data-codigo") || "",
                    btn.getAttribute("data-nombre") || "este usuario"
                );
            });
        });

        rolSelects.forEach(sel => {
            sel.addEventListener("change", async () => {
                await this.cambiarRol(sel);
            });
        });
    }

    renderEmpty(text) {
        if (!this.tableBody) return;

        this.tableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; opacity:0.6;">
                    ${this.escapeHtml(text)}
                </td>
            </tr>
        `;
    }

    async createUsuario() {
        const codigoUsuario =
            this.inputCodigo?.value.trim() || "";

        const nombreCompleto =
            this.inputNombre?.value.trim() || "";

        const password =
            this.inputPassword?.value || "";

        const rol =
            this.selectRol?.value || "operador";

        const activo =
            this.selectActivo?.value === "true";

        if (!codigoUsuario || !nombreCompleto || !password) {
            this.showMessage(
                "Completa todos los campos obligatorios",
                false
            );
            return;
        }

        if (password.length < 6) {
            this.showMessage(
                "La contraseña debe tener al menos 6 caracteres",
                false
            );
            return;
        }

        try {
            const response = await window.PhotinoBridge.send({
                action: "usuarios.create",
                data: {
                    codigoUsuario,
                    nombreCompleto,
                    password,
                    rol,
                    activo
                }
            });

            console.log("👥 usuarios.create response:", response);

            if (!response || response.ok !== true) {
                this.showMessage(
                    response?.error || "No se pudo crear el usuario",
                    false
                );
                return;
            }

            this.showMessage(
                "Usuario creado correctamente",
                true
            );

            this.clearForm();
            this.hideForm();

            await this.loadUsuarios();
        } catch (error) {
            console.error("❌ Error creando usuario:", error);

            this.showMessage(
                "Error de conexión al crear usuario",
                false
            );
        }
    }

    // Desactivar reemplaza a "Eliminar": los usuarios tienen historial asociado y la API ya no
    // los borra físicamente.
    async toggleActivo(id, activo, nombre) {
        if (!id) return;

        const accion = activo ? "desactivar" : "activar";
        const confirmado =
            window.confirm(`¿Seguro que deseas ${accion} al usuario "${nombre}"?`);

        if (!confirmado) return;

        try {
            const response = await window.PhotinoBridge.send({
                action: "usuarios.activo",
                data: {
                    id: Number(id),
                    activo: !activo
                }
            });

            if (!response || response.ok !== true) {
                this.showMessage(
                    response?.error || `No se pudo ${accion} el usuario`,
                    false
                );
                return;
            }

            this.showMessage(
                `Usuario ${activo ? "desactivado" : "activado"} correctamente`,
                true
            );

            await this.loadUsuarios();
        } catch (error) {
            console.error("❌ Error cambiando estado del usuario:", error);

            this.showMessage(
                "Error de conexión al cambiar el estado del usuario",
                false
            );
        }
    }

    // Borrado físico: la API solo lo permite si el usuario no tiene historial (si lo tiene, avisa
    // que hay que desactivarlo). Doble confirmación: aviso + escribir el código del usuario.
    async eliminarDefinitivo(id, codigo, nombre) {
        if (!id) return;

        const confirmado = window.confirm(
            `¿Eliminar DEFINITIVAMENTE al usuario "${nombre}"?\n\n` +
            "Esta acción no se puede deshacer. Solo es posible si el usuario no tiene registros asociados; " +
            "si los tiene, desactívalo."
        );
        if (!confirmado) return;

        const escrito = window.prompt(`Para confirmar, escribe el código del usuario: ${codigo}`);
        if (escrito === null) return;
        if (escrito.trim() !== codigo) {
            this.showMessage("El código no coincide: no se eliminó el usuario", false);
            return;
        }

        try {
            const response = await window.PhotinoBridge.send({
                action: "usuarios.eliminarDefinitivo",
                data: { id: Number(id) }
            });

            if (!response || response.ok !== true) {
                this.showMessage(response?.error || "No se pudo eliminar el usuario", false);
                return;
            }

            this.showMessage(`Usuario "${nombre}" eliminado definitivamente`, true);
            await this.loadUsuarios();
        } catch (error) {
            console.error("❌ Error eliminando usuario:", error);
            this.showMessage("Error de conexión al eliminar el usuario", false);
        }
    }

    async cambiarRol(selectEl) {
        const id = selectEl.getAttribute("data-id");
        const rolAnterior = selectEl.getAttribute("data-rol-actual");
        const nuevoRol = selectEl.value;

        if (nuevoRol === rolAnterior) return;

        if (!window.confirm(`¿Cambiar el rol a "${nuevoRol}"?`)) {
            selectEl.value = rolAnterior;
            return;
        }

        selectEl.disabled = true;
        try {
            const response = await window.PhotinoBridge.send({
                action: "usuarios.cambiarRol",
                data: {
                    id: Number(id),
                    rol: nuevoRol
                }
            });

            if (!response || response.ok !== true) {
                this.showMessage(response?.error || "No se pudo cambiar el rol", false);
                selectEl.value = rolAnterior;
                return;
            }

            this.showMessage(`Rol actualizado a "${nuevoRol}"`, true);
            await this.loadUsuarios();
        } catch (error) {
            console.error("❌ Error cambiando rol:", error);
            this.showMessage("Error de conexión al cambiar el rol", false);
            selectEl.value = rolAnterior;
        } finally {
            selectEl.disabled = false;
        }
    }

    abrirPermisos(id, nombre, rol) {
        const usuarioId = Number(id);

        window.PermisosMatriz.abrir({
            nombre,
            rol,
            empresa: "INNPACK",
            cargar: () => window.PhotinoBridge.send({
                action: "usuarios.permisos.get",
                data: { id: usuarioId, rol }
            }),
            guardar: permisos => window.PhotinoBridge.send({
                action: "usuarios.permisos.guardar",
                data: { id: usuarioId, permisos }
            }),
            restablecer: () => window.PhotinoBridge.send({
                action: "usuarios.permisos.restablecer",
                data: { id: usuarioId }
            })
        });
    }

    async resetPassword(id, nombre) {
        if (!id) return;

        const nuevaPassword = window.prompt(
            `Ingresa la nueva contraseña para "${nombre}":`
        );

        if (nuevaPassword === null) return;

        const passwordLimpia = nuevaPassword.trim();

        if (!passwordLimpia) {
            this.showMessage(
                "La nueva contraseña es obligatoria",
                false
            );
            return;
        }

        if (passwordLimpia.length < 6) {
            this.showMessage(
                "La nueva contraseña debe tener al menos 6 caracteres",
                false
            );
            return;
        }

        const confirmado = window.confirm(
            `¿Confirmas cambiar la contraseña del usuario "${nombre}"?`
        );

        if (!confirmado) return;

        try {
            const response = await window.PhotinoBridge.send({
                action: "usuarios.resetPassword",
                data: {
                    id: Number(id),
                    nuevaPassword: passwordLimpia
                }
            });

            console.log("👥 usuarios.resetPassword response:", response);

            if (!response || response.ok !== true) {
                this.showMessage(
                    response?.error || "No se pudo actualizar la contraseña",
                    false
                );
                return;
            }

            this.showMessage(
                "Contraseña actualizada correctamente",
                true
            );
        } catch (error) {
            console.error("❌ Error actualizando contraseña:", error);

            this.showMessage(
                "Error de conexión al actualizar la contraseña",
                false
            );
        }
    }

    showForm() {
        if (this.formCard) {
            this.formCard.style.display = "block";
        }
    }

    hideForm() {
        if (this.formCard) {
            this.formCard.style.display = "none";
        }

        this.clearForm();
    }

    clearForm() {
        if (this.inputCodigo) this.inputCodigo.value = "";
        if (this.inputNombre) this.inputNombre.value = "";
        if (this.inputPassword) this.inputPassword.value = "";

        if (this.selectRol) {
            this.selectRol.value = "operador";
        }

        if (this.selectActivo) {
            this.selectActivo.value = "true";
        }
    }

    showMessage(text, success) {
        if (!this.message) return;

        this.message.innerText = text;
        this.message.style.marginBottom = "12px";
        this.message.style.fontSize = "14px";
        this.message.style.fontWeight = "600";

        this.message.style.color =
            success ? "#16a34a" : "#dc2626";
    }

    escapeHtml(text) {
        return String(text ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    destroy() {
        window.PermisosMatriz?.cerrar();
        console.log("🧹 UsuariosController destruido");
    }
};
