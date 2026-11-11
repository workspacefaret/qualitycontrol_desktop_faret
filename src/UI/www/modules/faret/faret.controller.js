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
                if (target && window.app?.loadModule) window.app.loadModule(target);
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
    }

    // Dibuja todo desde los datos ya cargados (`_datos`): sirve para cambiar el período de los
    // indicadores de calidad o el modo planta sin volver a consultar el resto de las fuentes.
    _renderTodo() {
        this._destroyCharts();

        const { dashboard, inspecciones, maquinas, indicadoresCalidad, productoTerminado, talleresExternos, ncList, dataMes } = this._datos;

        this._renderKpis(dashboard?.kpis || {}, inspecciones || {}, maquinas || {});
        this._renderCharts(dashboard || {}, inspecciones || {});
        this._renderAlertas(dashboard?.alertas || []);
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

    _renderAlertas(alertas) {
        const container = document.getElementById("fh-alertas-activas");
        if (!container) return;

        if (!alertas.length) {
            container.innerHTML = `<div class="alert-ok">✔ Sistema sin alertas activas</div>`;
            return;
        }

        container.innerHTML = alertas.map(a => `
            <div class="alert-item">
                <div>${a.tipo === "success" ? "✔" : "⚠"} ${this._escape(a.mensaje || "-")}</div>
            </div>
        `).join("");
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

        const cerradas = (ncList || []).filter(n =>
            (n.estadoGestion || "").toUpperCase() === "CERRADA" && n.fechaDeteccion && n.fechaCierre
        );
        let promedioDias = null;
        if (cerradas.length) {
            const totalDias = cerradas.reduce((acc, n) => {
                const dias = (new Date(n.fechaCierre) - new Date(n.fechaDeteccion)) / 86400000;
                return acc + Math.max(0, dias);
            }, 0);
            promedioDias = totalDias / cerradas.length;
        }
        this._setText("fh-kpi-nc-tiempo-cierre", promedioDias !== null ? promedioDias.toFixed(1) : "-");

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
