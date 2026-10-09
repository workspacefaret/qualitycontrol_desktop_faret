// Lógica compartida de los módulos "Formularios" (INNPACK) y "Faret - Formularios": mismos datos
// (formularios de LogisticControlCenter vía api/formularios), solo lectura. Cada módulo solo aporta
// su vista y un controlador que apunta a esta clase. Cargado una sola vez desde index.html.
window.FormulariosBase = (function () {
    const esc = (v) =>
        String(v ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    // "2026-10-05T18:59:21" → "05-10-2026 18:59" (sin zona horaria: se corta el texto, no se parsea).
    const fmtFecha = (valor) => {
        if (!valor) return "-";
        const texto = String(valor).trim();
        const partes = texto.substring(0, 10).split("-");
        if (partes.length !== 3) return texto;
        const dia = `${partes[2]}-${partes[1]}-${partes[0]}`;
        return texto.length >= 16 ? `${dia} ${texto.substring(11, 16)}` : dia;
    };

    const siNo = (v) => (v ? "SI" : "NO");

    const pill = (texto, fondo, color) =>
        `<span style="padding:4px 8px;border-radius:999px;font-size:12px;background:${fondo};color:${color};font-weight:700;">${esc(texto)}</span>`;

    const celdaNc = (n) =>
        Number(n || 0) > 0 ? pill(n, "#FEE2E2", "#991B1B") : pill(n || 0, "#DCFCE7", "#166534");

    // Por tipo de formulario: columnas (v = texto para pantalla y Excel, html = formato opcional en
    // pantalla), campo de NC, si tiene detalle y qué filtros aplican.
    const TIPOS = {
        inspeccionesVehiculares: {
            unidad: "inspección(es)",
            filtros: ["patente", "conductor", "estado"],
            detalle: true,
            nc: (i) => i.totalNoCumple,
            fecha: (i) => i.creadoEn ?? i.fechaInspeccion,
            columnas: [
                { t: "ID", v: (i) => i.id },
                { t: "Fecha", v: (i) => fmtFecha(i.creadoEn ?? i.fechaInspeccion) },
                { t: "Patente", v: (i) => i.patente, html: (i) => `<strong>${esc(i.patente || "-")}</strong>` },
                { t: "Conductor", v: (i) => i.conductor },
                { t: "Responsable", v: (i) => i.responsable },
                { t: "Estado", v: (i) => i.estado, html: (i) => pill(i.estado || "-", "#E0F2FE", "#075985") },
                { t: "Ítems", v: (i) => i.totalItems },
                { t: "NC", v: (i) => i.totalNoCumple, html: (i) => celdaNc(i.totalNoCumple) },
            ],
        },
        revisionCamionJornada: {
            unidad: "revisión(es)",
            filtros: ["patente", "conductor"],
            detalle: false,
            nc: () => 0,
            columnas: [
                { t: "ID", v: (i) => i.id },
                { t: "Fecha", v: (i) => fmtFecha(i.creadoEn) },
                { t: "Patente", v: (i) => i.patentes, html: (i) => `<strong>${esc(i.patentes || "-")}</strong>` },
                { t: "Conductor", v: (i) => i.conductor },
                { t: "Llaves", v: (i) => i.llavesPorteria },
                { t: "Vehículo cerrado", v: (i) => i.camionCerrado },
                { t: "Comentario", v: (i) => i.comentario },
            ],
        },
        checklistBodegaCajas: {
            unidad: "checklist(s)",
            filtros: ["responsable"],
            detalle: true,
            nc: (i) => i.totalNc,
            columnas: [
                { t: "ID", v: (i) => i.id },
                { t: "Fecha", v: (i) => fmtFecha(i.creadoEn) },
                { t: "Responsable", v: (i) => i.revisadoPor },
                { t: "Estado calles", v: (i) => i.estadoCalles },
                { t: "Ítems", v: (i) => i.totalItems },
                { t: "NC", v: (i) => i.totalNc, html: (i) => celdaNc(i.totalNc) },
                { t: "Observaciones", v: (i) => i.observaciones },
                { t: "Ticket SG", v: (i) => siNo(i.requiereTicketSg) },
            ],
        },
        revisionBodegaOficinas: {
            unidad: "revisión(es)",
            filtros: ["responsable"],
            detalle: true,
            nc: (i) => i.totalNc,
            columnas: [
                { t: "ID", v: (i) => i.id },
                { t: "Fecha", v: (i) => fmtFecha(i.creadoEn) },
                { t: "Responsable", v: (i) => i.revisadoPor },
                { t: "Ítems", v: (i) => i.totalItems },
                { t: "NC", v: (i) => i.totalNc, html: (i) => celdaNc(i.totalNc) },
                { t: "Obs. Pasillos", v: (i) => i.observacionesPasillos },
                { t: "Obs. Bodega", v: (i) => i.observacionesBodega },
                { t: "Obs. Oficinas", v: (i) => i.observacionesOficinas },
                { t: "Obs. Exterior", v: (i) => i.observacionesExterior },
                { t: "Ticket SG", v: (i) => siNo(i.enviarTicketSg) },
            ],
        },
    };

    // Detalle: las 3 tablas de detalle se muestran con las mismas 4 columnas que en LogisticControlCenter.
    const DETALLE = {
        inspeccionesVehiculares: (d) => ({ n: d.itemNumero, desc: d.descripcion, res: d.cumple, obs: d.observacion }),
        checklistBodegaCajas: (d, idx) => ({ n: idx + 1, desc: d.item, res: d.respuesta, obs: d.ubicacion }),
        revisionBodegaOficinas: (d, idx) => ({ n: idx + 1, desc: d.item, res: d.respuesta, obs: "" }),
    };

    const LOCALE_ES = {
        firstDayOfWeek: 1,
        weekdays: {
            shorthand: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
            longhand: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
        },
        months: {
            shorthand: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
            longhand: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"],
        },
    };

    const $ = (id) => document.getElementById(id);

    return class FormulariosBase {
        constructor() {
            this.items = [];
            this.seleccionado = null;
            this.fpDesde = null;
            this.fpHasta = null;
            this.solicitud = 0; // descarta respuestas de una búsqueda vieja si el usuario ya cambió de tipo
        }

        init() {
            this.iniciarCalendarios();
            this.bindEventos();
            this.actualizarFiltros();
            this.buscar();
        }

        destroy() {
            this.fpDesde?.destroy();
            this.fpHasta?.destroy();
        }

        get tipo() {
            return $("fm-tipo")?.value || "inspeccionesVehiculares";
        }

        iniciarCalendarios() {
            if (typeof flatpickr === "undefined") return;

            const opciones = { dateFormat: "Y-m-d", altInput: true, altFormat: "d-m-Y", allowInput: true, locale: LOCALE_ES };
            this.fpDesde = flatpickr("#fm-fecha-desde", opciones);
            this.fpHasta = flatpickr("#fm-fecha-hasta", opciones);
        }

        bindEventos() {
            $("fm-buscar-btn")?.addEventListener("click", () => this.buscar());
            $("fm-limpiar-btn")?.addEventListener("click", () => this.limpiarFiltros());
            $("fm-exportar-btn")?.addEventListener("click", () => this.exportar());
            $("fm-abrir-pdf-btn")?.addEventListener("click", () => this.abrirPdf(this.seleccionado?.pdfUrl));

            $("fm-tipo")?.addEventListener("change", () => {
                this.ocultarDetalle();
                this.actualizarFiltros();
                this.buscar();
            });

            // Un solo listener para los botones de cada fila (Ver / PDF / Eliminar).
            $("fm-tbody")?.addEventListener("click", (e) => {
                const btn = e.target.closest("button[data-accion]");
                if (!btn) return;
                const item = this.items.find((x) => Number(x.id) === Number(btn.dataset.id));
                if (!item) return;
                if (btn.dataset.accion === "ver") this.verDetalle(item);
                else if (btn.dataset.accion === "eliminar") this.eliminar(item);
                else this.abrirPdf(item.pdfUrl);
            });

            document.querySelector(".formularios-module")?.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    this.buscar();
                }
            });
        }

        // Muestra solo los filtros que el tipo de formulario realmente usa.
        actualizarFiltros() {
            const aplican = TIPOS[this.tipo].filtros;
            document.querySelectorAll("[data-filtro]").forEach((el) => {
                el.style.display = aplican.includes(el.dataset.filtro) ? "" : "none";
            });
        }

        fechaIso(fp) {
            return fp?.selectedDates?.length ? fp.formatDate(fp.selectedDates[0], "Y-m-d") : "";
        }

        valor(id) {
            return $(id)?.value || "";
        }

        async buscar() {
            const tipo = this.tipo;
            const solicitud = ++this.solicitud;

            this.mensajeTabla("Cargando...");
            this.ocultarDetalle();

            const res = await window.PhotinoBridge.send({
                action: "formularios.list",
                data: {
                    tipo,
                    fechaDesde: this.fechaIso(this.fpDesde),
                    fechaHasta: this.fechaIso(this.fpHasta),
                    patente: this.valor("fm-patente"),
                    conductor: this.valor("fm-conductor"),
                    responsable: this.valor("fm-responsable"),
                    estado: this.valor("fm-estado"),
                },
            });

            if (solicitud !== this.solicitud) return;

            if (!res || !res.ok) {
                this.items = [];
                this.mensajeTabla(res?.error || "Error cargando formularios", true);
                return;
            }

            this.items = (res.data || []).slice().sort((a, b) => Number(b.id) - Number(a.id));
            this.renderTabla(tipo);
        }

        renderTabla(tipo) {
            const def = TIPOS[tipo];
            const info = $("fm-info");

            $("fm-thead").innerHTML =
                "<tr>" + def.columnas.map((c) => `<th>${esc(c.t)}</th>`).join("") + "<th>PDF</th><th>Acción</th></tr>";

            if (!this.items.length) {
                this.mensajeTabla("No se encontraron registros");
                return;
            }

            $("fm-tbody").innerHTML = this.items
                .map((item) => {
                    const tieneNc = Number(def.nc(item) || 0) > 0;
                    const celdas = def.columnas
                        .map((c) => `<td>${c.html ? c.html(item) : esc(c.v(item) || "-")}</td>`)
                        .join("");

                    return `<tr style="${tieneNc ? "background:#FEF2F2;" : ""}">
                        ${celdas}
                        <td>${item.pdfUrl ? '<i class="bi bi-check-circle"></i>' : "—"}</td>
                        <td>
                            ${def.detalle ? `<button class="btn-primary" style="padding:6px 10px;" data-accion="ver" data-id="${esc(item.id)}">Ver</button>` : ""}
                            ${item.pdfUrl ? `<button class="btn-secondary" style="padding:6px 10px;margin-left:4px;" data-accion="pdf" data-id="${esc(item.id)}">PDF</button>` : ""}
                            <button class="btn-danger" style="padding:6px 10px;margin-left:4px;" data-requiere-editar data-accion="eliminar" data-id="${esc(item.id)}" title="Eliminar este registro definitivamente">Eliminar</button>
                        </td>
                    </tr>`;
                })
                .join("");

            if (info) info.textContent = `${this.items.length} ${def.unidad} cargado(s)`;
        }

        mensajeTabla(texto, esError = false) {
            const def = TIPOS[this.tipo];
            const info = $("fm-info");

            $("fm-thead").innerHTML =
                "<tr>" + def.columnas.map((c) => `<th>${esc(c.t)}</th>`).join("") + "<th>PDF</th><th>Acción</th></tr>";
            $("fm-tbody").innerHTML = `<tr><td colspan="${def.columnas.length + 2}" style="text-align:center;padding:20px;color:${esError ? "#991B1B" : "#64748B"};">${esc(texto)}</td></tr>`;
            if (info) info.textContent = texto;
        }

        async verDetalle(item) {
            const tipo = this.tipo;
            this.seleccionado = item;

            $("fm-detalle-card").style.display = "block";
            $("fm-detalle-titulo").textContent =
                `ID ${item.id} · ${item.responsable || item.revisadoPor || item.conductor || "-"} · ${fmtFecha(TIPOS[tipo].fecha ? TIPOS[tipo].fecha(item) : item.creadoEn)}`;
            $("fm-abrir-pdf-btn").style.display = item.pdfUrl ? "" : "none";
            this.mensajeDetalle("Cargando detalle...");

            const res = await window.PhotinoBridge.send({
                action: "formularios.detalle",
                data: { tipo, id: item.id },
            });

            if (this.seleccionado !== item) return;

            if (!res || !res.ok) {
                this.mensajeDetalle(res?.error || "Error cargando detalle", true);
                return;
            }

            const filas = (res.data || []).map((d, idx) => DETALLE[tipo](d, idx));
            if (!filas.length) {
                this.mensajeDetalle("Sin detalle disponible");
                return;
            }

            $("fm-detalle-tbody").innerHTML = filas
                .map((f) => {
                    const esNc = String(f.res || "").toUpperCase() === "NC";
                    return `<tr style="${esNc ? "background:#FEF2F2;" : ""}">
                        <td><strong>${esc(f.n)}</strong></td>
                        <td>${esc(f.desc || "-")}</td>
                        <td>${pill(f.res || "-", esNc ? "#FEE2E2" : "#DCFCE7", esNc ? "#991B1B" : "#166534")}</td>
                        <td>${esc(f.obs || "-")}</td>
                    </tr>`;
                })
                .join("");
        }

        mensajeDetalle(texto, esError = false) {
            $("fm-detalle-tbody").innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:${esError ? "#991B1B" : "#64748B"};">${esc(texto)}</td></tr>`;
        }

        ocultarDetalle() {
            this.seleccionado = null;
            const card = $("fm-detalle-card");
            if (card) card.style.display = "none";
        }

        limpiarFiltros() {
            this.fpDesde?.clear();
            this.fpHasta?.clear();
            ["fm-patente", "fm-conductor", "fm-responsable", "fm-estado"].forEach((id) => {
                const el = $(id);
                if (el) el.value = "";
            });
            this.buscar();
        }

        // Borrado físico: pide confirmación y recarga la lista conservando el scroll.
        async eliminar(item) {
            const def = TIPOS[this.tipo];
            const ok = confirm(
                `¿Eliminar definitivamente el registro #${item.id} (${def.unidad})?\n\n` +
                    "Se borra el registro y su detalle. No se puede deshacer.\n" +
                    "El PDF ya generado queda en el servidor web."
            );
            if (!ok) return;

            const res = await window.PhotinoBridge.send({
                action: "formularios.eliminar",
                data: { tipo: this.tipo, id: item.id },
            });

            if (!res || !res.ok) {
                alert(res?.error || "No se pudo eliminar el registro");
                return;
            }

            const contenedor = $("fm-tbody")?.closest(".table-container");
            await window.TableUtils.preservarScroll(contenedor, () => this.buscar());
        }

        async abrirPdf(url) {
            if (!url) {
                alert("Este registro no tiene PDF asociado");
                return;
            }

            const res = await window.PhotinoBridge.send({ action: "formularios.abrirPdf", data: { url } });
            if (!res || !res.ok) alert(res?.error || "No se pudo abrir el PDF");
        }

        // Exporta lo listado (hasta 300 registros, el tope de la API) con las columnas del tipo + URL del PDF.
        exportar() {
            if (!this.items.length) {
                alert("No hay datos para exportar");
                return;
            }

            const tipo = this.tipo;
            const def = TIPOS[tipo];

            const tabla = document.createElement("table");
            tabla.id = "fm-tabla-export-temp";
            tabla.style.position = "absolute";
            tabla.style.left = "-99999px";
            tabla.style.top = "0";
            tabla.innerHTML =
                "<thead><tr>" + def.columnas.map((c) => `<th>${esc(c.t)}</th>`).join("") + "<th>PDF</th></tr></thead><tbody>" +
                this.items
                    .map((item) => "<tr>" + def.columnas.map((c) => `<td>${esc(c.v(item) ?? "")}</td>`).join("") + `<td>${esc(item.pdfUrl || "")}</td></tr>`)
                    .join("") +
                "</tbody>";
            document.body.appendChild(tabla);

            try {
                window.ExcelExporter.exportTable({
                    tableSelector: "#fm-tabla-export-temp",
                    fileName: `formularios_${tipo}_${Date.now()}.xlsx`,
                    sheetName: "Formularios",
                    title: `QCC - Formularios: ${$("fm-tipo")?.selectedOptions[0]?.textContent.trim() || tipo}`,
                });
            } finally {
                tabla.remove();
            }
        }
    };
})();
