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
                    window.App.loadModule("faret-login");
                } else {
                    this._entrarInnpack();
                }
            });
        });
    }

    _entrarInnpack() {
        const isRemembered = localStorage.getItem("lcc_remember_login") === "true";
        const codigoUsuario = localStorage.getItem("lcc_codigoUsuario");

        if (isRemembered && codigoUsuario) {
            // Restaurar sesión recordada y entrar directo
            sessionStorage.setItem("isLoggedIn", "true");
            sessionStorage.setItem("codigoUsuario", codigoUsuario);
            sessionStorage.setItem("nombreUsuario", localStorage.getItem("lcc_nombreUsuario") || codigoUsuario);
            sessionStorage.setItem("rolUsuario", localStorage.getItem("lcc_rolUsuario") || "");
            window.App.loadModule("inicio");
        } else {
            window.App.loadModule("auth");
        }
    }

    destroy() {
        console.log("EmpresaSelectorController destruido");
    }
};
