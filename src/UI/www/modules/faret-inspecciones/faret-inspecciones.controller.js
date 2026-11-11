window.FaretInspeccionesController = class FaretInspeccionesController {

    init() {
        console.log("FaretInspeccionesController iniciado");

        this._page = 1;
        this._pageSize = 50;
        this._totalCount = 0;
        this._items = [];
        this._sortCampo = null;
        this._sortAsc = true;

        document.getElementById("fi-refresh-btn")
            ?.addEventListener("click", () => this._loadAll());

        document.getElementById("fi-filtrar-btn")
            ?.addEventListener("click", () => { this._page = 1; this._loadAll(); });

        document.getElementById("fi-limpiar-btn")
            ?.addEventListener("click", () => this._limpiarFiltros());

        document.getElementById("fi-anterior-btn")
            ?.addEventListener("click", () => this._irPagina(this._page - 1));

        document.getElementById("fi-siguiente-btn")
            ?.addEventListener("click", () => this._irPagina(this._page + 1));

        document.querySelectorAll(".fi-th-ordenable").forEach(th =>
            th.addEventListener("click", () => this._ordenarPor(th.dataset.campo)));

        document.getElementById("fi-exportar-btn")
            ?.addEventListener("click", () => this._exportar());

        document.getElementById("fi-imprimir-btn")
            ?.addEventListener("click", () => this._imprimir());

        document.getElementById("fi-tbody")?.addEventListener("click", (e) => {
            const verBtn = e.target.closest(".fi-ver-adjuntos-btn");
            if (verBtn) this._verAdjuntos(verBtn.dataset.id);

            const eliminarBtn = e.target.closest(".fi-eliminar-btn");
            if (eliminarBtn) this._eliminar(eliminarBtn.dataset.id);

            const editarBtn = e.target.closest(".fi-editar-btn");
            if (editarBtn) this._editar(editarBtn.dataset.id);

            const histBtn = e.target.closest(".fie-historial-btn");
            if (histBtn) window.InspeccionesEdicion.verHistorial("faret.inspecciones.auditoria", histBtn.dataset.id, `Inspección #${histBtn.dataset.id}`);
        });

        this._filasFijas = window.TableUtils.init(
            document.getElementById("fi-tabla"),
            document.getElementById("fi-filas-fijadas")
        );

        this._loadAll();
    }

    destroy() {
        console.log("FaretInspeccionesController destruido");
    }

    _getFiltros() {
        return {
            fechaDesde: document.getElementById("fi-filtro-fecha-desde")?.value || "",
            fechaHasta: document.getElementById("fi-filtro-fecha-hasta")?.value || "",
            nvFaret: document.getElementById("fi-filtro-nv-faret")?.value.trim() || "",
            areaControl: document.getElementById("fi-filtro-area")?.value || "",
            operador: document.getElementById("fi-filtro-operador")?.value.trim() || "",
            maquina: document.getElementById("fi-filtro-maquina")?.value.trim() || "",
            presentaDefectos: document.getElementById("fi-filtro-defectos")?.value || "",
            criticidad: document.getElementById("fi-filtro-criticidad")?.value || "",
        };
    }

    _limpiarFiltros() {
        document.getElementById("fi-filtro-fecha-desde").value = "";
        document.getElementById("fi-filtro-fecha-hasta").value = "";
        document.getElementById("fi-filtro-nv-faret").value = "";
        document.getElementById("fi-filtro-area").value = "";
        document.getElementById("fi-filtro-operador").value = "";
        document.getElementById("fi-filtro-maquina").value = "";
        document.getElementById("fi-filtro-defectos").value = "";
        const crit = document.getElementById("fi-filtro-criticidad");
        if (crit) crit.value = "";
        this._page = 1;
        this._loadAll();
    }

    _irPagina(pagina) {
        if (pagina < 1) return;
        this._page = pagina;
        this._loadLista();
    }

    async _loadAll() {
        await Promise.all([this._loadResumen(), this._loadLista(), this._poblarFiltrosSelect()]);
    }

    // Arma las opciones de los <select> de Operador/Máquina con los valores reales de TODOS los
    // registros (sin filtros), no solo la página visible — reutiliza _traerTodosLosRegistros.
    async _poblarFiltrosSelect() {
        const items = await this._traerTodosLosRegistros({});

        const mapa = {
            "fi-filtro-operador": "operador",
            "fi-filtro-maquina": "maquina",
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

    async _loadResumen() {
        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.inspecciones.resumen",
                ...this._getFiltros(),
            });

            this._renderResumen(res.ok ? res.data : null);
        } catch {
            this._renderResumen(null);
        }
    }

    _renderResumen(data) {
        document.getElementById("fi-kpi-hoy").textContent = data?.inspeccionesHoy ?? 0;
        document.getElementById("fi-kpi-periodo").textContent = data?.inspeccionesPeriodo ?? 0;
        document.getElementById("fi-kpi-con-defectos").textContent = data?.conDefectos ?? 0;
        document.getElementById("fi-kpi-sin-defectos").textContent = data?.sinDefectos ?? 0;
    }

    async _loadLista() {
        const contenedor = document.getElementById("fi-tabla")?.closest(".table-container");
        await window.TableUtils.preservarScroll(contenedor, () => this._loadListaInterna());
    }

    async _loadListaInterna() {
        const loadingEl = document.getElementById("fi-loading");
        const errorEl = document.getElementById("fi-error");

        loadingEl.style.display = "block";
        errorEl.style.display = "none";

        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.inspecciones.list",
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
        document.querySelectorAll(".fi-th-ordenable").forEach(th => {
            const activo = th.dataset.campo === this._sortCampo;
            th.classList.toggle("fi-th-activo", activo);
            const icono = th.querySelector(".fi-sort-icon");
            if (icono) icono.textContent = activo ? (this._sortAsc ? "↑" : "↓") : "↕";
        });
    }

    _formatoFecha(fecha) {
        return window.DateUtils.formatear(fecha);
    }

    _defectosBadge(presentaDefectos) {
        return presentaDefectos
            ? `<span style="color:#B91C1C;font-weight:600;">Sí</span>`
            : `<span style="color:#059669;font-weight:600;">No</span>`;
    }

    // Detalle por defecto del catálogo maestro (id de evento + criticidad). Los registros anteriores al catálogo no lo traen.
    _detalleDefectos(i) {
        let d = i.defectosDetalle;
        if (typeof d === "string") { try { d = JSON.parse(d); } catch { d = null; } }
        return Array.isArray(d) ? d : [];
    }

    _chipCriticidad(c) {
        const mapa = {
            Critico: ["Crítico", "#FEE2E2", "#991B1B"],
            Mayor: ["Mayor", "#FEF3C7", "#92400E"],
            Menor: ["Menor", "#E0F2FE", "#075985"],
        };
        const m = mapa[c];
        if (!m) return `<span style="color:#94A3B8;">—</span>`;
        return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${m[1]};color:${m[2]};">${m[0]}</span>`;
    }

    // Una línea por defecto, en el mismo orden en las 3 columnas (Defectos / ID evento / Criticidad).
    _lineas(items) {
        return items.length ? items.map(x => `<div class="fi-linea">${x}</div>`).join("") : "-";
    }

    _renderTabla(items) {
        const tbody = document.getElementById("fi-tbody");

        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="16">${this._emptyStateHtml()}</td></tr>`;
            this._filasFijas?.refrescar();
            return;
        }

        tbody.innerHTML = items.map(i => `
            <tr data-id="${i.id}">
                <td>${this._formatoFecha(i.fechaRegistro)}</td>
                <td>${i.horaRegistro ?? "-"}</td>
                <td>${this._escape(i.operadorRegistro ?? "-")}</td>
                <td>${this._escape(i.nvFaret ?? "-")}</td>
                <td>${this._escape(i.areaControl ?? "-")}</td>
                <td>${this._escape(i.maquina ?? "-")}</td>
                <td>${this._escape(i.operador === "Otros" ? (i.operadorOtro || "Otros") : (i.operador ?? "-"))}</td>
                <td>${this._defectosBadge(i.presentaDefectos)}</td>
                <td>${(() => { const d = this._detalleDefectos(i); return d.length ? this._lineas(d.map(x => this._escape(x.defecto))) : this._escape(i.defectos ?? "-"); })()}</td>
                <td>${(() => { const d = this._detalleDefectos(i); return d.length ? this._lineas(d.map(x => this._escape(x.idEvento || "—"))) : "-"; })()}</td>
                <td>${(() => { const d = this._detalleDefectos(i); return d.length ? this._lineas(d.map(x => this._chipCriticidad(x.criticidad))) : "-"; })()}</td>
                <td>${i.criticidadMax ? this._chipCriticidad(i.criticidadMax) : "-"}</td>
                <td>${this._escape(i.accionCorrectiva ?? "-")}</td>
                <td>${this._celdaAdjuntos(i)}</td>
                <td>${window.InspeccionesEdicion.celdaEdicion(i)}</td>
                <td>${window.InspeccionesEdicion.puedeEditar() ? `<button class="btn-secondary fi-editar-btn" data-id="${i.id}" data-requiere-editar>Editar</button> ` : ""}<button class="btn-secondary fi-eliminar-btn" data-id="${i.id}">Eliminar</button></td>
            </tr>
        `).join("");

        this._filasFijas?.refrescar();
    }

    _celdaAdjuntos(i) {
        const cantidad = i.cantidadAdjuntos ?? 0;
        if (!cantidad) return "0";
        return `<button class="btn-secondary fi-ver-adjuntos-btn" data-id="${i.id}">Ver adjuntos (${cantidad})</button>`;
    }

    async _eliminar(id) {
        if (!confirm("¿Eliminar este registro de inspección? Esta acción no se puede deshacer desde la pantalla.")) return;

        try {
            const res = await window.PhotinoBridge.send({ action: "faret.inspecciones.eliminar", id: Number(id) });
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
            <div class="fi-empty-state">
                <div class="fi-empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 15h3M8 18h5"/></svg>
                </div>
                <div class="fi-empty-state-title">No hay inspecciones para los filtros aplicados</div>
                <div class="fi-empty-state-subtitle">Las inspecciones enviadas desde la aplicación móvil FARET (formulario Calidad/Producción) aparecerán aquí.</div>
            </div>
        `;
    }

    _renderPaginacion() {
        const totalPaginas = Math.max(1, Math.ceil(this._totalCount / this._pageSize));
        document.getElementById("fi-pagina-info").textContent = `Página ${this._page} de ${totalPaginas}`;
        document.getElementById("fi-anterior-btn").disabled = this._page <= 1;
        document.getElementById("fi-siguiente-btn").disabled =
            this._page >= totalPaginas || this._totalCount === 0;
    }

    _hayFiltrosActivos() {
        const f = this._getFiltros();
        return Object.values(f).some(v => String(v || "").trim() !== "");
    }

    // Excel y PDF salen siempre de los datos (todas las páginas que cumplen los filtros), no de la tabla visible: así no
    // dependen de la paginación ni arrastran botones/chips, y cada defecto va con su ID y criticidad.
    async _exportar() {
        const items = await this._traerTodosLosRegistros();
        const tabla = this._construirTablaTemp(items, true);
        window.ExcelExporter.exportTable({
            tableSelector: "#fi-tabla-export-temp",
            fileName: `faret_inspecciones_${this._hayFiltrosActivos() ? "filtrado" : "todos"}_${Date.now()}.xlsx`,
            sheetName: "Inspecciones",
            title: `QCC Faret - Inspecciones · ${this._resumenFiltrosTexto()}`,
        });
        tabla.remove();
    }

    async _imprimir() {
        const items = await this._traerTodosLosRegistros();
        const tabla = this._construirTablaTemp(items);
        window.PrintExporter.printTable({
            tableSelector: "#fi-tabla-export-temp",
            titulo: "Inspecciones",
            empresa: "FARET",
            subtitulo: window.InspeccionesEdicion.esc(this._resumenFiltrosTexto()),
            totalRegistros: items.length,
        });
        tabla.remove();
    }

    _resumenFiltrosTexto() {
        const f = this._getFiltros();
        const partes = [];
        if (f.nvFaret) partes.push(`NV Faret: ${f.nvFaret}`);
        if (f.areaControl) partes.push(`Área de control: ${f.areaControl}`);
        if (f.operador) partes.push(`Operador: ${f.operador}`);
        if (f.maquina) partes.push(`Máquina: ${f.maquina}`);
        if (f.presentaDefectos) partes.push(`¿Defectos?: ${f.presentaDefectos === "true" ? "Sí" : "No"}`);
        if (f.criticidad) partes.push(`Criticidad: ${f.criticidad === "Critico" ? "Crítico" : f.criticidad}`);
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
                action: "faret.inspecciones.list",
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

    // Tabla oculta que alimenta Excel y PDF. `completa` (Excel) agrega los campos del registro que la pantalla no muestra como columna
    // pero sí se capturan/editan (pliego, pasada, ítem, VoBo, observaciones, área del defecto, folia); el PDF queda compacto para que
    // ninguna columna se corte en la hoja. Cada defecto va en la misma posición en Defectos / ID evento / Criticidad.
    _construirTablaTemp(items, completa = false) {
        const IE = window.InspeccionesEdicion;
        const tabla = document.createElement("table");
        tabla.id = "fi-tabla-export-temp";
        tabla.style.position = "absolute";
        tabla.style.left = "-99999px";
        tabla.style.top = "0";

        const crit = (c) => ({ Critico: "Crítico" }[c] || c || "—");
        const sn = (b) => (b ? "Sí" : "No");
        // En el PDF (compacto) fecha y hora van juntas y cada columna tiene un ancho fijo en % para que ninguna se corte en la hoja.
        const ANCHO_PDF = { "Fecha / hora": 8, "Operador Calidad": 7, "NV Faret": 6, "Área de control": 7, "Máquina": 6, "Operador Máquina": 7, "¿Defectos?": 8,
            "Defectos": 8, "ID evento": 7, "Criticidad": 8, "Criticidad máx.": 7, "Acción correctiva": 8, "Adjuntos": 6, "Última edición": 8 };
        const cols = [
            ...(completa
                ? [["Fecha", i => this._formatoFecha(i.fechaRegistro)], ["Hora", i => i.horaRegistro ?? "-"]]
                : [["Fecha / hora", i => `${this._formatoFecha(i.fechaRegistro)} ${(i.horaRegistro ?? "").slice(0, 5)}`.trim()]]),
            ["Operador Calidad", i => i.operadorRegistro ?? "-"],
            ["NV Faret", i => i.nvFaret ?? "-"],
            ...(completa ? [
                ["NV VoBo aprobado", i => sn(i.nvVoBoAprobado)],
                ["N° de pliego", i => i.nPliego ?? "-"],
                ["N° de pasada", i => i.nPasada ?? "-"],
                ["N° de ítem", i => i.nItem ?? "-"],
                ["Pliego control N°", i => i.pliegoControlN ?? "-"],
                ["Observaciones", i => i.observaciones ?? "-"],
            ] : []),
            ["Área de control", i => i.areaControl ?? "-"],
            ["Máquina", i => i.maquina ?? "-"],
            ["Operador Máquina", i => (i.operador === "Otros" ? (i.operadorOtro || "Otros") : (i.operador ?? "-"))],
            ["¿Defectos?", i => sn(i.presentaDefectos)],
            ...(completa ? [["Área del defecto", i => i.areaDefecto ?? "-"], ["Tipo de folia", i => i.tipoFolia ?? "-"]] : []),
            ["Defectos", i => { const d = this._detalleDefectos(i); return d.length ? d.map(x => x.defecto).join("; ") : (i.defectos ?? "-"); }],
            // Defectos anteriores al catálogo no tienen ID ni criticidad: si ninguno la tiene se deja "-" (no una fila de "—").
            ["ID evento", i => { const d = this._detalleDefectos(i); return d.some(x => x.idEvento) ? d.map(x => x.idEvento || "—").join("; ") : "-"; }],
            ["Criticidad", i => { const d = this._detalleDefectos(i); return d.some(x => x.criticidad) ? d.map(x => crit(x.criticidad)).join("; ") : "-"; }],
            ["Criticidad máx.", i => (i.criticidadMax ? crit(i.criticidadMax) : "-")],
            ["Acción correctiva", i => i.accionCorrectiva ?? "-"],
            ["Adjuntos", i => i.cantidadAdjuntos ?? 0],
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

    async _catalogoEventos() {
        if (this._catalogo) return this._catalogo;
        const res = await window.PhotinoBridge.send({ action: "faret.inspecciones.catalogoEventos" });
        if (!res.ok) throw new Error(res.error || "No se pudo cargar el catálogo de eventos");
        this._catalogo = res.data;
        return this._catalogo;
    }

    _claveDefecto(d) {
        return d.idEvento ? `E:${d.idEvento}` : `T:${d.defecto}`;
    }

    async _editar(id) {
        const IE = window.InspeccionesEdicion;
        const reg = this._items.find(x => Number(x.id) === Number(id));
        if (!reg) return;

        let catalogo;
        try {
            catalogo = await this._catalogoEventos();
        } catch (e) {
            alert(e.message || "No se pudo cargar el catálogo de eventos");
            return;
        }

        const areasCat = catalogo.areas || [];
        const areasControl = [...new Set([...areasCat.map(a => a.areaControl), reg.areaControl].filter(Boolean))];
        const opciones = (lista, actual) => lista.map(v => `<option value="${IE.esc(v)}" ${v === actual ? "selected" : ""}>${IE.esc(v)}</option>`).join("");
        const actuales = this._detalleDefectos(reg);
        const claveActuales = new Set(actuales.map(d => this._claveDefecto(d)));
        const legados = actuales.filter(d => !d.idEvento);   // histórico sin ID/criticidad: se conserva salvo que se desmarque

        const cuerpo = `
            ${IE.campo("fie-nv", "NV Faret", reg.nvFaret, { requerido: true, max: 100 })}
            ${IE.campo("fie-pliego", "N° de pliego", reg.nPliego, { max: 100 })}
            ${IE.campo("fie-pasada", "N° de pasada", reg.nPasada, { max: 100 })}
            ${IE.campo("fie-item", "N° de ítem", reg.nItem, { max: 100 })}
            ${IE.campo("fie-pliegoctl", "Pliego control N°", reg.pliegoControlN, { max: 100 })}
            <div class="fie-campo"><label for="fie-vobo">NV VoBo aprobado</label>
                <select id="fie-vobo"><option value="true" ${reg.nvVoBoAprobado ? "selected" : ""}>Sí</option><option value="false" ${reg.nvVoBoAprobado ? "" : "selected"}>No</option></select></div>
            <div class="fie-campo"><label for="fie-area">Área de control <span class="fie-req">*</span></label>
                <select id="fie-area">${opciones(areasControl, reg.areaControl)}</select></div>
            ${IE.campo("fie-maquina", "Máquina", reg.maquina, { requerido: true, max: 100 })}
            ${IE.campo("fie-operador", "Operador", reg.operador, { requerido: true })}
            ${IE.campo("fie-operador-otro", "Operador (otro)", reg.operadorOtro)}
            ${IE.area("fie-obs", "Observaciones", reg.observaciones)}
            <div class="fie-campo"><label for="fie-presenta">¿Presenta defectos?</label>
                <select id="fie-presenta"><option value="true" ${reg.presentaDefectos ? "selected" : ""}>Sí</option><option value="false" ${reg.presentaDefectos ? "" : "selected"}>No</option></select></div>
            <div class="fie-campo" id="fie-bloque-area-def"><label for="fie-area-def">Área del defecto</label>
                <select id="fie-area-def"><option value="">—</option>${opciones(areasCat.map(a => a.areaControl), reg.areaDefecto)}</select></div>
            <div class="fie-seccion" id="fie-bloque-defectos">
                <div class="fie-seccion-titulo">Defectos (catálogo de eventos del área)</div>
                <div class="fie-lista" id="fie-lista-defectos"></div>
                <div class="fie-nota">Los defectos anteriores al catálogo (sin ID) se conservan mientras estén marcados. La criticidad la define el catálogo.</div>
            </div>
            ${IE.campo("fie-folia", "Tipo de folia", reg.tipoFolia, { max: 150 })}
            ${IE.area("fie-accion", "Acción correctiva", reg.accionCorrectiva)}
            <div class="fie-nota fie-ancho">Fecha, hora, operador que registró y adjuntos no se editan.</div>`;

        const pintarDefectos = (root) => {
            const marcados = new Set([...root.querySelectorAll("#fie-lista-defectos input:checked")].map(c => c.value));
            const primera = !root._defectosPintados;
            root._defectosPintados = true;
            const areaDef = root.querySelector("#fie-area-def").value;
            const eventos = (areasCat.find(a => a.areaControl === areaDef)?.eventos) || [];
            const html = [
                ...legados.map(d => ({ v: this._claveDefecto(d), t: `${d.defecto} (histórico, sin ID)` })),
                ...eventos.map(e => ({ v: `E:${e.idEvento}`, t: `${e.idEvento} · ${e.defecto} (${e.criticidad === "Critico" ? "Crítico" : e.criticidad})` })),
            ];
            // Primera vez: lo que ya tiene el registro. Después: lo que el usuario dejó marcado (los eventos de otra área desaparecen).
            const activo = (v) => (primera ? claveActuales.has(v) : marcados.has(v));
            root.querySelector("#fie-lista-defectos").innerHTML = html.length
                ? html.map(x => `<label class="fie-chk"><input type="checkbox" value="${IE.esc(x.v)}" ${activo(x.v) ? "checked" : ""}> <span>${IE.esc(x.t)}</span></label>`).join("")
                : `<div class="fie-nota">Seleccione el área del defecto para ver sus eventos.</div>`;
        };
        const alternar = (root) => {
            const si = root.querySelector("#fie-presenta").value === "true";
            root.querySelector("#fie-bloque-area-def").style.display = si ? "" : "none";
            root.querySelector("#fie-bloque-defectos").style.display = si ? "" : "none";
        };

        IE.abrirModal({
            titulo: `Editar inspección #${reg.id}`,
            subtitulo: `${this._formatoFecha(reg.fechaRegistro)} ${reg.horaRegistro ?? ""} · registrada por ${reg.operadorRegistro ?? "—"}`,
            cuerpoHtml: cuerpo,
            montar: (root) => {
                pintarDefectos(root);
                alternar(root);
                root.querySelector("#fie-presenta").addEventListener("change", () => alternar(root));
                root.querySelector("#fie-area-def").addEventListener("change", () => pintarDefectos(root));
            },
            recolectar: (root) => {
                const v = (sel) => root.querySelector(sel).value;
                const payload = {};
                const obligatorios = [["fie-nv", "NV Faret"], ["fie-maquina", "Máquina"], ["fie-operador", "Operador"]];
                for (const [idc, nombre] of obligatorios) if (!IE.norm(v("#" + idc))) return { error: `${nombre} es obligatorio.` };
                const textos = [
                    ["nvFaret", "#fie-nv", reg.nvFaret], ["nPliego", "#fie-pliego", reg.nPliego], ["nPasada", "#fie-pasada", reg.nPasada],
                    ["nItem", "#fie-item", reg.nItem], ["pliegoControlN", "#fie-pliegoctl", reg.pliegoControlN], ["areaControl", "#fie-area", reg.areaControl],
                    ["maquina", "#fie-maquina", reg.maquina], ["operador", "#fie-operador", reg.operador], ["operadorOtro", "#fie-operador-otro", reg.operadorOtro],
                    ["observaciones", "#fie-obs", reg.observaciones], ["tipoFolia", "#fie-folia", reg.tipoFolia], ["accionCorrectiva", "#fie-accion", reg.accionCorrectiva],
                ];
                for (const [clave, sel, original] of textos) {
                    if (IE.norm(v(sel)) !== IE.norm(original)) payload[clave] = IE.norm(v(sel));
                }
                const vobo = v("#fie-vobo") === "true";
                if (vobo !== !!reg.nvVoBoAprobado) payload.nvVoBoAprobado = vobo;
                const presenta = v("#fie-presenta") === "true";
                if (presenta !== !!reg.presentaDefectos) payload.presentaDefectos = presenta;
                if (presenta) {
                    if (IE.norm(v("#fie-area-def")) !== IE.norm(reg.areaDefecto)) payload.areaDefecto = IE.norm(v("#fie-area-def"));
                    const marcados = [...root.querySelectorAll("#fie-lista-defectos input:checked")].map(c => c.value);
                    const igual = marcados.length === claveActuales.size && marcados.every(m => claveActuales.has(m));
                    if (!igual || payload.areaDefecto !== undefined) {
                        payload.defectos = marcados.map(m => m.startsWith("E:") ? { idEvento: m.slice(2) } : m.slice(2));
                    }
                }
                if (!Object.keys(payload).length) return { error: "No hay cambios que guardar." };
                return { action: "faret.inspecciones.actualizar", id: reg.id, payload };
            },
            alGuardar: () => this._loadAll(),
        });
    }

    // ---------- Ver adjuntos (fotos subidas desde la app móvil) ----------

    async _verAdjuntos(id) {
        this._cerrarAdjuntos();

        const modal = document.createElement("div");
        modal.id = "fi-modal-adjuntos";
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
                max-width:90%;
                max-height:90%;
                padding:16px;
                box-shadow:0 20px 60px rgba(0,0,0,0.35);
                position:relative;
            ">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;">
                    <strong>Adjuntos del registro</strong>
                    <button id="fi-cerrar-adjuntos-btn" class="btn-secondary" type="button">Cerrar</button>
                </div>
                <div id="fi-adjuntos-contenido" style="min-width:280px;min-height:120px;display:flex;align-items:center;justify-content:center;color:#64748B;">
                    Cargando...
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.addEventListener("click", (e) => { if (e.target === modal) this._cerrarAdjuntos(); });
        document.getElementById("fi-cerrar-adjuntos-btn")
            ?.addEventListener("click", () => this._cerrarAdjuntos());

        try {
            const res = await window.PhotinoBridge.send({ action: "faret.inspecciones.adjuntos", id: Number(id) });
            const contenido = document.getElementById("fi-adjuntos-contenido");
            if (!contenido) return; // el modal ya se cerró antes de que llegara la respuesta

            if (!res.ok) {
                contenido.innerHTML = `<div class="faret-error">${this._escape(res.error || "Error al cargar los adjuntos")}</div>`;
                return;
            }

            const adjuntos = Array.isArray(res.data) ? res.data : [];
            if (!adjuntos.length) {
                contenido.innerHTML = `<div>Sin adjuntos disponibles.</div>`;
                return;
            }

            this._renderAdjuntos(adjuntos);
        } catch {
            const contenido = document.getElementById("fi-adjuntos-contenido");
            if (contenido) contenido.innerHTML = `<div class="faret-error">Error de comunicación con el backend</div>`;
        }
    }

    _renderAdjuntos(adjuntos) {
        const contenido = document.getElementById("fi-adjuntos-contenido");
        if (!contenido) return;

        contenido.style.display = "block";
        contenido.innerHTML = `
            <img id="fi-adjunto-imagen-principal"
                 src="${this._escape(this._normalizarImagenUrl(adjuntos[0].rutaArchivo))}"
                 alt="Adjunto"
                 style="display:block;max-width:100%;max-height:65vh;object-fit:contain;border-radius:8px;margin:0 auto;">
            ${adjuntos.length > 1 ? `
                <div style="display:flex;gap:8px;margin-top:12px;overflow-x:auto;padding-bottom:4px;">
                    ${adjuntos.map((a, idx) => `
                        <img src="${this._escape(this._normalizarImagenUrl(a.rutaArchivo))}"
                             data-index="${idx}"
                             class="fi-adjunto-miniatura"
                             style="width:64px;height:64px;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid ${idx === 0 ? "#2563EB" : "transparent"};">
                    `).join("")}
                </div>
            ` : ""}
        `;

        contenido.querySelectorAll(".fi-adjunto-miniatura").forEach(thumb => {
            thumb.addEventListener("click", () => {
                const idx = Number(thumb.dataset.index);
                const principal = document.getElementById("fi-adjunto-imagen-principal");
                if (principal) principal.src = this._normalizarImagenUrl(adjuntos[idx].rutaArchivo);
                contenido.querySelectorAll(".fi-adjunto-miniatura").forEach(t => t.style.borderColor = "transparent");
                thumb.style.borderColor = "#2563EB";
            });
        });
    }

    _cerrarAdjuntos() {
        const modal = document.getElementById("fi-modal-adjuntos");
        if (modal) modal.remove();
    }

    _normalizarImagenUrl(url) {
        const value = String(url || "").trim();

        if (!value) return "";
        if (value.startsWith("http://") || value.startsWith("https://")) return value;
        if (value.startsWith("/")) return `https://api.faret.cl/calidad${value}`;
        return `https://api.faret.cl/calidad/${value}`;
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
