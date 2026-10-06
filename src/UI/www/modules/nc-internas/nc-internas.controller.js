// NC Internas (desviaciones de pre-producción) — reemplaza la hoja "Desviaciones liberación" del
// Excel "Control de Pre-Producción (PLA-MNF-COM-V01)". Dato compartido entre empresas en la tabla
// no_conformidades (API INNPACK) con ambito = "INTERNA" + empresa. Réplica INNPACK de
// modules/faret-nc-internas (mismo código salvo EMPRESA, prefijo de ids nci-, usuario de sesión y
// textos de exportación) — si se corrige algo en uno, replicarlo en el otro.
// Reutiliza el mismo backend que el módulo No Conformidades INNPACK (gestión, seguimiento,
// análisis de causa raíz, acciones y adjuntos), filtrando siempre por ambito/empresa.
window.NcInternasController = class NcInternasController {

    static EMPRESA = "INNPACK";
    static AMBITO = "INTERNA";

    // Etapas del flujo de pre-producción del Excel (hoja FarmaIndustrialCosmetica) + Impresión,
    // donde también se detectaron desviaciones en el histórico.
    static ETAPAS = [
        "Carga de archivo gráfico", "Carga de troquel", "Referencia de color", "Cotización",
        "Nota de venta / FPS", "Manufacturing", "Edición", "Montaje", "Liberación", "Impresión", "Otra",
    ];

    init() {
        console.log("NcInternasController iniciado");

        this._page = 1;
        this._pageSize = 20;
        this._pages = 1;
        this._items = [];
        this._editingId = null;
        this._detalleActual = null;
        this._areas = [];
        this._tipos = [];
        this._gestionId = null;
        this._analisisNcId = null;
        this._analisisActual = null;
        this._analisisCerrada = false;
        this._acciones = [];
        this._adjuntos = [];
        this._itemsCompletos = [];
        this._statsCharts = [];

        document.getElementById("nci-imprimir-reporte-btn")?.addEventListener("click", () => this._imprimirReporteEstadistico());
        document.getElementById("nci-nuevo-btn")?.addEventListener("click", () => this._abrirNuevo());
        document.getElementById("nci-exportar-btn")?.addEventListener("click", () => this._exportar());
        document.getElementById("nci-filtrar-btn")?.addEventListener("click", () => { this._page = 1; this._loadLista(); });
        document.getElementById("nci-limpiar-btn")?.addEventListener("click", () => this._limpiarFiltros());

        document.getElementById("nci-form-cerrar-btn")?.addEventListener("click", () => this._cerrarForm());
        document.getElementById("nci-form-editar-btn")?.addEventListener("click", () => this._setModoEdicion(true));
        document.getElementById("nci-f-cancelar-btn")?.addEventListener("click", () => this._cancelarEdicion());
        document.getElementById("nci-f-guardar-btn")?.addEventListener("click", () => this._guardarForm());
        document.getElementById("nci-f-area")?.addEventListener("change", () => this._renderAreasSecundarias(this._leerAreasSecundarias()));

        document.getElementById("nci-gestion-cerrar-btn")?.addEventListener("click", () => this._cerrarGestion());
        document.getElementById("nci-gestion-guardar-btn")?.addEventListener("click", () => this._guardarGestion());
        document.getElementById("nci-seguimiento-agregar-btn")?.addEventListener("click", () => this._agregarSeguimiento());
        document.getElementById("nci-cerrar-nc-btn")?.addEventListener("click", () => this._cerrarNc());

        document.getElementById("nci-analisis-cerrar-btn")?.addEventListener("click", () => this._cerrarAnalisis());
        document.getElementById("nci-analisis-guardar-btn")?.addEventListener("click", () => this._guardarAnalisis());
        document.getElementById("nci-adjunto-pdf-input")?.addEventListener("change", (e) => this._subirPdfSeleccionado(e));
        document.getElementById("nci-adjunto-fotos-btn")?.addEventListener("click", () => document.getElementById("nci-adjunto-fotos-input")?.click());
        document.getElementById("nci-adjunto-fotos-input")?.addEventListener("change", (e) => this._subirFotosSeleccionadas(e));
        document.getElementById("nci-accion-agregar-btn")?.addEventListener("click", () => this._agregarAccion());

        document.getElementById("nci-paginacion")?.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-nci-page]");
            if (!btn || btn.disabled) return;
            this._irPagina(Number(btn.dataset.nciPage));
        });

        this._llenarSelect("nci-f-etapa", NcInternasController.ETAPAS);
        this._cargarCatalogos().then(() => this._cargarFiltrosOpciones());
        this._loadLista();
    }

    destroy() {
        console.log("NcInternasController destruido");
        document.getElementById("nciModalAdjunto")?.remove();
        this._destroyStatsCharts();
    }

    _usuarioActual() {
        return sessionStorage.getItem("nombreUsuario") || sessionStorage.getItem("codigoUsuario") || "";
    }

    // Toda llamada al backend lleva el ámbito y la empresa: sin ellos la API devolvería las PNC.
    _scope() {
        return { ambito: NcInternasController.AMBITO, empresa: NcInternasController.EMPRESA };
    }

    // ---------- Catálogos (solo lectura: el usuario de la API tiene SELECT sobre cat_nci_*) ----------

    async _cargarCatalogos() {
        const obtener = async action => {
            try {
                const res = await window.PhotinoBridge.send({ action });
                return res.ok && Array.isArray(res.data) ? res.data.filter(i => i.activo !== false).map(i => i.nombre) : [];
            } catch { return []; }
        };
        [this._areas, this._tipos] = await Promise.all([
            obtener("noConformidades.catalogos.nciAreas.list"),
            obtener("noConformidades.catalogos.nciTiposDesviacion.list"),
        ]);
        this._llenarSelect("nci-f-area", this._areas);
        this._llenarSelect("nci-f-tipo", this._tipos);
        this._renderAreasSecundarias([]);
    }

    _llenarSelect(selectId, valores, placeholder = "Seleccione...") {
        const select = document.getElementById(selectId);
        if (!select) return;
        const actual = select.value;
        select.innerHTML = `<option value="">${placeholder}</option>` +
            valores.map(v => `<option value="${this._esc(v)}">${this._esc(v)}</option>`).join("");
        if (actual) this._setSelectValue(select, actual);
    }

    // Si el registro trae un valor que ya no está en el catálogo (desactivado o histórico
    // importado), se agrega como opción para no perderlo al ver/editar.
    _setSelectValue(select, valor) {
        if (!valor) { select.value = ""; return; }
        if (![...select.options].some(o => o.value === valor)) {
            select.insertAdjacentHTML("beforeend", `<option value="${this._esc(valor)}">${this._esc(valor)}</option>`);
        }
        select.value = valor;
    }

    _renderAreasSecundarias(seleccionadas) {
        const cont = document.getElementById("nci-f-areas-secundarias");
        if (!cont) return;
        const principal = document.getElementById("nci-f-area")?.value || "";
        const disabled = document.getElementById("nci-f-area")?.disabled ? "disabled" : "";
        const opciones = [...new Set([...this._areas, ...seleccionadas])].filter(a => a && a !== principal);
        cont.innerHTML = opciones.map(a => `
            <label class="nci-check">
                <input type="checkbox" value="${this._esc(a)}" ${seleccionadas.includes(a) ? "checked" : ""} ${disabled}>
                ${this._esc(a)}
            </label>`).join("") || `<span class="nci-nota">Sin otras áreas disponibles</span>`;
    }

    _leerAreasSecundarias() {
        return [...document.querySelectorAll("#nci-f-areas-secundarias input:checked")].map(c => c.value);
    }

    // ---------- Filtros ----------

    async _cargarFiltrosOpciones() {
        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.filtrosOpciones", ...this._scope() });
            if (!res.ok) return;
            const op = res.data || {};
            this._llenarSelect("nci-filtro-cliente", op.clientes || [], "Todos");
            this._llenarSelect("nci-filtro-area", [...new Set([...this._areas, ...(op.areas || [])])].sort(), "Todas");
            this._llenarSelect("nci-filtro-tipo", [...new Set([...this._tipos, ...(op.categoriasDefecto || [])])].sort(), "Todos");
            const dl = document.getElementById("nci-dl-cliente");
            if (dl) dl.innerHTML = (op.clientes || []).map(v => `<option value="${this._esc(v)}"></option>`).join("");
        } catch { }
    }

    _getFiltros() {
        return {
            cliente: document.getElementById("nci-filtro-cliente")?.value || "",
            area: document.getElementById("nci-filtro-area")?.value || "",
            categoriaDefecto: document.getElementById("nci-filtro-tipo")?.value || "",
            estadoGestion: document.getElementById("nci-filtro-estado-gestion")?.value || "",
            fechaDesde: document.getElementById("nci-filtro-fecha-desde")?.value || "",
            fechaHasta: document.getElementById("nci-filtro-fecha-hasta")?.value || "",
        };
    }

    _limpiarFiltros() {
        ["nci-filtro-cliente", "nci-filtro-area", "nci-filtro-tipo", "nci-filtro-estado-gestion", "nci-filtro-fecha-desde", "nci-filtro-fecha-hasta"]
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
        this._page = 1;
        this._loadLista();
    }

    // ---------- Listado ----------

    async _loadLista() {
        const tbody = document.getElementById("nci-tbody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="10">Cargando...</td></tr>`;

        const filtros = { ...this._getFiltros(), ...this._scope() };

        try {
            const [listRes, resumenRes, itemsCompletos] = await Promise.all([
                window.PhotinoBridge.send({ action: "noConformidades.list", page: this._page, pageSize: this._pageSize, ...filtros }),
                window.PhotinoBridge.send({ action: "noConformidades.resumen", ...filtros }),
                this._obtenerItemsFiltrados(),
            ]);

            if (!listRes.ok) {
                tbody.innerHTML = `<tr><td colspan="10">${this._esc(listRes.error || "Error al cargar")}</td></tr>`;
                return;
            }

            this._items = listRes.data.items || [];
            this._pages = listRes.data.pages || 1;
            this._page = listRes.data.page || 1;

            this._itemsCompletos = itemsCompletos;

            if (resumenRes.ok) this._renderResumen(resumenRes.data);
            this._renderIndicadores(this._calcularIndicadores(this._itemsCompletos));
            this._renderTabla();
            this._renderPaginacion();
        } catch {
            tbody.innerHTML = `<tr><td colspan="10">Error de comunicación con el backend</td></tr>`;
        }
    }

    _renderResumen(r) {
        document.getElementById("nci-total").textContent = r.total ?? 0;
        document.getElementById("nci-abiertas").textContent = r.abiertas ?? 0;
        document.getElementById("nci-cerradas").textContent = r.cerradas ?? 0;
        document.getElementById("nci-horas").textContent = this._horas(r.horasPerdidas);
    }

    _renderTabla() {
        const tbody = document.getElementById("nci-tbody");

        if (!this._items.length) {
            tbody.innerHTML = `<tr><td colspan="10">Sin registros</td></tr>`;
            return;
        }

        tbody.innerHTML = this._items.map(nc => `
            <tr>
                <td>${this._esc(nc.codigo ?? "-")}</td>
                <td>${this._fecha(nc.fechaDeteccion)}</td>
                <td>${this._esc(nc.npNv ?? "-")}</td>
                <td>${this._esc(nc.cliente ?? "-")}</td>
                <td>${this._esc(nc.area ?? "-")}${nc.areasSecundarias ? `<div class="nci-nota">+ ${this._esc(nc.areasSecundarias)}</div>` : ""}</td>
                <td>${this._esc(nc.categoriaDefecto ?? "-")}</td>
                <td>${this._esc(nc.proceso ?? "-")}</td>
                <td>${nc.tiempoPerdidoHoras != null ? this._horas(nc.tiempoPerdidoHoras) : "-"}</td>
                <td>${this._badge(this._labelEstadoGestion(nc.estadoGestion), this._colorEstadoGestion(nc.estadoGestion))}</td>
                <td class="nci-acciones-celda">
                    <button class="btn-ghost nci-ver-btn" data-id="${nc.id}">Ver</button>
                    <button class="btn-primary nci-analizar-btn" data-id="${nc.id}">Analizar</button>
                    <button class="btn-secondary nci-gestionar-btn" data-id="${nc.id}">Gestionar</button>
                    <button class="btn-danger nci-eliminar-btn" data-id="${nc.id}">Eliminar</button>
                </td>
            </tr>
        `).join("");

        tbody.querySelectorAll(".nci-ver-btn").forEach(btn => btn.addEventListener("click", () => this._verDetalle(Number(btn.dataset.id))));
        tbody.querySelectorAll(".nci-analizar-btn").forEach(btn => btn.addEventListener("click", () => this._abrirAnalisis(Number(btn.dataset.id))));
        tbody.querySelectorAll(".nci-gestionar-btn").forEach(btn => btn.addEventListener("click", () => this._abrirGestion(Number(btn.dataset.id))));
        tbody.querySelectorAll(".nci-eliminar-btn").forEach(btn => btn.addEventListener("click", () => this._eliminar(Number(btn.dataset.id))));
    }

    // Borrado lógico (eliminado = 1), mismo comportamiento que el resto del sistema.
    async _eliminar(id) {
        if (!confirm("¿Eliminar esta NC interna? Ya no aparecerá en el listado.")) return;
        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.eliminar", id, actualizadoPor: this._usuarioActual() });
            if (!res.ok) {
                this._showMensaje(res.error || "Error al eliminar la NC interna", false);
                return;
            }
            this._showMensaje("NC interna eliminada", true);
            await window.TableUtils.preservarScroll(".nc-internas-module .table-container", () => this._loadLista());
        } catch {
            this._showMensaje("Error de comunicación con el backend", false);
        }
    }

    _renderPaginacion() {
        const container = document.getElementById("nci-paginacion");
        if (!container) return;

        let html = "";
        const rango = 2;
        const inicio = Math.max(1, this._page - rango);
        const fin = Math.min(this._pages, this._page + rango);

        if (this._page > 1) html += `<button data-nci-page="${this._page - 1}">←</button>`;
        if (inicio > 1) {
            html += `<button data-nci-page="1">1</button>`;
            if (inicio > 2) html += `<button disabled>...</button>`;
        }
        for (let i = inicio; i <= fin; i++) {
            html += `<button data-nci-page="${i}" class="${i === this._page ? "active" : ""}">${i}</button>`;
        }
        if (fin < this._pages) {
            if (fin < this._pages - 1) html += `<button disabled>...</button>`;
            html += `<button data-nci-page="${this._pages}">${this._pages}</button>`;
        }
        if (this._page < this._pages) html += `<button data-nci-page="${this._page + 1}">→</button>`;

        container.innerHTML = html;
    }

    _irPagina(pagina) {
        if (pagina < 1 || pagina > this._pages) return;
        this._page = pagina;
        this._loadLista();
    }

    // ---------- Formulario (Nueva / Ver / Editar) ----------

    _camposIds() {
        return ["nci-f-fecha", "nci-f-np-nv", "nci-f-cliente", "nci-f-area", "nci-f-tipo", "nci-f-etapa",
            "nci-f-horas", "nci-f-descripcion", "nci-f-observacion"];
    }

    _setModoEdicion(editable) {
        this._camposIds().forEach(id => { document.getElementById(id).disabled = !editable; });
        document.querySelectorAll("#nci-f-areas-secundarias input").forEach(c => { c.disabled = !editable; });
        document.getElementById("nci-form-editar-btn").style.display = (!editable && this._editingId) ? "inline-block" : "none";
        document.getElementById("nci-f-guardar-btn").style.display = editable ? "inline-block" : "none";
        document.getElementById("nci-f-cancelar-btn").style.display = (editable && this._editingId) ? "inline-block" : "none";
    }

    _abrirNuevo() {
        this._editingId = null;
        this._detalleActual = null;
        document.getElementById("nci-form-titulo").textContent = "Nueva NC interna";
        document.getElementById("nci-form-subtitulo").textContent = `Empresa: ${NcInternasController.EMPRESA}`;
        document.getElementById("nci-form-error").style.display = "none";

        this._camposIds().forEach(id => { document.getElementById(id).value = ""; });
        document.getElementById("nci-f-fecha").value = window.DateUtils.hoyISO();
        this._setModoEdicion(true);
        this._renderAreasSecundarias([]);
        document.getElementById("nci-form-modal").style.display = "flex";
    }

    async _verDetalle(id) {
        document.getElementById("nci-form-modal").style.display = "flex";
        document.getElementById("nci-form-titulo").textContent = "Cargando...";
        document.getElementById("nci-form-subtitulo").textContent = "";
        document.getElementById("nci-form-error").style.display = "none";

        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.get", id });
            if (!res.ok) {
                this._mostrarErrorForm(res.error || "Error al cargar el detalle");
                return;
            }
            this._editingId = id;
            this._detalleActual = res.data;
            document.getElementById("nci-form-titulo").textContent = `NC interna ${res.data.codigo ?? ""}`;
            document.getElementById("nci-form-subtitulo").textContent =
                `Estado gestión: ${this._labelEstadoGestion(res.data.estadoGestion)} · Creada por: ${res.data.creadoPor || "-"}`
                + (res.data.cerradoPor ? ` · Cerrada por: ${res.data.cerradoPor}${res.data.fechaCierre ? " el " + this._fecha(res.data.fechaCierre) : ""}` : "");
            this._renderForm(res.data);
            this._setModoEdicion(false);
        } catch {
            this._mostrarErrorForm("Error de comunicación con el backend");
        }
    }

    _renderForm(nc) {
        document.getElementById("nci-f-fecha").value = nc.fechaDeteccion ? String(nc.fechaDeteccion).substring(0, 10) : "";
        document.getElementById("nci-f-np-nv").value = nc.npNv ?? "";
        document.getElementById("nci-f-cliente").value = nc.cliente ?? "";
        this._setSelectValue(document.getElementById("nci-f-area"), nc.area);
        this._setSelectValue(document.getElementById("nci-f-tipo"), nc.categoriaDefecto);
        this._setSelectValue(document.getElementById("nci-f-etapa"), nc.proceso);
        document.getElementById("nci-f-horas").value = nc.tiempoPerdidoHoras ?? "";
        document.getElementById("nci-f-descripcion").value = nc.descripcion ?? "";
        document.getElementById("nci-f-observacion").value = nc.observacion ?? "";
        const secundarias = (nc.areasSecundarias || "").split(";").map(s => s.trim()).filter(Boolean);
        this._renderAreasSecundarias(secundarias);
    }

    _cancelarEdicion() {
        if (this._detalleActual) this._renderForm(this._detalleActual);
        this._setModoEdicion(false);
    }

    _cerrarForm() {
        document.getElementById("nci-form-modal").style.display = "none";
    }

    _mostrarErrorForm(texto) {
        const el = document.getElementById("nci-form-error");
        el.textContent = texto;
        el.style.display = "block";
    }

    async _guardarForm() {
        document.getElementById("nci-form-error").style.display = "none";

        const valor = id => document.getElementById(id).value.trim();
        const horasRaw = valor("nci-f-horas");
        const campos = {
            fechaDeteccion: valor("nci-f-fecha"),
            npNv: valor("nci-f-np-nv"),
            cliente: valor("nci-f-cliente"),
            area: valor("nci-f-area"),
            categoriaDefecto: valor("nci-f-tipo"),
            proceso: valor("nci-f-etapa"),
            descripcion: valor("nci-f-descripcion"),
            observacion: valor("nci-f-observacion"),
            areasSecundarias: this._leerAreasSecundarias().join("; "),
            tiempoPerdidoHoras: horasRaw === "" ? null : Number(horasRaw),
        };

        if (!campos.fechaDeteccion || !campos.npNv || !campos.cliente || !campos.area
            || !campos.categoriaDefecto || !campos.proceso || !campos.descripcion) {
            this._mostrarErrorForm("Fecha, NP/NV, Cliente, Área responsable, Tipo de desviación, Etapa y Descripción son obligatorios");
            return;
        }
        if (campos.tiempoPerdidoHoras !== null && (isNaN(campos.tiempoPerdidoHoras) || campos.tiempoPerdidoHoras < 0)) {
            this._mostrarErrorForm("El tiempo perdido debe ser un número mayor o igual a 0");
            return;
        }

        // En una NC interna la fecha de ingreso es la misma fecha de detección (los filtros de fecha
        // del listado usan fecha_ingreso), y el título se deriva de tipo + NP.
        campos.fechaIngreso = campos.fechaDeteccion;
        campos.titulo = `${campos.categoriaDefecto} - NP ${campos.npNv}`.substring(0, 255);

        const usuario = this._usuarioActual();
        const payload = this._editingId
            ? { action: "noConformidades.update", id: this._editingId, actualizadoPor: usuario, ...campos }
            : { action: "noConformidades.create", creadoPor: usuario, ...this._scope(), ...campos };

        const btn = document.getElementById("nci-f-guardar-btn");
        btn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send(payload);
            if (!res.ok) {
                this._mostrarErrorForm(res.error || "Error al guardar la NC interna");
                return;
            }
            const eraEdicion = !!this._editingId;
            this._cerrarForm();
            this._showMensaje(eraEdicion ? "NC interna actualizada" : `NC interna creada (${res.data?.codigo ?? ""})`, true);
            this._cargarFiltrosOpciones();
            await window.TableUtils.preservarScroll(".nc-internas-module .table-container", () => this._loadLista());
        } catch {
            this._mostrarErrorForm("Error de comunicación con el backend");
        } finally {
            btn.disabled = false;
        }
    }

    // ---------- Gestionar (mismas acciones que No Conformidades INNPACK) ----------

    async _abrirGestion(id) {
        this._gestionId = id;
        this._aplicarModoCierre({});
        document.getElementById("nci-gestion-error").style.display = "none";
        document.getElementById("nci-gestion-mensaje").style.display = "none";
        document.getElementById("nci-gestion-titulo").textContent = "Cargando...";
        document.getElementById("nci-gestion-modal").style.display = "flex";

        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.get", id });
            if (!res.ok) {
                this._mostrarError("nci-gestion-error", res.error || "Error al cargar la NC interna");
                return;
            }
            const nc = res.data;
            document.getElementById("nci-gestion-titulo").textContent = `Gestionar ${nc.codigo ?? ""}`;
            document.getElementById("nci-gestion-responsable").value = nc.responsable || "";
            document.getElementById("nci-gestion-estado").value = nc.estadoGestion || "PENDIENTE";
            document.getElementById("nci-gestion-fecha-compromiso").value = nc.fechaCompromiso ? String(nc.fechaCompromiso).substring(0, 10) : "";
            document.getElementById("nci-cierre-comentario").value = "";
            document.getElementById("nci-seguimiento-comentario").value = "";
            this._aplicarModoCierre(nc);
            await this._cargarSeguimiento(id);
        } catch {
            this._mostrarError("nci-gestion-error", "Error de comunicación con el backend");
        }
    }

    // NC cerrada = solo lectura: se muestra quién y cuándo la cerró y no se puede volver a gestionar
    // ni a cerrar. La única forma de cerrar es "Cerrar NC interna" (deja cerrado_por/fecha_cierre).
    _aplicarModoCierre(nc) {
        const cerrada = (nc.estadoGestion || "").toUpperCase() === "CERRADA";
        this._gestionCerrada = cerrada;

        ["nci-gestion-responsable", "nci-gestion-estado", "nci-gestion-fecha-compromiso"].forEach(id => {
            document.getElementById(id).disabled = cerrada;
        });
        document.getElementById("nci-gestion-guardar-btn").style.display = cerrada ? "none" : "";
        document.getElementById("nci-gestion-seccion-cierre").style.display = cerrada ? "none" : "";

        const info = document.getElementById("nci-gestion-cierre-info");
        if (!cerrada) {
            info.style.display = "none";
            return;
        }
        const cuando = nc.fechaCierre ? ` el ${this._fecha(nc.fechaCierre)}` : "";
        const comentario = nc.comentarioCierre ? `<br>Comentario: ${this._esc(nc.comentarioCierre)}` : "";
        info.innerHTML = `<strong>NC cerrada</strong> por ${this._esc(nc.cerradoPor || "-")}${cuando}${comentario}`;
        info.style.display = "block";
    }

    _cerrarGestion() {
        document.getElementById("nci-gestion-modal").style.display = "none";
        this._gestionId = null;
    }

    async _guardarGestion() {
        if (!this._gestionId || this._gestionCerrada) return;
        document.getElementById("nci-gestion-error").style.display = "none";

        const btn = document.getElementById("nci-gestion-guardar-btn");
        btn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({
                action: "noConformidades.gestion.actualizar",
                id: this._gestionId,
                responsable: document.getElementById("nci-gestion-responsable").value.trim(),
                estadoGestion: document.getElementById("nci-gestion-estado").value,
                fechaCompromiso: document.getElementById("nci-gestion-fecha-compromiso").value || null,
                actualizadoPor: this._usuarioActual(),
            });
            if (!res.ok) {
                this._mostrarError("nci-gestion-error", res.error || "Error al guardar la gestión");
                return;
            }
            this._showMensajeEn("nci-gestion-mensaje", "Gestión actualizada", true);
            await window.TableUtils.preservarScroll(".nc-internas-module .table-container", () => this._loadLista());
        } catch {
            this._mostrarError("nci-gestion-error", "Error de comunicación con el backend");
        } finally {
            btn.disabled = false;
        }
    }

    async _cargarSeguimiento(ncId) {
        const cont = document.getElementById("nci-seguimiento-lista");
        cont.innerHTML = "Cargando...";
        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.seguimiento.list", id: ncId });
            const items = res.ok && Array.isArray(res.data) ? res.data : [];
            if (!items.length) { cont.innerHTML = `<div>Sin comentarios de seguimiento</div>`; return; }
            cont.innerHTML = items.map(c => `
                <div class="nci-seguimiento-item">
                    <div>${this._esc(c.comentario ?? "-")}</div>
                    <div class="nci-seguimiento-meta">${this._esc(c.autor ?? "Sin autor")} · ${c.creadoEn ? new Date(c.creadoEn).toLocaleString("es-CL") : "-"}</div>
                </div>
            `).join("");
        } catch {
            cont.innerHTML = `<div>Error al cargar el seguimiento</div>`;
        }
    }

    async _agregarSeguimiento() {
        if (!this._gestionId) return;
        const comentario = document.getElementById("nci-seguimiento-comentario").value.trim();
        if (!comentario) return;

        try {
            const res = await window.PhotinoBridge.send({
                action: "noConformidades.seguimiento.crear",
                id: this._gestionId,
                comentario,
                autor: this._usuarioActual(),
            });
            if (!res.ok) { this._showMensajeEn("nci-gestion-mensaje", res.error || "Error al agregar el comentario", false); return; }
            document.getElementById("nci-seguimiento-comentario").value = "";
            await this._cargarSeguimiento(this._gestionId);
            this._showMensajeEn("nci-gestion-mensaje", "Comentario agregado", true);
        } catch {
            this._showMensajeEn("nci-gestion-mensaje", "Error de comunicación con el backend", false);
        }
    }

    async _cerrarNc() {
        if (!this._gestionId || this._gestionCerrada) return;
        if (!confirm("¿Cerrar esta NC interna? Quedará marcada como CERRADA.")) return;

        const comentarioCierre = document.getElementById("nci-cierre-comentario").value.trim();
        try {
            const res = await window.PhotinoBridge.send({
                action: "noConformidades.cerrar",
                id: this._gestionId,
                cerradoPor: this._usuarioActual(),
                comentarioCierre: comentarioCierre || null,
            });
            if (!res.ok) { this._showMensajeEn("nci-gestion-mensaje", res.error || "Error al cerrar la NC interna", false); return; }
            this._cerrarGestion();
            this._showMensaje("NC interna cerrada", true);
            await window.TableUtils.preservarScroll(".nc-internas-module .table-container", () => this._loadLista());
        } catch {
            this._showMensajeEn("nci-gestion-mensaje", "Error de comunicación con el backend", false);
        }
    }

    // ---------- Analizar: causa raíz + adjuntos + plan de acción ----------

    async _abrirAnalisis(id) {
        this._analisisNcId = id;
        this._analisisActual = null;
        this._acciones = [];
        this._adjuntos = [];
        this._analisisCerrada = false;

        document.getElementById("nci-analisis-titulo").textContent = "Cargando...";
        document.getElementById("nci-analisis-error").style.display = "none";
        document.getElementById("nci-analisis-mensaje").style.display = "none";
        document.getElementById("nci-accion-error").style.display = "none";
        document.getElementById("nci-adjunto-fotos-error").style.display = "none";
        document.getElementById("nci-analisis-modal").style.display = "flex";

        try {
            const ncRes = await window.PhotinoBridge.send({ action: "noConformidades.get", id });
            if (ncRes.ok) {
                document.getElementById("nci-analisis-titulo").textContent = `Análisis y Plan de Acción — ${ncRes.data.codigo ?? ""}`;
                this._analisisCerrada = (ncRes.data.estadoGestion || "").toUpperCase() === "CERRADA";
            }
        } catch { }

        await this._cargarAnalisis();
        await this._cargarAcciones();
        await this._cargarAdjuntos();
    }

    _cerrarAnalisis() {
        document.getElementById("nci-analisis-modal").style.display = "none";
        this._analisisNcId = null;
        this._adjuntos = [];
        this._analisisCerrada = false;
    }

    _camposAnalisis() {
        return {
            problemaDetectado: "nci-analisis-problema", porque1: "nci-analisis-porque1", porque2: "nci-analisis-porque2",
            porque3: "nci-analisis-porque3", porque4: "nci-analisis-porque4", porque5: "nci-analisis-porque5",
            causaRaiz: "nci-analisis-causa-raiz", conclusion: "nci-analisis-conclusion",
        };
    }

    async _cargarAnalisis() {
        document.getElementById("nci-analisis-error").style.display = "none";
        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.analisis.get", id: this._analisisNcId });
            this._analisisActual = res.ok ? res.data : null;
            if (!res.ok) this._mostrarError("nci-analisis-error", res.error || "Error al cargar el análisis");
        } catch {
            this._analisisActual = null;
            this._mostrarError("nci-analisis-error", "Error de comunicación con el backend");
        }
        const a = this._analisisActual;
        document.getElementById("nci-analisis-metodologia").value = a?.metodologia || "CINCO_PORQUES";
        Object.entries(this._camposAnalisis()).forEach(([campo, id]) => { document.getElementById(id).value = a?.[campo] || ""; });
    }

    async _guardarAnalisis() {
        document.getElementById("nci-analisis-error").style.display = "none";

        const payload = { metodologia: document.getElementById("nci-analisis-metodologia").value };
        Object.entries(this._camposAnalisis()).forEach(([campo, id]) => { payload[campo] = document.getElementById(id).value.trim(); });

        if (!payload.problemaDetectado) {
            this._mostrarError("nci-analisis-error", "El problema detectado es obligatorio");
            return;
        }
        if (!confirm("¿Guardar el análisis de causa raíz de esta NC interna?")) return;

        const btn = document.getElementById("nci-analisis-guardar-btn");
        btn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({
                action: "noConformidades.analisis.guardar",
                id: this._analisisNcId,
                usuario: this._usuarioActual(),
                ...payload,
            });
            if (!res.ok) { this._mostrarError("nci-analisis-error", res.error || "Error al guardar el análisis"); return; }
            await this._cargarAnalisis();
            this._showMensajeEn("nci-analisis-mensaje", "Análisis guardado correctamente", true);
        } catch {
            this._mostrarError("nci-analisis-error", "Error de comunicación con el backend");
        } finally {
            btn.disabled = false;
        }
    }

    // Adjuntos: 1 PDF de análisis de causa raíz (reemplazable) + hasta 10 fotos de evidencia.
    // Mismos límites que el resto del sistema (10 MB PDF, 5 MB por foto); la API los valida igual.
    async _cargarAdjuntos() {
        document.getElementById("nci-adjunto-pdf-error").style.display = "none";
        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.adjuntos.list", id: Number(this._analisisNcId) });
            this._adjuntos = res.ok && Array.isArray(res.data) ? res.data : [];
        } catch {
            this._adjuntos = [];
        }
        this._renderAdjuntoPdf();
        this._renderAdjuntoFotos();
    }

    _renderAdjuntoPdf() {
        const bloque = document.getElementById("nci-adjunto-pdf-bloque");
        const pdf = this._adjuntos.find(a => a.tipo === "CAUSA_RAIZ_PDF");
        const cerrada = this._analisisCerrada;

        if (!pdf) {
            bloque.innerHTML = cerrada
                ? `<span class="nci-nota">Sin PDF adjunto.</span>`
                : `<button type="button" class="btn-secondary" id="nci-adjunto-pdf-adjuntar-btn">Adjuntar PDF</button>`;
        } else {
            bloque.innerHTML = `
                <div class="nci-adjunto-pdf-fila">
                    <span>${this._esc(pdf.nombreArchivo)}</span>
                    <button type="button" class="btn-secondary" id="nci-adjunto-pdf-ver-btn">Ver</button>
                    ${cerrada ? "" : `<button type="button" class="btn-secondary" id="nci-adjunto-pdf-reemplazar-btn">Reemplazar</button>`}
                </div>
            `;
        }

        document.getElementById("nci-adjunto-pdf-adjuntar-btn")
            ?.addEventListener("click", () => document.getElementById("nci-adjunto-pdf-input")?.click());
        document.getElementById("nci-adjunto-pdf-reemplazar-btn")
            ?.addEventListener("click", () => document.getElementById("nci-adjunto-pdf-input")?.click());
        document.getElementById("nci-adjunto-pdf-ver-btn")
            ?.addEventListener("click", () => this._verAdjunto(pdf.id));
    }

    _renderAdjuntoFotos() {
        const grid = document.getElementById("nci-adjunto-fotos-grid");
        const fotos = this._adjuntos.filter(a => a.tipo === "EVIDENCIA_FOTO");
        const cerrada = this._analisisCerrada;

        document.getElementById("nci-adjunto-fotos-btn").style.display = cerrada ? "none" : "inline-block";

        if (fotos.length === 0) {
            grid.innerHTML = `<span class="nci-nota">${cerrada ? "Sin fotografías adjuntas." : "Aún no hay fotografías adjuntas."}</span>`;
            return;
        }

        grid.innerHTML = fotos.map(f => `
            <div class="nci-foto-item" data-adjunto-id="${f.id}" title="${this._esc(f.nombreArchivo)}">
                ${cerrada ? "" : `<button type="button" class="nci-foto-eliminar" data-adjunto-id="${f.id}">×</button>`}
            </div>
        `).join("");

        fotos.forEach(f => {
            const el = grid.querySelector(`.nci-foto-item[data-adjunto-id="${f.id}"]`);
            if (!el) return;

            el.addEventListener("click", (ev) => {
                if (ev.target.closest(".nci-foto-eliminar")) return;
                this._verAdjunto(f.id);
            });
            el.querySelector(".nci-foto-eliminar")?.addEventListener("click", (ev) => {
                ev.stopPropagation();
                this._eliminarAdjunto(f.id);
            });

            window.PhotinoBridge.send({ action: "noConformidades.adjuntos.abrir", id: Number(this._analisisNcId), adjuntoId: f.id })
                .then(res => {
                    if (res?.ok && res.data) {
                        const img = document.createElement("img");
                        img.src = `data:${res.data.tipoMime};base64,${res.data.contenidoBase64}`;
                        img.alt = f.nombreArchivo;
                        el.prepend(img);
                    }
                }).catch(() => { });
        });
    }

    _leerArchivoBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(",")[1] || "");
            reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
            reader.readAsDataURL(file);
        });
    }

    async _subirPdfSeleccionado(e) {
        const input = e.target;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;

        document.getElementById("nci-adjunto-pdf-error").style.display = "none";
        if (file.type !== "application/pdf") { this._mostrarError("nci-adjunto-pdf-error", "Solo se permite un archivo PDF"); return; }
        if (file.size > 10 * 1024 * 1024) { this._mostrarError("nci-adjunto-pdf-error", "El PDF excede el tamaño máximo de 10 MB"); return; }

        try {
            const res = await window.PhotinoBridge.send({
                action: "noConformidades.adjuntos.subir",
                id: Number(this._analisisNcId),
                tipo: "CAUSA_RAIZ_PDF",
                nombreArchivo: file.name,
                tipoMime: file.type,
                contenidoBase64: await this._leerArchivoBase64(file),
                subidoPor: this._usuarioActual(),
            });
            if (!res.ok) { this._mostrarError("nci-adjunto-pdf-error", res.error || "Error al subir el PDF"); return; }
            await this._cargarAdjuntos();
        } catch (err) {
            this._mostrarError("nci-adjunto-pdf-error", err.message || "Error al subir el PDF");
        }
    }

    async _subirFotosSeleccionadas(e) {
        const input = e.target;
        const files = Array.from(input.files || []);
        input.value = "";
        if (files.length === 0) return;

        document.getElementById("nci-adjunto-fotos-error").style.display = "none";

        const activas = this._adjuntos.filter(a => a.tipo === "EVIDENCIA_FOTO").length;
        if (activas + files.length > 10) {
            this._mostrarError("nci-adjunto-fotos-error", `Máximo 10 fotografías por NC (ya hay ${activas})`);
            return;
        }
        for (const file of files) {
            if (!["image/jpeg", "image/png"].includes(file.type)) { this._mostrarError("nci-adjunto-fotos-error", `"${file.name}" no es JPG/PNG`); return; }
            if (file.size > 5 * 1024 * 1024) { this._mostrarError("nci-adjunto-fotos-error", `"${file.name}" excede el tamaño máximo de 5 MB`); return; }
        }

        try {
            for (const file of files) {
                const res = await window.PhotinoBridge.send({
                    action: "noConformidades.adjuntos.subir",
                    id: Number(this._analisisNcId),
                    tipo: "EVIDENCIA_FOTO",
                    nombreArchivo: file.name,
                    tipoMime: file.type,
                    contenidoBase64: await this._leerArchivoBase64(file),
                    subidoPor: this._usuarioActual(),
                });
                if (!res.ok) { this._mostrarError("nci-adjunto-fotos-error", res.error || `Error al subir "${file.name}"`); break; }
            }
        } finally {
            await this._cargarAdjuntos();
        }
    }

    async _verAdjunto(adjuntoId) {
        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.adjuntos.abrir", id: Number(this._analisisNcId), adjuntoId });
            if (!res.ok) throw new Error(res.error || "Error al abrir el adjunto");
            this._mostrarAdjuntoVisor(res.data.nombreArchivo, res.data.tipoMime, res.data.contenidoBase64);
        } catch (err) {
            this._showMensajeEn("nci-analisis-mensaje", err.message, false);
        }
    }

    async _eliminarAdjunto(adjuntoId) {
        if (!confirm("¿Eliminar este adjunto?")) return;
        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.adjuntos.eliminar", id: Number(this._analisisNcId), adjuntoId });
            if (!res.ok) throw new Error(res.error || "Error al eliminar el adjunto");
            await this._cargarAdjuntos();
        } catch (err) {
            this._showMensajeEn("nci-analisis-mensaje", err.message, false);
        }
    }

    // Mismo visor que No Conformidades INNPACK: overlay anclado a document.body; PDF en <iframe>
    // (WebView2 lo renderiza nativo), imagen en <img>.
    _mostrarAdjuntoVisor(nombreArchivo, tipoMime, contenidoBase64) {
        document.getElementById("nciModalAdjunto")?.remove();

        const dataUrl = `data:${tipoMime};base64,${contenidoBase64}`;
        const visor = tipoMime.startsWith("image/")
            ? `<img src="${dataUrl}" alt="${this._esc(nombreArchivo)}" style="display:block;max-width:100%;max-height:75vh;object-fit:contain;border-radius:8px;">`
            : `<iframe src="${dataUrl}" style="width:80vw;height:75vh;border:0;"></iframe>`;

        const modal = document.createElement("div");
        modal.id = "nciModalAdjunto";
        modal.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;background:rgba(15,23,42,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;";
        modal.innerHTML = `
            <div style="background:#fff;border-radius:12px;max-width:90%;max-height:90%;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,0.35);position:relative;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;">
                    <strong>${this._esc(nombreArchivo)}</strong>
                    <button id="nciBtnCerrarAdjunto" class="btn-secondary" type="button">Cerrar</button>
                </div>
                ${visor}
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById("nciBtnCerrarAdjunto").addEventListener("click", () => modal.remove());
    }

    async _cargarAcciones() {
        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.acciones.list", id: this._analisisNcId });
            this._acciones = res.ok && Array.isArray(res.data) ? res.data : [];
        } catch {
            this._acciones = [];
        }
        this._renderAcciones();
    }

    _renderAcciones() {
        const tbody = document.getElementById("nci-acciones-tbody");
        if (!this._acciones.length) {
            tbody.innerHTML = `<tr><td colspan="6">Sin acciones correctivas</td></tr>`;
            return;
        }

        const estados = ["PENDIENTE", "EN_PROCESO", "COMPLETADA", "CANCELADA"];
        tbody.innerHTML = this._acciones.map(a => `
            <tr>
                <td>${this._esc(a.descripcion ?? "-")}</td>
                <td>${this._esc(a.responsable ?? "-")}</td>
                <td>${this._fecha(a.fechaLimite)}</td>
                <td>${this._esc(a.prioridad ?? "-")}</td>
                <td>
                    <select class="nci-accion-estado-select" data-id="${a.id}">
                        ${estados.map(e => `<option value="${e}" ${e === a.estado ? "selected" : ""}>${e}</option>`).join("")}
                    </select>
                </td>
                <td><button class="btn-secondary nci-accion-guardar-btn" data-id="${a.id}">Guardar</button></td>
            </tr>
        `).join("");

        tbody.querySelectorAll(".nci-accion-guardar-btn").forEach(btn =>
            btn.addEventListener("click", () => this._actualizarEstadoAccion(btn.dataset.id)));
    }

    async _agregarAccion() {
        document.getElementById("nci-accion-error").style.display = "none";

        const payload = {
            descripcion: document.getElementById("nci-accion-descripcion").value.trim(),
            responsable: document.getElementById("nci-accion-responsable").value.trim(),
            fechaLimite: document.getElementById("nci-accion-fecha-limite").value,
            prioridad: document.getElementById("nci-accion-prioridad").value || null,
        };

        if (!payload.descripcion || !payload.responsable || !payload.fechaLimite) {
            this._mostrarError("nci-accion-error", "Descripción, responsable y fecha límite son obligatorios");
            return;
        }
        if (!confirm("¿Agregar esta acción correctiva a la NC interna?")) return;

        const btn = document.getElementById("nci-accion-agregar-btn");
        btn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({
                action: "noConformidades.acciones.crear",
                id: this._analisisNcId,
                analisisId: this._analisisActual?.id ?? null,
                creadoPor: this._usuarioActual(),
                ...payload,
            });
            if (!res.ok) { this._mostrarError("nci-accion-error", res.error || "Error al agregar la acción"); return; }

            ["nci-accion-descripcion", "nci-accion-responsable", "nci-accion-fecha-limite", "nci-accion-prioridad"]
                .forEach(id => { document.getElementById(id).value = ""; });
            await this._cargarAcciones();
            this._showMensajeEn("nci-analisis-mensaje", "Acción correctiva agregada", true);
        } catch {
            this._mostrarError("nci-accion-error", "Error de comunicación con el backend");
        } finally {
            btn.disabled = false;
        }
    }

    async _actualizarEstadoAccion(accionId) {
        const accion = this._acciones.find(a => String(a.id) === String(accionId));
        if (!accion) return;

        const select = document.querySelector(`.nci-accion-estado-select[data-id="${accionId}"]`);
        const nuevoEstado = select ? select.value : accion.estado;
        if (!confirm(`¿Cambiar el estado de la acción a "${nuevoEstado}"?`)) return;

        try {
            const res = await window.PhotinoBridge.send({
                action: "noConformidades.acciones.actualizar",
                accionId: Number(accionId),
                descripcion: accion.descripcion,
                responsable: accion.responsable,
                fechaLimite: accion.fechaLimite ? String(accion.fechaLimite).substring(0, 10) : "",
                prioridad: accion.prioridad || null,
                estado: nuevoEstado,
                actualizadoPor: this._usuarioActual(),
            });
            if (!res.ok) { this._showMensajeEn("nci-analisis-mensaje", res.error || "Error al actualizar la acción", false); return; }
            await this._cargarAcciones();
            this._showMensajeEn("nci-analisis-mensaje", "Acción correctiva actualizada", true);
        } catch {
            this._showMensajeEn("nci-analisis-mensaje", "Error de comunicación con el backend", false);
        }
    }

    // ---------- Exportar (todas las filas que cumplen los filtros, no solo la página visible) ----------

    // Todo el universo que cumple los filtros activos (no solo la página visible). Alimenta los
    // indicadores, la exportación y el reporte impreso.
    async _obtenerItemsFiltrados() {
        const res = await window.PhotinoBridge.send({
            action: "noConformidades.list", page: 1, pageSize: 999999, ...this._getFiltros(), ...this._scope(),
        });
        return res.ok && Array.isArray(res.data?.items) ? res.data.items : [];
    }

    _resumenFiltrosTexto() {
        const f = this._getFiltros();
        const partes = [];
        if (f.cliente) partes.push(`Cliente: ${f.cliente}`);
        if (f.area) partes.push(`Área: ${f.area}`);
        if (f.categoriaDefecto) partes.push(`Tipo: ${f.categoriaDefecto}`);
        if (f.estadoGestion) partes.push(`Estado gestión: ${this._labelEstadoGestion(f.estadoGestion)}`);
        if (f.fechaDesde) partes.push(`Desde: ${this._fecha(f.fechaDesde)}`);
        if (f.fechaHasta) partes.push(`Hasta: ${this._fecha(f.fechaHasta)}`);
        return partes.length ? partes.join(" · ") : "Sin filtros — histórico completo";
    }

    async _exportar() {
        try {
            const tabla = this._construirTablaTemp(await this._obtenerItemsFiltrados());
            window.ExcelExporter.exportTable({
                tableSelector: "#nci-tabla-export-temp",
                fileName: `nc_internas_innpack_${Date.now()}.xlsx`,
                sheetName: "NC Internas",
                title: "QCC - NC Internas INNPACK",
            });
            tabla.remove();
        } catch {
            this._showMensaje("Error al exportar", false);
        }
    }

    _construirTablaTemp(items) {
        const cols = [
            ["Código", nc => nc.codigo], ["Fecha", nc => this._fecha(nc.fechaDeteccion)], ["NP/NV", nc => nc.npNv],
            ["Cliente", nc => nc.cliente], ["Área responsable", nc => nc.area], ["Otras áreas", nc => nc.areasSecundarias],
            ["Tipo de desviación", nc => nc.categoriaDefecto], ["Etapa que detecta", nc => nc.proceso],
            ["Horas perdidas", nc => nc.tiempoPerdidoHoras], ["Descripción", nc => nc.descripcion],
            ["Observación", nc => nc.observacion], ["Estado gestión", nc => this._labelEstadoGestion(nc.estadoGestion)],
            ["Responsable", nc => nc.responsable], ["Fecha cierre", nc => this._fecha(nc.fechaCierre)], ["Cerrado por", nc => nc.cerradoPor],
            ["Creada por", nc => nc.creadoPor],
        ];
        const tabla = document.createElement("table");
        tabla.id = "nci-tabla-export-temp";
        tabla.style.position = "absolute";
        tabla.style.left = "-99999px";
        tabla.innerHTML = `<thead><tr>${cols.map(([t]) => `<th>${t}</th>`).join("")}</tr></thead>` +
            `<tbody>${items.map(nc => `<tr>${cols.map(([, f]) => `<td>${this._esc(f(nc) ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>`;
        document.body.appendChild(tabla);
        return tabla;
    }

    // ---------- Indicadores ----------

    _contarPor(items, obtener) {
        const mapa = new Map();
        items.forEach(nc => {
            const valor = String(obtener(nc) ?? "").trim();
            if (valor) mapa.set(valor, (mapa.get(valor) || 0) + 1);
        });
        return [...mapa.entries()].sort((a, b) => b[1] - a[1]).map(([categoria, total]) => ({ categoria, total }));
    }

    _calcularIndicadores(items) {
        // Horas perdidas por área responsable principal. Solo NC con horas registradas.
        const horasMapa = new Map();
        let horasTotal = 0;
        let conHoras = 0;
        items.forEach(nc => {
            const horas = Number(nc.tiempoPerdidoHoras);
            if (nc.tiempoPerdidoHoras == null || isNaN(horas)) return;
            horasTotal += horas;
            conHoras++;
            const area = (nc.area || "-").trim();
            horasMapa.set(area, (horasMapa.get(area) || 0) + horas);
        });
        const horasPorArea = [...horasMapa.entries()]
            .filter(([, h]) => h > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([categoria, total]) => ({ categoria, total: Math.round(total * 100) / 100 }));

        // Pareto por tipo de desviación (% acumulado con 2 decimales, mismo cálculo que NC).
        const porTipo = this._contarPor(items, nc => nc.categoriaDefecto);
        const totalTipo = porTipo.reduce((s, r) => s + r.total, 0);
        let acumulado = 0;
        const pareto = porTipo.map(r => {
            acumulado += r.total;
            return {
                defecto: r.categoria,
                frecuencia: r.total,
                porcentajeAcumulado: totalTipo ? Math.round(acumulado / totalTipo * 10000) / 100 : 0,
            };
        });

        const mensual = this._contarPor(items, nc => String(nc.fechaDeteccion || "").substring(0, 7))
            .sort((a, b) => a.categoria.localeCompare(b.categoria))
            .map(r => ({ ...r, mesLabel: this._formatearMesCorto(r.categoria) }));

        const porNp = this._contarPor(items, nc => nc.npNv);

        return {
            porArea: this._contarPor(items, nc => nc.area),
            porEtapa: this._contarPor(items, nc => nc.proceso),
            porCliente: this._contarPor(items, nc => nc.cliente),
            pareto,
            mensual,
            horasPorArea,
            npAfectadas: porNp.length,
            npReincidentes: porNp.filter(r => r.total > 1).length,
            clientesAfectados: new Set(items.map(nc => (nc.cliente || "").trim()).filter(Boolean)).size,
            horasPromedio: conHoras ? Math.round(horasTotal / conHoras * 100) / 100 : 0,
        };
    }

    _renderIndicadores(ind) {
        this._destroyStatsCharts();

        this._setText("nci-stat-np", ind.npAfectadas);
        this._setText("nci-stat-np-reincidentes", ind.npReincidentes);
        this._setText("nci-stat-clientes", ind.clientesAfectados);
        document.getElementById("nci-stat-horas-promedio").textContent = this._horas(ind.horasPromedio);

        this._chartBarHorizontal("nci-chart-area", ind.porArea, "NC", "NC por área responsable");
        this._chartPareto("nci-chart-pareto", this._aplicarTopNOtros(ind.pareto), "Pareto por tipo de desviación");
        this._chartDoughnut("nci-chart-etapa", ind.porEtapa, "Etapa que detecta");
        this._chartBarHorizontal("nci-chart-cliente", ind.porCliente, "NC", "Clientes con más NC internas");

        this._mostrarChartONota("nci-chart-mensual", "nci-nota-mensual",
            ind.mensual.length >= 2,
            ind.mensual.length === 1 ? "Rango de un solo mes — sin evolución mensual que mostrar." : "Sin registros en el período para mostrar evolución.",
            () => this._chartBarVertical("nci-chart-mensual", ind.mensual, "Evolución mensual"));

        this._mostrarChartONota("nci-chart-horas-area", "nci-nota-horas-area",
            ind.horasPorArea.length > 0,
            "Sin horas perdidas registradas en el período.",
            () => this._chartBarHorizontal("nci-chart-horas-area", ind.horasPorArea, "Horas", "Horas perdidas por área"));
    }

    _mostrarChartONota(canvasId, notaId, hayDatos, textoNota, dibujar) {
        const canvas = document.getElementById(canvasId);
        const nota = document.getElementById(notaId);
        if (!canvas || !nota) return;
        canvas.style.display = hayDatos ? "block" : "none";
        nota.style.display = hayDatos ? "none" : "block";
        nota.textContent = hayDatos ? "" : textoNota;
        if (hayDatos) dibujar();
    }

    // Top N + "Otros": el % acumulado de "Otros" es el real sobre todas las categorías.
    _aplicarTopNOtros(pareto, topN = 10) {
        if (pareto.length <= topN) return pareto;
        const resto = pareto.slice(topN);
        return [...pareto.slice(0, topN), {
            defecto: "Otros",
            frecuencia: resto.reduce((s, r) => s + r.frecuencia, 0),
            porcentajeAcumulado: pareto[pareto.length - 1].porcentajeAcumulado,
            esOtros: true,
        }];
    }

    _formatearMesCorto(mesIso) {
        const [anio, mes] = String(mesIso).split("-").map(Number);
        const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
        return `${meses[mes - 1] || mesIso} ${String(anio).slice(-2)}`;
    }

    // ---------- Gráficos (Chart.js local, mismo patrón que No Conformidades INNPACK) ----------

    // Muestra TODAS las categorías (sin ocultar datos); el alto crece con la cantidad de filas y
    // el contenedor .nci-chart-scroll agrega scroll interno.
    _chartBarHorizontal(canvasId, rows, label, titulo) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        ctx.style.setProperty("height", `${Math.max(180, rows.length * 26)}px`, "important");

        const paleta = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#14b8a6"];
        const chart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: rows.map(r => r.categoria || "-"),
                datasets: [{
                    label,
                    data: rows.map(r => Number(r.total || 0)),
                    backgroundColor: rows.map((_, i) => paleta[i % paleta.length]),
                    borderRadius: 8,
                }],
            },
            options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 11 } } } },
            },
        });
        this._statsCharts.push({ chart, titulo });
    }

    _chartBarVertical(canvasId, rows, titulo) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const chart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: rows.map(r => r.mesLabel),
                datasets: [{ label: "NC internas", data: rows.map(r => r.total), backgroundColor: "#3b82f6", borderRadius: 6 }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } },
                    x: { ticks: { autoSkip: true, maxRotation: 45, font: { size: 11 } } },
                },
            },
        });
        this._statsCharts.push({ chart, titulo });
    }

    _chartDoughnut(canvasId, rows, titulo) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const chart = new Chart(ctx, {
            type: "doughnut",
            data: {
                labels: rows.map(r => r.categoria || "-"),
                datasets: [{
                    data: rows.map(r => Number(r.total || 0)),
                    backgroundColor: ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#14b8a6", "#64748b", "#0ea5e9"],
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "right", labels: { font: { size: 11 } } } },
                cutout: "62%",
            },
        });
        this._statsCharts.push({ chart, titulo });
    }

    // Barras = frecuencia por tipo, línea = % acumulado en eje secundario.
    _chartPareto(canvasId, rows, titulo) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const truncar = (texto, max = 14) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);
        const chart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: rows.map(r => r.defecto || "-"),
                datasets: [
                    {
                        label: "Frecuencia",
                        data: rows.map(r => r.frecuencia),
                        backgroundColor: rows.map(r => (r.esOtros ? "#94a3b8" : "#3b82f6")),
                        borderRadius: 6,
                        yAxisID: "y",
                    },
                    {
                        type: "line",
                        label: "% Acumulado",
                        data: rows.map(r => r.porcentajeAcumulado),
                        borderColor: "#ef4444",
                        backgroundColor: "#ef4444",
                        pointRadius: 3,
                        tension: 0.25,
                        yAxisID: "y1",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "bottom", labels: { font: { size: 11 } } },
                    tooltip: { callbacks: { title: items => (items[0] ? rows[items[0].dataIndex]?.defecto || "" : "") } },
                },
                scales: {
                    y: { beginAtZero: true, position: "left", ticks: { precision: 0 }, title: { display: true, text: "Frecuencia" } },
                    y1: { beginAtZero: true, max: 100, position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "% Acumulado" } },
                    x: {
                        ticks: {
                            maxRotation: 40,
                            minRotation: 40,
                            font: { size: 10 },
                            callback: function (v) { return truncar(String(this.getLabelForValue(v))); },
                        },
                    },
                },
            },
        });
        this._statsCharts.push({ chart, titulo, full: true });
    }

    _destroyStatsCharts() {
        (this._statsCharts || []).forEach(({ chart }) => {
            try { chart.destroy(); } catch { /* noop */ }
        });
        this._statsCharts = [];
    }

    _setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = Number(value || 0).toLocaleString("es-CL");
    }

    // ---------- Reporte estadístico imprimible (mismo PrintExporter.printReport que NC) ----------

    // Captura los gráficos tal cual están en pantalla (mismo universo filtrado); si un canvas no
    // se puede capturar, se omite solo ese gráfico.
    _capturarGraficos() {
        const graficos = [];
        (this._statsCharts || []).forEach(({ chart, titulo, full }) => {
            const canvas = chart?.canvas;
            if (!canvas || !canvas.width || !canvas.height || canvas.style.display === "none") return;
            try {
                const imagen = canvas.toDataURL("image/png");
                if (imagen.startsWith("data:image/png;base64,") && imagen.length > 200) graficos.push({ titulo, imagen, full: !!full });
            } catch { /* se omite este gráfico */ }
        });
        return graficos;
    }

    _imprimirReporteEstadistico() {
        const items = this._itemsCompletos || [];
        const ind = this._calcularIndicadores(items);
        const cerradas = items.filter(nc => nc.estadoGestion === "CERRADA").length;
        const horasTotal = items.reduce((s, nc) => s + (Number(nc.tiempoPerdidoHoras) || 0), 0);

        window.PrintExporter.printReport({
            empresa: NcInternasController.EMPRESA,
            titulo: "Reporte Estadístico de NC Internas",
            subtitulo: this._resumenFiltrosTexto(),
            totalRegistros: items.length,
            resumen: [
                { label: "Total NC internas", valor: items.length },
                { label: "Abiertas", valor: items.length - cerradas },
                { label: "Cerradas", valor: cerradas },
                { label: "Horas perdidas", valor: this._horas(horasTotal) },
                { label: "NP afectadas", valor: ind.npAfectadas },
                { label: "NP con más de una NC", valor: ind.npReincidentes },
                { label: "Clientes afectados", valor: ind.clientesAfectados },
                { label: "Horas perdidas promedio por NC", valor: this._horas(ind.horasPromedio) },
            ],
            graficos: this._capturarGraficos(),
            tablas: [
                { titulo: "NC por área responsable", columnas: ["Área", "Total"], filas: ind.porArea.map(r => [r.categoria, r.total]) },
                {
                    titulo: "Pareto por tipo de desviación",
                    columnas: ["Tipo", "Frecuencia", "% Acumulado"],
                    filas: this._aplicarTopNOtros(ind.pareto).map(r => [r.defecto, r.frecuencia, `${r.porcentajeAcumulado}%`]),
                },
                { titulo: "Horas perdidas por área", columnas: ["Área", "Horas"], filas: ind.horasPorArea.map(r => [r.categoria, this._horas(r.total)]) },
                { titulo: "Etapa que detecta", columnas: ["Etapa", "Total"], filas: ind.porEtapa.map(r => [r.categoria, r.total]) },
                { titulo: "Clientes con más NC internas", columnas: ["Cliente", "Total"], filas: ind.porCliente.map(r => [r.categoria, r.total]) },
            ],
        });
    }


    // ---------- Helpers ----------

    _showMensaje(texto, ok) {
        this._showMensajeEn("nci-mensaje", texto, ok);
    }

    _mostrarError(elementId, texto) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.textContent = texto;
        el.style.display = "block";
    }

    _showMensajeEn(elementId, texto, ok) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.textContent = texto;
        el.style.display = "block";
        el.style.background = ok ? "#ECFDF5" : "#FEF2F2";
        el.style.color = ok ? "#065F46" : "#991B1B";
        el.style.borderLeftColor = ok ? "#10B981" : "#EF4444";
        setTimeout(() => { el.style.display = "none"; }, 4000);
    }

    _esc(valor) {
        return String(valor ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    _fecha(valor) {
        return window.DateUtils.formatear(valor);
    }

    _horas(valor) {
        const n = Number(valor || 0);
        return n.toLocaleString("es-CL", { maximumFractionDigits: 2 });
    }

    _badge(texto, color) {
        return `<span class="nci-badge" style="background:${color}1F;color:${color};">${this._esc(texto ?? "-")}</span>`;
    }

    _labelEstadoGestion(estado) {
        const map = { PENDIENTE: "Pendiente", ASIGNADA: "Asignada", EN_GESTION: "En gestión", CERRADA: "Cerrada" };
        return map[estado] || estado || "-";
    }

    _colorEstadoGestion(estado) {
        switch (estado) {
            case "CERRADA": return "#059669";
            case "EN_GESTION": return "#2563EB";
            case "ASIGNADA": return "#D97706";
            default: return "#64748B";
        }
    }
};
