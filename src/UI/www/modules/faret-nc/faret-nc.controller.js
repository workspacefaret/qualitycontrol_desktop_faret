window.FaretNcController = class FaretNcController {

    init() {
        console.log("FaretNcController iniciado");

        this._dataItems = [];
        this._inspeccionItems = [];
        this._ncItems = [];
        this._items = []; // alias de _ncItems, usado por Ver/Editar/Analizar (búsqueda por id de NC)
        this._combinados = [];
        this._combinadosPorKey = new Map();
        this._editingId = null;
        this._gestionContext = null;
        this._page = 1;
        this._pageSize = 50;

        document.getElementById("fnc-refresh-btn")
            ?.addEventListener("click", () => this._loadLista());

        document.getElementById("fnc-nuevo-btn")
            ?.addEventListener("click", () => this._abrirNuevoPnc());

        document.getElementById("fnc-cancelar-btn")
            ?.addEventListener("click", () => this._cerrarForm());

        document.getElementById("fnc-guardar-btn")
            ?.addEventListener("click", () => this._guardar());

        document.getElementById("fnc-filtrar-btn")
            ?.addEventListener("click", () => { this._page = 1; this._renderTabla(); });

        document.getElementById("fnc-limpiar-btn")
            ?.addEventListener("click", () => this._limpiarFiltros());

        document.getElementById("fnc-anterior-btn")
            ?.addEventListener("click", () => this._irPagina(this._page - 1));

        document.getElementById("fnc-siguiente-btn")
            ?.addEventListener("click", () => this._irPagina(this._page + 1));

        document.getElementById("fnc-detalle-cerrar-btn")
            ?.addEventListener("click", () => this._cerrarDetalle());

        document.getElementById("fnc-reg-editar-btn")
            ?.addEventListener("click", () => this._habilitarEdicionRegistro());

        document.getElementById("fnc-reg-cancelar-btn")
            ?.addEventListener("click", () => this._cancelarEdicionRegistro());

        document.getElementById("fnc-reg-guardar-cambio-btn")
            ?.addEventListener("click", () => this._guardarCambioRegistro());

        document.getElementById("fnc-reg-guardar-todo-btn")
            ?.addEventListener("click", () => this._guardarTodoRegistro());

        document.getElementById("fnc-analisis-cerrar-btn")
            ?.addEventListener("click", () => this._cerrarAnalisis());

        document.getElementById("fnc-analisis-guardar-btn")
            ?.addEventListener("click", () => this._guardarAnalisis());

        document.getElementById("fnc-accion-agregar-btn")
            ?.addEventListener("click", () => this._agregarAccion());

        document.getElementById("fnc-exportar-btn")
            ?.addEventListener("click", () => this._exportar());

        document.getElementById("fnc-gestion-cerrar-btn")
            ?.addEventListener("click", () => this._cerrarGestion());

        document.getElementById("fnc-gcrear-confirmar-btn")
            ?.addEventListener("click", () => this._confirmarCrearGestion());

        document.getElementById("fnc-gestion-guardar-btn")
            ?.addEventListener("click", () => this._guardarGestion());

        document.getElementById("fnc-seguimiento-agregar-btn")
            ?.addEventListener("click", () => this._agregarSeguimiento());

        document.getElementById("fnc-cerrar-nc-btn")
            ?.addEventListener("click", () => this._cerrarNc());

        document.getElementById("fnc-npnc-cerrar-btn")
            ?.addEventListener("click", () => this._cerrarNuevoPnc());

        document.getElementById("fnc-npnc-cancelar-btn")
            ?.addEventListener("click", () => this._cerrarNuevoPnc());

        document.getElementById("fnc-npnc-guardar-btn")
            ?.addEventListener("click", () => this._guardarNuevoPnc());

        ["fnc-npnc-cant-rechazada", "fnc-npnc-cant-recuperada"].forEach(id =>
            document.getElementById(id)?.addEventListener("input", () => this._recalcularPctRecup()));

        this._ncAnalisisId = null;
        this._analisisActual = null;
        this._acciones = [];

        this._loadLista();
    }

    destroy() {
        console.log("FaretNcController destruido");
    }

    // ---------- Carga y fusión Data + NC ----------

    async _loadLista() {
        const loadingEl = document.getElementById("fnc-loading");
        const errorEl = document.getElementById("fnc-error");
        const tbody = document.getElementById("fnc-tbody");

        loadingEl.style.display = "block";
        errorEl.style.display = "none";

        try {
            const [dataItems, inspeccionItems, ncRes] = await Promise.all([
                this._cargarDataCompleta(),
                Promise.resolve([]), // Inspecciones deshabilitadas en este módulo (ver _cargarInspeccionesCompleta)
                window.PhotinoBridge.send({ action: "faret.nc.list" }),
            ]);

            if (!ncRes.ok) {
                errorEl.textContent = ncRes.error || "Error al cargar las no conformidades";
                errorEl.style.display = "block";
                tbody.innerHTML = `<tr><td colspan="14" class="faret-empty">Sin datos</td></tr>`;
                return;
            }

            this._dataItems = dataItems;
            this._inspeccionItems = inspeccionItems;
            this._ncItems = Array.isArray(ncRes.data) ? ncRes.data : [];
            this._items = this._ncItems;

            this._combinar();
            this._poblarFiltrosSelect();
            this._renderTabla();
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
            tbody.innerHTML = `<tr><td colspan="14" class="faret-empty">Sin datos</td></tr>`;
        } finally {
            loadingEl.style.display = "none";
        }
    }

    // Recorre todas las páginas de Data (tope real de 200 filas por página en la API).
    async _cargarDataCompleta() {
        const pageSize = 200;
        let page = 1;
        let total = Infinity;
        const items = [];

        while (items.length < total && page <= 200) {
            const res = await window.PhotinoBridge.send({
                action: "faret.data.list",
                page,
                pageSize,
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

    // Recorre todas las páginas de Inspecciones (misma API `calidad`, mismo tope de seguridad).
    async _cargarInspeccionesCompleta() {
        const pageSize = 200;
        let page = 1;
        let total = Infinity;
        const items = [];

        while (items.length < total && page <= 200) {
            const res = await window.PhotinoBridge.send({
                action: "faret.inspecciones.list",
                page,
                pageSize,
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

    // Une Data e Inspecciones (fuentes base) con la gestión de NC vinculada por
    // sistemaOrigen="DATA_FARET"/"INSPECCION_FARET" + origenId=String(id). Las NC que no calzan
    // con ninguna fila de Data/Inspecciones (manuales, o con un origenId que ya no existe) se
    // agregan igual al final para no perder información.
    _combinar() {
        const ncPorOrigenId = new Map();
        this._ncItems.forEach(nc => {
            if ((nc.sistemaOrigen === "DATA_FARET" || nc.sistemaOrigen === "INSPECCION_FARET") && nc.origenId) {
                ncPorOrigenId.set(`${nc.sistemaOrigen}:${nc.origenId}`, nc);
            }
        });

        const usados = new Set();

        const filasData = this._dataItems.map(d => {
            const nc = ncPorOrigenId.get(`DATA_FARET:${d.id}`) || null;
            if (nc) usados.add(nc.id);
            return this._normalizarFila(d, nc, null);
        });

        const filasInspecciones = this._inspeccionItems.map(i => {
            const nc = ncPorOrigenId.get(`INSPECCION_FARET:${i.id}`) || null;
            if (nc) usados.add(nc.id);
            return this._normalizarFila(null, nc, i);
        });

        const filasManuales = this._ncItems
            .filter(nc => !usados.has(nc.id))
            .map(nc => this._normalizarFila(null, nc, null));

        this._combinados = [...filasData, ...filasInspecciones, ...filasManuales];
        this._combinados.sort((a, b) => {
            const fa = a.fechaIngreso ? new Date(a.fechaIngreso).getTime() : -Infinity;
            const fb = b.fechaIngreso ? new Date(b.fechaIngreso).getTime() : -Infinity;
            return fb - fa; // más reciente primero; sin fecha queda al final
        });
        this._combinadosPorKey = new Map(this._combinados.map(f => [f.key, f]));
    }

    _normalizarFila(dataRow, ncRow, inspRow) {
        const fuente = dataRow ? "DATA" : (inspRow ? "INSPECCION" : "MANUAL");

        return {
            key: dataRow ? `data-${dataRow.id}` : (inspRow ? `insp-${inspRow.id}` : `nc-${ncRow.id}`),
            fuente,
            dataId: dataRow ? dataRow.id : null,
            inspeccionId: inspRow ? inspRow.id : null,
            data: dataRow,
            inspeccion: inspRow,
            nc: ncRow,
            tieneNc: !!ncRow,
            codigo: ncRow?.codigo || (dataRow ? `Data #${dataRow.id}` : (inspRow ? `Inspección #${inspRow.id}` : "-")),
            fechaIngreso: dataRow?.fechaIngreso || inspRow?.fechaRegistro || ncRow?.fechaCreacion || null,
            fechaSalida: dataRow?.fechaSalida || null,
            npNv: dataRow?.npNv || inspRow?.nvFaret || "-",
            cliente: dataRow?.cliente || "-",
            producto: dataRow?.producto || "-",
            tipoPnc: dataRow?.tipoPnc || inspRow?.areaControl || "-",
            categoriaDefecto: dataRow?.categoriaDefecto || inspRow?.defectos || "-",
            nivelSeveridad: dataRow?.nivel || ncRow?.severidad || "-",
            estadoGestion: ncRow?.estadoGestion || "SIN_GESTION",
            responsable: ncRow?.responsable || "-",
            fechaCompromiso: ncRow?.fechaCompromiso || null,
        };
    }

    // ---------- Filtros ----------

    // Arma las opciones de los <select> de Cliente/Tipo PNC/Responsable con los valores reales
    // ya presentes en this._combinados (dataset completo en memoria) — nada hardcodeado.
    _poblarFiltrosSelect() {
        const mapa = {
            "fnc-filtro-cliente": "cliente",
            "fnc-filtro-tipo-pnc": "tipoPnc",
            "fnc-filtro-responsable": "responsable",
        };

        Object.entries(mapa).forEach(([selectId, campo]) => {
            const select = document.getElementById(selectId);
            if (!select) return;

            const valorActual = select.value;
            const valores = new Set(
                this._combinados
                    .map(f => (f[campo] || "").toString().trim())
                    .filter(v => v && v !== "-")
            );

            select.innerHTML = `<option value="">Todos</option>` +
                [...valores].sort().map(v => `<option value="${v}">${v}</option>`).join("");

            if (valorActual && valores.has(valorActual)) select.value = valorActual;
        });
    }

    _getFiltros() {
        return {
            cliente: document.getElementById("fnc-filtro-cliente")?.value.trim().toLowerCase() || "",
            tipoPnc: document.getElementById("fnc-filtro-tipo-pnc")?.value.trim().toLowerCase() || "",
            nivel: document.getElementById("fnc-filtro-nivel")?.value || "",
            estadoGestion: document.getElementById("fnc-filtro-estado-gestion")?.value || "",
            responsable: document.getElementById("fnc-filtro-responsable")?.value.trim().toLowerCase() || "",
            fuente: document.getElementById("fnc-filtro-fuente")?.value || "",
            fechaDesde: document.getElementById("fnc-filtro-fecha-desde")?.value || "",
            fechaHasta: document.getElementById("fnc-filtro-fecha-hasta")?.value || "",
        };
    }

    _limpiarFiltros() {
        document.getElementById("fnc-filtro-cliente").value = "";
        document.getElementById("fnc-filtro-tipo-pnc").value = "";
        document.getElementById("fnc-filtro-nivel").value = "";
        document.getElementById("fnc-filtro-estado-gestion").value = "";
        document.getElementById("fnc-filtro-responsable").value = "";
        document.getElementById("fnc-filtro-fuente").value = "";
        document.getElementById("fnc-filtro-fecha-desde").value = "";
        document.getElementById("fnc-filtro-fecha-hasta").value = "";
        this._page = 1;
        this._renderTabla();
    }

    _irPagina(pagina) {
        if (pagina < 1) return;
        this._page = pagina;
        this._renderTabla();
    }

    _filtrarItems() {
        const f = this._getFiltros();

        return this._combinados.filter(fila => {
            if (f.cliente && !fila.cliente.toLowerCase().includes(f.cliente)) return false;
            if (f.tipoPnc && !fila.tipoPnc.toLowerCase().includes(f.tipoPnc)) return false;
            if (f.nivel && fila.nivelSeveridad !== f.nivel) return false;
            if (f.estadoGestion && fila.estadoGestion !== f.estadoGestion) return false;
            if (f.responsable && !fila.responsable.toLowerCase().includes(f.responsable)) return false;
            if (f.fuente && fila.fuente !== f.fuente) return false;

            if (fila.fechaIngreso) {
                const fecha = String(fila.fechaIngreso).substring(0, 10);
                if (f.fechaDesde && fecha < f.fechaDesde) return false;
                if (f.fechaHasta && fecha > f.fechaHasta) return false;
            }

            return true;
        });
    }

    // ---------- Tabla ----------

    _renderTabla() {
        const filtrados = this._filtrarItems();
        this._renderResumen(filtrados);

        const totalPaginas = Math.max(1, Math.ceil(filtrados.length / this._pageSize));
        if (this._page > totalPaginas) this._page = totalPaginas;
        if (this._page < 1) this._page = 1;

        const inicio = (this._page - 1) * this._pageSize;
        const items = filtrados.slice(inicio, inicio + this._pageSize);

        const tbody = document.getElementById("fnc-tbody");

        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="14" class="faret-empty">Sin registros</td></tr>`;
            this._renderPaginacion(filtrados.length);
            return;
        }

        tbody.innerHTML = items.map(fila => `
            <tr>
                <td>${fila.codigo}</td>
                <td>${fila.fechaIngreso ? new Date(fila.fechaIngreso).toLocaleDateString("es-CL") : "-"}</td>
                <td>${fila.fechaSalida ? new Date(fila.fechaSalida).toLocaleDateString("es-CL") : "-"}</td>
                <td>${fila.npNv}</td>
                <td>${fila.cliente}</td>
                <td>${fila.producto}</td>
                <td>${fila.tipoPnc}</td>
                <td>${fila.categoriaDefecto}</td>
                <td>${this._badge(fila.nivelSeveridad, this._colorSeveridad(fila.nivelSeveridad))}</td>
                <td>${this._badge(this._labelEstadoGestion(fila.estadoGestion), this._colorEstadoGestion(fila.estadoGestion))}</td>
                <td>${fila.responsable}</td>
                <td>${fila.fechaCompromiso ? new Date(fila.fechaCompromiso).toLocaleDateString("es-CL") : "-"}</td>
                <td>${this._badge(this._labelFuente(fila.fuente), this._colorFuente(fila.fuente))}</td>
                <td>
                    ${fila.tieneNc ? `
                        <button class="btn-ghost fnc-ver-btn" data-key="${fila.key}">Ver</button>
                        <button class="btn-secondary fnc-editar-btn" data-key="${fila.key}" style="display:none;">Editar</button>
                        <button class="btn-primary fnc-analizar-btn" data-key="${fila.key}">Analizar</button>
                    ` : ""}
                    <button class="btn-secondary fnc-gestionar-btn" data-key="${fila.key}">Gestionar</button>
                </td>
            </tr>
        `).join("");

        tbody.querySelectorAll(".fnc-ver-btn").forEach(btn =>
            btn.addEventListener("click", () => this._verDetallePorKey(btn.dataset.key)));

        tbody.querySelectorAll(".fnc-editar-btn").forEach(btn =>
            btn.addEventListener("click", () => this._abrirFormEditarPorKey(btn.dataset.key)));

        tbody.querySelectorAll(".fnc-analizar-btn").forEach(btn =>
            btn.addEventListener("click", () => this._abrirAnalisisPorKey(btn.dataset.key)));

        tbody.querySelectorAll(".fnc-gestionar-btn").forEach(btn =>
            btn.addEventListener("click", () => this._abrirGestion(btn.dataset.key)));

        this._renderPaginacion(filtrados.length);
    }

    _renderPaginacion(totalFiltrado) {
        const totalPaginas = Math.max(1, Math.ceil(totalFiltrado / this._pageSize));
        document.getElementById("fnc-pagina-info").textContent = `Página ${this._page} de ${totalPaginas}`;
        document.getElementById("fnc-anterior-btn").disabled = this._page <= 1;
        document.getElementById("fnc-siguiente-btn").disabled = this._page >= totalPaginas;
    }

    _verDetallePorKey(key) {
        const fila = this._combinadosPorKey.get(key);
        if (fila?.nc) this._verDetalle(fila.nc.id, fila.dataId);
    }

    _abrirFormEditarPorKey(key) {
        const fila = this._combinadosPorKey.get(key);
        if (fila?.nc) this._abrirFormEditar(fila.nc.id);
    }

    _abrirAnalisisPorKey(key) {
        const fila = this._combinadosPorKey.get(key);
        if (fila?.nc) this._abrirAnalisis(fila.nc.id);
    }

    _renderResumen(items) {
        const esCerrada = estado => (estado || "").toUpperCase() === "CERRADA";
        const esCritica = valor => {
            const v = (valor || "").toUpperCase();
            return v === "ALTA" || v.includes("CRIT");
        };

        const conNc = items.filter(i => i.tieneNc);

        document.getElementById("fnc-total").textContent = conNc.length;
        document.getElementById("fnc-cerradas").textContent = conNc.filter(i => esCerrada(i.estadoGestion)).length;
        document.getElementById("fnc-abiertas").textContent = conNc.filter(i => !esCerrada(i.estadoGestion)).length;
        document.getElementById("fnc-criticas").textContent = items.filter(i => esCritica(i.nivelSeveridad)).length;
        document.getElementById("fnc-sin-gestion").textContent = items.filter(i => !i.tieneNc).length;
    }

    // ---------- Detalle (Ver) ----------

    async _verDetalle(id, dataId) {
        const modal = document.getElementById("fnc-detalle-modal");
        const body = document.getElementById("fnc-detalle-body");
        const regSeccion = document.getElementById("fnc-detalle-registro");

        body.innerHTML = "Cargando...";
        modal.style.display = "flex";
        regSeccion.style.display = "none";
        this._detalleDataId = dataId || null;
        this._detalleDataRow = null;

        try {
            const res = await window.PhotinoBridge.send({ action: "faret.nc.get", id: Number(id) });

            if (!res.ok) {
                body.innerHTML = `<div class="faret-error">${res.error || "Error al obtener el detalle"}</div>`;
                return;
            }

            const nc = res.data;
            body.innerHTML = `
                <div class="fnc-detalle-grid">
                    <div><strong>Código:</strong> ${nc.codigo ?? "-"}</div>
                    <div><strong>Estado:</strong> ${nc.estado ?? "-"}</div>
                    <div><strong>Estado de gestión:</strong> ${this._labelEstadoGestion(nc.estadoGestion)}</div>
                    <div><strong>Responsable:</strong> ${nc.responsable ?? "-"}</div>
                    <div><strong>Tipo:</strong> ${nc.tipo ?? "-"}</div>
                    <div><strong>Origen:</strong> ${nc.origen ?? "-"}</div>
                    <div><strong>Severidad:</strong> ${nc.severidad ?? "-"}</div>
                    <div><strong>Proceso / Área:</strong> ${nc.proceso ?? "-"}</div>
                    <div><strong>Norma:</strong> ${nc.norma ?? "-"}</div>
                    <div><strong>Vínculo:</strong> ${
                        nc.sistemaOrigen === "DATA_FARET" && nc.origenId ? `Data #${nc.origenId}`
                        : nc.sistemaOrigen === "INSPECCION_FARET" && nc.origenId ? `Inspección #${nc.origenId}`
                        : "Manual"
                    }</div>
                    <div><strong>Fecha compromiso:</strong> ${nc.fechaCompromiso ? new Date(nc.fechaCompromiso).toLocaleDateString("es-CL") : "-"}</div>
                    <div><strong>Fecha creación:</strong> ${nc.fechaCreacion ? new Date(nc.fechaCreacion).toLocaleString("es-CL") : "-"}</div>
                </div>
                <div class="fnc-detalle-titulo"><strong>Título:</strong> ${nc.titulo ?? "-"}</div>
                <div class="fnc-detalle-descripcion"><strong>Descripción:</strong><br>${nc.descripcion ?? "-"}</div>
            `;
        } catch {
            body.innerHTML = `<div class="faret-error">Error de comunicación con el backend</div>`;
            return;
        }

        if (this._detalleDataId) {
            const dataRow = this._dataItems.find(d => String(d.id) === String(this._detalleDataId));
            if (dataRow) {
                this._detalleDataRow = dataRow;
                this._renderRegistro(dataRow);
                regSeccion.style.display = "block";
            }
        }
    }

    _cerrarDetalle() {
        document.getElementById("fnc-detalle-modal").style.display = "none";
    }

    // ---------- Registro completo (Data/importacion_pnc) dentro del modal de detalle ----------

    _regCamposMap() {
        return {
            fechaIngreso: { id: "fnc-reg-fecha-ingreso", tipo: "fecha" },
            npNv: { id: "fnc-reg-np-nv", tipo: "texto" },
            cliente: { id: "fnc-reg-cliente", tipo: "texto" },
            codigo: { id: "fnc-reg-codigo", tipo: "texto" },
            producto: { id: "fnc-reg-producto", tipo: "texto" },
            tipoPnc: { id: "fnc-reg-tipo-pnc", tipo: "texto" },
            nivel: { id: "fnc-reg-nivel", tipo: "texto" },
            categoriaDefecto: { id: "fnc-reg-categoria-defecto", tipo: "texto" },
            tipoFalla: { id: "fnc-reg-tipo-falla", tipo: "texto" },
            impacto: { id: "fnc-reg-impacto", tipo: "texto" },
            cantRequerida: { id: "fnc-reg-cant-requerida", tipo: "numero" },
            cantRechazada: { id: "fnc-reg-cant-rechazada", tipo: "numero" },
            cantRecuperada: { id: "fnc-reg-cant-recuperada", tipo: "numero" },
            pncReal: { id: "fnc-reg-pnc-real", tipo: "numero" },
            area: { id: "fnc-reg-area", tipo: "texto" },
            maquina: { id: "fnc-reg-maquina", tipo: "texto" },
            operador: { id: "fnc-reg-operador", tipo: "texto" },
            supervisor: { id: "fnc-reg-supervisor", tipo: "texto" },
            revisadoPor: { id: "fnc-reg-revisado-por", tipo: "texto" },
            fechaSalida: { id: "fnc-reg-fecha-salida", tipo: "fecha" },
            fechaFabricacion: { id: "fnc-reg-fecha-fabricacion", tipo: "fecha" },
            descripcionDefecto: { id: "fnc-reg-descripcion-defecto", tipo: "texto" },
            observacion: { id: "fnc-reg-observacion", tipo: "texto" },
            causaRaiz: { id: "fnc-reg-causa-raiz", tipo: "texto" },
            accionesCorrectivas: { id: "fnc-reg-acciones-correctivas", tipo: "texto" },
            verificacionSeguimiento: { id: "fnc-reg-verificacion-seguimiento", tipo: "texto" },
        };
    }

    _renderRegistro(d) {
        const campos = this._regCamposMap();
        Object.entries(campos).forEach(([campo, { id, tipo }]) => {
            const el = document.getElementById(id);
            if (tipo === "fecha") {
                el.value = d[campo] ? String(d[campo]).substring(0, 10) : "";
            } else {
                el.value = d[campo] ?? "";
            }
        });

        this._recalcularPctRecupRegistro();
        this._poblarDatalistsNuevoPnc(); // reutiliza los mismos <datalist> del modal "Nueva NC"
        this._modoEdicionRegistro(false);
        this._ultimoCampoEditadoRegistro = null;
        document.getElementById("fnc-reg-error").style.display = "none";
    }

    _modoEdicionRegistro(editable) {
        Object.values(this._regCamposMap()).forEach(({ id }) => {
            document.getElementById(id).disabled = !editable;
        });

        document.getElementById("fnc-reg-editar-btn").style.display = editable ? "none" : "inline-block";
        document.getElementById("fnc-reg-guardar-cambio-btn").style.display = editable ? "inline-block" : "none";
        document.getElementById("fnc-reg-guardar-todo-btn").style.display = editable ? "inline-block" : "none";
        document.getElementById("fnc-reg-cancelar-btn").style.display = editable ? "inline-block" : "none";
    }

    _habilitarEdicionRegistro() {
        this._modoEdicionRegistro(true);
        this._ultimoCampoEditadoRegistro = null;

        Object.entries(this._regCamposMap()).forEach(([campo, { id }]) => {
            const el = document.getElementById(id);
            const marcar = () => {
                this._ultimoCampoEditadoRegistro = campo;
                if (campo === "cantRechazada" || campo === "cantRecuperada") this._recalcularPctRecupRegistro();
            };
            el.oninput = marcar;
            el.onchange = marcar;
        });
    }

    _cancelarEdicionRegistro() {
        if (this._detalleDataRow) this._renderRegistro(this._detalleDataRow);
    }

    // Mismo cálculo que el backend (CantRecuperada / CantRechazada), solo para feedback visual.
    _recalcularPctRecupRegistro() {
        const rechazada = parseFloat(document.getElementById("fnc-reg-cant-rechazada").value);
        const recuperada = parseFloat(document.getElementById("fnc-reg-cant-recuperada").value);
        const el = document.getElementById("fnc-reg-pct-recup");

        if (!rechazada || isNaN(recuperada)) {
            el.value = "";
            return;
        }
        el.value = `${(recuperada / rechazada * 100).toFixed(2)}%`;
    }

    _leerValorCampoRegistro(campo) {
        const { id, tipo } = this._regCamposMap()[campo];
        const raw = document.getElementById(id).value;
        if (tipo === "numero") return raw === "" ? null : parseFloat(raw);
        if (tipo === "fecha") return raw || null;
        return raw.trim();
    }

    // Aplica los cambios ya guardados en la API al objeto en memoria (el mismo que usan la tabla
    // principal y el propio modal), recalcula % Recup. localmente y refresca la tabla — evita un
    // refetch completo de Data solo para reflejar la edición.
    _aplicarCambiosRegistroEnMemoria(cambios) {
        Object.assign(this._detalleDataRow, cambios);
        this._detalleDataRow.pctRecuperacion =
            this._detalleDataRow.cantRecuperada != null && this._detalleDataRow.cantRechazada > 0
                ? this._detalleDataRow.cantRecuperada / this._detalleDataRow.cantRechazada
                : null;
        this._combinar();
        this._renderTabla();
    }

    async _guardarCambioRegistro() {
        const errorEl = document.getElementById("fnc-reg-error");
        errorEl.style.display = "none";

        if (!this._ultimoCampoEditadoRegistro) {
            errorEl.textContent = "No se detectó ningún cambio. Modifique un campo antes de guardar.";
            errorEl.style.display = "block";
            return;
        }
        if (!this._detalleDataId) return;

        const campo = this._ultimoCampoEditadoRegistro;
        const valor = this._leerValorCampoRegistro(campo);

        const btn = document.getElementById("fnc-reg-guardar-cambio-btn");
        btn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.nc.actualizarRegistro",
                id: Number(this._detalleDataId),
                [campo]: valor,
            });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al guardar el cambio";
                errorEl.style.display = "block";
                return;
            }

            this._aplicarCambiosRegistroEnMemoria({ [campo]: valor });
            this._renderRegistro(this._detalleDataRow);
            this._showMensaje("Campo actualizado", true);
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            btn.disabled = false;
        }
    }

    async _guardarTodoRegistro() {
        const errorEl = document.getElementById("fnc-reg-error");
        errorEl.style.display = "none";
        if (!this._detalleDataId) return;

        const campos = this._regCamposMap();
        const payload = {};
        Object.keys(campos).forEach(campo => { payload[campo] = this._leerValorCampoRegistro(campo); });

        if (!payload.npNv || !payload.cliente || !payload.codigo || !payload.producto
            || !payload.descripcionDefecto || !payload.categoriaDefecto || !payload.nivel
            || payload.cantRequerida === null || payload.cantRechazada === null) {
            errorEl.textContent = "NP/NV, Cliente, Código, Producto, Categoría defecto, Nivel, "
                + "Descripción defecto, Cant. requerida y Cant. rechazada son obligatorios";
            errorEl.style.display = "block";
            return;
        }

        const btn = document.getElementById("fnc-reg-guardar-todo-btn");
        btn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.nc.actualizarRegistro",
                id: Number(this._detalleDataId),
                ...payload,
            });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al guardar los cambios";
                errorEl.style.display = "block";
                return;
            }

            this._aplicarCambiosRegistroEnMemoria(payload);
            this._renderRegistro(this._detalleDataRow);
            this._showMensaje("Registro actualizado completo", true);
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            btn.disabled = false;
        }
    }

    // ---------- Formulario Nueva / Editar NC (manual, sin vínculo a Data) ----------

    _abrirFormNuevo() {
        this._editingId = null;
        document.getElementById("fnc-form-titulo").textContent = "Nueva No Conformidad";
        document.getElementById("fnc-form-tipo").value = "INTERNA";
        document.getElementById("fnc-form-origen").value = "AUDITORIA_INTERNA";
        document.getElementById("fnc-form-titulo-input").value = "";
        document.getElementById("fnc-form-severidad").value = "ALTA";
        document.getElementById("fnc-form-proceso").value = "";
        document.getElementById("fnc-form-norma").value = "";
        document.getElementById("fnc-form-fecha").value = "";
        document.getElementById("fnc-form-reportado").value = "";
        document.getElementById("fnc-form-responsable").value = "";
        document.getElementById("fnc-form-estado-campo").style.display = "none";
        document.getElementById("fnc-form-nota-estado").style.display = "none";
        document.getElementById("fnc-form-error").style.display = "none";
        document.getElementById("fnc-form-card").style.display = "block";
    }

    _abrirFormEditar(id) {
        const item = this._items.find(i => String(i.id) === String(id));
        if (!item) return;

        this._editingId = item.id;
        document.getElementById("fnc-form-titulo").textContent = `Editar No Conformidad ${item.codigo ?? ""}`;
        document.getElementById("fnc-form-tipo").value = item.tipo ?? "INTERNA";
        document.getElementById("fnc-form-origen").value = item.origen ?? "AUDITORIA_INTERNA";
        document.getElementById("fnc-form-titulo-input").value = item.titulo ?? "";
        document.getElementById("fnc-form-severidad").value = item.severidad ?? "ALTA";
        document.getElementById("fnc-form-proceso").value = item.proceso ?? "";
        document.getElementById("fnc-form-norma").value = item.norma ?? "";
        document.getElementById("fnc-form-fecha").value = item.fechaCreacion ? item.fechaCreacion.substring(0, 10) : "";
        document.getElementById("fnc-form-descripcion").value = item.descripcion ?? "";
        // La API no devuelve "reportadoPor" ni "responsable" al listar/consultar, solo al crear.
        document.getElementById("fnc-form-reportado").value = "";
        document.getElementById("fnc-form-responsable").value = "";
        document.getElementById("fnc-form-estado").value = item.estado ?? "-";
        document.getElementById("fnc-form-estado-campo").style.display = "flex";
        document.getElementById("fnc-form-nota-estado").style.display = "block";
        document.getElementById("fnc-form-error").style.display = "none";
        document.getElementById("fnc-form-card").style.display = "block";
    }

    _cerrarForm() {
        document.getElementById("fnc-form-card").style.display = "none";
        this._editingId = null;
    }

    _showMensaje(texto, ok) {
        const el = document.getElementById("fnc-mensaje");
        el.textContent = texto;
        el.style.display = "block";
        el.style.background = ok ? "#ECFDF5" : "#FEF2F2";
        el.style.color = ok ? "#065F46" : "#991B1B";
        el.style.borderLeftColor = ok ? "#10B981" : "#EF4444";
        setTimeout(() => { el.style.display = "none"; }, 4000);
    }

    async _guardar() {
        const errorEl = document.getElementById("fnc-form-error");
        const guardarBtn = document.getElementById("fnc-guardar-btn");
        errorEl.style.display = "none";

        const payload = {
            tipo: document.getElementById("fnc-form-tipo").value,
            origen: document.getElementById("fnc-form-origen").value.trim(),
            titulo: document.getElementById("fnc-form-titulo-input").value.trim(),
            descripcion: document.getElementById("fnc-form-descripcion").value.trim(),
            severidad: document.getElementById("fnc-form-severidad").value,
            proceso: document.getElementById("fnc-form-proceso").value.trim(),
            norma: document.getElementById("fnc-form-norma").value.trim(),
            reportadoPor: document.getElementById("fnc-form-reportado").value.trim(),
            responsable: document.getElementById("fnc-form-responsable").value.trim(),
            fechaDeteccion: document.getElementById("fnc-form-fecha").value,
        };

        if (!payload.origen || !payload.titulo || !payload.descripcion || !payload.proceso || !payload.fechaDeteccion) {
            errorEl.textContent = "Origen, título, descripción, proceso/área y fecha de detección son obligatorios";
            errorEl.style.display = "block";
            return;
        }

        guardarBtn.disabled = true;
        try {
            const action = this._editingId ? "faret.nc.update" : "faret.nc.create";
            const res = await window.PhotinoBridge.send({
                action,
                ...(this._editingId ? { id: this._editingId } : {}),
                ...payload,
            });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al guardar la no conformidad";
                errorEl.style.display = "block";
                return;
            }

            this._cerrarForm();
            this._showMensaje(this._editingId ? "No conformidad actualizada" : "No conformidad creada", true);
            this._loadLista();
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            guardarBtn.disabled = false;
        }
    }

    _usuarioActual() {
        return sessionStorage.getItem("faretNombreUsuario") || "";
    }

    // ---------- Nueva No Conformidad (registro completo en Data + vínculo de gestión automático) ----------

    // Arma las <datalist> de autocompletar con los valores reales ya cargados en el módulo
    // (this._dataItems, ya se trae completo en _loadLista) — nada hardcodeado, se actualiza solo.
    _poblarDatalistsNuevoPnc() {
        const mapa = {
            "fnc-dl-cliente": "cliente",
            "fnc-dl-categoria": "categoriaDefecto",
            "fnc-dl-area": "area",
            "fnc-dl-maquina": "maquina",
            "fnc-dl-operador": "operador",
            "fnc-dl-supervisor": "supervisor",
            "fnc-dl-revisado": "revisadoPor",
        };

        Object.entries(mapa).forEach(([datalistId, campo]) => {
            const valores = new Set(
                this._dataItems
                    .map(d => (d[campo] || "").toString().trim())
                    .filter(Boolean)
            );
            const datalist = document.getElementById(datalistId);
            if (datalist) {
                datalist.innerHTML = [...valores].sort()
                    .map(v => `<option value="${v}"></option>`).join("");
            }
        });
    }

    _abrirNuevoPnc() {
        document.getElementById("fnc-npnc-error").style.display = "none";
        document.getElementById("fnc-npnc-fecha-ingreso").value = new Date().toLocaleDateString("es-CL");

        [
            "fnc-npnc-np-nv", "fnc-npnc-cliente", "fnc-npnc-codigo", "fnc-npnc-producto",
            "fnc-npnc-categoria-defecto", "fnc-npnc-cant-requerida", "fnc-npnc-cant-rechazada",
            "fnc-npnc-cant-recuperada", "fnc-npnc-pnc-real", "fnc-npnc-area", "fnc-npnc-maquina",
            "fnc-npnc-operador", "fnc-npnc-supervisor", "fnc-npnc-revisado-por",
            "fnc-npnc-fecha-salida", "fnc-npnc-fecha-fabricacion", "fnc-npnc-descripcion-defecto",
            "fnc-npnc-observacion", "fnc-npnc-causa-raiz", "fnc-npnc-acciones-correctivas",
            "fnc-npnc-verificacion-seguimiento",
        ].forEach(id => { document.getElementById(id).value = ""; });

        document.getElementById("fnc-npnc-tipo-pnc").value = "";
        document.getElementById("fnc-npnc-nivel").value = "Mayor";
        document.getElementById("fnc-npnc-tipo-falla").value = "";
        document.getElementById("fnc-npnc-impacto").value = "Calidad";
        document.getElementById("fnc-npnc-pct-recup").value = "";

        this._poblarDatalistsNuevoPnc();
        document.getElementById("fnc-nuevo-pnc-modal").style.display = "flex";
    }

    _cerrarNuevoPnc() {
        document.getElementById("fnc-nuevo-pnc-modal").style.display = "none";
    }

    // Mismo cálculo que el backend (CantRecuperada / CantRechazada), solo para feedback visual
    // inmediato — el valor que se guarda de verdad lo calcula la API.
    _recalcularPctRecup() {
        const rechazada = parseFloat(document.getElementById("fnc-npnc-cant-rechazada").value);
        const recuperada = parseFloat(document.getElementById("fnc-npnc-cant-recuperada").value);
        const el = document.getElementById("fnc-npnc-pct-recup");

        if (!rechazada || isNaN(recuperada)) {
            el.value = "";
            return;
        }
        el.value = `${(recuperada / rechazada * 100).toFixed(2)}%`;
    }

    async _guardarNuevoPnc() {
        const errorEl = document.getElementById("fnc-npnc-error");
        errorEl.style.display = "none";

        const val = id => document.getElementById(id).value.trim();
        const num = id => {
            const v = document.getElementById(id).value;
            return v === "" ? null : parseFloat(v);
        };

        const npNv = val("fnc-npnc-np-nv");
        const cliente = val("fnc-npnc-cliente");
        const codigo = val("fnc-npnc-codigo");
        const producto = val("fnc-npnc-producto");
        const categoriaDefecto = val("fnc-npnc-categoria-defecto");
        const nivel = val("fnc-npnc-nivel");
        const descripcionDefecto = val("fnc-npnc-descripcion-defecto");
        const cantRequerida = num("fnc-npnc-cant-requerida");
        const cantRechazada = num("fnc-npnc-cant-rechazada");

        if (!npNv || !cliente || !codigo || !producto || !categoriaDefecto || !nivel || !descripcionDefecto
            || cantRequerida === null || cantRechazada === null) {
            errorEl.textContent = "NP/NV, Cliente, Código, Producto, Categoría defecto, Nivel, "
                + "Descripción defecto, Cant. requerida y Cant. rechazada son obligatorios";
            errorEl.style.display = "block";
            return;
        }

        const tipoPnc = val("fnc-npnc-tipo-pnc");
        const area = val("fnc-npnc-area");
        const hoy = new Date().toISOString().substring(0, 10);

        const payload = {
            // Campos del registro Data (importacion_pnc)
            tipoPnc,
            npNv,
            cliente,
            codigo,
            producto,
            cantRequerida,
            cantRechazada,
            cantRecuperada: num("fnc-npnc-cant-recuperada"),
            pncReal: num("fnc-npnc-pnc-real"),
            fechaSalida: val("fnc-npnc-fecha-salida") || null,
            fechaFabricacion: val("fnc-npnc-fecha-fabricacion") || null,
            descripcionDefecto,
            categoriaDefecto,
            nivel,
            tipoFalla: val("fnc-npnc-tipo-falla"),
            area,
            maquina: val("fnc-npnc-maquina"),
            operador: val("fnc-npnc-operador"),
            supervisor: val("fnc-npnc-supervisor"),
            revisadoPor: val("fnc-npnc-revisado-por"),
            impacto: val("fnc-npnc-impacto"),
            observacion: val("fnc-npnc-observacion"),
            causaRaiz: val("fnc-npnc-causa-raiz"),
            accionesCorrectivas: val("fnc-npnc-acciones-correctivas"),
            verificacionSeguimiento: val("fnc-npnc-verificacion-seguimiento"),
            // Campos del vínculo de gestión (Mejora Continua) — se autocompletan a partir de los
            // datos de arriba, igual que ya hace "Gestionar" al crear el vínculo desde una fila de Data.
            tipo: "INTERNA",
            origen: "AUDITORIA_INTERNA",
            titulo: `PNC ${npNv} - ${producto || cliente}`.trim(),
            descripcion: [categoriaDefecto, descripcionDefecto].filter(Boolean).join(" - "),
            severidad: this._mapNivelASeveridad(nivel),
            proceso: tipoPnc || area || "PNC Nueva",
            fechaDeteccion: hoy,
        };

        const btn = document.getElementById("fnc-npnc-guardar-btn");
        btn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({ action: "faret.nc.crearRegistro", ...payload });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al crear la no conformidad";
                errorEl.style.display = "block";
                return;
            }

            this._cerrarNuevoPnc();
            this._showMensaje("No conformidad creada y gestionable", true);
            await this._loadLista();
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            btn.disabled = false;
        }
    }

    // ---------- Gestionar (crear vínculo Data→NC, o gestionar/cerrar/seguimiento de una NC existente) ----------

    _mapNivelASeveridad(nivel) {
        const n = (nivel || "").toUpperCase();
        if (n.includes("CRIT")) return "ALTA";
        if (n.includes("MAYOR")) return "MEDIA";
        if (n.includes("MENOR")) return "BAJA";
        return "MEDIA";
    }

    async _abrirGestion(key) {
        const fila = this._combinadosPorKey.get(key);
        if (!fila) return;

        this._gestionContext = { fila };
        document.getElementById("fnc-gestion-error").style.display = "none";
        document.getElementById("fnc-gestion-mensaje").style.display = "none";

        if (!fila.tieneNc) {
            document.getElementById("fnc-gestion-titulo").textContent = "Crear gestión de NC";
            document.getElementById("fnc-gestion-crear").style.display = "block";
            document.getElementById("fnc-gestion-existente").style.display = "none";

            document.getElementById("fnc-gcrear-tipo").value = "INTERNA";
            document.getElementById("fnc-gcrear-origen").value = "AUDITORIA_INTERNA";

            if (fila.fuente === "INSPECCION") {
                const i = fila.inspeccion;
                document.getElementById("fnc-gestion-subtitulo").textContent = `Vinculado a Inspección #${fila.inspeccionId}`;
                document.getElementById("fnc-gcrear-severidad").value = "MEDIA";
                document.getElementById("fnc-gcrear-fecha").value = i.fechaRegistro ? String(i.fechaRegistro).substring(0, 10) : "";
                document.getElementById("fnc-gcrear-proceso").value = i.areaControl || "Inspección Faret";
                document.getElementById("fnc-gcrear-titulo").value = `Inspección NV ${i.nvFaret || fila.inspeccionId}`.trim();
                document.getElementById("fnc-gcrear-descripcion").value =
                    [i.defectos, i.accionCorrectiva].filter(Boolean).join(" - ")
                    || `Registro de inspección (ID ${i.id}, máquina ${i.maquina || "-"})`;
            } else {
                const d = fila.data;
                document.getElementById("fnc-gestion-subtitulo").textContent = `Vinculado a Data #${fila.dataId}`;
                document.getElementById("fnc-gcrear-severidad").value = this._mapNivelASeveridad(d.nivel);
                document.getElementById("fnc-gcrear-fecha").value = d.fechaIngreso ? String(d.fechaIngreso).substring(0, 10) : "";
                document.getElementById("fnc-gcrear-proceso").value = d.tipoPnc || "PNC Data";
                document.getElementById("fnc-gcrear-titulo").value = `PNC Data #${d.id} - ${d.producto || d.cliente || ""}`.trim();
                document.getElementById("fnc-gcrear-descripcion").value =
                    [d.categoriaDefecto, d.observacion].filter(Boolean).join(" - ")
                    || `Registro importado de Data (ID ${d.id}, cliente ${d.cliente || "-"})`;
            }

            document.getElementById("fnc-gestion-modal").style.display = "flex";
            return;
        }

        document.getElementById("fnc-gestion-titulo").textContent = `Gestionar ${fila.nc.codigo || ""}`;
        document.getElementById("fnc-gestion-subtitulo").textContent =
            fila.dataId ? `Vinculado a Data #${fila.dataId}`
            : fila.inspeccionId ? `Vinculado a Inspección #${fila.inspeccionId}`
            : "No conformidad manual (sin vínculo)";
        document.getElementById("fnc-gestion-crear").style.display = "none";
        document.getElementById("fnc-gestion-existente").style.display = "block";

        document.getElementById("fnc-gestion-responsable").value = fila.nc.responsable || "";
        document.getElementById("fnc-gestion-estado").value = fila.nc.estadoGestion || "PENDIENTE";
        document.getElementById("fnc-gestion-fecha-compromiso").value =
            fila.nc.fechaCompromiso ? String(fila.nc.fechaCompromiso).substring(0, 10) : "";
        document.getElementById("fnc-cierre-comentario").value = "";
        document.getElementById("fnc-seguimiento-comentario").value = "";

        document.getElementById("fnc-gestion-modal").style.display = "flex";
        await this._cargarSeguimiento(fila.nc.id);
    }

    _cerrarGestion() {
        document.getElementById("fnc-gestion-modal").style.display = "none";
        this._gestionContext = null;
    }

    async _confirmarCrearGestion() {
        const errorEl = document.getElementById("fnc-gestion-error");
        errorEl.style.display = "none";

        const fila = this._gestionContext?.fila;
        if (!fila) return;

        const payload = {
            tipo: document.getElementById("fnc-gcrear-tipo").value,
            origen: document.getElementById("fnc-gcrear-origen").value,
            titulo: document.getElementById("fnc-gcrear-titulo").value.trim(),
            descripcion: document.getElementById("fnc-gcrear-descripcion").value.trim(),
            severidad: document.getElementById("fnc-gcrear-severidad").value,
            proceso: document.getElementById("fnc-gcrear-proceso").value.trim(),
            fechaDeteccion: document.getElementById("fnc-gcrear-fecha").value,
            sistemaOrigen: fila.fuente === "INSPECCION" ? "INSPECCION_FARET" : "DATA_FARET",
            origenId: String(fila.fuente === "INSPECCION" ? fila.inspeccionId : fila.dataId),
        };

        if (!payload.titulo || !payload.descripcion || !payload.proceso || !payload.fechaDeteccion) {
            errorEl.textContent = "Título, descripción, proceso/área y fecha de detección son obligatorios";
            errorEl.style.display = "block";
            return;
        }

        const btn = document.getElementById("fnc-gcrear-confirmar-btn");
        btn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({ action: "faret.nc.create", ...payload });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al crear la gestión";
                errorEl.style.display = "block";
                return;
            }

            this._cerrarGestion();
            this._showMensaje("Gestión creada correctamente", true);
            await this._loadLista();
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            btn.disabled = false;
        }
    }

    async _guardarGestion() {
        const fila = this._gestionContext?.fila;
        if (!fila || !fila.nc) return;

        const errorEl = document.getElementById("fnc-gestion-error");
        errorEl.style.display = "none";

        const payload = {
            id: fila.nc.id,
            responsable: document.getElementById("fnc-gestion-responsable").value.trim(),
            estadoGestion: document.getElementById("fnc-gestion-estado").value,
            fechaCompromiso: document.getElementById("fnc-gestion-fecha-compromiso").value || null,
            actualizadoPor: this._usuarioActual(),
        };

        const btn = document.getElementById("fnc-gestion-guardar-btn");
        btn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({ action: "faret.nc.gestion.actualizar", ...payload });

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
        const cont = document.getElementById("fnc-seguimiento-lista");
        cont.innerHTML = "Cargando...";

        try {
            const res = await window.PhotinoBridge.send({ action: "faret.nc.seguimiento.list", id: Number(ncId) });
            const items = res.ok && Array.isArray(res.data) ? res.data : [];

            if (!items.length) {
                cont.innerHTML = `<div class="faret-empty">Sin comentarios de seguimiento</div>`;
                return;
            }

            cont.innerHTML = items.map(c => `
                <div class="fnc-seguimiento-item">
                    <div>${c.comentario ?? "-"}</div>
                    <div class="fnc-seguimiento-meta">${c.autor ?? "Sin autor"} · ${c.creadoEn ? new Date(c.creadoEn).toLocaleString("es-CL") : "-"}</div>
                </div>
            `).join("");
        } catch {
            cont.innerHTML = `<div class="faret-error">Error al cargar el seguimiento</div>`;
        }
    }

    async _agregarSeguimiento() {
        const fila = this._gestionContext?.fila;
        if (!fila || !fila.nc) return;

        const comentario = document.getElementById("fnc-seguimiento-comentario").value.trim();
        if (!comentario) return;

        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.nc.seguimiento.crear",
                id: fila.nc.id,
                comentario,
                autor: this._usuarioActual(),
            });

            if (!res.ok) {
                this._showGestionMensaje(res.error || "Error al agregar el comentario", false);
                return;
            }

            document.getElementById("fnc-seguimiento-comentario").value = "";
            await this._cargarSeguimiento(fila.nc.id);
            this._showGestionMensaje("Comentario agregado", true);
        } catch {
            this._showGestionMensaje("Error de comunicación con el backend", false);
        }
    }

    async _cerrarNc() {
        const fila = this._gestionContext?.fila;
        if (!fila || !fila.nc) return;

        if (!confirm("¿Cerrar esta No Conformidad? Quedará marcada como CERRADA.")) return;

        const comentarioCierre = document.getElementById("fnc-cierre-comentario").value.trim();

        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.nc.cerrar",
                id: fila.nc.id,
                cerradoPor: this._usuarioActual(),
                comentarioCierre: comentarioCierre || null,
            });

            if (!res.ok) {
                this._showGestionMensaje(res.error || "Error al cerrar la no conformidad", false);
                return;
            }

            this._cerrarGestion();
            this._showMensaje("No conformidad cerrada", true);
            await this._loadLista();
        } catch {
            this._showGestionMensaje("Error de comunicación con el backend", false);
        }
    }

    _showGestionMensaje(texto, ok) {
        const el = document.getElementById("fnc-gestion-mensaje");
        el.textContent = texto;
        el.style.display = "block";
        el.style.background = ok ? "#ECFDF5" : "#FEF2F2";
        el.style.color = ok ? "#065F46" : "#991B1B";
        el.style.borderLeftColor = ok ? "#10B981" : "#EF4444";
        setTimeout(() => { el.style.display = "none"; }, 4000);
    }

    // ---------- Analizar (5 Porqués / Ishikawa + Acciones correctivas) ----------

    async _abrirAnalisis(id) {
        const item = this._items.find(i => String(i.id) === String(id));
        if (!item) return;

        this._ncAnalisisId = item.id;
        this._analisisActual = null;
        this._acciones = [];

        document.getElementById("fnc-analisis-titulo").textContent =
            `Análisis y Plan de Acción — ${item.codigo ?? ""}`;
        document.getElementById("fnc-analisis-nc-datos").innerHTML = `
            <div><strong>Código:</strong> ${item.codigo ?? "-"}</div>
            <div><strong>Estado:</strong> ${item.estado ?? "-"}</div>
            <div><strong>Título:</strong> ${item.titulo ?? "-"}</div>
            <div><strong>Severidad:</strong> ${item.severidad ?? "-"}</div>
            <div><strong>Proceso / Área:</strong> ${item.proceso ?? "-"}</div>
            <div><strong>Tipo / Origen:</strong> ${item.tipo ?? "-"} / ${item.origen ?? "-"}</div>
        `;

        document.getElementById("fnc-analisis-error").style.display = "none";
        document.getElementById("fnc-analisis-mensaje").style.display = "none";
        document.getElementById("fnc-analisis-contenido").style.display = "none";
        document.getElementById("fnc-analisis-loading").style.display = "block";
        document.getElementById("fnc-analisis-modal").style.display = "flex";

        await this._cargarAnalisis();
        await this._cargarAcciones();

        document.getElementById("fnc-analisis-loading").style.display = "none";
        document.getElementById("fnc-analisis-contenido").style.display = "block";
    }

    _cerrarAnalisis() {
        document.getElementById("fnc-analisis-modal").style.display = "none";
        this._ncAnalisisId = null;
        this._analisisActual = null;
        this._acciones = [];
    }

    async _cargarAnalisis() {
        const errorEl = document.getElementById("fnc-analisis-error");
        errorEl.style.display = "none";

        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.nc.analisis.get",
                id: Number(this._ncAnalisisId),
            });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al cargar el análisis";
                errorEl.style.display = "block";
                this._analisisActual = null;
            } else {
                // res.data === null → la NC aún no tiene análisis (caso normal, no es error)
                this._analisisActual = res.data || null;
            }
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
            this._analisisActual = null;
        }

        this._renderAnalisisForm();
    }

    _renderAnalisisForm() {
        const a = this._analisisActual;

        document.getElementById("fnc-analisis-metodologia").value = a?.metodologia || "CINCO_PORQUES";
        document.getElementById("fnc-analisis-problema").value = a?.problemaDetectado || "";
        document.getElementById("fnc-analisis-porque1").value = a?.porque1 || "";
        document.getElementById("fnc-analisis-porque2").value = a?.porque2 || "";
        document.getElementById("fnc-analisis-porque3").value = a?.porque3 || "";
        document.getElementById("fnc-analisis-porque4").value = a?.porque4 || "";
        document.getElementById("fnc-analisis-porque5").value = a?.porque5 || "";
        document.getElementById("fnc-analisis-causa-raiz").value = a?.causaRaiz || "";
        document.getElementById("fnc-analisis-conclusion").value = a?.conclusion || "";
    }

    async _guardarAnalisis() {
        const errorEl = document.getElementById("fnc-analisis-error");
        const guardarBtn = document.getElementById("fnc-analisis-guardar-btn");
        errorEl.style.display = "none";

        const payload = {
            metodologia: document.getElementById("fnc-analisis-metodologia").value,
            problemaDetectado: document.getElementById("fnc-analisis-problema").value.trim(),
            porque1: document.getElementById("fnc-analisis-porque1").value.trim(),
            porque2: document.getElementById("fnc-analisis-porque2").value.trim(),
            porque3: document.getElementById("fnc-analisis-porque3").value.trim(),
            porque4: document.getElementById("fnc-analisis-porque4").value.trim(),
            porque5: document.getElementById("fnc-analisis-porque5").value.trim(),
            causaRaiz: document.getElementById("fnc-analisis-causa-raiz").value.trim(),
            conclusion: document.getElementById("fnc-analisis-conclusion").value.trim(),
        };

        if (!payload.problemaDetectado) {
            errorEl.textContent = "El problema detectado es obligatorio";
            errorEl.style.display = "block";
            return;
        }

        if (!confirm("¿Guardar el análisis de causa raíz de esta no conformidad?")) return;

        const existeAnalisis = !!this._analisisActual;
        const usuario = this._usuarioActual();

        guardarBtn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.nc.analisis.guardar",
                id: Number(this._ncAnalisisId),
                existeAnalisis,
                ...(existeAnalisis ? { actualizadoPor: usuario } : { creadoPor: usuario }),
                ...payload,
            });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al guardar el análisis";
                errorEl.style.display = "block";
                return;
            }

            await this._cargarAnalisis();
            this._showAnalisisMensaje("Análisis guardado correctamente", true);
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            guardarBtn.disabled = false;
        }
    }

    async _cargarAcciones() {
        const loadingEl = document.getElementById("fnc-acciones-loading");
        loadingEl.style.display = "block";

        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.nc.acciones.list",
                id: Number(this._ncAnalisisId),
            });

            this._acciones = res.ok && Array.isArray(res.data) ? res.data : [];
        } catch {
            this._acciones = [];
        } finally {
            loadingEl.style.display = "none";
        }

        this._renderAcciones();
    }

    _renderAcciones() {
        const tbody = document.getElementById("fnc-acciones-tbody");

        if (!this._acciones.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="faret-empty">Sin acciones correctivas</td></tr>`;
            return;
        }

        const estados = ["PENDIENTE", "EN_PROCESO", "COMPLETADA", "CANCELADA"];

        tbody.innerHTML = this._acciones.map(a => `
            <tr>
                <td>${a.descripcion ?? "-"}</td>
                <td>${a.responsable ?? "-"}</td>
                <td>${a.fechaLimite ? a.fechaLimite.substring(0, 10) : "-"}</td>
                <td>${a.prioridad ?? "-"}</td>
                <td>
                    <select class="fnc-accion-estado-select" data-id="${a.id}">
                        ${estados.map(e => `<option value="${e}" ${e === a.estado ? "selected" : ""}>${e}</option>`).join("")}
                    </select>
                </td>
                <td>${a.integracionTareasEstado ?? "-"}</td>
                <td>
                    <button class="btn-secondary fnc-accion-guardar-estado-btn" data-id="${a.id}">Guardar</button>
                </td>
            </tr>
        `).join("");

        tbody.querySelectorAll(".fnc-accion-guardar-estado-btn").forEach(btn =>
            btn.addEventListener("click", () => this._actualizarEstadoAccion(btn.dataset.id)));
    }

    async _agregarAccion() {
        const errorEl = document.getElementById("fnc-accion-form-error");
        const agregarBtn = document.getElementById("fnc-accion-agregar-btn");
        errorEl.style.display = "none";

        const payload = {
            descripcion: document.getElementById("fnc-accion-descripcion").value.trim(),
            responsable: document.getElementById("fnc-accion-responsable").value.trim(),
            fechaLimite: document.getElementById("fnc-accion-fecha-limite").value,
            prioridad: document.getElementById("fnc-accion-prioridad").value || null,
        };

        if (!payload.descripcion || !payload.responsable || !payload.fechaLimite) {
            errorEl.textContent = "Descripción, responsable y fecha límite son obligatorios";
            errorEl.style.display = "block";
            return;
        }

        if (!confirm("¿Agregar esta acción correctiva a la no conformidad?")) return;

        agregarBtn.disabled = true;
        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.nc.acciones.crear",
                id: Number(this._ncAnalisisId),
                analisisId: this._analisisActual?.id ?? null,
                creadoPor: this._usuarioActual(),
                ...payload,
            });

            if (!res.ok) {
                errorEl.textContent = res.error || "Error al agregar la acción";
                errorEl.style.display = "block";
                return;
            }

            document.getElementById("fnc-accion-descripcion").value = "";
            document.getElementById("fnc-accion-responsable").value = "";
            document.getElementById("fnc-accion-fecha-limite").value = "";
            document.getElementById("fnc-accion-prioridad").value = "";

            await this._cargarAcciones();
            this._showAnalisisMensaje("Acción correctiva agregada", true);
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
        } finally {
            agregarBtn.disabled = false;
        }
    }

    async _actualizarEstadoAccion(accionId) {
        const accion = this._acciones.find(a => String(a.id) === String(accionId));
        if (!accion) return;

        const select = document.querySelector(`.fnc-accion-estado-select[data-id="${accionId}"]`);
        const nuevoEstado = select ? select.value : accion.estado;

        if (!confirm(`¿Cambiar el estado de la acción a "${nuevoEstado}"?`)) return;

        try {
            const res = await window.PhotinoBridge.send({
                action: "faret.nc.acciones.actualizar",
                accionId: Number(accionId),
                descripcion: accion.descripcion,
                responsable: accion.responsable,
                fechaLimite: accion.fechaLimite ? accion.fechaLimite.substring(0, 10) : "",
                prioridad: accion.prioridad || null,
                estado: nuevoEstado,
                actualizadoPor: this._usuarioActual(),
            });

            if (!res.ok) {
                this._showAnalisisMensaje(res.error || "Error al actualizar la acción", false);
                return;
            }

            await this._cargarAcciones();
            this._showAnalisisMensaje("Acción correctiva actualizada", true);
        } catch {
            this._showAnalisisMensaje("Error de comunicación con el backend", false);
        }
    }

    _showAnalisisMensaje(texto, ok) {
        const el = document.getElementById("fnc-analisis-mensaje");
        el.textContent = texto;
        el.style.display = "block";
        el.style.background = ok ? "#ECFDF5" : "#FEF2F2";
        el.style.color = ok ? "#065F46" : "#991B1B";
        el.style.borderLeftColor = ok ? "#10B981" : "#EF4444";
        setTimeout(() => { el.style.display = "none"; }, 4000);
    }

    // ---------- Presentación (badges) ----------

    _badge(texto, color) {
        const valor = texto ?? "-";
        return `<span class="fnc-badge" style="background:${color}1F;color:${color};">${valor}</span>`;
    }

    _colorSeveridad(valor) {
        const s = (valor || "").toUpperCase();
        if (s === "ALTA" || s.includes("CRIT")) return "#DC2626";
        if (s === "MEDIA" || s.includes("MAYOR")) return "#D97706";
        if (s === "BAJA" || s.includes("MENOR")) return "#059669";
        return "#64748B";
    }

    _labelEstadoGestion(estado) {
        const map = {
            SIN_GESTION: "Sin gestión",
            PENDIENTE: "Pendiente",
            ASIGNADA: "Asignada",
            EN_GESTION: "En gestión",
            CERRADA: "Cerrada",
        };
        return map[estado] || estado || "-";
    }

    _colorEstadoGestion(estado) {
        switch (estado) {
            case "CERRADA": return "#059669";
            case "EN_GESTION": return "#2563EB";
            case "ASIGNADA": return "#D97706";
            case "SIN_GESTION": return "#94A3B8";
            default: return "#64748B"; // PENDIENTE
        }
    }

    _labelFuente(fuente) {
        switch (fuente) {
            case "DATA": return "Data";
            case "INSPECCION": return "Inspección";
            default: return "Manual";
        }
    }

    _colorFuente(fuente) {
        switch (fuente) {
            case "DATA": return "#2563EB";
            case "INSPECCION": return "#7C3AED";
            default: return "#64748B"; // MANUAL
        }
    }

    // Exporta siempre el conjunto ya filtrado completo (todas las páginas), no solo la página
    // visible: con filtros activos exporta lo filtrado; sin filtros, exporta todo lo combinado.
    _exportar() {
        const items = this._filtrarItems();
        this._exportarFilasDesdeDatos(items);
    }

    _exportarFilasDesdeDatos(items) {
        const tabla = document.createElement("table");
        tabla.id = "fnc-tabla-export-temp";
        tabla.style.position = "absolute";
        tabla.style.left = "-99999px";
        tabla.style.top = "0";

        tabla.innerHTML = `
            <thead>
                <tr>
                    <th>Código NC / ID Data</th>
                    <th>Fecha ingreso</th>
                    <th>Fecha salida</th>
                    <th>NP/NV</th>
                    <th>Cliente</th>
                    <th>Producto</th>
                    <th>Tipo PNC</th>
                    <th>Categoría defecto</th>
                    <th>Nivel / Severidad</th>
                    <th>Estado gestión</th>
                    <th>Responsable</th>
                    <th>Fecha compromiso</th>
                    <th>Fuente</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(fila => `
                    <tr>
                        <td>${fila.codigo}</td>
                        <td>${fila.fechaIngreso ? new Date(fila.fechaIngreso).toLocaleDateString("es-CL") : "-"}</td>
                        <td>${fila.fechaSalida ? new Date(fila.fechaSalida).toLocaleDateString("es-CL") : "-"}</td>
                        <td>${fila.npNv}</td>
                        <td>${fila.cliente}</td>
                        <td>${fila.producto}</td>
                        <td>${fila.tipoPnc}</td>
                        <td>${fila.categoriaDefecto}</td>
                        <td>${fila.nivelSeveridad}</td>
                        <td>${this._labelEstadoGestion(fila.estadoGestion)}</td>
                        <td>${fila.responsable}</td>
                        <td>${fila.fechaCompromiso ? new Date(fila.fechaCompromiso).toLocaleDateString("es-CL") : "-"}</td>
                        <td>${this._labelFuente(fila.fuente)}</td>
                    </tr>
                `).join("")}
            </tbody>
        `;

        document.body.appendChild(tabla);

        window.ExcelExporter.exportTable({
            tableSelector: "#fnc-tabla-export-temp",
            fileName: `faret_no_conformidades_${Date.now()}.xlsx`,
            sheetName: "No Conformidades",
            title: "QCC Faret - No Conformidades"
        });

        tabla.remove();
    }
};
