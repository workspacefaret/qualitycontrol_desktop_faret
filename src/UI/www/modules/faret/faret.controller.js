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
        this._loadDashboard();
    }

    destroy() {
        console.log("FaretController destruido");
        this._destroyCharts();
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
    // this._alertas = { pnc, nci, doc }: objeto {cantidad, detalle, modulo} | null (sin problema u
    // omitida) | "error" (no se pudo calcular: nunca se informa como "0").

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

    _alertaPnc() {
        if (!this._puedeVer("faret-nc")) return null;
        const kpis = this._datos?.dashboard?.kpis;
        // Sin dashboard o sin Data disponible no se conoce el dato real: no se informa un parcial.
        if (!kpis || !kpis.dataDisponible) return "error";
        // Criterio real "Nivel = Crítico" (registros de Data, no cerrados o sin gestión): son las
        // filas del detalle con dataId. Las NC manuales por severidad ALTA (sin dataId) no cuentan,
        // igual que el filtro Nivel=Crítico + Estado≠Cerrada de No Conformidades.
        const detalle = (this._datos.dashboard.criticasAbiertasDetalle || []).filter(c => Number(c.dataId) > 0);
        const total = detalle.length;
        if (total <= 0) return null;

        const dias = detalle.map(c => this._haceDias(c.fechaIngreso)).filter(d => d !== null);
        const masAntigua = dias.length ? Math.max(...dias) : null;
        const sinGestion = detalle.filter(c => c.estadoGestion === "SIN_GESTION").length;
        return {
            cantidad: total,
            texto: `${total} PNC crítica${total === 1 ? "" : "s"} pendiente${total === 1 ? "" : "s"}`
                + ` (${sinGestion} sin gestión${masAntigua !== null ? `, la más antigua hace ${masAntigua} días` : ""})`,
            modulo: "faret-nc",
        };
    }

    async _alertaNcInternas() {
        if (!this._puedeVer("faret-nc-internas")) return null;
        const res = await this._fetch("noConformidades.list", { page: 1, pageSize: 999999, ambito: "INTERNA", empresa: "FARET" });
        if (!res || !Array.isArray(res.items)) return "error";

        // Más de 15 días: fecha de detección válida y anterior a (hoy - 15 días), es decir, ≥ 16 días.
        const limite = this._isoHaceDias(15);
        const vencidas = res.items.filter(nc =>
            String(nc.estadoGestion || "").toUpperCase() !== "CERRADA"
            && this._fechaIso(nc.fechaDeteccion) !== null
            && this._fechaIso(nc.fechaDeteccion) < limite
        );
        if (!vencidas.length) return null;
        return {
            cantidad: vencidas.length,
            texto: `${vencidas.length} NC interna${vencidas.length === 1 ? "" : "s"} abierta${vencidas.length === 1 ? "" : "s"} hace más de 15 días`,
            modulo: "faret-nc-internas",
        };
    }

    async _alertaDocumentos() {
        if (!this._puedeVer("faret-control-documental")) return null;
        // El filtro de alcance es igualdad exacta: se piden FARET y AMBAS por separado.
        const pedir = alcance => this._fetch("controlDocumental.list", { page: 1, pageSize: 999999, alcanceEmpresa: alcance });
        const [faret, ambas] = await Promise.all([pedir("FARET"), pedir("AMBAS")]);
        if (!faret || !ambas || !Array.isArray(faret.items) || !Array.isArray(ambas.items)) return "error";

        const hoy = window.DateUtils.hoyISO();
        const vencidos = [...faret.items, ...ambas.items].filter(d =>
            String(d.estado || "").toUpperCase() !== "OBSOLETO"
            && this._fechaIso(d.versionProximaRevision) !== null
            && this._fechaIso(d.versionProximaRevision) < hoy
        );
        if (!vencidos.length) return null;

        // Más atrasados primero; cada uno con su fecha y días de atraso para actuar sobre él.
        const filas = vencidos
            .map(d => ({ id: d.id, codigo: d.codigoBase || "-", nombre: d.nombre || "", fecha: this._fechaIso(d.versionProximaRevision) }))
            .sort((a, b) => a.fecha.localeCompare(b.fecha))
            .map(f => ({ ...f, dias: this._haceDias(f.fecha) }));
        return {
            cantidad: vencidos.length,
            texto: `${vencidos.length} documento${vencidos.length === 1 ? "" : "s"} con revisión vencida`,
            modulo: "faret-control-documental",
            filas,
        };
    }

    async _cargarAlertasAsync() {
        this._alertas = { pnc: this._alertaPnc(), nci: undefined, doc: undefined };
        this._renderAlertas();

        const seguro = fn => fn().catch(() => "error");
        const [nci, doc] = await Promise.all([seguro(() => this._alertaNcInternas()), seguro(() => this._alertaDocumentos())]);
        // El usuario pudo salir de Inicio mientras tanto.
        if (!document.getElementById("fh-alertas-activas")) return;
        this._alertas.nci = nci;
        this._alertas.doc = doc;
        this._renderAlertas();
    }

    _renderAlertas() {
        const container = document.getElementById("fh-alertas-activas");
        if (!container) return;

        const a = this._alertas;
        if (!a) {
            container.innerHTML = `<div class="alert-item"><div>Cargando alertas...</div></div>`;
            return;
        }

        const lista = [a.pnc, a.nci, a.doc];
        const avisos = lista.filter(x => x && x !== "error");
        const fallidas = lista.filter(x => x === "error").length;
        const pendientes = a.nci === undefined || a.doc === undefined;

        // Con `filas` (documentos vencidos) se lista cada uno, con su botón "Revisar" que abre ese
        // documento; el aviso se apaga solo cuando queda con una próxima revisión futura.
        let html = avisos.map(x => `
            <div class="alert-item" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
                <div>⚠ ${this._escape(x.texto)}</div>
                <button type="button" class="btn-secondary fh-alerta-ver" data-modulo="${this._escape(x.modulo)}">Ver</button>
            </div>
            ${(x.filas || []).slice(0, 5).map(f => `
            <div class="alert-item" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding-left:24px;font-size:13px;">
                <div><strong>${this._escape(f.codigo)}</strong>${f.nombre ? ` · ${this._escape(f.nombre)}` : ""}
                    <span style="opacity:.75;"> — vencido el ${this._escape(window.DateUtils.formatear(f.fecha))}${f.dias !== null ? ` (hace ${f.dias} día${f.dias === 1 ? "" : "s"})` : ""}</span></div>
                <button type="button" class="btn-primary fh-alerta-revisar" data-doc-id="${Number(f.id)}">Revisar</button>
            </div>`).join("")}
            ${(x.filas || []).length > 5 ? `<div class="alert-item" style="padding-left:24px;font-size:13px;opacity:.75;">y ${x.filas.length - 5} más en Control Documental</div>` : ""}
        `).join("");

        if (!avisos.length) {
            html = pendientes
                ? `<div class="alert-item"><div>Cargando alertas...</div></div>`
                : fallidas
                    ? ""
                    : `<div class="alert-ok">✔ Sistema sin alertas activas</div>`;
        }
        if (fallidas && !pendientes) {
            html += `<div class="alert-item"><div style="opacity:.7;font-size:12px;">No se pudieron calcular ${fallidas} aviso${fallidas === 1 ? "" : "s"}. Reintenta más tarde.</div></div>`;
        }

        container.innerHTML = html;
        container.querySelectorAll(".fh-alerta-ver").forEach(btn =>
            btn.addEventListener("click", () => window.App?.loadModule?.(btn.dataset.modulo)));
        container.querySelectorAll(".fh-alerta-revisar").forEach(btn =>
            btn.addEventListener("click", () => {
                try { sessionStorage.setItem("fcdAbrirDocumento", btn.dataset.docId); } catch { /* abre el listado */ }
                window.App?.loadModule?.("faret-control-documental");
            }));
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

    _chartLine(canvasId, rows, labelKey, valueKey, label) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const chart = new Chart(ctx, {
            type: "line",
            data: {
                labels: rows.map(r => r[labelKey] || "-"),
                datasets: [{
                    label,
                    data: rows.map(r => Number(r[valueKey] || 0)),
                    borderColor: "#65a30d",
                    backgroundColor: "rgba(101, 163, 13, 0.12)",
                    pointBackgroundColor: "#65a30d",
                    pointRadius: 2,
                    tension: 0.35,
                    fill: true,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true }, x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } } },
            },
        });

        this._charts.push(chart);
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
        this._chartLine("fh-chart-tendencia-nc", ind.tendenciaPnc30Dias || [], "fecha", "total", "PNC");

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
