using System;
using System.Collections.Generic;
using System.Linq;

namespace QualityControlCenter.Modules.EvaluacionMaquinas
{
    // Equivalencias entre las máquinas del formulario Pallet/Papel (catálogo CalidadFaretCatalog.maquinasPorArea de la app móvil)
    // y el catálogo de FPS (ZZZListaMaquina.aplatz_id). SOLO las `Verificada = true` se usan para atribuir: una coincidencia
    // aproximada nunca se acepta sola. Las pendientes quedan documentadas aquí hasta que una persona las confirme.
    //
    // Criterio de "verificada": el nombre del formulario es IGUAL al nombre `bez` del catálogo FPS (ignorando mayúsculas y
    // espacios repetidos). Cualquier otra diferencia (ortografía, orden, sufijos, numeración, puntuación) = pendiente.
    public record EquivalenciaMaquina(string NombrePallet, int AplatzId, string NombreFps, bool Verificada, string? Nota = null);

    public static class PalletMaquinaEquivalencias
    {
        public static readonly IReadOnlyList<EquivalenciaMaquina> Todas = new List<EquivalenciaMaquina>
        {
            // ── Verificadas (nombre idéntico) ──
            new("AQUA 120 STEINEMANN", 37, "AQUA 120 STEINEMANN", true),
            new("KBA 145 / 164", 36, "KBA 145 / 164", true),
            new("KBA 2", 90, "KBA 2", true),
            new("XL - 2", 54, "XL - 2", true),
            new("XL - 3", 55, "XL - 3", true),
            new("SPERIA FOILMASTER 104", 29, "SPERIA FOILMASTER 104", true),
            new("BOBST 104 - 1", 3, "BOBST 104 - 1", true),
            new("BOBST 104 - 2", 4, "BOBST 104 - 2", true),
            new("BOBST 106 - 1", 5, "BOBST 106 - 1", true),
            new("BOBST 106 - 2", 6, "BOBST 106 - 2", true),
            new("IBERICA KBA 144 - 1", 32, "IBERICA KBA 144 - 1", true),
            new("IBERICA KBA 144 - 2", 33, "IBERICA KBA 144 - 2", true),
            new("ALPINA 110", 1, "ALPINA 110", true),
            new("DIANA 3", 15, "DIANA 3", true),
            new("DIANA 5", 17, "DIANA 5", true),
            new("DIANA 7", 19, "DIANA 7", true),
            new("DIANA EXPERFOLD", 20, "DIANA EXPERFOLD", true),
            new("DIANA PRO 1", 13, "DIANA PRO 1", true),
            new("DIANA PRO 2", 14, "DIANA PRO 2", true),
            new("DIANA PRO 3", 73, "DIANA PRO 3", true),
            new("FOLLETOS TI 36/4", 22, "FOLLETOS TI 36/4", true),
            new("FOLLETOS TI 36/6", 23, "FOLLETOS TI 36/6", true),

            // ── PENDIENTES de confirmación humana (NO se usan para atribuir) ──
            new("SIRYUS", 86, "SYRIUS STEINEMANN", false, "Ortografía distinta (SIRYUS/SYRIUS) y falta 'STEINEMANN'"),
            new("APOLLO DIMENSIONADORA", 12, "DIMENSIONADORA APOLO", false, "Orden de palabras y ortografía (APOLLO/APOLO)"),
            new("DIMENSIONADORA CHINA (EUROPA)", 91, "DIMENSIONADORA CHINA (EUR)", false, "Sufijo (EUROPA/EUR)"),
            new("GUILLOTINA 1 POLAR 137", 30, "GUILLOTINA POLAR 137 XT", false, "Numeración '1' inexistente en FPS y sufijo XT"),
            new("GUILLOTINA 2 POLAR 155", 99, "GUILLOTINA POLAR 155", false, "Numeración '2' inexistente en FPS"),
            new("SM 74", 47, "SM 74 - ZL", false, "Nombre parcial"),
            new("FOLIA 2", 92, "FOLIA2", false, "Espaciado (FOLIA 2/FOLIA2); existe también FOLIA SBD 1/2"),
            new("SAKURAI", 45, "SAKURAI.", false, "Punto final en FPS"),
            new("CD 102 4-L", 9, "CD 102 4 -L", false, "Espaciado"),
        };

        public static string Normalizar(string? s) =>
            string.Join(" ", (s ?? "").Trim().ToUpperInvariant().Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries));

        // aplatz_id solo si la máquina tiene una equivalencia VERIFICADA (comparación exacta tras normalizar espacios/mayúsculas).
        public static int? ResolverVerificada(string? nombrePallet)
        {
            var clave = Normalizar(nombrePallet);
            if (clave.Length == 0) return null;
            var e = Todas.FirstOrDefault(x => x.Verificada && Normalizar(x.NombrePallet) == clave);
            return e?.AplatzId;
        }

        public static IEnumerable<int> IdsVerificados => Todas.Where(x => x.Verificada).Select(x => x.AplatzId).Distinct();
    }
}
