window.FaretController = class FaretController {

    init() {
        console.log("FaretController (Inicio) iniciado");

        this._charts = [];
        this._datos = null;
        this._planta = false;

        this._bindModuleCards();
        window.Novedades?.mostrarSiCorresponde();
        document.getElementById("fh-periodo-calidad")
            ?.addEventListener("change", () => this._cambiarPeriodoCalidad());
        document.getElementById("fh-planta-btn")
            ?.addEventListener("click", () => this._alternarModoPlanta());
        document.getElementById("fh-pdf-todos-btn")
            ?.addEventListener("click", () => this._pdfGraficos([...document.querySelectorAll(".home-module .card")]));
        document.getElementById("fh-evol-anio")
            ?.addEventListener("change", e => { this._evolAnio = Number(e.target.value) || null; this._renderEvolucion(); });
        this._agregarBotonesPdf();
        this._loadDashboard();
    }

    destroy() {
        console.log("FaretController destruido");
        this._destroyCharts();
        this._cerrarModalAlerta();
        window.ChartUtils.fijarEscala(1);
    }

    _bindModuleCards() {
        document.querySelectorAll(".home-module-card").forEach(card => {
            card.addEventListener("click", () => {
                const target = card.dataset.moduleTarget;
                if (target && window.App?.loadModule) window.App.loadModule(target);
            });
        });
    }

    async _loadDashboard() {
        const { desde: mesDesde, hasta: mesHasta } = this._rangoMesActual();

        const [dashboard, inspecciones, maquinas, indicadoresCalidad, productoTerminado, talleresExternos, ncList, dataMes] = await Promise.all([
            this._fetch("faret.dashboard.resumen"),
            this._fetch("faret.inspecciones.resumen"),
            this._fetch("faret.maquinas.resumen"),
            this._fetch("faret.indicadoresCalidad.resumen", this._rangoCalidad()),
            this._fetch("productoTerminado.resumen", { data: { empresa: "FARET", fechaDesde: mesDesde, fechaHasta: mesHasta } }),
            this._fetch("faret.talleresExternos.resumen"),
            this._fetch("faret.nc.list"),
            this._traerDataMes(mesDesde, mesHasta),
        ]);

        this._datos = { dashboard, inspecciones, maquinas, indicadoresCalidad, productoTerminado, talleresExternos, ncList, dataMes };
        this._renderTodo();

        // Los avisos que necesitan consultas propias (NC internas, documentos) se cargan después
        // del primer render: Inicio no espera por ellos.
        this._cargarAlertasAsync();
        this._cargarEvolucionAsync();
    }

    // Dibuja todo desde los datos ya cargados (`_datos`): sirve para cambiar el período de los
    // indicadores de calidad o el modo planta sin volver a consultar el resto de las fuentes.
    _renderTodo() {
        this._destroyCharts();

        const { dashboard, inspecciones, maquinas, indicadoresCalidad, productoTerminado, talleresExternos, ncList, dataMes } = this._datos;

        this._renderKpis(dashboard?.kpis || {}, inspecciones || {}, maquinas || {});
        this._renderCharts(dashboard || {}, inspecciones || {});
        this._renderAlertas();
        this._renderMaquinas(maquinas?.maquinas || []);
        this._renderResumen(dashboard?.kpis || {}, inspecciones || {}, maquinas || {}, indicadoresCalidad || {});
        this._renderIndicadoresCalidad(indicadoresCalidad || {});
        this._renderIndicadoresAdicionales(productoTerminado || {}, talleresExternos || {}, ncList || [], dataMes);
        this._renderEvolucion();
    }

    // Período de los indicadores de calidad (la API acepta fechaDesde/fechaHasta; "todo" = sin
    // filtro, el comportamiento anterior). Los demás bloques de Inicio no cambian: sus fuentes
    // (dashboard NC, máquinas, talleres, NC) no aceptan rango, y los "hoy"/"mes" son fijos.
    _rangoCalidad() {
        const meses = Number(document.getElementById("fh-periodo-calidad")?.value || 0);
        if (!meses) return {};

        const hoy = new Date();
        const desde = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1);
        const mm = String(desde.getMonth() + 1).padStart(2, "0");
        return { fechaDesde: `${desde.getFullYear()}-${mm}-01`, fechaHasta: window.DateUtils.hoyISO() };
    }

    async _cambiarPeriodoCalidad() {
        const select = document.getElementById("fh-periodo-calidad");
        select.disabled = true;
        try {
            const indicadores = await this._fetch("faret.indicadoresCalidad.resumen", this._rangoCalidad());
            if (!indicadores) return;
            this._datos.indicadoresCalidad = indicadores;
            this._renderTodo();
        } finally {
            select.disabled = false;
        }
    }

    // Modo planta (pantallas de televisión): gráficos y tipografías más grandes. Los rankings ya
    // muestran Top 10 + "Otros", así que no dependen de scroll ni de interacción.
    _alternarModoPlanta() {
        this._planta = !this._planta;
        window.ChartUtils.fijarEscala(this._planta ? 1.5 : 1);
        document.querySelector(".home-module")?.classList.toggle("faret-planta", this._planta);
        document.getElementById("fh-planta-btn").textContent = this._planta ? "Salir de modo planta" : "Modo planta";
        if (this._datos) this._renderTodo();
    }

    _rangoMesActual() {
        return { desde: window.DateUtils.primerDiaMesActualISO(), hasta: window.DateUtils.hoyISO() };
    }

    async _fetch(action, extra = {}) {
        try {
            const res = await window.PhotinoBridge.send({ action, ...extra });
            return res.ok ? res.data : null;
        } catch {
            return null;
        }
    }

    // Trae faret.data.list paginado (mismo patrón que faret-data._traerTodosLosRegistros),
    // acotado al mes actual, para calcular % recuperación promedio y ranking de clientes.
    async _traerDataMes(fechaDesde, fechaHasta) {
        const pageSize = 500;
        let page = 1;
        let total = Infinity;
        const items = [];

        while (items.length < total && page <= 200) {
            let res;
            try {
                res = await window.PhotinoBridge.send({
                    action: "faret.data.list",
                    page,
                    pageSize,
                    fechaDesde,
                    fechaHasta,
                });
            } catch {
                break;
            }

            if (!res.ok) break;

            const lote = Array.isArray(res.data.items) ? res.data.items : [];
            if (!lote.length) break;

            items.push(...lote);
            total = res.data.totalCount ?? items.length;
            page++;
        }

        return items;
    }

    _renderKpis(kpis, inspecciones, maquinas) {
        this._setText("fh-kpi-inspecciones-hoy", this._numero(inspecciones.inspeccionesHoy));
        this._setText("fh-kpi-inspecciones-defectos", this._numero(inspecciones.conDefectos));

        // "Sin cerrar" = NC en gestión no cerradas + PNC de Data sin gestión. Sin Data disponible
        // no se conoce el segundo término: se informa "Sin información", nunca un 0 o un parcial.
        const pendientes = kpis.dataDisponible ? kpis.pncPendientesCierre : null;
        this._setText("fh-kpi-nc-abiertas", this._numeroOSinInfo(pendientes));
        const kpiAbiertas = document.getElementById("fh-kpi-nc-abiertas");
        if (kpiAbiertas) {
            kpiAbiertas.title = kpis.dataDisponible
                ? `${this._numero(kpis.ncAbiertas)} en gestión · ${this._numero(kpis.pncSinGestion)} sin gestión`
                : "Data (registros PNC) no disponible";
        }

        this._setText("fh-kpi-acciones-vencidas", this._numero(kpis.accionesVencidas));
        this._setText("fh-kpi-acciones-pct", `${this._numero(kpis.porcentajeAccionesCompletadas)}%`);

        this._setText("fh-kpi-maquinas-total", this._numero(maquinas.totalMaquinas));

        const top = (maquinas.maquinas || []).slice().sort((a, b) => b.totalRegistros - a.totalRegistros)[0];
        this._setText("fh-kpi-maquinas-top", top ? `${top.maquina} (${top.totalRegistros})` : "-");
    }

    _renderCharts(dashboard, inspecciones) {
        const ncPorProceso = window.ChartUtils.topNConOtros((dashboard.ncPorProceso || []).filter(r => r.categoria !== "Rechazo"));
        this._chartBarHorizontal("fh-chart-nc-proceso", ncPorProceso, "categoria", "total", "NC");
    }

    // ---------- Alertas activas (máx. 3, solo si hay un problema real) ----------
    // 1) PNC críticas pendientes (sin límite de antigüedad), 2) NC internas abiertas > 15 días,
    // 3) documentos con revisión vencida. Cada una solo si el usuario tiene acceso a su módulo.
    // this._alertas = { pnc, nci, doc }: { tipo, modulo, nombre, items } | null (omitida, sin acceso)
    // | "error". Los registros atendidos (registro central en la API) dejan de contarse para todos mientras no cambie su huella.

    _puedeVer(modulo) {
        return !window.App?.nivelModulo || window.App.nivelModulo(modulo) !== "SIN_ACCESO";
    }

    _isoHaceDias(dias) {
        const d = new Date();
        d.setDate(d.getDate() - dias);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    // yyyy-MM-dd de una fecha válida (año >= 2000: la API serializa fechas NULL como 0001-01-01); null si no.
    _fechaIso(valor) {
        const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m && Number(m[1]) >= 2000 ? `${m[1]}-${m[2]}-${m[3]}` : null;
    }

    // Texto "hace D días" desde una fecha dd-MM-yyyy o yyyy-MM-dd; "" si no se puede interpretar.
    _haceDias(valor) {
        const t = String(valor || "");
        let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
        let f = m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
        if (!f) {
            m = t.match(/^(\d{2})-(\d{2})-(\d{4})/);
            f = m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
        }
        if (!f || isNaN(f)) return null;
        const hoy = new Date();
        const dias = Math.floor((new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - f) / 86400000);
        return dias >= 0 ? dias : null;
    }

    // Cada fuente devuelve null (sin acceso), "error" (no se pudo calcular: nunca se informa como
    // "0") o { modulo, items } con TODOS los registros que cumplen la condición. Las revisiones del
    // usuario (ver "Revisadas") se aplican recién al dibujar, sin volver a consultar.

    _alertaPnc() {
        if (!this._puedeVer("faret-nc")) return null;
        const kpis = this._datos?.dashboard?.kpis;
        // Sin dashboard o sin Data disponible no se conoce el dato real: no se informa un parcial.
        if (!kpis || !kpis.dataDisponible) return "error";
        // Criterio real "Nivel = Crítico" (registros de Data, no cerrados o sin gestión): son las
        // filas del detalle con dataId. Las NC manuales por severidad ALTA (sin dataId) no cuentan,
        // igual que el filtro Nivel=Crítico + Estado≠Cerrada de No Conformidades.
        const items = (this._datos.dashboard.criticasAbiertasDetalle || [])
            .filter(c => Number(c.dataId) > 0)
            .map(c => ({
                key: `pnc:${Number(c.dataId)}`,
                titulo: c.codigo || `Data #${Number(c.dataId)}`,
                detalle: [c.npNv && `NP/NV ${c.npNv}`, c.cliente, c.tipoPnc].filter(Boolean).join(" · "),
                dias: this._haceDias(c.fechaIngreso),
                sinGestion: c.estadoGestion === "SIN_GESTION",
                // Huella: estado de gestión + nivel de Data. Si cambia alguno, la alerta vuelve a requerir atención.
                huella: `${c.estadoGestion || ""}|${c.nivel || ""}`,
            }));
        return { tipo: "pnc", modulo: "faret-nc", nombre: "PNC críticas pendientes", items };
    }

    async _alertaNcInternas() {
        if (!this._puedeVer("faret-nc-internas")) return null;
        const res = await this._fetch("noConformidades.list", { page: 1, pageSize: 999999, ambito: "INTERNA", empresa: "FARET" });
        if (!res || !Array.isArray(res.items)) return "error";

        // Más de 15 días: fecha de detección válida y anterior a (hoy - 15 días), es decir, ≥ 16 días.
        const limite = this._isoHaceDias(15);
        const items = res.items
            .filter(nc =>
                String(nc.estadoGestion || "").toUpperCase() !== "CERRADA"
                && this._fechaIso(nc.fechaDeteccion) !== null
                && this._fechaIso(nc.fechaDeteccion) < limite)
            .map(nc => ({
                key: `nci:${nc.id}`,
                titulo: nc.codigo || `NC interna #${nc.id}`,
                detalle: [nc.area, nc.categoriaDefecto && (window.NciTipoDesviacion?.etiqueta(nc.categoriaDefecto) ?? nc.categoriaDefecto)]
                    .filter(Boolean).join(" · "),
                dias: this._haceDias(this._fechaIso(nc.fechaDeteccion)),
                // Huella: estado de gestión + fecha de detección (condición que la dispara).
                huella: `${String(nc.estadoGestion || "").toUpperCase()}|${this._fechaIso(nc.fechaDeteccion)}`,
            }));
        return { tipo: "nci", modulo: "faret-nc-internas", nombre: "NC internas abiertas hace más de 15 días", items };
    }

    async _alertaDocumentos() {
        if (!this._puedeVer("faret-control-documental")) return null;
        // El filtro de alcance es igualdad exacta: se piden FARET y AMBAS por separado.
        const pedir = alcance => this._fetch("controlDocumental.list", { page: 1, pageSize: 999999, alcanceEmpresa: alcance });
        const [faret, ambas] = await Promise.all([pedir("FARET"), pedir("AMBAS")]);
        if (!faret || !ambas || !Array.isArray(faret.items) || !Array.isArray(ambas.items)) return "error";

        const hoy = window.DateUtils.hoyISO();
        // Más atrasados primero; cada uno con su fecha y días de atraso para actuar sobre él.
        const items = [...faret.items, ...ambas.items]
            .filter(d =>
                String(d.estado || "").toUpperCase() !== "OBSOLETO"
                && this._fechaIso(d.versionProximaRevision) !== null
                && this._fechaIso(d.versionProximaRevision) < hoy)
            .map(d => ({ id: d.id, codigo: d.codigoBase || "-", nombre: d.nombre || "", fecha: this._fechaIso(d.versionProximaRevision), versionId: d.versionVigenteId }))
            .sort((a, b) => a.fecha.localeCompare(b.fecha))
            .map(f => ({
                ...f,
                key: `doc:${f.id}`,
                // Huella: versión vigente + próxima revisión. Una versión nueva o una fecha nueva rearman la alerta.
                huella: `v${f.versionId ?? ""}|${f.fecha}`,
                titulo: f.codigo,
                detalle: `${f.nombre ? `${f.nombre} · ` : ""}vencido el ${window.DateUtils.formatear(f.fecha)}`,
                dias: this._haceDias(f.fecha),
            }));
        return { tipo: "doc", modulo: "faret-control-documental", nombre: "Documentos con revisión vencida", items };
    }

    async _cargarAlertasAsync() {
        this._alertas = { pnc: this._alertaPnc(), nci: undefined, doc: undefined };
        this._atendidas = undefined; // aún no se conoce el registro central: no se dibuja nada parcial
        this._renderAlertas();

        const seguro = fn => fn().catch(() => "error");
        const [nci, doc, atendidas] = await Promise.all([
            seguro(() => this._alertaNcInternas()),
            seguro(() => this._alertaDocumentos()),
            this._cargarAtendidas().catch(() => null),
        ]);
        // El usuario pudo salir de Inicio mientras tanto.
        if (!document.getElementById("fh-alertas-activas")) return;
        this._alertas.nci = nci;
        this._alertas.doc = doc;
        this._atendidas = atendidas;
        this._renderAlertas();
    }

    // ---------- Alertas atendidas: registro CENTRAL, visible para todos los usuarios ----------
    // "Marcar atendida" se guarda en la API (alertasAtendidas.marcar: quién, cuándo, qué registro y qué huella). No modifica
    // el registro de negocio (no cierra NC ni aprueba documentos). Una alerta atendida deja de contarse para TODOS mientras
    // su huella (la condición que la dispara) no cambie; si cambia (otra versión, otro estado, otra fecha), vuelve sola.
    // Si la lectura falla (this._atendidas === null) se muestran todas: nunca se oculta una alerta por un error.

    _claveAtencion(i) {
        return `${i.key}|${i.huella}`;
    }

    // Atender una alerta exige EDITAR sobre el módulo de la alerta (la API lo vuelve a verificar con la identidad real):
    // PNC → No Conformidades, NC interna → NC Internas, documento → Control Documental; además EDITAR en Inicio (puerta del escritorio).
    _puedeMarcar(tipo) {
        const nivel = window.App?.nivelModulo;
        if (!nivel) return true;
        const modulo = { pnc: "faret-nc", nci: "faret-nc-internas", doc: "faret-control-documental" }[tipo];
        return nivel.call(window.App, "faret") === "EDITAR" && (!modulo || nivel.call(window.App, modulo) === "EDITAR");
    }

    // { "doc:12|v5|2026-01-01": { por, fecha } } o null si no se pudo leer.
    async _cargarAtendidas() {
        const res = await this._fetch("alertasAtendidas.list", { data: { tipos: "doc,pnc,nci" } });
        if (!Array.isArray(res)) return null;
        const mapa = {};
        res.forEach(r => { mapa[`${r.tipoAlerta}:${r.registroId}|${r.huella}`] = { por: r.atendidaPor, fecha: r.fechaAtendida }; });
        return mapa;
    }

    // Marca (de a una, la API es idempotente) y vuelve a leer el registro central. Devuelve la cantidad de fallos.
    async _marcarAtendidas(items) {
        if (this._marcando) return 0;
        this._marcando = true;
        let fallos = 0;
        try {
            this._errorMarcar = "";
            for (const i of items) {
                const [tipo, ...resto] = i.key.split(":");
                const res = await window.PhotinoBridge.send({
                    action: "alertasAtendidas.marcar",
                    data: { tipoAlerta: tipo, registroId: resto.join(":"), huella: i.huella },
                }).catch(() => null);
                if (res?.ok) {
                    // Estado local inmediato: sale de pendientes sin esperar la relectura (que luego lo confirma).
                    if (!this._atendidas) this._atendidas = {};
                    this._atendidas[this._claveAtencion(i)] = { por: res.data?.atendidaPor || "ti", fecha: new Date().toISOString() };
                } else {
                    fallos++;
                    if (!this._errorMarcar && res?.error) this._errorMarcar = String(res.error);
                }
            }
            const nuevo = await this._cargarAtendidas();
            if (nuevo) this._atendidas = nuevo;
        } finally {
            this._marcando = false;
        }
        return fallos;
    }

    // Separa los registros de una fuente en pendientes y atendidos (con quién y cuándo).
    _separar(fuente) {
        const items = fuente?.items || [];
        const atendidas = this._atendidas || {};
        const visibles = [];
        const revisados = [];
        items.forEach(i => {
            const a = atendidas[this._claveAtencion(i)];
            if (a) revisados.push({ ...i, atencion: a });
            else visibles.push(i);
        });
        return { visibles, revisados };
    }

    _textoAtencion(a) {
        const f = String(a?.fecha || "").slice(0, 10).split("-");
        const fecha = f.length === 3 ? `${f[2]}-${f[1]}-${f[0]}` : "";
        return `Atendida por ${a?.por || "-"}${fecha ? ` el ${fecha}` : ""}`;
    }

    _textoAviso(fuente, visibles) {
        const n = visibles.length;
        const s = n === 1 ? "" : "s";
        if (fuente.tipo === "pnc") {
            const dias = visibles.map(i => i.dias).filter(d => d !== null);
            const masAntigua = dias.length ? Math.max(...dias) : null;
            const sinGestion = visibles.filter(i => i.sinGestion).length;
            return `${n} PNC crítica${s} pendiente${s} (${sinGestion} sin gestión${masAntigua !== null ? `, la más antigua hace ${masAntigua} días` : ""})`;
        }
        if (fuente.tipo === "nci") return `${n} NC interna${s} abierta${s} hace más de 15 días`;
        return `${n} documento${s} con revisión vencida`;
    }

    async _alMarcar(items) {
        const fallos = await this._marcarAtendidas(items);
        if (fallos) alert(`No se pudo registrar ${fallos} alerta${fallos === 1 ? "" : "s"} como atendida${fallos === 1 ? "" : "s"}. ${this._errorMarcar || "Reintenta en unos minutos."}`);
        this._renderAlertas();
    }

    _renderAlertas() {
        const container = document.getElementById("fh-alertas-activas");
        if (!container) return;

        const a = this._alertas;
        // Mientras no se conozca el registro central no se dibuja nada parcial (evita mostrar y luego ocultar).
        if (!a || this._atendidas === undefined) {
            container.innerHTML = `<div class="alert-item"><div>Cargando alertas...</div></div>`;
            return;
        }

        const lista = [a.pnc, a.nci, a.doc];
        const fuentes = lista.filter(x => x && x !== "error");
        const fallidas = lista.filter(x => x === "error").length;
        const pendientes = a.nci === undefined || a.doc === undefined;
        const puedeMarcarDoc = this._puedeMarcar("doc");

        let totalAtendidos = 0;
        const avisos = [];
        fuentes.forEach(f => {
            const { visibles, revisados } = this._separar(f);
            totalAtendidos += revisados.length;
            if (visibles.length) avisos.push({ fuente: f, visibles });
        });

        let html = avisos.map(({ fuente: x, visibles }) => `
            <div class="alert-item" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
                <div>⚠ ${this._escape(this._textoAviso(x, visibles))}</div>
                <div style="display:flex;gap:8px;flex-shrink:0;">
                    <button type="button" class="btn-secondary fh-alerta-administrar" data-tipo="${x.tipo}">Detalle</button>
                    <button type="button" class="btn-secondary fh-alerta-ver" data-modulo="${this._escape(x.modulo)}">Ver</button>
                </div>
            </div>
            ${x.tipo === "doc" ? visibles.slice(0, 5).map(f => `
            <div class="alert-item" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding-left:24px;font-size:13px;">
                <div><strong>${this._escape(f.codigo)}</strong>${f.nombre ? ` · ${this._escape(f.nombre)}` : ""}
                    <span style="opacity:.75;"> — vencido el ${this._escape(window.DateUtils.formatear(f.fecha))}${f.dias !== null ? ` (hace ${f.dias} día${f.dias === 1 ? "" : "s"})` : ""}</span></div>
                <div style="display:flex;gap:8px;flex-shrink:0;">
                    ${puedeMarcarDoc ? `<button type="button" class="btn-secondary fh-alerta-atender" data-key="${this._escape(f.key)}" title="Registra que esta alerta fue atendida; deja de contarse para todos los usuarios">Marcar atendida</button>` : ""}
                    <button type="button" class="btn-primary fh-alerta-revisar" data-doc-id="${Number(f.id)}">Revisar</button>
                </div>
            </div>`).join("") : ""}
            ${x.tipo === "doc" && visibles.length > 5 ? `<div class="alert-item" style="padding-left:24px;font-size:13px;opacity:.75;">y ${visibles.length - 5} más en Control Documental</div>` : ""}
        `).join("");

        if (!avisos.length) {
            html = pendientes
                ? `<div class="alert-item"><div>Cargando alertas...</div></div>`
                : fallidas
                    ? ""
                    : `<div class="alert-ok">✔ No hay alertas pendientes</div>`;
        }
        if (fallidas && !pendientes) {
            html += `<div class="alert-item"><div style="opacity:.7;font-size:12px;">No se pudieron calcular ${fallidas} aviso${fallidas === 1 ? "" : "s"}. Reintenta más tarde.</div></div>`;
        }
        if (this._atendidas === null) {
            html += `<div class="alert-item"><div style="opacity:.7;font-size:12px;">No se pudo leer el registro de alertas atendidas: se muestran todas.</div></div>`;
        }
        // Historial global: solo un acceso discreto (sin texto de aviso dentro de la lista de pendientes).
        if (totalAtendidos) {
            html += `<div style="text-align:right;margin-top:8px;"><button type="button" class="btn-secondary fh-alerta-ocultas" style="padding:2px 10px;font-size:12px;">Ver atendidas (${totalAtendidos})</button></div>`;
        }

        container.innerHTML = html;
        // Los "Ver"/"Revisar" de arriba en el listado reutilizan los cargados desde `this._alertas`.
        const cargarUnicoItem = key => [this._alertas.pnc, this._alertas.nci, this._alertas.doc]
            .flatMap(f => (f && f !== "error" ? f.items : [])).filter(i => i.key === key);
        container.querySelectorAll(".fh-alerta-ver").forEach(btn =>
            btn.addEventListener("click", () => window.App?.loadModule?.(btn.dataset.modulo)));
        container.querySelectorAll(".fh-alerta-administrar").forEach(btn =>
            btn.addEventListener("click", () => this._abrirModalAlerta(btn.dataset.tipo)));
        container.querySelector(".fh-alerta-ocultas")
            ?.addEventListener("click", () => this._abrirModalAlerta(null));
        container.querySelectorAll(".fh-alerta-atender").forEach(btn =>
            btn.addEventListener("click", () => { btn.disabled = true; this._alMarcar(cargarUnicoItem(btn.dataset.key)); }));
        container.querySelectorAll(".fh-alerta-revisar").forEach(btn =>
            btn.addEventListener("click", () => {
                try { sessionStorage.setItem("fcdAbrirDocumento", btn.dataset.docId); } catch { /* abre el listado */ }
                window.App?.loadModule?.("faret-control-documental");
            }));
    }

    // ---------- Modal de detalle de alertas ----------
    // tipo = "pnc" | "nci" | "doc": registros pendientes de esa alerta (se pueden marcar como atendidos).
    // tipo = null: alertas ya atendidas, con quién y cuándo (solo lectura).

    _cerrarModalAlerta() {
        document.getElementById("fh-alerta-modal")?.remove();
        if (this._escModal) {
            document.removeEventListener("keydown", this._escModal);
            this._escModal = null;
        }
    }

    _abrirModalAlerta(tipo) {
        this._cerrarModalAlerta();
        const a = this._alertas || {};
        const fuentes = [a.pnc, a.nci, a.doc].filter(x => x && x !== "error" && (!tipo || x.tipo === tipo));
        const modo = tipo ? "pendientes" : "atendidas";
        const puedeMarcar = this._puedeMarcar(tipo);

        const fila = (i, atendida) => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #E5E7EB;">
                <label style="display:flex;gap:10px;align-items:flex-start;${atendida || !puedeMarcar ? "" : "cursor:pointer;"}flex:1;min-width:0;">
                    ${atendida || !puedeMarcar ? "" : `<input type="checkbox" class="fh-am-check" data-key="${this._escape(i.key)}" style="margin-top:3px;width:auto;height:auto;">`}
                    <span style="min-width:0;">
                        <strong>${this._escape(i.titulo)}</strong>
                        ${i.dias !== null && i.dias !== undefined ? `<span style="opacity:.7;font-size:12px;"> · hace ${i.dias} día${i.dias === 1 ? "" : "s"}</span>` : ""}
                        ${i.detalle ? `<div style="font-size:12px;opacity:.75;overflow-wrap:anywhere;">${this._escape(i.detalle)}</div>` : ""}
                        ${atendida ? `<div style="font-size:12px;color:#047857;">${this._escape(this._textoAtencion(i.atencion))}</div>` : ""}
                    </span>
                </label>
                ${!atendida && puedeMarcar ? `<button type="button" class="btn-secondary fh-am-uno" data-key="${this._escape(i.key)}">Marcar atendida</button>` : ""}
            </div>`;

        let cuerpo = "";
        let hayPendientes = false;
        fuentes.forEach(f => {
            const { visibles, revisados } = this._separar(f);
            const mostrar = modo === "pendientes" ? visibles : revisados;
            if (modo === "pendientes" && visibles.length) hayPendientes = true;
            if (!mostrar.length && !(modo === "pendientes" && revisados.length)) return;
            cuerpo += `<div style="font-weight:700;margin:12px 0 4px;">${this._escape(f.nombre)}</div>`;
            cuerpo += mostrar.map(i => fila(i, modo === "atendidas")).join("");
            if (modo === "pendientes" && revisados.length) {
                cuerpo += `<div style="font-size:12px;opacity:.7;margin-top:6px;">${revisados.length} más ya atendida${revisados.length === 1 ? "" : "s"}
                    · <button type="button" class="btn-secondary fh-am-ver-ocultas" style="padding:2px 8px;font-size:12px;">Ver atendidas</button></div>`;
            }
        });
        if (!cuerpo || (modo === "pendientes" && !hayPendientes)) return;

        const pie = modo === "pendientes" && hayPendientes && puedeMarcar ? `
            <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:flex-end;margin-top:14px;">
                <button type="button" class="btn-secondary" id="fh-am-seleccionadas">Marcar atendidas las seleccionadas</button>
                <button type="button" class="btn-primary" id="fh-am-todas">Marcar todas como atendidas</button>
            </div>` : "";

        const overlay = document.createElement("div");
        overlay.id = "fh-alerta-modal";
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;";
        overlay.innerHTML = `
            <div role="dialog" aria-modal="true" aria-labelledby="fh-am-titulo" style="background:#fff;color:#111827;border-radius:12px;width:min(720px,100%);max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.3);">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #E5E7EB;">
                    <div>
                        <div id="fh-am-titulo" style="font-weight:700;font-size:16px;">${modo === "pendientes" ? this._escape(fuentes[0]?.nombre || "Alerta") : "Alertas atendidas"}</div>
                        <div style="font-size:12px;opacity:.7;">${modo === "pendientes"
                            ? "Marcar una alerta como atendida queda registrado para todos los usuarios (quién y cuándo). No modifica ni cierra el registro; si su condición cambia, la alerta vuelve."
                            : "Alertas ya atendidas por cualquier usuario. Vuelven solas si cambia la condición que las originó."}</div>
                    </div>
                    <button type="button" class="btn-secondary" id="fh-am-cerrar" aria-label="Cerrar">✕</button>
                </div>
                <div style="padding:4px 20px 16px;overflow-y:auto;">${cuerpo}${pie}</div>
            </div>`;
        document.body.appendChild(overlay);

        const porClave = key => [a.pnc, a.nci, a.doc].flatMap(f => (f && f !== "error" ? f.items : [])).filter(i => i.key === key);
        const marcar = async items => {
            if (!items.length) return;
            overlay.querySelectorAll("button").forEach(b => { b.disabled = true; });
            await this._alMarcar(items);
            this._abrirModalAlerta(tipo);
        };

        overlay.addEventListener("click", e => { if (e.target === overlay) this._cerrarModalAlerta(); });
        overlay.querySelector("#fh-am-cerrar").addEventListener("click", () => this._cerrarModalAlerta());
        this._escModal = e => { if (e.key === "Escape") this._cerrarModalAlerta(); };
        document.addEventListener("keydown", this._escModal);

        overlay.querySelectorAll(".fh-am-uno").forEach(btn =>
            btn.addEventListener("click", () => marcar(porClave(btn.dataset.key))));
        overlay.querySelectorAll(".fh-am-ver-ocultas").forEach(btn =>
            btn.addEventListener("click", () => this._abrirModalAlerta(null)));
        overlay.querySelector("#fh-am-seleccionadas")?.addEventListener("click", () => {
            const items = [...overlay.querySelectorAll(".fh-am-check:checked")].flatMap(c => porClave(c.dataset.key));
            marcar(items);
        });
        overlay.querySelector("#fh-am-todas")?.addEventListener("click", () => {
            const items = [...overlay.querySelectorAll(".fh-am-check")].flatMap(c => porClave(c.dataset.key));
            if (!items.length) return;
            if (!confirm(`Se marcarán ${items.length} alerta${items.length === 1 ? "" : "s"} como atendida${items.length === 1 ? "" : "s"} para TODOS los usuarios. ¿Continuar?`)) return;
            marcar(items);
        });
    }

    _renderMaquinas(maquinas) {
        const container = document.getElementById("fh-maquinas-list");
        if (!container) return;

        const top5 = maquinas.slice().sort((a, b) => b.totalRegistros - a.totalRegistros).slice(0, 5);

        if (!top5.length) {
            container.innerHTML = `<div class="activity-item"><span>Sin registros</span><strong>0</strong></div>`;
            return;
        }

        container.innerHTML = top5.map((item, index) => `
            <div class="activity-item">
                <span>${index + 1}. ${this._escape(item.maquina || "-")} (${this._escape(item.areaControl || "-")})</span>
                <strong>${this._numero(item.totalRegistros)}</strong>
            </div>
        `).join("");
    }

    _renderResumen(kpis, inspecciones, maquinas, indicadoresCalidad) {
        this._setText("fh-resumen-nc-hoy", this._numero(indicadoresCalidad.pncHoy));
        this._setText("fh-resumen-nc-abiertas", kpis.ncAbiertas == null ? "Sin información" : this._numero(kpis.ncAbiertas));
        this._setText("fh-resumen-pnc-sin-gestion", this._numeroOSinInfo(kpis.dataDisponible ? kpis.pncSinGestion : null));
        this._setText("fh-resumen-criticas-abiertas", this._numeroOSinInfo(kpis.dataDisponible ? kpis.criticasAbiertas : null));
        const criticas = document.getElementById("fh-resumen-criticas-abiertas");
        if (criticas) {
            const detalle = (this._datos?.dashboard?.criticasAbiertasDetalle || [])
                .map(c => `${c.codigo} · ${c.tipoPnc || "-"} · ${c.cliente || "-"} · ${this._labelGestion(c.estadoGestion)}`);
            criticas.title = detalle.length ? detalle.join(" | ") : "";
        }
        this._setText("fh-resumen-acciones-pendientes", this._numero(kpis.accionesPendientes));
        this._setText("fh-resumen-acciones-vencidas", this._numero(kpis.accionesVencidas));
        this._setText("fh-resumen-acciones-pct", `${this._numero(kpis.porcentajeAccionesCompletadas)}%`);
        this._setText("fh-resumen-acciones-atiempo", `${this._numero(kpis.porcentajeAccionesCompletadasATiempo)}%`);
        this._setText("fh-resumen-inspecciones-hoy", this._numero(inspecciones.inspeccionesHoy));
        this._setText("fh-resumen-maquinas", this._numero(maquinas.totalMaquinas));
    }

    _chartBarHorizontal(canvasId, rows, labelKey, valueKey, label) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        // Alto mínimo = el de la regla general (220px); crece solo si hay más filas de las que caben.
        ctx.style.setProperty("height", `${window.ChartUtils.altoBarrasHorizontales(rows.length, this._planta ? 340 : 220)}px`, "important");

        const chart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: rows.map(r => r[labelKey] || "-"),
                datasets: [{
                    label,
                    data: rows.map(r => Number(r[valueKey] || 0)),
                    backgroundColor: window.ChartUtils.coloresBarras(rows, ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#14b8a6"]),
                    borderRadius: 8,
                }],
            },
            options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: window.ChartUtils.tooltipOtros(rows, labelKey, valueKey) },
                scales: { x: { beginAtZero: true }, y: window.ChartUtils.ejeCategoriasHorizontal(rows.length) },
            },
        });

        this._charts.push(chart);
    }

    _chartDoughnut(canvasId, rows, labelKey, valueKey) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const chart = new Chart(ctx, {
            type: "doughnut",
            data: {
                labels: rows.map(r => r[labelKey] || "-"),
                datasets: [{
                    data: rows.map(r => Number(r[valueKey] || 0)),
                    backgroundColor: ["#22c55e", "#3b82f6", "#60a5fa", "#84cc16", "#06b6d4", "#f97316"],
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "right", labels: { font: { size: window.ChartUtils.fuente(11) } } } },
                cutout: "62%",
            },
        });

        this._charts.push(chart);
    }

    // ---------- Evolución mensual de No Conformidades por tipo de PNC ----------
    // Barras apiladas por mes de FECHA DE FABRICACIÓN (no de ingreso) con las 3 series que usa
    // Calidad. Se calcula en el frontend sobre todo Data (faret.data.list paginado): la API solo
    // filtra por fecha de ingreso. Lo que no entra (otro tipo, sin fecha de fabricación) se informa
    // en una nota, nunca se reparte en otra serie.

    static SERIES_EVOLUCION = [
        { tipo: "cuarentena", label: "Cuarentena Interna", color: "#2563EB" },
        { tipo: "rechazo cliente", label: "Rechazo Cliente", color: "#C0364B" },
        { tipo: "reclamo", label: "Reclamo (Sin Devolución)", color: "#E07B39" },
    ];

    static MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    // Todo Data, sin filtro de fecha. null si alguna página falla (nunca un gráfico con datos parciales).
    async _traerDataCompleta() {
        const pageSize = 500;
        const items = [];
        let total = Infinity;
        for (let page = 1; items.length < total && page <= 200; page++) {
            const res = await window.PhotinoBridge.send({ action: "faret.data.list", page, pageSize }).catch(() => null);
            if (!res || !res.ok) return null;
            const lote = Array.isArray(res.data?.items) ? res.data.items : [];
            if (!lote.length) break;
            items.push(...lote);
            total = res.data.totalCount ?? items.length;
        }
        return items;
    }

    async _cargarEvolucionAsync() {
        this._evol = undefined;
        const items = await this._traerDataCompleta();
        // El usuario pudo salir de Inicio mientras tanto.
        if (!document.getElementById("fh-chart-evolucion-tipo")) return;
        if (!items) {
            this._evol = null;
            this._renderEvolucion();
            return;
        }

        const series = FaretController.SERIES_EVOLUCION;
        const porAnio = {};
        const otrosPorAnio = {};
        let sinFecha = 0;
        items.forEach(r => {
            const tipo = String(r.tipoPnc || "").trim().toLowerCase();
            const s = series.findIndex(x => x.tipo === tipo);
            const fecha = this._fechaIso(r.fechaFabricacion);
            if (s < 0) {
                if (fecha) otrosPorAnio[fecha.slice(0, 4)] = (otrosPorAnio[fecha.slice(0, 4)] || 0) + 1;
                return;
            }
            if (!fecha) { sinFecha++; return; }
            const anio = fecha.slice(0, 4);
            const mes = Number(fecha.slice(5, 7)) - 1;
            porAnio[anio] = porAnio[anio] || series.map(() => Array(12).fill(0));
            porAnio[anio][s][mes]++;
        });

        this._evol = { porAnio, otrosPorAnio, sinFecha };
        const anios = Object.keys(porAnio).map(Number).sort((a, b) => b - a);
        const actual = new Date().getFullYear();
        if (!this._evolAnio || !anios.includes(this._evolAnio)) this._evolAnio = anios.includes(actual) ? actual : (anios[0] || null);

        const select = document.getElementById("fh-evol-anio");
        if (select) {
            select.innerHTML = anios.length
                ? anios.map(a => `<option value="${a}"${a === this._evolAnio ? " selected" : ""}>${a}</option>`).join("")
                : `<option value="">Sin datos</option>`;
            select.disabled = !anios.length;
        }
        this._renderEvolucion();
    }

    // Meses a mostrar: año en curso → Enero hasta el mes actual (o el último con datos, si hay
    // fechas de fabricación posteriores); años anteriores → los 12 meses.
    _datosEvolucion() {
        const datos = this._evol?.porAnio?.[this._evolAnio];
        if (!datos) return null;
        const hoy = new Date();
        let ultimo = this._evolAnio === hoy.getFullYear() ? hoy.getMonth() : 11;
        for (let m = 11; m > ultimo; m--) if (datos.some(serie => serie[m] > 0)) { ultimo = m; break; }
        const meses = FaretController.MESES.slice(0, ultimo + 1);
        return { meses, valores: datos.map(serie => serie.slice(0, ultimo + 1)) };
    }

    _subtituloEvolucion() {
        const d = this._datosEvolucion();
        return d ? `Basado en fecha de fabricación real · ${d.meses[0]} a ${d.meses[d.meses.length - 1]} ${this._evolAnio}`
            : "Basado en fecha de fabricación real";
    }

    _renderEvolucion() {
        const canvas = document.getElementById("fh-chart-evolucion-tipo");
        if (!canvas) return;

        if (this._chartEvol) {
            try { this._chartEvol.destroy(); } catch { /* ya destruido por _destroyCharts */ }
            this._charts = this._charts.filter(ch => ch !== this._chartEvol);
            this._chartEvol = null;
        }

        const nota = document.getElementById("fh-evol-nota");
        this._setText("fh-evol-sub", this._subtituloEvolucion());
        if (this._evol === undefined) { if (nota) nota.textContent = "Cargando registros de Data..."; return; }
        if (this._evol === null) { if (nota) nota.textContent = "No se pudieron cargar los registros de Data. Reintenta más tarde."; return; }

        const d = this._datosEvolucion();
        if (nota) {
            const partes = [];
            const otros = this._evol.otrosPorAnio[String(this._evolAnio)] || 0;
            if (otros) partes.push(`${otros} PNC de otros tipos (p. ej. "Rechazo") en ${this._evolAnio}`);
            if (this._evol.sinFecha) partes.push(`${this._evol.sinFecha} PNC sin fecha de fabricación (todos los años)`);
            nota.textContent = !d ? "Sin PNC con fecha de fabricación." : partes.length ? `No incluye: ${partes.join(" · ")}.` : "";
        }
        if (!d) return;

        const series = FaretController.SERIES_EVOLUCION;
        const fuente = px => window.ChartUtils.fuente(px);
        // Total del mes sobre cada barra (Chart.js 3.9.1 no trae etiquetas de datos).
        const totales = {
            id: "fhTotalesApilados",
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                chart.data.labels.forEach((_, j) => {
                    let total = 0;
                    let tope = null;
                    chart.data.datasets.forEach((ds, i) => {
                        if (!chart.isDatasetVisible(i)) return;
                        total += Number(ds.data[j] || 0);
                        const el = chart.getDatasetMeta(i).data[j];
                        if (el && (tope === null || el.y < tope.y)) tope = el;
                    });
                    if (!total || !tope) return;
                    ctx.save();
                    ctx.font = `700 ${fuente(12)}px "Segoe UI", Arial, sans-serif`;
                    ctx.fillStyle = "#0F172A";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "bottom";
                    ctx.fillText(String(total), tope.x, tope.y - 4);
                    ctx.restore();
                });
            },
        };

        this._chartEvol = new Chart(canvas, {
            type: "bar",
            data: {
                labels: d.meses,
                datasets: series.map((s, i) => ({
                    label: s.label,
                    data: d.valores[i],
                    backgroundColor: s.color,
                    hoverBackgroundColor: s.color,
                    borderRadius: i === series.length - 1 ? { topLeft: 6, topRight: 6 } : 0,
                    borderSkipped: false,
                    barPercentage: 0.72,
                    categoryPercentage: 0.85,
                })),
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 22 } },
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { position: "top", align: "end", labels: { boxWidth: 12, boxHeight: 12, font: { size: fuente(11) } } },
                    tooltip: {
                        callbacks: {
                            footer: items => `Total: ${items.reduce((a, it) => a + Number(it.raw || 0), 0)}`,
                        },
                    },
                },
                scales: {
                    x: { stacked: true, grid: { display: false }, ticks: { font: { size: fuente(11), weight: "600" }, maxRotation: 0, autoSkip: false } },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        grace: "8%",
                        ticks: { precision: 0, font: { size: fuente(10) } },
                        grid: { color: "#E2E8F0" },
                        title: { display: true, text: "Cantidad de eventos (NC)", font: { size: fuente(11), weight: "600" }, color: "#475569" },
                    },
                },
            },
            plugins: [totales],
        });
        this._charts.push(this._chartEvol);
    }

    _tablaEvolucion() {
        const d = this._datosEvolucion();
        if (!d) return null;
        const series = FaretController.SERIES_EVOLUCION;
        const filas = d.meses.map((m, j) => {
            const v = d.valores.map(serie => serie[j]);
            return [m, ...v, v.reduce((a, b) => a + b, 0)];
        });
        const totales = series.map((_, i) => d.valores[i].reduce((a, b) => a + b, 0));
        filas.push(["Total", ...totales, totales.reduce((a, b) => a + b, 0)]);
        return { columnas: ["Mes", ...series.map(s => s.label), "Total"], filas };
    }

    // ---------- Descarga de gráficos en PDF ----------
    // Botón "PDF" en el título de cada tarjeta con gráfico (se agrega por JS para no repetirlo en la
    // vista) y "Descargar gráficos (PDF)" en la cabecera. Usa PrintExporter.printCharts.

    _agregarBotonesPdf() {
        document.querySelectorAll(".home-module .card").forEach(card => {
            const titulo = card.querySelector(":scope > .module-title");
            if (!card.querySelector("canvas") || !titulo || titulo.querySelector(".fh-pdf-btn")) return;
            const texto = titulo.textContent.trim();
            titulo.textContent = "";
            const span = document.createElement("span");
            span.textContent = texto;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn-secondary fh-pdf-btn";
            btn.title = "Descargar este gráfico en PDF";
            btn.textContent = "PDF";
            btn.addEventListener("click", e => { e.stopPropagation(); this._pdfGraficos([card]); });
            titulo.classList.add("fh-card-titulo");
            titulo.append(span, btn);
        });
    }

    _subtituloGrafico(canvasId) {
        const periodo = document.getElementById("fh-periodo-calidad");
        const textoPeriodo = periodo?.selectedOptions?.[0]?.textContent?.trim();
        const calidad = ["fh-chart-nc-severidad", "fh-chart-cuarentenas-mes", "fh-chart-rechazos-cliente-mes",
            "fh-chart-incidentes-area", "fh-chart-incidentes-familia", "fh-chart-pareto-defectos"];
        if (canvasId === "fh-chart-evolucion-tipo") return this._subtituloEvolucion();
        if (calidad.includes(canvasId) && textoPeriodo) return `Período: ${textoPeriodo}`;
        if (canvasId === "fh-chart-pt-comparacion" || canvasId === "fh-chart-top-clientes") return "Período: mes actual";
        return "";
    }

    _pdfGraficos(cards) {
        const graficos = cards
            .map(card => {
                const canvas = card.querySelector("canvas");
                // Solo gráficos ya dibujados (uno que aún carga saldría en blanco).
                if (!canvas || !window.Chart?.getChart?.(canvas)) return null;
                const titulo = card.querySelector(":scope > .module-title span")?.textContent?.trim()
                    || card.querySelector(":scope > .module-title")?.textContent?.trim() || "Gráfico";
                return {
                    titulo,
                    subtitulo: this._subtituloGrafico(canvas.id),
                    canvas,
                    tabla: canvas.id === "fh-chart-evolucion-tipo" ? this._tablaEvolucion() : null,
                };
            })
            .filter(Boolean);
        if (!graficos.length) return;

        const unico = graficos.length === 1;
        window.PrintExporter.printCharts({
            empresa: "FARET",
            titulo: unico ? graficos[0].titulo : "Panel Faret — Gráficos",
            subtitulo: unico ? "Panel Faret · Inicio" : `Panel Faret · Inicio · ${graficos.length} gráficos`,
            graficos,
        });
    }

    _renderIndicadoresCalidad(ind) {
        const mesActual = window.DateUtils.mesActualISO();
        const cuarentenaMes = (ind.cuarentenasPorMes || []).find(m => m.mes === mesActual);
        const rechazoMes = (ind.rechazosClientePorMes || []).find(m => m.mes === mesActual);

        this._setText("fh-kpi-nc-hoy", this._numero(ind.pncHoy));
        this._setText("fh-kpi-cuarentenas-mes", this._numero(cuarentenaMes?.total));
        this._setText("fh-kpi-rechazos-cliente-mes", this._numero(rechazoMes?.total));
        this._setText("fh-kpi-reclamos-total", this._numero(ind.totalReclamos));

        this._chartBarHorizontal("fh-chart-nc-severidad", ind.porNivel || [], "categoria", "total", "PNC");

        const seriesRecuperadoDestruido = [
            { key: "recuperados", label: "Recuperados", color: "#22c55e" },
            { key: "destruidos", label: "Destruidos", color: "#ef4444" },
        ];
        this._chartBarAgrupada("fh-chart-cuarentenas-mes", ind.cuarentenasPorMes || [], "mes", seriesRecuperadoDestruido);
        this._chartBarAgrupada("fh-chart-rechazos-cliente-mes", ind.rechazosClientePorMes || [], "mes", seriesRecuperadoDestruido);

        this._chartBarHorizontal("fh-chart-incidentes-area", window.ChartUtils.topNConOtros(ind.porArea || []), "categoria", "total", "Incidentes");
        this._chartBarHorizontal("fh-chart-incidentes-familia", window.ChartUtils.topNConOtros(ind.porFamilia || []), "categoria", "total", "Incidentes");

        this._chartPareto("fh-chart-pareto-defectos", window.ChartUtils.paretoTopNConOtros(ind.paretoDefectos || []), "defecto", "frecuencia", "porcentajeAcumulado");
    }

    _renderIndicadoresAdicionales(pt, taller, ncList, dataMes) {
        this._setText("fh-kpi-pt-unidades-nc", this._numero(pt.unidadesNoConformes));
        this._setText("fh-kpi-pt-pct-nc", `${this._numero(pt.porcentajeNoConformes)}%`);
        this._chartBarHorizontal("fh-chart-pt-comparacion", pt.comparacionProcesos || [], "proceso", "porcentajeNc", "% No conformes");

        this._setText("fh-kpi-taller-atrasados", this._numero(taller.atrasados));

        this._renderTiempoCierreNc(ncList || []);

        const conRecuperacion = (dataMes || []).filter(r => r.pctRecuperacion !== null && r.pctRecuperacion !== undefined && r.pctRecuperacion !== "");
        let pctPromedio = null;
        if (conRecuperacion.length) {
            const suma = conRecuperacion.reduce((acc, r) => acc + Number(r.pctRecuperacion || 0), 0);
            pctPromedio = (suma / conRecuperacion.length) * 100;
        }
        this._setText("fh-kpi-pct-recuperacion", pctPromedio !== null ? `${pctPromedio.toFixed(1)}%` : "-");

        const porCliente = {};
        (dataMes || []).forEach(r => {
            const cliente = (r.cliente || "").trim();
            if (!cliente) return;
            porCliente[cliente] = (porCliente[cliente] || 0) + 1;
        });
        const topClientes = Object.entries(porCliente)
            .map(([cliente, total]) => ({ cliente, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);
        this._chartBarHorizontal("fh-chart-top-clientes", topClientes, "cliente", "total", "PNC");

        this._setText("fh-resumen-pt-unidades-nc", this._numero(pt.unidadesNoConformes));
        this._setText("fh-resumen-taller-atrasados", this._numero(taller.atrasados));
    }

    // Días corridos entre dos fechas yyyy-MM-dd (por componentes, sin pasar por el parser UTC de Date).
    _diasEntre(desdeIso, hastaIso) {
        const p = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
        return Math.round((p(hastaIso) - p(desdeIso)) / 86400000);
    }

    // Tiempo de cierre de NC: MEDIANA de las NC cerradas en los últimos 90 días (según su fecha de
    // cierre), medida desde la fecha de detección. La mediana no se distorsiona por cierres masivos
    // de rezago; la ventana deja fuera el histórico antiguo sin borrarlo (sigue en los módulos).
    // También informa el % cerrado dentro del plazo del procedimiento (15 días). Con pocos casos
    // se avisa "información limitada"; sin casos válidos, "-" (nunca un 0 engañoso).
    _calcularTiempoCierreNc(ncList, hoyIso) {
        const VENTANA_DIAS = 90;
        const PLAZO_DIAS = 15;
        const MIN_CASOS = 5;

        const dias = [];
        for (const n of ncList) {
            if (String(n.estadoGestion || "").toUpperCase() !== "CERRADA") continue;
            const det = this._fechaIso(n.fechaDeteccion);
            const cie = this._fechaIso(n.fechaCierre);
            if (!det || !cie) continue;
            const desdeCierre = this._diasEntre(cie, hoyIso);
            if (desdeCierre < 0 || desdeCierre > VENTANA_DIAS) continue; // fuera de la ventana
            const d = this._diasEntre(det, cie);
            if (d < 0) continue; // cierre anterior a la detección: dato inconsistente, no se usa
            dias.push(d);
        }
        if (!dias.length) return { n: 0, mediana: null, pctEnPlazo: null, limitada: true };

        dias.sort((a, b) => a - b);
        const mid = Math.floor(dias.length / 2);
        const mediana = dias.length % 2 ? dias[mid] : (dias[mid - 1] + dias[mid]) / 2;
        const enPlazo = dias.filter(d => d <= PLAZO_DIAS).length;
        return { n: dias.length, mediana, pctEnPlazo: Math.round((enPlazo / dias.length) * 100), enPlazo, limitada: dias.length < MIN_CASOS };
    }

    _renderTiempoCierreNc(ncList) {
        const r = this._calcularTiempoCierreNc(ncList, window.DateUtils.hoyISO());
        this._setText("fh-kpi-nc-tiempo-cierre", r.mediana === null ? "-" : String(Number.isInteger(r.mediana) ? r.mediana : r.mediana.toFixed(1)));

        let detalle;
        if (r.n === 0) {
            detalle = "Sin NC cerradas en los últimos 90 días";
        } else {
            detalle = `días (mediana) · ${r.n} cerrada${r.n === 1 ? "" : "s"} · ${r.pctEnPlazo}% en ≤15 días`
                + (r.limitada ? " · información limitada" : "");
        }
        this._setText("fh-kpi-nc-cierre-detalle", detalle);
        const card = document.getElementById("fh-kpi-nc-tiempo-cierre");
        if (card) card.title = "Mediana de días entre la detección y el cierre de las NC cerradas en los últimos 90 días. Plazo del procedimiento: 15 días.";
    }

    _chartBarAgrupada(canvasId, rows, labelKey, series) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const chart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: rows.map(r => r[labelKey] || "-"),
                datasets: series.map(s => ({
                    label: s.label,
                    data: rows.map(r => Number(r[s.key] || 0)),
                    backgroundColor: s.color,
                    borderRadius: 6,
                })),
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "bottom", labels: { font: { size: window.ChartUtils.fuente(11) } } } },
                scales: {
                    y: { beginAtZero: true },
                    x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
                },
            },
        });

        this._charts.push(chart);
    }

    // Pareto real: barras = frecuencia por defecto, línea = % acumulado sobre eje secundario.
    _chartPareto(canvasId, rows, labelKey, freqKey, pctKey) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const chart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: rows.map(r => r[labelKey] || "-"),
                datasets: [
                    {
                        label: "Frecuencia",
                        data: rows.map(r => Number(r[freqKey] || 0)),
                        backgroundColor: rows.map(r => (r.esOtros ? "#94a3b8" : "#3b82f6")),
                        borderRadius: 6,
                        yAxisID: "y",
                    },
                    {
                        type: "line",
                        label: "% Acumulado",
                        data: rows.map(r => Number(r[pctKey] || 0)),
                        borderColor: "#ef4444",
                        backgroundColor: "#ef4444",
                        pointBackgroundColor: "#ef4444",
                        pointRadius: 3,
                        tension: 0.25,
                        yAxisID: "y1",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "bottom", labels: { font: { size: window.ChartUtils.fuente(11) } } } },
                scales: {
                    y: { beginAtZero: true, position: "left", title: { display: true, text: "Frecuencia" } },
                    y1: {
                        beginAtZero: true,
                        max: 100,
                        position: "right",
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: "% Acumulado" },
                    },
                    x: {
                        ticks: {
                            maxRotation: 30,
                            autoSkip: false,
                            font: { size: window.ChartUtils.fuente(10) },
                            callback: function (value) {
                                return window.ChartUtils.truncar(String(this.getLabelForValue(value)), 14);
                            },
                        },
                    },
                },
            },
        });

        this._charts.push(chart);
    }

    _setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    _numero(value) {
        return Number(value || 0).toLocaleString("es-CL");
    }

    _numeroOSinInfo(value) {
        return value === null || value === undefined ? "Sin información" : this._numero(value);
    }

    _labelGestion(estado) {
        const e = (estado || "").toUpperCase();
        if (e === "SIN_GESTION") return "Sin gestión";
        if (e === "EN_PROCESO") return "En proceso";
        if (e === "PENDIENTE") return "Pendiente";
        return estado || "-";
    }

    _escape(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    _destroyCharts() {
        this._charts.forEach(chart => {
            try { chart.destroy(); } catch { /* noop */ }
        });
        this._charts = [];
    }
};
