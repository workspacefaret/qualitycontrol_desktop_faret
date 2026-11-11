using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace QualityControlCenter.Modules.EvaluacionOperadores
{
    // Fila mínima de no_conformidades (ámbito PRODUCTO) que necesita el cálculo.
    // Area/Referencia son opcionales (Faret: área/proceso y NP/NV de la PNC en Data). INNPACK no los usa.
    public record NcFila(int Id, string? Nivel, string? Operador, string? Maquina, string? FechaFabricacion, bool Eliminado, string? Area = null, string? Referencia = null);

    public record EvaluacionFiltros(int? Anio, int? Mes, string? Maquina, string? Operador, string? Area = null);

    // Cálculo puro (sin E/S) del indicador DESCRIPTIVO de penalización por operador. Ponderaciones
    // PROVISIONALES de Calidad (Crítico 10 / Mayor 5 / Menor 1), pendientes de validación formal.
    // No produce nota, porcentaje ni ranking. Período = fecha_fabricacion (nunca fecha_ingreso).
    public static class EvaluacionOperadoresCalculator
    {
        public const int PuntosCritico = 10;
        public const int PuntosMayor = 5;
        public const int PuntosMenor = 1;

        // Umbral PROVISIONAL bajo el cual no se compara ni se concluye (decisión pendiente de Calidad).
        public const int MinEvaluablesParaComparar = 30;

        private static readonly HashSet<string> OperadoresGenericos = new(StringComparer.Ordinal)
        {
            "-", "--", "?", "N/A", "NA", "S/N", "SN", "NO APLICA", "SIN OPERADOR", "SIN DATO", "DESCONOCIDO",
            "VARIOS", "TODOS", "TURNO", "GENERICO", "GENÉRICO", "OPERADOR", "NINGUNO",
        };

        public static string NormalizarClave(string? s) =>
            string.Join(' ', (s ?? "").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).ToUpperInvariant();

        public static string ClasificarNivel(string? nivel)
        {
            var n = NormalizarClave(nivel);
            if (n.Length == 0) return "SIN_NIVEL";
            if (n.StartsWith("CR", StringComparison.Ordinal)) return "CRITICO";
            if (n.StartsWith("MAY", StringComparison.Ordinal)) return "MAYOR";
            if (n.StartsWith("MEN", StringComparison.Ordinal)) return "MENOR";
            return "NIVEL_OTRO";
        }

        public static int Puntos(string nivelClase) => nivelClase switch
        {
            "CRITICO" => PuntosCritico,
            "MAYOR" => PuntosMayor,
            "MENOR" => PuntosMenor,
            _ => 0,
        };

        // "ok" | "vacio" | "generico" | "multiple"
        public static string ClasificarOperador(string? operador)
        {
            var n = NormalizarClave(operador);
            if (n.Length == 0) return "vacio";
            if (OperadoresGenericos.Contains(n)) return "generico";
            if (n.Contains('/') || n.Contains(',') || n.Contains(';') || n.Contains('+') || n.Contains(" Y ") || n.Contains(" E "))
                return "multiple";
            return "ok";
        }

        public static bool TryParseFecha(string? s, out DateTime fecha)
        {
            fecha = default;
            if (string.IsNullOrWhiteSpace(s)) return false;
            var t = s.Trim();
            if (t.Length >= 10 && DateTime.TryParseExact(t[..10], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out fecha))
                return true;
            return DateTime.TryParse(t, CultureInfo.InvariantCulture, DateTimeStyles.None, out fecha);
        }

        private sealed record Fila(NcFila Src, string Nivel, string OpEstado, string OpClave, string? MaqClave, DateTime? Fecha, string? AreaClave = null)
        {
            public bool Evaluable => Fecha.HasValue && OpEstado == "ok" && (Nivel is "CRITICO" or "MAYOR" or "MENOR");
        }

        private static string Etiqueta(string? s) =>
            string.Join(' ', (s ?? "").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

        public static object Calcular(IEnumerable<NcFila> filas, EvaluacionFiltros f)
        {
            var universo = filas.Where(x => !x.Eliminado).Select(x =>
            {
                var tieneFecha = TryParseFecha(x.FechaFabricacion, out var d);
                var maq = NormalizarClave(x.Maquina);
                var area = NormalizarClave(x.Area);
                return new Fila(x, ClasificarNivel(x.Nivel), ClasificarOperador(x.Operador), NormalizarClave(x.Operador), maq.Length == 0 ? null : maq, tieneFecha ? d : null, area.Length == 0 ? null : area);
            }).ToList();

            // Etiquetas de presentación (primera escritura vista) por clave normalizada.
            var etiquetaOp = new Dictionary<string, string>();
            var etiquetaMq = new Dictionary<string, string>();
            var etiquetaArea = new Dictionary<string, string>();
            foreach (var r in universo)
            {
                if (r.AreaClave != null && !etiquetaArea.ContainsKey(r.AreaClave)) etiquetaArea[r.AreaClave] = Etiqueta(r.Src.Area);
                if (r.OpEstado == "ok" && !etiquetaOp.ContainsKey(r.OpClave)) etiquetaOp[r.OpClave] = Etiqueta(r.Src.Operador);
                if (r.MaqClave != null && !etiquetaMq.ContainsKey(r.MaqClave)) etiquetaMq[r.MaqClave] = Etiqueta(r.Src.Maquina);
            }

            var opFiltro = NormalizarClave(f.Operador);
            var mqFiltro = NormalizarClave(f.Maquina);
            var areaFiltro = NormalizarClave(f.Area);
            bool CumpleMaqOp(Fila r) =>
                (mqFiltro.Length == 0 || r.MaqClave == mqFiltro)
                && (areaFiltro.Length == 0 || r.AreaClave == areaFiltro)
                && (opFiltro.Length == 0 || (r.OpEstado == "ok" && r.OpClave == opFiltro));
            bool CumpleAnio(Fila r) => !f.Anio.HasValue || (r.Fecha.HasValue && r.Fecha.Value.Year == f.Anio.Value);
            bool CumpleMes(Fila r) => !f.Mes.HasValue || (r.Fecha.HasValue && r.Fecha.Value.Month == f.Mes.Value);
            var periodoActivo = f.Anio.HasValue || f.Mes.HasValue;

            var baseMaqOp = universo.Where(CumpleMaqOp).ToList();
            // Período: con filtro de período solo entran filas con fecha de fabricación dentro de él.
            var periodo = baseMaqOp.Where(r => CumpleAnio(r) && CumpleMes(r)).ToList();
            var evaluables = periodo.Where(r => r.Evaluable).ToList();

            // Sin fecha de fabricación: no se pueden ubicar en un mes. Se informan aparte, nunca se descartan en silencio.
            var sinFechaFueraDelPeriodo = periodoActivo ? baseMaqOp.Count(r => !r.Fecha.HasValue) : 0;

            static int Cnt(IEnumerable<Fila> q, string nivel) => q.Count(r => r.Nivel == nivel);

            var totales = new
            {
                registradas = periodo.Count,
                evaluables = evaluables.Count,
                excluidas = periodo.Count - evaluables.Count,
                sinOperadorIdentificable = periodo.Count(r => r.OpEstado != "ok"),
                sinMaquina = periodo.Count(r => r.MaqClave == null),
                sinFechaFabricacion = periodo.Count(r => !r.Fecha.HasValue),
                sinNivelClasificado = periodo.Count(r => r.Nivel is "SIN_NIVEL" or "NIVEL_OTRO"),
                criticas = Cnt(evaluables, "CRITICO"),
                mayores = Cnt(evaluables, "MAYOR"),
                menores = Cnt(evaluables, "MENOR"),
                puntos = evaluables.Sum(r => Puntos(r.Nivel)),
                puntosExcluidos = periodo.Where(r => !r.Evaluable).Sum(r => Puntos(r.Nivel)),
            };

            var porNivel = new[] { "CRITICO", "MAYOR", "MENOR" }.Select(n => new
            {
                nivel = n,
                registradas = Cnt(periodo, n),
                evaluables = Cnt(evaluables, n),
                puntos = Puntos(n) * Cnt(evaluables, n),
            }).ToList();

            // Evolución mensual: respeta año/máquina/operador pero NO el mes (contexto de tendencia).
            var porMes = baseMaqOp.Where(r => r.Fecha.HasValue && CumpleAnio(r))
                .GroupBy(r => r.Fecha!.Value.ToString("yyyy-MM", CultureInfo.InvariantCulture))
                .OrderBy(g => g.Key, StringComparer.Ordinal)
                .Select(g => new
                {
                    mes = g.Key,
                    registradas = g.Count(),
                    evaluables = g.Count(r => r.Evaluable),
                    excluidas = g.Count(r => !r.Evaluable),
                    puntos = g.Where(r => r.Evaluable).Sum(r => Puntos(r.Nivel)),
                }).ToList();

            var porMaquina = periodo
                .GroupBy(r => r.MaqClave ?? "")
                .Select(g => new
                {
                    maquina = g.Key.Length == 0 ? null : etiquetaMq[g.Key],
                    registradas = g.Count(),
                    evaluables = g.Count(r => r.Evaluable),
                    criticas = Cnt(g.Where(r => r.Evaluable), "CRITICO"),
                    mayores = Cnt(g.Where(r => r.Evaluable), "MAYOR"),
                    menores = Cnt(g.Where(r => r.Evaluable), "MENOR"),
                    puntos = g.Where(r => r.Evaluable).Sum(r => Puntos(r.Nivel)),
                })
                .OrderByDescending(x => x.registradas).ThenBy(x => x.maquina, StringComparer.OrdinalIgnoreCase).ToList();

            // Orden alfabético a propósito: el orden NO sugiere mejor/peor desempeño.
            var porOperador = evaluables
                .GroupBy(r => r.OpClave)
                .Select(g => new
                {
                    operador = etiquetaOp[g.Key],
                    evaluables = g.Count(),
                    criticas = Cnt(g, "CRITICO"),
                    mayores = Cnt(g, "MAYOR"),
                    menores = Cnt(g, "MENOR"),
                    puntos = g.Sum(r => Puntos(r.Nivel)),
                    maquinas = g.Select(r => r.MaqClave).Where(m => m != null).Distinct().Count(),
                    meses = g.Select(r => r.Fecha!.Value.ToString("yyyy-MM", CultureInfo.InvariantCulture)).Distinct().Count(),
                })
                .OrderBy(x => x.operador, StringComparer.OrdinalIgnoreCase).ToList();

            var advertencias = new List<object>();
            void Adv(string codigo, string texto, int n)
            {
                if (n > 0) advertencias.Add(new { codigo, texto, cantidad = n });
            }
            Adv("operador_no_identificado", "NC sin operador identificable (vacío, genérico o varios operadores): excluidas del conteo por operador.", totales.sinOperadorIdentificable);
            Adv("maquina_no_identificada", "NC sin máquina registrada.", totales.sinMaquina);
            Adv("sin_fecha_fabricacion", "NC sin fecha de fabricación: no se pueden ubicar en un mes y quedan excluidas.", totales.sinFechaFabricacion);
            Adv("sin_fecha_fuera_del_periodo", "Con el filtro de período activo hay NC sin fecha de fabricación que no pueden incluirse en ningún mes.", sinFechaFueraDelPeriodo);
            Adv("nivel_sin_clasificar", "NC con nivel vacío o no reconocido (no es Crítico/Mayor/Menor): excluidas, 0 puntos.", totales.sinNivelClasificado);
            Adv("atribucion_no_confirmada", "Operador declarado en la NC (texto libre) sin confirmación contra producción: no hay atribución confirmada, ningún operador queda penalizado.", evaluables.Count);
            var insuficiente = evaluables.Count < MinEvaluablesParaComparar;
            if (insuficiente)
                advertencias.Add(new
                {
                    codigo = "datos_insuficientes",
                    texto = $"Datos insuficientes para comparar (menos de {MinEvaluablesParaComparar} NC evaluables en el período). Las cifras son descriptivas y no permiten concluir sobre desempeño.",
                    cantidad = evaluables.Count,
                });

            var opciones = new
            {
                anios = universo.Where(r => r.Fecha.HasValue).Select(r => r.Fecha!.Value.Year).Distinct().OrderByDescending(a => a).ToList(),
                maquinas = etiquetaMq.Values.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList(),
                operadores = etiquetaOp.Values.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList(),
                areas = etiquetaArea.Values.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList(),
            };

            // Trazabilidad hacia la NC original: solo con un operador elegido (nunca la lista completa por persona).
            var detalle = opFiltro.Length == 0
                ? null
                : periodo.OrderByDescending(r => r.Fecha ?? DateTime.MinValue).ThenByDescending(r => r.Src.Id).Select(r => new
                {
                    id = r.Src.Id,
                    referencia = r.Src.Referencia,
                    nivel = r.Nivel,
                    maquina = r.MaqClave == null ? null : etiquetaMq[r.MaqClave],
                    area = r.AreaClave == null ? null : etiquetaArea[r.AreaClave],
                    fechaFabricacion = r.Fecha?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    evaluable = r.Evaluable,
                    puntos = r.Evaluable ? Puntos(r.Nivel) : 0,
                }).ToList();

            return new
            {
                ponderaciones = new { critico = PuntosCritico, mayor = PuntosMayor, menor = PuntosMenor, estado = "PROVISIONAL: pendiente de validación formal de Calidad" },
                umbralDatosSuficientes = MinEvaluablesParaComparar,
                datosInsuficientes = insuficiente,
                universoTotal = universo.Count,
                totales,
                porNivel,
                porMes,
                porMaquina,
                porOperador,
                advertencias,
                opciones,
                detalle,
            };
        }
    }
}
