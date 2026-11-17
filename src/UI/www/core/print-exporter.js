window.PrintExporter = {
    printTable(options) {
        const {
            tableSelector,
            titulo = "Reporte QCC",
            empresa = "",
            subtitulo = "",
            totalRegistros = null
        } = options

        const table = document.querySelector(tableSelector)

        if (!table) {
            alert("No se encontró la tabla para imprimir")
            return
        }

        const now = new Date()
        const fecha = now.toLocaleString("es-CL")
        const usuario = sessionStorage.getItem("nombreUsuario")
            || sessionStorage.getItem("faretNombreUsuario")
            || sessionStorage.getItem("codigoUsuario")
            || ""

        const total = totalRegistros ?? table.querySelectorAll("tbody tr").length

        // La tabla original suele estar posicionada fuera de pantalla (tablas temporales de
        // exportación); se clona y se limpia el estilo inline para que se vea en la página impresa.
        const tableClone = table.cloneNode(true)
        tableClone.removeAttribute("style")

        // Cuando se imprime directo desde una tabla visible (no una temporal de exportación),
        // se descartan columnas de solo-UI (checkbox de "fijar fila"), igual que ExcelExporter.
        tableClone.querySelectorAll(".tu-th-check, .tu-td-check").forEach(el => el.remove())

        const iframe = document.createElement("iframe")
        iframe.style.position = "fixed"
        iframe.style.right = "0"
        iframe.style.bottom = "0"
        iframe.style.width = "0"
        iframe.style.height = "0"
        iframe.style.border = "0"
        document.body.appendChild(iframe)

        const doc = iframe.contentDocument
        doc.open()
        doc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>${titulo}</title>
                <style>
                    @page { size: letter landscape; margin: 20mm 18mm; }
                    * { box-sizing: border-box; }
                    html, body { width: 100%; overflow-x: hidden; }
                    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: 0 2mm; }
                    .print-header { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 4px; }
                    .print-header .empresa { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: .04em; }
                    .print-header h1 { font-size: 16px; margin: 2px 0 0; }
                    .print-meta { flex-shrink: 0; max-width: 45%; font-size: 10px; color: #64748B; text-align: right; line-height: 1.5; overflow-wrap: break-word; }
                    .print-filtros { font-size: 11px; color: #334155; margin: 8px 0 10px; overflow-wrap: break-word; }
                    .print-filtros strong { color: #111827; }
                    table { table-layout: fixed; width: 100%; border-collapse: collapse; font-size: 9.5px; }
                    thead { display: table-header-group; }
                    tr { break-inside: avoid; }
                    th, td { border: 1px solid #CBD5E1; padding: 4px 6px; text-align: left; vertical-align: top; overflow-wrap: break-word; word-break: break-word; }
                    th { background: #F1F5F9; font-weight: 700; }
                    tbody tr:nth-child(even) { background: #F8FAFC; }
                    .print-footer { margin-top: 10px; font-size: 9px; color: #94A3B8; text-align: right; overflow-wrap: break-word; }
                </style>
            </head>
            <body>
                <div class="print-header">
                    <div>
                        <div class="empresa">${empresa}</div>
                        <h1>${titulo}</h1>
                    </div>
                    <div class="print-meta">
                        Generado: ${fecha}${usuario ? ` · ${usuario}` : ""}<br>
                        Total de registros: ${total}
                    </div>
                </div>
                ${subtitulo ? `<div class="print-filtros"><strong>Filtro aplicado:</strong> ${subtitulo}</div>` : ""}
                ${tableClone.outerHTML}
                <div class="print-footer">Quality Control Center</div>
            </body>
            </html>
        `)
        doc.close()

        const limpiar = () => iframe.remove()

        iframe.contentWindow.onafterprint = limpiar
        setTimeout(limpiar, 120000)

        iframe.contentWindow.focus()
        iframe.contentWindow.print()
    },

    // Reporte de indicadores/gráficos (distinto de printTable: no imprime una tabla del DOM sino
    // un resumen numérico + imágenes de gráficos Chart.js vía chart.toBase64Image() + tablas de
    // datos resumidos). Mismo mecanismo iframe oculto + print() que printTable, sin tocarla.
    printReport(options) {
        const {
            titulo = "Reporte QCC",
            empresa = "",
            subtitulo = "",
            totalRegistros = 0,
            resumen = [],
            graficos = [],
            tablas = [],
        } = options

        const now = new Date()
        const fecha = now.toLocaleString("es-CL")
        const usuario = sessionStorage.getItem("nombreUsuario")
            || sessionStorage.getItem("faretNombreUsuario")
            || sessionStorage.getItem("codigoUsuario")
            || ""

        const resumenHtml = resumen.length
            ? `<div class="print-resumen">${resumen.map(r => `
                <div class="print-resumen-item"><span>${r.label}</span><strong>${r.valor}</strong></div>
            `).join("")}</div>`
            : ""

        const graficosHtml = graficos.length
            ? `<div class="print-graficos">${graficos.map(g => `
                <div class="print-grafico${g.full ? " print-grafico-full" : ""}">
                    <h3>${g.titulo}</h3>
                    <img src="${g.imagen}" alt="${g.titulo}">
                </div>
            `).join("")}</div>`
            : ""

        const tablasHtml = tablas.map(t => `
            <div class="print-tabla-resumen">
                <h3>${t.titulo}</h3>
                <table>
                    <thead><tr>${t.columnas.map(c => `<th>${c}</th>`).join("")}</tr></thead>
                    <tbody>${t.filas.map(f => `<tr>${f.map(v => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody>
                </table>
            </div>
        `).join("")

        const iframe = document.createElement("iframe")
        iframe.style.position = "fixed"
        iframe.style.right = "0"
        iframe.style.bottom = "0"
        iframe.style.width = "0"
        iframe.style.height = "0"
        iframe.style.border = "0"
        document.body.appendChild(iframe)

        const doc = iframe.contentDocument
        doc.open()
        doc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>${titulo}</title>
                <style>
                    @page { size: A4 portrait; margin: 14mm 15mm; }
                    * { box-sizing: border-box; }
                    html, body { width: 100%; overflow-x: hidden; }
                    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: 0 2mm; }
                    .print-header { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111827; padding-bottom: 6px; margin-bottom: 4px; }
                    .print-header .empresa { font-size: 10px; color: #64748B; text-transform: uppercase; letter-spacing: .04em; }
                    .print-header h1 { font-size: 15px; margin: 2px 0 0; }
                    .print-meta { flex-shrink: 0; max-width: 45%; font-size: 9px; color: #64748B; text-align: right; line-height: 1.4; overflow-wrap: break-word; }
                    .print-filtros { font-size: 10px; color: #334155; margin: 6px 0 8px; overflow-wrap: break-word; }
                    .print-filtros strong { color: #111827; }
                    .print-resumen { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 6px; margin: 8px 0 12px; }
                    .print-resumen-item { border: 1px solid #CBD5E1; border-radius: 5px; padding: 5px 8px; font-size: 8.5px; display: flex; flex-direction: column; gap: 1px; break-inside: avoid; page-break-inside: avoid; }
                    .print-resumen-item span { color: #64748B; }
                    .print-resumen-item strong { font-size: 12px; color: #111827; }
                    /* Grid de 2 columnas; el Pareto (.print-grafico-full) ocupa el ancho completo.
                       Si falta un gráfico (ej. Rechazos sin datos), el auto-flow de grid acomoda
                       el resto en su lugar — no queda hueco vacío. */
                    .print-graficos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 14px; }
                    .print-grafico { border: 1px solid #CBD5E1; border-radius: 6px; padding: 8px 10px; break-inside: avoid; page-break-inside: avoid; }
                    .print-grafico-full { grid-column: 1 / -1; }
                    .print-grafico h3 { font-size: 10px; margin: 0 0 6px; color: #1E293B; font-weight: 700; }
                    .print-grafico img { display: block; width: 100%; max-height: 240px; object-fit: contain; margin: 0 auto; }
                    .print-grafico-full img { max-height: 300px; }
                    .print-tabla-resumen { margin-bottom: 14px; break-inside: avoid; page-break-inside: avoid; }
                    .print-tabla-resumen h3 { font-size: 11px; margin: 0 0 6px; color: #334155; }
                    table { table-layout: fixed; width: 100%; border-collapse: collapse; font-size: 9.5px; }
                    thead { display: table-header-group; }
                    th, td { border: 1px solid #CBD5E1; padding: 4px 6px; text-align: left; vertical-align: top; overflow-wrap: break-word; word-break: break-word; }
                    th { background: #F1F5F9; font-weight: 700; }
                    tbody tr:nth-child(even) { background: #F8FAFC; }
                    .print-footer { margin-top: 10px; font-size: 9px; color: #94A3B8; text-align: right; }
                </style>
            </head>
            <body>
                <div class="print-header">
                    <div>
                        <div class="empresa">${empresa}</div>
                        <h1>${titulo}</h1>
                    </div>
                    <div class="print-meta">
                        Generado: ${fecha}${usuario ? ` · ${usuario}` : ""}<br>
                        Total de registros filtrados: ${totalRegistros}
                    </div>
                </div>
                ${subtitulo ? `<div class="print-filtros"><strong>Filtros activos:</strong> ${subtitulo}</div>` : ""}
                ${resumenHtml}
                ${graficosHtml}
                ${tablasHtml}
                <div class="print-footer">Quality Control Center</div>
            </body>
            </html>
        `)
        doc.close()

        const limpiar = () => iframe.remove()

        iframe.contentWindow.onafterprint = limpiar
        setTimeout(limpiar, 120000)

        // Espera determinista (sin setTimeout arbitrario): no basta con img.complete — se
        // confirma naturalWidth/naturalHeight > 0 (la imagen realmente tiene píxeles decodificados
        // y listos para pintarse). Si una imagen puntual falla (error, o carga con 0x0), se quita
        // su bloque del reporte impreso y se registra en consola, sin bloquear el resto ni
        // detener la impresión — nunca se espera indefinidamente a una imagen rota.
        const esperarImagen = img => new Promise(resolve => {
            const finalizar = ok => {
                if (!ok) {
                    console.warn(`[Impresión] Imagen no se pudo pintar en el iframe, se omite: ${img.alt || "(sin título)"}`)
                    img.closest(".print-grafico")?.remove()
                }
                resolve()
            }

            const verificar = () => finalizar(img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)

            if (img.complete) {
                verificar()
                return
            }

            img.addEventListener("load", verificar, { once: true })
            img.addEventListener("error", () => finalizar(false), { once: true })
        })

        const imagenes = Array.from(doc.querySelectorAll("img"))
        Promise.all(imagenes.map(esperarImagen)).then(() => {
            iframe.contentWindow.focus()
            iframe.contentWindow.print()
        })
    },

    // Reporte PDF de uno o varios gráficos (Inicio Faret). Mismo mecanismo iframe oculto + print()
    // que printReport, sin tocarlo: el usuario elige "Guardar como PDF" en el diálogo de impresión.
    // graficos: [{ titulo, subtitulo?, canvas, tabla?: { columnas: [], filas: [[]] } }]
    // Un solo gráfico sale en hoja horizontal a página completa; varios, en vertical (2 por hoja).
    printCharts(options) {
        const {
            titulo = "Gráficos",
            empresa = "",
            subtitulo = "",
            graficos = [],
        } = options

        const esc = v => String(v ?? "")
            .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

        // El canvas de Chart.js es transparente: se pinta sobre fondo blanco para que el PDF no
        // dependa del visor. Un canvas sin tamaño (oculto) se omite en vez de salir en blanco.
        const imagenDe = canvas => {
            if (!canvas || !canvas.width || !canvas.height) return ""
            try {
                const tmp = document.createElement("canvas")
                tmp.width = canvas.width
                tmp.height = canvas.height
                const ctx = tmp.getContext("2d")
                ctx.fillStyle = "#FFFFFF"
                ctx.fillRect(0, 0, tmp.width, tmp.height)
                ctx.drawImage(canvas, 0, 0)
                const url = tmp.toDataURL("image/png")
                return url.startsWith("data:image/png;base64,") && url.length > 200 ? url : ""
            } catch (err) {
                console.warn("[PDF gráficos] No se pudo capturar el gráfico.", err)
                return ""
            }
        }

        const bloques = graficos
            .map(g => ({ ...g, imagen: imagenDe(g.canvas) }))
            .filter(g => g.imagen)

        if (!bloques.length) {
            alert("No hay gráficos con datos para exportar.")
            return
        }

        // Paginación explícita (nada queda al azar del motor de impresión): cada hoja es un bloque de
        // alto fijo, un poco menor al área imprimible para que nunca se desborde a una hoja en blanco.
        // Un gráfico solo: hoja horizontal completa. Varios: hojas verticales con 2 gráficos cada una;
        // un gráfico con tabla de datos ocupa su hoja entera. El gráfico se escala para llenar el
        // espacio libre de su recuadro (object-fit: contain, sin deformarse).
        const unico = bloques.length === 1
        const ALTO_HOJA_MM = unico ? 182 : 268 // A4 menos márgenes de 12 mm (186 / 273 mm) y holgura
        const paginas = []
        let par = null
        bloques.forEach(g => {
            if (unico || g.tabla) {
                if (par) { paginas.push(par); par = null }
                paginas.push([g])
            } else if (!par) {
                par = [g]
            } else {
                par.push(g)
                paginas.push(par)
                par = null
            }
        })
        if (par) paginas.push(par)

        const fecha = new Date().toLocaleString("es-CL")
        const usuario = sessionStorage.getItem("nombreUsuario")
            || sessionStorage.getItem("faretNombreUsuario")
            || sessionStorage.getItem("codigoUsuario")
            || ""

        const tablaHtml = t => t && t.filas?.length ? `
            <table>
                <thead><tr>${t.columnas.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>
                <tbody>${t.filas.map(f => `<tr>${f.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody>
            </table>` : ""

        const bloqueHtml = g => `
            <section class="grafico">
                <h2>${esc(g.titulo)}</h2>
                ${g.subtitulo ? `<div class="grafico-sub">${esc(g.subtitulo)}</div>` : ""}
                <div class="img-box"><img src="${g.imagen}" alt="${esc(g.titulo)}"></div>
                ${tablaHtml(g.tabla)}
            </section>`

        const paginasHtml = paginas.map((p, i) => `
            <div class="pagina">
                <div class="cabecera">
                    <div>
                        ${empresa ? `<div class="empresa">${esc(empresa)}</div>` : ""}
                        <h1>${esc(titulo)}</h1>
                        ${subtitulo ? `<div class="sub">${esc(subtitulo)}</div>` : ""}
                    </div>
                    <div class="meta">
                        <strong>Generado:</strong> ${esc(fecha)}<br>
                        ${usuario ? `<strong>Usuario:</strong> ${esc(usuario)}` : ""}
                    </div>
                </div>
                <div class="cuerpo">${p.map(bloqueHtml).join("")}</div>
                <div class="pie"><span>Quality Control Center · Generado el ${esc(fecha)}</span><span>Página ${i + 1} de ${paginas.length}</span></div>
            </div>
        `).join("")

        const iframe = document.createElement("iframe")
        iframe.style.position = "fixed"
        iframe.style.right = "0"
        iframe.style.bottom = "0"
        iframe.style.width = "0"
        iframe.style.height = "0"
        iframe.style.border = "0"
        document.body.appendChild(iframe)

        const doc = iframe.contentDocument
        doc.open()
        doc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>${esc(titulo)}</title>
                <style>
                    @page { size: A4 ${unico ? "landscape" : "portrait"}; margin: 12mm; }
                    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    html, body { margin: 0; padding: 0; }
                    body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #0F172A; }
                    .pagina { height: ${ALTO_HOJA_MM}mm; display: flex; flex-direction: column; overflow: hidden; break-after: page; page-break-after: always; }
                    .pagina:last-child { break-after: auto; page-break-after: auto; }
                    .cabecera { flex: none; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; padding-bottom: 6px; margin-bottom: 4mm; border-bottom: 3px solid #1D4ED8; }
                    .empresa { font-size: 9.5px; font-weight: 700; color: #1D4ED8; text-transform: uppercase; letter-spacing: .08em; }
                    h1 { font-size: 16px; margin: 2px 0 0; }
                    .sub { font-size: 10.5px; color: #475569; margin-top: 2px; }
                    .meta { font-size: 9px; color: #475569; text-align: right; line-height: 1.5; white-space: nowrap; }
                    .meta strong { color: #0F172A; }
                    .cuerpo { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 4mm; }
                    .grafico { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; border: 1px solid #E2E8F0; border-radius: 8px; padding: 3mm 4mm; }
                    .grafico h2 { flex: none; font-size: 12.5px; margin: 0; color: #0F172A; }
                    .grafico-sub { flex: none; font-size: 9.5px; color: #64748B; margin-top: 1px; }
                    .img-box { flex: 1; min-height: 0; position: relative; margin-top: 2mm; }
                    .img-box img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
                    table { flex: none; width: 100%; border-collapse: collapse; font-size: 8.5px; margin-top: 2mm; }
                    th, td { border: 1px solid #E2E8F0; padding: 2px 6px; text-align: right; }
                    th:first-child, td:first-child { text-align: left; }
                    th { background: #F1F5F9; font-weight: 700; }
                    tbody tr:nth-child(even) { background: #F8FAFC; }
                    tbody tr:last-child td { font-weight: 700; background: #EEF2FF; }
                    .pie { flex: none; margin-top: 3mm; font-size: 8px; color: #94A3B8; display: flex; justify-content: space-between; }
                </style>
            </head>
            <body>${paginasHtml}</body>
            </html>
        `)
        doc.close()

        const limpiar = () => iframe.remove()
        iframe.contentWindow.onafterprint = limpiar
        setTimeout(limpiar, 120000)

        const esperar = img => new Promise(resolve => {
            if (img.complete) return resolve()
            img.addEventListener("load", resolve, { once: true })
            img.addEventListener("error", resolve, { once: true })
        })
        Promise.all(Array.from(doc.querySelectorAll("img")).map(esperar)).then(() => {
            iframe.contentWindow.focus()
            iframe.contentWindow.print()
        })
    }
}
