// Cambio de contraseña del propio usuario (política de contraseñas, 15-10-2026).
// Una sola pantalla para INNPACK y Faret: según sessionStorage.empresa llama a
// auth.cambiarPassword (API INNPACK) o faret.cambiarPassword (API qualitycontrol Faret).
// Modo forzado (sessionStorage.pwdCambioForzado = "1", lo deja App.rutaTrasLogin): sin sidebar,
// sin "Volver"; la API además rechaza cualquier otra acción hasta que la clave cambie.
window.CambiarPasswordController = class CambiarPasswordController {

    init() {
        console.log("CambiarPasswordController iniciado");

        this.empresa = sessionStorage.getItem("empresa") || "INNPACK";
        this.forzado = sessionStorage.getItem("pwdCambioForzado") === "1";
        this.minimo = this.empresa === "FARET" ? 8 : 6;

        const motivoEl = document.getElementById("cp-motivo");
        const motivo = sessionStorage.getItem("pwdMotivo");
        if (this.forzado && motivoEl) {
            motivoEl.textContent = motivo || "Debes definir una contraseña nueva para continuar.";
            motivoEl.style.display = "block";
        }

        const reglas = document.getElementById("cp-reglas");
        if (reglas) {
            reglas.textContent = `Mínimo ${this.minimo} caracteres y distinta de la actual. `
                + "Por seguridad, la contraseña se renueva cada 60 días (te avisaremos con anticipación).";
        }

        document.getElementById("cp-volver-wrap").style.display = this.forzado ? "none" : "";
        document.getElementById("cp-salir-wrap").style.display = this.forzado ? "" : "none";

        document.getElementById("cp-form")
            ?.addEventListener("submit", (e) => { e.preventDefault(); this._guardar(); });

        document.getElementById("cp-mostrar")
            ?.addEventListener("change", (e) => {
                const tipo = e.target.checked ? "text" : "password";
                ["cp-actual", "cp-nueva", "cp-repetir"].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.type = tipo;
                });
            });

        document.getElementById("cp-volver")
            ?.addEventListener("click", () => window.App.loadModule(this._inicio()));

        document.getElementById("cp-salir")
            ?.addEventListener("click", () => window.App.cerrarSesion("Sesión cerrada"));

        document.getElementById("cp-actual")?.focus();
    }

    destroy() {
        console.log("CambiarPasswordController destruido");
    }

    _inicio() {
        return this.empresa === "FARET" ? "faret" : "inicio";
    }

    _mensaje(texto, ok) {
        const el = document.getElementById("cp-message");
        if (!el) return;
        el.textContent = texto;
        el.className = "auth-message " + (ok ? "success" : "error");
        el.style.color = ok ? "#15803d" : "#dc2626";
    }

    async _guardar() {
        const actual = document.getElementById("cp-actual")?.value || "";
        const nueva = document.getElementById("cp-nueva")?.value || "";
        const repetir = document.getElementById("cp-repetir")?.value || "";
        const btn = document.getElementById("cp-guardar");

        if (!actual || !nueva || !repetir) {
            this._mensaje("Completa los tres campos", false);
            return;
        }
        if (nueva.length < this.minimo) {
            this._mensaje(`La contraseña nueva debe tener al menos ${this.minimo} caracteres`, false);
            return;
        }
        if (nueva !== repetir) {
            this._mensaje("La contraseña nueva y su repetición no coinciden", false);
            return;
        }
        if (nueva === actual) {
            this._mensaje("La contraseña nueva debe ser distinta de la actual", false);
            return;
        }

        btn.disabled = true;
        btn.textContent = "Guardando...";

        try {
            const res = this.empresa === "FARET"
                ? await window.PhotinoBridge.send({ action: "faret.cambiarPassword", passwordActual: actual, passwordNueva: nueva })
                : await window.PhotinoBridge.send({ action: "auth.cambiarPassword", data: { PasswordActual: actual, PasswordNueva: nueva } });

            if (!res || !res.ok) {
                this._mensaje(res?.error || "No se pudo cambiar la contraseña", false);
                return;
            }

            // "Recordar usuario" guarda la clave para el auto-login: se actualiza para que el
            // próximo inicio no caiga al login manual con la clave vieja.
            if (this.empresa === "FARET") {
                if (localStorage.getItem("lcc_faret_remember_login") === "true") {
                    localStorage.setItem("lcc_faret_password", nueva);
                }
            } else if (localStorage.getItem("lcc_remember_login") === "true") {
                localStorage.setItem("lcc_password", nueva);
            }

            const destino = sessionStorage.getItem("pwdDestino") || this._inicio();
            ["pwdCambioForzado", "pwdMotivo", "pwdDiasParaVencer", "pwdDestino"].forEach(k => sessionStorage.removeItem(k));

            this._mensaje("Contraseña actualizada correctamente", true);
            setTimeout(() => window.App.loadModule(destino), 700);
        } catch (err) {
            console.error("Error cambiando contraseña:", err);
            this._mensaje("Error de comunicación con el backend", false);
        } finally {
            btn.disabled = false;
            btn.textContent = "Guardar contraseña nueva";
        }
    }
};
