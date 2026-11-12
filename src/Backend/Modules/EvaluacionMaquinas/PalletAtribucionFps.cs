using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace QualityControlCenter.Modules.EvaluacionMaquinas
{
    // Clasificador PURO (sin E/S) que relaciona una inspección Pallet/Papel con la sesión FPS de su máquina a esa hora.
    // Las inspecciones Pallet/Papel NO tienen NP/NV/OT: la única llave es máquina (equivalencia verificada) + fecha/hora.
    // Nunca atribuye por máquina sola ni por NP. Ante cualquier ambigüedad NO atribuye (clase Probable o SinIdentificacion).
    //
    // Reglas (mismo criterio que Evaluación por Operador para sesiones largas):
    //  Confiable:     máquina verificada + sesión(es) de <= 16 h que cubren la hora, un solo operador, sin sesiones largas
    //                 solapadas, y ningún OTRO operador con sesión que empiece/termine a <= 30 min (cambio de turno).
    //  Probable:      evidencia parcial: solo sesión prolongada (> 16 h), varios operadores a la vez, cambio de operador
    //                 muy cerca, sesión abierta (sin término) razonable, o sesión cercana (±2 h) fuera de ventana.
    //  SinIdentificacion: sin máquina / sin fecha-hora / máquina sin equivalencia verificada / sin sesiones / sin sesión cercana.
    // Zona horaria: el registro Pallet se guarda con GETDATE() del servidor de calidad y las sesiones llegan en texto local
    // (CONVERT 120 en fps-api); se asume el mismo reloj local. Es un supuesto a confirmar con datos reales (ver informe).
    public enum ClaseAtribucion { Confiable, Probable, SinIdentificacion }

    public record SesionFps(int IdMaquina, string IdOperador, DateTime Inicio, DateTime? Fin);

    public record RegistroPallet(int Id, string? Maquina, string? Fecha, string? Hora);

    public record ResultadoAtribucion(int Id, ClaseAtribucion Clase, string Motivo, string? IdOperador);

    public static class PalletAtribucionFps
    {
        public const double MaxSesionHoras = 16;
        public const double ToleranciaHoras = 2;
        public const double CambioOperadorMinutos = 30;

        public static ResultadoAtribucion Clasificar(RegistroPallet r, IReadOnlyDictionary<int, List<SesionFps>> sesionesPorMaquina)
        {
            if (string.IsNullOrWhiteSpace(r.Maquina)) return Sin(r, "sin_maquina");
            if (!TryParseMomento(r.Fecha, r.Hora, out var t)) return Sin(r, "sin_fecha_hora");
            var id = PalletMaquinaEquivalencias.ResolverVerificada(r.Maquina);
            if (id is null) return Sin(r, "maquina_sin_equivalencia_verificada");
            if (!sesionesPorMaquina.TryGetValue(id.Value, out var sesiones) || sesiones.Count == 0)
                return Sin(r, "maquina_sin_sesiones_fps");

            var largo = TimeSpan.FromHours(MaxSesionHoras);
            // Sesión abierta (sin término): solo se considera si empezó hace <= 16 h; si no, es un dato incompleto.
            var cubren = sesiones.Where(s => s.Inicio <= t && (s.Fin is null ? t - s.Inicio <= largo : t <= s.Fin)).ToList();
            var cortas = cubren.Where(s => s.Fin is not null && s.Fin - s.Inicio <= largo).ToList();
            var abiertas = cubren.Where(s => s.Fin is null).ToList();
            var largas = cubren.Where(s => s.Fin is not null && s.Fin - s.Inicio > largo).ToList();

            if (cortas.Count > 0)
            {
                var ops = cortas.Select(s => s.IdOperador).Distinct().ToList();
                if (ops.Count > 1) return Prob(r, "varios_operadores_simultaneos");
                if (largas.Count > 0 || abiertas.Any(a => a.IdOperador != ops[0])) return Prob(r, "sesion_corta_solapada_con_larga_o_abierta");
                if (OtroOperadorCerca(sesiones, ops[0], t)) return Prob(r, "cambio_de_operador_cercano");
                return new ResultadoAtribucion(r.Id, ClaseAtribucion.Confiable,
                    cortas.Count == 1 ? "sesion_unica_compatible" : "sesiones_solapadas_mismo_operador", ops[0]);
            }
            if (largas.Count > 0) return Prob(r, "solo_sesion_prolongada");
            if (abiertas.Count > 0) return Prob(r, "sesion_sin_termino");

            var tol = TimeSpan.FromHours(ToleranciaHoras);
            if (sesiones.Any(s => s.Inicio - tol <= t && t <= (s.Fin ?? s.Inicio) + tol))
                return Prob(r, "sesion_cercana_fuera_de_ventana");
            return Sin(r, "sin_sesion_en_la_hora");
        }

        // ¿Algún OTRO operador inicia o termina una sesión a <= 30 min de la inspección? (cambio de turno)
        private static bool OtroOperadorCerca(List<SesionFps> sesiones, string operador, DateTime t)
        {
            var w = TimeSpan.FromMinutes(CambioOperadorMinutos);
            return sesiones.Any(s => s.IdOperador != operador
                && (Math.Abs((s.Inicio - t).Ticks) <= w.Ticks || (s.Fin is not null && Math.Abs((s.Fin.Value - t).Ticks) <= w.Ticks)));
        }

        public static bool TryParseMomento(string? fecha, string? hora, out DateTime t)
        {
            t = default;
            var f = (fecha ?? "").Trim();
            if (f.Length < 10) return false;
            f = f[..10];
            var h = (hora ?? "").Trim();
            var tIdx = h.IndexOf('T');
            if (tIdx >= 0) h = h[(tIdx + 1)..];
            h = h.Replace("Z", "");
            if (h.Length >= 8) h = h[..8]; else if (h.Length == 5) h += ":00"; else h = "00:00:00";
            return DateTime.TryParseExact($"{f} {h}", "yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture, DateTimeStyles.None, out t);
        }

        public static Dictionary<int, List<SesionFps>> AgruparPorMaquina(IEnumerable<SesionFps> sesiones) =>
            sesiones.GroupBy(s => s.IdMaquina).ToDictionary(g => g.Key, g => g.OrderBy(s => s.Inicio).ToList());

        private static ResultadoAtribucion Sin(RegistroPallet r, string motivo) => new(r.Id, ClaseAtribucion.SinIdentificacion, motivo, null);
        private static ResultadoAtribucion Prob(RegistroPallet r, string motivo) => new(r.Id, ClaseAtribucion.Probable, motivo, null);

        // ── Cobertura agregada (sin nombres ni identificadores de operadores) ──
        public record Cobertura(int Total, int Confiable, int Probable, int Sin)
        {
            public double PctConfiable => Pct(Confiable);
            public double PctProbable => Pct(Probable);
            public double PctSin => Pct(Sin);
            private double Pct(int n) => Total == 0 ? 0 : Math.Round(100.0 * n / Total, 1);
        }

        public static Cobertura Contar(IEnumerable<ResultadoAtribucion> rs)
        {
            var l = rs.ToList();
            return new Cobertura(l.Count,
                l.Count(x => x.Clase == ClaseAtribucion.Confiable),
                l.Count(x => x.Clase == ClaseAtribucion.Probable),
                l.Count(x => x.Clase == ClaseAtribucion.SinIdentificacion));
        }
    }
}
