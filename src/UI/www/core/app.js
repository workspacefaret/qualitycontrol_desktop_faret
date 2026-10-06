console.log("🔥 APP INICIO");

(function () {

    // ==============================
    // 🔥 UTIL: CARGA HTML (SYNC)
    // ==============================
    function loadHtml(path) {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", path, false);
        xhr.overrideMimeType('text/plain; charset=utf-8');
        xhr.send(null);

        if (xhr.status === 200 || xhr.status === 0) {
            return xhr.responseText;
        }

        throw new Error("Error cargando HTML: " + path);
    }

    // ==============================
    // APP ROUTER
    // ==============================
    // Pantallas previas al login: no dependen de permisos.
    const MODULOS_PUBLICOS = ["auth", "empresa-selector", "faret-login"];

    // Botones de escritura que se ocultan en modo "Solo vista" (texto del botón, sin mayúsculas).
    // Es solo UX: el bloqueo real está en el backend (PermisosService), que rechaza cualquier
    // escritura de un módulo en VER aunque el botón quede visible.
    const REGEX_ESCRITURA = /^(\+|✔|✎|nuev|crear|guardar|eliminar|editar|corregir|gestionar|reemplazar|analizar|agregar|adjuntar|validar|rechazar|anular|cerrar no conformidad|cerrar nc|actualizar estado|generar plan|sincronizar|confirmar|restablecer clave|desactivar|activar|permisos)/i;

    let observadorSoloVista = null;

    function aplicarSoloVista(raiz) {
        raiz.querySelectorAll("button, [role=button], input[type=button], input[type=submit]").forEach(el => {
            if (el.closest("#sidebar") || el.dataset.soloVistaOculto === "1") return;
            // El title manda sobre el texto: botones de solo ícono ("✕" = Eliminar, "✎" = Ver historial).
            const texto = (el.getAttribute("title") || el.textContent || el.value || "").trim();
            if (el.hasAttribute("data-requiere-editar") || REGEX_ESCRITURA.test(texto)) {
                el.dataset.soloVistaOculto = "1";
                el.style.display = "none";
            }
        });
    }

    function desactivarSoloVista() {
        if (observadorSoloVista) {
            observadorSoloVista.disconnect();
            observadorSoloVista = null;
        }
    }

    function activarSoloVista(container) {
        const banner = document.createElement("div");
        banner.className = "card";
        banner.style.cssText = "margin-bottom:12px; padding:10px 14px; background:#EFF6FF; color:#1E3A8A; font-size:13px; font-weight:600;";
        banner.textContent = "Solo vista: puedes consultar este módulo, pero no crear, modificar ni eliminar datos.";
        container.prepend(banner);

        aplicarSoloVista(document.body);
        // Filas, modales y formularios que el módulo dibuja después (también los que cuelgan de body).
        observadorSoloVista = new MutationObserver(() => aplicarSoloVista(document.body));
        observadorSoloVista.observe(document.body, { childList: true, subtree: true });
    }

    const App = {

        currentModule: null,
        currentController: null,

        // Niveles efectivos por módulo de la sesión ({ "dashboard": "EDITAR", ... }), del
        // backend (permisos.mios). null = aún no cargados → se usa la regla por rol de siempre.
        permisos: null,

        async cargarPermisos() {
            try {
                const res = await window.PhotinoBridge.send({ action: "permisos.mios" });
                App.permisos = res && res.ok && res.data ? res.data : null;
            } catch {
                App.permisos = null;
            }
            return App.permisos;
        },

        limpiarPermisos() {
            App.permisos = null;
        },

        nivelModulo(moduleName) {
            if (!App.permisos) return "EDITAR";
            return App.permisos[moduleName] || "SIN_ACCESO";
        },

        loadModule(moduleName) {
            try {
                console.log("📦 Cargando módulo:", moduleName);

                // SIN_ACCESO: no se abre (menú, tarjetas de Inicio o cualquier otro acceso).
                if (!MODULOS_PUBLICOS.includes(moduleName) && App.nivelModulo(moduleName) === "SIN_ACCESO") {
                    const inicio = (sessionStorage.getItem("empresa") || "INNPACK") === "FARET" ? "faret" : "inicio";
                    console.warn("⛔ Sin acceso al módulo:", moduleName);
                    if (window.showToast) window.showToast("No tienes acceso a este módulo", "error");
                    if (moduleName !== inicio) App.loadModule(inicio);
                    return;
                }

                desactivarSoloVista();

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

                if (moduleName === "auth" || moduleName === "empresa-selector" || moduleName === "faret-login") {
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
                        // Antes de init(): las llamadas del init ya viajan con el módulo correcto
                        // (el backend valida permisos por módulo de origen).
                        this.currentModule = moduleName;
                        App.currentController = new window[controllerName]();
                        App.currentController.init();

                        if (!MODULOS_PUBLICOS.includes(moduleName) && App.nivelModulo(moduleName) === "VER") {
                            activarSoloVista(container);
                        }

                        if (moduleName === "inicio" || moduleName === "auth" || moduleName === "empresa-selector" || moduleName === "faret-login" || moduleName === "faret") {
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

        const empresa = sessionStorage.getItem("empresa") || "INNPACK";
        const rolUsuario = sessionStorage.getItem("rolUsuario");
        const nombreUsuario = sessionStorage.getItem("nombreUsuario");
        const codigoUsuario = sessionStorage.getItem("codigoUsuario");

        if (sidebarUsername) {
            if (empresa === "FARET") {
                sidebarUsername.innerText = sessionStorage.getItem("faretNombreUsuario") || "-";
            } else {
                sidebarUsername.innerText = nombreUsuario || codigoUsuario || "-";
            }
        }

        // 🔹 visibilidad por empresa
        const empresaButtons = document.querySelectorAll("[data-empresa]");
        empresaButtons.forEach(btn => {
            btn.style.display = btn.getAttribute("data-empresa") === empresa ? "" : "none";
        });

        // 🔹 permisos efectivos (rol + personalizados, ver PermisosService): si ya se cargaron,
        // mandan sobre la regla por rol de abajo.
        if (App.permisos) {
            empresaButtons.forEach(btn => {
                if (btn.getAttribute("data-empresa") !== empresa || !btn.hasAttribute("data-module")) return;
                const nivel = App.permisos[btn.getAttribute("data-module")] || "SIN_ACCESO";
                btn.style.display = nivel === "SIN_ACCESO" ? "none" : "";
            });
        }

        // 🔹 gating por rol (solo aplica al botón de usuarios y dentro de su empresa)
        else if (usuariosBtn) {
            const esAdmin = rolUsuario === "admin_ti";
            const empresaOk = usuariosBtn.getAttribute("data-empresa") === empresa;
            usuariosBtn.style.display = empresaOk && esAdmin ? "" : "none";
        }

        // 🔹 gating por rol (Gestión de Usuarios de FARET, solo sin permisos cargados)
        if (!App.permisos) aplicarReglaRolFaret(empresa);

        // 🔹 título del header según empresa
        const headerTitle = document.querySelector(".header .title");
        if (headerTitle) {
            headerTitle.innerText = empresa === "FARET" ? "Panel Faret" : "Panel de Calidad";
        }
    }

    // Regla por rol previa a los permisos por módulo. Queda como respaldo si permisos.mios no
    // respondió (el backend igual bloquea lo que corresponda).
    function aplicarReglaRolFaret(empresa) {
        const faretRolActual = (sessionStorage.getItem("faretRol") || "").toUpperCase();
        const esFaretAdminFull = faretRolActual === "ADMIN" || faretRolActual === "ADMIN_TI";
        const esFaretUsuariosOk = faretRolActual === "ADMIN_TI";

        const faretUsuariosBtn = document.getElementById("btn-faret-usuarios");
        if (faretUsuariosBtn) {
            const empresaOk = faretUsuariosBtn.getAttribute("data-empresa") === empresa;
            faretUsuariosBtn.style.display = empresaOk && esFaretUsuariosOk ? "" : "none";
        }

        // 🔹 gating por rol (Data y Carga Masiva de FARET, solo ADMIN / ADMIN_TI)
        const faretDataBtn = document.querySelector('[data-module="faret-data"]');
        const faretImportacionBtn = document.querySelector('[data-module="faret-importacion"]');
        [faretDataBtn, faretImportacionBtn].forEach(btn => {
            if (!btn) return;
            const empresaOk = btn.getAttribute("data-empresa") === empresa;
            btn.style.display = empresaOk && esFaretAdminFull ? "" : "none";
        });

        // 🔹 gating por rol (CONSULTA de FARET: Inicio, Talleres Externos y los dos módulos de
        // No Conformidades — la NC de producto (faret-nc) y NC Internas (faret-nc-internas))
        const esFaretConsulta = faretRolActual === "CONSULTA";
        if (esFaretConsulta) {
            const modulosPermitidos = ["faret", "faret-talleres-externos", "faret-nc", "faret-nc-internas"];
            document.querySelectorAll('[data-module^="faret"]').forEach(btn => {
                const empresaOk = btn.getAttribute("data-empresa") === empresa;
                if (empresaOk && !modulosPermitidos.includes(btn.getAttribute("data-module"))) {
                    btn.style.display = "none";
                }
            });
        }
    }

    // Cierra la sesión (botón "Cerrar sesión" o sesión expirada) y vuelve al selector de empresa.
    function cerrarSesion(textoAviso) {
        console.log("🔓 Cerrando sesión...");

        const empresa = sessionStorage.getItem("empresa") || "INNPACK";
        App.limpiarPermisos();
        desactivarSoloVista();

        // 🔹 mensaje visual simple
        const message = document.createElement("div");
        message.innerText = textoAviso;
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

        if (empresa === "FARET") {
            window.PhotinoBridge.send({ action: "faret.logout" }).catch(() => {});
            sessionStorage.removeItem("faretLoggedIn");
            sessionStorage.removeItem("faretNombreUsuario");
            sessionStorage.removeItem("faretRol");
            localStorage.removeItem("lcc_faret_remember_login");
            localStorage.removeItem("lcc_faret_nombreUsuario");
            localStorage.removeItem("lcc_faret_rol");
            // No borramos lcc_faret_identificador ni lcc_faret_password para que el login quede autollenado
        } else {
            window.PhotinoBridge.send({ action: "auth.logout", data: {} }).catch(() => {});
            sessionStorage.removeItem("isLoggedIn");
            sessionStorage.removeItem("codigoUsuario");
            sessionStorage.removeItem("nombreUsuario");
            sessionStorage.removeItem("rolUsuario");
            localStorage.removeItem("lcc_remember_login");
            localStorage.removeItem("lcc_nombreUsuario");
            localStorage.removeItem("lcc_rolUsuario");
            localStorage.removeItem("lcc_usuarioActivo");
            // No borramos lcc_codigoUsuario para que el login quede autollenado
        }

        sessionStorage.removeItem("empresa");

        setTimeout(() => {
            message.remove();
            App.loadModule("empresa-selector");
        }, 700);
    }

    // Llamado por PhotinoBridge (index.html) cuando la API responde "Sesión expirada".
    // Una sola vez por expiración aunque lleguen varias respuestas 401 seguidas.
    let cerrandoPorExpiracion = false;
    App.cerrarSesionExpirada = function (texto) {
        if (cerrandoPorExpiracion || sessionStorage.getItem("empresa") === null) return;
        cerrandoPorExpiracion = true;
        cerrarSesion(texto);
        setTimeout(() => { cerrandoPorExpiracion = false; }, 3000);
    };

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
            logoutBtn.addEventListener("click", () => cerrarSesion("✔ Sesión cerrada correctamente"));
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

        // Siempre inicia en empresa-selector.
        // La lógica de sesión recordada (INNPACK remember-me) se maneja
        // dentro de EmpresaSelectorController al elegir INNPACK.
        App.loadModule("empresa-selector");
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

