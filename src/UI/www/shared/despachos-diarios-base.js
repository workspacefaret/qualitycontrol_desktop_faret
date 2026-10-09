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
    // Cantidad corta para los chips ("5,3 M", "900 mil"): fija, para que se vea igual en cualquier motor del navegador.
    const compacto = (v) => {
        const n = Number(v) || 0;
        const f = (x) => x.toLocaleString("es-CL", { maximumFractionDigits: 1 });
        return n >= 1e6 ? `${f(n / 1e6)} M` : n >= 1e3 ? `${f(n / 1e3)} mil` : num(n);
    };

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

    // Liberaciones (certificados QCS): oculto a pedido. El código sigue aquí completo: poniendo true se vuelve a
    // mostrar (o se puede mover a su propio módulo). Con false no se hace ninguna consulta de liberaciones.
    const MOSTRAR_LIBERACIONES = false;

    // Detalle de despachos SAP: líneas por página.
    const LINEAS_SAP_POR_PAGINA = 50;

    const ETIQUETA_PALLET = { PALLETS: "Pallets", OTRO_EMBALAJE: "Otro embalaje", SIN_DATO: "Sin dato de pallets" };
    const limpio = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
    const chip = (texto, clase) => `<span class="dd-chip dd-chip-${clase}">${esc(texto)}</span>`;

    const dia = (f) => String(f ?? "").slice(0, 10);
    const claveDoc = (l) => `${l.empresa}|${l.tipo}|${l.docEntry}`;
    const ICONO_OCULTAR =
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    const botonOcultar = (atributo, valor, ayuda) =>
        `<button type="button" class="dd-btn-ocultar" ${atributo}="${esc(valor)}" title="${esc(ayuda)}">${ICONO_OCULTAR} Ocultar</button>`;

    // Detalle SAP en pantalla: una fila por línea de documento. Los pallets son del DOCUMENTO y solo vienen en su primera línea.
    const COLUMNAS_SAP_PANTALLA = [
        {
            html: (l) =>
                l.primeraLineaDocumento
                    ? botonOcultar("data-ocultar-doc", claveDoc(l), "Ocultar este documento de los totales, las tablas y el Excel (no se elimina; puede volver a mostrarlo)")
                    : "",
        },
        { v: (l) => fmtDia(l.fecha) },
        { v: (l) => l.empresa },
        {
            html: (l) =>
                `<strong>${l.tipo === "GUIA" ? "Guía" : "Factura"} ${esc(l.docNum)}</strong>` +
                (l.folio ? `<div class="dd-nota">folio ${esc(l.folio)}</div>` : "") +
                (l.referencia ? `<div class="dd-nota">ref. ${esc(l.referencia)}</div>` : ""),
        },
        { v: (l) => l.notaVenta ?? "-" },
        { v: (l) => l.cliente },
        { html: (l) => `${esc(l.descripcion)}<div class="dd-nota">${esc(l.itemCode)}${l.categoria ? ` · ${esc(l.categoria)}` : ""}</div>` },
        { html: (l) => `<strong>${num(l.unidades)}</strong>` },
        { v: (l) => l.bultoLote ?? "-" },
        {
            html: (l) =>
                l.pallets > 0
                    ? `<strong>${num(l.pallets)}</strong>`
                    : l.primeraLineaDocumento
                      ? "-"
                      : `<span class="dd-nota">↳ mismo documento</span>`,
        },
        {
            html: (l, filtrada) => {
                const marcas = [];
                if (l.primeraLineaDocumento && l.documentoMixto)
                    marcas.push(
                        filtrada
                            ? chip(`Trae otras categorías: sus ${num(l.palletsDocumento)} pallets no se atribuyen`, "amarillo")
                            : chip("Documento con varias categorías", "gris")
                    );
                if (l.primeraLineaDocumento && l.categoriaPallet === "OTRO_EMBALAJE") marcas.push(chip(`Otro embalaje: ${limpio(l.numeroPallet)}`, "gris"));
                if (l.primeraLineaDocumento && l.categoriaPallet === "SIN_DATO")
                    marcas.push(chip(limpio(l.numeroPallet) ? `Sin dato de pallets: ${limpio(l.numeroPallet)}` : "Sin dato de pallets", "amarillo"));
                if (l.entreEmpresas) marcas.push(chip("Entre empresas", "lila"));
                return marcas.join(" ") || "";
            },
        },
        { html: (l) => `<div class="dd-celda-comentario">${esc(limpio(l.comentario))}</div>` },
    ];

    // Detalle SAP en Excel: columnas planas (valores crudos), una por dato.
    const COLUMNAS_SAP_EXCEL = [
        { t: "Fecha", v: (l) => fmtDia(l.fecha) },
        { t: "Empresa", v: (l) => l.empresa },
        { t: "Tipo", v: (l) => (l.tipo === "GUIA" ? "Guía de despacho" : "Factura") },
        { t: "N° documento", v: (l) => l.docNum },
        { t: "Folio", v: (l) => l.folio ?? "" },
        { t: "Nota de venta", v: (l) => l.notaVenta ?? "" },
        { t: "Referencia cliente", v: (l) => l.referencia ?? "" },
        { t: "Cliente", v: (l) => l.cliente },
        { t: "Código", v: (l) => l.itemCode },
        { t: "Descripción", v: (l) => l.descripcion },
        { t: "Categoría", v: (l) => l.categoria ?? "" },
        { t: "Unidades", v: (l) => l.unidades },
        { t: "U.M.", v: (l) => l.unidadMedida ?? "" },
        { t: "Bultos×unidades", v: (l) => l.bultoLote ?? "" },
        { t: "Pallets (documento)", v: (l) => (l.pallets > 0 ? l.pallets : "") },
        { t: "Texto de pallets en SAP", v: (l) => limpio(l.numeroPallet) },
        { t: "Clasificación", v: (l) => ETIQUETA_PALLET[l.categoriaPallet] ?? "" },
        { t: "Entre empresas", v: (l) => (l.entreEmpresas ? "Sí" : "") },
        { t: "Documento mixto (varias categorías)", v: (l) => (l.documentoMixto ? "Sí" : "") },
        { t: "Pallets declarados por el documento (primera línea)", v: (l) => (l.palletsDocumento > 0 ? l.palletsDocumento : "") },
        { t: "Comentario SAP", v: (l) => limpio(l.comentario) },
    ];

    const celdaOcultarDia = (f) =>
        `<td>${botonOcultar("data-ocultar-dia", f, "Ocultar este día de los totales, las tablas y el Excel (no se elimina; puede volver a mostrarlo)")}</td>`;

    const $ = (id) => document.getElementById(id);

    return class DespachosDiariosBase {
        constructor() {
            this.resumen = [];
            this.detalle = [];
            this.resumenDiario = [];
            this.paginaDiaria = 1;
            this.hoy = null; // último dato bueno de "Liberado hoy": { filas, hora }
            this.solicitudHoy = 0;
            this.solicitudSap = 0; // descarta respuestas viejas de "Despachado según SAP"
            this.sapHoy = null; // último dato bueno de "Despachado hoy (SAP)": { empresas, hora }
            this.solicitudSapHoy = 0;
            this.colaSap = Promise.resolve(); // las consultas a SAP se hacen de a una (ver enSerieSap)
            this.solicitudSapDet = 0;
            this.empresaSel = ""; // "" = INNPACK y FARET; si no, solo esa empresa (selector o clic en su tarjeta)
            this.categoriasSel = []; // categorías elegidas (vacío = todas); se pueden elegir varias
            this.categoriasPend = new Set(); // lo marcado en el desplegable, antes de aplicar (se aplica al terminar de marcar)
            this.opcionesCategorias = []; // [{ nombre, unidades }] con despachos en el período
            this.errorCategorias = "";
            this.sapSeleccion = null; // { clave, rango, empresas } | { clave, rango, error }: conjunto elegido en el período
            this.sapHoySel = null; // ídem para la tarjeta EN VIVO
            this.solicitudSapCat = 0;
            this.solicitudSapSel = 0;
            this.solicitudSapSelHoy = 0;
            this.temporizadorCategorias = null;
            this.clientesSel = []; // CardCode de los clientes elegidos (vacío = todos); se pueden elegir varios
            this.clientesPend = new Set(); // lo marcado antes de aplicar (se aplica al terminar de marcar)
            this.opcionesClientes = []; // [{ codigo, nombre, unidades, documentos, entreEmpresas }] con despachos en el período
            this.nombresClientes = new Map(); // CardCode → nombre: se conserva para mostrar los elegidos aunque cambie el período
            this.temporizadorClientes = null;
            this.alClicFuera = null; // cierra la lista de clientes al hacer clic fuera de ella
            this.temporizadorFechas = null; // aplicación automática del rango de fechas (debounce)
            this.sapResumen = null; // último resumen SAP de ambas empresas (alimenta las tarjetas)
            this.rangoSap = null; // período del detalle en pantalla
            this.cacheDetalle = new Map(); // empresa|desde|hasta → { lineas, recorte } | { error }
            this.detalleEnCurso = new Set();
            this.paginaSap = 0;
            this.sapDiarioEmpresas = []; // [{ empresa, diario: [...] }] del resumen SAP
            this.paginaSapDiaria = 1;
            this.ocultosDias = new Set(); // días (YYYY-MM-DD) ocultos por el usuario: no se eliminan, solo se excluyen de totales y Excel
            this.ocultosDocs = new Map(); // clave del documento → { empresa, tipo, docNum, fecha, pallets, unidades }
            this.avisoOcultos = "";
            this.fpDesde = null;
            this.fpHasta = null;
            this.solicitud = 0; // descarta respuestas de una búsqueda vieja si el usuario ya cambió el rango
        }

        init() {
            this.iniciarCalendarios();
            this.bindEventos();
            this.mostrarLiberaciones();
            this.cargarSapHoy();
            if (MOSTRAR_LIBERACIONES) this.cargarHoy();
            this.ultimoMes();
        }

        // Muestra u oculta el bloque de liberaciones (certificados QCS) según la bandera de arriba.
        mostrarLiberaciones() {
            const el = $("dd-liberaciones");
            if (el) el.hidden = !MOSTRAR_LIBERACIONES;
        }

        // El Service Layer de SAP penaliza las peticiones simultáneas (~7 s cada una): las consultas a SAP
        // se encolan y salen de a una. Cada tarea puede descartarse si ya quedó vieja (devuelve null).
        enSerieSap(tarea) {
            const p = this.colaSap.then(tarea, tarea);
            this.colaSap = p.catch(() => {});
            return p;
        }

        destroy() {
            clearTimeout(this.temporizadorCategorias);
            clearTimeout(this.temporizadorClientes);
            clearTimeout(this.temporizadorFechas);
            if (this.alClicFuera) document.removeEventListener("click", this.alClicFuera);
            this.fpDesde?.destroy();
            this.fpHasta?.destroy();
        }

        iniciarCalendarios() {
            if (typeof flatpickr === "undefined") return;

            const opciones = {
                dateFormat: "Y-m-d",
                altInput: true,
                altFormat: "d-m-Y",
                allowInput: true,
                locale: LOCALE_ES,
                onChange: () => this.alCambiarFechas(), // solo se dispara cuando el usuario elige o escribe una fecha
            };
            this.fpDesde = flatpickr("#dd-fecha-desde", opciones);
            this.fpHasta = flatpickr("#dd-fecha-hasta", opciones);
        }

        bindEventos() {
            $("dd-buscar-btn")?.addEventListener("click", () => this.buscar());
            $("dd-dia-hoy-btn")?.addEventListener("click", () => this.diaUnico(0));
            $("dd-dia-ayer-btn")?.addEventListener("click", () => this.diaUnico(1));
            $("dd-ultimo-mes-btn")?.addEventListener("click", () => this.ultimoMes());
            $("dd-historial-btn")?.addEventListener("click", () => this.todoElHistorial());
            // El Excel de la cabecera exporta lo que se está mostrando: el detalle SAP (o los certificados si se reactivan).
            $("dd-exportar-btn")?.addEventListener("click", () => (MOSTRAR_LIBERACIONES ? this.exportar() : this.exportarSapDetalle()));
            $("dd-sapdet-exportar-btn")?.addEventListener("click", () => this.exportarSapDetalle());
            $("dd-sap-empresa")?.addEventListener("change", (e) => this.seleccionarEmpresa(e.target.value));
            // Chips de categoría (selección múltiple): "Todas" quita el filtro; los demás marcan o desmarcan.
            $("dd-sap-chips")?.addEventListener("click", (ev) => {
                const chip = ev.target?.closest?.("[data-categoria]");
                if (!chip) return;
                const nombre = chip.dataset.categoria;
                if (nombre === "") this.limpiarCategorias();
                else this.alCambiarCategorias(nombre, !this.categoriasPend.has(nombre));
            });
            $("dd-sap-cat-quitar")?.addEventListener("click", () => this.limpiarCategorias());
            this.bindClientes();
            const alElegirTarjeta = (ev) => {
                const t = ev.target.closest("[data-empresa-sap]");
                if (t) this.seleccionarEmpresa(t.dataset.empresaSap === this.empresaSel ? "" : t.dataset.empresaSap);
            };
            $("dd-sap")?.addEventListener("click", alElegirTarjeta);
            $("dd-sap")?.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    alElegirTarjeta(ev);
                }
            });
            $("dd-sapdet-texto")?.addEventListener("input", () => {
                this.paginaSap = 1;
                this.renderSapDetalle();
            });
            $("dd-sapdet-prev")?.addEventListener("click", () => this.cambiarPaginaSap(-1));
            $("dd-sapdet-next")?.addEventListener("click", () => this.cambiarPaginaSap(1));
            $("dd-sapdet-tbody")?.addEventListener("click", (ev) => {
                const b = ev.target.closest?.("[data-ocultar-doc]");
                if (b) this.ocultarDoc(b.dataset.ocultarDoc);
            });
            $("dd-sapd-tbody")?.addEventListener("click", (ev) => {
                const b = ev.target.closest?.("[data-ocultar-dia]");
                if (b) this.ocultarDia(b.dataset.ocultarDia);
            });
            $("dd-ocultos")?.addEventListener("click", (ev) => {
                const t = ev.target;
                if (t.closest?.("#dd-mostrar-todo")) this.mostrarTodo();
                else if (t.closest?.("[data-mostrar-dia]")) this.mostrarDia(t.closest("[data-mostrar-dia]").dataset.mostrarDia);
                else if (t.closest?.("[data-mostrar-doc]")) this.mostrarDoc(t.closest("[data-mostrar-doc]").dataset.mostrarDoc);
            });
            $("dd-sapd-prev")?.addEventListener("click", () => this.cambiarPaginaSapDiaria(-1));
            $("dd-sapd-next")?.addEventListener("click", () => this.cambiarPaginaSapDiaria(1));
            $("dd-diario-exportar-btn")?.addEventListener("click", () => this.exportarDiario());
            // La tarjeta "hoy" se redibuja entera, por eso el botón se atiende por delegación.
            $("dd-hoy")?.addEventListener("click", (e) => {
                if (e.target.closest("#dd-hoy-actualizar")) this.cargarHoy();
            });
            $("dd-sap-hoy")?.addEventListener("click", (e) => {
                if (e.target.closest("#dd-sap-hoy-actualizar")) this.cargarSapHoy();
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

        // Un solo día (Hoy = 0, Ayer = 1): desde y hasta quedan en la misma fecha.
        diaUnico(diasAtras) {
            this.fpDesde?.setDate(isoLocal(diasAtras), false);
            this.fpHasta?.setDate(isoLocal(diasAtras), false);
            this.buscar();
        }

        todoElHistorial() {
            this.fpDesde?.clear(false);
            this.fpHasta?.clear(false);
            this.buscar();
        }

        // Cuando el usuario elige o escribe una fecha: si ya hay un rango válido se aplica solo, tras una pausa corta
        // (así no se consulta en cada clic). Si falta una de las dos se espera; si desde es posterior a hasta se avisa.
        alCambiarFechas() {
            clearTimeout(this.temporizadorFechas);
            this.temporizadorFechas = null;

            const desde = this.fechaIso(this.fpDesde);
            const hasta = this.fechaIso(this.fpHasta);
            const aviso = $("dd-fechas-aviso");
            const invalido = !!desde && !!hasta && desde > hasta;
            if (aviso) {
                aviso.textContent = invalido ? "La fecha desde no puede ser posterior a la fecha hasta: corrija las fechas para actualizar." : "";
                aviso.hidden = !invalido;
            }
            if (invalido || !desde || !hasta) return;

            this.temporizadorFechas = setTimeout(() => {
                this.temporizadorFechas = null;
                this.buscar();
            }, 600);
        }

        async buscar() {
            clearTimeout(this.temporizadorFechas); // un Buscar manual reemplaza a una aplicación automática pendiente
            this.temporizadorFechas = null;
            const solicitud = ++this.solicitud;
            const fechaDesde = this.fechaIso(this.fpDesde);
            const fechaHasta = this.fechaIso(this.fpHasta);

            this.cargarSap(fechaDesde, fechaHasta); // SAP (apisapfaret): resumen, resumen diario y detalle, en cola
            this.cargarSapCategorias(fechaDesde, fechaHasta);
            this.cargarSapDetalle(fechaDesde, fechaHasta);
            if (!MOSTRAR_LIBERACIONES) return;

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

        // "Despachado según SAP": pallets y unidades realmente despachados (facturas que mueven stock + guías),
        // una tarjeta por empresa. Fuente distinta a los certificados de liberación (apisapfaret/Service Layer);
        // si falla, solo esta sección muestra el error.
        async cargarSap(fechaDesde, fechaHasta) {
            const solicitud = ++this.solicitudSap;
            const cliente = this.clientesSel.join(","); // se fija ahora: el usuario puede cambiar el filtro mientras llega la respuesta
            const cont = $("dd-sap");
            if (!cont) return;
            cont.innerHTML = `<div class="dd-mensaje">Cargando...</div>`;
            this.estadoSap("");
            this.mensajeSapDiario("Cargando...");

            const res = await this.enSerieSap(() =>
                solicitud !== this.solicitudSap
                    ? null
                    : window.PhotinoBridge.send({ action: "despachosDiarios.sap.resumen", data: { fechaDesde, fechaHasta, cliente } })
            );

            if (res === null || solicitud !== this.solicitudSap) return;

            if (!res || !res.ok) {
                this.sapResumen = null;
                this.sapDiarioEmpresas = [];
                cont.innerHTML = `<div class="dd-mensaje">${esc(res?.error || "No se pudo consultar SAP")}</div>`;
                this.mensajeSapDiario(res?.error || "No se pudo consultar SAP");
                return;
            }

            const d = res.data || {};
            const empresas = [...(d.empresas || [])].sort((a, b) => String(a.empresa).localeCompare(String(b.empresa)));
            this.sapResumen = { ...d, empresas };
            this.sapDiarioEmpresas = empresas;
            this.paginaSapDiaria = 1;
            this.renderSapResumen();
            this.renderSapDiario();
        }

        // ---------------------------------------------------------------------------------------------
        //  Empresa elegida (selector o clic en una tarjeta): todo lo de abajo sigue a esa selección
        // ---------------------------------------------------------------------------------------------

        // Selección vacía = INNPACK y FARET. Un segundo clic sobre la tarjeta ya elegida vuelve a "Todas".
        seleccionarEmpresa(empresa) {
            this.empresaSel = empresa === "INNPACK" || empresa === "FARET" ? empresa : "";
            const sel = $("dd-sap-empresa");
            if (sel) sel.value = this.empresaSel;

            this.paginaSap = 1;
            this.paginaSapDiaria = 1;
            this.renderSapResumen();
            this.renderSapDiario();
            if (this.sapHoy) this.renderSapHoy(false, "");
            this.asegurarDetalle(); // consulta solo lo que falte de la(s) empresa(s) elegida(s)
        }

        // ---------------------------------------------------------------------------------------------
        //  Categorías de producto (Estuches, Fajas, Cajas, Tapas...): se pueden elegir VARIAS. Filtran las
        //  tarjetas, el resumen diario, la tarjeta EN VIVO y el detalle. La API deriva la categoría del nombre
        //  del artículo y calcula el conjunto exacto (un documento cuenta sus pallets si todas sus líneas
        //  pertenecen a la selección).
        // ---------------------------------------------------------------------------------------------

        // Categorías con despachos en el período (de ambas empresas): más unidades primero, "Otros" al final.
        categoriasDisponibles() {
            return this.opcionesCategorias.map((o) => o.nombre);
        }

        // Texto corto de la selección para títulos: "Estuches", "Estuches + Fajas", "3 categorías".
        etiquetaCategorias() {
            const n = this.categoriasSel.length;
            return n === 0 ? "" : n <= 2 ? this.categoriasSel.join(" + ") : `${n} categorías`;
        }

        claveCategorias() {
            return [...this.categoriasSel].sort().join("+");
        }

        claveClientes() {
            return [...this.clientesSel].sort().join("+");
        }

        // Identifica el filtro completo (categorías + clientes): las cachés y las respuestas en vuelo se comparan con esto.
        claveFiltro() {
            return `${this.claveCategorias()}#${this.claveClientes()}`;
        }

        nombreCliente(codigo) {
            return this.nombresClientes.get(codigo) || codigo;
        }

        // Texto corto para títulos: "ICB S.A.", "ICB S.A. + CAROZZI", "3 clientes".
        etiquetaClientes() {
            const n = this.clientesSel.length;
            return n === 0 ? "" : n <= 2 ? this.clientesSel.map((c) => this.nombreCliente(c)).join(" + ") : `${n} clientes`;
        }

        // Dibuja los chips de categoría: "Todas" + uno por categoría con su volumen. Los marcados están "presionados".
        llenarCategorias() {
            const cont = $("dd-sap-chips");
            if (!cont) return;

            const hay = this.opcionesCategorias.length > 0;
            const sinFoco = !cont.contains?.(document.activeElement);
            const foco = sinFoco ? null : document.activeElement?.dataset?.categoria;

            cont.innerHTML = hay
                ? `<button type="button" class="dd-chip-cat" data-categoria="" aria-pressed="${this.categoriasPend.size === 0}" title="Sin filtro de categoría">` +
                  `<span class="dd-chip-nombre">Todas</span></button>` +
                  this.opcionesCategorias
                      .map((o) => {
                          const marcada = this.categoriasPend.has(o.nombre);
                          return (
                              `<button type="button" class="dd-chip-cat" data-categoria="${esc(o.nombre)}" aria-pressed="${marcada}" ` +
                              `title="${esc(o.nombre)}: ${num(o.unidades)} unidades en el período">` +
                              `<span class="dd-chip-nombre">${esc(o.nombre)}</span><span class="dd-chip-cant">${esc(compacto(o.unidades))}</span></button>`
                          );
                      })
                      .join("")
                : `<span class="dd-nota">${esc(this.errorCategorias || "Las categorías de SAP no están disponibles.")}</span>`;

            // El contenedor se redibuja: se devuelve el foco al chip que lo tenía (teclado).
            if (foco !== null && foco !== undefined) {
                [...(cont.querySelectorAll?.("[data-categoria]") || [])].find((b) => b.dataset.categoria === foco)?.focus?.();
            }

            const n = this.categoriasPend.size;
            const resumen = $("dd-sap-cat-resumen");
            if (resumen) resumen.textContent = hay ? (n ? `${n} de ${this.opcionesCategorias.length} seleccionadas` : "sin filtro") : "";
            const quitar = $("dd-sap-cat-quitar");
            if (quitar) quitar.hidden = n === 0;
        }

        // Cada chip actualiza su estado al instante; los datos se piden cuando el usuario termina de marcar.
        alCambiarCategorias(nombre, marcada) {
            if (marcada) this.categoriasPend.add(nombre);
            else this.categoriasPend.delete(nombre);
            this.llenarCategorias();
            clearTimeout(this.temporizadorCategorias);
            this.temporizadorCategorias = setTimeout(() => this.seleccionarCategorias([...this.categoriasPend]), 400);
        }

        limpiarCategorias() {
            clearTimeout(this.temporizadorCategorias);
            this.seleccionarCategorias([]);
        }

        // Pide a SAP las categorías del período (una consulta chica por empresa, en cola después del resumen).
        async cargarSapCategorias(fechaDesde, fechaHasta) {
            const solicitud = ++this.solicitudSapCat;
            const res = await this.enSerieSap(() =>
                solicitud !== this.solicitudSapCat
                    ? null
                    : window.PhotinoBridge.send({ action: "despachosDiarios.sap.categorias", data: { fechaDesde, fechaHasta } })
            );
            if (res === null || solicitud !== this.solicitudSapCat) return;

            const ok = res && res.ok;
            this.errorCategorias = ok ? "" : res?.error || "";

            const unidades = new Map();
            (ok ? res.data?.empresas || [] : []).forEach((e) =>
                (e.categorias || []).forEach((c) => unidades.set(c.categoria, (unidades.get(c.categoria) || 0) + Number(c.unidades || 0)))
            );
            this.opcionesCategorias = [...unidades.keys()]
                .sort((a, b) => (a === "Otros" ? 1 : b === "Otros" ? -1 : unidades.get(b) - unidades.get(a) || a.localeCompare(b)))
                .map((nombre) => ({ nombre, unidades: unidades.get(nombre) }));

            // Clientes del período (la API los entrega en la misma consulta de categorías): se unen las dos empresas por código.
            const porCodigo = new Map();
            (ok ? res.data?.empresas || [] : []).forEach((e) =>
                (e.clientes || []).forEach((c) => {
                    const a = porCodigo.get(c.cardCode) || { codigo: c.cardCode, nombre: c.nombre, unidades: 0, documentos: 0, entreEmpresas: false, mayor: -1 };
                    if (Number(c.unidades) > a.mayor) {
                        a.mayor = Number(c.unidades);
                        a.nombre = c.nombre || a.nombre;
                    }
                    a.unidades += Number(c.unidades || 0);
                    a.documentos += Number(c.documentos || 0);
                    a.entreEmpresas = a.entreEmpresas || !!c.entreEmpresas;
                    porCodigo.set(c.cardCode, a);
                })
            );
            this.opcionesClientes = [...porCodigo.values()].sort((a, b) => b.unidades - a.unidades || String(a.nombre).localeCompare(String(b.nombre)));
            this.opcionesClientes.forEach((o) => this.nombresClientes.set(o.codigo, o.nombre));
            // Un cliente elegido que no tuvo despachos en este período NO se descarta: sigue como filtro (se ve en los chips y
            // las cifras quedan en cero), así el usuario ve por qué no hay datos en vez de que el filtro desaparezca en silencio.
            this.renderClientes();

            // Las categorías elegidas que ya no tienen despachos en este período se descartan.
            const validas = this.categoriasDisponibles();
            this.categoriasSel = this.categoriasSel.filter((c) => validas.includes(c));
            this.categoriasPend = new Set(this.categoriasSel);
            this.llenarCategorias();

            this.renderSapResumen();
            this.renderSapDiario();
            if (this.sapHoy) this.renderSapHoy(false, "");
            if (this.categoriasSel.length) this.cargarSeleccionPeriodo();
        }

        seleccionarCategorias(lista) {
            const validas = this.categoriasDisponibles();
            this.categoriasSel = validas.filter((c) => lista.includes(c));
            this.categoriasPend = new Set(this.categoriasSel);
            this.llenarCategorias();

            this.paginaSap = 1;
            this.paginaSapDiaria = 1;
            // Lo que aporta un documento depende de la categoría elegida: al cambiarla vuelven a mostrarse.
            if (this.ocultosDocs.size) {
                this.ocultosDocs.clear();
                this.avisoOcultos = "Al cambiar la categoría se volvieron a mostrar los documentos que había ocultado (los días ocultos se mantienen).";
            }
            this.renderOcultos();
            this.renderSapResumen();
            this.renderSapDiario();
            if (this.sapHoy) this.renderSapHoy(false, "");

            if (this.categoriasSel.length) {
                this.cargarSeleccionPeriodo();
                this.cargarSeleccionHoy();
            }
            this.asegurarDetalle(); // el detalle se pide ya filtrado (y en caché por empresa y selección)
        }

        // ---------------------------------------------------------------------------------------------
        //  Clientes (CardCode de SAP): se pueden elegir VARIOS, con buscador por nombre o código. Filtran las tarjetas, la
        //  tarjeta EN VIVO, el resumen diario, el detalle y el Excel, y se combinan con empresa, categorías y fechas. Un
        //  documento tiene un solo cliente, así que el filtro lo aplica la API antes de agrupar (cifras exactas). Las
        //  devoluciones y notas de crédito no traen cliente en SAP: con este filtro no se pueden atribuir (aviso aparte).
        // ---------------------------------------------------------------------------------------------

        bindClientes() {
            const buscar = $("dd-sap-cliente-buscar");
            const lista = $("dd-sap-cliente-lista");
            buscar?.addEventListener("focus", () => this.abrirListaClientes());
            buscar?.addEventListener("click", () => this.abrirListaClientes());
            buscar?.addEventListener("input", () => {
                this.abrirListaClientes();
                this.renderListaClientes();
            });
            buscar?.addEventListener("keydown", (ev) => {
                if (ev.key === "Escape") this.cerrarListaClientes();
            });
            lista?.addEventListener("click", (ev) => {
                const op = ev.target?.closest?.("[data-cliente]");
                if (op) this.alCambiarClientes(op.dataset.cliente, !this.clientesPend.has(op.dataset.cliente));
            });
            lista?.addEventListener("keydown", (ev) => {
                if (ev.key === "Escape") {
                    this.cerrarListaClientes();
                    buscar?.focus();
                }
            });
            $("dd-sap-cliente-sel")?.addEventListener("click", (ev) => {
                const b = ev.target?.closest?.("[data-quitar-cliente]");
                if (b) this.alCambiarClientes(b.dataset.quitarCliente, false);
            });
            $("dd-sap-cliente-quitar")?.addEventListener("click", () => this.limpiarClientes());

            this.alClicFuera = (ev) => {
                if (!ev.target?.closest?.("#dd-sap-cliente-combo")) this.cerrarListaClientes();
            };
            document.addEventListener("click", this.alClicFuera);
            this.renderClientes();
        }

        abrirListaClientes() {
            const lista = $("dd-sap-cliente-lista");
            if (!lista || !this.opcionesClientes.length) return;
            if (lista.hidden) {
                lista.hidden = false;
                $("dd-sap-cliente-buscar")?.setAttribute("aria-expanded", "true");
                this.renderListaClientes();
            }
        }

        cerrarListaClientes() {
            const lista = $("dd-sap-cliente-lista");
            if (lista && !lista.hidden) {
                lista.hidden = true;
                $("dd-sap-cliente-buscar")?.setAttribute("aria-expanded", "false");
            }
        }

        // Dibuja las opciones que coinciden con lo escrito (sin distinguir mayúsculas ni tildes; por nombre o código).
        renderListaClientes() {
            const lista = $("dd-sap-cliente-lista");
            if (!lista || lista.hidden) return;

            const normal = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            const q = normal($("dd-sap-cliente-buscar")?.value).trim();
            const opciones = this.opcionesClientes.filter((o) => !q || normal(o.nombre).includes(q) || normal(o.codigo).includes(q));

            lista.innerHTML = opciones.length
                ? opciones
                      .map(
                          (o) =>
                              `<button type="button" class="dd-cliente-op" role="option" data-cliente="${esc(o.codigo)}" aria-selected="${this.clientesPend.has(o.codigo)}" ` +
                              `title="${esc(o.nombre)} · ${num(o.documentos)} documento(s) · ${num(o.unidades)} unidades en el período">` +
                              `<span class="dd-cliente-check" aria-hidden="true">✓</span>` +
                              `<span class="dd-cliente-nombre">${esc(o.nombre)}</span>` +
                              (o.entreEmpresas ? `<span class="dd-chip dd-chip-lila">Grupo</span>` : "") +
                              `<span class="dd-cliente-codigo">${esc(o.codigo)}</span>` +
                              `<span class="dd-chip-cant">${esc(compacto(o.unidades))}</span></button>`
                      )
                      .join("")
                : `<div class="dd-nota dd-cliente-vacio">Ningún cliente coincide con «${esc($("dd-sap-cliente-buscar")?.value || "")}».</div>`;
        }

        // Chips de los elegidos, resumen, botón «Quitar filtro» y aviso informativo de devoluciones.
        renderClientes() {
            const buscar = $("dd-sap-cliente-buscar");
            if (buscar) {
                const hay = this.opcionesClientes.length > 0;
                buscar.disabled = !hay;
                buscar.placeholder = hay ? "Buscar cliente por nombre o código..." : this.errorCategorias || "Cargando clientes de SAP...";
            }

            const n = this.clientesPend.size;
            const resumen = $("dd-sap-cliente-resumen");
            if (resumen) resumen.textContent = this.opcionesClientes.length ? (n ? `${n} seleccionado(s) de ${this.opcionesClientes.length}` : "sin filtro") : "";
            const quitar = $("dd-sap-cliente-quitar");
            if (quitar) quitar.hidden = n === 0;

            const sel = $("dd-sap-cliente-sel");
            if (sel) {
                sel.hidden = n === 0;
                sel.innerHTML = [...this.clientesPend]
                    .map(
                        (c) =>
                            `<span class="dd-chip-cliente"><span class="dd-chip-cliente-nombre" title="${esc(c)}">${esc(this.nombreCliente(c))}</span>` +
                            `<button type="button" data-quitar-cliente="${esc(c)}" aria-label="Quitar ${esc(this.nombreCliente(c))}">×</button></span>`
                    )
                    .join("");
            }

            const info = $("dd-sap-cliente-info");
            if (info) info.hidden = n === 0;
        }

        // Cada clic actualiza el estado visual al instante; los datos se piden cuando el usuario termina de marcar.
        alCambiarClientes(codigo, marcado) {
            if (marcado) this.clientesPend.add(codigo);
            else this.clientesPend.delete(codigo);
            this.renderClientes();
            // La opción se actualiza en su sitio (sin redibujar la lista) para no perder el scroll ni el foco.
            [...($("dd-sap-cliente-lista")?.querySelectorAll?.("[data-cliente]") || [])]
                .find((b) => b.dataset.cliente === codigo)
                ?.setAttribute("aria-selected", String(this.clientesPend.has(codigo)));
            clearTimeout(this.temporizadorClientes);
            this.temporizadorClientes = setTimeout(() => this.seleccionarClientes([...this.clientesPend]), 600);
        }

        limpiarClientes() {
            clearTimeout(this.temporizadorClientes);
            this.clientesPend = new Set();
            this.renderClientes();
            [...($("dd-sap-cliente-lista")?.querySelectorAll?.("[data-cliente]") || [])].forEach((b) => b.setAttribute("aria-selected", "false"));
            this.seleccionarClientes([]);
        }

        // Aplica el filtro: vuelve a pedir lo que depende del cliente (tarjetas, EN VIVO, selección de categorías si la hay
        // y detalle). Las respuestas viejas se descartan solas por la clave del filtro / el número de solicitud.
        seleccionarClientes(lista) {
            this.temporizadorClientes = null;
            const nuevos = [...new Set(lista)];
            const igual = nuevos.length === this.clientesSel.length && nuevos.every((c) => this.clientesSel.includes(c));
            this.clientesSel = nuevos;
            this.clientesPend = new Set(nuevos);
            this.renderClientes();
            if (igual) return;

            this.paginaSap = 1;
            this.paginaSapDiaria = 1;
            // Lo que aporta un documento depende del filtro: al cambiarlo vuelven a mostrarse los ocultos (los días se mantienen).
            if (this.ocultosDocs.size) {
                this.ocultosDocs.clear();
                this.avisoOcultos = "Al cambiar el filtro de clientes se volvieron a mostrar los documentos que había ocultado (los días ocultos se mantienen).";
            }
            this.renderOcultos();

            if (this.rangoSap) this.cargarSap(this.rangoSap.desde, this.rangoSap.hasta);
            this.cargarSapHoy(); // con categorías elegidas, además trae su selección de hoy
            if (this.categoriasSel.length) this.cargarSeleccionPeriodo();
            this.asegurarDetalle(); // en caché por empresa, categorías y clientes
        }

        // Totales del CONJUNTO de categorías elegido para el período (los calcula la API: no se suman categorías sueltas).
        async cargarSeleccionPeriodo() {
            const rango = this.rangoSap;
            const categorias = [...this.categoriasSel];
            if (!rango || !categorias.length) return;
            const clave = this.claveFiltro();
            const cliente = this.clientesSel.join(",");
            if (this.sapSeleccion && this.sapSeleccion.clave === clave && this.sapSeleccion.rango === rango) return;

            const token = ++this.solicitudSapSel;
            const res = await this.enSerieSap(() =>
                token !== this.solicitudSapSel
                    ? null
                    : window.PhotinoBridge.send({
                          action: "despachosDiarios.sap.categorias",
                          data: { fechaDesde: rango.desde, fechaHasta: rango.hasta, seleccion: categorias.join(","), cliente },
                      })
            );
            if (res === null || token !== this.solicitudSapSel || this.rangoSap !== rango) return;

            this.sapSeleccion =
                res && res.ok
                    ? { clave, rango, empresas: res.data?.empresas || [] }
                    : { clave, rango, error: res?.error || "No se pudo consultar la selección en SAP" };
            this.paginaSapDiaria = 1;
            this.renderSapResumen();
            this.renderSapDiario();
        }

        // Ídem para la tarjeta EN VIVO (solo hoy: consulta chica).
        async cargarSeleccionHoy() {
            const categorias = [...this.categoriasSel];
            if (!categorias.length) return;
            const clave = this.claveFiltro();
            const cliente = this.clientesSel.join(",");

            const token = ++this.solicitudSapSelHoy;
            const hoy = isoLocal(0);
            const res = await this.enSerieSap(() =>
                token !== this.solicitudSapSelHoy
                    ? null
                    : window.PhotinoBridge.send({
                          action: "despachosDiarios.sap.categorias",
                          data: { fechaDesde: hoy, fechaHasta: hoy, seleccion: categorias.join(","), cliente },
                      })
            );
            if (res === null || token !== this.solicitudSapSelHoy) return;

            this.sapHoySel =
                res && res.ok
                    ? { clave, empresas: res.data?.empresas || [] }
                    : { clave, error: res?.error || "No se pudo consultar la selección de hoy en SAP" };
            if (this.sapHoy) this.renderSapHoy(false, "");
        }

        // Estado de unos datos de selección: cargando (no hay o son de otra selección/período), error, u ok con las
        // empresas en la misma forma que el resumen (para reutilizar tarjetas y bloques). Una empresa sin esas
        // categorías se muestra en cero.
        estadoSeleccion(datos, rango) {
            if (!datos || datos.clave !== this.claveFiltro() || (rango !== undefined && datos.rango !== rango))
                return { estado: "cargando", mensaje: `Cargando ${this.etiquetaCategorias()}...` };
            if (datos.error) return { estado: "error", mensaje: datos.error };

            const vacio = () => ({
                documentos: 0, unidades: 0, pallets: 0, documentosNoPallet: 0, unidadesNoPallet: 0, documentosSinDato: 0,
                unidadesSinDato: 0, documentosEntreEmpresas: 0, unidadesEntreEmpresas: 0, palletsEntreEmpresas: 0,
                documentosMixtos: 0, palletsMixtos: 0,
            });
            return {
                estado: "ok",
                empresas: [...datos.empresas]
                    .sort((a, b) => String(a.empresa).localeCompare(String(b.empresa)))
                    .map((e) => ({
                        empresa: e.empresa,
                        resumen: e.seleccion?.totales || vacio(),
                        devoluciones: { documentos: 0, unidades: 0 },
                        truncado: !!e.truncado,
                        diario: (e.seleccion?.diario || []).map((d) => ({ fecha: d.fecha, resumen: d })),
                    })),
            };
        }

        // Datos del resumen diario: del resumen normal, o los días del conjunto elegido (o un texto si aún no hay).
        diarioActual() {
            if (!this.categoriasSel.length) return this.sapDiarioEmpresas;
            const sel = this.estadoSeleccion(this.sapSeleccion, this.rangoSap);
            return sel.estado === "ok" ? sel.empresas : sel.mensaje;
        }

        // Tarjetas de KPI por empresa (son botones): la elegida se resalta y la otra se atenúa.
        renderSapResumen() {
            const cont = $("dd-sap");
            if (!cont || !this.sapResumen) return;

            const d = this.sapResumen;
            this.estadoSap(
                `Período SAP: ${fmtDia(d.desde)} al ${fmtDia(d.hasta)}` +
                    (d.acotado ? " · acotado a los últimos 400 días (límite de la consulta a SAP)" : "")
            );

            const errores = (d.errors || []).map((e) => `<div class="dd-mensaje">${esc(e.empresa)}: ${esc(e.mensaje)}</div>`).join("");
            let empresas = d.empresas;
            if (this.categoriasSel.length) {
                const sel = this.estadoSeleccion(this.sapSeleccion, this.rangoSap);
                if (sel.estado !== "ok") {
                    cont.innerHTML = `<div class="dd-mensaje">${esc(sel.mensaje)}</div>`;
                    return;
                }
                empresas = sel.empresas;
            }
            cont.innerHTML = empresas.map((e) => this.tarjetaSap({ ...e, resumen: this.resumenAjustado(e) })).join("") + errores || `<div class="dd-mensaje">Sin datos de SAP.</div>`;
        }

        // ---------------------------------------------------------------------------------------------
        //  Despachado por día (SAP): una fila por día (todas las empresas lado a lado, o solo la elegida)
        // ---------------------------------------------------------------------------------------------

        mensajeSapDiario(texto) {
            const thead = $("dd-sapd-thead");
            if (thead) thead.innerHTML = "";
            const tbody = $("dd-sapd-tbody");
            if (tbody) tbody.innerHTML = `<tr><td>${esc(texto)}</td></tr>`;
            const pag = $("dd-sapd-paginacion");
            if (pag) pag.style.display = "none";
        }

        renderSapDiario() {
            const thead = $("dd-sapd-thead");
            const tbody = $("dd-sapd-tbody");
            if (!thead || !tbody) return;

            const base = this.diarioActual();
            if (typeof base === "string") {
                this.mensajeSapDiario(base);
                return;
            }
            const empresas = this.empresaSel ? base.filter((e) => e.empresa === this.empresaSel) : base;
            const unaSola = empresas.length === 1;

            const porFecha = new Map();
            empresas.forEach((e) =>
                (e.diario || []).forEach((d) => {
                    const f = dia(d.fecha);
                    if (!porFecha.has(f)) porFecha.set(f, {});
                    porFecha.get(f)[e.empresa] = d.resumen || {};
                })
            );

            const fechas = [...porFecha.keys()].filter((f) => !this.ocultosDias.has(f)).sort().reverse();
            if (!fechas.length) {
                this.mensajeSapDiario(
                    porFecha.size ? "Todos los días del período están ocultos. Use «Mostrar todo» para volver a verlos." : "Sin despachos en el período seleccionado."
                );
                return;
            }
            // Valores del día sin los documentos que el usuario ocultó.
            const valor = (f, emp) => this.restar(porFecha.get(f)[emp] || {}, this.aporteDocsOcultos(emp, f));

            thead.innerHTML = unaSola
                ? "<tr><th>Fecha</th><th>Pallets</th><th>Unidades</th><th>Documentos</th><th>Ocultar</th></tr>"
                : "<tr><th>Fecha</th>" +
                  empresas.map((e) => `<th>${esc(e.empresa)} · Pallets</th><th>${esc(e.empresa)} · Unidades</th>`).join("") +
                  "<th>Total pallets</th><th>Total unidades</th><th>Ocultar</th></tr>";

            const paginas = Math.ceil(fechas.length / DIAS_POR_PAGINA);
            this.paginaSapDiaria = Math.min(Math.max(1, this.paginaSapDiaria), paginas);
            const desde = (this.paginaSapDiaria - 1) * DIAS_POR_PAGINA;

            tbody.innerHTML = fechas
                .slice(desde, desde + DIAS_POR_PAGINA)
                .map((f) => {
                    if (unaSola) {
                        const r = valor(f, empresas[0].empresa);
                        return `<tr><td><strong>${esc(fmtDia(f))}</strong></td><td><strong>${num(r.pallets)}</strong></td><td><strong>${num(r.unidades)}</strong></td><td>${num(r.documentos)}</td>${celdaOcultarDia(f)}</tr>`;
                    }
                    const celdas = empresas.map((e) => {
                        const r = valor(f, e.empresa);
                        return `<td>${num(r.pallets)}</td><td>${num(r.unidades)}</td>`;
                    });
                    const tp = empresas.reduce((a, e) => a + Number(valor(f, e.empresa).pallets || 0), 0);
                    const tu = empresas.reduce((a, e) => a + Number(valor(f, e.empresa).unidades || 0), 0);
                    return `<tr><td><strong>${esc(fmtDia(f))}</strong></td>${celdas.join("")}<td><strong>${num(tp)}</strong></td><td><strong>${num(tu)}</strong></td>${celdaOcultarDia(f)}</tr>`;
                })
                .join("");

            const pag = $("dd-sapd-paginacion");
            if (pag) pag.style.display = "";
            const info = $("dd-sapd-info");
            if (info) info.textContent = `Página ${this.paginaSapDiaria} de ${paginas} · ${num(fechas.length)} día(s) con despachos`;
            const prev = $("dd-sapd-prev");
            const next = $("dd-sapd-next");
            if (prev) prev.disabled = this.paginaSapDiaria <= 1;
            if (next) next.disabled = this.paginaSapDiaria >= paginas;
        }

        cambiarPaginaSapDiaria(delta) {
            this.paginaSapDiaria += delta;
            this.renderSapDiario();
        }

        // ---------------------------------------------------------------------------------------------
        //  Detalle de despachos SAP: qué documento, cliente y producto explica cada pallet y cada unidad.
        //  Se consulta POR EMPRESA y solo cuando hace falta; cada resultado queda en caché mientras no
        //  cambie el período (Buscar con otras fechas la descarta).
        // ---------------------------------------------------------------------------------------------

        empresasNecesarias() {
            return this.empresaSel ? [this.empresaSel] : ["INNPACK", "FARET"];
        }

        claveDetalle(empresa, claveCat = this.claveFiltro()) {
            return `${empresa}|${claveCat}|${this.rangoSap?.desde ?? ""}|${this.rangoSap?.hasta ?? ""}`;
        }

        // Entrada para un período nuevo (botón Buscar): descarta la caché y pide solo lo elegido.
        cargarSapDetalle(fechaDesde, fechaHasta) {
            this.rangoSap = { desde: fechaDesde, hasta: fechaHasta };
            this.ocultosDias.clear();
            this.ocultosDocs.clear();
            this.avisoOcultos = "";
            this.renderOcultos();
            this.cacheDetalle = new Map();
            this.detalleEnCurso = new Set();
            this.paginaSap = 1;
            return this.asegurarDetalle();
        }

        // Pide a SAP el detalle de las empresas elegidas que aún no están en caché (o que fallaron), de a una.
        async asegurarDetalle() {
            const rango = this.rangoSap;
            if (!rango) return;
            const categorias = [...this.categoriasSel]; // se fija ahora: el usuario puede cambiarla mientras llegan las respuestas
            const cliente = this.clientesSel.join(",");
            const claveCat = this.claveFiltro();

            const faltan = this.empresasNecesarias().filter((emp) => {
                const ent = this.cacheDetalle.get(this.claveDetalle(emp));
                return !ent || ent.error;
            });

            if (!faltan.length) {
                this.renderSapDetalle();
                return;
            }

            const token = ++this.solicitudSapDet;
            faltan.forEach((emp) => this.detalleEnCurso.add(emp));
            this.renderSapDetalle();

            for (const emp of faltan) {
                const clave = this.claveDetalle(emp, claveCat);
                const res = await this.enSerieSap(() => {
                    const ent = this.cacheDetalle.get(clave);
                    if (this.rangoSap !== rango || (ent && !ent.error)) return null; // período viejo o ya traído por otra petición
                    return window.PhotinoBridge.send({
                        action: "despachosDiarios.sap.detalle",
                        data: { fechaDesde: rango.desde, fechaHasta: rango.hasta, empresa: emp, categoria: categorias.join(","), cliente },
                    });
                });

                if (this.rangoSap !== rango) return; // cambió el período: este resultado ya no sirve
                this.detalleEnCurso.delete(emp);
                if (res === null) continue;

                this.cacheDetalle.set(clave, this.entradaDetalle(emp, res));
                if (token === this.solicitudSapDet) this.renderSapDetalle();
            }

            if (token === this.solicitudSapDet) this.renderSapDetalle();
        }

        // Convierte la respuesta de una empresa en una entrada de caché ({ lineas, recorte } o { error }).
        entradaDetalle(empresa, res) {
            if (!res || !res.ok) return { error: res?.error || "No se pudo cargar el detalle de SAP" };

            const d = res.data || {};
            const e = (d.empresas || []).find((x) => x.empresa === empresa);
            if (!e) {
                const err = (d.errors || []).find((x) => x.empresa === empresa);
                return { error: err?.mensaje || "SAP no devolvió datos de esta empresa" };
            }

            return {
                lineas: (e.lineas || []).map((l) => ({ ...l, empresa })),
                recorte: e.truncado ? `${empresa}: se muestran ${num((e.lineas || []).length)} de ${num(e.totalLineas)} líneas` : null,
            };
        }

        // Líneas ya traídas de la(s) empresa(s) elegida(s), más reciente primero (dentro del día: documento y línea).
        lineasSapActuales() {
            const lineas = [];
            const recortes = [];
            const errores = [];

            this.empresasNecesarias().forEach((emp) => {
                const ent = this.cacheDetalle.get(this.claveDetalle(emp));
                if (!ent) return;
                if (ent.error) {
                    errores.push(`${emp}: ${ent.error}`);
                    return;
                }
                lineas.push(...ent.lineas);
                if (ent.recorte) recortes.push(ent.recorte);
            });

            lineas.sort(
                (a, b) =>
                    String(b.fecha).localeCompare(String(a.fecha)) ||
                    String(a.empresa).localeCompare(String(b.empresa)) ||
                    b.docNum - a.docNum ||
                    String(a.tipo).localeCompare(String(b.tipo)) ||
                    a.lineNum - b.lineNum
            );
            return { lineas, recortes, errores };
        }

        mensajeSapDetalle(texto) {
            const tbody = $("dd-sapdet-tbody");
            if (tbody) tbody.innerHTML = `<tr><td colspan="${COLUMNAS_SAP_PANTALLA.length}">${esc(texto)}</td></tr>`;
            const pag = $("dd-sapdet-paginacion");
            if (pag) pag.style.display = "none";
            const aviso = $("dd-sapdet-aviso");
            if (aviso) aviso.style.display = "none";
            const cant = $("dd-sapdet-cantidad");
            if (cant) cant.textContent = "";
        }

        // El texto filtra por documento completo: si una línea coincide se muestran todas las de su documento, así
        // los pallets (que viven en la primera línea) nunca quedan fuera del conteo.
        filtrarSap(todas) {
            const lineasBase = todas.filter((l) => !this.ocultosDias.has(dia(l.fecha)) && !this.ocultosDocs.has(claveDoc(l)));
            const texto = ($("dd-sapdet-texto")?.value || "").trim().toLowerCase();
            if (!texto) return lineasBase;

            const clave = claveDoc;
            const coincide = new Set(
                lineasBase
                    .filter((l) =>
                        `${l.docNum} ${l.folio ?? ""} ${l.notaVenta ?? ""} ${l.referencia ?? ""} ${l.cliente} ${l.itemCode} ${l.descripcion} ${l.comentario ?? ""} ${l.numeroPallet ?? ""}`
                            .toLowerCase()
                            .includes(texto)
                    )
                    .map(clave)
            );
            return lineasBase.filter((l) => coincide.has(clave(l)));
        }

        sapFiltradas() {
            return this.filtrarSap(this.lineasSapActuales().lineas);
        }

        renderSapDetalle() {
            const tbody = $("dd-sapdet-tbody");
            if (!tbody) return;

            const origen = this.lineasSapActuales();
            const cargando = [...(this.detalleEnCurso || [])];
            const lineas = this.filtrarSap(origen.lineas);

            const aviso = $("dd-sapdet-aviso");
            if (aviso) {
                const partes = [...origen.errores];
                if (origen.recortes.length)
                    partes.push(`La tabla muestra solo las líneas más recientes (${origen.recortes.join("; ")}); los totales de arriba incluyen todo el período. Acote las fechas para ver el resto.`);
                aviso.textContent = partes.join(" · ");
                aviso.style.display = partes.length ? "" : "none";
            }

            const pag = $("dd-sapdet-paginacion");
            const cant = $("dd-sapdet-cantidad");

            if (!origen.lineas.length && cargando.length) {
                this.mensajeSapDetalle(`Cargando ${cargando.join(" y ")}...`);
                return;
            }

            if (cant) {
                const un = lineas.reduce((a, l) => a + Number(l.unidades || 0), 0);
                const pal = lineas.reduce((a, l) => a + Number(l.pallets || 0), 0);
                const docs = lineas.filter((l) => l.primeraLineaDocumento).length;
                cant.textContent =
                    `${this.empresaSel || "INNPACK y FARET"}${this.categoriasSel.length ? ` · ${this.etiquetaCategorias()}` : ""}${this.clientesSel.length ? ` · ${this.etiquetaClientes()}` : ""}: ${num(lineas.length)} línea(s) · ${num(docs)} documento(s) · ${num(pal)} pallets · ${num(un)} unidades (según el filtro)` +
                    (cargando.length ? ` · cargando ${cargando.join(" y ")}...` : "");
            }

            if (!lineas.length) {
                tbody.innerHTML = `<tr><td colspan="${COLUMNAS_SAP_PANTALLA.length}">${origen.errores.length ? "No se pudo cargar el detalle" : "Sin registros para los filtros seleccionados"}</td></tr>`;
                if (pag) pag.style.display = "none";
                return;
            }

            const paginas = Math.ceil(lineas.length / LINEAS_SAP_POR_PAGINA);
            this.paginaSap = Math.min(Math.max(1, this.paginaSap || 1), paginas);
            const desde = (this.paginaSap - 1) * LINEAS_SAP_POR_PAGINA;

            tbody.innerHTML = lineas
                .slice(desde, desde + LINEAS_SAP_POR_PAGINA)
                .map(
                    (l) =>
                        `<tr${l.primeraLineaDocumento ? "" : ' class="dd-continuacion"'}>` +
                        COLUMNAS_SAP_PANTALLA.map((c) => `<td>${c.html ? c.html(l, this.categoriasSel.length > 0) : esc(c.v(l) ?? "-")}</td>`).join("") +
                        "</tr>"
                )
                .join("");

            if (pag) pag.style.display = "";
            const info = $("dd-sapdet-info");
            if (info) info.textContent = `Página ${this.paginaSap} de ${paginas}`;
            const prev = $("dd-sapdet-prev");
            const next = $("dd-sapdet-next");
            if (prev) prev.disabled = this.paginaSap <= 1;
            if (next) next.disabled = this.paginaSap >= paginas;
        }

        cambiarPaginaSap(delta) {
            this.paginaSap += delta;
            this.renderSapDetalle();
        }

        // Exporta TODAS las líneas que pasan el filtro de la empresa elegida (no solo la página visible).
        // Por qué NO conviene exportar ahora (null = se puede): el rango de fechas cambió y aún no se aplicó, o el
        // detalle todavía se está cargando. Así el Excel nunca sale con datos de un período anterior.
        motivoNoExportar() {
            const desde = this.fechaIso(this.fpDesde);
            const hasta = this.fechaIso(this.fpHasta);
            if (desde && hasta && desde > hasta) return "Las fechas no son válidas: la fecha desde es posterior a la fecha hasta.";
            if (this.temporizadorFechas) return "Se está aplicando el nuevo rango de fechas. Espere unos segundos y vuelva a exportar.";
            if (this.temporizadorClientes) return "Se está aplicando el filtro de clientes. Espere unos segundos y vuelva a exportar.";
            if (this.rangoSap && (desde !== this.rangoSap.desde || hasta !== this.rangoSap.hasta))
                return "Las fechas elegidas aún no se han aplicado. Pulse Buscar y espere a que termine la carga antes de exportar.";
            if (this.detalleEnCurso && this.detalleEnCurso.size > 0) return "El detalle todavía se está cargando. Espere a que termine y vuelva a exportar.";
            return null;
        }

        exportarSapDetalle() {
            const bloqueo = this.motivoNoExportar();
            if (bloqueo) {
                alert(bloqueo);
                return;
            }

            const lineas = this.sapFiltradas();
            if (!lineas.length) {
                alert("No hay datos para exportar");
                return;
            }

            // Filtros con los que se genera el archivo: van en el título para ver de inmediato qué contiene.
            const periodo = `${fmtDia(this.rangoSap?.desde) || "inicio"} al ${fmtDia(this.rangoSap?.hasta) || "hoy"}`;
            const textoBusqueda = ($("dd-sapdet-texto")?.value || "").trim();
            const filtros = [
                `Período ${periodo}`,
                `Empresa: ${this.empresaSel || "INNPACK y FARET"}`,
                `Categorías: ${this.categoriasSel.length ? this.categoriasSel.join(", ") : "todas"}`,
                `Clientes: ${this.clientesSel.length ? this.clientesSel.map((c) => `${this.nombreCliente(c)} (${c})`).join(", ") : "todos"}`,
                ...(this.clientesSel.length ? ["Nota: las devoluciones y notas de crédito no se pueden filtrar por cliente (SAP no informa el cliente en esos documentos)"] : []),
                ...(textoBusqueda ? [`Búsqueda: "${textoBusqueda}"`] : []),
                ...(this.hayOcultos() ? [`Ocultos: ${this.ocultosDias.size} día(s) y ${this.ocultosDocs.size} documento(s) (excluidos)`] : []),
            ].join(" · ");
            const slug = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
            const tabla = document.createElement("table");
            tabla.id = "dd-sapdet-export-temp";
            tabla.style.position = "absolute";
            tabla.style.left = "-99999px";
            tabla.style.top = "0";
            tabla.innerHTML =
                "<thead><tr>" + COLUMNAS_SAP_EXCEL.map((c) => `<th>${esc(c.t)}</th>`).join("") + "</tr></thead><tbody>" +
                lineas.map((l) => "<tr>" + COLUMNAS_SAP_EXCEL.map((c) => `<td>${esc(c.v(l) ?? "")}</td>`).join("") + "</tr>").join("") +
                "</tbody>";
            document.body.appendChild(tabla);

            try {
                window.ExcelExporter.exportTable({
                    tableSelector: "#dd-sapdet-export-temp",
                    fileName: `despachos_sap_${this.rangoSap?.desde || "inicio"}_${this.rangoSap?.hasta || "hoy"}_${(this.empresaSel || "todas").toLowerCase()}${this.categoriasSel.length ? "_" + slug(this.categoriasSel.join("-")).slice(0, 60) : ""}${this.clientesSel.length ? "_cliente-" + slug(this.nombreCliente(this.clientesSel[0])).slice(0, 40) + (this.clientesSel.length > 1 ? `-y-${this.clientesSel.length - 1}-mas` : "") : ""}${this.hayOcultos() ? "_personalizado" : ""}_${Date.now()}.xlsx`,
                    sheetName: "Despachos SAP",
                    title: `QCC - Despachos según SAP · ${filtros}`,
                });
            } finally {
                tabla.remove();
            }
        }

        // ---------------------------------------------------------------------------------------------
        //  Ocultar filas (no eliminar): días del resumen diario y documentos del detalle. Funciona como un filtro:
        //  las tarjetas, el resumen diario, la tarjeta EN VIVO (solo lo de hoy), el detalle y el Excel excluyen lo oculto.
        //  Solo se recalculan documentos, pallets y unidades. Se descartan al buscar otro período.
        // ---------------------------------------------------------------------------------------------

        hayOcultos() {
            return this.ocultosDias.size > 0 || this.ocultosDocs.size > 0;
        }

        // Lo que aportan los documentos ocultos de una empresa: los de un día, o (sin fecha) los de todo el período
        // salvo los de días ya ocultos completos, que se restan aparte.
        aporteDocsOcultos(empresa, fecha) {
            const a = { documentos: 0, pallets: 0, unidades: 0 };
            this.ocultosDocs.forEach((d) => {
                if (d.empresa !== empresa) return;
                if (fecha ? d.fecha !== fecha : this.ocultosDias.has(d.fecha)) return;
                a.documentos += 1;
                a.pallets += d.pallets;
                a.unidades += d.unidades;
            });
            return a;
        }

        restar(r, a) {
            const menos = (campo) => Math.max(0, Number(r[campo] || 0) - a[campo]);
            return { ...r, documentos: menos("documentos"), pallets: menos("pallets"), unidades: menos("unidades") };
        }

        resumenDelDia(empresa, fecha) {
            const base = this.diarioActual();
            const e = typeof base === "string" ? null : base.find((x) => x.empresa === empresa);
            return e?.diario?.find((d) => dia(d.fecha) === fecha)?.resumen || {};
        }

        // Resumen del período de una empresa ({ empresa, resumen }) sin los días ni documentos ocultos.
        resumenAjustado(e) {
            const r = e.resumen || {};
            if (!this.hayOcultos()) return r;
            const a = this.aporteDocsOcultos(e.empresa);
            this.ocultosDias.forEach((f) => {
                const d = this.resumenDelDia(e.empresa, f);
                a.documentos += Number(d.documentos || 0);
                a.pallets += Number(d.pallets || 0);
                a.unidades += Number(d.unidades || 0);
            });
            return this.restar(r, a);
        }

        // Ídem para la tarjeta EN VIVO (solo hoy): resta los documentos de hoy que el usuario ocultó.
        resumenHoyAjustado(e) {
            const r = e.resumen || {};
            return this.hayOcultos() ? this.restar(r, this.aporteDocsOcultos(e.empresa, isoLocal(0))) : r;
        }

        ocultarDia(fecha) {
            this.ocultosDias.add(fecha);
            this.avisoOcultos = "";
            this.refrescarOcultos();
        }

        ocultarDoc(clave) {
            const lineas = this.lineasSapActuales().lineas.filter((l) => claveDoc(l) === clave);
            if (!lineas.length) return;
            const p = lineas[0];
            this.ocultosDocs.set(clave, {
                empresa: p.empresa,
                tipo: p.tipo,
                docNum: p.docNum,
                fecha: dia(p.fecha),
                pallets: lineas.reduce((a, l) => a + Number(l.pallets || 0), 0),
                unidades: lineas.reduce((a, l) => a + Number(l.unidades || 0), 0),
            });
            this.avisoOcultos = "";
            this.refrescarOcultos();
        }

        mostrarDia(fecha) {
            this.ocultosDias.delete(fecha);
            this.refrescarOcultos();
        }

        mostrarDoc(clave) {
            this.ocultosDocs.delete(clave);
            this.refrescarOcultos();
        }

        mostrarTodo() {
            this.ocultosDias.clear();
            this.ocultosDocs.clear();
            this.avisoOcultos = "";
            this.refrescarOcultos();
        }

        refrescarOcultos() {
            this.renderOcultos();
            this.renderSapResumen();
            this.renderSapDiario();
            if (this.sapHoy) this.renderSapHoy(false, "");
            this.renderSapDetalle();
        }

        // Aviso fijo arriba mientras haya filas ocultas, con el botón para volver a mostrar cada una.
        renderOcultos() {
            const el = $("dd-ocultos");
            if (!el) return;

            if (!this.hayOcultos()) {
                el.hidden = !this.avisoOcultos;
                el.innerHTML = this.avisoOcultos ? `<div class="dd-ocultos-titulo">${esc(this.avisoOcultos)}</div>` : "";
                return;
            }

            const items = [
                ...[...this.ocultosDias].sort().map((f) => ({ texto: `Día ${fmtDia(f)}`, atributo: "data-mostrar-dia", valor: f })),
                ...[...this.ocultosDocs.entries()].map(([k, d]) => ({
                    texto: `${d.tipo === "GUIA" ? "Guía" : "Factura"} ${d.docNum} · ${d.empresa}`,
                    atributo: "data-mostrar-doc",
                    valor: k,
                })),
            ];
            el.hidden = false;
            el.innerHTML = `
                <div class="dd-ocultos-titulo">
                    ${ICONO_OCULTAR} Vista personalizada: ${this.ocultosDias.size} día(s) y ${this.ocultosDocs.size} documento(s) ocultos.
                    Los totales, las tablas y el Excel los excluyen; no se eliminan.
                    <button type="button" class="btn-secondary" id="dd-mostrar-todo">Mostrar todo</button>
                </div>
                <div class="dd-ocultos-lista">${items
                    .map((i) => `<span class="dd-ocultos-item">${esc(i.texto)} <button type="button" class="dd-link" ${i.atributo}="${esc(i.valor)}">Mostrar</button></span>`)
                    .join("")}</div>`;
        }

        estadoSap(texto) {
            const el = $("dd-sap-estado");
            if (el) el.textContent = texto;
        }

        tarjetaSap(e) {
            const r = e.resumen || {};
            const dev = e.devoluciones || {};
            const lineas = [];

            if (r.documentosEntreEmpresas > 0)
                lineas.push(
                    `<div class="dd-detalle">De ellos, <strong>${num(r.palletsEntreEmpresas)} pallets · ${num(r.unidadesEntreEmpresas)} un.</strong> ` +
                        `(${num(r.documentosEntreEmpresas)} doc.) son ventas a otras empresas del grupo.</div>`
                );

            if (r.documentosMixtos > 0)
                lineas.push(
                    `<div class="dd-detalle">${num(r.documentosMixtos)} documento(s) traen además otras categorías: sus ${num(r.palletsMixtos)} pallets no se atribuyen (las unidades sí).</div>`
                );

            const aparte = [];
            if (r.documentosSinDato > 0)
                aparte.push(`Sin dato de pallets: ${num(r.documentosSinDato)} doc. · ${num(r.unidadesSinDato)} un. (las unidades sí están sumadas)`);
            if (r.documentosNoPallet > 0)
                aparte.push(`Otros embalajes (rollos, cajas, bins): ${num(r.documentosNoPallet)} doc. · ${num(r.unidadesNoPallet)} un.`);
            if (dev.documentos > 0)
                aparte.push(`Devoluciones (informativo, no restadas): ${num(dev.documentos)} doc. · ${num(dev.unidades)} un.`);

            // Con filas ocultas solo se recalculan documentos, pallets y unidades: las notas secundarias no se muestran.
            const personalizada = this.hayOcultos();
            if (personalizada) {
                lineas.length = 0;
                aparte.length = 0;
            }

            const activa = this.empresaSel === e.empresa;
            const atenuada = this.empresaSel !== "" && !activa;
            const clases = `dd-card dd-card-sap dd-card-boton${activa ? " dd-card-activa" : ""}${atenuada ? " dd-card-atenuada" : ""}`;
            const ayuda = activa ? `Clic para volver a ver INNPACK y FARET` : `Clic para ver solo ${e.empresa}`;

            return `
                <div class="${clases}" role="button" tabindex="0" aria-pressed="${activa}" data-empresa-sap="${esc(e.empresa)}" title="${esc(ayuda)}">
                    <div class="dd-card-titulo">DESPACHADO SEGÚN SAP · ${esc(e.empresa)}${this.categoriasSel.length ? ` · ${esc(this.etiquetaCategorias())}` : ""}${this.clientesSel.length ? ` · ${esc(this.etiquetaClientes())}` : ""}</div>
                    <div class="dd-cifras">
                        <div class="dd-cifra-bloque">
                            <span class="dd-cifra">${num(r.pallets)}</span>
                            <span class="dd-etiqueta">Pallets despachados</span>
                        </div>
                        <div class="dd-cifra-bloque">
                            <span class="dd-cifra">${num(r.unidades)}</span>
                            <span class="dd-etiqueta">Unidades despachadas</span>
                        </div>
                    </div>
                    <div class="dd-detalle">${num(r.documentos)} documentos (facturas y guías de despacho)</div>
                    ${lineas.join("")}
                    ${personalizada ? `<div class="dd-aviso">Vista personalizada: hay filas ocultas (ver el aviso de arriba).</div>` : ""}
                    ${e.truncado ? `<div class="dd-aviso">La consulta llegó al tope de filas: los totales podrían estar incompletos.</div>` : ""}
                    ${aparte.length ? `<div class="dd-fuera">${aparte.map(esc).join("<br>")}</div>` : ""}
                </div>`;
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

            const cabecera = this.cabeceraVivo("dd-hoy-actualizar", cargando, error, this.hoy?.hora);

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

        // Cabecera común de las tarjetas "EN VIVO": indicador, hora de la última actualización y botón.
        cabeceraVivo(idBoton, cargando, error, hora) {
            const boton = `<button class="btn-secondary" id="${idBoton}"${cargando ? " disabled" : ""}>${cargando ? "Actualizando..." : "Actualizar"}</button>`;
            const estado = error
                ? `<span class="dd-hoy-error">${esc(error)}${hora ? ` · último dato: ${esc(hora)}` : ""}</span>`
                : hora
                  ? `Actualizado a las ${esc(hora)}`
                  : "";
            return `
                <div class="dd-hoy-cabecera">
                    <span class="dd-vivo"><span class="dd-vivo-punto"></span>EN VIVO · ${esc(fmtDia(isoLocal(0)))}</span>
                    <span class="dd-hoy-estado">${estado}</span>
                    ${boton}
                </div>`;
        }

        // "Despachado hoy (SAP)": pallets y unidades despachados hoy según SAP, por empresa. Independiente del
        // rango de fechas. SAP guarda solo la fecha del documento (sin hora), por eso "hoy" es el día calendario
        // y no una ventana móvil de 24 horas. Conserva el último dato bueno si una actualización falla.
        async cargarSapHoy() {
            const solicitud = ++this.solicitudSapHoy;
            const cliente = this.clientesSel.join(",");
            this.renderSapHoy(true, "");

            const hoy = isoLocal(0);
            const res = await this.enSerieSap(() =>
                solicitud !== this.solicitudSapHoy
                    ? null
                    : window.PhotinoBridge.send({ action: "despachosDiarios.sap.resumen", data: { fechaDesde: hoy, fechaHasta: hoy, cliente } })
            );

            if (res === null || solicitud !== this.solicitudSapHoy) return;

            if (!res || !res.ok) {
                this.renderSapHoy(false, res?.error || "No se pudo actualizar");
                return;
            }

            const d = res.data || {};
            const errores = (d.errors || []).map((e) => `${e.empresa}: ${e.mensaje}`).join(" · ");
            this.sapHoy = { empresas: d.empresas || [], hora: new Date().toLocaleTimeString("es-CL") };
            this.renderSapHoy(false, errores);

            // Con categorías elegidas, la tarjeta pide además el conjunto de hoy (consulta de un solo día, en cola).
            if (this.categoriasSel.length) await this.cargarSeleccionHoy();
        }

        renderSapHoy(cargando, error) {
            const el = $("dd-sap-hoy");
            if (!el) return;

            const cabecera = this.cabeceraVivo("dd-sap-hoy-actualizar", cargando, error, this.sapHoy?.hora);
            const envolver = (contenido) => `<div class="dd-card dd-card-hoy dd-card-sap-hoy">${cabecera}${contenido}</div>`;

            if (!this.sapHoy) {
                el.innerHTML = envolver(`<div class="dd-detalle">${cargando ? "Cargando..." : "Sin datos de hoy."}</div>`);
                return;
            }

            // Si el usuario ocultó el día de hoy en "Despachado por día", la tarjeta lo dice en vez de mostrar solo ceros.
            if (this.ocultosDias.has(isoLocal(0))) {
                el.innerHTML = envolver(
                    `<div class="dd-detalle">Hoy está oculto (vista personalizada), por eso no se suma nada. Use «Mostrar» en el aviso de arriba para volver a verlo.</div>`
                );
                return;
            }

            let base = this.sapHoy.empresas;
            if (this.categoriasSel.length) {
                const sel = this.estadoSeleccion(this.sapHoySel);
                if (sel.estado !== "ok") {
                    el.innerHTML = envolver(`<div class="dd-detalle">${esc(sel.mensaje)}</div>`);
                    return;
                }
                base = sel.empresas;
            }
            const empresas = [...base]
                .filter((e) => !this.empresaSel || e.empresa === this.empresaSel)
                .sort((a, b) => String(a.empresa).localeCompare(String(b.empresa)));
            if (!empresas.some((e) => (e.resumen?.documentos || 0) > 0)) {
                el.innerHTML = envolver(
                    `<div class="dd-detalle">Aún no hay documentos${this.categoriasSel.length ? ` de ${esc(this.etiquetaCategorias())}` : ""}${this.clientesSel.length ? ` de ${esc(this.etiquetaClientes())}` : ""} despachados hoy en SAP.</div>`
                );
                return;
            }

            // Si el usuario ocultó en el detalle todos los documentos de hoy, la tarjeta lo dice en vez de mostrar ceros.
            const hoy = isoLocal(0);
            if (!empresas.some((e) => this.resumenHoyAjustado(e).documentos > 0)) {
                const oc = empresas.reduce(
                    (a, e) => {
                        const o = this.aporteDocsOcultos(e.empresa, hoy);
                        return { documentos: a.documentos + o.documentos, pallets: a.pallets + o.pallets, unidades: a.unidades + o.unidades };
                    },
                    { documentos: 0, pallets: 0, unidades: 0 }
                );
                el.innerHTML = envolver(
                    `<div class="dd-detalle">Todos los documentos despachados hoy están ocultos (vista personalizada): ${num(oc.documentos)} doc. · ${num(oc.pallets)} pallets · ${num(oc.unidades)} un. Use «Mostrar» en el aviso de arriba para volver a sumarlos.</div>`
                );
                return;
            }

            const bloques = empresas
                .map((e) => {
                    const ocultos = this.aporteDocsOcultos(e.empresa, hoy);
                    const ajustada = ocultos.documentos > 0; // con documentos de hoy ocultos, las notas secundarias ya no cuadran: no se muestran
                    const r = this.resumenHoyAjustado(e);
                    const entre =
                        !ajustada && r.documentosEntreEmpresas > 0
                            ? `<div class="dd-detalle">${num(r.palletsEntreEmpresas)} pallets · ${num(r.unidadesEntreEmpresas)} un. a otras empresas del grupo (incluidos)</div>`
                            : "";
                    const sinDato =
                        !ajustada && r.documentosSinDato > 0
                            ? `<div class="dd-detalle">${num(r.documentosSinDato)} doc. sin dato de pallets (sus unidades sí cuentan)</div>`
                            : "";
                    const mixtos =
                        !ajustada && r.documentosMixtos > 0
                            ? `<div class="dd-detalle">${num(r.documentosMixtos)} doc. mezclan categorías: sus ${num(r.palletsMixtos)} pallets no se atribuyen (las unidades sí)</div>`
                            : "";
                    return `
                        <div class="dd-sap-hoy-bloque">
                            <div class="dd-card-titulo">${esc(e.empresa)}</div>
                            <div class="dd-cifras">
                                <div class="dd-cifra-bloque">
                                    <span class="dd-cifra">${num(r.pallets)}</span>
                                    <span class="dd-etiqueta">Pallets despachados</span>
                                </div>
                                <div class="dd-cifra-bloque">
                                    <span class="dd-cifra">${num(r.unidades)}</span>
                                    <span class="dd-etiqueta">Unidades despachadas</span>
                                </div>
                            </div>
                            <div class="dd-detalle">${num(r.documentos)} documentos (facturas y guías de despacho)</div>
                            ${entre}${sinDato}${mixtos}
                            ${ajustada ? `<div class="dd-detalle">Vista personalizada: ${num(ocultos.documentos)} doc. de hoy oculto(s) (${num(ocultos.pallets)} pallets · ${num(ocultos.unidades)} un. no sumados)</div>` : ""}
                        </div>`;
                })
                .join("");

            el.innerHTML = envolver(
                `<div class="dd-card-titulo">DESPACHADO HOY SEGÚN SAP${this.categoriasSel.length ? ` · ${esc(this.etiquetaCategorias())}` : ""}${this.clientesSel.length ? ` · ${esc(this.etiquetaClientes())}` : ""} (día calendario, no depende del período)</div><div class="dd-sap-hoy-grid">${bloques}</div>`
            );
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
