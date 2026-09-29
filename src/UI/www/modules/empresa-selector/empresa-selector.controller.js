window.EmpresaSelectorController = class EmpresaSelectorController {

    init() {
        console.log("EmpresaSelectorController iniciado");

        const cards = document.querySelectorAll(".empresa-card");

        if (!cards.length) {
            console.error("No se encontraron tarjetas de empresa");
            return;
        }

        cards.forEach(card => {
            card.addEventListener("click", () => {
                const empresa = card.getAttribute("data-empresa");
                if (!empresa) return;

                console.log("Empresa seleccionada:", empresa);
                sessionStorage.setItem("empresa", empresa);

                if (empresa === "FARET") {
                    this._entrarFaret();
                } else {
                    this._entrarInnpack();
                }
            });
        });
    }

    async _entrarFaret() {
        const isRemembered = localStorage.getItem("lcc_faret_remember_login") === "true";
        const identificador = localStorage.getItem("lcc_faret_identificador");
        const password = localStorage.getItem("lcc_faret_password");

        if (isRemembered && identificador && password) {
            try {
                const res = await window.PhotinoBridge.send({
                    action: "faret.login",
                    identificador,
                    password,
                });

                if (res.ok) {
                    sessionStorage.setItem("faretLoggedIn", "true");
                    sessionStorage.setItem("faretNombreUsuario", res.data?.username || identificador);
                    sessionStorage.setItem("faretRol", res.data?.role || "");
                    await window.App.cargarPermisos();
                    window.App.loadModule("faret");
                    return;
                }
            } catch {
                // sin conexión o credencial inválida: se cae al login manual
            }
        }

        window.App.loadModule("faret-login");
    }

    // Sesión recordada: se reenvía auth.login (igual que Faret) para que el backend cargue el
    // usuario real, su rol vigente y sus permisos. Si el usuario fue desactivado o cambió su
    // contraseña, cae al login manual.
    async _entrarInnpack() {
        const isRemembered = localStorage.getItem("lcc_remember_login") === "true";
        const codigoUsuario = localStorage.getItem("lcc_codigoUsuario");
        const password = localStorage.getItem("lcc_password");

        if (isRemembered && codigoUsuario && password) {
            try {
                const res = await window.PhotinoBridge.send({
                    action: "auth.login",
                    data: { CodigoUsuario: codigoUsuario, Password: password }
                });

                if (res.ok) {
                    const rol = res.data?.Rol || "";
                    const nombre = res.data?.NombreCompleto || codigoUsuario;
                    sessionStorage.setItem("isLoggedIn", "true");
                    sessionStorage.setItem("codigoUsuario", res.data?.CodigoUsuario || codigoUsuario);
                    sessionStorage.setItem("nombreUsuario", nombre);
                    sessionStorage.setItem("rolUsuario", rol);
                    localStorage.setItem("lcc_nombreUsuario", nombre);
                    localStorage.setItem("lcc_rolUsuario", rol);
                    await window.App.cargarPermisos();
                    window.App.loadModule("inicio");
                    return;
                }
            } catch {
                // sin conexión o credencial inválida: se cae al login manual
            }
        }

        window.App.loadModule("auth");
    }

    destroy() {
        console.log("EmpresaSelectorController destruido");
    }
};
