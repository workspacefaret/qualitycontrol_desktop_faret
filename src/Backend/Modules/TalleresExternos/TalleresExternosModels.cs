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
        public int TotalLiberacionesFps { get; set; }
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

    // ---- Sincronización con FPS (fps-api → Faret_Control_Calidad) ----

    // Una fila de la respuesta de fps-api GET /liberaciones. Solo los campos que usa el cruce;
    // fps-api devuelve más columnas (Operador/Inspector/Recurso/etc.) que no se necesitan acá.
    public class LiberacionFpsDto
    {
        public long Folio { get; set; }
        public string Np { get; set; } = "";
        public string Item { get; set; } = "";
        public string CodigoArticulo { get; set; } = "";
        public decimal CantidadRequerida { get; set; }
        public decimal CantidadLiberacion { get; set; }
        public DateTime FechaLiberacion { get; set; }
    }

    public class LiberacionHistorialItem
    {
        public long Id { get; set; }
        public string FolioFps { get; set; } = "";
        public decimal Cantidad { get; set; }
        public DateTime FechaLiberacion { get; set; }
        public DateTime FechaSincronizacion { get; set; }
    }

    // Resultado de aplicar las liberaciones de FPS de UN trabajo (repositorio).
    public class SincronizarTrabajoResultado
    {
        public int LiberacionesNuevas { get; set; }
        public string? Error { get; set; }
    }

    // Resultado agregado de sincronizar TODOS los trabajos activos (servicio/handler).
    public class SincronizarFpsResultado
    {
        public int TrabajosRevisados { get; set; }
        public int TrabajosActualizados { get; set; }
        public int LiberacionesNuevas { get; set; }
        public List<string> Errores { get; set; } = new();
    }
}
