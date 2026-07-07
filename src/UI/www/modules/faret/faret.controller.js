window.FaretController = class FaretController {

    init() {
        console.log("FaretController (Inicio) iniciado");

        this._charts = [];

        this._bindModuleCards();
        this._loadDashboard();
    }

    destroy() {
        console.log("FaretController destruido");
        this._destroyCharts();
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
        this._destroyCharts();

        const [dashboard, inspecciones, maquinas] = await Promise.all([
            this._fetch("faret.dashboard.resumen"),
            this._fetch("faret.inspecciones.resumen"),
            this._fetch("faret.maquinas.resumen"),
        ]);

        this._renderKpis(dashboard?.kpis || {}, inspecciones || {}, maquinas || {});
        this._renderCharts(dashboard || {}, inspecciones || {});
        this._renderAlertas(dashboard?.alertas || []);
        this._renderMaquinas(maquinas?.maquinas || []);
        this._renderResumen(dashboard?.kpis || {}, inspecciones || {}, maquinas || {});
    }

    async _fetch(action) {
        try {
            const res = await window.PhotinoBridge.send({ action });
            return res.ok ? res.data : null;
        } catch {
            return null;
        }
    }

    _renderKpis(kpis, inspecciones, maquinas) {
        this._setText("fh-kpi-inspecciones-hoy", this._numero(inspecciones.inspeccionesHoy));
        this._setText("fh-kpi-inspecciones-defectos", this._numero(inspecciones.conDefectos));

        this._setText("fh-kpi-nc-hoy", this._numero(kpis.ncRegistradasHoy));
        this._setText("fh-kpi-nc-abiertas", this._numero(kpis.ncAbiertas));

        this._setText("fh-kpi-acciones-vencidas", this._numero(kpis.accionesVencidas));
        this._setText("fh-kpi-acciones-pct", `${this._numero(kpis.porcentajeAccionesCompletadas)}%`);

        this._setText("fh-kpi-maquinas-total", this._numero(maquinas.totalMaquinas));

        const top = (maquinas.maquinas || []).slice().sort((a, b) => b.totalRegistros - a.totalRegistros)[0];
        this._setText("fh-kpi-maquinas-top", top ? `${top.maquina} (${top.totalRegistros})` : "-");
    }

    _renderCharts(dashboard, inspecciones) {
        this._chartBarHorizontal("fh-chart-nc-proceso", dashboard.ncPorProceso || [], "categoria", "total", "NC");
        this._chartBarHorizontal("fh-chart-nc-severidad", dashboard.ncPorSeveridad || [], "categoria", "total", "NC");
        this._chartDoughnut("fh-chart-estado-acciones", dashboard.estadoAcciones || [], "categoria", "total");
        this._chartBarHorizontal("fh-chart-acciones-proceso", dashboard.accionesPorProceso || [], "categoria", "total", "Acciones");

        this._chartDoughnut("fh-chart-inspecciones-defectos", [
            { nombre: "Con defectos", total: inspecciones.conDefectos || 0 },
            { nombre: "Sin defectos", total: inspecciones.sinDefectos || 0 },
        ], "nombre", "total");

        this._chartLine("fh-chart-tendencia-nc", dashboard.tendenciaNc30Dias || [], "fecha", "total", "NC");
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

    _renderResumen(kpis, inspecciones, maquinas) {
        this._setText("fh-resumen-nc-hoy", this._numero(kpis.ncRegistradasHoy));
        this._setText("fh-resumen-nc-abiertas", this._numero(kpis.ncAbiertas));
        this._setText("fh-resumen-acciones-pendientes", this._numero(kpis.accionesPendientes));
        this._setText("fh-resumen-acciones-vencidas", this._numero(kpis.accionesVencidas));
        this._setText("fh-resumen-acciones-pct", `${this._numero(kpis.porcentajeAccionesCompletadas)}%`);
        this._setText("fh-resumen-inspecciones-hoy", this._numero(inspecciones.inspeccionesHoy));
        this._setText("fh-resumen-maquinas", this._numero(maquinas.totalMaquinas));
    }

    _chartBarHorizontal(canvasId, rows, labelKey, valueKey, label) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const chart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: rows.map(r => r[labelKey] || "-"),
                datasets: [{
                    label,
                    data: rows.map(r => Number(r[valueKey] || 0)),
                    backgroundColor: ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a", "#3b82f6", "#6366f1"],
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
                plugins: { legend: { position: "right", labels: { font: { size: 11 } } } },
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

    _setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    _numero(value) {
        return Number(value || 0).toLocaleString("es-CL");
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
