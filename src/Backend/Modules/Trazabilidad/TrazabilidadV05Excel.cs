using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using ClosedXML.Excel;

namespace QualityControlCenter.Modules.Trazabilidad
{
    // Excel del formato oficial REG-SGI-TDP-V05 (Trazabilidad de productos). Recibe el MISMO modelo que usa el
    // PDF (armado en trazabilidad.controller.js con los datos ya consultados) y solo lo dibuja: no consulta ni
    // calcula nada. Hoja carta horizontal sobre una grilla de 24 columnas; cada tabla reparte sus columnas con
    // celdas combinadas según su peso relativo.
    public static class TrazabilidadV05Excel
    {
        private const int Grilla = 24;
        private static readonly XLColor GrisTitulo = XLColor.FromHtml("#D9D9D9");
        private static readonly XLColor GrisEncabezado = XLColor.FromHtml("#F2F2F2");

        public static byte[] Construir(JsonElement m)
        {
            using var wb = new XLWorkbook();
            var ws = wb.AddWorksheet("REG-SGI-TDP-V05");
            for (var c = 1; c <= Grilla; c++)
                ws.Column(c).Width = 6.2;

            var fila = Encabezado(ws, m);
            fila = Cabecera(ws, m, fila);
            foreach (var b in Arr(m, "bloques"))
                fila = Bloque(ws, b, fila);

            var pie = $"Fecha de emisión documento: {Str(m, "emision")}   ·   Hora de inicio: ________   ·   Hora de término: ________   ·   Realizado por: {Str(m, "realizadoPor")}   ·   Cargo: ________________";
            ws.PageSetup.Footer.Center.AddText(pie.Replace("&", "&&"));
            ws.PageSetup.PageOrientation = XLPageOrientation.Landscape;
            ws.PageSetup.PaperSize = XLPaperSize.LetterPaper;
            ws.PageSetup.FitToPages(1, 0);
            ws.PageSetup.CenterHorizontally = true;
            ws.PageSetup.Margins.Left = ws.PageSetup.Margins.Right = 0.4;
            ws.PageSetup.Margins.Top = 0.5;
            ws.PageSetup.Margins.Bottom = 0.6;
            ws.PageSetup.SetRowsToRepeatAtTop(1, 4);
            ws.PageSetup.PrintAreas.Add(1, 1, fila, Grilla);

            using var ms = new MemoryStream();
            wb.SaveAs(ms);
            return ms.ToArray();
        }

        // Filas 1-3: logo + título + código/versión (igual que el encabezado del Word). Fila 4: datos de emisión.
        private static int Encabezado(IXLWorksheet ws, JsonElement m)
        {
            for (var r = 1; r <= 3; r++)
                ws.Row(r).Height = 21;
            Caja(ws, 1, 1, 3, 4);
            Caja(ws, 1, 5, 3, 18, Str(m, "titulo"), negrita: true, tam: 16, centrar: true);
            Caja(ws, 1, 19, 2, 24, Str(m, "codigo"), negrita: true, centrar: true);
            Caja(ws, 3, 19, 3, 24, Str(m, "fechaVersion"), centrar: true);

            var logo = Str(m, "logo");
            var coma = logo.IndexOf("base64,", StringComparison.Ordinal);
            if (coma >= 0)
            {
                using var img = new MemoryStream(Convert.FromBase64String(logo[(coma + 7)..]));
                ws.AddPicture(img).MoveTo(ws.Cell(1, 1), 12, 3).WithSize(78, 60);
            }

            Caja(ws, 4, 1, 4, 7, "Fecha de emisión: " + Str(m, "emision"));
            Caja(ws, 4, 8, 4, 12, "Hora de inicio: ________");
            Caja(ws, 4, 13, 4, 17, "Hora de término: ________");
            Caja(ws, 4, 18, 4, 24, "Realizado por: " + Str(m, "realizadoPor") + " · Cargo: ________________");
            ws.Row(4).Height = 30;
            ws.Range(4, 1, 4, Grilla).Style.Alignment.WrapText = true;
            return 6;
        }

        // CLIENTE / NV / TIPO PRODUCTO / FECHA FABRICACIÓN: etiqueta gris + valor.
        private static int Cabecera(IXLWorksheet ws, JsonElement m, int fila)
        {
            foreach (var par in Arr(m, "cabecera"))
            {
                var celdas = par.EnumerateArray().ToList();
                Caja(ws, fila, 1, fila, 6, celdas[0].GetString() ?? "", negrita: true, relleno: GrisEncabezado);
                Caja(ws, fila, 7, fila, Grilla, celdas[1].GetString() ?? "");
                fila++;
            }
            return fila + 1;
        }

        private static int Bloque(IXLWorksheet ws, JsonElement b, int fila)
        {
            var titulo = Str(b, "titulo");
            var cols = Arr(b, "columnas").Select(c => c.GetString() ?? "").ToList();
            var filas = Arr(b, "filas").Select(f => f.EnumerateArray().Select(c => c.GetString() ?? "").ToList()).ToList();

            Caja(ws, fila, 1, fila, Grilla, titulo, negrita: true, relleno: GrisTitulo, centrar: true);
            fila++;

            if (cols.Count > 0)
            {
                var pesos = Arr(b, "pesos").Select(p => p.GetDouble()).ToArray();
                if (pesos.Length != cols.Count)
                    pesos = cols.Select(_ => 1.0).ToArray();
                var spans = Spans(pesos);

                var c1 = 1;
                for (var i = 0; i < cols.Count; i++)
                {
                    Caja(ws, fila, c1, fila, c1 + spans[i] - 1, cols[i], negrita: true, relleno: GrisEncabezado, centrar: true);
                    c1 += spans[i];
                }
                ws.Row(fila).Height = Alto(cols, spans);
                fila++;

                if (filas.Count == 0)
                {
                    Caja(ws, fila, 1, fila, Grilla, Str(b, "vacio"), centrar: true);
                    fila++;
                }
                foreach (var f in filas)
                {
                    c1 = 1;
                    for (var i = 0; i < cols.Count; i++)
                    {
                        Caja(ws, fila, c1, fila, c1 + spans[i] - 1, i < f.Count ? f[i] : "");
                        c1 += spans[i];
                    }
                    ws.Row(fila).Height = Alto(f, spans);
                    fila++;
                }
            }
            else if (Str(b, "texto").Length > 0)
            {
                // Bloque de texto (guía técnica, advertencias): una sola celda ancha.
                var texto = Str(b, "texto");
                Caja(ws, fila, 1, fila, Grilla, texto);
                ws.Row(fila).Height = Math.Max(18, 15.5 * Lineas(texto, Grilla));
                fila++;
            }

            var nota = Str(b, "nota");
            if (nota.Length > 0)
            {
                Caja(ws, fila, 1, fila, Grilla, nota, cursiva: true);
                ws.Row(fila).Height = Math.Max(18, 15.5 * Lineas(nota, Grilla));
                fila++;
            }
            return fila + 1;
        }

        // Reparte las 24 columnas entre las de la tabla según su peso (método del mayor resto, mínimo 1).
        private static int[] Spans(double[] pesos)
        {
            var total = pesos.Sum();
            var exacto = pesos.Select(p => p / total * Grilla).ToArray();
            var spans = exacto.Select(e => Math.Max(1, (int)Math.Floor(e))).ToArray();
            var orden = Enumerable.Range(0, spans.Length).OrderByDescending(i => exacto[i] - Math.Floor(exacto[i])).ToList();
            for (var k = 0; spans.Sum() < Grilla; k++)
                spans[orden[k % orden.Count]]++;
            return spans;
        }

        private static double Alto(IList<string> textos, int[] spans)
        {
            var lineas = 1;
            for (var i = 0; i < textos.Count && i < spans.Length; i++)
                lineas = Math.Max(lineas, Lineas(textos[i], spans[i]));
            return Math.Max(18, 15.5 * lineas);
        }

        // Aproximación del alto necesario: ~6 caracteres por columna de la grilla.
        private static int Lineas(string texto, int columnas)
        {
            var porLinea = Math.Max(3, columnas * 6);
            return (texto ?? "").Split('\n').Sum(l => Math.Max(1, (int)Math.Ceiling(l.Length / (double)porLinea)));
        }

        private static void Caja(IXLWorksheet ws, int f1, int c1, int f2, int c2, string? texto = null,
            bool negrita = false, bool cursiva = false, int tam = 10, bool centrar = false, XLColor? relleno = null)
        {
            var r = ws.Range(f1, c1, f2, c2);
            if (c2 > c1 || f2 > f1)
                r.Merge();
            r.Style.Font.FontSize = tam;
            r.Style.Font.Bold = negrita;
            r.Style.Font.Italic = cursiva;
            r.Style.Alignment.WrapText = true;
            r.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            r.Style.Alignment.Horizontal = centrar ? XLAlignmentHorizontalValues.Center : XLAlignmentHorizontalValues.Left;
            r.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            if (relleno != null)
                r.Style.Fill.BackgroundColor = relleno;
            if (texto != null)
                r.FirstCell().Value = texto;
        }

        private static IEnumerable<JsonElement> Arr(JsonElement o, string p) =>
            o.ValueKind == JsonValueKind.Object && o.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.Array
                ? v.EnumerateArray()
                : Enumerable.Empty<JsonElement>();

        private static string Str(JsonElement o, string p) =>
            o.ValueKind == JsonValueKind.Object && o.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.String
                ? v.GetString() ?? ""
                : "";
    }
}
