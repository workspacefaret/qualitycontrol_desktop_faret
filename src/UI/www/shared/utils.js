window.TableUtils = (function () {
    // Marca/fija filas de una tabla y muestra una franja con las filas marcadas, persistente aunque
    // la fila deje de estar en el tbody actual (cambio de página/filtro/recarga).
    // Requiere que cada <tr> del <tbody> tenga data-id="<id del registro>".
    function init(tabla, franjaEl, opciones) {
        opciones = opciones || {};
        const obtenerId = opciones.obtenerId || (tr => tr.dataset.id);
        const seleccionados = new Map(); // id -> html de las celdas de datos (sin la celda de checkbox)

        if (franjaEl) {
            franjaEl.classList.add("tu-franja-fijas");
        }

        const theadRow = tabla.querySelector("thead tr");
        if (theadRow && !theadRow.querySelector(".tu-th-check")) {
            const th = document.createElement("th");
            th.className = "tu-th-check";
            theadRow.insertBefore(th, theadRow.firstChild);
        }

        function capturarFilaHtml(tr) {
            const clon = tr.cloneNode(true);
            const celdaCheck = clon.querySelector(".tu-td-check");
            if (celdaCheck) celdaCheck.remove();
            return clon.innerHTML;
        }

        function toggle(id, tr) {
            id = String(id);
            if (seleccionados.has(id)) {
                seleccionados.delete(id);
            } else {
                seleccionados.set(id, tr ? capturarFilaHtml(tr) : "");
            }
            refrescar();
        }

        function renderFranja() {
            if (!franjaEl) return;

            if (seleccionados.size === 0) {
                franjaEl.innerHTML = "";
                franjaEl.style.display = "none";
                return;
            }

            franjaEl.style.display = "";

            const filas = [];
            seleccionados.forEach((html, id) => {
                filas.push(`
                    <tr data-id="${id}" class="row-selected">
                        <td class="tu-td-check"><button type="button" class="tu-franja-unpin" title="Quitar de fijadas">✕</button></td>
                        ${html}
                    </tr>`);
            });

            franjaEl.innerHTML = `
                <div class="tu-franja-header">
                    <span>📌 Filas marcadas (${seleccionados.size})</span>
                    <button type="button" class="tu-franja-limpiar">Quitar todas</button>
                </div>
                <div class="table-container tu-franja-tabla-container">
                    <table class="table">
                        <tbody>${filas.join("")}</tbody>
                    </table>
                </div>`;

            franjaEl.querySelectorAll("tbody tr[data-id]").forEach(tr => {
                const id = tr.dataset.id;
                const btn = tr.querySelector(".tu-franja-unpin");
                if (btn) btn.addEventListener("click", () => toggle(id));
            });

            const btnLimpiar = franjaEl.querySelector(".tu-franja-limpiar");
            if (btnLimpiar) {
                btnLimpiar.addEventListener("click", () => {
                    seleccionados.clear();
                    refrescar();
                });
            }
        }

        function refrescar() {
            const filas = tabla.querySelectorAll("tbody tr[data-id]");

            filas.forEach(tr => {
                const id = String(obtenerId(tr));

                if (!tr.querySelector(".tu-td-check")) {
                    const td = document.createElement("td");
                    td.className = "tu-td-check";

                    const chk = document.createElement("input");
                    chk.type = "checkbox";
                    chk.className = "tu-checkbox";
                    chk.addEventListener("click", (ev) => {
                        ev.stopPropagation();
                        toggle(id, tr);
                    });

                    td.appendChild(chk);
                    tr.insertBefore(td, tr.firstChild);
                }

                const marcada = seleccionados.has(id);
                const chk = tr.querySelector(".tu-checkbox");
                if (chk) chk.checked = marcada;
                tr.classList.toggle("row-selected", marcada);

                if (marcada) {
                    seleccionados.set(id, capturarFilaHtml(tr));
                }
            });

            renderFranja();
        }

        refrescar();

        return {
            refrescar,
            obtenerSeleccionados: () => Array.from(seleccionados.keys()),
            limpiar: () => {
                seleccionados.clear();
                refrescar();
            },
        };
    }

    // Guarda el scroll de un contenedor, ejecuta fnRecargarAsync() y lo restaura al terminar.
    function preservarScroll(contenedor, fnRecargarAsync) {
        const el = typeof contenedor === "string" ? document.querySelector(contenedor) : contenedor;
        const scrollTop = el ? el.scrollTop : 0;

        const restaurar = () => {
            if (el) el.scrollTop = scrollTop;
        };

        const resultado = fnRecargarAsync();

        if (resultado && typeof resultado.then === "function") {
            return resultado.then((r) => {
                restaurar();
                return r;
            });
        }

        restaurar();
        return resultado;
    }

    // ---------- Bobinas: separar "A; B; C" en pares código/descripción/lote ----------
    // bobinaCodigo/bobinaDescripcion/bobinaLote vienen del mismo GROUP_CONCAT con el mismo
    // ORDER BY en el backend, así que la posición N de cada string corresponde a la misma bobina
    // en los 3 campos. Se empareja por índice (no se filtran vacíos por separado) para no
    // desalinear los arreglos si algún campo puntual viniera vacío para una bobina.
    function parsearListaBobinas(valor) {
        const texto = String(valor || "").trim();
        if (!texto) return [];
        return texto.split(";").map(v => v.trim());
    }

    function emparejarBobinas(codigo, descripcion, lote, observacion) {
        const codigos = parsearListaBobinas(codigo);
        const descripciones = parsearListaBobinas(descripcion);
        const lotes = parsearListaBobinas(lote);
        const observaciones = parsearListaBobinas(observacion);
        const total = Math.max(codigos.length, descripciones.length, lotes.length, observaciones.length);

        const pares = [];
        for (let i = 0; i < total; i++) {
            pares.push({
                codigo: codigos[i] || "",
                descripcion: descripciones[i] || "",
                lote: lotes[i] || "",
                observacion: observaciones[i] || "",
            });
        }
        return pares;
    }

    // Resumen listo para renderizar: primera bobina + cuántas quedan + el listado completo.
    function resumenBobinas(codigo, descripcion, lote, observacion) {
        const pares = emparejarBobinas(codigo, descripcion, lote, observacion);
        return {
            pares,
            cantidad: pares.length,
            primera: pares[0] || null,
            restantes: Math.max(0, pares.length - 1),
        };
    }

    // ---------- Popover compacto anclado a un elemento ----------
    // Vive en document.body (no dentro de la tabla) para no quedar cortado por el overflow de
    // .table-container. Solo una instancia abierta a la vez en toda la app (compartida entre
    // módulos): abrirPopover() siempre cierra cualquier popover previo antes de crear el nuevo,
    // así nunca quedan listeners globales acumulados.
    let popoverActivo = null;

    function cerrarPopover() {
        if (!popoverActivo) return;
        popoverActivo.limpiar();
        popoverActivo.el.remove();
        popoverActivo = null;
    }

    function posicionarPopover(el, trigger) {
        const margen = 8;
        const rectTrigger = trigger.getBoundingClientRect();
        const rectEl = el.getBoundingClientRect();

        let left = rectTrigger.left;
        let top = rectTrigger.bottom + margen;

        if (left + rectEl.width > window.innerWidth - margen) {
            left = window.innerWidth - rectEl.width - margen;
        }
        if (left < margen) left = margen;

        if (top + rectEl.height > window.innerHeight - margen) {
            const arriba = rectTrigger.top - rectEl.height - margen;
            top = arriba > margen ? arriba : margen;
        }

        el.style.top = `${top}px`;
        el.style.left = `${left}px`;
    }

    // `html` debe venir ya escapado por quien llama — TableUtils no conoce el origen de los datos.
    function abrirPopover(trigger, html) {
        cerrarPopover();

        const el = document.createElement("div");
        el.className = "tu-popover";
        el.setAttribute("role", "dialog");
        el.style.cssText = `
            position:fixed; z-index:9999; background:#ffffff; border:1px solid #E2E8F0;
            border-radius:10px; box-shadow:0 20px 60px rgba(0,0,0,0.25);
            max-width:420px; max-height:60vh; overflow:auto; font-size:13px; color:#0F172A;
        `;
        el.innerHTML = html;
        document.body.appendChild(el);
        posicionarPopover(el, trigger);

        const onMouseDown = (e) => {
            if (el.contains(e.target) || e.target === trigger || trigger.contains(e.target)) return;
            cerrarPopover();
        };
        const onKeyDown = (e) => {
            if (e.key === "Escape") cerrarPopover();
        };
        const onReposicionar = () => posicionarPopover(el, trigger);

        document.addEventListener("mousedown", onMouseDown, true);
        document.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("resize", onReposicionar);
        window.addEventListener("scroll", onReposicionar, true);

        popoverActivo = {
            el,
            trigger,
            limpiar: () => {
                document.removeEventListener("mousedown", onMouseDown, true);
                document.removeEventListener("keydown", onKeyDown, true);
                window.removeEventListener("resize", onReposicionar);
                window.removeEventListener("scroll", onReposicionar, true);
            },
        };

        return el;
    }

    return { init, preservarScroll, resumenBobinas, abrirPopover, cerrarPopover };
})();

// ---------- Combo "seleccionar + buscar + crear" para campos tipo catálogo ----------
// Genérico: cualquier módulo puede engancharlo a un <input type="text"> + un <div> hermano.
// Los ítems que genera usan clases neutras .catalog-combo-* (sin prefijo de módulo) — cada
// módulo define esas 4 reglas en su propio CSS (item/nombre/crear/empty) reutilizando el look
// que ya tenía su combo de Responsable; el contenedor <div> del dropdown en sí sigue llevando
// la clase de posicionamiento que cada módulo ya tenía (ej. .fnc-combo-dropdown en Faret,
// .ncq-combo-dropdown en INNPACK) — eso lo decide el caller, no este archivo. No asume nada del
// backend — recibe funciones obtenerOpciones()/crear() y solo orquesta cache, filtrado y el
// afordance "+ Crear...". El caller decide de dónde vienen los datos (catálogo propio,
// catálogo jerárquico con áreaId, etc.).
window.CatalogCombo = (function () {
    const cache = new Map(); // cacheKey -> Array<{id, nombre, activo}>

    async function obtener(cacheKey, fetcher, forzar) {
        if (!forzar && cache.has(cacheKey)) return cache.get(cacheKey);
        let items = [];
        try {
            items = await fetcher();
        } catch {
            items = [];
        }
        cache.set(cacheKey, items);
        return items;
    }

    function invalidar(cacheKey) {
        cache.delete(cacheKey);
    }

    // opciones:
    //   cacheKey: string único (puede depender de un padre, ej. `maquina:${areaId}`)
    //   obtenerOpciones: async () => [{id, nombre, activo}]
    //   crear: async (nombreNormalizado) => {id, nombre, activo} | null  — si no viene (o es
    //     null), no se ofrece "+ Crear" (campo de solo lectura o sin contexto todavía, ej. sin
    //     Área elegida)
    //   onSeleccionar: (item|null) => void — llamado al elegir una opción existente o al crear una nueva
    //   bloqueadoMsg: () => string|null — si devuelve texto, se muestra en vez de la lista y no
    //     se permite crear (ej. "Seleccione un Área primero")
    //
    // Idempotente: puede llamarse varias veces sobre el mismo <input> (ej. cada vez que se abre
    // el modal, o cada vez que cambia el Área y hay que re-scopear Máquina/Operador) — los
    // listeners del DOM (focus/input/blur) se registran una sola vez por input; llamadas
    // posteriores solo reemplazan `opciones` y limpian la cache local de items para forzar un
    // refetch con el nuevo scope. Sin este resguardo, cada llamada apilaría listeners nuevos.
    function attach(input, dropdown, opciones) {
        if (!input || !dropdown) return null;

        if (input._catalogCombo) {
            input._catalogCombo.opciones = opciones;
            input._catalogCombo.items = [];
            return input._catalogCombo.handle;
        }

        // Se reparenta a document.body con position:fixed, con coordenadas calculadas desde el
        // <input> (mismo problema y misma solución ya usada en este archivo por
        // TableUtils.abrirPopover/posicionarPopover): si el dropdown se queda como hijo
        // posicionado con position:absolute dentro de un formulario, cualquier <input> cerca del
        // borde de un contenedor con overflow:auto (ej. .fnc-modal, max-height:85vh) hace que el
        // navegador recorte el dropdown — el usuario ve las opciones cortadas o directamente no
        // las ve. position:fixed + coordenadas en document.body no tiene ese problema.
        document.body.appendChild(dropdown);
        dropdown.style.position = "fixed";
        dropdown.style.zIndex = "10000";
        dropdown.style.left = "0";
        dropdown.style.right = "auto";

        const estado = { opciones, items: [] };
        input._catalogCombo = estado;

        // Por defecto se abre debajo del input; si no entra (input cerca del borde inferior de
        // la ventana) se abre hacia arriba — mismo criterio que posicionarPopover.
        function posicionar() {
            const margen = 4;
            const rect = input.getBoundingClientRect();
            const altura = Math.min(dropdown.scrollHeight || 200, 280);

            dropdown.style.left = `${Math.max(margen, rect.left)}px`;
            dropdown.style.width = `${rect.width}px`;

            const espacioAbajo = window.innerHeight - rect.bottom;
            if (espacioAbajo < altura + margen && rect.top > altura + margen) {
                dropdown.style.bottom = `${window.innerHeight - rect.top + margen}px`;
                dropdown.style.top = "auto";
            } else {
                dropdown.style.top = `${rect.bottom + margen}px`;
                dropdown.style.bottom = "auto";
            }
        }

        async function cargar(forzar) {
            estado.items = await obtener(estado.opciones.cacheKey, estado.opciones.obtenerOpciones, forzar);
        }

        function abrir() {
            posicionar();
            dropdown.style.display = "block";
            window.addEventListener("scroll", posicionar, true);
            window.addEventListener("resize", posicionar);
        }

        function cerrar() {
            dropdown.style.display = "none";
            window.removeEventListener("scroll", posicionar, true);
            window.removeEventListener("resize", posicionar);
        }

        function render() {
            if (input.disabled) return;

            const bloqueado = estado.opciones.bloqueadoMsg?.();
            if (bloqueado) {
                dropdown.innerHTML = `<div class="catalog-combo-empty"></div>`;
                dropdown.querySelector(".catalog-combo-empty").textContent = bloqueado;
                abrir();
                return;
            }

            const texto = input.value.trim();
            const filtro = texto.toLowerCase();
            const activos = estado.items.filter(i => i.activo !== false);
            const coincidencias = activos
                .filter(i => !filtro || i.nombre.toLowerCase().includes(filtro))
                .slice(0, 50);
            const hayExacto = activos.some(i => i.nombre.toLowerCase() === filtro);

            const puedeCrear = !!estado.opciones.crear && !!texto && !hayExacto;

            if (!coincidencias.length && !puedeCrear) {
                dropdown.innerHTML = `<div class="catalog-combo-empty">Sin coincidencias</div>`;
            } else {
                dropdown.innerHTML = "";
                coincidencias.forEach(item => {
                    const el = document.createElement("div");
                    el.className = "catalog-combo-item";
                    el.innerHTML = `<span class="catalog-combo-item-nombre"></span>`;
                    el.querySelector(".catalog-combo-item-nombre").textContent = item.nombre;
                    el.addEventListener("mousedown", e => {
                        e.preventDefault();
                        input.value = item.nombre;
                        input.dataset.catalogId = item.id;
                        cerrar();
                        estado.opciones.onSeleccionar?.(item);
                    });
                    dropdown.appendChild(el);
                });

                if (puedeCrear) {
                    const btn = document.createElement("div");
                    btn.className = "catalog-combo-item catalog-combo-item-crear";
                    btn.innerHTML = `<span></span>`;
                    btn.querySelector("span").textContent = `+ Crear "${texto}"`;
                    btn.addEventListener("mousedown", async e => {
                        e.preventDefault();
                        btn.querySelector("span").textContent = "Creando…";
                        try {
                            const nuevo = await estado.opciones.crear(texto);
                            if (nuevo) {
                                estado.items.push(nuevo);
                                input.value = nuevo.nombre;
                                input.dataset.catalogId = nuevo.id;
                                estado.opciones.onSeleccionar?.(nuevo);
                            }
                        } finally {
                            cerrar();
                        }
                    });
                    dropdown.appendChild(btn);
                }
            }

            abrir();
        }

        input.addEventListener("focus", async () => {
            if (input.disabled) return;
            if (!estado.items.length) await cargar(false);
            render();
        });
        input.addEventListener("input", () => {
            delete input.dataset.catalogId; // texto libre distinto a la última selección
            render();
        });
        input.addEventListener("blur", () => setTimeout(cerrar, 150));

        estado.handle = {
            recargar: async () => { await cargar(true); render(); },
        };
        return estado.handle;
    }

    return { attach, invalidar };
})();

// Fechas: el backend entrega fechas sin hora como texto plano "yyyy-MM-dd" (sin timezone). El
// constructor `new Date("yyyy-MM-dd")` las interpreta como UTC medianoche, y toLocaleDateString()
// las convierte a la hora local del navegador — en timezones negativos (Chile, UTC-3/-4) eso
// corre la fecha mostrada un día hacia atrás siempre, sin importar la hora del día. Estas
// funciones nunca pasan una fecha por el parser UTC de Date: formatear() la arma por texto, y
// hoyISO() lee los componentes locales en vez de toISOString() (que también es UTC).
window.DateUtils = (function () {
    function formatear(valor) {
        if (!valor) return "-";
        const texto = String(valor);
        const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return texto;
        const [, anio, mes, dia] = m;
        return `${dia}-${mes}-${anio}`;
    }

    function hoyISO() {
        const d = new Date();
        const mes = String(d.getMonth() + 1).padStart(2, "0");
        const dia = String(d.getDate()).padStart(2, "0");
        return `${d.getFullYear()}-${mes}-${dia}`;
    }

    function mesActualISO() {
        const d = new Date();
        const mes = String(d.getMonth() + 1).padStart(2, "0");
        return `${d.getFullYear()}-${mes}`;
    }

    function primerDiaMesActualISO() {
        return `${mesActualISO()}-01`;
    }

    // Suma/resta días de calendario a una fecha "yyyy-MM-dd" sin pasar por conversión de
    // timezone (aritmética en UTC puro sobre los componentes, nunca en hora local).
    function sumarDias(fechaISO, dias) {
        const texto = String(fechaISO);
        const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return texto;
        const [, anio, mes, dia] = m;
        const utc = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
        utc.setUTCDate(utc.getUTCDate() + dias);
        const y = utc.getUTCFullYear();
        const mo = String(utc.getUTCMonth() + 1).padStart(2, "0");
        const d = String(utc.getUTCDate()).padStart(2, "0");
        return `${y}-${mo}-${d}`;
    }

    return { formatear, hoyISO, mesActualISO, primerDiaMesActualISO, sumarDias };
})();

// Matriz de permisos por módulo (Gestión de Usuarios INNPACK y Faret, solo ADMIN_TI).
// Filas = botones del sidebar de la empresa (mismo orden y nombre que ve el usuario).
// Un permiso personalizado solo se guarda si difiere del nivel que da el rol; volver al nivel
// del rol lo quita. El bloqueo real vive en el backend (PermisosService + API).
window.PermisosMatriz = (function () {
    const NIVELES = [
        { valor: "SIN_ACCESO", texto: "Sin acceso" },
        { valor: "VER", texto: "Solo vista" },
        { valor: "EDITAR", texto: "Editar" },
    ];

    function esc(t) {
        return String(t ?? "")
            .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    function modulosSidebar(empresa) {
        return Array.from(document.querySelectorAll(`#sidebar [data-module][data-empresa="${empresa}"]`))
            .map(b => ({ modulo: b.getAttribute("data-module"), nombre: (b.textContent || "").trim() }));
    }

    // opts: { nombre, rol, empresa, cargar(), guardar(permisos), restablecer() } — cada función
    // devuelve la respuesta del PhotinoBridge ({ ok, data, error }).
    function abrir(opts) {
        cerrar();

        const overlay = document.createElement("div");
        overlay.id = "permisos-matriz-overlay";
        overlay.style.cssText = "position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:9000; display:flex; align-items:center; justify-content:center;";
        overlay.innerHTML = `
            <div style="background:#fff; border-radius:12px; width:min(760px, 94vw); max-height:88vh; display:flex; flex-direction:column; box-shadow:0 20px 50px rgba(0,0,0,0.3);">
                <div style="padding:18px 22px; border-bottom:1px solid #E2E8F0;">
                    <div style="font-size:17px; font-weight:700; color:#0F172A;">Permisos de ${esc(opts.nombre)}</div>
                    <div style="font-size:13px; color:#475569; margin-top:4px;">
                        Rol: <strong>${esc(opts.rol || "-")}</strong> — define el valor inicial de cada módulo.
                        Un permiso personalizado manda sobre el rol.
                    </div>
                </div>
                <div id="pm-mensaje" style="display:none; margin:12px 22px 0; padding:8px 12px; border-radius:8px; font-size:13px; font-weight:600;"></div>
                <div id="pm-cuerpo" style="padding:12px 22px; overflow-y:auto;">Cargando...</div>
                <div style="padding:14px 22px; border-top:1px solid #E2E8F0; display:flex; gap:10px; justify-content:flex-end;">
                    <button id="pm-restablecer" class="btn-secondary" type="button">Restablecer permisos</button>
                    <button id="pm-cerrar" class="btn-secondary" type="button">Cerrar</button>
                    <button id="pm-guardar" class="btn-primary" type="button">Guardar</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const estado = { filas: [] };
        const $ = sel => overlay.querySelector(sel);

        function mensaje(texto, ok) {
            const el = $("#pm-mensaje");
            el.textContent = texto;
            el.style.display = "block";
            el.style.background = ok ? "#ECFDF5" : "#FEF2F2";
            el.style.color = ok ? "#065F46" : "#991B1B";
        }

        async function cargar() {
            $("#pm-cuerpo").textContent = "Cargando...";
            let res;
            try {
                res = await opts.cargar();
            } catch {
                res = { ok: false, error: "Error de comunicación con el backend" };
            }
            if (!res || !res.ok) {
                $("#pm-cuerpo").textContent = "";
                mensaje(res?.error || "No se pudieron cargar los permisos", false);
                return;
            }
            render(res.data || {});
        }

        function render(data) {
            const porModulo = {};
            (data.modulos || []).forEach(m => { porModulo[m.modulo] = m; });
            estado.filas = modulosSidebar(opts.empresa)
                .filter(s => porModulo[s.modulo])
                .map(s => ({ ...porModulo[s.modulo], nombre: s.nombre }));
            const bloqueado = data.esAdminTi === true;

            $("#pm-guardar").disabled = bloqueado;
            $("#pm-restablecer").disabled = bloqueado;

            const aviso = bloqueado
                ? `<div style="padding:10px 12px; background:#EFF6FF; color:#1E3A8A; border-radius:8px; font-size:13px; margin-bottom:10px;">
                       ADMIN_TI tiene acceso total a todos los módulos: sus permisos no se personalizan.
                   </div>`
                : "";

            $("#pm-cuerpo").innerHTML = aviso + `
                <table class="table" style="width:100%;">
                    <thead>
                        <tr>
                            <th>Módulo</th>
                            ${NIVELES.map(n => `<th style="text-align:center;">${n.texto}</th>`).join("")}
                            <th>Origen</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${estado.filas.map(f => {
                            const actual = bloqueado ? "EDITAR" : (f.personalizado || f.porRol);
                            const detalle = f.modificadoPor
                                ? ` (${esc(f.modificadoPor)}${f.fechaModificacion ? ", " + esc(window.DateUtils.formatear(f.fechaModificacion)) : ""})`
                                : "";
                            const origen = f.personalizado ? `Personalizado${detalle}` : "Por rol";
                            return `
                                <tr data-modulo="${esc(f.modulo)}">
                                    <td>${esc(f.nombre)}</td>
                                    ${NIVELES.map(n => `
                                        <td style="text-align:center;">
                                            <input type="radio" name="pm-${esc(f.modulo)}" value="${n.valor}"
                                                ${actual === n.valor ? "checked" : ""}
                                                ${bloqueado || (f.minimoVer && n.valor === "SIN_ACCESO") ? "disabled" : ""}>
                                        </td>`).join("")}
                                    <td style="font-size:12px; color:#475569;">${origen}</td>
                                </tr>`;
                        }).join("")}
                    </tbody>
                </table>`;

            $("#pm-cuerpo").querySelectorAll("input[type=radio]").forEach(r =>
                r.addEventListener("change", () => {
                    r.closest("tr").style.background = "#FEF9C3";
                }));
        }

        function cambios() {
            const lista = [];
            estado.filas.forEach(f => {
                const elegido = $(`input[name="pm-${CSS.escape(f.modulo)}"]:checked`)?.value;
                if (!elegido) return;
                const deseado = elegido === f.porRol ? null : elegido;
                if (deseado !== (f.personalizado || null)) {
                    lista.push({ modulo: f.modulo, nivel: deseado });
                }
            });
            return lista;
        }

        $("#pm-cerrar").addEventListener("click", cerrar);

        $("#pm-guardar").addEventListener("click", async () => {
            const lista = cambios();
            if (!lista.length) {
                mensaje("Sin cambios", true);
                return;
            }
            $("#pm-guardar").disabled = true;
            try {
                const res = await opts.guardar(lista);
                if (!res || !res.ok) {
                    mensaje(res?.error || "No se pudieron guardar los permisos", false);
                    return;
                }
                await cargar();
                mensaje("Permisos guardados correctamente", true);
            } catch {
                mensaje("Error de comunicación con el backend", false);
            } finally {
                $("#pm-guardar").disabled = false;
            }
        });

        $("#pm-restablecer").addEventListener("click", async () => {
            if (!window.confirm(`¿Restablecer los permisos de "${opts.nombre}" a los de su rol?`)) return;
            try {
                const res = await opts.restablecer();
                if (!res || !res.ok) {
                    mensaje(res?.error || "No se pudieron restablecer los permisos", false);
                    return;
                }
                await cargar();
                mensaje("Permisos restablecidos al comportamiento por rol", true);
            } catch {
                mensaje("Error de comunicación con el backend", false);
            }
        });

        cargar();
    }

    function cerrar() {
        document.getElementById("permisos-matriz-overlay")?.remove();
    }

    return { abrir, cerrar };
})();

// Columna "Liberación Calidad" de No Conformidades (INNPACK: no-conformidades, Faret: faret-nc):
// inspectores que liberaron la NP + código de producto según los certificados de liberación de
// fps-api. Varios inspectores distintos → todos, el más reciente primero, separados por " / ".
// Caché por empresa: cada NP se consulta una sola vez por sesión del módulo.
window.LiberacionCalidad = (function () {
    const cache = {};   // empresa -> { "np|codigo": [{ inspector, fecha, folio, liberaciones }] }
    const consultadas = {}; // empresa -> Set de NP ya consultadas
    let error = false;

    function clave(np, codigo) {
        return `${String(np ?? "").trim()}|${String(codigo ?? "").trim()}`;
    }

    function esc(t) {
        return String(t ?? "")
            .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    // Carga las NP que falten (solo numéricas). empresa: "INNPACK" | "FARET".
    async function cargar(nps, empresa) {
        cache[empresa] = cache[empresa] || {};
        consultadas[empresa] = consultadas[empresa] || new Set();

        const faltan = [...new Set((nps || []).map(n => String(n ?? "").trim()))]
            .filter(n => /^\d{1,15}$/.test(n) && !consultadas[empresa].has(n));
        if (!faltan.length) return;

        try {
            const res = await window.PhotinoBridge.send({ action: "liberacionCalidad.inspectores", data: { nps: faltan } });
            if (!res || !res.ok) {
                error = true;
                return;
            }
            error = false;
            faltan.forEach(n => consultadas[empresa].add(n));

            (res.data || [])
                .filter(r => String(r.Empresa || "").toUpperCase().includes(empresa))
                .forEach(r => {
                    const k = clave(r.Np, r.CodigoArticulo);
                    (cache[empresa][k] = cache[empresa][k] || []).push({
                        inspector: r.Inspector || "-",
                        // fps-api manda la fecha de BD con "Z" (useUTC): se usa la parte de fecha tal
                        // cual, sin convertir a hora local (ver FpsFechas en la API INNPACK).
                        fecha: String(r.UltimaLiberacion || "").slice(0, 10),
                        folio: Number(r.UltimoFolio) || 0,
                        liberaciones: Number(r.Liberaciones) || 0,
                    });
                });
            Object.values(cache[empresa]).forEach(lista => lista.sort((a, b) => b.folio - a.folio));
        } catch {
            error = true;
        }
    }

    // Estado de una fila: null = aún sin consultar; [] = sin liberación.
    function lista(np, codigo, empresa) {
        const n = String(np ?? "").trim();
        if (!/^\d{1,15}$/.test(n)) return [];
        if (!consultadas[empresa]?.has(n)) return null;
        return cache[empresa]?.[clave(n, codigo)] || [];
    }

    // Texto plano (Excel / impresión).
    function texto(np, codigo, empresa) {
        const l = lista(np, codigo, empresa);
        if (l === null) return error ? "No disponible" : "";
        return l.length ? l.map(x => x.inspector).join(" / ") : "-";
    }

    // HTML de la celda (con detalle de folio/fecha al pasar el mouse).
    function celda(np, codigo, empresa) {
        const l = lista(np, codigo, empresa);
        if (l === null) return error ? "No disponible" : `<span style="opacity:0.5;">…</span>`;
        if (!l.length) return "-";
        const detalle = l
            .map(x => `${x.inspector}: ${x.liberaciones} liberación(es), última folio ${x.folio} (${x.fecha})`)
            .join("\n");
        return `<span title="${esc(detalle)}">${esc(l.map(x => x.inspector).join(" / "))}</span>`;
    }

    return { cargar, texto, celda };
})();
