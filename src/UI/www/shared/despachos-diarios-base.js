// Lógica compartida de los módulos "Despachos Diarios" (INNPACK) y "Faret - Despachos Diarios": mismos
// datos (cantidad liberada según el Certificado de Terminaciones y Calidad del Producto, vía
// api/despachos-diarios), solo lectura. Cada módulo solo aporta su vista y un controlador que apunta a
// esta clase. Cargado una sola vez desde index.html.
window.DespachosDiariosBase = (function () {
    const esc = (v) =>
        String(v ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    const nf = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
    const num = (v) => nf.format(Number(v) || 0);

    // "2026-10-05T18:59:21" → "05-10-2026 18:59" (sin zona horaria: se corta el texto, no se parsea).
    const fmtFecha = (valor) => {
        if (!valor) return "-";
        const texto = String(valor).trim();
        const partes = texto.substring(0, 10).split("-");
        if (partes.length !== 3) return texto;
        const dia = `${partes[2]}-${partes[1]}-${partes[0]}`;
        return texto.length >= 16 ? `${dia} ${texto.substring(11, 16)}` : dia;
    };

    const fmtDia = (iso) => (iso ? fmtFecha(iso) : "");

    // Fecha local (no UTC) en YYYY-MM-DD, con n días de desplazamiento.
    const isoLocal = (diasAtras = 0) => {
        const d = new Date();
        d.setDate(d.getDate() - diasAtras);
        const p = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };

    // Destino del lote liberado: solo LIBERADO (bodega Productos Terminados) cuenta como despachable.
    const DESTINOS = {
        LIBERADO: { texto: "Liberado", fondo: "#DCFCE7", color: "#166534" },
        CUARENTENA: { texto: "Cuarentena", fondo: "#FEF3C7", color: "#92400E" },
        DESTRUCCION: { texto: "Destrucción", fondo: "#FEE2E2", color: "#991B1B" },
        OTRO: { texto: "Otro", fondo: "#E2E8F0", color: "#334155" },
    };

    const pill = (destino) => {
        const d = DESTINOS[destino] || DESTINOS.OTRO;
        return `<span style="padding:4px 8px;border-radius:999px;font-size:12px;background:${d.fondo};color:${d.color};font-weight:700;">${esc(d.texto)}</span>`;
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

    const sumar = (filas) =>
        filas.reduce(
            (a, r) => ({
                folios: a.folios + Number(r.folios || 0),
                unidades: a.unidades + Number(r.unidades || 0),
                pallets: a.pallets + Number(r.pallets || 0),
                unidadesEnPallet: a.unidadesEnPallet + Number(r.unidadesEnPallet || 0),
                bultosOtros: a.bultosOtros + Number(r.bultosOtros || 0),
            }),
            { folios: 0, unidades: 0, pallets: 0, unidadesEnPallet: 0, bultosOtros: 0 }
        );

    // Columnas de la tabla (v = valor crudo para Excel, html = formato opcional en pantalla).
    const COLUMNAS = [
        { t: "Fecha liberación", v: (i) => fmtFecha(i.fechaLiberacion) },
        { t: "Folio", v: (i) => i.folio },
        { t: "Empresa", v: (i) => i.empresa },
        { t: "NP", v: (i) => i.np },
        { t: "Cliente", v: (i) => i.cliente },
        { t: "Código", v: (i) => i.codigoArticulo },
        { t: "Descripción", v: (i) => i.descripcionArticulo },
        { t: "Destino", v: (i) => (DESTINOS[i.destino] || DESTINOS.OTRO).texto, html: (i) => pill(i.destino) },
        { t: "Embalaje", v: (i) => i.tipoEmbalaje },
        { t: "Pallets", v: (i) => (i.esPallet ? i.cantBultos : ""), html: (i) => (i.esPallet ? `<strong>${num(i.cantBultos)}</strong>` : "-") },
        { t: "Otros bultos", v: (i) => (i.esPallet ? "" : i.cantBultos), html: (i) => (i.esPallet ? "-" : num(i.cantBultos)) },
        { t: "Un. por bulto", v: (i) => i.unidPorBulto, html: (i) => num(i.unidPorBulto) },
        { t: "Saldo", v: (i) => i.saldo, html: (i) => num(i.saldo) },
        { t: "Unidades liberadas", v: (i) => i.cantidadLiberada, html: (i) => `<strong>${num(i.cantidadLiberada)}</strong>` },
    ];

    // Resumen diario: una fila por día (00:00 a 24:00), solo lo liberado; lo no liberado va informativo.
    const textoEmpresas = (d) => d.porEmpresa.map((x) => `${x.e}: ${num(x.s.pallets)} pallets · ${num(x.s.unidades)} un.`).join(" | ");
    const textoFuera = (d) => (d.fuera.folios ? `${num(d.fuera.folios)} cert. · ${num(d.fuera.unidades)} un.` : "-");
    const COLUMNAS_DIARIO = [
        { t: "Fecha", v: (d) => fmtDia(d.fecha), html: (d) => `<strong>${esc(fmtDia(d.fecha))}</strong>` },
        { t: "Pallets liberados", v: (d) => d.lib.pallets, html: (d) => `<strong>${num(d.lib.pallets)}</strong>` },
        { t: "Unidades liberadas", v: (d) => d.lib.unidades, html: (d) => `<strong>${num(d.lib.unidades)}</strong>` },
        { t: "Certificados", v: (d) => d.lib.folios, html: (d) => num(d.lib.folios) },
        { t: "Detalle por empresa", v: (d) => textoEmpresas(d) },
        { t: "No liberado (informativo)", v: (d) => textoFuera(d) },
    ];

    // Días por página en el resumen diario.
    const DIAS_POR_PAGINA = 15;

    const $ = (id) => document.getElementById(id);

    return class DespachosDiariosBase {
        constructor() {
            this.resumen = [];
            this.detalle = [];
            this.resumenDiario = [];
            this.paginaDiaria = 1;
            this.hoy = null; // último dato bueno de "Liberado hoy": { filas, hora }
            this.solicitudHoy = 0;
            this.fpDesde = null;
            this.fpHasta = null;
            this.solicitud = 0; // descarta respuestas de una búsqueda vieja si el usuario ya cambió el rango
        }

        init() {
            this.iniciarCalendarios();
            this.bindEventos();
            this.cargarHoy();
            this.ultimoMes();
        }

        destroy() {
            this.fpDesde?.destroy();
            this.fpHasta?.destroy();
        }

        iniciarCalendarios() {
            if (typeof flatpickr === "undefined") return;

            const opciones = { dateFormat: "Y-m-d", altInput: true, altFormat: "d-m-Y", allowInput: true, locale: LOCALE_ES };
            this.fpDesde = flatpickr("#dd-fecha-desde", opciones);
            this.fpHasta = flatpickr("#dd-fecha-hasta", opciones);
        }

        bindEventos() {
            $("dd-buscar-btn")?.addEventListener("click", () => this.buscar());
            $("dd-ultimo-mes-btn")?.addEventListener("click", () => this.ultimoMes());
            $("dd-historial-btn")?.addEventListener("click", () => this.todoElHistorial());
            $("dd-exportar-btn")?.addEventListener("click", () => this.exportar());
            $("dd-diario-exportar-btn")?.addEventListener("click", () => this.exportarDiario());
            // La tarjeta "hoy" se redibuja entera, por eso el botón se atiende por delegación.
            $("dd-hoy")?.addEventListener("click", (e) => {
                if (e.target.closest("#dd-hoy-actualizar")) this.cargarHoy();
            });
            $("dd-diario-prev")?.addEventListener("click", () => this.cambiarPaginaDiaria(-1));
            $("dd-diario-next")?.addEventListener("click", () => this.cambiarPaginaDiaria(1));

            // Estos filtros solo recortan la tabla ya cargada; los KPI siguen el rango de fechas.
            ["dd-filtro-empresa", "dd-filtro-destino"].forEach((id) => $(id)?.addEventListener("change", () => this.renderTabla()));
            // La empresa también recorta el resumen diario (el destino no: ahí siempre se separa).
            $("dd-filtro-empresa")?.addEventListener("change", () => {
                this.paginaDiaria = 1;
                this.renderDiario();
            });
            $("dd-filtro-texto")?.addEventListener("input", () => this.renderTabla());
        }

        fechaIso(fp) {
            return fp?.selectedDates?.length ? fp.formatDate(fp.selectedDates[0], "Y-m-d") : "";
        }

        ultimoMes() {
            this.fpDesde?.setDate(isoLocal(30), false);
            this.fpHasta?.setDate(isoLocal(0), false);
            this.buscar();
        }

        todoElHistorial() {
            this.fpDesde?.clear();
            this.fpHasta?.clear();
            this.buscar();
        }

        async buscar() {
            const solicitud = ++this.solicitud;
            const fechaDesde = this.fechaIso(this.fpDesde);
            const fechaHasta = this.fechaIso(this.fpHasta);

            this.mensajeKpis("Cargando...");
            this.mensajeTabla("Cargando...");
            this.mensajeDiario("Cargando...");

            const res = await window.PhotinoBridge.send({
                action: "despachosDiarios.resumen",
                data: { fechaDesde, fechaHasta },
            });

            if (solicitud !== this.solicitud) return;

            if (!res || !res.ok) {
                this.resumen = [];
                this.detalle = [];
                this.resumenDiario = [];
                this.mensajeDiario(res?.error || "No se pudo cargar los despachos diarios");
                this.mensajeKpis(res?.error || "No se pudo cargar los despachos diarios");
                this.mensajeTabla(res?.error || "No se pudo cargar los despachos diarios");
                return;
            }

            const datos = res.data || {};
            this.resumen = datos.resumen || [];
            this.detalle = datos.detalle || [];
            this.resumenDiario = datos.resumenDiario || [];
            this.paginaDiaria = 1;

            this.renderKpis(fechaDesde, fechaHasta);
            this.llenarEmpresas();
            this.renderAviso(datos);
            this.renderDiario();
            this.renderTabla();
        }

        mensajeKpis(texto) {
            const el = $("dd-kpis");
            if (el) el.innerHTML = `<div class="dd-mensaje">${esc(texto)}</div>`;
        }

        mensajeTabla(texto) {
            const el = $("dd-tbody");
            if (el) el.innerHTML = `<tr><td colspan="${COLUMNAS.length}">${esc(texto)}</td></tr>`;
            const aviso = $("dd-aviso");
            if (aviso) aviso.style.display = "none";
            const cant = $("dd-cantidad");
            if (cant) cant.textContent = "";
        }

        // KPI arriba: por empresa, lo liberado a despacho (pallets y unidades) bien grande; cuarentena y
        // destrucción van aparte, en gris y con rótulo propio, para no mezclarlos con lo liberado.
        renderKpis(fechaDesde, fechaHasta) {
            const el = $("dd-kpis");
            if (!el) return;

            const periodo = $("dd-periodo");
            if (periodo) {
                periodo.textContent =
                    fechaDesde || fechaHasta
                        ? `Período: ${fmtDia(fechaDesde) || "inicio"} al ${fmtDia(fechaHasta) || "hoy"}`
                        : "Período: todo el historial disponible";
            }

            if (!this.resumen.length) {
                el.innerHTML = `<div class="dd-mensaje">Sin certificados en el período seleccionado.</div>`;
                return;
            }

            const empresas = [...new Set(this.resumen.map((r) => r.empresa))].sort();
            const tarjetas = empresas.map((emp) => this.tarjeta(emp, this.resumen.filter((r) => r.empresa === emp), false));
            if (empresas.length > 1) tarjetas.push(this.tarjeta("TOTAL", this.resumen, true));

            el.innerHTML = tarjetas.join("");
        }

        // "Liberado hoy": consulta independiente del rango de fechas (siempre el día actual, 00:00 a ahora).
        // Conserva el último dato bueno si una actualización falla.
        async cargarHoy() {
            const solicitud = ++this.solicitudHoy;
            this.renderHoy(true, "");

            const hoy = isoLocal(0);
            const res = await window.PhotinoBridge.send({
                action: "despachosDiarios.resumen",
                data: { fechaDesde: hoy, fechaHasta: hoy },
            });

            if (solicitud !== this.solicitudHoy) return;

            if (!res || !res.ok) {
                this.renderHoy(false, res?.error || "No se pudo actualizar");
                return;
            }

            this.hoy = { filas: res.data?.resumen || [], hora: new Date().toLocaleTimeString("es-CL") };
            this.renderHoy(false, "");
        }

        renderHoy(cargando, error) {
            const el = $("dd-hoy");
            if (!el) return;

            const boton = `<button class="btn-secondary" id="dd-hoy-actualizar"${cargando ? " disabled" : ""}>${cargando ? "Actualizando..." : "Actualizar"}</button>`;
            const estado = error
                ? `<span class="dd-hoy-error">${esc(error)}${this.hoy ? ` · último dato: ${esc(this.hoy.hora)}` : ""}</span>`
                : this.hoy
                  ? `Actualizado a las ${esc(this.hoy.hora)}`
                  : "";
            const cabecera = `
                <div class="dd-hoy-cabecera">
                    <span class="dd-vivo"><span class="dd-vivo-punto"></span>EN VIVO · ${esc(fmtDia(isoLocal(0)))}</span>
                    <span class="dd-hoy-estado">${estado}</span>
                    ${boton}
                </div>`;

            if (!this.hoy) {
                el.innerHTML = `<div class="dd-card dd-card-hoy">${cabecera}<div class="dd-detalle">${cargando ? "Cargando..." : "Sin datos de hoy."}</div></div>`;
                return;
            }

            if (!this.hoy.filas.length) {
                el.innerHTML = `<div class="dd-card dd-card-hoy">${cabecera}<div class="dd-detalle">Aún no hay certificados liberados hoy.</div></div>`;
                return;
            }

            el.innerHTML = this.tarjeta("LIBERADO HOY (00:00 hasta ahora, no depende del período)", this.hoy.filas, false, { clase: " dd-card-hoy", cabecera, porEmpresa: true });
        }

        // Texto chico: lo liberado separado por la empresa que figura en el registro del certificado.
        detallePorEmpresa(filas) {
            const lib = filas.filter((r) => r.destino === "LIBERADO");
            if (!lib.length) return "";
            const partes = [...new Set(lib.map((r) => r.empresa))].sort().map((e) => {
                const s = sumar(lib.filter((r) => r.empresa === e));
                return `<strong>${esc(e)}</strong>: ${num(s.pallets)} pallets · ${num(s.unidades)} un. · ${num(s.folios)} cert.`;
            });
            return `<div class="dd-detalle">Según empresa del registro: ${partes.join(" &nbsp;|&nbsp; ")}</div>`;
        }

        tarjeta(titulo, filas, total, opciones = {}) {
            const lib = sumar(filas.filter((r) => r.destino === "LIBERADO"));
            const enOtros = lib.unidades - lib.unidadesEnPallet;

            const fueraDespacho = ["CUARENTENA", "DESTRUCCION", "OTRO"]
                .map((d) => ({ d, s: sumar(filas.filter((r) => r.destino === d)) }))
                .filter((x) => x.s.folios > 0)
                .map((x) => `${esc(DESTINOS[x.d].texto)}: ${num(x.s.folios)} cert. · ${num(x.s.unidades)} un.`)
                .join(" &nbsp;|&nbsp; ");

            return `
                <div class="dd-card${total ? " dd-card-total" : ""}${opciones.clase || ""}">
                    ${opciones.cabecera || ""}
                    <div class="dd-card-titulo">${esc(titulo)}</div>
                    <div class="dd-cifras">
                        <div class="dd-cifra-bloque">
                            <span class="dd-cifra">${num(lib.pallets)}</span>
                            <span class="dd-etiqueta">Pallets liberados</span>
                        </div>
                        <div class="dd-cifra-bloque">
                            <span class="dd-cifra">${num(lib.unidades)}</span>
                            <span class="dd-etiqueta">Unidades liberadas</span>
                        </div>
                    </div>
                    <div class="dd-detalle">
                        ${num(lib.folios)} certificados liberados · ${num(lib.unidadesEnPallet)} un. en pallet ·
                        ${num(enOtros)} un. en otros embalajes (${num(lib.bultosOtros)} cajas/paquetes/bins)
                    </div>
                    ${opciones.porEmpresa ? this.detallePorEmpresa(filas) : ""}
                    ${
                        fueraDespacho
                            ? `<div class="dd-fuera"><strong>No liberado a despacho (informativo, no incluido arriba)</strong><br>${fueraDespacho}</div>`
                            : ""
                    }
                </div>`;
        }

        mensajeDiario(texto) {
            const el = $("dd-diario-tbody");
            if (el) el.innerHTML = `<tr><td colspan="${COLUMNAS_DIARIO.length}">${esc(texto)}</td></tr>`;
            const pag = $("dd-diario-paginacion");
            if (pag) pag.style.display = "none";
        }

        // Agrupa el resumen diario por día (más reciente primero), respetando el filtro de empresa.
        // Liberado = lo despachable; cuarentena/destrucción/otro se informan aparte, sin sumarse.
        diasAgrupados() {
            const emp = $("dd-filtro-empresa")?.value || "";
            const dias = new Map();

            this.resumenDiario
                .filter((r) => !emp || r.empresa === emp)
                .forEach((r) => {
                    if (!dias.has(r.fecha)) dias.set(r.fecha, { fecha: r.fecha, filas: [] });
                    dias.get(r.fecha).filas.push(r);
                });

            return [...dias.values()]
                .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
                .map((d) => {
                    const liberadas = d.filas.filter((r) => r.destino === "LIBERADO");
                    const lib = sumar(liberadas);
                    const porEmpresa = [...new Set(liberadas.map((r) => r.empresa))]
                        .sort()
                        .map((e) => ({ e, s: sumar(liberadas.filter((r) => r.empresa === e)) }));
                    const fuera = sumar(d.filas.filter((r) => r.destino !== "LIBERADO"));
                    return { fecha: d.fecha, lib, porEmpresa, fuera };
                });
        }

        renderDiario() {
            const tbody = $("dd-diario-tbody");
            if (!tbody) return;

            const dias = this.diasAgrupados();
            if (!dias.length) {
                this.mensajeDiario("Sin liberaciones en el período seleccionado.");
                return;
            }

            const paginas = Math.ceil(dias.length / DIAS_POR_PAGINA);
            this.paginaDiaria = Math.min(Math.max(1, this.paginaDiaria), paginas);

            const desde = (this.paginaDiaria - 1) * DIAS_POR_PAGINA;
            tbody.innerHTML = dias
                .slice(desde, desde + DIAS_POR_PAGINA)
                .map((d) => "<tr>" + COLUMNAS_DIARIO.map((c) => `<td>${c.html ? c.html(d) : esc(c.v(d) ?? "-")}</td>`).join("") + "</tr>")
                .join("");

            const pag = $("dd-diario-paginacion");
            if (pag) pag.style.display = "";
            const info = $("dd-diario-info");
            if (info) info.textContent = `Página ${this.paginaDiaria} de ${paginas} · ${num(dias.length)} día(s) con liberaciones`;
            const prev = $("dd-diario-prev");
            const next = $("dd-diario-next");
            if (prev) prev.disabled = this.paginaDiaria <= 1;
            if (next) next.disabled = this.paginaDiaria >= paginas;
        }

        cambiarPaginaDiaria(delta) {
            this.paginaDiaria += delta;
            this.renderDiario();
        }

        llenarEmpresas() {
            const sel = $("dd-filtro-empresa");
            if (!sel) return;
            const actual = sel.value;
            const empresas = [...new Set(this.detalle.map((i) => i.empresa).filter(Boolean))].sort();
            sel.innerHTML = `<option value="">Todas</option>` + empresas.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join("");
            sel.value = empresas.includes(actual) ? actual : "";
        }

        renderAviso(datos) {
            const aviso = $("dd-aviso");
            if (!aviso) return;
            if (datos.truncado) {
                aviso.textContent = `La tabla muestra los ${num(datos.limiteDetalle)} certificados más recientes del período; los KPI de arriba incluyen todo el período. Acota las fechas para ver el resto.`;
                aviso.style.display = "";
            } else {
                aviso.style.display = "none";
            }
        }

        filtrados() {
            const emp = $("dd-filtro-empresa")?.value || "";
            const dest = $("dd-filtro-destino")?.value || "";
            const texto = ($("dd-filtro-texto")?.value || "").trim().toLowerCase();

            return this.detalle.filter((i) => {
                if (emp && i.empresa !== emp) return false;
                if (dest && i.destino !== dest) return false;
                if (texto) {
                    const base = `${i.np} ${i.cliente} ${i.codigoArticulo} ${i.descripcionArticulo} ${i.folio}`.toLowerCase();
                    if (!base.includes(texto)) return false;
                }
                return true;
            });
        }

        renderTabla() {
            const tbody = $("dd-tbody");
            if (!tbody) return;

            const filas = this.filtrados();
            const cant = $("dd-cantidad");
            if (cant) cant.textContent = `${num(filas.length)} certificado(s) en la tabla`;

            if (!filas.length) {
                tbody.innerHTML = `<tr><td colspan="${COLUMNAS.length}">Sin registros para los filtros seleccionados</td></tr>`;
                return;
            }

            tbody.innerHTML = filas
                .map((i) => "<tr>" + COLUMNAS.map((c) => `<td>${c.html ? c.html(i) : esc(c.v(i) ?? "-")}</td>`).join("") + "</tr>")
                .join("");
        }

        // Exporta lo que muestra la tabla (con los filtros activos), valores numéricos crudos.
        exportar() {
            const filas = this.filtrados();
            if (!filas.length) {
                alert("No hay datos para exportar");
                return;
            }

            const tabla = document.createElement("table");
            tabla.id = "dd-tabla-export-temp";
            tabla.style.position = "absolute";
            tabla.style.left = "-99999px";
            tabla.style.top = "0";
            tabla.innerHTML =
                "<thead><tr>" + COLUMNAS.map((c) => `<th>${esc(c.t)}</th>`).join("") + "</tr></thead><tbody>" +
                filas.map((i) => "<tr>" + COLUMNAS.map((c) => `<td>${esc(c.v(i) ?? "")}</td>`).join("") + "</tr>").join("") +
                "</tbody>";
            document.body.appendChild(tabla);

            try {
                window.ExcelExporter.exportTable({
                    tableSelector: "#dd-tabla-export-temp",
                    fileName: `despachos_diarios_${Date.now()}.xlsx`,
                    sheetName: "Despachos diarios",
                    title: "QCC - Despachos Diarios",
                });
            } finally {
                tabla.remove();
            }
        }

        // Exporta el resumen diario completo (todos los días del período, no solo la página visible).
        exportarDiario() {
            const dias = this.diasAgrupados();
            if (!dias.length) {
                alert("No hay datos para exportar");
                return;
            }

            const tabla = document.createElement("table");
            tabla.id = "dd-diario-export-temp";
            tabla.style.position = "absolute";
            tabla.style.left = "-99999px";
            tabla.style.top = "0";
            tabla.innerHTML =
                "<thead><tr>" + COLUMNAS_DIARIO.map((c) => `<th>${esc(c.t)}</th>`).join("") + "</tr></thead><tbody>" +
                dias.map((d) => "<tr>" + COLUMNAS_DIARIO.map((c) => `<td>${esc(c.v(d) ?? "")}</td>`).join("") + "</tr>").join("") +
                "</tbody>";
            document.body.appendChild(tabla);

            try {
                window.ExcelExporter.exportTable({
                    tableSelector: "#dd-diario-export-temp",
                    fileName: `despachos_diarios_resumen_diario_${Date.now()}.xlsx`,
                    sheetName: "Resumen diario",
                    title: "QCC - Despachos Diarios - Resumen por día",
                });
            } finally {
                tabla.remove();
            }
        }
    };
})();
