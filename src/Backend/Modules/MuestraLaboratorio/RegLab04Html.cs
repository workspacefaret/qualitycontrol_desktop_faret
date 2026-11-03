using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using ClosedXML.Excel;
using ClosedXML.Excel.Drawings;

namespace QualityControlCenter.Modules.MuestraLaboratorio
{
    // Renderiza las hojas del libro REG-LAB-04 (el mismo que se exporta a Excel) como HTML imprimible,
    // respetando celdas combinadas, anchos, alturas, bordes, rellenos, tipografía, imagen del logo y la
    // orientación/área de impresión de cada hoja. No calcula nada: solo muestra lo que hay en las celdas.
    internal static class RegLab04Html
    {
        private static readonly CultureInfo Es = new("es-CL");
        private const double PxPorMm = 96.0 / 25.4;

        public static string Render(XLWorkbook wb, string titulo)
        {
            var sb = new StringBuilder();
            sb.Append("<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"utf-8\"><title>")
              .Append(WebUtility.HtmlEncode(titulo))
              .Append("</title><style>")
              .Append("@page vert{size:A4 portrait;margin:7mm}@page horiz{size:A4 landscape;margin:7mm}")
              .Append("*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}")
              .Append("body{font-family:Arial,Helvetica,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}")
              .Append(".hoja{break-after:page;page-break-after:always;overflow:visible}.hoja:last-child{break-after:auto;page-break-after:auto}")
              .Append(".hoja.vert{page:vert}.hoja.horiz{page:horiz}")
              .Append("table{border-collapse:collapse;table-layout:fixed}td{padding:0 2px;overflow:hidden;line-height:1.15}tr{break-inside:avoid;page-break-inside:avoid}thead{display:table-header-group}")
              .Append("td img{display:block}")
              .Append("</style></head><body>");

            foreach (var ws in wb.Worksheets.Where(w => w.Visibility == XLWorksheetVisibility.Visible))
                RenderHoja(sb, ws);

            sb.Append("</body></html>");
            return sb.ToString();
        }

        private static void RenderHoja(StringBuilder sb, IXLWorksheet ws)
        {
            var area = ws.PageSetup.PrintAreas.FirstOrDefault();
            var f1 = area?.RangeAddress.FirstAddress.RowNumber ?? 1;
            var c1 = area?.RangeAddress.FirstAddress.ColumnNumber ?? 1;
            var f2 = area?.RangeAddress.LastAddress.RowNumber ?? ws.LastRowUsed()?.RowNumber() ?? 1;
            var c2 = area?.RangeAddress.LastAddress.ColumnNumber ?? ws.LastColumnUsed()?.ColumnNumber() ?? 1;

            var apaisado = ws.PageSetup.PageOrientation == XLPageOrientation.Landscape;
            var anchoCol = new double[c2 - c1 + 1];
            for (var c = c1; c <= c2; c++) anchoCol[c - c1] = ws.Column(c).Width * 7 + 5; // px de Excel (Arial 11)
            var total = anchoCol.Sum();
            // Ancho útil de la página A4 en px CSS; la hoja se escala para caber (igual que "ajustar a 1 página de ancho").
            var util = ((apaisado ? 297 : 210) - 14) * PxPorMm;
            var zoom = Math.Min(1.6, util / total);

            // Combinadas: celda superior-izquierda -> (filas, columnas); las demás se omiten.
            var spans = new Dictionary<(int, int), (int rs, int cs)>();
            var cubiertas = new HashSet<(int, int)>();
            foreach (var mr in ws.MergedRanges)
            {
                var a = mr.RangeAddress;
                if (a.LastAddress.RowNumber < f1 || a.FirstAddress.RowNumber > f2) continue;
                var fr = a.FirstAddress.RowNumber; var fc = a.FirstAddress.ColumnNumber;
                spans[(fr, fc)] = (a.LastAddress.RowNumber - fr + 1, a.LastAddress.ColumnNumber - fc + 1);
                for (var r = fr; r <= a.LastAddress.RowNumber; r++)
                    for (var c = fc; c <= a.LastAddress.ColumnNumber; c++)
                        if (r != fr || c != fc) cubiertas.Add((r, c));
            }

            var imagenes = new Dictionary<(int, int), List<IXLPicture>>();
            foreach (var pic in ws.Pictures)
            {
                var k = (pic.TopLeftCell.Address.RowNumber, pic.TopLeftCell.Address.ColumnNumber);
                if (!imagenes.TryGetValue(k, out var l)) imagenes[k] = l = new List<IXLPicture>();
                l.Add(pic);
            }

            var rep = ws.PageSetup.FirstRowToRepeatAtTop;
            var repetir = rep >= f1 && rep <= f2 && ws.PageSetup.LastRowToRepeatAtTop == rep ? rep : 0;
            var colgroup = new StringBuilder("<colgroup>");
            foreach (var w in anchoCol) colgroup.Append("<col style=\"width:").Append(Px(w)).Append("px\">");
            colgroup.Append("</colgroup>");
            var abrirTabla = "<table style=\"width:" + Px(total) + "px\">" + colgroup;

            sb.Append("<section class=\"hoja ").Append(apaisado ? "horiz" : "vert").Append("\" data-hoja=\"")
              .Append(WebUtility.HtmlEncode(ws.Name)).Append("\"><div style=\"width:")
              .Append(Px(total)).Append("px;zoom:").Append(zoom.ToString("0.####", CultureInfo.InvariantCulture))
              .Append("\">");

            // Si la hoja repite un encabezado en cada página (mismo ajuste que el Excel), la parte posterior
            // va en una segunda tabla con <thead> (que el navegador repite al paginar); el resto, en la primera.
            sb.Append(abrirTabla).Append("<tbody>");
            for (var r = f1; r <= f2; r++)
            {
                if (r == repetir) sb.Append("</tbody></table>").Append(abrirTabla).Append("<thead>");
                var alto = ws.Row(r).Height;
                sb.Append("<tr style=\"height:").Append(alto.ToString("0.##", CultureInfo.InvariantCulture)).Append("pt\">");
                for (var c = c1; c <= c2; c++)
                {
                    if (cubiertas.Contains((r, c))) continue;
                    var cell = ws.Cell(r, c);
                    spans.TryGetValue((r, c), out var sp);
                    sb.Append("<td");
                    if (sp.rs > 1) sb.Append(" rowspan=\"").Append(sp.rs).Append('"');
                    if (sp.cs > 1) sb.Append(" colspan=\"").Append(sp.cs).Append('"');
                    sb.Append(" style=\"").Append(Estilo(cell, sp.rs > 1 || sp.cs > 1 ? Rango(ws, r, c, sp) : null)).Append("\">");
                    if (imagenes.TryGetValue((r, c), out var pics))
                        foreach (var p in pics) sb.Append(Imagen(p));
                    sb.Append(Texto(cell));
                    sb.Append("</td>");
                }
                sb.Append("</tr>");
                if (r == repetir) sb.Append("</thead><tbody>");
            }
            sb.Append("</tbody></table></div></section>");
        }

        private static IXLRange Rango(IXLWorksheet ws, int r, int c, (int rs, int cs) sp)
            => ws.Range(r, c, r + Math.Max(sp.rs, 1) - 1, c + Math.Max(sp.cs, 1) - 1);

        private static string Imagen(IXLPicture p)
        {
            using var ms = new MemoryStream();
            p.ImageStream.Position = 0;
            p.ImageStream.CopyTo(ms);
            return $"<img alt=\"\" style=\"width:{p.Width}px;height:{p.Height}px;margin:{p.Top}px 0 0 {p.Left}px\" src=\"data:image/png;base64,{Convert.ToBase64String(ms.ToArray())}\">";
        }

        private static string Texto(IXLCell cell)
        {
            var v = cell.Value;
            string t;
            if (v.IsBlank) return "";
            if (v.IsNumber) t = v.GetNumber().ToString("0.##########", Es);
            else if (v.IsBoolean) t = v.GetBoolean() ? "VERDADERO" : "FALSO";
            else t = v.ToString();
            return WebUtility.HtmlEncode(t).Replace("\r\n", "<br>").Replace("\n", "<br>");
        }

        private static string Estilo(IXLCell cell, IXLRange? combinada)
        {
            var st = cell.Style;
            var sb = new StringBuilder();
            sb.Append("font-size:").Append(st.Font.FontSize.ToString("0.##", CultureInfo.InvariantCulture)).Append("pt;");
            if (st.Font.Bold) sb.Append("font-weight:bold;");
            if (st.Font.Italic) sb.Append("font-style:italic;");
            if (st.Font.Strikethrough) sb.Append("text-decoration:line-through;");
            var fc = Color(st.Font.FontColor);
            if (fc != null) sb.Append("color:").Append(fc).Append(';');
            if (st.Fill.PatternType == XLFillPatternValues.Solid)
            {
                var bg = Color(st.Fill.BackgroundColor);
                if (bg != null) sb.Append("background:").Append(bg).Append(';');
            }
            sb.Append("text-align:").Append(st.Alignment.Horizontal switch
            {
                XLAlignmentHorizontalValues.Center => "center",
                XLAlignmentHorizontalValues.Right => "right",
                _ => cell.Value.IsNumber ? "right" : "left",
            }).Append(';');
            sb.Append("vertical-align:").Append(st.Alignment.Vertical switch
            {
                XLAlignmentVerticalValues.Top => "top",
                XLAlignmentVerticalValues.Bottom => "bottom",
                _ => "middle",
            }).Append(';');
            sb.Append(st.Alignment.WrapText ? "white-space:normal;word-break:break-word;" : "white-space:nowrap;");
            // Bordes: en celdas combinadas el contorno está repartido por el rango; se toma del lado exterior.
            var bl = combinada?.FirstCell().Style.Border.LeftBorder ?? st.Border.LeftBorder;
            var bt = combinada?.FirstCell().Style.Border.TopBorder ?? st.Border.TopBorder;
            var br = combinada?.LastCell().Style.Border.RightBorder ?? st.Border.RightBorder;
            var bb = combinada?.LastCell().Style.Border.BottomBorder ?? st.Border.BottomBorder;
            sb.Append(Borde("left", bl)).Append(Borde("top", bt)).Append(Borde("right", br)).Append(Borde("bottom", bb));
            return sb.ToString();
        }

        private static string Borde(string lado, XLBorderStyleValues e)
            => e == XLBorderStyleValues.None ? "" : $"border-{lado}:{(e is XLBorderStyleValues.Medium or XLBorderStyleValues.Thick ? "1.5px" : "1px")} solid #000;";

        private static string? Color(XLColor c)
        {
            if (c == null || c.ColorType != XLColorType.Color) return null;
            var x = c.Color;
            return x.A == 0 ? null : $"#{x.R:X2}{x.G:X2}{x.B:X2}";
        }

        private static string Px(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);
    }
}
