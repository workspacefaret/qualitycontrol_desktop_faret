window.FaretInspeccionesPalletController = class FaretInspeccionesPalletController {

    init() {
        console.log("FaretInspeccionesPalletController iniciado");

        this._page = 1;
        this._pageSize = 50;
        this._totalCount = 0;
        this._items = [];
        this._sortCampo = null;
        this._sortAsc = true;

        document.getElementById("fip-refresh-btn")
            ?.addEventListener("click", () => this._loadAll());

        document.getElementById("fip-filtrar-btn")
            ?.addEventListener("click", () => { this._page = 1; this._loadAll(); });

        document.getElementById("fip-limpiar-btn")
            ?.addEventListener("click", () => this._limpiarFiltros());

        document.getElementById("fip-anterior-btn")
            ?.addEventListener("click", () => this._irPagina(this._page - 1));

        document.getElementById("fip-siguiente-btn")
            ?.addEventListener("click", () => this._irPagina(this._page + 1));

        document.querySelectorAll(".fip-th-ordenable").forEach(th =>
            th.addEventListener("click", () => this._ordenarPor(th.dataset.campo)));

        document.getElementById("fip-exportar-btn")
            ?.addEventListener("click", () => this._exportar());

        document.getElementById("fip-imprimir-btn")
            ?.addEventListener("click", () => this._imprimir());

        document.getElementById("fip-tbody")?.addEventListener("click", (e) => {
            const editarBtn = e.target.closest(".fip-editar-btn");
            if (editarBtn) this._editar(editarBtn.dataset.id);

            const histBtn = e.target.closest(".fie-historial-btn");
            if (histBtn) window.InspeccionesEdicion.verHistorial("faret.inspeccionesPallet.auditoria", histBtn.dataset.id, `Control pallet/papel #${histBtn.dataset.id}`);

            const verBtn = e.target.closest(".fip-ver-checklist-btn");
            if (verBtn) this._verChecklist(verBtn.dataset.id);

            const eliminarBtn = e.target.closest(".fip-eliminar-btn");
            if (eliminarBtn) this._eliminar(eliminarBtn.dataset.id);
        });

        this._filasFijas = window.TableUtils.init(
            document.getElementById("fip-tabla"),
            document.getElementById("fip-filas-fijadas")
        );

        this._loadAll();
    }

    destroy() {
        console.log("FaretInspeccionesPalletController destruido");
    }

    _getFiltros() {
        return {
            fechaDesde: document.getElementById("fip-filtro-fecha-desde")?.value || "",
            fechaHasta: document.getElementById("fip-filtro-fecha-hasta")?.value || "",
            tipoMaterial: document.getElementById("fip-filtro-tipo-material")?.value || "",
            numeroPallet: document.getElementById("fip-filtro-numero-pallet")?.value.trim() || "",
            operador: document.getElementById("fip-filtro-operador")?.value.trim() || "",
            maquina: document.getElementById("fip-filtro-maquina")?.value.trim() || "",
        };
    }

    _limpiarFiltros() {
        document.getElementById("fip-filtro-fecha-desde").value = "";
        document.getElementById("fip-filtro-fecha-hasta").value = "";
        document.getElementById("fip-filtro-tipo-material").value = "";
        document.getElementById("fip-filtro-numero-pallet").value = "";
        document.getElementById("fip-filtro-operador").value = "";
        document.getElementById("fip-filtro-maquina").value = "";
        this._page = 1;
        this._loadAll();
    }

    _irPagina(pagina) {
        if (pagina < 1) return;
        this._page = pagina;
        this._loadLista();
    }

    async _loadAll() {
        await Promise.all([this._loadLista(), this._poblarFiltrosSelect()]);
    }

    // Arma las opciones de los <select> de Operador/Máquina con los valores reales de TODOS los
    // registros (sin filtros), no solo la página visible — reutiliza _traerTodosLosRegistros.
    async _poblarFiltrosSelect() {
        const items = await this._traerTodosLosRegistros({});

        const mapa = {
            "fip-filtro-operador": "operador",
            "fip-filtro-maquina": "maquina",
        };

        Object.entries(mapa).forEach(([selectId, campo]) => {
            const select = document.getElementById(selectId);
            if (!select) return;

            const valorActual = select.value;
            const valores = new Set(
                items.map(r => (r[campo] || "").toString().trim()).filter(Boolean)
            );

            select.innerHTML = `<option value="">Todos</option>` +
                [...valores].sort().map(v => `<option value="${v}">${v}</option>`).join("");

            if (valorActual && valores.has(valorActual)) select.value = valorActual;
        });
    }

    async _loadLista() {
        const contenedor = document.getElementById("fip-tabla")?.closest(".table-container");
        await window.TableUtils.preservarScroll(contenedor, () => this._loadListaInterna());
    }

    async _loadListaInterna() {
        const loadingEl = document.getElementById("fip-loading");
        const errorEl = document.getElementById("fip-error");

        loadingEl.style.display = "block";
        errorEl.style.display = "none";

        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.inspeccionesPallet.list",
                page: this._page,
                pageSize: this._pageSize,
                ...this._getFiltros(),
            });

            if (!res.ok) {
                this._aplicarListaVacia();
                return;
            }

            this._totalCount = res.data.totalCount ?? 0;
            this._page = res.data.page ?? this._page;
            this._items = Array.isArray(res.data.items) ? res.data.items : [];
            this._sortCampo = null;
            this._renderTabla(this._items);
            this._renderPaginacion();
        } catch {
            this._aplicarListaVacia();
        } finally {
            loadingEl.style.display = "none";
        }
    }

    _aplicarListaVacia() {
        this._totalCount = 0;
        this._items = [];
        this._renderTabla([]);
        this._renderPaginacion();
    }

    _ordenarPor(campo) {
        if (!campo || !this._items.length) return;

        this._sortAsc = this._sortCampo === campo ? !this._sortAsc : true;
        this._sortCampo = campo;

        const ordenados = [...this._items].sort((a, b) => {
            const valorA = a[campo] ?? "";
            const valorB = b[campo] ?? "";
            if (valorA < valorB) return this._sortAsc ? -1 : 1;
            if (valorA > valorB) return this._sortAsc ? 1 : -1;
            return 0;
        });

        this._renderTabla(ordenados);
        this._actualizarIconosOrden();
    }

    _actualizarIconosOrden() {
        document.querySelectorAll(".fip-th-ordenable").forEach(th => {
            const activo = th.dataset.campo === this._sortCampo;
            th.classList.toggle("fip-th-activo", activo);
            const icono = th.querySelector(".fip-sort-icon");
            if (icono) icono.textContent = activo ? (this._sortAsc ? "↑" : "↓") : "↕";
        });
    }

    _formatoFecha(fecha) {
        return window.DateUtils.formatear(fecha);
    }

    _renderTabla(items) {
        const tbody = document.getElementById("fip-tbody");

        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="13">${this._emptyStateHtml()}</td></tr>`;
            this._filasFijas?.refrescar();
            return;
        }

        tbody.innerHTML = items.map(i => `
            <tr data-id="${i.id}">
                <td>${this._formatoFecha(i.fechaRegistro)}</td>
                <td>${i.horaRegistro ?? "-"}</td>
                <td>${this._operadorTexto(i)}</td>
                <td>${this._escape(i.tipoMaterial ?? "-")}</td>
                <td>${this._escape(i.numeroPallet ?? "-")}</td>
                <td>${this._escape(i.dimension ?? "-")}</td>
                <td>${this._escape(i.fibra ?? "-")}</td>
                <td>${this._escape(i.areaControl ?? "-")}</td>
                <td>${this._escape(i.maquina ?? "-")}</td>
                <td>${this._celdaChecklist(i)}</td>
                <td>${window.InspeccionesEdicion.celdaEdicion(i)}</td>
                <td>${window.InspeccionesEdicion.puedeEditar() ? `<button class="btn-secondary fip-editar-btn" data-id="${i.id}" data-requiere-editar>Editar</button> ` : ""}<button class="btn-secondary fip-eliminar-btn" data-id="${i.id}">Eliminar</button></td>
            </tr>
        `).join("");

        this._filasFijas?.refrescar();
    }

    _operadorTexto(i) {
        return this._escape(i.operador === "Otros" ? (i.operadorOtro || "Otros") : (i.operador ?? "-"));
    }

    _celdaChecklist(i) {
        const noCumple = i.totalNoCumple ?? 0;
        const color = noCumple > 0 ? "color:#B91C1C;font-weight:600;" : "color:#059669;font-weight:600;";
        const etiqueta = noCumple > 0 ? `${noCumple} no cumple` : "OK";
        return `<button class="btn-secondary fip-ver-checklist-btn" data-id="${i.id}">
            Ver checklist (<span style="${color}">${etiqueta}</span>)
        </button>`;
    }

    async _eliminar(id) {
        if (!confirm("¿Eliminar este registro de control pallet/papel? Esta acción no se puede deshacer desde la pantalla.")) return;

        try {
            const res = await window.PhotinoBridge.send({ action: "faret.inspeccionesPallet.eliminar", id: Number(id) });
            if (!res.ok) {
                alert(res.error || "Error al eliminar el registro");
                return;
            }
            this._loadAll();
        } catch {
            alert("Error de comunicación con el backend");
        }
    }

    _emptyStateHtml() {
        return `
            <div class="fip-empty-state">
                <div class="fip-empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 15h3M8 18h5"/></svg>
                </div>
                <div class="fip-empty-state-title">No hay registros para los filtros aplicados</div>
                <div class="fip-empty-state-subtitle">Los registros enviados desde la aplicación móvil FARET (formulario Control Pallet / Papel) aparecerán aquí.</div>
            </div>
        `;
    }

    _renderPaginacion() {
        const totalPaginas = Math.max(1, Math.ceil(this._totalCount / this._pageSize));
        document.getElementById("fip-pagina-info").textContent = `Página ${this._page} de ${totalPaginas}`;
        document.getElementById("fip-anterior-btn").disabled = this._page <= 1;
        document.getElementById("fip-siguiente-btn").disabled =
            this._page >= totalPaginas || this._totalCount === 0;
    }

    _hayFiltrosActivos() {
        const f = this._getFiltros();
        return Object.values(f).some(v => String(v || "").trim() !== "");
    }

    // Excel y PDF salen siempre de los datos (todas las páginas que cumplen los filtros), no de la tabla visible.
    async _exportar() {
        const items = await this._traerTodosLosRegistros();
        const tabla = this._construirTablaTemp(items, true);
        window.ExcelExporter.exportTable({
            tableSelector: "#fip-tabla-export-temp",
            fileName: `faret_inspecciones_pallet_${this._hayFiltrosActivos() ? "filtrado" : "todos"}_${Date.now()}.xlsx`,
            sheetName: "Inspecciones Pallet-Papel",
            title: `QCC Faret - Inspecciones Pallet / Papel · ${this._resumenFiltrosTexto()}`,
        });
        tabla.remove();
    }

    async _imprimir() {
        const items = await this._traerTodosLosRegistros();
        const tabla = this._construirTablaTemp(items, false);
        window.PrintExporter.printTable({
            tableSelector: "#fip-tabla-export-temp",
            titulo: "Inspecciones Pallet / Papel",
            empresa: "FARET",
            subtitulo: this._escape(this._resumenFiltrosTexto()),
            totalRegistros: items.length,
        });
        tabla.remove();
    }

    _resumenFiltrosTexto() {
        const f = this._getFiltros();
        const partes = [];
        if (f.tipoMaterial) partes.push(`Tipo material: ${f.tipoMaterial}`);
        if (f.numeroPallet) partes.push(`N° Pallet: ${f.numeroPallet}`);
        if (f.operador) partes.push(`Operador: ${f.operador}`);
        if (f.maquina) partes.push(`Máquina: ${f.maquina}`);
        if (f.fechaDesde) partes.push(`Fecha desde: ${f.fechaDesde}`);
        if (f.fechaHasta) partes.push(`Fecha hasta: ${f.fechaHasta}`);
        return partes.length ? partes.join(" · ") : "Sin filtros — histórico completo";
    }

    async _traerTodosLosRegistros(filtros = this._getFiltros()) {
        const pageSize = 500;
        let page = 1;
        let total = Infinity;
        const items = [];

        while (items.length < total && page <= 200) {
            const res = await window.PhotinoBridge.send({
                action: "faret.inspeccionesPallet.list",
                page,
                pageSize,
                ...filtros,
            });

            if (!res.ok) break;

            const lote = Array.isArray(res.data.items) ? res.data.items : [];
            if (!lote.length) break;

            items.push(...lote);
            total = res.data.totalCount ?? items.length;
            page++;
        }

        return items;
    }

    // Tabla oculta que alimenta Excel y PDF. `completa` (Excel) agrega pasadas de prensa y observaciones; el PDF queda compacto.
    // El detalle del checklist (qué ítems no cumplen) no viene en el listado: se informa la cantidad y se ve con "Ver checklist".
    _construirTablaTemp(items, completa = false) {
        const IE = window.InspeccionesEdicion;
        const tabla = document.createElement("table");
        tabla.id = "fip-tabla-export-temp";
        tabla.style.position = "absolute";
        tabla.style.left = "-99999px";
        tabla.style.top = "0";

        // En el PDF (compacto) fecha y hora van juntas y cada columna tiene un ancho fijo en %.
        const ANCHO_PDF = { "Fecha / hora": 9, "Operador Calidad": 12, "Tipo material": 7, "N° Pallet": 9, "Dimensión": 8, "Fibra": 7,
            "Área de control": 10, "Máquina": 10, "No cumple": 6, "Última edición": 22 };
        const cols = [
            ...(completa
                ? [["Fecha", i => this._formatoFecha(i.fechaRegistro)], ["Hora", i => i.horaRegistro ?? "-"]]
                : [["Fecha / hora", i => `${this._formatoFecha(i.fechaRegistro)} ${(i.horaRegistro ?? "").slice(0, 5)}`.trim()]]),
            ["Operador Calidad", i => (i.operador === "Otros" ? (i.operadorOtro || "Otros") : (i.operador ?? "-"))],
            ["Tipo material", i => i.tipoMaterial ?? "-"],
            ["N° Pallet", i => i.numeroPallet ?? "-"],
            ["Dimensión", i => i.dimension ?? "-"],
            ["Fibra", i => i.fibra ?? "-"],
            ...(completa ? [["Pasadas de prensa", i => i.numeroPasadasPrensa ?? "-"]] : []),
            ["Área de control", i => i.areaControl ?? "-"],
            ["Máquina", i => i.maquina ?? "-"],
            ["No cumple", i => i.totalNoCumple ?? 0],
            ...(completa ? [["Observaciones", i => i.observaciones ?? "-"]] : []),
            ["Última edición", i => IE.textoEdicion(i)],
        ];

        const colgroup = completa ? "" : `<colgroup>${cols.map(c => `<col style="width:${ANCHO_PDF[c[0]] ?? 8}%">`).join("")}</colgroup>`;
        tabla.innerHTML = `
            ${colgroup}
            <thead><tr>${cols.map(c => `<th>${c[0]}</th>`).join("")}</tr></thead>
            <tbody>
                ${items.map(i => `<tr>${cols.map(c => `<td>${IE.esc(c[1](i))}</td>`).join("")}</tr>`).join("")}
            </tbody>
        `;

        document.body.appendChild(tabla);
        return tabla;
    }

    // ---------- Edición (ADMIN, ADMIN_TI, INSPECTOR) ----------

    async _editar(id) {
        const IE = window.InspeccionesEdicion;
        const reg = this._items.find(x => Number(x.id) === Number(id));
        if (!reg) return;

        let detalle;
        try {
            const res = await window.PhotinoBridge.send({ action: "faret.inspeccionesPallet.get", id: Number(id) });
            if (!res.ok) { alert(res.error || "No se pudo cargar el registro"); return; }
            detalle = res.data;
        } catch {
            alert("Error de comunicación con el backend");
            return;
        }

        const respuestas = Array.isArray(detalle.respuestas) ? detalle.respuestas : [];
        const sel = (valor, ops) => ops.map(([v, t]) => `<option value="${IE.esc(v)}" ${String(valor ?? "") === String(v) ? "selected" : ""}>${IE.esc(t)}</option>`).join("");

        const cuerpo = `
            <div class="fie-campo"><label for="fie-tipo">Tipo de material <span class="fie-req">*</span></label>
                <select id="fie-tipo">${sel(detalle.tipoMaterial, [["NV", "NV"], ["PAPEL", "PAPEL"]])}</select></div>
            ${IE.campo("fie-pallet", "N° de pallet", detalle.numeroPallet, { requerido: true, max: 100 })}
            ${IE.campo("fie-dimension", "Dimensión", detalle.dimension, { requerido: true, max: 100 })}
            ${IE.campo("fie-fibra", "Fibra", detalle.fibra, { max: 50 })}
            <div class="fie-campo"><label for="fie-pasadas">Pasadas de prensa</label>
                <select id="fie-pasadas">${sel(detalle.numeroPasadasPrensa, [["", "—"], ["1", "1"], ["2", "2"], ["3", "3"]])}</select></div>
            ${IE.campo("fie-area", "Área de control", detalle.areaControl, { max: 100 })}
            ${IE.campo("fie-maquina", "Máquina", detalle.maquina, { max: 150 })}
            ${IE.campo("fie-operador", "Operador", detalle.operador)}
            ${IE.campo("fie-operador-otro", "Operador (otro)", detalle.operadorOtro)}
            ${IE.area("fie-obs", "Observaciones", detalle.observaciones)}
            <div class="fie-seccion" id="fie-checklist">
                <div class="fie-seccion-titulo">Checklist (las preguntas del registro no se agregan ni se quitan)</div>
                ${respuestas.map(r => `
                    <div class="fie-chk-resp" data-pid="${r.preguntaId}">
                        <span>${IE.esc(r.texto ?? "-")}</span>
                        <select class="fie-res">${sel(r.resultado, [["CUMPLE", "CUMPLE"], ["NO_CUMPLE", "NO CUMPLE"]])}</select>
                        <input class="fie-obs fie-obs-resp" type="text" placeholder="Observación (obligatoria si NO CUMPLE)" value="${IE.esc(r.observacion ?? "")}">
                    </div>`).join("") || `<div class="fie-nota">Sin respuestas.</div>`}
            </div>
            <div class="fie-nota fie-ancho">Fecha, hora y operador que registró no se editan.</div>`;

        IE.abrirModal({
            titulo: `Editar control pallet/papel #${detalle.id}`,
            subtitulo: `${this._formatoFecha(detalle.fechaRegistro)} ${detalle.horaRegistro ?? ""}`,
            cuerpoHtml: cuerpo,
            recolectar: (root) => {
                const v = (s) => root.querySelector(s).value;
                for (const [idc, nombre] of [["fie-pallet", "N° de pallet"], ["fie-dimension", "Dimensión"]]) {
                    if (!IE.norm(v("#" + idc))) return { error: `${nombre} es obligatorio.` };
                }
                const payload = {};
                const campos = [
                    ["tipoMaterial", "#fie-tipo", detalle.tipoMaterial], ["numeroPallet", "#fie-pallet", detalle.numeroPallet],
                    ["dimension", "#fie-dimension", detalle.dimension], ["fibra", "#fie-fibra", detalle.fibra],
                    ["areaControl", "#fie-area", detalle.areaControl], ["maquina", "#fie-maquina", detalle.maquina],
                    ["operador", "#fie-operador", detalle.operador], ["operadorOtro", "#fie-operador-otro", detalle.operadorOtro],
                    ["observaciones", "#fie-obs", detalle.observaciones],
                ];
                for (const [clave, selector, original] of campos) {
                    if (IE.norm(v(selector)) !== IE.norm(original)) payload[clave] = IE.norm(v(selector));
                }
                const pas = IE.norm(v("#fie-pasadas"));
                if (String(pas ?? "") !== String(detalle.numeroPasadasPrensa ?? "")) payload.numeroPasadasPrensa = pas === null ? null : Number(pas);

                const nuevas = [...root.querySelectorAll(".fie-chk-resp")].map(el => ({
                    preguntaId: Number(el.dataset.pid),
                    resultado: el.querySelector(".fie-res").value,
                    observacion: IE.norm(el.querySelector(".fie-obs-resp").value),
                }));
                for (const n of nuevas) {
                    if (n.resultado === "NO_CUMPLE" && !n.observacion) return { error: "Toda respuesta NO CUMPLE necesita una observación." };
                }
                const cambioChecklist = nuevas.some(n => {
                    const o = respuestas.find(r => Number(r.preguntaId) === n.preguntaId);
                    return !o || o.resultado !== n.resultado || IE.norm(o.observacion) !== n.observacion;
                });
                if (cambioChecklist) payload.respuestas = nuevas;

                if (!Object.keys(payload).length) return { error: "No hay cambios que guardar." };
                return { action: "faret.inspeccionesPallet.actualizar", id: detalle.id, payload };
            },
            alGuardar: () => this._loadAll(),
        });
    }

    async _verChecklist(id) {
        this._cerrarChecklist();

        const modal = document.createElement("div");
        modal.id = "fip-modal-checklist";
        modal.style.position = "fixed";
        modal.style.left = "0";
        modal.style.top = "0";
        modal.style.width = "100%";
        modal.style.height = "100%";
        modal.style.background = "rgba(15, 23, 42, 0.75)";
        modal.style.zIndex = "9999";
        modal.style.display = "flex";
        modal.style.alignItems = "center";
        modal.style.justifyContent = "center";
        modal.style.padding = "24px";

        modal.innerHTML = `
            <div style="
                background:#ffffff;
                border-radius:12px;
                max-width:640px;
                width:100%;
                max-height:90%;
                overflow-y:auto;
                padding:16px;
                box-shadow:0 20px 60px rgba(0,0,0,0.35);
                position:relative;
            ">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;">
                    <strong>Checklist del registro</strong>
                    <button id="fip-cerrar-checklist-btn" class="btn-secondary" type="button">Cerrar</button>
                </div>
                <div id="fip-checklist-contenido" style="min-width:280px;min-height:120px;color:#64748B;">
                    Cargando...
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.addEventListener("click", (e) => { if (e.target === modal) this._cerrarChecklist(); });
        document.getElementById("fip-cerrar-checklist-btn")
            ?.addEventListener("click", () => this._cerrarChecklist());

        try {
            const res = await window.PhotinoBridge.send({ action: "faret.inspeccionesPallet.get", id: Number(id) });
            const contenido = document.getElementById("fip-checklist-contenido");
            if (!contenido) return; // el modal ya se cerró antes de que llegara la respuesta

            if (!res.ok) {
                contenido.innerHTML = `<div class="faret-error">${this._escape(res.error || "Error al cargar el checklist")}</div>`;
                return;
            }

            const respuestas = Array.isArray(res.data?.respuestas) ? res.data.respuestas : [];
            if (!respuestas.length) {
                contenido.innerHTML = `<div>Sin respuestas disponibles.</div>`;
                return;
            }

            this._renderChecklist(respuestas);
        } catch {
            const contenido = document.getElementById("fip-checklist-contenido");
            if (contenido) contenido.innerHTML = `<div class="faret-error">Error de comunicación con el backend</div>`;
        }
    }

    _renderChecklist(respuestas) {
        const contenido = document.getElementById("fip-checklist-contenido");
        if (!contenido) return;

        contenido.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:10px;">
                ${respuestas.map(r => `
                    <div style="border:1px solid #E5E9F0;border-radius:10px;padding:10px 14px;">
                        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
                            <span style="color:#1E293B;font-size:13px;">${this._escape(r.texto ?? "-")}</span>
                            <span style="font-weight:700;font-size:12px;white-space:nowrap;color:${r.resultado === "NO_CUMPLE" ? "#B91C1C" : "#059669"};">
                                ${r.resultado === "NO_CUMPLE" ? "NO CUMPLE" : "CUMPLE"}
                            </span>
                        </div>
                        ${r.observacion ? `<div style="margin-top:6px;font-size:12px;color:#64748B;">${this._escape(r.observacion)}</div>` : ""}
                    </div>
                `).join("")}
            </div>
        `;
    }

    _cerrarChecklist() {
        const modal = document.getElementById("fip-modal-checklist");
        if (modal) modal.remove();
    }

    _escape(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }
};
