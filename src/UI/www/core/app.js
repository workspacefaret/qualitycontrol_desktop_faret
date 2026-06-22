console.log("🔥 APP INICIO");

(function () {

    // ==============================
    // 🔥 UTIL: CARGA HTML (SYNC)
    // ==============================
    function loadHtml(path) {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", path, false);
        xhr.send(null);

        if (xhr.status === 200 || xhr.status === 0) {
            return xhr.responseText;
        }

        throw new Error("Error cargando HTML: " + path);
    }

    // ==============================
    // APP ROUTER
    // ==============================
    const App = {

        currentModule: null,
        currentController: null,

        loadModule(moduleName) {
            try {
                console.log("📦 Cargando módulo:", moduleName);

                const container = document.getElementById("app-content");
                // 🔥 DESTRUIR CONTROLLER ANTES DE CAMBIAR EL DOM
                if (App.currentController && App.currentController.destroy) {
                    try {
                        App.currentController.destroy();
                    } catch (err) {
                        console.warn("⚠ Error en destroy:", err);
                    }
                }
                if (!container) {
                    throw new Error("Container #app-content NO existe en el DOM");
                }

                // limpiar contenido anterior
                container.innerHTML = "";

                // 🔥 ocultar dashboard SIEMPRE
                const dashboard = document.getElementById("dashboard");
                if (dashboard) dashboard.style.display = "none";
                // 🔥 controlar visibilidad layout según módulo
                const sidebar = document.getElementById("sidebar");
                const mainLayout = document.getElementById("main-layout");

                if (moduleName === "auth") {
                    if (sidebar) sidebar.style.display = "none";
                    if (mainLayout) mainLayout.style.marginLeft = "0";
                } else {
                    if (sidebar) sidebar.style.display = "flex";
                    if (mainLayout) mainLayout.style.marginLeft = "260px";
                    refreshSidebarState();
                }
                // 🔥 cargar HTML
                const html = loadHtml(`./modules/${moduleName}/${moduleName}.view.html`);

                container.innerHTML = html;

                // =========================
                // 🔥 CSS EXCLUSIVO SOLO PARA AUTH
                // =========================
                const oldAuthCss = document.getElementById("auth-module-css");

                if (moduleName === "auth") {
                    if (!oldAuthCss) {
                        const link = document.createElement("link");
                        link.id = "auth-module-css";
                        link.rel = "stylesheet";
                        link.href = "modules/auth/auth.css";
                        document.head.appendChild(link);
                    }
                } else {
                    if (oldAuthCss) {
                        oldAuthCss.remove();
                    }
                }
                // =========================
                // 🔥 CLICK EN TARJETAS HOME
                // =========================
                if (moduleName === "inicio") {

                    setTimeout(() => {
                        const cards = document.querySelectorAll(".home-module-card");

                        console.log("🏠 Cards inicio encontradas:", cards.length);

                        cards.forEach(card => {
                            card.addEventListener("click", () => {

                                const target = card.getAttribute("data-module-target");

                                if (!target) {
                                    console.warn("⚠ Card sin destino");
                                    return;
                                }

                                console.log("👉 Navegando a:", target);

                                App.loadModule(target);
                            });
                        });

                    }, 50); // pequeño delay para asegurar render

                }

                // =========================
                // 🔥 CARGAR CONTROLLER
                // =========================

                try {
                    const controllerPath = `./modules/${moduleName}/${moduleName}.controller.js`;

                    const controllerCode = loadHtml(controllerPath);

                    const oldScript = document.getElementById("module-script");
                    if (oldScript) oldScript.remove();

                    const script = document.createElement("script");
                    script.id = "module-script";
                    script.type = "text/javascript";
                    script.textContent = controllerCode;

                    document.body.appendChild(script);

                    console.log("✔ Controller cargado");

                    const controllerName = moduleName
                        .split("-")
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                        .join("") + "Controller";

                    if (window[controllerName]) {
                        App.currentController = new window[controllerName]();
                        App.currentController.init();

                        if (moduleName === "inicio" || moduleName === "auth") {
                            setTimeout(() => hideSplash(), 300);
                        }
                    } else {
                        console.warn("⚠ Controller no encontrado:", controllerName);
                    }

                } catch (err) {
                    console.error("❌ Error cargando controller JS:", moduleName, err);
                    alert("Error cargando controller: " + moduleName);
                }

                this.currentModule = moduleName;

            } catch (error) {
                console.error("❌ Error cargando módulo:", moduleName, error);
                alert("Error cargando módulo: " + moduleName + "\n" + error.message);
            }
        }
    };
    window.App = App;


    // ==============================
    // SIDEBAR
    // ==============================
    function refreshSidebarState() {
        const usuariosBtn = document.getElementById("btn-usuarios");
        const sidebarUsername = document.getElementById("sidebar-username");

        const rolUsuario = sessionStorage.getItem("rolUsuario");
        const nombreUsuario = sessionStorage.getItem("nombreUsuario");
        const codigoUsuario = sessionStorage.getItem("codigoUsuario");

        if (sidebarUsername) {
            sidebarUsername.innerText = nombreUsuario || codigoUsuario || "-";
        }

        if (usuariosBtn) {
            if (rolUsuario === "admin" || rolUsuario === "admin_ti") {
                usuariosBtn.style.display = "block";
            } else {
                usuariosBtn.style.display = "none";
            }
        }
    }
    function initSidebar() {

        console.log("🚀 Inicializando sidebar");

        const buttons = document.querySelectorAll("[data-module]");
        const logoutBtn = document.getElementById("logout-btn");


        console.log("Botones encontrados:", buttons.length);

        if (!buttons.length) {
            console.error("❌ No se encontraron botones del sidebar");
        }
        refreshSidebarState();


        buttons.forEach(btn => {
            btn.addEventListener("click", () => {
                const module = btn.getAttribute("data-module");

                if (!module) {
                    console.warn("⚠ Botón sin data-module");
                    return;
                }

                console.log("👉 Click en módulo:", module);
                App.loadModule(module);
            });
        });

        if (logoutBtn) {
            logoutBtn.addEventListener("click", () => {
                console.log("🔓 Cerrando sesión...");

                // 🔹 mensaje visual simple
                const message = document.createElement("div");
                message.innerText = "✔ Sesión cerrada correctamente";
                message.style.position = "fixed";
                message.style.bottom = "20px";
                message.style.right = "20px";
                message.style.background = "#111827";
                message.style.color = "#fff";
                message.style.padding = "12px 18px";
                message.style.borderRadius = "8px";
                message.style.fontSize = "14px";
                message.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
                message.style.zIndex = "9999";

                document.body.appendChild(message);

                // 🔹 limpiar sesión
                sessionStorage.removeItem("isLoggedIn");
                sessionStorage.removeItem("codigoUsuario");
                sessionStorage.removeItem("nombreUsuario");
                sessionStorage.removeItem("rolUsuario");

                localStorage.removeItem("lcc_remember_login");
                localStorage.removeItem("lcc_nombreUsuario");
                localStorage.removeItem("lcc_rolUsuario");
                localStorage.removeItem("lcc_usuarioActivo");

                // No borramos lcc_codigoUsuario para que el login quede autollenado

                // 🔹 delay profesional
                setTimeout(() => {
                    message.remove();
                    App.loadModule("auth");
                }, 700);
            });
        }
    }


    function initApp() {
        console.log("🔥 INIT APP");

        const container = document.getElementById("app-content");

        if (!container) {
            console.error("❌ #app-content no existe en HTML");
            return;
        }

        initSidebar();

        const isLoggedIn = localStorage.getItem("lcc_remember_login") === "true";
        const codigoUsuario = localStorage.getItem("lcc_codigoUsuario");
        const nombreUsuario = localStorage.getItem("lcc_nombreUsuario");
        const rolUsuario = localStorage.getItem("lcc_rolUsuario");

        if (isLoggedIn && codigoUsuario) {
            console.log("✅ Sesión recordada encontrada");

            sessionStorage.setItem("isLoggedIn", "true");
            sessionStorage.setItem("codigoUsuario", codigoUsuario);
            sessionStorage.setItem("nombreUsuario", nombreUsuario || codigoUsuario);
            sessionStorage.setItem("rolUsuario", rolUsuario || "");

            refreshSidebarState();
            App.loadModule("inicio");
            return;
        }

        App.loadModule("auth");
    }

    // ==============================
    // START
    // ==============================
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initApp);
    } else {
        initApp();
    }
    // =========================
    // SPLASH SCREEN CONTROL (PRO)
    // =========================
    function hideSplash() {

        const splash = document.getElementById("splash-screen")
        const text = document.getElementById("splash-text")
        const progress = document.getElementById("progress-fill")
        if (!splash) return

        const steps = [
            { text: "Iniciando sistema...", progress: 20 },
            { text: "Cargando módulos...", progress: 50 },
            { text: "Conectando a servicios...", progress: 80 },
            { text: "Bienvenido 🚀", progress: 100 }
        ]

        let i = 0

        const interval = setInterval(() => {

            if (text && steps[i]) {
                text.innerText = steps[i].text;

                if (progress) {
                    progress.style.width = steps[i].progress + "%";
                }
            }

            i++

            if (i >= steps.length) {
                clearInterval(interval)

                setTimeout(() => {
                    splash.style.opacity = "0"

                    setTimeout(() => {
                        splash.remove()
                    }, 800)

                }, 800)
            }

        }, 700)
    }


})();

