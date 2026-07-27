using System;
using System.Collections.Generic;

namespace QualityControlCenter.Modules.TalleresExternos
{
    public class TrabajoItem
    {
        public long Id { get; set; }
        public string Nv { get; set; } = "";
        public string Producto { get; set; } = "";
        public string? CodigoProducto { get; set; }
        public string Item { get; set; } = "";
        public string? Cliente { get; set; }
        public DateTime? FechaAsignacion { get; set; }
        public int? TallerExternoId { get; set; }
        public string? TallerExternoTexto { get; set; }
        public int? ProcesoId { get; set; }
        public string? ProcesoTexto { get; set; }
        public int? ResponsableInternoId { get; set; }
        public string? ResponsableInternoTexto { get; set; }
        public string Prioridad { get; set; } = "MEDIA";
        public DateTime? FechaCompromiso { get; set; }
        public string Estado { get; set; } = "PENDIENTE_ASIGNACION";
        public decimal CantidadARevisar { get; set; }
        public decimal CantidadRevisadaEntregada { get; set; }
        public decimal CantidadFaltante { get; set; }
        public bool CantidadFaltanteAjusteManual { get; set; }
        public string? CantidadFaltanteJustificacion { get; set; }
        public string? Observaciones { get; set; }
        public int Version { get; set; }
        public string? CreadoPorNombre { get; set; }
        public DateTime FechaCreacion { get; set; }
        public string? ActualizadoPorNombre { get; set; }
        public DateTime? FechaActualizacion { get; set; }
        public bool Atrasado { get; set; }
    }

    public class TrabajoListResponse
    {
        public List<TrabajoItem> Items { get; set; } = new();
        public long TotalCount { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
    }

    public class CatalogoItemDto
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = "";
        public bool Activo { get; set; }
    }

    public class CatalogosTalleresExternosDto
    {
        public List<CatalogoItemDto> Talleres { get; set; } = new();
        public List<CatalogoItemDto> Procesos { get; set; } = new();
    }

    public class CrearTrabajoRequest
    {
        public string Nv { get; set; } = "";
        public string Producto { get; set; } = "";
        public string? CodigoProducto { get; set; }
        public string Item { get; set; } = "";
        public string? Cliente { get; set; }
        public DateTime? FechaAsignacion { get; set; }
        public int? TallerExternoId { get; set; }
        public string? TallerExternoNombre { get; set; }
        public int? ProcesoId { get; set; }
        public string? ProcesoNombre { get; set; }
        public int? ResponsableInternoId { get; set; }
        public string? ResponsableInternoNombre { get; set; }
        public string Prioridad { get; set; } = "MEDIA";
        public DateTime? FechaCompromiso { get; set; }
        public string Estado { get; set; } = "PENDIENTE_ASIGNACION";
        public decimal CantidadARevisar { get; set; }
        public decimal CantidadRevisadaEntregada { get; set; }
        public bool CantidadFaltanteAjusteManual { get; set; }
        public decimal? CantidadFaltanteManual { get; set; }
        public string? CantidadFaltanteJustificacion { get; set; }
        public string? Observaciones { get; set; }
    }

    public class ActualizarTrabajoRequest : CrearTrabajoRequest
    {
        public int Version { get; set; }
    }

    public class TrabajoActualizarResultado
    {
        public bool Ok { get; set; }
        public bool NoEncontrado { get; set; }
        public bool Conflicto { get; set; }
        public string? Error { get; set; }
        public TrabajoItem? Trabajo { get; set; }
    }

    public class TrabajoEliminarResultado
    {
        public bool Ok { get; set; }
        public bool NoEncontrado { get; set; }
        public bool Conflicto { get; set; }
        public string? Error { get; set; }
    }
}
