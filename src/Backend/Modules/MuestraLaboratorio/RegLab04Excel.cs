using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using ClosedXML.Excel;

namespace QualityControlCenter.Modules.MuestraLaboratorio
{
    // Exportación Excel del REG-LAB-04 (Registro físico de laboratorio, revisión julio 2026).
    // Las hojas "Sustratos" y "Complejo" reproducen el formato del registro en papel (secciones,
    // grupos LINER/ONDA/CARTULINA, celdas combinadas, casillas y configuración de impresión); los
    // valores salen del detalle de la muestra que entrega la API (nunca se recalculan aquí, salvo
    // el promedio simple de pesos que pide la columna "Resultado promedio (g)" del gramaje del
    // complejo). Todo lo que la plantilla no tiene (promedios por muestra, McKee, Filtración,
    // ensayos históricos, anulados, datos FPS, trazabilidad) va en la hoja "Resultados del sistema",
    // para no perder información. Si hay más muestras que filas en el papel, la sección crece.
    public static class RegLab04Excel
    {
        private static readonly CultureInfo Es = new("es-CL");
        private static readonly XLColor Oliva = XLColor.FromHtml("#4F6228");
        private static readonly XLColor VerdeClaro = XLColor.FromHtml("#D7E4BD");
        private static readonly XLColor VerdeEtiqueta = XLColor.FromHtml("#EBF1DE");
        private const string Si = "☒";
        private const string No = "☐";
        private const int FilasMinimas = 3;

        private static readonly string[] EtapasSustrato = { "ControlRecepcion", "Corrugado", "Monotapa" };
        private static readonly string[] Grupos = { "Liner", "Onda", "Cartulina" };

        public static byte[] Construir(JsonElement m, string? tipoOndaNombre, byte[]? logo)
        {
            var ensayos = Arr(m, "ensayos").ToList();
            var vigentes = ensayos.Where(e => Str(e, "estado") != "Anulado").ToList();
            var origen = Str(m, "origen");

            var sustrato = new List<JsonElement>();
            var complejo = new List<JsonElement>();
            foreach (var e in vigentes.Where(e => Bool(e, "modeloMuestras")))
            {
                var tipo = Str(e, "tipoEnsayo");
                var variante = Str(e, "variante");
                if (tipo is "COBB" or "RCT")
                    sustrato.Add(e);
                else if (tipo is "ECT" or "FCT" or "BCT_MEDIDO")
                    complejo.Add(e);
                else if (tipo == "HUMEDAD" && variante == "Horno")
                    complejo.Add(e);
                else if (tipo is "HUMEDAD" or "GRAMAJE" or "ESPESOR")
                {
                    var conMaterial = Muestras(e).Any(x => Grupo(Str(x, "sustrato")) >= 0);
                    var etapaSustrato = EtapasSustrato.Contains(origen);
                    if (conMaterial || (etapaSustrato && tipo == "HUMEDAD" && origen == "Monotapa"))
                        sustrato.Add(e);
                    else
                        complejo.Add(e);
                }
            }

            var hojas = new List<string>();
            if (sustrato.Count > 0) hojas.Add("Sustratos");
            if (complejo.Count > 0) hojas.Add("Complejo");
            if (hojas.Count == 0) hojas.Add(EtapasSustrato.Contains(origen) ? "Sustratos" : "Complejo");
            var total = hojas.Count + 1;

            using var wb = new XLWorkbook();
            var pagina = 1;
            foreach (var h in hojas)
            {
                if (h == "Sustratos") HojaSustratos(wb, m, sustrato, tipoOndaNombre, logo, pagina++, total);
                else HojaComplejo(wb, m, complejo, tipoOndaNombre, logo, pagina++, total);
            }
            HojaResultados(wb, m, ensayos, tipoOndaNombre, logo, pagina, total);

            using var ms = new MemoryStream();
            wb.SaveAs(ms);
            return ms.ToArray();
        }

        // =====================================================================
        // Hoja 1: SUSTRATOS (12 columnas, página 299 del registro físico)
        // =====================================================================
        private static void HojaSustratos(XLWorkbook wb, JsonElement m, List<JsonElement> ensayos, string? onda, byte[]? logo, int pagina, int total)
        {
            var h = new Hoja(wb.Worksheets.Add("Sustratos"), 12);
            for (var g = 0; g < 3; g++)
            {
                h.Ws.Column(g * 4 + 1).Width = 12;
                for (var c = 2; c <= 4; c++) h.Ws.Column(g * 4 + c).Width = 8.6;
            }
            Encabezado(h, logo, pagina, total);
            var (fecha, hora) = FechaHoraEnsayo(m);
            h.Seccion("IDENTIFICACIÓN MUESTRA");
            h.Fila(new[] { 2, 4, 2, 2, 1, 1 }, new object?[] { "Registro de producción", RegistroProduccion(m), "Fecha de ensayo", fecha, "Hora de inicio", hora }, etiquetas: new[] { 0, 2, 4 });
            h.Fila(new[] { 2, 2, 1, 1, 2, 4 }, new object?[] { "NP Faret – Innpack", Str(m, "np"), "Tipo de onda", onda ?? "", "Operador", Str(m, "operadorTexto") }, etiquetas: new[] { 0, 2, 4 });
            h.Fila(new[] { 2, 4, 2, 4 }, new object?[] { "Máquina", Str(m, "maquina"), "Analista", Analistas(m) }, etiquetas: new[] { 0, 2 });

            bool EsMonotapa(JsonElement e) => Str(m, "origen") == "Monotapa" && Str(e, "tipoEnsayo") == "HUMEDAD";
            var humedad = ensayos.Where(e => Str(e, "tipoEnsayo") == "HUMEDAD" && !EsMonotapa(e)).ToList();
            var gramaje = ensayos.Where(e => Str(e, "tipoEnsayo") == "GRAMAJE").ToList();
            var espesor = ensayos.Where(e => Str(e, "tipoEnsayo") == "ESPESOR").ToList();
            var cobb = ensayos.Where(e => Str(e, "tipoEnsayo") == "COBB").ToList();
            var rct = ensayos.Where(e => Str(e, "tipoEnsayo") == "RCT").ToList();
            var monotapa = ensayos.Where(EsMonotapa).ToList();

            // 1. Humedad de sustratos
            var variantes = humedad.Select(e => Str(e, "variante")).ToHashSet();
            var probetas = humedad.SelectMany(Muestras).Select(x => Param(x, "tamanoProbeta")).ToHashSet();
            h.Fila(new[] { 3, 1, 3, 1, 4 }, new object?[] {
                "1. HUMEDAD DE SUSTRATOS (%)", "Método",
                $"{Marca(variantes.Contains("Higrometro"))} Higrómetro   {Marca(variantes.Contains("Termobalanza"))} Termobalanza",
                "Probeta", Probetas(probetas) }, seccion: 0, etiquetas: new[] { 1, 3 });
            var todas = ensayos.SelectMany(Muestras).ToList();
            var origenesMuestra = todas.Select(x => Str(x, "origenMuestra")).ToHashSet();
            var origenMaterial = Str(m, "origenMaterial");
            var tipos = todas.Select(x => Str(x, "tipoAnalisis")).Append(Str(m, "tipoControl")).ToHashSet();
            h.Fila(new[] { 2, 4, 2, 4 }, new object?[] {
                "Origen de la muestra",
                $"{Marca(origenesMuestra.Contains("Bobinas") || origenMaterial == "Bobina")} Bobinas   {Marca(origenesMuestra.Any(o => o.StartsWith("Separaci")) || origenMaterial == "SeparacionPapeles")} Separación de papeles o descape",
                "Tipo de muestra",
                $"{Marca(tipos.Contains("Inicial"))} Inicial   {Marca(tipos.Contains("Contramuestra"))} Contramuestra   {Marca(tipos.Contains("Reensayo"))} Reensayo" },
                etiquetas: new[] { 0, 2 });
            TablaPorMaterial(h, humedad, new[] { "Lote de bobina de origen", "Punto izquierdo (%)", "Centro (%)", "Punto derecho (%)" }, "humedad", 3);

            // 2. Gramaje de sustratos
            h.Fila(new[] { 3, 2, 3, 2, 2 }, new object?[] {
                "2. GRAMAJE DE SUSTRATOS (g/m²)", "Gramaje nominal",
                "Liner:", "Onda:", "Cartulina:" }, seccion: 0, etiquetas: new[] { 1 });
            TablaPorMaterial(h, gramaje, new[] { "Lote de bobina de origen", "Peso (g) Punto izq.", "Peso (g) Centro", "Peso (g) Punto der." }, "peso", 3);

            // 3. Espesor de sustratos
            h.Seccion("3. ESPESOR DE SUSTRATOS (mm)");
            TablaPorMaterial(h, espesor, new[] { "Lote de bobina de origen", "Punto izquierdo", "Centro", "Punto derecho" }, "espesor", 3);

            // 4. Cobb: una fila por probeta (Lote, Cara, Pi, Pf, Seg., Resultado).
            h.Seccion("4. COBB (g/m²) – Área efectiva: 100 cm²");
            TablaProbetas(h, cobb, 2, new[] { 1, 1, 1, 1, 1, 1 },
                new[] { "Lote de bobina de origen", "Cara", "Peso inicial (g)", "Peso final (g)", "Seg.", "Resultado (g/m²)" },
                (x, d) => new object?[] { Bobina(x), Param(x, "cara"), Val(d, "pesoInicial"), Val(d, "pesoFinal"), Param(x, "tiempo"), Res(d, "cobb") });

            // 5. RCT: una fila por probeta.
            h.Seccion("5. RCT (lbf)");
            TablaProbetas(h, rct, 2, new[] { 2, 2, 2 },
                new[] { "Lote de bobina de origen", "Fuerza (lbf)", "Resistencia (lbf/m)" },
                (x, d) => new object?[] { Bobina(x), Val(d, "fuerza"), Val(d, "resistencia") });

            // 6. Humedad monotapa
            h.Seccion("6. HUMEDAD MONOTAPA (%)");
            var spansMono = new[] { 1, 2, 2, 2, 2, 2, 1 };
            h.Fila(spansMono, new object?[] { "Hora", "Punto izquierdo (%)", "Centro (%)", "Punto derecho (%)", "Peso onda (g)", "Peso onda 10 x 10 (g)", "Medida onda extendida (cm)" }, cabecera: true);
            var filasMono = monotapa.SelectMany(e => Muestras(e).Select(x => (e, x))).ToList();
            for (var i = 0; i < Math.Max(FilasMinimas, filasMono.Count); i++)
            {
                if (i >= filasMono.Count) { h.Fila(spansMono, new object?[7]); continue; }
                var (e, x) = filasMono[i];
                var dets = Dets(x);
                h.Fila(spansMono, new object?[] {
                    HoraDe(Str(e, "fecha")), Val(Det(dets, 1), "humedad"), Val(Det(dets, 2), "humedad"), Val(Det(dets, 3), "humedad"),
                    i == 0 ? Num(m, "pesoOndaExtendida") : null, i == 0 ? Num(m, "pesoRecorte10x10") : null, i == 0 ? Num(m, "longitudOndaExtendida") : null },
                    invalidas: dets.Take(3).Select((d, k) => (k + 1, Bool(d, "valida"))).Where(t => !t.Item2).Select(t => t.Item1).ToArray());
            }

            var obs = Observaciones(m, ensayos);
            if (obs.Length > 0)
            {
                h.Espacio();
                h.Observaciones(obs);
            }
            h.Imprimir();
        }

        // Tablas de humedad / gramaje / espesor de sustratos: 3 grupos (Liner/Onda/Cartulina) de
        // 4 columnas, una fila por muestra dentro de su material; crece si hay más de 3 muestras.
        private static void TablaPorMaterial(Hoja h, List<JsonElement> ensayos, string[] cabeceras, string codigo, int puntos)
        {
            h.Fila(new[] { 4, 4, 4 }, new object?[] { "LINER", "ONDA", "CARTULINA" }, subcabecera: true);
            h.Fila(Enumerable.Repeat(1, 12).ToArray(), Enumerable.Range(0, 3).SelectMany(_ => cabeceras).Cast<object?>().ToArray(), cabecera: true);
            var porGrupo = Grupos.Select(g => ensayos.SelectMany(Muestras).Where(x => Grupo(Str(x, "sustrato")) == Array.IndexOf(Grupos, g)).ToList()).ToList();
            var filas = Math.Max(FilasMinimas, porGrupo.Max(l => l.Count));
            for (var i = 0; i < filas; i++)
            {
                var valores = new object?[12];
                var invalidas = new List<int>();
                for (var g = 0; g < 3; g++)
                {
                    if (i >= porGrupo[g].Count) continue;
                    var x = porGrupo[g][i];
                    var dets = Dets(x);
                    valores[g * 4] = Bobina(x);
                    for (var p = 1; p <= puntos; p++)
                    {
                        var d = Det(dets, p);
                        valores[g * 4 + p] = Val(d, codigo);
                        if (d.HasValue && !Bool(d.Value, "valida")) invalidas.Add(g * 4 + p);
                    }
                }
                h.Fila(Enumerable.Repeat(1, 12).ToArray(), valores, invalidas: invalidas.ToArray());
            }
        }

        // Cobb y RCT: LINER y ONDA lado a lado, una fila por probeta (determinación).
        private static void TablaProbetas(Hoja h, List<JsonElement> ensayos, int grupos, int[] spans, string[] cabeceras, Func<JsonElement, JsonElement, object?[]> fila)
        {
            var ancho = spans.Sum();
            h.Fila(new[] { ancho, ancho }, new object?[] { "LINER", "ONDA" }, subcabecera: true);
            var spansFila = spans.Concat(spans).ToArray();
            h.Fila(spansFila, cabeceras.Concat(cabeceras).Cast<object?>().ToArray(), cabecera: true);
            var porGrupo = new[] { "Liner", "Onda" }.Select(g => ensayos.SelectMany(Muestras)
                .Where(x => string.Equals(Str(x, "sustrato"), g, StringComparison.OrdinalIgnoreCase))
                .SelectMany(x => Dets(x).Select(d => (x, d))).ToList()).ToList();
            var filas = Math.Max(FilasMinimas, porGrupo.Max(l => l.Count));
            for (var i = 0; i < filas; i++)
            {
                var valores = new object?[spans.Length * 2];
                var invalidas = new List<int>();
                for (var g = 0; g < grupos; g++)
                {
                    if (i >= porGrupo[g].Count) continue;
                    var (x, d) = porGrupo[g][i];
                    var v = fila(x, d);
                    for (var k = 0; k < v.Length; k++) valores[g * spans.Length + k] = v[k];
                    if (!Bool(d, "valida")) for (var k = 1; k < v.Length; k++) invalidas.Add(g * spans.Length + k);
                }
                h.Fila(spansFila, valores, invalidas: invalidas.ToArray());
            }
        }

        // =====================================================================
        // Hoja 2: COMPLEJO (14 columnas, página 300 del registro físico)
        // =====================================================================
        private static void HojaComplejo(XLWorkbook wb, JsonElement m, List<JsonElement> ensayos, string? onda, byte[]? logo, int pagina, int total)
        {
            var h = new Hoja(wb.Worksheets.Add("Complejo"), 14);
            for (var c = 1; c <= 14; c++) h.Ws.Column(c).Width = 7.4;
            Encabezado(h, logo, pagina, total);
            var (fecha, hora) = FechaHoraEnsayo(m);
            h.Seccion("IDENTIFICACIÓN MUESTRA");
            h.Fila(new[] { 3, 5, 2, 2, 1, 1 }, new object?[] { "Registro de producción", RegistroProduccion(m), "Fecha de ensayo", fecha, "Hora de inicio", hora }, etiquetas: new[] { 0, 2, 4 });
            h.Fila(new[] { 3, 3, 1, 1, 2, 4 }, new object?[] { "NP Faret – Innpack", Str(m, "np"), "Tipo de onda", onda ?? "", "Operador", Str(m, "operadorTexto") }, etiquetas: new[] { 0, 2, 4 });
            h.Fila(new[] { 3, 5, 2, 4 }, new object?[] { "Máquina", Str(m, "maquina"), "Analista", Analistas(m) }, etiquetas: new[] { 0, 2 });
            var origen = Str(m, "origen");
            h.Fila(new[] { 14 }, new object?[] {
                $"Tipo de muestra:  {Marca(origen == "Emplacado")} Emplacado   {Marca(origen == "Troquelado")} Troquelado   {Marca(origen == "Pegado")} Pegado   {Marca(origen == "ProductoTerminado")} Producto terminado" },
                alineacionIzq: true);

            var humedad = ensayos.Where(e => Str(e, "tipoEnsayo") == "HUMEDAD").ToList();
            var gramaje = ensayos.Where(e => Str(e, "tipoEnsayo") == "GRAMAJE").ToList();
            var espesor = ensayos.Where(e => Str(e, "tipoEnsayo") == "ESPESOR").ToList();
            var probetas = humedad.SelectMany(Muestras).Select(x => Param(x, "tamanoProbeta")).ToHashSet();

            // 1. Humedad del complejo
            var variantes = humedad.Select(e => Str(e, "variante")).ToHashSet();
            h.Fila(new[] { 4, 2, 3, 2, 3 }, new object?[] {
                "1. HUMEDAD DEL COMPLEJO (%)", "Método",
                $"{Marca(variantes.Contains("Horno"))} Horno   {Marca(variantes.Contains("Termobalanza") || variantes.Contains("Higrometro"))} Termobalanza",
                "Probeta", Probetas(probetas) }, seccion: 0, etiquetas: new[] { 1, 3 });
            var sp1 = new[] { 2, 2, 2, 2, 2, 2, 2 };
            h.Fila(sp1, new object?[] { "Número de muestra", "Punto izquierdo (%)", "Centro (%)", "Punto derecho (%)", "Peso inicial (g)", "Peso final (g)", "Resultado (%)" }, cabecera: true);
            var filasHum = new List<(object?[] v, int[] inv)>();
            foreach (var e in humedad)
            {
                var horno = Str(e, "variante") == "Horno";
                foreach (var x in Muestras(e))
                {
                    var dets = Dets(x);
                    if (!horno)
                    {
                        filasHum.Add((new object?[] { NumMuestra(x), Val(Det(dets, 1), "humedad"), Val(Det(dets, 2), "humedad"), Val(Det(dets, 3), "humedad"), null, null, Num(x, "promedio") },
                            dets.Take(3).Select((d, k) => (k + 1, Bool(d, "valida"))).Where(t => !t.Item2).Select(t => t.Item1).ToArray()));
                        continue;
                    }
                    foreach (var d in dets)
                        filasHum.Add((new object?[] { $"{NumMuestra(x)} · D{Int(d, "numero")}", null, null, null, Val(d, "pesoInicial"), Val(d, "pesoFinal"), Res(d, "humedad") },
                            Bool(d, "valida") ? Array.Empty<int>() : new[] { 4, 5, 6 }));
                }
            }
            for (var i = 0; i < Math.Max(FilasMinimas, filasHum.Count); i++)
                if (i < filasHum.Count) h.Fila(sp1, filasHum[i].v, invalidas: filasHum[i].inv); else h.Fila(sp1, new object?[7]);
            h.Fila(new[] { 14 }, new object?[] { "Cálculo por horno: % humedad = ((peso inicial - peso final) / peso inicial) × 100. Si se usan dos métodos, registrar ambos resultados." }, nota: true);

            // 2. Gramaje del complejo
            h.Fila(new[] { 4, 2, 8 }, new object?[] { "2. GRAMAJE DEL COMPLEJO (g/m²)", "Probeta", Probetas(gramaje.SelectMany(Muestras).Select(x => Param(x, "tamanoProbeta")).ToHashSet()) }, seccion: 0, etiquetas: new[] { 1 });
            var sp2 = new[] { 2, 3, 3, 2, 2, 2 };
            h.Fila(sp2, new object?[] { "Número de muestra", "Peso probeta (g) Punto izquierdo", "Peso probeta (g) Centro", "Peso probeta (g) Punto derecho", "Resultado promedio (g)", "Resultado promedio (g/m²)" }, cabecera: true);
            var filasGra = gramaje.SelectMany(Muestras).ToList();
            for (var i = 0; i < Math.Max(FilasMinimas, filasGra.Count); i++)
            {
                if (i >= filasGra.Count) { h.Fila(sp2, new object?[6]); continue; }
                var x = filasGra[i];
                var dets = Dets(x);
                var pesos = dets.Where(d => Bool(d, "valida")).Select(d => Val(d, "peso")).OfType<double>().ToList();
                h.Fila(sp2, new object?[] { NumMuestra(x), Val(Det(dets, 1), "peso"), Val(Det(dets, 2), "peso"), Val(Det(dets, 3), "peso"),
                    Bool(x, "completa") && pesos.Count > 0 ? Math.Round(pesos.Average(), 4) : null, Num(x, "promedio") },
                    invalidas: dets.Take(3).Select((d, k) => (k + 1, Bool(d, "valida"))).Where(t => !t.Item2).Select(t => t.Item1).ToArray());
            }

            // 3. Espesor del complejo
            h.Seccion("3. ESPESOR DEL COMPLEJO (mm)");
            var sp3 = new[] { 3, 3, 3, 3, 2 };
            h.Fila(sp3, new object?[] { "Número de muestra", "Punto izquierdo (mm)", "Centro (mm)", "Punto derecho (mm)", "Resultado promedio (mm)" }, cabecera: true);
            var filasEsp = espesor.SelectMany(Muestras).ToList();
            for (var i = 0; i < Math.Max(FilasMinimas, filasEsp.Count); i++)
            {
                if (i >= filasEsp.Count) { h.Fila(sp3, new object?[5]); continue; }
                var x = filasEsp[i];
                var dets = Dets(x);
                h.Fila(sp3, new object?[] { NumMuestra(x), Val(Det(dets, 1), "espesor"), Val(Det(dets, 2), "espesor"), Val(Det(dets, 3), "espesor"), Num(x, "promedio") },
                    invalidas: dets.Take(3).Select((d, k) => (k + 1, Bool(d, "valida"))).Where(t => !t.Item2).Select(t => t.Item1).ToArray());
            }

            // 4-6. ECT / FCT / BCT: columnas M1..Mn por muestra (determinaciones) + Promedio.
            h.Seccion("4. ECT (lbf)");
            TablaColumnas(h, ensayos.Where(e => Str(e, "tipoEnsayo") == "ECT").ToList(), new[] { 2, 2, 2, 2, 2, 2, 2 },
                new (string, string, string?)[] { ("Fuerza (lbf)", "fuerza", "promedio:fuerza"), ("Resistencia (lbf/m)", "resistencia", null) });
            h.Seccion("5. FCT (lbf)");
            TablaColumnas(h, ensayos.Where(e => Str(e, "tipoEnsayo") == "FCT").ToList(), new[] { 2, 3, 3, 3, 3 },
                new (string, string, string?)[] { ("Fuerza (lbf)", "fuerza", null), ("Resistencia (psi)", "resistencia", "promedio:resistencia") });
            h.Seccion("6. BCT (lbf)");
            TablaColumnas(h, ensayos.Where(e => Str(e, "tipoEnsayo") == "BCT_MEDIDO").ToList(), new[] { 2, 2, 2, 2, 2, 2, 2 },
                new (string, string, string?)[] { ("Fuerza (lbf)", "resultado", null) });

            // 7. Estado + observaciones
            var estado = Str(m, "estado");
            h.Fila(new[] { 4, 10 }, new object?[] { "7. ESTADO DEL ENSAYO",
                $"{Marca(estado.StartsWith("Pendiente"))} Pendiente   {Marca(estado == "En ensayo")} En ensayo   {Marca(estado.StartsWith("Finalizad"))} Finalizado   {Marca(estado.StartsWith("Anulad"))} Anulado   {Si} Ingresado a sistema" },
                seccion: 0, alineacionIzq: true);
            h.Observaciones(Observaciones(m, ensayos));
            h.Imprimir();
        }

        // ECT/FCT/BCT: cabecera "Nº de muestra | M1..Mn | Promedio" y una fila por magnitud. El
        // promedio de la fila principal es el de la muestra; el de las otras, el "otro promedio"
        // calculado por la API para esa magnitud.
        private static void TablaColumnas(Hoja h, List<JsonElement> ensayos, int[] spans, (string etiqueta, string codigo, string? otro)[] magnitudes)
        {
            var slots = spans.Length - 2;
            var muestras = ensayos.SelectMany(Muestras).ToList();
            if (muestras.Count == 0)
            {
                h.Fila(spans, new object?[] { "Nº de muestra" }.Concat(Enumerable.Range(1, slots).Select(i => (object?)$"M{i}")).Append("Promedio").ToArray(), cabecera: true);
                foreach (var mg in magnitudes) h.Fila(spans, new object?[] { mg.etiqueta }, etiquetas: new[] { 0 });
                return;
            }
            foreach (var x in muestras)
            {
                var dets = Dets(x);
                for (var bloque = 0; bloque * slots < Math.Max(1, dets.Count); bloque++)
                {
                    var titulo = muestras.Count > 1 ? $"Muestra N.º {Int(x, "numero")}" : "Nº de muestra";
                    if (bloque > 0) titulo += " (cont.)";
                    h.Fila(spans, new object?[] { titulo }.Concat(Enumerable.Range(1, slots).Select(i => (object?)$"M{bloque * slots + i}")).Append("Promedio").ToArray(), cabecera: true);
                    foreach (var mg in magnitudes)
                    {
                        var v = new object?[spans.Length];
                        v[0] = mg.etiqueta;
                        var inv = new List<int>();
                        for (var i = 0; i < slots; i++)
                        {
                            var d = Det(dets, bloque * slots + i + 1);
                            v[i + 1] = Val(d, mg.codigo);
                            if (d.HasValue && !Bool(d.Value, "valida")) inv.Add(i + 1);
                        }
                        var ultimo = (bloque + 1) * slots >= dets.Count;
                        if (ultimo)
                            v[^1] = mg.otro == null
                                ? (mg.codigo == CodigoPrincipal(x, magnitudes) ? Num(x, "promedio") : null)
                                : OtroPromedio(x, mg.otro);
                        h.Fila(spans, v, etiquetas: new[] { 0 }, invalidas: inv.ToArray());
                    }
                }
            }
        }

        private static string CodigoPrincipal(JsonElement x, (string etiqueta, string codigo, string? otro)[] magnitudes)
            => magnitudes.First(mg => mg.otro == null).codigo;

        // =====================================================================
        // Hoja 3: RESULTADOS DEL SISTEMA (todo lo registrado, incluidos históricos y anulados)
        // =====================================================================
        private static void HojaResultados(XLWorkbook wb, JsonElement m, List<JsonElement> ensayos, string? onda, byte[]? logo, int pagina, int total)
        {
            var h = new Hoja(wb.Worksheets.Add("Resultados del sistema"), 12);
            var anchos = new[] { 11, 10, 11, 9, 12, 7, 11, 13, 22, 11, 13, 20 };
            for (var c = 1; c <= 12; c++) h.Ws.Column(c).Width = anchos[c - 1];
            Encabezado(h, logo, pagina, total);
            h.Seccion("IDENTIFICACIÓN Y DATOS DEL PRODUCTO");
            var pares = new (string, string)[]
            {
                ("ID muestra", Str(m, "id")), ("Estado del registro", Str(m, "estado")),
                ("Etapa productiva", Str(m, "origen")), ("Tipo de muestra", Str(m, "tipoMuestra")),
                ("Origen del material", Str(m, "origenMaterial")), ("Tipo de control", Str(m, "tipoControl")),
                ("NP", Str(m, "np")), ("Cliente", Str(m, "cliente")),
                ("Código producto", Str(m, "codigoProducto")), ("Descripción", Str(m, "descripcion")),
                ("Formato (FPS)", Str(m, "formatoFps")), ("Tipo de onda", onda ?? ""),
                ("Proceso (FPS)", Str(m, "procesoTextoFps")), ("Registro de producción", RegistroProduccion(m)),
                ("Fecha producción (FPS)", Str(m, "fechaProduccionFps")), ("Operador", Str(m, "operadorTexto")),
                ("Máquina", Str(m, "maquina")), ("Turno", Str(m, "turno")),
                ("Lote", Str(m, "lote")), ("Proveedor", Str(m, "proveedor")),
                ("Fecha de ingreso", Str(m, "fechaIngreso")), ("Analista (creación)", Str(m, "analistaNombre")),
            };
            for (var i = 0; i < pares.Length; i += 2)
                h.Fila(new[] { 2, 4, 2, 4 }, new object?[] { pares[i].Item1, pares[i].Item2, pares[i + 1].Item1, pares[i + 1].Item2 }, etiquetas: new[] { 0, 2 }, alineacionIzq: true);
            if (Str(m, "antecedentesFps").Length > 0)
                h.Fila(new[] { 2, 10 }, new object?[] { "Antecedentes nota de venta (FPS)", Str(m, "antecedentesFps") }, etiquetas: new[] { 0 }, alineacionIzq: true, alto: 15 * Math.Max(1, Str(m, "antecedentesFps").Split('\n').Length));

            h.Espacio();
            h.Seccion("RESULTADOS REGISTRADOS (todas las muestras y determinaciones; incluye ensayos históricos y anulados)");
            var sp = Enumerable.Repeat(1, 12).ToArray();
            h.Fila(sp, new object?[] { "Ensayo", "Método de equipo", "Método (código / versión)", "Estado", "Analista / fecha", "Muestra", "Material / bobina", "Parámetros", "Determinaciones", "Promedio", "Otros resultados", "Observación / trazabilidad" }, cabecera: true);
            foreach (var e in ensayos.OrderBy(e => Str(e, "tipoEnsayo")).ThenBy(e => Int(e, "id")))
            {
                var traza = new List<string>();
                if (Str(e, "observacion").Length > 0) traza.Add(Str(e, "observacion"));
                if (Num(e, "ensayoReemplazaId") is double orig) traza.Add($"Corrige el ensayo #{orig} (motivo: {Str(e, "motivoReemplazo")})");
                if (Str(e, "motivoAnulacion").Length > 0) traza.Add("Anulado: " + Str(e, "motivoAnulacion"));
                var metodo = string.Join(" / ", new[] { Str(e, "metodoCodigo"), Str(e, "metodoVersion").Length > 0 ? "v" + Str(e, "metodoVersion") : "" }.Where(s => s.Length > 0));
                var cabecera = new object?[] { $"{Str(e, "tipoEnsayo")} #{Str(e, "id")}", Str(e, "variante"), metodo.Length > 0 ? metodo : Str(e, "metodo"), Str(e, "estado"), $"{Str(e, "analistaNombre")}\n{Str(e, "fecha")}" };
                var muestras = Bool(e, "modeloMuestras") ? Muestras(e).ToList() : new List<JsonElement>();
                if (muestras.Count == 0)
                {
                    var res = Num(e, "resultadoValor") is double rv ? $"{Fmt(rv)} {U(Str(e, "resultadoUnidad"))}".Trim() : "";
                    var det = Detalle(e.TryGetProperty("detalle", out var dd) ? dd : default);
                    h.Fila(sp, cabecera.Concat(new object?[] { "-", "", "", det, res, Str(e, "cumplimiento"), string.Join("\n", traza) }).ToArray(), alineacionIzq: true, ajustar: true);
                    continue;
                }
                foreach (var x in muestras)
                {
                    var dets = string.Join("\n", Dets(x).Select(d =>
                        $"D{Int(d, "numero")}: " + string.Join(" · ", Obj(d, "valores").Select(kv => $"{kv.Key} {Fmt(kv.Value)}"))
                        + (Bool(d, "valida") ? "" : $" (no válida: {Str(d, "motivoInvalida")})")));
                    var otros = string.Join("\n", Arr(x, "otrosPromedios").Select(o => $"{Str(o, "etiqueta")}: {Fmt(Num(o, "valor"))} {U(Str(o, "unidad"))}".Trim()));
                    var prom = Num(x, "promedio") is double p ? $"{Fmt(p)} {U(Str(x, "unidad"))}" : (Bool(x, "completa") ? "" : "Incompleta");
                    var parametros = string.Join("\n", Obj(x, "parametros").Select(kv => $"{kv.Key}: {kv.Value}"));
                    var material = string.Join("\n", new[] { Str(x, "sustrato"), Bobina(x), Str(x, "origenMuestra"), Str(x, "tipoAnalisis") }.Where(s => s.Length > 0));
                    var t = traza.ToList();
                    if (Str(x, "observacion").Length > 0) t.Add(Str(x, "observacion"));
                    h.Fila(sp, cabecera.Concat(new object?[] { NumMuestra(x), material, parametros, dets, prom, otros, string.Join("\n", t) }).ToArray(),
                        alineacionIzq: true, ajustar: true, alto: 12 * Math.Max(2, Math.Max(Dets(x).Count, Math.Max(otros.Split('\n').Length, material.Split('\n').Length))));
                }
            }
            h.Imprimir(apaisado: true);
        }

        // =====================================================================
        // Encabezado común (logo | título | código; revisión | subtítulo | página)
        // =====================================================================
        private static void Encabezado(Hoja h, byte[]? logo, int pagina, int total)
        {
            var n = h.Columnas;
            var izq = n >= 14 ? 3 : 2;
            var der = 2;
            h.Ws.Row(1).Height = 34;
            h.Ws.Row(2).Height = 17;
            var rLogo = h.Rango(1, 1, 1, izq);
            rLogo.Merge();
            var rTitulo = h.Rango(1, izq + 1, 1, n - der);
            rTitulo.Merge().Value = "REGISTRO FISICO DE LABORATORIO";
            rTitulo.Style.Font.FontSize = 13;
            var rCod = h.Rango(1, n - der + 1, 1, n);
            rCod.Merge().Value = "REG-LAB-04";
            var rRev = h.Rango(2, 1, 2, izq);
            rRev.Merge().Value = "Revisión: julio 2026";
            var rSub = h.Rango(2, izq + 1, 2, n - der);
            rSub.Merge().Value = "ENSAYOS DE PROCESO PRODUCTIVO – PRODUCTO TERMINADO";
            rSub.Style.Fill.BackgroundColor = VerdeClaro;
            rSub.Style.Font.Bold = true;
            rSub.Style.Font.FontColor = Oliva;
            var rPag = h.Rango(2, n - der + 1, 2, n);
            rPag.Merge().Value = $"Página {pagina} de {total}";
            foreach (var r in new[] { rLogo, rTitulo, rCod, rRev, rSub, rPag })
            {
                r.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                r.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                r.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            }
            if (logo != null)
            {
                using var ms = new MemoryStream(logo);
                h.Ws.AddPicture(ms).MoveTo(h.Ws.Cell(1, 1), 6, 6).WithSize(izq == 3 ? 128 : 118, 36);
            }
            h.Fila_ = 3;
            h.Espacio(6);
        }

        // =====================================================================
        // Datos
        // =====================================================================
        private static IEnumerable<JsonElement> Arr(JsonElement e, string p)
            => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.Array ? v.EnumerateArray() : Enumerable.Empty<JsonElement>();

        private static IEnumerable<JsonElement> Muestras(JsonElement e) => Arr(e, "muestras").Where(x => !Bool(x, "eliminada")).OrderBy(x => Int(x, "numero"));

        private static List<JsonElement> Dets(JsonElement x) => Arr(x, "determinaciones").OrderBy(d => Int(d, "numero")).ToList();

        private static JsonElement? Det(List<JsonElement> dets, int numero)
        {
            foreach (var d in dets) if (Int(d, "numero") == numero) return d;
            return null;
        }

        private static string Str(JsonElement e, string p)
        {
            if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(p, out var v)) return "";
            return v.ValueKind switch
            {
                JsonValueKind.String => v.GetString() ?? "",
                JsonValueKind.Number => v.GetRawText(),
                JsonValueKind.True => "Sí",
                JsonValueKind.False => "No",
                _ => "",
            };
        }

        private static double? Num(JsonElement e, string p)
            => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;

        private static int Int(JsonElement e, string p) => (int)(Num(e, p) ?? 0);

        private static bool Bool(JsonElement e, string p)
            => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.True;

        private static double? Val(JsonElement? d, string codigo)
            => d.HasValue && d.Value.TryGetProperty("valores", out var v) ? Num(v, codigo) : null;

        private static double? Res(JsonElement d, string codigo)
            => d.TryGetProperty("resultados", out var r) && r.ValueKind == JsonValueKind.Object ? Num(r, codigo) : null;

        private static List<KeyValuePair<string, string>> Obj(JsonElement e, string p)
        {
            var l = new List<KeyValuePair<string, string>>();
            if (e.ValueKind == JsonValueKind.Object && e.TryGetProperty(p, out var o) && o.ValueKind == JsonValueKind.Object)
                foreach (var kv in o.EnumerateObject())
                    l.Add(new(kv.Name, kv.Value.ValueKind == JsonValueKind.Number ? Fmt(kv.Value.GetDouble()) : kv.Value.ValueKind == JsonValueKind.Null ? "-" : kv.Value.ToString()));
            return l;
        }

        private static string Param(JsonElement x, string codigo)
            => x.TryGetProperty("parametros", out var p) && p.ValueKind == JsonValueKind.Object ? Str(p, codigo) : "";

        private static double? OtroPromedio(JsonElement x, string codigo)
            => Arr(x, "otrosPromedios").Where(o => Str(o, "codigo") == codigo).Select(o => Num(o, "valor")).FirstOrDefault();

        private static int Grupo(string sustrato) => Array.FindIndex(Grupos, g => string.Equals(g, sustrato, StringComparison.OrdinalIgnoreCase));

        private static string Bobina(JsonElement x)
            => string.Join(" / ", new[] { Str(x, "bobinaNumero"), Str(x, "bobinaLote") }.Where(s => s.Length > 0));

        private static string NumMuestra(JsonElement x) => "M" + Int(x, "numero");

        private static string Marca(bool v) => v ? Si : No;

        private static string Probetas(HashSet<string> p)
            => $"{Marca(p.Contains("10x10"))} 10 × 10 cm   {Marca(p.Contains("5x5"))} 5 × 5 cm   {Marca(p.Contains("10x5"))} 10 × 5 cm";

        private static string RegistroProduccion(JsonElement m)
            => Str(m, "registroProduccionRecordKey").Length > 0 ? $"{Str(m, "registroProduccionRecordKey")}" : "";

        private static string Analistas(JsonElement m)
        {
            var nombres = Arr(m, "ensayos").Where(e => Str(e, "estado") != "Anulado").Select(e => Str(e, "analistaNombre")).Where(s => s.Length > 0).Distinct().ToList();
            return nombres.Count > 0 ? string.Join(", ", nombres) : Str(m, "analistaNombre");
        }

        private static (string fecha, string hora) FechaHoraEnsayo(JsonElement m)
        {
            var texto = Str(m, "fechaEnsayo");
            if (texto.Length == 0)
                texto = Arr(m, "ensayos").Where(e => Str(e, "estado") != "Anulado").Select(e => Str(e, "fecha")).Where(s => s.Length > 0).OrderBy(s => s).FirstOrDefault() ?? Str(m, "fechaIngreso");
            var partes = texto.Replace('T', ' ').Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var fecha = partes.Length > 0 && DateTime.TryParseExact(partes[0], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var f) ? f.ToString("dd-MM-yyyy") : (partes.Length > 0 ? partes[0] : "");
            var hora = partes.Length > 1 ? (partes[1].Length >= 5 ? partes[1][..5] : partes[1]) : "";
            return (fecha, hora);
        }

        private static string HoraDe(string fecha)
        {
            var partes = fecha.Replace('T', ' ').Split(' ', StringSplitOptions.RemoveEmptyEntries);
            return partes.Length > 1 && partes[1].Length >= 5 ? partes[1][..5] : "";
        }

        // El gramaje nominal NO se infiere del texto del proceso FPS (no hay regla de extracción validada):
        // queda en blanco para completarse a mano, como en el registro físico.

        private static string[] Observaciones(JsonElement m, List<JsonElement> ensayos)
        {
            var l = new List<string>();
            if (Str(m, "observacion").Length > 0) l.Add(Str(m, "observacion"));
            foreach (var e in ensayos)
            {
                if (Str(e, "observacion").Length > 0) l.Add($"{Str(e, "tipoEnsayo")}: {Str(e, "observacion")}");
                foreach (var x in Muestras(e))
                    foreach (var d in Dets(x).Where(d => !Bool(d, "valida")))
                        l.Add($"{Str(e, "tipoEnsayo")} {NumMuestra(x)} D{Int(d, "numero")} no válida (tachado): {Str(d, "motivoInvalida")}");
            }
            return l.ToArray();
        }

        private static string Detalle(JsonElement d)
        {
            if (d.ValueKind == JsonValueKind.Object)
                return string.Join("\n", d.EnumerateObject().Select(p => $"{p.Name}: {Detalle(p.Value)}"));
            if (d.ValueKind == JsonValueKind.Array)
                return string.Join("; ", d.EnumerateArray().Select(Detalle));
            return d.ValueKind switch
            {
                JsonValueKind.Number => Fmt(d.GetDouble()),
                JsonValueKind.String => d.GetString() ?? "",
                JsonValueKind.True => "Sí",
                JsonValueKind.False => "No",
                _ => "",
            };
        }

        private static string Fmt(double? v) => v.HasValue ? v.Value.ToString("#,##0.####", Es) : "-";

        private static string Fmt(string v) => v;

        // Unidades en español (igual que la pantalla e informe: lb/in → lb/pulg, in → pulg).
        private static string U(string u) => u == "lb/in" ? "lb/pulg" : u == "lbf/in" ? "lbf/pulg" : u == "in" ? "pulg" : u;

        // =====================================================================
        // Hoja: escritura por filas con celdas combinadas (spans) y estilos del registro físico
        // =====================================================================
        private sealed class Hoja
        {
            public readonly IXLWorksheet Ws;
            public readonly int Columnas;
            public int Fila_ = 1;

            public Hoja(IXLWorksheet ws, int columnas)
            {
                Ws = ws;
                Columnas = columnas;
                ws.Style.Font.FontName = "Arial";
                ws.Style.Font.FontSize = 8;
                ws.ShowGridLines = false;
            }

            public IXLRange Rango(int f1, int c1, int f2, int c2) => Ws.Range(f1, c1, f2, c2);

            public void Espacio(double alto = 6)
            {
                Ws.Row(Fila_).Height = alto;
                Fila_++;
            }

            public void Seccion(string titulo)
            {
                var r = Rango(Fila_, 1, Fila_, Columnas).Merge();
                r.Value = titulo;
                r.Style.Fill.BackgroundColor = Oliva;
                r.Style.Font.FontColor = XLColor.White;
                r.Style.Font.Bold = true;
                r.Style.Font.FontSize = 9;
                r.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                r.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                Ws.Row(Fila_).Height = 16;
                Fila_++;
            }

            public void Observaciones(string[] lineas)
            {
                var r1 = Rango(Fila_, 1, Fila_, Columnas).Merge();
                r1.Value = "OBSERVACIONES:";
                r1.Style.Font.Bold = true;
                r1.Style.Border.TopBorder = XLBorderStyleValues.Thin;
                r1.Style.Border.LeftBorder = XLBorderStyleValues.Thin;
                r1.Style.Border.RightBorder = XLBorderStyleValues.Thin;
                Fila_++;
                var r = Rango(Fila_, 1, Fila_, Columnas).Merge();
                r.Value = string.Join("\n", lineas);
                r.Style.Alignment.WrapText = true;
                r.Style.Alignment.Vertical = XLAlignmentVerticalValues.Top;
                r.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
                r.Style.Border.LeftBorder = XLBorderStyleValues.Thin;
                r.Style.Border.RightBorder = XLBorderStyleValues.Thin;
                Ws.Row(Fila_).Height = Math.Max(60, 12 * (lineas.Length + 1));
                Fila_++;
            }

            // spans: columnas que ocupa cada valor. seccion: índice que va con fondo oliva;
            // etiquetas: índices con fondo verde claro y negrita; invalidas: índices tachados.
            public void Fila(int[] spans, object?[] valores, bool cabecera = false, bool subcabecera = false, int seccion = -1,
                int[]? etiquetas = null, int[]? invalidas = null, bool alineacionIzq = false, bool nota = false, bool ajustar = false, double? alto = null)
            {
                var c = 1;
                for (var i = 0; i < spans.Length; i++)
                {
                    var r = Rango(Fila_, c, Fila_, c + spans[i] - 1);
                    if (spans[i] > 1) r.Merge();
                    var cell = Ws.Cell(Fila_, c);
                    var v = i < valores.Length ? valores[i] : null;
                    switch (v)
                    {
                        case null: break;
                        case double d: cell.Value = d; break;
                        case string s: cell.Value = s; break;
                        default: cell.Value = v.ToString(); break;
                    }
                    var st = r.Style;
                    st.Border.OutsideBorder = XLBorderStyleValues.Thin;
                    st.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                    st.Alignment.Horizontal = alineacionIzq || nota ? XLAlignmentHorizontalValues.Left : XLAlignmentHorizontalValues.Center;
                    st.Alignment.WrapText = cabecera || ajustar || nota;
                    if (cabecera) { st.Fill.BackgroundColor = VerdeClaro; st.Font.Bold = true; st.Font.FontSize = 7; }
                    if (subcabecera) { st.Fill.BackgroundColor = VerdeClaro; st.Font.Bold = true; }
                    if (nota) { st.Fill.BackgroundColor = VerdeEtiqueta; st.Font.FontSize = 7; st.Font.Italic = true; st.Alignment.Horizontal = XLAlignmentHorizontalValues.Center; }
                    if (etiquetas != null && etiquetas.Contains(i)) { st.Fill.BackgroundColor = VerdeEtiqueta; st.Font.Bold = true; st.Alignment.Horizontal = XLAlignmentHorizontalValues.Left; }
                    if (i == seccion) { st.Fill.BackgroundColor = Oliva; st.Font.FontColor = XLColor.White; st.Font.Bold = true; st.Font.FontSize = 9; st.Alignment.Horizontal = XLAlignmentHorizontalValues.Left; }
                    if (invalidas != null && invalidas.Contains(i)) { st.Font.Strikethrough = true; st.Font.FontColor = XLColor.Gray; }
                    if (!cabecera && v is string && !alineacionIzq && etiquetas == null && seccion < 0 && i > 0 && spans[i] >= 4) st.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;
                    c += spans[i];
                }
                Ws.Row(Fila_).Height = alto ?? (cabecera ? 24 : 14);
                Fila_++;
            }

            public void Imprimir(bool apaisado = false)
            {
                var ps = Ws.PageSetup;
                ps.PaperSize = XLPaperSize.A4Paper;
                ps.PageOrientation = apaisado ? XLPageOrientation.Landscape : XLPageOrientation.Portrait;
                ps.FitToPages(1, 0);
                ps.Margins.Left = 0.3;
                ps.Margins.Right = 0.3;
                ps.Margins.Top = 0.4;
                ps.Margins.Bottom = 0.4;
                ps.Margins.Header = 0.2;
                ps.Margins.Footer = 0.2;
                ps.CenterHorizontally = true;
                ps.PrintAreas.Add(1, 1, Fila_ - 1, Columnas);
            }
        }
    }
}
