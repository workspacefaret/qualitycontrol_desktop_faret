using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using R = QualityControlCenter.Modules.EvaluacionOperadores.FaretAtribucionFps;

namespace QualityControlCenter.Modules.EvaluacionOperadores
{
    public sealed record FiltrosFps(int? Anio, int? Mes, string? Maquina, string? Area, string? Turno, string? Operador);

    // Agrega los resultados de FaretAtribucionFps para la pantalla (Fase 34). Puro, sin red.
    // - Operadores ordenados alfabéticamente (sin ranking). Puntos PROVISIONALES solo de PNC confirmadas con una
    //   única persona; en las ambiguas se informa participación, nunca puntos.
    // - Con nivel VER los operadores se muestran con seudónimo (también como clave de filtro) y no se envía el
    //   nombre declarado en la PNC.
    public static class FaretEvaluacionFpsResumen
    {
        private const int MaxContexto = 40;

        public static object Construir(IReadOnlyList<R.Resultado> todos, FiltrosFps f, bool verNombres)
        {
            string Clave(long id) => verNombres ? id.ToString(CultureInfo.InvariantCulture) : R.Seudonimo(id);
            string Nombre(long id, string? n) => verNombres ? (string.IsNullOrWhiteSpace(n) ? $"Usuario FPS {id}" : n.Trim()) : R.Seudonimo(id);
            string Periodo(R.Resultado r) => EvaluacionOperadoresCalculator.TryParseFecha(r.FechaFabricacion, out var d) ? d.ToString("yyyy-MM") : "";
            string MaquinaDe(R.Resultado r) => r.MaquinaFps ?? (string.IsNullOrWhiteSpace(r.MaquinaPnc) ? "Sin máquina" : r.MaquinaPnc.Trim());
            string ProcesoDe(R.Resultado r) =>
                r.Evidencia.Select(s => s.Categoria).FirstOrDefault(c => !string.IsNullOrWhiteSpace(c))?.Trim()
                ?? (string.IsNullOrWhiteSpace(r.Area) ? "Sin proceso" : r.Area.Trim());
            IEnumerable<string> TurnosDe(R.Resultado r) => r.Evidencia.Select(s => R.Turno(s.Inicio)).Where(t => t != "").Distinct();

            // Opciones de filtro: siempre sobre el universo completo.
            var opciones = new
            {
                maquinas = todos.Select(MaquinaDe).Distinct().OrderBy(x => x).ToList(),
                areas = todos.Select(r => r.Area?.Trim()).Where(a => !string.IsNullOrEmpty(a)).Distinct().OrderBy(x => x).ToList(),
                turnos = new[] { "A", "B", "C" },
                periodos = todos.Select(Periodo).Where(p => p != "").Distinct().OrderBy(x => x).ToList(),
                operadores = todos.SelectMany(r => r.Operadores).GroupBy(o => o.id)
                    .Select(g => new { clave = Clave(g.Key), nombre = Nombre(g.Key, g.First().nombre) }).OrderBy(o => o.nombre).ToList(),
            };

            var lista = todos.Where(r =>
            {
                if (f.Anio.HasValue || f.Mes.HasValue)
                {
                    if (!EvaluacionOperadoresCalculator.TryParseFecha(r.FechaFabricacion, out var d)) return false;
                    if (f.Anio.HasValue && d.Year != f.Anio) return false;
                    if (f.Mes.HasValue && d.Month != f.Mes) return false;
                }
                if (!string.IsNullOrWhiteSpace(f.Maquina) && R.Norm(MaquinaDe(r)) != R.Norm(f.Maquina)) return false;
                if (!string.IsNullOrWhiteSpace(f.Area) && R.Norm(r.Area) != R.Norm(f.Area)) return false;
                if (!string.IsNullOrWhiteSpace(f.Turno) && !TurnosDe(r).Contains(f.Turno.Trim().ToUpperInvariant())) return false;
                if (!string.IsNullOrWhiteSpace(f.Operador) && !r.Operadores.Any(o => Clave(o.id) == f.Operador.Trim())) return false;
                return true;
            }).ToList();

            object Grupo(string k, IEnumerable<R.Resultado> g)
            {
                var l = g.ToList();
                return new
                {
                    clave = k, total = l.Count,
                    confirmadas = l.Count(x => x.Estado == R.Confirmada), probables = l.Count(x => x.Estado == R.Probable),
                    ambiguas = l.Count(x => x.Estado == R.Ambigua), discrepancias = l.Count(x => x.Estado == R.Discrepancia),
                    sinAtribucion = l.Count(x => x.Estado == R.SinAtribucion),
                };
            }

            object Sesion(R.SesionFps s) => new
            {
                recordKey = s.RecordKey, ot = s.OrdenTrabajo, idProceso = s.IdProceso, categoria = s.Categoria, proceso = s.NombreProceso,
                maquina = s.Maquina, maquinaDescripcion = s.MaquinaDescripcion,
                operadorClave = s.IdOperador.HasValue ? Clave(s.IdOperador.Value) : null,
                operador = s.IdOperador.HasValue ? Nombre(s.IdOperador.Value, s.Operador) : null,
                inicio = s.Inicio?.ToString("yyyy-MM-dd HH:mm"), fin = s.Fin?.ToString("yyyy-MM-dd HH:mm"),
                cantidad = s.Cantidad, turno = R.Turno(s.Inicio),
            };

            var operadores = lista.SelectMany(r => r.Operadores.Select(o => (o, r))).GroupBy(x => x.o.id)
                .Select(g =>
                {
                    var conf = g.Where(x => x.r.Estado == R.Confirmada && x.r.Operadores.Count == 1).Select(x => x.r).ToList();
                    return new
                    {
                        clave = Clave(g.Key), nombre = Nombre(g.Key, g.First().o.nombre),
                        confirmadas = conf.Count,
                        criticas = conf.Count(r => r.Nivel == "CRITICO"), mayores = conf.Count(r => r.Nivel == "MAYOR"), menores = conf.Count(r => r.Nivel == "MENOR"),
                        puntosProvisionales = conf.Sum(r => r.PuntosProvisionales),
                        probables = g.Count(x => x.r.Estado == R.Probable),
                        ambiguas = g.Count(x => x.r.Estado == R.Ambigua),
                        maquinas = g.Select(x => MaquinaDe(x.r)).Distinct().OrderBy(m => m).ToList(),
                        declaradoNoCoincide = g.Count(x => x.r.Declarado == "NO_COINCIDE"),
                    };
                }).OrderBy(o => o.nombre).ToList();

            var porEstado = R.Estados.ToDictionary(e => e, e => lista.Count(r => r.Estado == e));
            var declarado = lista.GroupBy(r => r.Declarado).ToDictionary(g => g.Key, g => g.Count());

            return new
            {
                totales = new
                {
                    registradas = todos.Count, filtradas = lista.Count, porEstado, declarado,
                    sinFechaFabricacion = lista.Count(r => r.EstadoFecha == "SIN_FECHA"),
                    sesionesSimultaneas = lista.Count(r => r.Simultaneas), cambioTurno = lista.Count(r => r.CambioTurno),
                    maquinaEquivalente = lista.Count(r => r.EstadoMaquina == "EQUIVALENTE"),
                    puntosProvisionales = lista.Sum(r => r.PuntosProvisionales),
                    operadoresFps = operadores.Count,
                },
                operadores,
                porMaquina = lista.GroupBy(MaquinaDe).OrderByDescending(g => g.Count()).ThenBy(g => g.Key).Select(g => Grupo(g.Key, g)).ToList(),
                porProceso = lista.GroupBy(ProcesoDe).OrderByDescending(g => g.Count()).ThenBy(g => g.Key).Select(g => Grupo(g.Key, g)).ToList(),
                porPeriodo = lista.GroupBy(r => Periodo(r) is "" ? "Sin fecha" : Periodo(r)).OrderBy(g => g.Key).Select(g => Grupo(g.Key, g)).ToList(),
                porTurno = lista.SelectMany(r => (TurnosDe(r).Any() ? TurnosDe(r) : new[] { "Sin sesión" }).Select(t => (t, r)))
                    .GroupBy(x => x.t).OrderBy(g => g.Key).Select(g => Grupo(g.Key, g.Select(x => x.r))).ToList(),
                pnc = lista.OrderBy(r => r.Id).Select(r => new
                {
                    id = r.Id, npNv = r.NpNv, nivel = r.Nivel, maquinaPnc = r.MaquinaPnc, area = r.Area, fechaFabricacion = r.FechaFabricacion,
                    estado = r.Estado, motivos = r.Motivos, documento = r.Documento, ots = r.Ots,
                    estadoMaquina = r.EstadoMaquina, maquinaFps = r.MaquinaFps, estadoFecha = r.EstadoFecha,
                    operadores = r.Operadores.Select(o => new { clave = Clave(o.id), nombre = Nombre(o.id, o.nombre) }).ToList(),
                    simultaneas = r.Simultaneas, cambioTurno = r.CambioTurno,
                    declarado = r.Declarado, operadorDeclarado = verNombres ? r.OperadorDeclarado : null,
                    puntosProvisionales = r.PuntosProvisionales, responsabilidad = "PENDIENTE_CALIDAD",
                    evidencia = r.Evidencia.Select(Sesion).ToList(),
                    contexto = r.Contexto.OrderBy(s => s.Inicio).Take(MaxContexto).Select(Sesion).ToList(),
                    contextoTotal = r.Contexto.Count,
                }).ToList(),
                opciones,
            };
        }
    }
}
