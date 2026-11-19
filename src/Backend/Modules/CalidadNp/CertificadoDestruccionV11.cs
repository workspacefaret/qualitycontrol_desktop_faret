using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using ClosedXML.Excel;

namespace QualityControlCenter.Modules.CalidadNp
{
    // Certificado de destrucción en el formato oficial REG-SGI-CDD-V11. Se parte de la plantilla Excel original
    // (recurso incrustado: celdas combinadas, logotipos y estilos intactos) y solo se rellenan las celdas variables
    // con el certificado que entrega la API. El mismo libro sirve para el Excel y, renderizado a HTML, para el PDF.
    // Nunca se muestra como emitido ni aprobado lo que la API no confirma.
    public static class CertificadoDestruccionV11
    {
        private const string Recurso = "REG-SGI-CDD-V11.xlsx";
        private const string SinDato = "SIN INFORMACIÓN";
        private static readonly CultureInfo Es = new("es-CL");

        private static readonly Dictionary<string, string> Estados = new()
        {
            ["BORRADOR"] = "BORRADOR",
            ["PENDIENTE_REVISION"] = "EN REVISIÓN",
            ["PENDIENTE_APROBACION"] = "EN APROBACIÓN",
            ["APROBADO"] = "APROBADO",
            ["RECHAZADO"] = "RECHAZADO",
            ["EMITIDO"] = "EMITIDO",
            ["ANULADO"] = "ANULADO",
        };

        // d = { certificado, detalle[], aprobaciones[] } tal como lo devuelve GET api/calidad-np/certificados/{id}.
        public static XLWorkbook Construir(JsonElement d, decimal? cantidadLiberada)
        {
            var c = d.GetProperty("certificado");
            using var recurso = Assembly.GetExecutingAssembly().GetManifestResourceStream(Recurso)
                ?? throw new InvalidOperationException("Falta la plantilla REG-SGI-CDD-V11 en el ejecutable.");
            // ClosedXML lee las imágenes de forma diferida: se carga desde una copia en memoria que sigue viva con el libro.
            var plantilla = new MemoryStream();
            recurso.CopyTo(plantilla);
            plantilla.Position = 0;
            var wb = new XLWorkbook(plantilla);
            var ws = wb.Worksheet(1);
            foreach (var sobrante in wb.Worksheets.Skip(1).ToList()) // la plantilla trae 2 hojas vacías
                sobrante.Delete();

            var estado = Str(c, "estado");
            var emitido = estado == "EMITIDO";
            var correlativo = Str(c, "correlativo");

            ws.Cell("Y5").Value = correlativo.Length > 0 ? correlativo : Estados.GetValueOrDefault(estado, estado);
            if (!emitido)
            {
                // Fila 4 es un separador delgado en el formato; se ensancha solo para avisar que el documento no tiene validez.
                ws.Row(4).Height = 16;
                var aviso = ws.Range("B4:AC4").Merge();
                aviso.FirstCell().Value = estado == "ANULADO"
                    ? "CERTIFICADO ANULADO — sin validez"
                    : $"DOCUMENTO NO EMITIDO — ESTADO: {Estados.GetValueOrDefault(estado, estado)} — sin validez hasta su emisión y aprobación";
                aviso.Style.Font.Bold = true;
                aviso.Style.Font.FontColor = XLColor.Red;
                aviso.Style.Font.FontSize = 9;
            }

            Fecha(ws, "J6", Date(c, "fechaFabricacionLote"));
            Marca(ws, "J7", false);
            Marca(ws, "T7", true); // módulo exclusivo de INNPACK
            Texto(ws, "J8", Str(c, "np"));
            Texto(ws, "J9", Str(c, "cliente"));
            var formato = Str(c, "formato");
            Marca(ws, "J10", formato == "PLIEGO");
            Marca(ws, "Q10", formato == "PRODUCTO");
            Marca(ws, "W10", formato == "OTROS");
            Texto(ws, "J11", Str(c, "codigoProducto"));
            Texto(ws, "J12", Str(c, "producto"));
            Numero(ws, "J13", Dec(c, "cantidadSolicitada"));
            Numero(ws, "W13", cantidadLiberada);
            Numero(ws, "J14", Dec(c, "cantidadDestruir"));

            var motivo = Str(c, "motivo");
            Marca(ws, "B17", motivo == "RECHAZO_INTERNO");
            Marca(ws, "B18", motivo == "RECHAZO_EXTERNO");
            Marca(ws, "B19", motivo == "EXCEDENTES");
            var categoria = Str(c, "categoria");
            Marca(ws, "P17", categoria == "CALIDAD");
            Marca(ws, "P18", categoria == "INOCUIDAD");
            Marca(ws, "P19", categoria == "LEGALIDAD");

            Bloque(ws, "B22", 22, 24, Str(c, "descripcionDefecto"));
            Bloque(ws, "B26", 26, 28, Str(c, "causaRaiz"));
            ws.Cell("B30").Value = "Operador: " + Valor(Str(c, "operador"));
            ws.Cell("B31").Value = "Área: " + Valor(Str(c, "area"));
            ws.Cell("B32").Value = "Jefe o Supervisor: " + Valor(Str(c, "jefeSupervisor"));

            ws.Cell("P30").Value = "Nombre: " + Valor(Str(c, "solicitanteNombre"));
            var fechaSol = Date(c, "fechaSolicitud");
            ws.Cell("P31").Value = "Cargo: " + Valor(Str(c, "solicitanteCargo")) + (fechaSol is null ? "" : "   Fecha solicitud: " + fechaSol.Value.ToString("dd-MM-yyyy", Es));
            ws.Cell("P32").Value = "Área: " + Valor(Str(c, "solicitanteArea"));

            var aprobaciones = Arr(d, "aprobaciones").OrderBy(a => Int(a, "orden")).ToList();
            Bloque(ws, "B34", 34, 36, Observaciones(c, d, aprobaciones, emitido));

            if (emitido && Date(c, "fechaEmision") is { } emision)
                Fecha(ws, "I39", emision);
            else
                ws.Cell("I39").Value = "PENDIENTE DE EMISIÓN";
            ws.Cell("W39").Value = Valor(Str(c, emitido ? "emitidoPor" : "creadoPor"));

            // Tabla de autorización: un renglón por cargo del flujo real. Solo "APROBADO" se muestra como aprobado.
            string[] cargosFormato = { "Jefe/a de Calidad", "Ejecutivo Comercial", "Gerente Comercial" };
            for (var i = 0; i < 3; i++)
            {
                var fila = 42 + i;
                if (i < aprobaciones.Count)
                {
                    var a = aprobaciones[i];
                    var ap = Str(a, "estado");
                    ws.Cell(fila, 2).Value = Str(a, "cargo");
                    ws.Cell(fila, 11).Value = ap == "APROBADO" ? Valor(Str(a, "usuario")) : "PENDIENTE";
                    ws.Cell(fila, 21).Value = ap switch
                    {
                        "APROBADO" => "Aprobado " + FechaHora(Date(a, "fecha")),
                        "RECHAZADO" => "Rechazado " + FechaHora(Date(a, "fecha")),
                        _ => "PENDIENTE DE APROBACIÓN",
                    };
                }
                else if (aprobaciones.Count == 0)
                {
                    ws.Cell(fila, 2).Value = cargosFormato[i];
                    ws.Cell(fila, 11).Value = "PENDIENTE";
                    ws.Cell(fila, 21).Value = "PENDIENTE DE APROBACIÓN";
                }
                else
                {
                    ws.Cell(fila, 2).Value = "";
                    ws.Cell(fila, 11).Value = "";
                    ws.Cell(fila, 21).Value = "";
                }
            }
            // El formato ocupa A1:AC44; sin área de impresión explícita, las columnas combinadas del borde derecho se pierden.
            ws.PageSetup.PrintAreas.Clear();
            ws.PageSetup.PrintAreas.Add(1, 1, 44, 29);
            return wb;
        }

        public static byte[] ABytes(XLWorkbook wb)
        {
            using var ms = new MemoryStream();
            wb.SaveAs(ms);
            return ms.ToArray();
        }

        // Observaciones del certificado + lo que el formato no tiene casillero propio: detalle por lote/pallet,
        // estado de la ejecución física y aprobaciones que no caben en los 3 renglones de firma.
        private static string Observaciones(JsonElement c, JsonElement d, List<JsonElement> aprobaciones, bool emitido)
        {
            var lineas = new List<string>();
            if (Str(c, "observaciones").Length > 0) lineas.Add(Str(c, "observaciones"));
            var detalle = Arr(d, "detalle").Select(x =>
                $"Lote {Valor(Str(x, "lote"))} / Pallet {Valor(Str(x, "pallet"))}: {Num(x, "cantidad")} {Str(x, "unidad").ToLowerInvariant()}" +
                (Str(x, "defecto").Length > 0 ? $" ({Str(x, "defecto")})" : "")).ToList();
            if (detalle.Count > 0) lineas.Add("Detalle: " + string.Join("; ", detalle) + ".");
            if (aprobaciones.Count > 3)
                lineas.Add("Aprobaciones adicionales: " + string.Join("; ", aprobaciones.Skip(3).Select(a => $"{Str(a, "cargo")} {Str(a, "estado")}")) + ".");
            if (emitido)
                lineas.Add(Bool(c, "ejecutada")
                    ? "Destrucción física confirmada el " + (Date(c, "fechaEjecucion")?.ToString("dd-MM-yyyy", Es) ?? "(fecha no registrada)") + "."
                    : "Destrucción física: aún NO confirmada (certificado emitido no significa material destruido).");
            if (Str(c, "estado") == "ANULADO" && Str(c, "motivoAnulacion").Length > 0)
                lineas.Add("ANULADO: " + Str(c, "motivoAnulacion"));
            return lineas.Count > 0 ? string.Join("\n", lineas) : SinDato;
        }

        // Texto en una celda combinada de varias filas: si no cabe, se agranda la última fila del bloque.
        private static void Bloque(IXLWorksheet ws, string celda, int fila1, int fila2, string texto)
        {
            var cel = ws.Cell(celda);
            cel.Value = Valor(texto);
            cel.Style.Alignment.WrapText = true;
            cel.Style.Alignment.Vertical = XLAlignmentVerticalValues.Top;
            var lineas = Valor(texto).Split('\n').Sum(l => Math.Max(1, (int)Math.Ceiling(l.Length / 150.0)));
            var disponibles = fila2 - fila1 + 1;
            if (lineas > disponibles)
                ws.Row(fila2).Height += (lineas - disponibles) * 15;
        }

        private static void Marca(IXLWorksheet ws, string celda, bool activa) => ws.Cell(celda).Value = activa ? "X" : "";
        private static void Texto(IXLWorksheet ws, string celda, string v) => ws.Cell(celda).Value = Valor(v);
        // Cantidades y fechas como texto ya formateado (es-CL): es un documento para leer/imprimir y así Excel y PDF coinciden.
        private static void Numero(IXLWorksheet ws, string celda, decimal? v) =>
            ws.Cell(celda).Value = v is null ? SinDato : v.Value.ToString("#,##0.##", Es);
        private static void Fecha(IXLWorksheet ws, string celda, DateTime? v) =>
            ws.Cell(celda).Value = v is null ? SinDato : v.Value.ToString("dd-MM-yyyy", Es);

        private static string Valor(string s) => string.IsNullOrWhiteSpace(s) ? SinDato : s.Trim();
        private static string FechaHora(DateTime? d) => d is null ? "" : d.Value.ToString("dd-MM-yyyy HH:mm", Es);

        private static IEnumerable<JsonElement> Arr(JsonElement o, string p) =>
            o.ValueKind == JsonValueKind.Object && o.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.Array ? v.EnumerateArray() : Enumerable.Empty<JsonElement>();

        private static string Str(JsonElement o, string p) =>
            o.ValueKind == JsonValueKind.Object && o.TryGetProperty(p, out var v)
                ? v.ValueKind switch { JsonValueKind.String => v.GetString() ?? "", JsonValueKind.Number => v.ToString(), _ => "" }
                : "";

        private static decimal? Dec(JsonElement o, string p) =>
            o.ValueKind == JsonValueKind.Object && o.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : null;

        private static string Num(JsonElement o, string p) => Dec(o, p)?.ToString("#,##0.##", Es) ?? SinDato;
        private static int Int(JsonElement o, string p) => (int)(Dec(o, p) ?? 0);
        private static bool Bool(JsonElement o, string p) => o.ValueKind == JsonValueKind.Object && o.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.True;

        private static DateTime? Date(JsonElement o, string p) =>
            DateTime.TryParse(Str(o, p), CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;
    }
}
