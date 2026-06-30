window.FaretController = class FaretController {

    init() {
        console.log("FaretController iniciado");

        // Mostrar datos de sesión ya guardados por faret-login
        const nombre = sessionStorage.getItem("faretNombreUsuario") || "-";
        const rol = sessionStorage.getItem("faretRol") || "-";

        const elUsuario = document.getElementById("faret-sesion-usuario");
        const elRol = document.getElementById("faret-sesion-rol");
        if (elUsuario) elUsuario.textContent = nombre;
        if (elRol) elRol.textContent = rol;

        document.getElementById("faret-refresh-btn")
            ?.addEventListener("click", () => this._loadRegistros());

        this._loadRegistros();
    }

    destroy() {
        console.log("FaretController destruido");
    }

    async _loadRegistros() {
        const loadingEl = document.getElementById("faret-registros-loading");
        const errorEl = document.getElementById("faret-registros-error");
        const tbody = document.getElementById("faret-registros-tbody");

        loadingEl.style.display = "block";
        errorEl.style.display = "none";
        tbody.innerHTML = "";

        try {
            const res = await window.PhotinoBridge.send({ action: "faret.registros.list" });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al cargar registros";
                errorEl.style.display = "block";
                tbody.innerHTML = `<tr><td colspan="7" class="faret-empty">Sin datos</td></tr>`;
                return;
            }

            const registros = Array.isArray(res.data) ? res.data : [];
            this._renderRegistros(registros);
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
            tbody.innerHTML = `<tr><td colspan="7" class="faret-empty">Sin datos</td></tr>`;
        } finally {
            loadingEl.style.display = "none";
        }
    }

    _renderRegistros(registros) {
        const tbody = document.getElementById("faret-registros-tbody");

        if (!registros.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="faret-empty">Sin registros</td></tr>`;
            return;
        }

        tbody.innerHTML = registros.map(r => `
            <tr>
                <td>${r.id ?? "-"}</td>
                <td>${r.fecha ? new Date(r.fecha).toLocaleDateString("es-CL") : "-"}</td>
                <td>${r.area ?? "-"}</td>
                <td>${r.maquina ?? "-"}</td>
                <td>${r.inspector ?? "-"}</td>
                <td>${r.estado ?? "-"}</td>
                <td>${r.totalDefectos ?? "0"}</td>
            </tr>
        `).join("");
    }
};

