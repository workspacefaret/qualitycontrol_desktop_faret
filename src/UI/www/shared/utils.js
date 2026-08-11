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

    function emparejarBobinas(codigo, descripcion, lote) {
        const codigos = parsearListaBobinas(codigo);
        const descripciones = parsearListaBobinas(descripcion);
        const lotes = parsearListaBobinas(lote);
        const total = Math.max(codigos.length, descripciones.length, lotes.length);

        const pares = [];
        for (let i = 0; i < total; i++) {
            pares.push({
                codigo: codigos[i] || "",
                descripcion: descripciones[i] || "",
                lote: lotes[i] || "",
            });
        }
        return pares;
    }

    // Resumen listo para renderizar: primera bobina + cuántas quedan + el listado completo.
    function resumenBobinas(codigo, descripcion, lote) {
        const pares = emparejarBobinas(codigo, descripcion, lote);
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
