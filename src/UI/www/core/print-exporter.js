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
    }
}
