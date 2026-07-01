window.FaretController = class FaretController {

    init() {
        console.log("FaretController (Dashboard Ejecutivo) iniciado");

        this._charts = [];

        document.getElementById("fdash-refresh-btn")
            ?.addEventListener("click", () => this._loadDashboard());

        this._loadDashboard();
    }

    destroy() {
        console.log("FaretController destruido");
        this._destroyCharts();
    }

    async _loadDashboard() {
        const errorEl = document.getElementById("fdash-error");
        errorEl.style.display = "none";
        this._destroyCharts();

        try {
            const res = await window.PhotinoBridge.send({ action: "faret.dashboard.resumen" });

            if (!res.ok) {
                errorEl.textContent = res.error || "No fue posible cargar el dashboard";
                errorEl.style.display = "block";
                this._marcarSeccionesSinDatos();
                return;
            }

            const data = res.data || {};
            this._renderKpis(data.kpis || {});
            this._renderCharts(data);
            this._renderUltimasNc(data.ultimasNc || []);
            this._renderAlertas(data.alertas || []);
        } catch {
            errorEl.textContent = "Error de comunicación con el backend";
            errorEl.style.display = "block";
            this._marcarSeccionesSinDatos();
        }
    }

    _renderKpis(kpis) {
        try {
            this._setKpi("fdash-kpi-nc-hoy", this._numero(kpis.ncRegistradasHoy));
            this._setKpi("fdash-kpi-nc-abiertas", this._numero(kpis.ncAbiertas));
            this._setKpi("fdash-kpi-acciones-pendientes", this._numero(kpis.accionesPendientes));
            this._setKpi("fdash-kpi-pct-completadas", `${this._numero(kpis.porcentajeAccionesCompletadas)}%`);
            this._setKpi("fdash-kpi-acciones-vencidas", this._numero(kpis.accionesVencidas));
        } catch {
            ["fdash-kpi-nc-hoy", "fdash-kpi-nc-abiertas", "fdash-kpi-acciones-pendientes", "fdash-kpi-pct-completadas", "fdash-kpi-acciones-vencidas"]
                .forEach(id => this._setKpi(id, "-"));
        }
    }

    _setKpi(id, texto) {
        const el = document.getElementById(id);
        if (el) el.textContent = texto;
    }

    _marcarSeccionesSinDatos() {
        // Si falló toda la carga, cada widget muestra su propio estado de error
        // en vez de quedar cargando indefinidamente.
        ["fdash-kpi-nc-hoy", "fdash-kpi-nc-abiertas", "fdash-kpi-acciones-pendientes", "fdash-kpi-pct-completadas", "fdash-kpi-acciones-vencidas"]
            .forEach(id => this._setKpi(id, "-"));

        ["acciones-proceso", "nc-proceso", "tendencia", "nc-severidad", "estado-acciones"]
            .forEach(key => this._mostrarError(key));

        this._mostrarErrorUltimasNc();

        document.getElementById("fdash-skeleton-alertas").style.display = "none";
        document.getElementById("fdash-alertas-box").style.display = "none";
    }

    _renderCharts(data) {
        this._renderChartSeguro("acciones-proceso", () =>
            this._chartBarras("fdash-chart-acciones-proceso", data.accionesPorProceso || [], "#3B82F6"));

        this._renderChartSeguro("nc-proceso", () =>
            this._chartBarras("fdash-chart-nc-proceso", data.ncPorProceso || [], "#EF4444"));

        this._renderChartSeguro("tendencia", () =>
            this._chartLinea("fdash-chart-tendencia", data.tendenciaNc30Dias || []));

        this._renderChartSeguro("nc-severidad", () =>
            this._chartBarras("fdash-chart-nc-severidad", data.ncPorSeveridad || [], "#F97316"));

        this._renderChartSeguro("estado-acciones", () =>
            this._chartDonutEstados("fdash-chart-estado-acciones", data.estadoAcciones || []));
    }

    _renderChartSeguro(key, render) {
        try {
            render();
            this._mostrarCanvas(key);
        } catch (err) {
            console.error(`Error renderizando gráfico "${key}":`, err);
            this._mostrarError(key);
        }
    }

    _mostrarCanvas(key) {
        document.getElementById(`fdash-skeleton-${key}`)?.style.setProperty("display", "none");
        document.getElementById(`fdash-error-${key}`)?.style.setProperty("display", "none");
        const canvas = document.getElementById(`fdash-chart-${key}`);
        if (canvas) canvas.style.display = "block";
    }

    _mostrarError(key) {
        document.getElementById(`fdash-skeleton-${key}`)?.style.setProperty("display", "none");
        const canvas = document.getElementById(`fdash-chart-${key}`);
        if (canvas) canvas.style.display = "none";
        const errorEl = document.getElementById(`fdash-error-${key}`);
        if (errorEl) errorEl.style.display = "flex";
    }

    _chartFontDefaults() {
        return { family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial", size: 12 };
    }

    _chartBarras(canvasId, rows, color) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) throw new Error(`Canvas ${canvasId} no encontrado`);

        const labels = rows.map(r => r.categoria || "-");
        const values = rows.map(r => Number(r.total || 0));

        const chart = new Chart(ctx, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: color,
                    borderRadius: 8,
                    maxBarThickness: 48,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { padding: 10, cornerRadius: 8 },
                },
                scales: {
                    x: { ticks: { font: this._chartFontDefaults() }, grid: { display: false } },
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0, font: this._chartFontDefaults() },
                        grid: { color: "#F1F5F9" },
                    },
                },
            },
        });

        this._charts.push(chart);
    }

    _chartLinea(canvasId, rows) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) throw new Error(`Canvas ${canvasId} no encontrado`);

        const labels = rows.map(r => r.fecha || "-");
        const values = rows.map(r => Number(r.total || 0));

        const chart = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [{
                    data: values,
                    borderColor: "#3B82F6",
                    backgroundColor: "rgba(59, 130, 246, 0.12)",
                    pointBackgroundColor: "#3B82F6",
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    borderWidth: 2,
                    tension: 0.35,
                    fill: true,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { padding: 10, cornerRadius: 8 },
                },
                scales: {
                    x: {
                        ticks: { font: this._chartFontDefaults(), maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
                        grid: { display: false },
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0, font: this._chartFontDefaults() },
                        grid: { color: "#F1F5F9" },
                    },
                },
            },
        });

        this._charts.push(chart);
    }

    _chartDonutEstados(canvasId, rows) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) throw new Error(`Canvas ${canvasId} no encontrado`);

        const coloresPorEstado = {
            PENDIENTE: "#F97316",
            EN_PROCESO: "#3B82F6",
            COMPLETADA: "#22C55E",
            CANCELADA: "#94A3B8",
        };

        const labels = rows.map(r => r.categoria || "-");
        const values = rows.map(r => Number(r.total || 0));
        const colors = rows.map(r => coloresPorEstado[r.categoria] || "#CBD5E1");

        const chart = new Chart(ctx, {
            type: "doughnut",
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "65%",
                plugins: {
                    legend: {
                        position: "right",
                        labels: { font: this._chartFontDefaults(), boxWidth: 12, padding: 14 },
                    },
                    tooltip: { padding: 10, cornerRadius: 8 },
                },
            },
        });

        this._charts.push(chart);
    }

    _renderUltimasNc(items) {
        try {
            const tbody = document.getElementById("fdash-ultimas-nc-tbody");
            if (!tbody) throw new Error("tbody de últimas NC no encontrado");

            tbody.innerHTML = items.length
                ? items.map(nc => `
                    <tr>
                        <td>${this._escape(nc.codigo || "-")}</td>
                        <td>${this._escape(nc.titulo || "-")}</td>
                        <td>${this._escape(nc.proceso || "-")}</td>
                        <td>${this._badge(nc.severidad, this._colorSeveridad(nc.severidad))}</td>
                        <td>${this._badge(nc.estado, this._colorEstadoNc(nc.estado))}</td>
                        <td>${this._escape(nc.fechaCreacion || "-")}</td>
                    </tr>
                `).join("")
                : `<tr><td colspan="6" class="faret-empty">Sin no conformidades registradas</td></tr>`;

            document.getElementById("fdash-skeleton-ultimas-nc").style.display = "none";
            document.getElementById("fdash-error-ultimas-nc").style.display = "none";
            document.getElementById("fdash-ultimas-nc-wrap").style.display = "block";
        } catch (err) {
            console.error("Error renderizando últimas NC:", err);
            this._mostrarErrorUltimasNc();
        }
    }

    _mostrarErrorUltimasNc() {
        document.getElementById("fdash-skeleton-ultimas-nc").style.display = "none";
        document.getElementById("fdash-ultimas-nc-wrap").style.display = "none";
        document.getElementById("fdash-error-ultimas-nc").style.display = "flex";
    }

    _renderAlertas(alertas) {
        const skeletonEl = document.getElementById("fdash-skeleton-alertas");
        const boxEl = document.getElementById("fdash-alertas-box");

        try {
            boxEl.innerHTML = alertas.length
                ? alertas.map(a => `
                    <div class="fdash-alerta-item fdash-alerta-${a.tipo === "success" ? "success" : "warning"}">
                        <span>${a.tipo === "success" ? "✔" : "⚠"}</span>
                        <span>${this._escape(a.mensaje || "-")}</span>
                    </div>
                `).join("")
                : `<div class="fdash-alertas-vacio">Sin alertas activas por el momento</div>`;

            skeletonEl.style.display = "none";
            boxEl.style.display = "flex";
        } catch (err) {
            console.error("Error renderizando alertas:", err);
            skeletonEl.style.display = "none";
            boxEl.style.display = "none";
        }
    }

    _badge(texto, color) {
        return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background:${color}22;color:${color};">${this._escape(texto || "-")}</span>`;
    }

    _colorSeveridad(severidad) {
        const s = (severidad || "").toUpperCase();
        if (s === "ALTA") return "#EF4444";
        if (s === "MEDIA") return "#F97316";
        if (s === "BAJA") return "#22C55E";
        return "#64748B";
    }

    _colorEstadoNc(estado) {
        return (estado || "").toUpperCase() === "CERRADA" ? "#22C55E" : "#3B82F6";
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

    _numero(value) {
        return Number(value || 0).toLocaleString("es-CL");
    }
};
