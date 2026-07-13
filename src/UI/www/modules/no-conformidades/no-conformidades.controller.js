window.NoConformidadesController = class NoConformidadesController {

    init() {
        console.log("NoConformidadesController iniciado");

        this._page = 1;
        this._pageSize = 20;
        this._pages = 1;
        this._total = 0;
        this._filtrosOpciones = { clientes: [], tiposPnc: [], responsables: [], categoriasDefecto: [], areas: [], maquinas: [], operadores: [], supervisores: [], revisadoPor: [] };
        this._editingId = null;
        this._detalleActual = null;
        this._gestionId = null;
        this._analisisNcId = null;
        this._analisisActual = null;
        this._acciones = [];

        document.getElementById("ncq-nuevo-btn")?.addEventListener("click", () => this._abrirNuevo());
        document.getElementById("ncq-exportar-btn")?.addEventListener("click", () => this._exportar());
        document.getElementById("ncq-filtrar-btn")?.addEventListener("click", () => { this._page = 1; this._loadLista(); });
        document.getElementById("ncq-limpiar-btn")?.addEventListener("click", () => this._limpiarFiltros());

        document.getElementById("ncq-form-cerrar-btn")?.addEventListener("click", () => this._cerrarForm());
        document.getElementById("ncq-form-cancelar-btn")?.addEventListener("click", () => this._cancelarEdicion());
        document.getElementById("ncq-form-editar-btn")?.addEventListener("click", () => this._habilitarEdicion());
        document.getElementById("ncq-f-guardar-btn")?.addEventListener("click", () => this._guardarForm());

        ["ncq-f-cant-rechazada", "ncq-f-cant-recuperada"].forEach(id =>
            document.getElementById(id)?.addEventListener("input", () => this._recalcularPctRecup()));

        document.getElementById("ncq-gestion-cerrar-btn")?.addEventListener("click", () => this._cerrarGestion());
        document.getElementById("ncq-gestion-guardar-btn")?.addEventListener("click", () => this._guardarGestion());
        document.getElementById("ncq-seguimiento-agregar-btn")?.addEventListener("click", () => this._agregarSeguimiento());
        document.getElementById("ncq-cerrar-nc-btn")?.addEventListener("click", () => this._cerrarNc());

        document.getElementById("ncq-analisis-cerrar-btn")?.addEventListener("click", () => this._cerrarAnalisis());
        document.getElementById("ncq-analisis-guardar-btn")?.addEventListener("click", () => this._guardarAnalisis());
        document.getElementById("ncq-accion-agregar-btn")?.addEventListener("click", () => this._agregarAccion());

        document.getElementById("ncq-paginacion")?.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-ncq-page]");
            if (!btn || btn.disabled) return;
            this._irPagina(Number(btn.dataset.ncqPage));
        });

        this._cargarFiltrosOpciones();
        this._loadLista();
    }

    destroy() {
        console.log("NoConformidadesController destruido");
    }

    _usuarioActual() {
        return sessionStorage.getItem("nombreUsuario") || sessionStorage.getItem("codigoUsuario") || "";
    }

    // ---------- Filtros ----------

    async _cargarFiltrosOpciones() {
        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.filtrosOpciones" });
            if (!res.ok) return;
            this._filtrosOpciones = res.data;

            const mapa = {
                "ncq-filtro-cliente": "clientes",
                "ncq-filtro-tipo-pnc": "tiposPnc",
                "ncq-filtro-responsable": "responsables",
            };
            Object.entries(mapa).forEach(([selectId, campo]) => {
                const select = document.getElementById(selectId);
                if (!select) return;
                const valorActual = select.value;
                select.innerHTML = `<option value="">Todos</option>` +
                    (this._filtrosOpciones[campo] || []).map(v => `<option value="${v}">${v}</option>`).join("");
                if (valorActual) select.value = valorActual;
            });

            const datalists = {
                "ncq-dl-cliente": "clientes",
                "ncq-dl-categoria": "categoriasDefecto",
                "ncq-dl-area": "areas",
                "ncq-dl-supervisor": "supervisores",
                "ncq-dl-revisado": "revisadoPor",
            };
            Object.entries(datalists).forEach(([id, campo]) => {
                const dl = document.getElementById(id);
                if (dl) dl.innerHTML = (this._filtrosOpciones[campo] || []).map(v => `<option value="${v}"></option>`).join("");
            });
        } catch { }

        // Máquina y Operador no salen de esta tabla (recién creada, vacía al principio) sino de
        // catálogos ya existentes en INNPACK: el listado real de máquinas activas (mismo que usa
        // el módulo "Máquinas y Procesos") y los usuarios que aparecen en Inspecciones (mismo
        // catálogo que ya usa el filtro "Inspector" de Dashboard/Registros Producción).
        this._cargarDatalistMaquinas();
        this._cargarDatalistOperadores();
    }

    async _cargarDatalistMaquinas() {
        try {
            const res = await window.PhotinoBridge.send({ action: "maquinasSeguimiento.obtenerResumen", data: {} });
            const dl = document.getElementById("ncq-dl-maquina");
            if (!dl || !res.ok) return;
            const nombres = (res.data.maquinas || []).map(m => m.nombre).filter(Boolean);
            dl.innerHTML = nombres.map(v => `<option value="${v}"></option>`).join("");
        } catch { }
    }

    async _cargarDatalistOperadores() {
        try {
            const res = await window.PhotinoBridge.send({ action: "dashboard.obtenerFiltros" });
            const dl = document.getElementById("ncq-dl-operador");
            if (!dl || !res.ok) return;
            const nombres = (res.data.usuarios || []).map(u => u.nombre).filter(Boolean);
            dl.innerHTML = nombres.map(v => `<option value="${v}"></option>`).join("");
        } catch { }
    }

    _getFiltros() {
        return {
            cliente: document.getElementById("ncq-filtro-cliente")?.value || "",
            tipoPnc: document.getElementById("ncq-filtro-tipo-pnc")?.value || "",
            nivel: document.getElementById("ncq-filtro-nivel")?.value || "",
            estadoGestion: document.getElementById("ncq-filtro-estado-gestion")?.value || "",
            responsable: document.getElementById("ncq-filtro-responsable")?.value || "",
            fechaDesde: document.getElementById("ncq-filtro-fecha-desde")?.value || "",
            fechaHasta: document.getElementById("ncq-filtro-fecha-hasta")?.value || "",
        };
    }

    _limpiarFiltros() {
        ["ncq-filtro-cliente", "ncq-filtro-tipo-pnc", "ncq-filtro-nivel", "ncq-filtro-estado-gestion", "ncq-filtro-responsable"]
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
        ["ncq-filtro-fecha-desde", "ncq-filtro-fecha-hasta"].forEach(id => { document.getElementById(id).value = ""; });
        this._page = 1;
        this._loadLista();
    }

    // ---------- Listado ----------

    async _loadLista() {
        const tbody = document.getElementById("ncq-tbody");
        tbody.innerHTML = `<tr><td colspan="13">Cargando...</td></tr>`;

        const filtros = this._getFiltros();

        try {
            const [listRes, resumenRes] = await Promise.all([
                window.PhotinoBridge.send({ action: "noConformidades.list", page: this._page, pageSize: this._pageSize, ...filtros }),
                window.PhotinoBridge.send({ action: "noConformidades.resumen", ...filtros }),
            ]);

            if (!listRes.ok) {
                tbody.innerHTML = `<tr><td colspan="13">${listRes.error || "Error al cargar"}</td></tr>`;
                return;
            }

            this._items = listRes.data.items || [];
            this._total = listRes.data.total || 0;
            this._pages = listRes.data.pages || 1;
            this._page = listRes.data.page || 1;

            if (resumenRes.ok) this._renderResumen(resumenRes.data);
            this._renderTabla();
            this._renderPaginacion();
        } catch {
            tbody.innerHTML = `<tr><td colspan="13">Error de comunicación con el backend</td></tr>`;
        }
    }

    _renderResumen(r) {
        document.getElementById("ncq-total").textContent = r.total ?? 0;
        document.getElementById("ncq-abiertas").textContent = r.abiertas ?? 0;
        document.getElementById("ncq-cerradas").textContent = r.cerradas ?? 0;
        document.getElementById("ncq-criticas").textContent = r.criticas ?? 0;
    }

    _renderTabla() {
        const tbody = document.getElementById("ncq-tbody");

        if (!this._items.length) {
            tbody.innerHTML = `<tr><td colspan="13">Sin registros</td></tr>`;
            return;
        }

        tbody.innerHTML = this._items.map(nc => `
            <tr>
                <td>${nc.codigo ?? "-"}</td>
                <td>${this._fecha(nc.fechaIngreso)}</td>
                <td>${this._fecha(nc.fechaSalida)}</td>
                <td>${nc.npNv ?? "-"}</td>
                <td>${nc.cliente ?? "-"}</td>
                <td>${nc.producto ?? "-"}</td>
                <td>${nc.tipoPnc ?? "-"}</td>
                <td>${nc.categoriaDefecto ?? "-"}</td>
                <td>${this._badge(nc.nivel, this._colorSeveridad(nc.severidad || nc.nivel))}</td>
                <td>${this._badge(this._labelEstadoGestion(nc.estadoGestion), this._colorEstadoGestion(nc.estadoGestion))}</td>
                <td>${nc.responsable ?? "-"}</td>
                <td>${this._fecha(nc.fechaCompromiso)}</td>
                <td>
                    <button class="btn-ghost ncq-ver-btn" data-id="${nc.id}">Ver</button>
                    <button class="btn-primary ncq-analizar-btn" data-id="${nc.id}">Analizar</button>
                    <button class="btn-secondary ncq-gestionar-btn" data-id="${nc.id}">Gestionar</button>
                </td>
            </tr>
        `).join("");

        tbody.querySelectorAll(".ncq-ver-btn").forEach(btn => btn.addEventListener("click", () => this._verDetalle(Number(btn.dataset.id))));
        tbody.querySelectorAll(".ncq-analizar-btn").forEach(btn => btn.addEventListener("click", () => this._abrirAnalisis(Number(btn.dataset.id))));
        tbody.querySelectorAll(".ncq-gestionar-btn").forEach(btn => btn.addEventListener("click", () => this._abrirGestion(Number(btn.dataset.id))));
    }

    _renderPaginacion() {
        const container = document.getElementById("ncq-paginacion");
        if (!container) return;

        let html = "";
        const rango = 2;
        const inicio = Math.max(1, this._page - rango);
        const fin = Math.min(this._pages, this._page + rango);

        if (this._page > 1) html += `<button data-ncq-page="${this._page - 1}">←</button>`;
        if (inicio > 1) {
            html += `<button data-ncq-page="1">1</button>`;
            if (inicio > 2) html += `<button disabled>...</button>`;
        }
        for (let i = inicio; i <= fin; i++) {
            html += `<button data-ncq-page="${i}" class="${i === this._page ? "active" : ""}">${i}</button>`;
        }
        if (fin < this._pages) {
            if (fin < this._pages - 1) html += `<button disabled>...</button>`;
            html += `<button data-ncq-page="${this._pages}">${this._pages}</button>`;
        }
        if (this._page < this._pages) html += `<button data-ncq-page="${this._page + 1}">→</button>`;

        container.innerHTML = html;
    }

    _irPagina(pagina) {
        if (pagina < 1 || pagina > this._pages) return;
        this._page = pagina;
        this._loadLista();
    }

    // ---------- Formulario (Nueva NC / Ver / Editar) ----------

    _camposMap() {
        return {
            fechaIngreso: { id: "ncq-f-fecha-ingreso", tipo: "fecha" },
            npNv: { id: "ncq-f-np-nv", tipo: "texto" },
            cliente: { id: "ncq-f-cliente", tipo: "texto" },
            codigoProducto: { id: "ncq-f-codigo", tipo: "texto" },
            producto: { id: "ncq-f-producto", tipo: "texto" },
            tipoPnc: { id: "ncq-f-tipo-pnc", tipo: "texto" },
            nivel: { id: "ncq-f-nivel", tipo: "texto" },
            categoriaDefecto: { id: "ncq-f-categoria-defecto", tipo: "texto" },
            tipoFalla: { id: "ncq-f-tipo-falla", tipo: "texto" },
            impacto: { id: "ncq-f-impacto", tipo: "texto" },
            cantRequerida: { id: "ncq-f-cant-requerida", tipo: "numero" },
            cantRechazada: { id: "ncq-f-cant-rechazada", tipo: "numero" },
            cantRecuperada: { id: "ncq-f-cant-recuperada", tipo: "numero" },
            pncReal: { id: "ncq-f-pnc-real", tipo: "numero" },
            area: { id: "ncq-f-area", tipo: "texto" },
            maquina: { id: "ncq-f-maquina", tipo: "texto" },
            operador: { id: "ncq-f-operador", tipo: "texto" },
            supervisor: { id: "ncq-f-supervisor", tipo: "texto" },
            revisadoPor: { id: "ncq-f-revisado-por", tipo: "texto" },
            fechaSalida: { id: "ncq-f-fecha-salida", tipo: "fecha" },
            fechaFabricacion: { id: "ncq-f-fecha-fabricacion", tipo: "fecha" },
            descripcionDefecto: { id: "ncq-f-descripcion-defecto", tipo: "texto" },
            observacion: { id: "ncq-f-observacion", tipo: "texto" },
            causaRaiz: { id: "ncq-f-causa-raiz", tipo: "texto" },
            accionesCorrectivas: { id: "ncq-f-acciones-correctivas", tipo: "texto" },
            verificacionSeguimiento: { id: "ncq-f-verificacion-seguimiento", tipo: "texto" },
        };
    }

    _leerCampo(campo, tipo) {
        const raw = document.getElementById(this._camposMap()[campo].id).value;
        if (tipo === "numero") return raw === "" ? null : parseFloat(raw);
        if (tipo === "fecha") return raw || null;
        return raw.trim();
    }

    _setModoEdicion(editable) {
        Object.values(this._camposMap()).forEach(({ id }) => { document.getElementById(id).disabled = !editable; });
        document.getElementById("ncq-form-editar-btn").style.display = (!editable && this._editingId) ? "inline-block" : "none";
        document.getElementById("ncq-f-guardar-btn").style.display = editable ? "inline-block" : "none";
        document.getElementById("ncq-f-cancelar-btn").style.display = (editable && this._editingId) ? "inline-block" : "none";
    }

    _abrirNuevo() {
        this._editingId = null;
        this._detalleActual = null;
        document.getElementById("ncq-form-titulo").textContent = "Nueva No Conformidad";
        document.getElementById("ncq-form-subtitulo").textContent = "Se guarda como una No Conformidad completa, disponible para gestionar de inmediato";
        document.getElementById("ncq-form-error").style.display = "none";

        Object.entries(this._camposMap()).forEach(([campo, { id }]) => { document.getElementById(id).value = ""; });
        document.getElementById("ncq-f-fecha-ingreso").value = new Date().toISOString().substring(0, 10);
        document.getElementById("ncq-f-nivel").value = "Mayor";
        document.getElementById("ncq-f-impacto").value = "Calidad";
        document.getElementById("ncq-f-pct-recup").value = "";

        this._setModoEdicion(true);
        document.getElementById("ncq-form-modal").style.display = "flex";
    }

    async _verDetalle(id) {
        document.getElementById("ncq-form-modal").style.display = "flex";
        document.getElementById("ncq-form-titulo").textContent = "Cargando...";
        document.getElementById("ncq-form-error").style.display = "none";

        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.get", id });
            if (!res.ok) {
                document.getElementById("ncq-form-error").textContent = res.error || "Error al cargar el detalle";
                document.getElementById("ncq-form-error").style.display = "block";
                return;
            }

            this._editingId = id;
            this._detalleActual = res.data;
            document.getElementById("ncq-form-titulo").textContent = `No Conformidad ${res.data.codigo ?? ""}`;
            document.getElementById("ncq-form-subtitulo").textContent = `Estado gestión: ${this._labelEstadoGestion(res.data.estadoGestion)}`;
            this._renderForm(res.data);
            this._setModoEdicion(false);
        } catch {
            document.getElementById("ncq-form-error").textContent = "Error de comunicación con el backend";
            document.getElementById("ncq-form-error").style.display = "block";
        }
    }

    _renderForm(nc) {
        Object.entries(this._camposMap()).forEach(([campo, { id, tipo }]) => {
            const el = document.getElementById(id);
            if (tipo === "fecha") el.value = nc[campo] ? String(nc[campo]).substring(0, 10) : "";
            else el.value = nc[campo] ?? "";
        });
        this._recalcularPctRecup();
    }

    _habilitarEdicion() {
        this._setModoEdicion(true);
    }

    _cancelarEdicion() {
        if (this._detalleActual) this._renderForm(this._detalleActual);
        this._setModoEdicion(false);
    }

    _cerrarForm() {
        document.getElementById("ncq-form-modal").style.display = "none";
    }

    _mapNivelASeveridad(nivel) {
        const n = (nivel || "").toUpperCase();
        if (n.includes("CRIT")) return "ALTA";
        if (n.includes("MAYOR")) return "MEDIA";
        if (n.includes("MENOR")) return "BAJA";
        return "MEDIA";
    }

    _recalcularPctRecup() {
        const rechazada = parseFloat(document.getElementById("ncq-f-cant-rechazada").value);
        const recuperada = parseFloat(document.getElementById("ncq-f-cant-recuperada").value);
        const el = document.getElementById("ncq-f-pct-recup");
        if (!rechazada || isNaN(recuperada)) { el.value = ""; return; }
        el.value = `${(recuperada / rechazada * 100).toFixed(2)}%`;
    }

    async _guardarForm() {
        const errorEl = document.getElementById("ncq-form-error");
        errorEl.style.display = "none";

        const campos = {};
        Object.entries(this._camposMap()).forEach(([campo, { tipo }]) => { campos[campo] = this._leerCampo(campo, tipo); });

        if (!campos.npNv || !campos.cliente || !campos.codigoProducto || !campos.producto || !campos.categoriaDefecto
            || !campos.nivel || !campos.descripcionDefecto || campos.cantRequerida === null || campos.cantRechazada === null) {
            errorEl.textContent = "NP/NV, Cliente, Código, Producto, Categoría defecto, Nivel, Descripción defecto, "
                + "Cant. requerida y Cant. rechazada son obligatorios";
            errorEl.style.display = "block";
            return;
        }

        const hoy = new Date().toISOString().substring(0, 10);
        const fechaIngreso = campos.fechaIngreso || hoy;

        const cabecera = {
            tipo: "INTERNA",
            origen: "AUDITORIA_INTERNA",
            titulo: `PNC ${campos.npNv} - ${campos.producto || campos.cliente}`.trim(),
            descripcion: [campos.categoriaDefecto, campos.descripcionDefecto].filter(Boolean).join(" - "),
            severidad: this._mapNivelASeveridad(campos.nivel),
            proceso: campos.tipoPnc || campos.area || "PNC Nueva",
            fechaDeteccion: fechaIngreso,
        };

        const usuario = this._usuarioActual();
        const payload = { ...campos, fechaIngreso, ...cabecera };

        const btn = document.getElementById("ncq-f-guardar-btn");
        btn.disabled = true;
        try {
            const action = this._editingId ? "noConformidades.update" : "noConformidades.create";
            const res = await window.PhotinoBridge.send({
                action,
                ...(this._editingId ? { id: this._editingId, actualizadoPor: usuario } : { creadoPor: usuario }),
                ...payload,
            });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al guardar la no conformidad";
                errorEl.style.display = "block";
                return;
            }

            this._cerrarForm();
            this._showMensaje(this._editingId ? "No conformidad actualizada" : "No conformidad creada", true);
            this._cargarFiltrosOpciones();
            await this._loadLista();
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            btn.disabled = false;
        }
    }

    _showMensaje(texto, ok) {
        const el = document.getElementById("ncq-mensaje");
        el.textContent = texto;
        el.style.display = "block";
        el.style.background = ok ? "#ECFDF5" : "#FEF2F2";
        el.style.color = ok ? "#065F46" : "#991B1B";
        el.style.borderLeftColor = ok ? "#10B981" : "#EF4444";
        setTimeout(() => { el.style.display = "none"; }, 4000);
    }

    // ---------- Gestionar ----------

    async _abrirGestion(id) {
        this._gestionId = id;
        document.getElementById("ncq-gestion-error").style.display = "none";
        document.getElementById("ncq-gestion-mensaje").style.display = "none";
        document.getElementById("ncq-gestion-titulo").textContent = "Cargando...";
        document.getElementById("ncq-gestion-modal").style.display = "flex";

        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.get", id });
            if (!res.ok) {
                document.getElementById("ncq-gestion-error").textContent = res.error || "Error al cargar la no conformidad";
                document.getElementById("ncq-gestion-error").style.display = "block";
                return;
            }

            const nc = res.data;
            document.getElementById("ncq-gestion-titulo").textContent = `Gestionar ${nc.codigo ?? ""}`;
            document.getElementById("ncq-gestion-responsable").value = nc.responsable || "";
            document.getElementById("ncq-gestion-estado").value = nc.estadoGestion || "PENDIENTE";
            document.getElementById("ncq-gestion-fecha-compromiso").value = nc.fechaCompromiso ? String(nc.fechaCompromiso).substring(0, 10) : "";
            document.getElementById("ncq-cierre-comentario").value = "";
            document.getElementById("ncq-seguimiento-comentario").value = "";

            await this._cargarSeguimiento(id);
        } catch {
            document.getElementById("ncq-gestion-error").textContent = "Error de comunicación con el backend";
            document.getElementById("ncq-gestion-error").style.display = "block";
        }
    }

    _cerrarGestion() {
        document.getElementById("ncq-gestion-modal").style.display = "none";
        this._gestionId = null;
    }

    async _guardarGestion() {
        if (!this._gestionId) return;
        const errorEl = document.getElementById("ncq-gestion-error");
        errorEl.style.display = "none";

        const payload = {
            id: this._gestionId,
            responsable: document.getElementById("ncq-gestion-responsable").value.trim(),
            estadoGestion: document.getElementById("ncq-gestion-estado").value,
            fechaCompromiso: document.getElementById("ncq-gestion-fecha-compromiso").value || null,
            actualizadoPor: this._usuarioActual(),
        };

        const btn = document.getElementById("ncq-gestion-guardar-btn");
        btn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.gestion.actualizar", ...payload });
            if (!res.ok) {
                errorEl.textContent = res.error || "Error al guardar la gestión";
                errorEl.style.display = "block";
                return;
            }
            this._showGestionMensaje("Gestión actualizada", true);
            await this._loadLista();
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            btn.disabled = false;
        }
    }

    async _cargarSeguimiento(ncId) {
        const cont = document.getElementById("ncq-seguimiento-lista");
        cont.innerHTML = "Cargando...";
        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.seguimiento.list", id: ncId });
            const items = res.ok && Array.isArray(res.data) ? res.data : [];
            if (!items.length) { cont.innerHTML = `<div>Sin comentarios de seguimiento</div>`; return; }
            cont.innerHTML = items.map(c => `
                <div class="ncq-seguimiento-item">
                    <div>${c.comentario ?? "-"}</div>
                    <div class="ncq-seguimiento-meta">${c.autor ?? "Sin autor"} · ${c.creadoEn ? new Date(c.creadoEn).toLocaleString("es-CL") : "-"}</div>
                </div>
            `).join("");
        } catch {
            cont.innerHTML = `<div>Error al cargar el seguimiento</div>`;
        }
    }

    async _agregarSeguimiento() {
        if (!this._gestionId) return;
        const comentario = document.getElementById("ncq-seguimiento-comentario").value.trim();
        if (!comentario) return;

        try {
            const res = await window.PhotinoBridge.send({
                action: "noConformidades.seguimiento.crear",
                id: this._gestionId,
                comentario,
                autor: this._usuarioActual(),
            });
            if (!res.ok) { this._showGestionMensaje(res.error || "Error al agregar el comentario", false); return; }
            document.getElementById("ncq-seguimiento-comentario").value = "";
            await this._cargarSeguimiento(this._gestionId);
            this._showGestionMensaje("Comentario agregado", true);
        } catch {
            this._showGestionMensaje("Error de comunicación con el backend", false);
        }
    }

    async _cerrarNc() {
        if (!this._gestionId) return;
        if (!confirm("¿Cerrar esta No Conformidad? Quedará marcada como CERRADA.")) return;

        const comentarioCierre = document.getElementById("ncq-cierre-comentario").value.trim();
        try {
            const res = await window.PhotinoBridge.send({
                action: "noConformidades.cerrar",
                id: this._gestionId,
                cerradoPor: this._usuarioActual(),
                comentarioCierre: comentarioCierre || null,
            });
            if (!res.ok) { this._showGestionMensaje(res.error || "Error al cerrar la no conformidad", false); return; }
            this._cerrarGestion();
            this._showMensaje("No conformidad cerrada", true);
            await this._loadLista();
        } catch {
            this._showGestionMensaje("Error de comunicación con el backend", false);
        }
    }

    _showGestionMensaje(texto, ok) {
        const el = document.getElementById("ncq-gestion-mensaje");
        el.textContent = texto;
        el.style.display = "block";
        el.style.background = ok ? "#ECFDF5" : "#FEF2F2";
        el.style.color = ok ? "#065F46" : "#991B1B";
        el.style.borderLeftColor = ok ? "#10B981" : "#EF4444";
        setTimeout(() => { el.style.display = "none"; }, 4000);
    }

    // ---------- Analizar ----------

    async _abrirAnalisis(id) {
        this._analisisNcId = id;
        this._analisisActual = null;
        this._acciones = [];

        document.getElementById("ncq-analisis-titulo").textContent = "Cargando...";
        document.getElementById("ncq-analisis-error").style.display = "none";
        document.getElementById("ncq-analisis-mensaje").style.display = "none";
        document.getElementById("ncq-analisis-modal").style.display = "flex";

        try {
            const ncRes = await window.PhotinoBridge.send({ action: "noConformidades.get", id });
            if (ncRes.ok) document.getElementById("ncq-analisis-titulo").textContent = `Análisis y Plan de Acción — ${ncRes.data.codigo ?? ""}`;
        } catch { }

        await this._cargarAnalisis();
        await this._cargarAcciones();
    }

    _cerrarAnalisis() {
        document.getElementById("ncq-analisis-modal").style.display = "none";
        this._analisisNcId = null;
    }

    async _cargarAnalisis() {
        const errorEl = document.getElementById("ncq-analisis-error");
        errorEl.style.display = "none";
        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.analisis.get", id: this._analisisNcId });
            this._analisisActual = res.ok ? res.data : null;
            if (!res.ok) { errorEl.textContent = res.error || "Error al cargar el análisis"; errorEl.style.display = "block"; }
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
            this._analisisActual = null;
        }
        this._renderAnalisisForm();
    }

    _renderAnalisisForm() {
        const a = this._analisisActual;
        document.getElementById("ncq-analisis-metodologia").value = a?.metodologia || "CINCO_PORQUES";
        document.getElementById("ncq-analisis-problema").value = a?.problemaDetectado || "";
        document.getElementById("ncq-analisis-porque1").value = a?.porque1 || "";
        document.getElementById("ncq-analisis-porque2").value = a?.porque2 || "";
        document.getElementById("ncq-analisis-porque3").value = a?.porque3 || "";
        document.getElementById("ncq-analisis-porque4").value = a?.porque4 || "";
        document.getElementById("ncq-analisis-porque5").value = a?.porque5 || "";
        document.getElementById("ncq-analisis-causa-raiz").value = a?.causaRaiz || "";
        document.getElementById("ncq-analisis-conclusion").value = a?.conclusion || "";
    }

    async _guardarAnalisis() {
        const errorEl = document.getElementById("ncq-analisis-error");
        errorEl.style.display = "none";

        const payload = {
            metodologia: document.getElementById("ncq-analisis-metodologia").value,
            problemaDetectado: document.getElementById("ncq-analisis-problema").value.trim(),
            porque1: document.getElementById("ncq-analisis-porque1").value.trim(),
            porque2: document.getElementById("ncq-analisis-porque2").value.trim(),
            porque3: document.getElementById("ncq-analisis-porque3").value.trim(),
            porque4: document.getElementById("ncq-analisis-porque4").value.trim(),
            porque5: document.getElementById("ncq-analisis-porque5").value.trim(),
            causaRaiz: document.getElementById("ncq-analisis-causa-raiz").value.trim(),
            conclusion: document.getElementById("ncq-analisis-conclusion").value.trim(),
        };

        if (!payload.problemaDetectado) {
            errorEl.textContent = "El problema detectado es obligatorio";
            errorEl.style.display = "block";
            return;
        }
        if (!confirm("¿Guardar el análisis de causa raíz de esta no conformidad?")) return;

        const btn = document.getElementById("ncq-analisis-guardar-btn");
        btn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({
                action: "noConformidades.analisis.guardar",
                id: this._analisisNcId,
                usuario: this._usuarioActual(),
                ...payload,
            });
            if (!res.ok) { errorEl.textContent = res.error || "Error al guardar el análisis"; errorEl.style.display = "block"; return; }
            await this._cargarAnalisis();
            this._showAnalisisMensaje("Análisis guardado correctamente", true);
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            btn.disabled = false;
        }
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
        const tbody = document.getElementById("ncq-acciones-tbody");
        if (!this._acciones.length) {
            tbody.innerHTML = `<tr><td colspan="6">Sin acciones correctivas</td></tr>`;
            return;
        }

        const estados = ["PENDIENTE", "EN_PROCESO", "COMPLETADA", "CANCELADA"];
        tbody.innerHTML = this._acciones.map(a => `
            <tr>
                <td>${a.descripcion ?? "-"}</td>
                <td>${a.responsable ?? "-"}</td>
                <td>${this._fecha(a.fechaLimite)}</td>
                <td>${a.prioridad ?? "-"}</td>
                <td>
                    <select class="ncq-accion-estado-select" data-id="${a.id}">
                        ${estados.map(e => `<option value="${e}" ${e === a.estado ? "selected" : ""}>${e}</option>`).join("")}
                    </select>
                </td>
                <td><button class="btn-secondary ncq-accion-guardar-btn" data-id="${a.id}">Guardar</button></td>
            </tr>
        `).join("");

        tbody.querySelectorAll(".ncq-accion-guardar-btn").forEach(btn =>
            btn.addEventListener("click", () => this._actualizarEstadoAccion(btn.dataset.id)));
    }

    async _agregarAccion() {
        const errorEl = document.getElementById("ncq-accion-error");
        errorEl.style.display = "none";

        const payload = {
            descripcion: document.getElementById("ncq-accion-descripcion").value.trim(),
            responsable: document.getElementById("ncq-accion-responsable").value.trim(),
            fechaLimite: document.getElementById("ncq-accion-fecha-limite").value,
            prioridad: document.getElementById("ncq-accion-prioridad").value || null,
        };

        if (!payload.descripcion || !payload.responsable || !payload.fechaLimite) {
            errorEl.textContent = "Descripción, responsable y fecha límite son obligatorios";
            errorEl.style.display = "block";
            return;
        }
        if (!confirm("¿Agregar esta acción correctiva a la no conformidad?")) return;

        const btn = document.getElementById("ncq-accion-agregar-btn");
        btn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({
                action: "noConformidades.acciones.crear",
                id: this._analisisNcId,
                analisisId: this._analisisActual?.id ?? null,
                creadoPor: this._usuarioActual(),
                ...payload,
            });
            if (!res.ok) { errorEl.textContent = res.error || "Error al agregar la acción"; errorEl.style.display = "block"; return; }

            document.getElementById("ncq-accion-descripcion").value = "";
            document.getElementById("ncq-accion-responsable").value = "";
            document.getElementById("ncq-accion-fecha-limite").value = "";
            document.getElementById("ncq-accion-prioridad").value = "";

            await this._cargarAcciones();
            this._showAnalisisMensaje("Acción correctiva agregada", true);
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            btn.disabled = false;
        }
    }

    async _actualizarEstadoAccion(accionId) {
        const accion = this._acciones.find(a => String(a.id) === String(accionId));
        if (!accion) return;

        const select = document.querySelector(`.ncq-accion-estado-select[data-id="${accionId}"]`);
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
            if (!res.ok) { this._showAnalisisMensaje(res.error || "Error al actualizar la acción", false); return; }
            await this._cargarAcciones();
            this._showAnalisisMensaje("Acción correctiva actualizada", true);
        } catch {
            this._showAnalisisMensaje("Error de comunicación con el backend", false);
        }
    }

    _showAnalisisMensaje(texto, ok) {
        const el = document.getElementById("ncq-analisis-mensaje");
        el.textContent = texto;
        el.style.display = "block";
        el.style.background = ok ? "#ECFDF5" : "#FEF2F2";
        el.style.color = ok ? "#065F46" : "#991B1B";
        el.style.borderLeftColor = ok ? "#10B981" : "#EF4444";
        setTimeout(() => { el.style.display = "none"; }, 4000);
    }

    // ---------- Presentación ----------

    _fecha(valor) {
        return valor ? new Date(valor).toLocaleDateString("es-CL") : "-";
    }

    _badge(texto, color) {
        return `<span class="ncq-badge" style="background:${color}1F;color:${color};">${texto ?? "-"}</span>`;
    }

    _colorSeveridad(valor) {
        const s = (valor || "").toUpperCase();
        if (s === "ALTA" || s.includes("CRIT")) return "#DC2626";
        if (s === "MEDIA" || s.includes("MAYOR")) return "#D97706";
        if (s === "BAJA" || s.includes("MENOR")) return "#059669";
        return "#64748B";
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

    // ---------- Exportar ----------

    async _exportar() {
        const filtros = this._getFiltros();
        try {
            const res = await window.PhotinoBridge.send({ action: "noConformidades.list", page: 1, pageSize: 999999, ...filtros });
            const items = res.ok && Array.isArray(res.data.items) ? res.data.items : [];
            this._exportarDesdeItems(items);
        } catch {
            this._showMensaje("Error al exportar", false);
        }
    }

    _exportarDesdeItems(items) {
        const tabla = document.createElement("table");
        tabla.id = "ncq-tabla-export-temp";
        tabla.style.position = "absolute";
        tabla.style.left = "-99999px";
        tabla.style.top = "0";

        tabla.innerHTML = `
            <thead>
                <tr>
                    <th>Código</th><th>Fecha ingreso</th><th>Fecha salida</th><th>NP/NV</th><th>Cliente</th>
                    <th>Producto</th><th>Tipo PNC</th><th>Categoría defecto</th><th>Nivel</th>
                    <th>Estado gestión</th><th>Responsable</th><th>Fecha compromiso</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(nc => `
                    <tr>
                        <td>${nc.codigo ?? "-"}</td>
                        <td>${this._fecha(nc.fechaIngreso)}</td>
                        <td>${this._fecha(nc.fechaSalida)}</td>
                        <td>${nc.npNv ?? "-"}</td>
                        <td>${nc.cliente ?? "-"}</td>
                        <td>${nc.producto ?? "-"}</td>
                        <td>${nc.tipoPnc ?? "-"}</td>
                        <td>${nc.categoriaDefecto ?? "-"}</td>
                        <td>${nc.nivel ?? "-"}</td>
                        <td>${this._labelEstadoGestion(nc.estadoGestion)}</td>
                        <td>${nc.responsable ?? "-"}</td>
                        <td>${this._fecha(nc.fechaCompromiso)}</td>
                    </tr>
                `).join("")}
            </tbody>
        `;

        document.body.appendChild(tabla);
        window.ExcelExporter.exportTable({
            tableSelector: "#ncq-tabla-export-temp",
            fileName: `no_conformidades_${Date.now()}.xlsx`,
            sheetName: "No Conformidades",
            title: "QCC - No Conformidades",
        });
        tabla.remove();
    }
};
