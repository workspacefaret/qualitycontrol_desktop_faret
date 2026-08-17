using System.Collections.Generic;

namespace QualityControlCenter.Modules.ProductoTerminado
{
    // Bolsa de filtros interna (no se serializa al frontend), compartida por resumen/lista/export
    // para no repetir 9 parámetros sueltos en cada firma de método del repository.
    public class ProductoTerminadoFiltroParams
    {
        // Scope obligatorio (no es un filtro que el usuario pueda dejar en "Todos") — cada módulo
        // frontend (INNPACK/Faret) manda siempre el suyo. Validado en el Handler antes de llegar acá.
        public string Empresa { get; set; } = "";

        public string FechaDesde { get; set; } = "";
        public string FechaHasta { get; set; } = "";
        public string Np { get; set; } = "";
        public string CodigoProducto { get; set; } = "";
        public string Proceso { get; set; } = ""; // "Termoformado" | "Pegado" | ""
        public string Maquina { get; set; } = "";
        public string Turno { get; set; } = ""; // "A" | "B" | "C" | ""
        public int? InspectorId { get; set; }
        public string Resultado { get; set; } = ""; // "CONFORME" | "NO CONFORME" | ""
        public int? OrigenId { get; set; }
    }

    public class ProductoTerminadoCatalogoDto
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = "";
    }

    public class ProductoTerminadoFiltrosDto
    {
        public List<string> Maquinas { get; set; } = new();
        public List<ProductoTerminadoCatalogoDto> Inspectores { get; set; } = new();
        public List<ProductoTerminadoCatalogoDto> Defectos { get; set; } = new();
        public List<ProductoTerminadoCatalogoDto> Origenes { get; set; } = new();
    }

    public class ProductoTerminadoParetoItemDto
    {
        public string Defecto { get; set; } = "";
        public int Cantidad { get; set; }
    }

    public class ProductoTerminadoOrigenItemDto
    {
        public string Origen { get; set; } = "";
        public int Cantidad { get; set; }
    }

    public class ProductoTerminadoTendenciaItemDto
    {
        public string Fecha { get; set; } = "";
        public int Inspecciones { get; set; }
        public int NoConformes { get; set; }
    }

    public class ProductoTerminadoComparacionItemDto
    {
        public string Proceso { get; set; } = "";
        public int Inspecciones { get; set; }
        public int UnidadesNc { get; set; }
        public decimal PorcentajeNc { get; set; }
    }

    public class ProductoTerminadoResumenDto
    {
        public int TotalInspecciones { get; set; }
        public decimal PorcentajeConformes { get; set; }
        public decimal PorcentajeNoConformes { get; set; }
        public int UnidadesNoConformes { get; set; }
        public int DefectosRegistrados { get; set; }

        public List<ProductoTerminadoParetoItemDto> ParetoDefectos { get; set; } = new();
        public List<ProductoTerminadoOrigenItemDto> NcPorOrigen { get; set; } = new();
        public List<ProductoTerminadoTendenciaItemDto> Tendencia { get; set; } = new();
        public List<ProductoTerminadoComparacionItemDto> ComparacionProcesos { get; set; } = new();
    }

    public class ProductoTerminadoItemDto
    {
        public int Id { get; set; }
        public string FechaRegistro { get; set; } = "";
        public string HoraRegistro { get; set; } = "";
        public string Inspector { get; set; } = "";
        public string Np { get; set; } = "";
        public string Cliente { get; set; } = "";
        public string CodigoProducto { get; set; } = "";
        public string DescripcionProducto { get; set; } = "";
        public string Proceso { get; set; } = "";
        public int CantidadLote { get; set; }
        public string Maquina { get; set; } = "";
        public string Turno { get; set; } = "";
        public string Resultado { get; set; } = "";
    }

    public class ProductoTerminadoHallazgoDefectoDto
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = "";
    }

    public class ProductoTerminadoHallazgoDto
    {
        public int Id { get; set; }
        public int Correlativo { get; set; }
        public string Origen { get; set; } = "";
        public string Observacion { get; set; } = "";
        public string FotoRuta { get; set; } = "";
        public List<ProductoTerminadoHallazgoDefectoDto> Defectos { get; set; } = new();
    }

    public class ProductoTerminadoDetalleDto
    {
        public int Id { get; set; }
        public string FechaRegistro { get; set; } = "";
        public string HoraRegistro { get; set; } = "";
        public string Inspector { get; set; } = "";
        public string Np { get; set; } = "";
        public string Cliente { get; set; } = "";
        public string CodigoProducto { get; set; } = "";
        public string DescripcionProducto { get; set; } = "";
        public string Proceso { get; set; } = "";
        public int CantidadLote { get; set; }
        public int CantidadPallets { get; set; }
        public int CantidadCajasBins { get; set; }
        public string Maquina { get; set; } = "";
        public string Turno { get; set; } = "";

        // Plan de muestreo NCh44:2007 — solo lectura, calculado por Flutter/API, nunca recalculado acá.
        public string NivelInspeccion { get; set; } = "";
        public decimal Aql { get; set; }
        public string LetraCodigo { get; set; } = "";
        public int TamanoMuestra { get; set; }
        public int? Ac { get; set; }
        public int? Re { get; set; }
        public bool Inspeccion100 { get; set; }

        public int UnidadesNoConformes { get; set; }
        public int DefectosTotales { get; set; }
        public string Resultado { get; set; } = "";

        public List<string> Pallets { get; set; } = new();
        public List<ProductoTerminadoHallazgoDto> Hallazgos { get; set; } = new();
    }

    public class ProductoTerminadoExportRowDto
    {
        public int InspeccionId { get; set; }
        public string Fecha { get; set; } = "";
        public string Inspector { get; set; } = "";
        public string Np { get; set; } = "";
        public string Cliente { get; set; } = "";
        public string CodigoProducto { get; set; } = "";
        public string DescripcionProducto { get; set; } = "";
        public string Proceso { get; set; } = "";
        public int CantidadLote { get; set; }
        public string Maquina { get; set; } = "";
        public string NivelInspeccion { get; set; } = "";
        public decimal Aql { get; set; }
        public string LetraCodigo { get; set; } = "";
        public int TamanoMuestra { get; set; }
        public int? Ac { get; set; }
        public int? Re { get; set; }
        public int UnidadesNoConformes { get; set; }
        public int DefectosTotales { get; set; }
        public string Resultado { get; set; } = "";
        public int? HallazgoCorrelativo { get; set; }
        public string Defecto { get; set; } = "";
        public string Origen { get; set; } = "";
    }
}
