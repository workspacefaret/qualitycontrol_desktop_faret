// Lógica compartida de "Administración de planta" (INNPACK y Faret): operadores de máquina, inspectores, máquinas y
// áreas/procesos. Cada módulo solo aporta la empresa (static EMPRESA) y una vista vacía; la empresa efectiva la fija el
// backend según la sesión. Nunca se borra nada: se da de baja o se reactiva (el historial conserva el texto).
// Cargado una sola vez desde index.html.
window.AdminPlantaBase = (function () {
    const $ = (id) => document.getElementById(id);

    const esc = (v) =>
        String(v ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    // "2026-11-12T14:05:00.000Z" → "12-11-2026 14:05" (la API devuelve la hora local del servidor sin zona: se corta el texto).
    const fmtFecha = (v) => {
        const t = String(v || "");
        const p = t.substring(0, 10).split("-");
        return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]} ${t.substring(11, 16)}` : t;
    };

    // grupo = "agrupa por área/proceso"; codigo = columna de código visible.
    const entidades = (empresa) => {
        const faret = empresa === "FARET";
        const area = faret ? "Área" : "Proceso";
        return {
            operadores: { titulo: "Operadores de máquina", singular: "operador", grupo: area, nuevo: "Nuevo operador" },
            inspectores: { titulo: "Inspectores", singular: "inspector", grupo: null, codigo: faret ? null : "Código", nuevo: "Nuevo inspector" },
            maquinas: { titulo: "Máquinas", singular: "máquina", grupo: area, codigo: faret ? null : "Código QR", nuevo: "Nueva máquina" },
            areas: { titulo: faret ? "Áreas" : "Procesos", singular: faret ? "área" : "proceso", grupo: null, codigo: faret ? "Código" : null, nuevo: faret ? "Nueva área" : "Nuevo proceso" },
        };
    };

    return class AdminPlantaBase {
        constructor() {
            this.empresa = this.constructor.EMPRESA;
            this.def = entidades(this.empresa);
            this.tab = "operadores";
            this.datos = {}; // entidad -> filas ya cargadas
            this.areas = []; // áreas/procesos (selectores y etiquetas)
            this.filtros = { texto: "", grupoId: "", estado: "activos" };
            this.verTecnicas = false; // solo ADMIN_TI: incluye las cuentas técnicas (ocultas, de solo lectura) en Inspectores
            this.solicitud = 0; // descarta respuestas de una pestaña a la que el usuario ya no está mirando
        }

        init() {
            this.pintarEsqueleto();
            this.bindEventos();
            this.cambiarTab("operadores");
        }

        destroy() {
            this.cerrarModal();
        }

        // ---- Comunicación -------------------------------------------------------------------------------------
        async llamar(action, data) {
            const res = await window.PhotinoBridge.send({ action, data });
            return res && res.ok ? res : { ok: false, error: res?.error || "No se pudo completar la operación" };
        }

        // El listado de cuentas técnicas es solo para ADMIN_TI (la API lo vuelve a exigir: esto solo decide si se muestra el control).
        esAdminTI() {
            return this.empresa === "FARET"
                ? (sessionStorage.getItem("faretRol") || "").toUpperCase() === "ADMIN_TI"
                : (sessionStorage.getItem("rolUsuario") || "").toLowerCase() === "admin_ti";
        }

        async cargar(entidad) {
            const res = await this.llamar("adminPlanta.list", { entidad, incluirOcultos: entidad === "inspectores" && this.verTecnicas });
            if (res.ok) this.datos[entidad] = res.data || [];
            return res;
        }

        // ---- Esqueleto y eventos ------------------------------------------------------------------------------
        pintarEsqueleto() {
            const raiz = $("ap-raiz");
            raiz.innerHTML = `
                <div class="module-header">
                    <div>
                        <div class="module-title">Administración de planta</div>
                        <div class="subtitle">Operadores, inspectores, máquinas y ${esc(this.def.areas.titulo.toLowerCase())} de ${esc(this.empresa === "FARET" ? "Faret" : "INNPACK")}. Los cambios quedan auditados y llegan a la app móvil de inspecciones.</div>
                    </div>
                    <div class="module-actions">
                        <button class="btn-primary" id="ap-nuevo-btn" data-requiere-editar></button>
                    </div>
                </div>

                <div class="ap-tabs" role="tablist">
                    ${Object.entries(this.def)
                        .map(([k, d]) => `<button class="ap-tab" role="tab" data-tab="${k}">${esc(d.titulo)}</button>`)
                        .join("")}
                    <button class="ap-tab ap-tab-historial" role="tab" data-tab="historial">Historial de cambios</button>
                </div>

                <div id="ap-contenido"></div>
                <div id="ap-modal-root"></div>`;
        }

        bindEventos() {
            const raiz = $("ap-raiz");
            raiz.addEventListener("click", (e) => {
                const tab = e.target.closest("[data-tab]");
                if (tab) return this.cambiarTab(tab.dataset.tab);
                if (e.target.closest("#ap-nuevo-btn")) return this.abrirModal(null);
                const acc = e.target.closest("[data-acc]");
                if (acc) {
                    const fila = (this.datos[this.tab] || []).find((f) => String(f.id) === acc.dataset.id);
                    if (!fila) return;
                    if (acc.dataset.acc === "editar") this.abrirModal(fila);
                    else this.alternarEstado(fila);
                }
            });
            raiz.addEventListener("input", (e) => {
                if (e.target.id === "ap-f-texto") {
                    this.filtros.texto = e.target.value;
                    this.pintarTabla();
                }
            });
            raiz.addEventListener("change", (e) => {
                if (e.target.id === "ap-f-tecnicas") {
                    this.verTecnicas = e.target.checked;
                    return this.cambiarTab(this.tab);
                }
                if (e.target.id === "ap-f-grupo") this.filtros.grupoId = e.target.value;
                else if (e.target.id === "ap-f-estado") this.filtros.estado = e.target.value;
                else return;
                this.pintarTabla();
            });
        }

        // ---- Pestañas -----------------------------------------------------------------------------------------
        async cambiarTab(tab) {
            this.tab = tab;
            const solicitud = ++this.solicitud;
            this.filtros = { texto: "", grupoId: "", estado: "activos" };

            document.querySelectorAll(".ap-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
            const nuevo = $("ap-nuevo-btn");
            nuevo.style.display = tab === "historial" ? "none" : "";
            if (tab !== "historial") nuevo.textContent = `+ ${this.def[tab].nuevo}`;

            $("ap-contenido").innerHTML = `<div class="card ap-estado">Cargando...</div>`;

            const pedidos = tab === "historial" ? [this.cargarHistorial()] : [this.cargar(tab), this.cargar("areas")];
            const resultados = await Promise.all(pedidos);
            if (solicitud !== this.solicitud) return;

            const fallo = resultados.find((r) => !r.ok);
            if (fallo) {
                $("ap-contenido").innerHTML = `<div class="card ap-estado ap-error">${esc(fallo.error)}</div>`;
                return;
            }
            if (tab === "historial") return this.pintarHistorial(resultados[0].data || []);

            this.areas = this.datos.areas || [];
            this.pintarListado();
        }

        // ---- Listado ------------------------------------------------------------------------------------------
        etiquetaGrupo(fila) {
            const a = this.areas.find((x) => String(x.id) === String(fila.grupoId));
            return a ? a.nombre : fila.grupo || "-";
        }

        pintarListado() {
            const d = this.def[this.tab];
            const filas = this.datos[this.tab] || [];
            const activos = filas.filter((f) => f.activo).length;

            const opcionesGrupo = d.grupo
                ? `<div class="ap-campo"><label for="ap-f-grupo">${esc(d.grupo)}</label>
                       <select id="ap-f-grupo"><option value="">Todas</option>${this.areas
                           .filter((a) => a.activo)
                           .map((a) => `<option value="${esc(a.id)}">${esc(a.nombre)}</option>`)
                           .join("")}</select></div>`
                : "";

            $("ap-contenido").innerHTML = `
                <div class="kpi-row ap-kpis">
                    <div class="kpi-card"><div class="kpi-label">Total</div><div class="kpi-value">${filas.length}</div></div>
                    <div class="kpi-card"><div class="kpi-label">Activos</div><div class="kpi-value ap-kpi-ok">${activos}</div></div>
                    <div class="kpi-card"><div class="kpi-label">De baja</div><div class="kpi-value ap-kpi-baja">${filas.length - activos}</div></div>
                </div>
                <div class="card">
                    <div class="ap-filtros">
                        <div class="ap-campo ap-campo-texto"><label for="ap-f-texto">Buscar</label>
                            <input type="text" id="ap-f-texto" placeholder="Nombre${d.codigo ? " o " + esc(d.codigo.toLowerCase()) : ""}" autocomplete="off"></div>
                        ${opcionesGrupo}
                        <div class="ap-campo"><label for="ap-f-estado">Estado</label>
                            <select id="ap-f-estado"><option value="activos">Activos</option><option value="baja">De baja</option><option value="todos">Todos</option></select></div>
                        ${this.tab === "inspectores" && this.esAdminTI()
                            ? `<div class="ap-campo"><label for="ap-f-tecnicas">Cuentas técnicas</label>
                                   <label class="ap-check"><input type="checkbox" id="ap-f-tecnicas" ${this.verTecnicas ? "checked" : ""}> Mostrar (solo lectura)</label></div>`
                            : ""}
                    </div>
                    <div class="table-container ap-tabla">
                        <table class="table">
                            <thead><tr>
                                <th>Nombre</th>${d.grupo ? `<th>${esc(d.grupo)}</th>` : ""}${d.codigo ? `<th>${esc(d.codigo)}</th>` : ""}<th>Estado</th><th class="ap-col-acc">Acciones</th>
                            </tr></thead>
                            <tbody id="ap-tbody"></tbody>
                        </table>
                    </div>
                    <div class="ap-pie" id="ap-pie"></div>
                </div>`;
            this.pintarTabla();
        }

        filtrar() {
            const { texto, grupoId, estado } = this.filtros;
            const q = texto.trim().toLocaleLowerCase("es");
            return (this.datos[this.tab] || []).filter(
                (f) =>
                    (estado === "todos" || (estado === "activos") === !!f.activo) &&
                    (!grupoId || String(f.grupoId) === grupoId) &&
                    (!q || `${f.nombre} ${f.codigo || ""}`.toLocaleLowerCase("es").includes(q))
            );
        }

        pintarTabla() {
            const d = this.def[this.tab];
            const filas = this.filtrar();
            const cols = 3 + (d.grupo ? 1 : 0) + (d.codigo ? 1 : 0);

            $("ap-tbody").innerHTML = filas.length
                ? filas
                      .map(
                          (f) => `<tr class="${f.activo ? "" : "ap-fila-baja"}">
                    <td><strong>${esc(f.nombre)}</strong></td>
                    ${d.grupo ? `<td>${esc(this.etiquetaGrupo(f))}</td>` : ""}
                    ${d.codigo ? `<td><code>${esc(f.codigo || "-")}</code></td>` : ""}
                    <td><span class="ap-pill ${f.oculto ? "ap-pill-baja" : f.activo ? "ap-pill-ok" : "ap-pill-baja"}">${f.oculto ? "Cuenta técnica" : f.activo ? "Activo" : "De baja"}</span></td>
                    <td class="ap-col-acc">${f.oculto
                        ? `<span class="ap-vacio">Protegida</span>`
                        : `<button class="btn-secondary ap-btn" data-acc="editar" data-id="${esc(f.id)}" data-requiere-editar>Editar</button>
                        <button class="ap-btn ${f.activo ? "btn-danger" : "btn-secondary"}" data-acc="estado" data-id="${esc(f.id)}" data-requiere-editar>${f.activo ? "Dar de baja" : "Reactivar"}</button>`}
                    </td></tr>`
                      )
                      .join("")
                : `<tr><td colspan="${cols}" class="ap-vacio">Sin resultados para los filtros actuales.</td></tr>`;
            $("ap-pie").textContent = `${filas.length} de ${(this.datos[this.tab] || []).length} registro(s)`;
        }

        // ---- Alta / edición -----------------------------------------------------------------------------------
        abrirModal(fila) {
            const d = this.def[this.tab];
            const esFaretArea = this.empresa === "FARET" && this.tab === "areas";
            const grupos = this.areas.filter((a) => a.activo || (fila && String(a.id) === String(fila.grupoId)));

            $("ap-modal-root").innerHTML = `
                <div class="ap-modal-overlay" id="ap-overlay">
                    <div class="ap-modal" role="dialog" aria-modal="true" aria-labelledby="ap-modal-titulo">
                        <h3 id="ap-modal-titulo">${fila ? `Editar ${esc(d.singular)}` : esc(d.nuevo)}</h3>
                        <div class="ap-campo"><label for="ap-m-nombre">Nombre</label>
                            <input type="text" id="ap-m-nombre" maxlength="150" value="${esc(fila?.nombre || "")}" autocomplete="off"></div>
                        ${d.grupo ? `<div class="ap-campo"><label for="ap-m-grupo">${esc(d.grupo)}</label>
                            <select id="ap-m-grupo"><option value="">Seleccionar...</option>${grupos
                                .map((a) => `<option value="${esc(a.id)}" ${fila && String(a.id) === String(fila.grupoId) ? "selected" : ""}>${esc(a.nombre)}</option>`)
                                .join("")}</select></div>` : ""}
                        ${esFaretArea && !fila ? `<div class="ap-campo"><label for="ap-m-codigo">Código del área (3 letras)</label>
                            <input type="text" id="ap-m-codigo" maxlength="3" placeholder="Ej: LAM" autocomplete="off"></div>` : ""}
                        ${this.empresa === "INNPACK" && this.tab === "maquinas" && !fila ? `<div class="ap-campo"><label for="ap-m-codigo">Código QR (opcional)</label>
                            <input type="text" id="ap-m-codigo" maxlength="100" placeholder="Se genera automáticamente" autocomplete="off"></div>` : ""}
                        ${fila && d.codigo ? `<div class="ap-campo"><label>${esc(d.codigo)}</label><div class="ap-solo-lectura"><code>${esc(fila.codigo || "-")}</code></div></div>` : ""}
                        <div class="ap-nota">${fila
                            ? "El cambio de nombre no modifica los registros históricos ya guardados."
                            : "Quedará activo y disponible en la app móvil."}</div>
                        <div class="ap-error-form" id="ap-m-error" hidden></div>
                        <div class="ap-modal-acciones">
                            <button class="btn-secondary" id="ap-m-cancelar">Cancelar</button>
                            <button class="btn-primary" id="ap-m-guardar">Guardar</button>
                        </div>
                    </div>
                </div>`;

            $("ap-m-cancelar").addEventListener("click", () => this.cerrarModal());
            $("ap-overlay").addEventListener("mousedown", (e) => e.target.id === "ap-overlay" && this.cerrarModal());
            $("ap-m-guardar").addEventListener("click", () => this.guardar(fila));
            $("ap-modal-root").addEventListener("keydown", (e) => {
                if (e.key === "Escape") this.cerrarModal();
                else if (e.key === "Enter" && e.target.tagName === "INPUT") this.guardar(fila);
            });
            $("ap-m-nombre").focus();
        }

        cerrarModal() {
            const raiz = $("ap-modal-root");
            if (raiz) raiz.innerHTML = "";
        }

        async guardar(fila) {
            const d = this.def[this.tab];
            const error = $("ap-m-error");
            const boton = $("ap-m-guardar");
            const nombre = $("ap-m-nombre").value.trim();
            const grupoId = $("ap-m-grupo")?.value || "";
            const codigo = $("ap-m-codigo")?.value.trim() || "";

            const falta = !nombre ? "El nombre es obligatorio" : d.grupo && !grupoId ? `Selecciona ${d.grupo.toLowerCase() === "área" ? "un área" : "un proceso"}` : null;
            if (falta) {
                error.textContent = falta;
                error.hidden = false;
                return;
            }

            const cuerpo = { entidad: this.tab, nombre };
            if (d.grupo) cuerpo.grupoId = this.empresa === "FARET" ? grupoId : Number(grupoId);
            if (!fila && codigo) cuerpo.codigo = codigo;

            boton.disabled = true;
            const res = fila
                ? await this.llamar("adminPlanta.actualizar", { ...cuerpo, id: fila.id })
                : await this.llamar("adminPlanta.crear", cuerpo);
            boton.disabled = false;

            if (!res.ok) {
                error.textContent = res.error;
                error.hidden = false;
                return;
            }
            this.cerrarModal();
            await this.refrescar();
        }

        async alternarEstado(fila) {
            const d = this.def[this.tab];
            const baja = !!fila.activo;
            const ok = confirm(
                baja
                    ? `¿Dar de baja ${d.singular === "área" || d.singular === "máquina" ? "la" : "al"} ${d.singular} "${fila.nombre}"?\n\nDejará de aparecer en la app móvil. Los registros históricos no cambian y puede reactivarse cuando quiera.`
                    : `¿Reactivar "${fila.nombre}"?\n\nVolverá a aparecer en la app móvil.`
            );
            if (!ok) return;

            const res = await this.llamar("adminPlanta.actualizar", { entidad: this.tab, id: fila.id, activo: !baja });
            if (!res.ok) {
                alert(res.error);
                return;
            }
            await this.refrescar();
        }

        // Recarga la pestaña actual conservando filtros y posición de la tabla.
        async refrescar() {
            await this.cargar(this.tab);
            if (this.tab === "areas") this.areas = this.datos.areas;
            const filtros = this.filtros;
            const contenedor = document.querySelector(".ap-tabla");
            const scroll = contenedor?.scrollTop || 0;
            this.pintarListado();
            this.filtros = filtros;
            $("ap-f-texto").value = filtros.texto;
            if ($("ap-f-grupo")) $("ap-f-grupo").value = filtros.grupoId;
            $("ap-f-estado").value = filtros.estado;
            this.pintarTabla();
            const nuevo = document.querySelector(".ap-tabla");
            if (nuevo) nuevo.scrollTop = scroll;
        }

        // ---- Historial ----------------------------------------------------------------------------------------
        cargarHistorial() {
            return this.llamar("adminPlanta.auditoria.list", {});
        }

        pintarHistorial(filas) {
            const nombreEntidad = (k) => this.def[k]?.titulo || k;
            $("ap-contenido").innerHTML = `
                <div class="card">
                    <div class="table-container ap-tabla">
                        <table class="table">
                            <thead><tr><th>Fecha</th><th>Sección</th><th>Registro</th><th>Acción</th><th>Campo</th><th>Antes</th><th>Después</th><th>Usuario</th></tr></thead>
                            <tbody>${filas.length
                                ? filas
                                      .map(
                                          (f) => `<tr><td>${esc(fmtFecha(f.fecha))}</td><td>${esc(nombreEntidad(f.entidad))}</td>
                                <td><strong>${esc(f.registro || f.clave)}</strong></td><td>${f.accion === "CREAR" ? "Alta" : "Modificación"}</td>
                                <td>${esc(f.campo)}</td><td>${esc(f.anterior ?? "-")}</td><td>${esc(f.nuevo ?? "-")}</td><td>${esc(f.usuario)}</td></tr>`
                                      )
                                      .join("")
                                : `<tr><td colspan="8" class="ap-vacio">Aún no hay cambios registrados.</td></tr>`}</tbody>
                        </table>
                    </div>
                    <div class="ap-pie">Últimos ${filas.length} cambio(s).</div>
                </div>`;
        }
    };
})();
