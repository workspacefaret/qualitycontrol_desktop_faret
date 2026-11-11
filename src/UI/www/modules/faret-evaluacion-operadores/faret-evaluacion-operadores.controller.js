// Evaluación de Calidad por Operador - FARET (Fase 34). Solo lectura.
// Backend: faret.evaluacionOperadores.resumen = PNC de Data (API qualitycontrol) + sesiones reales de FPS (fps-api),
// atribución técnica en FaretAtribucionFps.cs. Acá solo se muestra: sin cálculos de atribución en JS.
// INNPACK usa su propio módulo (modules/evaluacion-operadores + shared/evaluacion-operadores-base.js), sin cambios.
window.FaretEvaluacionOperadoresController = class {
    constructor() {
        this._data = null;
        this._tab = "conf";
        this._seq = 0;
        this._opcionesCargadas = false;
        this._onChange = null;
        this._onClick = null;
    }

    async init() {
        const filtros = ["fevf-anio", "fevf-mes", "fevf-maquina", "fevf-area", "fevf-turno", "fevf-operador"];
        // Los filtros solo recalculan sobre el universo ya cargado (caché del backend): no consultan FPS. Anti-rebote para ráfagas de cambios.
        this._onChange = e => { if (filtros.includes(e.target.id)) { clearTimeout(this._deb); this._deb = setTimeout(() => this._cargar(), 300); } };
        this._onClick = e => this._click(e);
        document.addEventListener("change", this._onChange);
        document.addEventListener("click", this._onClick);
        await this._cargar();
    }

    destroy() {
        if (this._onChange) document.removeEventListener("change", this._onChange);
        if (this._onClick) document.removeEventListener("click", this._onClick);
        clearTimeout(this._deb);
        this._onChange = this._onClick = null;
    }

    // ------------------------------------------------------------ utilidades
    _esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
    _val(id) { return (document.getElementById(id)?.value || "").trim(); }
    _set(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
    _fecha(s) { const t = String(s || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t.slice(8, 10)}-${t.slice(5, 7)}-${t.slice(0, 4)}` : "—"; }
    _estadoTxt(e) {
        return { CONFIRMADA_TECNICA: "Confirmada técnica", PROBABLE: "Probable", AMBIGUA: "Ambigua", DISCREPANCIA: "Discrepancia", SIN_ATRIBUCION: "Sin atribución" }[e] || e;
    }
    _declTxt(d) {
        return { COINCIDE: "Coincide con FPS", NO_COINCIDE: "Distinto de FPS", EXTERNO: "Taller / externo", NO_COMPARABLE: "No comparable (iniciales o varias personas)", SIN_DATO: "Sin operador escrito", SIN_FPS: "Sin personas FPS para comparar" }[d] || d;
    }
    _chip(e) { return `<span class="fevf-est fevf-est-${this._esc(e)}">${this._esc(this._estadoTxt(e))}</span>`; }

    _estadoMsg(html, error = false) {
        const el = document.getElementById("fevf-estado");
        if (!el) return;
        el.style.display = html ? "" : "none";
        el.className = "evop-estado" + (error ? " evop-error" : "");
        el.innerHTML = html || "";
    }

    // ------------------------------------------------------------ carga
    async _cargar(forzar = false) {
        const seq = ++this._seq;
        const anio = this._val("fevf-anio"), mes = this._val("fevf-mes");
        const payload = { action: "faret.evaluacionOperadores.resumen" };
        if (anio) payload.anio = Number(anio);
        if (mes) payload.mes = Number(mes);
        for (const [k, id] of [["maquina", "fevf-maquina"], ["area", "fevf-area"], ["turno", "fevf-turno"], ["operador", "fevf-operador"]]) {
            const v = this._val(id); if (v) payload[k] = v;
        }
        if (forzar) payload.actualizar = true;
        this._estadoMsg(`${forzar ? "Actualizando" : "Cargando"} PNC de Data y sesiones de producción de FPS… ` +
            `<button type="button" class="btn-secondary" data-fevf-cancelar="1" style="margin-left:8px;">Cancelar</button>`);
        let r;
        try { r = await window.PhotinoBridge.send(payload); }
        catch (e) { r = { ok: false, error: String(e) }; }
        if (seq !== this._seq) return; // respuesta vieja
        const cont = document.getElementById("fevf-contenido");
        if (!r || !r.ok) {
            if (cont) cont.style.display = "none";
            this._estadoMsg(`No se pudo cargar: ${this._esc(r?.error || "error desconocido")}`, true);
            return;
        }
        const d = r.data || {};
        const priv = document.getElementById("fevf-privacidad");
        if (priv) priv.style.display = d.nombresVisibles ? "none" : "";
        this._cacheInfo(d.cache);
        if (!d.fps || !d.fps.disponible || !d.resultado) {
            const est = d.fps?.estado;
            // Cancelado por el usuario: se conservan los datos ya mostrados (no se tocan).
            if (est === "CANCELADO" && this._data) { this._estadoMsg(this._esc(d.fps?.motivo || "Carga cancelada.")); return; }
            if (cont) cont.style.display = "none";
            const titulo = est === "NO_DESPLEGADO" || est === "NO_CONFIGURADO" ? "Infraestructura pendiente"
                : est === "CANCELADO" ? "Carga cancelada" : est === "TIMEOUT" ? "Tiempo de carga agotado"
                : est === "LIMITE_VOLUMEN" ? "Volumen excedido" : "FPS no disponible";
            this._estadoMsg(
                `<strong>${titulo}:</strong> ${this._esc(d.fps?.motivo || "sin detalle")}<br>` +
                `Hay ${this._esc(d.registradas ?? "—")} PNC en Data, pero sin las sesiones de FPS no se atribuye ninguna a personas ni se muestran cifras por operador.`, true);
            return;
        }
        this._data = d;
        this._estadoMsg("");
        if (cont) cont.style.display = "";
        this._render();
    }

    // Edad del universo cargado (los filtros no consultan FPS; "Actualizar datos" sí).
    _cacheInfo(c) {
        const el = document.getElementById("fevf-cache");
        if (!el) return;
        if (!c || !c.cargadoEn) { el.textContent = ""; return; }
        const min = Math.floor((c.edadSeg || 0) / 60);
        el.textContent = `Datos de FPS cargados ${min < 1 ? "hace menos de 1 min" : "hace " + min + " min"} (vigencia ${c.vigenciaMin} min; los filtros no consultan FPS).`;
    }

    _poblarOpciones(op) {
        if (this._opcionesCargadas) return;
        const llenar = (id, items) => {
            const el = document.getElementById(id); if (!el) return;
            el.insertAdjacentHTML("beforeend", items.map(([v, t]) => `<option value="${this._esc(v)}">${this._esc(t)}</option>`).join(""));
        };
        const anios = [...new Set((op.periodos || []).map(p => p.slice(0, 4)))].sort();
        llenar("fevf-anio", anios.map(a => [a, a]));
        llenar("fevf-maquina", (op.maquinas || []).map(m => [m, m]));
        llenar("fevf-area", (op.areas || []).map(a => [a, a]));
        llenar("fevf-operador", (op.operadores || []).map(o => [o.clave, o.nombre]));
        this._opcionesCargadas = true;
    }

    // ------------------------------------------------------------ render
    _render() {
        const d = this._data, res = d.resultado, t = res.totales, e = t.porEstado || {};
        this._poblarOpciones(res.opciones || {});
        this._set("fevf-k-filtradas", t.filtradas);
        this._set("fevf-k-universo", `(de ${t.registradas} en Data)`);
        this._set("fevf-k-conf", e.CONFIRMADA_TECNICA || 0);
        this._set("fevf-k-prob", e.PROBABLE || 0);
        this._set("fevf-k-amb", e.AMBIGUA || 0);
        this._set("fevf-k-disc", e.DISCREPANCIA || 0);
        this._set("fevf-k-sin", e.SIN_ATRIBUCION || 0);
        this._set("fevf-k-ops", t.operadoresFps);
        this._set("fevf-k-puntos", t.puntosProvisionales);
        this._set("fevf-t-conf", e.CONFIRMADA_TECNICA || 0);
        this._set("fevf-t-pa", (e.PROBABLE || 0) + (e.AMBIGUA || 0));
        this._set("fevf-t-sin", (e.DISCREPANCIA || 0) + (e.SIN_ATRIBUCION || 0));
        const fuente = document.getElementById("fevf-fuente");
        if (fuente) fuente.textContent = `Fuente: ${d.fuente}. FPS: ${d.fps.documentos} órdenes y ${d.fps.sesiones} sesiones consultadas. ` +
            `Sin fecha de fabricación: ${t.sinFechaFabricacion} · sesiones simultáneas: ${t.sesionesSimultaneas} · cambio de turno: ${t.cambioTurno} · máquina por equivalencia de nombre: ${t.maquinaEquivalente}. ` +
            `El turno es estimado por la hora de inicio de la sesión (FPS no registra turno).`;
        this._renderOperadores(res.operadores || []);
        this._renderPnc();
        this._renderDist("fevf-d-maquina", res.porMaquina);
        this._renderDist("fevf-d-proceso", res.porProceso);
        this._renderDist("fevf-d-periodo", res.porPeriodo);
        this._renderDist("fevf-d-turno", res.porTurno);
        this._renderDeclarado(t.declarado || {}, t.filtradas);
        const det = document.getElementById("fevf-detalle-op");
        if (det && det.dataset.clave) this._detalleOperador(det.dataset.clave);
    }

    _renderOperadores(ops) {
        const tb = document.getElementById("fevf-tbody-ops"); if (!tb) return;
        if (ops.length === 0) { tb.innerHTML = `<tr><td colspan="11">Ninguna persona de FPS en las PNC filtradas.</td></tr>`; return; }
        tb.innerHTML = ops.map(o => `<tr>
            <td>${this._esc(o.nombre)}</td><td class="num">${o.confirmadas}</td><td class="num">${o.criticas}</td><td class="num">${o.mayores}</td>
            <td class="num">${o.menores}</td><td class="num">${o.puntosProvisionales}</td><td class="num">${o.probables}</td><td class="num">${o.ambiguas}</td>
            <td class="num">${o.declaradoNoCoincide}</td><td>${this._esc((o.maquinas || []).join(", "))}</td>
            <td><button class="fevf-link" type="button" data-fevf-op="${this._esc(o.clave)}">Ver detalle</button></td></tr>`).join("");
    }

    _filasTab() {
        const pnc = this._data?.resultado?.pnc || [];
        const grupos = { conf: ["CONFIRMADA_TECNICA"], pa: ["PROBABLE", "AMBIGUA"], sin: ["DISCREPANCIA", "SIN_ATRIBUCION"] };
        return pnc.filter(p => grupos[this._tab].includes(p.estado));
    }

    _renderPnc() {
        document.querySelectorAll("[data-fevf-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.fevfTab === this._tab ? "true" : "false"));
        const tb = document.getElementById("fevf-tbody-pnc"); if (!tb) return;
        const filas = this._filasTab();
        if (filas.length === 0) { tb.innerHTML = `<tr><td colspan="10">Sin PNC en esta lista.</td></tr>`; return; }
        const vis = this._data.nombresVisibles;
        tb.innerHTML = filas.map(p => {
            const maq = `${this._esc(p.maquinaPnc || "—")}${p.maquinaFps ? ` → ${this._esc(p.maquinaFps)}${p.estadoMaquina === "EQUIVALENTE" ? " <small>(equivalencia)</small>" : ""}` : ""}`;
            const pers = (p.operadores || []).map(o => this._esc(o.nombre)).join("<br>") || "—";
            const decl = vis && p.operadorDeclarado ? `${this._esc(p.operadorDeclarado)}<br><small>${this._esc(this._declTxt(p.declarado))}</small>` : `<small>${this._esc(this._declTxt(p.declarado))}</small>`;
            return `<tr id="fevf-pnc-${p.id}">
                <td>${p.id}</td><td>${this._esc(p.npNv || "—")}</td><td>${this._esc(p.nivel)}</td><td>${this._fecha(p.fechaFabricacion)}</td>
                <td>${maq}</td><td>${this._chip(p.estado)}</td><td>${pers}</td><td>${decl}</td><td class="num">${p.puntosProvisionales}</td>
                <td><button class="fevf-link" type="button" data-fevf-ev="${p.id}">Evidencia</button></td></tr>`;
        }).join("");
    }

    _tablaSesiones(sesiones, conPnc = false) {
        if (!sesiones || sesiones.length === 0) return `<div class="fevf-sub">Sin sesiones.</div>`;
        return `<table class="table fevf-tabla-mini"><thead><tr>${conPnc ? "<th>PNC (Id Data)</th><th>NP/NV</th>" : ""}<th>OT</th><th>Proceso</th><th>Máquina</th><th>Persona</th><th>Inicio</th><th>Término</th><th>Turno est.</th><th class="num">Cantidad</th><th>Registro FPS</th></tr></thead><tbody>` +
            sesiones.map(s => `<tr>${conPnc ? `<td>${s._pnc}</td><td>${this._esc(s._np)}</td>` : ""}<td>${s.ot}</td><td>${this._esc(s.categoria || "")} · ${this._esc(s.proceso || "")}</td>
                <td>${this._esc(s.maquina || "")}</td><td>${this._esc(s.operador || "")}</td><td>${this._esc(s.inicio || "")}</td><td>${this._esc(s.fin || "")}</td>
                <td>${this._esc(s.turno)}</td><td class="num">${s.cantidad ?? ""}</td><td>${s.recordKey}</td></tr>`).join("") + `</tbody></table>`;
    }

    _toggleEvidencia(id) {
        const fila = document.getElementById(`fevf-pnc-${id}`); if (!fila) return;
        const sig = fila.nextElementSibling;
        if (sig && sig.classList.contains("fevf-evidencia")) { sig.remove(); return; }
        const p = (this._data.resultado.pnc || []).find(x => String(x.id) === String(id)); if (!p) return;
        const doc = { NP_FARET: "NP Faret", NV_INNPACK: "NV Innpack", AMBIGUO: "Ambiguo (NP Faret y NV Innpack en órdenes distintas)", NO_ENCONTRADO: "No encontrado en FPS", NO_NUMERICO: "NP/NV no numérica" }[p.documento] || p.documento;
        const fechaTxt = { DENTRO: "con sesiones ese día", FUERA: "sin sesiones ese día", SIN_FECHA: "la PNC no tiene fecha de fabricación" }[p.estadoFecha] || p.estadoFecha;
        const html = `<tr class="fevf-evidencia"><td colspan="10">
            <div><strong>Trazabilidad:</strong> PNC ${p.id} → documento ${this._esc(doc)}${p.ots?.length ? ` (OT ${p.ots.join(", ")})` : ""} → máquina ${this._esc(p.estadoMaquina)} → día de fabricación: ${this._esc(fechaTxt)} → ${this._chip(p.estado)}
            · responsabilidad: <strong>pendiente de Calidad</strong></div>
            <ul>${(p.motivos || []).map(m => `<li>${this._esc(m)}</li>`).join("")}</ul>
            ${p.simultaneas ? `<div class="fevf-sub">Hay sesiones simultáneas de distintas personas.</div>` : ""}${p.cambioTurno ? `<div class="fevf-sub">Las sesiones cruzan más de un turno estimado.</div>` : ""}
            <h4>Sesiones usadas como evidencia (${(p.evidencia || []).length})</h4>${this._tablaSesiones(p.evidencia)}
            ${(p.contextoTotal || 0) > 0 ? `<h4>Contexto del documento (${p.contextoTotal}${p.contextoTotal > (p.contexto || []).length ? `, se muestran ${p.contexto.length}` : ""}) <small>— no se usa para atribuir</small></h4>${this._tablaSesiones(p.contexto)}` : ""}
        </td></tr>`;
        fila.insertAdjacentHTML("afterend", html);
    }

    _detalleOperador(clave) {
        const det = document.getElementById("fevf-detalle-op"); if (!det) return;
        const res = this._data.resultado;
        const o = (res.operadores || []).find(x => x.clave === clave);
        if (!o) { det.style.display = "none"; det.dataset.clave = ""; return; }
        const pnc = (res.pnc || []).filter(p => (p.operadores || []).some(x => x.clave === clave));
        const sesiones = pnc.flatMap(p => (p.evidencia || []).filter(s => s.operadorClave === clave).map(s => ({ ...s, _pnc: p.id, _np: p.npNv })));
        const tablaPnc = estados => {
            const l = pnc.filter(p => estados.includes(p.estado));
            if (l.length === 0) return `<div class="fevf-sub">Ninguna.</div>`;
            return `<table class="table fevf-tabla-mini"><thead><tr><th>Id Data</th><th>NP/NV</th><th>Nivel</th><th>Fecha fab.</th><th>Máquina</th><th>Estado</th><th>Otras personas</th><th class="num">Puntos prov.</th></tr></thead><tbody>` +
                l.map(p => `<tr><td>${p.id}</td><td>${this._esc(p.npNv)}</td><td>${this._esc(p.nivel)}</td><td>${this._fecha(p.fechaFabricacion)}</td><td>${this._esc(p.maquinaFps || p.maquinaPnc || "")}</td>
                    <td>${this._chip(p.estado)}</td><td>${this._esc((p.operadores || []).filter(x => x.clave !== clave).map(x => x.nombre).join(", ") || "—")}</td><td class="num">${p.puntosProvisionales}</td></tr>`).join("") + `</tbody></table>`;
        };
        det.dataset.clave = clave;
        det.style.display = "";
        det.innerHTML = `<h3>Detalle: ${this._esc(o.nombre)} <small>(trazabilidad persona → sesión → documento → PNC)</small>
            <button class="btn-secondary" type="button" data-fevf-cerrar style="float:right;">Cerrar</button></h3>
            <div class="fevf-sub">Confirmadas: ${o.confirmadas} · puntos provisionales: ${o.puntosProvisionales} · probables: ${o.probables} · ambiguas en que participa: ${o.ambiguas} (sin puntos). La responsabilidad de cada PNC la confirma Calidad.</div>
            <h4>PNC confirmadas técnicamente</h4>${tablaPnc(["CONFIRMADA_TECNICA"])}
            <h4>PNC probables o ambiguas en que participa</h4>${tablaPnc(["PROBABLE", "AMBIGUA"])}
            <h4>Sesiones de FPS usadas como evidencia (${sesiones.length})</h4>${this._tablaSesiones(sesiones, true)}`;
        det.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    _renderDist(id, grupos) {
        const el = document.getElementById(id); if (!el) return;
        if (!grupos || grupos.length === 0) { el.innerHTML = `<div class="fevf-sub">Sin datos.</div>`; return; }
        el.innerHTML = `<table class="table fevf-tabla-mini"><thead><tr><th></th><th class="num">Total</th><th class="num" title="Confirmadas técnicamente">Conf.</th><th class="num" title="Probables">Prob.</th><th class="num" title="Ambiguas">Amb.</th><th class="num" title="Discrepancias">Disc.</th><th class="num" title="Sin atribución">Sin atr.</th></tr></thead><tbody>` +
            grupos.map(g => `<tr><td>${this._esc(g.clave)}</td><td class="num">${g.total}</td><td class="num">${g.confirmadas}</td><td class="num">${g.probables}</td><td class="num">${g.ambiguas}</td><td class="num">${g.discrepancias}</td><td class="num">${g.sinAtribucion}</td></tr>`).join("") +
            `</tbody></table>`;
    }

    _renderDeclarado(decl, total) {
        const el = document.getElementById("fevf-declarado"); if (!el) return;
        const orden = ["COINCIDE", "NO_COINCIDE", "NO_COMPARABLE", "EXTERNO", "SIN_DATO", "SIN_FPS"];
        el.innerHTML = `<table class="table fevf-tabla-mini"><thead><tr><th>Resultado</th><th class="num">PNC</th></tr></thead><tbody>` +
            orden.filter(k => decl[k]).map(k => `<tr><td>${this._esc(this._declTxt(k))}</td><td class="num">${decl[k]}</td></tr>`).join("") +
            `<tr><td><strong>Total</strong></td><td class="num"><strong>${total}</strong></td></tr></tbody></table>
            <div class="fevf-sub">"Distinto de FPS" no corrige ni reemplaza a la persona de FPS: solo indica que el texto escrito en la PNC no corresponde a quien registró la sesión.</div>`;
    }

    _click(e) {
        const t = e.target.closest("button"); if (!t || !t.closest(".fevf-module")) return;
        if (t.hasAttribute("data-fevf-cancelar")) {
            window.PhotinoBridge.send({ action: "faret.evaluacionOperadores.cancelar" }).catch(() => {});
            t.disabled = true; t.textContent = "Cancelando…";
        } else if (t.id === "fevf-actualizar") {
            this._cargar(true);
        } else if (t.id === "fevf-limpiar") {
            ["fevf-anio", "fevf-mes", "fevf-maquina", "fevf-area", "fevf-turno", "fevf-operador"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
            this._cargar();
        } else if (t.dataset.fevfTab) { this._tab = t.dataset.fevfTab; this._renderPnc(); }
        else if (t.dataset.fevfEv) this._toggleEvidencia(t.dataset.fevfEv);
        else if (t.dataset.fevfOp) this._detalleOperador(t.dataset.fevfOp);
        else if (t.hasAttribute("data-fevf-cerrar")) { const d = document.getElementById("fevf-detalle-op"); if (d) { d.style.display = "none"; d.dataset.clave = ""; } }
    }
};
