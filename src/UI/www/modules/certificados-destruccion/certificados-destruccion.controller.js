if (!window.CertificadosDestruccionController) {
  const C = window.CalidadNp
  const ESTADO = { BORRADOR: "Borrador", PENDIENTE_REVISION: "Pendiente de revisión", PENDIENTE_APROBACION: "Pendiente de aprobación", APROBADO: "Aprobado", RECHAZADO: "Rechazado", EMITIDO: "Emitido", ANULADO: "Anulado" }
  const RAZON_SOCIAL = "INNPACK SPA" // módulo exclusivo de INNPACK: el V11 marca esa casilla
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
      const ctx = C.tomarContexto("certificados-destruccion")
      if (ctx) await this.abrirContexto(ctx)
    }

    // Llegada desde otro módulo: lista de la NP y, si se pidió, certificado nuevo con la NP y el ítem ya cargados.
    async abrirContexto(ctx) {
      this.$("cdFiltroNp").value = ctx.np
      this.verLista(true)
      if (ctx.certificadoId) await this.accion("ver", ctx.certificadoId)
      else if (ctx.nuevo && C.puedeEditar("certificados-destruccion")) await this.formulario(null, { np: ctx.np, item: ctx.item })
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
        const vistaEstado = e.target.closest?.("[data-cd-estado]")
        if (vistaEstado) { this.$("cdFiltroEstado").value = vistaEstado.dataset.cdEstado; this.buscar() }
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
          <td>${x.estado === "EMITIDO" ? (x.ejecutada ? `Ejecutada${x.cantidadEjecutada === null || x.cantidadEjecutada === undefined ? "" : ": " + C.num(x.cantidadEjecutada)}` : "Sin confirmar") : "-"}${x.evidencias ? `<div class="subtitle">${C.esc(x.evidencias)} evidencia(s)</div>` : ""}${x.estado === "EMITIDO" && x.documentoEmitido === 0 ? `<div class="subtitle" style="color:#b45309;">Documento emitido sin conservar</div>` : ""}</td><td>${C.esc(x.creadoPor)}<div class="subtitle">${C.fecha(x.fechaCreacion)}</div></td><td style="white-space:nowrap;">${acc.join(" ")}</td></tr>`
      }).join("") : `<tr><td colspan="11" style="text-align:center;">Sin certificados</td></tr>`
      this.$("cdEstados")?.querySelectorAll("[data-cd-estado]").forEach(b => { b.className = b.dataset.cdEstado === this.$("cdFiltroEstado").value ? "btn-primary" : "btn-secondary" })
      C.barraNp(this.$("cdVistaLista"), "certificados-destruccion", () => ({ np: this.$("cdFiltroNp").value.trim() }))
    }

    excel() {
      const wb = XLSX.utils.book_new()
      C.hoja(wb, "Certificados", `Certificados de destrucción — ${C.fechaHora(new Date())}`, ["Certificado", "NP", "Ítem", "Cliente", "Producto", "Cantidad a destruir", "Motivo", "Categoría", "Estado", "Ejecutada", "Creado por", "Fecha creación", "Fecha emisión", "Cant. efectivamente destruida", "Unidad", "Código SAP", "Evidencias vigentes", "Documento emitido conservado"],
        this._lista.map(x => [x.correlativo || `(borrador #${x.id})`, x.np, x.item ?? "-", C.txt(x.cliente), C.txt(x.producto), x.cantidadDestruir, MOTIVO[x.motivo] || x.motivo, CATEGORIA[x.categoria] || x.categoria, ESTADO[x.estado] || x.estado, x.estado === "EMITIDO" ? (x.ejecutada ? "Sí" : "No") : "-", x.creadoPor, C.fecha(x.fechaCreacion), C.fecha(x.fechaEmision), x.cantidadEjecutada ?? "-", x.unidad || "-", x.itemCode || "-", x.evidencias ?? C.ND, x.documentoEmitido === undefined ? C.ND : x.documentoEmitido ? "Sí" : "No"]))
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
        if (c.estado === "BORRADOR") mk("Solicitar aprobación", async () => { const e = await this.ejecutar("solicitarAprobacion", c.id); if (e) alert(e); else document.getElementById("cdDetalle")?.remove() }, "btn-primary")
        if (c.estado === "PENDIENTE_APROBACION" && pend.length) {
          const cargos = pend.map(p => `<option>${C.esc(p.cargo)}</option>`).join("")
          const sel = { html: `<div class="form-group"><label>Cargo que decide</label><select id="cdCargo">${cargos}</select></div>`, leer: o => ({ cargo: o.querySelector("#cdCargo").value }) }
          mk("Aprobar (solo aprobador)", abrir("Aprobar certificado", "Observación", "aprobar", false, sel), "btn-primary")
          mk("Rechazar (solo aprobador)", abrir("Rechazar certificado", "Motivo del rechazo *", "rechazar", true, sel))
        }
        if (c.estado === "APROBADO") mk("Emitir certificado", async () => {
          if (!confirm("Al emitir se asigna el correlativo definitivo, que no se reutiliza. ¿Emitir?")) return
          const e = await this.ejecutar("emitir", c.id)
          if (e) { alert(e); return }
          document.getElementById("cdDetalle")?.remove()
          const aviso = await this.conservarDocumento(c.id)
          if (aviso) alert(`El certificado quedó emitido, pero no se pudo conservar su documento: ${aviso}\nÁbrelo con "Ver" y usa "Conservar documento emitido".`)
          await this.buscar()
        }, "btn-primary")
        if (c.estado === "EMITIDO" && d.archivos && !d.archivos.some(x => x.tipo === "DOCUMENTO_EMITIDO")) mk("Conservar documento emitido", async () => {
          const aviso = await this.conservarDocumento(c.id)
          if (aviso) { alert(aviso); return }
          document.getElementById("cdDetalle")?.remove()
          await this.accion("ver", c.id)
        }, "btn-primary")
        if (c.estado === "EMITIDO" && !c.ejecutada) mk("Confirmar destrucción ejecutada", abrir("Confirmar ejecución física", "Observación (obligatoria si se destruyó menos de lo aprobado)", "confirmarEjecucion", false, {
          html: `<div class="form-group"><label>Cantidad efectivamente destruida * (aprobada: ${C.num(c.cantidadDestruir)})</label><input type="number" step="any" min="0" id="cdCantEj"></div><div class="form-group"><label>Fecha de ejecución</label><input type="date" id="cdFecEj" value="${C.hoyLocal()}" max="${C.hoyLocal()}"></div>`,
          leer: o => {
            // Se pide escribirla: precargar la aprobada haría pasar por contado lo que nadie contó.
            const v = o.querySelector("#cdCantEj").value
            return v === "" || !(Number(v) > 0) ? { error: "Indica la cantidad efectivamente destruida" } : { fecha: o.querySelector("#cdFecEj").value, cantidadEjecutada: Number(v) }
          }
        }), "btn-primary")
        if (c.estado !== "ANULADO" && !c.ejecutada) mk("Anular", abrir("Anular certificado", "Motivo de anulación *", "anular", true))
      }
      if (C.destinosNp("certificados-destruccion").some(x => x.modulo === "trazabilidad")) mk("Ver NP relacionada", () => { document.getElementById("cdDetalle")?.remove(); C.irA("trazabilidad", { np: c.np, item: c.item }) })
      mk("PDF (REG-SGI-CDD-V11)", () => this.exportarV11(d, "pdf"))
      mk("Excel (REG-SGI-CDD-V11)", () => this.exportarV11(d, "excel"))
      const cuerpo = `
        <table class="table"><tbody>
          <tr><td><b>Certificado</b></td><td>${C.esc(c.correlativo || "Sin correlativo (borrador)")}</td><td><b>Estado</b></td><td>${C.esc(ESTADO[c.estado] || c.estado)}${c.ejecutada ? ` · destrucción ejecutada ${C.fecha(c.fechaEjecucion)}: ${c.cantidadEjecutada === null || c.cantidadEjecutada === undefined ? "cantidad no registrada" : C.num(c.cantidadEjecutada) + " de " + C.num(c.cantidadDestruir) + " aprobadas"}` : c.estado === "EMITIDO" ? " · ejecución física sin confirmar" : ""}</td></tr>
          <tr><td><b>NP / Ítem</b></td><td>${C.esc(c.np)} / ${C.esc(C.txt(c.item))}</td><td><b>Cliente</b></td><td>${C.esc(C.txt(c.cliente))}</td></tr>
          <tr><td><b>Producto</b></td><td>${C.esc(C.txt(c.producto))} (${C.esc(C.txt(c.codigoProducto))})</td><td><b>Cantidad a destruir</b></td><td>${C.num(c.cantidadDestruir)}</td></tr>
          <tr><td><b>Motivo / Categoría</b></td><td>${C.esc(MOTIVO[c.motivo] || c.motivo)} / ${C.esc(CATEGORIA[c.categoria] || c.categoria)}</td><td><b>Solicitante</b></td><td>${C.esc(C.txt(c.solicitanteNombre))} (${C.esc(C.txt(c.solicitanteCargo))})</td></tr>
          <tr><td><b>Defecto</b></td><td colspan="3">${C.esc(C.txt(c.descripcionDefecto))}</td></tr>
          <tr><td><b>Causa raíz</b></td><td colspan="3">${C.esc(C.txt(c.causaRaiz))}</td></tr>
          ${c.motivoAnulacion ? `<tr><td><b>Anulación</b></td><td colspan="3">${C.esc(c.motivoAnulacion)} (${C.esc(C.txt(c.anuladoPor))})</td></tr>` : ""}
        </tbody></table>
        <b>Detalle</b><table class="table"><thead><tr><th>Lote</th><th>Pallet</th><th>Defecto</th><th>Cantidad</th><th>Unidad</th><th>Origen</th></tr></thead><tbody>${lineas}</tbody></table>
        ${this.archivosHtml(d, puedeEd)}
        <b>Aprobaciones</b> <span class="subtitle">(flujo provisional hasta que Calidad/SGI defina el definitivo)</span>
        <table class="table"><thead><tr><th>Orden</th><th>Cargo</th><th>Estado</th><th>Usuario</th><th>Fecha</th><th>Observación</th></tr></thead><tbody>${aprobaciones}</tbody></table>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">${botones.map(b => `<button class="${b.cls}" id="${b.id}">${C.esc(b.txt)}</button>`).join("")}</div>`
      const ov = C.modal("cdDetalle", "Certificado de destrucción", cuerpo, "", null, 1100)
      // Mientras una acción está en curso el botón queda bloqueado: un segundo clic en "Emitir" mostraba un error falso.
      botones.forEach(b => {
        const el = ov.querySelector("#" + b.id)
        el.onclick = async () => { el.disabled = true; try { await b.fn() } finally { el.disabled = false } }
      })
      this.enlazarArchivos(ov, c)
    }

    // ── Documento emitido (copia inmutable) y evidencias ─────────────────────

    // Devuelve el mensaje de error, o null si quedó conservado.
    async conservarDocumento(id) {
      const g = await C.send("calidadNp.certificados.get", { id })
      if (!g.ok) return g.error
      const cantidadLiberada = await this.cantidadLiberada(g.data.certificado).catch(() => null)
      const r = await C.send("calidadNp.certificados.documento.conservar", { id, cantidadLiberada })
      return r.ok ? null : r.error
    }

    archivosHtml(d, puedeEd) {
      if (!d.archivos) return `<p class="subtitle">Evidencias y documento emitido: ${C.ND} (el servidor no está actualizado).</p>`
      const c = d.certificado
      const emitido = d.archivos.find(x => x.tipo === "DOCUMENTO_EMITIDO")
      const evidencias = d.archivos.filter(x => x.tipo === "EVIDENCIA")
      const filas = evidencias.map(x => `<tr${x.anulado ? ' style="opacity:.55;"' : ""}><td>${C.esc(x.nombreArchivo)}</td><td>${C.esc(C.txt(x.descripcion))}</td><td>${C.esc(x.subidoPor)}<div class="subtitle">${C.fechaHora(x.fechaSubida)}</div></td>
          <td>${x.anulado ? `Anulada por ${C.esc(x.anuladoPor)}: ${C.esc(x.motivoAnulacion)}` : "Vigente"}</td>
          <td style="white-space:nowrap;"><button class="btn-secondary" style="padding:2px 8px;" data-cd-abrir="${x.id}">Abrir</button>${puedeEd && !x.anulado ? ` <button class="btn-secondary" style="padding:2px 8px;" data-cd-anular="${x.id}" data-requiere-editar>Anular</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="5">Sin evidencias cargadas</td></tr>`
      const copia = emitido ? `<p><b>Documento emitido conservado:</b> ${C.fechaHora(emitido.fechaSubida)} por ${C.esc(emitido.subidoPor)} · huella ${C.esc(String(emitido.sha256).slice(0, 12))}…
          <button class="btn-secondary" style="padding:2px 8px;" data-cd-emitido="${emitido.id}">Ver / imprimir el original</button></p>`
        : c.estado === "EMITIDO" ? `<p style="color:#b45309;">Este certificado emitido aún no tiene su documento conservado.</p>` : ""
      const carga = puedeEd && c.estado !== "ANULADO" ? `<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin:4px 0 10px;">
          <div class="form-group" style="margin:0;"><label>Foto o respaldo (máx. 10 MB)</label><input type="file" id="cdEvArchivo" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"></div>
          <div class="form-group" style="margin:0;flex:1;min-width:200px;"><label>Descripción</label><input type="text" id="cdEvDesc" maxlength="500"></div>
          <button class="btn-secondary" id="cdEvSubir" type="button" data-requiere-editar>Agregar evidencia</button></div>` : ""
      return `${copia}<b>Evidencias y fotografías</b>
        <table class="table"><thead><tr><th>Archivo</th><th>Descripción</th><th>Cargó</th><th>Estado</th><th></th></tr></thead><tbody>${filas}</tbody></table>${carga}`
    }

    enlazarArchivos(ov, c) {
      const reabrir = async () => { ov.remove(); await this.accion("ver", c.id); await this.buscar() }
      ov.querySelectorAll("[data-cd-abrir]").forEach(b => {
        b.onclick = async () => { const r = await C.send("calidadNp.certificados.archivo.abrir", { id: c.id, archivoId: Number(b.dataset.cdAbrir) }); if (!r.ok) alert(r.error) }
      })
      ov.querySelectorAll("[data-cd-emitido]").forEach(b => {
        b.onclick = async () => { const r = await C.send("calidadNp.certificados.documento.get", { id: c.id, archivoId: Number(b.dataset.cdEmitido) }); if (!r.ok) alert(r.error); else C.imprimirHtml(r.data.html) }
      })
      ov.querySelectorAll("[data-cd-anular]").forEach(b => {
        b.onclick = () => C.modal("cdAccion", "Anular evidencia", `<div class="form-group"><label>Motivo *</label><textarea id="cdObs" rows="2" style="width:100%"></textarea></div>`, "Anular", async o => {
          const motivo = o.querySelector("#cdObs").value.trim()
          if (!motivo) return "El motivo es obligatorio"
          const r = await C.send("calidadNp.certificados.archivos.anular", { id: c.id, archivoId: Number(b.dataset.cdAnular), motivo })
          if (!r.ok) return r.error
          await reabrir()
        }, 460)
      })
      const subir = ov.querySelector("#cdEvSubir")
      if (subir) subir.onclick = async () => {
        const f = ov.querySelector("#cdEvArchivo").files[0]
        if (!f) { alert("Selecciona un archivo"); return }
        if (f.size > 10 * 1024 * 1024) { alert("El archivo excede 10 MB"); return }
        subir.disabled = true
        const r = await C.send("calidadNp.certificados.archivos.agregar", { id: c.id, tipo: "EVIDENCIA", nombre: f.name, contenidoBase64: await C.leerArchivoBase64(f), descripcion: ov.querySelector("#cdEvDesc").value.trim() })
        subir.disabled = false
        if (!r.ok) { alert(r.error); return }
        await reabrir()
      }
    }

    // ── Formulario REG-SGI-CDD-V11 ───────────────────────────────────────────

    async formulario(id, pedido) {
      let c = {}
      let detalle = []
      if (id) {
        const r = await C.send("calidadNp.certificados.get", { id })
        if (!r.ok) { alert(r.error); return }
        c = r.data.certificado
        detalle = r.data.detalle || []
      }
      this._form = { id, np: c.np || "", mermas: [], carga: null, sap: { itemCode: c.itemCode ?? null, nvDocEntry: c.nvDocentry ?? null, nvLineas: c.nvLineas ?? null } }
      const o = (v, t, s) => `<option value="${C.esc(v)}"${s === v ? " selected" : ""}>${C.esc(t)}</option>`
      const iv = (k, d = "") => C.esc(c[k] ?? d)
      const hoy = C.hoyLocal()
      const cuerpo = `
        <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px;">
          <div class="form-group" style="margin:0;"><label>NP *</label><input type="text" id="cdfNp" value="${iv("np")}" ${id ? "disabled" : ""}></div>
          <button class="btn-secondary" id="cdfCargar" type="button" ${id ? "disabled" : ""}>Cargar datos y mermas</button><span id="cdfMsg" class="subtitle"></span>
        </div>
        <div id="cdfOtros"></div>
        <div id="cdfAntecedentes"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div class="form-group"><label>Ítem</label><select id="cdfItem"><option value="${iv("item")}">${iv("item", "—")}</option></select></div>
          <div class="form-group"><label>Cliente</label><input type="text" id="cdfCliente" value="${iv("cliente")}"></div>
          <div class="form-group"><label>Razón social</label><select id="cdfRazon">${[...new Set([c.razonSocial, RAZON_SOCIAL].filter(Boolean))].map(v => o(v, v, c.razonSocial || RAZON_SOCIAL)).join("")}</select></div>
          <div class="form-group"><label>Código o N° de pliego</label><input type="text" id="cdfCodigo" value="${iv("codigoProducto")}"></div>
          <div class="form-group"><label>Producto</label><input type="text" id="cdfProducto" value="${iv("producto")}"></div>
          <div class="form-group"><label>Formato</label><select id="cdfFormato">${o("PRODUCTO", "Producto", c.formato)}${o("PLIEGO", "Pliego", c.formato)}${o("OTROS", "Otros", c.formato)}</select></div>
          <div class="form-group"><label>Cantidad solicitada</label><input type="number" step="any" id="cdfSolic" value="${iv("cantidadSolicitada")}"></div>
          <div class="form-group"><label>Cantidad total a destruir *</label><input type="number" step="any" min="0" id="cdfCant" value="${iv("cantidadDestruir")}"></div>
          <div class="form-group"><label>Fecha fabricación/lote</label><input type="date" id="cdfFab" value="${C.esc(String(c.fechaFabricacionLote || "").slice(0, 10))}">
            <select id="cdfLote" style="display:none;margin-top:4px;" aria-label="Fecha de producción registrada en FPS"></select><div id="cdfLoteNota" class="subtitle"></div></div>
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
        <div style="overflow-x:auto;"><table class="table"><thead><tr><th>Merma de origen</th><th>Lote</th><th>Pallet</th><th>Defecto</th><th>Cantidad</th><th>Unidad</th><th></th></tr></thead><tbody id="cdfLineas"></tbody></table></div>
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
        this._form.sinMermas = !r.ok
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
        await this.avisarOtrosCertificados(ov, carga.np, id)
        const [nc, inspeccion] = await Promise.all([this.consultarNc(carga.np), this.consultarDefectosInspeccion(carga.np)])
        const items = carga.data?.items || []
        const sel = ov.querySelector("#cdfItem")
        const verAntecedentes = () => this.pintarAntecedentes(ov, this.antecedentes(carga, nc, sel.value, inspeccion))
        this.pintarLotes(ov, carga.data)
        if (items.length) {
          sel.innerHTML = items.map(i => `<option value="${i.item}">${C.esc(i.item)} — ${C.esc(i.itemCode || "")}</option>`).join("")
          const pedidoItem = String(this._form.itemPedido ?? "")
          this._form.itemPedido = null
          if (pedidoItem && items.some(i => String(i.item) === pedidoItem)) sel.value = pedidoItem
          const llenar = () => {
            const it = items.find(i => String(i.item) === sel.value)
            if (!it) return
            ov.querySelector("#cdfCodigo").value = it.itemCode || ""
            ov.querySelector("#cdfProducto").value = it.descripcion || ""
            ov.querySelector("#cdfSolic").value = it.solicitado ?? ""
          }
          sel.onchange = () => { llenar(); verAntecedentes() }
          llenar()
          ov.querySelector("#cdfCliente").value = carga.data?.ordenes?.[0]?.Cliente || ov.querySelector("#cdfCliente").value
        }
        lineasEl.querySelectorAll(".cdl-merma").forEach(s => { s.innerHTML = mermaOpts(s.value) })
        verAntecedentes()
        const msgMermas = this._form.sinMermas ? "Mermas no disponibles (no se pudieron consultar)" : `${this._form.mermas.length} merma(s) con saldo`
        ov.querySelector("#cdfMsg").textContent = carga.data ? msgMermas : `FPS/SAP no disponible: completa los datos a mano. ${this._form.sinMermas ? msgMermas : ""}`
      }
      if (!id && pedido?.np) {
        ov.querySelector("#cdfNp").value = pedido.np
        this._form.itemPedido = pedido.item
        await ov.querySelector("#cdfCargar").onclick()
      }
    }

    // Fechas de producción de la NP según las corridas válidas de FPS. FPS registra por OT: no se atribuyen a un ítem.
    lotesProduccion(data) {
      const porFecha = new Map()
      for (const s of data?.sesiones || []) {
        const fecha = String(s.ProductionStartDate || "").slice(0, 10)
        if (Number(s.Status) !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue
        const g = porFecha.get(fecha) || { fecha, corridas: 0, maquinas: new Set() }
        g.corridas++
        if (s.Maquina) g.maquinas.add(String(s.Maquina).trim())
        porFecha.set(fecha, g)
      }
      return [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(g => ({ ...g, maquinas: [...g.maquinas] }))
    }

    // Con una sola fecha se autocompleta; con varias elige la persona. Lo escrito a mano no se reemplaza.
    pintarLotes(ov, data) {
      const campo = ov.querySelector("#cdfFab")
      const sel = ov.querySelector("#cdfLote")
      const nota = ov.querySelector("#cdfLoteNota")
      if (campo.value && campo.value === this._form.fabAuto) campo.value = "" // venía de la NP consultada antes
      this._form.fabAuto = null
      const lotes = this.lotesProduccion(data)
      const incompleto = data?.sesionesTruncadas ? " FPS entregó las corridas recortadas: puede faltar alguna fecha." : ""
      sel.style.display = lotes.length > 1 ? "" : "none"
      sel.innerHTML = lotes.length > 1
        ? `<option value="">Elegir fecha de producción (${lotes.length})</option>` + lotes.map(l => `<option value="${l.fecha}">${C.fecha(l.fecha)} · ${l.corridas} corrida(s)${l.maquinas.length ? " · " + C.esc(l.maquinas.join(", ")) : ""}</option>`).join("")
        : ""
      sel.onchange = () => { if (sel.value) campo.value = sel.value }
      if (lotes.length === 1 && !campo.value) campo.value = this._form.fabAuto = lotes[0].fecha
      nota.textContent = (!data ? "Producción no disponible: ingresa la fecha a mano."
        : !lotes.length ? "FPS no registra corridas válidas con fecha de producción: ingresa la fecha a mano."
        : lotes.length > 1 ? "La NP tiene varias fechas de producción en FPS (de todos sus ítems): elige la del lote."
        : campo.value === lotes[0].fecha ? "Tomada de la producción registrada en FPS." : `FPS registra producción el ${C.fecha(lotes[0].fecha)}.`) + incompleto
    }

    // Aviso para no duplicar: certificados vigentes que ya existen para la NP.
    async avisarOtrosCertificados(ov, np, propio) {
      const el = ov.querySelector("#cdfOtros")
      const r = await C.send("calidadNp.certificados.list", { np })
      if (!r.ok) { el.innerHTML = `<p class="subtitle">No se pudo revisar si la NP ya tiene certificados.</p>`; return }
      const otros = (r.data || []).filter(x => x.id !== propio && x.estado !== "ANULADO" && x.estado !== "RECHAZADO")
      el.innerHTML = otros.length ? `<div class="card" style="padding:8px 12px;margin-bottom:10px;background:#fef3c7;color:#92400e;"><b>La NP ya tiene ${otros.length} certificado(s) vigente(s). Revisa que no sea la misma destrucción:</b><ul style="margin:2px 0 0 18px;">${otros.map(x => `<li>${C.esc(x.correlativo || "#" + x.id)} · ítem ${C.esc(C.txt(x.item))} · ${C.num(x.cantidadDestruir)} · ${C.esc(ESTADO[x.estado] || x.estado)}</li>`).join("")}</ul></div>` : ""
    }

    // NC de producto de la NP. null = sin permiso o consulta fallida (nunca "no hay").
    async consultarNc(np) {
      if (C.nivel && C.nivel("no-conformidades") === "SIN_ACCESO") return null
      try {
        const r = await C.send("trazabilidad.noConformidades", { np })
        return r.ok ? r.data?.items || [] : null
      } catch {
        return null
      }
    }

    // Defectos ya registrados por inspección para la NP (coincidencia exacta). No se crea un defecto nuevo. El nombre
    // del defecto de Producto Terminado solo viene en el detalle: se pide para los No Conforme, hasta MAX_DETALLES_PT.
    async consultarDefectosInspeccion(np) {
      const MAX_DETALLES_PT = 10
      let cal
      try {
        cal = await C.calidadDeNp(np)
      } catch {
        return null
      }
      const dato = v => (v && v !== "-" ? String(v) : "")
      const registros = cal.registros.items.filter(r => dato(r.tipoDefecto)).map(r => ({
        origen: `Registro de control #${r.id}`, fecha: r.fechaRegistro, proceso: r.proceso, maquina: r.maquina, codigo: dato(r.codigoProducto),
        defecto: r.tipoDefecto, nota: [dato(r.tipoMerma) && `merma declarada: ${r.tipoMerma} ${dato(r.cantidadMerma)}`.trim(), r.estadoValidacion && `validación: ${r.estadoValidacion}`].filter(Boolean).join(" · ")
      }))
      const noConformes = cal.productoTerminado.items.filter(r => r.resultado === "NO CONFORME")
      const terminado = await Promise.all(noConformes.slice(0, MAX_DETALLES_PT).map(async r => {
        let nombres = null, unidades = null
        try {
          const d = await C.send("productoTerminado.detalle", { empresa: "INNPACK", id: r.id })
          if (d.ok) {
            nombres = [...new Set((d.data?.hallazgos || []).flatMap(h => (h.defectos || []).map(x => x.nombre)))].join("; ")
            unidades = d.data?.unidadesNoConformes ?? null
          }
        } catch {
          // queda como no disponible
        }
        return {
          origen: `Producto terminado #${r.id}`, fecha: r.fechaRegistro, proceso: r.proceso, maquina: r.maquina, codigo: dato(r.codigoProducto),
          defecto: nombres, nota: unidades === null ? "No conforme" : `No conforme · ${C.num(unidades)} unidades no conformes en la muestra o lote inspeccionado`
        }
      }))
      return {
        items: [...registros, ...terminado],
        fuentes: [["Registros de control", cal.registros.estado], ["Producto terminado", cal.productoTerminado.estado]],
        sinDetalle: noConformes.length - terminado.length
      }
    }

    // Rechazos, cuarentenas y destrucciones ya registrados en la plataforma. Son referencia: no crean líneas ni
    // cantidades, y una cuarentena no es producto destruido.
    antecedentes(carga, nc, item, inspeccion) {
      const codigos = (carga?.data?.items || []).filter(i => String(i.item) === String(item)).map(i => i.itemCode)
      const delItem = d => !codigos.length || !d.codigo || codigos.includes(d.codigo)
      const lib = carga?.data?.liberaciones || null
      const folios = lib && lib.filter(l => /cuarentena|destrucc/i.test(l.BodegaDestino || "") && (!item || String(l.Item) === String(item)))
      return {
        folios: folios && folios.map(l => ({ folio: l.Folio, fecha: l.Fecha, destino: l.BodegaDestino, cantidad: l.Cantidad, codigo: l.ItemCode })),
        inspeccion: inspeccion ? { ...inspeccion, items: inspeccion.items.filter(delItem), otrosCodigos: inspeccion.items.filter(d => !delItem(d)).length } : null,
        nc: nc && nc.map(x => ({ id: x.id, defecto: x.categoriaDefecto || "", rechazada: x.cantRechazada, estado: x.estadoGestion, causaRaiz: String(x.causaRaiz || "").trim() }))
      }
    }

    pintarAntecedentes(ov, a) {
      const el = ov.querySelector("#cdfAntecedentes")
      const folios = a.folios === null ? `<div class="subtitle">Folios QCS: ${C.esc(C.ND)}</div>`
        : !a.folios.length ? `<div class="subtitle">QCS no registra folios a cuarentena ni destrucción para el ítem.</div>`
        : `<div class="subtitle">Folios QCS a cuarentena o destrucción (la cuarentena no es producto destruido):</div><ul style="margin:2px 0 6px 18px;">${a.folios.map(f => `<li>Folio ${C.esc(f.folio)} · ${C.esc(C.txt(f.fecha))} · ${C.esc(f.destino)} · ${C.num(f.cantidad)} unidades · ${C.esc(f.codigo)}</li>`).join("")}</ul>`
      const nc = a.nc === null ? `<div class="subtitle">No conformidades: no disponibles o sin permiso.</div>`
        : !a.nc.length ? `<div class="subtitle">Sin no conformidades de producto para la NP.</div>`
        : `<div class="subtitle">No conformidades de la NP (todas sus líneas):</div><ul style="margin:2px 0 6px 18px;">${a.nc.map((x, k) => `<li>NC ${C.esc(x.id)} · ${C.esc(x.defecto || "sin defecto")} · rechazadas ${C.num(x.rechazada)} · ${C.esc(C.txt(x.estado))}
            ${x.defecto ? ` <button type="button" class="btn-secondary" style="padding:1px 6px;" data-usar="defecto" data-k="${k}">Usar defecto</button>` : ""}
            ${x.causaRaiz ? ` <button type="button" class="btn-secondary" style="padding:1px 6px;" data-usar="causa" data-k="${k}">Usar causa raíz</button> <i>${C.esc(x.causaRaiz)}</i>` : " · sin causa raíz registrada"}</li>`).join("")}</ul>`
      el.innerHTML = `<div class="card" style="padding:8px 12px;margin-bottom:10px;"><b>Antecedentes registrados en la plataforma</b>${folios}${nc}${this.htmlDefectosInspeccion(a.inspeccion)}</div>`
      el.querySelectorAll("[data-usar]").forEach(b => {
        b.onclick = () => {
          if (b.dataset.usar === "inspeccion") {
            const d = a.inspeccion.items[Number(b.dataset.k)]
            return this.agregarTexto(ov.querySelector("#cdfDef"), `${d.defecto} (${d.origen})`)
          }
          const x = a.nc[Number(b.dataset.k)]
          const causa = b.dataset.usar === "causa"
          this.agregarTexto(ov.querySelector(causa ? "#cdfCausa" : "#cdfDef"), `${causa ? x.causaRaiz : x.defecto} (NC ${x.id})`)
        }
      })
    }

    // Una fuente sin permiso o con error se declara: la lista vacía solo significa "sin defectos" si ambas respondieron.
    htmlDefectosInspeccion(i) {
      if (!i) return `<div class="subtitle">Defectos de inspección: ${C.esc(C.ND)}</div>`
      const caidas = i.fuentes.filter(f => f[1] !== "OK").map(f => `${f[0]}: ${f[1] === "SIN_PERMISO" ? "sin permiso" : "no disponible"}`)
      const avisos = [
        ...caidas,
        i.sinDetalle > 0 ? `${i.sinDetalle} inspección(es) No Conforme de producto terminado sin consultar: revísalas en su módulo` : "",
        i.otrosCodigos > 0 ? `${i.otrosCodigos} registro(s) de otros códigos de la NP no se muestran` : ""
      ].filter(Boolean).map(t => `<div class="subtitle" style="color:#92400e;">${C.esc(t)}</div>`).join("")
      if (!i.items.length) return `<div class="subtitle">Defectos de inspección: ${caidas.length ? "sin resultados en las fuentes consultadas" : "no hay registros con defecto para la NP y el ítem"}.</div>${avisos}`
      return `<div class="subtitle">Defectos registrados en inspección (referencia, no son cantidades a destruir):</div><ul style="margin:2px 0 6px 18px;max-height:180px;overflow-y:auto;">${i.items.map((d, k) => `<li>${C.esc(d.origen)} · ${C.esc(C.txt(d.fecha))} · ${C.esc(C.txt(d.proceso))} · ${C.esc(C.txt(d.maquina))} · <b>${C.esc(d.defecto === null ? C.ND : d.defecto || "sin defecto marcado")}</b>${d.nota ? ` · ${C.esc(d.nota)}` : ""}
          ${d.defecto ? ` <button type="button" class="btn-secondary" style="padding:1px 6px;" data-usar="inspeccion" data-k="${k}">Usar defecto</button>` : ""}</li>`).join("")}</ul>${avisos}`
    }

    // Agrega al campo sin borrar lo escrito y sin repetir el mismo antecedente. El origen queda en el texto.
    agregarTexto(campo, texto) {
      if (campo.value.includes(texto)) return
      campo.value = campo.value.trim() ? `${campo.value.trim()}\n${texto}` : texto
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
      const itemNum = o.querySelector("#cdfItem").value
      const itSap = (this._form.carga?.data?.items || []).filter(i => String(i.item) === itemNum)
      // Al editar sin recargar la NP se conserva la línea SAP ya guardada.
      const sap = itSap.length === 1 ? C.itemSap(this._form.carga, itSap[0]) : this._form.sap || {}
      const body = {
        ...sap, id: this._form.id, np: v("cdfNp"), item: o.querySelector("#cdfItem").value ? Number(o.querySelector("#cdfItem").value) : null, cliente: v("cdfCliente"), razonSocial: v("cdfRazon"),
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
