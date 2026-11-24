if (!window.CertificadosDestruccionController) {
  const C = window.CalidadNp
  const ESTADO = { BORRADOR: "Borrador", PENDIENTE_REVISION: "Pendiente de revisión", PENDIENTE_APROBACION: "Pendiente de aprobación", APROBADO: "Aprobado", RECHAZADO: "Rechazado", EMITIDO: "Emitido", ANULADO: "Anulado" }
  const MOTIVO = { RECHAZO_INTERNO: "Rechazo interno", RECHAZO_EXTERNO: "Rechazo externo", EXCEDENTES: "Excedentes" }
  const CATEGORIA = { CALIDAD: "Calidad", INOCUIDAD: "Inocuidad", LEGALIDAD: "Legalidad" }

  class CertificadosDestruccionController {
    constructor() {
      this._click = null
      this._dash = null
      this._lista = []
    }

    async init() {
      this.bind()
      this.montarResumen()
    }

    // ── Dashboard de inicio (resumen agregado en la API; la lista completa sigue disponible aparte) ──
    montarResumen() {
      const D = window.NpDash
      const sumar = (filas, campo, estados) => (filas || []).filter(f => !estados || estados.includes(f.estado)).reduce((a, f) => a + Number(f[campo] || 0), 0)
      this._dash = D.montar(this.$("cdDash"), {
        p: "cd",
        periodo: true,
        buscar: { placeholder: "Buscar certificados por NP (Ej: 3948)", boton: "Buscar NP", onBuscar: np => { this.$("cdFiltroNp").value = np; this.verLista(true) } },
        kpis: [
          { label: "Total de certificados", icono: "lista" },
          { label: "Pendientes de aprobación", icono: "reloj", tono: "warn" },
          { label: "Aprobados", icono: "ok", tono: "ok" },
          { label: "Emitidos", icono: "sello" },
          { label: "Destrucción confirmada", icono: "caja", tono: "ok" },
        ],
        charts: [
          { titulo: "Certificados por motivo", sub: "Sin anulados ni rechazados" },
          { titulo: "Evolución mensual", sub: "Certificados creados por mes" },
        ],
        tabla: { titulo: "Certificados pendientes de atención", sub: "En revisión, en aprobación o aprobados sin emitir (los más antiguos primero)", cols: ["Certificado", "NP", "Cliente", "Cantidad", "Motivo", "Estado", "Creado", ""], vacio: "No hay certificados pendientes de atención" },
        cargar: per => C.send("calidadNp.resumen", per),
        render: (d, h) => {
          const r = d.certificados || {}
          const est = r.porEstado || []
          const n = estados => est.filter(f => !estados || estados.includes(f.estado)).reduce((a, f) => a + Number(f.certificados || 0), 0)
          h.kpi(0, n(["BORRADOR", "PENDIENTE_REVISION", "PENDIENTE_APROBACION", "APROBADO", "RECHAZADO", "EMITIDO"]), "Sin anulados")
          h.kpi(1, n(["PENDIENTE_REVISION", "PENDIENTE_APROBACION"]), "Esperan decisión")
          h.kpi(2, n(["APROBADO"]), "Aprobados aún sin emitir")
          h.kpi(3, n(["EMITIDO"]), "Emitido no significa destruido")
          h.kpi(4, est.reduce((a, f) => a + Number(f.ejecutados || 0), 0), "Con ejecución física registrada")
          const motivos = (r.porMotivo || []).filter(m => Number(m.certificados) > 0)
          h.grafico(0, "doughnut", motivos.map(m => MOTIVO[m.motivo] || m.motivo), [{ label: "Certificados", data: motivos.map(m => Number(m.certificados)), colores: [D.COL.azul, D.COL.ambar, D.COL.verde, D.COL.gris] }])
          const meses = r.porMes || []
          h.grafico(1, "bar", meses.map(m => D.mesTxt(m.mes)), [{ label: "Certificados", data: meses.map(m => Number(m.certificados)), color: D.COL.azul }])
          h.filas((r.atencion || []).map(x => `<tr><td><b>${C.esc(x.correlativo || "Sin correlativo (#" + x.id + ")")}</b></td><td>${C.esc(x.np)}</td><td>${C.esc(C.txt(x.cliente))}</td><td>${D.num(x.cantidadDestruir)}</td><td>${C.esc(MOTIVO[x.motivo] || x.motivo)}</td><td><span class="npd-badge ${x.estado === "APROBADO" ? "ok" : "warn"}">${C.esc(ESTADO[x.estado] || x.estado)}</span></td><td>${C.fecha(x.fechaCreacion)}</td><td><button class="btn-secondary" style="padding:2px 8px;" data-cd="ver" data-id="${x.id}">Ver</button></td></tr>`))
        },
      })
    }

    verLista(buscarYa) {
      this.$("cdDash").style.display = "none"
      this.$("cdVistaLista").style.display = ""
      this.$("btnCdLista").style.display = "none"
      this.$("btnCdResumen").style.display = ""
      if (buscarYa || !this._lista.length) this.buscar()
    }

    verResumen() {
      this.$("cdDash").style.display = ""
      this.$("cdVistaLista").style.display = "none"
      this.$("btnCdLista").style.display = ""
      this.$("btnCdResumen").style.display = "none"
      this._dash?.recargar()
    }

    $(id) { return document.getElementById(id) }

    bind() {
      if (this._click) return
      this._click = e => {
        const id = e.target.id
        if (id === "btnCdBuscar") this.buscar()
        else if (id === "btnCdNuevo") this.formulario(null)
        else if (id === "btnCdLista") this.verLista(false)
        else if (id === "btnCdResumen") this.verResumen()
        else if (id === "btnCdExcel") this.excel()
        const a = e.target.closest?.("[data-cd]")
        if (a) this.accion(a.dataset.cd, Number(a.dataset.id))
      }
      document.addEventListener("click", this._click)
    }

    async buscar() {
      this.$("cdEstado").textContent = "Cargando..."
      const data = {}
      if (this.$("cdFiltroEstado").value) data.estado = this.$("cdFiltroEstado").value
      if (this.$("cdFiltroNp").value.trim()) data.np = this.$("cdFiltroNp").value.trim()
      const r = await C.send("calidadNp.certificados.list", data)
      this._lista = r.ok ? r.data || [] : []
      this.$("cdEstado").textContent = r.ok ? `${this._lista.length} certificado(s)` : r.error
      this.$("cdBody").innerHTML = this._lista.length ? this._lista.map(x => {
        const acc = [`<button class="btn-secondary" style="padding:2px 8px;" data-cd="ver" data-id="${x.id}">Ver</button>`]
        if (x.estado === "BORRADOR" || x.estado === "RECHAZADO") acc.push(`<button class="btn-secondary" style="padding:2px 8px;" data-cd="editar" data-id="${x.id}" data-requiere-editar>Editar</button>`)
        acc.push(`<button class="btn-secondary" style="padding:2px 8px;" data-cd="pdf" data-id="${x.id}">PDF</button>`, `<button class="btn-secondary" style="padding:2px 8px;" data-cd="excel" data-id="${x.id}">Excel</button>`)
        return `<tr${x.estado === "ANULADO" ? ' style="opacity:.55;"' : ""}><td><b>${C.esc(x.correlativo || "Sin correlativo (#" + x.id + ")")}</b></td><td>${C.esc(x.np)}</td><td>${C.esc(C.txt(x.cliente))}</td><td>${C.esc(C.txt(x.producto))}</td>
          <td>${C.num(x.cantidadDestruir)}</td><td>${C.esc(MOTIVO[x.motivo] || x.motivo)}</td><td>${C.esc(CATEGORIA[x.categoria] || x.categoria)}</td><td>${C.esc(ESTADO[x.estado] || x.estado)}</td>
          <td>${x.estado === "EMITIDO" ? (x.ejecutada ? "Ejecutada" : "Sin confirmar") : "-"}</td><td>${C.esc(x.creadoPor)}<div class="subtitle">${C.fecha(x.fechaCreacion)}</div></td><td style="white-space:nowrap;">${acc.join(" ")}</td></tr>`
      }).join("") : `<tr><td colspan="11" style="text-align:center;">Sin certificados</td></tr>`
    }

    excel() {
      const wb = XLSX.utils.book_new()
      C.hoja(wb, "Certificados", `Certificados de destrucción — ${C.fechaHora(new Date())}`, ["Certificado", "NP", "Ítem", "Cliente", "Producto", "Cantidad a destruir", "Motivo", "Categoría", "Estado", "Ejecutada", "Creado por", "Fecha creación", "Fecha emisión"],
        this._lista.map(x => [x.correlativo || `(borrador #${x.id})`, x.np, x.item ?? "-", C.txt(x.cliente), C.txt(x.producto), x.cantidadDestruir, MOTIVO[x.motivo] || x.motivo, CATEGORIA[x.categoria] || x.categoria, ESTADO[x.estado] || x.estado, x.estado === "EMITIDO" ? (x.ejecutada ? "Sí" : "No") : "-", x.creadoPor, C.fecha(x.fechaCreacion), C.fecha(x.fechaEmision)]))
      C.guardarLibro(wb, `Certificados_Destruccion_${C.stamp()}.xlsx`)
    }

    async accion(a, id) {
      if (a === "editar") return this.formulario(id)
      const r = await C.send("calidadNp.certificados.get", { id })
      if (!r.ok) { alert(r.error); return }
      if (a === "ver") this.detalle(r.data)
      else if (a === "pdf" || a === "excel") this.exportarV11(r.data, a)
    }

    // ── Detalle con flujo de aprobación ──────────────────────────────────────

    async ejecutar(accion, id, extra = {}) {
      const r = await C.send(`calidadNp.certificados.${accion}`, { id, ...extra })
      if (!r.ok) return r.error
      await this.buscar()
      this._dash?.recargar()
      return null
    }

    async detalle(d) {
      const c = d.certificado
      const flujo = (await C.send("calidadNp.certificados.flujo", {})).data || []
      const pend = (d.aprobaciones || []).filter(x => x.estado === "PENDIENTE")
      const puedeEd = C.puedeEditar("certificados-destruccion")
      const aprobaciones = (d.aprobaciones || []).map(x => `<tr><td>${x.orden}</td><td>${C.esc(x.cargo)}</td><td>${C.esc(x.estado)}</td><td>${C.esc(C.txt(x.usuario))}</td><td>${C.fechaHora(x.fecha)}</td><td>${C.esc(C.txt(x.observacion))}</td></tr>`).join("") || `<tr><td colspan="6">Aún sin solicitud de aprobación. Flujo provisional: ${flujo.map(f => C.esc(f.cargo)).join(" → ") || "sin definir"}.</td></tr>`
      const lineas = (d.detalle || []).map(x => `<tr><td>${C.esc(C.txt(x.lote))}</td><td>${C.esc(C.txt(x.pallet))}</td><td>${C.esc(C.txt(x.defecto))}</td><td>${C.num(x.cantidad)}</td><td>${C.esc(x.unidad)}</td><td>${x.mermaId ? "Merma #" + x.mermaId : "-"}</td></tr>`).join("") || `<tr><td colspan="6">Sin detalle</td></tr>`
      const botones = []
      const abrir = (titulo, campoLabel, accion, obligatorio, extraFn) => () => C.modal("cdAccion", titulo, `<div class="form-group"><label>${campoLabel}</label><textarea id="cdObs" rows="3" style="width:100%"></textarea></div>${extraFn ? extraFn.html : ""}`, "Confirmar", async o => {
        const obs = o.querySelector("#cdObs").value.trim()
        if (obligatorio && !obs) return `${campoLabel.replace(" *", "")} es obligatorio`
        const extra = extraFn ? extraFn.leer(o) : {}
        if (extra.error) return extra.error
        const err = await this.ejecutar(accion, c.id, { ...extra, observacion: obs, motivo: obs })
        if (err) return err
        document.getElementById("cdDetalle")?.remove()
      }, 520)
      const mk = (txt, fn, cls = "btn-secondary") => { const id = `cdb${botones.length}`; botones.push({ id, txt, fn, cls }); return id }
      if (puedeEd) {
        if (c.estado === "BORRADOR" || c.estado === "RECHAZADO") mk("Solicitar aprobación", async () => { const e = await this.ejecutar("solicitarAprobacion", c.id); if (e) alert(e); else document.getElementById("cdDetalle")?.remove() }, "btn-primary")
        if (c.estado === "PENDIENTE_APROBACION" && pend.length) {
          const cargos = pend.map(p => `<option>${C.esc(p.cargo)}</option>`).join("")
          const sel = { html: `<div class="form-group"><label>Cargo que decide</label><select id="cdCargo">${cargos}</select></div>`, leer: o => ({ cargo: o.querySelector("#cdCargo").value }) }
          mk("Aprobar (solo aprobador)", abrir("Aprobar certificado", "Observación", "aprobar", false, sel), "btn-primary")
          mk("Rechazar (solo aprobador)", abrir("Rechazar certificado", "Motivo del rechazo *", "rechazar", true, sel))
        }
        if (c.estado === "APROBADO") mk("Emitir certificado", async () => { if (!confirm("Al emitir se asigna el correlativo definitivo, que no se reutiliza. ¿Emitir?")) return; const e = await this.ejecutar("emitir", c.id); if (e) alert(e); else document.getElementById("cdDetalle")?.remove() }, "btn-primary")
        if (c.estado === "EMITIDO" && !c.ejecutada) mk("Confirmar destrucción ejecutada", abrir("Confirmar ejecución física", "Observación", "confirmarEjecucion", false, { html: `<div class="form-group"><label>Fecha de ejecución</label><input type="date" id="cdFecEj" value="${new Date().toISOString().slice(0, 10)}"></div>`, leer: o => ({ fecha: o.querySelector("#cdFecEj").value }) }), "btn-primary")
        if (c.estado !== "ANULADO" && !c.ejecutada) mk("Anular", abrir("Anular certificado", "Motivo de anulación *", "anular", true))
      }
      mk("PDF (REG-SGI-CDD-V11)", () => this.exportarV11(d, "pdf"))
      mk("Excel (REG-SGI-CDD-V11)", () => this.exportarV11(d, "excel"))
      const cuerpo = `
        <table class="table"><tbody>
          <tr><td><b>Certificado</b></td><td>${C.esc(c.correlativo || "Sin correlativo (borrador)")}</td><td><b>Estado</b></td><td>${C.esc(ESTADO[c.estado] || c.estado)}${c.ejecutada ? " · destrucción ejecutada " + C.fecha(c.fechaEjecucion) : c.estado === "EMITIDO" ? " · ejecución física sin confirmar" : ""}</td></tr>
          <tr><td><b>NP / Ítem</b></td><td>${C.esc(c.np)} / ${C.esc(C.txt(c.item))}</td><td><b>Cliente</b></td><td>${C.esc(C.txt(c.cliente))}</td></tr>
          <tr><td><b>Producto</b></td><td>${C.esc(C.txt(c.producto))} (${C.esc(C.txt(c.codigoProducto))})</td><td><b>Cantidad a destruir</b></td><td>${C.num(c.cantidadDestruir)}</td></tr>
          <tr><td><b>Motivo / Categoría</b></td><td>${C.esc(MOTIVO[c.motivo] || c.motivo)} / ${C.esc(CATEGORIA[c.categoria] || c.categoria)}</td><td><b>Solicitante</b></td><td>${C.esc(C.txt(c.solicitanteNombre))} (${C.esc(C.txt(c.solicitanteCargo))})</td></tr>
          <tr><td><b>Defecto</b></td><td colspan="3">${C.esc(C.txt(c.descripcionDefecto))}</td></tr>
          <tr><td><b>Causa raíz</b></td><td colspan="3">${C.esc(C.txt(c.causaRaiz))}</td></tr>
          ${c.motivoAnulacion ? `<tr><td><b>Anulación</b></td><td colspan="3">${C.esc(c.motivoAnulacion)} (${C.esc(C.txt(c.anuladoPor))})</td></tr>` : ""}
        </tbody></table>
        <b>Detalle</b><table class="table"><thead><tr><th>Lote</th><th>Pallet</th><th>Defecto</th><th>Cantidad</th><th>Unidad</th><th>Origen</th></tr></thead><tbody>${lineas}</tbody></table>
        <b>Aprobaciones</b> <span class="subtitle">(flujo provisional hasta que Calidad/SGI defina el definitivo)</span>
        <table class="table"><thead><tr><th>Orden</th><th>Cargo</th><th>Estado</th><th>Usuario</th><th>Fecha</th><th>Observación</th></tr></thead><tbody>${aprobaciones}</tbody></table>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">${botones.map(b => `<button class="${b.cls}" id="${b.id}">${C.esc(b.txt)}</button>`).join("")}</div>`
      const ov = C.modal("cdDetalle", "Certificado de destrucción", cuerpo, "", null, 940)
      botones.forEach(b => { ov.querySelector("#" + b.id).onclick = b.fn })
    }

    // ── Formulario REG-SGI-CDD-V11 ───────────────────────────────────────────

    async formulario(id) {
      let c = {}
      let detalle = []
      if (id) {
        const r = await C.send("calidadNp.certificados.get", { id })
        if (!r.ok) { alert(r.error); return }
        c = r.data.certificado
        detalle = r.data.detalle || []
      }
      this._form = { id, np: c.np || "", mermas: [], carga: null }
      const o = (v, t, s) => `<option value="${C.esc(v)}"${s === v ? " selected" : ""}>${C.esc(t)}</option>`
      const iv = (k, d = "") => C.esc(c[k] ?? d)
      const hoy = new Date().toISOString().slice(0, 10)
      const cuerpo = `
        <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px;">
          <div class="form-group" style="margin:0;"><label>NP *</label><input type="text" id="cdfNp" value="${iv("np")}" ${id ? "disabled" : ""}></div>
          <button class="btn-secondary" id="cdfCargar" type="button" ${id ? "disabled" : ""}>Cargar datos y mermas</button><span id="cdfMsg" class="subtitle"></span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div class="form-group"><label>Ítem</label><select id="cdfItem"><option value="${iv("item")}">${iv("item", "—")}</option></select></div>
          <div class="form-group"><label>Cliente</label><input type="text" id="cdfCliente" value="${iv("cliente")}"></div>
          <div class="form-group"><label>Razón social</label><input type="text" id="cdfRazon" value="${iv("razonSocial")}"></div>
          <div class="form-group"><label>Código producto</label><input type="text" id="cdfCodigo" value="${iv("codigoProducto")}"></div>
          <div class="form-group"><label>Producto</label><input type="text" id="cdfProducto" value="${iv("producto")}"></div>
          <div class="form-group"><label>Formato</label><select id="cdfFormato">${o("PRODUCTO", "Producto", c.formato)}${o("PLIEGO", "Pliego", c.formato)}${o("OTROS", "Otros", c.formato)}</select></div>
          <div class="form-group"><label>Cantidad solicitada</label><input type="number" step="any" id="cdfSolic" value="${iv("cantidadSolicitada")}"></div>
          <div class="form-group"><label>Cantidad total a destruir *</label><input type="number" step="any" min="0" id="cdfCant" value="${iv("cantidadDestruir")}"></div>
          <div class="form-group"><label>Fecha fabricación/lote</label><input type="date" id="cdfFab" value="${C.esc(String(c.fechaFabricacionLote || "").slice(0, 10))}"></div>
          <div class="form-group"><label>Motivo *</label><select id="cdfMotivo">${o("RECHAZO_INTERNO", "Rechazo interno", c.motivo)}${o("RECHAZO_EXTERNO", "Rechazo externo", c.motivo)}${o("EXCEDENTES", "Excedentes", c.motivo)}</select></div>
          <div class="form-group"><label>Categoría *</label><select id="cdfCategoria">${o("CALIDAD", "Calidad", c.categoria)}${o("INOCUIDAD", "Inocuidad", c.categoria)}${o("LEGALIDAD", "Legalidad", c.categoria)}</select></div>
          <div class="form-group"><label>Área</label><input type="text" id="cdfArea" value="${iv("area")}"></div>
          <div class="form-group"><label>Operador</label><input type="text" id="cdfOperador" value="${iv("operador")}"></div>
          <div class="form-group"><label>Jefe / Supervisor</label><input type="text" id="cdfJefe" value="${iv("jefeSupervisor")}"></div>
          <div class="form-group"><label>Solicitante (nombre)</label><input type="text" id="cdfSolNom" value="${iv("solicitanteNombre", C.usuarioActual())}"></div>
          <div class="form-group"><label>Solicitante (área)</label><input type="text" id="cdfSolArea" value="${iv("solicitanteArea")}"></div>
          <div class="form-group"><label>Solicitante (cargo)</label><input type="text" id="cdfSolCargo" value="${iv("solicitanteCargo")}"></div>
          <div class="form-group"><label>Fecha de solicitud</label><input type="date" id="cdfFecSol" value="${C.esc(String(c.fechaSolicitud || hoy).slice(0, 10))}"></div>
        </div>
        <div class="form-group"><label>Descripción del defecto</label><textarea id="cdfDef" rows="2" style="width:100%">${iv("descripcionDefecto")}</textarea></div>
        <div class="form-group"><label>Causa raíz</label><textarea id="cdfCausa" rows="2" style="width:100%">${iv("causaRaiz")}</textarea></div>
        <div class="form-group"><label>Observaciones</label><textarea id="cdfObs" rows="2" style="width:100%">${iv("observaciones")}</textarea></div>
        <div style="display:flex;justify-content:space-between;align-items:center;"><b>Detalle de lo que se destruye</b><button class="btn-secondary" id="cdfAddLinea" type="button">Agregar línea</button></div>
        <p class="subtitle">Elige la merma de origen para que el saldo se controle (no se puede destruir más de lo registrado, descontando otros certificados activos). El detalle debe sumar la cantidad total.</p>
        <table class="table"><thead><tr><th>Merma de origen</th><th>Lote</th><th>Pallet</th><th>Defecto</th><th>Cantidad</th><th>Unidad</th><th></th></tr></thead><tbody id="cdfLineas"></tbody></table>
        <div id="cdfSuma" class="subtitle"></div>`
      const ov = C.modal("cdForm", id ? "Editar certificado" : "Nuevo certificado de destrucción", cuerpo, "Guardar borrador", o2 => this.guardar(o2), 980)
      const lineasEl = ov.querySelector("#cdfLineas")
      const sumar = () => {
        const s = [...lineasEl.querySelectorAll(".cdl-cant")].reduce((a, x) => a + (Number(x.value) || 0), 0)
        ov.querySelector("#cdfSuma").textContent = `Detalle suma ${C.num(s)} · cantidad total ${C.num(Number(ov.querySelector("#cdfCant").value) || 0)}`
      }
      const mermaOpts = sel => `<option value="">— manual —</option>` + this._form.mermas.map(m => `<option value="${m.id}"${Number(sel) === m.id ? " selected" : ""}>#${m.id} ${C.esc(m.proceso)} · ${C.esc(C.txt(m.defecto))} (saldo ${C.num(m.saldo)})</option>`).join("")
      const addLinea = d => {
        const tr = document.createElement("tr")
        tr.innerHTML = `<td><select class="cdl-merma">${mermaOpts(d?.mermaId)}</select></td><td><input class="cdl-lote" value="${C.esc(d?.lote ?? "")}" style="width:90px"></td><td><input class="cdl-pallet" value="${C.esc(d?.pallet ?? "")}" style="width:80px"></td>
          <td><input class="cdl-defecto" value="${C.esc(d?.defecto ?? "")}"></td><td><input type="number" step="any" min="0" class="cdl-cant" value="${d?.cantidad ?? ""}" style="width:100px"></td>
          <td><select class="cdl-unidad"><option value="UNIDADES"${d?.unidad === "UNIDADES" ? " selected" : ""}>Unidades</option><option value="PLIEGOS"${d?.unidad === "PLIEGOS" ? " selected" : ""}>Pliegos</option></select></td><td><button class="btn-secondary cdl-del" type="button">Quitar</button></td>`
        tr.querySelector(".cdl-del").onclick = () => { tr.remove(); sumar() }
        tr.querySelector(".cdl-cant").oninput = sumar
        tr.querySelector(".cdl-merma").onchange = ev => {
          const m = this._form.mermas.find(x => String(x.id) === ev.target.value)
          if (m) {
            tr.querySelector(".cdl-defecto").value = m.defecto || ""
            tr.querySelector(".cdl-unidad").value = m.unidad
            if (!tr.querySelector(".cdl-cant").value) tr.querySelector(".cdl-cant").value = m.saldo
            sumar()
          }
        }
        lineasEl.appendChild(tr)
        sumar()
      }
      const cargarMermas = async np => {
        const r = await C.send("calidadNp.mermas.list", { np })
        // Saldo disponible = merma activa y no validada como anulada, menos lo ya comprometido en certificados activos.
        this._form.mermas = r.ok ? (r.data || []).filter(m => m.estado !== "ANULADA").map(m => ({ ...m, saldo: Math.max(0, Number(m.cantidad) - Number(m.comprometidoDestruccion || 0)) })).filter(m => m.saldo > 0 || detalle.some(d => d.mermaId === m.id)) : []
        return r
      }
      detalle.forEach(addLinea)
      if (id) cargarMermas(c.np).then(() => lineasEl.querySelectorAll(".cdl-merma").forEach((s, k) => { s.innerHTML = mermaOpts(detalle[k]?.mermaId) }))
      ov.querySelector("#cdfAddLinea").onclick = () => addLinea()
      ov.querySelector("#cdfCant").oninput = sumar
      ov.querySelector("#cdfCargar").onclick = async () => {
        const np = ov.querySelector("#cdfNp").value.trim()
        if (!np) return
        ov.querySelector("#cdfMsg").textContent = "Consultando..."
        const [carga] = await Promise.all([C.cargarNp(np), cargarMermas(np)])
        this._form.carga = carga
        if (carga.np !== np) { // número escrito = OT / NP Faret: el certificado queda con la NP INNPACK
          ov.querySelector("#cdfNp").value = carga.np
          await cargarMermas(carga.np)
        }
        const items = carga.data?.items || []
        const sel = ov.querySelector("#cdfItem")
        if (items.length) {
          sel.innerHTML = items.map(i => `<option value="${i.item}">${C.esc(i.item)} — ${C.esc(i.itemCode || "")}</option>`).join("")
          const llenar = () => {
            const it = items.find(i => String(i.item) === sel.value)
            if (!it) return
            ov.querySelector("#cdfCodigo").value = it.itemCode || ""
            ov.querySelector("#cdfProducto").value = it.descripcion || ""
            ov.querySelector("#cdfSolic").value = it.solicitado ?? ""
          }
          sel.onchange = llenar
          llenar()
          ov.querySelector("#cdfCliente").value = carga.data?.ordenes?.[0]?.Cliente || ov.querySelector("#cdfCliente").value
        }
        lineasEl.querySelectorAll(".cdl-merma").forEach(s => { s.innerHTML = mermaOpts(s.value) })
        ov.querySelector("#cdfMsg").textContent = carga.data ? `${this._form.mermas.length} merma(s) con saldo` : `FPS/SAP no disponible: completa los datos a mano`
      }
    }

    async guardar(o) {
      const v = k => o.querySelector("#" + k).value.trim()
      const num = k => (v(k) === "" ? null : Number(v(k)))
      const cantidadDestruir = num("cdfCant")
      if (!v("cdfNp")) return "Indica la NP"
      if (!cantidadDestruir || cantidadDestruir <= 0) return "La cantidad total a destruir debe ser mayor que cero"
      const detalle = [...o.querySelectorAll("#cdfLineas tr")].map(tr => ({
        mermaId: tr.querySelector(".cdl-merma").value ? Number(tr.querySelector(".cdl-merma").value) : null, lote: tr.querySelector(".cdl-lote").value.trim(), pallet: tr.querySelector(".cdl-pallet").value.trim(),
        defecto: tr.querySelector(".cdl-defecto").value.trim(), cantidad: Number(tr.querySelector(".cdl-cant").value), unidad: tr.querySelector(".cdl-unidad").value
      }))
      if (detalle.some(d => !(d.cantidad > 0))) return "Cada línea del detalle necesita una cantidad mayor que cero"
      const body = {
        id: this._form.id, np: v("cdfNp"), item: o.querySelector("#cdfItem").value ? Number(o.querySelector("#cdfItem").value) : null, cliente: v("cdfCliente"), razonSocial: v("cdfRazon"),
        codigoProducto: v("cdfCodigo"), producto: v("cdfProducto"), formato: v("cdfFormato"), cantidadSolicitada: num("cdfSolic"), cantidadDestruir, fechaFabricacionLote: v("cdfFab") || null,
        motivo: v("cdfMotivo"), categoria: v("cdfCategoria"), area: v("cdfArea"), operador: v("cdfOperador"), jefeSupervisor: v("cdfJefe"), solicitanteNombre: v("cdfSolNom"),
        solicitanteArea: v("cdfSolArea"), solicitanteCargo: v("cdfSolCargo"), fechaSolicitud: v("cdfFecSol") || null, descripcionDefecto: v("cdfDef"), causaRaiz: v("cdfCausa"), observaciones: v("cdfObs"), detalle
      }
      const r = await C.send(this._form.id ? "calidadNp.certificados.editar" : "calidadNp.certificados.crear", body)
      if (!r.ok) return r.error
      await this.buscar()
      this._dash?.recargar()
    }

    // ── Certificado en el formato oficial REG-SGI-CDD-V11 ─────────────────────
    // El backend rellena la plantilla original de Calidad con el certificado registrado (Excel) y la misma hoja
    // se renderiza como PDF. Lo no emitido/aprobado sale rotulado como pendiente. La cantidad liberada no se
    // guarda en el certificado: se consulta a la trazabilidad y, si no responde, queda SIN INFORMACIÓN.

    async cantidadLiberada(c) {
      const carga = await C.cargarNp(c.np)
      const items = carga.data?.items || []
      const i = c.item != null ? items.find(x => Number(x.item) === Number(c.item)) : (items.length === 1 ? items[0] : null)
      return i && i.liberadoPt !== null && i.liberadoPt !== undefined ? Number(i.liberadoPt) : null
    }

    async exportarV11(d, tipo) {
      const c = d.certificado
      window.ExcelExporter?.showToast?.("Preparando certificado REG-SGI-CDD-V11...")
      const cantidadLiberada = await this.cantidadLiberada(c).catch(() => null)
      const r = await C.send(tipo === "pdf" ? "calidadNp.certificados.exportarPdf" : "calidadNp.certificados.exportarExcel", { id: c.id, cantidadLiberada })
      if (!r.ok) { alert(r.error || "No se pudo generar el certificado"); return }
      if (tipo === "pdf") return C.imprimirHtml(r.data.html)
      const g = await C.send("excel.guardar", { fileName: r.data.fileName, base64: r.data.base64 })
      window.ExcelExporter?.showToast?.(g.ok === false ? "Error exportando archivo" : "Archivo exportado correctamente")
    }

    destroy() {
      if (this._click) document.removeEventListener("click", this._click)
      this._click = null
      this._dash?.destruir()
      for (const id of ["cdDetalle", "cdForm", "cdAccion"]) document.getElementById(id)?.remove()
    }
  }

  window.CertificadosDestruccionController = CertificadosDestruccionController
}
