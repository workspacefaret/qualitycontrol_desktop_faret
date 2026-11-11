using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace QualityControlCenter.Modules.EvaluacionOperadores
{
    // Atribución técnica PNC (Data Faret) ↔ sesiones reales de producción (FPS), SOLO LECTURA (Fase 34).
    // Flujo: PNC.npNv → OT de FPS (ZZZMasterOT.NotaVentaFaret / NotaVentaInnpack) → sesiones de WorkOrderRecords
    //        (máquina ResourceKey, operador UserKey, inicio/término) → máquina de la PNC → fecha de fabricación.
    // Estados: CONFIRMADA_TECNICA / PROBABLE / AMBIGUA / DISCREPANCIA / SIN_ATRIBUCION.
    // "Confirmada técnica" = una única persona registrada en FPS en ese documento, máquina y día. NO demuestra que
    // haya causado el defecto: la responsabilidad la confirma Calidad (siempre PENDIENTE aquí). Los puntos son
    // provisionales (10/5/1) y solo se suman con una única persona confirmada; con varias, nadie recibe puntos.
    // La identidad del operador es el UserKey de FPS: nunca se asocia por nombre (el nombre declarado en la PNC
    // solo se compara, como información).
    public static class FaretAtribucionFps
    {
        public const string Confirmada = "CONFIRMADA_TECNICA";
        public const string Probable = "PROBABLE";
        public const string Ambigua = "AMBIGUA";
        public const string Discrepancia = "DISCREPANCIA";
        public const string SinAtribucion = "SIN_ATRIBUCION";
        public static readonly string[] Estados = { Confirmada, Probable, Ambigua, Discrepancia, SinAtribucion };

        public sealed record PncEntrada(long Id, string? NpNv, string? Nivel, string? Maquina, string? Area, string? FechaFabricacion, string? OperadorDeclarado, string? TipoPnc = null);

        public sealed record OrdenFps(long OrdenTrabajo, long? NotaVentaFaret, long? NotaVentaInnpack);

        public sealed record SesionFps(long RecordKey, long IdProceso, long OrdenTrabajo, string? Categoria, string? NombreProceso, int? Status,
            long? IdMaquina, string? Maquina, string? MaquinaDescripcion, long? IdOperador, string? Operador,
            DateTime? Inicio, DateTime? Fin, decimal? Cantidad);

        public sealed class DatosFps
        {
            public List<OrdenFps> Ordenes { get; } = new();
            public List<SesionFps> Sesiones { get; } = new();
        }

        // ---------------------------------------------------------------- lectura de la respuesta de fps-api
        // { ok, data: { nps, ordenes:[...], sesiones:[...] } }. Devuelve false con mensaje si el formato no calza.
        public static bool TryParseRespuesta(string body, DatosFps destino, out string error)
        {
            error = "";
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (!root.TryGetProperty("ok", out var ok) || ok.ValueKind != JsonValueKind.True || !root.TryGetProperty("data", out var d))
                {
                    error = root.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString()! : "Respuesta de FPS no válida.";
                    return false;
                }
                foreach (var o in d.GetProperty("ordenes").EnumerateArray())
                    destino.Ordenes.Add(new OrdenFps(Long(o, "OrdenTrabajo") ?? 0, Long(o, "NotaVentaFaret"), Long(o, "NotaVentaInnpack")));
                foreach (var s in d.GetProperty("sesiones").EnumerateArray())
                    destino.Sesiones.Add(new SesionFps(Long(s, "RecordKey") ?? 0, Long(s, "IdProceso") ?? 0, Long(s, "OrdenTrabajo") ?? 0,
                        Str(s, "Categoria"), Str(s, "NombreProceso"), (int?)Long(s, "Status"), Long(s, "IdMaquina"), Str(s, "Maquina"),
                        Str(s, "MaquinaDescripcion"), Long(s, "IdOperador"), Str(s, "Operador"),
                        Fecha(Str(s, "ProductionStartDate")), Fecha(Str(s, "ProductionEndDate")), Dec(s, "ProductionQuantity")));
                return true;
            }
            catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException)
            {
                error = "Respuesta de FPS con formato inesperado.";
                return false;
            }
        }

        // ---------------------------------------------------------------- normalización
        public static string Norm(string? s)
        {
            if (string.IsNullOrWhiteSpace(s)) return "";
            var d = s.Trim().ToUpperInvariant().Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder();
            foreach (var c in d)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
                sb.Append(char.IsLetterOrDigit(c) ? c : ' ');
            }
            return string.Join(' ', sb.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries));
        }

        private static string Compacto(string? s) => Norm(s).Replace(" ", "");
        private static string Numeros(string? s) => string.Join(' ', Norm(s).Split(' ').SelectMany(t => SepararDigitos(t)).Where(t => t.All(char.IsDigit)));
        private static IEnumerable<string> SepararDigitos(string t)
        {
            var sb = new StringBuilder(); bool? dig = null;
            foreach (var c in t)
            {
                var esD = char.IsDigit(c);
                if (dig.HasValue && esD != dig.Value) { yield return sb.ToString(); sb.Clear(); }
                sb.Append(c); dig = esD;
            }
            if (sb.Length > 0) yield return sb.ToString();
        }
        private static string Prefijo(string? s)
        {
            var t = Norm(s).Split(' ').FirstOrDefault(x => x.Length > 0 && char.IsLetter(x[0])) ?? "";
            var letras = new string(t.TakeWhile(char.IsLetter).ToArray());
            return letras.Length >= 3 ? letras[..3] : letras;
        }

        // Turno ESTIMADO por la hora de inicio de la sesión (A 07–15, B 15–23, C 23–07). FPS no entrega el turno.
        public static string Turno(DateTime? inicio) => inicio is null ? "" : inicio.Value.Hour switch
        {
            >= 7 and < 15 => "A",
            >= 15 and < 23 => "B",
            _ => "C",
        };

        private static bool EsMarcaSinProduccion(SesionFps s) =>
            (s.Cantidad ?? 0) <= 0 && s.Inicio.HasValue && (s.Fin ?? s.Inicio).Value - s.Inicio.Value < TimeSpan.FromMinutes(1);

        // ---------------------------------------------------------------- máquina
        private static readonly HashSet<string> NoEsMaquina = new()
        {
            "TALLER", "EDICION", "DESPACHO", "DESARROLLO ESTRUCTURAL", "CARGA DE ARCHIVOS", "ADQUISICIONES", "COMERCIAL",
            "COTIZACION", "CARGA NOTA VENTA", "PRE PRENSA", "PREPRENSA", "CHINA EUR", "BODEGA", "CALIDAD", "DISENO",
        };

        // EXACTA: mismo nombre normalizado (corto o descripción). EQUIVALENTE: mismos números y mismo prefijo
        // de 3 letras ("Bobst 104-2" ↔ "BOB. 104-2"), y única en el documento. Se identifica luego por IdMaquina.
        public static (string estado, long? idMaquina, string? nombre) ResolverMaquina(string? maquinaPnc, IEnumerable<SesionFps> sesionesDoc)
        {
            var maquinas = sesionesDoc.Where(s => s.IdMaquina.HasValue).GroupBy(s => s.IdMaquina!.Value)
                .Select(g => (id: g.Key, corto: g.First().Maquina, desc: g.First().MaquinaDescripcion)).ToList();
            if (string.IsNullOrWhiteSpace(maquinaPnc) || Norm(maquinaPnc) is "" or "NA" or "N A" or "SIN MAQUINA") return ("SIN_DATO", null, null);
            // Valores de Data que son un sector/trámite y no una máquina (hallado con datos reales): no se comparan
            // contra máquinas de FPS (no es una discrepancia) y la PNC se evalúa por proceso/área.
            if (NoEsMaquina.Contains(Norm(maquinaPnc))) return ("NO_ES_MAQUINA", null, null);
            var c = Compacto(maquinaPnc);
            var exactas = maquinas.Where(m => Compacto(m.corto) == c || Compacto(m.desc) == c).ToList();
            if (exactas.Count == 1) return ("EXACTA", exactas[0].id, exactas[0].corto);
            var num = Numeros(maquinaPnc); var pre = Prefijo(maquinaPnc);
            if (num.Length > 0 && pre.Length == 3)
            {
                var eq = maquinas.Where(m => (Numeros(m.corto) == num && Prefijo(m.corto) == pre) || (Numeros(m.desc) == num && Prefijo(m.desc) == pre)).ToList();
                if (eq.Count == 1) return ("EQUIVALENTE", eq[0].id, eq[0].corto);
                if (eq.Count > 1) return ("VARIAS", null, null);
            }
            // Data a veces solo trae el número ("104-2"): se acepta si es el único calce numérico del documento.
            if (pre.Length == 0 && num.Length > 0)
            {
                var soloNum = maquinas.Where(m => Numeros(m.corto) == num || Numeros(m.desc) == num).ToList();
                if (soloNum.Count == 1) return ("EQUIVALENTE", soloNum[0].id, soloNum[0].corto);
                if (soloNum.Count > 1) return ("VARIAS", null, null);
            }
            // Error de tipeo de 1 letra en nombres largos (p. ej. "EXPERTFOLD" / "EXPERFOLD"): solo si es el único calce.
            if (c.Length >= 7)
            {
                var cerca = maquinas.Where(m => Distancia1(Compacto(m.corto), c) || Distancia1(Compacto(m.desc), c)).ToList();
                if (cerca.Count == 1) return ("EQUIVALENTE", cerca[0].id, cerca[0].corto);
            }
            return maquinas.Count == 0 ? ("SIN_SESIONES", null, null) : ("NO_EN_DOCUMENTO", null, null);
        }

        // true si a y b difieren en exactamente una inserción, borrado o sustitución (ambas no vacías).
        private static bool Distancia1(string a, string b)
        {
            if (a.Length == 0 || b.Length == 0 || a == b || Math.Abs(a.Length - b.Length) > 1) return false;
            int i = 0, j = 0, dif = 0;
            while (i < a.Length && j < b.Length)
            {
                if (a[i] == b[j]) { i++; j++; continue; }
                if (++dif > 1) return false;
                if (a.Length > b.Length) i++; else if (a.Length < b.Length) j++; else { i++; j++; }
            }
            return dif + (a.Length - i) + (b.Length - j) == 1;
        }

        private static bool ProcesoCoincide(string? area, string? categoria)
        {
            var a = Norm(area); var c = Norm(categoria);
            if (a.Length < 4 || c.Length < 4) return false;
            var n = Math.Min(5, Math.Min(a.Length, c.Length));
            return a[..n] == c[..n];
        }

        // ---------------------------------------------------------------- operador declarado (solo comparación)
        public static string CompararDeclarado(string? declarado, IEnumerable<string?> nombresFps)
        {
            var d = Norm(declarado);
            if (d.Length == 0 || d is "NA" or "N A" or "SIN OPERADOR") return "SIN_DATO";
            if (d.StartsWith("TALLER ") || d.Contains(" TALLER ") || d.StartsWith("EXTERNO")) return "EXTERNO";
            var palabras = d.Split(' ').Where(p => p.Length >= 2 && !p.All(char.IsDigit)).ToHashSet();
            if (palabras.Count < 2) return "NO_COMPARABLE";
            if (d.Contains(" Y ") || d.Contains('/')) return "NO_COMPARABLE";
            foreach (var n in nombresFps)
            {
                var f = Norm(n).Split(' ').ToHashSet();
                if (palabras.IsSubsetOf(f)) return "COINCIDE";
            }
            return "NO_COINCIDE";
        }

        // ---------------------------------------------------------------- atribución de una PNC
        public sealed class Resultado
        {
            public long Id { get; init; }
            public string? NpNv { get; init; }
            public string Nivel { get; init; } = "";
            public string? MaquinaPnc { get; init; }
            public string? Area { get; init; }
            public string? FechaFabricacion { get; init; }
            public string Estado { get; set; } = SinAtribucion;
            public List<string> Motivos { get; } = new();
            public string Documento { get; set; } = "NO_ENCONTRADO";
            public List<long> Ots { get; } = new();
            public string EstadoMaquina { get; set; } = "SIN_DATO";
            public long? IdMaquinaFps { get; set; }
            public string? MaquinaFps { get; set; }
            public string EstadoFecha { get; set; } = "SIN_FECHA";
            public List<SesionFps> Evidencia { get; } = new();
            public List<SesionFps> Contexto { get; } = new();
            public List<(long id, string? nombre)> Operadores { get; } = new();
            public bool Simultaneas { get; set; }
            public bool CambioTurno { get; set; }
            public string? OperadorDeclarado { get; init; }
            public string Declarado { get; set; } = "SIN_DATO";
            public int PuntosProvisionales { get; set; }
        }

        public static Resultado Atribuir(PncEntrada p, DatosFps fps)
        {
            var r = new Resultado
            {
                Id = p.Id, NpNv = p.NpNv, Nivel = EvaluacionOperadoresCalculator.ClasificarNivel(p.Nivel), MaquinaPnc = p.Maquina,
                Area = p.Area, FechaFabricacion = p.FechaFabricacion, OperadorDeclarado = p.OperadorDeclarado,
            };

            // 1) Documento
            if (!long.TryParse((p.NpNv ?? "").Trim(), out var np) || np <= 0)
            {
                r.Documento = "NO_NUMERICO";
                r.Motivos.Add("La NP/NV de la PNC no es un número: no se puede buscar en FPS.");
                return Cerrar(r, p);
            }
            var porFaret = fps.Ordenes.Where(o => o.NotaVentaFaret == np).Select(o => o.OrdenTrabajo).ToHashSet();
            var porInnpack = fps.Ordenes.Where(o => o.NotaVentaInnpack == np).Select(o => o.OrdenTrabajo).ToHashSet();
            if (porFaret.Count == 0 && porInnpack.Count == 0)
            {
                r.Motivos.Add("La NP/NV no existe en FPS (ni como NP Faret ni como NV Innpack).");
                return Cerrar(r, p);
            }
            if (porFaret.Count > 0 && porInnpack.Count > 0 && !porFaret.SetEquals(porInnpack))
            {
                r.Documento = "AMBIGUO";
                r.Ots.AddRange(porFaret.Union(porInnpack).OrderBy(x => x));
                r.Estado = Ambigua;
                r.Motivos.Add("El número existe como NP Faret y como NV Innpack en órdenes distintas: no se elige uno.");
                r.Contexto.AddRange(fps.Sesiones.Where(s => r.Ots.Contains(s.OrdenTrabajo)));
                return Cerrar(r, p);
            }
            r.Documento = porFaret.Count > 0 ? "NP_FARET" : "NV_INNPACK";
            r.Ots.AddRange((porFaret.Count > 0 ? porFaret : porInnpack).OrderBy(x => x));
            var doc = fps.Sesiones.Where(s => r.Ots.Contains(s.OrdenTrabajo) && s.IdOperador.HasValue && s.Inicio.HasValue).ToList();
            var docReales = doc.Where(s => !EsMarcaSinProduccion(s)).ToList();
            if (docReales.Count == 0) docReales = doc;
            if (doc.Count == 0)
            {
                r.Motivos.Add("La orden existe en FPS pero no tiene sesiones con operador registradas.");
                return Cerrar(r, p);
            }

            // 2) Máquina (o, sin máquina, proceso)
            var (estMaq, idMaq, nomMaq) = ResolverMaquina(p.Maquina, doc);
            r.EstadoMaquina = estMaq; r.IdMaquinaFps = idMaq; r.MaquinaFps = nomMaq;
            List<SesionFps> candidatas;
            bool maquinaFirme;
            if (idMaq.HasValue)
            {
                candidatas = docReales.Where(s => s.IdMaquina == idMaq).ToList();
                if (candidatas.Count == 0) candidatas = doc.Where(s => s.IdMaquina == idMaq).ToList();
                maquinaFirme = true;
            }
            else if (estMaq == "NO_EN_DOCUMENTO")
            {
                r.Estado = Discrepancia;
                r.Motivos.Add($"Calidad registró la máquina «{p.Maquina}», pero FPS no tiene sesiones de esa máquina en este documento.");
                r.Contexto.AddRange(docReales);
                return Cerrar(r, p);
            }
            else
            {
                candidatas = docReales.Where(s => ProcesoCoincide(p.Area, s.Categoria)).ToList();
                maquinaFirme = false;
                if (candidatas.Count == 0)
                {
                    r.Motivos.Add(estMaq == "VARIAS"
                        ? "El nombre de máquina calza con varias máquinas del documento."
                        : "Sin máquina identificable ni proceso coincidente en FPS.");
                    r.Contexto.AddRange(docReales);
                    r.Estado = docReales.Select(s => s.IdOperador).Distinct().Count() > 1 ? Ambigua : SinAtribucion;
                    return Cerrar(r, p);
                }
                r.Motivos.Add("Sin máquina identificable: se usaron las sesiones del proceso equivalente al área.");
            }

            // 3) Fecha de fabricación
            DateTime? dia = EvaluacionOperadoresCalculator.TryParseFecha(p.FechaFabricacion, out var f) ? f.Date : null;
            List<SesionFps> evidencia;
            if (dia.HasValue)
            {
                var enDia = candidatas.Where(s => s.Inicio!.Value.Date <= dia.Value && (s.Fin ?? s.Inicio)!.Value.Date >= dia.Value).ToList();
                if (enDia.Count > 0) { r.EstadoFecha = "DENTRO"; evidencia = enDia; }
                else
                {
                    r.EstadoFecha = "FUERA";
                    r.Estado = Discrepancia;
                    r.Motivos.Add($"FPS no registra sesiones de {(maquinaFirme ? "esa máquina" : "ese proceso")} en el documento el día de fabricación declarado ({dia:dd-MM-yyyy}).");
                    r.Contexto.AddRange(candidatas);
                    return Cerrar(r, p);
                }
            }
            else
            {
                r.EstadoFecha = "SIN_FECHA";
                evidencia = candidatas;
            }

            // 4) Operadores (por UserKey)
            r.Evidencia.AddRange(evidencia.OrderBy(s => s.Inicio));
            foreach (var g in evidencia.GroupBy(s => s.IdOperador!.Value).OrderBy(g => g.Key))
                r.Operadores.Add((g.Key, g.First().Operador));
            r.Simultaneas = HaySolape(evidencia);
            r.CambioTurno = r.Operadores.Count > 1 && evidencia.Select(s => Turno(s.Inicio)).Distinct().Count() > 1;

            if (r.Operadores.Count > 1)
            {
                r.Estado = Ambigua;
                r.Motivos.Add(r.Simultaneas
                    ? "Varias personas con sesiones simultáneas: no se asigna a una sola."
                    : "Varias personas en el período (cambios de turno o de operador): no se asigna a una sola.");
            }
            else if (maquinaFirme && r.EstadoFecha == "DENTRO")
            {
                r.Estado = Confirmada;
                r.Motivos.Add("Documento, máquina y día de fabricación coinciden con una única persona en FPS.");
            }
            else
            {
                r.Estado = Probable;
                r.Motivos.Add(r.EstadoFecha == "SIN_FECHA"
                    ? "Una única persona en esa máquina del documento, pero la PNC no tiene fecha de fabricación."
                    : "Una única persona, pero la máquina se dedujo del proceso, no de la máquina registrada.");
            }
            if (r.EstadoMaquina == "EQUIVALENTE")
                r.Motivos.Add($"Máquina por equivalencia de nombre: «{p.Maquina}» ↔ «{r.MaquinaFps}» (mismos números y prefijo).");
            return Cerrar(r, p);
        }

        private static Resultado Cerrar(Resultado r, PncEntrada p)
        {
            var nombres = r.Operadores.Select(o => o.nombre);
            r.Declarado = r.Operadores.Count > 0 ? CompararDeclarado(p.OperadorDeclarado, nombres)
                : (CompararDeclarado(p.OperadorDeclarado, Array.Empty<string?>()) is "SIN_DATO" or "EXTERNO" or "NO_COMPARABLE" ? CompararDeclarado(p.OperadorDeclarado, Array.Empty<string?>()) : "SIN_FPS");
            r.PuntosProvisionales = r.Estado == Confirmada && r.Operadores.Count == 1 ? EvaluacionOperadoresCalculator.Puntos(r.Nivel) : 0;
            return r;
        }

        private static bool HaySolape(List<SesionFps> s)
        {
            var orden = s.Where(x => x.Inicio.HasValue).OrderBy(x => x.Inicio).ToList();
            for (var i = 0; i < orden.Count; i++)
                for (var j = i + 1; j < orden.Count; j++)
                {
                    if (orden[j].IdOperador == orden[i].IdOperador) continue;
                    var finI = orden[i].Fin ?? orden[i].Inicio;
                    if (orden[j].Inicio < finI) return true;
                }
            return false;
        }

        // ---------------------------------------------------------------- privacidad
        public static string Seudonimo(long idOperador) =>
            "OP-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("FPS:" + idOperador.ToString(CultureInfo.InvariantCulture))))[..6];

        // ---------------------------------------------------------------- helpers JSON
        private static string? Str(JsonElement e, string p) =>
            e.TryGetProperty(p, out var v) ? v.ValueKind switch { JsonValueKind.String => v.GetString(), JsonValueKind.Number => v.ToString(), _ => null } : null;
        private static long? Long(JsonElement e, string p) =>
            e.TryGetProperty(p, out var v) ? v.ValueKind switch
            {
                JsonValueKind.Number when v.TryGetInt64(out var l) => l,
                JsonValueKind.String when long.TryParse(v.GetString(), out var l2) => l2,
                _ => null,
            } : null;
        private static decimal? Dec(JsonElement e, string p) =>
            e.TryGetProperty(p, out var v) ? v.ValueKind switch
            {
                JsonValueKind.Number when v.TryGetDecimal(out var d) => d,
                JsonValueKind.String when decimal.TryParse(v.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var d2) => d2,
                _ => null,
            } : null;
        private static DateTime? Fecha(string? s) =>
            DateTime.TryParseExact(s, "yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;
    }
}
