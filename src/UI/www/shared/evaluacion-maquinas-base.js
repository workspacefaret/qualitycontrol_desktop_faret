// Evaluación por Máquina (solo lectura, indicador descriptivo). Lógica ÚNICA de pantalla para FARET (hoy) e INNPACK (fase 2):
// cada módulo solo pasa su configuración (acción del backend). Mismo patrón que shared/evaluacion-operadores-base.js.
// Todo el cálculo (evaluable / no evaluable / puntos) ocurre en el backend; acá solo se muestra. Sin nota ni ranking.
// Reutiliza las clases de modules/evaluacion-operadores/evaluacion-operadores.css (evop-*).
if (!window.EvaluacionMaquinasBase) {
    class EvaluacionMaquinasBase {
        constructor(config = {}) {
            this._cfg = { accion: "faret.evaluacionMaquinas.resumen", ...config };
            this._chart = null;
            this._onChange = null;
            this._onClick = null;
            this._opcionesCargadas = false;
            this._seq = 0;
            this._d = null;
        }

        async init() {
            const ids = ["evmq-anio", "evmq-mes", "evmq-origen", "evmq-area", "evmq-maquina", "evmq-operador"];
            this._onChange = e => { if (ids.includes(e.target.id)) this._cargar(); };
            this._onClick = e => this._click(e);
            document.addEventListener("change", this._onChange);
            document.addEventListener("click", this._onClick);
            await this._cargar();
        }

        destroy() {
            if (this._chart) { try { this._chart.destroy(); } catch { /* sin gráfico */ } this._chart = null; }
            if (this._onChange) document.removeEventListener("change", this._onChange);
            if (this._onClick) document.removeEventListener("click", this._onClick);
            this._onChange = this._onClick = null;
        }

        _click(e) {
            if (e.target.id === "evmq-limpiar") {
                ["evmq-anio", "evmq-mes", "evmq-origen", "evmq-area", "evmq-maquina", "evmq-operador"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
                this._cargar();
                return;
            }
            if (e.target.id === "evmq-actualizar") { this._cargar(true); return; }
            if (e.target.id === "evmq-cob-ejecutar") { this._medirCobertura(); return; }
            const fila = e.target.closest && e.target.closest(".evmq-fila");
            if (fila && fila.dataset.maquina) {
                const sel = document.getElementById("evmq-maquina");
                if (sel) { sel.value = fila.dataset.maquina; this._cargar(); }
            }
        }

        // Auditoría de cobertura FPS (solo ADMIN_TI y con flag de config): una sola consulta por pulsación, solo conteos.
        _panelCobertura(disponible) {
            const box = document.getElementById("evmq-cobertura");
            if (!box) return;
            box.style.display = disponible ? "block" : "none";
            if (!disponible) return;
            const d = document.getElementById("evmq-cob-desde"), h = document.getElementById("evmq-cob-hasta");
            if (d && !d.value) { const x = new Date(); x.setDate(x.getDate() - 30); d.value = x.toISOString().slice(0, 10); }
            if (h && !h.value) h.value = new Date().toISOString().slice(0, 10);
        }

        async _medirCobertura() {
            const out = document.getElementById("evmq-cob-resultado"), btn = document.getElementById("evmq-cob-ejecutar");
            const desde = this._val("evmq-cob-desde"), hasta = this._val("evmq-cob-hasta");
            if (!out || !desde || !hasta) { if (out) out.textContent = "Indique las fechas «Desde» y «Hasta»."; return; }
            if (btn) btn.disabled = true;
            out.textContent = "Consultando sesiones de FPS… (puede tardar unos segundos)";
            try {
                const res = await window.PhotinoBridge.send({ action: "faret.evaluacionMaquinas.coberturaFps", desde, hasta });
                if (!res || !res.ok) { out.textContent = "No se pudo medir: " + ((res && res.error) || "error desconocido") + ". No se muestran cifras."; return; }
                const d = res.data, g = d.global || {};
                const pct = n => (g.total ? (100 * n / g.total).toLocaleString("es-CL", { maximumFractionDigits: 1 }) + " %" : "—");
                const filas = (d.porMaquina || []).map(x => `<tr><td>${this._esc(x.maquina)}</td><td class="num">${this._n(x.cobertura.total)}</td><td class="num">${this._n(x.cobertura.confiable)}</td><td class="num">${this._n(x.cobertura.probable)}</td><td class="num">${this._n(x.cobertura.sin)}</td></tr>`).join("");
                const pend = (d.equivalenciasPendientes || []).length;
                out.innerHTML = `<strong>${this._n(d.inspeccionesPallet)}</strong> inspecciones Pallet/Papel · <strong>${this._n(d.sesionesFpsLeidas)}</strong> sesiones FPS leídas.
                    Confiable ${this._n(g.confiable)} (${pct(g.confiable)}) · Probable ${this._n(g.probable)} (${pct(g.probable)}) · Sin identificación ${this._n(g.sin)} (${pct(g.sin)}).
                    <div class="table-container" style="margin-top:6px;"><table class="table evop-tabla-sep"><thead><tr><th>Máquina (Pallet)</th><th class="num">Inspecciones</th><th class="num">Confiable</th><th class="num">Probable</th><th class="num">Sin identificación</th></tr></thead><tbody>${filas || '<tr><td colspan="5">Sin datos.</td></tr>'}</tbody></table></div>
                    <div>${pend} máquinas de Pallet con equivalencia pendiente de confirmación humana: quedan fuera (sin identificación).</div>`;
            } catch {
                out.textContent = "Error de conexión con el backend. No se muestran cifras.";
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        _esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
        _val(id) { return (document.getElementById(id)?.value || "").trim(); }
        _set(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
        _n(v) { return Number(v || 0).toLocaleString("es-CL"); }
        _ppi(v) { return v === null || v === undefined ? "—" : Number(v).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
        _fecha(s) { const t = String(s || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t.slice(8, 10)}-${t.slice(5, 7)}-${t.slice(0, 4)}` : "—"; }

        _estado(msg, tipo) {
            const el = document.getElementById("evmq-estado");
            const cont = document.getElementById("evmq-contenido");
            if (!el || !cont) return;
            if (!msg) { el.style.display = "none"; return; }
            el.textContent = msg;
            el.className = "evop-estado" + (tipo === "error" ? " evop-error" : "");
            el.style.display = "block";
            if (tipo !== "datos") cont.style.display = "none";
        }

        async _cargar(actualizar = false) {
            const seq = ++this._seq;
            this._estado(actualizar ? "Actualizando datos…" : "Cargando…");
            const payload = { action: this._cfg.accion };
            const anio = this._val("evmq-anio"), mes = this._val("evmq-mes");
            if (anio) payload.anio = Number(anio);
            if (mes) payload.mes = Number(mes);
            for (const [k, id] of [["origen", "evmq-origen"], ["area", "evmq-area"], ["maquina", "evmq-maquina"], ["operador", "evmq-operador"]])
                if (this._val(id)) payload[k] = this._val(id);
            if (actualizar) payload.actualizar = true;

            let res;
            try { res = await window.PhotinoBridge.send(payload); }
            catch {
                if (seq === this._seq) this._estado("Error de conexión con el backend. No se muestran cifras.", "error");
                return;
            }
            if (seq !== this._seq) return; // respuesta de una consulta anterior
            if (!res || !res.ok) {
                const m = (res && res.error) || "";
                if (/acceso|autoriz|permiso/i.test(m)) this._estado("Acceso denegado: no tienes permiso para ver este módulo.", "error");
                else this._estado("Error al cargar los datos" + (m ? ": " + m.replace(/[.\s]+$/, "") : "") + ". No se muestran cifras.", "error");
                return;
            }
            const priv = document.getElementById("evmq-privacidad");
            if (priv) priv.style.display = res.data && res.data.nombresVisibles === false ? "block" : "none";
            const cache = document.getElementById("evmq-cache");
            if (cache && res.data && res.data.cargadoEn) {
                const f = (res.data.fuentes || []).map(x => `${this._esc(x.origen)}: ${this._n(x.registros)}`).join(" · ");
                cache.textContent = `Datos leídos el ${new Date(res.data.cargadoEn).toLocaleString("es-CL")} (${f}). Los filtros no vuelven a consultar la API; use «Actualizar datos» para releer.`;
            }
            this._panelCobertura(res.data.coberturaFpsDisponible === true);
            this._render(res.data.resultado, actualizar);
        }

        _poblarOpciones(op, forzar) {
            if (!op || (this._opcionesCargadas && !forzar)) return;
            const llenar = (id, valores, base) => {
                const sel = document.getElementById(id);
                if (!sel) return;
                const actual = sel.value;
                sel.innerHTML = `<option value="">${base}</option>` + (valores || []).map(v => `<option value="${this._esc(v)}">${this._esc(v)}</option>`).join("");
                sel.value = actual;
            };
            llenar("evmq-anio", op.anios, "Todos");
            llenar("evmq-origen", op.origenes, "Todos");
            llenar("evmq-area", op.areas, "Todas");
            llenar("evmq-maquina", op.maquinas, "Todas");
            llenar("evmq-operador", op.operadores, "Todos");
            this._opcionesCargadas = true;
        }

        _renderAdvertencias(adv) {
            const box = document.getElementById("evmq-advertencias");
            if (!box) return;
            box.innerHTML = (adv || []).map(a => {
                const fuerte = a.codigo === "datos_insuficientes" || a.codigo === "atribucion_no_confirmada";
                return `<div class="evop-adv${fuerte ? " evop-adv-fuerte" : ""}">${this._esc(a.texto)} <strong>(${this._n(a.cantidad)})</strong></div>`;
            }).join("");
        }

        _render(d, forzarOpciones) {
            this._d = d;
            this._poblarOpciones(d.opciones, forzarOpciones);
            const t = d.totales, cont = document.getElementById("evmq-contenido");
            if (d.universoTotal === 0) { this._estado("Sin resultados: no hay inspecciones registradas."); return; }
            this._estado("");
            cont.style.display = "block";
            this._renderAdvertencias(d.advertencias);
            if (t.inspecciones === 0) this._estado("Sin resultados para los filtros seleccionados.", "datos");

            this._set("evmq-k-insp", this._n(t.inspecciones)); this._set("evmq-k-conf", this._n(t.conformes)); this._set("evmq-k-noconf", this._n(t.noConformes));
            this._set("evmq-k-eval", this._n(t.evaluables)); this._set("evmq-k-noeval", this._n(t.noEvaluables));
            this._set("evmq-k-crit", this._n(t.criticas)); this._set("evmq-k-may", this._n(t.mayores)); this._set("evmq-k-men", this._n(t.menores));
            this._set("evmq-k-pts", this._n(t.puntos)); this._set("evmq-k-ppi", this._ppi(t.puntosPorInspeccion));
            const m = t.noEvaluablesPorMotivo || {};
            const partes = [["sin fecha", m.sinFecha], ["sin máquina", m.sinMaquina], ["origen sin criticidad por defecto", m.origenSinCriticidad], ["criticidad incompleta", m.criticidadIncompleta]].filter(x => x[1] > 0);
            this._set("evmq-noeval-motivos", partes.length ? "No evaluables por motivo: " + partes.map(x => `${x[0]} ${this._n(x[1])}`).join(" · ") + `. Defectos registrados: ${this._n(t.defectosRegistrados)} (sin criticidad: ${this._n(t.defectosSinCriticidad)}).` : "");

            this._tablaOrigen(d.porOrigen);
            this._tablaArea(d.porArea);
            this._tablaMaquina(d.porMaquina);
            this._tablaMaqOp(d.porMaquinaOperador);
            this._detalle(d.detalle);
            this._graficoMes(d.porMes);
        }

        _celdasResumen(r) {
            return `<td class="num">${this._n(r.inspecciones)}</td><td class="num">${this._n(r.conformes)}</td><td class="num">${this._n(r.noConformes)}</td><td class="num">${this._n(r.evaluables)}</td>`;
        }

        _notaResumen(r) {
            if (r.evaluables === 0) return "Sin inspecciones evaluables";
            return r.datosInsuficientes ? "Datos insuficientes (< 30 evaluables)" : "—";
        }

        _tablaOrigen(l) {
            document.getElementById("evmq-tbody-origen").innerHTML = (l || []).map(o => `<tr><td>${this._esc(o.origen)}</td>${this._celdasResumen(o.resumen)}
                <td class="num">${o.admitePuntos ? this._n(o.resumen.puntos) : "—"}</td>
                <td>${o.admitePuntos ? "Sí" : "No registra criticidad: sin puntaje"}</td><td>${o.registraOperador ? "Registra (declarado)" : "No registra operador de máquina"}</td></tr>`).join("")
                || `<tr><td colspan="8">Sin datos.</td></tr>`;
        }

        _tablaArea(l) {
            document.getElementById("evmq-tbody-area").innerHTML = (l || []).map(a => `<tr><td>${this._esc(a.area || "Sin área")}</td>${this._celdasResumen(a.resumen)}
                <td class="num">${this._n(a.resumen.puntos)}</td><td class="num">${this._ppi(a.resumen.puntosPorInspeccion)}</td></tr>`).join("")
                || `<tr><td colspan="7">Sin datos.</td></tr>`;
        }

        _tablaMaquina(l) {
            document.getElementById("evmq-tbody-maquina").innerHTML = (l || []).map(x => {
                const r = x.resumen;
                const nombre = x.maquina || "Sin máquina identificada";
                const sel = x.maquina ? ` class="evmq-fila" data-maquina="${this._esc(x.maquina)}" tabindex="0"` : "";
                return `<tr${sel}><td>${this._esc(nombre)}</td>${this._celdasResumen(r)}<td class="num">${this._n(r.noEvaluables)}</td>
                    <td class="num">${this._n(r.criticas)}</td><td class="num">${this._n(r.mayores)}</td><td class="num">${this._n(r.menores)}</td>
                    <td class="num">${this._n(r.puntos)}</td><td class="num">${this._ppi(r.puntosPorInspeccion)}</td>
                    <td class="num">${this._n(x.operadores)}</td><td class="num">${this._n(x.inspectores)}</td>
                    <td>${this._esc((x.origenes || []).join(" / "))}</td><td class="evop-motivo">${this._esc(this._notaResumen(r))}${x.sinOperadorIdentificado ? ` · ${this._n(x.sinOperadorIdentificado)} sin operador identificado` : ""}</td></tr>`;
            }).join("") || `<tr><td colspan="15">Sin datos.</td></tr>`;
        }

        _tablaMaqOp(l) {
            document.getElementById("evmq-tbody-mo").innerHTML = (l || []).map(x => {
                const r = x.resumen;
                return `<tr><td>${this._esc(x.maquina)}</td><td>${this._esc(x.operador)}</td>${this._celdasResumen(r)}
                    <td class="num">${this._n(r.criticas)}</td><td class="num">${this._n(r.mayores)}</td><td class="num">${this._n(r.menores)}</td>
                    <td class="num">${this._n(r.puntos)}</td><td class="num">${this._ppi(r.puntosPorInspeccion)}</td>
                    <td>${this._esc((x.origenes || []).join(" / "))}</td><td class="evop-motivo">${this._esc(this._notaResumen(r))} · operador declarado, no confirmado</td></tr>`;
            }).join("") || `<tr><td colspan="13">Sin inspecciones con operador de máquina identificable para los filtros seleccionados.</td></tr>`;
        }

        _detalle(det) {
            const box = document.getElementById("evmq-detalle");
            if (!box) return;
            if (!det) { box.style.display = "none"; box.innerHTML = ""; return; }
            const motivo = { sin_fecha: "Sin fecha", sin_maquina: "Sin máquina", origen_sin_criticidad: "Origen sin criticidad", criticidad_incompleta: "Criticidad incompleta" };
            box.style.display = "block";
            box.innerHTML = `<h3>Inspecciones de la máquina <small>(trazabilidad; el inspector es quien inspeccionó y no se penaliza)</small></h3>
                <div class="table-container"><table class="table evop-tabla-sep">
                <thead><tr><th>Id</th><th>Tipo</th><th>Fecha</th><th>Área</th><th>Operador de máquina</th><th>Inspector</th><th>Resultado</th><th class="num">Defectos</th><th class="num">Crít.</th><th class="num">May.</th><th class="num">Men.</th><th class="num">Puntos</th><th>Evaluable</th></tr></thead>
                <tbody>${det.map(x => `<tr><td>${this._esc(x.id)}</td><td>${this._esc(x.origen)}</td><td>${this._fecha(x.fecha)}</td><td>${this._esc(x.area || "—")}</td>
                    <td>${this._esc(x.operadorMaquina || "No identificado")}</td><td>${this._esc(x.inspector || "—")}</td>
                    <td>${x.conforme ? "Conforme" : "No conforme"}</td><td class="num">${this._n(x.defectos)}</td>
                    <td class="num">${this._n(x.criticas)}</td><td class="num">${this._n(x.mayores)}</td><td class="num">${this._n(x.menores)}</td>
                    <td class="num">${x.puntos === null || x.puntos === undefined ? "—" : this._n(x.puntos)}</td>
                    <td>${x.evaluable ? "Sí" : "No · " + this._esc(motivo[x.motivoNoEvaluable] || x.motivoNoEvaluable || "")}</td></tr>`).join("") || '<tr><td colspan="13">Sin inspecciones.</td></tr>'}</tbody>
                </table></div>`;
        }

        _graficoMes(meses) {
            const canvas = document.getElementById("evmq-chart-mes");
            if (!canvas || typeof Chart === "undefined") return;
            if (this._chart) { try { this._chart.destroy(); } catch { /* sin gráfico */ } }
            const l = meses || [];
            this._chart = new Chart(canvas, {
                data: {
                    labels: l.map(x => x.mes),
                    datasets: [
                        { type: "bar", label: "Conformes", data: l.map(x => x.resumen.conformes), backgroundColor: "#86efac", stack: "i", yAxisID: "y" },
                        { type: "bar", label: "No conformes", data: l.map(x => x.resumen.noConformes), backgroundColor: "#fca5a5", stack: "i", yAxisID: "y" },
                        { type: "line", label: "Puntos de severidad", data: l.map(x => x.resumen.puntos), borderColor: "#1e3a5f", backgroundColor: "#1e3a5f", yAxisID: "y1", tension: 0.2 },
                    ],
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                        y: { stacked: true, beginAtZero: true, title: { display: true, text: "Inspecciones" } },
                        y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: "Puntos" } },
                    },
                },
            });
        }
    }
    window.EvaluacionMaquinasBase = EvaluacionMaquinasBase;
}
