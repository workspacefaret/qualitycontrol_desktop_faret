// Edición de inspecciones FARET (Calidad y Pallet/Papel): piezas comunes de los dos módulos.
//  - quién puede editar (ADMIN, ADMIN_TI, INSPECTOR; la API lo vuelve a validar con el JWT de la sesión),
//  - modal con "Motivo del cambio" obligatorio, errores de la API y guardado,
//  - columna "Última edición" (pantalla/Excel/PDF) e historial de cambios (bitácora).
// Las reglas de negocio (obligatorios, catálogo de eventos, checklist) las valida SIEMPRE la API; aquí solo se evita enviar lo evidente.
window.InspeccionesEdicion = (() => {
    const ROLES_EDITORES = ["ADMIN", "ADMIN_TI", "INSPECTOR"];

    const esc = (v) => String(v ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

    const puedeEditar = () => ROLES_EDITORES.includes((sessionStorage.getItem("faretRol") || "").toUpperCase());

    // La bitácora guarda la hora local del servidor (DATETIME2 sin zona): se muestra sin convertir de zona.
    const fechaHora = (v) => {
        if (!v) return "";
        const d = new Date(v);
        if (isNaN(d)) return String(v);
        const p = (n) => String(n).padStart(2, "0");
        return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
    };

    // Texto plano (Excel / PDF): "Usuario · dd-mm-aaaa hh:mm · motivo (N ediciones)"; "-" si nunca se editó.
    const textoEdicion = (i) => {
        const n = Number(i.cantidadEdiciones || 0);
        if (!n) return "-";
        const partes = [i.ultimaEdicionUsuario || "—", fechaHora(i.ultimaEdicionFecha)];
        if (i.ultimaEdicionMotivo) partes.push(i.ultimaEdicionMotivo);
        return `${partes.join(" · ")}${n > 1 ? ` (${n} ediciones)` : ""}`;
    };

    const celdaEdicion = (i) => {
        const n = Number(i.cantidadEdiciones || 0);
        if (!n) return "-";
        return `<button class="btn-secondary fie-historial-btn" data-id="${i.id}" title="${esc(textoEdicion(i))}">Editado${n > 1 ? ` (${n})` : ""}</button>
            <div class="fie-ultima">${esc(i.ultimaEdicionUsuario || "—")} · ${esc(fechaHora(i.ultimaEdicionFecha))}</div>`;
    };

    const cerrar = (id) => document.getElementById(id)?.remove();

    const crearOverlay = (id, html) => {
        cerrar(id);
        const ov = document.createElement("div");
        ov.id = id;
        ov.className = "fie-overlay";
        ov.innerHTML = `<div class="fie-modal" role="dialog" aria-modal="true">${html}</div>`;
        ov.addEventListener("mousedown", (e) => { if (e.target === ov) ov.remove(); });
        document.body.appendChild(ov);
        return ov;
    };

    /**
     * opts: { titulo, subtitulo, cuerpoHtml, montar(root), recolectar(root) -> {error} | {action, id, payload}, alGuardar() }
     * `recolectar` arma solo lo que cambió; el motivo lo agrega este modal.
     */
    const abrirModal = (opts) => {
        const ov = crearOverlay("fie-modal-edicion", `
            <div class="fie-head">
                <div><div class="fie-titulo">${esc(opts.titulo)}</div><div class="fie-sub">${esc(opts.subtitulo || "")}</div></div>
                <button type="button" class="fie-x" data-fie="cerrar" aria-label="Cerrar">×</button>
            </div>
            <div class="fie-body">
                <div class="fie-error" id="fie-error" hidden></div>
                ${opts.cuerpoHtml}
                <div class="fie-campo fie-motivo">
                    <label for="fie-motivo">Motivo del cambio <span class="fie-req">*</span></label>
                    <textarea id="fie-motivo" rows="2" maxlength="500" placeholder="Ej.: error de digitación en el número de NV"></textarea>
                </div>
            </div>
            <div class="fie-foot">
                <button type="button" class="btn-secondary" data-fie="cerrar">Cancelar</button>
                <button type="button" class="btn-primary" id="fie-guardar" data-requiere-editar>Guardar cambios</button>
            </div>`);
        const root = ov.querySelector(".fie-modal");
        const error = (msg) => { const e = ov.querySelector("#fie-error"); e.textContent = msg || ""; e.hidden = !msg; if (msg) e.scrollIntoView({ block: "nearest" }); };
        ov.querySelectorAll('[data-fie="cerrar"]').forEach((b) => b.addEventListener("click", () => ov.remove()));
        if (opts.montar) opts.montar(root);

        const btn = ov.querySelector("#fie-guardar");
        btn.addEventListener("click", async () => {
            error("");
            const motivo = ov.querySelector("#fie-motivo").value.trim();
            const r = opts.recolectar(root);
            if (r.error) return error(r.error);
            if (motivo.length < 5) return error("El motivo del cambio es obligatorio (mínimo 5 caracteres).");
            btn.disabled = true;
            btn.textContent = "Guardando...";
            try {
                const res = await window.PhotinoBridge.send({ action: r.action, id: Number(r.id), ...r.payload, motivo });
                if (!res.ok) { error(res.error || "No se pudo guardar el cambio."); return; }
                ov.remove();
                if (opts.alGuardar) await opts.alGuardar();
            } catch {
                error("Error de comunicación con el backend.");
            } finally {
                if (document.body.contains(btn)) { btn.disabled = false; btn.textContent = "Guardar cambios"; }
            }
        });
        return root;
    };

    const verHistorial = async (action, id, titulo) => {
        const ov = crearOverlay("fie-modal-historial", `
            <div class="fie-head"><div><div class="fie-titulo">Historial de cambios</div><div class="fie-sub">${esc(titulo || "")}</div></div>
                <button type="button" class="fie-x" data-fie="cerrar" aria-label="Cerrar">×</button></div>
            <div class="fie-body" id="fie-hist-body">Cargando...</div>
            <div class="fie-foot"><button type="button" class="btn-secondary" data-fie="cerrar">Cerrar</button></div>`);
        ov.querySelectorAll('[data-fie="cerrar"]').forEach((b) => b.addEventListener("click", () => ov.remove()));
        const body = ov.querySelector("#fie-hist-body");
        try {
            const res = await window.PhotinoBridge.send({ action, id: Number(id) });
            if (!res.ok) { body.textContent = res.error || "No se pudo cargar el historial."; return; }
            const filas = Array.isArray(res.data) ? res.data : [];
            if (!filas.length) { body.textContent = "Este registro no tiene cambios."; return; }
            body.innerHTML = `<table class="fie-hist"><thead><tr><th>Fecha</th><th>Usuario</th><th>Campo</th><th>Valor anterior</th><th>Valor nuevo</th><th>Motivo</th></tr></thead><tbody>${
                filas.map((f) => `<tr><td>${esc(fechaHora(f.fecha))}</td><td>${esc(f.usuarioNombre || f.usuarioId || "—")}</td><td>${esc(f.campo)}</td>
                    <td>${esc(f.valorAnterior ?? "—")}</td><td>${esc(f.valorNuevo ?? "—")}</td><td>${esc(f.motivo)}</td></tr>`).join("")}</tbody></table>`;
        } catch {
            body.textContent = "Error de comunicación con el backend.";
        }
    };

    // Helpers de formulario
    const campo = (id, etiqueta, valor, { requerido = false, max = 150, tipo = "text", ayuda = "" } = {}) =>
        `<div class="fie-campo"><label for="${id}">${esc(etiqueta)}${requerido ? ' <span class="fie-req">*</span>' : ""}</label>
            <input id="${id}" type="${tipo}" maxlength="${max}" value="${esc(valor ?? "")}" ${ayuda ? `list="${ayuda}"` : ""}></div>`;
    const area = (id, etiqueta, valor, { requerido = false } = {}) =>
        `<div class="fie-campo fie-ancho"><label for="${id}">${esc(etiqueta)}${requerido ? ' <span class="fie-req">*</span>' : ""}</label>
            <textarea id="${id}" rows="2">${esc(valor ?? "")}</textarea></div>`;
    const norm = (v) => { const t = String(v ?? "").trim(); return t === "" ? null : t; };

    return { ROLES_EDITORES, esc, puedeEditar, fechaHora, textoEdicion, celdaEdicion, abrirModal, verHistorial, campo, area, norm };
})();
