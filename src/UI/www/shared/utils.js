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

    return { init, preservarScroll };
})();
