using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using QualityControlCenter.Modules.EvaluacionOperadores;

namespace QualityControlCenter.Modules.EvaluacionMaquinas
{
    // Defecto registrado en una inspección. Criticidad null = el registro no la trae (histórico anterior al catálogo).
    public record DefectoInsp(string? Nombre, string? Criticidad);

    // Fila mínima de una inspección (cualquier origen) que necesita el cálculo.
    //  - Origen: tipo de inspección ("Calidad", "Pallet/Papel", ...). Lo define el adaptador de cada fuente.
    //  - AdmitePuntos: la fuente registra criticidad por defecto (Calidad). Pallet/Papel no: solo cumple / no cumple.
    //  - OperadorMaquina: quien operaba la máquina (declarado en la inspección). Null si la fuente no lo registra.
    //  - Inspector: quien inspeccionó. Persona distinta; nunca se penaliza ni se mezcla con el operador.
    //  - NoCumple: cantidad de controles que no cumplen (fuentes tipo checklist). Null si no aplica.
    public record InspeccionFila(
        int Id,
        string Origen,
        bool AdmitePuntos,
        string? Maquina,
        string? OperadorMaquina,
        string? Inspector,
        string? Area,
        string? Fecha,
        bool PresentaDefectos,
        IReadOnlyList<DefectoInsp>? Defectos = null,
        int? NoCumple = null,
        string? Hora = null); // hora de registro (solo Pallet/Papel; la usa la auditoría de cobertura FPS, no el cálculo)

    public record EvaluacionMaquinasFiltros(int? Anio, int? Mes, string? Maquina, string? Operador, string? Area = null, string? Origen = null);

    // Cálculo puro (sin E/S) de la Evaluación por Máquina. Mismas ponderaciones PROVISIONALES (10/5/1) y mismo umbral
    // provisional (30) que la Evaluación por Operador. Sin nota, porcentaje global ni ranking.
    //
    // Cada inspección cae en UNA categoría, para no confundir "sin defectos" con "no evaluable":
    //   conforme        → sin defectos (evaluable con 0 puntos si la fuente admite puntos)
    //   no conforme     → con defectos
    //   evaluable       → tiene fecha y máquina, la fuente admite puntos y su criticidad está completa
    //                     (conforme, o no conforme con TODOS sus defectos clasificados Crítico/Mayor/Menor)
    //   no evaluable    → el resto; nunca suma 0 puntos "artificiales", se informa el motivo.
    public static class EvaluacionMaquinasCalculator
    {
        public const int MinEvaluablesParaComparar = EvaluacionOperadoresCalculator.MinEvaluablesParaComparar;

        private sealed record Fila(InspeccionFila Src, DateTime? Fecha, string? MaqClave, string OpEstado, string OpClave, string? AreaClave, string OrigenClave,
            bool Conforme, int Criticos, int Mayores, int Menores, int DefectosSinCriticidad, int DefectosTotal, string? Motivo)
        {
            public bool Evaluable => Motivo == null;
            public int Puntos => Criticos * EvaluacionOperadoresCalculator.PuntosCritico + Mayores * EvaluacionOperadoresCalculator.PuntosMayor + Menores * EvaluacionOperadoresCalculator.PuntosMenor;
            public bool OperadorOk => OpEstado == "ok";
        }

        private static string Etiqueta(string? s) =>
            string.Join(' ', (s ?? "").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

        private static Fila Clasificar(InspeccionFila x)
        {
            var tieneFecha = EvaluacionOperadoresCalculator.TryParseFecha(x.Fecha, out var d);
            var maq = EvaluacionOperadoresCalculator.NormalizarClave(x.Maquina);
            var area = EvaluacionOperadoresCalculator.NormalizarClave(x.Area);
            var defectos = x.Defectos ?? Array.Empty<DefectoInsp>();
            int c = 0, m = 0, n = 0, sin = 0;
            foreach (var df in defectos)
            {
                switch (EvaluacionOperadoresCalculator.ClasificarNivel(df.Criticidad))
                {
                    case "CRITICO": c++; break;
                    case "MAYOR": m++; break;
                    case "MENOR": n++; break;
                    default: sin++; break;
                }
            }
            var noConforme = x.PresentaDefectos || defectos.Count > 0 || (x.NoCumple ?? 0) > 0;

            string? motivo = null;
            if (!tieneFecha) motivo = "sin_fecha";
            else if (maq.Length == 0) motivo = "sin_maquina";
            else if (!x.AdmitePuntos) motivo = "origen_sin_criticidad";
            else if (noConforme && (defectos.Count == 0 || sin > 0)) motivo = "criticidad_incompleta";

            return new Fila(
                x, tieneFecha ? d : null, maq.Length == 0 ? null : maq,
                x.OperadorMaquina == null ? "vacio" : EvaluacionOperadoresCalculator.ClasificarOperador(x.OperadorMaquina),
                EvaluacionOperadoresCalculator.NormalizarClave(x.OperadorMaquina),
                area.Length == 0 ? null : area,
                EvaluacionOperadoresCalculator.NormalizarClave(x.Origen),
                !noConforme, c, m, n, sin, defectos.Count, motivo);
        }

        public static object Calcular(IEnumerable<InspeccionFila> filas, EvaluacionMaquinasFiltros f)
        {
            // Un mismo id dentro de un mismo origen se cuenta una sola vez (protege ante páginas solapadas).
            var universo = filas
                .GroupBy(x => (x.Origen, x.Id))
                .Select(g => g.First())
                .Select(Clasificar)
                .ToList();

            var etiquetaMq = new Dictionary<string, string>();
            var etiquetaOp = new Dictionary<string, string>();
            var etiquetaArea = new Dictionary<string, string>();
            var etiquetaOrigen = new Dictionary<string, string>();
            foreach (var r in universo)
            {
                if (r.MaqClave != null && !etiquetaMq.ContainsKey(r.MaqClave)) etiquetaMq[r.MaqClave] = Etiqueta(r.Src.Maquina);
                if (r.OperadorOk && !etiquetaOp.ContainsKey(r.OpClave)) etiquetaOp[r.OpClave] = Etiqueta(r.Src.OperadorMaquina);
                if (r.AreaClave != null && !etiquetaArea.ContainsKey(r.AreaClave)) etiquetaArea[r.AreaClave] = Etiqueta(r.Src.Area);
                if (r.OrigenClave.Length > 0 && !etiquetaOrigen.ContainsKey(r.OrigenClave)) etiquetaOrigen[r.OrigenClave] = Etiqueta(r.Src.Origen);
            }

            var mqF = EvaluacionOperadoresCalculator.NormalizarClave(f.Maquina);
            var opF = EvaluacionOperadoresCalculator.NormalizarClave(f.Operador);
            var areaF = EvaluacionOperadoresCalculator.NormalizarClave(f.Area);
            var origenF = EvaluacionOperadoresCalculator.NormalizarClave(f.Origen);
            bool CumpleBase(Fila r) =>
                (mqF.Length == 0 || r.MaqClave == mqF)
                && (areaF.Length == 0 || r.AreaClave == areaF)
                && (origenF.Length == 0 || r.OrigenClave == origenF)
                && (opF.Length == 0 || (r.OperadorOk && r.OpClave == opF))
                && (!f.Anio.HasValue || (r.Fecha.HasValue && r.Fecha.Value.Year == f.Anio.Value));
            bool CumpleMes(Fila r) => !f.Mes.HasValue || (r.Fecha.HasValue && r.Fecha.Value.Month == f.Mes.Value);

            var baseFiltrada = universo.Where(CumpleBase).ToList();
            var periodo = baseFiltrada.Where(CumpleMes).ToList();
            var evaluables = periodo.Where(r => r.Evaluable).ToList();

            static string Mes(DateTime d) => d.ToString("yyyy-MM", CultureInfo.InvariantCulture);
            static decimal? PorInsp(int puntos, int evaluables) => evaluables == 0 ? null : Math.Round((decimal)puntos / evaluables, 2);

            // Resumen reutilizable por grupo (máquina, operador, origen, mes...).
            object Resumen(IEnumerable<Fila> g)
            {
                var l = g.ToList();
                var ev = l.Where(r => r.Evaluable).ToList();
                var puntos = ev.Sum(r => r.Puntos);
                return new
                {
                    inspecciones = l.Count,
                    conformes = l.Count(r => r.Conforme),
                    noConformes = l.Count(r => !r.Conforme),
                    evaluables = ev.Count,
                    noEvaluables = l.Count - ev.Count,
                    criticas = ev.Sum(r => r.Criticos),
                    mayores = ev.Sum(r => r.Mayores),
                    menores = ev.Sum(r => r.Menores),
                    puntos,
                    puntosPorInspeccion = PorInsp(puntos, ev.Count),
                    datosInsuficientes = ev.Count < MinEvaluablesParaComparar,
                };
            }

            var totales = new
            {
                inspecciones = periodo.Count,
                conformes = periodo.Count(r => r.Conforme),
                noConformes = periodo.Count(r => !r.Conforme),
                evaluables = evaluables.Count,
                noEvaluables = periodo.Count - evaluables.Count,
                noEvaluablesPorMotivo = new
                {
                    sinFecha = periodo.Count(r => r.Motivo == "sin_fecha"),
                    sinMaquina = periodo.Count(r => r.Motivo == "sin_maquina"),
                    origenSinCriticidad = periodo.Count(r => r.Motivo == "origen_sin_criticidad"),
                    criticidadIncompleta = periodo.Count(r => r.Motivo == "criticidad_incompleta"),
                },
                defectosRegistrados = periodo.Sum(r => r.DefectosTotal),
                defectosSinCriticidad = periodo.Sum(r => r.DefectosSinCriticidad),
                criticas = evaluables.Sum(r => r.Criticos),
                mayores = evaluables.Sum(r => r.Mayores),
                menores = evaluables.Sum(r => r.Menores),
                puntos = evaluables.Sum(r => r.Puntos),
                puntosPorInspeccion = PorInsp(evaluables.Sum(r => r.Puntos), evaluables.Count),
                sinOperadorIdentificado = periodo.Count(r => !r.OperadorOk),
            };

            var porOrigen = periodo.GroupBy(r => r.OrigenClave)
                .Select(g => new
                {
                    origen = etiquetaOrigen.GetValueOrDefault(g.Key, g.Key),
                    admitePuntos = g.First().Src.AdmitePuntos,
                    registraOperador = g.Any(r => r.Src.OperadorMaquina != null),
                    resumen = Resumen(g),
                })
                .OrderBy(x => x.origen, StringComparer.OrdinalIgnoreCase).ToList();

            var porArea = periodo.GroupBy(r => r.AreaClave ?? "")
                .Select(g => new { area = g.Key.Length == 0 ? null : etiquetaArea[g.Key], resumen = Resumen(g) })
                .OrderBy(x => x.area, StringComparer.OrdinalIgnoreCase).ToList();

            // Orden alfabético a propósito: el orden NO sugiere mejor/peor máquina ni operador.
            var porMaquina = periodo.GroupBy(r => r.MaqClave ?? "")
                .Select(g => new
                {
                    maquina = g.Key.Length == 0 ? null : etiquetaMq[g.Key],
                    resumen = Resumen(g),
                    operadores = g.Where(r => r.OperadorOk).Select(r => r.OpClave).Distinct().Count(),
                    inspectores = g.Select(r => EvaluacionOperadoresCalculator.NormalizarClave(r.Src.Inspector)).Where(s => s.Length > 0).Distinct().Count(),
                    sinOperadorIdentificado = g.Count(r => !r.OperadorOk),
                    origenes = g.Select(r => etiquetaOrigen.GetValueOrDefault(r.OrigenClave, r.OrigenClave)).Distinct().OrderBy(s => s, StringComparer.OrdinalIgnoreCase).ToList(),
                })
                .OrderBy(x => x.maquina, StringComparer.OrdinalIgnoreCase).ToList();

            // Relación central máquina × operador de máquina: solo inspecciones con operador identificable.
            var porMaquinaOperador = periodo.Where(r => r.OperadorOk && r.MaqClave != null)
                .GroupBy(r => (r.MaqClave, r.OpClave))
                .Select(g => new
                {
                    maquina = etiquetaMq[g.Key.MaqClave!],
                    operador = etiquetaOp[g.Key.OpClave],
                    resumen = Resumen(g),
                    origenes = g.Select(r => etiquetaOrigen.GetValueOrDefault(r.OrigenClave, r.OrigenClave)).Distinct().OrderBy(s => s, StringComparer.OrdinalIgnoreCase).ToList(),
                })
                .OrderBy(x => x.maquina, StringComparer.OrdinalIgnoreCase).ThenBy(x => x.operador, StringComparer.OrdinalIgnoreCase).ToList();

            // Evolución mensual: respeta los filtros salvo el mes (contexto de tendencia).
            var porMes = baseFiltrada.Where(r => r.Fecha.HasValue)
                .GroupBy(r => Mes(r.Fecha!.Value))
                .OrderBy(g => g.Key, StringComparer.Ordinal)
                .Select(g => new { mes = g.Key, resumen = Resumen(g) }).ToList();

            var advertencias = new List<object>();
            void Adv(string codigo, string texto, int n)
            {
                if (n > 0) advertencias.Add(new { codigo, texto, cantidad = n });
            }
            Adv("sin_fecha", "Inspecciones sin fecha válida: no se pueden ubicar en un período y no son evaluables.", totales.noEvaluablesPorMotivo.sinFecha);
            Adv("sin_maquina", "Inspecciones sin máquina registrada: no se pueden asignar a ninguna máquina y no son evaluables.", totales.noEvaluablesPorMotivo.sinMaquina);
            Adv("origen_sin_criticidad", "Inspecciones de orígenes que no registran criticidad por defecto (p. ej. Pallet/Papel): se cuentan como conformes / no conformes, pero no tienen puntaje.", totales.noEvaluablesPorMotivo.origenSinCriticidad);
            Adv("criticidad_incompleta", "Inspecciones con defectos sin criticidad (registros anteriores al catálogo de eventos o sin detalle): no son evaluables. No se les asigna 0 puntos.", totales.noEvaluablesPorMotivo.criticidadIncompleta);
            Adv("operador_no_identificado", "Inspecciones sin operador de máquina identificable (vacío, genérico, varios o fuente que no lo registra): cuentan para la máquina pero no para ningún operador.", totales.sinOperadorIdentificado);
            Adv("atribucion_no_confirmada", "El operador de máquina es el declarado en la inspección (texto libre), sin confirmación contra producción. Ningún operador queda penalizado ni se le atribuyen defectos de forma definitiva.", evaluables.Count(r => r.OperadorOk));
            var insuficiente = evaluables.Count < MinEvaluablesParaComparar;
            if (insuficiente)
                advertencias.Add(new
                {
                    codigo = "datos_insuficientes",
                    texto = $"Datos insuficientes para comparar (menos de {MinEvaluablesParaComparar} inspecciones evaluables en el período). Las cifras son descriptivas y no permiten concluir.",
                    cantidad = evaluables.Count,
                });

            var opciones = new
            {
                anios = universo.Where(r => r.Fecha.HasValue).Select(r => r.Fecha!.Value.Year).Distinct().OrderByDescending(a => a).ToList(),
                maquinas = etiquetaMq.Values.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList(),
                operadores = etiquetaOp.Values.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList(),
                areas = etiquetaArea.Values.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList(),
                origenes = etiquetaOrigen.Values.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList(),
            };

            // Trazabilidad hacia la inspección original: solo con una máquina elegida (nunca la lista completa por persona).
            var detalle = mqF.Length == 0
                ? null
                : periodo.OrderByDescending(r => r.Fecha ?? DateTime.MinValue).ThenByDescending(r => r.Src.Id).Select(r => new
                {
                    id = r.Src.Id,
                    origen = Etiqueta(r.Src.Origen),
                    fecha = r.Fecha?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    area = r.AreaClave == null ? null : etiquetaArea[r.AreaClave],
                    operadorMaquina = r.OperadorOk ? etiquetaOp[r.OpClave] : null,
                    inspector = string.IsNullOrWhiteSpace(r.Src.Inspector) ? null : Etiqueta(r.Src.Inspector),
                    conforme = r.Conforme,
                    defectos = r.DefectosTotal,
                    evaluable = r.Evaluable,
                    motivoNoEvaluable = r.Motivo,
                    criticas = r.Criticos,
                    mayores = r.Mayores,
                    menores = r.Menores,
                    puntos = r.Evaluable ? r.Puntos : (int?)null,
                }).ToList();

            return new
            {
                ponderaciones = new { critico = EvaluacionOperadoresCalculator.PuntosCritico, mayor = EvaluacionOperadoresCalculator.PuntosMayor, menor = EvaluacionOperadoresCalculator.PuntosMenor, estado = "PROVISIONAL: pendiente de validación formal de Calidad" },
                umbralDatosSuficientes = MinEvaluablesParaComparar,
                datosInsuficientes = insuficiente,
                universoTotal = universo.Count,
                totales,
                porOrigen,
                porArea,
                porMaquina,
                porMaquinaOperador,
                porMes,
                advertencias,
                opciones,
                detalle,
            };
        }
    }
}
