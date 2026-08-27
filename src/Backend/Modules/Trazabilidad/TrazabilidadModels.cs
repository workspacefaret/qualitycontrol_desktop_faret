using System;
using System.Collections.Generic;

namespace QualityControlCenter.Modules.Trazabilidad
{
    // Espejo del schema "Proceso" de GET /api/plan/vista-planificacion (Programa de Producción).
    // Una fila = un proceso planificable de la NP (Sección_Plan2/Recurso_Plan/Estatus_Recurso).
    public class ProcesoPlanDto
    {
        public long Id { get; set; }
        public string Np { get; set; } = "";
        public string NvInn { get; set; } = "";
        public decimal Cant { get; set; }
        public string? Ent { get; set; }
        public string Sec { get; set; } = "";
        public string Rec { get; set; } = "";
        public string Est { get; set; } = "";
        public string Item { get; set; } = "";
        public string ItemName { get; set; } = "";
        public string Cli { get; set; } = "";
        public string Proc { get; set; } = "";
        public decimal CantProd { get; set; }
        public decimal? Vel { get; set; }
        public int? LeadDias { get; set; }

        // Materiales reales (Tipo='INSUMO' en FPS) asignados a este proceso — Id coincide con
        // Id_Proceso en FPS_PRODUCCION, se cruza en TrazabilidadService tras traer los procesos.
        public List<MaterialInsumoDto> Materiales { get; set; } = new();
    }

    // Fila de dbo.ZZZMateriasPrimasOT (Tipo='INSUMO') en FPS_PRODUCCION, vía fps-api. El material
    // real consumido en el proceso (bobina/tinta/barniz/etc.), no el WIP ni el recurso/máquina.
    public class MaterialInsumoDto
    {
        public string IdProceso { get; set; } = "";
        public string ItemCode { get; set; } = "";
        public string ItemName { get; set; } = "";
    }

    // Fila de registro_paletizado.palets (LogisticControlCenter, paletizado administrado por
    // Belinda) — mismo servidor MySQL que calidad, base distinta.
    public class PaletTrazabilidadDto
    {
        public string IdPalet { get; set; } = "";
        public DateTime? Fecha { get; set; }
        public string Planta { get; set; } = "";
        public string NpCliente { get; set; } = "";
        public string NotaVentaInnpack { get; set; } = "";
        public string NombreCliente { get; set; } = "";
        public string Taller { get; set; } = "";
        public string Tipo { get; set; } = "";
        public decimal Cantidad { get; set; }
        public string Descripcion { get; set; } = "";
        public string? FechaImpresion { get; set; }
    }
}
