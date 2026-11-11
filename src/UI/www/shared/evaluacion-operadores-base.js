// Evaluación de Calidad por Operador (solo lectura, indicador descriptivo). Lógica ÚNICA para INNPACK
// (modules/evaluacion-operadores) y FARET (modules/faret-evaluacion-operadores): cada módulo solo pasa su
// configuración (acción del backend, auditoría FPS, textos). Mismo patrón que shared/formularios-base.js.
// Todo el cálculo (inclusión/exclusión/puntos) ocurre en el backend; acá solo se muestra.
// No hay nota, porcentaje ni ranking. Ver docs/analisis_evaluacion_calidad_operador_20261110/.
if (!window.EvaluacionOperadoresBase) {
    class EvaluacionOperadoresBase {
        constructor(config = {}) {
            this._cfg = {
                accion: "evaluacionOperadores.resumen",
                // null = el módulo no tiene auditoría histórica local; se muestra el estado de la comparación FPS que informa el backend.
                accionAuditoria: "evaluacionOperadores.auditoria.resumen",
                textoSinUniverso: "Sin resultados: no hay no conformidades de producto registradas.",
                etiquetaOrigen: "No Conformidades",
                etiquetaReferencia: "NC",
                ...config,
            };
            this._charts = {};
            this._onChange = null;
            this._onClick = null;
            this._opcionesCargadas = false;
            this._seq = 0;
        }

        async init() {
            this._bind();
            await this._cargar();
            if (this._cfg.accionAuditoria) this._cargarAuditoria(); // sección independiente: si falla o no existe, el resto del módulo sigue igual
        }

        destroy() {
            Object.values(this._charts).forEach(c => { try { c.destroy(); } catch { /* sin gráfico */ } });
            this._charts = {};
            if (this._onChange) document.removeEventListener("change", this._onChange);
            if (this._onClick) document.removeEventListener("click", this._onClick);
            this._onChange = this._onClick = null;
        }

        _bind() {
            const ids = ["evop-anio", "evop-mes", "evop-maquina", "evop-area", "evop-operador"];
            this._onChange = e => { if (ids.includes(e.target.id)) this._cargar(); };
            this._onClick = e => { if (e.target.id === "evop-limpiar") this._limpiar(); };
            document.addEventListener("change", this._onChange);
            document.addEventListener("click", this._onClick);
        }

        _limpiar() {
            ["evop-anio", "evop-mes", "evop-maquina", "evop-area", "evop-operador"].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = "";
            });
            this._cargar();
        }

        _esc(v) {
            return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
        }

        _val(id) { return (document.getElementById(id)?.value || "").trim(); }

        _estado(msg, tipo) {
            const el = document.getElementById("evop-estado");
            const cont = document.getElementById("evop-contenido");
            if (!el || !cont) return;
            if (!msg) { el.style.display = "none"; return; }
            el.textContent = msg;
            el.className = "evop-estado" + (tipo === "error" ? " evop-error" : "");
            el.style.display = "block";
            if (tipo !== "datos") cont.style.display = "none";
        }

        async _cargar() {
            const seq = ++this._seq;
            this._estado("Cargando…");
            const payload = { action: this._cfg.accion };
            const anio = this._val("evop-anio"), mes = this._val("evop-mes");
            if (anio) payload.anio = Number(anio);
            if (mes) payload.mes = Number(mes);
            if (this._val("evop-maquina")) payload.maquina = this._val("evop-maquina");
            if (this._val("evop-area")) payload.area = this._val("evop-area");
            if (this._val("evop-operador")) payload.operador = this._val("evop-operador");

            let res;
            try {
                res = await window.PhotinoBridge.send(payload);
            } catch {
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
            const d = res.data && res.data.resultado ? res.data.resultado : res.data;
            const priv = document.getElementById("evop-privacidad");
            if (priv) priv.style.display = res.data && res.data.nombresVisibles === false ? "block" : "none";
            this._render(d);
            if (!this._cfg.accionAuditoria) this._renderFps(res.data && res.data.fps);
        }

        // Sin auditoría local (Faret): estado explícito de la comparación con FPS, nunca cifras inventadas.
        _renderFps(fps) {
            const box = document.getElementById("evop-auditoria");
            if (!box) return;
            box.style.display = "block";
            const motivo = fps && fps.motivo ? fps.motivo : "Sin información de FPS.";
            box.innerHTML = `<h3>Comparación con producción (FPS)</h3><div class="evop-estado">${this._esc(motivo)} Mientras tanto, el operador de cada registro es el declarado por Calidad (texto libre) y ninguna atribución está confirmada.</div>`;
        }

        // ---- Auditoría histórica FPS (solo agregados y datos de NC; nunca nombres)
        async _cargarAuditoria() {
            const box = document.getElementById("evop-auditoria");
            if (!box) return;
            let res;
            try { res = await window.PhotinoBridge.send({ action: "evaluacionOperadores.auditoria.resumen" }); }
            catch { return; }
            box.style.display = "block";
            if (!res || !res.ok) {
                box.innerHTML = `<h3>Auditoría histórica FPS</h3><div class="evop-adv">No se pudo leer la auditoría${res && res.error ? ": " + this._esc(res.error) : ""}.</div>`;
                return;
            }
            if (!res.data || !res.data.disponible) {
                box.innerHTML = `<h3>Auditoría histórica FPS</h3><div class="evop-estado">Aún no hay auditoría histórica cargada. El módulo funciona sin ella, pero sin ella no se puede comprobar la atribución de las NC contra producción.</div>`;
                return;
            }
            this._renderAuditoria(box, res.data.auditoria);
        }

        _n(v) { return Number(v || 0).toLocaleString("es-CL"); }

        _renderAuditoria(box, a) {
            const p = a.producto || {}, i = a.internas || {}, c = a.cobertura || {};
            const k = (label, val, nota) => `<div class="kpi-card"><div class="kpi-label">${label}${nota ? `<small>${nota}</small>` : ""}</div><div class="kpi-value">${val}</div></div>`;
            const etiqueta = { CONFIRMADA: "Confirmada", PROBABLE: "Probable", NO_ATRIBUIBLE: "No atribuible" };
            const razones = {
                maquina_no_coincide: "La máquina de la NC no figura entre las del NP",
                sin_maquina_nc: "La NC no tiene máquina",
                sin_fecha_fabricacion: "La NC no tiene fecha de fabricación",
                fecha_fuera_del_periodo_de_fabricacion_del_np: "La fecha de la NC está fuera del período de fabricación del NP",
                fecha_fuera_de_ventana_de_sesion: "Ninguna sesión de esa máquina cubre la fecha",
                sin_ventana_maquina_fecha: "Sin sesión en esa máquina y fecha",
                sin_operador_nc: "La NC no indica operador",
                operador_nc_no_coincide_con_fps: "El operador de la NC no coincide con producción",
                varios_participantes: "Varios operadores participaron",
                np_presente_pero_sin_coincidencia_de_maquina_ni_fecha: "Sin coincidencia de máquina ni de fecha",
            };
            const motivo = lista => (lista || []).filter(x => razones[x]).slice(0, 2).map(x => razones[x]).join(" · ") || "—";
            const filas = (a.ncProducto || []).map(n => `<tr>
                <td>${this._esc(n.id)}</td><td>${this._esc(n.nivelNc)}</td><td>${this._esc(n.np)} <small>(${n.llave === "NV" ? "NV Innpack" : "NP"})</small></td>
                <td>${this._esc(n.maquina)}</td><td>${this._esc(n.fechaFabricacion || "sin fecha")}</td>
                <td>${this._n(n.operadoresNp)}</td><td>${this._n(n.participantesEnMaquinaYFecha)}</td>
                <td><span class="evop-chip evop-chip-${this._esc(n.atribucion)}">${etiqueta[n.atribucion] || "—"}</span></td>
                <td class="evop-motivo">${this._esc(motivo(n.razones))}</td></tr>`).join("");
            box.innerHTML = `
                <h3>Auditoría histórica FPS <small>(generada ${this._esc(a.generado)} · solo lectura · sin nombres de personas)</small></h3>
                <div class="evop-adv evop-adv-fuerte">Coincidir en un NP <strong>no</strong> significa participar, y participar <strong>no</strong> significa ser responsable. Solo una atribución <strong>confirmada</strong> (misma máquina y fecha, un único operador y que coincida con el de la NC) podría penalizar; hoy hay <strong>${this._n(p.confirmada)}</strong>.</div>
                <h4>Cobertura del historial de producción</h4>
                <div class="kpi-row evop-kpis">
                    ${k("Período FPS", `${this._esc(c.desde)} → ${this._esc(c.hasta)}`, `${this._n(c.meses)} meses`)}
                    ${k("Sesiones de fabricación", this._n(c.sesiones), "registros")}
                    ${k("Operadores por mes (máx.)", this._n(c.operadoresMaxMes))}
                    ${k("Sesiones sin operador", this._n((c.sinOperador || 0) + (c.operadorGenerico || 0)), "vacío o genérico")}
                </div>
                <h4>NC de producto frente al historial <small>(1 · coincidencia de NP → 2 · participación → 3 · responsabilidad)</small></h4>
                <div class="kpi-row evop-kpis">
                    ${k("NC de producto", this._n(p.nc), "analizadas")}
                    ${k("1 · NP/NV en FPS", `${this._n(p.np_presente_en_fps)} / ${this._n(p.nc)}`, "coincidencia de número")}
                    ${k("2 · Con operadores asociados al NP", `${this._n(p.con_operadores_asociados_al_np)} / ${this._n(p.nc)}`, "participación general, no atribuible")}
                    ${k("Máquina coincidente", `${this._n(p.con_maquina_coincidente)} / ${this._n(p.nc)}`)}
                    ${k("Fecha dentro del período del NP", `${this._n(p.fecha_dentro_del_periodo_del_np)} / ${this._n(p.nc)}`)}
                    ${k("3 · Atribución confirmada", this._n(p.confirmada), "única que podría penalizar")}
                    ${k("Probables", this._n(p.probable), "solo contexto, sin puntos")}
                    ${k("No atribuibles", this._n(p.no_atribuible))}
                </div>
                <div class="table-container"><table class="table evop-tabla-sep">
                    <thead><tr><th>NC</th><th>Nivel</th><th>NP / NV</th><th>Máquina (NC)</th><th>Fecha fabricación</th><th>Operadores en el NP</th><th>Participantes en máquina y fecha</th><th>Atribución</th><th>Motivo</th></tr></thead>
                    <tbody>${filas || `<tr><td colspan="9">Sin NC de producto.</td></tr>`}</tbody>
                </table></div>
                <h4>NC internas <small>(contexto, no se suman a la evaluación de operadores)</small></h4>
                <div class="evop-adv">${this._n(i.nc)} NC internas: ${this._n(i.np_presente_en_fps)} con su NP en FPS. Ninguna registra máquina, operador ni fecha de fabricación, y cada NP involucra a muchos operadores, por lo que <strong>no pueden atribuirse a personas</strong>.</div>`;
            this._renderTrazabilidad(box, a);
        }

        // ---- Trazabilidad por NC y responsabilidad PROPUESTA (snapshot v2). Nada de esto es una penalización confirmada.
        _renderTrazabilidad(box, a) {
            if (!a.ncDetalle || !a.ncDetalle.length) return;
            const esc = x => this._esc(x), n2 = v => Number(v || 0).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const escen = { 1: "1 · Operador único", 2: "2 · Varios, horario fiable", 3: "3 · Compartida provisional", 4: "4 · Pendiente de investigación" };
            const razon = {
                maquina_nc_sin_equivalencia_validada_en_fps: "La máquina de la NC no tiene equivalencia validada en FPS",
                maquina_no_usada_por_el_documento: "El documento no usó esa máquina",
                sin_maquina_nc: "La NC no tiene máquina", sin_fecha_en_la_nc: "La NC no tiene fecha",
                fecha_nc_fuera_de_las_sesiones_de_la_maquina_posible_fecha_de_deteccion: "La fecha de la NC no cae en sesiones de esa máquina (posible fecha de detección)",
                unico_operador_en_documento_y_maquina: "Un único operador en ese documento y máquina",
                varios_operadores_solo_sesiones_que_cubren_la_ventana: "Solo se consideran las sesiones que cubren la fecha",
                responsabilidad_compartida_entre_simultaneos: "Operadores simultáneos comparten la responsabilidad",
                responsabilidad_compartida_provisional_reparto_equitativo: "Reparto equitativo provisional entre los operadores elegibles",
                documento_no_encontrado_en_fps: "El documento no existe en FPS", np_compartido_entre_empresas: "NP compartido entre empresas",
                nc_eliminada_o_rectificada_revisar_asignaciones: "NC eliminada/rectificada: revisar asignaciones",
                operador_declarado_en_la_nc_corroborado_por_fps: "El operador declarado por Calidad en la NC participó en esa máquina/proceso según FPS",
                operador_declarado_no_figura_en_fps: "El operador declarado en la NC no figura en las sesiones FPS del documento: las fuentes se contradicen",
                operador_declarado_no_opero_la_maquina_de_la_nc: "El operador declarado trabajó en el documento pero no en la máquina/proceso de la NC",
                producto_de_la_nc_acota_a_las_sesiones_del_mismo_codigo: "El código de producto de la NC acota a las sesiones FPS que fabricaron ese mismo código",
                otros_operadores_fabricaron_el_mismo_producto_en_la_misma_maquina: "Otros operadores fabricaron el mismo código en la misma máquina (el declarado no es exclusivo)",
                operador_declarado_no_fabrico_el_producto_de_la_nc: "El operador declarado operó la máquina pero no fabricó ese código de producto",
                propuesta_apoyada_solo_en_el_nombre_declarado: "La propuesta se apoya únicamente en el nombre declarado en la NC",
                maquina_nc_sin_equivalencia_en_fps: "La máquina de la NC no tiene equivalencia verificable en las OT del documento",
                fecha_nc_fuera_del_periodo_de_la_maquina_no_se_usa_para_descartar: "La fecha de la NC no coincide con el período de la máquina; no se usa para descartar operadores",
                maquina_por_equivalencia_sugerida_no_validada: "Máquina emparejada por equivalencia SUGERIDA (no validada por Producción/Calidad)",
                fecha_de_fabricacion_posterior_al_registro_dato_incoherente: "La fecha de fabricación de la NC es posterior a su propio registro (dato incoherente)",
                sesiones_que_cubren_la_fecha_son_demasiado_largas_horario_no_fiable: "Las sesiones que cubren la fecha duran más de 16 h (no ubican el defecto)",
            };
            const lis = l => (l || []).map(x => `<li>${esc(razon[x] || x)}</li>`).join("") || "<li>—</li>";
            const ops = (l, conPuntos) => (l || []).map(o => `<tr><td>${esc(o.operador)}</td><td class="num">${this._n(o.sesiones)}</td><td class="num">${this._n(o.cantidad)}</td><td>${esc(o.desde)} → ${esc(o.hasta)}</td><td>${esc((o.maquinas || []).join(" / "))}</td>${conPuntos ? `<td class="num">${n2(o.puntosPropuestos)}</td>` : ""}</tr>`).join("");
            const tabla = (l, conPuntos) => `<div class="table-container"><table class="table evop-tabla-sep"><thead><tr><th>Operador</th><th class="num">Sesiones</th><th class="num">Cantidad</th><th>Período</th><th>Máquinas</th>${conPuntos ? '<th class="num">Puntos propuestos</th>' : ""}</tr></thead><tbody>${ops(l, conPuntos) || `<tr><td colspan="${conPuntos ? 6 : 5}">Sin operadores.</td></tr>`}</tbody></table></div>`;
            const declEtiqueta = { CORROBORADO: "Corroborado por FPS", NO_ENCONTRADO: "No figura en FPS", FUERA_DE_MAQUINA: "Operó otra máquina/proceso", FUERA_DE_PRODUCTO: "No fabricó ese producto", AMBIGUO: "Texto ambiguo (no se usa)", DECLARADO: "Declarado", SIN_DECLARAR: "Sin operador declarado" };
            const eqEtiqueta = { EXACTA: "Exacta", VALIDADA: "Validada", SUGERIDA: "Sugerida (no validada)", NINGUNA: "Sin equivalencia" };
            const estEtiqueta = { PROPUESTO: "Incluido", EXCLUIDO: "Excluido", CONTEXTO: "Contexto" };
            const concEt = { CONFIRMADA: "Confirmada", PROBABLE: "Probable", DISCREPANCIA: "Discrepancia", INSUFICIENTE: "Info insuficiente" };
            const dimEt = { documento: "Documento", producto: "Producto (código)", maquina: "Máquina", proceso: "Proceso", operador: "Operador", registro: "Operador al registrar", ocurrencia: "Documento en la máquina" };
            const varEt = { VARIANTE_ORTOGRAFICA: "posible variante de escritura", APELLIDO_COINCIDE: "comparte apellido, nombre de pila distinto (puede ser otra persona)" };
            const concPanel = n => {
                const c = n.conciliacion;
                if (!c) return "";
                const filas = (c.dimensiones || []).map(x => `<tr><td>${esc(dimEt[x.dimension] || x.dimension)}</td><td>${esc(x.calidad || "—")}</td><td>${esc(x.fps || "—")}</td><td><span class="evop-chip evop-conc-${esc(x.estado)}">${esc(concEt[x.estado] || x.estado)}</span></td><td class="evop-motivo">${esc(x.detalle || "")}</td></tr>`).join("");
                const vars = (n.variantesNombre || []).length ? `<div class="evop-adv"><strong>Posibles variantes del nombre declarado en FPS (no corroboran):</strong> ${n.variantesNombre.map(v => `${esc(v.operador)} — ${esc(varEt[v.tipo] || v.tipo)}${(v.procesos || []).length ? " · " + esc(v.procesos.join(", ")) : ""}`).join("; ")}</div>` : "";
                const alt = n.alternativaFps ? `<div class="evop-adv">Hipótesis informativa (<strong>no suma a los totales</strong>): si Calidad aceptara la evidencia FPS en vez del operador declarado, ${esc((n.alternativaFps.nota || "").toLowerCase())} → ${n.alternativaFps.operadores.map(o => `${esc(o.operador)} ${n2(o.puntosHipoteticos)} pts`).join(", ")}. Confianza baja; requiere decisión de Calidad.</div>` : "";
                const apoyo = n.apoyoUnicoNombreDeclarado ? '<div class="evop-adv evop-adv-fuerte">Esta propuesta depende <strong>únicamente del nombre declarado</strong> en la NC: nada más en FPS excluye a los otros operadores de esa máquina.</div>' : "";
                const ea = n.evidenciaAmpliada;
                const hist = !ea ? "" : `<h4>Historial FPS fuera del documento <small>(dónde más se fabricó el código de producto y quién operaba la máquina al registrarse la NC)</small></h4>
                    ${ea.lectura ? `<div class="evop-adv">${esc(ea.lectura)}</div>` : ""}
                    <div class="table-container"><table class="table evop-tabla-sep"><thead><tr><th>Dato</th><th>Detalle</th></tr></thead><tbody>
                    <tr><td>Operadores de la máquina el ${esc(ea.fechaRegistro || "—")} (registro de la NC)</td><td>${(ea.operadoresEnFechaRegistro || []).map(o => `${esc(o.operador)} (${this._n(o.sesiones)} ses.; ${esc((o.procesos || []).join(", "))})`).join("; ") || "sin sesiones en los datos consultados"}</td></tr>
                    <tr><td>Otros documentos donde se fabricó el código</td><td>${(ea.productoEnOtrosDocumentos || []).map(x => `${esc(x.mes)} · ${esc(x.proceso)} · ${esc(x.maquina)} · ${this._n(x.sesiones)} ses. · ${(x.operadores || []).map(esc).join(", ")}`).join("<br>") || "ninguno en los datos consultados"}</td></tr>
                    </tbody></table></div>`;
                return `<h4>Comparación Calidad ↔ FPS <small>(cada fuente conserva su dato; ninguna sobrescribe a la otra)</small> <span class="evop-chip evop-conc-${esc(c.estado)}">${esc(concEt[c.estado] || c.estado)}</span></h4>
                    <div class="table-container"><table class="table evop-tabla-sep"><thead><tr><th>Dato</th><th>Calidad declara</th><th>FPS registra</th><th>Estado</th><th>Por qué</th></tr></thead><tbody>${filas}</tbody></table></div>${apoyo}${vars}${alt}${hist}`;
            };
                        const partTabla = l => `<div class="table-container"><table class="table evop-tabla-sep"><thead><tr><th>Operador</th><th>Estado</th><th class="num">Sesiones</th><th class="num">Cantidad</th><th>Máquinas</th><th>Procesos</th><th>Por qué</th></tr></thead><tbody>${(l || []).map(o => `<tr><td>${esc(o.operador)}</td><td><span class="evop-chip evop-est-${esc(o.estado)}">${esc(estEtiqueta[o.estado] || "Contexto")}</span></td><td class="num">${this._n(o.sesiones)}</td><td class="num">${this._n(o.cantidad)}</td><td>${esc((o.maquinas || []).join(" / "))}</td><td>${esc((o.procesos || []).join(", "))}</td><td class="evop-motivo">${esc(o.motivo || "")}</td></tr>`).join("") || '<tr><td colspan="7">Sin operadores.</td></tr>'}</tbody></table></div>`;
            const hf = v => (v ? esc(String(v).slice(5)) : "—");
            const sesionesTabla = l => {
                const f = (l || []).flatMap(o => (o.sesionesDetalle || []).map(z => `<tr><td>${esc(o.operador)}</td><td>${esc(z.ot)}</td><td>${esc(z.proceso)}</td><td>${esc(z.maquina)}</td><td>${hf(z.inicio)}</td><td>${hf(z.prodInicio)}</td><td>${hf(z.fin)}</td><td class="num">${this._n(z.cantidad)}</td><td>${esc(z.cierre || "—")}${z.larga ? " · <b>sesión larga</b>" : ""}${z.editadoPorOtro ? " · editada por otro usuario" : ""}${z.comentario ? " · con comentario" : ""}</td></tr>`));
                if (!f.length) return "";
                return `<h4>Sesiones de los operadores propuestos <small>(inicio de setup · inicio de producción · término; hasta 20 por operador)</small></h4><div class="table-container"><table class="table evop-tabla-sep"><thead><tr><th>Operador</th><th>OT</th><th>Proceso</th><th>Máquina</th><th>Inicio setup</th><th>Inicio producción</th><th>Término</th><th class="num">Cantidad</th><th>Cierre / observaciones</th></tr></thead><tbody>${f.join("")}</tbody></table></div>`;
            };
            const otTabla = l => !(l && l.length) ? "" : `<h4>OT del documento <small>(todas las OT de la NV; la máquina de la NC solo corresponde a algunas)</small></h4><div class="table-container"><table class="table evop-tabla-sep"><thead><tr><th>OT</th><th>Proceso</th><th>Máquinas</th><th class="num">Sesiones</th><th class="num">Operadores</th><th class="num">Cantidad</th><th>Período</th><th class="num">Sesiones largas</th></tr></thead><tbody>${l.map(z => `<tr><td>${esc(z.ot)}</td><td>${esc(z.proceso || "—")}</td><td>${esc((z.maquinas || []).join(" / "))}</td><td class="num">${this._n(z.sesiones)}</td><td class="num">${this._n(z.operadores)}</td><td class="num">${this._n(z.cantidad)}</td><td>${hf(z.desde)} → ${hf(z.hasta)}</td><td class="num">${this._n(z.sesionesLargas)}</td></tr>`).join("")}</tbody></table></div>`;
            const filas = a.ncDetalle.map((n, i) => `<tr class="evop-fila-nc" data-i="${i}" tabindex="0">
                <td>${esc(n.id)}</td><td>${esc(n.nivelNc)}</td><td>${esc(n.np)} <small>(${n.llave === "NV" ? "NV Innpack" : "NP"})</small></td><td>${esc(n.maquinaNc || "—")}</td>
                <td class="num">${this._n((n.ots || []).length)}</td><td class="num">${this._n((n.operadores || []).length)}</td>
                <td><span class="evop-chip evop-esc-${n.escenario}">${esc(escen[n.escenario])}</span></td><td>${esc(n.confianza === "SIN_EVIDENCIA" ? "Sin evidencia" : n.confianza)}</td>
                <td class="num">${n2(n.puntosAsignados)}</td><td>Pendiente de Calidad</td></tr>`).join("");
            const ind = (a.indicadores || []).slice(0, 15).map(o => `<tr><td>${esc(o.operador)}</td><td class="num">${this._n(o.participacionNc)}</td><td class="num">${n2(o.propuestaPuntos)}</td><td class="num">${n2(o.confirmadaPuntos)}</td></tr>`).join("");
            const e4 = a.escenarios || {};
            const div = document.createElement("div");
            div.className = "evop-traza";
            div.innerHTML = `
                ${(a.equivalenciasMaquinas || []).length ? `<h4>Equivalencias de máquina verificadas con el catálogo FPS <small>(dbo.ZZZListaMaquina; el identificador FPS coincide con el de las sesiones)</small></h4>
                <div class="table-container"><table class="table evop-tabla-sep"><thead><tr><th>Máquina en Calidad</th><th>Máquina FPS</th><th>Id FPS</th><th>Proceso</th><th>Estado</th><th>NC</th><th>Pendiente</th></tr></thead><tbody>${a.equivalenciasMaquinas.map(e => `<tr><td>${esc(e.maquinaCalidad)}</td><td>${esc(e.maquinaFps || "—")}</td><td>${esc(e.idFps || "—")}</td><td>${esc(e.proceso || "—")}</td><td><span class="evop-chip evop-conc-${e.estado === "EXACTA" || e.estado === "UNICA" ? "CONFIRMADA" : e.estado === "AMBIGUA" ? "PROBABLE" : "INSUFICIENTE"}">${e.estado === "EXACTA" ? "Nombre exacto" : e.estado === "UNICA" ? "Única en catálogo" : e.estado === "AMBIGUA" ? "Ambigua" : "Sin equivalencia"}</span></td><td>${esc((e.ncs || []).join(", "))}</td><td class="evop-motivo">${esc((e.pendientes || []).join(" · ") || "—")}</td></tr>`).join("")}</tbody></table></div>` : ""}
                <h4>Trazabilidad y responsabilidad propuesta por NC <small>(histórico generado ${esc(a.generado)} · no es tiempo real)</small></h4>
                <div class="evop-adv evop-adv-fuerte">Participar <strong>no</strong> es ser responsable. Toda asignación es una <strong>propuesta provisional</strong> pendiente de validación de Calidad; ninguna es una penalización confirmada.
                Propuestas: ${this._n(e4["1"])} individuales · ${this._n(e4["2"])} con horario fiable · ${this._n(e4["3"])} compartidas · ${this._n(e4["4"])} sin evidencia suficiente.</div>
                <div class="table-container"><table class="table evop-tabla-sep"><thead><tr><th>NC</th><th>Nivel</th><th>NP / NV</th><th>Máquina (NC)</th><th class="num">OT</th><th class="num">Operadores propuestos</th><th>Escenario</th><th>Confianza</th><th class="num">Puntos propuestos</th><th>Estado Calidad</th></tr></thead>
                <tbody>${filas}</tbody></table></div>
                <div id="evop-traza-detalle" class="evop-traza-detalle" style="display:none"></div>
                <h4>Tres indicadores independientes <small>(A participación · B propuesta provisional · C confirmada por Calidad)</small></h4>
                <div class="table-container"><table class="table evop-tabla-sep"><thead><tr><th>Operador</th><th class="num">A · NC en que participó</th><th class="num">B · Puntos propuestos</th><th class="num">C · Puntos confirmados</th></tr></thead>
                <tbody>${ind || '<tr><td colspan="4">Sin datos.</td></tr>'}</tbody></table></div>
                <div class="evop-adv">C es 0 hasta que Calidad confirme explícitamente; no hay ranking punitivo con datos no confirmados.</div>`;
            box.appendChild(div);
            const abrir = i => {
                const n = a.ncDetalle[i], d = div.querySelector("#evop-traza-detalle");
                d.style.display = "block";
                d.innerHTML = `<h4>Detalle NC ${esc(n.id)} · ${esc(n.nivelNc)} · ${n2(n.puntosSeveridad)} puntos de severidad</h4>
                    <div class="evop-grid-det">
                        <div><strong>Documento</strong><br>${esc(n.llave === "NV" ? "NV Innpack" : "NP")} ${esc(n.np)}${n.documento && n.documento.enMaestro ? ` → NP Faret ${esc(n.documento.np)} · ${esc(n.documento.estado)} · ingreso ${esc(n.documento.ingreso)}, entrega ${esc(n.documento.entrega)}` : ""}<br>${this._n(n.sesionesDocumento)} sesiones FPS · período ${esc(n.periodoDocumento || "—")}<br>${this._n((n.ots || []).length)} OT</div>
                        <div><strong>Máquina</strong><br>NC: ${esc(n.maquinaNc || "—")}<br>FPS: ${esc((n.maquinasDocumento || []).join(" / ") || "—")}<br>Confirmada: ${n.maquinaConfirmada ? "sí" : "no"}</div>
                        <div><strong>Fechas</strong><br>Fabricación según NC: ${esc(n.fechaFabricacionNc || "sin fecha")}<br>Registro de la NC: ${esc(n.fechaRegistroNc || "—")}${n.diasRegistroTrasFabricacion ? ` (${this._n(n.diasRegistroTrasFabricacion)} días después)` : ""}<br>Horario fiable: ${n.ventanaFiable ? "sí" : "no"}</div>
                        <div><strong>Revisión</strong><br>Estado: pendiente de validación de Calidad${n.revisarVigencia ? "<br><b>NC eliminada o rectificada: revisar asignaciones</b>" : ""}<br>Operador declarado en la NC: ${esc(n.operadorDeclaradoNc === "SI" ? "sí (no confirmado)" : "no")}</div>
                    </div>
                    ${concPanel(n)}
                    <h4>Operadores propuestos (${esc(escen[n.escenario])}, confianza ${esc(n.confianza)})</h4>${tabla(n.operadores, true)}
                    ${(n.contradicciones || []).length ? `<div class="evop-adv"><strong>Contradicciones / avisos de datos</strong><ul>${n.contradicciones.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
                    ${n.aliasSugerido ? '<div class="evop-adv evop-adv-fuerte">La máquina de la NC se emparejó con la de FPS por una <strong>equivalencia sugerida no validada</strong>; la confianza se limita a BAJA hasta que Producción/Calidad la valide.</div>' : ""}
                    ${sesionesTabla(n.operadores)}
                    <h4>Participación: todos los operadores del documento <small>(por qué cada uno fue incluido o excluido; participar no es ser responsable)</small></h4>${partTabla(n.participantesContexto)}
                    ${otTabla(n.otDetalle)}
                    <div class="evop-det-col"><div><strong>Criterio aplicado</strong><ul>${lis(n.razones)}</ul></div><div><strong>Evidencia que falta</strong><ul>${lis(n.evidenciaFaltante)}</ul></div></div>`;
                d.scrollIntoView({ block: "nearest" });
            };
            div.querySelectorAll(".evop-fila-nc").forEach(tr => {
                tr.addEventListener("click", () => abrir(Number(tr.dataset.i)));
                tr.addEventListener("keydown", e => { if (e.key === "Enter") abrir(Number(tr.dataset.i)); });
            });
        }

        _poblarOpciones(op) {
            if (this._opcionesCargadas || !op) return;
            const llenar = (id, valores, fmt) => {
                const sel = document.getElementById(id);
                if (!sel) return;
                (valores || []).forEach(v => {
                    const o = document.createElement("option");
                    o.value = String(v);
                    o.textContent = fmt ? fmt(v) : String(v);
                    sel.appendChild(o);
                });
            };
            llenar("evop-anio", op.anios);
            llenar("evop-maquina", op.maquinas);
            llenar("evop-area", op.areas);
            llenar("evop-operador", op.operadores);
            this._opcionesCargadas = true;
        }

        _render(d) {
            this._poblarOpciones(d.opciones);
            const t = d.totales;
            const cont = document.getElementById("evop-contenido");

            if (d.universoTotal === 0) {
                this._estado(this._cfg.textoSinUniverso);
                return;
            }
            if (t.registradas === 0) {
                this._estado("Sin resultados para los filtros seleccionados.");
                // se muestran igualmente las advertencias (p. ej. NC sin fecha) para no ocultar información
                this._renderAdvertencias(d.advertencias);
                cont.style.display = "block";
                this._set("evop-k-registradas", 0); this._set("evop-k-evaluables", 0); this._set("evop-k-excluidas", 0);
                this._set("evop-k-criticas", 0); this._set("evop-k-mayores", 0); this._set("evop-k-menores", 0); this._set("evop-k-puntos", 0);
                document.getElementById("evop-tbody").innerHTML = "";
                Object.values(this._charts).forEach(c => c.destroy());
                this._charts = {};
                return;
            }

            this._estado(t.evaluables === 0 ? "Datos incompletos: ninguna NC del período es evaluable (falta operador, fecha o nivel)." : "", "datos");
            if (t.evaluables > 0) this._estado("");
            cont.style.display = "block";

            this._renderAdvertencias(d.advertencias);
            this._set("evop-k-registradas", t.registradas);
            this._set("evop-k-evaluables", t.evaluables);
            this._set("evop-k-excluidas", t.excluidas);
            this._set("evop-k-criticas", t.criticas);
            this._set("evop-k-mayores", t.mayores);
            this._set("evop-k-menores", t.menores);
            this._set("evop-k-puntos", t.puntos);

            this._renderTabla(d.porOperador);
            this._renderGraficos(d);
            this._renderDetalle(d.detalle);
        }

        // Trazabilidad hacia la NC original (solo con un operador elegido; el backend no la envía sin filtro).
        _renderDetalle(detalle) {
            const box = document.getElementById("evop-detalle");
            if (!box) return;
            if (!detalle) { box.style.display = "none"; box.innerHTML = ""; return; }
            const nombres = { CRITICO: "Crítico", MAYOR: "Mayor", MENOR: "Menor", SIN_NIVEL: "Sin nivel", NIVEL_OTRO: "Nivel no reconocido" };
            const filas = detalle.map(r => `<tr>
                <td>${this._esc(r.referencia ? `${r.referencia} (#${r.id})` : `#${r.id}`)}</td><td>${this._esc(nombres[r.nivel] || r.nivel)}</td>
                <td>${this._esc(r.maquina || "—")}</td><td>${this._esc(r.area || "—")}</td><td>${this._esc(r.fechaFabricacion || "sin fecha")}</td>
                <td>${r.evaluable ? "Sí" : "No"}</td><td class="num">${this._n(r.puntos)}</td></tr>`).join("");
            box.style.display = "block";
            box.innerHTML = `<h3>Registros del operador elegido <small>(origen: ${this._esc(this._cfg.etiquetaOrigen)} · ${this._n(detalle.length)} registros)</small></h3>
                <div class="table-container"><table class="table evop-tabla-sep"><thead><tr><th>${this._esc(this._cfg.etiquetaReferencia)}</th><th>Nivel</th><th>Máquina</th><th>Área</th><th>Fecha fabricación</th><th>Evaluable</th><th class="num">Puntos</th></tr></thead>
                <tbody>${filas || '<tr><td colspan="7">Sin registros.</td></tr>'}</tbody></table></div>`;
        }

        _set(id, v) {
            const el = document.getElementById(id);
            if (el) el.textContent = Number(v || 0).toLocaleString("es-CL");
        }

        _renderAdvertencias(adv) {
            const cont = document.getElementById("evop-advertencias");
            if (!cont) return;
            cont.innerHTML = (adv || []).map(a =>
                `<div class="evop-adv${a.codigo === "datos_insuficientes" ? " evop-adv-fuerte" : ""}">` +
                `${this._esc(a.texto)} <strong>(${Number(a.cantidad).toLocaleString("es-CL")})</strong></div>`
            ).join("");
        }

        _renderTabla(filas) {
            const tb = document.getElementById("evop-tbody");
            if (!tb) return;
            if (!filas || !filas.length) {
                tb.innerHTML = `<tr><td colspan="8">Ninguna NC evaluable (con operador identificable, fecha de fabricación y nivel válido) en el período.</td></tr>`;
                return;
            }
            tb.innerHTML = filas.map(f => `<tr>
                <td>${this._esc(f.operador)}</td>
                <td>${f.evaluables}</td><td>${f.criticas}</td><td>${f.mayores}</td><td>${f.menores}</td>
                <td><strong>${f.puntos}</strong> pts</td><td>${f.maquinas}</td><td>${f.meses}</td></tr>`).join("");
        }

        _chart(id, config) {
            const canvas = document.getElementById(id);
            if (!canvas || typeof Chart === "undefined") return;
            if (this._charts[id]) this._charts[id].destroy();
            this._charts[id] = new Chart(canvas, config);
        }

        _renderGraficos(d) {
            const nombres = { CRITICO: "Crítico", MAYOR: "Mayor", MENOR: "Menor" };
            const opt = { responsive: true, maintainAspectRatio: false };
            this._chart("evop-chart-nivel", {
                type: "bar",
                data: {
                    labels: d.porNivel.map(n => nombres[n.nivel]),
                    datasets: [
                        { label: "NC evaluables (registros)", data: d.porNivel.map(n => n.evaluables), backgroundColor: "#2563eb" },
                        { label: "NC registradas (registros)", data: d.porNivel.map(n => n.registradas), backgroundColor: "#94a3b8" },
                    ],
                },
                options: { ...opt, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
            });
            this._chart("evop-chart-mes", {
                data: {
                    labels: d.porMes.map(m => m.mes),
                    datasets: [
                        { type: "bar", label: "NC evaluables (registros)", data: d.porMes.map(m => m.evaluables), backgroundColor: "#2563eb", yAxisID: "y" },
                        { type: "bar", label: "NC excluidas (registros)", data: d.porMes.map(m => m.excluidas), backgroundColor: "#cbd5e1", yAxisID: "y" },
                        { type: "line", label: "Puntos de penalización (puntos)", data: d.porMes.map(m => m.puntos), borderColor: "#dc2626", backgroundColor: "#dc2626", yAxisID: "y1" },
                    ],
                },
                options: {
                    ...opt,
                    scales: {
                        y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "Registros" } },
                        y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false }, ticks: { precision: 0 }, title: { display: true, text: "Puntos" } },
                    },
                },
            });
            this._chart("evop-chart-maquina", {
                type: "bar",
                data: {
                    labels: d.porMaquina.map(m => m.maquina || "(sin máquina)"),
                    datasets: [{ label: "NC del período (registros)", data: d.porMaquina.map(m => m.registradas), backgroundColor: "#0d9488" }],
                },
                options: { ...opt, indexAxis: "y", scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } },
            });
        }
    }
    window.EvaluacionOperadoresBase = EvaluacionOperadoresBase;
}
